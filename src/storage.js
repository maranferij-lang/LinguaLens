// Збереження слів і налаштувань (AsyncStorage)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearScenes } from './scene/scenes';

const WORDS_KEY = 'll_words_v1';
const SETTINGS_KEY = 'll_settings_v1';
const ACTIVITY_KEY = 'll_activity_v1';
const ONBOARDED_KEY = 'll_onboarded_v1';
const STATS_KEY = 'll_stats_v1';
const SEEN_ACH_KEY = 'll_seen_ach_v1';
const WOD_KEY = 'll_wod_v1';
const ONB_DRAFT_KEY = 'll_onb_draft_v1';

// ---- лічильники для досягнень (квізи, слово дня тощо) ----
export async function loadStats() {
  try {
    const raw = await AsyncStorage.getItem(STATS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}
export async function persistStats(stats) {
  try {
    await AsyncStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch (_) {}
}

// ---- вже показані досягнення (щоб не святкувати двічі) ----
export async function loadSeenAchievements() {
  try {
    const raw = await AsyncStorage.getItem(SEEN_ACH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}
export async function persistSeenAchievements(ids) {
  try {
    await AsyncStorage.setItem(SEEN_ACH_KEY, JSON.stringify(ids));
  } catch (_) {}
}

// ---- кеш «слова дня» на кілька днів наперед ----
export async function loadWod() {
  try {
    const raw = await AsyncStorage.getItem(WOD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}
export async function persistWod(data) {
  try {
    await AsyncStorage.setItem(WOD_KEY, JSON.stringify(data));
  } catch (_) {}
}

export async function loadOnboarded() {
  try {
    return (await AsyncStorage.getItem(ONBOARDED_KEY)) === '1';
  } catch (_) {
    return false;
  }
}

export async function persistOnboarded() {
  try {
    await AsyncStorage.setItem(ONBOARDED_KEY, '1');
  } catch (_) {}
}

// ---- чернетка онбордингу: крок, відповіді й варіант ----
// iOS вбиває застосунок, коли в Параметрах міняють доступ до камери (чи
// просто вивантажує його з пам'яті), — і людина, повернувшись, мусила б
// відповідати на все спочатку. Тож поки онбординг не скінчився, його стан
// лежить тут. Лише на телефоні: нікуди не надсилається.
//
// Але лише на чверть години (онбординг 3.0, onboarding.md §10.1): людина,
// яку система вибила посеред знайомства, повертається за хвилину-дві й
// продовжує; а «відкрила завтра» — це новий старт, з першого екрана й з
// порожніми відповідями. Чернетка старшого формату (без v: 3) — теж новий
// старт: її кроки належать іншому потоку. Онбординг 4.0 формат не змінив,
// лише додав ver: 4 — порядок кроків (restoreDraft в OnboardingScreen.js).
export const DRAFT_VERSION = 3;
export const DRAFT_TTL_MS = 15 * 60 * 1000;

// Чи ще жива чернетка: формат v3 і не старша за 15 хвилин
export function draftFresh(d, now = Date.now()) {
  if (!d || typeof d !== 'object' || d.v !== DRAFT_VERSION) return false;
  const at = Number(d.at);
  return Number.isFinite(at) && now - at >= 0 && now - at <= DRAFT_TTL_MS;
}

// → чернетка або null. Прострочену чи чужого формату одразу стираємо:
// наступний старт її вже не побачить.
export async function loadOnboardingDraft(now = Date.now()) {
  let d = null;
  try {
    const raw = await AsyncStorage.getItem(ONB_DRAFT_KEY);
    d = raw ? JSON.parse(raw) : null;
  } catch (_) {
    d = null;
  }
  if (!d || typeof d !== 'object') return null;
  if (!draftFresh(d, now)) {
    await clearOnboardingDraft();
    return null;
  }
  return d;
}
// Кожен запис отримує формат і час — від нього рахуються 15 хвилин.
export async function persistOnboardingDraft(draft) {
  try {
    await AsyncStorage.setItem(ONB_DRAFT_KEY, JSON.stringify({ ...draft, v: DRAFT_VERSION, at: Date.now() }));
  } catch (_) {}
}
export async function clearOnboardingDraft() {
  try {
    await AsyncStorage.removeItem(ONB_DRAFT_KEY);
  } catch (_) {}
}

// ---- розробка: «Онбординг на кожному старті» ----
// Перемикач секції «Розробка» в Параметрах (лише dev-збірка): на старті
// застосунок поводиться так, ніби онбординг ще не пройдено, нічого не
// стираючи, — для зйомки екранів. Читає й пише його лише App у __DEV__.
const DEV_ONB_KEY = 'll_dev_onb_always';
export async function loadDevOnbAlways() {
  try {
    return (await AsyncStorage.getItem(DEV_ONB_KEY)) === '1';
  } catch (_) {
    return false;
  }
}
export async function persistDevOnbAlways(on) {
  try {
    if (on) await AsyncStorage.setItem(DEV_ONB_KEY, '1');
    else await AsyncStorage.removeItem(DEV_ONB_KEY);
  } catch (_) {}
}

// Локальна дата у форматі 2026-07-21 (для стріка і графіка)
export function localDayKey(d = new Date()) {
  return (
    d.getFullYear() +
    '-' +
    String(d.getMonth() + 1).padStart(2, '0') +
    '-' +
    String(d.getDate()).padStart(2, '0')
  );
}

export async function loadActivity() {
  try {
    const raw = await AsyncStorage.getItem(ACTIVITY_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) {
    return {};
  }
}

export async function persistActivity(activity) {
  try {
    await AsyncStorage.setItem(ACTIVITY_KEY, JSON.stringify(activity));
  } catch (_) {}
}

export async function loadWords() {
  try {
    const raw = await AsyncStorage.getItem(WORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

export async function persistWords(words) {
  try {
    await AsyncStorage.setItem(WORDS_KEY, JSON.stringify(words));
  } catch (_) {}
}

// Лише те, що справді збережено. Типові значення (мови з телефону тощо)
// додає App через mergeSettings: «запасний» targetLang тут перебивав би
// мову за замовчуванням, і англомовний телефон стартував з English → English.
export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    const st = raw ? JSON.parse(raw) : null;
    return st && typeof st === 'object' ? st : {};
  } catch (_) {
    return {};
  }
}

// Збережене поверх типового. Якщо мови збіглися (стара версія зберігала
// targetLang без рідної мови або вже записала English → English), рідну —
// мову інтерфейсу — лишаємо, а мовою навчання стає типова; збігається й
// вона — беремо типову рідну, як обмін місцями в saveSetting.
export function mergeSettings(defaults, stored) {
  const next = { ...defaults, ...stored };
  if (next.targetLang === next.nativeLang) {
    next.targetLang = defaults.targetLang !== next.nativeLang ? defaults.targetLang : defaults.nativeLang;
  }
  return next;
}

export async function persistSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}

// «Стерти все»: слова, статистика, досягнення, кеш слова дня, лічильник,
// чернетка онбордингу (у ній імʼя й відповіді) і сцени разом із їхніми
// фото. Налаштування (мова, тема) й позначку онбордингу лишаємо — людина
// не просила знову проходити знайомство з застосунком.
export async function clearLocalData() {
  try {
    await AsyncStorage.multiRemove([WORDS_KEY, ACTIVITY_KEY, STATS_KEY, SEEN_ACH_KEY, WOD_KEY, ONB_DRAFT_KEY, 'll_usage_v1']);
  } catch (_) {}
  await clearScenes();
}

// Вихід з акаунта Apple: слова й прогрес лишаються в акаунті, а з телефона
// йдуть. Кеш слова дня й лічильник сканів — не особисті дані, їх
// не чіпаємо (див. account.js).
export async function clearProgress() {
  try {
    await AsyncStorage.multiRemove([WORDS_KEY, ACTIVITY_KEY, STATS_KEY, SEEN_ACH_KEY]);
  } catch (_) {}
}
