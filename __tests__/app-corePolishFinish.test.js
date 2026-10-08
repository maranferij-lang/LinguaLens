// Доробка ядра застосунку: уся тека наліпок однією дією при стиранні й виході,
// підтвердження покупки Pro (ProToast) і його місце в черзі оверлеїв.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import DictionaryScreen from '../src/DictionaryScreen';
import LangSheet from '../src/LangSheet';
import PaywallScreen from '../src/PaywallScreen';
import ProToast from '../src/ProToast';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { deleteAllPhotos } from '../src/photos';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

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
// Файлова система в памʼяті: що стерли і чим (файл чи тека), з прапорцем існування
jest.mock('expo-file-system', () => {
  const log = [];
  const state = { dirExists: true, dirThrows: false };
  const uriOf = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return true;
    }
    copySync() {}
    delete() {
      log.push('file ' + this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return state.dirExists;
    }
    create() {}
    delete() {
      if (state.dirThrows) throw new Error('boom');
      log.push('dir ' + this.uri);
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __log: log, __state: state };
});

const Notifications = require('expo-notifications');
const fsMock = require('expo-file-system');

const en = makeT('en');
const TODAY = localDayKey();
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

// ---- сервер ----
const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
function server() {
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't1', user: { id: 'u1', createdAt: 1 } });
    if (method === 'DELETE' && u.pathname === '/me') return reply(200, { ok: true });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u1' }, pro: { active: false }, usage: { scans: 0, limit: 1 } });
    if (u.pathname === '/me/profile') return reply(200, { ok: true });
    throw new TypeError('Network request failed');
  });
}

// ---- дані ----
const word = (i, over = {}) => ({
  id: 'w' + i,
  word: 'w' + i,
  translation: 't',
  lang: 'en',
  nativeLang: 'uk',
  addedAt: Date.now() - 1000,
  updatedAt: Date.now() - 1000,
  srs: { box: 0, due: 0 },
  ...over,
});
async function seed({ words = [], seen = ALL_ACH, settings = {} } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem(
    'll_settings_v1',
    JSON.stringify({ nativeLang: 'uk', targetLang: 'en', wodEnabled: false, streakSeen: { celebrated: TODAY, best: 0 }, ...settings })
  );
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(seen));
}

// ---- рендер ----
let mounted = null;
beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  jest.clearAllMocks();
  Notifications.state.permission = { status: 'granted', canAskAgain: true };
  fsMock.__log.length = 0;
  fsMock.__state.dirExists = true;
  fsMock.__state.dirThrows = false;
  server();
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
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const tab = (tree, key) => tree.root.findAll((n) => n.props.tb?.key === key)[0];
const openTab = (tree, key) => run(() => tab(tree, key).props.onPress());
// Лише наліпки слів: теку сцен стирає clearPersonalData (account.js), мініатюри
// віджетів — resetWidgets; це інші теки
const stickerOps = () => fsMock.__log.filter((x) => x.includes('/doc/stickers'));
const proToast = (tree) => one(tree, ProToast).props.toast;
const toastCard = (tree) => tree.root.findAll((n) => n.props.testID === 'pro-toast' && n.props.onPress)[0] || null;
const openPaywall = (tree) => run(() => one(tree, SettingsScreen).props.onOpenPaywall());

// ============================================================================
describe('deleteAllPhotos', () => {
  test('one call removes the whole stickers folder, not file after file', () => {
    deleteAllPhotos();
    expect(fsMock.__log).toEqual(['dir file:///doc/stickers']);
  });

  test('no folder yet: nothing to do', () => {
    fsMock.__state.dirExists = false;
    deleteAllPhotos();
    expect(fsMock.__log).toEqual([]);
  });

  test('a failing delete is swallowed: the app goes on', () => {
    fsMock.__state.dirThrows = true;
    expect(() => deleteAllPhotos()).not.toThrow();
  });
});

describe('stickers on erase, sign-out and clear', () => {
  const photos = () => [word(1, { photo: 'stickers/a.jpg' }), word(2, { photo: 'stickers/b.jpg' }), word(3)];

  test('“Erase all my data”: one folder delete instead of two native calls per word', async () => {
    await seed({ words: photos() });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEraseEverything());
    expect(stickerOps()).toEqual(['dir file:///doc/stickers']);
    expect(one(tree, SettingsScreen).props.wordsCount).toBe(0);
    expect(await AsyncStorage.getItem('ll_words_v1')).toBeNull();
  });

  test('sign-out: the same', async () => {
    await seed({ words: photos() });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onSignOut({ force: true }));
    expect(stickerOps()).toEqual(['dir file:///doc/stickers']);
    expect(one(tree, SettingsScreen).props.wordsCount).toBe(0);
  });

  test('“Delete all words” keeps the file-by-file way: the folder may hold other stickers than the words it lists', async () => {
    await seed({ words: photos() });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onClearAll());
    expect(stickerOps()).toEqual(['file file:///doc/stickers/a.jpg', 'file file:///doc/stickers/b.jpg']);
  });
});

describe('the Pro confirmation after a purchase', () => {
  beforeEach(() => {
    jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  });

  async function appWithPaywall() {
    await seed();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    expect(proToast(tree)).toBeNull();
    await openPaywall(tree);
    expect(one(tree, PaywallScreen)).not.toBeNull();
    return tree;
  }
  const buy = (tree, plan) => run(() => one(tree, PaywallScreen).props.onPurchase(plan));

  test('a paid plan: the paywall closes and the person is told, once, that Pro is on', async () => {
    const tree = await appWithPaywall();
    await buy(tree, 'lifetime');
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(proToast(tree)).toEqual({ trial: false, reminded: false });
    const card = toastCard(tree);
    expect(card.props.accessibilityLabel).toBe(`${en('proToastTitle')}. ${en('proToastText')}`);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(`${en('proToastTitle')}. ${en('proToastText')}`);
  });

  test('a trial with notifications allowed: the toast promises the reminder, and the reminder exists', async () => {
    const tree = await appWithPaywall();
    await buy(tree, 'year');
    expect(proToast(tree)).toEqual({ trial: true, reminded: true });
    expect(toastCard(tree).props.accessibilityLabel).toBe(`${en('proToastTitle')}. ${en('proToastTrialRemind')}`);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith(expect.objectContaining({ identifier: 'trial-end' }));
  });

  test('a trial with notifications refused: no promise of a reminder that will not come', async () => {
    Notifications.state.permission = { status: 'denied', canAskAgain: false };
    const tree = await appWithPaywall();
    await buy(tree, 'year');
    expect(proToast(tree)).toEqual({ trial: true, reminded: false });
    expect(toastCard(tree).props.accessibilityLabel).toBe(`${en('proToastTitle')}. ${en('proToastTrial')}`);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalledWith(expect.objectContaining({ identifier: 'trial-end' }));
  });

  test('a tap closes it and it does not come back', async () => {
    const tree = await appWithPaywall();
    await buy(tree, 'lifetime');
    await run(() => toastCard(tree).props.onPress());
    await settle(8); // 170 мс виходу
    expect(proToast(tree)).toBeNull();
    expect(toastCard(tree)).toBeNull();
  });

  test('restoring Pro from Settings and a launch with Pro already on show no toast', async () => {
    await seed();
    await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * 86400000 }));
    const tree = await renderApp();
    expect(proToast(tree)).toBeNull();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onRestore());
    expect(proToast(tree)).toBeNull();
  });

  test('it waits while something else covers the screen, and appears when that is gone', async () => {
    await seed();
    const tree = await renderApp();
    // сканер: чип мови відкриває аркуш, поверх нього — пейвол «Pro»
    await run(() => one(tree, ScannerScreen).props.onChangeLang());
    await run(() => one(tree, ScannerScreen).props.onOpenPro());
    await buy(tree, 'lifetime');
    // купівля є, але показувати нічого: аркуш мови ще відкритий
    expect(one(tree, ProToast).props.toast).toBeNull();
    expect(toastCard(tree)).toBeNull();
    await run(() => one(tree, LangSheet).props.onClose());
    expect(one(tree, ProToast).props.toast).toEqual({ trial: false, reminded: false });
    expect(toastCard(tree)).not.toBeNull();
  });

  test('it is shown before a waiting achievement; the achievement comes right after', async () => {
    await seed({ seen: [] });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await openPaywall(tree);
    // поки пейвол відкритий, у словнику з'являється перше слово: тост досягнення чекає
    await openTab(tree, 'dict');
    await run(() =>
      one(tree, DictionaryScreen).props.onSaveWords([{ word: 'cup', translation: 'чашка', lang: 'en', nativeLang: 'uk' }])
    );
    expect(one(tree, AchievementToast).props.achievement).toBeNull();
    await buy(tree, 'lifetime');
    // купівля першою, досягнення чекає
    expect(one(tree, ProToast).props.toast).toEqual({ trial: false, reminded: false });
    expect(one(tree, AchievementToast).props.achievement).toBeNull();
    // закрили підтвердження — на його місці досягнення
    await run(() => toastCard(tree).props.onPress());
    await settle(8);
    expect(one(tree, ProToast).props.toast).toBeNull();
    expect(one(tree, AchievementToast).props.achievement).not.toBeNull();
  });
});

describe('the Pro confirmation is forgotten if it never gets its turn', () => {
  test('after 20 s of waiting it is dropped, not shown late', async () => {
    await seed();
    const tree = await renderApp();
    await run(() => one(tree, ScannerScreen).props.onChangeLang());
    await run(() => one(tree, ScannerScreen).props.onOpenPro());
    // таймери — лише з цього місця: те, що стоїть у черзі, уже справжнє
    jest.useFakeTimers({
      doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'performance', 'hrtime', 'Date'],
    });
    await act(async () => {
      await one(tree, PaywallScreen).props.onPurchase('lifetime');
    });
    expect(one(tree, ProToast).props.toast).toBeNull(); // чекає
    await act(async () => jest.advanceTimersByTime(19000));
    expect(one(tree, ProToast).props.toast).toBeNull();
    await act(async () => jest.advanceTimersByTime(2000));
    jest.useRealTimers();
    // аркуш мови закрито вже після строку: підтвердження забуте, не показується
    await run(() => one(tree, LangSheet).props.onClose());
    expect(one(tree, ProToast).props.toast).toBeNull();
    expect(toastCard(tree)).toBeNull();
  });
});
