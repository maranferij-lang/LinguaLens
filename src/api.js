// Мережевий шар: ідентичність пристрою, розпізнавання, слово дня.
// Ключі AI живуть ТІЛЬКИ на сервері. Адреса й токени — у src/config.js.
import { APP_TOKEN, SERVER_URL } from './config';
import { localDayKey } from './storage';

// Токен пристрою — ставиться після ensureSession() (див. auth.js)
let sessionToken = '';
export function setSessionToken(t) {
  sessionToken = t || '';
}

function headers(token) {
  return {
    'content-type': 'application/json',
    // День людини, а не сервера: ліміт сканів і слово дня скидаються опівночі
    // за її годинником.
    'x-local-date': localDayKey(),
    ...(APP_TOKEN ? { 'x-app-token': APP_TOKEN } : {}),
    ...(token ? { authorization: 'Bearer ' + token } : {}),
  };
}

async function request(path, { method = 'GET', body, timeout = 20000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const token = sessionToken;
  let res;
  try {
    res = await fetch(SERVER_URL + path, {
      method,
      signal: controller.signal,
      headers: headers(token),
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    // З SDK 56 глобальний fetch — це expo/fetch: перерваний запит падає з
    // FetchError, а не AbortError. Тож про таймаут питаємо сам сигнал.
    if (controller.signal.aborted || e.name === 'AbortError') throw codeError('TIMEOUT');
    throw codeError('OFFLINE');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try {
    data = await res.json();
  } catch (_) {}
  if (!res.ok) {
    const err = codeError(data?.error || 'HTTP_' + res.status);
    err.status = res.status;
    err.data = data;
    // Поки запит летів, телефон перейшов на інший токен (вхід через Apple,
    // вихід): відмова стосується старого, а не нинішнього.
    if (token !== sessionToken) err.stale = true;
    throw err;
  }
  return data;
}

function codeError(code) {
  const e = new Error(code);
  e.code = code;
  return e;
}

// Сервер не знає цього токена пристрою (запис стерто) — лише тоді можна
// заводити нову ідентичність. 403 APP_TOKEN — це збірка з неправильним
// токеном застосунку або його ротація, а не пристрій: ідентичність не чіпаємо,
// інакше кожен такий запит знищував би її. Відмова старому токену (після
// входу через Apple сервер стирає анонімний запис, а запит із ним міг ще
// летіти) — теж не привід: інакше вона викинула б людину з акаунта.
export function deviceForgotten(e) {
  return e?.status === 401 && e?.code === 'UNAUTHORIZED' && !e.stale;
}

// ---------- ІДЕНТИЧНІСТЬ ПРИСТРОЮ ----------
export function apiCreateDevice() {
  return request('/auth/device', { method: 'POST', body: {} });
}
// { user, pro: {active, until}, usage: {day, scans, limit} }
// refresh — одразу після покупки: сервер перепитає RevenueCat без кешу.
export function apiMe(refresh = false) {
  return request(refresh ? '/me?refresh=1' : '/me');
}
export function apiDeleteMe() {
  return request('/me', { method: 'DELETE' });
}

// ---------- SIGN IN WITH APPLE (див. account.js) ----------
// { nonce, appleNonce }: appleNonce іде в Apple, nonce — назад на сервер.
export function apiAppleNonce() {
  return request('/auth/apple/nonce', { method: 'POST', body: {} });
}
// { user: { id, createdAt, apple }, token, switched }
export function apiAppleSignIn(body) {
  return request('/auth/apple', { method: 'POST', body });
}

// ---------- СИНХРОНІЗАЦІЯ СЛОВНИКА (див. sync.js) ----------
// Пачка до 500 слів туди й зміни звідти. Перша синхронізація великого
// словника — кілька таких запитів, тож запас більший, ніж у /me.
export function apiSync(body) {
  return request('/sync', { method: 'POST', body, timeout: 30000 });
}

// ---------- РОЗПІЗНАВАННЯ ----------
// Здорове розпізнавання займає 1.5–2 с. Якщо не вклалось у 25 — щось не так,
// і краще чесно сказати про це, ніж тримати людину перед мертвим екраном.
const SCAN_TIMEOUT = 25000;

// Статус відповіді → код помилки, який сканер перетворює на людську фразу.
// SCAN_AUTH — лише «пристрій забуто» (див. deviceForgotten); 401/403 з іншої
// причини — звичайна помилка сервера.
const SCAN_ERRORS = {
  402: 'SCAN_LIMIT', // безкоштовні скани на сьогодні вичерпано — сервер не кликав AI
  422: 'SCAN_EMPTY', // сервер дійшов до AI, але чіткого предмета в кадрі немає
  429: 'SCAN_RATE',
  504: 'SCAN_TIMEOUT',
};

export async function recognizeImage(base64Jpeg, lang = 'en', nativeLang = 'uk') {
  let data;
  try {
    data = await request('/scan', {
      method: 'POST',
      body: { image: base64Jpeg, lang, nativeLang },
      timeout: SCAN_TIMEOUT,
    });
  } catch (e) {
    if (e.code === 'TIMEOUT') throw codeError('SCAN_TIMEOUT');
    if (e.code === 'OFFLINE') throw codeError('SCAN_OFFLINE');
    const err = codeError(deviceForgotten(e) ? 'SCAN_AUTH' : SCAN_ERRORS[e.status] || 'SCAN_SERVER');
    err.data = e.data;
    throw err;
  }
  if (!data || !data.word) throw codeError('SCAN_EMPTY');

  return {
    word: data.word,
    ipa: data.ipa || '',
    translation: data.translation || '',
    example: data.example || '',
    exampleTranslation: data.example_translation || '',
    box: Array.isArray(data.box) && data.box.length === 4 ? data.box : null,
    outline: Array.isArray(data.outline) && data.outline.length >= 6 ? data.outline : null,
    usage: data.usage || null,
  };
}

// ---------- СЛОВО ДНЯ ----------
export function apiWordOfDay(days, lang, native) {
  const q = `days=${days}&lang=${lang}&native=${native}&today=${localDayKey()}`;
  return request('/word-of-day?' + q, { timeout: 45000 });
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
