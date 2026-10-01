// Необов'язковий акаунт: Sign in with Apple.
//
// Гостьовий режим (анонімна ідентичність з auth.js) працює повністю й без
// цього. Вхід дає одне: словник лежить ще й на нашому сервері та
// синхронізується між iPhone людини (див. sync.js). Ні імені, ні пошти не
// просимо — Apple віддає лише стабільний id, а сервер тримає тільки його
// хеш. Менше особистих даних — менше чого берегти й менше чого втратити.
//
// Як іде вхід:
//   1. сервер видає одноразовий nonce (підписаний, на 10 хвилин, для цього
//      пристрою) і його sha256 — appleNonce;
//   2. appleNonce іде в системне вікно Apple і повертається всередині
//      identityToken — так сервер знає, що токен випущено саме для цього входу;
//   3. сервер перевіряє токен і відповідає парою id/токен акаунта.
//      switched: true — цей Apple ID уже мав акаунт (з іншого iPhone), і
//      телефон переходить у нього; анонімний запис телефона сервер стирає.
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Directory, Paths } from 'expo-file-system';
import { apiAppleNonce, apiAppleSignIn, deviceForgotten } from './api';
import { adoptSession, ensureSession, startOver } from './auth';
import { clearProgress } from './storage';
import { clearSyncData } from './sync';

// { id } — акаунт, до якого цей телефон увійшов через Apple. Саме id, а не
// «так/ні»: якщо ідентичність зміниться в обхід виходу (сервер забув токен),
// позначка сама перестане збігатися і не вдаватиме вхід, якого вже немає.
const ACCOUNT_KEY = 'll_account_v1';
// Людина закрила підказку «увійди, щоб не загубити слова» у словнику.
const NUDGE_KEY = 'll_sync_nudge_v1';
// Сцени («сканувати всю кімнату») — свої ключ і папка в Documents.
const SCENES_KEY = 'll_scenes_v1';
const SCENES_DIR = 'scenes';

// Чим закінчився вхід, у кодах для екрана (accountErrorKey):
//   CANCELED — людина закрила вікно Apple: не помилка, нічого не показуємо;
//   APPLE_INVALID — сервер не повірив токену (протермінований, чужий nonce);
//   APPLE_UNAVAILABLE — сервер не достукався до ключів Apple;
//   OFFLINE / TIMEOUT — немає зв'язку; RATE — забагато спроб;
//   SESSION — сервер забув цей пристрій (App візьме нову ідентичність);
//   FAILED — решта (системне вікно впало, сервер відповів дивно).
function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// Кнопку Apple показуємо лише там, де вхід справді можливий: iOS 13+ з
// нативним модулем. На вебі й Android її немає зовсім — а без неї немає
// й розмови про акаунт.
export async function appleAvailable() {
  if (Platform.OS !== 'ios') return false;
  try {
    return !!(await AppleAuthentication.isAvailableAsync());
  } catch (_) {
    return false;
  }
}

// → { userId, switched } або null, якщо людина передумала у вікні Apple.
export async function signInWithApple() {
  // nonce видається конкретному пристрою — без сесії його не отримати.
  // Сесії може не бути, якщо при першому запуску не було мережі.
  const session = await ensureSession();
  if (!session) throw codeError('OFFLINE');

  let nonce;
  let appleNonce;
  try {
    ({ nonce, appleNonce } = await apiAppleNonce());
  } catch (e) {
    throw serverError(e);
  }
  if (!nonce || !appleNonce) throw codeError('FAILED');

  let credential;
  try {
    // Без FULL_NAME та EMAIL: вони нам не потрібні, а Apple тоді навіть не
    // питає людину, чи ділитися ними.
    credential = await AppleAuthentication.signInAsync({ requestedScopes: [], nonce: appleNonce });
  } catch (e) {
    if (e?.code === 'ERR_REQUEST_CANCELED') return null;
    throw codeError('FAILED');
  }

  let res;
  try {
    res = await apiAppleSignIn({
      identityToken: credential.identityToken,
      nonce,
      // Сервер обміняє його на refresh-токен, щоб відкликати вхід, коли
      // людина зітре акаунт (вимога Apple). Без нього вхід однаково вдасться.
      authorizationCode: credential.authorizationCode || undefined,
    });
  } catch (e) {
    throw serverError(e);
  }
  const userId = res?.user?.id;
  if (!userId || !res.token) throw codeError('FAILED');

  // Токен беремо завжди: навіть той самий акаунт міг отримати свіжий.
  await adoptSession(res.token, userId);
  await saveAccountId(userId);
  return { userId, switched: !!res.switched };
}

function serverError(e) {
  if (e?.code === 'OFFLINE' || e?.code === 'TIMEOUT') return codeError(e.code);
  if (deviceForgotten(e)) return codeError('SESSION');
  if (e?.status === 429) return codeError('RATE');
  if (e?.code === 'APPLE_INVALID' || e?.code === 'APPLE_UNAVAILABLE') return codeError(e.code);
  return codeError('FAILED');
}

// Код помилки → ключ рядка в i18n. null — нічого не показувати.
const ERROR_KEYS = {
  OFFLINE: 'accountErrOffline',
  TIMEOUT: 'accountErrOffline',
  APPLE_INVALID: 'accountErrInvalid',
  APPLE_UNAVAILABLE: 'accountErrApple',
  RATE: 'accountErrRate',
};
export function accountErrorKey(code) {
  if (!code || code === 'CANCELED') return null;
  return ERROR_KEYS[code] || 'accountErrFailed';
}

// Помилка синхронізації → один спокійний рядок під статусом.
const SYNC_ERROR_KEYS = {
  OFFLINE: 'syncErrOffline',
  TIMEOUT: 'syncErrOffline',
  DICT_FULL: 'syncErrFull',
};
export function syncErrorKey(code) {
  if (!code) return null;
  return SYNC_ERROR_KEYS[code] || 'syncErrFailed';
}

// ─── Збережений стан ───────────────────────────────────────────────────────
export async function loadAccount() {
  try {
    const [[, acc], [, nudge]] = await AsyncStorage.multiGet([ACCOUNT_KEY, NUDGE_KEY]);
    const parsed = acc ? JSON.parse(acc) : null;
    return { id: typeof parsed?.id === 'string' ? parsed.id : null, nudgeOff: nudge === '1' };
  } catch (_) {
    return { id: null, nudgeOff: false };
  }
}

async function saveAccountId(id) {
  try {
    if (id) await AsyncStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id }));
    else await AsyncStorage.removeItem(ACCOUNT_KEY);
  } catch (_) {}
}

// Сцени будує окремий модуль, але це теж особисті дані цього телефона:
// прибираємо і ключ, і папку з кадрами, навіть якщо сцен ще не було.
async function clearScenes() {
  try {
    await AsyncStorage.removeItem(SCENES_KEY);
  } catch (_) {}
  try {
    const dir = new Directory(Paths.document, SCENES_DIR);
    if (dir.exists) dir.delete();
  } catch (_) {}
}

// Усе особисте, що лежить на телефоні: слова, прогрес, досягнення, сцени,
// стан синхронізації й позначка входу. Налаштування лишаються. Файли
// наліпок прибирає App (він знає, які з них чиї).
export async function clearPersonalData() {
  await clearProgress();
  await clearSyncData();
  await clearScenes();
  await saveAccountId(null);
}

// Вихід: дані лишаються в акаунті Apple, телефон — чистий гість із новою
// анонімною ідентичністю. → нова сесія або null (немає мережі: тоді
// ідентичність з'явиться на наступному старті).
export async function signOut() {
  await clearPersonalData();
  return startOver();
}

// ─── Хук для App ───────────────────────────────────────────────────────────
// → { loaded, available, signedIn, nudgeOff, linked(id), forget(), noteMe(me, startedAt), dismissNudge() }
export function useAccount(deviceId) {
  const [st, setSt] = useState({ loaded: false, available: false, id: null, nudgeOff: false });
  // Коли востаннє змінювався вхід. Відповідь /me, запитана РАНІШЕ, вже
  // застаріла: інакше /me, що вилетів до входу, «вийшов» би з акаунта.
  const changedAt = useRef(0);
  // id уже встановлено свіжішим джерелом (вхід, /me) — збережене не перебиває.
  const known = useRef(false);

  useEffect(() => {
    let alive = true;
    Promise.all([appleAvailable(), loadAccount()]).then(([available, acc]) => {
      if (!alive) return;
      setSt((s) => ({ ...s, loaded: true, available, id: known.current ? s.id : acc.id, nudgeOff: s.nudgeOff || acc.nudgeOff }));
    });
    return () => {
      alive = false;
    };
  }, []);

  function setId(id) {
    changedAt.current = Date.now();
    known.current = true;
    setSt((s) => (s.id === id ? s : { ...s, id }));
    saveAccountId(id);
  }

  return {
    ...st,
    signedIn: !!st.id && st.id === deviceId,
    linked: (id) => setId(id),
    // Акаунта на цьому телефоні більше немає — і його since з надгробками
    // нічого не означають: наступний вхід почнеться з повної синхронізації.
    forget() {
      setId(null);
      clearSyncData();
    },
    // user.apple з /me — правда сервера: після перевстановлення (Keychain
    // зберіг токен акаунта, а AsyncStorage — ні) вхід повертається сам.
    noteMe(me, startedAt) {
      const u = me?.user;
      if (!u?.id || typeof u.apple !== 'boolean' || startedAt < changedAt.current) return;
      known.current = true;
      setSt((s) => {
        const id = u.apple ? u.id : s.id === u.id ? null : s.id;
        if (id === s.id) return s;
        saveAccountId(id);
        return { ...s, id };
      });
    },
    dismissNudge() {
      setSt((s) => ({ ...s, nudgeOff: true }));
      AsyncStorage.setItem(NUDGE_KEY, '1').catch(() => {});
    },
  };
}
