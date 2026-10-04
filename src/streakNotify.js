// Нагадування «серія під загрозою» о 20:00 (core.md C.4.5, план §5.10).
//
// Коли застосунок іде у фон, App просить запланувати одне сповіщення на
// сьогодні 20:00 — лише якщо серія вже щонайменше 2 дні, сьогодні ще нічого
// не було, перемикач «Нагадувати про серію» увімкнено й сповіщення дозволені.
// Щойно з'явилась дія дня — знімаємо. Ідентифікатор один, 'streak-risk',
// data.type — 'streak': сповіщень цього типу ніколи не буває більше одного
// (бюджет iOS ≤ 64: слова дня ≤ 56 + trial-end + це), і модуль скасовує лише
// своє — слова дня й кінець пробного періоду не чіпає.
//
// App Review 4.5.4: нагадує людині про її власний прогрес, не реклама,
// вимикається в Параметрах.

// expo-notifications може не бути (веб, старі збірки) — тоді просто без
// нагадувань, як і слово дня (src/wordOfDay.js).
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  if (typeof Notifications.scheduleNotificationAsync !== 'function') Notifications = null;
} catch (_) {}

export const STREAK_RISK_ID = 'streak-risk';
export const STREAK_RISK_TYPE = 'streak';
export const RISK_HOUR = 20;
// Від скількох днів серії є що втрачати: один день — ще не звичка
export const RISK_MIN = 2;

// Коли нагадати сьогодні: 20:00 місцевого часу; вже пізніше (чи за хвилину
// до того) — сьогодні вже ні, → null.
export function streakRiskAt(now = new Date()) {
  const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), RISK_HOUR, 0, 0, 0);
  return at.getTime() > now.getTime() + 60000 ? at : null;
}

// Чи потрібне нагадування взагалі (без дозволу — його перевіряє schedule).
export function shouldRemind({ n, doneToday, enabled = true }) {
  return enabled !== false && (n || 0) >= RISK_MIN && !doneToday;
}

async function permitted() {
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

export async function cancelStreakRisk() {
  if (!Notifications) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(STREAK_RISK_ID);
  } catch (_) {}
}

// info — { n, doneToday } зі streakInfo; t — перекладач мовою інтерфейсу.
// → true, якщо сповіщення заплановано. Інакше старе (якщо було) знято.
export async function syncStreakRisk({ n, doneToday, enabled = true, t, now = new Date() }) {
  if (!Notifications) return false;
  const at = streakRiskAt(now);
  if (!shouldRemind({ n, doneToday, enabled }) || !at || !(await permitted())) {
    await cancelStreakRisk();
    return false;
  }
  try {
    // той самий identifier замінює вчорашнє, якщо воно чомусь лишилось
    await Notifications.scheduleNotificationAsync({
      identifier: STREAK_RISK_ID,
      content: {
        title: t('streakEvening'),
        body: t('streakNotifBody', { n }),
        data: { type: STREAK_RISK_TYPE },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
    });
    return true;
  } catch (_) {
    return false;
  }
}
