// Firestore і metadata-сервер через підроблений fetch: таймаут на кожен виклик,
// один повтор для читань (503, 429, збій мережі, таймаут), записи повторюються
// лише після 429 (запит відхилено до виконання), токен запитується один раз
// на всіх одночасних. Режим firestore без емулятора: усе, що йде в
// googleapis.com чи metadata, перехоплює тест.
const { test, after, mock } = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, { FIRESTORE_PROJECT: 'demo-lingualens', FIRESTORE_EMULATOR_HOST: '' });
delete process.env.FIRESTORE_EMULATOR_HOST;

const realFetch = global.fetch;
const realTimeout = AbortSignal.timeout;
const meta = { calls: 0, script: [], ttl: 3600 };
const fsCalls = [];
let fsScript = [];
let cancelled = 0;

const METADATA = 'http://metadata.google.internal/';
const FIRESTORE = 'https://firestore.googleapis.com/';

global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.startsWith(METADATA)) {
    meta.calls++;
    const step = meta.script.length > 1 ? meta.script.shift() : meta.script[0];
    return step ? step(opts) : new Response(JSON.stringify({ access_token: 'tok', expires_in: meta.ttl }), { status: 200 });
  }
  if (u.startsWith(FIRESTORE)) {
    fsCalls.push({ url: u, method: opts.method || 'GET', headers: opts.headers, signal: opts.signal });
    const step = fsScript.length > 1 ? fsScript.shift() : fsScript[0];
    return step(opts);
  }
  return realFetch(url, opts);
};
// Таймер AbortSignal.timeout не тримає цикл подій живим, а сервера в цьому
// файлі немає: без власного таймера процес завершився б посеред тесту.
const keepAlive = setInterval(() => {}, 1000);
after(() => {
  clearInterval(keepAlive);
  global.fetch = realFetch;
  AbortSignal.timeout = realTimeout;
});

const DOC = { name: 'x', fields: { n: { integerValue: '7' } }, updateTime: '2026-10-08T10:00:00.000000Z' };
const ok = (body = DOC) => () => new Response(JSON.stringify(body), { status: 200 });
const status = (code, text = '{"error":{"status":"UNAVAILABLE"}}') => () =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(text));
        c.close();
      },
      cancel() {
        cancelled++;
      },
    }),
    { status: code }
  );
const netFail = () => {
  throw new TypeError('fetch failed');
};
const hang = (opts) => new Promise((_, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason)));

function reset(...steps) {
  fsCalls.length = 0;
  cancelled = 0;
  fsScript = steps;
}
async function noJitter(fn) {
  const m = mock.method(Math, 'random', () => 0);
  try {
    return await fn();
  } finally {
    m.mock.restore();
  }
}

const store = require('../store');

// ---------- токен ----------
test('the access token is fetched once for many simultaneous requests, and a failed fetch is not stuck', async () => {
  meta.ttl = 3600;
  meta.script = [async () => {
    await new Promise((r) => setTimeout(r, 30));
    return new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 });
  }];
  reset(ok());
  const docs = await Promise.all(Array.from({ length: 6 }, () => store.get('users', 'a')));
  assert.equal(meta.calls, 1);
  assert.ok(docs.every((d) => d.n === 7));
  assert.ok(fsCalls.every((c) => c.headers.authorization === 'Bearer tok-1'));
  // токен у кеші: далі metadata не питаємо
  await store.get('users', 'a');
  assert.equal(meta.calls, 1);
});

// ---------- читання ----------
test('a read is retried once on 503/429/500/502/504, a network error or a timeout; the discarded answer is closed', async () => {
  for (const code of [503, 429, 500, 502, 504]) {
    reset(status(code), ok());
    const doc = await noJitter(() => store.get('users', 'a'));
    assert.equal(doc.n, 7, String(code));
    assert.equal(fsCalls.length, 2, String(code));
    assert.equal(cancelled, 1, String(code));
  }
  reset(netFail, ok());
  assert.equal((await noJitter(() => store.get('users', 'a'))).n, 7);
  assert.equal(fsCalls.length, 2);

  // зависле з'єднання: перший виклик обірвався за таймаутом (5 с), другий спрацював
  const asked = [];
  AbortSignal.timeout = (n) => {
    asked.push(n);
    return realTimeout.call(AbortSignal, 40);
  };
  try {
    reset(hang, ok());
    assert.equal((await noJitter(() => store.get('users', 'a'))).n, 7);
    assert.deepEqual(asked, [5000, 5000]);
    // двічі зависло — помилка, не зависання
    reset(hang);
    await assert.rejects(() => noJitter(() => store.get('users', 'a')), { name: 'TimeoutError' });
    assert.equal(fsCalls.length, 2);
  } finally {
    AbortSignal.timeout = realTimeout;
  }
});

test('a read gives up after the second failure, and the expected answers are never retried', async () => {
  reset(status(503));
  await assert.rejects(() => noJitter(() => store.get('users', 'a')), /firestore get 503/);
  assert.equal(fsCalls.length, 2);

  reset(status(404, '{}'), ok());
  assert.equal(await store.get('users', 'a'), null);
  assert.equal(fsCalls.length, 1);

  reset(status(403, '{}'), ok());
  await assert.rejects(() => store.get('users', 'a'), /firestore get 403/);
  assert.equal(fsCalls.length, 1);

  // пошук за полем — теж читання
  reset(status(503), ok([{ document: DOC }]));
  assert.equal((await noJitter(() => store.findBy('users', 'appleKey', 'k'))).n, 7);
  assert.equal(fsCalls.length, 2);
});

// ---------- записи ----------
test('a conditional write is retried only after 429; a timeout, a lost answer or a 503 may mean it went through', async () => {
  const win = () => new Response(JSON.stringify({ writeResults: [{ updateTime: '2026-10-08T10:00:01Z' }] }), { status: 200 });

  reset(status(429), win);
  assert.deepEqual(await noJitter(() => store.update('users', 'a', { scans: 1 }, { version: 'v1' })), { ok: true, version: '2026-10-08T10:00:01Z' });
  assert.equal(fsCalls.length, 2);

  for (const failure of [status(503), status(500), netFail]) {
    reset(failure, win);
    await assert.rejects(() => noJitter(() => store.update('users', 'a', { scans: 1 }, { version: 'v1' })));
    assert.equal(fsCalls.length, 1, 'запис не повторюється');
  }

  // таймаут запису — 10 с, і теж без повтору
  const asked = [];
  AbortSignal.timeout = (n) => {
    asked.push(n);
    return realTimeout.call(AbortSignal, 40);
  };
  try {
    reset(hang, win);
    await assert.rejects(() => store.update('users', 'a', { scans: 1 }), { name: 'TimeoutError' });
    assert.deepEqual(asked, [10000]);
    assert.equal(fsCalls.length, 1);
  } finally {
    AbortSignal.timeout = realTimeout;
  }

  // очікувані відповіді лишаються тими, що були
  reset(status(409, '{"error":{"status":"ABORTED"}}'), win);
  assert.deepEqual(await store.update('users', 'a', { scans: 1 }, { version: 'v1' }), { ok: false, reason: 'conflict' });
  reset(status(404, '{}'), win);
  assert.deepEqual(await store.update('users', 'a', { scans: 1 }), { ok: false, reason: 'missing' });
  assert.equal(fsCalls.length, 1);
  reset(status(409, '{"error":{"status":"ALREADY_EXISTS"}}'), win);
  assert.deepEqual(await store.create('users', 'a', { id: 'a' }), { ok: false, reason: 'exists' });
  assert.equal(fsCalls.length, 1);

  // create і put: так само лише 429
  reset(status(429), win);
  assert.equal((await noJitter(() => store.create('users', 'a', { id: 'a' }))).ok, true);
  assert.equal(fsCalls.length, 2);
  reset(status(429), ok());
  assert.equal(await noJitter(() => store.put('wordCache', 'k', { word: 'x' })), true);
  assert.equal(fsCalls.length, 2);
  reset(status(503), ok());
  await assert.rejects(() => noJitter(() => store.put('wordCache', 'k', { word: 'x' })), /firestore put 503/);
  assert.equal(fsCalls.length, 1);
});

test('delete is idempotent, so a transient failure is retried; a missing document is success', async () => {
  reset(status(503), ok({}));
  assert.equal(await noJitter(() => store.del('users', 'a')), true);
  assert.equal(fsCalls.length, 2);
  reset(status(404, '{}'));
  assert.equal(await store.del('users', 'a'), true);
  assert.equal(fsCalls.length, 1);
});

test('the metadata token is retried too, and after a failure the next request asks again', async () => {
  // Токен із кешу діє годину: щоб він «протермінувався», зсуваємо годинник
  const realNow = Date.now;
  let shift = 0;
  Date.now = () => realNow() + shift;
  const token = (name) => () => new Response(JSON.stringify({ access_token: name, expires_in: 3600 }), { status: 200 });
  try {
    shift += 3 * 3600 * 1000;
    const before = meta.calls;
    meta.script = [() => new Response('{}', { status: 503 }), token('tok-2')];
    reset(ok());
    assert.equal((await noJitter(() => store.get('users', 'a'))).n, 7);
    assert.equal(meta.calls, before + 2);
    assert.equal(fsCalls.at(-1).headers.authorization, 'Bearer tok-2');

    // знову протермінувався; дві відмови поспіль — помилка, а не зависання
    shift += 3 * 3600 * 1000;
    const failedFrom = meta.calls;
    meta.script = [() => new Response('{}', { status: 500 })];
    reset(ok());
    await assert.rejects(() => noJitter(() => store.get('users', 'a')), /metadata token 500/);
    assert.equal(meta.calls, failedFrom + 2);
    assert.equal(fsCalls.length, 0, 'без токена до Firestore не ходили');

    // збій не залипає: наступний запит знову питає й отримує токен
    meta.script = [token('tok-3')];
    reset(ok());
    assert.equal((await store.get('users', 'a')).n, 7);
    assert.equal(fsCalls.at(-1).headers.authorization, 'Bearer tok-3');
  } finally {
    Date.now = realNow;
  }
});
