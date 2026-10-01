// Анонімна ідентичність пристрою.
//
// У v1 немає реєстрації: при першому запуску застосунок тихо отримує від
// сервера id і токен. Цього досить для слова дня (свій порядок слів),
// серверного ліміту сканів і прив'язки підписки RevenueCat.
//
// Токен лежить у Keychain (SecureStore). На iOS Keychain переживає
// видалення застосунку — тож перевстановлення не обнуляє ні ліміт сканів,
// ні зв'язок із покупкою.
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiCreateDevice, apiDeleteMe, apiMe, deviceForgotten, setSessionToken } from './api';

// SecureStore = Keychain на iOS. На вебі (лише для перегляду верстки) модуль
// є, але порожній — тоді тримаємо токен в AsyncStorage.
let SecureStore = null;
if (Platform.OS !== 'web') {
  try {
    SecureStore = require('expo-secure-store');
    if (typeof SecureStore.getItemAsync !== 'function') SecureStore = null;
  } catch (_) {}
}

const TOKEN_KEY = 'll_token';
const USER_KEY = 'll_device_v1';
// Після першого розблокування після перезавантаження — щоб токен був
// доступний і для фонових задач, але не до того, як людина ввела код.
const KEYCHAIN = SecureStore ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined;

async function readToken() {
  try {
    if (SecureStore) return (await SecureStore.getItemAsync(TOKEN_KEY, KEYCHAIN)) || '';
  } catch (_) {}
  try {
    return (await AsyncStorage.getItem('sec_' + TOKEN_KEY)) || '';
  } catch (_) {
    return '';
  }
}

async function writeToken(token) {
  try {
    if (SecureStore) {
      if (token) await SecureStore.setItemAsync(TOKEN_KEY, token, KEYCHAIN);
      else await SecureStore.deleteItemAsync(TOKEN_KEY, KEYCHAIN);
      return;
    }
  } catch (_) {}
  try {
    if (token) await AsyncStorage.setItem('sec_' + TOKEN_KEY, token);
    else await AsyncStorage.removeItem('sec_' + TOKEN_KEY);
  } catch (_) {}
}

// Повертає { token, userId } або null, якщо ідентичності ще немає, а сервер
// зараз недоступний (тоді спробуємо знову при наступному старті чи скані).
// userId буває null: токен є, але id ще не вдалося спитати (див. нижче).
export async function ensureSession() {
  const token = await readToken();
  let userId = null;
  try {
    userId = (await AsyncStorage.getItem(USER_KEY)) || null;
  } catch (_) {}
  if (token) setSessionToken(token);
  if (token && userId) return { token, userId };
  if (token) {
    // Токен є, а id немає — застосунок перевстановили: Keychain пережив
    // видалення, AsyncStorage ні. Питаємо id у сервера, а не заводимо нову
    // ідентичність — інакше перевстановлення обнуляло б ліміт сканів, а Pro
    // отримував би новий appUserID у RevenueCat.
    try {
      const me = await apiMe();
      const id = me?.user?.id || null;
      if (id) await AsyncStorage.setItem(USER_KEY, id).catch(() => {});
      return { token, userId: id };
    } catch (e) {
      // Офлайн чи збій сервера — токен лишаємо, id спитаємо наступного разу.
      // Нову ідентичність — лише якщо сервер справді забув цей токен.
      if (!deviceForgotten(e)) return { token, userId: null };
    }
  }
  return createIdentity();
}

// Нова ідентичність від сервера. Старі токен і id переписуємо лише ПІСЛЯ
// того, як сервер видав нові: збій мережі посередині не має лишати пристрій
// зовсім без ідентичності.
async function createIdentity() {
  try {
    const d = await apiCreateDevice();
    await writeToken(d.token);
    await AsyncStorage.setItem(USER_KEY, d.user.id).catch(() => {});
    setSessionToken(d.token);
    return { token: d.token, userId: d.user.id };
  } catch (_) {
    return null;
  }
}

// Сервер забув пристрій (стерли дані або змінили AUTH_SECRET) — тихо
// отримуємо нову ідентичність. Не вдалось — старі токен і id лишаються,
// спробуємо наступного разу.
export function renewSession() {
  return createIdentity();
}

// «Стерти мої дані»: прибираємо запис на сервері й починаємо з чистого
// аркуша. Кидає помилку, якщо сервер недоступний, — інакше людина думала б,
// що дані стерто. Старий токен видаляємо з Keychain одразу: навіть якщо
// нову ідентичність зараз отримати не вдасться, наступний старт почнеться
// з нуля, а не з токена стертого запису.
export async function eraseServerData() {
  await apiDeleteMe();
  await writeToken('');
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
  setSessionToken('');
  return createIdentity();
}
