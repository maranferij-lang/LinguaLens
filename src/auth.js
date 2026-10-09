// Client-side authorization: session storage, sign in / sign up / sign out.
// The token lives in SecureStore (the protected iOS storage), the profile is in AsyncStorage.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiLogin, apiMe, apiRegister, apiUpdateProfile, setSessionToken } from './api';

// SecureStore = Keychain on iOS. If the package is not installed yet (`npx expo install
// expo-secure-store`), we do not crash but temporarily keep the token in AsyncStorage.
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

// Turns technical error codes into understandable messages
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

// Update the profile (name / avatar), both locally and on the server
export async function updateProfile(patch, currentUser) {
  const optimistic = { ...currentUser, ...patch };
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(optimistic)).catch(() => {});
  try {
    const d = await apiUpdateProfile(patch);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(d.user)).catch(() => {});
    return d.user;
  } catch (_) {
    return optimistic; // offline: keep the local change
  }
}

// Check whether the session is still alive (quietly, with no errors shown to the user)
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
    return undefined; // offline: leave things as they were
  }
}
