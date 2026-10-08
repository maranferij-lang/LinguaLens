// Контракт сканера для онбордингу й наліпок (план v1.3 §5.8):
//   • onExit(reason): 'closed' — хрестик першого скану, 'camera_denied' —
//     камеру заборонено; 'limit' приходить від App (onGuardScan /
//     onLimitReached), і сканер його не дублює;
//   • тестове фото замість кадру симулятора — лише iOS, лише 200×200, лише
//     в розробці;
//   • кадр 9:16 як тло для Stories: рендериться після objectJpeg і до
//     cropToObject, іде в «Поділитися», але не в словник, і стирається.
import { Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScannerScreen from '../src/ScannerScreen';
import ConsentSheet from '../src/ConsentSheet';
import SceneView from '../src/scene/SceneView';
import ShareSheet from '../src/share/ShareSheet';
import { recognizeImage } from '../src/api';
import { DEV_SAMPLE, isSimulatorShot } from '../src/devSample';
import { makeT } from '../src/i18n';
import { Asset } from 'expo-asset';

let mockShot = { width: 1200, height: 1600 };
const mockReleased = [];
let mockCamPerm = { granted: true, canAskAgain: true };
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => {
        const shot = { uri: 'file:///shot.jpg', ...mockShot };
        shot.release = () => mockReleased.push(shot);
        return shot;
      },
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [mockCamPerm, jest.fn()] };
});

// Кожен ланцюжок ImageManipulator: джерело, операції й файл, який він дав.
// mockFail(chain) → true — рендер цього ланцюжка падає.
const mockChains = [];
let mockFail = () => false;
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const chain = { source, ops: [], uri: null };
    mockChains.push(chain);
    const c = {
      resize: (r) => (chain.ops.push({ resize: r }), c),
      crop: (r) => (chain.ops.push({ crop: r }), c),
      renderAsync: async () => {
        if (mockFail(chain)) throw new Error('render failed');
        return {
          saveAsync: async (opts) => {
            chain.uri = `file:///cache/out${mockChains.indexOf(chain)}.jpg`;
            return { uri: chain.uri, width: 600, height: 600, base64: opts.base64 ? 'b64' : undefined };
          },
          release() {},
        };
      },
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const mockDeleted = [];
jest.mock('expo-file-system', () => {
  class File {
    constructor(...parts) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    delete() {
      mockDeleted.push(this.uri);
    }
    copySync() {}
  }
  class Directory {
    constructor(...parts) {
      this.uri = parts.join('/');
    }
    create() {}
  }
  return { File, Directory, Paths: { document: { uri: 'file:///docs/' }, cache: { uri: 'file:///cache/' } } };
});

jest.mock('expo-asset', () => ({
  Asset: {
    fromModule: jest.fn(() => ({
      localUri: 'file:///bundle/sample-desk.jpg',
      width: 1080,
      height: 1440,
      async downloadAsync() {
        return this;
      },
    })),
  },
}));

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  recognizeImage: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [200, 300, 700, 800], outline: null, usage: null };
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

beforeEach(() => {
  mockShot = { width: 1200, height: 1600 };
  mockReleased.length = 0;
  mockChains.length = 0;
  mockDeleted.length = 0;
  mockFail = () => false;
  mockCamPerm = { granted: true, canAskAgain: true };
  Asset.fromModule.mockClear();
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
});

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
        <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={Infinity} t={t} {...props} />
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

const shutter = (tree) => tree.root.findAll((n) => n.props.testID === 'shutter' && typeof n.props.onPress === 'function')[0];
const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function').at(-1);
const byTitle = (tree, title) => tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const resultSheet = (tree) =>
  tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);
const shareSheet = (tree) => tree.root.findAllByType(ShareSheet).find((x) => x.parent?.type !== SceneView);
// ланцюжок кадру 9:16 (тло) — обріз висотою на весь кадр
const isBackdrop = (c) => c.ops[0]?.crop && c.ops[0].crop.height === mockShot.height && c.ops[0].crop.width < mockShot.width;

describe('onExit(reason)', () => {
  test('the close button of the first scan → “closed”', async () => {
    const onExit = jest.fn();
    const tree = await render({ firstScan: true, onExit });
    await press(() => byLabel(tree, t('close')).props.onPress());
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledWith('closed');
    await act(async () => tree.unmount());
  });

  test('camera refused in onboarding: “Next” and the close button → “camera_denied”', async () => {
    mockCamPerm = { granted: false, canAskAgain: false };
    const onExit = jest.fn();
    const tree = await render({ firstScan: true, onExit });
    await press(() => byTitle(tree, t('obNext')).props.onPress());
    await press(() => byLabel(tree, t('close')).props.onPress());
    expect(onExit.mock.calls).toEqual([['camera_denied'], ['camera_denied']]);
    await act(async () => tree.unmount());
  });

  test('“limit” comes from App’s guard — the scanner does not send it a second time', async () => {
    const onExit = jest.fn();
    const onGuardScan = jest.fn(() => {
      onExit('limit');
      return false;
    });
    const tree = await render({ firstScan: true, onExit, onGuardScan });
    await press(() => shutter(tree).props.onPress());
    expect(onExit.mock.calls).toEqual([['limit']]);
    expect(recognizeImage).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('a 402 inside onboarding: App’s onLimitReached says “limit”, the scanner shows no error', async () => {
    const onExit = jest.fn();
    recognizeImage.mockImplementation(async () => Promise.reject(Object.assign(new Error('SCAN_LIMIT'), { data: { used: 1, limit: 1 } })));
    const onLimitReached = jest.fn(async () => {
      onExit('limit');
      return false;
    });
    const tree = await render({ firstScan: true, onExit, onLimitReached });
    await press(() => shutter(tree).props.onPress());
    expect(onExit.mock.calls).toEqual([['limit']]);
    expect(tree.root.findAll((n) => n.props.children === t('scanErrServer'))).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});

describe('test photo instead of the simulator camera', () => {
  test('a 200×200 frame on iOS in development becomes the desk photo', async () => {
    expect(DEV_SAMPLE).not.toBeNull();
    mockShot = { width: 200, height: 200 };
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(Asset.fromModule).toHaveBeenCalledWith(DEV_SAMPLE);
    // кадр симулятора звільнено, далі все — з тестового фото
    expect(mockReleased).toHaveLength(1);
    expect(mockChains[0].source).toBe('file:///bundle/sample-desk.jpg');
    expect(mockChains[0].ops).toEqual([{ resize: { width: 1024 } }]);
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('a real camera frame is never swapped', async () => {
    for (const shot of [
      { width: 1080, height: 1440 },
      { width: 200, height: 300 },
    ]) {
      mockShot = shot;
      mockChains.length = 0;
      const tree = await render();
      await press(() => shutter(tree).props.onPress());
      expect(Asset.fromModule).not.toHaveBeenCalled();
      expect(mockChains[0].source).not.toBe('file:///bundle/sample-desk.jpg');
      await act(async () => tree.unmount());
    }
  });

  test('only iOS, only the exact simulator frame; nothing in a release build', () => {
    expect(isSimulatorShot({ width: 200, height: 200 }, 'ios')).toBe(true);
    expect(isSimulatorShot({ width: 200, height: 200 }, 'android')).toBe(false);
    expect(isSimulatorShot({ width: 200, height: 201 }, 'ios')).toBe(false);
    expect(isSimulatorShot(null, 'ios')).toBe(false);
    const dev = global.__DEV__;
    try {
      global.__DEV__ = false;
      jest.isolateModules(() => {
        expect(require('../src/devSample').DEV_SAMPLE).toBeNull();
      });
    } finally {
      global.__DEV__ = dev;
    }
  });
});

describe('the scan frame as a Stories backdrop', () => {
  test('rendered after the request image and before the sticker cut; 9:16 at up to 1080 px', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(mockChains.map((c) => (isBackdrop(c) ? 'backdrop' : c.ops[0]?.crop ? 'sticker' : 'jpeg'))).toEqual(['jpeg', 'backdrop', 'sticker']);
    expect(mockChains[1].ops).toEqual([{ crop: { originX: 150, originY: 0, width: 900, height: 1600 } }, { resize: { width: 900 } }]);
    await act(async () => tree.unmount());
  });

  test('goes to the share sheet, never to the dictionary; the file is deleted when the result closes', async () => {
    const onSaveWord = jest.fn(() => true);
    const tree = await render({ onSaveWord });
    await press(() => shutter(tree).props.onPress());
    const backdrop = mockChains[1].uri;
    expect(backdrop).toBeTruthy();

    await press(() => byLabel(tree, t('share')).props.onPress());
    expect(shareSheet(tree).props.payload).toMatchObject({ kind: 'word', backdrop, word: { word: 'la taza', lang: 'es' } });
    expect(shareSheet(tree).props.payload.word).not.toHaveProperty('backdrop');
    await press(() => shareSheet(tree).props.onClose());

    await press(() => byTitle(tree, t('save')).props.onPress());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(onSaveWord.mock.calls[0][0]).not.toHaveProperty('backdrop');
    expect(mockDeleted).not.toContain(backdrop);

    await press(() => resultSheet(tree).props.onRequestClose());
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(mockDeleted).toContain(backdrop);
    await act(async () => tree.unmount());
  });

  test('the file is deleted when the scanner unmounts with the result still open', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    const backdrop = mockChains[1].uri;
    expect(resultSheet(tree).props.visible).toBe(true);
    await act(async () => tree.unmount());
    expect(mockDeleted).toContain(backdrop);
  });

  test('a failed backdrop does not break the scan: the word is there, the share sheet just has no photo', async () => {
    mockFail = (c) => isBackdrop(c);
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(tree.root.findAll((n) => n.props.children === 'la taza').length).toBeGreaterThan(0);
    await press(() => byLabel(tree, t('share')).props.onPress());
    expect(shareSheet(tree).props.payload.backdrop).toBeNull();
    await act(async () => tree.unmount());
  });

  test('the request fails: the backdrop already rendered is deleted', async () => {
    recognizeImage.mockImplementation(async () => Promise.reject(new Error('SCAN_TIMEOUT')));
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(mockDeleted).toContain(mockChains[1].uri);
    await act(async () => tree.unmount());
  });
});
