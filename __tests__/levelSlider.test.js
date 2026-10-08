// Слайдер рівня 1–10: VoiceOver, клавіатура, перетягування й тап по доріжці.
// Головне — дискретність: хоч би як рухався палець, значення лише цілі 1…10,
// і на кожній зупинці — один тактильний «клац».
import { useState } from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import LevelSlider, { levelAt, offsetFor } from '../src/LevelSlider';
import { makeT } from '../src/i18n';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const t = makeT('en');
const WIDTH = 300; // шар слайдера; доріжка для центру бігунка — 270, зупинка кожні 30
const THUMB = 30;

// Керований слайдер, як в онбордингу: значення живе у власника.
function Harness({ initial = 5, onChange }) {
  const [v, setV] = useState(initial);
  return (
    <LevelSlider
      value={v}
      label="Your level: English"
      t={t}
      onChange={(n) => {
        onChange(n);
        setV(n);
      }}
    />
  );
}

async function render(props = {}) {
  const onChange = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<Harness onChange={onChange} {...props} />);
  });
  const slider = () => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable');
  await act(async () => slider().props.onLayout({ nativeEvent: { layout: { width: WIDTH, height: 48 } } }));
  return { tree, slider, onChange };
}

const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

beforeEach(() => {
  Haptics.selectionAsync.mockClear();
});

test('stops and positions: ten whole values on the track', () => {
  expect(offsetFor(1, 270)).toBe(0);
  expect(offsetFor(10, 270)).toBe(270);
  expect(levelAt(0, 270)).toBe(1);
  expect(levelAt(44, 270)).toBe(2); // ближче до другої зупинки (30), ніж до третьої (60)
  expect(levelAt(-50, 270)).toBe(1);
  expect(levelAt(9999, 270)).toBe(10);
  expect(levelAt(100, 0)).toBe(1); // ширина ще невідома
});

test('VoiceOver: an adjustable element that reads “8 of 10, B2+” and names the language', async () => {
  const { tree, slider } = await render({ initial: 8 });
  const p = slider().props;
  expect(p.accessible).toBe(true);
  expect(p.accessibilityLabel).toBe('Your level: English');
  expect(p.accessibilityValue).toEqual({ min: 1, max: 10, now: 8, text: '8 of 10, B2+' });
  expect(p.accessibilityActions.map((a) => a.name)).toEqual(['increment', 'decrement']);
  expect(p.accessibilityHint).toBe(t('lvl8'));
  // велике число, бейдж і опис видно, але VoiceOver їх не дублює
  expect(texts(tree)).toEqual(expect.arrayContaining(['B2+', t('lvl8')]));
  expect(tree.root.findAll((n) => n.props.children === 8).length).toBeGreaterThan(0);
  const head = tree.root.find((n) => n.props.accessibilityElementsHidden && n.findAll((c) => c.props.children === 'B2+').length);
  expect(head.props.importantForAccessibility).toBe('no-hide-descendants');
  await act(async () => tree.unmount());
});

test('increment and decrement step by one, stop at the ends, tick once per step', async () => {
  const { tree, slider, onChange } = await render({ initial: 9 });
  const action = (actionName) => act(async () => slider().props.onAccessibilityAction({ nativeEvent: { actionName } }));
  await action('increment');
  expect(slider().props.accessibilityValue).toMatchObject({ now: 10, text: '10 of 10, C2' });
  await action('increment'); // уже край — нічого
  expect(onChange.mock.calls).toEqual([[10]]);
  await action('decrement');
  await action('decrement');
  expect(slider().props.accessibilityValue.now).toBe(8);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(3);
  await act(async () => tree.unmount());
});

test('two quick swipes before the screen re-renders still give +2', async () => {
  const { tree, slider, onChange } = await render({ initial: 4 });
  await act(async () => {
    const p = slider().props;
    p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
    p.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } });
  });
  expect(onChange.mock.calls).toEqual([[5], [6]]);
  expect(slider().props.accessibilityValue.now).toBe(6);
  await act(async () => tree.unmount());
});

test('keyboard: arrows ±1, Home and End jump to the ends, other keys pass through', async () => {
  const { tree, slider } = await render({ initial: 5 });
  const key = async (k) => {
    const preventDefault = jest.fn();
    await act(async () => slider().props.onKeyDown({ nativeEvent: { key: k }, preventDefault }));
    return preventDefault;
  };
  await key('ArrowRight');
  await key('ArrowUp');
  expect(slider().props.accessibilityValue.now).toBe(7);
  await key('ArrowLeft');
  expect(slider().props.accessibilityValue.now).toBe(6);
  await key('ArrowDown');
  expect(slider().props.accessibilityValue.now).toBe(5);
  await key('End');
  expect(slider().props.accessibilityValue.now).toBe(10);
  expect((await key('Home')).mock.calls).toHaveLength(1);
  expect(slider().props.accessibilityValue.now).toBe(1);
  expect((await key('Tab')).mock.calls).toHaveLength(0); // фокус іде далі
  expect(slider().props.accessibilityValue.now).toBe(1);
  await act(async () => tree.unmount());
});

// ---------- палець ----------
// PanResponder рахує зсув із touchHistory, тож відтворюємо її, як це робить RN.
function touchEvent(locationX, pageX, prevPageX, ts) {
  return {
    nativeEvent: { locationX, pageX, timestamp: ts },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: ts,
      touchBank: [
        {
          touchActive: true,
          startPageX: pageX,
          startPageY: 0,
          startTimeStamp: ts,
          currentPageX: pageX,
          currentPageY: 0,
          currentTimeStamp: ts,
          previousPageX: prevPageX,
          previousPageY: 0,
          previousTimeStamp: ts - 1,
        },
      ],
    },
  };
}

function touchLayer(tree) {
  return tree.root.find((n) => typeof n.type === 'string' && typeof n.props.onResponderGrant === 'function');
}

// Палець ставимо на місце зупинки from і ведемо до to по одній зупинці.
async function drag(tree, from, to) {
  const layer = () => touchLayer(tree);
  const x0 = offsetFor(from, WIDTH - THUMB) + THUMB / 2;
  let ts = 10;
  let x = x0;
  await act(async () => layer().props.onResponderGrant(touchEvent(x0, x0, x0, ts)));
  const dir = Math.sign(to - from);
  for (let v = from + dir; dir && v !== to + dir; v += dir) {
    const next = x + dir * 30;
    ts += 16;
    await act(async () => layer().props.onResponderMove(touchEvent(next, next, x, ts)));
    x = next;
  }
  await act(async () => layer().props.onResponderRelease(touchEvent(x, x, x, ts + 16)));
}

test('dragging moves through the stops with a tick at each one and lands on a whole value', async () => {
  const { tree, slider, onChange } = await render({ initial: 3 });
  await drag(tree, 3, 8);
  expect(onChange.mock.calls.map((c) => c[0])).toEqual([4, 5, 6, 7, 8]);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(5);
  expect(slider().props.accessibilityValue.now).toBe(8);
  expect(texts(tree)).toContain(t('lvl8'));
  await act(async () => tree.unmount());
});

test('a tap on the track jumps straight to that stop', async () => {
  const { tree, slider, onChange } = await render({ initial: 5 });
  await drag(tree, 9, 9); // торкнулись біля дев'ятки й відпустили
  expect(onChange.mock.calls).toEqual([[9]]);
  expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  expect(slider().props.accessibilityValue).toMatchObject({ now: 9, text: '9 of 10, C1' });
  await act(async () => tree.unmount());
});

test('a swipe is not handed over to the scrolling screen', async () => {
  const { tree } = await render();
  expect(touchLayer(tree).props.onResponderTerminationRequest()).toBe(false);
  await act(async () => tree.unmount());
});

describe('reduce motion', () => {
  afterEach(() => jest.restoreAllMocks());

  test('the thumb snaps to the stop with a spring normally…', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
    const spring = jest.spyOn(Animated, 'spring');
    const { tree } = await render({ initial: 5 });
    await drag(tree, 2, 2);
    expect(spring).toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('…and without any animation when Reduce Motion is on', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    const { tree, slider } = await render({ initial: 5 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    await drag(tree, 2, 2);
    await act(async () => slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    expect(slider().props.accessibilityValue.now).toBe(3);
    expect(spring).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
