// Pro «кілька слів на день» і секція «Віджети» в Параметрах, у зв'язці App +
// екрани: 3 чи 5 без Pro ведуть на пейвол «wod_per_day» і застосовуються
// після покупки; з Pro — години кожного слова; сервер отримує perDay.
// І картка слова дня в Pro-режимі (крапки, гортання, «Наступне о …»).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, ScrollView, Switch, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import WordOfDayCard, { useWodSlots } from '../src/WordOfDayCard';
import WidgetsSection from '../src/settings/WidgetsSection';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';
import { THEMES, ThemeProvider } from '../src/theme';
import { makeT } from '../src/i18n';

jest.setTimeout(20000);

const uk = makeT('uk');
const TODAY = localDayKey();
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const day = (i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return localDayKey(d);
};

const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
let calls = [];
function server() {
  calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, method, body });
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't1', user: { id: 'u1', createdAt: 1 } });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u1' }, pro: { active: false }, usage: { day: TODAY, scans: 0, limit: 5 } });
    if (u.pathname === '/word-of-day' && method === 'POST') {
      const perDay = body.perDay || 1;
      const words = [];
      for (let i = 0; i < body.days; i++) {
        for (let s = 0; s < perDay; s++) {
          const w = 'w' + i + '-' + s;
          words.push({ date: day(i), slot: s, word: w, ipa: '', translation: 'tr', example: '', example_translation: '', source: w });
        }
      }
      return reply(200, { words, perDay });
    }
    if (u.pathname === '/me/profile') return reply(200, { ok: true });
    throw new TypeError('Network request failed');
  });
}
const wodPosts = () => calls.filter((c) => c.path === '/word-of-day' && c.method === 'POST');

beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['uk-UA'], { silent: true });
  server();
});

let mounted = null;
afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount());
  mounted = null;
});

async function settle(n = 5) {
  for (let i = 0; i < n; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
}
async function returning({ settings = {}, pro = false } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'uk', targetLang: 'en', ...settings }));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
  if (pro) await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * 86400000 }));
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
const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && n.props.onPress)[0] || null;
const tapId = (tree, id) => run(() => byId(tree, id).props.onPress());
// Рядки годин слів (SlotHour): VoiceOver-регулятор «Слово 2 о 16:00»
const slotRows = (tree) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable' && n.props.onAccessibilityAction);
const nudge = (tree, i, dir) =>
  run(() => slotRows(tree)[i].props.onAccessibilityAction({ nativeEvent: { actionName: dir > 0 ? 'increment' : 'decrement' } }));

describe('Settings → Word of the day: words per day', () => {
  test('without Pro, 3 opens the paywall “wod_per_day”; after the purchase the choice applies by itself', async () => {
    await returning();
    const analytics = require('../src/analytics');
    const track = jest.spyOn(analytics, 'track');
    const tree = await renderApp();
    await openTab(tree, 'settings');
    // 1 · 3 · 5, на 3 і 5 — мітка Pro
    expect(byId(tree, 'wod-per-day-1').props.accessibilityState).toEqual({ selected: true });
    expect(byId(tree, 'wod-per-day-3').props.accessibilityLabel).toBe('3, Pro');
    expect(tree.root.findAll((n) => n.props.testID === 'wod-slot-hours')).toHaveLength(0);

    await tapId(tree, 'wod-per-day-3');
    expect(one(tree, PaywallScreen).props.reason).toBe('wod_per_day');
    expect(track).toHaveBeenCalledWith('wod_per_day', { n: 3, source: 'paywall' });
    expect((await stored('ll_settings_v1')).wodPerDay).toBeUndefined();

    const before = wodPosts().length;
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    await settle(5);
    expect(await stored('ll_settings_v1')).toMatchObject({ wodPerDay: 3, wodHours: [10, 16, 21] });
    expect(wodPosts().length).toBeGreaterThan(before);
    expect(wodPosts().at(-1).body.perDay).toBe(3);
    // кеш тепер на три слова в день
    const cache = await stored('ll_wod_v1');
    expect(cache.perDay).toBe(3);
    expect(cache.words.filter((w) => w.date === TODAY).map((w) => w.slot)).toEqual([0, 1, 2]);
    track.mockRestore();
  });

  test('with Pro, 5 saves straight away, with an hour for every word; back to 1 — one word again', async () => {
    await returning({ pro: true, settings: { wodHour: 8 } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    expect(byId(tree, 'wod-per-day-5').props.accessibilityLabel).toBe('5');

    await tapId(tree, 'wod-per-day-5');
    expect(one(tree, PaywallScreen)).toBeNull();
    const st = await stored('ll_settings_v1');
    expect(st.wodPerDay).toBe(5);
    // від години першого слова до вечора, години строго зростають
    expect(st.wodHours).toEqual([8, 11, 15, 18, 21]);
    expect(wodPosts().at(-1).body.perDay).toBe(5);

    // години: п'ять рядків «Слово N» з регулятором
    expect(slotRows(tree).map((n) => n.props.accessibilityLabel)).toEqual([
      uk('wodSlotA11y', { n: 1, t: '08:00' }),
      uk('wodSlotA11y', { n: 2, t: '11:00' }),
      uk('wodSlotA11y', { n: 3, t: '15:00' }),
      uk('wodSlotA11y', { n: 4, t: '18:00' }),
      uk('wodSlotA11y', { n: 5, t: '21:00' }),
    ]);
    await nudge(tree, 1, +1);
    expect((await stored('ll_settings_v1')).wodHours).toEqual([8, 12, 15, 18, 21]);
    // перше слово — воно ж wodHour (сповіщення без Pro)
    await nudge(tree, 0, -1);
    expect(await stored('ll_settings_v1')).toMatchObject({ wodHour: 7, wodHours: [7, 12, 15, 18, 21] });
    // межі: не раніше 6:00 і не пізніше сусіда
    await nudge(tree, 0, -1);
    await nudge(tree, 0, -1);
    expect((await stored('ll_settings_v1')).wodHours[0]).toBe(6);
    await nudge(tree, 3, +1);
    await nudge(tree, 3, +1);
    await nudge(tree, 3, +1);
    expect((await stored('ll_settings_v1')).wodHours.slice(3)).toEqual([20, 21]);
    await nudge(tree, 4, +1);
    await nudge(tree, 4, +1);
    await nudge(tree, 4, +1);
    expect((await stored('ll_settings_v1')).wodHours[4]).toBe(23);

    await tapId(tree, 'wod-per-day-1');
    expect(await stored('ll_settings_v1')).toMatchObject({ wodPerDay: 1, wodHours: null });
    expect(slotRows(tree)).toHaveLength(0);
    expect(wodPosts().at(-1).body.perDay).toBeUndefined();
  });

  test('Pro ended — the saved 5 is kept but the app asks for one word', async () => {
    await returning({ settings: { wodPerDay: 5, wodHours: [8, 11, 15, 18, 21] } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    expect(byId(tree, 'wod-per-day-1').props.accessibilityState).toEqual({ selected: true });
    expect(slotRows(tree)).toHaveLength(0);
    expect(wodPosts().every((c) => !c.body.perDay)).toBe(true);
    expect((await stored('ll_settings_v1')).wodPerDay).toBe(5);
  });
});

describe('Settings → Widgets', () => {
  test('hide translation until tapped: on by default, saved when switched off', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const sw = () => tree.root.find((n) => n.type === Switch && n.props.testID === 'widget-hide-tr');
    expect(sw().props.value).toBe(true);
    await run(() => sw().props.onValueChange(false));
    expect((await stored('ll_settings_v1')).widgetHideTranslation).toBe(false);
    expect(sw().props.value).toBe(false);

    // «Як додати віджет» розгортається з тими самими кроками
    expect(tree.root.findAll((n) => n.props.testID === 'widget-howto')).toHaveLength(0);
    await tapId(tree, 'widget-howto-row');
    expect(tree.root.findAll((n) => n.props.testID === 'widget-howto' && n.props.style).length).toBeGreaterThan(0);
  });

  test('the dev build has “fast time” for widgets, remembered across launches', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const sw = () => tree.root.find((n) => n.type === Switch && n.props.testID === 'widget-fast-clock');
    expect(sw().props.value).toBe(false);
    await run(() => sw().props.onValueChange(true));
    expect(sw().props.value).toBe(true);
    expect(await AsyncStorage.getItem('ll_dev_widget_clock_v1')).toBe('1');
    await run(() => sw().props.onValueChange(false));
    expect(await AsyncStorage.getItem('ll_dev_widget_clock_v1')).not.toBe('1');
  });

  test('no widgets on this phone (Expo Go, Android) — no section', async () => {
    let tree;
    await act(async () => {
      tree = create(
        <WidgetsSection ctx={{ t: uk, C: THEMES.light.C, s: {}, settings: {}, commitSettings: jest.fn() }} extra={{ widgetsAvailable: false }} />
      );
    });
    expect(tree.toJSON()).toBeNull();
  });
});

// ---------- картка слова дня: Pro, кілька слів ----------
const W = (slot, word, extra = {}) => ({
  date: TODAY,
  slot,
  hour: [10, 16, 21][slot],
  word,
  ipa: '',
  translation: word + '-tr',
  example: '',
  example_translation: '',
  ...extra,
});

async function renderCard(props) {
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={THEMES.light}>
        <WordOfDayCard word={props.slots ? props.slots.list[0] : null} lang="en" t={uk} saved={false} onSave={jest.fn()} onKnow={jest.fn()} {...props} />
      </ThemeProvider>
    );
  });
  return tree;
}
const flat = (n) =>
  []
    .concat(n.props.children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : c && c.props ? flat(c) : ''))
    .join('');
const allText = (tree) => tree.root.findAll((n) => n.type === Text).map(flat);
const press = (tree, label) =>
  act(async () => {
    // найглибший вузол з onPress, що несе цей підпис (не вся картка)
    const btn = tree.root.findAll((n) => n.props.onPress && (n.props.accessibilityLabel === label || (n.type !== Text && allTextOf(n).includes(label)))).at(-1);
    await btn.props.onPress();
  });
const allTextOf = (node) => node.findAll((n) => n.type === Text).map(flat);

describe('WordOfDayCard with several words a day', () => {
  const slots = (extra = {}) => ({
    n: 3,
    list: [W(0, 'harbour'), W(1, 'anchor')],
    next: { hour: 21, label: '21:00' },
    focus: null,
    onSave: jest.fn(),
    onKnow: jest.fn(async () => {}),
    ...extra,
  });

  test('dots for every slot, the newest open word first, the next one locked until its hour', async () => {
    const tree = await renderCard({ slots: slots() });
    const dots = tree.root.findAll((n) => n.props.accessibilityLabel?.startsWith?.('Слово ') && n.props.onPress);
    expect(dots.map((d) => d.props.accessibilityState)).toEqual([
      { selected: false, disabled: false },
      { selected: true, disabled: false },
      { selected: false, disabled: true },
    ]);
    expect(allText(tree)).toEqual(expect.arrayContaining([uk('widgetSlot', { i: 2, n: 3 }), 'harbour', 'anchor', uk('wodNextLocked', { t: '21:00' })]));
    expect(tree.root.findAll((n) => n.type === ScrollView && n.props.testID === 'wod-pager' && n.props.horizontal)).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  test('“Save” and “I know it” act on the word on the card; a dot switches it', async () => {
    const s = slots();
    const tree = await renderCard({ slots: s });
    await press(tree, uk('saveWord'));
    expect(s.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ slot: 1, word: 'anchor' }));
    await act(async () => tree.root.findAll((n) => n.props.accessibilityLabel === uk('wodSlotOf', { i: 1, n: 3 }) && n.props.onPress)[0].props.onPress());
    expect(allText(tree)).toContain(uk('widgetSlot', { i: 1, n: 3 }));
    await press(tree, uk('saveWord'));
    expect(s.onSave).toHaveBeenLastCalledWith(expect.objectContaining({ slot: 0, word: 'harbour' }));
    await press(tree, uk('wodKnowA11y'));
    expect(s.onKnow).toHaveBeenCalledWith(expect.objectContaining({ slot: 0 }));
    await act(async () => tree.unmount());
  });

  test('a saved slot shows “Saved”; a tap from a notification opens its slot', async () => {
    const tree = await renderCard({
      slots: slots({ list: [W(0, 'harbour', { saved: true }), W(1, 'anchor')], focus: { slot: 0, at: 1 } }),
    });
    expect(allText(tree)).toContain(uk('widgetSlot', { i: 1, n: 3 }));
    expect(allText(tree)).toContain(uk('saved'));
    await act(async () => tree.unmount());
  });

  test('one word a day — the card is as before', async () => {
    const tree = await renderCard({ word: W(0, 'harbour'), slots: null });
    expect(tree.root.findAll((n) => n.props.testID === 'wod-slots')).toHaveLength(0);
    expect(allText(tree)).toContain('harbour');
    await act(async () => tree.unmount());
  });
});

describe('useWodSlots', () => {
  afterEach(() => jest.useRealTimers());

  test('opens the next word at its hour without leaving the screen', async () => {
    jest.useFakeTimers({ now: new Date(2026, 9, 8, 15, 30), doNotFake: ['nextTick', 'setImmediate'] });
    const date = localDayKey(new Date());
    const cache = {
      lang: 'en',
      native: 'uk',
      perDay: 3,
      words: [0, 1, 2].map((s) => ({ date, slot: s, word: 'w' + s, translation: 't' })),
    };
    let out = null;
    function Probe() {
      out = useWodSlots({ wod: cache, hours: [10, 16, 21], words: [{ word: 'W0' }], ui: 'uk' });
      return null;
    }
    let tree;
    act(() => {
      tree = create(<Probe />);
    });
    expect(out.n).toBe(3);
    expect(out.list.map((w) => [w.slot, w.saved])).toEqual([[0, true]]);
    expect(out.next).toEqual({ hour: 16, label: '16:00' });
    act(() => {
      jest.advanceTimersByTime(31 * 60 * 1000);
    });
    expect(out.list.map((w) => w.slot)).toEqual([0, 1]);
    expect(out.next).toEqual({ hour: 21, label: '21:00' });
    // одне слово на день — картка без слотів
    function Single() {
      out = useWodSlots({ wod: cache, hours: [10], words: [], ui: 'uk' });
      return null;
    }
    act(() => {
      tree.update(<Single />);
    });
    expect(out).toBeNull();
    act(() => tree.unmount());
  });

  test('coming back to the app recounts the open words', async () => {
    const listeners = [];
    // AppState.addEventListener — уже jest.fn (пресет RN): mockRestore зняв би
    // з нього й типову реалізацію, тож підміняємо лише один виклик
    jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((type, fn) => {
      listeners.push(fn);
      return { remove() {} };
    });
    jest.useFakeTimers({ now: new Date(2026, 9, 8, 9, 0), doNotFake: ['nextTick', 'setImmediate'] });
    const date = localDayKey(new Date());
    const cache = { lang: 'en', native: 'uk', perDay: 3, words: [0, 1, 2].map((s) => ({ date, slot: s, word: 'w' + s })) };
    let out = null;
    function Probe() {
      out = useWodSlots({ wod: cache, hours: [10, 16, 21], words: [], ui: 'uk' });
      return null;
    }
    let tree;
    act(() => {
      tree = create(<Probe />);
    });
    expect(out.list).toHaveLength(1);
    // телефон спав до вечора: таймери не йшли, а годинник — так
    jest.setSystemTime(new Date(2026, 9, 8, 21, 5));
    act(() => listeners.forEach((fn) => fn('active')));
    expect(out.list.map((w) => w.slot)).toEqual([0, 1, 2]);
    expect(out.next).toBeNull();
    act(() => tree.unmount());
  });
});

// ---------- «Навчання» в Pro: картка бере слоти з App сама ----------
// Між App і карткою стоїть екран «Навчання», який про слоти не знає: App
// кладе їх у спільне сховище (useWodSlots), картка читає звідти.
describe('the Learn tab with several words a day (App → card)', () => {
  const Linking = require('react-native').Linking;
  afterEach(() => jest.useRealTimers());

  // 15:30 — слова 10:00 і 15:00 уже відкриті, 21:00 — ще ні
  async function learn({ pro = true } = {}) {
    jest.useFakeTimers({ now: new Date(2026, 9, 8, 15, 30), advanceTimers: true, doNotFake: ['nextTick', 'setImmediate'] });
    server();
    await returning({ pro, settings: { wodHour: 10, wodPerDay: 3, wodHours: [10, 15, 21] } });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    return tree;
  }
  const card = (tree) => one(tree, WordOfDayCard);
  const cardText = (tree) => card(tree).findAll((n) => n.type === Text).map(flat);
  const dots = (tree) => card(tree).findAll((n) => typeof n.type === 'string' && n.props.testID === 'wod-slots');

  test('dots, the newest open word and the next one locked at its hour', async () => {
    const tree = await learn();
    expect(dots(tree)).toHaveLength(1);
    expect(cardText(tree)).toEqual(expect.arrayContaining(['w0-0', 'w0-1', uk('widgetSlot', { i: 2, n: 3 }), uk('wodNextLocked', { t: '21:00' })]));
    expect(cardText(tree)).not.toContain('w0-2');
  });

  test('“Save” on a later word saves that word; a widget tap with a slot opens that slot', async () => {
    const tree = await learn();
    await run(() =>
      card(tree)
        .findAll((n) => n.props.onPress && n.type !== Text && allTextOf(n).includes(uk('saveWord')))
        .at(-1)
        .props.onPress()
    );
    expect((await stored('ll_words_v1')).map((w) => w.word)).toEqual(['w0-1']);
    expect(cardText(tree)).toContain(uk('saved'));

    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await run(() => onUrl({ url: `lingualens://word-of-day?date=${localDayKey()}&slot=0&from=widget&w=wod&f=systemLarge` }));
    expect(cardText(tree)).toContain(uk('widgetSlot', { i: 1, n: 3 }));
  });

  test('“I know it” on a later word: remembered, counts towards the level offer and today’s streak, a new word comes', async () => {
    const tree = await learn();
    const before = wodPosts().length;
    await run(() =>
      card(tree)
        .findAll((n) => n.props.onPress && n.props.accessibilityLabel === uk('wodKnowA11y'))
        .at(-1)
        .props.onPress()
    );
    await settle(5);
    const st = await stored('ll_settings_v1');
    expect(st.knownWords).toContain('w0-1');
    expect(st.knowStreak).toBe(1);
    expect(Object.values(await stored('ll_activity_v1'))).toEqual([1]);
    expect(wodPosts().length).toBeGreaterThan(before);
    expect(wodPosts().at(-1).body).toMatchObject({ perDay: 3, known: expect.arrayContaining(['w0-1']) });
  });

  test('a tap on the notification of a word opens that word on the card', async () => {
    // тап приходить подією нативного модуля, як на телефоні
    const { LegacyEventEmitter } = require('expo-modules-core');
    const native = require('expo-notifications/build/NotificationsEmitterModule').default;
    const { DEFAULT_ACTION_IDENTIFIER } = require('expo-notifications');
    const tree = await learn();
    await openTab(tree, 'settings');
    const date = localDayKey();
    await run(() =>
      new LegacyEventEmitter(native).emit('onDidReceiveNotificationResponse', {
        actionIdentifier: DEFAULT_ACTION_IDENTIFIER,
        notification: {
          date: Date.now(),
          request: { identifier: `wod-${date}`, content: { title: 'w0-0', data: { type: 'word-of-day', date, slot: 0 } }, trigger: null },
        },
      })
    );
    expect(card(tree)).not.toBeNull();
    expect(cardText(tree)).toContain(uk('widgetSlot', { i: 1, n: 3 }));
  });

  test('without Pro the same settings give the card of one word', async () => {
    const tree = await learn({ pro: false });
    expect(dots(tree)).toHaveLength(0);
    expect(cardText(tree)).toContain('w0-0');
  });

  test('the shared slots are gone once the app unmounts', async () => {
    const tree = await learn();
    expect(dots(tree)).toHaveLength(1);
    await act(async () => mounted.unmount());
    mounted = null;
    const alone = await renderCard({ word: W(0, 'harbour') });
    expect(alone.root.findAll((n) => n.props.testID === 'wod-slots')).toHaveLength(0);
    await act(async () => alone.unmount());
  });
});
