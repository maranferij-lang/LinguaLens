// Слово дня, полірування жовтня 2026: сповіщення не лишаються старою мовою,
// коли мову змінили офлайн, плануються паралельно; картка не малює порожній
// переклад прикладу, оголошує пояснення «Знаю» й плавно показує «Збережено».
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { notificationPlan, rescheduleNotifications, syncWordOfDay } from '../src/wordOfDay';
import WordOfDayCard from '../src/WordOfDayCard';
import { FadeIn } from '../src/ui';
import { THEMES } from '../src/theme';
import { localDayKey } from '../src/storage';
import { setSessionToken } from '../src/api';
import { makeT } from '../src/i18n';

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

const t = makeT('en');
const day = (i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return localDayKey(d);
};

function serve() {
  global.fetch = jest.fn(async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : {};
    const words = Array.from({ length: body.days || 7 }, (_, i) => ({
      date: day(i),
      word: 'word' + i,
      ipa: '',
      translation: 'tr' + i,
      example: '',
      example_translation: '',
      source: 'word' + i,
      topic: 'general',
    }));
    return { ok: true, status: 200, json: async () => ({ words }) };
  });
}
function offline() {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setSessionToken('tok');
  jest.clearAllMocks();
  Notifications.getAllScheduledNotificationsAsync.mockImplementation(async () => []);
  serve();
});

const args = (over = {}) => ({ lang: 'en', native: 'uk', enabled: true, hour: 10, profile: null, known: [], t, ...over });
const scheduled = () => Notifications.scheduleNotificationAsync.mock.calls.map(([n]) => n);

describe('changing the learning language while offline', () => {
  test('notifications from the old language’s cache are cancelled, not kept', async () => {
    const first = await syncWordOfDay(args());
    expect(scheduled().length).toBeGreaterThanOrEqual(13);
    // у системі лежать заплановані слова англійською
    const pending = scheduled().map((n) => ({ identifier: n.identifier, content: n.content }));
    Notifications.getAllScheduledNotificationsAsync.mockImplementation(async () => pending);
    Notifications.scheduleNotificationAsync.mockClear();
    Notifications.cancelScheduledNotificationAsync.mockClear();

    offline();
    const got = await syncWordOfDay(args({ lang: 'de' }));
    // нового слова немає, а старе чуже: нічого не плануємо, а заплановане знімаємо
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
    expect(Notifications.cancelScheduledNotificationAsync).toHaveBeenCalledTimes(pending.length);
    // кеш повертається як є: картка сама ховає його (wodFits) і не видає за німецький
    expect(got).toEqual(first);
    expect(got.lang).toBe('en');
  });

  test('the same goes for a switch of the English variety', async () => {
    await syncWordOfDay(args({ variant: 'us' }));
    Notifications.scheduleNotificationAsync.mockClear();
    offline();
    await syncWordOfDay(args({ variant: 'gb' }));
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });

  test('the same language offline keeps its notifications (nothing changed)', async () => {
    await syncWordOfDay(args());
    Notifications.scheduleNotificationAsync.mockClear();
    offline();
    await syncWordOfDay(args({ force: true }));
    expect(Notifications.scheduleNotificationAsync.mock.calls.length).toBeGreaterThanOrEqual(13);
  });

  test('the next successful sync in the new language schedules again', async () => {
    await syncWordOfDay(args());
    offline();
    await syncWordOfDay(args({ lang: 'de' }));
    Notifications.scheduleNotificationAsync.mockClear();
    serve();
    const de = await syncWordOfDay(args({ lang: 'de' }));
    expect(de.lang).toBe('de');
    expect(scheduled().length).toBeGreaterThanOrEqual(13);
  });

  test('with no cache at all and no network there is simply nothing to schedule', async () => {
    offline();
    const got = await syncWordOfDay(args());
    expect(got).toBeNull();
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('scheduling the notifications', () => {
  const cache = () => ({
    lang: 'en',
    native: 'uk',
    sig: 's',
    perDay: 1,
    days: 14,
    words: Array.from({ length: 14 }, (_, i) => ({ date: day(i + 1), slot: 0, word: 'w' + i, translation: 'tr' + i, example: 'ex' + i, topic: 'general' })),
  });

  test('all planned notifications are scheduled, in plan order', async () => {
    const plan = notificationPlan(cache(), [10]);
    expect(plan).toHaveLength(14);
    await rescheduleNotifications(cache(), true, [10], t);
    expect(scheduled().map((n) => n.identifier)).toEqual(plan.map((p) => p.identifier));
  });

  test('one failing call does not stop the others', async () => {
    Notifications.scheduleNotificationAsync.mockImplementationOnce(async () => {
      throw new Error('boom');
    });
    await expect(rescheduleNotifications(cache(), true, [10], t)).resolves.toBeUndefined();
    expect(Notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(14);
  });

  test('the calls go out together, not one after another', async () => {
    let open = 0;
    let peak = 0;
    Notifications.scheduleNotificationAsync.mockImplementation(async () => {
      open += 1;
      peak = Math.max(peak, open);
      await new Promise((r) => setTimeout(r, 5));
      open -= 1;
      return 'id';
    });
    await rescheduleNotifications(cache(), true, [10], t);
    expect(peak).toBeGreaterThan(1);
    expect(open).toBe(0);
  });
});

describe('the card', () => {
  const render = async (props) => {
    let tree;
    await act(async () => {
      tree = create(<WordOfDayCard word={{ word: 'la manzana', translation: 'apple', example: 'Una manzana roja.', example_translation: '' }} lang="es" saved={false} onSave={() => {}} onKnow={() => {}} t={t} {...props} />);
    });
    return tree;
  };
  const texts = (tree) => tree.root.findAll((n) => n.type === 'Text').map((n) => [].concat(n.props.children).flat(Infinity).join(''));
  const mounted = [];
  afterEach(async () => {
    while (mounted.length) await act(async () => mounted.pop().unmount());
  });
  const open = async (props) => {
    const tree = await render(props);
    mounted.push(tree);
    const row = tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityState?.expanded !== undefined);
    await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    return tree;
  };

  test('an example without a translation shows no empty line', async () => {
    const without = await open();
    const exTr = (tree) => tree.root.findAll((n) => n.type === 'Text' && n.props.style && [].concat(n.props.style).some((s) => s && s.marginTop === 5 && s.lineHeight === 18));
    expect(texts(without).some((x) => x.includes('Una manzana roja.'))).toBe(true);
    expect(exTr(without)).toHaveLength(0);

    const withTr = await open({ word: { word: 'la manzana', translation: 'apple', example: 'Una manzana roja.', example_translation: 'A red apple.' } });
    expect(texts(withTr)).toContain('A red apple.');
    expect(exTr(withTr)).toHaveLength(1);
  });

  test('the “offline, I know it was remembered” note is spoken for VoiceOver', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    spy.mockClear();
    const tree = await render({ knowNote: '' });
    mounted.push(tree);
    expect(spy).not.toHaveBeenCalled();
    await act(async () => tree.update(<WordOfDayCard word={{ word: 'la manzana', translation: 'apple' }} lang="es" saved={false} onSave={() => {}} onKnow={() => {}} knowNote="Remembered" t={t} />));
    expect(spy).toHaveBeenCalledWith('Remembered');
    spy.mockRestore();
  });

  // Кнопка «Зберегти»: найглибший вузол з onPress, у якому є її підпис
  const saveBtn = (tree) =>
    tree.root
      .findAll(
        (n) =>
          typeof n.props.onPress === 'function' &&
          n.findAll((x) => x.type === 'Text' && [].concat(x.props.children).join('') === t('saveWord')).length > 0
      )
      .at(-1);

  test('saving is spoken for VoiceOver: the focused “Save” is replaced by a plain “Saved”', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    spy.mockClear();
    const onSave = jest.fn();
    const tree = await render({ onSave });
    mounted.push(tree);
    // сама поява картки нічого не оголошує
    expect(spy).not.toHaveBeenCalled();
    await act(async () => saveBtn(tree).props.onPress());
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(t('saved'));
    spy.mockRestore();
  });

  test('a card that is already saved, or paging to a saved slot, stays silent: only the tap speaks', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    spy.mockClear();
    const tree = await render({ saved: true });
    mounted.push(tree);
    await act(async () => tree.update(<WordOfDayCard word={{ word: 'la manzana', translation: 'apple' }} lang="es" saved={false} onSave={() => {}} onKnow={() => {}} t={t} />));
    await act(async () => tree.update(<WordOfDayCard word={{ word: 'la manzana', translation: 'apple' }} lang="es" saved onSave={() => {}} onKnow={() => {}} t={t} />));
    // зберегли не тут (скажімо, зі слота Pro) — картка лише показує «Збережено»
    expect(spy).not.toHaveBeenCalled();

    const W = (slot, word, extra = {}) => ({ date: '2026-10-08', slot, hour: [10, 16, 21][slot], word, ipa: '', translation: word + '-tr', example: '', example_translation: '', ...extra });
    const onSlotSave = jest.fn();
    const pro = await render({
      slots: { n: 3, list: [W(0, 'harbour', { saved: true }), W(1, 'anchor')], next: { hour: 21, label: '21:00' }, focus: null, onSave: onSlotSave, onKnow: jest.fn(async () => {}) },
    });
    mounted.push(pro);
    const dot = (i) => pro.root.findAll((n) => n.props.accessibilityLabel === t('wodSlotOf', { i, n: 3 }) && n.props.onPress)[0];
    // гортаємо до вже збереженого слота: «Збережено» без оголошення
    await act(async () => dot(1).props.onPress());
    expect(spy).not.toHaveBeenCalled();
    // назад до слова, що ще не збережене: тап за ним і говорить
    await act(async () => dot(2).props.onPress());
    await act(async () => saveBtn(pro).props.onPress());
    expect(onSlotSave).toHaveBeenCalledWith(expect.objectContaining({ slot: 1, word: 'anchor' }));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(t('saved'));
    spy.mockRestore();
  });

  test('“Saved” fades in instead of snapping, and reads in the ink colour of the theme', async () => {
    const tree = await render({ saved: false });
    mounted.push(tree);
    expect(tree.root.findAllByType(FadeIn).length).toBeGreaterThan(0);
    const before = tree.root.findAllByType(FadeIn).length;
    await act(async () => tree.update(<WordOfDayCard word={{ word: 'la manzana', translation: 'apple' }} lang="es" saved onSave={() => {}} onKnow={() => {}} t={t} />));
    expect(tree.root.findAllByType(FadeIn).length).toBe(before + 1);
    const saved = tree.root.findAll((n) => n.type === 'Text' && n.props.children === t('saved'))[0];
    const color = Object.assign({}, ...[].concat(saved.props.style).flat(Infinity).filter(Boolean)).color;
    expect(color).toBe(THEMES.light.C.greenInk);
    // «Зберегти» зникла, «Слухати» і «Знаю» на місці
    expect(texts(tree)).not.toContain(t('saveWord'));
  });
});
