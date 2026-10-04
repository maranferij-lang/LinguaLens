// Скан цілої сцени (mode: 'scene') через справжній HTTP: маршрутизація,
// чистка відповіді моделі, облік рівно одного скану й повернення слота.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-scene-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  FREE_SCANS_PER_DAY: '3',
  // Тут перевіряємо саму сцену, а не пробу Pro (її — scenepro.test.js):
  // кілька сцен на пристрій, тож довічний ліміт із запасом.
  FREE_SCENES: '10',
  REVENUECAT_SECRET_KEY: '',
});
const { startServer } = require('./helpers/http');
const ai = require('../ai');
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
  fs.rmSync(dir, { recursive: true, force: true });
});

const SCENE = { image: 'aGk=', lang: 'en', nativeLang: 'uk', mode: 'scene' };

async function used(token) {
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': billing.utcDay() } });
  return me.data.usage.scans;
}

// Підміняє відповідь моделі на час одного тесту.
async function withScene(fake, fn) {
  const real = ai.recognizeScene;
  ai.recognizeScene = fake;
  try {
    return await fn();
  } finally {
    ai.recognizeScene = real;
  }
}

const obj = (word, box, extra = {}) => ({
  word,
  ipa: '/x/',
  translation: 'переклад',
  example: 'Example.',
  example_translation: 'Приклад.',
  box,
  outline: null,
  ...extra,
});

test('the mock scene: four objects with boxes and clockwise outlines, one scan', async () => {
  const { token } = await newDevice();
  const r = await call('POST', '/scan', { token, body: SCENE, headers: { 'x-local-date': billing.utcDay() } });
  assert.equal(r.status, 200);
  assert.equal(r.data.mode, 'scene');
  assert.deepEqual(r.data.objects.map((o) => o.word), ['mug', 'plant', 'book', 'lamp']);
  assert.deepEqual(r.data.objects.map((o) => o.translation), ['кружка', 'рослина', 'книжка', 'лампа']);
  for (const o of r.data.objects) {
    assert.deepEqual(Object.keys(o), ['word', 'ipa', 'translation', 'example', 'example_translation', 'box', 'outline']);
    assert.equal(o.box.length, 4);
    assert.ok(o.box.every((v) => Number.isInteger(v) && v >= 0 && v <= 1000));
    assert.ok(o.outline.length >= 12 && o.outline.length <= 24);
    for (const [y, x] of o.outline) {
      assert.ok(Number.isInteger(y) && Number.isInteger(x));
      assert.ok(y >= o.box[0] && y <= o.box[2] && x >= o.box[1] && x <= o.box[3]);
    }
    // перша точка вгорі, наступні йдуть праворуч — за годинниковою стрілкою
    assert.ok(o.outline[0][0] === o.box[0] && o.outline[2][1] > o.outline[0][1]);
  }
  assert.deepEqual(r.data.usage, { day: billing.utcDay(), scans: 1, limit: 3, scenes: 1, sceneLimit: 10 });
  assert.equal(await used(token), 1);
});

test('the mock scene follows the learning and native language', async () => {
  const { token } = await newDevice();
  const de = await call('POST', '/scan', { token, body: { ...SCENE, lang: 'de', nativeLang: 'en' } });
  assert.deepEqual(de.data.objects.map((o) => o.word), ['die Tasse', 'die Pflanze', 'das Buch', 'die Lampe']);
  assert.deepEqual(de.data.objects.map((o) => o.translation), ['mug', 'plant', 'book', 'lamp']);
});

test('mode routes the request: only "scene" asks for a scene, anything else is a single scan', async () => {
  const calls = [];
  const realOne = ai.recognize;
  const realScene = ai.recognizeScene;
  ai.recognize = async (...a) => (calls.push('object'), realOne(...a));
  ai.recognizeScene = async (...a) => (calls.push('scene'), realScene(...a));
  try {
    for (const mode of [undefined, 'object', 'SCENE', 'room', 42, ['scene']]) {
      const { token } = await newDevice();
      const r = await call('POST', '/scan', { token, body: { ...SCENE, mode } });
      assert.equal(r.status, 200);
      // відповідь одиночного скану — рівно та сама, що до v1.1
      assert.deepEqual(Object.keys(r.data), ['word', 'ipa', 'translation', 'example', 'example_translation', 'box', 'outline', 'usage']);
      assert.equal(r.data.word, 'mug');
    }
    const { token } = await newDevice();
    assert.equal((await call('POST', '/scan', { token, body: SCENE })).data.mode, 'scene');
  } finally {
    ai.recognize = realOne;
    ai.recognizeScene = realScene;
  }
  assert.deepEqual(calls, ['object', 'object', 'object', 'object', 'object', 'object', 'scene']);
});

test('duplicates are merged (larger box wins, first position kept), unusable boxes dropped, 8 at most', async () => {
  const { token } = await newDevice();
  const r = await withScene(
    async () => ({
      objects: [
        obj('Chair', [100, 100, 300, 300]),
        obj('table', [500, 100, 900, 900]),
        obj('chair', [50, 50, 400, 400], { translation: 'стілець' }),
        obj('lamp', [10, 10, 30, 900]), // 2% заввишки — не предмет
        obj('vase', null),
        obj('cup', [100, 100, 200]),
        obj('unknown', [0, 0, 500, 500]),
        obj('', [0, 0, 500, 500]),
        null,
        ...['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((w) => obj(w, [0, 0, 500, 500])),
      ],
    }),
    () => call('POST', '/scan', { token, body: SCENE })
  );
  assert.equal(r.status, 200);
  const words = r.data.objects.map((o) => o.word);
  assert.deepEqual(words, ['chair', 'table', 'a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(r.data.objects[0].box, [50, 50, 400, 400]);
  assert.equal(r.data.objects[0].translation, 'стілець');
});

test('strings are clamped and coordinates forced into 0–1000 integers', async () => {
  const { token } = await newDevice();
  const outline = Array.from({ length: 12 }, (_, i) => [i * 100.4 - 50, 2000]);
  const r = await withScene(
    async () => ({ objects: [obj('  ' + 'w'.repeat(80) + '  ', [-20, '10', 600.6, 1500], { example: 'e'.repeat(400), outline })] }),
    () => call('POST', '/scan', { token, body: SCENE })
  );
  const [o] = r.data.objects;
  assert.equal(o.word, 'w'.repeat(60));
  assert.equal(o.example.length, 240);
  assert.deepEqual(o.box, [0, 10, 601, 1000]);
  assert.ok(o.outline.every(([y, x]) => Number.isInteger(y) && y >= 0 && y <= 1000 && x === 1000));
});

test('no usable objects is 422 like an empty single scan, and the scan is given back', async () => {
  const { token } = await newDevice();
  const single = await withScene(
    async () => ({ word: 'unknown' }),
    () => call('POST', '/scan', { token, body: SCENE })
  );
  assert.equal(single.status, 422);
  for (const reply of [{ objects: [] }, { objects: [obj('vase', null)] }, []]) {
    const r = await withScene(async () => reply, () => call('POST', '/scan', { token, body: SCENE }));
    assert.equal(r.status, 422);
    assert.equal(r.data.error, single.data.error);
  }
  assert.equal(await used(token), 0);
});

test('an unreadable reply is 502, an AI failure 502, a timeout 504 — the slot always comes back', async () => {
  const { token } = await newDevice();
  const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
  const cases = [
    [async () => null, 502],
    [async () => ({ objects: 'many' }), 502],
    [async () => { throw new Error('Anthropic 529: overloaded'); }, 502],
    [async () => { throw timeout; }, 504],
  ];
  for (const [fake, status] of cases) {
    const r = await withScene(fake, () => call('POST', '/scan', { token, body: SCENE }));
    assert.equal(r.status, status);
    assert.ok(!JSON.stringify(r.data).includes('Anthropic'));
  }
  assert.equal(await used(token), 0);
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': billing.utcDay() } });
  assert.equal(me.data.usage.scenes, 0);
});

test('a scene costs exactly one scan of the daily limit', async () => {
  const { token } = await newDevice();
  const day = billing.utcDay();
  const headers = { 'x-local-date': day };
  const statuses = [];
  const replies = [];
  for (let i = 0; i < 4; i++) replies.push(await call('POST', '/scan', { token, body: SCENE, headers }));
  assert.deepEqual(replies.map((r) => r.status), [200, 200, 200, 402]);
  // проби сцен ще є (10), тож відмова — саме денний ліміт
  assert.deepEqual(replies[3].data, { error: 'SCAN_LIMIT', limit: 3, used: 3 });
  assert.equal(await used(token), 3);
  const me = await call('GET', '/me', { token, headers });
  assert.equal(me.data.usage.scenes, 3);
});

test('a scene nobody waits for any more is not counted', async () => {
  const { token } = await newDevice();
  let finished;
  const done = new Promise((r) => (finished = r));
  const controller = new AbortController();
  await withScene(
    async (...a) => {
      controller.abort(); // застосунок здався, поки модель думала
      await new Promise((r) => setTimeout(r, 100));
      finished();
      return { objects: [obj('chair', [0, 0, 500, 500])] };
    },
    async () => {
      await call('POST', '/scan', { token, body: SCENE, signal: controller.signal }).catch(() => null);
      await done;
      await new Promise((r) => setTimeout(r, 100));
    }
  );
  assert.equal(await used(token), 0);
});
