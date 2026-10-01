// Клієнтська авторизація: зберігання сесії, вхід/реєстрація/вихід.
// Токен лежить у SecureStore (захищене сховище iOS), профіль — в AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiDeleteAccount, apiLogin, apiMe, apiRegister, apiUpdateProfile, setSessionToken } from './api';

// SecureStore = Keychain на iOS. Якщо пакет ще не встановлено (`npx expo install
// expo-secure-store`) — не падаємо, а тимчасово тримаємо токен в AsyncStorage.
let SecureStore;
try {
  SecureStore = require('expo-secure-store');
  if (typeof SecureStore.getItemAsync !== 'function') throw new Error('no api');
} catch (_) {
  SecureStore = {
    getItemAsync: (k) => AsyncStorage.getItem('sec_' + k),
    setItemAsync: (k, v) => AsyncStorage.setItem('sec_' + k, v),
    deleteItemAsync: (k) => AsyncStorage.removeItem('sec_' + k),
  };
}

const TOKEN_KEY = 'll_token';
const USER_KEY = 'll_user_v1';

export async function loadSession() {
  let token = '';
  try {
    token = (await SecureStore.getItemAsync(TOKEN_KEY)) || '';
  } catch (_) {}
  let user = null;
  try {
    const raw = await AsyncStorage.getItem(USER_KEY);
    user = raw ? JSON.parse(raw) : null;
  } catch (_) {}
  setSessionToken(token);
  return { token, user };
}

async function saveSession(token, user) {
  setSessionToken(token);
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch (_) {}
  try {
    if (user) await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
    else await AsyncStorage.removeItem(USER_KEY);
  } catch (_) {}
}

// Перетворює технічні коди помилок на зрозумілі повідомлення
export function authErrorText(err, t) {
  const code = err?.code || err?.message || '';
  const map = {
    INVALID_EMAIL: 'errInvalidEmail',
    WEAK_PASSWORD: 'errWeakPassword',
    EMAIL_TAKEN: 'errEmailTaken',
    BAD_CREDENTIALS: 'errBadCredentials',
    TOO_MANY_ATTEMPTS: 'errTooMany',
    OFFLINE: 'errOffline',
    TIMEOUT: 'errTimeout',
  };
  return t(map[code] || 'errGeneric');
}

export async function register(email, password, name) {
  const d = await apiRegister(email, password, name);
  await saveSession(d.token, d.user);
  return d.user;
}

export async function login(email, password) {
  const d = await apiLogin(email, password);
  await saveSession(d.token, d.user);
  return d.user;
}

export async function logout() {
  await saveSession('', null);
}

// Видаляє акаунт на сервері, потім локальну сесію. Якщо сервер недоступний —
// кидає помилку і НЕ розлогінює: інакше людина думала б, що акаунт видалено.
export async function deleteAccount() {
  await apiDeleteAccount();
  await saveSession('', null);
}

// Оновити профіль (ім'я / аватар) — і локально, і на сервері
export async function updateProfile(patch, currentUser) {
  const optimistic = { ...currentUser, ...patch };
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(optimistic)).catch(() => {});
  try {
    const d = await apiUpdateProfile(patch);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(d.user)).catch(() => {});
    return d.user;
  } catch (_) {
    return optimistic; // офлайн — лишаємо локальну зміну
  }
}

// Перевірити, чи сесія ще жива (тихо, без помилок для юзера)
export async function refreshUser() {
  try {
    const d = await apiMe();
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(d.user)).catch(() => {});
    return d.user;
  } catch (e) {
    if (e?.status === 401) {
      await saveSession('', null);
      return null;
    }
    return undefined; // офлайн — лишаємо як було
  }
}
