// Частини сканера: наліпка останнього слова (поява після аркуша), кнопка зуму
// (чесний підпис), щипок (без стрибка зуму) і хрестик першого скану.
import { Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import LastWord, { ENTER_DELAY } from '../src/scanner/LastWord';
import ZoomButton, { ZOOM_PRESETS, exactPreset } from '../src/scanner/ZoomButton';
import TopBar from '../src/scanner/TopBar';
import { MAX_ZOOM, pinchStep } from '../src/scanner/pinch';
import { IcSearch } from '../src/icons';
import { track } from '../src/analytics';
import { DUR } from '../src/motion';
import { makeT } from '../src/i18n';

jest.mock('../src/analytics', () => ({ ...jest.requireActual('../src/analytics'), track: jest.fn() }));

const t = makeT('en');
const A = { id: 'a', word: 'la silla', translation: 'chair', lang: 'es', addedAt: 1 };
const B = { id: 'b', word: 'la mesa', translation: 'table', lang: 'es', addedAt: 2 };

// ───────────────────────────────────────────────────────────────────────────
describe('last-word sticker', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const el = (props) => <LastWord t={t} onPress={() => {}} {...props} />;
  function mount(props) {
    let tree;
    act(() => {
      tree = create(el(props));
    });
    return tree;
  }
  const update = (tree, props) => act(() => tree.update(el(props)));
  const entrances = (timing) => timing.mock.calls.filter(([, cfg]) => cfg.toValue === 1 && cfg.duration === DUR.micro);

  test('the component is memoised (a pinch re-renders the scanner at touch rate)', () => {
    expect(LastWord.$$typeof).toBe(Symbol.for('react.memo'));
  });

  test('a word changing in front of the person appears at once: fade 0 → 1 and a 0.7 → 1 spring, no overshoot, native driver', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const spring = jest.spyOn(Animated, 'spring');
    const tree = mount({ word: A });
    expect(entrances(timing)).toHaveLength(0);
    update(tree, { word: B });
    expect(entrances(timing)).toHaveLength(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ useNativeDriver: true });
    expect(spring).toHaveBeenCalledTimes(1);
    // пружина без перельоту: критично задемпфована
    const cfg = spring.mock.calls[0][1];
    expect(cfg.toValue).toBe(1);
    expect(cfg.damping).toBeGreaterThanOrEqual(2 * Math.sqrt(cfg.stiffness) - 1);
    act(() => tree.unmount());
  });

  test('saved under a sheet: nothing plays while it is open, the sticker appears ENTER_DELAY after the sheet starts to leave', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const set = jest.spyOn(Animated.Value.prototype, 'setValue');
    const tree = mount({ word: A, paused: true });
    // на старті під аркушем наліпка вже бачена (змонтована разом із ним)? ні: id ще не показувався
    update(tree, { word: A, paused: false });
    set.mockClear();
    timing.mockClear();
    // нове слово збережено під відкритим аркушем
    update(tree, { word: B, paused: true });
    expect(set).toHaveBeenCalledWith(0);
    act(() => jest.advanceTimersByTime(5000));
    expect(entrances(timing)).toHaveLength(0);
    // аркуш закрився
    update(tree, { word: B, paused: false });
    act(() => jest.advanceTimersByTime(ENTER_DELAY - 1));
    expect(entrances(timing)).toHaveLength(0);
    act(() => jest.advanceTimersByTime(1));
    expect(entrances(timing)).toHaveLength(1);
    act(() => tree.unmount());
  });

  test('the very first word ever (the sticker mounts under the open sheet) gets the same entrance', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const tree = mount({ word: A, paused: true });
    act(() => jest.advanceTimersByTime(2000));
    expect(entrances(timing)).toHaveLength(0);
    update(tree, { word: A, paused: false });
    act(() => jest.advanceTimersByTime(ENTER_DELAY));
    expect(entrances(timing)).toHaveLength(1);
    act(() => tree.unmount());
  });

  test('a sheet that saved nothing (same word) plays nothing when it closes', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const tree = mount({ word: A });
    update(tree, { word: A, paused: true });
    update(tree, { word: A, paused: false });
    act(() => jest.advanceTimersByTime(2000));
    expect(timing).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('the sheet opens again before the delay ran out: the entrance waits for the next close, and plays once', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const tree = mount({ word: A });
    update(tree, { word: B, paused: true });
    update(tree, { word: B, paused: false });
    act(() => jest.advanceTimersByTime(ENTER_DELAY - 50));
    update(tree, { word: B, paused: true });
    act(() => jest.advanceTimersByTime(2000));
    expect(entrances(timing)).toHaveLength(0);
    update(tree, { word: B, paused: false });
    act(() => jest.advanceTimersByTime(ENTER_DELAY));
    expect(entrances(timing)).toHaveLength(1);
    act(() => tree.unmount());
  });

  test('“Reduce Motion”: opacity only, no scale spring', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const spring = jest.spyOn(Animated, 'spring');
    const tree = mount({ word: A, reduced: true });
    update(tree, { word: B, reduced: true, paused: true });
    update(tree, { word: B, reduced: true, paused: false });
    act(() => jest.advanceTimersByTime(ENTER_DELAY));
    expect(entrances(timing)).toHaveLength(1);
    expect(spring).not.toHaveBeenCalled();
    act(() => tree.unmount());
  });

  test('unmounting before the delay cancels the entrance', () => {
    const timing = jest.spyOn(Animated, 'timing');
    const tree = mount({ word: A });
    update(tree, { word: B, paused: true });
    update(tree, { word: B, paused: false });
    act(() => tree.unmount());
    act(() => jest.advanceTimersByTime(2000));
    expect(entrances(timing)).toHaveLength(0);
  });

  test('disabled while recognising: dimmed, not pressable, and VoiceOver says so', () => {
    const onPress = jest.fn();
    const tree = mount({ word: A, disabled: true, onPress });
    const button = tree.root.find((n) => n.props.testID === 'last-word' && typeof n.props.onPress === 'function');
    expect(button.props.disabled).toBe(true);
    expect(button.props.accessibilityState).toEqual({ disabled: true });
    expect([].concat(button.props.style).flat().find((x) => x && x.opacity !== undefined).opacity).toBeLessThan(1);
    act(() => tree.unmount());
  });

  test('no word, no sticker', () => {
    const tree = mount({ word: null });
    expect(tree.toJSON()).toBeNull();
    act(() => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('zoom button', () => {
  const mount = (zoom, onChange = jest.fn()) => {
    let tree;
    act(() => {
      tree = create(<ZoomButton zoom={zoom} onChange={onChange} t={t} />);
    });
    return { tree, onChange };
  };
  const button = (tree) => tree.root.find((n) => n.props.testID === 'zoom' && typeof n.props.onPress === 'function');
  const labels = (tree) => tree.root.findAll((n) => n.type === 'Text').map((n) => n.props.children);

  beforeEach(() => track.mockClear());
  afterEach(() => jest.restoreAllMocks());

  test('presets keep their labels and cycle 1× → 2× → 1×', () => {
    let { tree, onChange } = mount(0);
    expect(labels(tree)).toEqual(['1×']);
    expect(button(tree).props.accessibilityLabel).toBe(t('scanZoomA11y', { z: '1×' }));
    act(() => button(tree).props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(0.12);
    expect(track).toHaveBeenLastCalledWith('scan_zoom', { preset: '2×' });
    act(() => tree.unmount());

    ({ tree, onChange } = mount(0.12));
    expect(labels(tree)).toEqual(['2×']);
    act(() => button(tree).props.onPress());
    expect(onChange).toHaveBeenLastCalledWith(0);
    act(() => tree.unmount());
  });

  test('after a pinch there is no number to lie with: a magnifier, and a tap goes back to 1×', () => {
    const buzz = jest.spyOn(Haptics, 'selectionAsync');
    for (const zoom of [0.03, 0.2, MAX_ZOOM]) {
      const { tree, onChange } = mount(zoom);
      expect(labels(tree)).toEqual([]);
      expect(tree.root.findAllByType(IcSearch)).toHaveLength(1);
      expect(button(tree).props.accessibilityLabel).toBe(t('scanZoomResetA11y'));
      act(() => button(tree).props.onPress());
      expect(onChange).toHaveBeenCalledWith(0);
      expect(track).toHaveBeenLastCalledWith('scan_zoom', { preset: '1×' });
      act(() => tree.unmount());
    }
    expect(buzz).toHaveBeenCalledTimes(3);
  });

  test('a preset still counts as a preset within a hair of its value', () => {
    expect(exactPreset(0.1204)).toBe(ZOOM_PRESETS[1]);
    expect(exactPreset(0.005)).toBe(ZOOM_PRESETS[0]);
    expect(exactPreset(0.06)).toBeNull();
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('pinch', () => {
  const two = (d, x = 100) => [
    { pageX: x, pageY: 300 },
    { pageX: x + d, pageY: 300 },
  ];

  test('the first two-finger event only takes the base, the next one zooms (+0.35 per doubling)', () => {
    let step = pinchStep(null, two(100), 0);
    expect(step).toEqual({ base: { d: 100, z: 0 }, zoom: null });
    step = pinchStep(step.base, two(200), 0);
    expect(step.zoom).toBeCloseTo(0.35, 5);
    // назад до тієї самої відстані — тієї самої точки
    expect(pinchStep(step.base, two(100), 0.35).zoom).toBeCloseTo(0, 5);
  });

  test('zoom stays inside 0 … MAX_ZOOM', () => {
    expect(pinchStep({ d: 100, z: 0.5 }, two(1000), 0.5).zoom).toBe(MAX_ZOOM);
    expect(pinchStep({ d: 100, z: 0.1 }, two(1), 0.1).zoom).toBe(0);
  });

  test('lifting one finger drops the base, so putting it back at another distance does not make the zoom jump', () => {
    let step = pinchStep(null, two(100), 0.1);
    step = pinchStep(step.base, two(150), 0.1);
    const zoomBefore = step.zoom;
    expect(zoomBefore).toBeGreaterThan(0.1);
    // палець піднято
    step = pinchStep(step.base, [{ pageX: 100, pageY: 300 }], zoomBefore);
    expect(step).toEqual({ base: null, zoom: null });
    // повернувся на втричі більшу відстань: зуму не стрибає, відлік іде від поточного
    step = pinchStep(step.base, two(450), zoomBefore);
    expect(step).toEqual({ base: { d: 450, z: zoomBefore }, zoom: null });
    step = pinchStep(step.base, two(450), zoomBefore);
    expect(step.zoom).toBeCloseTo(zoomBefore, 5);
  });

  test('no touches, three touches or two fingers on one spot give no zoom and no division by zero', () => {
    expect(pinchStep({ d: 10, z: 0 }, [], 0)).toEqual({ base: null, zoom: null });
    expect(pinchStep({ d: 10, z: 0 }, [{}, {}, {}], 0)).toEqual({ base: null, zoom: null });
    expect(pinchStep(null, two(0), 0.2)).toEqual({ base: null, zoom: null });
    expect(pinchStep({ d: 0, z: 0.2 }, two(80), 0.2)).toEqual({ base: { d: 80, z: 0.2 }, zoom: null });
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('top bar of the first scan', () => {
  const bar = (props) => {
    let tree;
    act(() => {
      tree = create(
        <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } }}>
          <TopBar firstScan lang="es" onClose={() => {}} wide t={t} {...props} />
        </SafeAreaProvider>
      );
    });
    return tree;
  };
  const close = (tree) => tree.root.find((n) => n.props.testID === 'scan-close' && typeof n.props.onPress === 'function');

  test('the close button is live by default and off while a scan is in flight', () => {
    let tree = bar();
    expect(close(tree).props.disabled).toBeFalsy();
    act(() => tree.unmount());
    tree = bar({ closeDisabled: true });
    expect(close(tree).props.disabled).toBe(true);
    expect(close(tree).props.accessibilityState).toEqual({ disabled: true });
    act(() => tree.unmount());
  });
});
