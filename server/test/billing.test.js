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
  FREE_SCENES: '1',
});
delete process.env.REVENUECAT_ENTITLEMENT;
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const realFetch = global.fetch;
const rc = { calls: 0, entitled: new Set() };
global.fetch = async (url, opts) => {
  const m = String(url).match(/^https:\/\/api\.revenuecat\.com\/v1\/subscribers\/(.+)$/);
  if (!m) return realFetch(url, opts);
  rc.calls++;
  const id = decodeURIComponent(m[1]);
  const entitlements = rc.entitled.has(id)
    ? { lingualens_pro: { expires_date: new Date(Date.now() + 30 * 86400000).toISOString() } }
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

// ---------- сцена: денний слот і довічна проба одним записом ----------
const SCENE = { scene: true };

test('parallel scene reservations from one stale snapshot: one wins, both counters move together', async () => {
  const id = 'u-scene-race-' + Date.now();
  const stale = await newUser(id);
  const day = billing.utcDay();
  const results = await Promise.all(Array.from({ length: 6 }, () => billing.reserveScan(stale, day, SCENE)));
  assert.equal(results.filter((r) => r.ok).length, 1);
  for (const r of results.filter((x) => !x.ok)) assert.deepEqual(r, { ok: false, scene: true, used: 1, limit: 1 });
  const doc = await store.get('users', id);
  assert.deepEqual(doc.usage, { day, scans: 1 });
  assert.equal(doc.scenes, 1);
});

// Firestore відповідає за мілісекунди, а не миттєво, як файл: між записом і
// відповіддю інші запити встигають прочитати документ. Затримки 0–5 мс до і
// після кожної операції — псевдовипадкові, але відтворювані (seed), щоб
// кожен раунд переплітав запити по-своєму.
async function withSlowStore(seed, fn) {
  const real = { get: store.get, update: store.update };
  let x = seed;
  const pause = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return new Promise((r) => setTimeout(r, x % 6));
  };
  store.get = async (...a) => {
    await pause();
    return real.get(...a);
  };
  store.update = async (...a) => {
    await pause();
    const r = await real.update(...a);
    await pause();
    return r;
  };
  try {
    return await fn();
  } finally {
    Object.assign(store, real);
  }
}

test('with a slow store parallel scenes still take exactly one free scene', async () => {
  const day = billing.utcDay();
  for (let round = 0; round < 8; round++) {
    const id = `u-scene-slow-${round}-` + Date.now();
    const stale = await newUser(id);
    const results = await withSlowStore(round + 1, () =>
      Promise.all(Array.from({ length: 8 }, () => billing.reserveScan(stale, day, SCENE)))
    );
    assert.equal(results.filter((r) => r.ok).length, 1, 'round ' + round);
    assert.ok(results.every((r) => r.ok || r.scene), 'round ' + round);
    const doc = await store.get('users', id);
    assert.equal(doc.scenes, 1, 'round ' + round);
    assert.equal(doc.usage.scans, 1, 'round ' + round);
  }
});

test('release gives back the daily slot and the scene in one write; after midnight only the scene', async () => {
  const id = 'u-scene-release-' + Date.now();
  await newUser(id);
  const day = billing.utcDay();
  const slot = await billing.reserveScan(await store.get('users', id), day, SCENE);
  assert.equal(slot.ok, true);
  await slot.release();
  let doc = await store.get('users', id);
  assert.deepEqual(doc.usage, { day, scans: 0 });
  assert.equal(doc.scenes, 0);

  // скан почався ввечері, а відповідь прийшла вже завтра (лічильник перейшов
  // на новий день): денний слот лишається за новим днем, проба — повертається
  const late = await billing.reserveScan(await store.get('users', id), day, SCENE);
  assert.equal(late.ok, true);
  const tomorrow = billing.addDays(day, 1);
  await store.update('users', id, { usage: { day: tomorrow, scans: 1 } });
  await late.release();
  doc = await store.get('users', id);
  assert.deepEqual(doc.usage, { day: tomorrow, scans: 1 });
  assert.equal(doc.scenes, 0);

  // звичайний скан сцену не чіпає ні туди, ні назад
  await store.update('users', id, { scenes: 1 });
  const single = await billing.reserveScan(await store.get('users', id), tomorrow);
  assert.equal(single.ok, true);
  await single.release();
  doc = await store.get('users', id);
  assert.deepEqual(doc.usage, { day: tomorrow, scans: 1 });
  assert.equal(doc.scenes, 1);
});

test('a release racing with a new scene reservation leaves the counters consistent', async () => {
  const day = billing.utcDay();
  for (let round = 0; round < 5; round++) {
    const id = `u-scene-swap-${round}-` + Date.now();
    await newUser(id);
    const first = await billing.reserveScan(await store.get('users', id), day, SCENE);
    assert.equal(first.ok, true);
    // знімок до повернення: наступний запит міг прочитати запис саме тоді
    const snapshot = await store.get('users', id);
    const [, next] = await Promise.all([first.release(), billing.reserveScan(snapshot, day, SCENE)]);
    const doc = await store.get('users', id);
    const taken = next.ok ? 1 : 0;
    assert.equal(doc.scenes, taken, 'round ' + round);
    assert.equal(doc.usage.scans, taken, 'round ' + round);
    if (!next.ok) assert.equal(next.scene, true);
  }
});

test('Pro passes the scene limit; RevenueCat is asked once, only after the free scene is used', async () => {
  const id = 'u-scene-pro-' + Date.now();
  await newUser(id);
  const day = billing.utcDay();
  const before = rc.calls;
  const free = await billing.reserveScan(await store.get('users', id), day, SCENE);
  assert.equal(free.ok, true);
  assert.equal(free.pro, false);
  assert.equal(rc.calls, before);

  rc.entitled.add(id);
  const paid = await billing.reserveScan(await store.get('users', id), day, SCENE);
  assert.equal(paid.ok, true);
  assert.equal(paid.pro, true);
  assert.equal(rc.calls, before + 1);
  // і понад денний ліміт теж — уже без нового запиту (Pro до кінця місяця в записі)
  const third = await billing.reserveScan(await store.get('users', id), day, SCENE);
  assert.equal(third.ok, true);
  assert.equal(rc.calls, before + 1);
  const doc = await store.get('users', id);
  assert.deepEqual(doc.usage, { day, scans: 3 });
  assert.equal(doc.scenes, 3);
});
