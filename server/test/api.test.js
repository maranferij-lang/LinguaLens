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
  FREE_SCANS_PER_DAY: '2',
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
  assert.deepEqual(a.data.usage, { day, scans: 1, limit: 2 });
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
    body: { event: { type: 'INITIAL_PURCHASE', app_user_id: user.id, expiration_at_ms: until, entitlement_ids: ['pro'] } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  assert.equal(ok.status, 200);
  const r = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.limit, null);
  const me = await call('GET', '/me', { token });
  assert.equal(me.data.pro.active, true);
  assert.equal(me.data.pro.until, until);

  await call('POST', '/webhooks/revenuecat', {
    body: { event: { type: 'EXPIRATION', app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ['pro'] } },
    headers: { authorization: 'Bearer hook-secret' },
  });
  const after = await call('GET', '/me', { token });
  assert.equal(after.data.pro.active, false);
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

test('removed email endpoints answer 404', async () => {
  assert.equal((await call('POST', '/auth/login', { body: {} })).status, 404);
  assert.equal((await call('POST', '/auth/register', { body: {} })).status, 404);
});
