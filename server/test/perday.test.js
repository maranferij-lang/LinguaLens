// Pro «кілька слів на день» (v1.3): розклад слотів у wordplan.js і
// POST /word-of-day з perDay через справжній HTTP. AI у режимі mock.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-perday-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: '',
});
const { startServer } = require('./helpers/http');
const ai = require('../ai');
const billing = require('../billing');
const store = require('../store');
const wordplan = require('../wordplan');
const lexicon = require('../lexicon');
const profile = require('../profile');

const TODAY = '2026-10-01';
const SEED = 'a1b2c3d4e5f60718';
const PROFILES = [
  null,
  { goals: ['work'], field: 'finance', level: 8 },
  { goals: ['study'], field: 'it', level: 3, since: '2026-09-20' },
  { goals: ['travel', 'relocation'] },
  { goals: ['self'], level: 10 },
];

function schedule(raw, { perDay, days = 14, known = [], lex, seed = SEED } = {}) {
  return wordplan.schedule({
    seed,
    profile: profile.forSchedule(raw, TODAY),
    known: profile.known(known),
    today: TODAY,
    days,
    lex,
    ...(perDay === undefined ? null : { perDay }),
  });
}

// Розклад до v1.3 — по слову на день, pick() на кожну дату.
function legacy(raw, { days = 14 } = {}) {
  const plan = wordplan.buildPlan({ seed: SEED, profile: profile.forSchedule(raw, TODAY), known: profile.known([]) });
  return Array.from({ length: days }, (_, i) => wordplan.pick(plan, billing.addDays(TODAY, i)));
}

const byDate = (list) =>
  list.reduce((m, w) => {
    (m[w.date] = m[w.date] || []).push(w);
    return m;
  }, {});

test('perDay 1 is exactly the schedule before v1.3 (plus slot 0)', () => {
  for (const raw of PROFILES) {
    const old = legacy(raw);
    for (const fresh of [schedule(raw), schedule(raw, { perDay: 1 })]) {
      assert.deepEqual(
        fresh,
        old.map((w) => ({ ...w, slot: 0 }))
      );
    }
  }
});

test('slot 0 is the free word whatever perDay; slots 1–2 match for 3 and 5', () => {
  for (const raw of PROFILES) {
    const one = schedule(raw);
    const three = schedule(raw, { perDay: 3 });
    const five = schedule(raw, { perDay: 5 });
    assert.equal(three.length, 14 * 3);
    assert.equal(five.length, 14 * 5);
    for (const [date, slots] of Object.entries(byDate(three))) {
      assert.deepEqual(
        slots.map((w) => w.slot),
        [0, 1, 2]
      );
      assert.deepEqual(slots[0], one.find((w) => w.date === date));
      const big = byDate(five)[date];
      assert.deepEqual(
        big.map((w) => w.slot),
        [0, 1, 2, 3, 4]
      );
      assert.deepEqual(big.slice(0, 3), slots);
    }
  }
});

test('no word repeats within a day, even on a narrow word list', () => {
  // по три слова на тему: на 5 слотів «віртуальні дні» часто влучають у
  // слово, уже взяте того ж дня, — тоді шукаємо інше
  const lex = lexicon.fromModules([
    { key: 'general', words: [['tide', 1], ['harbour', 1], ['anchor', 2], ['lighthouse', 2], ['buoy', 3], ['pier', 3]] },
  ]);
  for (const raw of [null, { goals: ['self'], level: 5 }]) {
    const five = schedule(raw, { perDay: 5, lex, days: 30 });
    for (const slots of Object.values(byDate(five))) {
      assert.equal(new Set(slots.map((w) => w.en)).size, 5, slots.map((w) => w.en).join(' '));
    }
  }
  for (const raw of PROFILES) {
    for (const slots of Object.values(byDate(schedule(raw, { perDay: 5, days: 60 })))) {
      assert.equal(new Set(slots.map((w) => w.en)).size, 5);
    }
  }
});

test('extra slots keep the person’s level and topics, and stay deterministic', () => {
  const raw = { goals: ['work'], field: 'finance', level: 8 };
  const five = schedule(raw, { perDay: 5 });
  assert.deepEqual(five, schedule(raw, { perDay: 5 }));
  assert.notDeepEqual(
    five.map((w) => w.en),
    schedule(raw, { perDay: 5, seed: 'another-device' }).map((w) => w.en)
  );
  for (const w of five) {
    const entry = lexicon.lexicon.topics.get(w.topic).words.find((x) => x.en === w.en);
    assert.ok(entry, w.en);
    assert.ok([2, 3].includes(entry.level), `${w.en}: рівень ${entry.level}`);
  }
  // «Знаю» прибирає слово і з додаткових слотів
  const known = five.filter((w) => w.slot === 2).map((w) => w.en);
  const after = schedule(raw, { perDay: 5, known });
  assert.ok(!after.some((w) => known.includes(w.en)));
});

test('perDay is clamped to 1–5; anything else means one word', () => {
  const cases = [
    [undefined, 1],
    [null, 1],
    [0, 1],
    [-3, 1],
    ['x', 1],
    [{}, 1],
    [1, 1],
    [3, 3],
    ['5', 5],
    [7, 5],
    [Infinity, 1],
    [2.7, 2],
  ];
  for (const [v, n] of cases) assert.equal(wordplan.perDayOf(v), n, String(v));
  assert.equal(schedule(null, { perDay: 9, days: 2 }).length, 10);
  assert.equal(schedule(null, { perDay: 'x', days: 2 }).length, 2);
});

// ---------- HTTP ----------
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

const today = () => billing.utcDay();
function wod(token, body) {
  return call('POST', '/word-of-day', { token, body: { days: 14, lang: 'en', native: 'uk', today: today(), ...body } });
}

// Pro на час fn: як вебхук RevenueCat, що вже дійшов (proUntil у записі).
async function asPro(userId, fn) {
  await store.update('users', userId, { proUntil: Date.now() + 86400000 });
  try {
    return await fn();
  } finally {
    await store.update('users', userId, { proUntil: null });
  }
}

test('without Pro perDay is softly ignored: one word a day, perDay 1 in the reply', async () => {
  const { token } = await newDevice();
  const plain = await wod(token, {});
  const asked = await wod(token, { perDay: 3 });
  assert.equal(asked.status, 200);
  assert.equal(asked.data.perDay, 1);
  assert.equal(asked.data.words.length, 14);
  assert.ok(asked.data.words.every((w) => w.slot === 0));
  assert.deepEqual(asked.data.words, plain.data.words);
});

test('an old client without perDay gets the same days as before', async () => {
  const { token, user } = await newDevice();
  const r = await wod(token, { days: 14, profile: { goals: ['work'], field: 'finance', level: 6 } });
  assert.equal(r.data.perDay, 1);
  const seed = (await store.get('users', user.id)).seed;
  const raw = profile.forSchedule({ goals: ['work'], field: 'finance', level: 6 }, today());
  const old = wordplan.buildPlan({ seed, profile: raw, known: new Set() });
  const expected = Array.from({ length: 14 }, (_, i) => wordplan.pick(old, billing.addDays(today(), i)));
  assert.deepEqual(
    r.data.words.map((w) => [w.date, w.source, w.topic, w.slot]),
    expected.map((w) => [w.date, w.en, w.topic, 0])
  );
  // GET (версії до персоналізації) не змінився: ні slot, ні perDay
  const g = await call('GET', `/word-of-day?days=3&lang=en&native=uk&today=${today()}`, { token });
  assert.equal(g.data.perDay, undefined);
  assert.ok(g.data.words.every((w) => !('slot' in w)));
});

test('Pro: 3 a day for 14 days, 5 a day for 8 days — never more than 42 words', async () => {
  const { token, user } = await newDevice();
  await asPro(user.id, async () => {
    const three = await wod(token, { perDay: 3 });
    assert.equal(three.data.perDay, 3);
    assert.equal(three.data.words.length, 42);
    const dates = [...new Set(three.data.words.map((w) => w.date))];
    assert.equal(dates.length, 14);
    assert.equal(dates[0], today());
    assert.deepEqual(
      three.data.words.slice(0, 3).map((w) => w.slot),
      [0, 1, 2]
    );

    const five = await wod(token, { perDay: 5 });
    assert.equal(five.data.perDay, 5);
    assert.equal(five.data.words.length, 40);
    assert.equal(new Set(five.data.words.map((w) => w.date)).size, 8);
    // слот 0 — те саме слово, що й без Pro; слоти 1–2 — як у 3 на день
    const one = await wod(token, {});
    const at = (list, date, slot) => list.find((w) => w.date === date && w.slot === slot)?.source;
    for (const date of dates.slice(0, 8)) {
      assert.equal(at(five.data.words, date, 0), at(one.data.words, date, 0));
      assert.equal(at(five.data.words, date, 1), at(three.data.words, date, 1));
      assert.equal(at(five.data.words, date, 2), at(three.data.words, date, 2));
    }
    // короткий запит теж ріжеться за днями, а не за словами
    const short = await wod(token, { perDay: 5, days: 3 });
    assert.equal(short.data.words.length, 15);
  });
  // Pro скінчився — знову одне слово, і воно те саме
  const after = await wod(token, { perDay: 5 });
  assert.equal(after.data.perDay, 1);
  assert.equal(after.data.words.length, 14);
});

test('a failing Pro check means one word, not an error', async () => {
  const { token } = await newDevice();
  const real = billing.proStatus;
  billing.proStatus = async () => {
    throw new Error('RevenueCat is down');
  };
  try {
    const r = await wod(token, { perDay: 5 });
    assert.equal(r.status, 200);
    assert.equal(r.data.perDay, 1);
    assert.equal(r.data.words.length, 14);
  } finally {
    billing.proStatus = real;
  }
});

test('no more than 8 translations run at once, and the order survives', async () => {
  const { token, user } = await newDevice();
  const real = ai.translateWord;
  let running = 0;
  let peak = 0;
  let calls = 0;
  ai.translateWord = async (...args) => {
    calls++;
    running++;
    peak = Math.max(peak, running);
    // кожен «переклад» — своя затримка, щоб відповіді приходили не по черзі
    await new Promise((r) => setTimeout(r, 5 + ((calls * 7) % 11)));
    running--;
    return real(...args);
  };
  try {
    const r = await asPro(user.id, () => wod(token, { perDay: 3 }));
    assert.equal(r.data.words.length, 42);
    assert.equal(calls, 42);
    assert.ok(peak <= 8, `одночасно: ${peak}`);
    assert.ok(peak >= 2, 'переклади все ж ідуть паралельно');
    const days = r.data.words.map((w) => w.date);
    assert.deepEqual(days, [...days].sort());
    assert.deepEqual(
      r.data.words.map((w) => w.slot),
      Array.from({ length: 42 }, (_, i) => i % 3)
    );
  } finally {
    ai.translateWord = real;
  }
});

test('a failed translation is left out, not sent blank: the rest keep their slots and the answer says partial', async () => {
  const { token, user } = await newDevice();
  const real = ai.translateWord;
  let n = 0;
  ai.translateWord = async (...args) => {
    if (n++ % 3 === 1) throw new Error('AI is busy');
    return real(...args);
  };
  try {
    const r = await asPro(user.id, () => wod(token, { perDay: 3, days: 2 }));
    assert.equal(r.status, 200);
    assert.equal(r.data.partial, true);
    // 6 слів у плані, невдалі: індекси 1 і 4 (слот 1 обох днів)
    assert.equal(r.data.words.length, 4);
    for (const w of r.data.words) {
      assert.notEqual(w.translation, '');
      assert.notEqual(w.example, '');
      assert.ok([0, 2].includes(w.slot), 'слот ' + w.slot);
    }
  } finally {
    ai.translateWord = real;
  }
});

test('when the word for today fails the answer is 503 AI_BUSY with Retry-After, so the phone keeps its old cache', async () => {
  const { token } = await newDevice();
  const real = ai.translateWord;
  let n = 0;
  ai.translateWord = async (...args) => {
    if (n++ === 0) throw new Error('AI is busy'); // слот 0 сьогодні
    return real(...args);
  };
  try {
    const r = await wod(token, { days: 3 });
    assert.equal(r.status, 503);
    assert.deepEqual(r.data, { error: 'AI_BUSY' });
    assert.equal(r.headers.get('retry-after'), '5');
  } finally {
    ai.translateWord = real;
  }
  // і коли не вийшло жодного слова
  ai.translateWord = async () => {
    throw new Error('AI is down');
  };
  try {
    assert.equal((await wod(token, { days: 3 })).status, 503);
    assert.equal((await call('GET', `/word-of-day?days=3&today=${today()}`, { token })).status, 503);
  } finally {
    ai.translateWord = real;
  }
  // AI ожив: звичайна повна відповідь без partial
  const ok = await wod(token, { days: 3 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.partial, undefined);
  assert.equal(ok.data.words.length, 3);
});

test('legacy GET /word-of-day: same days parsing as POST, parallel limit, partial answer, no blank entries', async () => {
  const { token } = await newDevice();
  // days=abc — 7 слів, як у POST, а не порожній список
  const odd = await call('GET', `/word-of-day?days=abc&today=${today()}`, { token });
  assert.equal(odd.data.words.length, 7);
  assert.equal(odd.data.partial, undefined);

  const real = ai.translateWord;
  let running = 0;
  let peak = 0;
  let n = 0;
  ai.translateWord = async (...args) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((r) => setTimeout(r, 10));
    running--;
    if (n++ === 3) throw new Error('AI is busy'); // четвертий день
    return real(...args);
  };
  try {
    const r = await call('GET', `/word-of-day?days=14&today=${today()}`, { token });
    assert.equal(r.status, 200);
    assert.equal(r.data.partial, true);
    assert.equal(r.data.words.length, 13);
    assert.ok(r.data.words.every((w) => w.translation !== '' && w.example !== ''));
    assert.ok(peak <= 8, `одночасно: ${peak}`);
  } finally {
    ai.translateWord = real;
  }
});
