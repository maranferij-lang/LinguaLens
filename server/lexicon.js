// Тематичні списки для персонального «слова дня»: server/topics/<key>.js.
//
// Кожен файл — module.exports = { key, words: [[en, level, hint?], …], intl? }:
//   en    — англійський термін (сервер перекладає його мовою, яку вчать);
//   level — 1 (базове), 2 (робоче), 3 (просунуте) — див. рівні в wordplan.js;
//   hint  — значення в цій темі, щоб модель не переклала «ledger» як «полиця»;
//   intl  — прозорі інтернаціоналізми (finance → фінанси): людині від 4/10
//           вони нічого нового не дають, і апка з ними виглядає «тупою».
//
// Списки — дані, а не код: їх переглядають і замінюють окремо. Тому тут
// жодного конкретного слова, а завантажувач поблажливий: зіпсований рядок
// пропускається з записом у лозі, а не валить сервер. Суворі правила (кількість
// слів на рівень, довжина підказки, intl ⊆ words) перевіряє тест
// server/test/topics.test.js — він і зупинить поганий список до релізу.

const fs = require('fs');
const path = require('path');

// Усі теми, на які посилаються ваги розкладу. Поля онбордингу (it, finance…)
// — підмножина: «other» власного списку не має.
const KEYS = [
  'general',
  'workplace',
  'academic',
  'travel',
  'relocation',
  'it',
  'marketing',
  'finance',
  'sales',
  'management',
  'design',
  'medicine',
  'law',
  'engineering',
  'education',
  'hospitality',
];

const LEVELS = [1, 2, 3];
// Підказка (hint) іде в запит до моделі — довга лише заплутає її.
const HINT_MAX = 70;
// Застосунок пам'ятає «Знаю» рядками до 60 символів (див. profile.js):
// довший термін не можна було б позначити знайомим.
const TERM_MAX = 60;
// Слів на кожен рівень. Загальний список ділять усі, тож він більший.
function minPerLevel(key) {
  return key === 'general' ? 100 : 40;
}

// Порівнюємо терміни без регістру й зайвих пробілів: «Cash  flow» і
// «cash flow» — те саме слово і для дублікатів, і для «Знаю».
function norm(term) {
  return String(term).trim().replace(/\s+/g, ' ').toLowerCase();
}

// Проблеми одного рядка або null. Спільне для завантажувача й тесту даних.
function entryProblem(entry) {
  if (!Array.isArray(entry) || entry.length < 2 || entry.length > 3) return 'не [en, level, hint?]';
  const [en, level, hint] = entry;
  if (typeof en !== 'string' || !en.trim()) return 'порожній термін';
  if (en !== en.trim() || /\s{2,}|[\u0000-\u001f]/.test(en)) return `зайві пробіли в «${en}»`;
  if (en.length > TERM_MAX) return `«${en}» довший за ${TERM_MAX} символів`;
  if (!LEVELS.includes(level)) return `«${en}»: рівень ${JSON.stringify(level)} не 1, 2 чи 3`;
  if (entry.length === 3 && (typeof hint !== 'string' || !hint.trim())) return `«${en}»: порожня підказка`;
  return null;
}

// Усі порушення правил списку (для тесту даних). Порожній масив — список
// годиться.
function problems(mod, key) {
  const out = [];
  if (!mod || typeof mod !== 'object') return [`${key}: файл не експортує об'єкт`];
  if (mod.key !== key) out.push(`${key}: key = ${JSON.stringify(mod.key)}, а файл зветься ${key}.js`);
  if (!Array.isArray(mod.words)) return [...out, `${key}: words не масив`];
  const seen = new Set();
  const count = { 1: 0, 2: 0, 3: 0 };
  for (const entry of mod.words) {
    const p = entryProblem(entry);
    if (p) {
      out.push(`${key}: ${p}`);
      continue;
    }
    const [en, level, hint] = entry;
    if (seen.has(norm(en))) out.push(`${key}: «${en}» повторюється`);
    seen.add(norm(en));
    count[level]++;
    if (hint !== undefined && hint.length > HINT_MAX) out.push(`${key}: «${en}»: підказка довша за ${HINT_MAX} (${hint.length})`);
  }
  for (const level of LEVELS) {
    if (count[level] < minPerLevel(key)) out.push(`${key}: рівня ${level} лише ${count[level]} слів (треба ≥ ${minPerLevel(key)})`);
  }
  if (mod.intl !== undefined) {
    if (!Array.isArray(mod.intl)) out.push(`${key}: intl не масив`);
    else {
      const intl = new Set();
      for (const t of mod.intl) {
        if (typeof t !== 'string' || !seen.has(norm(t))) out.push(`${key}: intl «${t}» немає серед words`);
        else if (intl.has(norm(t))) out.push(`${key}: intl «${t}» повторюється`);
        else intl.add(norm(t));
      }
    }
  }
  return out;
}

// Модуль списку → { key, words: [{ en, level, hint, norm }], intl: Set }.
// Хибні рядки й повтори відкидаються (перший запис перемагає): розклад
// мусить працювати й на неідеальних даних, а не падати.
function normalize(mod, key) {
  const words = [];
  const seen = new Set();
  let dropped = 0;
  for (const entry of Array.isArray(mod && mod.words) ? mod.words : []) {
    if (entryProblem(entry) || seen.has(norm(entry[0]))) {
      dropped++;
      continue;
    }
    seen.add(norm(entry[0]));
    const hint = entry.length === 3 ? entry[2].trim() : undefined;
    words.push({ en: entry[0], level: entry[1], hint, norm: norm(entry[0]) });
  }
  if (dropped) console.error(`lexicon: ${key}: пропущено ${dropped} хибних чи повторених рядків`);
  const intl = new Set((Array.isArray(mod && mod.intl) ? mod.intl : []).filter((t) => typeof t === 'string').map(norm));
  return { key, words, intl };
}

// { topics: Map<key, тема>, intl: Set } — intl усіх тем разом: інтернаціоналізм
// лишається інтернаціоналізмом, хоч у якому списку він трапився.
function fromModules(mods) {
  const topics = new Map();
  const intl = new Set();
  for (const mod of mods) {
    if (!mod || typeof mod.key !== 'string' || topics.has(mod.key)) continue;
    const topic = normalize(mod, mod.key);
    topics.set(mod.key, topic);
    for (const t of topic.intl) intl.add(t);
  }
  return { topics, intl };
}

// Лише <key>.js з малих латинських літер: випадкова копія на кшталт
// finance.orig.js чи finance (1).js не підміняє справжній список.
function loadDir(dir) {
  const mods = [];
  let files = [];
  try {
    files = fs.readdirSync(dir).filter((f) => /^[a-z]+\.js$/.test(f)).sort();
  } catch (e) {
    console.error('lexicon: не вдалося прочитати', dir, e.message);
  }
  for (const file of files) {
    const key = file.slice(0, -3);
    try {
      const mod = require(path.join(dir, file));
      if (!mod || mod.key !== key) {
        console.error(`lexicon: ${file}: key не збігається з назвою файлу — пропущено`);
        continue;
      }
      mods.push(mod);
    } catch (e) {
      console.error(`lexicon: ${file} не завантажився — тему пропущено:`, e.message);
    }
  }
  return fromModules(mods);
}

const DIR = path.join(__dirname, 'topics');
const lexicon = loadDir(DIR);

module.exports = { KEYS, LEVELS, HINT_MAX, TERM_MAX, DIR, minPerLevel, norm, problems, fromModules, loadDir, lexicon };
