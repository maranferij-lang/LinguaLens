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
  assert.equal(requests.at(-1).body.max_tokens, 1000);
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
  assert.equal(requests.at(-1).body.max_tokens, 1200);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, ai.buildScanPrompt('en', 'uk', 8));
  await ai.recognize('BASE64', 'en', 'uk', 6);
  assert.equal(requests.at(-1).body.max_tokens, 1000);
  assert.equal(requests.at(-1).body.messages[0].content[1].text, base);
  await ai.recognize('BASE64', 'en', 'uk', 2);
  assert.equal(requests.at(-1).body.max_tokens, 1000);
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
  assert.equal(cached.example_translation, 'Чашка порожня.');
  assert.equal(cached.source, old);
});

test('a Ukrainian copula dash in an example disappears instead of turning into a comma', () => {
  const card = (example, example_translation, translation = 'чашка') =>
    ai.cleanWord({ word: 'die Tasse', ipa: '', translation, example, example_translation });
  for (const [from, to] of [
    ['Кава — мій улюблений напій.', 'Кава мій улюблений напій.'],
    ['Це — моя чашка.', 'Це моя чашка.'],
    ['Моя сестра – лікарка.', 'Моя сестра лікарка.'],
    ['Чашка - порожня.', 'Чашка порожня.'],
    // займенник після тире: тут потрібна пауза, тож кома
    ['Чашка — вона порожня.', 'Чашка, вона порожня.'],
    ['Чашка — Вона порожня.', 'Чашка, Вона порожня.'],
    // пряма мова й діалогове тире, як і раніше
    ['— Привіт, — сказав він.', 'Привіт, сказав він.'],
  ]) {
    assert.equal(card('Die Tasse ist leer.', from).example_translation, to, from);
    assert.equal(card(from, 'The cup is empty.').example, to, from);
  }
  // поза кирилицею і в слові чи перекладі тире, як і раніше, стає комою
  assert.equal(card('Die Tasse — sie ist leer.', 'x').example, 'Die Tasse, sie ist leer.');
  assert.equal(card('x', 'x', 'чашка — кружка').translation, 'чашка, кружка');
  // без тире текст не змінюється ані на символ
  assert.equal(card('x', 'Чашка порожня, а кава гаряча.').example_translation, 'Чашка порожня, а кава гаряча.');
});

// ---------- варіанти мов: яким різновидом писати ----------
test('variants name the exact variety in every prompt; without one the prompt is as before', () => {
  const cases = [
    ['en', 'us', ['American English', 'US spelling and vocabulary', 'General American']],
    ['en', 'gb', ['British English', 'UK spelling and vocabulary', 'RP (Received Pronunciation)']],
    ['es', 'es', ['Spanish from Spain', 'Castilian vocabulary', 'distinción', '/θ/']],
    ['es', 'latam', ['Latin American Spanish', 'Mexican and neutral Latin American vocabulary', 'seseo', 'never "vosotros"']],
  ];
  for (const [lang, variant, parts] of cases) {
    const prompts = [
      ai.buildScanPrompt(lang, 'uk', null, { variant }),
      ai.buildScanPrompt(lang, 'uk', 9, { variant }),
      ai.buildScenePrompt(lang, 'uk', null, { variant }),
      ai.buildTranslatePrompt('mug', lang, 'uk', { variant }),
      ai.buildTranslatePrompt('ledger', lang, 'uk', { topic: 'finance', variant }),
    ];
    for (const p of prompts) {
      for (const part of parts) assert.ok(p.includes(part), `${lang}-${variant}: ${part}`);
      assert.ok(p.includes(`The user is learning ${parts[0]}`) || p.includes(`Target language: ${parts[0]}.`), `${lang}-${variant}`);
    }
  }
  // мова перекладу — теж свій різновид, але без транскрипції
  const native = ai.buildScanPrompt('de', 'es', null, { nativeVariant: 'latam' });
  assert.ok(native.includes('their native language is Latin American Spanish'));
  assert.ok(native.includes('"translation":"<translation of the word into Latin American Spanish>"'));
  assert.ok(native.includes("The learner's native language is Latin American Spanish: use Mexican"));
  assert.ok(!native.includes('seseo'));
  const toGb = ai.buildTranslatePrompt('mug', 'de', 'en', { nativeVariant: 'gb' });
  assert.ok(toGb.includes("Learner's native language: British English.") && toGb.includes('UK spelling and vocabulary'));

  // без варіанта, з чужим чи вигаданим — рівно старі підказки
  for (const vars of [{}, { variant: 'gb' }, { variant: 'xx', nativeVariant: 'constructor' }, { variant: ['us'] }]) {
    assert.equal(ai.buildScanPrompt('de', 'uk', null, vars), ai.buildScanPrompt('de', 'uk'));
    assert.equal(ai.buildScenePrompt('de', 'uk', 2, vars), ai.buildScenePrompt('de', 'uk', 2));
    assert.equal(ai.buildTranslatePrompt('mug', 'de', 'uk', vars), ai.buildTranslatePrompt('mug', 'de', 'uk'));
  }
  assert.equal(ai.buildScanPrompt('en', 'uk', null, { variant: 'latam' }), ai.buildScanPrompt('en', 'uk'));
  assert.ok(!ai.buildScanPrompt('en', 'uk').includes('American'));

  // правило власника: і в підказках варіантів немає тире
  for (const [lang, variant] of cases) {
    for (const p of [
      ai.buildScanPrompt(lang, 'en', 9, { variant, nativeVariant: 'gb' }),
      ai.buildTranslatePrompt('mug', lang, 'es', { variant, nativeVariant: 'latam' }),
    ]) {
      assert.ok(!/[—―–]/.test(p), `${lang}-${variant}`);
    }
  }
});

test('a scan and a scene send the variant prompt to the model', async () => {
  reply = '{"word":"flat"}';
  await ai.recognize('BASE64', 'en', 'uk', null, { variant: 'gb' });
  assert.equal(requests.at(-1).body.messages[0].content[1].text, ai.buildScanPrompt('en', 'uk', null, { variant: 'gb' }));
  reply = '{"objects":[]}';
  await ai.recognizeScene('BASE64', 'es', 'en', 4, { variant: 'latam', nativeVariant: 'us' });
  assert.equal(
    requests.at(-1).body.messages[0].content[1].text,
    ai.buildScenePrompt('es', 'en', 4, { variant: 'latam', nativeVariant: 'us' })
  );
});

test('the word of the day for a variant: own cache entry; the default variant reuses words translated before variants', async () => {
  const term = 'flat-' + crypto.randomUUID().slice(0, 8);
  reply = JSON.stringify({ word: 'flat', ipa: '/flæt/', translation: 'квартира', example: 'Our flat is small.', example_translation: 'Наша квартира мала.' });
  const n = requests.length;
  const gb = await ai.translateWord(term, 'en', 'uk', { variant: 'gb' });
  assert.equal(requests.length, n + 1);
  assert.equal(requests.at(-1).body.messages[0].content[0].text, ai.buildTranslatePrompt(term, 'en', 'uk', { variant: 'gb' }));
  assert.equal((await store.get('wordCache', 'v2|' + term + '|en-gb|uk')).word, 'flat');
  assert.equal(gb.word, 'flat');

  // слово, перекладене до варіантів (ключ без варіанта), — для американської
  // англійської з кешу, без моделі
  const old = 'apartment-' + crypto.randomUUID().slice(0, 8);
  const before = { word: 'apartment', ipa: '', translation: 'квартира', example: 'x', example_translation: 'y', source: old };
  await store.put('wordCache', ai.wordCacheKey(old, 'en', 'uk'), before);
  const m = requests.length;
  assert.equal((await ai.translateWord(old, 'en', 'uk', { variant: 'us' })).word, 'apartment');
  assert.equal(requests.length, m);
  // а британська — свій переклад
  await ai.translateWord(old, 'en', 'uk', { variant: 'gb' });
  assert.equal(requests.length, m + 1);
});

// ---------- повтори й відмови (Anthropic) ----------
test('Anthropic: 529 (overloaded) is retried silently; a refusal is "no object" and is not asked twice', async () => {
  const stub = global.fetch;
  const steps = [];
  let n = 0;
  global.fetch = async (url, opts) => {
    if (String(url) !== 'https://api.anthropic.com/v1/messages') return stub(url, opts);
    n++;
    return steps.shift()();
  };
  const ok = (text, extra = {}) => () => new Response(JSON.stringify({ content: [{ type: 'text', text }], ...extra }), { status: 200 });
  const full = JSON.stringify({ word: 'mug', translation: 'кружка', example: 'x', box: [0, 0, 500, 500] });
  const rand = Math.random;
  Math.random = () => 0;
  try {
    steps.push(() => new Response('{"type":"error"}', { status: 529 }), ok(full));
    assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
    assert.equal(n, 2);

    // 400 — не повторюємо
    n = 0;
    steps.push(() => new Response('{"type":"error"}', { status: 400 }), ok(full));
    await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), /Anthropic 400/);
    assert.equal(n, 1);
    steps.length = 0;

    // відмова за політикою: stop_reason refusal без тексту
    n = 0;
    steps.push(() => new Response(JSON.stringify({ content: [], stop_reason: 'refusal' }), { status: 200 }), ok(full));
    assert.deepEqual(await ai.recognize('B64', 'en', 'uk'), { word: 'unknown' });
    assert.equal(n, 1);
    steps.length = 0;

    // не JSON — одне повторне запитання
    n = 0;
    steps.push(ok('Sorry, I cannot do that.'), ok(full));
    assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
    assert.equal(n, 2);
  } finally {
    Math.random = rand;
    global.fetch = stub;
  }
});
