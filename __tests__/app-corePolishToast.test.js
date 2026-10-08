// Підтвердження покупки Pro (src/ProToast.js): рух за src/motion.js, «Менше
// руху», VoiceOver, час на екрані, текст п'ятьма мовами.
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import ProToast from '../src/ProToast';
import { SHOW_MS, SHOW_MS_READER } from '../src/AchievementToast';
import { useReducedMotion } from '../src/motion';
import { STRINGS, makeT } from '../src/i18n';

const t = makeT('en');
const PAID = { trial: false, reminded: false };

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
  let tree;
  await act(async () => {
    tree = create(<ProToast toast={PAID} onHide={onHide} t={t} {...props} />);
  });
  mounted.push(tree);
  return { tree, onHide };
}

const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const card = (tree) => tree.root.find((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function');
const style = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.style && Array.isArray(n.props.style.transform))[0].props.style;
const texts = (tree) => tree.root.findAll((n) => n.type === 'Text').map((n) => [].concat(n.props.children).join(''));

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

describe('what it says', () => {
  test('nothing to show: nothing is drawn, nothing announced', async () => {
    const { tree } = await render({ toast: null });
    expect(tree.toJSON()).toBeNull();
    expect(announce).not.toHaveBeenCalled();
  });

  test.each([
    ['paid', PAID, 'proToastText'],
    ['trial, reminder set', { trial: true, reminded: true }, 'proToastTrialRemind'],
    ['trial, no reminder', { trial: true, reminded: false }, 'proToastTrial'],
  ])('%s', async (_n, toast, key) => {
    const { tree } = await render({ toast });
    expect(texts(tree)).toEqual(expect.arrayContaining([t('proToastTitle'), t(key)]));
    expect(card(tree).props.accessibilityLabel).toBe(`${t('proToastTitle')}. ${t(key)}`);
  });

  test('a trial without a reminder never promises one', () => {
    for (const lang of ['en', 'uk', 'de', 'es', 'ru']) {
      const s = STRINGS[lang];
      expect(s.proToastTrial).not.toMatch(/2/);
      expect(s.proToastTrialRemind).toMatch(/2/);
    }
  });
});

describe('VoiceOver', () => {
  test('announced once when it appears, not repeated on a re-render with the same toast', async () => {
    const { tree, onHide } = await render();
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(`${t('proToastTitle')}. ${t('proToastText')}`);
    await act(async () => tree.update(<ProToast toast={PAID} onHide={onHide} t={t} />));
    expect(announce).toHaveBeenCalledTimes(1);
  });

  test('the card has a name and a “Close” action; the action hides it', async () => {
    const { tree, onHide } = await render();
    const c = card(tree);
    expect(c.props.accessibilityActions).toEqual([{ name: 'dismiss', label: t('close') }]);
    await act(async () => c.props.onAccessibilityAction({ nativeEvent: { actionName: 'dismiss' } }));
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('stays longer with VoiceOver on', async () => {
    AccessibilityInfo.isScreenReaderEnabled.mockResolvedValue(true);
    const { onHide } = await render();
    await advance(SHOW_MS + 500);
    expect(onHide).not.toHaveBeenCalled();
    await advance(SHOW_MS_READER - SHOW_MS);
    expect(onHide).toHaveBeenCalledTimes(1);
  });
});

describe('time and touch', () => {
  test('leaves by itself after 3.6 s, once', async () => {
    const { onHide } = await render();
    await advance(SHOW_MS - 100);
    expect(onHide).not.toHaveBeenCalled();
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
    await advance(5000);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('a tap hides it at once (170 ms), and a second tap does not hide twice', async () => {
    const { tree, onHide } = await render();
    await act(async () => card(tree).props.onPress());
    await act(async () => card(tree).props.onPress());
    await advance(400);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  test('a toast replaced by null mid-way leaves no timer behind', async () => {
    const { tree, onHide } = await render();
    await act(async () => tree.update(<ProToast toast={null} onHide={onHide} t={t} />));
    await advance(10000);
    expect(onHide).not.toHaveBeenCalled();
  });
});

describe('Reduce Motion', () => {
  test('with motion the card comes from above with a slight scale (never from zero)', async () => {
    await reduceMotion(false);
    const { tree } = await render();
    const tr = style(tree).transform;
    expect(tr.some((x) => 'translateY' in x)).toBe(true);
    // на старті масштаб 0.96 (A.setValue(0) -> outputRange[0]), а не нуль
    expect(tr.find((x) => 'scale' in x).scale).toBeCloseTo(0.96, 5);
  });

  test('without motion there is neither scale nor shift: only the fade', async () => {
    await reduceMotion(true);
    const { tree } = await render();
    expect(style(tree).transform.some((x) => 'scale' in x)).toBe(false);
    expect(style(tree).transform.every((x) => !x.translateY || x.translateY._config.outputRange.every((v) => v === 0))).toBe(true);
    await reduceMotion(false);
  });
});

describe('five languages', () => {
  test.each(['en', 'uk', 'de', 'es', 'ru'])('%s: all four lines exist and are not dashes', (lang) => {
    const s = STRINGS[lang];
    for (const k of ['proToastTitle', 'proToastText', 'proToastTrial', 'proToastTrialRemind']) {
      expect(typeof s[k]).toBe('string');
      expect(s[k].length).toBeGreaterThan(3);
      expect(s[k]).not.toMatch(/[–—]/);
    }
  });
});
