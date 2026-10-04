// Хром сканера v1.3 (core.md A.6): статус, ліхтарик, мова скану, пігулка
// режимів, затвор-лінза, перший скан, наліпка останнього слова, «Менше
// руху». Камера, ImageManipulator і розпізнавання — підставні.
import { AccessibilityInfo, Animated, AppState, Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScannerScreen from '../src/ScannerScreen';
import ConsentSheet from '../src/ConsentSheet';
import SceneView from '../src/scene/SceneView';
import { recognizeImage } from '../src/api';
import { makeT } from '../src/i18n';
import { CameraView } from 'expo-camera';
import { scannerLayout } from '../src/scanner/layout';
import Viewfinder, { cornersPath, spotlightPath } from '../src/scanner/Viewfinder';
import TopBar from '../src/scanner/TopBar';
import { StyleSheet } from 'react-native';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: 'file:///shot.jpg', width: 1200, height: 1600, release() {} }),
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] };
});

jest.mock('expo-image-manipulator', () => {
  const manipulate = () => {
    const c = {
      resize: () => c,
      crop: () => c,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///out.jpg', width: 600, height: 600, base64: 'b64' }), release() {} }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  recognizeImage: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: null, outline: null, usage: null };
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const uk = makeT('uk');

let appStateListeners = [];
beforeEach(() => {
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appStateListeners.push(fn);
    return { remove: () => (appStateListeners = appStateListeners.filter((f) => f !== fn)) };
  });
});
afterEach(() => jest.restoreAllMocks());

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent t={t} {...props} />
      </SafeAreaProvider>
    );
  });
  await settle();
  return tree;
}

async function press(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0] || null;
const shutter = (tree) => tree.root.findAll((n) => n.props.testID === 'shutter' && typeof n.props.onPress === 'function')[0];
const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const camera = (tree) => tree.root.findByType(CameraView);
const resultSheet = (tree) =>
  tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);

// 1 ───────────────────────────────────────────────────────────────────────
describe('status over the camera', () => {
  test('Pro: a PRO badge that VoiceOver reads as unlimited scans', async () => {
    const tree = await render({ scansLeft: Infinity });
    expect(texts(tree)).toContain('PRO');
    expect(byId(tree, 'scan-status-pro').props.accessibilityLabel).toBe(t('scanProBadgeA11y'));
    await act(async () => tree.unmount());
  });

  test('free: how many free scans are left, in the interface language', async () => {
    const tree = await render({ scansLeft: 1, t: uk });
    expect(texts(tree)).toContain('1 безкоштовний скан');
    expect(byId(tree, 'scan-status-free')).toBeTruthy();
    await act(async () => tree.unmount());
  });

  test('none left: the chip opens the paywall, and the shutter shows a crown', async () => {
    const onOpenPro = jest.fn();
    const tree = await render({ scansLeft: 0, onOpenPro });
    const chip = byLabel(tree, t('scanProChip'));
    expect(texts(tree)).toContain('Pro · unlimited scans');
    await press(() => chip.props.onPress());
    expect(onOpenPro).toHaveBeenCalledTimes(1);
    expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutterPro'));
    expect(tree.root.findAll((n) => n.props.testID === 'shutter-pro').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('first scan: no status at all', async () => {
    for (const scansLeft of [Infinity, 1, 0]) {
      const tree = await render({ firstScan: true, onExit: jest.fn(), scansLeft, onOpenPro: jest.fn() });
      expect(byId(tree, 'scan-status-pro')).toBeNull();
      expect(byId(tree, 'scan-status-free')).toBeNull();
      expect(byId(tree, 'scan-status-chip')).toBeNull();
      await act(async () => tree.unmount());
    }
  });
});

// 2 ───────────────────────────────────────────────────────────────────────
describe('flashlight', () => {
  const torch = (tree) => tree.root.findAll((n) => n.props.testID === 'torch' && typeof n.props.onPress === 'function')[0];

  test('a switch: tap turns the torch on in the camera, tap again — off', async () => {
    const tree = await render({ scansLeft: Infinity });
    expect(camera(tree).props.enableTorch).toBe(false);
    expect(torch(tree).props.accessibilityRole).toBe('switch');
    expect(torch(tree).props.accessibilityLabel).toBe(t('scanTorch'));
    await press(() => torch(tree).props.onPress());
    expect(camera(tree).props.enableTorch).toBe(true);
    expect(torch(tree).props.accessibilityState).toEqual({ checked: true });
    await press(() => torch(tree).props.onPress());
    expect(camera(tree).props.enableTorch).toBe(false);
    await act(async () => tree.unmount());
  });

  test('goes out when the result opens and stays out after it closes', async () => {
    const tree = await render({ scansLeft: Infinity });
    await press(() => torch(tree).props.onPress());
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(camera(tree).props.enableTorch).toBe(false);
    await press(() => resultSheet(tree).props.onRequestClose());
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(camera(tree).props.enableTorch).toBe(false);
    await act(async () => tree.unmount());
  });

  test('goes out when the app goes to the background', async () => {
    const tree = await render({ scansLeft: Infinity });
    await press(() => torch(tree).props.onPress());
    expect(camera(tree).props.enableTorch).toBe(true);
    await press(() => appStateListeners.forEach((fn) => fn('background')));
    expect(camera(tree).props.enableTorch).toBe(false);
    await act(async () => tree.unmount());
  });

  test('a scanner mounted again (tab switched back) starts with the torch off', async () => {
    let tree = await render({ scansLeft: Infinity });
    await press(() => torch(tree).props.onPress());
    await act(async () => tree.unmount());
    expect(appStateListeners).toHaveLength(0);
    tree = await render({ scansLeft: Infinity });
    expect(camera(tree).props.enableTorch).toBe(false);
    await act(async () => tree.unmount());
  });
});

// 3 ───────────────────────────────────────────────────────────────────────
test('language chip: shows the scan language, opens the picker, is off while recognising', async () => {
  let answer;
  recognizeImage.mockImplementation(() => new Promise((r) => (answer = r)));
  const onChangeLang = jest.fn();
  const tree = await render({ onChangeLang, scansLeft: Infinity });
  expect(texts(tree)).toContain('ES');
  const chip = () => byLabel(tree, t('scanLangA11y', { l: 'Español' }));
  await press(() => chip().props.onPress());
  expect(onChangeLang).toHaveBeenCalledTimes(1);
  await act(async () => {
    shutter(tree).props.onPress();
  });
  await settle();
  expect(chip().props.disabled).toBe(true);
  await act(async () => answer(RESULT));
  await settle();
  await act(async () => tree.unmount());
});

// 4 ───────────────────────────────────────────────────────────────────────
test('modes: a pill of two tabs; a locked scene opens the paywall and the mode stays', async () => {
  const onScenePro = jest.fn();
  const onScanModeChange = jest.fn();
  const tree = await render({ sceneLocked: true, onScenePro, onScanModeChange });
  const tabs = tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
  expect(tabs.map((n) => n.props.accessibilityLabel)).toEqual([t('modeObject'), t('modeScenePro')]);
  expect(uk('modeScenePro')).toBe('Сцена, функція Pro');
  await press(() => tabs[1].props.onPress());
  expect(onScenePro).toHaveBeenCalledTimes(1);
  expect(onScanModeChange).not.toHaveBeenCalled();
  // підписи звичайним регістром, без жовтого капсу Камери iOS
  const label = tree.root.findAll((n) => n.type === 'Text' && n.props.children === t('modeObject'))[0];
  const style = Object.assign({}, ...[].concat(label.props.style));
  expect(style.textTransform).toBeUndefined();
  expect(JSON.stringify(tree.toJSON())).not.toMatch(/#FFD60A/i);
  await act(async () => tree.unmount());
});

// 5 ───────────────────────────────────────────────────────────────────────
describe('shutter', () => {
  test('VoiceOver labels for lens, room, busy and the Pro crown', async () => {
    let tree = await render({ scansLeft: Infinity });
    expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutter'));
    await act(async () => tree.unmount());
    tree = await render({ scansLeft: Infinity, scanMode: 'scene' });
    expect(shutter(tree).props.accessibilityLabel).toBe(t('sceneShutter'));
    await act(async () => tree.unmount());
    tree = await render({ scansLeft: 0 });
    expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutterPro'));
    await act(async () => tree.unmount());

    let answer;
    recognizeImage.mockImplementation(() => new Promise((r) => (answer = r)));
    tree = await render({ scansLeft: Infinity });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(shutter(tree).props.accessibilityLabel).toBe(t('scanning'));
    expect(shutter(tree).props.disabled).toBe(true);
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());
  });

  test('the crown still goes through the guard: App opens the paywall, nothing is shot', async () => {
    const onGuardScan = jest.fn(() => false);
    const tree = await render({ scansLeft: 0, onGuardScan, onOpenPro: jest.fn() });
    await press(() => shutter(tree).props.onPress());
    expect(onGuardScan).toHaveBeenCalledWith('object');
    expect(recognizeImage).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});

// 6 ───────────────────────────────────────────────────────────────────────
test('first scan: a close button, the first-scan hint, the same shutter — no modes, status or last word', async () => {
  const onExit = jest.fn();
  const last = { id: 'w1', word: 'la silla', translation: 'chair', lang: 'es', addedAt: 1 };
  const tree = await render({ firstScan: true, onExit, scansLeft: 1, lastWord: last, onOpenWord: jest.fn() });
  expect(tree.root.findAll((n) => n.props.accessibilityRole === 'tablist')).toHaveLength(0);
  expect(byId(tree, 'scan-status-free')).toBeNull();
  expect(byId(tree, 'last-word')).toBeNull();
  expect(texts(tree)).toContain(t('scanFirstHint'));
  expect(texts(tree)).not.toContain('ES');
  expect(shutter(tree)).toBeTruthy();
  await press(() => byLabel(tree, t('close')).props.onPress());
  expect(onExit).toHaveBeenCalledWith('closed');
  await act(async () => tree.unmount());
});

// 7 ───────────────────────────────────────────────────────────────────────
test('last word: none — no sticker; a tap opens that word in the dictionary', async () => {
  let tree = await render({ scansLeft: Infinity });
  expect(byId(tree, 'last-word')).toBeNull();
  await act(async () => tree.unmount());

  const onOpenWord = jest.fn();
  const last = { id: 'w7', word: 'la silla', translation: 'chair', lang: 'es', addedAt: 1 };
  tree = await render({ scansLeft: Infinity, lastWord: last, onOpenWord });
  const sticker = byLabel(tree, t('scanLastWordA11y', { w: 'la silla' }));
  // без фото — літера на білому колі
  expect(texts(tree)).toContain('L');
  await press(() => sticker.props.onPress());
  expect(onOpenWord).toHaveBeenCalledWith('w7');
  await act(async () => tree.unmount());
});

// 8 ───────────────────────────────────────────────────────────────────────
describe('reduce motion', () => {
  async function loopsWhileRecognising(reduced) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
    let answer;
    recognizeImage.mockImplementation(() => new Promise((r) => (answer = r)));
    const tree = await render({ scansLeft: Infinity });
    const loop = jest.spyOn(Animated, 'loop');
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    const n = loop.mock.calls.length;
    // кути одразу лавандові — видно, що прилад працює
    const corners = tree.root.findAll((x) => x.props.testID === 'viewfinder-corners')[0];
    const stroke = corners.props.stroke;
    const band = tree.root.findAll((x) => x.props.testID === 'scan-band').length;
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());
    return { n, stroke, band };
  }

  test('with motion: corners breathe, a band sweeps the frame, an arc spins', async () => {
    const r = await loopsWhileRecognising(false);
    expect(r.n).toBeGreaterThanOrEqual(3);
    expect(r.band).toBeGreaterThan(0);
    expect(r.stroke).toBe('#9B8FFF');
  });

  test('“Reduce Motion”: no loop starts, the corners are simply lavender', async () => {
    const r = await loopsWhileRecognising(true);
    expect(r.n).toBe(0);
    expect(r.band).toBe(0);
    expect(r.stroke).toBe('#9B8FFF');
  });
});

// Розкладка (core.md A.2) ──────────────────────────────────────────────────
describe('layout', () => {
  test('object frame 264 with rounded corners; the hint fits above the mode switch on an SE', () => {
    for (const [w, h] of [
      [375, 647],
      [393, 759],
      [440, 860],
    ]) {
      const L = scannerLayout({ width: w, height: h });
      expect(L.frame.w).toBe(264);
      expect(L.frame.y).toBeGreaterThanOrEqual(L.barBottom + 12);
      // підказка (до двох рядків) — над перемикачем
      expect(L.hintTop + 52).toBeLessThanOrEqual(h - L.modeBottom - 44 - 8);
    }
  });

  test('scene frame is 9:16 between the top bar and the mode switch', () => {
    const L = scannerLayout({ width: 393, height: 759, scene: true });
    expect(L.frame.w / L.frame.h).toBeCloseTo(9 / 16, 1);
    expect(L.frame.y).toBeGreaterThanOrEqual(L.barBottom + 12);
    expect(L.frame.y + L.frame.h).toBeLessThanOrEqual(759 - L.modeBottom - 44 - 12);
    expect(L.hintInside).toBe(true);
  });

  test('first scan has no tab bar: the shutter sits lower', () => {
    expect(scannerLayout({ width: 393, height: 759, firstScan: true }).shutterBottom).toBeLessThan(
      scannerLayout({ width: 393, height: 759 }).shutterBottom
    );
  });

  test('under the status bar: the camera reaches the top of the screen, the chrome stays below it', async () => {
    const root = (tree) => tree.root.findAll((n) => n.type === 'View' && typeof n.props.onLayout === 'function' && StyleSheet.flatten(n.props.style)?.backgroundColor === '#000')[0];
    const lay = async (tree, height) => {
      await act(async () => root(tree).props.onLayout({ nativeEvent: { layout: { height } } }));
      return tree.root.findByType(Viewfinder).props;
    };
    // без заходу — як і раніше: сканер лише у своїй зоні
    let tree = await render({ scansLeft: 1 });
    expect(StyleSheet.flatten(root(tree).props.style).marginTop).toBeUndefined();
    expect(tree.root.findByType(TopBar).props.offset).toBe(0);
    let vf = await lay(tree, 759);
    expect(vf.frame.y).toBe(scannerLayout({ width: 393, height: 759 }).frame.y);
    await act(async () => tree.unmount());
    // App дає безпечну зону: корінь піднімається під статус-бар, прожектор
    // покриває і його, а верхній ряд і кадр зсуваються рівно на неї
    tree = await render({ scansLeft: 1, bleedTop: 59 });
    expect(StyleSheet.flatten(root(tree).props.style).marginTop).toBe(-59);
    expect(tree.root.findByType(TopBar).props.offset).toBe(59);
    vf = await lay(tree, 759 + 59);
    expect(vf.rootH).toBe(759 + 59);
    expect(vf.frame.y).toBe(scannerLayout({ width: 393, height: 759 }).frame.y + 59);
    await act(async () => tree.unmount());
  });

  test('corners are arcs of radius 28; the spotlight cuts the same rounded frame', () => {
    expect(cornersPath(264, 264)).toMatch(/A28,28 0 0 1/);
    expect(cornersPath(264, 264).match(/M/g)).toHaveLength(4);
    expect(spotlightPath(375, 647, { x: 55, y: 80, w: 264, h: 264 })).toMatch(/^M0,0 H375 V647 H0 Z M83,80/);
  });
});
