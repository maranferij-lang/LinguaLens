// Сховище даних для сервера LinguaLens.
// Два бекенди, вибір автоматичний:
//   1) firestore — якщо задано FIRESTORE_PROJECT (продакшн, Cloud Run).
//      Працює через REST API, токен береться з metadata-сервера Google Cloud.
//      Жодних npm-залежностей.
//   2) file — інакше (локальна розробка): звичайний JSON-файл поруч із сервером.
//
// Інтерфейс: get(collection, id), put(collection, id, obj), del(collection, id),
//            update(collection, id, fields, { version }), findBy(collection, field, value)
//
// put перезаписує документ цілком — лише для створення. Усе інше пише через
// update: тільки свої поля і лише в документ, що ще існує. Інакше два
// паралельні запити з різними знімками затирали б один одного (скан
// повертав би Pro, щойно відкликаний вебхуком, і воскрешав стертого
// користувача). version (Firestore updateTime) робить запис умовним:
// «лише якщо документ не змінився відтоді, як я його прочитав».

const fs = require('fs');
const path = require('path');

const PROJECT = process.env.FIRESTORE_PROJECT || '';
const MODE = PROJECT ? 'firestore' : 'file';
// Локальний емулятор Firestore (gcloud emulators firestore start): та сама
// REST-поведінка, що й у продакшені, без хмари. Стандартна змінна Google.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST || '';

// ---------- FILE ----------
// DATA_FILE — щоб тести працювали з тимчасовим файлом, не чіпаючи справжній.
const FILE = process.env.DATA_FILE || path.join(__dirname, 'data.json');
let cache = null;
// Версії документів у файловому режимі — лише в пам'яті, як лічильник записів.
const versions = new Map();
let versionSeq = 0;

function readFile() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (_) {
    cache = {};
  }
  return cache;
}
function writeFile() {
  try {
    fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
  } catch (e) {
    console.error('store: не вдалося записати data.json:', e.message);
  }
}

// ---------- FIRESTORE ----------
let tokenCache = { value: '', exp: 0 };

async function accessToken() {
  if (EMULATOR) return 'owner';
  const now = Date.now();
  if (tokenCache.value && now < tokenCache.exp) return tokenCache.value;
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token',
    { headers: { 'Metadata-Flavor': 'Google' } }
  );
  if (!res.ok) throw new Error('metadata token ' + res.status);
  const d = await res.json();
  tokenCache = { value: d.access_token, exp: now + (d.expires_in - 60) * 1000 };
  return tokenCache.value;
}

const FS_BASE = () =>
  `${EMULATOR ? 'http://' + EMULATOR : 'https://firestore.googleapis.com'}/v1/projects/${PROJECT}/databases/(default)/documents`;

// Конвертація JS <-> Firestore Value
function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string') return { stringValue: v };
  if (typeof v === 'number')
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  if (typeof v === 'object')
    return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
  return { stringValue: String(v) };
}
function fromFs(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('nullValue' in v) return null;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(fromFs);
  if ('mapValue' in v)
    return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, fromFs(x)]));
  return null;
}
function docToObj(doc) {
  if (!doc || !doc.fields) return null;
  return Object.fromEntries(Object.entries(doc.fields).map(([k, v]) => [k, fromFs(v)]));
}

// Версія документа йде прихованою властивістю: її не видно в JSON і її не
// запише назад put/update.
function withVersion(obj, version) {
  if (obj) Object.defineProperty(obj, '__version', { value: version, enumerable: false });
  return obj;
}

async function fsGet(coll, id) {
  const t = await accessToken();
  const res = await fetch(`${FS_BASE()}/${coll}/${encodeURIComponent(id)}`, {
    headers: { authorization: 'Bearer ' + t },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('firestore get ' + res.status);
  const doc = await res.json();
  return withVersion(docToObj(doc), doc.updateTime);
}

// Часткове умовне оновлення через :commit — як у офіційних SDK. updateMask
// змінює лише перелічені поля; currentDocument — умова: exists=true (не
// створювати заново стертий документ) або updateTime (документ не змінився
// відтоді, як ми його прочитали). Умова саме в тілі: емулятор ігнорує
// updateTime у query-параметрі PATCH.
async function fsUpdate(coll, id, fields, version) {
  const t = await accessToken();
  const write = {
    update: {
      name: `projects/${PROJECT}/databases/(default)/documents/${coll}/${id}`,
      fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toFs(v)])),
    },
    updateMask: { fieldPaths: Object.keys(fields) },
    currentDocument: version ? { updateTime: version } : { exists: true },
  };
  const res = await fetch(`${FS_BASE()}:commit`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' },
    body: JSON.stringify({ writes: [write] }),
  });
  if (res.ok) return { ok: true, version: (await res.json()).writeResults?.[0]?.updateTime };
  const text = await res.text().catch(() => '');
  if (res.status === 404) return { ok: false, reason: 'missing' };
  // інший запит устиг змінити (або стерти) документ — хай викликач перечитає
  if (res.status === 409 || /FAILED_PRECONDITION|ABORTED/.test(text)) return { ok: false, reason: 'conflict' };
  throw new Error('firestore update ' + res.status + ' ' + text.slice(0, 200));
}

async function fsPut(coll, id, obj) {
  const t = await accessToken();
  const fields = Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toFs(v)]));
  const res = await fetch(`${FS_BASE()}/${coll}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error('firestore put ' + res.status + ' ' + (await res.text()).slice(0, 200));
  return true;
}

async function fsDel(coll, id) {
  const t = await accessToken();
  const res = await fetch(`${FS_BASE()}/${coll}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: 'Bearer ' + t },
  });
  // 404 — документа вже немає, для видалення це теж успіх
  if (!res.ok && res.status !== 404) throw new Error('firestore delete ' + res.status);
  return true;
}

async function fsFindBy(coll, field, value) {
  const t = await accessToken();
  const body = {
    structuredQuery: {
      from: [{ collectionId: coll }],
      where: {
        fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: toFs(value) },
      },
      limit: 1,
    },
  };
  const res = await fetch(`${FS_BASE()}:runQuery`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('firestore query ' + res.status);
  const rows = await res.json();
  for (const r of rows) if (r.document) return docToObj(r.document);
  return null;
}

// ---------- ПУБЛІЧНИЙ ІНТЕРФЕЙС ----------
// Файловий режим віддає копію, як Firestore: кожен запит працює зі своїм
// знімком, і гонки в тестах поводяться так само, як у продакшені.
async function get(coll, id) {
  if (MODE === 'firestore') return fsGet(coll, id);
  const db = readFile();
  const obj = db[coll] && db[coll][id];
  return obj ? withVersion(structuredClone(obj), versions.get(coll + '/' + id) || 0) : null;
}

async function put(coll, id, obj) {
  if (MODE === 'firestore') return fsPut(coll, id, obj);
  const db = readFile();
  db[coll] = db[coll] || {};
  db[coll][id] = structuredClone(obj);
  versions.set(coll + '/' + id, ++versionSeq);
  writeFile();
  return true;
}

// Змінює лише передані поля верхнього рівня. { ok, version } або
// { ok: false, reason: 'missing' | 'conflict' }.
async function update(coll, id, fields, { version } = {}) {
  if (MODE === 'firestore') return fsUpdate(coll, id, fields, version);
  const db = readFile();
  const obj = db[coll] && db[coll][id];
  if (!obj) return { ok: false, reason: 'missing' };
  const key = coll + '/' + id;
  if (version !== undefined && (versions.get(key) || 0) !== version) return { ok: false, reason: 'conflict' };
  Object.assign(obj, structuredClone(fields));
  versions.set(key, ++versionSeq);
  writeFile();
  return { ok: true, version: versions.get(key) };
}

async function del(coll, id) {
  if (MODE === 'firestore') return fsDel(coll, id);
  const db = readFile();
  if (db[coll] && db[coll][id]) {
    delete db[coll][id];
    versions.delete(coll + '/' + id);
    writeFile();
  }
  return true;
}

async function findBy(coll, field, value) {
  if (MODE === 'firestore') return fsFindBy(coll, field, value);
  const db = readFile();
  const items = Object.values(db[coll] || {});
  return items.find((x) => x && x[field] === value) || null;
}

module.exports = { get, put, update, del, findBy, MODE };
