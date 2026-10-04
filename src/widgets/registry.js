// Реєстр трьох віджетів: «Слово дня», «Мої слова», «Серія».
//
// Нативна частина є лише в iOS-збірці (не в Expo Go, не на Android, не в
// jest без заглушки), тож модуль розмітки підтягуємо ліниво й тихо
// повертаємо null, якщо його немає. Expo Go і Android відсіюємо ДО require:
// лінивий require поза ініціалізацією модулів Metro загортає сам і віддає
// помилку в reportFatalError (червоний екран), а не в наш catch. try лишається
// для збірок, де модуля немає з інших причин.
//
// createWidget заодно кладе розмітку в App Group — без цього розширення не
// знає, що малювати, і віджет, доданий до першого оновлення, показав би
// червоне «No layout found». Тому App реєструє всі три на першому запуску,
// навіть без даних (порожній стан).
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const KINDS = ['WordOfDay', 'MyWords', 'Streak'];

// name → віджет | null (undefined — ще не пробували)
const cache = {};

function nativeAvailable() {
  return Platform.OS === 'ios' && Constants.executionEnvironment !== 'storeClient';
}

// Шляхи — літерали: Metro збирає лише статичні require.
function load(name) {
  switch (name) {
    case 'WordOfDay':
      return require('./WordOfDayWidget').default;
    case 'MyWords':
      return require('./MyWordsWidget').default;
    case 'Streak':
      return require('./StreakWidget').default;
    default:
      return null;
  }
}

export function getWidget(name) {
  if (cache[name] !== undefined) return cache[name];
  cache[name] = null;
  if (!KINDS.includes(name) || !nativeAvailable()) return null;
  try {
    cache[name] = load(name) || null;
  } catch (_) {}
  return cache[name];
}

// Чи є на цьому телефоні віджети (iOS-збірка з нативною частиною). Лише
// тоді має сенс крок «Віджети» в онбордингу й підказка «додай віджет».
export function widgetsAvailable() {
  return KINDS.some((name) => !!getWidget(name));
}
