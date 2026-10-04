// Профіль навчання: для чого людина вчить мову, чим займається і який має
// рівень. З нього сервер складає слово дня (див. POST /word-of-day у
// server.js): фінансистові — фінанси, студентові — академічні слова, а тому,
// хто оцінив себе на 8/10, — ніколи не «finance» чи «project».
//
// Тут лише чиста логіка без React: нормалізація, підписи, підсумки. Екрани —
// у ProfileSteps.js, слайдер — у LevelSlider.js.
//
// Форма профілю (settings.profile; null — не налаштовано, слово дня загальне):
//   { goals: ['work', …] (≥ 1), field: 'finance' | … | null, level: 1…10,
//     since: 'YYYY-MM-DD' — локальний день останньої зміни; з нього сервер
//     рахує чергу тем, тож зміна профілю починає її спочатку }
import { localDayKey } from './storage';

export const GOALS = ['work', 'study', 'travel', 'relocation', 'self'];
export const FIELDS = [
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
// Теми, з яких сервер бере слова (server/topics/<key>.js)
export const TOPICS = [
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
// «Звідки дізнались» — TikTok першим, як у Duolingo: так менше людей
// тиснуть «Інше» з лінощів, а саме TikTok ми й хочемо міряти.
export const HEARD = ['tiktok', 'instagram', 'telegram', 'youtube', 'friend', 'appstore', 'other'];
// Назви брендів не перекладаються — вони однакові в усіх мовах.
export const HEARD_BRANDS = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  telegram: 'Telegram',
  youtube: 'YouTube',
  appstore: 'App Store',
};

export const LEVEL_MIN = 1;
export const LEVEL_MAX = 10;
// Середина шкали. Нею стартує слайдер і її ж бере профіль, якщо крок рівня
// пропустили: крайні значення відсікали б половину слів наосліп.
export const DEFAULT_LEVEL = 5;
// Скільки «Знаю» зберігаємо (найновіші). Сервер приймає до 500.
export const MAX_KNOWN = 500;
// Скільки «Знаю» поспіль — привід запропонувати вищий рівень.
export const KNOW_STREAK = 3;

// Бал → рівень CEFR. Шкала від власника: 1 ≈ A1 … 10 ≈ C2.
const CEFR = [null, 'A1', 'A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2'];
// Мітки під слайдером — там, де починається новий рівень.
export const CEFR_MARKS = [
  { level: 1, label: 'A1' },
  { level: 3, label: 'A2' },
  { level: 5, label: 'B1' },
  { level: 7, label: 'B2' },
  { level: 9, label: 'C1' },
  { level: 10, label: 'C2' },
];

const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function clampLevel(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return DEFAULT_LEVEL;
  return Math.min(LEVEL_MAX, Math.max(LEVEL_MIN, v));
}

export function cefrFor(level) {
  return CEFR[clampLevel(level)];
}

// Сфера потрібна лише тим, хто вчить мову для роботи чи навчання:
// мандрівникові «Чим ти займаєшся?» нічого не додало б.
export function needsField(goals) {
  return Array.isArray(goals) && (goals.includes('work') || goals.includes('study'));
}

// Лише навчання (без роботи) — тоді питаємо «Що вивчаєш?».
export function studyOnly(goals) {
  return Array.isArray(goals) && goals.includes('study') && !goals.includes('work');
}

// Профіль у тому вигляді, який розуміє сервер, або null. Невідомі цілі й
// сфери відкидаємо, рівень — ціле 1…10, порядок цілей — як у GOALS (від нього
// залежить підпис кешу). Сфера без роботи й навчання не діє — прибираємо.
export function cleanProfile(p, today = localDayKey()) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.goals)) return null;
  const goals = GOALS.filter((g) => p.goals.includes(g));
  if (!goals.length) return null;
  const field = needsField(goals) && FIELDS.includes(p.field) ? p.field : null;
  const since = typeof p.since === 'string' && DAY.test(p.since) && p.since <= today ? p.since : today;
  return { goals, field, level: clampLevel(p.level), since };
}

// Те саме для того, що бачить людина: цілі, сфера, рівень (без since).
export function sameProfile(a, b) {
  const x = cleanProfile(a);
  const y = cleanProfile(b);
  if (!x || !y) return !x && !y;
  return x.goals.join() === y.goals.join() && x.field === y.field && x.level === y.level;
}

// Відповіді онбордингу чи редактора → профіль.
//   goals порожні й рівень не обрано — людина все пропустила: профіль не
//   міняється (у новачка лишається null, у повторі — той, що був);
//   цілі пропущені, а рівень є — «для себе»: саме це людина й отримає,
//   загальні слова її рівня;
//   нічого не змінилось — той самий об'єкт, щоб не скинути since і чергу тем.
export function profileFromAnswers({ goals, field, level }, previous = null, today = localDayKey()) {
  const chosen = Array.isArray(goals) ? goals : [];
  if (!chosen.length && level == null) return previous || null;
  const next = cleanProfile(
    {
      goals: chosen.length ? chosen : ['self'],
      field,
      level: level ?? previous?.level ?? DEFAULT_LEVEL,
      since: today,
    },
    today
  );
  if (previous && sameProfile(previous, next)) return previous;
  return next;
}

// Головна тема профілю — та, про яку варто сказати людині («нове слово з
// фінансів»). Порядок той самий, що у вагах сервера: сфера найважливіша.
export function primaryTopic(profile) {
  const p = cleanProfile(profile);
  if (!p) return null;
  if (p.field && p.field !== 'other') return p.field;
  if (p.goals.includes('work')) return 'workplace';
  if (p.goals.includes('study')) return 'academic';
  if (p.goals.includes('relocation')) return 'relocation';
  if (p.goals.includes('travel')) return 'travel';
  return null;
}

// Назва теми слова дня («Фінанси») або '' для загальних слів і невідомих
// ключів: makeT показав би сам ключ, а «topic_x» на картці гірше за нічого.
export function topicName(t, key) {
  if (typeof t !== 'function' || !key || key === 'general' || !TOPICS.includes(key)) return '';
  return t('topic_' + key);
}

// Підсумок для рядка в Параметрах: «Фінанси · B2+», «Подорожі · A2».
export function profileSummary(profile, t) {
  const p = cleanProfile(profile);
  if (!p) return t('pfNotSet');
  const topic = primaryTopic(p);
  const head = topic ? t('topic_' + topic) : t('goal_' + p.goals[0]);
  return `${head} · ${cefrFor(p.level)}`;
}

// Діапазон рівня для підсумкового рядка під слайдером. Межі ті самі, що в
// правилах сервера: 1–3, 4–5, 6–7, 8, 9–10.
export function levelBand(level) {
  const v = clampLevel(level);
  if (v <= 3) return 1;
  if (v <= 5) return 2;
  if (v <= 7) return 3;
  if (v === 8) return 4;
  return 5;
}

// «8/10 · B2+ — пропускаємо базові слова, починаємо зі складніших»
export function levelResult(level, t) {
  const v = clampLevel(level);
  return `${v}/10 · ${cefrFor(v)} — ${t('levelBand' + levelBand(v))}`;
}

// Слово, яке людина знає, — в кінець списку (найновіше), без повторів і не
// більше MAX_KNOWN. Ключ — англійське поняття (source), не переклад:
// сервер обирає саме поняття, а переклад залежить від мови.
export function addKnown(list, word) {
  const w = typeof word === 'string' ? word.trim() : '';
  const prev = Array.isArray(list) ? list.filter((x) => typeof x === 'string' && x) : [];
  if (!w) return prev;
  const low = w.toLowerCase();
  return [...prev.filter((x) => x.toLowerCase() !== low), w].slice(-MAX_KNOWN);
}

// Пропозиція підняти рівень: після KNOW_STREAK «Знаю» поспіль і лише
// якщо є куди. null — нічого не пропонуємо.
export function levelUpOffer(profile, streak) {
  const p = cleanProfile(profile);
  if (!p || p.level >= LEVEL_MAX || !(streak >= KNOW_STREAK)) return null;
  return p.level + 1;
}

// Тіло POST /me/profile: лише те, що людина справді вказала. Без профілю —
// тільки «звідки дізнались»; рівень, якого немає, не вигадуємо.
export function profileReport(profile, heardFrom) {
  const p = cleanProfile(profile);
  return {
    ...(p ? { goals: p.goals, field: p.field, level: p.level } : null),
    ...(HEARD.includes(heardFrom) ? { heardFrom } : null),
  };
}
