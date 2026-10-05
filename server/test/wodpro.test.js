// POST /word-of-day з perDay одразу після покупки Pro (WDG-1): застосунок
// шле GET /me?refresh=1 і слово дня з perDay: 5 майже разом, а звичайна
// перевірка Pro на старті щойно поклала в запис «не Pro» на 10 хвилин.
// Сервер мусить сам перепитати RevenueCat, а не віддати одне слово на день.
// RevenueCat — підроблений fetch із затримкою, що рахує виклики.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-wodpro-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: 'sk_test_fake',
});
delete process.env.REVENUECAT_ENTITLEMENT;

const realFetch = global.fetch;
const rc = { calls: 0, latency: 0, entitled: new Set() };
global.fetch = async (url, opts) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/(.+)$/);
  if (!m) return realFetch(url, opts);
  rc.calls++;
  if (rc.latency) await new Promise((r) => setTimeout(r, rc.latency));
  const id = decodeURIComponent(m[1]);
  const entitlements = rc.entitled.has(id)
    ? { lingualens_pro: { expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } }
    : {};
  return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
};

const { startServer } = require('./helpers/http');
const billing = require('../billing');

let srv;
let call;
let newDevice;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
});
after(async () => {
  await srv.close();
  global.fetch = realFetch;
  fs.rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function wod(token, body) {
  return call('POST', '/word-of-day', { token, body: { days: 14, lang: 'en', native: 'uk', today: billing.utcDay(), ...body } });
}

test('Pro bought a moment ago: 5 words a day at once, even right after a routine check', async () => {
  const { token, user } = await newDevice();
  // старт застосунку: звичайна перевірка, Pro ще немає — «ні» в кеші на 10 хв
  const start = await call('GET', '/me', { token });
  assert.equal(start.data.pro.active, false);
  // покупка: RevenueCat уже знає, вебхук ще не дійшов
  rc.entitled.add(user.id);
  rc.latency = 300;
  try {
    const [me, w] = await Promise.all([
      call('GET', '/me?refresh=1', { token }),
      sleep(5).then(() => wod(token, { perDay: 5 })),
    ]);
    assert.equal(me.data.pro.active, true);
    assert.equal(w.status, 200);
    assert.equal(w.data.perDay, 5);
    assert.equal(w.data.words.length, 40);
  } finally {
    rc.latency = 0;
  }
});

test('a free record asking for more words: RevenueCat at most once per 30 s, one word a day', async () => {
  const { token } = await newDevice();
  await call('GET', '/me', { token });
  const before = rc.calls;
  for (let i = 0; i < 3; i++) {
    const w = await wod(token, { perDay: 3 });
    assert.equal(w.status, 200);
    assert.equal(w.data.perDay, 1);
  }
  assert.ok(rc.calls - before <= 1, `RevenueCat calls: ${rc.calls - before}`);
});
