// Полірування ядра застосунку, шар даних: сховище не довіряє прочитаному,
// ідентичність створюється один раз і не переписує акаунт, секрет не губиться
// між Keychain і запасною копією, мережа тримає таймер до кінця тіла,
// статистика не губить події до рішення людини, межа помилок ховає заставку,
// а перемикачі сповіщень пояснюють відмову iOS.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert, Linking } from 'react-native';
import { act, create } from 'react-test-renderer';

jest.mock('expo-secure-store', () => {
  const keychain = new Map();
  const state = { failWrites: false };
  return {
    AFTER_FIRST_UNLOCK: 0,
    keychain,
    state,
    getItemAsync: async (k) => keychain.get(k) ?? null,
    setItemAsync: async (k, v) => {
      if (state.failWrites) throw new Error('keychain locked');
      keychain.set(k, v);
    },
    deleteItemAsync: async (k) => void keychain.delete(k),
  };
});

jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => {}),
  hideAsync: jest.fn(async () => {}),
  setOptions: jest.fn(),
}));

// Сповіщення: стан дозволу задає тест
jest.mock('expo-notifications', () => {
  const state = { permission: { status: 'undetermined', canAskAgain: true }, onRequest: { status: 'granted' } };
  return {
    state,
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => state.permission),
    requestPermissionsAsync: jest.fn(async () => state.onRequest),
    getAllScheduledNotificationsAsync: jest.fn(async () => []),
    cancelScheduledNotificationAsync: jest.fn(async () => {}),
    scheduleNotificationAsync: jest.fn(async () => 'id'),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
    getLastNotificationResponse: jest.fn(() => null),
    clearLastNotificationResponse: jest.fn(),
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { DEFAULT: 3 },
    DEFAULT_ACTION_IDENTIFIER: 'default',
  };
});

const { keychain, state: keychainState } = require('expo-secure-store');
const SplashScreen = require('expo-splash-screen');
const Notifications = require('expo-notifications');

const auth = require('../src/auth');
const storage = require('../src/storage');
const { makeT } = require('../src/i18n');

const USER_KEY = 'll_device_v1';

beforeEach(async () => {
  keychain.clear();
  keychainState.failWrites = false;
  await AsyncStorage.clear();
  jest.clearAllMocks();
  Notifications.state.permission = { status: 'undetermined', canAskAgain: true };
  Notifications.state.onRequest = { status: 'granted' };
});
afterEach(() => {
  delete global.fetch;
  jest.restoreAllMocks();
  jest.useRealTimers();
});

// ---------------------------------------------------------------- storage

describe('storage does not trust what it reads', () => {
  const put = (key, value) => AsyncStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));

  test('words: null, an object or junk entries cannot reach the render', async () => {
    await put('ll_words_v1', 'null');
    expect(await storage.loadWords()).toEqual([]);
    await put('ll_words_v1', { a: 1 });
    expect(await storage.loadWords()).toEqual([]);
    await put('ll_words_v1', [null, { id: 'a', word: 'x' }, 5, 'str', [], { word: 'no id' }, { id: 'b' }]);
    expect(await storage.loadWords()).toEqual([{ id: 'a', word: 'x' }, { id: 'b' }]);
    await put('ll_words_v1', '{not json');
    expect(await storage.loadWords()).toEqual([]);
  });

  test('activity and stats: only plain objects', async () => {
    for (const bad of ['null', '[1,2]', '"x"', '7']) {
      await put('ll_activity_v1', bad);
      await put('ll_stats_v1', bad);
      expect(await storage.loadActivity()).toEqual({});
      expect(await storage.loadStats()).toEqual({});
    }
    await put('ll_activity_v1', { '2026-10-08': 3 });
    expect(await storage.loadActivity()).toEqual({ '2026-10-08': 3 });
  });

  test('seen achievements: an array of ids', async () => {
    await put('ll_seen_ach_v1', { a: 1 });
    expect(await storage.loadSeenAchievements()).toEqual([]);
    await put('ll_seen_ach_v1', ['a', 3, null, 'b']);
    expect(await storage.loadSeenAchievements()).toEqual(['a', 'b']);
  });

  test('word-of-day cache: an object or nothing', async () => {
    await put('ll_wod_v1', '[]');
    expect(await storage.loadWod()).toBeNull();
    await put('ll_wod_v1', 'null');
    expect(await storage.loadWod()).toBeNull();
    await put('ll_wod_v1', { words: [] });
    expect(await storage.loadWod()).toEqual({ words: [] });
  });

  test('a read that FAILED must not let the next save overwrite the dictionary', async () => {
    await put('ll_words_v1', [{ id: 'real' }]);
    const setItem = jest.spyOn(AsyncStorage, 'setItem');
    setItem.mockClear();
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    expect(await storage.loadWords()).toEqual([]);
    await storage.persistWords([{ id: 'one-new' }]);
    expect(setItem).not.toHaveBeenCalled();
    expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toEqual([{ id: 'real' }]);
    // наступний нормальний запуск знімає заборону
    expect(await storage.loadWords()).toEqual([{ id: 'real' }]);
    await storage.persistWords([{ id: 'real' }, { id: 'two' }]);
    expect(setItem).toHaveBeenCalledTimes(1);
  });

  test('an unreadable JSON is a different story: nothing to protect, saving works', async () => {
    await put('ll_words_v1', '{not json');
    expect(await storage.loadWords()).toEqual([]);
    await storage.persistWords([{ id: 'a' }]);
    expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toEqual([{ id: 'a' }]);
  });

  test('erasing and signing out lift the guard: the storage is empty on purpose', async () => {
    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await storage.loadWords();
    await storage.clearLocalData();
    await storage.persistWords([{ id: 'fresh' }]);
    expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toEqual([{ id: 'fresh' }]);

    jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('disk'));
    await storage.loadWords();
    await storage.clearProgress();
    await storage.persistWords([{ id: 'guest' }]);
    expect(JSON.parse(await AsyncStorage.getItem('ll_words_v1'))).toEqual([{ id: 'guest' }]);
  });
});

// ------------------------------------------------------------------- auth

function server(routes) {
  global.fetch = jest.fn(async (url, { method }) => {
    const r = routes[method + ' ' + new URL(url).pathname];
    if (!r || r === 'offline') throw new TypeError('Network request failed');
    const [status, body] = r;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}
const devicePosts = () => global.fetch.mock.calls.filter(([url]) => new URL(url).pathname === '/auth/device').length;
const NEW_DEVICE = [200, { token: 'new', user: { id: 'u2', createdAt: 1 } }];

describe('identity is created once at a time', () => {
  test('two renewals in parallel make one POST /auth/device and share the result', async () => {
    server({ 'POST /auth/device': NEW_DEVICE });
    const [a, b] = await Promise.all([auth.renewSession(), auth.renewSession()]);
    expect(a).toEqual({ token: 'new', userId: 'u2' });
    expect(b).toBe(a);
    expect(devicePosts()).toBe(1);
    // після завершення наступний виклик знову йде на сервер
    await auth.renewSession();
    expect(devicePosts()).toBe(2);
  });

  test('a failed creation does not poison the next attempt', async () => {
    server({ 'POST /auth/device': 'offline' });
    expect(await auth.renewSession()).toBeNull();
    server({ 'POST /auth/device': NEW_DEVICE });
    expect(await auth.renewSession()).toEqual({ token: 'new', userId: 'u2' });
  });

  test('a slow anonymous creation cannot overwrite the Apple account that signed in meanwhile', async () => {
    let release;
    global.fetch = jest.fn(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ ok: true, status: 200, json: async () => ({ token: 'anon', user: { id: 'anon-id' } }) });
        })
    );
    const pending = auth.renewSession();
    await new Promise((r) => setTimeout(r, 10));
    await auth.adoptSession('acct-token', 'acct');
    release();
    expect(await pending).toBeNull();
    expect(keychain.get('ll_token')).toBe('acct-token');
    expect(await AsyncStorage.getItem(USER_KEY)).toBe('acct');
  });

  test('erasing while an anonymous creation is in flight wins: its record is dropped, the carry one is kept', async () => {
    keychain.set('ll_token', 'old');
    await AsyncStorage.setItem(USER_KEY, 'u1');
    const releases = [];
    global.fetch = jest.fn((url, init) => {
      const body = JSON.parse(init.body || '{}');
      return new Promise((resolve) => {
        releases.push(() =>
          resolve({
            ok: true,
            status: 200,
            json: async () => (body.previous ? { token: 'carried', user: { id: 'u3' } } : { token: 'stale', user: { id: 'u2' } }),
          })
        );
      });
    });
    const slow = auth.renewSession();
    await new Promise((r) => setTimeout(r, 10));
    const over = auth.startOver({ carry: 'carry-1' });
    await new Promise((r) => setTimeout(r, 10));
    releases.forEach((fn) => fn());
    expect(await slow).toBeNull();
    expect(await over).toEqual({ token: 'carried', userId: 'u3' });
    expect(keychain.get('ll_token')).toBe('carried');
  });
});

describe('the secret survives a Keychain that refuses to write', () => {
  test('the fallback copy is read when the Keychain is empty: no new identity on every launch', async () => {
    keychainState.failWrites = true;
    server({ 'POST /auth/device': NEW_DEVICE, 'GET /me': [200, { user: { id: 'u2' } }] });
    expect(await auth.ensureSession()).toEqual({ token: 'new', userId: 'u2' });
    expect(keychain.has('ll_token')).toBe(false);
    expect(await AsyncStorage.getItem('sec_ll_token')).toBe('new');
    // наступний запуск: Keychain порожній, копія на місці, нового пристрою нема
    expect(await auth.ensureSession()).toEqual({ token: 'new', userId: 'u2' });
    expect(devicePosts()).toBe(1);
  });

  test('once the Keychain accepts a write the stale fallback copy is removed', async () => {
    await AsyncStorage.setItem('sec_ll_token', 'stale');
    server({ 'POST /auth/device': NEW_DEVICE });
    await auth.renewSession();
    expect(keychain.get('ll_token')).toBe('new');
    expect(await AsyncStorage.getItem('sec_ll_token')).toBeNull();
  });

  test('a Keychain value wins over the fallback; starting over clears both', async () => {
    keychain.set('ll_token', 'kc');
    await AsyncStorage.setItem('sec_ll_token', 'fallback');
    await AsyncStorage.setItem(USER_KEY, 'u1');
    server({ 'GET /me': [200, { user: { id: 'u1' } }] });
    expect(await auth.ensureSession()).toEqual({ token: 'kc', userId: 'u1' });
    server({ 'POST /auth/device': 'offline' });
    await auth.startOver();
    expect(keychain.has('ll_token')).toBe(false);
    expect(await AsyncStorage.getItem('sec_ll_token')).toBeNull();
  });
});

// -------------------------------------------------------------------- api

describe('api keeps its timer until the body is read', () => {
  test('a server that sends headers and stalls the body ends as TIMEOUT, not a hang', async () => {
    jest.useFakeTimers();
    const { apiMe } = require('../src/api');
    global.fetch = jest.fn(async (url, init) => ({
      ok: true,
      status: 200,
      json: () =>
        new Promise((_, reject) => {
          init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
        }),
    }));
    const done = apiMe().then(
      () => 'resolved',
      (e) => e.code
    );
    await Promise.resolve();
    await Promise.resolve();
    jest.advanceTimersByTime(20000);
    expect(await done).toBe('TIMEOUT');
    expect(jest.getTimerCount()).toBe(0);
  });

  test('a body that arrives in time is returned and the timer is gone', async () => {
    jest.useFakeTimers();
    const { apiMe } = require('../src/api');
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ user: { id: 'u1' } }) }));
    await expect(apiMe()).resolves.toEqual({ user: { id: 'u1' } });
    expect(jest.getTimerCount()).toBe(0);
  });

  test('an error status keeps its body and code', async () => {
    const { apiMe } = require('../src/api');
    global.fetch = jest.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) }));
    await expect(apiMe()).rejects.toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
  });
});

// -------------------------------------------------------------- analytics

function loadAnalytics({ key = 'phc_test' } = {}) {
  let mod;
  let PostHog;
  jest.isolateModules(() => {
    jest.doMock('../src/config', () => ({ POSTHOG_KEY: key, POSTHOG_HOST: 'https://eu.i.posthog.com' }));
    PostHog = require('posthog-react-native').default;
    mod = require('../src/analytics');
  });
  // Заглушка PostHog могла вже лежати в основному реєстрі (його завантажив
  // інший імпорт), тоді масив instances спільний: рахуємо від поточної довжини
  const before = PostHog.instances.length;
  return {
    ...mod,
    PostHog,
    created: () => PostHog.instances.length - before,
    client: () => PostHog.instances[PostHog.instances.length - 1],
  };
}

describe('analytics keeps early events until the person’s choice is known', () => {
  test('events from a cold-start tap are sent once statistics start, in order, cleaned', () => {
    const a = loadAnalytics();
    a.track('widget_open', { kind: 'wod', route: 'word-of-day', bad: { x: 1 } });
    a.track('streak_reminder', { action: 'opened' });
    expect(a.created()).toBe(0);
    a.initAnalytics({ enabled: true });
    expect(a.client().capture.mock.calls).toEqual([
      ['widget_open', { kind: 'wod', route: 'word-of-day' }],
      ['streak_reminder', { action: 'opened' }],
    ]);
    // буфер отдан: повторный старт ничего не шлёт ещё раз
    a.initAnalytics({ enabled: true });
    expect(a.client().capture).toHaveBeenCalledTimes(2);
  });

  test('switched off: nothing is sent, the buffer is dropped and does not come back', () => {
    const a = loadAnalytics();
    a.track('widget_open', { route: 'streak' });
    a.initAnalytics({ enabled: false });
    expect(a.created()).toBe(0);
    a.setAnalyticsEnabled(true);
    expect(a.created()).toBe(1);
    expect(a.client().capture).not.toHaveBeenCalled();
  });

  test('without a key or after the decision, tracking does not buffer', () => {
    const none = loadAnalytics({ key: '' });
    none.track('scan', { ok: true });
    none.initAnalytics();
    expect(none.created()).toBe(0);

    const a = loadAnalytics();
    a.initAnalytics({ enabled: false });
    a.track('scan', { ok: true });
    a.setAnalyticsEnabled(true);
    expect(a.client().capture).not.toHaveBeenCalled();
  });

  test('the buffer is capped', () => {
    const a = loadAnalytics();
    for (let i = 0; i < 50; i++) a.track('tick', { i });
    a.initAnalytics();
    expect(a.client().capture).toHaveBeenCalledTimes(20);
  });
});

// ----------------------------------------------------------- ErrorBoundary

describe('a crash is visible and counted', () => {
  function Boom() {
    throw new TypeError('render exploded');
  }

  test('the native splash is hidden, so the retry screen can be seen, and the crash is tracked by name only', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const analytics = require('../src/analytics');
    const track = jest.spyOn(analytics, 'track');
    const ErrorBoundary = require('../src/ErrorBoundary').default;
    let tree;
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    });
    expect(SplashScreen.hideAsync).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('app_crash', { name: 'TypeError' });
    // и экран «Спробувати знову» на месте
    const t = makeT('en');
    const texts = tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining([t('crashTitle'), t('crashRetry')]));
    await act(async () => tree.unmount());
  });

  test('a splash that refuses to hide never makes the boundary throw', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    SplashScreen.hideAsync.mockImplementationOnce(() => {
      throw new Error('native gone');
    });
    const ErrorBoundary = require('../src/ErrorBoundary').default;
    let tree;
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Boom />
        </ErrorBoundary>
      );
    });
    expect(tree.root.findAll((n) => n.props?.children === makeT('en')('crashRetry')).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });
});

// ------------------------------------------------------ notification switch

describe('a notification switch explains a refusal iOS will not repeat', () => {
  const { askNotifications } = require('../src/notifPermission');
  const t = makeT('en');

  function spyAlert() {
    return jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  }

  test('already allowed: true, nothing asked, nothing shown', async () => {
    Notifications.state.permission = { status: 'granted', canAskAgain: true };
    const alert = spyAlert();
    expect(await askNotifications({ t, source: 'settings' })).toBe(true);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
  });

  test('denied for good: a warning and an alert with Cancel and Open Settings; the system sheet is not requested', async () => {
    Notifications.state.permission = { status: 'denied', canAskAgain: false };
    const alert = spyAlert();
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    const Haptics = require('expo-haptics');
    const warn = jest.spyOn(Haptics, 'notificationAsync');
    expect(await askNotifications({ t, source: 'settings' })).toBe(false);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0];
    expect(title).toBe(t('notifOffTitle'));
    expect(message).toBe(t('notifOffText'));
    expect(buttons.map((b) => b.text)).toEqual([t('cancel'), t('openSettings')]);
    expect(buttons[0].style).toBe('cancel');
    buttons[1].onPress();
    expect(open).toHaveBeenCalledTimes(1);
  });

  test('a failing Linking.openSettings is swallowed', async () => {
    Notifications.state.permission = { status: 'denied', canAskAgain: false };
    const alert = spyAlert();
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('no'));
    await askNotifications({ t, source: 'settings' });
    expect(() => alert.mock.calls[0][2][1].onPress()).not.toThrow();
  });

  test('never asked: the system sheet, tracked; “Allow” gives true', async () => {
    const analytics = require('../src/analytics');
    const track = jest.spyOn(analytics, 'track');
    const alert = spyAlert();
    expect(await askNotifications({ t, source: 'streak' })).toBe(true);
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(track).toHaveBeenCalledWith('push_permission', { granted: true, source: 'streak' });
    expect(alert).not.toHaveBeenCalled();
  });

  test('the person has just tapped “Don’t Allow” in the system sheet: no extra lecture', async () => {
    Notifications.state.onRequest = { status: 'denied' };
    const alert = spyAlert();
    expect(await askNotifications({ t, source: 'settings' })).toBe(false);
    expect(alert).not.toHaveBeenCalled();
  });

  test('without a translator of its own the phone’s language is used', async () => {
    Notifications.state.permission = { status: 'denied', canAskAgain: false };
    const alert = spyAlert();
    expect(await askNotifications({ source: 'streak' })).toBe(false);
    expect(alert.mock.calls[0][0]).toBe(t('notifOffTitle'));
  });

  test('the new strings exist in all five languages without long dashes', () => {
    const fragment = require('../src/strings/polish-app-core').default;
    for (const lang of ['en', 'uk', 'de', 'es', 'ru']) {
      // сповіщення в Параметрах + підтвердження покупки Pro (ProToast)
      expect(Object.keys(fragment[lang]).sort()).toEqual([
        'notifOffText',
        'notifOffTitle',
        'proToastText',
        'proToastTitle',
        'proToastTrial',
        'proToastTrialRemind',
      ]);
      for (const v of Object.values(fragment[lang])) {
        expect(v).not.toMatch(new RegExp('\\u2014|\\s\\u2013\\s|\\s-\\s'));
        expect(v.length).toBeGreaterThan(8);
      }
    }
  });
});

// ------------------------------------------------------------------ locale

describe('dates follow the phone’s region inside the UI language', () => {
  const { localeFor, formatDate } = require('../src/locale');
  const phone = (...tags) => require('expo-localization').__setLocales(tags, { silent: true });
  const ts = new Date(2026, 9, 8, 15, 30).getTime();
  afterEach(() => phone('en-US'));

  test('a British phone gets day before month and 24 hours, an American one the US order', () => {
    phone('en-GB');
    expect(localeFor('en')).toBe('en-GB');
    expect(formatDate(ts, 'en')).toBe('8 October');
    phone('en-US');
    expect(localeFor('en')).toBe('en-US');
    expect(formatDate(ts, 'en')).toBe('October 8');
  });

  test('only a phone language that matches the interface counts: French first does not leak into English', () => {
    phone('fr-FR', 'en-AU');
    expect(localeFor('en')).toBe('en-AU');
    phone('fr-FR');
    expect(localeFor('en')).toBe('en-US');
    expect(localeFor('fr')).toBe('en-US');
    phone('fr-FR', 'en-GB');
    expect(localeFor('pl')).toBe('en-GB');
  });

  test('each language picks its own region', () => {
    phone('de-AT', 'en-GB', 'es-MX');
    expect(localeFor('de')).toBe('de-AT');
    expect(localeFor('en')).toBe('en-GB');
    expect(localeFor('es')).toBe('es-MX');
  });

  test('no phone tag for the language: the default locale of the language, as before', () => {
    phone('en-US');
    expect(localeFor('ru')).toBe('ru-RU');
    expect(localeFor('uk')).toBe('uk-UA');
    expect(localeFor('de')).toBe('de-DE');
    expect(localeFor('es')).toBe('es-ES');
    expect(formatDate(ts, 'de')).toMatch(/Oktober/);
  });

  test('a malformed tag or a failing getLocales never breaks a date', () => {
    phone('en-@@');
    expect(localeFor('en')).toBe('en-US');
    const loc = require('expo-localization');
    const real = loc.getLocales;
    loc.getLocales = () => {
      throw new Error('native gone');
    };
    try {
      expect(localeFor('en')).toBe('en-US');
      expect(() => formatDate(ts, 'en')).not.toThrow();
    } finally {
      loc.getLocales = real;
    }
  });
});
