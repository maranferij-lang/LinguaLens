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
// previous — токен, з яким телефон виходить з акаунта: сервер переносить
// його лічильники сканів і проби сцени в новий запис (див. auth.startOver).
export function apiCreateDevice(previous) {
  return request('/auth/device', { method: 'POST', body: previous ? { previous } : {} });
}
// { user, pro: {active, until}, usage: {day, scans, limit, scenes, sceneLimit, period} }
// scans і scenes — за все життя запису (period: 'lifetime'), не за день;
// limit/sceneLimit — безкоштовні стелі, null — Pro, без меж.
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
  402: 'SCAN_LIMIT', // безкоштовний скан уже витрачено — сервер не кликав AI
  422: 'SCAN_EMPTY', // сервер дійшов до AI, але чіткого предмета в кадрі немає
  429: 'SCAN_RATE',
  504: 'SCAN_TIMEOUT',
};

// 402 буває двох видів, і сервер називає який у тілі { error, limit, used }:
// SCAN_LIMIT — безкоштовні скани вичерпано (used/limit — скани за все життя);
// SCENE_PRO — безкоштовні сцени вичерпано (used/limit — сцени за все життя).
// Решта (старий сервер, кривий JSON) — як і раніше, ліміт сканів.
function paymentCode(data) {
  return data?.error === 'SCENE_PRO' ? 'SCENE_PRO' : 'SCAN_LIMIT';
}

// Один запит /scan із перекладом мережевих помилок у коди сканера.
async function scanRequest(body, timeout) {
  try {
    return await request('/scan', { method: 'POST', body, timeout });
  } catch (e) {
    if (e.code === 'TIMEOUT') throw codeError('SCAN_TIMEOUT');
    if (e.code === 'OFFLINE') throw codeError('SCAN_OFFLINE');
    const code = deviceForgotten(e)
      ? 'SCAN_AUTH'
      : e.status === 402
        ? paymentCode(e.data)
        : SCAN_ERRORS[e.status] || 'SCAN_SERVER';
    const err = codeError(code);
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

// Рівень людини (1–10) з її профілю. Від нього сервер робить приклад
// простішим для новачка чи багатшим для просунутого, а від 7/10 додає ще
// кілька виразів зі словом. Без профілю поле не йде зовсім — сервер робить,
// як завжди.
function levelField(level) {
  return Number.isInteger(level) && level >= 1 && level <= 10 ? { level } : null;
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

// «Ще вирази» з одиночного скану: до трьох пар «вираз — переклад».
// Сервер їх уже чистить, але аркуш не має впасти й від старого чи кривого.
export function cleanExtras(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const x of list) {
    const phrase = str(x?.phrase, 60);
    if (!phrase || out.some((o) => o.phrase.toLowerCase() === phrase.toLowerCase())) continue;
    out.push({ phrase, translation: str(x?.translation, 80) });
    if (out.length === 3) break;
  }
  return out;
}

export async function recognizeImage(base64Jpeg, lang = 'en', nativeLang = 'uk', level) {
  const data = await scanRequest({ image: base64Jpeg, lang, nativeLang, ...levelField(level) }, SCAN_TIMEOUT);
  if (!data || !data.word) throw codeError('SCAN_EMPTY');

  return {
    ...wordFields(data),
    box: Array.isArray(data.box) && data.box.length === 4 ? data.box : null,
    outline: Array.isArray(data.outline) && data.outline.length >= 6 ? data.outline : null,
    extras: cleanExtras(data.extras),
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
export async function recognizeScene(base64Jpeg, lang = 'en', nativeLang = 'uk', level) {
  const data = await scanRequest({ image: base64Jpeg, lang, nativeLang, mode: 'scene', ...levelField(level) }, SCENE_TIMEOUT);
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
// POST, бо разом із мовами йде профіль і список «знаю» (до 500 слів) — у
// рядок адреси таке не влазить. profile — уже очищений (cleanProfile) або
// null: тоді сервер дає загальні слова, як і раніше.
// Сервер, що ще не вміє POST (404), отримує старий GET: застосунок із новою
// версією не лишається без слова дня, поки сервер не оновили.
// На холодному кеші сервер перекладає до 14 слів — звідси довгий таймаут.
export async function apiWordOfDay({ days, lang, native, profile = null, known = [] }) {
  const today = localDayKey();
  const body = {
    days,
    lang,
    native,
    today,
    ...(profile ? { profile } : null),
    ...(known.length ? { known } : null),
  };
  try {
    return await request('/word-of-day', { method: 'POST', body, timeout: 45000 });
  } catch (e) {
    if (e.status !== 404 && e.status !== 405) throw e;
    const q = `days=${days}&lang=${lang}&native=${native}&today=${today}`;
    return request('/word-of-day?' + q, { timeout: 45000 });
  }
}

// ---------- ПРОФІЛЬ ----------
// Відповіді онбордингу (цілі, сфера, рівень, звідки дізнались) — без
// жодних особистих даних. Власник рахує їх, щоб знати, для кого застосунок
// і який автор приводить людей.
export function apiProfile(body) {
  return request('/me/profile', { method: 'POST', body });
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
