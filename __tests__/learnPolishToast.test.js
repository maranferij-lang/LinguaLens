// Тост досягнення, полірування жовтня 2026: VoiceOver його чує, має підказку
// «поділитись» і дію «закрити», тримається довше (WCAG 2.2.1); під «Менше
// руху» без масштабу.
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import AchievementToast, { SHOW_MS, SHOW_MS_READER } from '../src/AchievementToast';
import { useReducedMotion } from '../src/motion';
import { makeT } from '../src/i18n';

const t = makeT('en');
const ACH = { id: 'first_word' };

const mounted = [];
afterEach(async () => {
  while (mounted.length) await act(async () => mounted.pop().unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

let announce;
beforeEach(() => {
  jest.useFakeTimers();
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear();
  jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});

async function render(props) {
  const onHide = jest.fn();
  const onPress = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<AchievementToast achievement={ACH} onHide={onHide} onPress={onPress} t={t} {...props} />);
  });
  mounted.push(tree);
  return { tree, onHide, onPress };
}

const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const card = (tree) => tree.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const style = (tree) => {
  const host = tree.root.findAll((n) => typeof n.type === 'string' && n.props.style && Array.isArray(n.props.style.transform))[0];
  return host.props.style;
};

// Свіже значення «Менше руху»: хук питає систему при монтуванні
function Probe() {
  useReducedMotion();
  return null;
}
async function reduceMotion(on) {
  AccessibilityInfo.isReduceMotionEnabled.mockResolvedValue(on);
  let tree;
  await act(async () => {
    tree = create(<Probe />);
  });
  await act(async () => tree.unmount());
}

describe('VoiceOver', () => {
  test('the unlock is announced when the toast appears: iOS does not speak liveRegions', async () => {
    await render();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(`${t('unlocked')}. ${t('ach_first_word')}`);
  });

  test('a new achievement is announced again, the same one is not repeated on re-render', async () => {
    const { tree, onHide, onPress } = await render();
    await act(async () => tree.update(<AchievementToast achievement={ACH} onHide={onHide} onPress={onPress} t={t} />));
    expect(announce).toHaveBeenCalledTimes(1);
    await act(async () => tree.update(<AchievementToast achievement={{ id: 'words_10' }} onHide={onHide} onPress={onPress} t={t} />));
    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce).toHaveBeenLastCalledWith(`${t('unlocked')}. ${t('ach_words_10')}`);
  });

  test('the card has a name, a hint about sharing and a “Close” action', async () => {
    const { tree, onHide, onPress } = await render();
    const c = card(tree);
    expect(c.props.accessibilityLabel).toBe(`${t('unlocked')}, ${t('ach_first_word')}`);
    expect(c.props.accessibilityHint).toBe(t('achShareHint'));
    expect(c.props.accessibilityActions).toEqual([{ name: 'dismiss', label: t('close') }]);

    await act(async () => c.props.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } }));
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onPress).not.toHaveBeenCalled();
  });

  test('a tap still shares and then hides', async () => {
    const { tree, onHide, onPress } = await render();
    await act(async () => card(tree).props.onPress());
    expect(onPress).toHaveBeenCalledWith(ACH);
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('stays on screen longer with VoiceOver on, so it can be found and read', async () => {
    expect(SHOW_MS).toBe(3600);
    expect(SHOW_MS_READER).toBeGreaterThanOrEqual(8000);
    AccessibilityInfo.isScreenReaderEnabled.mockResolvedValue(true);
    const { onHide } = await render();
    await advance(SHOW_MS + 500);
    expect(onHide).not.toHaveBeenCalled();
    await advance(SHOW_MS_READER - SHOW_MS);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('without VoiceOver it leaves after 3.6 s, as before', async () => {
    const { onHide } = await render();
    await advance(SHOW_MS - 100);
    expect(onHide).not.toHaveBeenCalled();
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('VoiceOver answering late: no second announcement, and the timer restarts with the longer time', async () => {
    let resolve;
    AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => new Promise((r) => (resolve = r)));
    const { onHide } = await render();
    await advance(1000);
    await act(async () => resolve(true));
    // таймер почався заново з урахуванням читача, анонс не повторився
    expect(announce).toHaveBeenCalledTimes(1);
    await advance(SHOW_MS_READER - 100);
    expect(onHide).not.toHaveBeenCalled();
    await advance(500);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('Reduce Motion', () => {
  test('with motion the card eases in with a slight scale', async () => {
    await reduceMotion(false);
    const { tree } = await render();
    expect(style(tree).transform.some((x) => 'scale' in x)).toBe(true);
    expect(style(tree).transform.some((x) => 'translateY' in x)).toBe(true);
  });

  test('without motion there is neither scale nor shift: only the fade', async () => {
    await reduceMotion(true);
    const { tree } = await render();
    expect(style(tree).transform.some((x) => 'scale' in x)).toBe(false);
    expect(style(tree).transform.every((x) => !x.translateY)).toBe(true);
    await reduceMotion(false);
  });
});
