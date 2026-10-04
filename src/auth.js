// Анонімна ідентичність пристрою.
//
// Реєстрації немає: при першому запуску застосунок тихо отримує від
// сервера id і токен. Цього досить для слова дня (свій порядок слів),
// серверного ліміту сканів і прив'язки підписки RevenueCat. Вхід через
// Apple (account.js) необов'язковий і лише підміняє цю пару на пару акаунта.
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
// Що нова ідентичність має понести в POST /auth/device як previous: токен, з
// яким телефон вийшов з акаунта, або carry від DELETE /me. Лежить, доки
// сервер справді не видасть новий запис (див. startOver, createIdentity).
const CARRY_KEY = 'll_carry';
const USER_KEY = 'll_device_v1';
// Після першого розблокування після перезавантаження — щоб токен був
// доступний і для фонових задач, але не до того, як людина ввела код.
const KEYCHAIN = SecureStore ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined;

async function readSecret(key) {
  try {
    if (SecureStore) return (await SecureStore.getItemAsync(key, KEYCHAIN)) || '';
  } catch (_) {}
  try {
    return (await AsyncStorage.getItem('sec_' + key)) || '';
  } catch (_) {
    return '';
  }
}

async function writeSecret(key, value) {
  try {
    if (SecureStore) {
      if (value) await SecureStore.setItemAsync(key, value, KEYCHAIN);
      else await SecureStore.deleteItemAsync(key, KEYCHAIN);
      return;
    }
  } catch (_) {}
  try {
    if (value) await AsyncStorage.setItem('sec_' + key, value);
    else await AsyncStorage.removeItem('sec_' + key);
  } catch (_) {}
}

const readToken = () => readSecret(TOKEN_KEY);
const writeToken = (token) => writeSecret(TOKEN_KEY, token);

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
// зовсім без ідентичності. Недонесений carry (startOver) іде з нею — і з
// наступного старту теж, — а стирається лише тоді, коли сервер уже видав
// запис із його лічильниками.
async function createIdentity(carry) {
  const previous = carry || (await readSecret(CARRY_KEY));
  try {
    const d = await apiCreateDevice(previous);
    await writeToken(d.token);
    if (previous) await writeSecret(CARRY_KEY, '');
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
// не з токена стертого запису. З нуля — усе, крім лічильників сканів і
// проби сцени: сервер віддає їх як carry без id, і нова ідентичність їх
// несе. Інакше стирання щоразу дарувало б безкоштовний скан, а в акаунті
// Apple ще й нічого не коштувало б (вийти, стерти гостя, увійти назад).
export async function eraseServerData() {
  let carry = '';
  try {
    const r = await apiDeleteMe();
    if (typeof r?.carry === 'string') carry = r.carry;
  } catch (e) {
    // Сервер уже не знає цього пристрою — стирати там нічого, тож це не
    // збій: продовжуємо з телефоном.
    if (!deviceForgotten(e)) throw e;
  }
  return startOver({ carry });
}

// Вхід через Apple віддав токен акаунта. Пишемо його туди ж і так само, як
// токен нової ідентичності: Keychain переживе перевстановлення, і після
// нього телефон одразу опиниться в тому самому акаунті.
export async function adoptSession(token, userId) {
  await writeToken(token);
  await AsyncStorage.setItem(USER_KEY, userId).catch(() => {});
  setSessionToken(token);
  return { token, userId };
}

// Лише для розробки («Почати з нуля» в діагностиці): телефон забуває свою
// ідентичність і недонесений carry, тож наступний старт — новий запис на
// сервері з нульовими лічильниками, як після чистого встановлення.
export async function forgetIdentityForDev() {
  await writeToken('');
  await writeSecret(CARRY_KEY, '');
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
  setSessionToken('');
}

// Вихід з акаунта Apple або стирання: забуваємо поточний токен і беремо
// нову анонімну ідентичність. Старий токен прибираємо ДО запиту: інакше
// збій мережі лишив би телефон в акаунті, з якого людина щойно вийшла, —
// наступний старт тихо повернув би її туди.
// carry — що нести в нову ідентичність: true — вихід, старий токен іде в
// запит, і сервер переносить його лічильники сканів і проби сцени; рядок —
// carry від DELETE /me (стирання). Інакше «вийти й увійти знову» щоразу
// давало б новий безкоштовний скан і нову пробу сцени. Carry кладемо в
// Keychain окремо і ДО того, як прибрати токен: без мережі чи з загубленою
// відповіддю його понесе наступний старт, а не чиста ідентичність. Сесії
// він не повертає — сервер бере з нього лише лічильники.
export async function startOver({ carry = false } = {}) {
  const previous = carry === true ? await readToken() : typeof carry === 'string' ? carry : '';
  if (previous) await writeSecret(CARRY_KEY, previous);
  await writeToken('');
  await AsyncStorage.removeItem(USER_KEY).catch(() => {});
  setSessionToken('');
  return createIdentity(previous);
}
