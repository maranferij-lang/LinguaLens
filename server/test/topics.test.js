// Тематичні списки слова дня (server/topics) — це дані, які переглядають і
// замінюють окремо від коду. Цей тест — їхній вхідний контроль: форма, рівні,
// повтори, підказки, intl ⊆ words і досить слів на кожен рівень, щоб розклад
// не крутив те саме коло. Конкретних слів тест не знає.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const lexicon = require('../lexicon');
const profile = require('../profile');
const ai = require('../ai');

const files = fs.readdirSync(lexicon.DIR).filter((f) => f.endsWith('.js'));

test('server/topics has exactly one file per topic of the schedule', () => {
  assert.deepEqual(files.map((f) => f.slice(0, -3)).sort(), [...lexicon.KEYS].sort());
  // кожна тема, крім загальних, має назву для підказки перекладу
  assert.deepEqual(Object.keys(ai.TOPIC_NAMES).sort(), lexicon.KEYS.filter((k) => k !== 'general').sort());
  // кожна сфера з онбордингу, крім «інше», має свій список
  for (const field of profile.FIELDS.filter((f) => f !== 'other')) assert.ok(lexicon.KEYS.includes(field), field);
});

for (const key of lexicon.KEYS) {
  test(`topic list "${key}" follows the data rules`, () => {
    const mod = require(path.join(lexicon.DIR, key + '.js'));
    assert.deepEqual(lexicon.problems(mod, key), []);
    // Завантажувач узяв список повністю — нічого не відкинув як хибне.
    const loaded = lexicon.lexicon.topics.get(key);
    assert.ok(loaded, 'тема завантажилась');
    assert.equal(loaded.words.length, mod.words.length);
    // Два терміни теми не можуть ділити один запис кешу перекладів
    // («P/E ratio» і «P E ratio» стали б одним ключем).
    const keys = new Set(mod.words.map(([en]) => ai.wordCacheKey(en, 'en', 'uk', key)));
    assert.equal(keys.size, mod.words.length);
  });
}

test('every known-able term fits the 60-character «Знаю» limit and intl terms are real list terms', () => {
  for (const topic of lexicon.lexicon.topics.values()) {
    for (const w of topic.words) assert.ok(w.en.length <= lexicon.TERM_MAX, w.en);
    const terms = new Set(topic.words.map((w) => w.norm));
    for (const t of topic.intl) assert.ok(terms.has(t), `${topic.key}: intl «${t}»`);
  }
});

test('problems() catches every broken rule', () => {
  const words = (n, level, prefix = 'w') => Array.from({ length: n }, (_, i) => [`${prefix}${level}x${i}`, level]);
  const good = { key: 'law', words: [...words(40, 1), ...words(40, 2), ...words(40, 3)] };
  assert.deepEqual(lexicon.problems(good, 'law'), []);

  const broken = {
    key: 'law',
    words: [
      ...words(39, 1),
      ...words(40, 2),
      ...words(40, 3),
      ['Ledger', 2],
      ['ledger', 3], // повтор без урахування регістру
      [' padded', 1],
      ['double  space', 1],
      ['', 1],
      ['x'.repeat(61), 1],
      ['level four', 4],
      ['level string', '2'],
      ['long hint', 2, 'h'.repeat(71)],
      ['empty hint', 2, ' '],
      ['too', 2, 'many', 'fields'],
      'not an array',
    ],
    intl: ['ledger', 'ghost', 'LEDGER'],
  };
  const p = lexicon.problems(broken, 'law').join('\n');
  for (const needle of [
    '«ledger» повторюється',
    'зайві пробіли в « padded»',
    'зайві пробіли в «double  space»',
    'порожній термін',
    'довший за 60',
    'рівень 4',
    'рівень "2"',
    'підказка довша за 70 (71)',
    '«empty hint»: порожня підказка',
    'не [en, level, hint?]',
    'рівня 1 лише 39',
    'intl «ghost» немає',
    'intl «LEDGER» повторюється',
  ]) {
    assert.ok(p.includes(needle), needle + '\n---\n' + p);
  }
  assert.match(lexicon.problems({ ...good, key: 'sales' }, 'law').join(), /key = "sales"/);
  assert.match(lexicon.problems({ key: 'law' }, 'law').join(), /words не масив/);
  assert.match(lexicon.problems({ key: 'law', words: [], intl: 'x' }, 'law').join(), /intl не масив/);
  // загальний список має бути більшим: 100 на рівень
  assert.match(lexicon.problems({ key: 'general', words: good.words }, 'general').join(), /рівня 1 лише 40 слів \(треба ≥ 100\)/);
});

test('the loader keeps the server alive on bad data: broken rows and duplicates are dropped, not fatal', () => {
  const lex = lexicon.fromModules([
    {
      key: 'law',
      words: [['tort', 3, '  civil wrong  '], ['Tort', 1], ['bad', 7], 'junk', ['contract', 1]],
      intl: ['Contract', 42],
    },
    { key: 'law', words: [['shadowed', 1]] }, // друга тема з тим самим ключем не підміняє першу
    { key: 'finance', words: [['audit', 2]], intl: ['AUDIT '] },
    null,
  ]);
  const law = lex.topics.get('law');
  assert.deepEqual(
    law.words.map((w) => [w.en, w.level, w.hint, w.norm]),
    [
      ['tort', 3, 'civil wrong', 'tort'],
      ['contract', 1, undefined, 'contract'],
    ]
  );
  // intl усіх тем разом, нормалізовані
  assert.deepEqual([...lex.intl].sort(), ['audit', 'contract']);
});

test('loadDir reads only <key>.js files whose key matches, and survives a broken file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-topics-'));
  try {
    fs.writeFileSync(path.join(dir, 'law.js'), "module.exports = { key: 'law', words: [['tort', 3]] };");
    fs.writeFileSync(path.join(dir, 'law.orig.js'), "module.exports = { key: 'law', words: [['stale', 1]] };");
    fs.writeFileSync(path.join(dir, 'sales.js'), "module.exports = { key: 'finance', words: [['wrong', 1]] };");
    fs.writeFileSync(path.join(dir, 'design.js'), 'module.exports = {{ syntax error');
    const lex = lexicon.loadDir(dir);
    assert.deepEqual([...lex.topics.keys()], ['law']);
    assert.deepEqual(lex.topics.get('law').words.map((w) => w.en), ['tort']);
    // теки немає зовсім — порожньо, а не виняток
    assert.equal(lexicon.loadDir(path.join(dir, 'missing')).topics.size, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
