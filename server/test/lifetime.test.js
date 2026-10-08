// Один безкоштовний скан на все життя запису (FREE_SCANS=1) через справжній
// HTTP і прямі виклики billing: ліміт не повертається ні завтра, ні через рік;
// паралельні скани не проходять удвох (і зі сховищем, що відповідає із
// затримкою, як Firestore); невдалий скан повертає скан і сцену; сцена теж
// забирає скан; лічильник записів часів денного ліміту (usage) береться в
// рахунок; Pro без меж, а Pro, що скінчився, — знову SCAN_LIMIT. RevenueCat —
// підроблений fetch, що рахує виклики.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-lifetime-'));
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

const { startServer, withCalendar } = require('./helpers/http');
const { withSlowStore } = require('./helpers/slow-store');
const ai = require('../ai');
const billing = require('../billing');
const store = require('../store');

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

const IMAGE = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };
const SCENE = { ...IMAGE, mode: 'scene' };
const DAY = 86400000;
const LIMIT = { error: 'SCAN_LIMIT', limit: 1, used: 1 };
const scan = (token, day, body = IMAGE) =>
  call('POST', '/scan', { token, body, headers: day ? { 'x-local-date': day } : {} });

async function usage(token, day) {
  const me = await call('GET', '/me', { token, headers: day ? { 'x-local-date': day } : {} });
  assert.equal(me.status, 200);
  return me.data.usage;
}

// Рахує виклики моделі (і за потреби підміняє її) на час одного тесту.
async function withAi(fakes, fn) {
  const real = { recognize: ai.recognize, recognizeScene: ai.recognizeScene };
  const calls = { object: 0, scene: 0 };
  ai.recognize = async (...a) => (calls.object++, (fakes.object || real.recognize)(...a));
  ai.recognizeScene = async (...a) => (calls.scene++, (fakes.scene || real.recognizeScene)(...a));
  try {
    return await fn(calls);
  } finally {
    Object.assign(ai, real);
  }
}

const hook = (event) =>
  call('POST', '/webhooks/revenuecat', { body: { event }, headers: { authorization: 'Bearer hook-secret' } });

async function newUser(id, fields = {}) {
  await store.put('users', id, { id, createdAt: Date.now(), ...fields });
  return store.get('users', id);
}

// ---------- (a) один скан, і завтра він не повертається ----------
test('a free record gets exactly one scan; tomorrow and the day after it is still 402 before the AI', async () => {
  const { token } = await newDevice();
  const today = billing.utcDay();
  const tomorrow = billing.addDays(today, 1);
  const dayAfter = billing.addDays(today, 2);
  await withAi({}, async (calls) => {
    const first = await scan(token, today);
    assert.equal(first.status, 200);
    assert.equal(first.data.word, 'mug');
    assert.deepEqual(first.data.usage, { day: today, scans: 1, limit: 1, scenes: 0, sceneLimit: 1, period: 'lifetime' });

    for (const day of [today, tomorrow, dayAfter, today]) {
      const r = await scan(token, day);
      assert.equal(r.status, 402, day);
      assert.deepEqual(r.data, LIMIT, day);
    }
    assert.equal(calls.object, 1);
  });
  // завтра — справжнє (у межах доби), день після — сервер затискає до «сьогодні»
  assert.equal((await usage(token, tomorrow)).day, tomorrow);
  assert.equal((await usage(token, dayAfter)).day, today);
  assert.equal((await usage(token, tomorrow)).scans, 1);
});

test('with the server clock moved days, a month and a year ahead the free scan still does not come back', async () => {
  const { token, user } = await newDevice();
  const realToday = billing.utcDay();
  assert.equal((await scan(token, realToday)).status, 200);
  for (const days of [1, 2, 7, 31, 366]) {
    await withCalendar(days * DAY, async () => {
      // сервер справді живе в тому дні: дату клієнта приймає, а не затискає
      const today = billing.utcDay();
      assert.equal(today, billing.addDays(realToday, days));
      for (const day of [today, billing.addDays(today, 1)]) {
        const r = await scan(token, day);
        assert.equal(r.status, 402, `+${days}d ${day}`);
        assert.deepEqual(r.data, LIMIT, `+${days}d ${day}`);
        const u = await usage(token, day);
        assert.equal(u.day, day, `+${days}d`);
        assert.equal(u.scans, 1, `+${days}d`);
        assert.equal(u.limit, 1, `+${days}d`);
      }
      // і напряму, без HTTP: reserveScan дня не знає взагалі
      const slot = await billing.reserveScan(await store.get('users', user.id));
      assert.deepEqual(slot, { ok: false, used: 1, limit: 1 }, `+${days}d`);
    });
  }
  assert.equal((await store.get('users', user.id)).scans, 1);
});

// ---------- (b) паралельні скани: проходить рівно один ----------
test('parallel scans over HTTP: exactly one of them passes and only one reaches the AI', async () => {
  const { token } = await newDevice();
  // справжній AI відповідає секунди — саме тоді запити й перетинаються
  const slow = (fn) => async (...a) => {
    await new Promise((r) => setTimeout(r, 60));
    return fn(...a);
  };
  const replies = await withAi({ object: slow(ai.recognize), scene: slow(ai.recognizeScene) }, async (calls) => {
    const out = await Promise.all([
      ...Array.from({ length: 6 }, () => scan(token, billing.utcDay())),
      ...Array.from({ length: 2 }, () => scan(token, billing.utcDay(), SCENE)),
    ]);
    assert.equal(calls.object + calls.scene, 1);
    return out;
  });
  assert.deepEqual(replies.map((r) => r.status).sort(), [200, 402, 402, 402, 402, 402, 402, 402]);
  for (const r of replies.filter((x) => x.status === 402)) assert.deepEqual(r.data, LIMIT);
  assert.equal((await usage(token)).scans, 1);
});

test('parallel reservations from one stale snapshot: one wins on the file store', async () => {
  for (let round = 0; round < 3; round++) {
    const id = `u-race-${round}-` + Date.now();
    const stale = await newUser(id);
    const results = await Promise.all(
      Array.from({ length: 8 }, (_, i) => billing.reserveScan(stale, { scene: i % 3 === 0 }))
    );
    assert.equal(results.filter((r) => r.ok).length, 1, 'round ' + round);
    for (const r of results.filter((x) => !x.ok)) assert.deepEqual(r, { ok: false, used: 1, limit: 1 }, 'round ' + round);
    assert.equal((await store.get('users', id)).scans, 1, 'round ' + round);
  }
});

test('with a slow store parallel scans still take exactly one free scan', async () => {
  for (let round = 0; round < 8; round++) {
    const id = `u-slow-${round}-` + Date.now();
    const stale = await newUser(id);
    const results = await withSlowStore(round + 11, () =>
      Promise.all(Array.from({ length: 8 }, (_, i) => billing.reserveScan(stale, { scene: i % 2 === 1 })))
    );
    const won = results.filter((r) => r.ok);
    assert.equal(won.length, 1, 'round ' + round);
    for (const r of results.filter((x) => !x.ok)) assert.deepEqual(r, { ok: false, used: 1, limit: 1 }, 'round ' + round);
    const doc = await store.get('users', id);
    assert.equal(doc.scans, 1, 'round ' + round);
    // сцена — лише якщо виграла саме сцена, і тим самим записом
    const sceneWon = results.findIndex((r) => r.ok) % 2 === 1;
    assert.equal(doc.scenes || 0, sceneWon ? 1 : 0, 'round ' + round);
  }
});

// ---------- (c) невдалий скан повертає скан (і сцену) ----------
test('a failed single scan gives the lifetime scan back: 422, 502, AI error, 504', async () => {
  const { token } = await newDevice();
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const failures = [
    [async () => ({ word: 'unknown' }), 422],
    [async () => null, 502],
    [async () => ({ word: '' }), 502],
    [async () => { throw new Error('overloaded'); }, 502],
    [async () => { throw timeout; }, 504],
  ];
  for (const [fake, status] of failures) {
    const r = await withAi({ object: fake }, () => scan(token));
    assert.equal(r.status, status);
    assert.equal((await usage(token)).scans, 0, String(status));
  }
  // скан на місці: перший справжній проходить, наступний — уже 402
  assert.equal((await scan(token)).status, 200);
  assert.deepEqual((await scan(token)).data, LIMIT);
});

test('a single scan nobody waits for any more gives the scan back', async () => {
  const { token } = await newDevice();
  let finished;
  const done = new Promise((r) => (finished = r));
  const controller = new AbortController();
  const real = ai.recognize;
  await withAi(
    {
      object: async (...a) => {
        controller.abort(); // застосунок здався, поки модель думала
        await new Promise((r) => setTimeout(r, 100));
        finished();
        return real(...a);
      },
    },
    async () => {
      await call('POST', '/scan', { token, body: IMAGE, signal: controller.signal }).catch(() => null);
      await done;
      await new Promise((r) => setTimeout(r, 100));
    }
  );
  assert.equal((await usage(token)).scans, 0);
  assert.equal((await scan(token)).status, 200);
});

test('a failed scene gives back both the scan and the scene, so the one free scan is still there', async () => {
  const { token } = await newDevice();
  for (const [fake, status] of [
    [async () => ({ objects: [] }), 422],
    [async () => { throw new Error('overloaded'); }, 502],
  ]) {
    const r = await withAi({ scene: fake }, () => scan(token, undefined, SCENE));
    assert.equal(r.status, status);
    const u = await usage(token);
    assert.equal(u.scans, 0);
    assert.equal(u.scenes, 0);
  }
  const ok = await scan(token, undefined, SCENE);
  assert.equal(ok.status, 200);
  assert.equal(ok.data.usage.scans, 1);
  assert.equal(ok.data.usage.scenes, 1);
});

// ---------- (d) сцена забирає скан ----------
test('a single scan first leaves the scene trial untouched, but the scene is SCAN_LIMIT', async () => {
  const { token } = await newDevice();
  assert.equal((await scan(token)).status, 200);
  const r = await withAi({}, async (calls) => {
    const out = await scan(token, undefined, SCENE);
    assert.equal(calls.scene, 0);
    return out;
  });
  assert.equal(r.status, 402);
  assert.deepEqual(r.data, LIMIT);
  const u = await usage(token);
  assert.equal(u.scans, 1);
  assert.equal(u.scenes, 0);
});

// ---------- (e) лічильник часів денного ліміту ----------
test('a record from the daily-limit days keeps its scans: usage.scans counts toward the lifetime limit', async () => {
  const today = billing.utcDay();
  const yesterday = billing.addDays(today, -1);
  const lastMonth = billing.addDays(today, -30);
  for (const legacy of [{ day: today, scans: 1 }, { day: yesterday, scans: 1 }, { day: lastMonth, scans: 4 }]) {
    const { token, user } = await newDevice();
    await store.update('users', user.id, { usage: legacy });
    const u = await usage(token, today);
    assert.equal(u.scans, legacy.scans, JSON.stringify(legacy));
    assert.equal(u.period, 'lifetime');
    const r = await scan(token, today);
    assert.equal(r.status, 402, JSON.stringify(legacy));
    assert.deepEqual(r.data, { error: 'SCAN_LIMIT', limit: 1, used: legacy.scans });
  }
});

test('a legacy record that did not scan gets its one scan; the new counter is written, usage never again', async () => {
  const today = billing.utcDay();
  const { token, user } = await newDevice();
  const legacy = { day: billing.addDays(today, -1), scans: 0 };
  await store.update('users', user.id, { usage: legacy });
  const r = await scan(token, today);
  assert.equal(r.status, 200);
  assert.equal(r.data.usage.scans, 1);
  let doc = await store.get('users', user.id);
  assert.equal(doc.scans, 1);
  assert.deepEqual(doc.usage, legacy);
  assert.deepEqual((await scan(token, today)).data, LIMIT);

  // зламаний старий лічильник нічого не забирає
  for (const usageField of [{ day: today, scans: 1.5 }, { day: today, scans: '1' }, { day: today, scans: -2 }, 'x', null]) {
    const d = await newDevice();
    await store.update('users', d.user.id, { usage: usageField });
    assert.equal((await scan(d.token, today)).status, 200, JSON.stringify(usageField));
  }

  // і новий, і старий лічильник — береться більший
  const both = await newDevice();
  await store.update('users', both.user.id, { scans: 0, usage: { day: today, scans: 1 } });
  assert.equal((await usage(both.token)).scans, 1);
  assert.equal((await scan(both.token)).status, 402);

  // Pro з великим старим лічильником: рахунок іде далі від нього, usage не чіпаємо
  const pro = await newDevice();
  // proCheckedAt: вебхук уже звірив Pro з RevenueCat (без нього сервер звіряв би знову)
  await store.update('users', pro.user.id, { usage: { day: today, scans: 5 }, proUntil: Date.now() + DAY, proCheckedAt: Date.now() });
  const p = await scan(pro.token, today);
  assert.equal(p.status, 200);
  assert.equal(p.data.usage.scans, 6);
  assert.equal(p.data.usage.limit, null);
  doc = await store.get('users', pro.user.id);
  assert.equal(doc.scans, 6);
  assert.deepEqual(doc.usage, { day: today, scans: 5 });
});

test('releasing a legacy record’s scan counts from the larger counter and does not go below it', async () => {
  const id = 'u-legacy-release-' + Date.now();
  await newUser(id, { usage: { day: billing.utcDay(), scans: 2 }, proUntil: Date.now() + DAY, proCheckedAt: Date.now() });
  const slot = await billing.reserveScan(await store.get('users', id));
  assert.equal(slot.ok, true);
  assert.equal((await store.get('users', id)).scans, 3);
  await slot.release();
  const doc = await store.get('users', id);
  assert.equal(doc.scans, 2);
  assert.equal(billing.usageView(doc, billing.utcDay(), false).scans, 2);
});

// ---------- (h) Pro: без меж, лінивий RevenueCat, покупка, кінець Pro ----------
test('Pro: the free scan asks RevenueCat nothing, refresh after purchase unlocks, a lapsed Pro is SCAN_LIMIT again', async () => {
  const { token, user } = await newDevice();
  const before = rc.calls;
  assert.equal((await scan(token)).status, 200);
  assert.equal(rc.calls, before);

  // безкоштовне скінчилось — тепер (і лише тепер) питаємо, чи є Pro; відповідь кешується
  assert.deepEqual((await scan(token)).data, LIMIT);
  assert.equal(rc.calls, before + 1);
  assert.deepEqual((await scan(token)).data, LIMIT);
  assert.equal(rc.calls, before + 1);

  // купив — застосунок перепитує ?refresh=1, і скани відкриваються
  rc.entitled.add(user.id);
  const me = await call('GET', '/me?refresh=1', { token });
  assert.equal(me.data.pro.active, true);
  assert.deepEqual(me.data.usage, { day: billing.utcDay(), scans: 1, limit: null, scenes: 0, sceneLimit: null, period: 'lifetime' });
  const paid = rc.calls;
  for (let i = 2; i <= 4; i++) {
    const r = await scan(token, undefined, i === 4 ? SCENE : IMAGE);
    assert.equal(r.status, 200);
    assert.equal(r.data.usage.scans, i);
    assert.equal(r.data.usage.limit, null);
    assert.equal(r.data.usage.sceneLimit, null);
  }
  // Pro вже відомий — жодного запиту до RevenueCat на скан
  assert.equal(rc.calls, paid);

  // Pro скінчився: скани знову рахуються від довічного лічильника (уже 4)
  rc.entitled.delete(user.id);
  await hook({ type: 'EXPIRATION', app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ['lingualens_pro'] });
  const lapsed = await scan(token);
  assert.equal(lapsed.status, 402);
  assert.deepEqual(lapsed.data, { error: 'SCAN_LIMIT', limit: 1, used: 4 });
  const u = await usage(token);
  assert.equal(u.limit, 1);
  assert.equal(u.sceneLimit, 1);
  assert.equal(u.scans, 4);
  assert.equal(u.scenes, 1);
});
