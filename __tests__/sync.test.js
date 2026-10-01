// Синхронізація словника: правила злиття й повний цикл проти несправжнього
// сервера, що поводиться за контрактом /sync (як server/sync.js): «пізніша
// зміна перемагає» строго, rev, надгробки, since/reset, максимум лічильників.
// Головне, що тут стережемо: два iPhone сходяться до того самого словника, а
// правки, зроблені поки летить запит, не губляться.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CHUNK,
  addTombstones,
  applyRemote,
  chunks,
  dedupe,
  isDirty,
  loadSyncState,
  loadTombstones,
  mergeCounts,
  mergeSeen,
  outgoing,
  runSync,
  stampOf,
  toWire,
  tombstoneFor,
  touch,
} from '../src/sync';

const LOCAL_ONLY = ['photo', 'shape', 'outline', 'box', 'sceneId', 'syncedAt'];
const WIRE = ['id', 'updatedAt', 'deleted', 'word', 'ipa', 'translation', 'example', 'exampleTranslation', 'lang', 'nativeLang', 'addedAt', 'srs'];

const w = (id, extra = {}) => ({
  id,
  word: 'w-' + id,
  translation: 't',
  lang: 'en',
  nativeLang: 'uk',
  addedAt: 1000,
  srs: { box: 0, due: 0, reps: 0, correct: 0 },
  ...extra,
});

beforeEach(async () => {
  await AsyncStorage.clear();
});

// ─── несправжній сервер ─────────────────────────────────────────────────────
function fakeServer({ clock = () => Date.now() } = {}) {
  const st = { rev: 0, words: new Map(), activity: {}, stats: {}, seen: [] };
  const calls = [];
  function clean(raw) {
    const out = {};
    for (const k of WIRE) if (raw[k] !== undefined) out[k] = raw[k];
    // годинник телефона, що поспішає, сервер урізає до свого «зараз»
    out.updatedAt = Math.min(raw.updatedAt, clock());
    return out;
  }
  async function request(body) {
    calls.push(JSON.parse(JSON.stringify(body)));
    if ((body.words || []).length > CHUNK) throw Object.assign(new Error('TOO_MANY_WORDS'), { code: 'TOO_MANY_WORDS' });
    const since = body.since > 0 ? body.since : 0;
    const reset = since === 0 || since > st.rev;
    const rev = st.rev + 1;
    let changed = false;
    for (const raw of body.words || []) {
      const e = clean(raw);
      const cur = st.words.get(e.id);
      if (cur ? e.updatedAt <= cur.updatedAt : e.deleted) continue;
      st.words.set(e.id, { ...e, rev });
      changed = true;
    }
    for (const key of ['activity', 'stats']) {
      for (const [k, v] of Object.entries(body[key] || {})) {
        if (v > (st[key][k] || 0)) {
          st[key][k] = v;
          changed = true;
        }
      }
    }
    for (const id of body.seen || []) {
      if (!st.seen.includes(id)) {
        st.seen.push(id);
        changed = true;
      }
    }
    if (changed) st.rev = rev;
    return {
      rev: st.rev,
      words: [...st.words.values()].filter((x) => reset || x.rev > since).map(({ rev: _r, ...x }) => x),
      activity: { ...st.activity },
      stats: { ...st.stats },
      seen: [...st.seen],
      reset,
    };
  }
  // Сервер втратив дані (новий документ із нуля)
  function lose() {
    st.rev = 0;
    st.words.clear();
  }
  return { st, calls, request, lose };
}

// ─── «телефон» ──────────────────────────────────────────────────────────────
// Кожен має власне сховище: перед його синхронізацією AsyncStorage
// підміняється на його вміст (since, надгробки), після — зберігається.
function phone(server, { userId = 'acc', words = [], request } = {}) {
  const d = { words, activity: {}, stats: {}, seen: [], removed: [], storage: [], alive: true };
  d.io = {
    userId,
    request: (body) => (request || server.request)(body),
    getWords: () => d.words,
    counts: () => ({ activity: d.activity, stats: d.stats, seen: d.seen }),
    apply: (res) => {
      d.words = res.words(d.words);
      d.activity = mergeCounts(d.activity, res.activity);
      d.stats = mergeCounts(d.stats, res.stats);
      d.seen = mergeSeen(d.seen, res.seen);
    },
    removePhoto: (p) => d.removed.push(p),
    alive: () => d.alive,
  };
  d.use = async (fn) => {
    await AsyncStorage.clear();
    if (d.storage.length) await AsyncStorage.multiSet(d.storage);
    const out = await fn();
    const keys = await AsyncStorage.getAllKeys();
    d.storage = await AsyncStorage.multiGet(keys);
    return out;
  };
  d.sync = () => d.use(() => runSync(d.io));
  d.delete = (id) =>
    d.use(async () => {
      const gone = d.words.find((x) => x.id === id);
      d.words = d.words.filter((x) => x.id !== id);
      await addTombstones([tombstoneFor(gone)]);
    });
  d.edit = (id, patch) => {
    d.words = d.words.map((x) => (x.id === id ? touch({ ...x, ...patch }) : x));
  };
  return d;
}

// Що бачить людина: синхронізовані поля, без місцевих позначок і наліпок.
const view = (words) =>
  words
    .map((x) => {
      const o = {};
      for (const k of ['id', 'word', 'translation', 'lang', 'srs']) o[k] = x[k];
      return o;
    })
    .sort((a, b) => a.id.localeCompare(b.id));

// ─── позначки часу ──────────────────────────────────────────────────────────
describe('stamps', () => {
  test('every change gets a newer stamp, even on a clock that lags behind', () => {
    expect(touch(w('a'), 5000).updatedAt).toBe(5000);
    // попередню версію писав телефон, чий годинник поспішає
    expect(touch(w('a', { updatedAt: 9000 }), 5000).updatedAt).toBe(9001);
  });

  test('old words without updatedAt count from addedAt and are dirty until synced', () => {
    const legacy = w('a');
    expect(stampOf(legacy)).toBe(1000);
    expect(isDirty(legacy)).toBe(true);
    expect(isDirty({ ...legacy, syncedAt: 1000 })).toBe(false);
    expect(isDirty(touch({ ...legacy, syncedAt: 1000 }))).toBe(true);
  });

  test('a tombstone is newer than the word it deletes', () => {
    expect(tombstoneFor(w('a', { updatedAt: 9000 }), 5000)).toEqual({ id: 'a', deleted: true, updatedAt: 9001 });
  });
});

// ─── що йде на сервер ───────────────────────────────────────────────────────
describe('outgoing', () => {
  test('local-only fields never leave the phone', () => {
    const local = w('a', {
      photo: 'stickers/a.jpg',
      shape: [[1, 2]],
      outline: [[1, 2]],
      box: [1, 2, 3, 4],
      sceneId: 's1',
      syncedAt: 5,
      ipa: '/a/',
      example: 'ex',
      exampleTranslation: 'пр',
    });
    const wire = toWire(local);
    for (const k of LOCAL_ONLY) expect(wire).not.toHaveProperty(k);
    expect(wire).toEqual({
      id: 'a',
      updatedAt: 1000,
      word: 'w-a',
      ipa: '/a/',
      translation: 't',
      example: 'ex',
      exampleTranslation: 'пр',
      lang: 'en',
      nativeLang: 'uk',
      addedAt: 1000,
      srs: { box: 0, due: 0, reps: 0, correct: 0 },
    });
  });

  test('only dirty words plus tombstones, or everything on a full push', () => {
    const clean = w('a', { syncedAt: 1000 });
    const dirty = w('b');
    const tomb = { id: 'c', deleted: true, updatedAt: 7 };
    expect(outgoing([clean, dirty], [tomb]).map((e) => e.id)).toEqual(['b', 'c']);
    expect(outgoing([clean, dirty], [tomb], { all: true }).map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  test('chunks of at most 500, and always at least one request', () => {
    const list = Array.from({ length: 1201 }, (_, i) => i);
    expect(chunks(list).map((c) => c.length)).toEqual([500, 500, 201]);
    expect(chunks([])).toEqual([[]]);
  });
});

// ─── злиття ─────────────────────────────────────────────────────────────────
describe('applyRemote', () => {
  test('last writer wins per word; on a tie the server version wins', () => {
    const local = [w('a', { updatedAt: 2000, syncedAt: 1500, translation: 'local' }), w('b', { updatedAt: 3000, translation: 'local' }), w('c', { updatedAt: 2000, translation: 'local' })];
    const remote = [
      { ...toWire(w('a')), updatedAt: 2500, translation: 'remote' },
      { ...toWire(w('b')), updatedAt: 2500, translation: 'remote' },
      { ...toWire(w('c')), updatedAt: 2000, translation: 'remote' },
    ];
    const out = applyRemote(local, remote).words;
    expect(out.map((x) => [x.id, x.translation])).toEqual([
      ['a', 'remote'],
      ['b', 'local'],
      ['c', 'remote'],
    ]);
    expect(isDirty(out[0])).toBe(false);
    expect(isDirty(out[1])).toBe(true); // піде на сервер наступним запитом
  });

  test('the sticker and other local-only fields survive a server update', () => {
    const local = [w('a', { photo: 'stickers/a.jpg', shape: [[1, 1]], outline: [[2, 2]], box: [1, 2, 3, 4], sceneId: 's', updatedAt: 1000 })];
    const out = applyRemote(local, [{ ...toWire(w('a')), updatedAt: 2000, translation: 'нове' }]).words[0];
    expect(out).toMatchObject({ photo: 'stickers/a.jpg', shape: [[1, 1]], outline: [[2, 2]], box: [1, 2, 3, 4], sceneId: 's', translation: 'нове', updatedAt: 2000, syncedAt: 2000 });
  });

  test('a newer tombstone removes the word and its sticker file; an older one does not', () => {
    const local = [w('a', { photo: 'stickers/a.jpg', updatedAt: 1000 }), w('b', { updatedAt: 5000, photo: 'stickers/b.jpg' })];
    const out = applyRemote(local, [
      { id: 'a', deleted: true, updatedAt: 2000 },
      { id: 'b', deleted: true, updatedAt: 3000 },
    ]);
    expect(out.words.map((x) => x.id)).toEqual(['b']);
    expect(out.removedPhotos).toEqual(['stickers/a.jpg']);
  });

  test('new words from the server arrive synced', () => {
    const out = applyRemote([], [{ ...toWire(w('x')), updatedAt: 4000 }]).words;
    expect(out).toEqual([{ ...toWire(w('x')), updatedAt: 4000, syncedAt: 4000 }]);
  });

  test('a word deleted here meanwhile is not resurrected by the echo', () => {
    const out = applyRemote([], [{ ...toWire(w('a')), updatedAt: 1000 }], {
      sent: new Map([['a', 1000]]),
      tombstones: [{ id: 'a', deleted: true, updatedAt: 1001 }],
    });
    expect(out.words).toEqual([]);
  });

  test('our own push comes back with the server’s clamped time and is adopted', () => {
    // годинник телефона поспішав: сервер записав 900 замість 5000
    const local = [w('a', { updatedAt: 5000 })];
    const out = applyRemote(local, [{ ...toWire(local[0]), updatedAt: 900 }], { sent: new Map([['a', 5000]]) }).words[0];
    expect(out.updatedAt).toBe(900);
    expect(isDirty(out)).toBe(false);
  });

  test('a push the server already had (not echoed) is marked synced, not resent forever', () => {
    const local = [w('a', { updatedAt: 1500 })];
    const out = applyRemote(local, [], { sent: new Map([['a', 1500]]) }).words[0];
    expect(isDirty(out)).toBe(false);
  });

  test('an edit made while the request was in flight is kept', () => {
    const edited = touch(w('a', { updatedAt: 1500, translation: 'нове' }), 1600);
    const out = applyRemote([edited], [{ ...toWire(w('a')), updatedAt: 1500 }], { sent: new Map([['a', 1500]]) }).words[0];
    expect(out.translation).toBe('нове');
    expect(isDirty(out)).toBe(true);
  });

  test('nothing changed — the very same array comes back', () => {
    const local = [w('a', { syncedAt: 1000 })];
    expect(applyRemote(local, []).words).toBe(local);
  });
});

describe('dedupe', () => {
  test('the earliest word wins, its twin becomes a tombstone, the sticker moves over', () => {
    const early = w('zz', { word: 'Mug', addedAt: 100, updatedAt: 100 });
    const late = w('aa', { word: 'mug ', addedAt: 200, updatedAt: 300, photo: 'stickers/aa.jpg', shape: [[1, 1]], box: [1, 1, 2, 2] });
    const other = w('b', { word: 'mug', lang: 'es' }); // інша мова — не дубль
    const out = dedupe([late, other, early]);
    expect(out.words.map((x) => x.id)).toEqual(['b', 'zz']);
    expect(out.words[1]).toMatchObject({ id: 'zz', word: 'Mug', photo: 'stickers/aa.jpg', shape: [[1, 1]], box: [1, 1, 2, 2] });
    expect(out.tombstones).toEqual([{ id: 'aa', deleted: true, updatedAt: 301 }]);
    expect(out.removedPhotos).toEqual([]);
  });

  test('same addedAt — the smaller id wins; both stickers — the loser’s file goes', () => {
    const a = w('a', { word: 'cup', addedAt: 100, photo: 'stickers/a.jpg' });
    const b = w('b', { word: 'cup', addedAt: 100, photo: 'stickers/b.jpg' });
    for (const order of [[a, b], [b, a]]) {
      const out = dedupe(order);
      expect(out.words.map((x) => [x.id, x.photo])).toEqual([['a', 'stickers/a.jpg']]);
      expect(out.removedPhotos).toEqual(['stickers/b.jpg']);
    }
  });

  test('no duplicates — untouched', () => {
    const list = [w('a'), w('b')];
    expect(dedupe(list).words).toBe(list);
  });
});

describe('counters', () => {
  test('activity and stats merge by maximum, achievements by union', () => {
    const local = { '2026-10-01': 3, quizzes: 2 };
    expect(mergeCounts(local, { '2026-10-01': 1, '2026-09-30': 4, quizzes: 5 })).toEqual({ '2026-10-01': 3, '2026-09-30': 4, quizzes: 5 });
    expect(mergeCounts(local, { quizzes: 1 })).toBe(local);
    const seen = ['first_word'];
    expect(mergeSeen(seen, ['words_10', 'first_word'])).toEqual(['first_word', 'words_10']);
    expect(mergeSeen(seen, ['first_word'])).toBe(seen);
  });
});

// ─── повний цикл ────────────────────────────────────────────────────────────
describe('runSync', () => {
  test('the first sync pushes everything in chunks of 500 and remembers since per account', async () => {
    const server = fakeServer();
    const words = Array.from({ length: 1201 }, (_, i) => w('w' + i, { syncedAt: 1000 })); // позначки іншого акаунта
    const p = phone(server, { words });
    p.activity = { '2026-10-01': 2 };
    p.seen = ['first_word'];
    await p.sync();

    expect(server.calls.map((c) => [c.since, c.words.length])).toEqual([
      [0, 500],
      [1, 500],
      [2, 201],
    ]);
    // лічильники — лише з першою пачкою
    expect(server.calls.map((c) => !!c.activity)).toEqual([true, false, false]);
    expect(server.st.words.size).toBe(1201);
    expect(p.words.every((x) => !isDirty(x))).toBe(true);
    for (const call of server.calls) for (const e of call.words) for (const k of LOCAL_ONLY) expect(e).not.toHaveProperty(k);

    server.calls.length = 0;
    p.edit('w5', { translation: 'нове' });
    await p.sync();
    expect(server.calls.map((c) => [c.since, c.words.map((e) => e.id)])).toEqual([[3, ['w5']]]);

    // інший акаунт — з нуля
    expect(await p.use(() => loadSyncState('another'))).toEqual({ since: 0, at: 0 });
  });

  test('two iPhones converge, and pick the same winner among duplicate words', async () => {
    const server = fakeServer();
    const a = phone(server, {
      words: [
        w('a1', { word: 'mug', addedAt: 100, photo: 'stickers/a1.jpg' }),
        w('a2', { word: 'lamp', addedAt: 110 }),
      ],
    });
    const b = phone(server, {
      words: [
        w('b1', { word: 'Mug', addedAt: 50 }), // раніше — переможець
        w('b2', { word: 'book', addedAt: 120, photo: 'stickers/b2.jpg' }),
      ],
    });

    await a.sync();
    await b.sync();
    await a.sync();
    await b.sync();

    expect(view(a.words)).toEqual(view(b.words));
    expect(a.words.map((x) => x.id).sort()).toEqual(['a2', 'b1', 'b2']);
    // наліпка переможеного переїхала до переможця на телефоні A
    expect(a.words.find((x) => x.id === 'b1').photo).toBe('stickers/a1.jpg');
    expect(server.st.words.get('a1')).toMatchObject({ deleted: true });

    // правка на A і видалення на B розходяться в обидва боки
    a.edit('b2', { translation: 'книга' });
    await b.delete('a2');
    await a.sync();
    await b.sync();
    await a.sync();
    expect(view(a.words)).toEqual(view(b.words));
    expect(a.words.map((x) => x.id).sort()).toEqual(['b1', 'b2']);
    expect(b.words.find((x) => x.id === 'b2')).toMatchObject({ translation: 'книга', photo: 'stickers/b2.jpg' });
    expect(server.calls.every((c) => c.words.length <= CHUNK)).toBe(true);
  });

  test('server data lost: the phone notices the reset and uploads its whole dictionary again', async () => {
    const server = fakeServer();
    const p = phone(server, { words: [w('a'), w('b')] });
    await p.sync();
    await p.sync();
    server.lose();
    server.calls.length = 0;

    await p.sync();
    expect(server.calls[0].since).toBeGreaterThan(0);
    expect(server.calls[1]).toMatchObject({ since: 0 });
    expect(server.calls[1].words.map((e) => e.id)).toEqual(['a', 'b']);
    expect([...server.st.words.keys()]).toEqual(['a', 'b']);
    expect(p.words.map((x) => x.id)).toEqual(['a', 'b']);
  });

  test('edits and deletions made while a request is in flight are not lost', async () => {
    const server = fakeServer();
    let release;
    let p;
    const slow = (body) =>
      new Promise((resolve) => {
        release = async () => {
          // людина відповіла на картку й стерла слово, поки запит летів
          p.edit('a', { srs: { box: 1, due: 9, reps: 1, correct: 1 } });
          const gone = p.words.find((x) => x.id === 'b');
          p.words = p.words.filter((x) => x.id !== 'b');
          await addTombstones([tombstoneFor(gone)]);
          resolve(server.request(body));
        };
      });
    p = phone(server, { words: [w('a'), w('b')], request: slow });
    const done = p.sync();
    await new Promise((r) => setTimeout(r, 0));
    await release();
    await done;

    expect(p.words.map((x) => x.id)).toEqual(['a']);
    expect(p.words[0].srs.reps).toBe(1);
    expect(isDirty(p.words[0])).toBe(true);
    expect((await p.use(loadTombstones)).map((x) => x.id)).toEqual(['b']);

    // наступний раз усе це доходить до сервера
    p.io.request = server.request;
    await p.sync();
    expect(server.st.words.get('a').srs.reps).toBe(1);
    expect(server.st.words.get('b')).toMatchObject({ deleted: true });
    expect(await p.use(loadTombstones)).toEqual([]);
    expect(isDirty(p.words[0])).toBe(false);
  });

  test('a failed request keeps tombstones and dirty words for the next try', async () => {
    const server = fakeServer();
    const p = phone(server, { words: [w('a')] });
    await p.sync();
    await p.delete('a');
    p.io.request = async () => {
      throw Object.assign(new Error('OFFLINE'), { code: 'OFFLINE' });
    };
    await expect(p.sync()).rejects.toThrow('OFFLINE');
    expect((await p.use(loadTombstones)).map((x) => x.id)).toEqual(['a']);
  });

  test('a cancelled sync (signed out meanwhile) applies nothing', async () => {
    const server = fakeServer();
    server.st.words.set('x', { ...toWire(w('x')), updatedAt: 5, rev: 1 });
    server.st.rev = 1;
    const p = phone(server, { words: [] });
    p.io.request = async (body) => {
      p.alive = false;
      return server.request(body);
    };
    expect(await p.sync()).toBeNull();
    expect(p.words).toEqual([]);
  });

  test('counters and achievements travel both ways', async () => {
    const server = fakeServer();
    const a = phone(server);
    const b = phone(server);
    a.activity = { '2026-09-30': 4 };
    a.stats = { quizzes: 3 };
    a.seen = ['first_word'];
    b.activity = { '2026-09-30': 1, '2026-10-01': 2 };
    b.seen = ['quiz_first'];
    await a.sync();
    await b.sync();
    await a.sync();
    expect(a.activity).toEqual({ '2026-09-30': 4, '2026-10-01': 2 });
    expect(b.stats).toEqual({ quizzes: 3 });
    expect(new Set(a.seen)).toEqual(new Set(['first_word', 'quiz_first']));
    expect(new Set(b.seen)).toEqual(new Set(['first_word', 'quiz_first']));
  });
});
