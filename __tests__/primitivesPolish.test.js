// Спільні примітиви (src/ui.js, src/motion.js): відгук на дотик у трьох
// виглядах (scale, dim, none), «Зменшити рух» без масштабу, haptic(), поява зі
// стагером, скелетон, смужка прогресу з ролями для VoiceOver, оголошення для
// VoiceOver на iOS і кеш «Зменшити рух», що живе без жодного хука.
import { AccessibilityInfo, Animated, Platform, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import { Bar, Caps, FadeIn, GradBtn, Press, SecBtn, Skeleton } from '../src/ui';
import { DUR, EASE, announce, haptic, isReducedMotion, stagger, useAnnounce, useReducedMotion } from '../src/motion';
import { THEMES, ThemeProvider } from '../src/theme';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// Підписка motion.js на reduceMotionChanged стається при імпорті: беремо
// обробник, поки жоден beforeEach не очистив історію викликів
const NATIVE_REDUCE_LISTENER = AccessibilityInfo.addEventListener.mock.calls.find(([name]) => name === 'reduceMotionChanged')?.[1];

const mounted = [];
async function mount(el, theme = 'light') {
  let tree;
  await act(async () => {
    tree = create(<ThemeProvider value={THEMES[theme]}>{el}</ThemeProvider>);
  });
  mounted.push(tree);
  return tree;
}
const host = (tree, fn) => tree.root.findAll((n) => typeof n.type === 'string' && fn(n));
const flat = (n) => StyleSheet.flatten(n.props.style) || {};
// обгортка Animated(Pressable): на ній стоять пропси, які Press віддає
// Pressable (на нативному View лишаються тільки стилі й доступність)
const pressables = (tree) => tree.root.findAll((n) => typeof n.type !== 'string' && typeof n.props?.onPressIn === 'function' && n.type?.displayName?.startsWith('Animated'));
const pressable = (tree) => pressables(tree)[0];
const view = (tree, label = 'btn') => host(tree, (n) => n.props.accessibilityLabel === label)[0];

// Монтуємо компонент із хуком, щоб кеш «Зменшити рух» узяв значення з системи
function Probe({ onValue = () => {} }) {
  onValue(useReducedMotion());
  return null;
}
async function setReduced(value) {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(value);
  await mount(<Probe />);
}

const REAL_ANNOUNCE = AccessibilityInfo.announceForAccessibility;
afterAll(() => {
  AccessibilityInfo.announceForAccessibility = REAL_ANNOUNCE;
});

beforeEach(async () => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  await setReduced(false);
});
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
});

const calls = (spy) => spy.mock.calls.map(([, cfg]) => cfg);

describe('Press: scale (default)', () => {
  test('renders a scale transform and no opacity of its own; role defaults to button', async () => {
    const tree = await mount(
      <Press accessibilityLabel="btn">
        <Text>x</Text>
      </Press>
    );
    expect(flat(view(tree)).transform).toEqual([{ scale: 1 }]);
    expect(flat(view(tree)).opacity).toBeUndefined();
    expect(view(tree).props.accessibilityRole).toBe('button');
  });

  test('press-in springs to scaleTo (snappy), press-out springs back (ui)', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await mount(<Press accessibilityLabel="btn" scaleTo={0.94}><Text>x</Text></Press>);
    await act(async () => pressable(tree).props.onPressIn({ nativeEvent: {} }));
    await act(async () => pressable(tree).props.onPressOut({ nativeEvent: {} }));
    expect(calls(spring).map((c) => c.toValue)).toEqual([0.94, 1]);
    expect(calls(spring)[0].stiffness).toBeGreaterThan(calls(spring)[1].stiffness);
  });

  test('the caller’s onPressIn / onPressOut / onLayout still run', async () => {
    const [a, b, c] = [jest.fn(), jest.fn(), jest.fn()];
    const tree = await mount(<Press onPressIn={a} onPressOut={b} onLayout={c}><Text>x</Text></Press>);
    await act(async () => {
      pressable(tree).props.onPressIn({ nativeEvent: {} });
      pressable(tree).props.onPressOut({ nativeEvent: {} });
      pressable(tree).props.onLayout({ nativeEvent: { layout: { width: 100, height: 100 } } });
    });
    expect([a, b, c].map((f) => f.mock.calls.length)).toEqual([1, 1, 1]);
  });

  test('disabled stays at 0.45; busy does not fade and blocks presses', async () => {
    const off = await mount(<Press accessibilityLabel="btn" disabled><Text>x</Text></Press>);
    expect(flat(view(off)).opacity).toBe(0.45);
    const busy = await mount(<Press accessibilityLabel="btn" busy><Text>x</Text></Press>);
    expect(flat(view(busy)).opacity).toBeUndefined();
    expect(pressable(busy).props.disabled).toBe(true);
  });
});

describe('Press: Reduce Motion', () => {
  test('no scale: an opacity dip to 0.7 in DUR.press (out), back in DUR.micro (soft), native driver', async () => {
    await setReduced(true);
    expect(isReducedMotion()).toBe(true);
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await mount(<Press accessibilityLabel="btn"><Text>x</Text></Press>);
    expect(flat(view(tree)).transform).toBeUndefined();
    expect(flat(view(tree)).opacity).toBe(1);

    await act(async () => pressable(tree).props.onPressIn({ nativeEvent: {} }));
    await act(async () => pressable(tree).props.onPressOut({ nativeEvent: {} }));
    expect(spring).not.toHaveBeenCalled();
    const [down, up] = calls(timing);
    expect(down).toMatchObject({ toValue: 0.7, duration: DUR.press, easing: EASE.out, useNativeDriver: true });
    expect(up).toMatchObject({ toValue: 1, duration: DUR.micro, easing: EASE.soft, useNativeDriver: true });
  });

  test('disabled still wins over the dip; the caller’s own opacity is kept, not overwritten', async () => {
    await setReduced(true);
    const off = await mount(<Press accessibilityLabel="btn" disabled><Text>x</Text></Press>);
    expect(flat(view(off)).opacity).toBe(0.45);
    const own = await mount(<Press accessibilityLabel="btn" style={{ opacity: 0.5 }}><Text>x</Text></Press>);
    expect(flat(view(own)).opacity).toBe(0.5);
  });

  test('a button rendered before the system answered switches by itself when the setting arrives', async () => {
    const tree = await mount(<Press accessibilityLabel="btn"><Text>x</Text></Press>);
    expect(flat(view(tree)).transform).toEqual([{ scale: 1 }]);
    await act(async () => NATIVE_REDUCE_LISTENER(true));
    expect(flat(view(tree)).transform).toBeUndefined();
    expect(flat(view(tree)).opacity).toBe(1);
    await act(async () => NATIVE_REDUCE_LISTENER(false));
    expect(flat(view(tree)).transform).toEqual([{ scale: 1 }]);
  });

  test('the cache follows the system even with no hook mounted (module-level subscription)', async () => {
    expect(NATIVE_REDUCE_LISTENER).toEqual(expect.any(Function));
    act(() => NATIVE_REDUCE_LISTENER(true));
    expect(isReducedMotion()).toBe(true);
    act(() => NATIVE_REDUCE_LISTENER(false));
    expect(isReducedMotion()).toBe(false);
  });

  test('a mounted hook mirrors the module cache, and stops listening on unmount', async () => {
    const seen = [];
    const tree = await mount(<Probe onValue={(v) => seen.push(v)} />);
    await act(async () => NATIVE_REDUCE_LISTENER(true));
    expect(seen.at(-1)).toBe(true);
    await act(async () => tree.unmount());
    mounted.pop();
    const before = seen.length;
    await act(async () => NATIVE_REDUCE_LISTENER(false));
    expect(seen).toHaveLength(before);
  });
});

describe('Press: feedback="dim" (rows, links, chips)', () => {
  test('opacity only: 0.6 in DUR.press (out), back in DUR.micro (soft); no transform, no spring', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await mount(<Press accessibilityLabel="btn" feedback="dim"><Text>x</Text></Press>);
    expect(flat(view(tree)).transform).toBeUndefined();
    await act(async () => pressable(tree).props.onPressIn({ nativeEvent: {} }));
    await act(async () => pressable(tree).props.onPressOut({ nativeEvent: {} }));
    expect(spring).not.toHaveBeenCalled();
    const [down, up] = calls(timing);
    expect(down).toMatchObject({ toValue: 0.6, duration: DUR.press, easing: EASE.out, useNativeDriver: true });
    expect(up).toMatchObject({ toValue: 1, duration: DUR.micro, easing: EASE.soft, useNativeDriver: true });
  });

  test('feedback="none" animates nothing', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await mount(<Press accessibilityLabel="btn" feedback="none"><Text>x</Text></Press>);
    await act(async () => pressable(tree).props.onPressIn({ nativeEvent: {} }));
    await act(async () => pressable(tree).props.onPressOut({ nativeEvent: {} }));
    expect(spring).not.toHaveBeenCalled();
    expect(timing).not.toHaveBeenCalled();
    expect(flat(view(tree)).transform).toBeUndefined();
  });

  test('forwards testID and accessibility props to the Pressable', async () => {
    const tree = await mount(<Press testID="row" accessibilityLabel="btn" accessibilityRole="link" feedback="dim"><Text>x</Text></Press>);
    expect(view(tree).props.testID).toBe('row');
    expect(view(tree).props.accessibilityRole).toBe('link');
  });
});

describe('Press: hit area and haptics', () => {
  test('a small control grows its hit area to 44 pt (visible size untouched); a big one keeps hitSlop', async () => {
    const tree = await mount(<Press><Text>x</Text></Press>);
    expect(pressable(tree).props.hitSlop).toBe(6);
    await act(async () => pressable(tree).props.onLayout({ nativeEvent: { layout: { width: 28, height: 28 } } }));
    // 28 + 2 × 6 = 40 → ще по 2 з кожного боку
    expect(pressable(tree).props.hitSlop).toEqual({ top: 8, bottom: 8, left: 8, right: 8 });
    await act(async () => pressable(tree).props.onLayout({ nativeEvent: { layout: { width: 200, height: 52 } } }));
    expect(pressable(tree).props.hitSlop).toBe(6);
  });

  test('only the short axis grows; an explicit hitSlop is the base; minTarget={0} switches it off', async () => {
    const tree = await mount(<Press hitSlop={{ top: 4, bottom: 4, left: 0, right: 0 }}><Text>x</Text></Press>);
    await act(async () => pressable(tree).props.onLayout({ nativeEvent: { layout: { width: 120, height: 30 } } }));
    // 30 + 4 + 4 = 38 → ще по 3
    expect(pressable(tree).props.hitSlop).toEqual({ top: 7, bottom: 7, left: 0, right: 0 });
    const off = await mount(<Press minTarget={0}><Text>x</Text></Press>);
    await act(async () => pressable(off).props.onLayout({ nativeEvent: { layout: { width: 10, height: 10 } } }));
    // «зону дотику задає сам елемент»: без growth і без власного запасу
    expect(pressable(off).props.hitSlop).toBe(0);
  });

  test('minTarget={0} also drops the default 6 pt slop, so stacked rows do not steal touches; an explicit hitSlop always wins', async () => {
    // рядки списку: геометрія дотику така сама, як у сирого Pressable
    const row = await mount(<Press feedback="dim" minTarget={0}><Text>x</Text></Press>);
    expect(pressable(row).props.hitSlop).toBe(0);
    await act(async () => pressable(row).props.onLayout({ nativeEvent: { layout: { width: 360, height: 56 } } }));
    expect(pressable(row).props.hitSlop).toBe(0);

    const own = await mount(<Press minTarget={0} hitSlop={4}><Text>x</Text></Press>);
    expect(pressable(own).props.hitSlop).toBe(4);
    const zero = await mount(<Press hitSlop={0}><Text>x</Text></Press>);
    expect(pressable(zero).props.hitSlop).toBe(0);
    // хрестик чи чип: типовий запас лишається
    const chip = await mount(<Press feedback="dim"><Text>x</Text></Press>);
    expect(pressable(chip).props.hitSlop).toBe(6);
  });

  test('hitSlop={undefined} falls back to the default for the mode', async () => {
    const a = await mount(<Press hitSlop={undefined}><Text>x</Text></Press>);
    expect(pressable(a).props.hitSlop).toBe(6);
    const b = await mount(<Press hitSlop={undefined} minTarget={0}><Text>x</Text></Press>);
    expect(pressable(b).props.hitSlop).toBe(0);
  });

  test('haptic prop fires before onPress; without it nothing buzzes and onPress is passed as is', async () => {
    const order = [];
    Haptics.selectionAsync.mockImplementation(async () => order.push('haptic'));
    const onPress = jest.fn(() => order.push('press'));
    const tree = await mount(<Press haptic="selection" onPress={onPress}><Text>x</Text></Press>);
    await act(async () => pressable(tree).props.onPress({}));
    expect(order).toEqual(['haptic', 'press']);

    const plain = await mount(<Press onPress={onPress}><Text>x</Text></Press>);
    expect(pressable(plain).props.onPress).toBe(onPress);
  });

  test('GradBtn and SecBtn pass haptic, testID and label through', async () => {
    const tree = await mount(
      <>
        <GradBtn title="Go" onPress={() => {}} haptic="success" testID="go" accessibilityLabel="Go now" />
        <SecBtn title="Later" onPress={() => {}} testID="later" />
      </>
    );
    const go = pressables(tree)[0];
    expect(go.props.testID).toBe('go');
    expect(go.props.accessibilityLabel).toBe('Go now');
    await act(async () => go.props.onPress({}));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(pressables(tree)[1].props.testID).toBe('later');
  });
});

describe('haptic()', () => {
  test.each([
    ['selection', 'selectionAsync', []],
    ['light', 'impactAsync', ['light']],
    ['medium', 'impactAsync', ['medium']],
    ['success', 'notificationAsync', ['success']],
    ['warning', 'notificationAsync', ['warning']],
    ['error', 'notificationAsync', ['error']],
  ])('%s → Haptics.%s', (kind, fn, args) => {
    haptic(kind);
    expect(Haptics[fn]).toHaveBeenCalledTimes(1);
    expect(Haptics[fn]).toHaveBeenCalledWith(...args);
  });

  test('null, undefined and unknown kinds do nothing', () => {
    for (const k of [null, undefined, '', 'boom']) haptic(k);
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test('is a no-op on the web', () => {
    jest.replaceProperty(Platform, 'OS', 'web');
    haptic('selection');
    haptic('success');
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test('never throws: a rejected promise, a throwing module', async () => {
    Haptics.selectionAsync.mockImplementationOnce(() => Promise.reject(new Error('no engine')));
    expect(() => haptic('selection')).not.toThrow();
    Haptics.impactAsync.mockImplementationOnce(() => {
      throw new Error('sync');
    });
    expect(() => haptic('light')).not.toThrow();
    await Promise.resolve();
  });
});

describe('FadeIn: stagger and distance', () => {
  const cfgOf = (spy) => calls(spy).find((c) => c.duration === DUR.panel);

  test('index adds the stagger step to delay; EASE.out, DUR.panel, native driver', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await mount(<FadeIn delay={100} index={3}><Text>x</Text></FadeIn>);
    expect(cfgOf(timing)).toMatchObject({ toValue: 1, duration: DUR.panel, easing: EASE.out, delay: 100 + stagger(3), useNativeDriver: true });
  });

  test('a long list stops accumulating at the sixth step', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    await mount(<FadeIn index={40}><Text>x</Text></FadeIn>);
    expect(cfgOf(timing).delay).toBe(stagger(6));
    expect(stagger(40)).toBeLessThanOrEqual(6 * 80);
  });

  test('distance is dy under another name; dx wins; Reduce Motion keeps the fade and drops the shift', async () => {
    const lift = (tree) => host(tree, (n) => n.props.testID === 'fi')[0];
    const a = await mount(<FadeIn testID="fi" distance={20}><Text>x</Text></FadeIn>);
    expect(flat(lift(a)).transform).toEqual([{ translateY: 20 }]);
    const b = await mount(<FadeIn testID="fi" dy={8}><Text>x</Text></FadeIn>);
    expect(flat(lift(b)).transform).toEqual([{ translateY: 8 }]);
    const c = await mount(<FadeIn testID="fi" distance={20} dx={16}><Text>x</Text></FadeIn>);
    expect(flat(lift(c)).transform).toEqual([{ translateX: 16 }]);

    await setReduced(true);
    const d = await mount(<FadeIn testID="fi" distance={20}><Text>x</Text></FadeIn>);
    expect(flat(lift(d)).transform).toEqual([]);
    expect(flat(lift(d)).opacity).toBe(0);
  });

  test('unmounting stops the animation', async () => {
    const stop = jest.spyOn(Animated.Value.prototype, 'stopAnimation');
    const tree = await mount(<FadeIn><Text>x</Text></FadeIn>);
    await act(async () => tree.unmount());
    mounted.pop();
    expect(stop).toHaveBeenCalled();
  });
});

describe('Skeleton', () => {
  test('a card3 block of the given size, hidden from VoiceOver, pulsing in a loop', async () => {
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await mount(<Skeleton testID="sk" width={120} height={20} radius={6} />);
    const el = host(tree, (n) => n.props.testID === 'sk')[0];
    expect(flat(el)).toMatchObject({ width: 120, height: 20, borderRadius: 6, backgroundColor: THEMES.light.C.card3 });
    expect(el.props.accessible).toBe(false);
    expect(el.props.accessibilityElementsHidden).toBe(true);
    expect(el.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(loop).toHaveBeenCalledTimes(1);
  });

  test('takes the colour from the theme, or from a token handed in', async () => {
    const dark = await mount(<Skeleton testID="sk" />, 'berry-dark');
    expect(flat(host(dark, (n) => n.props.testID === 'sk')[0]).backgroundColor).toBe(THEMES['berry-dark'].C.card3);
    const own = await mount(<Skeleton testID="sk" color={THEMES.light.C.card2} />);
    expect(flat(host(own, (n) => n.props.testID === 'sk')[0]).backgroundColor).toBe(THEMES.light.C.card2);
  });

  test('Reduce Motion: static, no loop', async () => {
    await setReduced(true);
    const loop = jest.spyOn(Animated, 'loop');
    const tree = await mount(<Skeleton testID="sk" />);
    expect(loop).not.toHaveBeenCalled();
    expect(flat(host(tree, (n) => n.props.testID === 'sk')[0]).opacity).toBe(1);
  });
});

describe('Bar: progressbar for VoiceOver', () => {
  const bar = (tree) => host(tree, (n) => n.props.testID === 'bar')[0];

  test('role, label and a percentage (text, so iOS says “40%”, not “40”)', async () => {
    const tree = await mount(<Bar testID="bar" progress={0.4} accessibilityLabel="Level" />);
    expect(bar(tree).props).toMatchObject({
      accessible: true,
      accessibilityRole: 'progressbar',
      accessibilityLabel: 'Level',
      accessibilityValue: { min: 0, max: 100, now: 40, text: '40%' },
    });
  });

  test('clamps out-of-range and missing progress', async () => {
    const over = await mount(<Bar testID="bar" progress={7} />);
    expect(bar(over).props.accessibilityValue.now).toBe(100);
    const none = await mount(<Bar testID="bar" />);
    expect(bar(none).props.accessibilityValue).toMatchObject({ now: 0, text: '0%' });
  });

  test('decorative hides the bar when a number is written next to it', async () => {
    const tree = await mount(<Bar testID="bar" progress={0.3} decorative />);
    expect(bar(tree).props).toMatchObject({ accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
    expect(bar(tree).props.accessibilityRole).toBeUndefined();
  });

  test('colours default to the theme, explicit ones win; the fill still scales on X', async () => {
    const tree = await mount(<Bar testID="bar" progress={0.5} />, 'ocean-light');
    expect(flat(bar(tree)).backgroundColor).toBe(THEMES['ocean-light'].C.card2);
    const fill = bar(tree).children[0];
    expect(flat(fill.children?.[0] ?? fill).backgroundColor).toBe(THEMES['ocean-light'].C.accent);
    const own = await mount(<Bar testID="bar" progress={0.5} color="#123456" bg="#abcdef" />);
    expect(flat(bar(own)).backgroundColor).toBe('#abcdef');
  });
});

describe('Caps and T.caps are text: dim, not faint', () => {
  test('Caps uses C.dim', async () => {
    const tree = await mount(<Caps>Word of the day</Caps>);
    const text = host(tree, (n) => n.props.children === 'Word of the day')[0];
    expect(flat(text).color).toBe(THEMES.light.C.dim);
    expect(flat(text).textTransform).toBe('uppercase');
  });
});

describe('announce() and useAnnounce()', () => {
  beforeEach(() => {
    AccessibilityInfo.announceForAccessibility = jest.fn();
  });

  test('speaks on iOS only (Android has accessibilityLiveRegion; announcing too would double it)', () => {
    announce('Purchase failed');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Purchase failed');
    jest.replaceProperty(Platform, 'OS', 'android');
    announce('Again');
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
  });

  test('empty text, null and a missing API are ignored, not thrown', () => {
    for (const v of ['', null, undefined]) announce(v);
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    AccessibilityInfo.announceForAccessibility = undefined;
    expect(() => announce('x')).not.toThrow();
    AccessibilityInfo.announceForAccessibility = jest.fn(() => {
      throw new Error('native');
    });
    expect(() => announce('x')).not.toThrow();
  });

  test('useAnnounce says the message once per change and stays silent for an empty one', async () => {
    function Msg({ text }) {
      useAnnounce(text);
      return null;
    }
    let tree;
    await act(async () => {
      tree = create(<Msg text="" />);
    });
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    await act(async () => tree.update(<Msg text="Scan failed" />));
    await act(async () => tree.update(<Msg text="Scan failed" />));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledTimes(1);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Scan failed');
    await act(async () => tree.update(<Msg text="Try again" />));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenLastCalledWith('Try again');
    await act(async () => tree.unmount());
  });
});
