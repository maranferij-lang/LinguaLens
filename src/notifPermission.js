// Дозвіл на сповіщення з перемикачів у Параметрах («Слово дня», «Серія»).
//
// Після першого «Не дозволяти» iOS системного вікна більше не показує:
// requestPermissionsAsync одразу відповідає «ні». Перемикач, який людина
// торкнулась, смикнувся б і повернувся назад без жодного пояснення, наче
// зламаний. Тож коли дозволу вже не спитати, кажемо про це прямо й ведемо в
// Параметри iOS (єдине місце, де його можна ввімкнути). Якщо ж людина щойно
// сама натиснула «Не дозволяти» у системному вікні — нічого не додаємо: вона
// щойно зробила вибір, повчати її не треба.
//
// Онбординг має власний екран на цей випадок (OnboardingScreen) і сюди не
// ходить.
import { Alert, Linking, Platform } from 'react-native';
import { track } from './analytics';
import { makeT } from './i18n';
import { phoneUiLang } from './locale';
import { haptic } from './motion';
import { hasPermission, permissionStatus, requestPermission } from './wordOfDay';

// Перекладач мовою телефона, якщо викликач свого не передав
const deviceT = () => makeT(phoneUiLang());

// Параметри iOS цього застосунку. На вебі їх немає.
function openSystemSettings() {
  if (Platform.OS === 'web') return;
  try {
    Promise.resolve(Linking.openSettings()).catch(() => {});
  } catch (_) {}
}

// Пояснення «сповіщення вимкнено в системі» з кнопкою в Параметри.
export function explainNotificationsOff(t = deviceT()) {
  haptic('warning');
  Alert.alert(t('notifOffTitle'), t('notifOffText'), [
    { text: t('cancel'), style: 'cancel' },
    { text: t('openSettings'), onPress: openSystemSettings },
  ]);
}

// → true, якщо сповіщення дозволені (були або щойно дозволили). source —
// звідки спитали, для статистики. Дозвіл уже є — нічого не питаємо й не рахуємо.
export async function askNotifications({ t, source } = {}) {
  if (await hasPermission()) return true;
  // 'unavailable' (немає модуля, Expo Go, jest) мовчить, як і раніше
  if ((await permissionStatus()) === 'denied') {
    explainNotificationsOff(t);
    return false;
  }
  const granted = await requestPermission();
  track('push_permission', { granted, source });
  return granted;
}
