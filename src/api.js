// Network layer: recognition, authorization, word of the day.
// AI keys live ONLY on the server.
import Constants from 'expo-constants';

// ── Server address ──────────────────────────────────────────────────────────
// RELEASE: the public https URL from Cloud Run. This is the one that goes to the App Store.
const PRODUCTION_URL = 'https://lingualens-server-xxxxx-lm.a.run.app';

// DEVELOPMENT: you do NOT need to type the address by hand. Metro already knows the computer's IP:
// we take it from hostUri (it is 192.168.x.x:8081 there) and swap the port for the server one.
// This removes the most common cause of "the scan does not work": the IP changed after
// reconnecting to Wi-Fi, and the old one stayed in the code.
const DEV_PORT = 3000;

function devServerUrl() {
  const host =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const ip = String(host).split(':')[0];
  // the tunnel (exp.direct) does not give access to the local server: it needs
  // either a real LAN or an already deployed cloud server
  if (!ip || ip.includes('exp.direct') || ip === 'localhost') return null;
  return `http://${ip}:${DEV_PORT}`;
}

export const SERVER_URL =
  typeof __DEV__ !== 'undefined' && __DEV__ ? devServerUrl() || PRODUCTION_URL : PRODUCTION_URL;

// Whether the address was detected automatically: shown in diagnostics
export const SERVER_AUTO = typeof __DEV__ !== 'undefined' && __DEV__ && !!devServerUrl();

// The app's shared secret (see DEPLOY.md). Locally it can be left empty.
export const APP_TOKEN = '';

// The user's session token: set after sign-in (see auth.js)
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

// ---------- RECOGNITION ----------
// Healthy recognition takes 1.5-2 s. If it did not finish in 25, something is wrong,
// and it is better to say so honestly than to keep the person in front of a dead screen
// for a whole minute.
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

// ---------- AUTHORIZATION ----------
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

// ---------- WORD OF THE DAY ----------
export function apiWordOfDay(days, lang, native) {
  return request(`/word-of-day?days=${days}&lang=${lang}&native=${native}`, { timeout: 45000 });
}

// ---------- CONNECTION CHECK ----------
export async function checkServer() {
  try {
    const d = await request('/health', { timeout: 6000 });
    return { ok: !!d.ok, provider: d.provider || '?' };
  } catch (_) {
    return { ok: false };
  }
}
