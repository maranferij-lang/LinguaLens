// «Обіцянка 2.0» (onboarding.md §8): кільце довкола вогника, HOLD_MS =
// 1500 безперервного натиску; дотики наростають — 5 × Soft, 2 × Medium, у
// кінці Success; відпустив раніше — кільце мʼяко стікає, і підказка просить
// тримати до кінця кола. 14 іскор — лише з рухом. З «Менше руху» чи
// VoiceOver — один дотик (дія activate), без іскор.
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import HoldToCommit, { DRAIN_MS, HOLD_MS, SPARKS, TICKS } from '../src/HoldToCommit';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success' },
}));

const LABELS = {
  label: 'Promise',
  holdHint: 'Press and hold',
  keepHint: 'Keep holding…',
  againHint: 'Hold until the ring is full',
  tapHint: 'Tap to promise',
  longerHint: 'Hold a little longer',
  doneText: 'Deal!',
  doneSub: 'See you tomorrow for a new word',
};

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});
afterEach(() => {
  jest.useRealTimers();
});

async function render() {
  const onCommit = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<HoldToCommit onCommit={onCommit} {...LABELS} />);
  });
  // системні налаштування доступності приходять промісом
  await act(async () => {});
  return { tree, onCommit };
}
// сам Pressable (у нативного View під ним жестів немає — лише responder)
const button = (tree) => tree.root.find((n) => n.props.testID === 'hold-to-commit' && 'onPressIn' in n.props);
const hint = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'commit-hint').props.children;
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const sparks = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'commit-sparks');
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));

test('1500 ms of holding: five soft ticks, two medium ones, then Success, “Deal!” and 14 sparks', async () => {
  expect(HOLD_MS).toBe(1500);
  expect(TICKS.map((x) => x.style)).toEqual(['Soft', 'Soft', 'Soft', 'Soft', 'Soft', 'Medium', 'Medium']);
  const { tree, onCommit } = await render();
  expect(hint(tree)).toBe('Press and hold');
  expect(button(tree).props.accessibilityHint).toBe('Press and hold');
  await act(async () => button(tree).props.onPressIn());
  expect(hint(tree)).toBe('Keep holding…');
  await advance(HOLD_MS - 1);
  expect(onCommit).not.toHaveBeenCalled();
  expect(Haptics.impactAsync.mock.calls.map(([s]) => s)).toEqual(['soft', 'soft', 'soft', 'soft', 'soft', 'medium', 'medium']);
  expect(sparks(tree)).toHaveLength(0);
  await advance(1);
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith({ mode: 'hold', releases: 0 });
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  expect(hint(tree)).toBe('Deal!');
  expect(texts(tree)).toContain('See you tomorrow for a new word');
  // іскри — рівно 14
  expect(SPARKS).toBe(14);
  expect(sparks(tree)).toHaveLength(1);
  expect(sparks(tree)[0].children).toHaveLength(SPARKS);
  // відпустили вже після обіцянки — нічого не скидається
  await act(async () => button(tree).props.onPressOut());
  await advance(2000);
  expect(onCommit).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('three flames swap as the ring fills: first day, a few days, lit', async () => {
  const { tree } = await render();
  const layers = [1, 2, 3].map((i) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'commit-flame-' + i));
  expect(layers).toHaveLength(3);
  await act(async () => tree.unmount());
});

test('released early: the ring drains softly, the hint asks to hold to the end, the next hold starts over', async () => {
  const { tree, onCommit } = await render();
  await act(async () => button(tree).props.onPressIn());
  await advance(800);
  await act(async () => button(tree).props.onPressOut());
  expect(hint(tree)).toBe('Hold until the ring is full');
  await advance(DRAIN_MS + 50);
  expect(onCommit).not.toHaveBeenCalled();
  // без «Тримай довше»: це була справжня спроба, а не тап
  expect(Haptics.impactAsync).not.toHaveBeenCalledWith('light');
  // кільце вже стекло до нуля — новий натиск знову триває HOLD_MS
  await act(async () => button(tree).props.onPressIn());
  await advance(HOLD_MS - 50);
  expect(onCommit).not.toHaveBeenCalled();
  await advance(60);
  expect(onCommit).toHaveBeenCalledWith({ mode: 'hold', releases: 1 });
  await act(async () => tree.unmount());
});

test('a plain tap does nothing while the gesture is available', async () => {
  const { tree, onCommit } = await render();
  expect(button(tree).props.onPress).toBeUndefined();
  await advance(5000);
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('reduce motion: one tap promises, without sparks', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
  const { tree, onCommit } = await render();
  expect(hint(tree)).toBe('Tap to promise');
  await act(async () => button(tree).props.onPressIn()); // натиск не запускає кільце
  await advance(HOLD_MS * 2);
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => button(tree).props.onPress());
  expect(onCommit).toHaveBeenCalledWith({ mode: 'tap', releases: 0 });
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  expect(hint(tree)).toBe('Deal!');
  expect(sparks(tree)).toHaveLength(0);
  await act(async () => tree.unmount());
});

test('VoiceOver: a button with the activate action, no hold hint, no sparks', async () => {
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(true));
  const { tree, onCommit } = await render();
  const b = button(tree);
  expect(b.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Promise', accessibilityHint: undefined });
  expect(b.props.accessibilityActions).toEqual([{ name: 'activate' }]);
  await act(async () => b.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(sparks(tree)).toHaveLength(0);
  // двічі не обіцяємо
  await act(async () => button(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(button(tree).props.accessibilityState).toEqual({ disabled: true });
  await act(async () => tree.unmount());
});
