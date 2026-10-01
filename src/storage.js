// Збереження слів і налаштувань (AsyncStorage)
import AsyncStorage from '@react-native-async-storage/async-storage';

const WORDS_KEY = 'll_words_v1';
const SETTINGS_KEY = 'll_settings_v1';
const ACTIVITY_KEY = 'll_activity_v1';
const ONBOARDED_KEY = 'll_onboarded_v1';
const STATS_KEY = 'll_stats_v1';
const SEEN_ACH_KEY = 'll_seen_ach_v1';
const WOD_KEY = 'll_wod_v1';

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

// «Стерти все»: слова, статистика, досягнення, кеш слова дня і лічильник.
// Налаштування (мова, тема) й позначку онбордингу лишаємо — людина не
// просила знову проходити знайомство з застосунком.
export async function clearLocalData() {
  try {
    await AsyncStorage.multiRemove([WORDS_KEY, ACTIVITY_KEY, STATS_KEY, SEEN_ACH_KEY, WOD_KEY, 'll_usage_v1']);
  } catch (_) {}
}
