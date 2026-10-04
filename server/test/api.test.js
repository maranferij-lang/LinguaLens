// Наскрізні тести сервера: справжній HTTP, файлове сховище в тимчасовій
// теці, AI у режимі mock. Запуск: node --test server/test/
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  FREE_SCANS: '2',
  FREE_SCENES: '1',
  REVENUECAT_WEBHOOK_AUTH: 'Bearer hook-secret',
  REVENUECAT_SECRET_KEY: '',
});
const { createServer } = require('../server');
const billing = require('../billing');

let base;
let server;
before(async () => {
  server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(() => {
  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

async function call(method, route, { token, body, headers = {} } = {}) {
  const res = await fetch(base + route, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  return { status: res.status, data, headers: res.headers };
}

async function newDevice(ip) {
  const r = await call('POST', '/auth/device', { body: {}, headers: ip ? { 'x-forwarded-for': ip } : {} });
  assert.equal(r.status, 200);
  assert.ok(r.data.token);
  return r.data;
}

const IMAGE = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };

test('health answers with security headers', async () => {
  const r = await call('GET', '/health');
  assert.equal(r.status, 200);
  assert.equal(r.data.ok, true);
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
});

test('scan requires a device token', async () => {
  const r = await call('POST', '/scan', { body: IMAGE });
  assert.equal(r.status, 401);
});

test('device scans until the free quota, then 402 before calling AI', async () => {
  const { token } = await newDevice();
  const day = billing.utcDay();
  const a = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(a.status, 200);
  assert.equal(a.data.word, 'mug');
  assert.deepEqual(a.data.usage, { day, scans: 1, limit: 2, scenes: 0, sceneLimit: 1, period: 'lifetime' });
  assert.ok(Array.isArray(a.data.outline) && a.data.outline.length >= 6);
  const b = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(b.status, 200);
  const c = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(c.status, 402);
  assert.equal(c.data.error, 'SCAN_LIMIT');
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': day } });
  assert.equal(me.data.usage.scans, 2);
  assert.equal(me.data.pro.active, false);
});

test('a forged far-away local date falls back to the server day', async () => {
  const { token } = await newDevice();
  const r = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': '1999-01-01' } });
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.day, billing.utcDay());
});

test('x-local-date does not touch the quota: today/tomorrow alternation still gets the lifetime two', async () => {
  const { token } = await newDevice();
  const today = billing.utcDay();
  const tomorrow = billing.addDays(today, 1);
  const statuses = [];
  for (const day of [today, tomorrow, today, tomorrow, today]) {
    const r = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
    statuses.push(r.status);
  }
  // ліміт довічний: два скани за все життя, яку б дату не слав клієнт.
  // Колись тут проходило все, з денним лімітом — три.
  assert.deepEqual(statuses, [200, 200, 402, 402, 402]);
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': tomorrow } });
  assert.equal(me.data.usage.scans, 2);
  assert.equal(me.data.usage.day, tomorrow);
});

test('non-canonical date aliases of today fall back to the server day', async () => {
  const { token } = await newDevice();
  const today = billing.utcDay();
  // «2026-09-45» — це 15 жовтня для Date.UTC: останній день минулого місяця + d
  const d = Number(today.slice(8));
  const prevEnd = billing.addDays(today, -d);
  const alias = prevEnd.slice(0, 8) + String(Number(prevEnd.slice(8)) + d).padStart(2, '0');
  assert.equal(billing.dayIndexOf(alias), billing.dayIndexOf(today));
  const r = await call('POST', '/scan', {
    token,
    body: IMAGE,
    headers: { 'x-local-date': alias, 'x-forwarded-for': '198.51.100.1' },
  });
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.day, today);
});

test('parallel scans cannot overrun the quota', async () => {
  const { token } = await newDevice();
  const day = billing.utcDay();
  // справжній AI відповідає секунди — саме тоді запити й перетинаються
  const ai = require('../ai');
  const recognize = ai.recognize;
  ai.recognize = async (...a) => {
    await new Promise((r) => setTimeout(r, 60));
    return recognize(...a);
  };
  let all;
  try {
    all = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        call('POST', '/scan', {
          token,
          body: IMAGE,
          headers: { 'x-local-date': day, 'x-forwarded-for': '198.51.100.' + (10 + i) },
        })
      )
    );
  } finally {
    ai.recognize = recognize;
  }
  const statuses = all.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 200, 402, 402, 402, 402]);
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': day, 'x-forwarded-for': '198.51.100.30' } });
  assert.equal(me.data.usage.scans, 2);
});

test('a failed scan gives its slot back', async () => {
  const { token } = await newDevice();
  const day = billing.utcDay();
  const headers = { 'x-local-date': day, 'x-forwarded-for': '198.51.100.40' };
  const bad = await call('POST', '/scan', { token, body: { lang: 'en' }, headers });
  assert.equal(bad.status, 400);
  const me = await call('GET', '/me', { token, headers });
  assert.equal(me.data.usage.scans, 0);
});

test('writes after DELETE /me do not resurrect the device', async () => {
  const { token, user } = await newDevice();
  const store = require('../store');
  const stale = await store.get('users', user.id);
  assert.ok(stale);
  assert.equal((await call('DELETE', '/me', { token })).status, 200);
  const slot = await billing.reserveScan(stale);
  assert.equal(slot.gone, true);
  assert.equal(await store.get('users', user.id), null);
});

test('GET /me is rate limited per IP', async () => {
  const { token } = await newDevice();
  let last;
  for (let i = 0; i < 25; i++) {
    last = await call('GET', '/me', { token, headers: { 'x-forwarded-for': '198.51.100.50' } });
  }
  assert.equal(last.status, 429);
});

test('RevenueCat webhook grants Pro and lifts the limit', async () => {
  const { token, user } = await newDevice();
  const day = billing.utcDay();
  for (let i = 0; i < 2; i++) await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  const denied = await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'INITIAL_PURCHASE', app_user_id: user.id } },
    headers: { authorization: 'Bearer wrong' },
  });
  assert.equal(denied.status, 401);
  const until = Date.now() + 7 * 86400000;
  const ok = await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'INITIAL_PURCHASE', app_user_id: user.id, expiration_at_ms: until, entitlement_ids: ['lingualens_pro'] } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  assert.equal(ok.status, 200);
  const r = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.limit, null);
  assert.equal(r.data.usage.sceneLimit, null);
  const me = await call('GET', '/me', { token });
  assert.equal(me.data.pro.active, true);
  assert.equal(me.data.pro.until, until);

  await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'EXPIRATION', app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ['lingualens_pro'] } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  const after = await call('GET', '/me', { token });
  assert.equal(after.data.pro.active, false);
  assert.equal(after.data.usage.limit, 2);
  // Pro скінчився — скани, зроблені в Pro, теж рахуються: знову SCAN_LIMIT
  const lapsed = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(lapsed.status, 402);
  assert.deepEqual(lapsed.data, { error: 'SCAN_LIMIT', limit: 2, used: 3 });
});

test('webhook revokes Pro from the previous owner on TRANSFER and on a refund', async () => {
  const a = await newDevice('198.51.100.7');
  const b = await newDevice('198.51.100.8');
  const hook = (event) =>
    call('POST', '/webhooks/revenuecat', { body: { event }, headers: { authorization: 'Bearer hook-secret' } });
  const until = Date.now() + 30 * 86400000;
  await hook({ type: 'INITIAL_PURCHASE', app_user_id: a.user.id, expiration_at_ms: until, entitlement_ids: ['lingualens_pro'] });
  assert.equal((await call('GET', '/me', { token: a.token })).data.pro.active, true);
  await hook({ type: 'TRANSFER', transferred_from: [a.user.id], transferred_to: [b.user.id] });
  assert.equal((await call('GET', '/me', { token: a.token })).data.pro.active, false);

  await hook({ type: 'RENEWAL', app_user_id: b.user.id, expiration_at_ms: until, entitlement_ids: ['lingualens_pro'] });
  assert.equal((await call('GET', '/me', { token: b.token })).data.pro.active, true);
  await hook({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', app_user_id: b.user.id, entitlement_ids: ['lingualens_pro'] });
  assert.equal((await call('GET', '/me', { token: b.token })).data.pro.active, false);
});

test('a scan in flight does not bring back Pro revoked by a webhook', async () => {
  const a = await newDevice('198.51.100.60');
  const b = await newDevice('198.51.100.61');
  const hook = (event) =>
    call('POST', '/webhooks/revenuecat', { body: { event }, headers: { authorization: 'Bearer hook-secret' } });
  const headers = { 'x-forwarded-for': '198.51.100.62' };
  await hook({ type: 'INITIAL_PURCHASE', app_user_id: a.user.id, expiration_at_ms: Date.now() + 86400000, entitlement_ids: ['lingualens_pro'] });
  assert.equal((await call('GET', '/me', { token: a.token, headers })).data.pro.active, true);

  const ai = require('../ai');
  const recognize = ai.recognize;
  let release;
  const gate = new Promise((r) => (release = r));
  ai.recognize = async (...x) => {
    await gate;
    return recognize(...x);
  };
  try {
    const scan = call('POST', '/scan', { token: a.token, body: IMAGE, headers });
    await new Promise((r) => setTimeout(r, 50)); // скан уже чекає на AI
    await hook({ type: 'TRANSFER', transferred_from: [a.user.id], transferred_to: [b.user.id] });
    release();
    assert.equal((await scan).status, 200);
  } finally {
    ai.recognize = recognize;
  }
  assert.equal((await call('GET', '/me', { token: a.token, headers })).data.pro.active, false);
});

test('word of day is built from the client local date and is stable per device', async () => {
  const { token } = await newDevice();
  const today = billing.utcDay();
  const a = await call('GET', `/word-of-day?days=3&lang=en&native=uk&today=${today}`, { token });
  assert.equal(a.status, 200);
  assert.equal(a.data.words.length, 3);
  assert.equal(a.data.words[0].date, today);
  assert.equal(a.data.words[1].date, billing.addDays(today, 1));
  const b = await call('GET', `/word-of-day?days=3&lang=en&native=uk&today=${today}`, { token });
  assert.deepEqual(a.data.words.map((w) => w.source), b.data.words.map((w) => w.source));
});

test('DELETE /me removes the device and invalidates its token', async () => {
  const { token } = await newDevice();
  assert.equal((await call('DELETE', '/me', { token })).status, 200);
  assert.equal((await call('GET', '/me', { token })).status, 401);
});

test('device creation is rate limited per real client IP even with a spoofed first hop', async () => {
  let last;
  for (let i = 0; i < 22; i++) {
    last = await call('POST', '/auth/device', { body: {}, headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.9` } });
  }
  assert.equal(last.status, 429);
});

test('bad JSON and oversize bodies do not crash the server', async () => {
  const { token } = await newDevice('198.51.100.1');
  const bad = await call('POST', '/scan', { token, body: '{oops' });
  assert.equal(bad.status, 400);
  const big = await call('POST', '/scan', { token, body: JSON.stringify({ image: 'x'.repeat(5 * 1024 * 1024) }) }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);
  assert.equal((await call('GET', '/health')).status, 200);
});

test('privacy policy and support pages are served as public pages', async () => {
  for (const [route, title] of [['/privacy', /Privacy Policy/], ['/support', /Support/]]) {
    const res = await fetch(base + route);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    assert.match(await res.text(), title);
  }
});

test('removed email endpoints answer 404', async () => {
  assert.equal((await call('POST', '/auth/login', { body: {} })).status, 404);
  assert.equal((await call('POST', '/auth/register', { body: {} })).status, 404);
});
