// Сховище даних для сервера LinguaLens.
// Два бекенди, вибір автоматичний:
//   1) firestore — якщо задано FIRESTORE_PROJECT (продакшн, Cloud Run).
//      Працює через REST API, токен береться з metadata-сервера Google Cloud.
//      Жодних npm-залежностей.
//   2) file — інакше (локальна розробка): звичайний JSON-файл поруч із сервером.
//
// Інтерфейс: get(collection, id), put(collection, id, obj), findBy(collection, field, value)

const fs = require('fs');
const path = require('path');

const PROJECT = process.env.FIRESTORE_PROJECT || '';
const MODE = PROJECT ? 'firestore' : 'file';

// ---------- FILE ----------
const FILE = path.join(__dirname, 'data.json');
let cache = null;

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
  `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

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

async function fsGet(coll, id) {
  const t = await accessToken();
  const res = await fetch(`${FS_BASE()}/${coll}/${encodeURIComponent(id)}`, {
    headers: { authorization: 'Bearer ' + t },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('firestore get ' + res.status);
  return docToObj(await res.json());
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
async function get(coll, id) {
  if (MODE === 'firestore') return fsGet(coll, id);
  const db = readFile();
  return (db[coll] && db[coll][id]) || null;
}

async function put(coll, id, obj) {
  if (MODE === 'firestore') return fsPut(coll, id, obj);
  const db = readFile();
  db[coll] = db[coll] || {};
  db[coll][id] = obj;
  writeFile();
  return true;
}

async function findBy(coll, field, value) {
  if (MODE === 'firestore') return fsFindBy(coll, field, value);
  const db = readFile();
  const items = Object.values(db[coll] || {});
  return items.find((x) => x && x[field] === value) || null;
}

module.exports = { get, put, findBy, MODE };
