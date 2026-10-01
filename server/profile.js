// Навчальний профіль з онбордингу: цілі, сфера, рівень 1–10 і звідки людина
// про нас дізналась. Жодних особистих даних — лише відповіді з готових
// варіантів, тож навіть повний витік бази нікого не ідентифікує.
//
// Усе, що приходить від застосунку, — недовірене: невідомі варіанти
// відкидаються, рівень затискається в 1–10, дати — лише справжні
// календарні дні. Саме тут, а не в розкладі: wordplan.js отримує вже чисте.

const billing = require('./billing');
const lexicon = require('./lexicon');

// Порядок важливий: у збереженому профілі цілі йдуть саме так, і однакові
// відповіді рахуються однаково, хоч у якому порядку людина тапала чипи.
const GOALS = ['work', 'study', 'travel', 'relocation', 'self'];
const FIELDS = [
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
  'other',
];
const HEARD_FROM = ['tiktok', 'instagram', 'telegram', 'youtube', 'friend', 'appstore', 'other'];

// «Знаю»: застосунок тримає до 500 найновіших слів, кожне — англійський
// термін зі списку (не довший за 60 символів, див. lexicon.TERM_MAX).
const KNOWN_MAX = 500;
const KNOWN_LEN = lexicon.TERM_MAX;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// Лише канонічна дата: «2026-02-30» Date.UTC мовчки перекотив би в березень.
function isDay(v) {
  return typeof v === 'string' && DAY_RE.test(v) && billing.addDays(v, 0) === v;
}

// Рівень 1–10 або null (не задано). null, true чи порожній рядок — не
// рівень: Number(null) дав би 0, а з ним — найлегші слова для будь-кого.
function level(v) {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim())) return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(1, Math.round(n)));
}

function goals(v) {
  const given = new Set(Array.isArray(v) ? v : []);
  return GOALS.filter((g) => given.has(g));
}

function field(v) {
  return FIELDS.includes(v) ? v : null;
}

function heardFrom(v) {
  return HEARD_FROM.includes(v) ? v : null;
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

// Профіль для розкладу слова дня або null (не персоналізовано — загальні
// слова, як у v1). since — локальний день, коли профіль востаннє змінили:
// з нього починається прогрес. Майбутня чи хибна дата — це «сьогодні».
function forSchedule(raw, today) {
  if (!isPlainObject(raw)) return null;
  const since = isDay(raw.since) && raw.since <= today ? raw.since : today;
  return { goals: goals(raw.goals), field: field(raw.field), level: level(raw.level), since };
}

// «Знаю» → множина нормалізованих термінів. Довші за 60 символів — не наші
// терміни (обрізати не можна: вийшло б інше слово). Понад 500 різних —
// лишаємо останні: застосунок дописує нові в кінець.
function known(raw) {
  const out = new Set();
  if (!Array.isArray(raw)) return out;
  for (let i = raw.length - 1; i >= 0 && out.size < KNOWN_MAX; i--) {
    const t = raw[i];
    if (typeof t !== 'string' || !t.trim() || t.trim().length > KNOWN_LEN) continue;
    out.add(lexicon.norm(t));
  }
  return out;
}

// Що зберігаємо в users/<id>.profile, щоб власник міг порахувати відповіді.
// Поле, якого в запиті немає зовсім, лишається з попереднього профілю:
// «звідки дізнались» питають раз, і редактор у Параметрах не мусить його
// знати, щоб не стерти.
function forStorage(raw, previous) {
  const prev = isPlainObject(previous) ? previous : {};
  const has = (k) => Object.hasOwn(raw, k);
  return {
    goals: has('goals') ? goals(raw.goals) : goals(prev.goals),
    field: has('field') ? field(raw.field) : field(prev.field),
    level: has('level') ? level(raw.level) : level(prev.level),
    heardFrom: has('heardFrom') ? heardFrom(raw.heardFrom) : heardFrom(prev.heardFrom),
  };
}

module.exports = {
  GOALS,
  FIELDS,
  HEARD_FROM,
  KNOWN_MAX,
  KNOWN_LEN,
  isDay,
  isPlainObject,
  level,
  goals,
  field,
  heardFrom,
  forSchedule,
  known,
  forStorage,
};
