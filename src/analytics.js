// Анонімна статистика (PostHog) — одна обгортка на весь застосунок.
//
// Навіщо: без воронки «встановив → пройшов онбординг → сканував → оформив
// пробний період» неможливо зрозуміти, що лагодити першим, а без прапорців
// (feature flags) — порівняти два варіанти онбордингу на живих людях.
//
// Правила, яких тут тримаємось:
//   • Ніхто, крім цього файлу, не імпортує posthog-react-native. Решта коду
//     кличе track / setProps / flag — і ті мовчки нічого не роблять, коли
//     ключа немає (тести, локальна розробка, Expo Go) або людина вимкнула
//     «Анонімну статистику» в налаштуваннях.
//   • Анонімно: identify не викликаємо НІКОЛИ — ні з id Apple, ні з id
//     пристрою для покупок, ні з поштою чи імʼям. PostHog знає лише свій
//     випадковий id установлення.
//   • Без запису сесій, без автозбору дотиків, без IDFA (і без запиту ATT),
//     без GeoIP: країну видно з мови й часового поясу телефону, точніше —
//     не треба. Події життєвого циклу (встановлено, відкрито, згорнуто) —
//     так, це основа воронки.
//   • У властивостях подій — лише коди й числа (clean нижче відкидає решту):
//     жодного вільного тексту, слів зі словника чи перекладів.
//   • Помилки статистики ніколи не доходять до інтерфейсу.
//   • PostHogProvider не використовуємо: саме він автоматично збирає дотики
//     й екрани. Клієнт — звичайний об'єкт, події — лише ті, що названі в коді.
//   • Сховище — типове для SDK: новий API expo-file-system SDK 57 (File і
//     Paths.document) він уже вміє, окремий AsyncStorage не потрібен.
import { POSTHOG_HOST, POSTHOG_KEY } from './config';

let PostHog = null;
try {
  PostHog = require('posthog-react-native').default;
} catch (_) {}

let client = null;
// Вимкнено в налаштуваннях: клієнт (якщо вже є) лише мовчить
let enabled = false;
// Чи вже відомо рішення людини (initAnalytics викликали). Тап по сповіщенню чи
// віджету з вбитого застосунку приходить раніше — до читання налаштувань, —
// і без буфера найцінніша подія воронки («відкрито зі сповіщення») пропадала.
// Тримаємо до EARLY_MAX подій і відправляємо, лише якщо статистику не
// вимкнено; вимкнено чи її нема в збірці — викидаємо, нічого не йде.
let decided = false;
const EARLY_MAX = 20;
const early = [];

export function analyticsAvailable() {
  return !!POSTHOG_KEY && !!PostHog;
}

// Запуск. Людина вимкнула статистику — клієнта не створюємо зовсім: ні
// мережі, ні файлів. Повторний виклик нічого не міняє (див. setAnalyticsEnabled).
export function initAnalytics({ enabled: on = true } = {}) {
  enabled = !!on;
  decided = true;
  if (!enabled || client || !analyticsAvailable()) {
    early.length = 0;
    return;
  }
  try {
    client = new PostHog(POSTHOG_KEY, {
      host: POSTHOG_HOST,
      // Профіль особи з'являється лише від setProps (мова, рівень, Pro) —
      // анонімний, прив'язаний до випадкового id PostHog. Прапорці й
      // експерименти працюють і без нього: варіант рахується від id.
      personProfiles: 'identified_only',
      captureAppLifecycleEvents: true,
      enableSessionReplay: false,
      disableSurveys: true,
      disableGeoip: true,
      errorTracking: { autocapture: false },
      capturePushNotificationSubscriptions: false,
      capturePushNotificationOpened: false,
      preloadFeatureFlags: true,
    });
    // Колись вимикали й увімкнули знову — PostHog пам'ятає opt-out сам
    Promise.resolve(client.optIn()).catch(() => {});
    for (const [event, props] of early) safe(() => client.capture(event, props));
  } catch (_) {
    client = null;
  }
  early.length = 0;
}

// Перемикач «Анонімна статистика» в налаштуваннях.
export function setAnalyticsEnabled(on) {
  if (on) {
    if (!client) return initAnalytics({ enabled: true });
    enabled = true;
    safe(() => client.optIn());
    return;
  }
  enabled = false;
  // opt-out PostHog запам'ятовує сам: навіть подія, що вже в черзі
  // життєвого циклу, більше не піде
  if (client) safe(() => client.optOut());
}

export function isEnabled() {
  return !!client && enabled;
}

// Подія: назва snake_case і властивості-коди. Нічого не повертає й не кидає.
export function track(event, props) {
  if (!isEnabled()) {
    if (!decided && early.length < EARLY_MAX && analyticsAvailable()) early.push([event, clean(props)]);
    return;
  }
  safe(() => client.capture(event, clean(props)));
}

// Мова інтерфейсу, мови, рівень, цілі, Pro — як супервластивості
// (register): PostHog чіпляє їх до кожної події, тож розбивки у воронках
// працюють. Не $set: властивості людини змусили б PostHog завести профіль
// людини (personProfiles: 'identified_only' це й вимикає) — ми лишаємось
// повністю анонімними, і так дешевше.
export function setProps(props) {
  if (!isEnabled()) return;
  const p = clean(props);
  if (!p || !Object.keys(p).length) return;
  safe(() => client.register(p));
}

// «Стерти мої дані»: новий анонімний id, старі властивості — геть.
// reset() у PostHog стирає й запамʼятований opt-out: якщо статистику вже
// вимкнули, SDK знову рахував би себе увімкненим і до кінця сесії слав би
// власні події життєвого циклу під новим id. Тож вимикаємо його ще раз —
// обидва виклики йдуть однією чергою SDK, між ними нічого не проскочить.
export function resetAnalytics() {
  if (!client) return;
  safe(() => client.reset());
  if (!enabled) safe(() => client.optOut());
}

// Значення прапорця (feature flag) для A/B-тесту.
// Прапорці вже завантажені — відповідь одразу; ні — чекаємо їх не довше
// timeoutMs; не дочекались, статистика вимкнена чи прапорця немає —
// fallback. Для рядкового fallback повертаємо лише рядок (варіант
// експерименту), для булевого — true/false. Ніколи не кидає.
// Приклад: await flag('onboarding-flow', 'control', 1500) → 'control' | 'short'.
export async function flag(name, fallback, timeoutMs = 1500) {
  if (!isEnabled()) return fallback;
  try {
    const now = client.getFeatureFlag(name);
    if (now !== undefined) return pickFlag(now, fallback);
    await new Promise((resolve) => {
      let off = null;
      const timer = setTimeout(done, Math.max(0, timeoutMs));
      function done() {
        clearTimeout(timer);
        if (off) off();
        resolve();
      }
      off = client.onFeatureFlags(done);
    });
    return pickFlag(client.getFeatureFlag(name), fallback);
  } catch (_) {
    return fallback;
  }
}

function pickFlag(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (typeof fallback === 'boolean') return value === true || typeof value === 'string';
  if (typeof fallback === 'string') return typeof value === 'string' && value ? value : fallback;
  return value;
}

// Лише прості значення: коди, числа, так/ні, короткі списки кодів. Довгий
// рядок майже напевно вже не код, а текст — його обрізаємо.
const MAX_STR = 64;
const MAX_LIST = 20;
function cleanValue(v) {
  if (v === null || typeof v === 'boolean') return v;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') return v.slice(0, MAX_STR);
  return undefined;
}

export function clean(props) {
  if (!props || typeof props !== 'object') return undefined;
  const out = {};
  for (const [k, v] of Object.entries(props)) {
    if (Array.isArray(v)) {
      out[k] = v.map(cleanValue).filter((x) => x !== undefined && x !== null).slice(0, MAX_LIST);
      continue;
    }
    const c = cleanValue(v);
    if (c !== undefined) out[k] = c;
  }
  return out;
}

function safe(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch (_) {}
}
