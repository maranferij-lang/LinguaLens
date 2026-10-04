// Живий попередній перегляд віджетів (src/widgets/WidgetPreview.js) і
// «Як додати віджет» (src/widgets/HowTo.js): репліка показує переклад після
// тапу, як справжній віджет; кроки анімуються по колу, а з «Менше руху» —
// стоять.
import { AccessibilityInfo, Animated, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WidgetPreview } from '../src/widgets/WidgetPreview';
import { WidgetHowTo } from '../src/widgets/HowTo';
import { widgetPalette } from '../src/widgets/palette';
import { THEMES, ThemeProvider } from '../src/theme';
import { makeT } from '../src/i18n';

const uk = makeT('uk');
const en = makeT('en');
const WOD = {
  word: 'lighthouse',
  ipa: 'ˈlaɪthaʊs',
  translation: 'маяк',
  example: 'The lighthouse guided the ships.',
  topic: 'travel',
};
const SAMPLE = { word: 'mug', ipa: 'mʌɡ', translation: 'чашка' };

beforeEach(() => {
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
});

async function render(el, theme = THEMES.light) {
  let tree;
  await act(async () => {
    tree = create(<ThemeProvider value={theme}>{el}</ThemeProvider>);
  });
  return tree;
}
// Текст вузла разом із вкладеними шматками (жирне слово в прикладі).
const flat = (node) =>
  []
    .concat(node.props.children)
    .map((c) => (typeof c === 'string' || typeof c === 'number' ? String(c) : c && c.props ? flat(c) : ''))
    .join('');
const inText = (n) => {
  for (let p = n.parent; p; p = p.parent) if (p.type === Text) return true;
  return false;
};
const texts = (root) => root.findAll((n) => n.type === Text && !inText(n)).map(flat);
const byId = (tree, id) => tree.root.find((n) => n.props.testID === id && typeof n.type !== 'string' && n.props.style);
const press = (tree, id) => act(async () => tree.root.find((n) => n.props.testID === id && n.props.onPress).props.onPress());

describe('WidgetPreview', () => {
  test('three replicas: medium “Word of the day”, small streak and small “My words”', async () => {
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} streakN={3} t={uk} lang="uk" targetLang="en" />);
    expect(texts(byId(tree, 'preview-wod'))).toEqual(['English · Подорожі', 'lighthouse', '/ˈlaɪthaʊs/', 'Показати переклад']);
    expect(texts(byId(tree, 'preview-streak')).slice(0, 2)).toEqual(['3', uk('streakUnit', { n: 3 })]);
    expect(texts(byId(tree, 'preview-words'))).toEqual([uk('widgetWordsTitle'), 'M', 'mug', '/mʌɡ/', uk('widgetReveal')]);
    // підпис для VoiceOver — що це ілюстрація
    expect(byId(tree, 'widget-preview').props.accessibilityLabel).toBe(uk('widgetPreviewA11y'));
    await act(async () => tree.unmount());
  });

  test('“Show translation” shows the translation and the example with the word in bold — like the widget', async () => {
    const onReveal = jest.fn();
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} t={uk} lang="uk" targetLang="en" onReveal={onReveal} />);
    expect(texts(tree.root)).not.toContain('маяк');
    await press(tree, 'preview-reveal');
    expect(onReveal).toHaveBeenCalledWith('wod');
    const wod = texts(byId(tree, 'preview-wod'));
    expect(wod).toContain('маяк');
    // приклад — у лапках мови слова, як у віджеті
    expect(wod).toContain('“The lighthouse guided the ships.”');
    expect(wod).not.toContain('Показати переклад');
    const bold = tree.root.findAll((n) => n.type === Text && inText(n) && n.props.style).map(flat);
    expect(bold).toEqual(['lighthouse']);
    // «Мої слова» — окремо
    expect(texts(byId(tree, 'preview-words'))).not.toContain('чашка');
    await press(tree, 'preview-reveal-words');
    expect(onReveal).toHaveBeenLastCalledWith('words');
    expect(texts(byId(tree, 'preview-words'))).toContain('чашка');
    await act(async () => tree.unmount());
  });

  test('no word of the day yet — the sample stands in; no target language — a plain caption', async () => {
    const tree = await render(<WidgetPreview wod={null} sample={SAMPLE} streakN={0} t={en} lang="en" />);
    expect(texts(byId(tree, 'preview-wod'))).toEqual([en('widgetTitle'), 'mug', '/mʌɡ/', 'Show translation']);
    expect(texts(byId(tree, 'preview-streak'))[0]).toBe('0');
    await press(tree, 'preview-reveal');
    expect(texts(byId(tree, 'preview-wod'))).toContain('чашка');
    await act(async () => tree.unmount());
  });

  test('scales as a whole with its width: a narrow step keeps the same layout, only smaller', async () => {
    const tree = await render(<WidgetPreview wod={WOD} sample={SAMPLE} streakN={1} t={uk} lang="uk" targetLang="en" />);
    const size = () => {
      const word = tree.root.find((n) => n.type === Text && flat(n) === 'lighthouse');
      return Object.assign({}, ...[].concat(word.props.style).flat()).fontSize;
    };
    const layout = (width) =>
      act(async () => byId(tree, 'widget-preview').props.onLayout({ nativeEvent: { layout: { width, height: width } } }));
    expect(size()).toBe(30);
    await layout(268);
    expect(size()).toBe(24);
    await layout(402);
    expect(size()).toBe(36);
    // і не безмежно: на iPad-ширині — не більше ×1,3
    await layout(900);
    expect(size()).toBe(39);
    // без серії — «0 днів», а не «0 днів поспіль»
    const none = await render(<WidgetPreview wod={WOD} streakN={0} t={uk} lang="uk" />);
    expect(texts(none.root.find((n) => n.props.testID === 'preview-streak' && n.props.style))[1]).toBe('днів');
    await act(async () => none.unmount());
    await act(async () => tree.unmount());
  });

  test('colours come from the widget palette of the current theme', async () => {
    for (const theme of [THEMES.light, THEMES.dark]) {
      const pal = widgetPalette(theme.key)[theme.isDark ? 'd' : 'l'];
      const tree = await render(<WidgetPreview wod={WOD} t={uk} lang="uk" />, theme);
      const style = [].concat(byId(tree, 'preview-wod').props.style).flat();
      expect(style).toEqual(expect.arrayContaining([expect.objectContaining({ backgroundColor: pal.bg })]));
      await act(async () => tree.unmount());
    }
  });
});

describe('WidgetHowTo', () => {
  test('three steps: tiles with short captions, one label for VoiceOver', async () => {
    const tree = await render(<WidgetHowTo t={uk} />);
    const root = byId(tree, 'widget-howto');
    expect(root.props.accessibilityLabel).toBe(uk('widgetHowA11y'));
    expect(texts(root)).toEqual(['1', uk('widgetHow1'), '2', uk('widgetHow2'), '3', uk('widgetHow3')]);
    await act(async () => tree.unmount());
  });

  test('compact — rows with the full text of each step', async () => {
    const tree = await render(<WidgetHowTo t={en} compact />);
    expect(texts(byId(tree, 'widget-howto'))).toEqual(['1', en('widgetTipStep1'), '2', en('widgetTipStep2'), '3', en('widgetTipStep3')]);
    await act(async () => tree.unmount());
  });

  test('the steps play in a loop; with Reduce Motion they stand still', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    try {
      const tree = await render(<WidgetHowTo t={uk} />);
      expect(loop).toHaveBeenCalledTimes(1);
      await act(async () => tree.unmount());

      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
      const first = await render(<WidgetHowTo t={uk} />);
      await act(async () => first.unmount());
      loop.mockClear();
      const still = await render(<WidgetHowTo t={uk} compact />);
      expect(loop).not.toHaveBeenCalled();
      await act(async () => still.unmount());
    } finally {
      loop.mockRestore();
    }
  });
});
