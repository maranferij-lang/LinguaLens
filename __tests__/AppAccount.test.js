// Вхід через Apple і синхронізація в зв'язці з App: що тягнеться з акаунта,
// що лишається на телефоні після виходу, куди переїжджає Pro. Екрани тут не
// «тапаємо», а викликаємо їхні колбеки — перевіряється логіка App.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import DictionaryScreen from '../src/DictionaryScreen';
import FlashcardsScreen from '../src/FlashcardsScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

// Тут рендериться весь застосунок. Перший рендер на холодному кеші CI
// (2 ядра, кілька наборів паралельно) займає секунди, і стандартних 5 с
// не вистачало: тест, що вилетів за ліміт, лишав дерево змонтованим, і
// падали всі наступні. Логіка тестів від ліміту не залежить.
jest.setTimeout(20000);

jest.mock('expo-secure-store', () => {
  const keychain = new Map();
  return {
    AFTER_FIRST_UNLOCK: 0,
    keychain,
    getItemAsync: async (k) => keychain.get(k) ?? null,
    setItemAsync: async (k, v) => void keychain.set(k, v),
    deleteItemAsync: async (k) => void keychain.delete(k),
  };
});
const { keychain } = require('expo-secure-store');

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const NOW = Date.now();
const word = (id, extra = {}) => ({
  id,
  word: 'w-' + id,
  translation: 't',
  lang: 'es',
  nativeLang: 'en',
  addedAt: NOW - 86400000,
  srs: { box: 0, due: 0, reps: 0, correct: 0 },
  ...extra,
});
// уже синхронізоване слово
const synced = (id, extra) => {
  const w = word(id, extra);
  return { ...w, syncedAt: w.updatedAt || w.addedAt };
};

// ─── несправжній сервер ─────────────────────────────────────────────────────
// route(path, method, body, token) → [status, body] | undefined (немає мережі)
let route;
const requests = [];
function serve(fn) {
  route = fn;
}
const reply = (status, body) => ({ ok: status < 300, status, json: async () => body });
const me = (id, apple, extra) => [200, { user: { id, createdAt: 1, apple }, pro: { active: false }, usage: { day: localDayKey(), scans: 0, limit: 5 }, ...extra }];
const syncCalls = () => requests.filter((r) => r.path === '/sync');

beforeEach(async () => {
  keychain.clear();
  await AsyncStorage.clear();
  requests.length = 0;
  route = () => undefined;
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    const token = (init.headers?.authorization || '').replace('Bearer ', '');
    requests.push({ path: u.pathname, search: u.search, method: init.method || 'GET', body, token });
    const r = route(u.pathname, init.method || 'GET', body, token, u.search);
    if (!r) throw new TypeError('Network request failed');
    return reply(...r);
  });
  AppleAuthentication.isAvailableAsync.mockResolvedValue(true);
  AppleAuthentication.signInAsync.mockReset();
});

async function settle(n = 6) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 15));
    });
  }
}

async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  await settle();
  return tree;
}

async function run(fn) {
  let out;
  await act(async () => {
    out = await fn();
  });
  await settle(3);
  return out;
}

// Повернення: людина вже в застосунку; signedIn — телефон в акаунті 'acc'.
async function returning({ words = [], seen = ALL_ACH, signedIn = true, id = signedIn ? 'acc' : 'guest', extra = [] } = {}) {
  keychain.set('ll_token', id + '-token');
  await AsyncStorage.multiSet([
    ['ll_onboarded_v1', '1'],
    ['ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', theme: 'dark' })],
    ['ll_words_v1', JSON.stringify(words)],
    ['ll_seen_ach_v1', JSON.stringify(seen)],
    ['ll_device_v1', id],
    ...(signedIn ? [['ll_account_v1', JSON.stringify({ id })]] : []),
    ...extra,
  ]);
}

const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());

// Сервер акаунта, що чесно рахує rev і повертає зміни (спрощений /sync).
function accountServer(initial = [], { seen = ALL_ACH } = {}) {
  const st = { rev: initial.length ? 1 : 0, words: new Map(initial.map((w) => [w.id, { ...w, rev: 1 }])), seen };
  return {
    st,
    sync(body) {
      const reset = !body.since || body.since > st.rev;
      const rev = st.rev + 1;
      let changed = false;
      for (const e of body.words || []) {
        const cur = st.words.get(e.id);
        if (cur ? e.updatedAt <= cur.updatedAt : e.deleted) continue;
        st.words.set(e.id, { ...e, rev });
        changed = true;
      }
      if (changed) st.rev = rev;
      const words = [...st.words.values()].filter((w) => reset || w.rev > body.since).map(({ rev: _r, ...w }) => w);
      return [200, { rev: st.rev, words, activity: {}, stats: {}, seen: st.seen, reset }];
    },
  };
}

// ─── синхронізація на старті ────────────────────────────────────────────────
test('a signed-in phone pulls the account’s words on start, without a burst of achievement toasts', async () => {
  const remote = Array.from({ length: 30 }, (_, i) => ({ ...word('r' + i), updatedAt: NOW - 1000 }));
  // інший iPhone уже відсвяткував ці досягнення
  const srv = accountServer(remote, { seen: ['first_word', 'words_10', 'words_25'] });
  await returning({ words: [], seen: [] });
  serve((path, method, body) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return srv.sync(body);
  });
  const tree = await renderApp();

  expect(syncCalls()).toHaveLength(1);
  expect(syncCalls()[0]).toMatchObject({ token: 'acc-token', body: { since: 0, words: [] } });
  await openTab(tree, 'dict');
  expect(one(tree, DictionaryScreen).props.words).toHaveLength(30);
  expect((await stored('ll_words_v1')).every((w) => w.syncedAt === w.updatedAt)).toBe(true);
  expect(await stored('ll_seen_ach_v1')).toEqual(['first_word', 'words_10', 'words_25']);
  expect(one(tree, AchievementToast).props.achievement).toBeNull();
  expect(await stored('ll_sync_v1')).toMatchObject({ id: 'acc', since: 1 });
  await act(async () => tree.unmount());
});

test('a guest never talks to /sync and leaves no tombstones', async () => {
  await returning({ words: [word('a'), word('b')], signedIn: false });
  serve((path) => (path === '/me' ? me('guest', false) : undefined));
  const tree = await renderApp();
  await openTab(tree, 'dict');
  await run(() => one(tree, DictionaryScreen).props.onDelete('a'));
  expect(syncCalls()).toHaveLength(0);
  expect(await AsyncStorage.getItem('ll_tombstones_v1')).toBeNull();
  expect((await stored('ll_words_v1')).map((w) => w.id)).toEqual(['b']);
  await act(async () => tree.unmount());
});

test('after a reinstall the server’s user.apple brings the account (and the words) back', async () => {
  // Keychain пережив видалення застосунку, AsyncStorage — ні
  keychain.set('ll_token', 'acc-token');
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  const srv = accountServer([{ ...word('r1'), updatedAt: NOW - 5 }]);
  serve((path, method, body) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return srv.sync(body);
  });
  const tree = await renderApp();
  expect(await stored('ll_account_v1')).toEqual({ id: 'acc' });
  expect((await stored('ll_words_v1')).map((w) => w.id)).toEqual(['r1']);
  await act(async () => tree.unmount());
});

// ─── зміни на телефоні ──────────────────────────────────────────────────────
test('a deletion in the account leaves a tombstone that the next sync delivers and forgets', async () => {
  const words = [synced('a'), synced('b')];
  const srv = accountServer(words);
  await returning({ words, extra: [['ll_sync_v1', JSON.stringify({ id: 'acc', since: 1, at: NOW })]] });
  serve((path, method, body) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return srv.sync(body);
  });
  const tree = await renderApp();
  await openTab(tree, 'dict');
  await run(() => one(tree, DictionaryScreen).props.onDelete('a'));
  expect((await stored('ll_tombstones_v1')).map((x) => x.id)).toEqual(['a']);

  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onSyncNow());
  expect(syncCalls().at(-1).body.words).toEqual([expect.objectContaining({ id: 'a', deleted: true })]);
  expect(srv.st.words.get('a')).toMatchObject({ deleted: true });
  expect(await AsyncStorage.getItem('ll_tombstones_v1')).toBeNull();
  await act(async () => tree.unmount());
});

test('a review stamps the word and syncs it about five seconds later; returning to the app syncs too', async () => {
  const words = [synced('a')];
  const srv = accountServer(words);
  await returning({ words, extra: [['ll_sync_v1', JSON.stringify({ id: 'acc', since: 1, at: NOW })]] });
  serve((path, method, body) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return srv.sync(body);
  });
  const listenersFrom = AppState.addEventListener.mock.calls.length;
  const tree = await renderApp();
  const before = syncCalls().length;
  await openTab(tree, 'cards');

  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
  try {
    await act(async () => one(tree, FlashcardsScreen).props.onReview('a', true));
    const w = (await stored('ll_words_v1'))[0];
    expect(w.updatedAt).toBeGreaterThan(w.syncedAt);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(4000);
    });
    expect(syncCalls()).toHaveLength(before);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1500);
    });
    expect(syncCalls()).toHaveLength(before + 1);
    expect(syncCalls().at(-1).body.words.map((e) => [e.id, e.srs.box])).toEqual([['a', 1]]);
  } finally {
    jest.useRealTimers();
  }
  await settle();
  expect(srv.st.words.get('a').srs.box).toBe(1);

  // повернення в застосунок (не частіше, ніж раз на 15 с). AppState кличе
  // всіх слухачів цього дерева — і синхронізацію, і мову інтерфейсу.
  const listeners = AppState.addEventListener.mock.calls
    .slice(listenersFrom)
    .filter(([type]) => type === 'change')
    .map((c) => c[1]);
  const spy = jest.spyOn(Date, 'now').mockReturnValue(NOW + 3600000);
  try {
    await run(async () => listeners.forEach((fn) => fn('active')));
  } finally {
    spy.mockRestore();
  }
  expect(syncCalls()).toHaveLength(before + 2);
  await act(async () => tree.unmount());
});

// ─── вихід ──────────────────────────────────────────────────────────────────
test('signing out clears the phone and starts a fresh anonymous identity', async () => {
  const words = [synced('a', { photo: 'stickers/a.jpg' }), synced('b')];
  const srv = accountServer(words);
  await returning({
    words,
    extra: [
      ['ll_activity_v1', JSON.stringify({ [localDayKey()]: 2 })],
      ['ll_stats_v1', JSON.stringify({ quizzes: 1 })],
      ['ll_scenes_v1', '[]'],
    ],
  });
  serve((path, method, body, token) => {
    if (path === '/auth/device') return [200, { token: 'anon-token', user: { id: 'anon', createdAt: 2 } }];
    if (path === '/me') return token === 'anon-token' ? me('anon', false) : me('acc', true);
    if (path === '/sync') return srv.sync(body);
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.account.signedIn).toBe(true);

  await run(() => one(tree, SettingsScreen).props.onSignOut({ force: false }));

  for (const k of ['ll_words_v1', 'll_activity_v1', 'll_stats_v1', 'll_seen_ach_v1', 'll_sync_v1', 'll_tombstones_v1', 'll_scenes_v1', 'll_account_v1']) {
    expect([k, await AsyncStorage.getItem(k)]).toEqual([k, null]);
  }
  expect(await stored('ll_settings_v1')).toMatchObject({ nativeLang: 'en', targetLang: 'es', theme: 'dark' });
  expect(keychain.get('ll_token')).toBe('anon-token');
  expect(await AsyncStorage.getItem('ll_device_v1')).toBe('anon');
  expect(one(tree, SettingsScreen).props.account.signedIn).toBe(false);
  expect(one(tree, SettingsScreen).props.wordsCount).toBe(0);
  expect(requests.some((r) => r.path === '/me' && r.token === 'anon-token')).toBe(true);
  // а словник лишився в акаунті
  expect(srv.st.words.size).toBe(2);
  await act(async () => tree.unmount());
});

test('signing out with unsynced changes and no connection asks first; “anyway” goes ahead', async () => {
  await returning({ words: [word('dirty')] });
  serve((path, method, body, token) => {
    if (path === '/auth/device') return [200, { token: 'anon-token', user: { id: 'anon', createdAt: 2 } }];
    if (path === '/me') return token === 'anon-token' ? me('anon', false) : me('acc', true);
    // /sync — немає мережі
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  const err = await run(() => one(tree, SettingsScreen).props.onSignOut({ force: false }).catch((e) => e));
  expect(err.code).toBe('UNSYNCED');
  expect(await stored('ll_words_v1')).toHaveLength(1);
  expect(keychain.get('ll_token')).toBe('acc-token');

  await run(() => one(tree, SettingsScreen).props.onSignOut({ force: true }));
  expect(await AsyncStorage.getItem('ll_words_v1')).toBeNull();
  expect(keychain.get('ll_token')).toBe('anon-token');
  await act(async () => tree.unmount());
});

test('deletions still waiting from before a restart count as unsynced: signing out offline asks first', async () => {
  // стерли без мережі, iOS закрила застосунок, і запуск знову без мережі
  const tomb = { id: 'gone', deleted: true, updatedAt: NOW - 5 };
  await returning({
    words: [synced('a')],
    extra: [
      ['ll_sync_v1', JSON.stringify({ id: 'acc', since: 4, at: NOW })],
      ['ll_tombstones_v1', JSON.stringify([tomb])],
    ],
  });
  serve((path, method, body, token) => {
    if (path === '/auth/device') return [200, { token: 'anon-token', user: { id: 'anon', createdAt: 2 } }];
    if (path === '/me') return token === 'anon-token' ? me('anon', false) : me('acc', true);
    // /sync — немає мережі
  });
  const tree = await renderApp();
  expect(syncCalls()[0].body.words).toEqual([tomb]);
  await openTab(tree, 'settings');
  const err = await run(() => one(tree, SettingsScreen).props.onSignOut({ force: false }).catch((e) => e));
  expect(err?.code).toBe('UNSYNCED');
  expect(await stored('ll_tombstones_v1')).toEqual([tomb]);
  expect(keychain.get('ll_token')).toBe('acc-token');
  await act(async () => tree.unmount());
});

test('the account is full: the sync still pulls, the card says why, and sign-out names the real cause', async () => {
  const srv = accountServer([synced('a')]);
  // слово з іншого iPhone, якого тут ще немає
  srv.st.words.set('r1', { ...word('r1'), updatedAt: NOW - 5, rev: 2 });
  srv.st.rev = 2;
  await returning({ words: [synced('a'), word('new')], extra: [['ll_sync_v1', JSON.stringify({ id: 'acc', since: 1, at: NOW - 60000 })]] });
  serve((path, method, body, token) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return body.words.some((e) => e.id === 'new') ? [413, { error: 'DICT_FULL', max: 6000 }] : srv.sync(body);
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.sync).toMatchObject({ status: 'error', error: 'DICT_FULL' });
  expect(one(tree, SettingsScreen).props.sync.at).toBeGreaterThan(NOW - 60000);
  expect((await stored('ll_words_v1')).map((w) => w.id).sort()).toEqual(['a', 'new', 'r1']);

  const err = await run(() => one(tree, SettingsScreen).props.onSignOut({ force: false }).catch((e) => e));
  expect(err).toMatchObject({ code: 'UNSYNCED', reason: 'DICT_FULL' });
  expect(keychain.get('ll_token')).toBe('acc-token');
  await act(async () => tree.unmount());
});

test('erasing everything while signed in deletes the account and forgets the sign-in', async () => {
  await returning({ words: [synced('a')], extra: [['ll_sync_v1', JSON.stringify({ id: 'acc', since: 4, at: NOW })]] });
  serve((path, method, body, token) => {
    if (path === '/me' && method === 'DELETE') return [200, { ok: true }];
    if (path === '/auth/device') return [200, { token: 'anon-token', user: { id: 'anon', createdAt: 2 } }];
    if (path === '/me') return token === 'anon-token' ? me('anon', false) : me('acc', true);
    if (path === '/sync') return [200, { rev: 4, words: [], activity: {}, stats: {}, seen: ALL_ACH, reset: false }];
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onEraseEverything());
  expect(requests.some((r) => r.path === '/me' && r.method === 'DELETE' && r.token === 'acc-token')).toBe(true);
  for (const k of ['ll_account_v1', 'll_sync_v1', 'll_words_v1']) expect(await AsyncStorage.getItem(k)).toBeNull();
  expect(one(tree, SettingsScreen).props.account.signedIn).toBe(false);
  await act(async () => tree.unmount());
});

test('the account erased from another iPhone: this one becomes a guest and keeps its words', async () => {
  await returning({ words: [synced('a')], extra: [['ll_sync_v1', JSON.stringify({ id: 'acc', since: 4, at: NOW })]] });
  serve((path, method, body, token) => {
    if (path === '/auth/device') return [200, { token: 'anon-token', user: { id: 'anon', createdAt: 2 } }];
    if (path === '/me') return token === 'anon-token' ? me('anon', false) : [401, { error: 'UNAUTHORIZED' }];
    if (path === '/sync') return [401, { error: 'UNAUTHORIZED' }];
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.account.signedIn).toBe(false);
  expect(keychain.get('ll_token')).toBe('anon-token');
  expect((await stored('ll_words_v1')).map((w) => w.id)).toEqual(['a']);
  expect(await AsyncStorage.getItem('ll_sync_v1')).toBeNull();
  await act(async () => tree.unmount());
});

test('the server says the account is no longer linked: signed out, same identity, words kept', async () => {
  await returning({ words: [synced('a')] });
  serve((path) => {
    if (path === '/me') return me('acc', true);
    if (path === '/sync') return [403, { error: 'SIGN_IN_REQUIRED' }];
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.account.signedIn).toBe(false);
  expect(keychain.get('ll_token')).toBe('acc-token');
  expect(await AsyncStorage.getItem('ll_account_v1')).toBeNull();
  expect(await stored('ll_words_v1')).toHaveLength(1);
  await act(async () => tree.unmount());
});

// ─── вхід ───────────────────────────────────────────────────────────────────
describe('signing in with Apple', () => {
  const CREDENTIAL = { user: 'sub', identityToken: 'jwt', authorizationCode: 'code' };

  async function signInScenario({ pro }) {
    const srv = accountServer([{ ...word('r1', { word: 'la mesa' }), updatedAt: NOW - 50 }]);
    await returning({
      words: [word('g1', { word: 'la taza' })],
      signedIn: false,
      extra: pro ? [['ll_sub_v1', JSON.stringify({ planId: 'year', until: NOW + 30 * 86400000 })]] : [],
    });
    serve((path, method, body, token) => {
      if (path === '/auth/apple/nonce') return [200, { nonce: 'n', appleNonce: 'hn' }];
      if (path === '/auth/apple') return [200, { user: { id: 'acc', createdAt: 1, apple: true }, token: 'acc-token', switched: true }];
      if (path === '/me') return token === 'acc-token' ? me('acc', true) : me('guest', false);
      if (path === '/sync') return srv.sync(body);
    });
    AppleAuthentication.signInAsync.mockResolvedValueOnce(CREDENTIAL);
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const res = await run(() => one(tree, SettingsScreen).props.onSignIn());
    await settle();
    return { tree, res, srv };
  }

  test('into an account from another iPhone: guest words join it, and the account’s words arrive', async () => {
    const { tree, res, srv } = await signInScenario({ pro: false });
    expect(res).toEqual({ userId: 'acc', switched: true });
    expect(keychain.get('ll_token')).toBe('acc-token');
    expect(one(tree, SettingsScreen).props.account.signedIn).toBe(true);
    const push = syncCalls()[0];
    expect(push).toMatchObject({ token: 'acc-token', body: { since: 0 } });
    expect(push.body.words.map((e) => e.id)).toEqual(['g1']);
    expect([...srv.st.words.keys()].sort()).toEqual(['g1', 'r1']);
    expect((await stored('ll_words_v1')).map((w) => w.word).sort()).toEqual(['la mesa', 'la taza']);
    // Pro не було — переносити нічого
    expect(requests.some((r) => r.search === '?refresh=1')).toBe(false);
    await act(async () => tree.unmount());
  });

  test('a phone that had Pro restores purchases into the account and asks the server to re-check', async () => {
    const { tree } = await signInScenario({ pro: true });
    expect(requests.some((r) => r.path === '/me' && r.search === '?refresh=1' && r.token === 'acc-token')).toBe(true);
    await act(async () => tree.unmount());
  });
});

// ─── підказка в словнику ────────────────────────────────────────────────────
describe('the backup nudge in the dictionary', () => {
  const ten = Array.from({ length: 10 }, (_, i) => word('w' + i));

  test('appears for a guest with ten words, opens Settings, and stays dismissed', async () => {
    await returning({ words: ten, signedIn: false });
    serve((path) => (path === '/me' ? me('guest', false) : undefined));
    let tree = await renderApp();
    await openTab(tree, 'dict');
    expect(one(tree, DictionaryScreen).props.nudge).toBe(true);
    await run(() => one(tree, DictionaryScreen).props.onNudge());
    expect(one(tree, SettingsScreen)).not.toBeNull();

    await openTab(tree, 'dict');
    await run(() => one(tree, DictionaryScreen).props.onDismissNudge());
    expect(one(tree, DictionaryScreen).props.nudge).toBe(false);
    await act(async () => tree.unmount());

    tree = await renderApp();
    await openTab(tree, 'dict');
    expect(one(tree, DictionaryScreen).props.nudge).toBe(false);
    await act(async () => tree.unmount());
  });

  test.each([
    ['nine words', { words: ten.slice(1), signedIn: false }, true],
    ['already signed in', { words: ten.map((w) => ({ ...w, syncedAt: w.addedAt })) }, true],
    ['no Apple sign-in on this device', { words: ten, signedIn: false }, false],
  ])('stays hidden: %s', async (_, setup, available) => {
    AppleAuthentication.isAvailableAsync.mockResolvedValue(available);
    await returning(setup);
    serve((path, method, body) => {
      if (path === '/me') return me(setup.signedIn === false ? 'guest' : 'acc', setup.signedIn !== false);
      if (path === '/sync') return [200, { rev: 1, words: [], activity: {}, stats: {}, seen: ALL_ACH, reset: true }];
    });
    const tree = await renderApp();
    await openTab(tree, 'dict');
    expect(one(tree, DictionaryScreen).props.nudge).toBe(false);
    await act(async () => tree.unmount());
  });
});
