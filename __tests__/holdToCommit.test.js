// «Натисни й тримай»: обіцянка лише після HOLD_MS безперервного натиску,
// з наростаючими дотиками; відпустив раніше — усе спочатку. З «Менше руху»
// чи VoiceOver — один дотик (дія activate).
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import HoldToCommit, { HOLD_MS } from '../src/HoldToCommit';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success' },
}));

const LABELS = { label: 'Promise', holdHint: 'Press and hold', tapHint: 'Tap to promise', doneText: 'Deal!' };

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
const hint = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLiveRegion === 'polite')[0].props.children;
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));

test('holding for the full time commits, with rising ticks and a success at the end', async () => {
  const { tree, onCommit } = await render();
  expect(hint(tree)).toBe('Press and hold');
  expect(button(tree).props.accessibilityHint).toBe('Press and hold');
  await act(async () => button(tree).props.onPressIn());
  await advance(HOLD_MS - 1);
  expect(onCommit).not.toHaveBeenCalled();
  expect(Haptics.impactAsync.mock.calls.map(([s]) => s)).toEqual(['light', 'medium', 'heavy']);
  await advance(1);
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  expect(hint(tree)).toBe('Deal!');
  // відпустили вже після обіцянки — нічого не скидається
  await act(async () => button(tree).props.onPressOut());
  await advance(2000);
  expect(onCommit).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('releasing early resets: no promise, and the next hold starts over', async () => {
  const { tree, onCommit } = await render();
  await act(async () => button(tree).props.onPressIn());
  await advance(700);
  await act(async () => button(tree).props.onPressOut());
  await advance(3000);
  expect(onCommit).not.toHaveBeenCalled();
  expect(hint(tree)).toBe('Press and hold');
  // кільце вже спало до нуля — новий натиск знову триває HOLD_MS
  await act(async () => button(tree).props.onPressIn());
  await advance(HOLD_MS - 50);
  expect(onCommit).not.toHaveBeenCalled();
  await advance(60);
  expect(onCommit).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('a plain tap does nothing while the gesture is available', async () => {
  const { tree, onCommit } = await render();
  expect(button(tree).props.onPress).toBeUndefined();
  await advance(5000);
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('reduce motion: one tap promises', async () => {
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
  const { tree, onCommit } = await render();
  expect(hint(tree)).toBe('Tap to promise');
  await act(async () => button(tree).props.onPressIn()); // натиск не запускає кільце
  await advance(HOLD_MS * 2);
  expect(onCommit).not.toHaveBeenCalled();
  await act(async () => button(tree).props.onPress());
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
  await act(async () => tree.unmount());
});

test('VoiceOver: a button with the activate action, no hold hint', async () => {
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(true));
  const { tree, onCommit } = await render();
  const b = button(tree);
  expect(b.props).toMatchObject({ accessibilityRole: 'button', accessibilityLabel: 'Promise', accessibilityHint: undefined });
  expect(b.props.accessibilityActions).toEqual([{ name: 'activate' }]);
  await act(async () => b.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  // двічі не обіцяємо
  await act(async () => button(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(button(tree).props.accessibilityState).toEqual({ disabled: true });
  await act(async () => tree.unmount());
});
