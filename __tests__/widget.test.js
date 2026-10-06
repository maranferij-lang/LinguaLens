// Віджет «Слово дня»: таймлайн із кешу (і слоти Pro), тиха поведінка без
// нативної частини, тап по віджету. Розмітку всіх трьох віджетів у
// «рантаймі віджета» перевіряє __tests__/widgetLayouts.test.js.
import { Linking } from 'react-native';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { buildWordTimeline, isWidgetLink, subscribeToWidgetTaps } from '../src/widgets';
import { widgetPalette } from '../src/widgets/palette';
import { FAST_CLOCK } from '../src/widgets/clock';
import { setChosenVariants } from '../src/langVariants';

const en = makeT('en');
const uk = makeT('uk');

// 1 жовтня 2026, 15:30 за місцевим часом
const NOW = new Date(2026, 9, 1, 15, 30);
const key = (d) => localDayKey(new Date(2026, 9, d));
const midnight = (d) => new Date(2026, 9, d).getTime();
const at = (d, h, m = 0) => new Date(2026, 9, d, h, m).getTime();
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
const opts = (extra = {}) => ({ t: uk, ui: 'uk', targetLang: 'en', nativeLang: 'uk', now: NOW, ...extra });
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

  // Англійську США змінили на Британії, а нового кешу ще немає (офлайн):
  // американське слово не видає себе за британське
  test('a cache for another variant of the language is ignored too; a cache from before variants fits the default one', () => {
    const empty = [[NOW.getTime(), 'empty', '']];
    const first = (c, o) => summary(buildWordTimeline(c, opts(o)))[0];
    const us = { ...cache([day(1, 'apartment')]), variant: 'us' };
    expect(summary(buildWordTimeline(us, opts({ variant: 'gb' })))).toEqual(empty);
    expect(first(us, { variant: 'us' })).toEqual([NOW.getTime(), 'word', 'apartment']);
    const old = cache([day(1, 'apartment')]);
    expect(first(old, { variant: 'us' })).toEqual([NOW.getTime(), 'word', 'apartment']);
    expect(summary(buildWordTimeline(old, opts({ variant: 'gb' })))).toEqual(empty);
    // варіант «моєї мови» теж
    const es = { lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'us', words: [day(1, 'el departamento')] };
    const pair = { targetLang: 'es', nativeLang: 'en', variant: 'latam' };
    expect(first(es, { ...pair, nativeVariant: 'us' })).toEqual([NOW.getTime(), 'word', 'el departamento']);
    expect(summary(buildWordTimeline(es, opts({ ...pair, nativeVariant: 'gb' })))).toEqual(empty);
    // без явного варіанта — обраний у застосунку (той, що бачать прапорці)
    setChosenVariants({ en: 'gb' });
    try {
      expect(summary(buildWordTimeline(us, opts()))).toEqual(empty);
    } finally {
      setChosenVariants({});
    }
    expect(first(us, {})).toEqual([NOW.getTime(), 'word', 'apartment']);
  });

  test('a cache that ran out shows only “open the app”', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse')]), opts({ now: new Date(2026, 9, 5, 9) }));
    expect(entries).toHaveLength(1);
    expect(entries[0].props).toMatchObject({ state: 'empty', message: uk('widgetEmpty'), line: uk('widgetEmptyShort') });
  });

  test('labels are localized; the example is quoted the way the language quotes, with the word in bold', () => {
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse')]), opts());
    expect(first.props).toMatchObject({
      title: 'Слово дня',
      caption: 'English · слово дня',
      ipa: '/ɪ/',
      translation: 'lighthouse-tr',
      example: '“A **lighthouse** here.”',
      md: '1',
      exampleTr: 'Приклад.',
      sentenceTitle: 'У реченні',
      line: 'lighthouse · lighthouse-tr',
      a11y: 'Слово дня, lighthouse, lighthouse-tr',
      a11yShort: 'Слово дня, lighthouse',
      revealShort: 'Переклад',
      revealLong: 'Показати переклад',
      date: 'чт, 1 жовт.',
    });
    const [de] = buildWordTimeline(cache([day(1, 'die Tasse', { example: 'Die Tasse ist voll.' })], 'de', 'en'), {
      ...opts({ t: en, ui: 'en' }),
      targetLang: 'de',
      nativeLang: 'en',
    });
    expect(de.props).toMatchObject({ caption: 'Deutsch · word of the day', example: '„**Die Tasse** ist voll.“' });
  });

  test('the word is bold only as a whole word, any case; markdown characters are escaped', () => {
    const one = (word, example) => buildWordTimeline(cache([day(1, word, { example })]), opts())[0].props;
    expect(one('light', 'Lighthouses need LIGHT.').example).toBe('“Lighthouses need **LIGHT**.”');
    expect(one('tide', 'No match in this one.').example).toBe('“No match in this one.”');
    expect(one('star', 'A *star* is _born_ [here] `now`.').example).toBe('“A \\***star**\\* is \\_born\\_ \\[here\\] \\`now\\`.”');
    expect(one('fish', 'Café — fish, рибка.').example).toBe('“Café — **fish**, рибка.”');
    // «%» SwiftUI може прочитати як формат — тоді звичайний текст
    expect(one('sale', '50% sale today.')).toMatchObject({ example: '“50% sale today.”', md: '' });
    // markdown вимкнено (прапорець WIDGET_MARKDOWN) — звичайний текст
    const off = buildWordTimeline(cache([day(1, 'lighthouse')]), opts({ markdown: false }))[0].props;
    expect(off).toMatchObject({ example: '“A lighthouse here.”', md: '' });
  });

  test('a long example is cut at a word boundary inside the quotes', () => {
    const long = 'The old lighthouse at the end of the harbour has guided fishing boats home through storms for more than a century.';
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse', { example: long })]), opts());
    expect(first.props.example).toMatch(/^“The old \*\*lighthouse\*\* .*\w…”$/);
    expect(first.props.example.length).toBeLessThan(long.length);
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
    expect(entries.at(-1).props.topic).toBe('');
  });

  test('“This week” on the large widget: up to three earlier days, newest first, from the past days kept in the cache', () => {
    const words = [27, 28, 29, 30].map((d) => day(1, 'w' + d, { date: localDayKey(new Date(2026, 8, d)) }));
    const entries = buildWordTimeline(cache([...words, day(1, 'lighthouse'), day(2, 'harbour')]), opts());
    expect(entries[0].props.listTitle).toBe('Цього тижня');
    expect(entries[0].props.list).toEqual([
      { w: 'w30', t: 'w30-tr', time: '', cur: '', lock: '' },
      { w: 'w29', t: 'w29-tr', time: '', cur: '', lock: '' },
      { w: 'w28', t: 'w28-tr', time: '', cur: '', lock: '' },
    ]);
    // завтра «тиждень» — уже й сьогоднішнє слово
    expect(entries[1].props.list.map((r) => r.w)).toEqual(['lighthouse', 'w30', 'w29']);
    // кешу без минулого — розділу немає
    const fresh = buildWordTimeline(cache([day(1, 'lighthouse')]), opts())[0].props;
    expect(fresh).toMatchObject({ listTitle: '', list: [] });
  });

  test('the link opens this day and slot; links carry the widget kind', () => {
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse')]), opts());
    expect(first.props.link).toBe(`lingualens://word-of-day?date=${key(1)}&slot=0&from=widget&w=wod`);
    expect(first.props.key).toBe(`wod|${key(1)}|0`);
    const [empty] = buildWordTimeline(null, opts());
    expect(empty.props.link).toBe('lingualens://word-of-day?from=widget&w=wod');
  });

  test('hide and palette go into every entry; revealed starts empty (the widget sets it)', () => {
    const pal = widgetPalette('dark');
    const entries = buildWordTimeline(cache([day(1, 'lighthouse'), day(2, 'harbour')]), opts({ hide: true, pal }));
    for (const e of entries) expect(e.props).toMatchObject({ hide: '1', revealed: '', pal, kind: 'wod', v: '2' });
    expect(buildWordTimeline(cache([day(1, 'lighthouse')]), opts())[0].props.hide).toBe('');
  });
});

// ── Pro: кілька слів на день ──
describe('buildWordTimeline with slots (Pro)', () => {
  const slotted = (days, n) =>
    cache(days.flatMap((d) => Array.from({ length: n }, (_, s) => day(d, `w${d}-${s}`, { slot: s, topic: 'finance' }))));

  test('3 a day: today shows the latest open slot now, then each slot at its hour; next days from midnight', () => {
    const hours = [9, 14, 19];
    const entries = buildWordTimeline(slotted([1, 2], 3), opts({ hours }));
    expect(summary(entries)).toEqual([
      [NOW.getTime(), 'word', 'w1-1'],
      [at(1, 19), 'word', 'w1-2'],
      [midnight(2), 'word', 'w2-0'],
      [at(2, 14), 'word', 'w2-1'],
      [at(2, 19), 'word', 'w2-2'],
      [midnight(3), 'empty', ''],
    ]);
    expect(entries.map((e) => e.props.key)).toEqual([
      `wod|${key(1)}|1`,
      `wod|${key(1)}|2`,
      `wod|${key(2)}|0`,
      `wod|${key(2)}|1`,
      `wod|${key(2)}|2`,
      `wod|empty|${key(3)}`,
    ]);
  });

  test('the large widget lists today’s words with the current one marked and the next one locked', () => {
    const entries = buildWordTimeline(slotted([1], 3), opts({ hours: [9, 14, 19] }));
    expect(entries[0].props).toMatchObject({
      slotLabel: '2 з 3',
      slotN: '3',
      slotI: '2',
      next: 'Наступне слово о 19:00',
      listTitle: 'Сьогодні',
      list: [
        { w: 'w1-0', t: 'w1-0-tr', time: '09:00', cur: '', lock: '' },
        { w: 'w1-1', t: 'w1-1-tr', time: '14:00', cur: '1', lock: '' },
        { w: '', t: 'Наступне слово о 19:00', time: '19:00', cur: '', lock: '1' },
      ],
      link: `lingualens://word-of-day?date=${key(1)}&slot=1&from=widget&w=wod`,
    });
    // останнє слово дня — без «наступного»
    expect(entries[1].props).toMatchObject({ slotI: '3', next: '' });
    expect(entries[1].props.list.every((r) => r.lock === '')).toBe(true);
  });

  test('5 a day keeps at most four rows, the current and the next always among them', () => {
    const entries = buildWordTimeline(slotted([1], 5), opts({ hours: [8, 10, 12, 16, 20], now: new Date(2026, 9, 1, 17) }));
    const rows = entries[0].props.list;
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.cur === '1').w).toBe('w1-3');
    expect(rows.at(-1)).toMatchObject({ lock: '1', time: '20:00' });
  });

  test('slots beyond the hours (Pro ended) are not shown; a cache without slots is one word a day', () => {
    expect(summary(buildWordTimeline(slotted([1, 2], 3), opts({ hours: [9] })))).toEqual([
      [NOW.getTime(), 'word', 'w1-0'],
      [midnight(2), 'word', 'w2-0'],
      [midnight(3), 'empty', ''],
    ]);
    const plain = buildWordTimeline(cache([day(1, 'lighthouse'), day(2, 'harbour')]), opts({ hours: [9, 14, 19] }));
    expect(plain.map((e) => e.props.slotN)).toEqual(['', '', '']);
  });

  test('fast clock (development): today’s slots open in 2 and 4 minutes', () => {
    const entries = buildWordTimeline(slotted([1], 3), opts({ hours: [9, 14, 19], now: new Date(2026, 9, 1, 7), clock: FAST_CLOCK }));
    expect(entries.slice(0, 3).map((e) => e.date.getTime() - new Date(2026, 9, 1, 7).getTime())).toEqual([0, 120000, 240000]);
  });

  test('the worst case stays small: 3 a day for 14 days, long words — ≤ 85 entries and ≤ 120 KB', () => {
    const long = 'x'.repeat(40);
    const words = [];
    for (let d = 0; d < 14; d++) {
      for (let s = 0; s < 3; s++) {
        const date = localDayKey(new Date(2026, 9, 1 + d));
        words.push({
          date,
          slot: s,
          word: 'word' + long,
          ipa: 'ipa' + long,
          translation: 'переклад' + long,
          example: ('A word' + long + ' in a sentence ').repeat(4),
          example_translation: 'Речення '.repeat(20),
          topic: 'finance',
        });
      }
    }
    const entries = buildWordTimeline(cache(words), opts({ hours: [9, 14, 19], pal: widgetPalette('ocean-dark'), now: new Date(2026, 9, 1, 0, 5) }));
    expect(entries.length).toBeLessThanOrEqual(85);
    expect(JSON.stringify(entries).length).toBeLessThanOrEqual(120000);
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

  test('registers the WordOfDay layout once and hands WidgetKit the timeline', async () => {
    expect(await isolated((w) => Promise.all([w.updateWordWidget(c, opts()), w.updateWordWidget(c, opts())]))).toEqual([true, true]);
    expect(createWidget).toHaveBeenCalledTimes(1);
    const [name, layout] = createWidget.mock.calls[0];
    expect(name).toBe('WordOfDay');
    // babel-плагін expo-widgets уже перетворив функцію на рядок
    expect(typeof layout).toBe('string');
    const instance = createWidget.mock.results[0].value;
    expect(instance.updateTimeline).toHaveBeenCalledTimes(2);
    expect(instance.updateTimeline.mock.calls[0][0]).toEqual(buildWordTimeline(c, opts()));
  });

  test('a translation revealed in the widget survives the app rewriting the timeline', async () => {
    const widgets = require('expo-widgets');
    await isolated(async (w) => {
      await w.updateWordWidget(c, opts({ hide: true }));
      widgets.__interact('WordOfDay', 0, { revealed: '1' });
      await w.updateWordWidget(c, opts({ hide: true, t: en }));
    });
    expect(widgets.__timeline('WordOfDay')[0].props).toMatchObject({ revealed: '1', revealShort: 'Translation' });
    // наступного дня слово інше — знову приховане
    await isolated((w) => w.updateWordWidget(cache([day(2, 'harbour')]), opts({ hide: true, now: new Date(2026, 9, 2, 8) })));
    expect(widgets.__timeline('WordOfDay')[0].props).toMatchObject({ word: 'harbour', revealed: '' });
  });

  // Підказка «додай віджет» на вкладці навчання — лише там, де він є
  test('widgetsAvailable: an iOS build with the native part only', () => {
    expect(isolated((w) => w.widgetsAvailable())).toBe(true);
    expect(isolated((w) => w.widgetsAvailable(), 'android')).toBe(false);
    // без нативної частини падає кожен з трьох createWidget
    for (let i = 0; i < 3; i++) {
      createWidget.mockImplementationOnce(() => {
        throw new Error("Cannot find native module 'ExpoWidgets'");
      });
    }
    expect(isolated((w) => w.widgetsAvailable())).toBe(false);
  });

  // В Expo Go модуля ExpoWidgets немає, а лінивий require Metro не віддає в
  // наш catch: помилка йде в reportFatalError — червоний екран на старті.
  // Тож у Expo Go модулі віджетів навіть не підтягуємо.
  test('Expo Go: no widgets and no widget module is ever required', async () => {
    const loaded = [];
    await new Promise((done) =>
      jest.isolateModules(() => {
        for (const m of ['WordOfDayWidget', 'MyWordsWidget', 'StreakWidget']) {
          jest.doMock('../src/widgets/' + m, () => {
            loaded.push(m);
            throw new Error("Cannot find native module 'ExpoWidgets'");
          });
        }
        require('expo-constants').default.executionEnvironment = 'storeClient';
        require('react-native').Platform.OS = 'ios';
        const w = require('../src/widgets');
        expect(w.widgetsAvailable()).toBe(false);
        Promise.all([w.updateWordWidget(c, opts()), w.updateMyWordsWidget([], { t: uk }), w.updateStreakWidget(new Set(), { t: uk })])
          .then((r) => expect(r).toEqual([false, false, false]))
          .then(done);
      })
    );
    for (const m of ['WordOfDayWidget', 'MyWordsWidget', 'StreakWidget']) jest.dontMock('../src/widgets/' + m);
    expect(loaded).toEqual([]);
    expect(createWidget).not.toHaveBeenCalled();
  });

  test('does nothing on Android', async () => {
    expect(await isolated((w) => w.updateWordWidget(c, opts()), 'android')).toBe(false);
    expect(createWidget).not.toHaveBeenCalled();
  });

  test('does nothing, and does not throw, without the native module', async () => {
    // так поводиться expo-widgets без нативної частини: падає вже на імпорті
    createWidget.mockImplementationOnce(() => {
      throw new Error("Cannot find native module 'ExpoWidgets'");
    });
    expect(await isolated((w) => Promise.all([w.updateWordWidget(c, opts()), w.updateWordWidget(c, opts())]))).toEqual([false, false]);
    // і не пробує щоразу наново
    expect(createWidget).toHaveBeenCalledTimes(1);
  });

  test('a native failure is swallowed, the app keeps going', async () => {
    createWidget.mockReturnValueOnce({
      getTimeline: jest.fn(async () => {
        throw new Error('no timeline');
      }),
      updateTimeline: jest.fn(() => {
        throw new Error('Cannot update widget timeline without a layout');
      }),
    });
    expect(await isolated((w) => w.updateWordWidget(c, opts()))).toBe(false);
  });

  test('a broken translator does not break the app either', async () => {
    expect(await isolated((w) => w.updateWordWidget(c, { ...opts(), t: undefined }))).toBe(false);
  });
});

describe('tapping the widget', () => {
  test('only our links count', () => {
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

  test('a cold start from the widget and a tap while running both call back with the parsed link', async () => {
    Linking.getInitialURL.mockResolvedValueOnce('lingualens://word-of-day?date=2026-10-01&slot=2&from=widget&w=wod&f=systemLarge');
    const onTap = jest.fn();
    const stop = subscribeToWidgetTaps(onTap);
    await flush();
    expect(onTap).toHaveBeenCalledTimes(1);
    expect(onTap.mock.calls[0][0]).toEqual({
      route: 'word-of-day',
      id: null,
      date: '2026-10-01',
      slot: 2,
      kind: 'wod',
      family: 'systemLarge',
      from: 'widget',
    });

    const listener = Linking.addEventListener.mock.calls.at(-1)[1];
    listener({ url: 'lingualens://word/abc?from=widget&w=words' });
    listener({ url: 'lingualens://other' });
    expect(onTap).toHaveBeenCalledTimes(2);
    expect(onTap.mock.calls[1][0]).toMatchObject({ route: 'word', id: 'abc', kind: 'words' });

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
