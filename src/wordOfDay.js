// «Слово дня»: щодня нове слово, унікальне для кожного користувача (порядок
// задає його seed на сервері), без повторів.
//
// Як працює:
//   1. Апка просить у сервера слова на 14 днів наперед — разом із профілем
//      (цілі, сфера, рівень) і словами, які людина позначила «Знаю».
//   2. Кешує їх локально — картка слова дня й віджет живуть навіть офлайн,
//      а два тижні запасу переживають і довгі відключення світла.
//   3. Планує по локальному сповіщенню на кожен день о заданій годині.
import { Platform } from 'react-native';
import { apiWordOfDay } from './api';
import { cleanProfile, topicName } from './profile';
import { loadWod, persistWod, localDayKey } from './storage';
import { TRIAL_REMIND_DAYS } from './subscription';

export const WOD_DAYS = 14;
// Оновлюємо, коли наперед лишилось менше тижня: хто відкриває застосунок
// хоч раз на тиждень, завжди має щонайменше 7 днів запасу, а запит іде не
// частіше, ніж раз на тиждень.
const REFRESH_BELOW = 7;

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

// Чи зможемо нагадати про кінець пробного періоду: дозвіл уже є або його
// ще можна спитати. Людині, що заборонила сповіщення, пейвол такого не обіцяє.
export async function canRemind() {
  if (!Notifications) return false;
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.status === 'granted' || p.canAskAgain !== false;
  } catch (_) {
    return false;
  }
}

// Стан дозволу для онбордингу: 'undetermined' — ще не питали (тоді й
// показуємо екран-пояснення перед системним запитом), 'granted', 'denied'
// (iOS більше не спитає — лише Параметри), 'unavailable' — модуля немає.
export async function permissionStatus() {
  if (!Notifications) return 'unavailable';
  try {
    const p = await Notifications.getPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    if (p.canAskAgain === false) return 'denied';
    return 'undetermined';
  } catch (_) {
    return 'unavailable';
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

// Підпис того, з чим кеш брали: профіль (цілі, сфера, рівень, з якого дня)
// і список «Знаю». Інший підпис — кеш складений для іншої людини: новий
// рівень, нова сфера чи щойно позначене «Знаю» мусять дати інші слова.
// Список «Знаю» обрізаний до 500 найновіших — тож окрім довжини беремо й
// останнє слово, інакше після пʼятисотого «Знаю» підпис перестав би мінятись.
export function wodSignature(profile, known) {
  const p = cleanProfile(profile);
  const k = Array.isArray(known) ? known : [];
  const head = p ? [p.goals.join('+'), p.field || '-', p.level, p.since].join('|') : 'general';
  return `${head}#${k.length}:${k[k.length - 1] || ''}`;
}

// Чи треба оновити кеш: немає, інші мови, інший профіль чи «Знаю», або
// наперед лишилось менше тижня.
export function needsRefresh(cache, { lang, native, sig }) {
  if (!cache || !Array.isArray(cache.words) || !cache.words.length) return true;
  if (cache.lang !== lang || cache.native !== native) return true;
  if (cache.sig !== sig) return true;
  const today = localDayKey();
  const future = cache.words.filter((w) => w.date >= today);
  return future.length < REFRESH_BELOW;
}

// Виклики йдуть по черзі. Два «Знаю» поспіль — це два запити, і якби
// відповідь на перший прийшла пізніше, вона затерла б свіжіший кеш: на
// картці знову зʼявилось би щойно відкинуте слово. У черзі кожен наступний
// бачить кеш, який лишив попередній.
let queue = Promise.resolve();

// Головна функція: оновити кеш + перепланувати сповіщення.
// Викликається при старті апки і при зміні мов, профілю, «Знаю» й налаштувань.
// t — перекладач інтерфейсу (мовою телефону, не «моєю мовою»): тема в
// заголовку сповіщення («Фінанси · liquidity»).
export function syncWordOfDay(opts) {
  const run = queue.then(() => doSync(opts));
  queue = run.catch(() => {});
  return run;
}

async function doSync({ lang, native, enabled, hour = DEFAULT_HOUR, force = false, profile = null, known = [], t = null }) {
  let cache = await loadWod();
  const clean = cleanProfile(profile);
  const list = Array.isArray(known) ? known : [];
  const sig = wodSignature(clean, list);

  if (force || needsRefresh(cache, { lang, native, sig })) {
    try {
      const d = await apiWordOfDay({ days: WOD_DAYS, lang, native, profile: clean, known: list });
      if (d && Array.isArray(d.words) && d.words.length) {
        cache = { lang, native, sig, words: d.words, fetchedAt: Date.now() };
        await persistWod(cache);
      }
    } catch (_) {
      // офлайн або не авторизований — лишаємо старий кеш
    }
  }

  await rescheduleNotifications(cache, enabled, hour, t);
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

// Заголовок сповіщення: тема перед словом («Фінанси · liquidity»), щоб було
// видно, що слово підібране під людину. Загальні слова — просто слово.
export function notificationTitle(w, t) {
  const topic = topicName(t, w.topic);
  return topic ? `${topic} · ${w.word}` : w.word;
}

// Плануємо по одному сповіщенню на кожен майбутній день із кешу
export async function rescheduleNotifications(cache, enabled, hour = DEFAULT_HOUR, t = null) {
  if (!Notifications) return;
  await cancelWordOfDay();

  if (!enabled || !cache || !Array.isArray(cache.words)) return;
  if (!(await hasPermission())) return;

  if (Platform.OS === 'android') {
    try {
      // Назву каналу Android показує в налаштуваннях сповіщень — мовою інтерфейсу
      await Notifications.setNotificationChannelAsync('word-of-day', {
        name: t ? t('dailyPush') : 'Word of the day',
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
          title: notificationTitle(w, t),
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

// Коли нагадати про кінець пробного періоду: за 2 дні до списання, як
// обіцяє пейвол («День 5 — нагадаємо» для тижня). Купили о 23:40 чи о 2-й
// ночі — нагадування в ту саму годину прийшло б уночі й загубилось би серед
// нічних сповіщень. Тоді переносимо його РАНІШЕ, на 20:00 того ж (пізня
// ніч) чи попереднього (рання ніч) вечора: людина дізнається трохи раніше,
// але ніколи пізніше, ніж за 2 дні. → мс або null, якщо вже запізно.
export function trialReminderAt(untilMs, now = Date.now()) {
  if (!Number.isFinite(untilMs)) return null;
  const at = new Date(untilMs - TRIAL_REMIND_DAYS * 86400000);
  const h = at.getHours();
  if (h >= 22 || h < 8) {
    const evening = new Date(at);
    if (h < 8) evening.setDate(evening.getDate() - 1);
    evening.setHours(20, 0, 0, 0);
    // вечір уже минув (короткий пробний період) — лишаємо точну годину
    if (evening.getTime() > now + 60000) return evening.getTime();
  }
  return at.getTime() > now + 60000 ? at.getTime() : null;
}

// Нагадування про кінець пробного періоду.
// Apple надсилає своє, але ми не покладаємось на це: людина має дізнатись
// про майбутнє списання від нас, а не з виписки по картці.
export async function scheduleTrialReminder(untilMs, title, body) {
  if (!Notifications) return false;
  try {
    const at = trialReminderAt(untilMs);
    if (!at) return false;
    const when = new Date(at);
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
