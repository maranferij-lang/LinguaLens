// Вогник серії (src/streak/Flame.js): кожна форма з таблиці core.md C.2
// малюється тим, що їй належить (жаринка — пунктиром, з 3-го дня язики, з
// 7-го сяйво й іскри, 14 — кільце, 30 — корона, 100 — «легендарне» серце), а
// з «Менше руху» вогник не дихає. Кольори — лише з токенів flame* теми
// (5.10.2026): жодного оранжево-жовтого, палітри Pro перефарбовують вогник.
import { AccessibilityInfo, Animated } from 'react-native';
import { Circle, Path, Stop } from 'react-native-svg';
import { act, create } from 'react-test-renderer';
import Flame, { flameArt } from '../src/streak/Flame';
import { flameForm } from '../src/streak';
import { THEMES, ThemeProvider } from '../src/theme';

beforeEach(() => {
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
});

async function render(props, theme = THEMES.light) {
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={theme}>
        <Flame {...props} />
      </ThemeProvider>
    );
  });
  return tree;
}

// Лише самі фігури react-native-svg (а не їхні нативні копії в дереві)
const parts = (tree, id) => tree.root.findAll((n) => n.props?.testID === id && (n.type === Path || n.type === Circle));
const count = (tree, id) => parts(tree, id).length;

describe('every form draws what the table says', () => {
  const N = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 29, 30, 99, 100];

  test.each(N)('%i days', async (n) => {
    const tree = await render({ n, size: 72, breathe: false });
    const form = flameForm(n);
    const lit = form.stage === 'lit';
    expect(count(tree, 'flame-ember')).toBe(form.stage === 'ember' ? 1 : 0);
    expect(count(tree, 'flame-body')).toBe(form.stage === 'ember' ? 0 : 1);
    expect(count(tree, 'flame-tongue')).toBe(form.tongues);
    expect(count(tree, 'flame-glow')).toBe(lit ? 1 : 0);
    expect(count(tree, 'flame-spark')).toBe(lit ? Math.min(4, 2 + form.tier) : 0);
    expect(count(tree, 'flame-ring')).toBe(lit && form.tier >= 2 ? 1 : 0);
    expect(count(tree, 'flame-crown')).toBe(lit && form.tier >= 3 ? 2 : 0);
    // розмір вогника — size × 1,2 (viewBox 100×120)
    const root = tree.root.findAll((x) => x.props.testID === 'flame' && x.props.style)[0];
    expect(root.props.style).toEqual(expect.arrayContaining([{ width: 72, height: 86 }]));
    await act(async () => tree.unmount());
  });

  test('the body grows every day from 1 to 6', async () => {
    const heights = [];
    for (let n = 1; n <= 6; n++) {
      const tree = await render({ n, breathe: false });
      const d = parts(tree, 'flame-body')[0].props.d;
      // верх краплі — y першої точки
      heights.push(112 - Number(/^M[-\d.]+,([-\d.]+)/.exec(d)[1]));
      await act(async () => tree.unmount());
    }
    expect(heights).toEqual([54, 62, 70, 78, 86, 94]);
  });

  test('a kindling flame takes the brand flame from the theme; 100 days gets the legend heart', async () => {
    const light = await render({ n: 3, breathe: false });
    expect(parts(light, 'flame-body')[0].props.fill).toBe(THEMES.light.C.flame);
    const dark = await render({ n: 3, breathe: false }, THEMES.dark);
    expect(parts(dark, 'flame-body')[0].props.fill).toBe(THEMES.dark.C.flame);
    // сам токен — не бурштин серії, як було до 5.10.2026
    expect(THEMES.light.C.flame).not.toBe(THEMES.light.C.warm);
    const legend = await render({ n: 100, breathe: false });
    expect(parts(legend, 'flame-heart')[0].props.fill).toMatch(/^url\(#.+v\)$/);
    const week = await render({ n: 7, breathe: false });
    expect(parts(week, 'flame-heart')[0].props.fill).toMatch(/^url\(#.+c\)$/);
    for (const tr of [light, dark, legend, week]) await act(async () => tr.unmount());
  });

  test('two flames on one screen do not share gradient ids', async () => {
    let tree;
    await act(async () => {
      tree = create(
        <ThemeProvider value={THEMES.light}>
          <Flame n={7} breathe={false} />
          <Flame n={7} breathe={false} />
        </ThemeProvider>
      );
    });
    const fills = parts(tree, 'flame-body').map((n) => n.props.fill);
    expect(new Set(fills).size).toBe(2);
    await act(async () => tree.unmount());
  });
});

test('pending: the same form at 45 % opacity', async () => {
  const tree = await render({ n: 5, pending: true, breathe: false });
  const motion = tree.root.findAll((n) => n.props.testID === 'flame-motion' && n.props.style)[0];
  expect(motion.props.style.flat ? motion.props.style.flat() : motion.props.style).toEqual(
    expect.arrayContaining([expect.objectContaining({ opacity: 0.45 })])
  );
  await act(async () => tree.unmount());
});

describe('breathing', () => {
  const transformOf = (tree) => {
    const motion = tree.root.findAll((n) => n.props.testID === 'flame-motion' && n.props.style)[0];
    return [].concat(motion.props.style).filter(Boolean).find((s) => s.transform)?.transform;
  };

  test('a lit flame breathes; an ember does not', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    try {
      const tree = await render({ n: 7 });
      expect(loop).toHaveBeenCalledTimes(1);
      expect(transformOf(tree)).toHaveLength(2);
      await act(async () => tree.unmount());
      loop.mockClear();
      const ember = await render({ n: 0 });
      expect(loop).not.toHaveBeenCalled();
      expect(transformOf(ember)).toBeUndefined();
      await act(async () => ember.unmount());
    } finally {
      loop.mockRestore();
    }
  });

  test('with Reduce Motion the flame is still', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const loop = jest.spyOn(Animated, 'loop');
    try {
      // перший показ дізнається про «Менше руху» й зупиняється…
      const first = await render({ n: 14 });
      expect(transformOf(first)).toBeUndefined();
      await act(async () => first.unmount());
      // …а наступні вже й не починають
      loop.mockClear();
      const tree = await render({ n: 14 });
      expect(loop).not.toHaveBeenCalled();
      expect(transformOf(tree)).toBeUndefined();
      await act(async () => tree.unmount());
    } finally {
      loop.mockRestore();
    }
  });
});

// ── Кольори вогника ─────────────────────────────────────────────────────────
const KEYS = Object.keys(THEMES);
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
// Усі кольори намальованого вогника: заливки, обведення, зупинки градієнтів
function colorsOf(tree) {
  const out = new Set();
  for (const n of tree.root.findAll((x) => x.type === Path || x.type === Circle || x.type === Stop)) {
    for (const k of ['fill', 'stroke', 'stopColor']) {
      const v = n.props[k];
      if (typeof v === 'string' && v.startsWith('#')) out.add(v.toUpperCase());
    }
  }
  return [...out];
}

describe('the flame wears the palette, never amber', () => {
  test.each(KEYS)('%s: every stage is drawn from the flame tokens, nothing orange', async (key) => {
    const theme = THEMES[key];
    const { C } = theme;
    const art = flameArt(C, theme.isDark);
    const allowed = new Set(
      [C.flame, C.faint, ...Object.values(art).flat(), '#FFFFFF'].map((c) => c.toUpperCase())
    );
    for (const n of [1, 3, 6, 7, 14, 30, 100]) {
      const tree = await render({ n, breathe: false }, theme);
      const colors = colorsOf(tree);
      for (const c of colors) expect([key, n, c, allowed.has(c)]).toEqual([key, n, c, true]);
      if (theme.palette !== 'cocoa') expect([key, n, colors.filter(orange)]).toEqual([key, n, []]);
      await act(async () => tree.unmount());
    }
  });

  test('from day 7 the flame ignites: a gradient from the tip colour to the body, a glow and tip-coloured sparks', async () => {
    for (const key of ['light', 'dark', 'ocean-light', 'berry-dark']) {
      const theme = THEMES[key];
      const { C } = theme;
      const tree = await render({ n: 7, breathe: false }, theme);
      const stops = tree.root.findAll((x) => x.type === Stop).map((x) => x.props.stopColor);
      // градієнт тіла: перша зупинка — кінчик, остання — тіло вогника
      expect(stops[0]).toBe(C.flameTip);
      expect(stops[2]).toBe(flameArt(C, theme.isDark).body[2]);
      expect(parts(tree, 'flame-spark').map((x) => x.props.fill)).toEqual(expect.arrayContaining([C.flameTip]));
      expect(count(tree, 'flame-glow')).toBe(1);
      // жевріючий (6-й день) — без градієнта й сяйва, суцільний flame
      const six = await render({ n: 6, breathe: false }, theme);
      expect(parts(six, 'flame-body')[0].props.fill).toBe(C.flame);
      expect(count(six, 'flame-glow')).toBe(0);
      for (const tr of [tree, six]) await act(async () => tr.unmount());
    }
  });

  test('a Pro palette repaints the flame', async () => {
    const chalk = await render({ n: 4, breathe: false }, THEMES.light);
    const ocean = await render({ n: 4, breathe: false }, THEMES['ocean-light']);
    const a = parts(chalk, 'flame-body')[0].props.fill;
    const b = parts(ocean, 'flame-body')[0].props.fill;
    expect(a).toBe(THEMES.light.C.flame);
    expect(b).toBe(THEMES['ocean-light'].C.flame);
    expect(a).not.toBe(b);
    for (const tr of [chalk, ocean]) await act(async () => tr.unmount());
  });

  test('the legend heart (100 days) differs from the ordinary lit heart', () => {
    for (const key of KEYS) {
      const th = THEMES[key];
      const art = flameArt(th.C, th.isDark);
      expect([key, art.legend]).not.toEqual([key, art.heart]);
    }
  });
});
