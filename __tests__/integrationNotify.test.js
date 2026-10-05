// Інтеграція v1.3 (план §8, C5): сповіщення трьох модулів разом.
//   • бюджет iOS: Pro з 5 словами дня + кінець пробного + серія під загрозою
//     ≤ 64 (56 + 1 + 1), і жоден модуль не скасовує чужий data.type;
//   • тап по «Не дай вогнику згаснути» (data.type 'streak') відкриває
//     «Навчання» (core.md C.4.5);
//   • той самий ідентифікатор 'streak-risk' щодня: завтрашній тап не губиться
//     через відсів дублікатів учорашнього.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import {
  WOD_NOTIFY_CAP,
  rescheduleNotifications,
  scheduleTrialReminder,
  subscribeToNotificationTaps,
} from '../src/wordOfDay';
import { STREAK_RISK_ID, cancelStreakRisk, syncStreakRisk } from '../src/streakNotify';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';

// Сповіщення зі справжнім «розкладом»: що заплановано, те й лежить, доки
// його не скасують — так видно, хто що скасовує.
jest.mock('expo-notifications', () => {
  const store = new Map();
  return {
    __store: store,
    setNotificationHandler: jest.fn(),
    getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
    requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
    getAllScheduledNotificationsAsync: jest.fn(async () => [...store.values()]),
    cancelScheduledNotificationAsync: jest.fn(async (id) => {
      store.delete(id);
    }),
    cancelAllScheduledNotificationsAsync: jest.fn(async () => store.clear()),
    scheduleNotificationAsync: jest.fn(async (req) => {
      store.set(req.identifier, req);
      return req.identifier;
    }),
    setNotificationChannelAsync: jest.fn(async () => {}),
    addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
    getLastNotificationResponse: jest.fn(() => null),
    clearLastNotificationResponse: jest.fn(),
    SchedulableTriggerInputTypes: { DATE: 'date' },
    AndroidImportance: { DEFAULT: 3 },
    DEFAULT_ACTION_IDENTIFIER: 'default',
  };
});

jest.setTimeout(20000);

const t = makeT('en');
const store = Notifications.__store;
const types = () => [...store.values()].map((r) => r.content?.data?.type);
const count = (type) => types().filter((x) => x === type).length;

function dayKey(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDayKey(d);
}

// Найгірший випадок: Pro, 5 слів на день, кеш на 14 днів наперед
function proCache() {
  const words = [];
  for (let day = 1; day <= 14; day++) {
    for (let slot = 0; slot < 5; slot++) {
      words.push({ date: dayKey(day), slot, word: `w${day}-${slot}`, translation: 't', topic: null });
    }
  }
  return { lang: 'es', native: 'en', perDay: 5, words };
}
const HOURS = [8, 11, 14, 17, 20];
const morning = () => {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return d;
};

beforeEach(() => {
  store.clear();
});

describe('the iOS budget of 64 (C5)', () => {
  test('Pro with 5 words a day + trial end + streak risk: 56 + 1 + 1, under 64', async () => {
    await rescheduleNotifications(proCache(), true, HOURS, t);
    expect(await scheduleTrialReminder(Date.now() + 7 * 864e5, 'Trial', 'Ends soon')).toBe(true);
    expect(await syncStreakRisk({ n: 4, doneToday: false, t, now: morning() })).toBe(true);

    expect(count('word-of-day')).toBe(WOD_NOTIFY_CAP);
    expect(count('trial-end')).toBe(1);
    expect(count('streak')).toBe(1);
    expect(store.size).toBe(WOD_NOTIFY_CAP + 2);
    expect(store.size).toBeLessThanOrEqual(64);
    // лише відомі типи — інакше хтось планує повз бюджет
    expect(new Set(types())).toEqual(new Set(['word-of-day', 'trial-end', 'streak']));
  });

  test('each module cancels only its own type', async () => {
    await rescheduleNotifications(proCache(), true, HOURS, t);
    await scheduleTrialReminder(Date.now() + 7 * 864e5, 'Trial', 'Ends soon');
    await syncStreakRisk({ n: 4, doneToday: false, t, now: morning() });

    // слова дня переплановуються (нова година, менше слотів) — чуже лишається
    await rescheduleNotifications(proCache(), true, [9], t);
    expect(count('word-of-day')).toBe(14);
    expect(store.has('trial-end')).toBe(true);
    expect(store.has(STREAK_RISK_ID)).toBe(true);

    // слова дня вимкнули — так само
    await rescheduleNotifications(proCache(), false, HOURS, t);
    expect(count('word-of-day')).toBe(0);
    expect(store.has('trial-end')).toBe(true);
    expect(store.has(STREAK_RISK_ID)).toBe(true);

    // серію врятовано — знімається лише її нагадування
    await rescheduleNotifications(proCache(), true, HOURS, t);
    await cancelStreakRisk();
    expect(store.has(STREAK_RISK_ID)).toBe(false);
    expect(count('word-of-day')).toBe(WOD_NOTIFY_CAP);
    expect(store.has('trial-end')).toBe(true);

    // дія дня є — syncStreakRisk теж не чіпає чужого
    await syncStreakRisk({ n: 4, doneToday: true, t, now: morning() });
    expect(count('word-of-day')).toBe(WOD_NOTIFY_CAP);
    expect(store.has('trial-end')).toBe(true);
  });
});

describe('taps on the streak reminder', () => {
  const response = (date) => ({
    actionIdentifier: 'default',
    notification: { date, request: { identifier: STREAK_RISK_ID, content: { data: { type: 'streak' } } } },
  });

  test('the same id on the next day is a new tap; the same delivery twice is one', () => {
    const onTap = jest.fn();
    Notifications.addNotificationResponseReceivedListener.mockClear();
    const unsubscribe = subscribeToNotificationTaps(onTap);
    const listener = Notifications.addNotificationResponseReceivedListener.mock.calls[0][0];
    const today = Date.now();
    listener(response(today));
    // холодний старт і слухач повідомили той самий тап
    listener(response(today));
    expect(onTap).toHaveBeenCalledTimes(1);
    // завтра, застосунок так і не вбили: той самий 'streak-risk' — новий тап
    listener(response(today + 864e5));
    expect(onTap).toHaveBeenCalledTimes(2);
    expect(onTap).toHaveBeenLastCalledWith({ type: 'streak' });
    unsubscribe();
  });

  describe('in the App', () => {
    const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
    const App = require('../App').default;
    const FlashcardsScreen = require('../src/FlashcardsScreen').default;
    const ScannerScreen = require('../src/ScannerScreen').default;
    const analytics = require('../src/analytics');
    let mounted = null;

    beforeEach(async () => {
      await AsyncStorage.clear();
      require('expo-localization').__setLocales(['en-US'], { silent: true });
      global.fetch = jest.fn(async () => {
        throw new TypeError('Network request failed');
      });
      await AsyncStorage.setItem('ll_onboarded_v1', '1');
      await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true }));
    });
    afterEach(async () => {
      Notifications.getLastNotificationResponse.mockImplementation(() => null);
      if (mounted) await act(async () => mounted.unmount());
      mounted = null;
    });

    async function renderApp() {
      await act(async () => {
        mounted = create(
          <SafeAreaProvider initialMetrics={metrics}>
            <App />
          </SafeAreaProvider>
        );
      });
      for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
      return mounted;
    }
    const one = (tree, type) => tree.root.findAllByType(type)[0] || null;

    test('without a tap the app opens on the scanner', async () => {
      const tree = await renderApp();
      expect(one(tree, ScannerScreen)).not.toBeNull();
      expect(one(tree, FlashcardsScreen)).toBeNull();
    });

    test('“Don’t let your flame go out” opens Learn, where one card saves the streak', async () => {
      const track = jest.spyOn(analytics, 'track');
      Notifications.getLastNotificationResponse.mockImplementation(() => response(Date.now()));
      const tree = await renderApp();
      expect(one(tree, FlashcardsScreen)).not.toBeNull();
      expect(one(tree, ScannerScreen)).toBeNull();
      expect(track).toHaveBeenCalledWith('streak_reminder', { action: 'opened' });
      track.mockRestore();
    });
  });
});
