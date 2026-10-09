// Saving words and settings (AsyncStorage)
import AsyncStorage from '@react-native-async-storage/async-storage';

const WORDS_KEY = 'll_words_v1';
const SETTINGS_KEY = 'll_settings_v1';
const ACTIVITY_KEY = 'll_activity_v1';
const ONBOARDED_KEY = 'll_onboarded_v1';
const STATS_KEY = 'll_stats_v1';
const SEEN_ACH_KEY = 'll_seen_ach_v1';
const WOD_KEY = 'll_wod_v1';

// ---- counters for achievements (quizzes, word of the day, etc.) ----
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

// ---- achievements already shown (so we do not celebrate twice) ----
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

// ---- cache of the "word of the day" for several days ahead ----
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

// Local date in the format 2026-07-21 (for the streak and the chart)
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

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { autoSpeak: true, targetLang: 'en' };
  } catch (_) {
    return { autoSpeak: true, targetLang: 'en' };
  }
}

export async function persistSettings(settings) {
  try {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (_) {}
}
