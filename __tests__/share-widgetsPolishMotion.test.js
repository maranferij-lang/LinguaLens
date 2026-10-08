// Рух і фон у віджетах (жовтень 2026): переклад у прев'ю з'являється за
// пресетами motion.js; «Мої слова» дописуються одразу, коли застосунок іде
// у фон раніше за 2 с; жодного власного Easing у share/ і widgets/.
import fs from 'fs';
import path from 'path';
import { AccessibilityInfo, Animated, AppState, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WidgetPreview } from '../src/widgets/WidgetPreview';
import { THEMES, ThemeProvider } from '../src/theme';
import { DUR, EASE } from '../src/motion';
import { makeT } from '../src/i18n';
import { useWidgets, WORDS_DEBOUNCE_MS } from '../src/widgets/useWidgets';

const uk = makeT('uk');
const widgets = require('expo-widgets');
const WOD = { word: 'lighthouse', ipa: 'ˈlaɪthaʊs', translation: 'маяк', example: 'The lighthouse guided the ships.', topic: 'travel' };
const SAMPLE = { word: 'mug', ipa: 'mʌɡ', translation: 'чашка' };

async function render(el) {
  let tree;
  await act(async () => {
    tree = create(<ThemeProvider value={THEMES.light}>{el}</ThemeProvider>);
  });
  return tree;
}
const press = (tree, id) => act(async () => tree.root.find((n) => n.props.testID === id && n.props.onPress).props.onPress());
const flat = (style) => StyleSheet.flatten(style) || {};

// ── WidgetPreview: переклад з'являється м'яко ───────────────────────────────
describe('WidgetPreview reveal', () => {
  beforeEach(() => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  });
  afterEach(() => jest.restoreAllMocks());

  test('the translation fades in with DUR.panel and EASE.out on the native driver, rising a few points', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} t={uk} lang="uk" targetLang="en" />);
    timing.mockClear();
    await press(tree, 'preview-reveal');
    const call = timing.mock.calls.find(([, cfg]) => cfg.toValue === 1);
    expect(call).toBeTruthy();
    expect(call[1]).toMatchObject({ duration: DUR.panel, easing: EASE.out, useNativeDriver: true });
    // і 260 мс з типовим ease-in-out більше немає
    expect(call[1].duration).toBeLessThan(300);
    const appear = tree.root.find(
      (n) => n.type === Animated.View && flat(n.props.style).transform && flat(n.props.style).opacity !== undefined && !n.props.testID && n.findAll((m) => m.type === Text).length
    );
    const style = flat(appear.props.style);
    expect(style.transform[0].translateY.__getValue()).toBeLessThanOrEqual(4);
    await act(async () => tree.unmount());
  });

  test('the press leaves the translation in the tree at once (the fade does not delay the content)', async () => {
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} t={uk} lang="uk" targetLang="en" />);
    await press(tree, 'preview-reveal-words');
    expect(tree.root.findAll((n) => n.type === Text && n.props.children === 'чашка').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('Reduce Motion: shown at full opacity at once, no timing and no shift', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const warm = await render(<WidgetPreview wod={WOD} sample={SAMPLE} t={uk} lang="uk" targetLang="en" />);
    await act(async () => warm.unmount());
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} t={uk} lang="uk" targetLang="en" />);
    timing.mockClear();
    await press(tree, 'preview-reveal');
    expect(timing.mock.calls.filter(([, cfg]) => cfg.toValue === 1)).toHaveLength(0);
    const appear = tree.root.find(
      (n) => n.type === Animated.View && flat(n.props.style).opacity !== undefined && n.findAll((m) => m.type === Text && m.props.children === 'маяк').length
    );
    const style = flat(appear.props.style);
    expect(style.opacity.__getValue()).toBe(1);
    expect(style.transform).toEqual([]);
    await act(async () => tree.unmount());
  });
});

// ── Жодного власного Easing у share/ і widgets/ ─────────────────────────────
describe('motion.js is the single source of easing', () => {
  const root = path.join(__dirname, '..', 'src');
  const files = ['share', 'widgets'].flatMap((dir) =>
    fs
      .readdirSync(path.join(root, dir))
      .filter((f) => f.endsWith('.js'))
      .map((f) => path.join(root, dir, f))
  );

  test('nothing imports Easing from react-native', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const imports = src.match(/import\s*\{[^}]*\}\s*from\s*'react-native'/g) || [];
      for (const i of imports) expect({ file: path.basename(f), easing: /\bEasing\b/.test(i) }).toEqual({ file: path.basename(f), easing: false });
    }
  });

  test('every Animated.timing in these folders names its easing (the default is ease-in-out)', () => {
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      for (const m of src.matchAll(/Animated\.timing\(/g)) {
        const call = src.slice(m.index, m.index + 260);
        expect({ file: path.basename(f), easing: /easing:/.test(call) }).toEqual({ file: path.basename(f), easing: true });
      }
    }
  });
});

// ── «Мої слова»: у фон раніше за 2 с ───────────────────────────────────────
describe('My Words is written at once when the app goes to the background', () => {
  const word = { id: 'a', word: 'mug', translation: 'чашка', lang: 'en', addedAt: Date.now(), srs: { box: 0, due: Date.now() } };
  let handlers;
  let removed;

  function Harness({ words }) {
    useWidgets({
      ready: true,
      t: uk,
      ui: 'uk',
      settings: { targetLang: 'en', nativeLang: 'uk' },
      wod: null,
      words,
      activity: {},
      pro: false,
      themeKey: 'light',
    });
    return null;
  }
  const writes = () => widgets.__widgets.MyWords?.updateTimeline.mock.calls.length ?? 0;
  const go = (state) => act(async () => handlers.forEach((fn) => fn(state)));
  const wait = (ms) => act(async () => jest.advanceTimersByTime(ms));

  beforeEach(() => {
    jest.useFakeTimers();
    handlers = [];
    removed = 0;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'change') handlers.push(fn);
      return { remove: () => removed++ };
    });
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function mount(words = [word]) {
    let tree;
    await act(async () => {
      tree = create(<Harness words={words} />);
    });
    return tree;
  }

  test('without a flush the write waits the full debounce', async () => {
    const tree = await mount();
    const start = writes();
    await wait(WORDS_DEBOUNCE_MS - 100);
    expect(writes()).toBe(start);
    await wait(200);
    expect(writes()).toBe(start + 1);
    await act(async () => tree.unmount());
  });

  test('background before 2 s: written now, and the timer does not write a second time', async () => {
    const tree = await mount();
    const start = writes();
    await wait(500);
    expect(writes()).toBe(start);
    await go('background');
    expect(writes()).toBe(start + 1);
    expect(widgets.__timeline('MyWords')[0].props).toMatchObject({ word: 'mug', state: 'word' });
    await wait(WORDS_DEBOUNCE_MS * 2);
    expect(writes()).toBe(start + 1);
    await act(async () => tree.unmount());
  });

  test('“inactive” (Control Center, a system dialog) is not a reason to write early', async () => {
    const tree = await mount();
    const start = writes();
    await go('inactive');
    expect(writes()).toBe(start);
    await wait(WORDS_DEBOUNCE_MS + 100);
    expect(writes()).toBe(start + 1);
    await act(async () => tree.unmount());
  });

  test('nothing pending (already written): background adds no write', async () => {
    const tree = await mount();
    await wait(WORDS_DEBOUNCE_MS + 100);
    const done = writes();
    await go('background');
    expect(writes()).toBe(done);
    await act(async () => tree.unmount());
  });

  test('two backgrounds in a row write once; coming back schedules a fresh write', async () => {
    const tree = await mount();
    const start = writes();
    await go('background');
    await go('background');
    expect(writes()).toBe(start + 1);
    await go('active');
    const afterActive = writes();
    await wait(WORDS_DEBOUNCE_MS + 100);
    expect(writes()).toBe(afterActive + 1);
    await act(async () => tree.unmount());
  });

  test('a changed pool replaces the pending write: the flush writes the latest words', async () => {
    const tree = await mount();
    await wait(300);
    await act(async () => {
      tree.update(<Harness words={[word, { ...word, id: 'b', word: 'cup', translation: 'горня' }]} />);
    });
    const before = writes();
    await go('background');
    expect(writes()).toBe(before + 1);
    const shown = widgets.__timeline('MyWords').map((e) => e.props.word);
    expect(shown).toContain('cup');
    await act(async () => tree.unmount());
  });

  test('after unmount nothing is flushed and the listener is removed', async () => {
    const tree = await mount();
    const start = writes();
    await act(async () => tree.unmount());
    expect(removed).toBeGreaterThan(0);
    // слухач уже знятий, але навіть якщо він устигне спрацювати — запису немає
    await go('background');
    await wait(WORDS_DEBOUNCE_MS * 2);
    expect(writes()).toBe(start);
  });
});
