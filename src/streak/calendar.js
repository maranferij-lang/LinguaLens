// Календар телефону для смужки тижня серії: з якого дня починається тиждень
// (core.md C.1). Україна й Німеччина — з понеділка, США — з неділі.
// expo-localization: getCalendars()[0].firstWeekday — 1 неділя, 2 понеділок…
import { getCalendars } from 'expo-localization';

export function firstWeekday() {
  try {
    const d = Number(getCalendars()?.[0]?.firstWeekday);
    return d >= 1 && d <= 7 ? d : 2;
  } catch (_) {
    return 2;
  }
}

// Підпис віхи серії для смужки «5 з 7 · Тиждень»
export function milestoneName(m, t) {
  if (m === 7) return t('streakGoalWeek');
  if (m === 30) return t('streakGoalMonth');
  return t('streakGoalDays', { m });
}
