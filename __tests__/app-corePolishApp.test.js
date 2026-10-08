// Полірування ядра застосунку, у зв'язці App + екрани: слово дня після
// півночі, стирання даних, мережевий старт, замок вкладок на розпізнаванні,
// прохання про оцінку, таб-бар, відновлення покупок, мови слова дня,
// налаштування в одному такті, відмова в сповіщеннях, шари поверх вкладок,
// заставка. Екрани тут не «тапаємо», а викликаємо їхні колбеки.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Alert, AppState, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import PaywallScreen from '../src/PaywallScreen';
import ProfileEditor from '../src/ProfileEditor';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';
import { FadeIn } from '../src/ui';
import { THEMES, resolveTheme } from '../src/theme';
import { makeT } from '../src/i18n';
import { settingsPair, wodSignature } from '../src/wordOfDay';

jest.setTimeout(30000);

jest.mock('../src/review', () => ({ maybeAskForReview: jest.fn(async () => true) }));
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
  setOptions: jest.fn(),
}));
jest.mock('expo-notifications', () => {
  const state = { permission: { status: 'granted', canAskAgain: true } };
  return {
    state,
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => state.permission),
    requestPermissionsAsync: jest.fn(async () => state.permission),
    getAllScheduledNotificationsAsync: jest.fn(async () => []),
    cancelScheduledNotificationAsync: jest.fn(async () => {}),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    setNotificationChannelAsync: jest.fn(async () => {}),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
    getLastNotificationResponse: jest.fn(() => null),
    clearLastNotificationResponse: jest.fn(),
    SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
    AndroidImportance: { DEFAULT: 3 },
    DEFAULT_ACTION_IDENTIFIER: 'default',
  };
});

const Notifications = require('expo-notifications');
const SplashScreen = require('expo-splash-screen');
const { maybeAskForReview } = require('../src/review');

const en = makeT('en');
const TODAY = localDayKey();
const DAY = 86400000;
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const dayKeyAt = (offset, from = Date.now()) => localDayKey(new Date(from + offset * DAY));

// ---- сервер ----
let calls = [];
let net;
const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
function server(opts = {}) {
  calls = [];
  net = { device: true, wod: true, ...opts };
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, method, body });
    if (method === 'POST' && u.pathname === '/auth/device') {
      if (!net.device) throw new TypeError('Network request failed');
      return reply(200, { token: 't1', user: { id: 'u1', createdAt: 1 } });
    }
    if (method === 'DELETE' && u.pathname === '/me') return reply(200, { ok: true });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u1' }, pro: { active: false }, usage: { scans: 0, limit: 1 } });
    if (u.pathname === '/word-of-day' && method === 'POST') {
      if (!net.wod) throw new TypeError('Network request failed');
      const words = [];
      for (let i = 0; i < body.days; i++) {
        const w = 'w' + i;
        words.push({ date: dayKeyAt(i), slot: 0, word: w, ipa: '', translation: 'tr', example: '', example_translation: '', source: w });
      }
      return reply(200, { words, perDay: 1 });
    }
    if (u.pathname === '/me/profile') return reply(200, { ok: true });
    throw new TypeError('Network request failed');
  });
}
const count = (path, method = 'POST') => calls.filter((c) => c.path === path && c.method === method).length;

// ---- дані ----
// Кеш слова дня для пари мов (з варіантами, як їх бачить App)
function wodCache({ words, target = 'en', native = 'uk' }) {
  const pair = settingsPair({ targetLang: target, nativeLang: native, variants: {} });
  return { ...pair, sig: wodSignature(null, []), perDay: 1, asked: 1, days: 14, fetchedAt: Date.now(), words };
}
const wodWord = (date, word) => ({ date, slot: 0, word, ipa: '', translation: 'tr', example: '', example_translation: '', source: word });
const oldWord = (i, over = {}) => ({
  id: 'w' + i,
  word: 'w' + i,
  translation: 't',
  lang: 'es',
  addedAt: Date.now() - 20 * DAY,
  updatedAt: Date.now() - 20 * DAY,
  srs: { box: 0, due: 0 },
  ...over,
});

async function seed({ settings = {}, words = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem(
    'll_settings_v1',
    JSON.stringify({ nativeLang: 'uk', targetLang: 'en', streakSeen: { celebrated: TODAY, best: 0 }, ...settings })
  );
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ALL_ACH));
  if (wod) await AsyncStorage.setItem('ll_wod_v1', JSON.stringify(wod));
}

// ---- керування часом: фальшива лише дата, таймери справжні ----
const REAL_TIMERS = [
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate',
  'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'cancelIdleCallback', 'performance', 'hrtime',
];
function fakeDate() {
  jest.useFakeTimers({ doNotFake: REAL_TIMERS, now: Date.now() });
}
const jump = (ms) => jest.setSystemTime(Date.now() + ms);

// ---- рендер ----
let mounted = null;
let listenersFrom = 0;
beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  jest.clearAllMocks();
  Notifications.state.permission = { status: 'granted', canAskAgain: true };
  server({ device: true, wod: true });
});
afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount());
  mounted = null;
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle(n = 5) {
  for (let i = 0; i < n; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
}
async function renderApp() {
  listenersFrom = AppState.addEventListener.mock.calls.length;
  await act(async () => {
    mounted = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  await settle();
  return mounted;
}
async function run(fn) {
  let out;
  await act(async () => {
    out = await fn();
  });
  await settle(3);
  return out;
}
// Повернення в застосунок: усі слухачі AppState цього рендера отримують 'active'
const foreground = () =>
  run(() => {
    AppState.addEventListener.mock.calls
      .slice(listenersFrom)
      .filter(([type]) => type === 'change')
      .forEach(([, fn]) => fn('active'));
  });
const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const tab = (tree, key) => tree.root.findAll((n) => n.props.tb?.key === key)[0];
const openTab = (tree, key) => run(() => tab(tree, key).props.onPress());
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && n.props.onPress)[0] || null;

// ============================================================================

describe('word of the day after midnight (a warm app resumed on a new day)', () => {
  const cache = () =>
    wodCache({ words: [wodWord(TODAY, 'today-word'), wodWord(dayKeyAt(1), 'tomorrow-word'), wodWord(dayKeyAt(2), 'after-word')] });

  test('the card switches to the new day’s word by itself, without waiting for the network', async () => {
    await seed({ wod: cache() });
    server({ device: false });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen).props.wordOfDay.word).toBe('today-word');

    fakeDate();
    jump(DAY);
    await foreground();
    expect(one(tree, FlashcardsScreen).props.wordOfDay.word).toBe('tomorrow-word');
  });

  test('the cache and the notifications are topped up once per day, not on every resume', async () => {
    await seed({ wod: cache() });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    const planned = () => Notifications.getAllScheduledNotificationsAsync.mock.calls.length;

    // той самий день: повернення в застосунок нічого не перепланує
    await foreground();
    const base = planned();
    await foreground();
    expect(planned()).toBe(base);

    fakeDate();
    jump(DAY);
    await foreground();
    expect(planned()).toBe(base + 1);
    await foreground();
    expect(planned()).toBe(base + 1);
  });

  test('“Save” keeps the new day’s word and the saved mark follows it', async () => {
    await seed({ wod: wodCache({ words: [wodWord(TODAY, 'today-word'), wodWord(dayKeyAt(1), 'tomorrow-word')] }) });
    server({ device: false });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    fakeDate();
    jump(DAY);
    await foreground();
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    const saved = await stored('ll_words_v1');
    expect(saved.map((w) => w.word)).toEqual(['tomorrow-word']);
    expect(one(tree, FlashcardsScreen).props.wodSaved).toBe(true);
  });

  test('the due-cards badge follows the clock when the app is resumed', async () => {
    const soon = Date.now() + 30 * 60000;
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: [1, 2, 3].map((i) => oldWord(i, { srs: { box: 0, due: soon } })) });
    server({ device: false });
    const tree = await renderApp();
    expect(tab(tree, 'cards').props.badge).toBe(0);
    fakeDate();
    jump(3 * 3600000);
    await foreground();
    expect(tab(tree, 'cards').props.badge).toBe(3);
  });
});

describe('“Erase all my data” keeps the app alive', () => {
  test('word of the day is refilled, the trial reminder is not cancelled, only the streak reminder goes', async () => {
    await seed({ wod: wodCache({ words: [wodWord(TODAY, 'old-word')] }), words: [oldWord(1)], settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const trialCancels = () => Notifications.cancelScheduledNotificationAsync.mock.calls.filter(([id]) => id === 'trial-end').length;
    const trialBefore = trialCancels();
    const postsBefore = count('/word-of-day');

    await run(() => one(tree, SettingsScreen).props.onEraseEverything());

    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('streak-risk');
    expect(trialCancels()).toBe(trialBefore);
    // новий запит слів дня і нові сповіщення одразу, а не після холодного старту
    expect(count('/word-of-day')).toBe(postsBefore + 1);
    expect(calls.filter((c) => c.method === 'DELETE')).toHaveLength(1);
    const cacheNow = await stored('ll_wod_v1');
    expect(cacheNow.words.length).toBeGreaterThan(1);
    expect(cacheNow.words[0].word).not.toBe('old-word');
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalled();
    // і «Знаю» не тягнеться за новим записом
    expect((await stored('ll_settings_v1')).knownWords).toEqual([]);
  });
});

describe('“Erase all my data” without a new identity', () => {
  test('the scheduled words of the day (built for the erased profile) are still cancelled, the trial reminder stays', async () => {
    await seed({ wod: wodCache({ words: [wodWord(TODAY, 'old-word')] }), words: [oldWord(1)], settings: { nativeLang: 'uk', targetLang: 'en' } });
    Notifications.getAllScheduledNotificationsAsync.mockResolvedValue([
      { identifier: 'wod-2026-10-09', content: { data: { type: 'word-of-day' } } },
      { identifier: 'trial-end', content: { data: { type: 'trial-end' } } },
    ]);
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const trialCancels = () => Notifications.cancelScheduledNotificationAsync.mock.calls.filter(([id]) => id === 'trial-end').length;
    const trialBefore = trialCancels();
    const wodCancels = () => Notifications.cancelScheduledNotificationAsync.mock.calls.filter(([id]) => id === 'wod-2026-10-09').length;
    const wodBefore = wodCancels();
    // сервер стер запис, а нову ідентичність створити не вдалось
    net.device = false;
    await run(() => one(tree, SettingsScreen).props.onEraseEverything());
    expect(wodCancels()).toBeGreaterThan(wodBefore);
    expect(trialCancels()).toBe(trialBefore);
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
    expect(await AsyncStorage.getItem('ll_wod_v1')).toBeNull();
  });
});

describe('an offline first launch heals on return to the app', () => {
  test('identity, /me and word of the day arrive on the next foreground, throttled to once per 20 s', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' } });
    server({ device: false });
    const tree = await renderApp();
    expect(count('/auth/device')).toBe(1);
    expect(count('/word-of-day')).toBe(0);

    net.device = true;
    fakeDate();
    // надто рано: сервер не смикаємо
    jump(5000);
    await foreground();
    expect(count('/auth/device')).toBe(1);

    jump(20000);
    await foreground();
    expect(count('/auth/device')).toBe(2);
    expect(calls.filter((c) => c.path === '/me').length).toBeGreaterThan(0);
    expect(count('/word-of-day')).toBe(1);

    // id уже є: повертатись до мережевого старту більше нема навіщо
    jump(60000);
    await foreground();
    expect(count('/auth/device')).toBe(2);
    expect(count('/word-of-day')).toBe(1);
    await act(async () => tree.unmount());
    mounted = null;
  });

  test('a launch that was online does not start the network again on resume', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' } });
    await renderApp();
    const devices = count('/auth/device');
    fakeDate();
    jump(60000);
    await foreground();
    expect(count('/auth/device')).toBe(devices);
  });
});

describe('the tabs stay put while a scan is being recognised', () => {
  async function onScanner() {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' } });
    const tree = await renderApp();
    expect(one(tree, ScannerScreen)).not.toBeNull();
    return tree;
  }

  test('a tab tap during recognition warns instead of throwing the result away; it works again afterwards', async () => {
    const tree = await onScanner();
    const warn = jest.spyOn(Haptics, 'notificationAsync');
    await run(() => one(tree, ScannerScreen).props.onBusyChange(true));
    expect(tab(tree, 'cards').props.locked).toBe(true);
    expect(tab(tree, 'scan').props.locked).toBe(false);
    await openTab(tree, 'cards');
    expect(one(tree, ScannerScreen)).not.toBeNull();
    expect(one(tree, FlashcardsScreen)).toBeNull();
    expect(warn).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);

    await run(() => one(tree, ScannerScreen).props.onBusyChange(false));
    expect(tab(tree, 'cards').props.locked).toBe(false);
    await openTab(tree, 'cards');
    expect(one(tree, ScannerScreen)).toBeNull();
    expect(one(tree, FlashcardsScreen)).not.toBeNull();
  });

  test('VoiceOver hears the other tabs as unavailable only while it lasts', async () => {
    const tree = await onScanner();
    const state = (key) => tab(tree, key).findAll((n) => n.props.accessibilityRole === 'tab')[0].props.accessibilityState;
    expect(state('cards')).toEqual({ selected: false });
    await run(() => one(tree, ScannerScreen).props.onBusyChange(true));
    expect(state('cards')).toEqual({ selected: false, disabled: true });
    expect(state('scan')).toEqual({ selected: true });
  });

  test('a flag nobody cleared cannot lock the tabs for ever', async () => {
    const tree = await onScanner();
    await run(() => one(tree, ScannerScreen).props.onBusyChange(true));
    fakeDate();
    jump(31000);
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen)).not.toBeNull();
  });

  test('leaving by another route (a widget or a notification) clears the lock for the next visit', async () => {
    const tree = await onScanner();
    await run(() => one(tree, ScannerScreen).props.onBusyChange(true));
    await run(() => one(tree, ScannerScreen).props.onOpenWord('nope'));
    expect(one(tree, ScannerScreen)).toBeNull();
    await openTab(tree, 'scan');
    expect(tab(tree, 'cards').props.locked).toBe(false);
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen)).not.toBeNull();
  });
});

describe('the store review is asked at the end of the moment, not in the middle of it', () => {
  const nine = () => Array.from({ length: 9 }, (_, i) => oldWord(i));
  const savedWord = { word: 'tenth', ipa: '', translation: 't', example: '', exampleTranslation: '', lang: 'es', nativeLang: 'en' };
  const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

  test('the tenth word: not while the result sheet is open, once after it closes', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: nine() });
    const tree = await renderApp();
    const scanner = () => one(tree, ScannerScreen).props;
    await run(() => scanner().onResultVisible(true));
    await run(() => scanner().onSaveWord(savedWord));
    await wait(1100);
    expect(maybeAskForReview).not.toHaveBeenCalled();
    await run(() => scanner().onResultVisible(false));
    expect(maybeAskForReview).not.toHaveBeenCalled();
    await wait(1000);
    expect(maybeAskForReview).toHaveBeenCalledTimes(1);
    await wait(1000);
    expect(maybeAskForReview).toHaveBeenCalledTimes(1);
  });

  test('a perfect quiz asks after a pause, not in the same breath', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: nine() });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onQuizDone(true, 5));
    expect(maybeAskForReview).not.toHaveBeenCalled();
    await wait(1100);
    expect(maybeAskForReview).toHaveBeenCalledTimes(1);
  });

  test('a quiz that is not perfect never asks', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: nine() });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onQuizDone(false, 3));
    await wait(1100);
    expect(maybeAskForReview).not.toHaveBeenCalled();
  });

  test('a request that waited too long is forgotten, not shown the next morning', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: nine() });
    const tree = await renderApp();
    const scanner = () => one(tree, ScannerScreen).props;
    await run(() => scanner().onResultVisible(true));
    await run(() => scanner().onSaveWord(savedWord));
    fakeDate();
    jump(3 * 60000);
    await run(() => scanner().onResultVisible(false));
    await wait(1100);
    expect(maybeAskForReview).not.toHaveBeenCalled();
  });
});

describe('the tab bar', () => {
  const learnPressable = (tree) => tab(tree, 'cards').findAll((n) => n.props.accessibilityRole === 'tab')[0];
  const threeDue = () => [1, 2, 3].map((i) => oldWord(i));

  test('VoiceOver hears how many cards are due after the tab’s name; the name itself does not change', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: threeDue() });
    const tree = await renderApp();
    const p = learnPressable(tree).props;
    expect(p.accessibilityLabel).toBe('Learn');
    expect(p.accessibilityValue).toEqual({ text: en('dueToday', { n: 3 }) });
    expect(p.accessibilityValue.text).toBe('Due today: 3 words');
    for (const key of ['profile', 'dict', 'scan', 'settings']) {
      expect(tab(tree, key).findAll((n) => n.props.accessibilityRole === 'tab')[0].props.accessibilityValue).toBeUndefined();
    }
  });

  test('nothing due: no value is announced', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: [oldWord(1, { srs: { box: 2, due: Date.now() + 5 * DAY } })] });
    const tree = await renderApp();
    expect(learnPressable(tree).props.accessibilityValue).toBeUndefined();
  });

  const pillScale = (tree, key) => {
    const pill = tab(tree, key).findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderRadius === 999)[0];
    return StyleSheet.flatten(pill.props.style).transform[0].scale;
  };

  test('with Reduce Motion the pill and the icon do not scale; without it the pill grows from 0.85', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' }, words: threeDue() });
    let tree = await renderApp();
    expect(pillScale(tree, 'cards')).toBeCloseTo(0.85, 2);
    await act(async () => tree.unmount());
    mounted = null;

    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    tree = await renderApp();
    expect(pillScale(tree, 'cards')).toBe(1);
    const iconWrap = tab(tree, 'cards').findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.paddingHorizontal === 14)[0];
    expect(StyleSheet.flatten(iconWrap.props.style).transform[0].scale).toBe(1);
  });

  test('the badge number is readable on the red in both light and dark themes', async () => {
    const ink = (tree) => {
      const text = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 3 && StyleSheet.flatten(n.props.style)?.fontSize === 10)[0];
      return StyleSheet.flatten(text.props.style).color;
    };
    await seed({ settings: { nativeLang: 'en', targetLang: 'es', theme: 'light' }, words: threeDue() });
    let tree = await renderApp();
    expect(ink(tree)).toBe('#fff');
    await act(async () => tree.unmount());
    mounted = null;

    await seed({ settings: { nativeLang: 'en', targetLang: 'es', theme: 'dark' }, words: threeDue() });
    tree = await renderApp();
    const dark = THEMES[resolveTheme({ mode: 'dark', palette: 'chalk', scheme: 'light', pro: false })];
    expect(ink(tree)).toBe(dark.C.bg);
  });

  test('tab content only fades: the screen no longer slides on top of its own entrance', async () => {
    await seed({ settings: { nativeLang: 'en', targetLang: 'es' } });
    const tree = await renderApp();
    for (const key of ['dict', 'cards', 'profile', 'settings']) {
      await openTab(tree, key);
      const wrappers = tree.root.findAll((n) => n.type === FadeIn && n.props.style?.flex === 1);
      expect(wrappers).toHaveLength(1);
      expect(wrappers[0].props.dy).toBe(0);
    }
  });
});

describe('restoring Pro from the “words per day” paywall', () => {
  test('the 3 words the person asked for survive the restore (the paywall is closed from inside first)', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => byId(tree, 'wod-per-day-3').props.onPress());
    const paywall = one(tree, PaywallScreen).props;
    expect(paywall.reason).toBe('wod_per_day');
    // Pro, який людина вже має на цьому Apple ID
    await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * DAY }));
    // так само, як PaywallScreen.restore: відновили, і якщо Pro є, onClose
    await act(async () => {
      const next = await paywall.onRestore();
      if (next?.pro && !next.error) paywall.onClose();
    });
    await settle(5);
    expect(one(tree, PaywallScreen)).toBeNull();
    expect((await stored('ll_settings_v1')).wodPerDay).toBe(3);
  });

  test('closing the same paywall without Pro forgets the choice, as before', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => byId(tree, 'wod-per-day-3').props.onPress());
    await run(() => one(tree, PaywallScreen).props.onClose());
    expect(one(tree, PaywallScreen)).toBeNull();
    // Pro з'являється пізніше з іншого місця: вибір уже не вмикається сам
    await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * DAY }));
    await run(() => one(tree, SettingsScreen).props.onRestore());
    await settle(5);
    expect((await stored('ll_settings_v1')).wodPerDay).toBeUndefined();
  });
});

describe('“already saved” follows the language', () => {
  const cognate = (lang) => [oldWord(1, { id: 'taxi', word: 'taxi', lang })];
  const cache = () =>
    wodCache({ target: 'es', native: 'uk', words: [wodWord(TODAY, 'taxi')] });

  test('English “taxi” in the dictionary does not make the Spanish word of the day “saved”', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'es' }, words: cognate('en'), wod: cache() });
    server({ device: false });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    const card = one(tree, FlashcardsScreen).props;
    expect(card.wordOfDay.word).toBe('taxi');
    expect(card.wodSaved).toBe(false);
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    const words = await stored('ll_words_v1');
    expect(words.map((w) => [w.word, w.lang]).sort()).toEqual([['taxi', 'en'], ['taxi', 'es']]);
    expect(one(tree, FlashcardsScreen).props.wodSaved).toBe(true);
  });

  test('the same word in the same language is saved', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'es' }, words: cognate('es'), wod: cache() });
    server({ device: false });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen).props.wodSaved).toBe(true);
  });
});

describe('settings written in the same tick do not overwrite each other', () => {
  test('a theme and a notification hour changed together are both kept', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const p = one(tree, SettingsScreen).props;
    await run(() => {
      p.onSetTheme('dark');
      p.onSetWodHour(15);
    });
    expect(await stored('ll_settings_v1')).toMatchObject({ theme: 'dark', wodHour: 15 });
  });
});

describe('the notification switch after iOS has said no', () => {
  test('the person is told why and shown the way to Settings; the switch stays off', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en', wodEnabled: false } });
    Notifications.state.permission = { status: 'denied', canAskAgain: false };
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onToggleWod(true));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert.mock.calls[0][0]).toBe(en('notifOffTitle'));
    expect(alert.mock.calls[0][2].map((b) => b.text)).toEqual([en('cancel'), en('openSettings')]);
    expect((await stored('ll_settings_v1')).wodEnabled).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('allowed in iOS Settings in the meantime: the switch turns on, no alert', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en', wodEnabled: false } });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onToggleWod(true));
    expect(alert).not.toHaveBeenCalled();
    expect((await stored('ll_settings_v1')).wodEnabled).toBe(true);
  });
});

describe('layers over the tabs rise in, and close at once', () => {
  const layer = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityViewIsModal)[0];

  test('the paywall layer carries its own background and animation; the escape gesture still closes it', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen)).not.toBeNull();
    const style = StyleSheet.flatten(layer(tree).props.style);
    expect(style.backgroundColor).toBeTruthy();
    expect(typeof style.opacity).toBe('number');
    expect(style.opacity).toBeGreaterThanOrEqual(0);
    expect(style.opacity).toBeLessThanOrEqual(1);
    // закриття не чекає на анімацію: шару одразу немає
    await act(async () => layer(tree).props.onAccessibilityEscape());
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(layer(tree)).toBeUndefined();
  });

  test('the profile editor layer is the same', async () => {
    await seed({ settings: { nativeLang: 'uk', targetLang: 'en' } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEditProfile());
    expect(one(tree, ProfileEditor)).not.toBeNull();
    expect(typeof StyleSheet.flatten(layer(tree).props.style).opacity).toBe('number');
    await act(async () => layer(tree).props.onAccessibilityEscape());
    expect(one(tree, ProfileEditor)).toBeNull();
  });
});

describe('the native splash', () => {
  test('goes away once the app is ready', async () => {
    await seed();
    await renderApp();
    expect(SplashScreen.hideAsync).toHaveBeenCalled();
  });

  test('is lifted after 8 s even if reading the data hangs, so the loader is seen', async () => {
    await seed();
    const impl = AsyncStorage.getItem.getMockImplementation();
    AsyncStorage.getItem.mockImplementation((key, cb) => (key === 'll_words_v1' ? new Promise(() => {}) : impl(key, cb)));
    jest.useFakeTimers();
    await act(async () => {
      mounted = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await act(async () => {
      jest.advanceTimersByTime(7900);
    });
    expect(SplashScreen.hideAsync).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(200);
    });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    AsyncStorage.getItem.mockImplementation(impl);
  });
});
