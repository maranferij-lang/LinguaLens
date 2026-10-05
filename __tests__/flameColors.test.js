// Вогник серії у фірмових кольорах — скрізь (власник, 5.10.2026): чип і
// картка серії, банер «серія під загрозою», свято, вітрина й обіцянка в
// онбордингу, свято першого слова, ціль у «Пообіцяй собі», серія в
// прев'ю палітри на пейволі й чип серії в демо. Кожне місце фарбується
// токенами flame* теми, яку видно, — палітри Pro перефарбовують його, а
// бурштину серії (warm / warmSoft) і будь-якого помаранчевого там немає.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import StreakChip from '../src/streak/StreakChip';
import StreakCard from '../src/streak/StreakCard';
import RiskBanner from '../src/streak/RiskBanner';
import StreakCelebration from '../src/streak/StreakCelebration';
import StreakShowcase from '../src/StreakShowcase';
import HoldToCommit from '../src/HoldToCommit';
import Celebrate from '../src/Celebrate';
import ScanDemo from '../src/ScanDemo';
import Flame from '../src/streak/Flame';
import { PledgeCard } from '../src/OnboardingParts';
import { ThemePreview } from '../src/PaywallScreen';
import { demoPair } from '../src/demoWords';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';
import { THEMES, ThemeProvider, themeKeyOf } from '../src/theme';

// StatusBar під фейковими таймерами свята — заглушка (як у streakCelebration.test)
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));
jest.setTimeout(20000);

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const KEYS = ['light', 'dark', 'ocean-dark', 'berry-light', 'graphite-dark', 'cocoa-light'];
const NOW = new Date(2026, 9, 8, 20, 30);
const day = (d) => localDayKey(new Date(2026, 9, d, 12));

// Помаранчевий, бурштиновий, жовтий: відтінок 15–65°, насичений, не білий
function orange(hex) {
  const c = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(c)) return false;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(c.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return false;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const hue = ((max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
  return hue >= 15 && hue <= 65 && s >= 0.45 && l >= 0.3 && l <= 0.9;
}

const COLOR_KEYS = ['color', 'backgroundColor', 'borderColor', 'fill', 'stroke', 'stopColor'];
// Усі кольори дерева: стилі (і масиви стилів), пропси SVG і color іконок
function colorsOf(tree) {
  const out = new Set();
  const add = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) && out.add(v.toUpperCase());
  for (const n of tree.root.findAll(() => true)) {
    for (const k of COLOR_KEYS) add(n.props[k]);
    const st = n.props.style;
    if (st && typeof st === 'object') {
      const flat = StyleSheet.flatten(st) || {};
      for (const k of COLOR_KEYS) add(flat[k]);
    }
  }
  return [...out];
}

async function render(el, key) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ThemeProvider value={THEMES[key]}>{el}</ThemeProvider>
      </SafeAreaProvider>
    );
  });
  await act(async () => {});
  return tree;
}

function noAmber(tree, key, what) {
  const { C, palette } = THEMES[key];
  const colors = colorsOf(tree);
  const amber = [C.warm, C.warmSoft].map((c) => c.toUpperCase());
  expect([what, key, colors.filter((c) => amber.includes(c))]).toEqual([what, key, []]);
  if (palette !== 'cocoa') expect([what, key, colors.filter(orange)]).toEqual([what, key, []]);
  return colors;
}

const flat = (node) => StyleSheet.flatten(node.props.style) || {};
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

afterEach(() => {
  jest.useRealTimers();
});

describe.each(KEYS)('%s', (key) => {
  const { C } = THEMES[key];

  test('streak chip: under threat — a dashed border in the flame colour', async () => {
    const tree = await render(<StreakChip info={{ n: 5, doneToday: false, phase: 'evening' }} t={t} onPress={() => {}} />, key);
    noAmber(tree, key, 'chip');
    const chip = tree.root.findAll((n) => n.props.testID === 'streak-chip' && n.props.style)[0];
    expect(flat(chip).borderColor).toBe(C.flame);
    await act(async () => tree.unmount());
  });

  test('streak card: the tile, week dots and progress bar wear the flame', async () => {
    const tree = await render(<StreakCard activeDays={[day(5), day(6), day(7), day(8)]} now={NOW} t={t} />, key);
    const colors = noAmber(tree, key, 'card');
    expect(colors).toEqual(expect.arrayContaining([C.flame, C.flameSoft].map((c) => c.toUpperCase())));
    // сьогоднішня крапка — суцільний вогник, значок на ній — onFlame
    const today = byId(tree, 'week-today')[0];
    const dot = today.findAll((n) => typeof n.type === 'string' && flat(n).backgroundColor === C.flame);
    expect(dot.length).toBeGreaterThan(0);
    expect(today.findAll((n) => n.props.color === C.onFlame).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('risk banner: a soft flame-coloured background', async () => {
    const tree = await render(<RiskBanner n={5} lang="en" t={t} ctaLabel="Review 1 card" onCta={() => {}} />, key);
    noAmber(tree, key, 'banner');
    expect(flat(byId(tree, 'risk-banner')[0]).backgroundColor).toBe(C.flameSoft);
    await act(async () => tree.unmount());
  });

  test('celebration of day 7: glow, rays, ring and the week in the flame colours', async () => {
    jest.useFakeTimers();
    const tree = await render(<StreakCelebration data={{ from: 6, to: 7 }} activeDays={[]} t={t} onDone={() => {}} />, key);
    const colors = noAmber(tree, key, 'celebration');
    expect(colors).toEqual(expect.arrayContaining([C.flame, C.flameTip].map((c) => c.toUpperCase())));
    await act(async () => tree.unmount());
  });

  test('onboarding showcase on day 7: the pill is the flame with onFlame text', async () => {
    const tree = await render(<StreakShowcase t={t} initial={7} />, key);
    noAmber(tree, key, 'showcase');
    const line = tree.root.findAll((n) => n.props.testID === 'showcase-line' && typeof n.type === 'string')[0];
    expect(flat(line).color).toBe(C.onFlame);
    const dots = tree.root.findAll((n) => typeof n.type === 'string' && flat(n).backgroundColor === C.flame);
    expect(dots.length).toBeGreaterThanOrEqual(7);
    await act(async () => tree.unmount());
  });

  test('hold to commit: the ring runs from the accent to the flame tip, the glow is the flame', async () => {
    const tree = await render(<HoldToCommit onCommit={() => {}} label="Promise" holdHint="Hold" tapHint="Tap" doneText="Deal!" />, key);
    const colors = noAmber(tree, key, 'commit');
    expect(colors).toEqual(expect.arrayContaining([C.accent, C.flame, C.flameTip].map((c) => c.toUpperCase())));
    await act(async () => tree.unmount());
  });

  test('first word celebration: the streak pill sits on flameSoft', async () => {
    const tree = await render(<Celebrate word={{ word: 'mug', translation: 'чашка', lang: 'en' }} t={t} />, key);
    const colors = noAmber(tree, key, 'celebrate');
    expect(colors).toContain(C.flameSoft.toUpperCase());
    await act(async () => tree.unmount());
  });

  test('the pledge: the first goal dot lights up with the flame', async () => {
    const tree = await render(<PledgeCard text="I will learn" lit t={t} />, key);
    noAmber(tree, key, 'pledge');
    expect(flat(byId(tree, 'goal-lit')[0]).backgroundColor).toBe(C.flame);
    await act(async () => tree.unmount());
  });
});

describe('the paywall palette preview', () => {
  test.each([
    ['ocean', false],
    ['berry', true],
    ['graphite', false],
    ['cocoa', true],
  ])('%s (dark %s): the streak chip shows that palette’s flame', async (palette, dark) => {
    const P = THEMES[themeKeyOf(palette, dark)].C;
    const tree = await render(<ThemePreview palette={palette} dark={dark} t={t} />, 'light');
    const colors = colorsOf(tree);
    expect(colors).toEqual(expect.arrayContaining([P.flame, P.flameSoft].map((c) => c.toUpperCase())));
    expect(colors).not.toContain(P.warm.toUpperCase());
    await act(async () => tree.unmount());
  });
});

describe('the onboarding demo', () => {
  // Онбординг 4.0 прибрав великий вогник демо (лишились малі вогники в
  // чипі серії): після злиття з потоком «вогник» він не повертається
  test('the lit streak chip is the brand flame, not amber; no big demo flame', async () => {
    jest.useFakeTimers();
    for (const key of ['light', 'dark']) {
      const tree = await render(<ScanDemo pair={demoPair('es', 'uk')} t={t} width={342} height={420} onFinal={() => {}} onAction={() => {}} />, key);
      const flames = tree.root.findAll((n) => n.type === Flame);
      expect(flames.length).toBeGreaterThan(0);
      expect(flames.map((f) => f.props.size).filter((size) => size > 16)).toEqual([]);
      const colors = colorsOf(tree);
      expect(colors).toContain(THEMES.dark.C.flame.toUpperCase());
      for (const old of ['#FFB13B', '#FFD15C']) expect(colors).not.toContain(old);
      const lit = tree.root.findAll((n) => typeof n.type === 'string' && flat(n).borderColor === THEMES.dark.C.flame);
      expect(lit.length).toBeGreaterThan(0);
      await act(async () => tree.unmount());
    }
  });
});
