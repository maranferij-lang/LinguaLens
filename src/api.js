// Мережевий шар: ідентичність пристрою, розпізнавання, слово дня.
// Ключі AI живуть ТІЛЬКИ на сервері. Адреса й токени — у src/config.js.
import { APP_TOKEN, SERVER_URL } from './config';
import { localDayKey } from './storage';

// Токен пристрою — ставиться після ensureSession() (див. auth.js)
let sessionToken = '';
export function setSessionToken(t) {
  sessionToken = t || '';
}

function headers() {
  return {
    'content-type': 'application/json',
    // День людини, а не сервера: ліміт сканів і слово дня скидаються опівночі
    // за її годинником.
    'x-local-date': localDayKey(),
    ...(APP_TOKEN ? { 'x-app-token': APP_TOKEN } : {}),
    ...(sessionToken ? { authorization: 'Bearer ' + sessionToken } : {}),
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
// інакше кожен такий запит знищував би її.
export function deviceForgotten(e) {
  return e?.status === 401 && e?.code === 'UNAUTHORIZED';
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

// Один запит /scan із перекладом мережевих помилок у коди сканера.
async function scanRequest(body, timeout) {
  try {
    return await request('/scan', { method: 'POST', body, timeout });
  } catch (e) {
    if (e.code === 'TIMEOUT') throw codeError('SCAN_TIMEOUT');
    if (e.code === 'OFFLINE') throw codeError('SCAN_OFFLINE');
    const err = codeError(deviceForgotten(e) ? 'SCAN_AUTH' : SCAN_ERRORS[e.status] || 'SCAN_SERVER');
    err.data = e.data;
    throw err;
  }
}

// Поля слова в тому вигляді, в якому їх зберігає словник (camelCase).
function wordFields(d) {
  return {
    word: d.word,
    ipa: d.ipa || '',
    translation: d.translation || '',
    example: d.example || '',
    exampleTranslation: d.example_translation || '',
  };
}

const validBox = (b) => Array.isArray(b) && b.length === 4 && b.every(Number.isFinite) && b[2] > b[0] && b[3] > b[1];

export async function recognizeImage(base64Jpeg, lang = 'en', nativeLang = 'uk') {
  const data = await scanRequest({ image: base64Jpeg, lang, nativeLang }, SCAN_TIMEOUT);
  if (!data || !data.word) throw codeError('SCAN_EMPTY');

  return {
    ...wordFields(data),
    box: Array.isArray(data.box) && data.box.length === 4 ? data.box : null,
    outline: Array.isArray(data.outline) && data.outline.length >= 6 ? data.outline : null,
    usage: data.usage || null,
  };
}

// ---------- СЦЕНА ----------
// Сцена — до восьми предметів з одного кадру. Моделі треба помітно більше
// часу, ніж на один предмет: сервер дає їй 34 с, клієнт чекає трохи довше,
// щоб відповідь «не вклались» прийшла від сервера, а не з обірваного запиту.
const SCENE_TIMEOUT = 40000;
export const SCENE_MAX_OBJECTS = 8;

// Кадр — уже обрізаний до 9:16 (див. src/cutout.js), рамки й силуети —
// відносно нього. Предмет без слова чи без рамки поставити на фото нікуди:
// такі відкидаємо тут, навіть якщо сервер їх пропустив.
export async function recognizeScene(base64Jpeg, lang = 'en', nativeLang = 'uk') {
  const data = await scanRequest({ image: base64Jpeg, lang, nativeLang, mode: 'scene' }, SCENE_TIMEOUT);
  const objects = (Array.isArray(data?.objects) ? data.objects : [])
    .filter((o) => o && typeof o.word === 'string' && o.word.trim() && validBox(o.box))
    .slice(0, SCENE_MAX_OBJECTS)
    .map((o) => ({
      ...wordFields(o),
      box: o.box,
      outline: Array.isArray(o.outline) && o.outline.length >= 6 ? o.outline : null,
    }));
  if (!objects.length) throw codeError('SCAN_EMPTY');
  return { objects, usage: data.usage || null };
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
