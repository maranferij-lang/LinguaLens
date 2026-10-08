// Посилання з віджетів і сповіщень у застосунок (src/widgets/links.js) і куди
// їх веде App: слово дня (зі слотом) — «Навчання», слово — його аркуш у
// «Словах», «Повторити» — картки, серія — Профіль.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { isWidgetLink, parseWidgetLink, widgetLink } from '../src/widgets/links';

describe('parseWidgetLink', () => {
  test('every route with its parameters', () => {
    expect(parseWidgetLink('lingualens://word-of-day?date=2026-10-08&slot=2&from=widget&w=wod&f=systemLarge')).toEqual({
      route: 'word-of-day',
      id: null,
      date: '2026-10-08',
      slot: 2,
      kind: 'wod',
      family: 'systemLarge',
      from: 'widget',
    });
    expect(parseWidgetLink('lingualens://word/k3x9%2Fa?from=widget&w=words&f=systemSmall')).toEqual({
      route: 'word',
      id: 'k3x9/a',
      date: null,
      slot: null,
      kind: 'words',
      family: 'systemSmall',
      from: 'widget',
    });
    expect(parseWidgetLink('lingualens://learn?from=widget&w=words')).toMatchObject({ route: 'learn', kind: 'words' });
    expect(parseWidgetLink('lingualens://streak?from=widget&w=streak&f=accessoryCircular')).toMatchObject({
      route: 'streak',
      family: 'accessoryCircular',
    });
    // старий віджет (v1.2) — без параметрів
    expect(parseWidgetLink('lingualens://word-of-day')).toEqual({
      route: 'word-of-day',
      id: null,
      date: null,
      slot: null,
      kind: '',
      family: '',
      from: '',
    });
  });

  test('scheme case, an extra slash and junk parameters', () => {
    expect(parseWidgetLink('LinguaLens://Word-Of-Day')).toMatchObject({ route: 'word-of-day' });
    expect(parseWidgetLink('lingualens:///learn')).toMatchObject({ route: 'learn' });
    expect(parseWidgetLink('lingualens://word-of-day?date=2026-13-99x&slot=12&w=evil&f=huge')).toMatchObject({
      date: null,
      slot: null,
      kind: '',
      family: '',
    });
    // слот — лише для слова дня; дата — теж
    expect(parseWidgetLink('lingualens://learn?slot=1&date=2026-10-08')).toMatchObject({ slot: null, date: null });
  });

  test('foreign links, the dev client and broken input give null', () => {
    for (const url of [
      'exp+lingualens://expo-development-client/?url=http%3A%2F%2F192.168.0.2%3A8081',
      'https://example.com/word-of-day',
      'lingualens://settings',
      'lingualens://word-of-day-2',
      'lingualens://word',
      'lingualens://word/',
      'lingualens://streak/extra',
      'mylinguallens://learn',
      '',
      null,
      undefined,
      42,
    ]) {
      expect([url, parseWidgetLink(url)]).toEqual([url, null]);
      expect(isWidgetLink(url)).toBe(false);
    }
  });

  test('widgetLink builds what parseWidgetLink reads back', () => {
    expect(widgetLink('word', { id: 'a b/c' }, 'words')).toBe('lingualens://word/a%20b%2Fc?from=widget&w=words');
    expect(parseWidgetLink(widgetLink('word', { id: 'a b/c' }, 'words'))).toMatchObject({ route: 'word', id: 'a b/c' });
    expect(parseWidgetLink(widgetLink('word-of-day', { date: '2026-10-08', slot: 0 }, 'wod'))).toMatchObject({ slot: 0, date: '2026-10-08' });
    expect(widgetLink('learn', {}, 'words')).toBe('lingualens://learn?from=widget&w=words');
  });
});

// ---------- App: куди веде тап ----------
jest.setTimeout(20000);
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

describe('App routes widget taps', () => {
  const App = require('../App').default;
  const FlashcardsScreen = require('../src/FlashcardsScreen').default;
  const DictionaryScreen = require('../src/DictionaryScreen').default;
  const ProfileScreen = require('../src/ProfileScreen').default;
  const WordSheet = require('../src/WordSheet').default;
  // аркуш слова, який відкрила вкладка «Слова» (openWordId → WordSheet)
  const sheetWord = (tree) => tree.root.findAllByType(WordSheet).find((n) => n.props.item)?.props.item.word || null;
  const analytics = require('../src/analytics');

  let mounted = null;
  beforeEach(async () => {
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
    await AsyncStorage.setItem(
      'll_words_v1',
      JSON.stringify([{ id: 'w7', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } }])
    );
  });
  afterEach(async () => {
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
  const tap = async (url) => {
    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await act(async () => onUrl({ url }));
    await act(() => new Promise((r) => setTimeout(r, 20)));
  };

  test('a word opens the Words tab with that word’s sheet; Review — cards; the streak — Profile', async () => {
    const track = jest.spyOn(analytics, 'track');
    const tree = await renderApp();
    await tap('lingualens://word/w7?from=widget&w=words&f=systemLarge');
    expect(one(tree, DictionaryScreen)).not.toBeNull();
    expect(sheetWord(tree)).toBe('la taza');
    expect(track).toHaveBeenCalledWith('widget_open', { kind: 'words', family: 'systemLarge', route: 'word' });

    await tap('lingualens://learn?from=widget&w=words&f=systemLarge');
    expect(one(tree, FlashcardsScreen)).not.toBeNull();

    await tap('lingualens://streak?from=widget&w=streak&f=systemSmall');
    expect(one(tree, ProfileScreen)).not.toBeNull();
    expect(track).toHaveBeenCalledWith('widget_open', { kind: 'streak', family: 'systemSmall', route: 'streak' });

    // чуже посилання нічого не робить
    await tap('exp+lingualens://expo-development-client/?url=x');
    expect(one(tree, ProfileScreen)).not.toBeNull();
    track.mockRestore();
  });

  test('a cold start from a word in the widget lands on that word', async () => {
    Linking.getInitialURL.mockResolvedValueOnce('lingualens://word/w7?from=widget&w=words&f=systemSmall');
    const tree = await renderApp();
    expect(one(tree, DictionaryScreen)).not.toBeNull();
    expect(sheetWord(tree)).toBe('la taza');
  });
});
