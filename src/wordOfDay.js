// "Word of the Day": a new word every day, unique for each user (the order
// is set by their seed on the server), with no repeats.
//
// How it works:
//   1. Once every few days the app asks the server for words for 7 days ahead.
//   2. It caches them locally, so the word of the day card shows even offline.
//   3. It schedules 7 local notifications (one per day at the set hour).
import { Platform } from 'react-native';
import { apiWordOfDay } from './api';
import { loadWod, persistWod, localDayKey } from './storage';

// If expo-notifications is not installed yet, the app must still work, just without pushes.
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  if (typeof Notifications.scheduleNotificationAsync !== 'function') Notifications = null;
} catch (_) {}

export const NOTIFS_AVAILABLE = !!Notifications;
export const DEFAULT_HOUR = 10; // 10:00 by default

// Show the banner even when the app is open
if (Notifications) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

export async function requestPermission() {
  if (!Notifications) return false;
  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    if (existing === 'granted') return true;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

export async function hasPermission() {
  if (!Notifications) return false;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted';
  } catch (_) {
    return false;
  }
}

// Today's word from the cache (or null)
export function todayFrom(cache) {
  if (!cache || !Array.isArray(cache.words)) return null;
  const key = localDayKey();
  return cache.words.find((w) => w.date === key) || null;
}

// Whether the cache needs refreshing: it is missing, other languages, or fewer than 3 days are left
function needsRefresh(cache, lang, native) {
  if (!cache || !Array.isArray(cache.words) || !cache.words.length) return true;
  if (cache.lang !== lang || cache.native !== native) return true;
  const today = localDayKey();
  const future = cache.words.filter((w) => w.date >= today);
  return future.length < 3;
}

// The main function: refresh the cache + reschedule the notifications.
// Called at app start and when languages/settings change.
export async function syncWordOfDay({ lang, native, enabled, hour = DEFAULT_HOUR, force = false }) {
  let cache = await loadWod();

  if (force || needsRefresh(cache, lang, native)) {
    try {
      const d = await apiWordOfDay(7, lang, native);
      if (d && Array.isArray(d.words) && d.words.length) {
        cache = { lang, native, words: d.words, fetchedAt: Date.now() };
        await persistWod(cache);
      }
    } catch (_) {
      // offline or not authorized: keep the old cache
    }
  }

  await rescheduleNotifications(cache, enabled, hour);
  return cache;
}

// We schedule one notification for every future day from the cache
export async function rescheduleNotifications(cache, enabled, hour = DEFAULT_HOUR) {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (_) {}

  if (!enabled || !cache || !Array.isArray(cache.words)) return;
  if (!(await hasPermission())) return;

  if (Platform.OS === 'android') {
    try {
      await Notifications.setNotificationChannelAsync('word-of-day', {
        name: 'Word of the day',
        importance: Notifications.AndroidImportance.DEFAULT,
      });
    } catch (_) {}
  }

  const now = Date.now();
  for (const w of cache.words) {
    const [y, m, d] = String(w.date).split('-').map(Number);
    if (!y || !m || !d) continue;
    const when = new Date(y, m - 1, d, hour, 0, 0, 0);
    if (when.getTime() <= now + 60000) continue; // only future ones

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: '📖 ' + w.word,
          body: w.translation
            ? w.translation + (w.example ? ' · ' + w.example : '')
            : w.example || '',
          data: { type: 'word-of-day', date: w.date },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: when,
          channelId: 'word-of-day',
        },
      });
    } catch (_) {}
  }
}

// A reminder about the end of the trial period.
// Apple sends its own, but we do not rely on that: the person should learn
// about the upcoming charge from us, not from a card statement.
export async function scheduleTrialReminder(untilMs, title, body) {
  if (!Notifications) return false;
  try {
    const when = new Date(untilMs - 2 * 86400000); // 2 days before the end
    if (when.getTime() <= Date.now() + 60000) return false;
    if (!(await hasPermission())) return false;
    await Notifications.scheduleNotificationAsync({
      content: { title, body, data: { type: 'trial-end' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    return true;
  } catch (_) {
    return false;
  }
}

export async function cancelAll() {
  if (!Notifications) return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (_) {}
}
