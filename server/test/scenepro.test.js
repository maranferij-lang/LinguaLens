// Скан сцени — функція Pro з довічною пробою (FREE_SCENES) через справжній
// HTTP: порядок відмов (спершу денний ліміт, потім сцени), обидві — до AI;
// гонки паралельних сцен; повернення проби разом зі слотом; Pro без меж і
// ліниві запити до RevenueCat (підроблений fetch рахує виклики).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-scenepro-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  // Денних сканів із запасом: тут упираємось саме в пробу сцени.
  FREE_SCANS_PER_DAY: '10',
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

const { startServer } = require('./helpers/http');
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
const day = () => billing.utcDay();
const headers = () => ({ 'x-local-date': day() });

async function usage(token) {
  const me = await call('GET', '/me', { token, headers: headers() });
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
    await fn(calls);
  } finally {
    Object.assign(ai, real);
  }
}

const hook = (event) =>
  call('POST', '/webhooks/revenuecat', { body: { event }, headers: { authorization: 'Bearer hook-secret' } });

test('a free user gets one scene for life, then 402 SCENE_PRO before the AI is called', async () => {
  const { token } = await newDevice();
  await withAi({}, async (calls) => {
    const first = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
    assert.equal(first.status, 200);
    assert.equal(first.data.mode, 'scene');
    assert.deepEqual(first.data.usage, { day: day(), scans: 1, limit: 10, scenes: 1, sceneLimit: 1 });

    const second = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
    assert.equal(second.status, 402);
    assert.deepEqual(second.data, { error: 'SCENE_PRO', limit: 1, used: 1 });
    // проба довічна: завтрашній день її не повертає
    const tomorrow = await call('POST', '/scan', {
      token,
      body: SCENE,
      headers: { 'x-local-date': billing.addDays(day(), 1) },
    });
    assert.deepEqual(tomorrow.data, { error: 'SCENE_PRO', limit: 1, used: 1 });
    assert.equal(calls.scene, 1);

    // відмова в сцені не з'їла денного скану: звичайний скан проходить
    const single = await call('POST', '/scan', { token, body: IMAGE, headers: headers() });
    assert.equal(single.status, 200);
    assert.equal(single.data.word, 'mug');
    assert.equal(single.data.usage.scans, 2);
    assert.equal(single.data.usage.scenes, 1);
  });
  const u = await usage(token);
  assert.equal(u.scans, 2);
  assert.equal(u.scenes, 1);
  assert.equal(u.sceneLimit, 1);
});

test('the daily limit is checked first: SCAN_LIMIT, not SCENE_PRO', async () => {
  const { token, user } = await newDevice();
  await store.update('users', user.id, { usage: { day: day(), scans: 10 }, scenes: 1 });
  await withAi({}, async (calls) => {
    const r = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
    assert.equal(r.status, 402);
    assert.deepEqual(r.data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });
    assert.equal(calls.scene, 0);
  });
  const u = await usage(token);
  assert.equal(u.scans, 10);
  assert.equal(u.scenes, 1);
});

test('parallel scenes cannot overrun the free scene, and denied ones take no daily slot', async () => {
  const { token } = await newDevice();
  // справжній AI відповідає секунди — саме тоді запити й перетинаються
  const slow = (fn) => async (...a) => {
    await new Promise((r) => setTimeout(r, 60));
    return fn(...a);
  };
  let replies;
  await withAi({ scene: slow(ai.recognizeScene), object: slow(ai.recognize) }, async (calls) => {
    replies = await Promise.all([
      ...Array.from({ length: 5 }, () => call('POST', '/scan', { token, body: SCENE, headers: headers() })),
      ...Array.from({ length: 3 }, () => call('POST', '/scan', { token, body: IMAGE, headers: headers() })),
    ]);
    assert.equal(calls.scene, 1);
    assert.equal(calls.object, 3);
  });
  const scenes = replies.slice(0, 5);
  assert.deepEqual(scenes.map((r) => r.status).sort(), [200, 402, 402, 402, 402]);
  for (const r of scenes.filter((x) => x.status === 402)) assert.equal(r.data.error, 'SCENE_PRO');
  assert.deepEqual(replies.slice(5).map((r) => r.status), [200, 200, 200]);
  const u = await usage(token);
  assert.equal(u.scans, 4);
  assert.equal(u.scenes, 1);
});

test('a failed free scene gives back both the daily scan and the scene', async () => {
  const { token } = await newDevice();
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const failures = [
    [async () => ({ objects: [] }), 422],
    [async () => null, 502],
    [async () => { throw new Error('overloaded'); }, 502],
    [async () => { throw timeout; }, 504],
  ];
  for (const [fake, status] of failures) {
    await withAi({ scene: fake }, async () => {
      const r = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
      assert.equal(r.status, status);
    });
    const u = await usage(token);
    assert.equal(u.scans, 0);
    assert.equal(u.scenes, 0);
  }
  // проба на місці — справжня сцена проходить
  const ok = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.usage.scenes, 1);
});

test('a scene nobody waits for any more gives the scene back too', async () => {
  const { token } = await newDevice();
  let finished;
  const done = new Promise((r) => (finished = r));
  const controller = new AbortController();
  const realScene = ai.recognizeScene;
  await withAi(
    {
      scene: async (...a) => {
        controller.abort(); // застосунок здався, поки модель думала
        await new Promise((r) => setTimeout(r, 100));
        finished();
        return realScene(...a);
      },
    },
    async () => {
      await call('POST', '/scan', { token, body: SCENE, headers: headers(), signal: controller.signal }).catch(() => null);
      await done;
      await new Promise((r) => setTimeout(r, 100));
    }
  );
  const u = await usage(token);
  assert.equal(u.scans, 0);
  assert.equal(u.scenes, 0);
});

test('a bad body is 400 and touches no counter', async () => {
  const { token } = await newDevice();
  for (const body of ['{oops', { mode: 'scene' }, { mode: 'scene', image: 42 }]) {
    const r = await call('POST', '/scan', { token, body, headers: headers() });
    assert.equal(r.status, 400);
  }
  const u = await usage(token);
  assert.equal(u.scans, 0);
  assert.equal(u.scenes, 0);
});

test('the Pro check stays lazy: free scans and the free scene ask RevenueCat nothing', async () => {
  const { token, user } = await newDevice();
  const before = rc.calls;
  assert.equal((await call('POST', '/scan', { token, body: IMAGE, headers: headers() })).status, 200);
  assert.equal((await call('POST', '/scan', { token, body: SCENE, headers: headers() })).status, 200);
  assert.equal(rc.calls, before);

  // проба вичерпана — тепер (і лише тепер) питаємо, чи є Pro; відповідь кешується
  assert.equal((await call('POST', '/scan', { token, body: SCENE, headers: headers() })).data.error, 'SCENE_PRO');
  assert.equal(rc.calls, before + 1);
  assert.equal((await call('POST', '/scan', { token, body: SCENE, headers: headers() })).data.error, 'SCENE_PRO');
  assert.equal(rc.calls, before + 1);

  // купив — застосунок перепитує ?refresh=1, і сцени відкриваються
  rc.entitled.add(user.id);
  const me = await call('GET', '/me?refresh=1', { token, headers: headers() });
  assert.equal(me.data.pro.active, true);
  assert.equal(me.data.usage.sceneLimit, null);
  const paid = rc.calls;
  const r = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
  assert.equal(r.status, 200);
  assert.equal(rc.calls, paid);
});

test('Pro scans scenes without a limit, and a lapsed Pro has no free scene left', async () => {
  const { token, user } = await newDevice();
  rc.entitled.add(user.id);
  const until = Date.now() + 7 * 86400000;
  await hook({ type: 'INITIAL_PURCHASE', app_user_id: user.id, expiration_at_ms: until, entitlement_ids: ['lingualens_pro'] });
  const before = rc.calls;
  for (let i = 1; i <= 3; i++) {
    const r = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
    assert.equal(r.status, 200);
    assert.deepEqual(r.data.usage, { day: day(), scans: i, limit: null, scenes: i, sceneLimit: null });
  }
  // Pro вже відомий із вебхука — жодного запиту до RevenueCat на скан
  assert.equal(rc.calls, before);

  rc.entitled.delete(user.id);
  await hook({ type: 'EXPIRATION', app_user_id: user.id, expiration_at_ms: Date.now() - 1000, entitlement_ids: ['lingualens_pro'] });
  const r = await call('POST', '/scan', { token, body: SCENE, headers: headers() });
  assert.equal(r.status, 402);
  assert.deepEqual(r.data, { error: 'SCENE_PRO', limit: 1, used: 3 });
  const u = await usage(token);
  assert.equal(u.sceneLimit, 1);
  assert.equal(u.scenes, 3);
});
