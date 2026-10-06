// Розмітка трьох віджетів, виконана так, як її виконує розширення iOS:
// рядок з createWidget у «рантаймі віджета» зі справжніми компонентами
// @expo/ui і заглушками пакета expo-widgets (test-utils/widgetRuntime.js).
// Кожен kind × розмір × стан × світла/темна/StandBy/екран блокування/
// тоновані × iOS 17 і 16 — рендериться і дотримується правил рушія.
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { buildWordTimeline } from '../src/widgets/wordTimeline';
import { buildMyWordsTimeline } from '../src/widgets/wordsTimeline';
import { buildStreakTimeline } from '../src/widgets/streakTimeline';
import { widgetPalette } from '../src/widgets/palette';

const { compile, env, nodes, mods, texts, kids, supportedTypes } = require('../test-utils/widgetRuntime');

const uk = makeT('uk');
const en = makeT('en');
const NOW = new Date(2026, 9, 8, 15, 30);
const dayKey = (d) => localDayKey(new Date(2026, 9, d));
const SUPPORTED = supportedTypes();

const WIDGETS = {
  WordOfDay: {
    path: '../src/widgets/WordOfDayWidget',
    families: ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular', 'accessoryInline'],
  },
  MyWords: {
    path: '../src/widgets/MyWordsWidget',
    families: ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular', 'accessoryInline'],
  },
  Streak: {
    path: '../src/widgets/StreakWidget',
    families: ['systemSmall', 'systemMedium', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'],
  },
};
const compiled = {};
const widget = (name) => (compiled[name] = compiled[name] || compile(WIDGETS[name].path));

// ── дані ──
const wodWords = (n) =>
  [8, 9, 10].flatMap((d) =>
    Array.from({ length: n }, (_, s) => ({
      date: dayKey(d),
      slot: s,
      word: `lighthouse${s || ''}`,
      ipa: 'ˈlaɪt.haʊs',
      translation: 'маяк' + (s || ''),
      example: `The old lighthouse${s || ''} still guides the boats home.`,
      example_translation: 'Старий маяк досі веде човни додому.',
      topic: 'travel',
    }))
  );
const past = [5, 6, 7].map((d) => ({ date: dayKey(d), slot: 0, word: 'w' + d, translation: 't' + d }));
const wodCache = (n) => ({ lang: 'en', native: 'uk', words: [...past, ...wodWords(n)] });
const words = Array.from({ length: 6 }, (_, i) => ({
  id: 'id' + i,
  word: ['mug', 'houseplant', 'keys', 'lamp', 'harbour', 'tide'][i],
  ipa: 'mʌɡ',
  translation: ['чашка', 'кімнатна рослина', 'ключі', 'лампа', 'гавань', 'приплив'][i],
  example: 'My mug is still warm.',
  exampleTranslation: 'Моя чашка ще тепла.',
  lang: 'en',
  photo: i % 2 ? 'stickers/x' + i + '.jpg' : null,
  addedAt: NOW.getTime() - (i + 2) * 86400000,
  srs: { box: i % 6, due: NOW.getTime() + (i - 3) * 3600000 },
}));
const thumbs = { id1: 'file:///group/ExpoWidgets/thumbs/id1.jpg', id3: 'file:///group/ExpoWidgets/thumbs/id3.jpg' };
const activeDays = (n, today = true) => new Set(Array.from({ length: n }, (_, i) => localDayKey(new Date(2026, 9, 8 - i - (today ? 0 : 1)))));

function samples() {
  const pal = widgetPalette('light');
  const o = { t: uk, ui: 'uk', targetLang: 'en', nativeLang: 'uk', now: NOW, pal };
  const out = { WordOfDay: [], MyWords: [], Streak: [] };
  for (const hide of [true, false]) {
    for (const n of [1, 3, 5]) {
      const hours = n === 1 ? [10] : n === 3 ? [9, 14, 19] : [8, 11, 14, 17, 20];
      out.WordOfDay.push(...buildWordTimeline(wodCache(n), { ...o, hours, hide }).slice(0, 3));
    }
    out.MyWords.push(...buildMyWordsTimeline(words, { ...o, hide, thumbs }).slice(0, 2));
  }
  out.WordOfDay.push(...buildWordTimeline(null, o));
  out.MyWords.push(...buildMyWordsTimeline([], o));
  // усі стани серії: done, pending, вечір, late, lost, none — і стадії 0–4
  for (const n of [1, 3, 7, 31]) out.Streak.push(...buildStreakTimeline(activeDays(n), { t: uk, now: NOW, pal }));
  out.Streak.push(...buildStreakTimeline(activeDays(4, false), { t: uk, now: new Date(2026, 9, 8, 20), pal }));
  out.Streak.push(...buildStreakTimeline(new Set(), { t: uk, now: NOW, pal }));
  return out;
}
const SAMPLES = samples();

const MODES = [
  { name: 'light', env: { colorScheme: 'light' } },
  { name: 'dark', env: { colorScheme: 'dark' } },
  { name: 'StandBy', env: { colorScheme: 'light', showsContainerBackground: false } },
  { name: 'accented', env: { widgetRenderingMode: 'accented' } },
  { name: 'iOS 16', env: { ios: 16 } },
];
const familyEnv = (family, mode, entry) => env(family, { timestamp: entry.date.getTime(), ...mode.env });

const isHier = (st) => st && st.type === 'hierarchical';
const styleOf = (m) => m && (m.style || m.content);

describe.each(Object.keys(WIDGETS))('%s', (name) => {
  const w = () => widget(name);

  test('the layout string has no babel helpers or module references', () => {
    const src = w().layout;
    expect(typeof src).toBe('string');
    expect(src).not.toMatch(/\b_(objectSpread\d?|toConsumableArray|slicedToArray|createForOfIteratorHelper\w*|defineProperty|interopRequireDefault)\b/);
    expect(src).not.toMatch(/\brequire\(/);
  });

  test('every family × state × mode renders with the engine’s rules', () => {
    for (const entry of SAMPLES[name]) {
      for (const family of WIDGETS[name].families) {
        for (const mode of MODES) {
          const tree = w().render(entry.props, familyEnv(family, mode, entry));
          const all = nodes(tree);
          const label = `${name} ${family} ${mode.name} ${entry.props.key}`;
          // корінь: тап відкриває застосунок, підкладка — для WidgetKit iOS 17
          const root = mods(tree);
          expect([label, !!root.widgetURL]).toEqual([label, true]);
          expect([label, !!root.containerBackground]).toEqual([label, true]);
          expect(root.widgetURL.url).toMatch(/^lingualens:\/\/[\w/-]+\?.*f=/);
          for (const n of all) {
            // розширення малює лише ці типи вузлів (DynamicView.swift)
            expect([label, n.type, SUPPORTED.has(n.type)]).toEqual([label, n.type, true]);
            if (n.type === 'TextView') {
              // вкладений Text у віджеті губиться — лише прості рядки
              expect([label, kids(n).length]).toEqual([label, 0]);
              // TextView застосовує модифікатори двічі — без відступів і підкладок
              expect([label, Object.keys(mods(n)).filter((k) => ['padding', 'background', 'offset', 'border'].includes(k))]).toEqual([label, []]);
            }
            // Gauge без підписів (Slot у віджеті не малюється)
            if (n.type === 'GaugeView') expect(kids(n).filter(Boolean)).toEqual([]);
            if (n.type === 'Button') expect(n.props.target).toBe('reveal');
          }
          // тоновані й екран блокування — лише ієрархія, без наших кольорів
          const tinted = mode.name === 'accented' || family.startsWith('accessory');
          if (tinted) {
            for (const n of all) {
              const fg = mods(n).foregroundStyle;
              if (fg) expect([label, n.type, isHier(styleOf(fg))]).toEqual([label, n.type, true]);
            }
          }
        }
      }
    }
  });

  test('the WidgetKit placeholder (no props yet) renders in every family', () => {
    for (const family of WIDGETS[name].families) {
      const tree = w().render({}, env(family));
      expect(nodes(tree).length).toBeGreaterThan(0);
    }
  });

  test('colours come from the palette in the props; StandBy is dark', () => {
    const entry = SAMPLES[name][0];
    if (WIDGETS[name].families.indexOf('systemSmall') < 0) return;
    const bg = (e, pal) => {
      const style = mods(w().render({ ...entry.props, pal }, env('systemSmall', e))).containerBackground.style;
      return style.color || style.colors[style.colors.length - 1];
    };
    const ocean = widgetPalette('light');
    const custom = { l: { ...ocean.l, bg: '#E9F3F8' }, d: { ...ocean.d, bg: '#0E1A20' } };
    expect(bg({ colorScheme: 'light' }, custom)).toBe('#E9F3F8');
    expect(bg({ colorScheme: 'dark' }, custom)).toBe('#0E1A20');
    expect(bg({ colorScheme: 'light', showsContainerBackground: false }, custom)).toBe('#0E1A20');
  });

  test('iOS 16 has no content margins: the widget pads and paints itself', () => {
    const entry = SAMPLES[name][0];
    const legacy = mods(w().render(entry.props, env('systemSmall', { ios: 16 })));
    expect(legacy.padding).toEqual(expect.objectContaining({ all: 16 }));
    expect(legacy.background).toBeDefined();
    expect(mods(w().render(entry.props, env('systemSmall'))).padding).toBeUndefined();
  });
});

describe('«Translation» in the widget (iOS 17+, Home Screen)', () => {
  const cases = [
    ['WordOfDay', () => buildWordTimeline(wodCache(1), { t: uk, ui: 'uk', targetLang: 'en', nativeLang: 'uk', now: NOW, hide: true })[0]],
    ['MyWords', () => buildMyWordsTimeline(words, { t: uk, targetLang: 'en', now: NOW, hide: true })[0]],
  ];
  const buttons = (tree) => nodes(tree).filter((n) => n.type === 'Button');

  test.each(cases)('%s: the button is there only while hidden, on iOS 17+ and the Home Screen', (name, make) => {
    const entry = make();
    const w = widget(name);
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
      const tree = w.render(entry.props, env(family));
      expect(buttons(tree)).toHaveLength(1);
      expect(texts(tree)).not.toContain(entry.props.translation);
      // VoiceOver: поки сховано, мітка блоку перекладу не читає
      expect(mods(tree).accessibilityLabel.label).toBe(entry.props.a11yShort);
      expect(mods(tree).accessibilityElement.children).toBe('contain');
      // iOS 16: кнопок немає — переклад одразу
      const legacy = w.render(entry.props, env(family, { ios: 16 }));
      expect(buttons(legacy)).toHaveLength(0);
      expect(texts(legacy)).toContain(entry.props.translation);
      // вимкнено в Параметрах — переклад одразу
      expect(buttons(w.render({ ...entry.props, hide: '' }, env(family)))).toHaveLength(0);
    }
    // екран блокування: переклад видно завжди
    for (const family of ['accessoryRectangular', 'accessoryInline']) {
      const tree = w.render(entry.props, env(family));
      expect(buttons(tree)).toHaveLength(0);
      expect(texts(tree).join(' ')).toContain(entry.props.translation);
    }
  });

  test.each(cases)('%s: pressing it returns { revealed: "1" }, and the merged props show the translation', (name, make) => {
    const entry = make();
    const w = widget(name);
    for (const family of ['systemSmall', 'systemMedium', 'systemLarge']) {
      const patch = w.press(entry.props, env(family), 'reveal');
      expect(patch).toEqual({ revealed: '1' });
      // так expo-widgets зливає відповідь у запис (AppIntent.swift)
      const after = w.render({ ...entry.props, ...patch }, env(family));
      expect(buttons(after)).toHaveLength(0);
      expect(texts(after)).toContain(entry.props.translation);
      expect(mods(after).accessibilityLabel.label).toBe(entry.props.a11y);
    }
  });

  test('the button reads its label for VoiceOver and shows “Translation” / “Show translation”', () => {
    const entry = cases[0][1]();
    const small = widget('WordOfDay').render(entry.props, env('systemSmall'));
    const medium = widget('WordOfDay').render(entry.props, env('systemMedium'));
    expect(mods(buttons(small)[0]).accessibilityLabel.label).toBe('Показати переклад');
    expect(texts(small)).toContain('Переклад');
    expect(texts(medium)).toContain('Показати переклад');
  });
});

describe('Word of the Day layout', () => {
  const w = () => widget('WordOfDay');
  const o = { t: en, ui: 'en', targetLang: 'en', nativeLang: 'uk', now: NOW };

  test('home screen: word, IPA and translation; medium adds the example with the word in bold (markdown)', () => {
    const [entry] = buildWordTimeline(wodCache(1), o);
    expect(texts(w().render(entry.props, env('systemSmall')))).toEqual(['English · Travel', 'lighthouse', '/ˈlaɪt.haʊs/', 'маяк']);
    const medium = w().render(entry.props, env('systemMedium'));
    expect(texts(medium)).toEqual([
      'English · Travel',
      'lighthouse',
      '/ˈlaɪt.haʊs/',
      'маяк',
      '“The old **lighthouse** still guides the boats home.”',
      'Старий маяк досі веде човни додому.',
    ]);
    const example = nodes(medium).find((n) => n.props.text === entry.props.example);
    expect(example.props.markdownEnabled).toBe(true);
    // без markdown — той самий приклад звичайним текстом
    const plain = buildWordTimeline(wodCache(1), { ...o, markdown: false })[0];
    expect(nodes(w().render(plain.props, env('systemMedium'))).find((n) => n.props.text === plain.props.example).props.markdownEnabled).toBe(false);
  });

  test('large: date, the sentence and this week; Pro: dots, today’s words and the next one locked', () => {
    const [free] = buildWordTimeline(wodCache(1), o);
    const large = texts(w().render(free.props, env('systemLarge')));
    expect(large).toEqual(expect.arrayContaining(['Thu, Oct 8', 'In a sentence', 'This week', 'w7', 't7', 'w5']));
    const [pro] = buildWordTimeline(wodCache(3), { ...o, hours: [9, 14, 19] });
    const tree = w().render(pro.props, env('systemLarge'));
    expect(texts(tree)).toEqual(expect.arrayContaining(['2 of 3', 'Today', '9 AM', '2 PM', 'lighthouse1', 'Next word at 7 PM']));
    expect(nodes(tree).filter((n) => n.type === 'CircleView')).toHaveLength(3);
    expect(nodes(tree).some((n) => n.type === 'ImageView' && n.props.systemName === 'lock.fill')).toBe(true);
  });

  test('lock screen: word, translation and IPA; inline is one line', () => {
    const [entry] = buildWordTimeline(wodCache(1), o);
    expect(texts(w().render(entry.props, env('accessoryRectangular')))).toEqual(['lighthouse', 'маяк', '/ˈlaɪt.haʊs/']);
    expect(texts(w().render(entry.props, env('accessoryInline')))).toEqual(['lighthouse · маяк']);
    const [empty] = buildWordTimeline(null, o);
    expect(texts(w().render(empty.props, env('accessoryInline')))).toEqual(['Open LinguaLens']);
    expect(texts(w().render(empty.props, env('systemSmall')))).toEqual(['Word of the day', 'Open LinguaLens for new words']);
  });

  test('empty states: at the bottom of small and medium, in the middle of the large one', () => {
    const lastIsSpacer = (tree) => kids(tree).filter(Boolean).at(-1).type === 'SpacerView';
    const [wod] = buildWordTimeline(null, o);
    const [mine] = buildMyWordsTimeline([], o);
    for (const [name, entry] of [
      ['WordOfDay', wod],
      ['MyWords', mine],
    ]) {
      expect(lastIsSpacer(widget(name).render(entry.props, env('systemLarge')))).toBe(true);
      expect(lastIsSpacer(widget(name).render(entry.props, env('systemMedium')))).toBe(false);
      expect(lastIsSpacer(widget(name).render(entry.props, env('systemSmall')))).toBe(false);
    }
  });

  test('the tap target names the family it came from', () => {
    const [entry] = buildWordTimeline(wodCache(1), o);
    expect(mods(w().render(entry.props, env('systemMedium'))).widgetURL.url).toBe(entry.props.link + '&f=systemMedium');
  });
});
