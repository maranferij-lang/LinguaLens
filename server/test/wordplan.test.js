// Розклад персонального слова дня (wordplan.js) і чистка профілю
// (profile.js) без HTTP. Частина тестів — на справжніх списках server/topics
// (правила, що мусять триматися на будь-яких даних: рівні, повтори, частки
// тем), частина — на вигаданих, де треба точно знати, що в якому списку
// (інтернаціоналізми, спільні терміни, вичерпані теми).
const { test } = require('node:test');
const assert = require('node:assert/strict');

const wordplan = require('../wordplan');
const profile = require('../profile');
const lexicon = require('../lexicon');
const words = require('../words');
const billing = require('../billing');

const TODAY = '2026-10-01';
const SEED = 'a1b2c3d4e5f60718';

function schedule(raw, { days = 14, seed = SEED, known = [], today = TODAY, lex } = {}) {
  return wordplan.schedule({
    seed,
    profile: profile.forSchedule(raw, today),
    known: profile.known(known),
    today,
    days,
    lex,
  });
}

function plan(raw, { seed = SEED, known = [], today = TODAY, lex } = {}) {
  return wordplan.buildPlan({ seed, profile: profile.forSchedule(raw, today), known: profile.known(known), lex });
}

const count = (list, key) => list.reduce((m, x) => ((m[x[key]] = (m[x[key]] || 0) + 1), m), {});

// Вигадані списки: { key: { 1: n, 2: n, 3: n, extra: [[en, level]], intl } }
// → слова «key-рівень-i» плюс extra на початку.
function fakeLex(spec) {
  return lexicon.fromModules(
    Object.entries(spec).map(([key, s]) => ({
      key,
      words: [
        ...(s.extra || []),
        ...[1, 2, 3].flatMap((l) => Array.from({ length: s[l] || 0 }, (_, i) => [`${key}-${l}-${i}`, l])),
      ],
      intl: s.intl,
    }))
  );
}

const FULL = { goals: ['work', 'study', 'travel', 'relocation', 'self'], field: 'finance' };
const PROFILES = [
  null,
  { goals: ['work'], field: 'finance' },
  { goals: ['work'], field: null },
  { goals: ['work'], field: 'other' },
  { goals: ['study'], field: 'it' },
  { goals: ['travel', 'relocation'] },
  { goals: ['self'] },
  FULL,
];

test('source weights follow the approved split for every goal', () => {
  const w = (raw) => Object.fromEntries(wordplan.weightsFor(profile.forSchedule(raw, TODAY)));
  assert.deepEqual(w(null), { general: 1 });
  assert.deepEqual(w({ goals: ['work'], field: 'finance' }), { finance: 4, workplace: 2, general: 1 });
  assert.deepEqual(w({ goals: ['work'] }), { workplace: 4, general: 2 });
  assert.deepEqual(w({ goals: ['work'], field: 'other' }), { workplace: 4, general: 2 });
  assert.deepEqual(w({ goals: ['study'] }), { academic: 3, general: 1 });
  assert.deepEqual(w({ goals: ['study'], field: 'other' }), { academic: 3, general: 1 });
  assert.deepEqual(w({ goals: ['study'], field: 'it' }), { academic: 3, it: 1, general: 1 });
  assert.deepEqual(w({ goals: ['travel'] }), { travel: 2, general: 1 });
  assert.deepEqual(w({ goals: ['relocation'] }), { relocation: 2, general: 1 });
  assert.deepEqual(w({ goals: ['self'] }), { general: 2 });
  // кілька цілей: тема один раз, з найбільшою вагою
  assert.deepEqual(w({ goals: ['work', 'study'], field: 'law' }), { law: 4, workplace: 2, general: 1, academic: 3 });
  assert.deepEqual(w({ goals: ['work', 'self'], field: 'marketing' }), { marketing: 4, workplace: 2, general: 2 });
  assert.deepEqual(w({ goals: ['self', 'work'] }), { workplace: 4, general: 2 });
  // сфера важить лише для роботи чи навчання
  assert.deepEqual(w({ goals: ['travel'], field: 'finance' }), { travel: 2, general: 1 });
  // хибний профіль — лише загальні слова, як у v1
  assert.deepEqual(w({ goals: ['fly'], field: 'finance' }), { general: 1 });
  assert.deepEqual(w({}), { general: 1 });
});

test('the cycle is a smooth weighted round-robin over sources sorted by key', () => {
  const f = 'finance';
  const wp = 'workplace';
  const g = 'general';
  const expected = [f, wp, f, g, f, wp, f];
  assert.deepEqual(wordplan.smoothPattern(new Map([[f, 4], [wp, 2], [g, 1]])), expected);
  // порядок вставки не важить — лише ключі
  assert.deepEqual(wordplan.smoothPattern(new Map([[g, 1], [wp, 2], [f, 4]])), expected);
  assert.deepEqual(wordplan.smoothPattern(new Map([[g, 2]])), [g, g]);
  // нічия — на користь першого за ключем
  assert.deepEqual(wordplan.smoothPattern(new Map([['travel', 2], ['relocation', 2], [g, 1]])), [
    'relocation',
    'travel',
    g,
    'relocation',
    'travel',
  ]);
  for (const raw of PROFILES) {
    const p = plan(raw);
    const weights = Object.fromEntries([...p.sources].map(([k, s]) => [k, s.weight]));
    assert.deepEqual(count(p.pattern.map((topic) => ({ topic })), 'topic'), weights);
  }
});

test('the schedule is deterministic per device and different between devices', () => {
  for (const raw of PROFILES) {
    assert.deepEqual(schedule(raw), schedule(raw));
  }
  const a = schedule({ goals: ['work'], field: 'finance', level: 6 }).map((w) => w.en);
  const b = schedule({ goals: ['work'], field: 'finance', level: 6 }, { seed: 'another-device' }).map((w) => w.en);
  assert.notDeepEqual(a, b);
  // перший день 14-денного вікна збігається з тим самим днем вікна, що
  // почалося вчора: кеш телефона, віджет і пуш бачать одне слово
  const today = schedule({ goals: ['work'], field: 'it', level: 5, since: '2026-09-01' });
  const fromYesterday = schedule(
    { goals: ['work'], field: 'it', level: 5, since: '2026-09-01' },
    { today: billing.addDays(TODAY, -1) }
  );
  assert.deepEqual(fromYesterday.slice(1), today.slice(0, 13));
  assert.deepEqual(today.map((w) => w.date), Array.from({ length: 14 }, (_, i) => billing.addDays(TODAY, i)));
});

test('over 70 days work + field gives field 4 : workplace 2 : general 1, from any starting day', () => {
  for (const level of [2, 5, 8, 10]) {
    const days = schedule({ goals: ['work'], field: 'finance', level }, { days: 70 });
    assert.deepEqual(count(days, 'topic'), { finance: 40, workplace: 20, general: 10 });
  }
  // будь-який тиждень, хоч скільки днів минуло від since, — рівно 4/2/1
  for (const back of [1, 3, 10, 365]) {
    const since = billing.addDays(TODAY, -back);
    const week = schedule({ goals: ['work'], field: 'design', level: 5, since }, { days: 7 });
    assert.deepEqual(count(week, 'topic'), { design: 4, workplace: 2, general: 1 });
  }
  assert.deepEqual(count(schedule({ goals: ['study'], field: 'it', level: 5 }, { days: 70 }), 'topic'), {
    academic: 42,
    it: 14,
    general: 14,
  });
  assert.deepEqual(count(schedule({ goals: ['work'], level: 5 }, { days: 72 }), 'topic'), { workplace: 48, general: 24 });
});

test('no word repeats inside a cycle, across all active topics', () => {
  for (const level of [1, 4, 6, 8, 9, 10, null]) {
    for (const raw of PROFILES) {
      const withLevel = raw && { ...raw, level };
      const p = plan(withLevel);
      // днів, за які жодна тема ще не пішла по другому колу; щонайменше
      // чотири тижні без повтору — інакше списки замалі для цього рівня
      const P = p.pattern.length;
      const horizon = P * Math.min(...[...p.sources.values()].map((s) => Math.floor(s.list.length / s.weight)));
      assert.ok(horizon >= 28, `${JSON.stringify(withLevel)}: коло лише ${horizon} днів`);
      const days = schedule(withLevel, { days: horizon });
      assert.equal(new Set(days.map((d) => lexicon.norm(d.en))).size, horizon, JSON.stringify(withLevel));
    }
  }
});

test('each topic is walked in its own order: the n-th day of a topic is the n-th word of its list', () => {
  const raw = { ...FULL, level: 5, since: billing.addDays(TODAY, -40) };
  const p = plan(raw);
  const seen = {};
  // з since, а не з сьогодні: лічимо появу теми від початку прогресу
  for (const d of schedule(raw, { days: 200, today: raw.since })) {
    const s = p.sources.get(d.topic);
    const n = (seen[d.topic] = (seen[d.topic] || 0) + 1) - 1;
    assert.equal(d.en, s.list[n % s.list.length].en);
  }
});

const ALLOWED = { 1: [1, 2], 2: [1, 2], 3: [1, 2], 4: [1, 2, 3], 5: [1, 2, 3], 6: [2, 3], 7: [2, 3], 8: [2, 3], 9: [3], 10: [3] };

test('level rules: allowed word levels per slider value, on every list, even after the lists wrap around', () => {
  for (let level = 1; level <= 10; level++) {
    for (const raw of PROFILES.filter(Boolean)) {
      // 1200 днів — кожна тема встигає піти по колу кілька разів
      const days = schedule({ ...raw, level }, { days: 1200 });
      const levels = new Set(days.map((d) => d.level));
      for (const l of levels) assert.ok(ALLOWED[level].includes(l), `слайдер ${level}: слово рівня ${l}`);
      if (level >= 8) assert.ok(!levels.has(1), `слайдер ${level} отримав слово рівня 1`);
      if (level >= 9) assert.deepEqual([...levels], [3]);
    }
  }
});

test('level rules: easy words first for beginners, hardest first for 8/10', () => {
  const order = { 1: [1, 2], 3: [1, 2], 4: [1, 2, 3], 5: [1, 2, 3], 6: [2, 3], 7: [2, 3], 8: [3, 2], 9: [3], 10: [3] };
  for (const [level, bands] of Object.entries(order)) {
    assert.deepEqual(wordplan.bandsFor(Number(level)), bands);
    const p = plan({ ...FULL, level: Number(level) });
    for (const [key, s] of p.sources) {
      const levels = s.list.map((w) => w.level);
      // рівні йдуть суцільними блоками в порядку слайдера
      const blocks = levels.filter((l, i) => i === 0 || l !== levels[i - 1]);
      assert.deepEqual(blocks, bands.filter((b) => levels.includes(b)), `${key} @ ${level}`);
    }
    // з першого дня — перший рівень слайдера (8/10 починає зі складних)
    const first = schedule({ goals: ['work'], field: 'finance', level: Number(level) }, { days: 1 })[0];
    assert.equal(first.level, bands[0]);
  }
  // без рівня — усі рівні впереміш, як у v1
  assert.equal(wordplan.bandsFor(null), null);
  const mixed = plan({ goals: ['self'] }).sources.get('general').list.slice(0, 60).map((w) => w.level);
  assert.equal(new Set(mixed).size, 3);
});

test('internationalisms are hidden from slider 4 up — in every list, whichever list marks them', () => {
  const lex = fakeLex({
    general: { 1: 30, 2: 30, 3: 30, extra: [['taxi', 1], ['budget', 1], ['manager', 2]], intl: ['taxi'] },
    finance: { 1: 30, 2: 30, 3: 30, extra: [['finance', 1], ['budget', 1]], intl: ['Finance', 'budget'] },
    workplace: { 1: 30, 2: 30, 3: 30, intl: ['manager'] },
  });
  const raw = { goals: ['work'], field: 'finance' };
  const terms = (level) => new Set(schedule(level === undefined ? raw : { ...raw, level }, { days: 1000, lex }).map((d) => d.en));
  for (const level of [1, 2, 3, undefined]) {
    for (const t of ['taxi', 'finance', 'budget', 'manager']) assert.ok(terms(level).has(t), `${t} @ ${level}`);
  }
  for (const level of [4, 5, 6]) {
    // «manager» позначений лише в workplace, а сам є в general — однаково схований
    for (const t of ['taxi', 'finance', 'budget', 'manager']) assert.ok(!terms(level).has(t), `${t} @ ${level}`);
  }
});

test('words marked «Знаю» never come back, and today gets the next word of the same topic', () => {
  const raw = { goals: ['work'], field: 'finance', level: 5 };
  const before = schedule(raw);
  const today = before[0];
  assert.equal(today.topic, 'finance');
  const nextFinance = before.slice(1).find((d) => d.topic === 'finance');
  // регістр і пробіли не важать: застосунок шле те, що отримав, але раптом
  const after = schedule(raw, { known: ['  ' + today.en.toUpperCase() + ' '] });
  assert.equal(after[0].en, nextFinance.en);
  assert.equal(after[0].topic, 'finance');
  // решта тем не зрушила
  assert.deepEqual(
    after.filter((d) => d.topic !== 'finance').map((d) => d.en),
    before.filter((d) => d.topic !== 'finance').map((d) => d.en)
  );
  const long = schedule(raw, { days: 1500, known: [today.en, before[1].en, before[3].en] });
  for (const t of [today.en, before[1].en, before[3].en]) assert.ok(!long.some((d) => d.en === t), t);
  // і без профілю — «Знаю» працює й для неперсоналізованих
  const plain = schedule(null, { days: 3 });
  assert.notEqual(schedule(null, { days: 1, known: [plain[0].en] })[0].en, plain[0].en);
});

test('a term shared by active topics stays only in the heaviest one; ties go by key', () => {
  const lex = fakeLex({
    general: { 1: 20, 2: 20, 3: 20, extra: [['deadline', 3], ['visa', 1]] },
    finance: { 1: 20, 2: 20, 3: 20, extra: [['deadline', 1], ['invoice', 2]] },
    workplace: { 1: 20, 2: 20, 3: 20, extra: [['invoice', 2]] },
    travel: { 1: 20, 2: 20, 3: 20, extra: [['visa', 1]] },
    relocation: { 1: 20, 2: 20, 3: 20, extra: [['visa', 1]] },
  });
  const where = (raw, term) =>
    [...plan(raw, { lex }).sources].filter(([, s]) => s.list.some((w) => w.en === term)).map(([k]) => k);
  assert.deepEqual(where({ goals: ['work'], field: 'finance', level: 5 }, 'invoice'), ['finance']);
  assert.deepEqual(where({ goals: ['work'], field: 'finance', level: 5 }, 'deadline'), ['finance']);
  // travel 2 = relocation 2 > general 1: перемагає перший ключ
  assert.deepEqual(where({ goals: ['travel', 'relocation'], level: 2 }, 'visa'), ['relocation']);
  // у важчій темі слово нижче рівня людини — його немає ніде: легша тема, де
  // воно позначене складнішим, не повертає людині 9/10 базове слово її сфери
  assert.deepEqual(where({ goals: ['work'], field: 'finance', level: 9 }, 'deadline'), []);
  assert.deepEqual(where({ goals: ['work'], field: 'finance', level: 6 }, 'deadline'), []);
  assert.deepEqual(where({ goals: ['work'], field: 'finance', level: 2 }, 'deadline'), ['finance']);

  // на справжніх списках: жоден термін не трапляється у двох активних темах
  for (const level of [2, 5, 8]) {
    const all = [...plan({ ...FULL, level }).sources.values()].flatMap((s) => s.list.map((w) => w.norm));
    assert.equal(new Set(all).size, all.length);
  }
});

test('a word that any active list rates below the slider is not served, whichever list owns it', () => {
  const lex = fakeLex({
    general: { 1: 20, 2: 20, 3: 20, extra: [['ledger', 1], ['forecast', 2]] },
    finance: { 1: 20, 2: 20, 3: 20, extra: [['ledger', 3], ['forecast', 3], ['accrual', 3]] },
    workplace: { 1: 20, 2: 20, 3: 20 },
    // travel для роботи не активна — її думка про рівень не важить
    travel: { 1: 20, 2: 20, 3: 20, extra: [['accrual', 1]] },
  });
  const where = (level, term) =>
    [...plan({ goals: ['work'], field: 'finance', level }, { lex }).sources]
      .filter(([, s]) => s.list.some((w) => w.en === term))
      .map(([k]) => k);
  // фінанси кажуть «просунуте», а загальні — «базове»: для 8–10 його немає
  assert.deepEqual(where(9, 'ledger'), []);
  assert.deepEqual(where(8, 'ledger'), []);
  assert.deepEqual(where(5, 'ledger'), ['finance']);
  // робоче слово (2) годиться для 8/10, але не для 9/10
  assert.deepEqual(where(8, 'forecast'), ['finance']);
  assert.deepEqual(where(9, 'forecast'), []);
  assert.deepEqual(where(9, 'accrual'), ['finance']);
});

// Головна вимога персоналізації: людина, що оцінила себе на 8–10, не
// отримує базових слів — ні зі своєї сфери, ні з «роботи» чи загальних, хоч
// би який список подав слово. Рівень слова — найлегший серед УСІХ активних
// списків, де воно є.
test('8–10/10 never get a word that any active list rates below their level, on the real lists', () => {
  const GOALS = [['work'], ['study'], ['work', 'study'], FULL.goals];
  const fields = profile.FIELDS.filter((f) => f !== 'other');
  for (const goals of GOALS) {
    for (const field of fields) {
      for (const level of [8, 9, 10]) {
        const raw = { goals, field, level, since: TODAY };
        const lowest = new Map();
        for (const key of wordplan.weightsFor(profile.forSchedule(raw, TODAY)).keys()) {
          for (const w of lexicon.lexicon.topics.get(key).words) {
            lowest.set(w.norm, Math.min(lowest.get(w.norm) ?? 3, w.level));
          }
        }
        const floor = level >= 9 ? 3 : 2;
        for (let s = 0; s < 20; s++) {
          for (const d of schedule(raw, { seed: 'seed' + s, days: 365 })) {
            const l = lowest.get(lexicon.norm(d.en));
            const who = `${goals.join('+')} · ${field} · ${level}/10 · seed${s}`;
            assert.ok(l >= floor, `${who}: «${d.en}» (${d.topic}), а десь — рівень ${l}`);
          }
        }
      }
    }
  }
});

test('an exhausted topic leaves the cycle; when all are exhausted general words return at the same level', () => {
  const lex = fakeLex({
    general: { 1: 5, 2: 5, 3: 5 },
    finance: { 1: 5, 2: 5, 3: 5 },
    workplace: { 1: 5, 2: 5, 3: 5 },
  });
  const raw = { goals: ['work'], field: 'finance', level: 9 };
  const finance3 = Array.from({ length: 5 }, (_, i) => `finance-3-${i}`);
  const p = plan(raw, { lex, known: finance3 });
  assert.deepEqual(p.pattern, ['workplace', 'general', 'workplace']);
  assert.deepEqual(count(schedule(raw, { lex, known: finance3, days: 30 }), 'topic'), { workplace: 20, general: 10 });

  // усе третього рівня позначено «Знаю» — повторюємо загальні слова того ж
  // рівня, але ніколи не легші
  const all3 = ['general', 'finance', 'workplace'].flatMap((k) => Array.from({ length: 5 }, (_, i) => `${k}-3-${i}`));
  const fallback = schedule(raw, { lex, known: all3, days: 40 });
  assert.ok(fallback.every((d) => d.topic === 'general' && d.level === 3));
  assert.deepEqual(new Set(fallback.map((d) => d.en)), new Set(all3.filter((t) => t.startsWith('general'))));
});

test('without any usable list the v1 list keeps the word of the day alive', () => {
  const noLevel3 = fakeLex({ general: { 1: 5, 2: 5 }, finance: { 1: 5 } });
  const days = schedule({ goals: ['work'], field: 'finance', level: 10 }, { lex: noLevel3, days: 5 });
  assert.ok(days.every((d) => d.topic === 'general' && d.level === null && words.WORDS.includes(d.en)));

  // зовсім без списків і без профілю — рівно порядок v1 (GET /word-of-day)
  const empty = lexicon.fromModules([]);
  const legacy = words.shuffledFor(SEED);
  const plain = schedule(null, { lex: empty, days: 14 });
  assert.deepEqual(
    plain.map((d) => d.en),
    plain.map((d) => words.wordFor(legacy, billing.dayIndexOf(d.date)))
  );
});

test('since: progress starts on the profile date; a future or broken date means today', () => {
  const since = (v) => profile.forSchedule({ goals: ['self'], since: v }, TODAY).since;
  assert.equal(since('2026-09-28'), '2026-09-28');
  assert.equal(since(TODAY), TODAY);
  for (const bad of ['2026-10-02', '2027-01-01', '2026-02-30', '2026-9-28', '28.09.2026', 20260928, null, undefined, '']) {
    assert.equal(since(bad), TODAY, String(bad));
  }
  const raw = { goals: ['work'], field: 'marketing', level: 6 };
  const fresh = schedule({ ...raw, since: TODAY });
  const threeDaysIn = schedule({ ...raw, since: billing.addDays(TODAY, -3) });
  assert.deepEqual(threeDaysIn.slice(0, 11).map((d) => d.en), fresh.slice(3).map((d) => d.en));
  // майбутній since — те саме, що сьогодні
  assert.deepEqual(schedule({ ...raw, since: '2026-12-31' }), fresh);
  // дата до since (не буває у відповіді, але pick не має впасти) — перший день
  const p = plan({ ...raw, since: TODAY });
  assert.deepEqual(wordplan.pick(p, '2026-09-01').en, wordplan.pick(p, TODAY).en);
});

test('profile sanitising: unknown goals and fields dropped, level clamped to an integer 1–10', () => {
  const p = profile.forSchedule(
    { goals: ['self', 'WORK', 'fly', 7, 'work', 'self', null], field: 'Finance', level: 7.6, since: '2026-09-30', extra: 1 },
    TODAY
  );
  assert.deepEqual(p, { goals: ['work', 'self'], field: null, level: 8, since: '2026-09-30' });
  for (const [v, want] of [
    [1, 1],
    [10, 10],
    [0, 1],
    [-5, 1],
    [11, 10],
    [1e9, 10],
    ['9', 9],
    [' 4 ', 4],
    [3.4, 3],
    [null, null],
    [undefined, null],
    [true, null],
    ['', null],
    ['abc', null],
    [NaN, null],
    [Infinity, null],
    [[5], null],
    [{}, null],
  ]) {
    assert.equal(profile.level(v), want, JSON.stringify(v));
  }
  for (const f of profile.FIELDS) assert.equal(profile.field(f), f);
  assert.equal(profile.field('astronaut'), null);
  assert.equal(profile.field('__proto__'), null);
  for (const bad of [null, 'x', 42, [], [{ goals: ['work'] }]]) assert.equal(profile.forSchedule(bad, TODAY), null);
  assert.deepEqual(profile.forSchedule({}, TODAY), { goals: [], field: null, level: null, since: TODAY });
  assert.deepEqual(profile.forSchedule({ goals: 'work' }, TODAY).goals, []);
});

test('«Знаю» list sanitising: strings up to 60 chars, normalised, the newest 500 kept', () => {
  assert.deepEqual([...profile.known(null)], []);
  assert.deepEqual([...profile.known('ledger')], []);
  assert.deepEqual([...profile.known([' Ledger ', 'ledger', 'Cash  Flow', 42, null, {}, '', '   ', 'x'.repeat(61), 'y'.repeat(60)])].sort(), [
    'cash flow',
    'ledger',
    'y'.repeat(60),
  ]);
  const many = Array.from({ length: 700 }, (_, i) => 'term' + i);
  const kept = profile.known(many);
  assert.equal(kept.size, 500);
  assert.ok(kept.has('term699') && kept.has('term200') && !kept.has('term199'));
});

test('stored profile: only known answers, missing fields keep the previous value', () => {
  const prev = { goals: ['work'], field: 'law', level: 6, heardFrom: 'tiktok' };
  assert.deepEqual(profile.forStorage({ goals: ['study', 'x'], field: 'it', level: '12', heardFrom: 'friend' }, prev), {
    goals: ['study'],
    field: 'it',
    level: 10,
    heardFrom: 'friend',
  });
  // редактор у Параметрах не шле «звідки дізнались» — відповідь не стирається
  assert.deepEqual(profile.forStorage({ goals: ['self'], field: null, level: 3 }, prev), {
    goals: ['self'],
    field: null,
    level: 3,
    heardFrom: 'tiktok',
  });
  // явний null — свідомо стерто; невідоме джерело — null
  assert.equal(profile.forStorage({ heardFrom: null }, prev).heardFrom, null);
  assert.equal(profile.forStorage({ heardFrom: 'TikTok' }, prev).heardFrom, null);
  for (const h of profile.HEARD_FROM) assert.equal(profile.forStorage({ heardFrom: h }, null).heardFrom, h);
  assert.deepEqual(profile.forStorage({}, null), { goals: [], field: null, level: null, heardFrom: null });
  // зіпсований попередній профіль теж чиститься
  assert.deepEqual(profile.forStorage({}, { goals: 'work', field: 'x', level: 'y', heardFrom: 5 }), {
    goals: [],
    field: null,
    level: null,
    heardFrom: null,
  });
});
