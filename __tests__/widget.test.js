// Віджет «Слово дня»: таймлайн із кешу, тиха поведінка без нативної частини,
// тап по віджету й сама розмітка, виконана так, як її виконує розширення.
import { Linking } from 'react-native';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { buildWordTimeline, isWidgetLink, subscribeToWidgetTaps } from '../src/widgets';

const en = makeT('en');
const uk = makeT('uk');

// 1 жовтня 2026, 15:30 за місцевим часом
const NOW = new Date(2026, 9, 1, 15, 30);
const key = (d) => localDayKey(new Date(2026, 9, d));
const midnight = (d) => new Date(2026, 9, d).getTime();
const day = (d, word, extra = {}) => ({
  date: key(d),
  word,
  ipa: 'ɪ',
  translation: word + '-tr',
  example: `A ${word} here.`,
  example_translation: 'Приклад.',
  ...extra,
});
const cache = (words, lang = 'en', native = 'uk') => ({ lang, native, words, fetchedAt: NOW.getTime() });
const opts = (extra = {}) => ({ t: uk, targetLang: 'en', nativeLang: 'uk', now: NOW, ...extra });
const summary = (entries) => entries.map((e) => [e.date.getTime(), e.props.state, e.props.word]);

describe('buildWordTimeline', () => {
  test('today starts now, every next day at local midnight, then “open the app” after the last day', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse'), day(2, 'harbour'), day(3, 'anchor')]), opts());
    expect(summary(entries)).toEqual([
      [NOW.getTime(), 'word', 'lighthouse'],
      [midnight(2), 'word', 'harbour'],
      [midnight(3), 'word', 'anchor'],
      [midnight(4), 'empty', ''],
    ]);
    for (const e of entries.slice(1)) {
      expect([e.date.getHours(), e.date.getMinutes(), e.date.getSeconds()]).toEqual([0, 0, 0]);
    }
  });

  test('entries come out in date order whatever the cache order; past days, duplicates and junk are dropped', () => {
    const words = [
      day(3, 'anchor'),
      day(30, 'yesterday', { date: '2026-09-30' }),
      day(1, 'lighthouse'),
      day(2, 'harbour'),
      day(2, 'duplicate'),
      day(4, '   '),
      { date: '2026-10-32', word: 'no such day' },
      { date: 'soon', word: 'not a day' },
      null,
    ];
    const entries = buildWordTimeline(cache(words), opts());
    expect(summary(entries)).toEqual([
      [NOW.getTime(), 'word', 'lighthouse'],
      [midnight(2), 'word', 'harbour'],
      [midnight(3), 'word', 'anchor'],
      [midnight(4), 'empty', ''],
    ]);
    const dates = entries.map((e) => e.date.getTime());
    expect([...dates].sort((a, b) => a - b)).toEqual(dates);
  });

  test('a hole in the cache shows “open the app” for that day instead of yesterday’s word', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse'), day(3, 'anchor')]), opts());
    expect(summary(entries)).toEqual([
      [NOW.getTime(), 'word', 'lighthouse'],
      [midnight(2), 'empty', ''],
      [midnight(3), 'word', 'anchor'],
      [midnight(4), 'empty', ''],
    ]);
  });

  test('no word for today yet: “open the app” now, the first cached word from its midnight', () => {
    const entries = buildWordTimeline(cache([day(2, 'harbour')]), opts());
    expect(summary(entries)).toEqual([
      [NOW.getTime(), 'empty', ''],
      [midnight(2), 'word', 'harbour'],
      [midnight(3), 'empty', ''],
    ]);
  });

  test('a cache for another language pair is ignored, like on the Learn tab', () => {
    const words = [day(1, 'la pomme'), day(2, 'la poire')];
    for (const c of [cache(words, 'fr', 'uk'), cache(words, 'en', 'de'), null, { lang: 'en', native: 'uk' }]) {
      expect(summary(buildWordTimeline(c, opts()))).toEqual([[NOW.getTime(), 'empty', '']]);
    }
  });

  test('a cache that ran out shows only “open the app”', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse')]), opts({ now: new Date(2026, 9, 5, 9) }));
    expect(entries).toHaveLength(1);
    expect(entries[0].props).toMatchObject({ state: 'empty', message: uk('widgetEmpty'), line: uk('widgetEmptyShort') });
  });

  test('labels are localized; the example is quoted the way the language quotes', () => {
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse')]), opts());
    expect(first.props).toMatchObject({
      title: 'Слово дня',
      caption: 'English · слово дня',
      ipa: '/ɪ/',
      translation: 'lighthouse-tr',
      example: '“A lighthouse here.”',
      line: 'lighthouse — lighthouse-tr',
      a11y: 'Слово дня, lighthouse, lighthouse-tr',
    });
    const [de] = buildWordTimeline(cache([day(1, 'die Tasse', { example: 'Die Tasse ist voll.' })], 'de', 'en'), {
      ...opts({ t: en }),
      targetLang: 'de',
      nativeLang: 'en',
    });
    expect(de.props).toMatchObject({ caption: 'Deutsch · word of the day', example: '„Die Tasse ist voll.“' });
  });

  test('a personal word names its topic in the caption and for VoiceOver; a general word does not', () => {
    const entries = buildWordTimeline(
      cache([day(1, 'liquidity', { topic: 'finance' }), day(2, 'harbour', { topic: 'general' }), day(3, 'anchor', { topic: 'nope' })]),
      opts()
    );
    expect(entries[0].props).toMatchObject({
      caption: 'English · Фінанси',
      topic: 'Фінанси',
      a11y: 'Слово дня, Фінанси, liquidity, liquidity-tr',
    });
    for (const e of entries.slice(1, 3)) expect(e.props).toMatchObject({ caption: 'English · слово дня', topic: '' });
    expect(entries.at(-1).props.topic).toBe(''); // «відкрий застосунок» — той самий набір ключів
  });

  test('a long example is cut at a word boundary inside the quotes', () => {
    const long = 'The old lighthouse at the end of the harbour has guided fishing boats home through storms for more than a century.';
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse', { example: long })]), opts());
    expect(first.props.example).toMatch(/^“The old lighthouse .*\w…”$/);
    expect(first.props.example.length).toBeLessThan(long.length);
  });

  test('props are plain strings with one key set for both states (WidgetKit keeps them in UserDefaults)', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse', { ipa: undefined, translation: null, example: 7 })]), opts());
    const keys = Object.keys(entries[0].props).sort();
    for (const { props } of entries) {
      expect(Object.keys(props).sort()).toEqual(keys);
      for (const v of Object.values(props)) expect(typeof v).toBe('string');
    }
    expect(entries[0].props).toMatchObject({ word: 'lighthouse', ipa: '', translation: '', example: '', line: 'lighthouse' });
  });
});

describe('updateWordWidget', () => {
  const { createWidget } = require('expo-widgets');
  const c = cache([day(1, 'lighthouse')]);
  // Свіжа копія src/widgets на кожен тест: модуль памʼятає, чи є віджети.
  // Лінивий require усередині теж має йти в ізольований реєстр — тому
  // викликаємо все всередині isolateModules.
  const isolated = (fn, os = 'ios') => {
    let out;
    jest.isolateModules(() => {
      require('react-native').Platform.OS = os;
      out = fn(require('../src/widgets'));
    });
    return out;
  };
  beforeEach(() => createWidget.mockClear());

  test('registers the WordOfDay layout once and hands WidgetKit the timeline', () => {
    expect(isolated((w) => [w.updateWordWidget(c, opts()), w.updateWordWidget(c, opts())])).toEqual([true, true]);
    expect(createWidget).toHaveBeenCalledTimes(1);
    const [name, layout] = createWidget.mock.calls[0];
    expect(name).toBe('WordOfDay');
    // babel-плагін expo-widgets уже перетворив функцію на рядок
    expect(typeof layout).toBe('string');
    const instance = createWidget.mock.results[0].value;
    expect(instance.updateTimeline).toHaveBeenCalledTimes(2);
    expect(instance.updateTimeline.mock.calls[0][0]).toEqual(buildWordTimeline(c, opts()));
  });

  // Підказка «додай віджет» на вкладці навчання — лише там, де він є
  test('widgetsAvailable: an iOS build with the native part only', () => {
    expect(isolated((w) => w.widgetsAvailable())).toBe(true);
    expect(isolated((w) => w.widgetsAvailable(), 'android')).toBe(false);
    createWidget.mockImplementationOnce(() => {
      throw new Error("Cannot find native module 'ExpoWidgets'");
    });
    expect(isolated((w) => w.widgetsAvailable())).toBe(false);
  });

  // В Expo Go модуля ExpoWidgets немає, а лінивий require Metro не віддає в
  // наш catch: помилка йде в reportFatalError — червоний екран на старті.
  // Тож у Expo Go модуль віджета навіть не підтягуємо.
  test('Expo Go: no widgets and the widget module is never required', () => {
    let loaded = false;
    jest.isolateModules(() => {
      jest.doMock('../src/widgets/WordOfDayWidget', () => {
        loaded = true;
        throw new Error("Cannot find native module 'ExpoWidgets'");
      });
      require('expo-constants').default.executionEnvironment = 'storeClient';
      require('react-native').Platform.OS = 'ios';
      const w = require('../src/widgets');
      expect(w.widgetsAvailable()).toBe(false);
      expect(w.updateWordWidget(c, opts())).toBe(false);
    });
    jest.dontMock('../src/widgets/WordOfDayWidget');
    expect(loaded).toBe(false);
    expect(createWidget).not.toHaveBeenCalled();
  });

  test('does nothing on Android', () => {
    expect(isolated((w) => w.updateWordWidget(c, opts()), 'android')).toBe(false);
    expect(createWidget).not.toHaveBeenCalled();
  });

  test('does nothing, and does not throw, without the native module (Expo Go)', () => {
    // так поводиться expo-widgets без нативної частини: падає вже на імпорті
    createWidget.mockImplementationOnce(() => {
      throw new Error("Cannot find native module 'ExpoWidgets'");
    });
    expect(isolated((w) => [w.updateWordWidget(c, opts()), w.updateWordWidget(c, opts())])).toEqual([false, false]);
    // і не пробує щоразу наново
    expect(createWidget).toHaveBeenCalledTimes(1);
  });

  test('a native failure is swallowed, the app keeps going', () => {
    createWidget.mockReturnValueOnce({
      updateTimeline: jest.fn(() => {
        throw new Error('Cannot update widget timeline without a layout');
      }),
    });
    expect(isolated((w) => w.updateWordWidget(c, opts()))).toBe(false);
  });

  test('a broken translator does not break the app either', () => {
    expect(isolated((w) => w.updateWordWidget(c, { ...opts(), t: undefined }))).toBe(false);
  });
});

describe('tapping the widget', () => {
  test('only our word-of-day link counts', () => {
    expect(isWidgetLink('lingualens://word-of-day')).toBe(true);
    expect(isWidgetLink('lingualens:///word-of-day')).toBe(true);
    expect(isWidgetLink('LinguaLens://word-of-day?from=widget')).toBe(true);
    expect(isWidgetLink('lingualens://word-of-day-2')).toBe(false);
    expect(isWidgetLink('lingualens://settings')).toBe(false);
    expect(isWidgetLink('https://example.com/word-of-day')).toBe(false);
    expect(isWidgetLink('exp+lingualens://expo-development-client/?url=x')).toBe(false);
    expect(isWidgetLink(null)).toBe(false);
  });

  const flush = () => new Promise((r) => setTimeout(r, 0));

  test('a cold start from the widget and a tap while running both call back', async () => {
    Linking.getInitialURL.mockResolvedValueOnce('lingualens://word-of-day');
    const onTap = jest.fn();
    const stop = subscribeToWidgetTaps(onTap);
    await flush();
    expect(onTap).toHaveBeenCalledTimes(1);

    const listener = Linking.addEventListener.mock.calls.at(-1)[1];
    listener({ url: 'lingualens://word-of-day' });
    listener({ url: 'lingualens://other' });
    expect(onTap).toHaveBeenCalledTimes(2);

    const sub = Linking.addEventListener.mock.results.at(-1).value;
    stop();
    expect(sub.remove).toHaveBeenCalled();
  });

  test('a launch URL that arrives after unsubscribing is ignored', async () => {
    let resolve;
    Linking.getInitialURL.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    const onTap = jest.fn();
    const stop = subscribeToWidgetTaps(onTap);
    stop();
    resolve('lingualens://word-of-day');
    await flush();
    expect(onTap).not.toHaveBeenCalled();
  });

  test('a failing getInitialURL is not an error', async () => {
    Linking.getInitialURL.mockRejectedValueOnce(new Error('no activity'));
    const onTap = jest.fn();
    const stop = subscribeToWidgetTaps(onTap);
    await flush();
    expect(onTap).not.toHaveBeenCalled();
    stop();
  });
});

// Розмітку віджета виконує не застосунок, а окремий JavaScriptCore у
// розширенні: там є лише компоненти й модифікатори @expo/ui/swift-ui як
// глобальні імена плюс jsx-рантайм. Відтворюємо саме це середовище: будь-яке
// посилання на щось із області модуля впаде тут з ReferenceError.
describe('widget layout in the isolated widget runtime', () => {
  // справжній @expo/ui: jest.setup.js підміняє його для решти тестів
  const swiftUI = jest.requireActual('@expo/ui/swift-ui');
  const modifiers = jest.requireActual('@expo/ui/swift-ui/modifiers');
  const layout = (() => {
    const { createWidget } = require('expo-widgets');
    createWidget.mockClear();
    jest.isolateModules(() => require('../src/widgets/WordOfDayWidget'));
    return createWidget.mock.calls[0][1];
  })();

  // Як bundle/jsx-runtime-stub.ts: компонент-функція викликається одразу.
  const element = (type, props) => (typeof type === 'function' ? type(props) : { type, props });
  const scope = {};
  for (const name of Object.keys(swiftUI)) {
    // як у справжньому @expo/ui: Text без тексту — нічого
    scope[name] = (props) => (name === 'Text' && props.children == null ? null : { type: name, props });
  }
  Object.assign(scope, modifiers, { _jsx: element, _jsxs: element, jsx: element, jsxs: element, _jsxDEV: element });
  const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n));
  const render = new Function(...names, `"use strict"; return (${layout});`)(...names.map((n) => scope[n]));

  const env = (widgetFamily, extra = {}) => ({
    widgetFamily,
    widgetRenderingMode: widgetFamily.startsWith('accessory') ? 'vibrant' : 'fullColor',
    colorScheme: 'light',
    showsContainerBackground: widgetFamily.startsWith('system'),
    widgetContentMargins: { top: 16, bottom: 16, leading: 16, trailing: 16 },
    date: NOW,
    ...extra,
  });
  const [wordEntry] = buildWordTimeline(cache([day(1, 'lighthouse')]), opts({ t: en }));
  const [emptyEntry] = buildWordTimeline(null, opts({ t: en }));

  const nodes = (n) => (Array.isArray(n) ? n.flatMap(nodes) : n && typeof n === 'object' ? [n, ...nodes(n.props.children)] : []);
  const textsOf = (tree) => nodes(tree).filter((n) => n.type === 'Text').map((n) => n.props.children);
  const mods = (n) => Object.fromEntries((n.props.modifiers || []).map((m) => [m.$type, m]));

  test('uses only components and modifiers that exist in this @expo/ui', () => {
    for (const name of ['Text', 'VStack', 'HStack', 'Spacer', 'Image']) expect(typeof swiftUI[name]).toBe('function');
    for (const name of ['widgetURL', 'containerBackground', 'textCase', 'kerning', 'layoutPriority']) {
      expect(typeof modifiers[name]).toBe('function');
    }
  });

  test.each(['systemSmall', 'systemMedium', 'accessoryRectangular', 'accessoryInline'])(
    '%s: renders both states, opens the app and paints its container background',
    (family) => {
      for (const entry of [wordEntry, emptyEntry]) {
        const root = render(entry.props, env(family));
        expect(mods(root).widgetURL).toMatchObject({ url: 'lingualens://word-of-day' });
        expect(mods(root).containerBackground).toMatchObject({ container: 'widget' });
        expect(mods(root).accessibilityLabel.label).toBe(entry.props.a11y);
      }
    }
  );

  test('home screen: big word, IPA and translation; medium adds the example', () => {
    const small = textsOf(render(wordEntry.props, env('systemSmall')));
    expect(small).toEqual(['English · word of the day', 'lighthouse', '/ɪ/', 'lighthouse-tr']);
    const medium = textsOf(render(wordEntry.props, env('systemMedium')));
    expect(medium).toEqual(['English · word of the day', 'lighthouse', 'lighthouse-tr', '/ɪ/', '“A lighthouse here.”']);
    expect(textsOf(render(emptyEntry.props, env('systemSmall')))).toEqual(['Word of the day', 'Open LinguaLens for new words']);
  });

  test('lock screen: word and translation, or a single inline line', () => {
    expect(textsOf(render(wordEntry.props, env('accessoryRectangular')))).toEqual(['lighthouse', 'lighthouse-tr']);
    expect(textsOf(render(wordEntry.props, env('accessoryInline')))).toEqual(['lighthouse — lighthouse-tr']);
    expect(textsOf(render(emptyEntry.props, env('accessoryInline')))).toEqual(['Open LinguaLens']);
  });

  test('colours follow the colour scheme; tinted modes get hierarchy instead of our colours', () => {
    const bg = (e) => mods(render(wordEntry.props, env('systemSmall', e))).containerBackground.style.color;
    expect(bg({ colorScheme: 'light' })).toBe('#FAF8F4');
    expect(bg({ colorScheme: 'dark' })).toBe('#151412');
    const styles = (e) =>
      nodes(render(wordEntry.props, env('systemSmall', e)))
        .filter((n) => n.type === 'Text')
        .map((n) => mods(n).foregroundStyle.style);
    // [підпис, слово, транскрипція, переклад]
    expect(styles({ colorScheme: 'light' })[1]).toEqual({ type: 'color', color: '#1F1B16' });
    expect(styles({ colorScheme: 'dark' })[1]).toEqual({ type: 'color', color: '#F5F1EA' });
    // StandBy: підкладки немає, віджет на чорному — світлий текст
    expect(styles({ showsContainerBackground: false })[1]).toEqual({ type: 'color', color: '#F5F1EA' });
    for (const mode of ['accented', 'vibrant']) {
      for (const s of styles({ widgetRenderingMode: mode })) expect(s.type).toBe('hierarchical');
    }
  });

  test('iOS 16 has no content margins: the widget pads and paints itself', () => {
    const { widgetContentMargins, ...legacy } = env('systemSmall');
    expect(mods(render(wordEntry.props, legacy))).toMatchObject({ padding: { all: 16 }, background: expect.anything() });
    expect(mods(render(wordEntry.props, env('systemSmall'))).padding).toBeUndefined();
  });

  test('the WidgetKit placeholder (no props yet) still renders', () => {
    const root = render({}, env('systemSmall'));
    expect(textsOf(root)).toEqual(['LinguaLens']);
  });
});
