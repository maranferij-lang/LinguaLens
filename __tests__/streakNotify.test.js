// Нагадування «серія під загрозою» о 20:00 (core.md C.4.5, план §5.10):
// умови, тригер DATE на сьогодні 20:00, один ідентифікатор і скасування лише
// свого типу; App — плануємо, коли застосунок іде у фон, знімаємо після дії
// і з перемикачем у Параметрах.
/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import SettingsScreen from '../src/SettingsScreen';
import StreakSection from '../src/settings/StreakSection';
import { RISK_HOUR, STREAK_RISK_ID, cancelStreakRisk, shouldRemind, streakRiskAt, syncStreakRisk } from '../src/streakNotify';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { ACHIEVEMENTS } from '../src/achievements';

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
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));

jest.setTimeout(20000);

const t = makeT('uk');
const at = (h, m = 0) => new Date(2026, 9, 4, h, m);
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(() => {
  jest.clearAllMocks();
  Notifications.getPermissionsAsync.mockImplementation(async () => ({ status: 'granted', canAskAgain: true }));
});
afterEach(() => jest.restoreAllMocks());

describe('when and whether', () => {
  test('today at 20:00 local time; later in the evening — not today', () => {
    expect(RISK_HOUR).toBe(20);
    expect(streakRiskAt(at(9, 30))).toEqual(at(20));
    expect(streakRiskAt(at(19, 58))).toEqual(at(20));
    expect(streakRiskAt(at(19, 59, 30))).toBeNull();
    expect(streakRiskAt(at(21))).toBeNull();
  });

  test('only a streak of two days or more, nothing done today, reminders on', () => {
    expect(shouldRemind({ n: 2, doneToday: false })).toBe(true);
    expect(shouldRemind({ n: 1, doneToday: false })).toBe(false);
    expect(shouldRemind({ n: 5, doneToday: true })).toBe(false);
    expect(shouldRemind({ n: 5, doneToday: false, enabled: false })).toBe(false);
  });
});

describe('scheduling', () => {
  test('one DATE notification at 20:00 with its own id and type', async () => {
    expect(await syncStreakRisk({ n: 4, doneToday: false, t, now: at(10) })).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: STREAK_RISK_ID,
      content: { title: 'Не дай вогнику згаснути', body: 'Серія: 4 дні. Одне слово сьогодні, і вона жива.', data: { type: 'streak' } },
      trigger: { type: 'date', date: at(20) },
    });
  });

  // Дія дня вже є — під загрозою серія буде завтра ввечері, і саме тоді
  // людина може застосунок і не відкрити: нагадування — на завтра о 20:00
  test('today’s action is done: the reminder moves to tomorrow at 20:00', async () => {
    expect(streakRiskAt(at(9), true)).toEqual(new Date(2026, 9, 5, 20));
    expect(streakRiskAt(at(23, 30), true)).toEqual(new Date(2026, 9, 5, 20));
    // перехід на зимовий час у Києві (25.10): усе одно 20:00 місцевого
    expect(streakRiskAt(new Date(2026, 9, 24, 22), true)).toEqual(new Date(2026, 9, 25, 20));
    expect(await syncStreakRisk({ n: 5, doneToday: true, t, now: at(9) })).toBe(true);
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledWith({
      identifier: STREAK_RISK_ID,
      content: { title: 'Не дай вогнику згаснути', body: 'Серія: 5 днів. Одне слово сьогодні, і вона жива.', data: { type: 'streak' } },
      trigger: { type: 'date', date: new Date(2026, 9, 5, 20) },
    });
  });

  test('nothing to remind about, too late, or no permission: the old one is cancelled, nothing new', async () => {
    for (const args of [
      { n: 1, doneToday: false, now: at(10) },
      // серія почалась сьогодні: завтра буде один день — ще не звичка
      { n: 1, doneToday: true, now: at(10) },
      { n: 4, doneToday: true, enabled: false, now: at(10) },
      { n: 4, doneToday: false, enabled: false, now: at(10) },
      { n: 4, doneToday: false, now: at(20, 30) },
    ]) {
      expect(await syncStreakRisk({ ...args, t })).toBe(false);
    }
    Notifications.getPermissionsAsync.mockImplementation(async () => ({ status: 'denied', canAskAgain: false }));
    expect(await syncStreakRisk({ n: 4, doneToday: false, t, now: at(10) })).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(6);
  });

  test('cancelling touches only “streak-risk”: words of the day and the trial reminder stay', async () => {
    await cancelStreakRisk();
    expect(Notifications.cancelScheduledNotificationAsync.mock.calls).toEqual([[STREAK_RISK_ID]]);
    expect(Notifications.cancelAllScheduledNotificationsAsync).not.toHaveBeenCalled();
  });
});

describe('settings', () => {
  const s = { sectionLabel: {}, switchRow: {}, switchTitle: {}, dimText: {} };
  const ctx = (settings, saveSetting = jest.fn()) => ({ t, lang: 'uk', C: { card3: '#000', accent: '#000' }, s, settings, saveSetting });
  const theSwitch = (tree) => tree.root.findAll((n) => n.props.testID === 'streak-remind' && typeof n.props.onValueChange === 'function')[0];

  test('a switch “Remind me about my streak” with the hour in the interface clock', async () => {
    const save = jest.fn();
    let tree;
    await act(async () => {
      tree = create(<StreakSection ctx={ctx({}, save)} extra={{}} />);
    });
    const texts = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
    expect(texts).toEqual(expect.arrayContaining(['Серія', 'Нагадувати про серію', 'О 20:00, якщо сьогодні ще нічого не повторено']));
    expect(theSwitch(tree).props.value).toBe(true);
    await act(async () => theSwitch(tree).props.onValueChange(false));
    expect(save).toHaveBeenCalledWith({ streakRemind: false });
    // вимкнули — заплановане на сьогодні теж знято, слова дня не чіпаємо
    expect(Notifications.cancelScheduledNotificationAsync.mock.calls).toEqual([[STREAK_RISK_ID]]);
    await act(async () => tree.unmount());
    await act(async () => {
      tree = create(<StreakSection ctx={ctx({ streakRemind: false })} extra={{}} />);
    });
    expect(theSwitch(tree).props.value).toBe(false);
    await act(async () => tree.unmount());
  });

  test('turning it on without permission asks the system; a refusal leaves it off', async () => {
    Notifications.getPermissionsAsync.mockImplementation(async () => ({ status: 'undetermined', canAskAgain: true }));
    Notifications.requestPermissionsAsync.mockImplementationOnce(async () => ({ status: 'denied' }));
    const save = jest.fn();
    let tree;
    await act(async () => {
      tree = create(<StreakSection ctx={ctx({ streakRemind: false }, save)} extra={{}} />);
    });
    await act(async () => theSwitch(tree).props.onValueChange(true));
    expect(Notifications.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(save).not.toHaveBeenCalled();
    // дозволили — вмикається
    Notifications.requestPermissionsAsync.mockImplementationOnce(async () => ({ status: 'granted' }));
    await act(async () => theSwitch(tree).props.onValueChange(true));
    expect(save).toHaveBeenCalledWith({ streakRemind: true });
    expect(Notifications.cancelScheduledNotificationAsync).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});

describe('App', () => {
  let appState;
  // о десятій ранку: до вечірнього нагадування ще далеко
  beforeEach(async () => {
    jest.useFakeTimers({ now: at(10), advanceTimers: true });
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    appState = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      appState.push(fn);
      return { remove() {} };
    });
  });

  async function settle(n = 4) {
    for (let i = 0; i < n; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }
  async function app({ activity = {}, settings = {} } = {}) {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', ...settings }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
    await AsyncStorage.setItem(
      'll_words_v1',
      JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now() - 90 * 86400000, srs: { box: 0, due: 0 } }])
    );
    await AsyncStorage.setItem('ll_activity_v1', JSON.stringify(activity));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await settle(5);
    return tree;
  }
  const ago = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDayKey(d);
  };
  afterEach(() => jest.useRealTimers());
  const toBackground = () => act(async () => appState.forEach((fn) => fn('background')));
  const riskCalls = () => Notifications.scheduleNotificationAsync.mock.calls.filter(([r]) => r.identifier === STREAK_RISK_ID);

  test('going to the background with a streak at risk schedules the reminder', async () => {
    const tree = await app({ activity: { [ago(1)]: 2, [ago(2)]: 1 } });
    await toBackground();
    await settle();
    expect(riskCalls()).toHaveLength(1);
    expect(riskCalls()[0][0]).toMatchObject({ content: { title: 'Don’t let your flame go out', body: 'Your streak is 2 days. One word today keeps it alive.' }, trigger: { date: at(20) } });
    await act(async () => tree.unmount());
  });

  // Практикував у понеділок уранці, у вівторок застосунок не відкривав —
  // о 20:00 вівторка нагадування мусить прийти (WDG-2)
  test('today’s action cancels today’s; the background then plans tomorrow’s', async () => {
    const tree = await app({ activity: { [ago(1)]: 2, [ago(2)]: 1 } });
    Notifications.cancelScheduledNotificationAsync.mockClear();
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
    await settle();
    await act(async () => tree.root.findByType(FlashcardsScreen).props.onReview('a', true));
    await settle();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_RISK_ID);
    await toBackground();
    await settle();
    expect(riskCalls()).toHaveLength(1);
    expect(riskCalls()[0][0]).toMatchObject({
      content: { body: 'Your streak is 3 days. One word today keeps it alive.' },
      trigger: { date: new Date(2026, 9, 5, 20) },
    });
    await act(async () => tree.unmount());
  });

  test('the switch in Settings turns it off for good', async () => {
    const tree = await app({ activity: { [ago(1)]: 2, [ago(2)]: 1 } });
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
    await settle();
    const sw = tree.root.findByType(SettingsScreen).findAll((n) => n.props.testID === 'streak-remind' && typeof n.props.onValueChange === 'function')[0];
    expect(sw.props.value).toBe(true);
    Notifications.cancelScheduledNotificationAsync.mockClear();
    await act(async () => sw.props.onValueChange(false));
    await settle();
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).streakRemind).toBe(false);
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith(STREAK_RISK_ID);
    await toBackground();
    await settle();
    expect(riskCalls()).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('“I know it” on the word of the day is a learning action too', async () => {
    const today = localDayKey();
    await AsyncStorage.setItem('ll_wod_v1', JSON.stringify({ lang: 'es', native: 'en', words: [{ date: today, word: 'la manzana', translation: 'apple' }] }));
    const tree = await app({ activity: { [ago(1)]: 2 } });
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
    await settle();
    await act(async () => {
      tree.root.findByType(FlashcardsScreen).props.onKnowWod();
    });
    await settle();
    expect(JSON.parse(await AsyncStorage.getItem('ll_activity_v1'))[today]).toBe(1);
    expect(tree.root.findByType(FlashcardsScreen).props.streak).toMatchObject({ n: 2, doneToday: true });
    await act(async () => tree.unmount());
  });
});
