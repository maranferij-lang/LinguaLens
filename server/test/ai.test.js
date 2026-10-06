// Що саме сервер просить у моделі: окремий процес із PROVIDER=anthropic і
// підробленим fetch — справжній ключ і мережа не потрібні.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-ai-'));
Object.assign(process.env, {
  PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DATA_FILE: path.join(dir, 'data.json'),
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const realFetch = global.fetch;
const requests = [];
let reply = '{"word":"mug"}';
global.fetch = async (url, opts) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') return realFetch(url, opts);
  requests.push({ body: JSON.parse(opts.body), signal: opts.signal });
  return new Response(JSON.stringify({ content: [{ type: 'text', text: reply }] }), { status: 200 });
};
after(() => {
  global.fetch = realFetch;
});

const ai = require('../ai');

test('a scene asks Anthropic for a long answer; a single scan keeps the short limit', async () => {
  reply = '```json\n{"objects":[{"word":"mug","box":[1,2,300,400]}]}\n```';
  const scene = await ai.recognizeScene('BASE64', 'de', 'uk');
  assert.deepEqual(scene, { objects: [{ word: 'mug', box: [1, 2, 300, 400] }] });
  const sent = requests.at(-1).body;
  assert.equal(sent.max_tokens, 3500);
  const [image, text] = sent.messages[0].content;
  assert.deepEqual(image, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64' } });
  assert.equal(text.text, ai.buildScenePrompt('de', 'uk'));

  reply = '{"word":"mug"}';
  await ai.recognize('BASE64', 'en', 'uk');
  assert.equal(requests.at(-1).body.max_tokens, 600);
});

test('the scene prompt carries the selection rules', () => {
  const p = ai.buildScenePrompt('de', 'uk');
  for (const rule of [
    'up to 8 distinct',
    'German',
    'Ukrainian',
    'Include the definite article, e.g. "die Tasse"',
    'one entry per kind',
    'Order the list by prominence',
    'Never include people, faces, body parts, clothing worn by a person, text, signs, logos or brand names',
    'smaller than about 2% of the image',
    'wall, floor, ceiling',
    '12 to 24 points',
    'clockwise',
    'WHOLE image',
    '{"objects":[]}',
  ]) {
    assert.ok(p.includes(rule), rule);
  }
});

test('cleanScene: unreadable vs empty vs objects', () => {
  assert.equal(ai.cleanScene(null), null);
  assert.equal(ai.cleanScene('text'), null);
  assert.equal(ai.cleanScene({ objects: 'x' }), null);
  assert.equal(ai.cleanScene({ word: 'mug' }), null);
  assert.deepEqual(ai.cleanScene({ word: 'Unknown' }), []);
  assert.deepEqual(ai.cleanScene({ objects: [] }), []);
  // голий масив замість {"objects": …} — теж відповідь
  const bare = ai.cleanScene([{ word: 'mug', box: [0, 0, 500, 500], outline: [[1, 2]] }]);
  assert.deepEqual(bare, [
    { word: 'mug', ipa: '', translation: '', example: '', example_translation: '', box: [0, 0, 500, 500], outline: null },
  ]);
});

test('cleanScene keeps the model order, merges case-insensitive duplicates and caps at 8', () => {
  const box = (n) => [0, 0, 100 + n, 100 + n];
  const list = [
    { word: 'Book', box: box(0) },
    { word: 'lamp', box: box(50) },
    { word: 'book', box: box(10), translation: 'книжка' },
    { word: 'BOOK', box: box(5) },
    ...Array.from({ length: 12 }, (_, i) => ({ word: 'item' + i, box: box(i) })),
  ];
  const out = ai.cleanScene({ objects: list });
  assert.equal(out.length, ai.MAX_SCENE_OBJECTS);
  assert.deepEqual(out.slice(0, 3).map((o) => o.word), ['book', 'lamp', 'item0']);
  assert.equal(out[0].translation, 'книжка');
});

test('box and outline cleaning matches the single scan rules', () => {
  assert.equal(ai.cleanBox([0, 0, 40, 500]), null); // не вище за 4%
  assert.equal(ai.cleanBox([0, 0, 500]), null);
  assert.deepEqual(ai.cleanBox(['1', 2.4, 999.6, 5000]), [1, 2, 1000, 1000]);
  assert.equal(ai.cleanOutline(Array(5).fill([1, 1])), null);
  assert.equal(ai.cleanOutline(Array(41).fill([1, 1])), null);
  // точки з неправильною формою відкидаються; лишилось < 6 — контуру немає
  assert.equal(ai.cleanOutline([[1, 1], [2, 2], [3], 'x', [4, 4], [5, 5], [6, 6]]), null);
  assert.deepEqual(ai.cleanOutline(Array.from({ length: 6 }, (_, i) => [i, -i])), Array.from({ length: 6 }, (_, i) => [i, 0]));
});

// ---------- персоналізація: рівень у скані, тема в перекладі ----------
const crypto = require('crypto');
const store = require('../store');

test('scan prompt by level: none and 4–6 exactly as before, up to 3 short and simple, 7+ richer with phrases', async () => {
  const base = ai.buildScanPrompt('en', 'uk');
  assert.ok(base.includes('"example":"<one short natural English sentence using the word>"'));
  assert.ok(!base.includes('extras') && !base.includes('learner is'));
  for (const level of [null, undefined, 4, 5, 6, 0, 11, 7.5, '8']) assert.equal(ai.buildScanPrompt('en', 'uk', level), base, String(level));

  for (const level of [1, 2, 3]) {
    const easy = ai.buildScanPrompt('en', 'uk', level);
    assert.ok(easy.includes('"example":"<one very short, simple English sentence using the word: at most 8 words, present tense>"'));
    assert.ok(easy.includes('The learner is a beginner'));
    assert.ok(!easy.includes('extras'));
  }
  for (const level of [7, 8, 9, 10]) {
    const rich = ai.buildScanPrompt('de', 'uk', level);
    assert.ok(rich.includes('"example":"<one natural, richer German sentence using the word, the way a fluent speaker would say it>"'));
    assert.ok(rich.includes('"extras":[{"phrase":"<German phrase with the word>","translation":"<its translation into Ukrainian>"}],"box"'));
    assert.ok(rich.includes('"extras" are 2-3 useful German collocations, idioms or phrasal verbs'));
    assert.ok(rich.includes('Include the definite article, e.g. "die Tasse"'));
  }

  reply = '{"word":"mug"}';
  await ai.recognize('BASE64', 'en', 'uk', 8);
  assert.equal(requests.at(-1).body.max_tokens, 800);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, ai.buildScanPrompt('en', 'uk', 8));
  await ai.recognize('BASE64', 'en', 'uk', 6);
  assert.equal(requests.at(-1).body.max_tokens, 600);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, base);
  await ai.recognize('BASE64', 'en', 'uk', 2);
  assert.equal(requests.at(-1).body.max_tokens, 600);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, ai.buildScanPrompt('en', 'uk', 2));
});

test('scene prompt by level changes only the example and never asks for phrases', async () => {
  const base = ai.buildScenePrompt('de', 'uk');
  for (const level of [null, 4, 5, 6]) assert.equal(ai.buildScenePrompt('de', 'uk', level), base);
  for (let level = 1; level <= 10; level++) assert.ok(!ai.buildScenePrompt('de', 'uk', level).includes('extras'));
  assert.ok(ai.buildScenePrompt('de', 'uk', 3).includes('at most 8 words, present tense'));
  assert.ok(ai.buildScenePrompt('de', 'uk', 9).includes('natural, richer German sentence'));

  reply = '{"objects":[]}';
  await ai.recognizeScene('BASE64', 'de', 'uk', 9);
  assert.equal(requests.at(-1).body.max_tokens, 3500);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, ai.buildScenePrompt('de', 'uk', 9));
});

test('a topic word is translated with its topic, sense and a topic example, and cached under its own key', async () => {
  // свій термін на кожен прогін: емулятор Firestore пам'ятає кеш між запусками
  const term = 'ledger-' + crypto.randomUUID().slice(0, 8);
  const hint = 'accounting: book recording all financial accounts';
  reply = JSON.stringify({
    word: 'das Hauptbuch',
    ipa: '/ˈhaʊ̯ptˌbuːx/',
    translation: 'головна книга',
    example: 'Die Buchhalterin prüft das Hauptbuch.',
    example_translation: 'Бухгалтерка перевіряє головну книгу.',
  });
  const n = requests.length;
  const out = await ai.translateWord(term, 'de', 'uk', { topic: 'finance', hint });
  assert.equal(requests.length, n + 1);
  const prompt = requests.at(-1).body.messages[0].content[0].text;
  assert.equal(prompt, ai.buildTranslatePrompt(term, 'de', 'uk', { topic: 'finance', hint }));
  for (const part of [
    'Translate "' + term + '", an English term from finance and accounting, for a language learner.',
    'Meaning in this context: ' + hint + '.',
    'not word-for-word calques',
    'in a realistic situation from finance and accounting',
    'Include the definite article, e.g. "die Tasse"',
  ]) {
    assert.ok(prompt.includes(part), part);
  }
  assert.deepEqual(out, { ...JSON.parse(reply), source: term });
  const key = 'v3|finance|' + term + '|de|uk';
  assert.equal(ai.wordCacheKey(term, 'de', 'uk', 'finance'), key);
  assert.deepEqual({ ...(await store.get('wordCache', key)) }, out);

  // повтор — з кешу, без моделі
  assert.deepEqual({ ...(await ai.translateWord(term, 'de', 'uk', { topic: 'finance', hint })) }, out);
  assert.equal(requests.length, n + 1);

  // той самий термін без теми — інший запис, ключ і підказка як до персоналізації
  reply = JSON.stringify({ word: 'die Liste', ipa: '', translation: 'список', example: 'x', example_translation: 'y' });
  const general = await ai.translateWord(term, 'de', 'uk');
  assert.equal(requests.length, n + 2);
  assert.equal(general.word, 'die Liste');
  assert.equal(requests.at(-1).body.messages[0].content[0].text, ai.buildTranslatePrompt(term, 'de', 'uk'));
  assert.equal((await store.get('wordCache', 'v2|' + term + '|de|uk')).word, 'die Liste');
});

test('general words keep the old prompt and cache key; every topic has its own name in the prompt', () => {
  assert.equal(ai.wordCacheKey('mug', 'en', 'uk'), 'v2|mug|en|uk');
  assert.equal(ai.wordCacheKey('mug', 'en', 'uk', 'general'), 'v2|mug|en|uk');
  // невідома тема (чи ключ із прототипу) — як загальне слово
  for (const t of ['astronaut', '__proto__', 'constructor', 42, null]) assert.equal(ai.wordCacheKey('mug', 'en', 'uk', t), 'v2|mug|en|uk');
  assert.equal(ai.wordCacheKey('P/E ratio', 'en', 'uk', 'finance'), 'v3|finance|P_E_ratio|en|uk');
  assert.equal(ai.wordCacheKey('résumé', 'de', 'uk', 'workplace'), 'v3|workplace|r_sum_|de|uk');

  const plain = ai.buildTranslatePrompt('mug', 'de', 'uk');
  assert.ok(plain.startsWith('Translate the English concept "mug" for a language learner.\nTarget language: German.'));
  assert.ok(plain.includes('"example":"<one short natural German sentence using it>"'));
  assert.equal(ai.buildTranslatePrompt('mug', 'de', 'uk', { topic: 'general' }), plain);
  assert.equal(ai.buildTranslatePrompt('mug', 'de', 'uk', { topic: 'astronaut', hint: '' }), plain);
  // значення загального слова — один рядок, крапка не подвоюється
  const sense = ai.buildTranslatePrompt('drawer', 'en', 'uk', { hint: 'sliding box in a piece of furniture. ' });
  assert.ok(sense.includes('for a language learner.\nMeaning: sliding box in a piece of furniture.\nTarget language: English.'));

  for (const [topic, name] of Object.entries(ai.TOPIC_NAMES)) {
    const p = ai.buildTranslatePrompt('term', 'en', 'uk', { topic });
    assert.ok(p.includes('an English term from ' + name + ',') && p.includes('realistic situation from ' + name + '>'), topic);
    assert.ok(!p.includes('Meaning'));
  }
});

// ---------- правило власника: жодних довгих тире в тексті ----------
const LONG_DASH = /[\u2014\u2015]|(^|\s)[\u2012\u2013](\s|$)|\s-\s/;

test('every prompt tells the model not to use dashes and has none itself', () => {
  const prompts = [
    ai.buildScanPrompt('en', 'uk'),
    ai.buildScanPrompt('de', 'uk', 2),
    ai.buildScanPrompt('de', 'uk', 9),
    ai.buildScenePrompt('es', 'en'),
    ai.buildScenePrompt('es', 'en', 2),
    ai.buildTranslatePrompt('mug', 'de', 'uk'),
    ai.buildTranslatePrompt('ledger', 'de', 'uk', { topic: 'finance', hint: 'accounting book' }),
  ];
  for (const p of prompts) {
    assert.ok(p.includes('Never use an em dash or an en dash as punctuation'), p.slice(0, 60));
    // модель повторює стиль запиту: у самій підказці тире теж немає
    assert.ok(!/[\u2014\u2015\u2013]/.test(p), p.slice(0, 60));
  }
});

test('undash turns a dash into a comma and leaves everything else alone', () => {
  for (const [from, to] of [
    ['I love it — really.', 'I love it, really.'],
    ['I love it—really.', 'I love it, really.'],
    ['Ich mag es – wirklich.', 'Ich mag es, wirklich.'],
    ['mug - чашка', 'mug, чашка'],
    ['— Hola — dijo Ana.', 'Hola, dijo Ana.'],
    ['«Привіт, — сказав він.»', '«Привіт, сказав він.»'],
    ['It is done —.', 'It is done.'],
    ['Hola, — ¿qué tal?', 'Hola, ¿qué tal?'],
    ['A note (— really) here', 'A note (really) here'],
    ['– Ja', 'Ja'],
    ['Nein –', 'Nein'],
  ]) {
    assert.equal(ai.undash(from), to, from);
  }
  // дефіс у слові, діапазони, мінус і текст без тире — без змін
  for (const same of ['Read pages 1–2 of the T-shirt guide.', 'A1–C2', 'It is -5 °C, isn’t it?', '„Hallo“, sagte er.', 'Wait, what?']) {
    assert.equal(ai.undash(same), same);
  }
});

test('model text with dashes reaches the app without them: scan, scene, phrases, word of the day', async () => {
  const dashed = {
    word: 'die Tasse',
    ipa: '/diː ˈtasə/',
    translation: 'чашка — кружка',
    example: 'Die Tasse — sie ist leer.',
    example_translation: 'Чашка — вона порожня.',
    box: [0, 0, 500, 500],
  };
  assert.deepEqual(ai.cleanWord(dashed), {
    word: 'die Tasse',
    ipa: '/diː ˈtasə/',
    translation: 'чашка, кружка',
    example: 'Die Tasse, sie ist leer.',
    example_translation: 'Чашка, вона порожня.',
  });
  const [obj] = ai.cleanScene({ objects: [dashed] });
  for (const k of ['word', 'translation', 'example', 'example_translation']) assert.ok(!LONG_DASH.test(obj[k]), k);
  assert.deepEqual(ai.cleanExtras([{ phrase: 'eine Tasse Tee — bitte', translation: 'чашка чаю — будь ласка' }], 'die Tasse'), [
    { phrase: 'eine Tasse Tee, bitte', translation: 'чашка чаю, будь ласка' },
  ]);

  // слово дня: і свіжий переклад, і старий запис кешу (до правила)
  const term = 'cup-' + crypto.randomUUID().slice(0, 8);
  reply = JSON.stringify(dashed);
  const fresh = await ai.translateWord(term, 'de', 'uk');
  for (const k of ['translation', 'example', 'example_translation']) assert.ok(!LONG_DASH.test(fresh[k]), k);
  const old = 'old-' + crypto.randomUUID().slice(0, 8);
  const stale = { word: 'die Tasse', ipa: '', translation: 'чашка', example: 'Die Tasse — leer.', example_translation: 'Чашка — порожня.', source: old };
  await store.put('wordCache', ai.wordCacheKey(old, 'de', 'uk'), stale);
  const n = requests.length;
  const cached = await ai.translateWord(old, 'de', 'uk');
  assert.equal(requests.length, n); // з кешу, без моделі
  assert.equal(cached.example, 'Die Tasse, leer.');
  assert.equal(cached.example_translation, 'Чашка, порожня.');
  assert.equal(cached.source, old);
});
