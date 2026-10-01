// Pro-статус через RevenueCat REST з підробленим fetch: окремий процес,
// бо ключ RevenueCat читається при завантаженні модуля.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-billing-'));
Object.assign(process.env, {
  DATA_FILE: path.join(dir, 'data.json'),
  REVENUECAT_SECRET_KEY: 'sk_test_fake',
  FREE_SCANS_PER_DAY: '2',
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const realFetch = global.fetch;
const rc = { calls: 0, entitled: new Set() };
global.fetch = async (url, opts) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/(.+)$/);
  if (!m) return realFetch(url, opts);
  rc.calls++;
  const id = decodeURIComponent(m[1]);
  const entitlements = rc.entitled.has(id)
    ? { pro: { expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } }
    : {};
  return new Response(JSON.stringify({ subscriber: { entitlements } }), { status: 200 });
};

const store = require('../store');
const billing = require('../billing');

async function newUser(id) {
  await store.put('users', id, { id, createdAt: Date.now() });
  return store.get('users', id);
}

test('a purchase right after a routine check is still seen by ?refresh=1', async () => {
  const id = 'u-buy-' + Date.now();
  await newUser(id);
  // запуск застосунку: звичайна перевірка, Pro ще немає
  assert.equal((await billing.proStatus(await store.get('users', id))).active, false);
  const before = rc.calls;
  // за кілька секунд людина купує; вебхук ще не дійшов
  rc.entitled.add(id);
  const after = await billing.proStatus(await store.get('users', id), { refresh: true });
  assert.equal(rc.calls, before + 1);
  assert.equal(after.active, true);
  // і скан понад ліміт тепер проходить
  const day = billing.utcDay();
  await store.update('users', id, { usage: { day, scans: 2 } });
  const slot = await billing.reserveScan(await store.get('users', id), day);
  assert.equal(slot.ok, true);
});

test('?refresh=1 in a loop asks RevenueCat at most once per 30 s', async () => {
  const id = 'u-loop-' + Date.now();
  await newUser(id);
  const before = rc.calls;
  for (let i = 0; i < 5; i++) await billing.proStatus(await store.get('users', id), { refresh: true });
  assert.equal(rc.calls, before + 1);
});
