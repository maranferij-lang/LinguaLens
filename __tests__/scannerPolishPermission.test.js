// Дозвіл камери й вхід на вкладку «Скан» (scanner-permission-lifecycle,
// perf-scan-tab-reentry-blank, ux-motion-scan-camera-warmup). Сканер
// перемонтується на кожному поверненні на вкладку, а useCameraPermissions щоразу
// стартує з null: без кешу кілька кадрів стояв би фон теми перед чорною
// камерою. Порядок тестів важливий: останній відомий стан живе на рівні модуля.
import { AccessibilityInfo, AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import ScannerScreen from '../src/ScannerScreen';
import { makeT } from '../src/i18n';

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => null }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [global.__live, jest.fn(), global.__get] };
});

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const GRANTED = { granted: true, canAskAgain: true };
const DENIED = { granted: false, canAskAgain: false };
const UNDETERMINED = { granted: false, canAskAgain: true };

let appStateListeners = [];
beforeEach(() => {
  global.__live = null;
  global.__get = jest.fn();
  appStateListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    appStateListeners.push(fn);
    return { remove: () => (appStateListeners = appStateListeners.filter((f) => f !== fn)) };
  });
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
});
afterEach(() => jest.restoreAllMocks());

async function settle(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function mount(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={1} t={t} {...props} />
      </SafeAreaProvider>
    );
  });
  return tree;
}

const camera = (tree) => tree.root.findAllByType(CameraView);
const veil = (tree) => tree.root.findAll((n) => n.props.testID === 'camera-veil');
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

describe('entering the Scan tab', () => {
  test('nothing known yet (first mount of the launch): no camera, the themed screen stays, as before', async () => {
    const tree = await mount();
    expect(camera(tree)).toHaveLength(0);
    expect(texts(tree)).not.toContain(t('permTitle'));
    await act(async () => tree.unmount());
  });

  test('granted: the camera', async () => {
    global.__live = GRANTED;
    const tree = await mount();
    expect(camera(tree)).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  test('coming back to the tab while the hook still says null: the camera in the very first frame', async () => {
    global.__live = null;
    const tree = await mount();
    // без settle: це перший кадр після монтування
    expect(camera(tree)).toHaveLength(1);
    expect(tree.root.findAll((n) => n.props.testID === 'shutter').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('a known refusal shows the Settings screen at once, not a blank', async () => {
    global.__live = DENIED;
    let tree = await mount();
    expect(texts(tree)).toContain(t('permDeniedText'));
    await act(async () => tree.unmount());
    global.__live = null;
    tree = await mount();
    expect(texts(tree)).toContain(t('permDeniedText'));
    expect(camera(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('the explainer before the system prompt is unchanged: one neutral “Next”', async () => {
    global.__live = UNDETERMINED;
    const tree = await mount();
    expect(texts(tree)).toContain(t('permText'));
    const buttons = tree.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function');
    expect(buttons.map((b) => b.props.title)).toEqual([t('obNext')]);
    await act(async () => tree.unmount());
  });
});

describe('coming back from Settings', () => {
  test('on the denied screen, becoming active again asks the system once more', async () => {
    global.__live = DENIED;
    const tree = await mount();
    expect(appStateListeners).toHaveLength(1);
    await act(async () => appStateListeners.forEach((fn) => fn('active')));
    expect(global.__get).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('going to the background does not ask; neither does a granted camera', async () => {
    global.__live = DENIED;
    let tree = await mount();
    await act(async () => appStateListeners.forEach((fn) => fn('background')));
    expect(global.__get).not.toHaveBeenCalled();
    await act(async () => tree.unmount());

    global.__live = GRANTED;
    tree = await mount();
    await act(async () => appStateListeners.forEach((fn) => fn('active')));
    expect(global.__get).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('a hook without the third item (older mocks) does not break the listener', async () => {
    global.__live = DENIED;
    global.__get = undefined;
    const tree = await mount();
    await act(async () => appStateListeners.forEach((fn) => fn('active')));
    await act(async () => tree.unmount());
  });
});

describe('the black veil over a starting camera', () => {
  test('there from the first frame, never blocks touches, fades out when the camera is ready', async () => {
    global.__live = GRANTED;
    const tree = await mount();
    expect(veil(tree).length).toBeGreaterThan(0);
    expect(veil(tree)[0].props.pointerEvents).toBe('none');
    await act(async () => camera(tree)[0].props.onCameraReady());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(veil(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('no “ready” event (web, a failure): the veil leaves on its own, the screen never stays black', async () => {
    global.__live = GRANTED;
    const tree = await mount();
    expect(veil(tree).length).toBeGreaterThan(0);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 1200 + 400));
    });
    expect(veil(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('no veil on the permission screens: they sit on the theme background', async () => {
    global.__live = DENIED;
    const tree = await mount();
    expect(veil(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('“Reduce Motion”: the veil still goes, only quicker', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    global.__live = GRANTED;
    const tree = await mount();
    await settle(1);
    await act(async () => camera(tree)[0].props.onCameraReady());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(veil(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});
