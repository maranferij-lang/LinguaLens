// Димовий тест: застосунок стартує офлайн, читає збережені дані й показує
// головний екран без падінь. Ловить те, що інакше видно лише на пристрої:
// неіснуючі імпорти, падіння рендеру, хуки в неправильному порядку.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
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
