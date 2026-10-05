// «Слово дня»: щодня нове слово, унікальне для кожного користувача (порядок
// задає його seed на сервері), без повторів.
//
// Як працює:
//   1. Апка просить у сервера слова на 14 днів наперед — разом із профілем
//      (цілі, сфера, рівень) і словами, які людина позначила «Знаю».
//   2. Кешує їх локально — картка слова дня й віджет живуть навіть офлайн,
//      а два тижні запасу переживають і довгі відключення світла.
//   3. Планує по локальному сповіщенню на кожен день о заданій годині.
//
// Pro (v1.3): 3 або 5 слів на день — «слоти». Слот 0 — те саме слово, що й
// без Pro; слот s ≥ 1 відкривається о годині hours[s] того дня (тієї ж
// хвилини приходить його сповіщення й міняється віджет). Сервер на 5 слів
// дає лише 8 днів (≤ 42 слова на запит).
import { Platform } from 'react-native';
import { apiWordOfDay } from './api';
import { cleanProfile, topicName } from './profile';
import { loadWod, persistWod, localDayKey } from './storage';
import { TRIAL_REMIND_DAYS } from './subscription';
import { PRO_WOD_OPTIONS } from './flags';

export const WOD_DAYS = 14;
// Оновлюємо, коли наперед лишилось менше тижня: хто відкриває застосунок
// хоч раз на тиждень, завжди має щонайменше 7 днів запасу, а запит іде не
// частіше, ніж раз на тиждень. Коротша відповідь (5 слів на день — 8 днів)
// оновлюється, коли лишилась половина.
const REFRESH_BELOW = 7;
// Скільки минулих днів кеш тримає (великий віджет: «Цього тижня»).
export const PAST_DAYS = 6;
// Найбільше сповіщень «слово дня» наперед: iOS тримає не більше 64
// запланованих, решта — кінець пробного періоду й нагадування про серію.
export const WOD_NOTIFY_CAP = 56;
// Pro попросив більше слів, а сервер дав менше (RevenueCat ще не знає про
// покупку): перепитуємо не частіше, ніж раз на 10 хвилин.
const RETRY_PER_DAY_MS = 10 * 60 * 1000;
// Останнє слово дня — не пізніше цієї години (за замовчуванням).
const LAST_SLOT_HOUR = 21;

// Слів на день: 1 без Pro; у Pro — один із PRO_WOD_OPTIONS (3 або 5).
export function wodPerDay(settings, pro) {
  const n = Number(settings?.wodPerDay);
  return pro && PRO_WOD_OPTIONS.includes(n) ? n : 1;
}

const isHour = (h) => Number.isInteger(h) && h >= 0 && h <= 23;

// Стартові години слотів: рівномірно від першої до 21:00, цілі години,
// строго за зростанням (10:00 → 3: 10, 16, 21; 5: 10, 13, 16, 18, 21).
// Пізня перша година не лишає місця — тоді крок у годину, до 23:00.
export function defaultSlotHours(n, first = DEFAULT_HOUR) {
  const count = Math.min(Math.max(Math.floor(n) || 1, 1), 24);
  const start = Math.min(isHour(first) ? first : DEFAULT_HOUR, 24 - count);
  const end = Math.min(Math.max(LAST_SLOT_HOUR, start + count - 1), 23);
  const out = [];
  for (let i = 0; i < count; i++) {
    const h = count === 1 ? start : Math.round(start + (i * (end - start)) / (count - 1));
    out.push(i && h <= out[i - 1] ? out[i - 1] + 1 : h);
  }
  return out;
}

// Години слотів для людини: [wodHour, …wodHours[1…]] довжиною perDay.
// Збережені години, що не зростають чи криві, замінюємо стартовими.
export function slotHours(settings, pro) {
  const n = wodPerDay(settings, pro);
  const first = isHour(settings?.wodHour) ? settings.wodHour : DEFAULT_HOUR;
  if (n === 1) return [first];
  const saved = Array.isArray(settings?.wodHours) ? settings.wodHours : null;
  if (saved && saved.length >= n) {
    const hours = [first, ...saved.slice(1, n)];
    if (hours.every(isHour) && hours.every((h, i) => !i || h > hours[i - 1])) return hours;
  }
  return defaultSlotHours(n, first);
}

const slotOf = (w) => (Number.isInteger(w?.slot) && w.slot > 0 ? w.slot : 0);
const dayStart = (key, h = 0) => {
  const [y, m, d] = String(key).split('-').map(Number);
  return y && m && d ? new Date(y, m - 1, d, h, 0, 0, 0) : null;
};
// Різних днів наперед (сьогодні включно) — за словами слоту 0.
function daysAhead(words, today) {
  return new Set(words.filter((w) => w && w.date >= today && !slotOf(w)).map((w) => w.date)).size;
}

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
    // Той самий тап приходить двічі (getLastNotificationResponse і слухач).
    // Ключ — id разом із часом доставки: 'streak-risk' щодня той самий id, і
    // завтрашній тап без застосунку, вбитого між ними, інакше загубився б.
    const key = req && `${req.identifier}|${response.notification.date ?? ''}`;
    if (!req || key === lastId) return;
    lastId = key;
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

// Слово на сьогодні з кешу (або null) — слот 0: однакове для Free і Pro.
export function todayFrom(cache, now = new Date()) {
  if (!cache || !Array.isArray(cache.words)) return null;
  const key = localDayKey(now);
  return cache.words.find((w) => w && w.date === key && !slotOf(w)) || null;
}

// Слова дня на сьогодні (Pro: кілька на день) → { n, open, next }:
//   n    — скільки слотів сьогодні буде (не більше hours.length);
//   open — уже відкриті слова за порядком слотів, кожне з slot і hour;
//          слот 0 відкритий з півночі, слот s — з hours[s]:00;
//   next — { slot, hour } наступного слоту, або null.
// Без кешу на сьогодні — { n: 0, open: [], next: null }.
export function todaySlots(cache, hours = [DEFAULT_HOUR], now = new Date()) {
  const empty = { n: 0, open: [], next: null };
  if (!cache || !Array.isArray(cache.words)) return empty;
  const key = localDayKey(now);
  const list = Array.isArray(hours) && hours.length ? hours : [DEFAULT_HOUR];
  const bySlot = [];
  for (const w of cache.words) {
    const s = slotOf(w);
    if (w && w.date === key && s < list.length && !bySlot[s]) bySlot[s] = w;
  }
  // слоти йдуть підряд: дірка (сервер не переклав) обриває день
  let n = 0;
  while (bySlot[n]) n++;
  const open = [];
  let next = null;
  for (let s = 0; s < n; s++) {
    const at = dayStart(key, list[s]);
    if (s === 0 || now >= at) open.push({ ...bySlot[s], slot: s, hour: list[s] });
    else if (!next) next = { slot: s, hour: list[s] };
  }
  return { n, open, next };
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

// Чи треба оновити кеш: немає, інші мови, інший профіль чи «Знаю», інша
// кількість слів на день, або наперед лишилось менше тижня (половини
// відповіді — для 5 слів на день це 4 дні з 8).
export function needsRefresh(cache, { lang, native, sig, perDay = 1 }, now = Date.now()) {
  if (!cache || !Array.isArray(cache.words) || !cache.words.length) return true;
  if (cache.lang !== lang || cache.native !== native) return true;
  if (cache.sig !== sig) return true;
  const have = cache.perDay || 1;
  if (have !== perDay) {
    // просили стільки ж, а сервер дав менше — Pro ще не дійшов до сервера
    const short = (cache.asked || 1) === perDay && have < perDay;
    if (!short || now - (cache.fetchedAt || 0) >= RETRY_PER_DAY_MS) return true;
  }
  const today = localDayKey(new Date(now));
  const span = cache.days || WOD_DAYS;
  return daysAhead(cache.words, today) < Math.min(REFRESH_BELOW, Math.floor(span / 2));
}

// Відповідь сервера → слова кешу. Старий сервер (і GET) слотів не знає:
// усе — слот 0, тобто одне слово на день (перше, якщо їх раптом кілька).
// Слоти понад perDay відкидаємо.
function cacheWords(words, perDay) {
  const seen = new Set();
  return words
    .filter((w) => w && slotOf(w) < perDay)
    .filter((w) => {
      const id = w.date + '#' + slotOf(w);
      return !seen.has(id) && seen.add(id);
    })
    .map((w) => ({ ...w, slot: slotOf(w) }));
}

// Минулі дні (слот 0) зі старого кешу тієї ж пари мов: новий кеш починається
// з сьогодні, а великий віджет показує ще й слова цього тижня.
function pastWords(prev, { lang, native }, today) {
  if (!prev || prev.lang !== lang || prev.native !== native || !Array.isArray(prev.words)) return [];
  const from = localDayKey(new Date(dayStart(today).getTime() - PAST_DAYS * 86400000 + 12 * 3600000));
  return prev.words.filter((w) => w && !slotOf(w) && w.date < today && w.date >= from);
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

// hours — години слотів (slotHours): їх стільки, скільки слів на день;
// hour — для старих викликів, коли слово одне.
async function doSync({
  lang,
  native,
  enabled,
  hour = DEFAULT_HOUR,
  hours = null,
  force = false,
  profile = null,
  known = [],
  t = null,
}) {
  let cache = await loadWod();
  const clean = cleanProfile(profile);
  const list = Array.isArray(known) ? known : [];
  const sig = wodSignature(clean, list);
  const slots = Array.isArray(hours) && hours.length ? hours : [hour];
  const perDay = slots.length;

  if (force || needsRefresh(cache, { lang, native, sig, perDay })) {
    try {
      const d = await apiWordOfDay({ days: WOD_DAYS, lang, native, profile: clean, known: list, perDay });
      if (d && Array.isArray(d.words) && d.words.length) {
        const got = Math.min(Math.max(Math.floor(Number(d.perDay)) || 1, 1), perDay);
        const words = cacheWords(d.words, got);
        const today = localDayKey();
        cache = {
          lang,
          native,
          sig,
          perDay: got,
          asked: perDay,
          days: daysAhead(words, today),
          words: [...pastWords(cache, { lang, native }, today), ...words],
          fetchedAt: Date.now(),
        };
        await persistWod(cache);
      }
    } catch (_) {
      // офлайн або не авторизований — лишаємо старий кеш
    }
  }

  await rescheduleNotifications(cache, enabled, slots, t);
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

// Що планувати: кожне майбутнє слово кешу о годині свого слоту —
// [{ identifier, date, slot, when, word }] за часом, не більше cap.
// Слотів понад hours.length (Pro скінчився, чи людина зменшила кількість)
// не плануємо. Ідентифікатор слоту 0 — як до v1.3 ('wod-YYYY-MM-DD').
export function notificationPlan(cache, hours = [DEFAULT_HOUR], now = Date.now(), cap = WOD_NOTIFY_CAP) {
  if (!cache || !Array.isArray(cache.words)) return [];
  const list = (Array.isArray(hours) ? hours : [hours]).filter(isHour);
  if (!list.length) return [];
  const seen = new Set();
  const out = [];
  for (const w of cache.words) {
    const slot = slotOf(w);
    if (!w || slot >= list.length) continue;
    const when = dayStart(w.date, list[slot]);
    if (!when || when.getTime() <= now + 60000) continue; // тільки майбутні
    const identifier = 'wod-' + w.date + (slot ? '-' + slot : '');
    if (seen.has(identifier)) continue;
    seen.add(identifier);
    out.push({ identifier, date: w.date, slot, when, word: w });
  }
  return out.sort((a, b) => a.when - b.when).slice(0, cap);
}

// Плануємо по сповіщенню на кожне майбутнє слово з кешу (hours — години
// слотів; число — одна година, як до v1.3)
export async function rescheduleNotifications(cache, enabled, hours = [DEFAULT_HOUR], t = null) {
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

  for (const { identifier, date, slot, when, word: w } of notificationPlan(cache, hours)) {
    try {
      await Notifications.scheduleNotificationAsync({
        identifier,
        content: {
          title: notificationTitle(w, t),
          body: w.translation
            ? w.translation + (w.example ? ' · ' + w.example : '')
            : w.example || '',
          // slot — тап відкриває саме це слово дня (Pro: їх кілька)
          data: { type: 'word-of-day', date, slot },
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
