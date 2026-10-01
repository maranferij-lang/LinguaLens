// «Слово дня»: щодня нове слово, унікальне для кожного користувача (порядок
// задає його seed на сервері), без повторів.
//
// Як працює:
//   1. Апка раз на кілька днів просить у сервера слова на 7 днів наперед.
//   2. Кешує їх локально — картка слова дня показується навіть офлайн.
//   3. Планує 7 локальних сповіщень (по одному на день о заданій годині).
import { Platform } from 'react-native';
import { apiWordOfDay } from './api';
import { loadWod, persistWod, localDayKey } from './storage';

// Якщо expo-notifications ще не встановлено — апка має працювати, просто без пушів.
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  if (typeof Notifications.scheduleNotificationAsync !== 'function') Notifications = null;
} catch (_) {}

export const NOTIFS_AVAILABLE = !!Notifications;
export const DEFAULT_HOUR = 10; // 10:00 за замовчуванням

// Показувати банер, навіть коли апка відкрита
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

// Тап по сповіщенню → колбек із data сповіщення.
// Холодний старт: подія приходить ще до підписки JS — її бачить лише
// getLastNotificationResponse(). Запущений застосунок — слухач.
// Обидва шляхи можуть повідомити той самий тап, тож відсіюємо за id.
export function subscribeToNotificationTaps(onTap) {
  if (!Notifications) return () => {};
  let lastId = null;
  const handle = (response) => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const req = response.notification && response.notification.request;
    if (!req || req.identifier === lastId) return;
    lastId = req.identifier;
    // щоб при наступному запуску не перекинуло на вкладку вдруге
    try {
      Notifications.clearLastNotificationResponse();
    } catch (_) {}
    onTap((req.content && req.content.data) || {});
  };
  try {
    handle(Notifications.getLastNotificationResponse());
  } catch (_) {}
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub?.remove?.();
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

// Слово на сьогодні з кешу (або null)
export function todayFrom(cache) {
  if (!cache || !Array.isArray(cache.words)) return null;
  const key = localDayKey();
  return cache.words.find((w) => w.date === key) || null;
}

// Чи треба оновити кеш: немає, інші мови, або лишилось <3 днів
function needsRefresh(cache, lang, native) {
  if (!cache || !Array.isArray(cache.words) || !cache.words.length) return true;
  if (cache.lang !== lang || cache.native !== native) return true;
  const today = localDayKey();
  const future = cache.words.filter((w) => w.date >= today);
  return future.length < 3;
}

// Головна функція: оновити кеш + перепланувати сповіщення.
// Викликається при старті апки і при зміні мов/налаштувань.
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
      // офлайн або не авторизований — лишаємо старий кеш
    }
  }

  await rescheduleNotifications(cache, enabled, hour);
  return cache;
}

// Скасовує лише сповіщення «слово дня». cancelAll тут не годиться: він
// стер би й нагадування про кінець пробного періоду.
async function cancelWordOfDay() {
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((r) => r.content && r.content.data && r.content.data.type === 'word-of-day')
        .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier))
    );
  } catch (_) {}
}

// Плануємо по одному сповіщенню на кожен майбутній день із кешу
export async function rescheduleNotifications(cache, enabled, hour = DEFAULT_HOUR) {
  if (!Notifications) return;
  await cancelWordOfDay();

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
    if (when.getTime() <= now + 60000) continue; // тільки майбутні

    try {
      await Notifications.scheduleNotificationAsync({
        identifier: 'wod-' + w.date,
        content: {
          title: w.word,
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

// Нагадування про кінець пробного періоду.
// Apple надсилає своє, але ми не покладаємось на це: людина має дізнатись
// про майбутнє списання від нас, а не з виписки по картці.
export async function scheduleTrialReminder(untilMs, title, body) {
  if (!Notifications) return false;
  try {
    const when = new Date(untilMs - 2 * 86400000); // за 2 дні до кінця
    if (when.getTime() <= Date.now() + 60000) return false;
    if (!(await hasPermission())) return false;
    await Notifications.scheduleNotificationAsync({
      identifier: 'trial-end',
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
