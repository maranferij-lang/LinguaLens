// Мережевий шар: розпізнавання, авторизація, слово дня.
// Ключі AI живуть ТІЛЬКИ на сервері.
import Constants from 'expo-constants';

// ── Адреса сервера ──────────────────────────────────────────────────────────
// РЕЛІЗ: публічний https-URL з Cloud Run. Саме він піде в App Store.
const PRODUCTION_URL = 'https://lingualens-server-xxxxx-lm.a.run.app';

// РОЗРОБКА: адресу НЕ треба вписувати руками. Metro вже знає IP компа —
// беремо його з hostUri (там 192.168.x.x:8081) і міняємо порт на серверний.
// Це прибирає найчастішу причину «скан не працює»: IP змінився після
// перепідключення до Wi-Fi, а в коді лишився старий.
const DEV_PORT = 3000;

function devServerUrl() {
  const host =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const ip = String(host).split(':')[0];
  // тунель (exp.direct) не дає доступу до локального сервера — там потрібен
  // або справжній LAN, або вже задеплоєний хмарний сервер
  if (!ip || ip.includes('exp.direct') || ip === 'localhost') return null;
  return `http://${ip}:${DEV_PORT}`;
}

export const SERVER_URL =
  typeof __DEV__ !== 'undefined' && __DEV__ ? devServerUrl() || PRODUCTION_URL : PRODUCTION_URL;

// Чи вдалось визначити адресу автоматично — показуємо в діагностиці
export const SERVER_AUTO = typeof __DEV__ !== 'undefined' && __DEV__ && !!devServerUrl();

// Спільний секрет апки (див. DEPLOY.md). Локально можна лишити порожнім.
export const APP_TOKEN = '';

// Токен сесії користувача — ставиться після входу (див. auth.js)
let sessionToken = '';
export function setSessionToken(t) {
  sessionToken = t || '';
}

function headers(extra) {
  return {
    'content-type': 'application/json',
    ...(APP_TOKEN ? { 'x-app-token': APP_TOKEN } : {}),
    ...(sessionToken ? { authorization: 'Bearer ' + sessionToken } : {}),
    ...extra,
  };
}

async function request(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res;
  try {
    res = await fetch(SERVER_URL + path, {
      method,
      signal: controller.signal,
      headers: headers(),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('TIMEOUT');
    throw new Error('OFFLINE');
  }
  clearTimeout(timer);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const err = new Error(data?.error || 'HTTP_' + res.status);
    err.status = res.status;
    err.code = data?.error;
    throw err;
  }
  return data;
}

// ---------- РОЗПІЗНАВАННЯ ----------
// Здорове розпізнавання займає 1.5–2 с. Якщо не вклалось у 25 — щось не так,
// і краще чесно сказати про це, ніж тримати людину перед мертвим екраном
// цілу хвилину.
const SCAN_TIMEOUT = 25000;

export async function recognizeImage(base64Jpeg, lang = 'en', nativeLang = 'uk') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCAN_TIMEOUT);

  let res;
  try {
    res = await fetch(SERVER_URL + '/scan', {
      method: 'POST',
      signal: controller.signal,
      headers: headers(),
      body: JSON.stringify({ image: base64Jpeg, lang, nativeLang }),
    });
  } catch (e) {
    clearTimeout(timer);
    if (e.name === 'AbortError') throw new Error('SCAN_TIMEOUT');
    throw new Error('SCAN_OFFLINE');
  }
  clearTimeout(timer);

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}

  if (res.status === 429) throw new Error('SCAN_RATE');
  if (res.status === 401) throw new Error('SCAN_AUTH');
  // 422 — сервер дійшов до AI, але чіткого предмета в кадрі немає.
  // Це порада «підійди ближче», а не «сервер зламався».
  if (res.status === 422) throw new Error('SCAN_EMPTY');
  if (res.status === 504) throw new Error('SCAN_TIMEOUT');
  if (!res.ok) throw new Error('SCAN_SERVER');
  if (!data || !data.word) throw new Error('SCAN_EMPTY');

  return {
    word: data.word,
    ipa: data.ipa || '',
    translation: data.translation || '',
    example: data.example || '',
    exampleTranslation: data.example_translation || '',
    box: Array.isArray(data.box) && data.box.length === 4 ? data.box : null,
    outline: Array.isArray(data.outline) && data.outline.length >= 6 ? data.outline : null,
  };
}

// ---------- АВТОРИЗАЦІЯ ----------
export function apiRegister(email, password, name) {
  return request('/auth/register', { method: 'POST', body: { email, password, name } });
}
export function apiLogin(email, password) {
  return request('/auth/login', { method: 'POST', body: { email, password } });
}
export function apiMe() {
  return request('/me');
}
export function apiUpdateProfile(patch) {
  return request('/me', { method: 'PATCH', body: patch });
}
export function apiDeleteAccount() {
  return request('/me', { method: 'DELETE' });
}

// ---------- СЛОВО ДНЯ ----------
export function apiWordOfDay(days, lang, native) {
  return request(`/word-of-day?days=${days}&lang=${lang}&native=${native}`, { timeout: 45000 });
}

// ---------- ПЕРЕВІРКА ЗВ'ЯЗКУ ----------
export async function checkServer() {
  try {
    const d = await request('/health', { timeout: 6000 });
    return { ok: !!d.ok, provider: d.provider || '?' };
  } catch (_) {
    return { ok: false };
  }
}
