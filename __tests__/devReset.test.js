// «Почати з нуля» в розробці (onboarding.md §10.3): стирає все на телефоні —
// AsyncStorage, Keychain (токен і carry), фото наліпок, сцени, заплановані
// сповіщення, віджети, id PostHog — і перезапускає JS: наступний старт — як
// після встановлення. «Онбординг як новий» — перший запуск поверх даних, з
// кроками сповіщень і віджетів; «Онбординг на кожному старті» — нічого не
// стираючи. Реліз — devRelease.test.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DevSettings } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PostHog from 'posthog-react-native';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import App from '../App';
import SettingsScreen from '../src/SettingsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import { resetWidgets } from '../src/widgets';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), POSTHOG_KEY: 'phc_test' }));
// Віджети W2 уміють скидатися (resetWidgets); до злиття W2 його в
// src/widgets ще немає — App кличе його, лише якщо він є.
jest.mock('../src/widgets', () => ({ ...jest.requireActual('../src/widgets'), resetWidgets: jest.fn(async () => {}) }));
jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    AFTER_FIRST_UNLOCK: 'afu',
    getItemAsync: jest.fn(async (k) => store.get(k) ?? null),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
    __store: store,
  };
});
// Файлова система в памʼяті: що стерли
jest.mock('expo-file-system', () => {
  const deleted = [];
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
      deleted.push(this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return true;
    }
    create() {}
    delete() {
      deleted.push(this.uri + '/');
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __deleted: deleted };
});
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
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
}));

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const WORDS = [{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', nativeLang: 'en', photo: 'stickers/a.jpg', added: Date.now() }];
const deleted = require('expo-file-system').__deleted;

let reload;
beforeEach(async () => {
  await AsyncStorage.clear();
  jest.clearAllMocks();
  deleted.length = 0;
  SecureStore.__store.clear();
  reload = jest.spyOn(DevSettings, 'reload').mockImplementation(() => {});
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});
afterEach(() => reload.mockRestore());

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
});

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
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
  mounted.push(tree);
  await settle();
  return tree;
}
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
async function toSettings(tree) {
  await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
  await settle();
  return one(tree, SettingsScreen);
}
async function seed() {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(WORDS));
  await AsyncStorage.setItem('ll_scenes_v1', JSON.stringify([{ id: 's1', image: 'scenes/s1.jpg', words: [] }]));
  await SecureStore.setItemAsync('ll_token', 'tok');
  await SecureStore.setItemAsync('ll_carry', 'old');
}

test('“Start from scratch” wipes the phone, the Keychain, photos, scenes, notifications, widgets and PostHog, then reloads', async () => {
  await seed();
  const tree = await renderApp();
  const settings = await toSettings(tree);
  expect(typeof settings.props.onDevReset).toBe('function');
  await act(async () => settings.props.onDevReset());

  expect(Notifications.cancelAllScheduledNotificationsAsync).toHaveBeenCalled();
  expect(resetWidgets).toHaveBeenCalledTimes(1);
  // фото слова і вся тека наліпок
  expect(deleted).toEqual(expect.arrayContaining(['file:///doc/stickers/a.jpg', 'file:///doc/stickers/']));
  // Keychain: токен і carry — геть
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ll_token', expect.anything());
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('ll_carry', expect.anything());
  expect(SecureStore.__store.size).toBe(0);
  // новий анонімний id статистики
  expect(PostHog.instances.at(-1).reset).toHaveBeenCalled();
  // AsyncStorage порожній: ні позначки онбордингу, ні слів, ні сцен
  expect(await AsyncStorage.getAllKeys()).toEqual([]);
  expect(reload).toHaveBeenCalledTimes(1);
});

test('“Onboarding as new”: the first run on top of the data, with the push and widgets steps; nothing erased', async () => {
  await seed();
  const tree = await renderApp();
  const settings = await toSettings(tree);
  await act(async () => settings.props.extra.devOnboarding());
  await settle();
  const onb = one(tree, OnboardingScreen);
  expect(onb.props).toMatchObject({ replay: false, draft: null, dev: { forcePush: true, forceWidgets: true }, hasWords: true, canWow: false });
  expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toHaveLength(1);
  expect(reload).not.toHaveBeenCalled();
  // фінал — звичайний застосунок, і наступний повтор уже без примусу
  await act(async () => one(tree, OnboardingScreen).props.onDone({ profile: null, heardFrom: null, scanned: false, flow: 'control' }));
  await settle();
  expect(one(tree, OnboardingScreen)).toBeNull();
});

test('“Onboarding on every launch”: remembered, shown on the next start without erasing, off again on request', async () => {
  await seed();
  let tree = await renderApp();
  let settings = await toSettings(tree);
  expect(settings.props.extra.devOnbAlways).toBe(false);
  await act(async () => settings.props.extra.onDevOnbAlways(true));
  await settle();
  expect(await AsyncStorage.getItem('ll_dev_onb_always')).toBe('1');
  expect(one(tree, SettingsScreen).props.extra.devOnbAlways).toBe(true);

  // перезапуск: онбординг, хоча його вже пройдено; дані на місці
  await act(async () => mounted.pop().unmount());
  tree = await renderApp();
  const onb = one(tree, OnboardingScreen);
  expect(onb).not.toBeNull();
  expect(onb.props.dev).toEqual({ forcePush: true, forceWidgets: true });
  expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toHaveLength(1);
  expect(await AsyncStorage.getItem('ll_onboarded_v1')).toBe('1');
  await act(async () => onb.props.onDone({ profile: null, heardFrom: null, scanned: false, flow: 'control' }));
  await settle();

  settings = await toSettings(tree);
  await act(async () => settings.props.extra.onDevOnbAlways(false));
  await settle();
  expect(await AsyncStorage.getItem('ll_dev_onb_always')).toBeNull();
  await act(async () => mounted.pop().unmount());
  tree = await renderApp();
  expect(one(tree, OnboardingScreen)).toBeNull();
});
