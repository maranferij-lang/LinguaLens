// Виклики моделі через Gemini з підробленим fetch: тихі повтори при 429/5xx і
// збоях мережі (з паузою, джиттером і закритим тілом), що не повторюється,
// повторне запитання при нерозбірливій чи неповній відповіді, відмова за
// політикою безпеки (422 замість «спробуй ще раз»), неповний переклад слова
// дня не потрапляє в кеш, і слово дня, яке віддає лише готові слова під
// спільним дедлайном. Окремий процес, бо провайдер читається при завантаженні.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-airetry-'));
Object.assign(process.env, {
  PROVIDER: 'gemini',
  GEMINI_API_KEY: 'g-test-key',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: '',
  FREE_SCANS: '20',
  FREE_SCENES: '20',
  WOD_DEADLINE_MS: '1200',
});

const GEMINI = /^https:\/\/generativelanguage\.googleapis\.com\//;
const realFetch = global.fetch;
const realTimeout = AbortSignal.timeout;
const calls = [];
let script = [];
let cancelled = 0;

// Що відповісти на наступні виклики Gemini; останній крок повторюється.
global.fetch = async (url, opts) => {
  if (!GEMINI.test(String(url))) return realFetch(url, opts);
  const call = { body: JSON.parse(opts.body), signal: opts.signal, n: calls.length };
  calls.push(call);
  const step = script.length > 1 ? script.shift() : script[0];
  return step(opts, call);
};
after(() => {
  global.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
  fs.rmSync(dir, { recursive: true, force: true });
});

const reply = (obj) => () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: typeof obj === 'string' ? obj : JSON.stringify(obj) }] } }] }),
    { status: 200 }
  );
const raw = (obj) => () => new Response(JSON.stringify(obj), { status: 200 });
// Відмова провайдера; тіло — потік, щоб бачити, що відкинуту відповідь закрито.
const failing = (code, headers = {}) => () =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('{"error":{"message":"x"}}'));
        c.close();
      },
      cancel() {
        cancelled++;
      },
    }),
    { status: code, headers }
  );
const hang = (opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function reset(...steps) {
  calls.length = 0;
  cancelled = 0;
  script = steps;
}

// Без випадкової паузи між спробами: тести не чекають зайвого.
async function noJitter(fn) {
  const m = mock.method(Math, 'random', () => 0);
  try {
    return await fn();
  } finally {
    m.mock.restore();
  }
}

// Таймаут сигналу з розміром бюджету; сам сигнал — короткий, щоб тест не чекав.
async function shortTimeouts(ms, fn) {
  const asked = [];
  AbortSignal.timeout = (n) => {
    asked.push(n);
    return realTimeout.call(AbortSignal, ms);
  };
  try {
    return await fn(asked);
  } finally {
    AbortSignal.timeout = realTimeout;
  }
}

const BOX = [290, 350, 710, 740];
const MUG = { word: 'mug', ipa: '/mʌɡ/', translation: 'кружка', example: 'I drink tea.', example_translation: 'Я п’ю чай.', box: BOX };
const SCENE = { objects: [MUG, { ...MUG, word: 'lamp', translation: 'лампа', box: [90, 100, 440, 420] }] };

const ai = require('../ai');
const store = require('../store');
const { startServer } = require('./helpers/http');

// ---------- повтори ----------
test('a transient 429, 500, 502, 503, 504 or 529 is retried silently and the second try is used', async () => {
  for (const code of [429, 500, 502, 503, 504, 529]) {
    reset(failing(code), reply(MUG));
    const out = await noJitter(() => ai.recognize('B64', 'en', 'uk'));
    assert.equal(out.word, 'mug', String(code));
    assert.equal(calls.length, 2, String(code));
    assert.equal(cancelled, 1, 'відкинуту відповідь закрито ' + code);
  }
});

test('other client errors are not retried: a bad request fails at once', async () => {
  for (const code of [400, 401, 403, 404]) {
    reset(failing(code), reply(MUG));
    await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), new RegExp('Gemini ' + code));
    assert.equal(calls.length, 1, String(code));
  }
});

test('at most three attempts, then the last failure surfaces', async () => {
  reset(failing(429));
  await assert.rejects(() => noJitter(() => ai.recognize('B64', 'en', 'uk')), /Gemini 429/);
  assert.equal(calls.length, 3);
  assert.equal(cancelled, 2); // дві відкинуті; остання пішла в повідомлення про помилку
});

test('a network error is retried; a timeout or an abort is not', async () => {
  reset(() => {
    throw new TypeError('fetch failed');
  }, reply(MUG));
  assert.equal((await noJitter(() => ai.recognize('B64', 'en', 'uk'))).word, 'mug');
  assert.equal(calls.length, 2);

  for (const name of ['TimeoutError', 'AbortError']) {
    reset(() => {
      throw new DOMException('stop', name);
    }, reply(MUG));
    await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), { name });
    assert.equal(calls.length, 1, name);
  }
  // звичайна помилка (не мережа) теж не повторюється
  reset(() => {
    throw new Error('boom');
  }, reply(MUG));
  await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), /boom/);
  assert.equal(calls.length, 1);
});

test('Retry-After: a long one means no retry, a short one is waited for', async () => {
  reset(failing(429, { 'retry-after': '30' }), reply(MUG));
  await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), /Gemini 429/);
  assert.equal(calls.length, 1);

  reset(failing(429, { 'retry-after': '1' }), reply(MUG));
  const t0 = Date.now();
  assert.equal((await noJitter(() => ai.recognize('B64', 'en', 'uk'))).word, 'mug');
  assert.ok(Date.now() - t0 >= 950, 'пауза не менша за Retry-After');
  assert.equal(calls.length, 2);
});

test('a hanging call stays inside its budget and is never retried; a retry gets only what is left', async () => {
  reset(hang);
  await shortTimeouts(40, async (asked) => {
    await assert.rejects(() => ai.recognize('B64', 'en', 'uk'), { name: 'TimeoutError' });
    assert.equal(calls.length, 1);
    assert.ok(asked[0] > 20000 && asked[0] <= 21000, 'бюджет скану 21 с: ' + asked[0]);
  });

  reset(failing(429), hang);
  await shortTimeouts(40, async (asked) => {
    await assert.rejects(() => noJitter(() => ai.recognize('B64', 'en', 'uk')), { name: 'TimeoutError' });
    assert.equal(calls.length, 2);
    assert.ok(asked[1] <= asked[0], 'друга спроба — з решти бюджету');
  });
});

// ---------- нерозбірлива, неповна, заблокована відповідь ----------
test('an answer that is not JSON, or an empty body, is asked for once more', async () => {
  reset(reply('Sure! Here is your word.'), reply(MUG));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
  assert.equal(calls.length, 2);

  reset(() => new Response('', { status: 200 }), reply(MUG));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
  assert.equal(calls.length, 2);

  // двічі нерозбірливо — null, і не більше двох викликів
  reset(reply('nope'));
  assert.equal(await ai.recognize('B64', 'en', 'uk'), null);
  assert.equal(calls.length, 2);
});

test('an answer with a word but no translation is asked for once more; the better of two is returned', async () => {
  reset(reply({ word: 'mug', box: BOX }), reply(MUG));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).translation, 'кружка');
  assert.equal(calls.length, 2);

  // обидві неповні: віддаємо останню розібрану, фінальну перевірку робить сервер
  reset(reply({ word: 'mug', box: BOX }));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
  assert.equal(calls.length, 2);

  // мова навчання збігається з рідною: перекладу може не бути, питаємо раз
  reset(reply({ word: 'mug', box: BOX }));
  assert.equal((await ai.recognize('B64', 'en', 'en')).word, 'mug');
  assert.equal(calls.length, 1);

  // «предмета немає» — повна відповідь
  reset(reply({ word: 'unknown' }));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'unknown');
  assert.equal(calls.length, 1);

  // сцена: жоден предмет без перекладу — питаємо ще раз; є хоч один — досить
  reset(reply({ objects: [{ word: 'mug', box: BOX }] }), reply(SCENE));
  assert.equal((await ai.recognizeScene('B64', 'en', 'uk')).objects.length, 2);
  assert.equal(calls.length, 2);
  reset(reply({ objects: [{ word: 'lamp', box: [90, 100, 440, 420] }, MUG] }));
  await ai.recognizeScene('B64', 'en', 'uk');
  assert.equal(calls.length, 1);
  reset(reply({ objects: [] }));
  await ai.recognizeScene('B64', 'en', 'uk');
  assert.equal(calls.length, 1);
});

test('a safety block is "no object" at once, never asked again', async () => {
  const blocks = [
    raw({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }),
    raw({ promptFeedback: { blockReason: 'SAFETY' } }),
    raw({ promptFeedback: { blockReason: 'OTHER' } }),
    raw({ candidates: [{ finishReason: 'SAFETY' }] }),
    raw({ candidates: [{ finishReason: 'IMAGE_SAFETY' }] }),
    raw({ candidates: [{ finishReason: 'PROHIBITED_CONTENT', content: { parts: [{}] } }] }),
  ];
  for (const block of blocks) {
    reset(block, reply(MUG));
    assert.deepEqual(await ai.recognize('B64', 'en', 'uk'), { word: 'unknown' });
    assert.equal(calls.length, 1);
    reset(block, reply(SCENE));
    assert.deepEqual(ai.cleanScene(await ai.recognizeScene('B64', 'en', 'uk')), []);
    assert.equal(calls.length, 1);
  }
  // не відмова: пуста відповідь без причини — просто нерозбірливо, питаємо ще раз
  reset(raw({ candidates: [{ finishReason: 'OTHER' }] }), reply(MUG));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
  assert.equal(calls.length, 2);
  reset(raw({ promptFeedback: { blockReason: 'BLOCK_REASON_UNSPECIFIED' } }), reply(MUG));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
  assert.equal(calls.length, 2);
  // відповідь є, хай і з позначкою SAFETY: використовуємо
  reset(raw({ candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: JSON.stringify(MUG) }] } }] }));
  assert.equal((await ai.recognize('B64', 'en', 'uk')).word, 'mug');
});

// ---------- слово дня: кеш, неповна відповідь, дедлайн ----------
const GOOD = { word: 'die Tasse', ipa: '/diː ˈtasə/', translation: 'чашка', example: 'Die Tasse ist leer.', example_translation: 'Чашка порожня.' };
const termKey = (t) => ai.wordCacheKey(t, 'de', 'uk');

test('an incomplete translation is not cached; a good one later is stored and served', async () => {
  const term = 'incomplete-' + crypto.randomUUID().slice(0, 8);
  for (const bad of [{ word: 'x' }, { word: 'x', translation: 'ікс' }, { word: 'x', example: 'Ein X.' }, { translation: 'ікс', example: 'Ein X.' }]) {
    reset(reply(bad));
    await assert.rejects(() => ai.translateWord(term, 'de', 'uk'), /bad translation/);
    assert.equal(await store.get('wordCache', termKey(term)), null);
    assert.equal(calls.length, 2, 'питали двічі: повторне запитання при неповній відповіді');
  }
  reset(reply(GOOD));
  const out = await ai.translateWord(term, 'de', 'uk');
  assert.equal(out.translation, 'чашка');
  assert.equal((await store.get('wordCache', termKey(term))).translation, 'чашка');
  // повтор — з кешу, без моделі
  const n = calls.length;
  assert.equal((await ai.translateWord(term, 'de', 'uk')).word, 'die Tasse');
  assert.equal(calls.length, n);
});

test('a poisoned cache entry is ignored and healed by the next good answer', async () => {
  const term = 'poison-' + crypto.randomUUID().slice(0, 8);
  await store.put('wordCache', termKey(term), { word: 'x', ipa: '', translation: '', example: '', example_translation: '', source: term });
  reset(reply(GOOD));
  const out = await ai.translateWord(term, 'de', 'uk');
  assert.equal(calls.length, 1);
  assert.equal(out.translation, 'чашка');
  const stored = await store.get('wordCache', termKey(term));
  assert.equal(stored.translation, 'чашка');
  assert.equal(stored.example, 'Die Tasse ist leer.');
  // ipa і переклад прикладу можуть бути порожні: запис однаково повний
  const lean = 'lean-' + crypto.randomUUID().slice(0, 8);
  await store.put('wordCache', termKey(lean), { word: 'die Tasse', ipa: '', translation: 'чашка', example: 'Die Tasse.', example_translation: '', source: lean });
  const n = calls.length;
  assert.equal((await ai.translateWord(lean, 'de', 'uk')).word, 'die Tasse');
  assert.equal(calls.length, n);
});

test('concurrent requests for the same uncached word make one model call; a failure is not remembered', async () => {
  const term = 'shared-' + crypto.randomUUID().slice(0, 8);
  reset(async () => {
    await sleep(40);
    return reply(GOOD)();
  });
  const [a, b, c] = await Promise.all([ai.translateWord(term, 'de', 'uk'), ai.translateWord(term, 'de', 'uk'), ai.translateWord(term, 'de', 'uk')]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  assert.notEqual(a, b); // кожному своя копія
  a.translation = 'змінено';
  assert.equal(b.translation, 'чашка');

  const bad = 'failing-' + crypto.randomUUID().slice(0, 8);
  reset(async () => {
    await sleep(20);
    return failing(400)();
  });
  const settled = await Promise.allSettled([ai.translateWord(bad, 'de', 'uk'), ai.translateWord(bad, 'de', 'uk')]);
  assert.deepEqual(settled.map((s) => s.status), ['rejected', 'rejected']);
  assert.equal(calls.length, 1);
  // невдачу не запам'ятали: наступний запит іде в модель знову й вдається
  reset(reply(GOOD));
  assert.equal((await ai.translateWord(bad, 'de', 'uk')).translation, 'чашка');
  assert.equal(calls.length, 1);
});

test('translateWord respects a deadline: no model call without time, and the call gets only the time left', async () => {
  const late = 'late-' + crypto.randomUUID().slice(0, 8);
  reset(reply(GOOD));
  await assert.rejects(() => ai.translateWord(late, 'de', 'uk', { deadline: Date.now() + 100 }), /немає часу/);
  await assert.rejects(() => ai.translateWord(late, 'de', 'uk', { deadline: Date.now() - 5000 }), /немає часу/);
  assert.equal(calls.length, 0);

  await shortTimeouts(40, async (asked) => {
    reset(hang);
    await assert.rejects(() => ai.translateWord(late, 'de', 'uk', { deadline: Date.now() + 6000 }), { name: 'TimeoutError' });
    assert.ok(asked[0] > 4000 && asked[0] <= 6000, 'решта часу, а не 40 с: ' + asked[0]);
  });
});

// ---------- чистка полів ----------
test('clean(): objects and arrays are empty, control characters go, a cut emoji leaves no lone half', () => {
  for (const v of [{ a: 1 }, ['x', 'y'], null, undefined, true, NaN, Infinity, () => 1]) assert.equal(ai.clean(v, 50), '', String(v));
  assert.equal(ai.clean(123, 50), '123');
  assert.equal(ai.clean('  a\nb\t\u0000c  ', 50), 'a b c');
  const cut = ai.clean('a'.repeat(59) + '😀', 60);
  assert.equal(cut, 'a'.repeat(59));
  assert.ok(!/[\uD800-\uDBFF]$/.test(cut));
  assert.equal(ai.clean('a'.repeat(58) + '😀', 60), 'a'.repeat(58) + '😀'); // влізло ціле
  assert.equal(ai.clean('ab cd', 3), 'ab');

  assert.deepEqual(ai.cleanWord({ word: { a: 1 }, translation: ['x', 'y'], example: 123, ipa: '[mʌɡ]' }), {
    word: '',
    ipa: '[mʌɡ]',
    translation: '',
    example: '123',
    example_translation: '',
  });
  // предмет сцени з «словом»-об'єктом викинуто
  assert.deepEqual(ai.cleanScene({ objects: [{ word: { a: 1 }, box: BOX }, MUG] }).map((o) => o.word), ['mug']);
});

// ---------- через HTTP: скан ----------
let srv;
let call;
let newDevice;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
});
after(async () => {
  await srv.close();
});

const SCAN = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };
const scans = async (token) => (await call('GET', '/me', { token })).data.usage.scans;

test('a scan the model answered without a translation is 502 and costs nothing', async () => {
  const { token } = await newDevice();
  reset(reply({ word: 'mug', box: BOX }));
  const r = await call('POST', '/scan', { token, body: SCAN });
  assert.equal(r.status, 502);
  assert.match(r.data.error, /нерозбірливу/);
  assert.equal(await scans(token), 0);
  assert.equal(calls.length, 2, 'одне повторне запитання');

  // слово без слова, слово-об'єкт: так само
  for (const bad of [{ word: { a: 1 }, translation: 'x', box: BOX }, { word: 'mug', translation: ['x'], box: BOX }]) {
    reset(reply(bad));
    assert.equal((await call('POST', '/scan', { token, body: SCAN })).status, 502);
  }
  assert.equal(await scans(token), 0);

  // повна відповідь — 200 і один скан
  reset(reply(MUG));
  const ok = await call('POST', '/scan', { token, body: SCAN });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.translation, 'кружка');
  assert.equal(await scans(token), 1);

  // мова навчання збігається з рідною: без перекладу можна
  reset(reply({ word: 'mug', ipa: '', box: BOX }));
  assert.equal((await call('POST', '/scan', { token, body: { ...SCAN, nativeLang: 'en' } })).status, 200);
});

test('a scene keeps only objects with a translation; none left is 502 and costs nothing', async () => {
  const { token } = await newDevice();
  reset(reply({ objects: [{ word: 'mug', box: BOX }, { word: 'lamp', box: [90, 100, 440, 420] }] }));
  const none = await call('POST', '/scan', { token, body: { ...SCAN, mode: 'scene' } });
  assert.equal(none.status, 502);
  assert.equal(await scans(token), 0);

  reset(reply({ objects: [{ word: 'mug', box: BOX }, { ...MUG, word: 'lamp', translation: 'лампа', box: [90, 100, 440, 420] }] }));
  const some = await call('POST', '/scan', { token, body: { ...SCAN, mode: 'scene' } });
  assert.equal(some.status, 200);
  assert.deepEqual(some.data.objects.map((o) => o.word), ['lamp']);
  assert.equal(some.data.usage.scans, 1);
});

test('a safety-blocked photo is 422 "no object", the free scan is kept, and nothing is asked twice', async () => {
  const { token } = await newDevice();
  for (const mode of [undefined, 'scene']) {
    reset(raw({ promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }));
    const r = await call('POST', '/scan', { token, body: { ...SCAN, mode } });
    assert.equal(r.status, 422, String(mode));
    assert.match(r.data.error, /об'єкта/);
    assert.equal(calls.length, 1);
  }
  assert.equal(await scans(token), 0);
});

test('a provider that answers 429 once does not fail the scan', async () => {
  const { token } = await newDevice();
  reset(failing(429), reply(MUG));
  const r = await noJitter(() => call('POST', '/scan', { token, body: SCAN }));
  assert.equal(r.status, 200);
  assert.equal(calls.length, 2);
  assert.equal(await scans(token), 1);
  // постійна відмова — 502 і скан повернено
  reset(failing(503));
  const down = await noJitter(() => call('POST', '/scan', { token, body: SCAN }));
  assert.equal(down.status, 502);
  assert.equal(calls.length, 3);
  assert.equal(await scans(token), 1);
});

test('a hanging provider is 504 and the scan is given back', async () => {
  const { token } = await newDevice();
  reset(hang);
  const r = await shortTimeouts(60, () => call('POST', '/scan', { token, body: SCAN }));
  assert.equal(r.status, 504);
  assert.equal(await scans(token), 0);
});

test('image shapes: a data URL prefix and line breaks are accepted; anything not base64 is 400 before a slot is taken', async () => {
  const { token } = await newDevice();
  for (const image of ['data:image/jpeg;base64,aGk=', 'aGVs\nbG8=', ' aGk= ', 'AAAA']) {
    reset(reply(MUG));
    const r = await call('POST', '/scan', { token, body: { ...SCAN, image } });
    assert.equal(r.status, 200, JSON.stringify(image));
    const sent = calls.at(-1).body.contents[0].parts[0].inline_data.data;
    assert.ok(/^[A-Za-z0-9+/]+={0,2}$/.test(sent), 'до моделі йде чистий base64: ' + sent);
  }
  const before = await scans(token);
  for (const image of ['', 'not base64!', 'data:text/plain;base64,aGk=', '***', 'aGk=aGk=aGk=aGk=aGk=!', 123, null, ['aGk='], { a: 1 }]) {
    reset(reply(MUG));
    const r = await call('POST', '/scan', { token, body: { ...SCAN, image } });
    assert.equal(r.status, 400, JSON.stringify(image));
    assert.equal(calls.length, 0, 'модель не викликали');
  }
  assert.equal(await scans(token), before);
});

// ---------- слово дня через HTTP ----------
// Пара мов, якої ще не було: кеш слів (а з емулятором Firestore він живе між
// запусками) пам'ятає переклади, і лічильники викликів моделі розійшлись би.
function freshPair() {
  const codes = Object.keys(ai.LANG_NAMES).filter((c) => c !== 'en' && c !== 'es');
  const pick = () => codes[crypto.randomInt(codes.length)];
  const lang = pick();
  let native = pick();
  while (native === lang) native = pick();
  return { lang, native };
}
const wod = (token, extra = {}) => call('POST', '/word-of-day', { token, body: { days: 14, ...extra } });
const wordAnswer = (opts, call) => {
  const prompt = call.body.contents[0].parts[0].text;
  const en = prompt.match(/English concept "([^"]+)"/)[1];
  return reply({ word: 'le ' + en, ipa: '', translation: en + ' (uk)', example: 'Voici le ' + en + '.', example_translation: 'Це ' + en + '.' })();
};

test('word of the day: failed words are left out, never sent blank, and the answer says partial', async () => {
  const { token } = await newDevice();
  const pair = freshPair();
  reset((opts, c) => (c.n % 7 === 3 ? failing(400)() : wordAnswer(opts, c)));
  const r = await wod(token, pair);
  assert.equal(r.status, 200);
  assert.equal(r.data.partial, true);
  assert.equal(r.data.words.length, 12);
  for (const w of r.data.words) {
    assert.notEqual(w.translation, '');
    assert.notEqual(w.example, '');
    assert.notEqual(w.word, w.source);
  }
  // ті, що вдались, лежать у кеші: повтор не ходить у модель за ними
  const before = calls.length;
  reset(wordAnswer);
  const again = await wod(token, pair);
  assert.equal(again.status, 200);
  assert.equal(again.data.partial, undefined);
  assert.equal(again.data.words.length, 14);
  assert.equal(calls.length, 2, 'лише два слова, що не вийшли, а не 14');
  assert.ok(before > 0);
});

// Англійське поняття, яке сервер перекладає «на сьогодні» для цього пристрою:
// пробний запит на іншій новій парі мов, де все вдається. Валити треба саме
// його, а не «виклик моделі №0»: з емулятором Firestore пошук у кеші слів має
// різну затримку, і першим до моделі може дійти будь-який із 8 паралельних днів.
const conceptOf = (c) => c.body.contents[0].parts[0].text.match(/English concept "([^"]+)"/)[1];
async function todayConcept(ask) {
  reset(wordAnswer);
  const r = await ask(freshPair());
  assert.equal(r.status, 200);
  return r.data.words[0].source;
}
const failToday = (today) => (opts, c) => (conceptOf(c) === today ? failing(400)() : wordAnswer(opts, c));

test('word of the day: when today fails it is 503 AI_BUSY with Retry-After, whatever else worked', async () => {
  const { token } = await newDevice();
  const post = (p) => wod(token, p);
  reset(failToday(await todayConcept(post)));
  const r = await post(freshPair());
  assert.equal(r.status, 503);
  assert.deepEqual(r.data, { error: 'AI_BUSY' });
  assert.equal(r.headers.get('retry-after'), '5');
  // GET (старі версії) — так само
  const get = (p) => call('GET', `/word-of-day?days=7&lang=${p.lang}&native=${p.native}`, { token });
  reset(failToday(await todayConcept(get)));
  const g = await get(freshPair());
  assert.equal(g.status, 503);
  assert.equal(g.headers.get('retry-after'), '5');
});

test('word of the day: a Gemini that hangs ends at the shared deadline with 503, not after minutes', async () => {
  const { token } = await newDevice();
  reset(hang);
  const t0 = Date.now();
  const r = await wod(token, { ...freshPair(), days: 14 });
  const took = Date.now() - t0;
  assert.equal(r.status, 503);
  assert.ok(took < 3000, 'дедлайн 1,2 с, пішло ' + took + ' мс');
  assert.equal(calls.length, 8, 'після дедлайну нових викликів немає');
});

test('word of the day: words that came before the deadline are returned as a partial answer', async () => {
  const { token } = await newDevice();
  reset((opts, c) => (c.n < 10 ? wordAnswer(opts, c) : hang(opts)));
  const t0 = Date.now();
  const r = await wod(token, { ...freshPair(), days: 14 });
  assert.equal(r.status, 200);
  assert.equal(r.data.partial, true);
  assert.equal(r.data.words.length, 10);
  assert.ok(Date.now() - t0 < 3000);
});
