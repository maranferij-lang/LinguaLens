// Полірування сканера (жовтень 2026): тимчасові файли кешу, які ніхто не
// зберіг, не лишаються на тижні (scanner-cache-leaks). Наліпка закритого
// результату стирається, лише коли слово не зберігали й ним не ділились, та
// лише коли аркуш уже поїхав вниз; кадр сцени — коли в сцени є копія в
// Documents. Файл, на який посилається збережене слово чи сцена, не чіпаємо
// ніколи. Камера, ImageManipulator, файлова система й розпізнавання підставні.
import { AccessibilityInfo, Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScannerScreen from '../src/ScannerScreen';
import SceneView from '../src/scene/SceneView';
import ShareSheet from '../src/share/ShareSheet';
import { recognizeImage, recognizeScene } from '../src/api';
import { makeT } from '../src/i18n';
import { createCutter } from '../src/cutout';

// iOS тримає вміст прозорого slide-Modal, поки не прийде нативний dismiss
jest.mock('react-native/Libraries/Modal/Modal', () => {
  const React = require('react');
  function Modal(props) {
    const keepsContent = props.animationType === 'slide' && props.transparent;
    if (props.visible === false && !keepsContent) return null;
    return React.createElement('Modal', props, props.children);
  }
  return { __esModule: true, default: Modal };
});

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: 'file:///shot.jpg', width: 1200, height: 1600, release: jest.fn() }),
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn(), jest.fn()] };
});

const chains = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = () => {
    const chain = { uri: null };
    global.__chains.push(chain);
    const c = {
      resize: () => c,
      crop: () => c,
      renderAsync: async () => ({
        saveAsync: async (opts) => {
          chain.uri = `file:///cache/out${global.__chains.indexOf(chain)}.jpg`;
          return { uri: chain.uri, width: 600, height: 600, base64: opts.base64 ? 'b64' : undefined };
        },
        release() {},
      }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const deleted = [];
jest.mock('expo-file-system', () => {
  class File {
    constructor(...parts) {
      this.uri = parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
    }
    get exists() {
      return true;
    }
    delete() {
      global.__deleted.push(this.uri);
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

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  recognizeImage: jest.fn(),
  recognizeScene: jest.fn(),
  abortScans: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [200, 300, 700, 800], outline: null, usage: null };
const SCENE = {
  objects: [{ word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [500, 400, 640, 560], outline: null }],
  usage: null,
};
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

// кадри: [0] — для моделі, [1] — тло 9:16, [2] — наліпка (предмет);
// у сцені [0] — кадр 9:16 для екрана
const CUT = 'file:///cache/out2.jpg';
const BACKDROP = 'file:///cache/out1.jpg';
const FRAME = 'file:///cache/out0.jpg';

beforeEach(() => {
  global.__chains = chains;
  global.__deleted = deleted;
  chains.length = 0;
  deleted.length = 0;
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
  recognizeScene.mockReset();
  recognizeScene.mockImplementation(async () => SCENE);
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

const element = (props = {}) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={Infinity} t={t} {...props} />
  </SafeAreaProvider>
);

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(element(props));
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
const byTitle = (tree, title) => tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const resultSheet = (tree) => tree.root.findAllByType(Modal).find((m) => m.props.animationType === 'slide' && m.props.transparent);
const sceneView = (tree) => tree.root.findByType(SceneView);
const wait = (ms) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

// ───────────────────────────────────────────────────────────────────────────
describe('the sticker file of a result', () => {
  test('“Scan again” without saving: the file stays while the sheet slides down, goes when it is dismissed; the 9:16 backdrop goes at once', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(chains[2].uri).toBe(CUT);
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    expect(deleted).toContain(BACKDROP);
    expect(deleted).not.toContain(CUT);
    await act(async () => resultSheet(tree).props.onDismiss());
    expect(deleted).toContain(CUT);
    await act(async () => tree.unmount());
  });

  test('a saved word keeps its file: the word may point at it when the copy to Documents failed', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('save')).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await act(async () => resultSheet(tree).props.onDismiss());
    expect(deleted).not.toContain(CUT);
    await act(async () => tree.unmount());
    expect(deleted).not.toContain(CUT);
  });

  test('a refused save (App said no) keeps the file too: App may save the word later', async () => {
    const onSaveWord = jest.fn(() => false);
    const tree = await render({ onSaveWord });
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('save')).props.onPress());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => resultSheet(tree).props.onDismiss());
    expect(deleted).not.toContain(CUT);
    await act(async () => tree.unmount());
  });

  test('a shared word keeps its file even when it was never saved', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byLabel(tree, t('share')).props.onPress());
    expect(tree.root.findAllByType(ShareSheet)[0].props.visible).toBe(true);
    await press(() => tree.root.findAllByType(ShareSheet)[0].props.onClose());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await act(async () => resultSheet(tree).props.onDismiss());
    expect(deleted).not.toContain(CUT);
    await act(async () => tree.unmount());
  });

  test('the word was in the dictionary already: nothing was saved from this scan, so its file goes', async () => {
    const tree = await render({ savedWords: [{ id: 'a', word: 'la taza', lang: 'es' }] });
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await act(async () => resultSheet(tree).props.onDismiss());
    expect(deleted).toContain(CUT);
    await act(async () => tree.unmount());
  });

  test('where the dismiss event never comes (Android), leaving the scanner clears it', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    expect(deleted).not.toContain(CUT);
    await act(async () => tree.unmount());
    expect(deleted).toContain(CUT);
  });

  test('…and so does the next shutter tap, by which time the sheet is long gone', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    expect(deleted).not.toContain(CUT);
    await press(() => shutter(tree).props.onPress());
    expect(deleted).toContain(CUT);
    await act(async () => tree.unmount());
  });

  test('the next scan has its own file: the first one is gone, the second is intact until it is closed', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await act(async () => resultSheet(tree).props.onDismiss());
    await press(() => shutter(tree).props.onPress());
    // третій і четвертий ланцюжки: кадр для моделі й тло; наліпка другого скану — шоста
    const second = chains[5].uri;
    expect(second).not.toBe(CUT);
    expect(deleted).toContain(CUT);
    expect(deleted).not.toContain(second);
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the 9:16 frame of a scene', () => {
  // App кладе фото в Documents і віддає запис із відносним шляхом
  const copied = (scene) => ({ ...scene, image: 'scenes/' + scene.id + '.jpg' });

  test('copied to Documents: the cache original goes with the frozen frame after the scene closes', async () => {
    const tree = await render({ scanMode: 'scene', onSceneScanned: copied });
    await press(() => shutter(tree).props.onPress());
    expect(sceneView(tree).props.scene).not.toBeNull();
    // сцена на екрані: кадр ще під нею
    expect(deleted).not.toContain(FRAME);
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).toContain(FRAME);
    await act(async () => tree.unmount());
  });

  test('not copied (App kept the cache path, or no App): the scene still points at it, so it stays', async () => {
    const tree = await render({ scanMode: 'scene', onSceneScanned: (scene) => scene });
    await press(() => shutter(tree).props.onPress());
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).not.toContain(FRAME);
    await act(async () => tree.unmount());
    expect(deleted).not.toContain(FRAME);
  });

  test('no onSceneScanned at all: the same, the frame stays', async () => {
    const tree = await render({ scanMode: 'scene' });
    await press(() => shutter(tree).props.onPress());
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).not.toContain(FRAME);
    await act(async () => tree.unmount());
  });

  test('a failed scene scan: nobody points at the frame, it goes when it has faded out', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(new Error('SCAN_EMPTY')));
    const tree = await render({ scanMode: 'scene', onSceneScanned: copied });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await wait(40);
    // ще тане під плашкою помилки
    expect(deleted).not.toContain(FRAME);
    await wait(400);
    expect(deleted).toContain(FRAME);
    await act(async () => tree.unmount());
  });

  test('a shutter tap right after the scene closes: the old frame goes at once, with the veil', async () => {
    const tree = await render({ scanMode: 'scene', onSceneScanned: copied });
    await press(() => shutter(tree).props.onPress());
    await press(() => sceneView(tree).props.onClose());
    expect(deleted).not.toContain(FRAME);
    recognizeScene.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await wait(40);
    expect(deleted).toContain(FRAME);
    await act(async () => tree.unmount());
  });

  test('leaving the scanner with the scene open clears a copied frame, but never a frame the scene still uses', async () => {
    const withCopy = await render({ scanMode: 'scene', onSceneScanned: copied });
    await press(() => shutter(withCopy).props.onPress());
    await act(async () => withCopy.unmount());
    expect(deleted).toContain(FRAME);

    deleted.length = 0;
    chains.length = 0;
    const without = await render({ scanMode: 'scene', onSceneScanned: (scene) => scene });
    await press(() => shutter(without).props.onPress());
    await act(async () => without.unmount());
    expect(deleted).not.toContain(FRAME);
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('the cut-outs of a scene’s objects', () => {
  // кадри сцени: [0] — для екрана, [1] — для моделі, [2] — наліпка першого (єдиного) предмета
  const SCENE_CUT = 'file:///cache/out2.jpg';
  const copied = (scene) => ({ ...scene, image: 'scenes/' + scene.id + '.jpg' });
  const sceneProps = { scanMode: 'scene', onSceneScanned: copied };

  test('an object nobody saved: its cut-out goes when the scene has closed, not before', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    expect(chains[2].uri).toBe(SCENE_CUT);
    expect(deleted).not.toContain(SCENE_CUT);
    await press(() => sceneView(tree).props.onClose());
    expect(deleted).not.toContain(SCENE_CUT);
    await wait(520);
    expect(deleted).toContain(SCENE_CUT);
    await act(async () => tree.unmount());
  });

  test('a saved object whose copy to Documents failed: the word still points at the cache file, so it stays', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    // App сказав: слово збережене, а photo лишився кеш-шляхом
    await act(async () => tree.update(element({ ...sceneProps, savedWords: [{ id: 'w1', word: 'la taza', lang: 'es', photo: SCENE_CUT }] })));
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).not.toContain(SCENE_CUT);
    await act(async () => tree.unmount());
  });

  test('a saved object whose copy worked: the word has its own file in Documents, the cache original goes', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    await act(async () => tree.update(element({ ...sceneProps, savedWords: [{ id: 'w1', word: 'la taza', lang: 'es', photo: 'stickers/abc.jpg' }] })));
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).toContain(SCENE_CUT);
    await act(async () => tree.unmount());
  });

  test('records without a photo in the dictionary do not stop the cleanup', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    await act(async () => tree.update(element({ ...sceneProps, savedWords: [{ id: 'x' }, { id: 'y', photo: null }, { id: 'w1', photo: 'stickers/a.jpg' }] })));
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    expect(deleted).toContain(SCENE_CUT);
    await act(async () => tree.unmount());
  });

  test('leaving the scanner with the scene open clears them as well', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    expect(deleted).not.toContain(SCENE_CUT);
    await act(async () => tree.unmount());
    await settle(1);
    expect(deleted).toContain(SCENE_CUT);
  });

  test('a new scan right after the scene closed does not wait for the timer', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    await press(() => sceneView(tree).props.onClose());
    recognizeScene.mockImplementation(() => new Promise(() => {}));
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await wait(40);
    expect(deleted).toContain(SCENE_CUT);
    await act(async () => tree.unmount());
  });

  test('the cut-outs are cleared once: a second close does not touch the next scene’s files', async () => {
    const tree = await render(sceneProps);
    await press(() => shutter(tree).props.onPress());
    await press(() => sceneView(tree).props.onClose());
    await wait(520);
    const count = deleted.filter((u) => u === SCENE_CUT).length;
    expect(count).toBe(1);
    await act(async () => tree.unmount());
    await settle(1);
    expect(deleted.filter((u) => u === SCENE_CUT).length).toBe(1);
  });
});

describe('cutter.files()', () => {
  const objects = [
    { key: 'a', box: [100, 100, 300, 300] },
    { key: 'b', box: [500, 500, 700, 700] },
  ];
  const make = (eager) =>
    createCutter({ source: 'file:///s.jpg', width: 1000, height: 1000, crop: { x: 0, y: 0, width: 1000, height: 1000 }, objects, eager });

  test('an eager cutter lists every file once the queue has run; a lazy one only what was asked for', async () => {
    const eager = make(true);
    const files = await eager.files();
    expect(files).toHaveLength(2);
    expect(files.every((u) => /^file:\/\/\/cache\/out\d+\.jpg$/.test(u))).toBe(true);

    const lazy = make(false);
    expect(await lazy.files()).toEqual([]);
    const one = await lazy.get('b');
    expect(await lazy.files()).toEqual([one.uri]);
  });
});
