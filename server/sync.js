// Синхронізація словника між телефонами одного Apple ID.
//
// Увесь словник акаунта — ОДИН документ dicts/<userId>:
//   { rev, prunedRev, data: base64(gzip(JSON)), updatedAt }
//   JSON = { words: { [id]: WordEntry & { rev } }, activity, stats, seen }
// Один документ, а не документ на слово: синхронізація коштує одне читання
// й один запис за будь-якого розміру словника, а gzip стискає типовий
// словник у кілька разів (поля однакові, тексти короткі) — 6000 слів
// уміщаються в ліміт Firestore 1 МіБ на документ.
//
// rev — лічильник записів документа. Клієнт пам'ятає останній бачений rev
// (since) і отримує лише слова, змінені після нього. Конфлікти — «пізніша
// зміна перемагає» за updatedAt кожного слова. Видалення — надгробки
// { id, deleted: true, updatedAt }: без них слово, стерте на одному
// телефоні, повернулося б з іншого. Надгробки живуть 60 днів; prunedRev —
// найбільший rev серед уже прибраних. Телефон, чий since менший за нього,
// міг пропустити видалення, яких сервер уже не пам'ятає: він отримує все з
// reset і stale і має звірити словник, а не надіслати своє назад (інакше
// стерте слово воскресло б на всіх телефонах).
//
// Усе, що приходить від клієнта, — недовірене: беремо лише відомі поля,
// обрізаємо рядки, відкидаємо записи з поганим id.

const zlib = require('zlib');
const { promisify } = require('util');
const store = require('./store');

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const DICTS = 'dicts';
const MAX_PER_REQUEST = 500;
const MAX_LIVE_WORDS = 6000;
// Firestore: рядок до 1 048 487 байт, документ до 1 МіБ разом з іменами
// полів. Із запасом, щоб запис не впав посеред синхронізації (мільйон
// перевірено на емуляторі). Реальні 6000 слів із прикладами — 0,5–0,7 МБ.
const MAX_DATA_CHARS = 1000000;
const TOMBSTONE_TTL_MS = 60 * 86400000;
const MAX_SEEN = 200;
const MAX_STATS = 64;
// Десять років щоденної активності — графіку й стріку більше не треба.
const MAX_ACTIVITY_DAYS = 3660;
const MAX_COUNT = 1e9;
// Що б не лежало в документі, розпаковуємо не більше цього: зіпсований
// запис не має з'їсти пам'ять сервера.
const MAX_JSON_BYTES = 64 * 1024 * 1024;

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const STAT_RE = /^[A-Za-z0-9_]{1,40}$/;
const LANG_RE = /^[A-Za-z]{2,3}(?:[_-][A-Za-z0-9]{1,4})?$/;

// ---------- очищення вхідних даних ----------
function text(v, max) {
  if (typeof v !== 'string') return '';
  // Не розрізаємо сурогатну пару навпіл, інакше в картці з'явиться «�».
  return v.trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '');
}

function count(v) {
  return Number.isFinite(v) && v >= 0 ? Math.min(Math.floor(v), MAX_COUNT) : 0;
}

function time(v) {
  return Number.isFinite(v) && v > 0 ? Math.round(v) : 0;
}

function langCode(v) {
  return typeof v === 'string' && v.length <= 8 && LANG_RE.test(v) ? v : '';
}

// Лише справжня календарна дата, не з далекого майбутнього: «9999-99-99»
// інакше витіснила б із графіка справжні дні (зберігаємо найновіші).
function isDay(k, now) {
  if (!DAY_RE.test(k) || k < '2020-01-01') return false;
  const t = Date.parse(k + 'T00:00:00Z');
  return Number.isFinite(t) && new Date(t).toISOString().slice(0, 10) === k && t <= now + 2 * 86400000;
}

function isStat(k) {
  return STAT_RE.test(k);
}

function cleanSrs(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    box: Number.isFinite(raw.box) ? Math.min(Math.max(Math.round(raw.box), 0), 5) : 0,
    due: time(raw.due),
    reps: count(raw.reps),
    correct: count(raw.correct),
  };
}

// Лише поля з білого списку. Локальне (фото, контур, рамка, сцена) на
// сервер не потрапляє, навіть якщо клієнт його надіслав.
function cleanEntry(raw, now) {
  if (!raw || typeof raw !== 'object' || typeof raw.id !== 'string' || !ID_RE.test(raw.id)) return null;
  const stamped = time(raw.updatedAt);
  if (!stamped) return null;
  // Годинник телефона, що поспішає, не повинен робити його зміни
  // непереможними для інших телефонів: час із майбутнього — це «зараз».
  const updatedAt = Math.min(stamped, now);
  if (raw.deleted === true) return { id: raw.id, deleted: true, updatedAt };
  const word = text(raw.word, 60);
  if (!word) return null;
  const entry = {
    id: raw.id,
    updatedAt,
    word,
    ipa: text(raw.ipa, 80),
    translation: text(raw.translation, 80),
    example: text(raw.example, 240),
    exampleTranslation: text(raw.exampleTranslation, 240),
    lang: langCode(raw.lang),
    nativeLang: langCode(raw.nativeLang),
    addedAt: time(raw.addedAt) || updatedAt,
  };
  const srs = cleanSrs(raw.srs);
  if (srs) entry.srs = srs;
  return entry;
}

// ---------- документ ----------
// Map, а не звичайний об'єкт: id «__proto__» тоді лишається просто id.
async function decode(doc) {
  if (!doc) return { rev: 0, prunedRev: 0, words: new Map(), activity: new Map(), stats: new Map(), seen: [] };
  const raw = await gunzip(Buffer.from(String(doc.data || ''), 'base64'), { maxOutputLength: MAX_JSON_BYTES });
  const json = JSON.parse(raw.toString('utf8'));
  return {
    rev: Number(doc.rev) || 0,
    prunedRev: Number(doc.prunedRev) || 0,
    words: new Map(Object.entries(json.words || {})),
    activity: new Map(Object.entries(json.activity || {})),
    stats: new Map(Object.entries(json.stats || {})),
    seen: Array.isArray(json.seen) ? json.seen : [],
  };
}

async function encode(state) {
  const json = JSON.stringify({
    words: Object.fromEntries(state.words),
    activity: Object.fromEntries(state.activity),
    stats: Object.fromEntries(state.stats),
    seen: state.seen,
  });
  return (await gzip(json)).toString('base64');
}

// ---------- злиття ----------
// Приймаємо лише строго новішу зміну: при рівному часі лишається та, що
// вже на сервері, — тоді всі телефони бачать один і той самий результат.
// Надгробок для слова, якого сервер не знає, не зберігаємо: його не бачив
// жоден інший телефон (слово створили й стерли між синхронізаціями).
function mergeWords(words, incoming, rev, now) {
  let changed = false;
  for (const e of incoming) {
    const cur = words.get(e.id);
    if (cur ? e.updatedAt <= cur.updatedAt : e.deleted) continue;
    // at — коли сервер прийняв надгробок: від нього рахуємо 60 днів, щоб
    // давнє видалення з телефона, що довго був офлайн, встигли побачити інші.
    words.set(e.id, e.deleted ? { ...e, rev, at: now } : { ...e, rev });
    changed = true;
  }
  return changed;
}

// Лічильники між телефонами зливаємо максимумом: так повтор того самого
// запиту нічого не подвоює.
function mergeMax(target, incoming, validKey, maxKeys) {
  if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) return false;
  let changed = false;
  for (const [k, v] of Object.entries(incoming)) {
    if (!validKey(k)) continue;
    const n = count(v);
    if (n <= (target.get(k) || 0)) continue;
    if (!target.has(k) && target.size >= maxKeys) continue;
    target.set(k, n);
    changed = true;
  }
  return changed;
}

function mergeSeen(seen, incoming) {
  if (!Array.isArray(incoming)) return false;
  const have = new Set(seen);
  let changed = false;
  for (const id of incoming) {
    if (seen.length >= MAX_SEEN) break;
    if (typeof id !== 'string' || !ID_RE.test(id) || have.has(id)) continue;
    seen.push(id);
    have.add(id);
    changed = true;
  }
  return changed;
}

function liveCount(words) {
  let n = 0;
  for (const w of words.values()) if (!w.deleted) n++;
  return n;
}

function prune(state, now) {
  for (const [id, w] of state.words) {
    if (w.deleted && (w.at || w.updatedAt) < now - TOMBSTONE_TTL_MS) {
      state.words.delete(id);
      // Хто бачив словник раніше за цей rev, міг не отримати видалення.
      state.prunedRev = Math.max(state.prunedRev, Number(w.rev) || 0);
    }
  }
  // Найстаріші дні йдуть першими: ключі YYYY-MM-DD сортуються як рядки.
  if (state.activity.size > MAX_ACTIVITY_DAYS) {
    const days = [...state.activity.keys()].sort();
    for (const d of days.slice(0, days.length - MAX_ACTIVITY_DAYS)) state.activity.delete(d);
  }
}

function view(entry) {
  const { rev, at, ...rest } = entry;
  return rest;
}

// ---------- синхронізація ----------
// { status, body }. Запис умовний (версія документа), як резерв скану в
// billing.js: два телефони, що синхронізуються одночасно, не затирають
// одне одного — програвший перечитує документ і зливає ще раз.
async function sync(userId, body, now = Date.now()) {
  if (body.words !== undefined && !Array.isArray(body.words)) return { status: 400, body: { error: 'BAD_REQUEST' } };
  const raw = body.words || [];
  if (raw.length > MAX_PER_REQUEST) return { status: 413, body: { error: 'TOO_MANY_WORDS', max: MAX_PER_REQUEST } };
  const incoming = raw.map((w) => cleanEntry(w, now)).filter(Boolean);
  const since = Number.isSafeInteger(body.since) && body.since > 0 ? body.since : 0;

  for (let attempt = 0; attempt < 6; attempt++) {
    const doc = await store.get(DICTS, userId);
    const state = await decode(doc);
    // since більший за rev — сервер втратив дані (або це чужий rev):
    // клієнт має отримати все й надіслати своє заново.
    let reset = since === 0 || since > state.rev;
    const rev = state.rev + 1;
    const liveBefore = liveCount(state.words);
    const words = mergeWords(state.words, incoming, rev, now);
    const activity = mergeMax(state.activity, body.activity, (k) => isDay(k, now), Infinity);
    const stats = mergeMax(state.stats, body.stats, isStat, MAX_STATS);
    const seen = mergeSeen(state.seen, body.seen);

    if (words || activity || stats || seen) {
      const live = liveCount(state.words);
      if (live > MAX_LIVE_WORDS && live > liveBefore) {
        return { status: 413, body: { error: 'DICT_FULL', max: MAX_LIVE_WORDS } };
      }
      prune(state, now);
      const data = await encode(state);
      if (data.length > MAX_DATA_CHARS) return { status: 413, body: { error: 'DICT_FULL', max: MAX_LIVE_WORDS } };
      const fields = { rev, prunedRev: state.prunedRev, data, updatedAt: now };
      const r = doc
        ? await store.update(DICTS, userId, fields, { version: doc.__version })
        : await store.create(DICTS, userId, fields);
      if (!r.ok) continue;
      // Акаунт стерли, поки ми рахували: новий документ без власника — це
      // дані, які людина просила видалити. Прибираємо (див. auth.deleteUser).
      if (!doc && !(await store.get('users', userId))) {
        await store.del(DICTS, userId);
        return { status: 401, body: { error: 'UNAUTHORIZED' } };
      }
      state.rev = rev;
    }

    // since старіший за прибрані надгробки (рахуємо вже після prune цього
    // запису): частковою відповіддю видалення не передати — віддаємо все,
    // а stale каже клієнтові звірити словник, а не відсилати його назад.
    const stale = !reset && since < state.prunedRev;
    if (stale) reset = true;

    return {
      status: 200,
      body: {
        rev: state.rev,
        words: [...state.words.values()].filter((w) => reset || w.rev > since).map(view),
        activity: Object.fromEntries(state.activity),
        stats: Object.fromEntries(state.stats),
        seen: state.seen,
        reset,
        stale,
      },
    };
  }
  return { status: 503, body: { error: 'BUSY' } };
}

async function deleteDict(userId) {
  await store.del(DICTS, userId);
}

module.exports = { sync, deleteDict, decode, MAX_PER_REQUEST, MAX_LIVE_WORDS, TOMBSTONE_TTL_MS };
