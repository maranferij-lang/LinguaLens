// Варіанти мов через справжній HTTP (AI у режимі mock): скан, сцена й слово
// дня приймають variant (мова навчання) і nativeVariant (мова перекладу),
// лише зі списку й лише ті, що є в цієї мови. Mock пише «favorite» для
// американської англійської й транскрибує з seseo для латиноамериканської
// іспанської, тож видно, що варіант дійшов до відповіді.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-variants-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  FREE_SCANS: '20',
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

const headers = () => ({ 'x-local-date': billing.utcDay() });

async function scan(body) {
  const { token } = await newDevice();
  const r = await call('POST', '/scan', { token, body: { image: 'aGk=', ...body }, headers: headers() });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}

test('scan: American and British English spell the example their own way', async () => {
  const us = await scan({ lang: 'en', nativeLang: 'uk', variant: 'us' });
  assert.equal(us.example, 'I drink tea from my favorite mug.');
  const gb = await scan({ lang: 'en', nativeLang: 'uk', variant: 'gb' });
  assert.equal(gb.example, 'I drink tea from my favourite mug.');
  // без варіанта — як до варіантів
  assert.equal((await scan({ lang: 'en', nativeLang: 'uk' })).example, 'I drink tea from my favourite mug.');
});

test('scan: Spain and Latin America transcribe la taza with θ and with seseo', async () => {
  assert.equal((await scan({ lang: 'es', nativeLang: 'uk', variant: 'es' })).ipa, '/la ˈtaθa/');
  assert.equal((await scan({ lang: 'es', nativeLang: 'uk', variant: 'latam' })).ipa, '/la ˈtasa/');
});

test('scan: the translation follows the native variant', async () => {
  const r = await scan({ lang: 'de', nativeLang: 'en', nativeVariant: 'us' });
  assert.equal(r.word, 'die Tasse');
  assert.equal(r.example_translation, 'I drink tea from my favorite mug.');
  const gb = await scan({ lang: 'de', nativeLang: 'en', nativeVariant: 'gb' });
  assert.equal(gb.example_translation, 'I drink tea from my favourite mug.');
});

test('scan: a variant the language does not have, or anything odd, is ignored', async () => {
  for (const variant of ['latam', 'xx', 'constructor', '__proto__', 42, ['us'], { id: 'us' }, null]) {
    const r = await scan({ lang: 'en', nativeLang: 'uk', variant, nativeVariant: variant });
    assert.equal(r.example, 'I drink tea from my favourite mug.', String(variant));
  }
  // британська — не іспанський варіант
  assert.equal((await scan({ lang: 'es', nativeLang: 'uk', variant: 'gb' })).ipa, '/la ˈtaθa/');
});

test('scene: every object comes in the asked variant', async () => {
  const r = await scan({ lang: 'es', nativeLang: 'uk', mode: 'scene', variant: 'latam' });
  const taza = r.objects.find((o) => o.word === 'la taza');
  assert.equal(taza.ipa, '/la ˈtasa/');
  assert.ok(r.objects.every((o) => !o.ipa.includes('θ')));
  const en = await scan({ lang: 'en', nativeLang: 'en', mode: 'scene', variant: 'us' });
  assert.equal(en.objects[0].example, 'I drink tea from my favorite mug.');
});

test('word of the day (POST and GET) is translated for the variants and cached apart', async () => {
  const today = billing.utcDay();
  const post = async (body) => (await call('POST', '/word-of-day', { token: (await newDevice()).token, body: { days: 1, today, ...body } })).data.words[0];
  assert.match((await post({ lang: 'en', native: 'uk', variant: 'gb' })).example_translation, /\(en-gb→uk\)/);
  assert.match((await post({ lang: 'de', native: 'es', nativeVariant: 'latam' })).example_translation, /\(de→es-latam\)/);
  assert.match((await post({ lang: 'en', native: 'uk', variant: 'xx' })).example_translation, /\(en→uk\)/);
  // старий GET (і застосунок, у якого POST ще немає) теж знає варіанти
  const { token } = await newDevice();
  const get = await call('GET', `/word-of-day?days=1&lang=es&native=en&today=${today}&variant=latam&nativeVariant=gb`, { token });
  assert.equal(get.status, 200);
  assert.match(get.data.words[0].example_translation, /\(es-latam→en-gb\)/);
});

test('cache keys: the default variant keeps the old key, others get their own', () => {
  assert.equal(ai.wordCacheKey('mug', 'en', 'uk', null, { variant: 'us' }), 'v2|mug|en|uk');
  assert.equal(ai.wordCacheKey('mug', 'en', 'uk', null, { variant: 'gb' }), 'v2|mug|en-gb|uk');
  assert.equal(ai.wordCacheKey('mug', 'es', 'uk', null, { variant: 'es' }), 'v2|mug|es|uk');
  assert.equal(ai.wordCacheKey('mug', 'es', 'en', null, { variant: 'latam', nativeVariant: 'gb' }), 'v2|mug|es-latam|en-gb');
  assert.equal(ai.wordCacheKey('ledger', 'de', 'es', 'finance', { nativeVariant: 'latam' }), 'v3|finance|ledger|de|es-latam');
  // невідомий варіант — як без нього
  assert.equal(ai.wordCacheKey('mug', 'en', 'uk', null, { variant: 'constructor' }), 'v2|mug|en|uk');
  assert.equal(ai.wordCacheKey('mug', 'de', 'uk', null, { variant: 'us' }), 'v2|mug|de|uk');
});
