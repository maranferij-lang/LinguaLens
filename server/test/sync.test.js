// Синхронізація словника: справжній HTTP, акаунти через підробленого Apple.
// Відкликання тут НЕ налаштоване (немає ключа .p8) — заразом перевіряємо,
// що тоді DELETE /me не стукає в Apple.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const zlib = require('zlib');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createFakeApple, makeSignIn } = require('./helpers/fake-apple');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-sync-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  APPLE_TEAM_ID: '',
  APPLE_KEY_ID: '',
  APPLE_PRIVATE_KEY: '',
});
const apple = createFakeApple();
const { startServer, withClock } = require('./helpers/http');
const store = require('../store');
const syncModule = require('../sync');

let srv;
let call;
let newDevice;
let signIn;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
  signIn = makeSignIn(call, apple);
});
after(async () => {
  await srv.close();
  apple.restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

// Два телефони одного Apple ID: A прив'язує, B переходить у той самий акаунт.
async function account() {
  const sub = 'sub.' + crypto.randomBytes(12).toString('hex');
  const a = await newDevice();
  const ra = await signIn(a.token, sub);
  assert.equal(ra.status, 200);
  const b = await newDevice();
  const rb = await signIn(b.token, sub);
  assert.equal(rb.data.switched, true);
  return { id: ra.data.user.id, a: ra.data.token, b: rb.data.token };
}

const sync = (token, body, headers) => call('POST', '/sync', { token, body, headers });

let seq = 0;
function word(fields = {}) {
  seq++;
  const now = Date.now();
  return {
    id: 'w' + seq + crypto.randomBytes(3).toString('hex'),
    updatedAt: now,
    word: 'word ' + seq,
    ipa: '/wɜːd/',
    translation: 'слово ' + seq,
    example: 'An example.',
    exampleTranslation: 'Приклад.',
    lang: 'en',
    nativeLang: 'uk',
    addedAt: now,
    srs: { box: 1, due: now + 86400000, reps: 2, correct: 1 },
    ...fields,
  };
}

const byId = (list) => Object.fromEntries(list.map((w) => [w.id, w]));

test('sync is only for devices signed in with Apple', async () => {
  const { token } = await newDevice();
  const r = await sync(token, { since: 0, words: [] });
  assert.equal(r.status, 403);
  assert.equal(r.data.error, 'SIGN_IN_REQUIRED');
  assert.equal((await call('POST', '/sync', { body: { since: 0 } })).status, 401);
});

test('two devices push and pull through the server', async () => {
  const acc = await account();
  const w1 = word();
  const w2 = word();

  const a1 = await sync(acc.a, { since: 0, words: [w1, w2] });
  assert.equal(a1.status, 200);
  assert.equal(a1.data.reset, true);
  assert.equal(a1.data.rev, 1);
  assert.deepEqual(byId(a1.data.words), { [w1.id]: w1, [w2.id]: w2 });

  // B вперше: забирає все
  const b1 = await sync(acc.b, { since: 0, words: [] });
  assert.equal(b1.data.reset, true);
  assert.equal(b1.data.rev, 1);
  assert.deepEqual(Object.keys(byId(b1.data.words)).sort(), [w1.id, w2.id].sort());

  // B додає своє — у відповіді лише нове (rev > since)
  const w3 = word();
  const b2 = await sync(acc.b, { since: b1.data.rev, words: [w3] });
  assert.equal(b2.data.reset, false);
  assert.equal(b2.data.rev, 2);
  assert.deepEqual(b2.data.words, [w3]);

  // A отримує лише слово B
  const a2 = await sync(acc.a, { since: a1.data.rev, words: [] });
  assert.equal(a2.data.rev, 2);
  assert.deepEqual(a2.data.words, [w3]);

  // нічого нового — нічого не пишемо, rev той самий
  const a3 = await sync(acc.a, { since: a2.data.rev, words: [] });
  assert.equal(a3.data.rev, 2);
  assert.deepEqual(a3.data.words, []);
});

test('last writer wins per word, in both directions', async () => {
  const acc = await account();
  const t = Date.now() - 100000;
  const w = word({ updatedAt: t, translation: 'перший' });
  const a1 = await sync(acc.a, { since: 0, words: [w] });

  // B змінює пізніше — перемагає B
  const b1 = await sync(acc.b, { since: 0, words: [{ ...w, updatedAt: t + 1000, translation: 'від B' }] });
  assert.equal(byId(b1.data.words)[w.id].translation, 'від B');
  const a2 = await sync(acc.a, { since: a1.data.rev, words: [] });
  assert.equal(byId(a2.data.words)[w.id].translation, 'від B');

  // A надсилає СТАРІШУ зміну (була офлайн) — сервер її не бере
  const a3 = await sync(acc.a, { since: a2.data.rev, words: [{ ...w, updatedAt: t + 500, translation: 'застаре' }] });
  assert.equal(a3.data.rev, a2.data.rev);
  assert.deepEqual(a3.data.words, []);
  // рівний час — теж ні: лишається те, що вже на сервері
  const a4 = await sync(acc.a, { since: a3.data.rev, words: [{ ...w, updatedAt: t + 1000, translation: 'нічия' }] });
  assert.deepEqual(a4.data.words, []);

  // A змінює ще пізніше — тепер перемагає A, і B це отримує
  await sync(acc.a, { since: a4.data.rev, words: [{ ...w, updatedAt: t + 2000, translation: 'від A' }] });
  const b2 = await sync(acc.b, { since: b1.data.rev, words: [] });
  assert.equal(byId(b2.data.words)[w.id].translation, 'від A');
});

test('deletions travel as tombstones and are pruned after 60 days', async () => {
  const acc = await account();
  const w = word();
  const keep = word();
  await sync(acc.a, { since: 0, words: [w, keep] });
  const b1 = await sync(acc.b, { since: 0, words: [] });

  const del = await sync(acc.a, { since: 0, words: [{ id: w.id, deleted: true, updatedAt: Date.now() + 1 }] });
  assert.equal(del.status, 200);
  const b2 = await sync(acc.b, { since: b1.data.rev, words: [] });
  assert.deepEqual(b2.data.words, [{ id: w.id, deleted: true, updatedAt: byId(b2.data.words)[w.id].updatedAt }]);

  // старіша правка того самого слова не воскрешає його
  const stale = await sync(acc.b, { since: b2.data.rev, words: [{ ...w, updatedAt: w.updatedAt }] });
  assert.deepEqual(stale.data.words, []);

  // надгробок для слова, якого сервер не знав, не зберігаємо
  const ghost = await sync(acc.a, { since: 0, words: [{ id: 'never-synced', deleted: true, updatedAt: Date.now() }] });
  assert.equal(byId(ghost.data.words)['never-synced'], undefined);

  // через 61 день наступний запис прибирає надгробок
  await withClock(61 * 86400000, async () => {
    const r = await sync(acc.a, { since: 0, words: [word()] });
    assert.equal(r.status, 200);
    const ids = byId(r.data.words);
    assert.equal(ids[w.id], undefined);
    assert.ok(ids[keep.id]);
  });
});

test('a tombstone of a long-offline phone lives 60 days from when the server got it', async () => {
  const acc = await account();
  const w = word({ updatedAt: Date.now() - 90 * 86400000 });
  await sync(acc.a, { since: 0, words: [w] });
  // видалили 70 днів тому, а телефон лише зараз вийшов у мережу
  await sync(acc.a, { since: 0, words: [{ id: w.id, deleted: true, updatedAt: Date.now() - 70 * 86400000 }] });
  const r = await sync(acc.b, { since: 0, words: [word()] });
  assert.equal(byId(r.data.words)[w.id].deleted, true);
});

test('since ahead of the server rev means the server lost data: everything comes back with reset', async () => {
  const acc = await account();
  const w = word();
  const first = await sync(acc.a, { since: 0, words: [w] });
  const r = await sync(acc.a, { since: first.data.rev + 50, words: [] });
  assert.equal(r.status, 200);
  assert.equal(r.data.reset, true);
  assert.deepEqual(r.data.words, [w]);
  // since без числа — як 0
  assert.equal((await sync(acc.a, { since: 'x' })).data.reset, true);
});

test('incoming words are sanitised: whitelist, clamped strings, bad ids and stamps rejected', async () => {
  const acc = await account();
  const now = Date.now();
  const good = word({
    word: '  ' + 'm'.repeat(100) + '  ',
    example: 'e'.repeat(500),
    photo: 'file:///private/sticker.png',
    outline: [[1, 2]],
    box: [1, 2, 3, 4],
    sceneId: 's1',
    shape: 'circle',
    evil: { nested: true },
    lang: 'en; DROP',
    nativeLang: 'zh-Hans',
    srs: { box: 9, due: 'soon', reps: -3, correct: 2.7, extra: 1 },
    updatedAt: now + 3600 * 1000, // годинник телефона поспішає на годину
  });
  const bad = [
    { ...word(), id: '../etc/passwd' },
    { ...word(), id: 'x'.repeat(41) },
    { ...word(), id: 'has space' },
    { ...word(), id: 42 },
    { ...word(), updatedAt: 'yesterday' },
    { ...word(), updatedAt: undefined },
    { ...word(), word: '   ' },
    null,
    'string',
  ];
  const r = await sync(acc.a, { since: 0, words: [good, ...bad] });
  assert.equal(r.status, 200);
  assert.equal(r.data.words.length, 1);
  const w = r.data.words[0];
  assert.deepEqual(Object.keys(w).sort(), [
    'addedAt', 'example', 'exampleTranslation', 'id', 'ipa', 'lang', 'nativeLang', 'srs', 'translation', 'updatedAt', 'word',
  ]);
  assert.equal(w.word, 'm'.repeat(60));
  assert.equal(w.example.length, 240);
  assert.equal(w.lang, '');
  assert.equal(w.nativeLang, 'zh-Hans');
  assert.deepEqual(w.srs, { box: 5, due: 0, reps: 0, correct: 2 });
  // час «з майбутнього» обрізано до серверного «зараз»
  assert.ok(w.updatedAt <= Date.now() && w.updatedAt >= now);
  // у збереженому документі теж нічого зайвого
  const stored = JSON.stringify([...(await syncModule.decode(await store.get('dicts', acc.id))).words.values()]);
  for (const leak of ['sticker', 'sceneId', 'shape', 'nested', 'outline', 'extra']) assert.ok(!stored.includes(leak), leak);

  // id «__proto__» — просто id: не ламає словник і не чіпає прототипів
  const proto = await call('POST', '/sync', {
    token: acc.a,
    body: `{"since":0,"words":[{"id":"__proto__","updatedAt":${Date.now()},"word":"proto"}],"stats":{"__proto__":3}}`,
  });
  assert.equal(proto.status, 200);
  assert.equal(proto.data.words.find((x) => x.id === '__proto__').word, 'proto');
  assert.equal(proto.data.words.length, 2);
  assert.equal({}.word, undefined);
});

test('activity, stats and seen merge by max and union with limits', async () => {
  const acc = await account();
  const today = new Date().toISOString().slice(0, 10);
  const a = await sync(acc.a, {
    since: 0,
    activity: { [today]: 3, '2024-02-30': 5, '9999-12-31': 9, 'not-a-day': 1, '2025-01-01': -4 },
    stats: { quizzes: 4, perfectQuiz: 1, 'bad key': 3, __proto__x: 1 },
    seen: ['first_word', 'x'.repeat(41), 7, 'first_word'],
  });
  assert.equal(a.status, 200);
  assert.deepEqual(a.data.activity, { [today]: 3 });
  assert.deepEqual(a.data.stats, { quizzes: 4, perfectQuiz: 1, __proto__x: 1 });
  assert.deepEqual(a.data.seen, ['first_word']);

  const b = await sync(acc.b, {
    since: 0,
    activity: { [today]: 2, '2025-01-01': 7 },
    stats: { quizzes: 6, perfectQuiz: 0 },
    seen: ['streak_3', ...Array.from({ length: 300 }, (_, i) => 'ach_' + i)],
  });
  assert.deepEqual(b.data.activity, { [today]: 3, '2025-01-01': 7 });
  assert.deepEqual(b.data.stats, { quizzes: 6, perfectQuiz: 1, __proto__x: 1 });
  assert.equal(b.data.seen.length, 200);
  assert.deepEqual(b.data.seen.slice(0, 2), ['first_word', 'streak_3']);
});

test('more than 500 words per request is refused', async () => {
  const acc = await account();
  const r = await sync(acc.a, { since: 0, words: Array.from({ length: 501 }, () => word()) });
  assert.equal(r.status, 413);
  assert.equal(r.data.error, 'TOO_MANY_WORDS');
  assert.equal((await sync(acc.a, { since: 0, words: 'nope' })).status, 400);
});

test('an account holds at most 6000 live words; edits and deletes still work when full', async () => {
  const acc = await account();
  let rev = 0;
  const all = [];
  for (let i = 0; i < 12; i++) {
    const chunk = Array.from({ length: 500 }, () => word({ example: '', exampleTranslation: '' }));
    all.push(...chunk);
    const r = await sync(acc.a, { since: rev, words: chunk });
    assert.equal(r.status, 200, 'chunk ' + i);
    rev = r.data.rev;
  }
  const full = await sync(acc.a, { since: rev, words: [word()] });
  assert.equal(full.status, 413);
  assert.equal(full.data.error, 'DICT_FULL');

  const edit = await sync(acc.a, { since: rev, words: [{ ...all[0], updatedAt: Date.now() + 1, translation: 'нове' }] });
  assert.equal(edit.status, 200);
  const del = await sync(acc.a, { since: edit.data.rev, words: [{ id: all[1].id, deleted: true, updatedAt: Date.now() + 2 }] });
  assert.equal(del.status, 200);
  // місце звільнилось — одне нове слово знову влазить
  assert.equal((await sync(acc.a, { since: del.data.rev, words: [word()] })).status, 200);

  // і 6000 слів справді вміщаються в один документ Firestore
  const doc = await store.get('dicts', acc.id);
  assert.ok(doc.data.length < 1000000, String(doc.data.length));
});

test('a dictionary that would not fit one Firestore document is refused with DICT_FULL, nothing lost', async () => {
  const acc = await account();
  // Випадкові довгі тексти майже не стискаються: ~1400 таких слів — це вже
  // понад мільйон символів base64.
  const noise = (n) => crypto.randomBytes(n).toString('base64').slice(0, n);
  const heavy = () =>
    word({ word: noise(60), ipa: noise(80), translation: noise(80), example: noise(240), exampleTranslation: noise(240) });
  let rev = 0;
  let refused = null;
  for (let i = 0; i < 6 && !refused; i++) {
    const r = await sync(acc.a, { since: rev, words: Array.from({ length: 500 }, heavy) });
    if (r.status === 413) refused = r;
    else rev = r.data.rev;
  }
  assert.ok(refused, 'the size guard must trip before 3000 words');
  assert.equal(refused.data.error, 'DICT_FULL');
  // попередній стан цілий і читається
  const all = await sync(acc.b, { since: 0 });
  assert.equal(all.data.rev, rev);
  assert.equal(all.data.words.length, rev * 500);
});

test('concurrent pushes from two devices both survive (optimistic retry)', async () => {
  const acc = await account();
  await sync(acc.a, { since: 0, words: [word()] });
  // Обидва запити читають ту саму версію документа, перш ніж хтось запише.
  const get = store.get;
  const update = store.update;
  let waiting = [];
  let conflicts = 0;
  const releaseAll = () => {
    if (!waiting) return;
    waiting.forEach((f) => f());
    waiting = null;
  };
  const safety = setTimeout(releaseAll, 3000);
  store.get = async (coll, id) => {
    const out = await get(coll, id);
    if (coll === 'dicts' && id === acc.id && waiting) {
      await new Promise((r) => {
        waiting.push(r);
        if (waiting.length === 2) releaseAll();
      });
    }
    return out;
  };
  store.update = async (...args) => {
    const r = await update(...args);
    if (args[0] === 'dicts' && !r.ok) conflicts++;
    return r;
  };
  const wa = word();
  const wb = word();
  let ra;
  let rb;
  try {
    [ra, rb] = await Promise.all([sync(acc.a, { since: 0, words: [wa] }), sync(acc.b, { since: 0, words: [wb] })]);
  } finally {
    store.get = get;
    store.update = update;
    clearTimeout(safety);
  }
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
  assert.ok(conflicts >= 1, 'a write conflict must have happened');
  const after = await sync(acc.a, { since: 0 });
  const ids = byId(after.data.words);
  assert.ok(ids[wa.id] && ids[wb.id]);
  assert.equal(after.data.rev, 3);
});

test('the dictionary is stored as base64 gzip JSON and big responses are gzipped', async () => {
  const acc = await account();
  const words = Array.from({ length: 50 }, () => word());
  await sync(acc.a, { since: 0, words, stats: { quizzes: 2 } });

  const doc = await store.get('dicts', acc.id);
  assert.equal(doc.rev, 1);
  assert.ok(doc.updatedAt > 0);
  const json = JSON.parse(zlib.gunzipSync(Buffer.from(doc.data, 'base64')).toString('utf8'));
  assert.equal(Object.keys(json.words).length, 50);
  assert.equal(json.words[words[0].id].rev, 1);
  assert.equal(json.words[words[0].id].word, words[0].word);
  assert.deepEqual(json.stats, { quizzes: 2 });
  // і модуль читає рівно те, що записав
  const state = await syncModule.decode(doc);
  assert.equal(state.words.size, 50);

  const gz = await sync(acc.b, { since: 0 }, { 'accept-encoding': 'gzip' });
  assert.equal(gz.headers.get('content-encoding'), 'gzip');
  assert.equal(gz.data.words.length, 50);
  const plain = await sync(acc.b, { since: 0 }, { 'accept-encoding': 'gzip;q=0, identity' });
  assert.equal(plain.headers.get('content-encoding'), null);
  assert.deepEqual(plain.data, gz.data);
});

test('a sync that finishes after the account was deleted leaves no dictionary behind', async () => {
  const id = 'gone-' + crypto.randomUUID();
  const r = await syncModule.sync(id, { since: 0, words: [word()] });
  assert.equal(r.status, 401);
  assert.equal(await store.get('dicts', id), null);
});

test('DELETE /me wipes the synced dictionary; without a .p8 key Apple is not called', async () => {
  const acc = await account();
  await sync(acc.a, { since: 0, words: [word()] });
  assert.ok(await store.get('dicts', acc.id));
  assert.equal((await call('DELETE', '/me', { token: acc.b })).status, 200);
  assert.equal(await store.get('dicts', acc.id), null);
  assert.equal(apple.revokeCalls.length, 0);
  assert.equal(apple.tokenCalls.length, 0);
  // обидва пристрої акаунта тепер «забуті»
  assert.equal((await call('GET', '/me', { token: acc.a })).status, 401);
});

test('sync is rate limited per IP', async () => {
  const acc = await account();
  let last;
  for (let i = 0; i < 61; i++) {
    last = await call('POST', '/sync', { token: acc.a, body: { since: 0 }, ip: '203.0.113.88' });
  }
  assert.equal(last.status, 429);
});

test('a body over 1 MB is refused with 413', async () => {
  const acc = await account();
  const r = await call('POST', '/sync', { token: acc.a, body: JSON.stringify({ since: 0, pad: 'x'.repeat(1100 * 1024) }) }).catch(() => ({
    status: 413,
  }));
  assert.equal(r.status, 413);
});
