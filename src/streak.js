// Серія днів («Серія 2.0», v1.3) — чисті функції без React і без сховища.
// Єдине джерело для App (досягнення, картка «Мій тиждень»), Профілю,
// «Навчання», свята першої дії дня, віджета «Серія» й онбордингу: число
// серії, форма вогника й фраза рахуються тут і більше ніде.
//
// Активний день — будь-який день із записом в activity (збережене слово,
// відповідь у картках, правильна відповідь у квізі) або день, коли додано
// слово. Ключ дня — 'YYYY-MM-DD' за місцевим часом (localDayKey).
import { localDayKey } from './storage';

// Віхи: на них свято чекає «Продовжити», а не закривається само.
export const MILESTONES = [3, 7, 14, 30, 60, 100, 180, 365];

const asSet = (days) => (days instanceof Set ? days : new Set(days || []));
const whole = (n) => Math.max(0, Math.floor(Number(n) || 0));

// Сусідній календарний день. Опівдні, а не «зараз мінус доба»: у день
// переходу на літній чи зимовий час доба триває 23 або 25 годин, і
// віднімання 24 годин проскочило б через день або застрягло б на місці.
function shiftDay(d, by) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + by, 12);
}

function dayOf(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12) : null;
}

// Множина активних днів — так само, як її рахував App до v1.3: ключі
// activity плюс день додавання кожного слова. Слово без addedAt дало б
// 1 січня 1970-го — цей день викидаємо.
export function activeDaySet(activity, words) {
  const set = new Set([
    ...Object.keys(activity || {}),
    ...(words || []).map((w) => localDayKey(new Date(w?.addedAt || 0))),
  ]);
  set.delete(localDayKey(new Date(0)));
  return set;
}

// Серія на зараз → { n, doneToday, todayKey, lastActiveKey }.
// Рахуємо назад від сьогодні, якщо сьогодні вже щось було, інакше від
// учора: до опівночі вчорашня серія ще жива. Активний день додає 1;
// «заморожений» (frozen — захист серії, v1.3.1) лише не рве серію; будь-
// який інший день її обриває. lastActiveKey — найсвіжіший активний день не
// пізніше за сьогодні (null — активних днів ще не було): n = 0 при
// lastActiveKey ≠ null означає, що серія згасла.
export function streakInfo({ activeDays, frozen = [], now = new Date() } = {}) {
  const active = asSet(activeDays);
  const kept = asSet(frozen);
  const todayKey = localDayKey(now);
  const doneToday = active.has(todayKey);
  let n = 0;
  for (let d = shiftDay(now, doneToday ? 0 : -1); ; d = shiftDay(d, -1)) {
    const key = localDayKey(d);
    if (active.has(key)) n++;
    else if (!kept.has(key)) break;
  }
  let lastActiveKey = null;
  for (const key of active) {
    if (key <= todayKey && (!lastActiveKey || key > lastActiveKey)) lastActiveKey = key;
  }
  return { n, doneToday, todayKey, lastActiveKey };
}

// Найдовша серія за весь час (рекорд). Кривий ключ дня просто не рахується.
export function bestStreak(activeDays) {
  const days = [...asSet(activeDays)].filter((k) => dayOf(k)).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of days) {
    run = prev && localDayKey(shiftDay(dayOf(prev), 1)) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

// Форма вогника за числом днів (core.md, таблиця C.2): висота й ширина у
// viewBox 100×120, бічні язики, рівень сяйва.
//   0 — ember (жаринка, пунктир); 1–6 — kindle: щодня вищий і ширший, з
//   3-го дня язики; 7+ — lit («запалення»): градієнт, сяйво, іскри;
//   tier 2 (14+) — ще два язики й кільце, 3 (30+) — корона, 4 (100+) —
//   фіолетове серце.
const KINDLE = [null, [54, 38, 0], [62, 42, 0], [70, 46, 1], [78, 50, 2], [86, 54, 2], [94, 58, 2]];

export function flameForm(n) {
  const d = whole(n);
  if (d === 0) return { stage: 'ember', h: 46, w: 34, tongues: 0, tier: 0 };
  if (d < 7) {
    const [h, w, tongues] = KINDLE[d];
    return { stage: 'kindle', h, w, tongues, tier: 0 };
  }
  const tier = d < 14 ? 1 : d < 30 ? 2 : d < 100 ? 3 : 4;
  return { stage: 'lit', h: 104, w: 64, tongues: tier === 1 ? 2 : 4, tier };
}

// Стадія для віджета «Серія» (SF Symbols замість SVG): 0 | 1 (1–2 дні) |
// 2 (3–6) | 3 (7–29) | 4 (30+).
export function flameStage(n) {
  const d = whole(n);
  if (d === 0) return 0;
  if (d <= 2) return 1;
  if (d <= 6) return 2;
  if (d <= 29) return 3;
  return 4;
}

// Наступна віха → { m, left, progress }: скільки днів до неї і яка частка
// шляху від попередньої (0…1, для смужки). Після року віхи — щороку.
export function nextMilestone(n) {
  const d = whole(n);
  const last = MILESTONES[MILESTONES.length - 1];
  let m = MILESTONES.find((x) => x > d);
  let from = MILESTONES.filter((x) => x <= d).pop() || 0;
  if (!m) {
    m = (Math.floor(d / last) + 1) * last;
    from = m - last;
  }
  return { m, left: m - d, progress: (d - from) / (m - from) };
}

// Тиждень крапками: 7 × { key, dow, label, state } від першого дня тижня.
// firstWeekday — як у expo-localization getCalendars()[0].firstWeekday:
// 1 — неділя, 2 — понеділок (Україна, Німеччина), 7 — субота.
// labels — підписи днів від неділі (weekdayLabels(t('dowShort'))).
// state: done — минулий день із дією; missed — минулий без дії; today —
// сьогодні, дію вже зроблено; pending — сьогодні, ще ні; future — попереду.
export function weekStrip({ activeDays, now = new Date(), firstWeekday = 2, labels } = {}) {
  const active = asSet(activeDays);
  const todayKey = localDayKey(now);
  const first = ((Math.round(Number(firstWeekday)) || 2) - 1 + 7) % 7;
  const start = shiftDay(now, -((now.getDay() - first + 7) % 7));
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = shiftDay(start, i);
    const key = localDayKey(d);
    const done = active.has(key);
    let state;
    if (key > todayKey) state = 'future';
    else if (key === todayKey) state = done ? 'today' : 'pending';
    else state = done ? 'done' : 'missed';
    out.push({ key, dow: d.getDay(), label: labels?.[d.getDay()] ?? '', state });
  }
  return out;
}

// Частина доби для фраз і віджета: 'day' (до 18:00), 'evening' (18–22),
// 'late' (з 22:00 до півночі).
export function phase(now = new Date()) {
  const h = now.getHours();
  if (h < 18) return 'day';
  if (h < 22) return 'evening';
  return 'late';
}

// Єдиний вибір фрази серії — для картки в Профілі, свята, віджета й
// онбордингу. info — { n, doneToday, phase } (phase — з phase(now)), можна
// передати й lost або lastActiveKey зі streakInfo: тоді нуль після серії —
// «Серія згасла», а не «запали перший вогник».
//   { short: true } — коротка фраза для тісних місць (малий віджет, чип);
//   { line: 'next' } — другий рядок «до віхи» («До тижня — ще 3 дні…»),
//   '' для нуля.
export function streakMessage(info = {}, t, { short = false, line = 'main' } = {}) {
  const n = whole(info.n);
  if (line === 'next') {
    if (!n) return '';
    if (n < 7) return t('streakToWeek', { k: 7 - n });
    const next = nextMilestone(n);
    return t('streakToNext', { m: next.m, k: next.left });
  }
  if (!n) {
    const lost = info.lost ?? !!info.lastActiveKey;
    return t(lost ? 'streakLost' : 'streakNone');
  }
  if (!info.doneToday) {
    if (info.phase === 'late') return t('streakLate');
    if (info.phase === 'evening') return t('streakEvening');
    return t(short ? 'streakPendingShort' : 'streakPending');
  }
  if (n <= 2) return t('streakKeep', { n });
  if (n <= 6) return t('streakHabit', { n });
  if (n === 7) return t('streakWeek');
  if (n === 30) return t('streak30');
  const next = nextMilestone(n);
  return t('streakToNext', { m: next.m, k: next.left });
}
