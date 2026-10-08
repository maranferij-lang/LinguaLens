// Полірування сканера (жовтень 2026): щипок зуму не перемальовує сканер.
// Зум живе в окремому сховищі (src/scanner/zoomStore.js), тож на кожну подію
// дотику міняються лише камера й кнопка «1×», а хром (верхній ряд, режими,
// затвор, наліпка) стоїть. Камера й розпізнавання підставні.
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScannerScreen from '../src/ScannerScreen';
import { CameraView } from 'expo-camera';
import { makeT } from '../src/i18n';
import { MAX_ZOOM } from '../src/scanner/pinch';
import { ZOOM_EPS, createZoom } from '../src/scanner/zoomStore';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => ({ uri: 'file:///shot.jpg', width: 1200, height: 1600 }) }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn(), jest.fn()] };
});

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: { manipulate: jest.fn() }, SaveFormat: { JPEG: 'jpeg' } }));

// Скільки разів перемальовувався верхній ряд: він перемальовується разом зі сканером
let topBarRenders = 0;
jest.mock('../src/scanner/TopBar', () => {
  const React = require('react');
  const actual = jest.requireActual('../src/scanner/TopBar');
  const Counted = (props) => {
    global.__topBarRenders += 1;
    return React.createElement(actual.default, props);
  };
  return { __esModule: true, ...actual, default: Counted };
});

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

beforeEach(() => {
  global.__topBarRenders = 0;
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={Infinity} t={t} {...props} />
      </SafeAreaProvider>
    );
  });
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

// ─── сховище ────────────────────────────────────────────────────────────────
describe('zoom store', () => {
  test('set / get / subscribe: subscribers hear only real changes, and can leave', () => {
    const z = createZoom();
    const heard = jest.fn();
    const off = z.subscribe(heard);
    expect(z.get()).toBe(0);
    z.set(0.12);
    z.set(0.12);
    expect(z.get()).toBe(0.12);
    expect(heard).toHaveBeenCalledTimes(1);
    off();
    z.set(0.3);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test('a pinch step smaller than ZOOM_EPS is skipped; a bigger one goes through', () => {
    const z = createZoom(0.2);
    const heard = jest.fn();
    z.subscribe(heard);
    z.pinch(0.2 + ZOOM_EPS / 2);
    expect(z.get()).toBe(0.2);
    expect(heard).not.toHaveBeenCalled();
    z.pinch(0.2 + ZOOM_EPS * 2);
    expect(z.get()).toBeCloseTo(0.2 + ZOOM_EPS * 2, 6);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test('the edges are never skipped, so 1× and the maximum can be reached', () => {
    const z = createZoom(0.002);
    z.pinch(0);
    expect(z.get()).toBe(0);
    const top = createZoom(MAX_ZOOM - 0.001);
    top.pinch(MAX_ZOOM);
    expect(top.get()).toBe(MAX_ZOOM);
  });

  test('settle() lands exactly where the fingers stopped; without a skipped step it does nothing', () => {
    const z = createZoom(0.2);
    const heard = jest.fn();
    z.subscribe(heard);
    z.settle();
    expect(heard).not.toHaveBeenCalled();
    z.pinch(0.2 + ZOOM_EPS / 2);
    z.settle();
    expect(z.get()).toBeCloseTo(0.2 + ZOOM_EPS / 2, 6);
    expect(heard).toHaveBeenCalledTimes(1);
    // уже застосоване вдруге не застосовується
    z.settle();
    expect(heard).toHaveBeenCalledTimes(1);
  });

  test('an exact value (a preset tap) drops a pending skipped step', () => {
    const z = createZoom(0.2);
    z.pinch(0.2 + ZOOM_EPS / 2);
    z.set(0);
    z.settle();
    expect(z.get()).toBe(0);
  });
});

// ─── щипок у сканері ────────────────────────────────────────────────────────
// PanResponder рахує жест із touchHistory, тож відтворюємо її, як це робить RN.
function pinchEvent(points, ts) {
  const touches = points.map(([x, y], i) => ({ identifier: i, pageX: x, pageY: y, locationX: x, locationY: y }));
  return {
    nativeEvent: { touches, changedTouches: touches, timestamp: ts },
    touchHistory: {
      numberActiveTouches: points.length,
      indexOfSingleActiveTouch: points.length === 1 ? 0 : -1,
      mostRecentTimeStamp: ts,
      touchBank: points.map(([x, y]) => ({
        touchActive: true,
        startPageX: x,
        startPageY: y,
        startTimeStamp: 1,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: ts,
        previousPageX: x,
        previousPageY: y,
        previousTimeStamp: ts - 1,
      })),
    },
  };
}

const layer = (tree) => tree.root.find((n) => typeof n.type === 'string' && typeof n.props.onMoveShouldSetResponderCapture === 'function');
const camera = (tree) => tree.root.findByType(CameraView);
const zoomBtn = (tree) => tree.root.find((n) => n.props.testID === 'zoom' && typeof n.props.onPress === 'function');

// Два пальці на відстані d одне від одного по горизонталі
const spread = (d) => [
  [200 - d / 2, 400],
  [200 + d / 2, 400],
];

async function pinchTo(tree, distances) {
  let ts = 10;
  await act(async () => layer(tree).props.onResponderGrant(pinchEvent(spread(distances[0]), ts)));
  for (const d of distances) {
    ts += 16;
    await act(async () => layer(tree).props.onResponderMove(pinchEvent(spread(d), ts)));
  }
  return ts;
}

describe('a pinch in the scanner', () => {
  test('the camera follows the fingers and the button turns into a magnifier, while the chrome is not re-rendered', async () => {
    const tree = await render();
    expect(camera(tree).props.zoom).toBe(0);
    const before = global.__topBarRenders;
    expect(before).toBeGreaterThan(0);

    // перший крок лише бере базу (100), далі розводимо пальці
    const ts = await pinchTo(tree, [100, 100, 130, 160, 200]);
    expect(camera(tree).props.zoom).toBeCloseTo(0.35, 5);
    expect(zoomBtn(tree).props.accessibilityLabel).toBe(t('scanZoomResetA11y'));
    // верхній ряд, режими й затвор не перемальовувались жодного разу
    expect(global.__topBarRenders).toBe(before);

    await act(async () => layer(tree).props.onResponderRelease(pinchEvent([], ts + 16)));
    expect(global.__topBarRenders).toBe(before);
    await act(async () => tree.unmount());
  });

  test('the preset button still works and moves the camera', async () => {
    const tree = await render();
    await act(async () => zoomBtn(tree).props.onPress());
    expect(camera(tree).props.zoom).toBe(0.12);
    expect(zoomBtn(tree).props.accessibilityLabel).toBe(t('scanZoomA11y', { z: '2×' }));
    await act(async () => zoomBtn(tree).props.onPress());
    expect(camera(tree).props.zoom).toBe(0);
    await act(async () => tree.unmount());
  });

  test('a tiny wobble of the fingers does not reach the camera, and lifting the fingers settles the exact zoom', async () => {
    const tree = await render();
    // база 200, потім зміна відстані на 1 px: 0,35 / 200 ≈ 0,0018 < ZOOM_EPS
    const ts = await pinchTo(tree, [200, 200, 201]);
    expect(camera(tree).props.zoom).toBe(0);
    await act(async () => layer(tree).props.onResponderRelease(pinchEvent([], ts + 16)));
    expect(camera(tree).props.zoom).toBeCloseTo((0.35 * 1) / 200, 5);
    await act(async () => tree.unmount());
  });

  test('pinching back to the start reaches exactly 1× (the edge is not skipped)', async () => {
    const tree = await render();
    await pinchTo(tree, [100, 100, 160, 200, 120, 100]);
    expect(camera(tree).props.zoom).toBe(0);
    expect(zoomBtn(tree).props.accessibilityLabel).toBe(t('scanZoomA11y', { z: '1×' }));
    await act(async () => tree.unmount());
  });

  test('lifting one finger settles the zoom and the next two-finger move starts from a new base (no jump)', async () => {
    const tree = await render();
    let ts = await pinchTo(tree, [100, 100, 150]);
    const mid = camera(tree).props.zoom;
    expect(mid).toBeCloseTo(0.175, 5);
    // один палець піднято: у події лишається один дотик
    ts += 16;
    await act(async () => layer(tree).props.onResponderMove(pinchEvent([[200, 400]], ts)));
    expect(camera(tree).props.zoom).toBe(mid);
    // палець повертається на зовсім іншій відстані (400): зум не стрибає
    ts += 16;
    await act(async () => layer(tree).props.onResponderMove(pinchEvent(spread(400), ts)));
    expect(camera(tree).props.zoom).toBe(mid);
    ts += 16;
    await act(async () => layer(tree).props.onResponderMove(pinchEvent(spread(400), ts)));
    expect(camera(tree).props.zoom).toBeCloseTo(mid, 5);
    await act(async () => tree.unmount());
  });
});
