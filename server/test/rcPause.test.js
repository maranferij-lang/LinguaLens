// RevenueCat лежить чи повільний: після збою сервер на 45 с перестає питати
// його на шляху /me і скану (кожна спроба коштувала б людині до 4 с і добивала
// б API), а працює з кешем. Вебхук і ?refresh=1 паузу ігнорують. RevenueCat —
// підроблений fetch, як у grace.test.js.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-rcpause-'));
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
const realTimeout = AbortSignal.timeout;
// mode: ok | 500 | 429 | hang
const rc = { calls: 0, mode: 'ok', ent: new Map(), timeouts: [] };
global.fetch = async (url, opts) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/(.+)$/);
  if (!m) return realFetch(url, opts);
  rc.calls++;
  if (rc.mode === 'hang') {
    return new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));
  }
  if (rc.mode !== 'ok') return new Response('{}', { status: Number(rc.mode) });
  const id = decodeURIComponent(m[1]);
  const entitlements = rc.ent.has(id) ? { lingualens_pro: rc.ent.get(id) } : {};
  return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
};
after(() => {
  global.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
});

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
  const id = 'u-pause-' + Math.random().toString(36).slice(2);
  await store.put('users', id, { id, createdAt: Date.now(), ...extra });
  return id;
}
const fresh = async (id) => store.get('users', id);

// Кожен тест починає з відкритого RevenueCat і без паузи.
function calm() {
  rc.mode = 'ok';
  rc.ent.clear();
  billing.resetRevenueCatPause();
}

test('one failure pauses RevenueCat: /me stays quick and does not ask again until the pause ends', async () => {
  calm();
  const { token } = await newDevice();
  rc.mode = '500';
  const before = rc.calls;
  for (let i = 0; i < 4; i++) {
    const me = await call('GET', '/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.pro.active, false);
  }
  assert.equal(rc.calls, before + 1, 'а не 4');

  // 429 теж ставить на паузу
  calm();
  rc.mode = '429';
  const b2 = rc.calls;
  for (let i = 0; i < 3; i++) assert.equal((await call('GET', '/me', { token })).status, 200);
  assert.equal(rc.calls, b2 + 1);

  // через 46 с питаємо знову
  await withClock(46 * 1000, async () => {
    await call('GET', '/me', { token });
  });
  assert.equal(rc.calls, b2 + 2);
});

test('the paused answer falls back to what the server knows: cached Pro stays, grace stays, a free user stays free', async () => {
  calm();
  rc.mode = '500';
  // відкрили паузу
  await billing.proStatus(await fresh(await newUser()));
  const calls = rc.calls;

  const pro = await newUser({ proUntil: Date.now() + 30 * DAY, proCheckedAt: Date.now() - 25 * 3600 * 1000 });
  assert.deepEqual(await billing.proStatus(await fresh(pro)), { active: true, until: (await fresh(pro)).proUntil });

  const grace = await newUser({ proUntil: Date.now() - DAY, proCheckedAt: 0 });
  assert.equal((await billing.proStatus(await fresh(grace))).active, true, 'вчора скінчився: три дні запасу');
  const lapsed = await newUser({ proUntil: Date.now() - 5 * DAY, proCheckedAt: 0 });
  assert.equal((await billing.proStatus(await fresh(lapsed))).active, false);
  const free = await newUser();
  assert.deepEqual(await billing.proStatus(await fresh(free)), { active: false, until: null });
  assert.equal(rc.calls, calls, 'жодного запиту під час паузи');
});

test('the pause does not block ?refresh=1 after a purchase, nor the webhook', async () => {
  calm();
  const { token, user } = await newDevice();
  rc.mode = '500';
  await call('GET', '/me', { token }); // пауза відкрита
  const paused = rc.calls;
  await call('GET', '/me', { token });
  assert.equal(rc.calls, paused);

  // людина заплатила, RevenueCat ожив
  rc.mode = 'ok';
  rc.ent.set(user.id, { expires_date: iso(Date.now() + 30 * DAY) });
  const me = await call('GET', '/me?refresh=1', { token });
  assert.equal(me.data.pro.active, true, 'refresh питає попри паузу');
  assert.equal(rc.calls, paused + 1);

  // вебхук: пауза знову відкрита збоєм, а він однаково читає RevenueCat
  const other = await newDevice();
  rc.mode = '500';
  await call('GET', '/me', { token: other.token });
  rc.mode = 'ok';
  rc.ent.set(other.user.id, { expires_date: iso(Date.now() + 30 * DAY) });
  const hook = await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'INITIAL_PURCHASE', app_user_id: other.user.id, entitlement_ids: ['lingualens_pro'] } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  assert.equal(hook.status, 200);
  assert.equal((await fresh(other.user.id)).proUntil > Date.now(), true);
});

test('a success ends the pause, so the next failure is asked about again', async () => {
  calm();
  const id = await newUser();
  rc.mode = '500';
  await billing.proStatus(await fresh(id));
  rc.mode = 'ok';
  await withClock(46 * 1000, async () => {
    await billing.proStatus(await fresh(id)); // пауза скінчилась, відповідь успішна
  });
  rc.mode = '500';
  const before = rc.calls;
  await withClock(11 * 60 * 1000, async () => {
    await billing.proStatus(await fresh(id)); // кеш «не Pro» протермінувався
  });
  assert.equal(rc.calls, before + 1, 'збій після успіху — знову справжній запит');
});

test('the check on /me and a scan waits for RevenueCat 4 s, a refresh and a webhook 8 s', async () => {
  calm();
  const asked = [];
  AbortSignal.timeout = (n) => {
    asked.push(n);
    return realTimeout.call(AbortSignal, 40);
  };
  try {
    rc.mode = 'hang';
    const { token, user } = await newDevice();
    const t0 = Date.now();
    const me = await call('GET', '/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.pro.active, false);
    assert.ok(Date.now() - t0 < 2000);
    assert.deepEqual(asked, [4000]);

    // refresh — 8 с
    asked.length = 0;
    await call('GET', '/me?refresh=1', { token });
    assert.deepEqual(asked, [8000]);

    // вебхук — 8 с
    asked.length = 0;
    await call('POST', '/webhooks/revenuecat', {
      body: { event: { type: 'RENEWAL', app_user_id: user.id, entitlement_ids: ['lingualens_pro'], expiration_at_ms: Date.now() + DAY } },
      headers: { authorization: 'Bearer hook-secret' },
    });
    assert.deepEqual(asked, [8000]);
  } finally {
    AbortSignal.timeout = realTimeout;
    calm();
  }
});
