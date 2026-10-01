// Димовий тест: застосунок стартує офлайн, читає збережені дані й показує
// головний екран без падінь. Ловить те, що інакше видно лише на пристрої:
// неіснуючі імпорти, падіння рендеру, хуки в неправильному порядку.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import DictionaryScreen from '../src/DictionaryScreen';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
import ProfileScreen from '../src/ProfileScreen';
import ShareSheet from '../src/share/ShareSheet';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  // кілька тиків: читання сховища, шрифти, спроба мережі
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

const texts = (tree) =>
  tree.root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children);

test('first launch shows onboarding', async () => {
  const tree = await renderApp();
  expect(texts(tree).length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

test('returning user lands on the main screen with the tab bar, offline', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  await AsyncStorage.setItem(
    'll_words_v1',
    JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } }])
  );
  const tree = await renderApp();
  const all = texts(tree);
  expect(all).toEqual(expect.arrayContaining(['Words', 'Learn', 'Settings']));
  await act(async () => tree.unmount());
});

// ---------- сценарії, які видно лише в зв'язці App + екрани ----------
// Екрани тут не «тапаємо», а викликаємо їхні колбеки: так перевіряється саме
// логіка App (ліміти, пейвол, відкладені слова й тости), без камери й жестів.

const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const word = (i, lang = 'es') => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang, addedAt: Date.now(), srs: { box: 0, due: 0 } });
const words100 = () => Array.from({ length: 100 }, (_, i) => word(i));

async function returning({ settings = { nativeLang: 'en', targetLang: 'es' }, words = [], seen = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(settings));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(seen));
  if (wod) await AsyncStorage.setItem('ll_wod_v1', JSON.stringify(wod));
}

async function run(fn) {
  let out;
  await act(async () => {
    out = await fn();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return out;
}

const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());

test('fresh install on an English phone learns Spanish, not English → English', async () => {
  const tree = await renderApp();
  await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
  expect(await stored('ll_settings_v1')).toMatchObject({ nativeLang: 'en', targetLang: 'es', wodEnabled: false });
  await act(async () => tree.unmount());
});

test('skipping a replayed intro keeps word-of-day reminders on', async () => {
  await returning({ settings: { nativeLang: 'en', targetLang: 'es', wodEnabled: true } });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onReplayOnb());
  await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.wodEnabled).toBe(true);
  expect((await stored('ll_settings_v1')).wodEnabled).toBe(true);
  await act(async () => tree.unmount());
});

test('choosing the learned language as native cannot bypass the one-language limit', async () => {
  await returning({ settings: { nativeLang: 'uk', targetLang: 'en' }, words: [word(1, 'en')], seen: ALL_ACH });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onSetNative('en'));
  expect(one(tree, PaywallScreen).props.reason).toBe('langs');
  expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'uk', targetLang: 'en' });
  await act(async () => tree.unmount());
});

test('with no words yet, the same choice just swaps the languages', async () => {
  await returning({ settings: { nativeLang: 'uk', targetLang: 'en' } });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onSetNative('en'));
  expect(one(tree, PaywallScreen)).toBeNull();
  expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'en', targetLang: 'uk' });
  await act(async () => tree.unmount());
});

test('a scanned word denied by the free cap is saved once Pro is bought', async () => {
  await returning({ words: words100(), seen: ALL_ACH });
  const tree = await renderApp();
  const saved = await run(() => one(tree, ScannerScreen).props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
  expect(saved).toBe(false);
  expect(one(tree, PaywallScreen).props.reason).toBe('words');
  await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
  expect(one(tree, PaywallScreen)).toBeNull();
  const ws = await stored('ll_words_v1');
  expect(ws).toHaveLength(101);
  expect(ws[100].word).toBe('la taza');
  await act(async () => tree.unmount());
});

test('closing the paywall forgets the denied word', async () => {
  await returning({ words: words100(), seen: ALL_ACH });
  const tree = await renderApp();
  await run(() => one(tree, ScannerScreen).props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
  await run(() => one(tree, PaywallScreen).props.onClose());
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
  expect(await stored('ll_words_v1')).toHaveLength(100);
  await act(async () => tree.unmount());
});

test('an achievement unlocked from the scan result waits until the sheet closes', async () => {
  await returning();
  const tree = await renderApp();
  const scanner = () => one(tree, ScannerScreen);
  await run(() => scanner().props.onResultVisible(true));
  await run(() => scanner().props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
  expect(one(tree, AchievementToast).props.achievement).toBeNull();
  await run(() => scanner().props.onResultVisible(false));
  expect(one(tree, AchievementToast).props.achievement).not.toBeNull();
  await act(async () => tree.unmount());
});

describe('word of the day', () => {
  const wodFor = (lang, native, w = 'la manzana') => ({ lang, native, words: [{ date: localDayKey(), word: w, translation: 'apple' }] });

  test('a cached word from another language pair is not shown', async () => {
    await returning({ wod: wodFor('fr', 'en', 'la pomme') });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen).props.wordOfDay).toBeNull();
    await act(async () => tree.unmount());
  });

  test('is saved in its own language and counted once', async () => {
    await returning({ wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    expect((await stored('ll_words_v1')).map((w) => [w.word, w.lang, w.nativeLang])).toEqual([['la manzana', 'es', 'en']]);
    expect((await stored('ll_stats_v1')).wordOfDaySeen).toBe(1);
    await act(async () => tree.unmount());
  });

  // Віджет: заглушка expo-widgets із jest.setup.js; таймлайн — останній виклик.
  const lastTimeline = () => {
    const { createWidget } = require('expo-widgets');
    const calls = createWidget.mock.results.at(-1).value.updateTimeline.mock.calls;
    return calls.at(-1)[0];
  };

  test('the home-screen widget gets the cached word and follows the interface language', async () => {
    await returning({ wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    expect(lastTimeline()[0].props).toMatchObject({ state: 'word', word: 'la manzana', caption: 'Español · word of the day' });
    // тепер інтерфейс німецькою, а вчимо далі іспанську — кеш тієї ж пари не годиться
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onSetNative('de'));
    expect(lastTimeline()[0].props).toMatchObject({ state: 'empty', message: 'Öffne LinguaLens für neue Wörter' });
    await act(async () => tree.unmount());
  });

  test('a widget tap opens the Learn tab, on a cold start and while running', async () => {
    const { Linking } = require('react-native');
    await returning({ wod: wodFor('es', 'en') });
    Linking.getInitialURL.mockResolvedValueOnce('lingualens://word-of-day');
    const cold = await renderApp();
    expect(one(cold, FlashcardsScreen)).not.toBeNull();
    await act(async () => cold.unmount());

    const warm = await renderApp();
    expect(one(warm, FlashcardsScreen)).toBeNull();
    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await run(() => onUrl({ url: 'lingualens://word-of-day' }));
    expect(one(warm, FlashcardsScreen)).not.toBeNull();
    await act(async () => warm.unmount());
  });

  test('a widget tap with a session fetches fresh words if the cache ran dry while asleep', async () => {
    const { Linking } = require('react-native');
    await returning();
    serve((u, method) => {
      if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
      if (u.pathname === '/me') return reply(200, { user: { id: 'u' }, usage: { day: localDayKey(), scans: 0, limit: 5 } });
      if (u.pathname === '/word-of-day') return reply(503, { error: 'busy' });
    });
    const tree = await renderApp();
    const wodCalls = () => global.fetch.mock.calls.filter(([url]) => new URL(url).pathname === '/word-of-day').length;
    expect(wodCalls()).toBe(1);
    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await run(() => onUrl({ url: 'lingualens://word-of-day' }));
    expect(wodCalls()).toBe(2);
    await act(async () => tree.unmount());
  });

  test('a save denied by the free cap does not count', async () => {
    await returning({ words: words100(), wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    await run(() => one(tree, PaywallScreen).props.onClose());
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    expect((await stored('ll_stats_v1'))?.wordOfDaySeen).toBeUndefined();
    await act(async () => tree.unmount());
  });
});

// 401 UNAUTHORIZED — сервер забув пристрій: нова ідентичність. 403 APP_TOKEN —
// проблема збірки: ідентичність лишається.
test.each([
  [403, 'APP_TOKEN', 1],
  [401, 'UNAUTHORIZED', 2],
])('GET /me answering %i %s creates %i device identity(ies)', async (status, error, creations) => {
  await returning();
  global.fetch = jest.fn(async (url, { method }) => {
    const path = new URL(url).pathname;
    const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
    if (method === 'POST' && path === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (path === '/me') return reply(status, { error });
    throw new TypeError('Network request failed');
  });
  const tree = await renderApp();
  const created = global.fetch.mock.calls.filter(([url, { method }]) => method === 'POST' && new URL(url).pathname === '/auth/device');
  expect(created).toHaveLength(creations);
  await act(async () => tree.unmount());
});

// ---------- ліміт сканів із сервера ----------
const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
function serve(route) {
  global.fetch = jest.fn(async (url, init) => {
    const r = route(new URL(url), init?.method || 'GET');
    if (!r) throw new TypeError('Network request failed');
    return r;
  });
}

test('the scan ceiling comes from the server, not the hard-coded five', async () => {
  await returning();
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u' }, pro: { active: false }, usage: { day: localDayKey(), scans: 7, limit: 1000 } });
  });
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(993);
  expect(one(tree, ScannerScreen).props.onGuardScan()).toBe(true);
  expect(await stored('ll_usage_v1')).toMatchObject({ scans: 7, limit: 1000 });
  await act(async () => tree.unmount());
});

test('without Pro a 402 opens the paywall with the server’s limit', async () => {
  await returning();
  const tree = await renderApp();
  const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 3, limit: 3 }));
  expect(retry).toBe(false);
  expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'scans', freeScans: 3 });
  await act(async () => tree.unmount());
});

test('a 402 right after buying Pro makes the server re-check instead of showing the paywall', async () => {
  await returning();
  let webhookLanded = false;
  serve((u) => {
    if (u.pathname !== '/me') return null;
    const limit = webhookLanded ? null : 5;
    return reply(200, { user: { id: 'u' }, pro: { active: limit === null }, usage: { day: localDayKey(), scans: 5, limit } });
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
  await openTab(tree, 'scan');

  webhookLanded = true; // сервер дізнається, щойно перепитає RevenueCat
  global.fetch.mockClear();
  const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 5, limit: 5 }));
  expect(retry).toBe(true);
  expect(one(tree, PaywallScreen)).toBeNull();
  expect(global.fetch.mock.calls.map(([url]) => new URL(url).search)).toContain('?refresh=1');
  await act(async () => tree.unmount());
});

// ---------- картки «поділитись» ----------
const openShare = (tree) => tree.root.findAllByType(ShareSheet).find((x) => x.props.visible)?.props.payload;

test('an achievement is “fresh” only from the toast, not from the profile', async () => {
  await returning();
  const tree = await renderApp();
  const a = { id: 'first_word', tier: 1, goal: 1, metric: 'words' };
  await run(() => one(tree, AchievementToast).props.onPress(a));
  expect(openShare(tree)).toMatchObject({ kind: 'achievement', fresh: true });
  await run(() => one(tree, ShareSheet).props.onClose());

  await openTab(tree, 'profile');
  await run(() => one(tree, ProfileScreen).props.onShareAchievement(a));
  expect(openShare(tree)).toMatchObject({ kind: 'achievement', fresh: false });
  await act(async () => tree.unmount());
});

test('the week card counts this week, not a lifetime of reviews', async () => {
  const longAgo = Date.now() - 60 * 86400000;
  const veteran = Array.from({ length: 5 }, (_, i) => ({ ...word(i, 'fr'), addedAt: longAgo, srs: { box: 3, due: 0, reps: 40 } }));
  await returning({ words: veteran, seen: ALL_ACH });
  const tree = await renderApp();
  await openTab(tree, 'profile');
  await run(() => one(tree, ProfileScreen).props.onShareWeek());
  expect(openShare(tree).stats).toMatchObject({ words: 5, weekWords: 0, reviews: 0, langs: [] });
  await act(async () => tree.unmount());
});

// ---------- сцени ----------
const sceneWord = (w) => ({ word: w, translation: 't', lang: 'es', nativeLang: 'en', photo: null, shape: null, sceneId: 'sc' });

test('scene words: what fits under the free cap is saved, the rest waits for Pro', async () => {
  await returning({ words: words100().slice(0, 98), seen: ALL_ACH });
  const tree = await renderApp();
  const scanner = () => one(tree, ScannerScreen);
  const list = ['w1', 'la taza', 'el libro', 'la lámpara', 'la planta'].map(sceneWord); // w1 вже є
  const saved = await run(() => scanner().props.onSaveWords(list));
  expect(saved).toBe(2);
  expect(one(tree, PaywallScreen).props.reason).toBe('words');
  expect((await stored('ll_words_v1')).map((w) => w.word).slice(98)).toEqual(['la taza', 'el libro']);

  await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
  const ws = await stored('ll_words_v1');
  expect(ws.map((w) => w.word).slice(98)).toEqual(['la taza', 'el libro', 'la lámpara', 'la planta']);
  expect(ws.every((w) => w.srs && w.addedAt)).toBe(true);
  await act(async () => tree.unmount());
});

test('scene words already in the list are skipped and every new one counts as activity', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  const tree = await renderApp();
  const saved = await run(() => one(tree, ScannerScreen).props.onSaveWords(['w1', 'la taza', 'La Taza', 'el libro'].map(sceneWord)));
  expect(saved).toBe(2);
  expect(one(tree, PaywallScreen)).toBeNull();
  const ws = await stored('ll_words_v1');
  expect(ws.map((w) => [w.word, w.sceneId])).toEqual([['w1', undefined], ['la taza', 'sc'], ['el libro', 'sc']]);
  expect((await stored('ll_activity_v1'))[localDayKey()]).toBe(2);
  await act(async () => tree.unmount());
});

test('a scene lands in history, counts for achievements and shows up in the dictionary', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  const tree = await renderApp();
  const scene = {
    id: 'sc1',
    image: 'file:///cache/sc1.jpg',
    width: 1080,
    height: 1920,
    lang: 'es',
    nativeLang: 'en',
    createdAt: 1,
    objects: [{ key: 'o0', word: 'la taza', translation: 'mug', box: [1, 2, 300, 400], outline: null }],
    hidden: [],
  };
  const storedScene = await run(() => one(tree, ScannerScreen).props.onSceneScanned(scene));
  expect(storedScene.id).toBe('sc1');
  expect((await stored('ll_scenes_v1')).map((s) => s.id)).toEqual(['sc1']);
  expect((await stored('ll_stats_v1')).scenes).toBe(1);

  await run(() => one(tree, ScannerScreen).props.onUpdateScene('sc1', { hidden: ['o0'] }));
  expect((await stored('ll_scenes_v1'))[0].hidden).toEqual(['o0']);

  await openTab(tree, 'dict');
  const dict = one(tree, DictionaryScreen);
  expect(dict.props.scenes.map((s) => s.id)).toEqual(['sc1']);
  await run(() => dict.props.onDeleteScene('sc1'));
  expect(await stored('ll_scenes_v1')).toEqual([]);
  await act(async () => tree.unmount());
});

test('“delete all words” takes the scenes with it', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  await AsyncStorage.setItem('ll_scenes_v1', JSON.stringify([{ id: 'a', image: 'file:///x.jpg', objects: [] }]));
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.scenesCount).toBe(1);
  await run(() => one(tree, SettingsScreen).props.onClearAll());
  expect(await AsyncStorage.getItem('ll_scenes_v1')).toBeNull();
  expect(one(tree, SettingsScreen).props.scenesCount).toBe(0);
  await act(async () => tree.unmount());
});

test('the scanner mode is remembered between launches', async () => {
  await returning();
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scanMode).toBe('object');
  await run(() => one(tree, ScannerScreen).props.onScanModeChange('scene'));
  expect(one(tree, ScannerScreen).props.scanMode).toBe('scene');
  expect((await stored('ll_settings_v1')).scanMode).toBe('scene');
  await act(async () => tree.unmount());
});
