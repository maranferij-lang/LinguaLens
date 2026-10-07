// Платіжний пільговий період (Billing Grace Period) і добова звірка Pro з
// RevenueCat. RevenueCat — підроблений fetch зі своїми відповідями; окремий
// процес, бо секретний ключ читається при завантаженні модуля.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-grace-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  FREE_SCANS: '1',
  FREE_SCENES: '1',
  REVENUECAT_SECRET_KEY: 'sk_test_fake',
  REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret',
});
delete process.env.REVENUECAT_ENTITLEMENT;

const realFetch = global.fetch;
// entitlement за id; down — RevenueCat відповідає 500
const rc = { calls: 0, ent: new Map(), down: false };
global.fetch = async (url, opts) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/(.+)$/);
  if (!m) return realFetch(url, opts);
  rc.calls++;
  if (rc.down) return new Response('{}', { status: 500 });
  const id = decodeURIComponent(m[1]);
  const entitlements = rc.ent.has(id) ? { lingualens_pro: rc.ent.get(id) } : {};
  return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
};

const { startServer, withClock } = require('./helpers/http');
const billing = require('../billing');
const store = require('../store');

const DAY = 86400000;
const iso = (ms) => new Date(ms).toISOString();

let srv;
let call;
let newDevice;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
});
after(async () => {
  await srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function newUser(extra = {}) {
  const id = 'u-grace-' + Math.random().toString(36).slice(2);
  await store.put('users', id, { id, createdAt: Date.now(), ...extra });
  return id;
}

// ---------- відповідь RevenueCat REST ----------
test('entitlementUntil: the later of expires_date and grace_period_expires_date; null expiry is lifetime', () => {
  const now = Date.now();
  const past = iso(now - 2 * DAY);
  const future = iso(now + 10 * DAY);
  assert.equal(billing.entitlementUntil(null), null);
  assert.equal(billing.entitlementUntil(undefined), null);
  assert.equal(billing.entitlementUntil({ expires_date: null }), 4102444800000);
  assert.equal(billing.entitlementUntil({ expires_date: past }), Date.parse(past));
  // пільговий період: оплата не пройшла, expires_date минув, Pro триває до кінця пільгового
  assert.equal(billing.entitlementUntil({ expires_date: past, grace_period_expires_date: future }), Date.parse(future));
  // пільговий період, що закінчився раніше за expires_date, нічого не вкорочує
  assert.equal(billing.entitlementUntil({ expires_date: future, grace_period_expires_date: past }), Date.parse(future));
  // немає пільгового поля, null чи сміття: лише expires_date
  for (const grace of [undefined, null, '', 'не дата']) {
    assert.equal(billing.entitlementUntil({ expires_date: future, grace_period_expires_date: grace }), Date.parse(future));
  }
  // зіпсований expires_date: пільговий період усе ж дає дату; обидва зіпсовані: нічого
  assert.equal(billing.entitlementUntil({ expires_date: 'сміття', grace_period_expires_date: future }), Date.parse(future));
  assert.equal(billing.entitlementUntil({ expires_date: 'сміття' }), null);
  assert.equal(billing.entitlementUntil({ expires_date: 'сміття', grace_period_expires_date: 'теж' }), null);
});

test('proStatus: a subscriber in billing grace stays Pro until the grace ends; without grace the past date means not Pro', async () => {
  const now = Date.now();
  const grace = await newUser();
  rc.ent.set(grace, { expires_date: iso(now - 2 * DAY), grace_period_expires_date: iso(now + 14 * DAY) });
  const g = await billing.proStatus(await store.get('users', grace));
  assert.deepEqual(g, { active: true, until: now + 14 * DAY });
  assert.equal(Math.abs((await store.get('users', grace)).proUntil - (now + 14 * DAY)) < 1000, true);

  const lapsed = await newUser();
  rc.ent.set(lapsed, { expires_date: iso(now - 2 * DAY), grace_period_expires_date: null });
  assert.equal((await billing.proStatus(await store.get('users', lapsed))).active, false);
});

test('a scan of a subscriber in billing grace is not 402 (free scan already spent)', async () => {
  const { token, user } = await newDevice();
  const day = billing.utcDay();
  const scan = () => call('POST', '/scan', { token, body: { image: 'aGk=', lang: 'en', nativeLang: 'uk' }, headers: { 'x-local-date': day } });
  assert.equal((await scan()).status, 200); // єдиний безкоштовний
  assert.equal((await scan()).status, 402);

  const now = Date.now();
  rc.ent.set(user.id, { expires_date: iso(now - DAY), grace_period_expires_date: iso(now + 15 * DAY) });
  // після покупки/збою оплати застосунок просить ?refresh=1
  const me = await call('GET', '/me?refresh=1', { token });
  assert.equal(me.data.pro.active, true);
  const r = await scan();
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.limit, null);

  // пільговий період скінчився, а оплата так і не пройшла
  rc.ent.set(user.id, { expires_date: iso(now - 20 * DAY), grace_period_expires_date: iso(now - DAY) });
  await store.update('users', user.id, { proUntil: now - DAY, proCheckedAt: 0 });
  assert.equal((await scan()).status, 402);
});

// ---------- події вебхука ----------
test('untilFromEvent: BILLING_ISSUE with a grace date keeps Pro until that date, never shortens it', () => {
  const now = Date.now();
  const issue = (extra) => ({ type: 'BILLING_ISSUE', expiration_at_ms: now - DAY, ...extra });
  // пільговий період: Pro до його кінця
  assert.equal(billing.untilFromEvent(issue({ grace_period_expiration_at_ms: now + 16 * DAY }), 'u', now - DAY), now + 16 * DAY);
  // кеш уже далі за пільговий період (напр., прийшов раніше) — не вкорочуємо
  assert.equal(billing.untilFromEvent(issue({ grace_period_expiration_at_ms: now + DAY }), 'u', now + 30 * DAY), now + 30 * DAY);
  // кешу ще немає
  assert.equal(billing.untilFromEvent(issue({ grace_period_expiration_at_ms: now + DAY }), 'u', null), now + DAY);
  // без пільгового періоду (він вимкнений) нічого не змінюємо
  for (const bad of [undefined, null, 'x']) {
    assert.equal(billing.untilFromEvent(issue({ grace_period_expiration_at_ms: bad }), 'u', now - DAY), undefined);
  }
  // продовження після виходу з пільгового періоду: нова дата закінчення
  assert.equal(billing.untilFromEvent({ type: 'RENEWAL', expiration_at_ms: now + 30 * DAY }, 'u', now + DAY), now + 30 * DAY);
  // продовження, у якому раптом є й пільгова дата: пізніша з двох
  assert.equal(
    billing.untilFromEvent({ type: 'RENEWAL', expiration_at_ms: now + DAY, grace_period_expiration_at_ms: now + 5 * DAY }, 'u', null),
    now + 5 * DAY
  );
  // EXPIRATION приходить ПІСЛЯ пільгового періоду і його не подовжує
  assert.equal(billing.untilFromEvent({ type: 'EXPIRATION', expiration_at_ms: now - 1000, grace_period_expiration_at_ms: now + DAY }, 'u', now + DAY), now - 1000);
});

test('webhook: when RevenueCat REST is unreachable, BILLING_ISSUE with grace keeps Pro, and EXPIRATION then ends it', async () => {
  const now = Date.now();
  const { token, user } = await newDevice();
  const hook = (event) => call('POST', '/webhooks/revenuecat', { body: { event }, headers: { authorization: 'Bearer hook-secret' } });
  const ent = { entitlement_ids: ['lingualens_pro'], app_user_id: user.id };
  rc.down = true;
  try {
    // Pro скінчився вчора, але Apple дав 16 днів пільгового періоду
    await store.update('users', user.id, { proUntil: now - DAY, proCheckedAt: now });
    const r = await hook({ type: 'BILLING_ISSUE', expiration_at_ms: now - DAY, grace_period_expiration_at_ms: now + 15 * DAY, ...ent });
    assert.equal(r.status, 200);
    assert.equal((await store.get('users', user.id)).proUntil, now + 15 * DAY);
    // RevenueCat недоступний і далі: кеш Pro дійсний, 402 немає
    const me = await call('GET', '/me', { token });
    assert.equal(me.data.pro.active, true);
    assert.equal(me.data.pro.until, now + 15 * DAY);

    // пільговий період вичерпано: EXPIRATION
    await hook({ type: 'EXPIRATION', expiration_at_ms: now + 15 * DAY - 1000, ...ent });
    assert.equal((await store.get('users', user.id)).proUntil, now + 15 * DAY - 1000);
  } finally {
    rc.down = false;
  }
  // дата закінчення настала, RevenueCat знову відповідає й entitlement не бачить
  await store.update('users', user.id, { proUntil: now - 1000, proCheckedAt: 0 });
  assert.equal((await call('GET', '/me', { token })).data.pro.active, false);
});

test('webhook with the secret key re-reads RevenueCat, so the grace date comes from the REST entitlement', async () => {
  const now = Date.now();
  const { token, user } = await newDevice();
  rc.ent.set(user.id, { expires_date: iso(now - DAY), grace_period_expires_date: iso(now + 10 * DAY) });
  const r = await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'BILLING_ISSUE', app_user_id: user.id, entitlement_ids: ['lingualens_pro'], expiration_at_ms: now - DAY } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  assert.equal(r.status, 200);
  const me = await call('GET', '/me', { token });
  assert.equal(me.data.pro.active, true);
  assert.equal(Math.abs(me.data.pro.until - (now + 10 * DAY)) < 1000, true);
});

// ---------- добова звірка дійсного Pro ----------
test('a cached Pro is re-checked with RevenueCat once a day: a refund whose webhook never arrived ends Pro, even lifetime', async () => {
  const now = Date.now();
  const id = await newUser({ proUntil: 4102444800000, proCheckedAt: now - 2 * 3600 * 1000 });
  rc.ent.set(id, { expires_date: null }); // довічна покупка
  const before = rc.calls;
  // свіжа звірка: кеш, без запиту
  assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
  assert.equal(rc.calls, before);

  // доба минула, RevenueCat досі підтверджує: запит один, proCheckedAt оновлено
  await withClock(25 * 3600 * 1000, async () => {
    assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
    assert.equal(rc.calls, before + 1);
    assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
    assert.equal(rc.calls, before + 1);
  });

  // повернення коштів: RevenueCat entitlement уже не бачить, а вебхук не дійшов
  rc.ent.delete(id);
  await store.update('users', id, { proCheckedAt: now - 25 * 3600 * 1000 });
  const s = await billing.proStatus(await store.get('users', id));
  assert.deepEqual(s, { active: false, until: null });
  assert.equal((await store.get('users', id)).proUntil, null);
});

test('a Pro that was never verified against RevenueCat (proCheckedAt missing or 0) is verified on first use', async () => {
  for (const extra of [{}, { proCheckedAt: 0 }]) {
    const id = await newUser({ proUntil: Date.now() + 30 * DAY, ...extra });
    const before = rc.calls;
    assert.equal((await billing.proStatus(await store.get('users', id))).active, false); // RevenueCat про нього нічого не знає
    assert.equal(rc.calls, before + 1);
  }
});

test('RevenueCat down during the daily re-check: Pro stays, and the retry waits 10 minutes instead of every scan', async () => {
  const now = Date.now();
  const id = await newUser({ proUntil: now + 30 * DAY, proCheckedAt: now - 25 * 3600 * 1000 });
  rc.ent.set(id, { expires_date: iso(now + 30 * DAY) });
  rc.down = true;
  try {
    const before = rc.calls;
    for (let i = 0; i < 4; i++) {
      assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
    }
    assert.equal(rc.calls, before + 1); // а не 4
    // через 11 хвилин пробуємо ще раз
    await withClock(11 * 60 * 1000, async () => {
      assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
    });
    assert.equal(rc.calls, before + 2);
  } finally {
    rc.down = false;
  }
  // RevenueCat ожив: звірка проходить, Pro підтверджено
  await withClock(30 * 60 * 1000, async () => {
    assert.equal((await billing.proStatus(await store.get('users', id))).active, true);
  });
});

test('?refresh=1 on a valid cached Pro still asks RevenueCat at most once per 30 s', async () => {
  const now = Date.now();
  const id = await newUser({ proUntil: now + 30 * DAY, proCheckedAt: now });
  rc.ent.set(id, { expires_date: iso(now + 30 * DAY) });
  const before = rc.calls;
  for (let i = 0; i < 5; i++) {
    assert.equal((await billing.proStatus(await store.get('users', id), { refresh: true })).active, true);
  }
  assert.equal(rc.calls, before + 1);
});
