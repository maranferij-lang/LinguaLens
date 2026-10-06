// Персоналізація через справжній HTTP: POST /word-of-day (профіль, «Знаю»,
// чистка запиту), незмінний GET для старих версій застосунку, POST
// /me/profile і скан під рівень (вирази від 7/10). AI у режимі mock.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-personal-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  FREE_SCANS: '100',
  REVENUECAT_SECRET_KEY: '',
});
const { startServer, nextIp } = require('./helpers/http');
const ai = require('../ai');
const billing = require('../billing');
const store = require('../store');
const words = require('../words');
const wordplan = require('../wordplan');
const lexicon = require('../lexicon');
const profile = require('../profile');

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

const TODAY = () => billing.utcDay();
const WORD_KEYS = ['date', 'word', 'ipa', 'translation', 'example', 'example_translation', 'source', 'topic'];
// POST (v1.3) додає slot — котре це слово дня: 0 для всіх, 1… лише в Pro
const POST_KEYS = ['date', 'slot', ...WORD_KEYS.slice(1)];
const FINANCE = { goals: ['work'], field: 'finance', level: 8 };

function wod(token, body, opts = {}) {
  return call('POST', '/word-of-day', { token, body: { days: 14, lang: 'en', native: 'uk', today: TODAY(), ...body }, ...opts });
}

async function seedOf(userId) {
  return (await store.get('users', userId)).seed;
}

test('POST /word-of-day: 14 personal days in the shape the app expects', async () => {
  const { token, user } = await newDevice();
  const today = TODAY();
  const r = await wod(token, { profile: { ...FINANCE, since: today }, known: [] });
  assert.equal(r.status, 200);
  assert.equal(r.data.words.length, 14);
  r.data.words.forEach((w, i) => {
    assert.deepEqual(Object.keys(w), POST_KEYS);
    assert.equal(w.date, billing.addDays(today, i));
    assert.equal(w.word, w.source); // mock перекладає «як є»
    // слово справді з теми й рівня 8/10 (2 чи 3, ніколи 1)
    const entry = lexicon.lexicon.topics.get(w.topic).words.find((x) => x.en === w.source);
    assert.ok(entry, w.source);
    assert.ok([2, 3].includes(entry.level), `${w.source}: рівень ${entry.level}`);
  });
  const cycle = ['finance', 'workplace', 'finance', 'general', 'finance', 'workplace', 'finance'];
  assert.deepEqual(r.data.words.map((w) => w.topic), [...cycle, ...cycle]);

  // розклад — від seed пристрою, той самий, що й у wordplan напряму
  const expected = wordplan.schedule({
    seed: await seedOf(user.id),
    profile: profile.forSchedule({ ...FINANCE, since: today }, today),
    known: new Set(),
    today,
    days: 14,
  });
  assert.deepEqual(r.data.words.map((w) => w.source), expected.map((w) => w.en));

  // той самий запит — ті самі слова; інший пристрій — свій порядок
  const again = await wod(token, { profile: { ...FINANCE, since: today } });
  assert.deepEqual(again.data.words, r.data.words);
  const other = await newDevice();
  const theirs = await wod(other.token, { profile: { ...FINANCE, since: today } });
  assert.notDeepEqual(theirs.data.words.map((w) => w.source), r.data.words.map((w) => w.source));
});

test('POST /word-of-day without a profile: general words only, «Знаю» still works', async () => {
  const { token } = await newDevice();
  const r = await wod(token, {});
  assert.equal(r.status, 200);
  assert.ok(r.data.words.every((w) => w.topic === 'general'));
  const skip = await wod(token, { known: [r.data.words[0].source] });
  assert.notEqual(skip.data.words[0].source, r.data.words[0].source);
  assert.ok(!skip.data.words.some((w) => w.source === r.data.words[0].source));
});

test('«Знаю» replaces today with the next word of the same topic and never shows it again', async () => {
  const { token } = await newDevice();
  const p = { goals: ['work'], field: 'it', level: 5, since: TODAY() };
  const first = (await wod(token, { profile: p })).data.words;
  const next = first.slice(1).find((w) => w.topic === first[0].topic);
  const second = (await wod(token, { profile: p, known: [first[0].source] })).data.words;
  assert.equal(second[0].source, next.source);
  assert.equal(second[0].topic, first[0].topic);
  assert.ok(!second.some((w) => w.source === first[0].source));
});

test('since: a future date counts as today, a past one moves progress forward', async () => {
  const { token } = await newDevice();
  const today = TODAY();
  const p = { goals: ['study'], field: 'law', level: 6 };
  const fresh = (await wod(token, { profile: { ...p, since: today } })).data.words;
  const future = (await wod(token, { profile: { ...p, since: billing.addDays(today, 5) } })).data.words;
  assert.deepEqual(future, fresh);
  const broken = (await wod(token, { profile: { ...p, since: '2026-02-31' } })).data.words;
  assert.deepEqual(broken, fresh);
  const twoDaysIn = (await wod(token, { profile: { ...p, since: billing.addDays(today, -2) } })).data.words;
  assert.deepEqual(twoDaysIn.slice(0, 12).map((w) => w.source), fresh.slice(2).map((w) => w.source));
});

test('POST /word-of-day sanitises everything it is given', async () => {
  // кожна перевірка — з нового пристрою: їх більше, ніж ліміт одного на хвилину
  const fresh = async (body) => wod((await newDevice()).token, body);
  const len = async (days) => (await fresh({ days })).data.words.length;
  assert.equal(await len(0), 1);
  assert.equal(await len(-3), 1);
  assert.equal(await len(99), 14);
  assert.equal(await len(3.9), 3);
  assert.equal(await len('5'), 5);
  assert.equal(await len('abc'), 7);
  assert.equal(await len(null), 7);
  assert.equal((await call('POST', '/word-of-day', { token: (await newDevice()).token, body: {} })).data.words.length, 7);

  // невідома мова (і та, що знайшлася б у прототипі) — англійська й українська
  const odd = await fresh({ days: 1, lang: 'constructor', native: '__proto__' });
  assert.equal(odd.status, 200);
  assert.match(odd.data.words[0].example_translation, /\(en→uk\)/);
  const de = await fresh({ days: 1, lang: 'de', native: 'en' });
  assert.match(de.data.words[0].example_translation, /\(de→en\)/);
  // правило власника: у тексті слова дня немає довгих тире (і в заглушці теж)
  for (const w of [...odd.data.words, ...de.data.words]) {
    for (const k of ['word', 'translation', 'example', 'example_translation']) assert.doesNotMatch(w[k], /[—―]|\s[–-]\s/, k);
  }

  // зіпсований профіль — загальні слова; хибна дата «сьогодні» — серверна
  for (const bad of ['work', 42, [], { goals: ['fly'] }, { goals: 'work', field: 'finance' }]) {
    const r = await fresh({ days: 3, profile: bad });
    assert.equal(r.status, 200);
    assert.ok(r.data.words.every((w) => w.topic === 'general'), JSON.stringify(bad));
  }
  const old = await fresh({ days: 1, today: '1999-01-01' });
  assert.equal(old.data.words[0].date, TODAY());
  // «Знаю» будь-якої форми не ламає запит
  for (const known of ['ledger', 42, { a: 1 }, [null, 5, 'x'.repeat(500)], Array(600).fill('term')]) {
    assert.equal((await fresh({ days: 1, known })).status, 200);
  }
});

test('POST /word-of-day refuses bodies it cannot read', async () => {
  const { token } = await newDevice();
  assert.equal((await call('POST', '/word-of-day', { token, body: '{oops' })).status, 400);
  assert.equal((await call('POST', '/word-of-day', { token, body: [1, 2] })).status, 400);
  assert.equal((await call('POST', '/word-of-day', { token, body: 'null' })).status, 400);
  assert.equal((await call('POST', '/word-of-day', { body: {} })).status, 401);
  const huge = await call('POST', '/word-of-day', { token, body: { known: Array(3000).fill('x'.repeat(40)) } }).catch(() => ({ status: 413 }));
  assert.equal(huge.status, 413);
});

test('legacy GET /word-of-day is unchanged: the v1 list, the v1 order, no topic', async () => {
  const { token, user } = await newDevice();
  const today = TODAY();
  const r = await call('GET', `/word-of-day?days=7&lang=en&native=uk&today=${today}`, { token });
  assert.equal(r.status, 200);
  const list = words.shuffledFor(await seedOf(user.id));
  r.data.words.forEach((w, i) => {
    assert.deepEqual(Object.keys(w), WORD_KEYS.filter((k) => k !== 'topic'));
    assert.equal(w.date, billing.addDays(today, i));
    assert.equal(w.source, words.wordFor(list, billing.dayIndexOf(today) + i));
  });
  // без days — 7, як і було
  assert.equal((await call('GET', `/word-of-day?today=${today}`, { token })).data.words.length, 7);
});

test('POST /word-of-day is rate limited per IP and per device', async () => {
  const ip = nextIp();
  let last;
  for (let i = 0; i < 21; i++) {
    const { token } = await newDevice();
    last = await wod(token, { days: 1 }, { ip });
  }
  assert.equal(last.status, 429);
  // GET і POST ділять ліміт IP
  const { token } = await newDevice();
  assert.equal((await call('GET', '/word-of-day?days=1', { token, ip })).status, 429);

  const statuses = [];
  for (let i = 0; i < 21; i++) statuses.push((await wod(token, { days: 1 })).status);
  assert.deepEqual(statuses, [...Array(20).fill(200), 429]);
});

test('POST /me/profile keeps only the sanitised answers on the device record', async () => {
  const { token, user } = await newDevice();
  const r = await call('POST', '/me/profile', {
    token,
    body: { goals: ['work', 'fly', 'work'], field: 'finance', level: 8.4, heardFrom: 'tiktok', name: 'Марко', email: 'a@b.c' },
  });
  assert.equal(r.status, 200);
  assert.deepEqual(r.data, { ok: true });
  const saved = (await store.get('users', user.id)).profile;
  assert.deepEqual(saved, { goals: ['work'], field: 'finance', level: 8, heardFrom: 'tiktok' });

  // редактор у Параметрах — без «звідки дізнались»: відповідь лишається
  await call('POST', '/me/profile', { token, body: { goals: ['study', 'self'], field: 'other', level: 3 } });
  assert.deepEqual((await store.get('users', user.id)).profile, {
    goals: ['study', 'self'],
    field: 'other',
    level: 3,
    heardFrom: 'tiktok',
  });
  // пропущені кроки онбордингу — порожні відповіді, а не помилка
  await call('POST', '/me/profile', { token, body: { goals: [], field: null, level: null, heardFrom: 'astrology' } });
  assert.deepEqual((await store.get('users', user.id)).profile, { goals: [], field: null, level: null, heardFrom: null });

  // профіль не потрапляє назовні
  const me = await call('GET', '/me', { token });
  assert.equal(me.status, 200);
  assert.ok(!JSON.stringify(me.data).includes('profile'));

  // «Стерти всі мої дані» стирає й профіль
  assert.equal((await call('DELETE', '/me', { token })).status, 200);
  assert.equal(await store.get('users', user.id), null);
  assert.equal((await call('POST', '/me/profile', { token, body: { goals: ['work'] } })).status, 401);
});

test('POST /me/profile refuses bad bodies and is rate limited', async () => {
  const { token } = await newDevice();
  assert.equal((await call('POST', '/me/profile', { body: { goals: ['work'] } })).status, 401);
  assert.equal((await call('POST', '/me/profile', { token, body: '{oops' })).status, 400);
  assert.equal((await call('POST', '/me/profile', { token, body: ['work'] })).status, 400);
  assert.equal((await call('GET', '/me/profile', { token })).status, 404);
  const big = await call('POST', '/me/profile', { token, body: { goals: Array(1000).fill('work') } }).catch(() => ({ status: 413 }));
  assert.equal(big.status, 413);

  // на пристрій — 10 за хвилину, хоч з якої IP (новий пристрій: відмови
  // вище теж рахувались)
  const busy = await newDevice();
  const statuses = [];
  for (let i = 0; i < 11; i++) {
    statuses.push((await call('POST', '/me/profile', { token: busy.token, body: { level: i + 1 } })).status);
  }
  assert.deepEqual(statuses, [...Array(10).fill(200), 429]);

  // з однієї IP — 20 за хвилину, хоч із яких пристроїв
  const ip = nextIp();
  let last;
  for (let i = 0; i < 21; i++) {
    const d = await newDevice();
    last = await call('POST', '/me/profile', { token: d.token, ip, body: { level: 5 } });
  }
  assert.equal(last.status, 429);
});

const IMAGE = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };
const SINGLE_KEYS = ['word', 'ipa', 'translation', 'example', 'example_translation', 'box', 'outline', 'usage'];

test('scan by level: no level or below 7 — the answer as before; 7+ adds 2–3 phrases', async () => {
  const { token } = await newDevice();
  for (const level of [undefined, null, true, '', 'abc', 0, 1, 3, 5, 6, 6.4]) {
    const r = await call('POST', '/scan', { token, body: { ...IMAGE, level } });
    assert.equal(r.status, 200);
    assert.deepEqual(Object.keys(r.data), SINGLE_KEYS, String(level));
  }
  for (const level of [7, 8, 10, '9', 99, 6.6]) {
    const r = await call('POST', '/scan', { token, body: { ...IMAGE, level } });
    assert.deepEqual(Object.keys(r.data), [...SINGLE_KEYS.slice(0, -1), 'extras', 'usage'], String(level));
    assert.ok(r.data.extras.length >= 2 && r.data.extras.length <= ai.MAX_EXTRAS);
    for (const x of r.data.extras) {
      assert.deepEqual(Object.keys(x), ['phrase', 'translation']);
      assert.ok(x.phrase && x.translation);
    }
    assert.equal(r.data.extras[0].translation, 'кружка чаю');
  }
  // рідна мова — не українська: вирази перекладені англійською
  const de = await call('POST', '/scan', { token, body: { ...IMAGE, lang: 'de', nativeLang: 'en', level: 8 } });
  assert.deepEqual(de.data.extras[0], { phrase: 'eine Tasse Tee', translation: 'a cup of tea' });
});

test('the scan passes a clean level to the model; scenes never get phrases', async () => {
  const { token } = await newDevice();
  const seen = [];
  const realOne = ai.recognize;
  const realScene = ai.recognizeScene;
  ai.recognize = async (img, lang, native, level) => (seen.push(level), realOne(img, lang, native, level));
  ai.recognizeScene = async (img, lang, native, level) => (seen.push('scene:' + level), realScene(img, lang, native, level));
  try {
    for (const level of [undefined, '8', 99, -4, true, 6.6]) await call('POST', '/scan', { token, body: { ...IMAGE, level } });
    const scene = await call('POST', '/scan', { token, body: { ...IMAGE, mode: 'scene', level: 9 } });
    assert.equal(scene.status, 200);
    for (const o of scene.data.objects) {
      assert.deepEqual(Object.keys(o), ['word', 'ipa', 'translation', 'example', 'example_translation', 'box', 'outline']);
    }
    assert.ok(!('extras' in scene.data));
  } finally {
    ai.recognize = realOne;
    ai.recognizeScene = realScene;
  }
  assert.deepEqual(seen, [null, 8, 10, 1, null, 7, 'scene:9']);
});

test('phrases from the model are cleaned: strings only, clamped, no repeats, not the word itself, 3 at most', async () => {
  const { token } = await newDevice();
  const real = ai.recognize;
  let reply;
  ai.recognize = async () => reply;
  const base = { word: 'mug', ipa: '/mʌɡ/', translation: 'кружка', example: 'A mug.', example_translation: 'Кружка.', box: [100, 100, 600, 600] };
  try {
    reply = {
      ...base,
      extras: [
        { phrase: '  a mug of tea ', translation: ' кружка чаю ' },
        { phrase: 'MUG', translation: 'кружка' },
        { phrase: 'A mug of tea', translation: 'повтор' },
        null,
        'travel mug',
        { phrase: 5, translation: 'число' },
        { phrase: 'no translation' },
        { phrase: '', translation: 'порожньо' },
        { phrase: 'p'.repeat(100), translation: 't'.repeat(200) },
        { phrase: 'fourth', translation: 'четвертий' },
        { phrase: 'fifth', translation: 'пʼятий' },
      ],
    };
    const r = await call('POST', '/scan', { token, body: { ...IMAGE, level: 8 } });
    assert.deepEqual(r.data.extras, [
      { phrase: 'a mug of tea', translation: 'кружка чаю' },
      { phrase: 'p'.repeat(60), translation: 't'.repeat(80) },
      { phrase: 'fourth', translation: 'четвертий' },
    ]);
    // не масив чи нічого придатного — поля немає зовсім
    for (const extras of ['a mug of tea', { phrase: 'x', translation: 'y' }, [], [{ phrase: 'mug', translation: 'x' }]]) {
      reply = { ...base, extras };
      const e = await call('POST', '/scan', { token, body: { ...IMAGE, level: 8 } });
      assert.equal(e.status, 200);
      assert.ok(!('extras' in e.data), JSON.stringify(extras));
    }
    // модель «розщедрилась» для рівня 5 — людині це не показуємо
    reply = { ...base, extras: [{ phrase: 'a mug of tea', translation: 'кружка чаю' }] };
    const mid = await call('POST', '/scan', { token, body: { ...IMAGE, level: 5 } });
    assert.ok(!('extras' in mid.data));
  } finally {
    ai.recognize = real;
  }
});
