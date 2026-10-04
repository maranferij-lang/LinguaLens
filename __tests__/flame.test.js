// Вогник серії (src/streak/Flame.js): кожна форма з таблиці core.md C.2
// малюється тим, що їй належить (жаринка — пунктиром, з 3-го дня язики, з
// 7-го сяйво й іскри, 14 — кільце, 30 — корона, 100 — фіолетове серце), а з
// «Менше руху» вогник не дихає.
import { AccessibilityInfo, Animated } from 'react-native';
import { Circle, Path } from 'react-native-svg';
import { act, create } from 'react-test-renderer';
import Flame from '../src/streak/Flame';
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

  test('a kindling flame takes the streak amber from the theme; 100 days gets the violet heart', async () => {
    const light = await render({ n: 3, breathe: false });
    expect(parts(light, 'flame-body')[0].props.fill).toBe(THEMES.light.C.warm);
    const dark = await render({ n: 3, breathe: false }, THEMES.dark);
    expect(parts(dark, 'flame-body')[0].props.fill).toBe(THEMES.dark.C.warm);
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
