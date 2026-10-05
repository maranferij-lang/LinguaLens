// Сканер із підставленими камерою, ImageManipulator і розпізнаванням.
// Перевіряємо речі, яких не видно з App окремо:
//   • згода на відправку кадру (App Review 5.1.2(i)): без неї кадр не йде нікуди;
//   • 402 після свіжої покупки Pro: той самий кадр іде ще раз, без пейволу;
//   • режим «Сцена»: перемикач, кадр 9:16, екран сцени, наліпки з повного кадру.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image, Linking, Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import ScannerScreen from '../src/ScannerScreen';
import ConsentSheet from '../src/ConsentSheet';
import SceneView from '../src/scene/SceneView';
import ShareSheet from '../src/share/ShareSheet';
import { recognizeImage, recognizeScene } from '../src/api';
import { makeT } from '../src/i18n';
import { CameraView } from 'expo-camera';
import * as Speech from 'expo-speech';
import PaywallScreen from '../src/PaywallScreen';

// Камера віддає кадр 3:4 (1200×1600) і вміє його «звільнити», як PictureRef.
// Дозвіл камери можна підмінити в тесті (mockCamPerm); mockAskCam — системний
// запит дозволу.
const shots = [];
let mockCamPerm = { granted: true, canAskAgain: true };
const mockAskCam = jest.fn();
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => {
        const shot = { uri: 'file:///shot.jpg', width: 1200, height: 1600, release: jest.fn() };
        shots.push(shot);
        return shot;
      },
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [mockCamPerm, mockAskCam] };
});

// Записуємо кожен ланцюжок ImageManipulator: що різали і до якого розміру.
const chains = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const ops = [];
    chains.push({ source, ops });
    const c = {
      resize: (r) => (ops.push({ resize: r }), c),
      crop: (r) => (ops.push({ crop: r }), c),
      renderAsync: async () => ({
        saveAsync: async (opts) => {
          const w = ops.reduce((acc, o) => o.resize?.width || o.crop?.width || acc, 0);
          return { uri: `file:///out${chains.length}.jpg`, width: w, height: Math.round((w * 16) / 9), base64: opts.base64 ? 'b64' : undefined };
        },
        release() {},
      }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

// Озвучка: перевіряємо, що саме прозвучало б («Ще вирази» — тап озвучує вираз)
jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }));

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  recognizeImage: jest.fn(),
  recognizeScene: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: null, outline: null, usage: null };
const SCENE = {
  objects: [
    { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [500, 400, 640, 560], outline: null },
    { word: 'la lámpara', ipa: '', translation: 'lamp', example: '', exampleTranslation: '', box: [100, 600, 420, 900], outline: null },
  ],
  usage: { day: '2026-10-01', scans: 3, limit: 5 },
};
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

beforeEach(async () => {
  await AsyncStorage.clear();
  mockCamPerm = { granted: true, canAskAgain: true };
  mockAskCam.mockClear();
  Linking.openSettings.mockClear?.();
  shots.length = 0;
  chains.length = 0;
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
  recognizeScene.mockReset();
  recognizeScene.mockImplementation(async () => SCENE);
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function render(element) {
  let tree;
  await act(async () => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
  });
  await settle();
  return tree;
}

async function press(tree, fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

const shutter = (tree) => tree.root.findAll((n) => n.props.testID === 'shutter' && typeof n.props.onPress === 'function')[0];
const consent = (tree) => tree.root.findByType(ConsentSheet);
const sceneView = (tree) => tree.root.findByType(SceneView);
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const tab = (tree, label) =>
  tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];

const scanner = (props = {}) => (
  <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent t={t} {...props} />
);

test('the first shutter tap asks before any photo leaves the phone', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  const tree = await render(<App />);

  await press(tree, () => shutter(tree).props.onPress());
  expect(consent(tree).props.visible).toBe(true);
  expect(recognizeImage).not.toHaveBeenCalled();

  // «Не зараз» просто закриває — згоди немає, наступний тап спитає знову
  await press(tree, () => consent(tree).props.onClose());
  expect(consent(tree).props.visible).toBe(false);
  await press(tree, () => shutter(tree).props.onPress());
  expect(consent(tree).props.visible).toBe(true);
  expect(recognizeImage).not.toHaveBeenCalled();

  await press(tree, () => consent(tree).props.onAllow());
  expect(consent(tree).props.visible).toBe(false);
  expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).aiConsent).toBe(true);

  await press(tree, () => shutter(tree).props.onPress());
  expect(recognizeImage).toHaveBeenCalledTimes(1);
  // профілю немає — рівень не передаємо, сервер робить як завжди
  expect(recognizeImage).toHaveBeenCalledWith('b64', 'es', 'en', undefined);
  await act(async () => tree.unmount());
});

describe('402 from the server', () => {
  const limitError = () => Object.assign(new Error('SCAN_LIMIT'), { data: { error: 'SCAN_LIMIT', used: 5, limit: 5 } });

  test('Pro just bought and the server lifted the ceiling: the same frame goes again', async () => {
    recognizeImage.mockImplementationOnce(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => true);
    const tree = await render(scanner({ onLimitReached }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledWith({ error: 'SCAN_LIMIT', used: 5, limit: 5 }, 'SCAN_LIMIT');
    expect(recognizeImage).toHaveBeenCalledTimes(2);
    expect(tree.root.findAll((n) => n.props.children === 'la taza').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('otherwise the paywall takes over and the frame is not resent', async () => {
    recognizeImage.mockImplementation(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => false);
    const tree = await render(scanner({ onLimitReached }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('in scene mode too: resent after a fresh purchase, the scene opens', async () => {
    recognizeScene.mockImplementationOnce(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => true);
    const tree = await render(scanner({ scanMode: 'scene', onLimitReached }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeScene).toHaveBeenCalledTimes(2);
    expect(sceneView(tree).props.scene).not.toBeNull();
    await act(async () => tree.unmount());
  });

  test('in scene mode the paywall wins and nothing is resent', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => false);
    const tree = await render(scanner({ scanMode: 'scene', onLimitReached }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeScene).toHaveBeenCalledTimes(1);
    expect(sceneView(tree).props.scene).toBeNull();
    // кадр звільнено, хоч до наліпок справа не дійшла
    expect(shots[0].release).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  // Безкоштовну сцену вже використано: це теж пейвол, а не помилка, і App
  // має знати, ЯКИЙ саме (code), щоб показати аргумент про сцени.
  test('SCENE_PRO goes to App with its code, no error line under the shutter', async () => {
    const sceneError = Object.assign(new Error('SCENE_PRO'), { data: { error: 'SCENE_PRO', used: 1, limit: 1 } });
    recognizeScene.mockImplementation(async () => Promise.reject(sceneError));
    const onLimitReached = jest.fn(async () => false);
    const tree = await render(scanner({ scanMode: 'scene', onLimitReached }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledWith({ error: 'SCENE_PRO', used: 1, limit: 1 }, 'SCENE_PRO');
    expect(recognizeScene).toHaveBeenCalledTimes(1);
    expect(texts(tree)).not.toContain(t('scanErrServer'));
    await act(async () => tree.unmount());
  });
});

describe('scene is Pro once the free one is used', () => {
  const sceneTab = (tree, label) => tab(tree, label);

  // v1.3: замість значка «PRO» — корона в кружечку на сегменті «Сцена»
  const crown = (tree) => tree.root.findAll((n) => n.props.testID === 'mode-scene-pro');

  test('a crown on the scene segment, and VoiceOver says it is Pro', async () => {
    const tree = await render(scanner({ sceneLocked: true, onScenePro: jest.fn() }));
    expect(sceneTab(tree, t('modeScenePro'))).toBeTruthy();
    expect(crown(tree).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('no crown while the free scene is still there', async () => {
    const tree = await render(scanner({ sceneLocked: false }));
    expect(sceneTab(tree, t('modeScene'))).toBeTruthy();
    expect(crown(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('choosing the scene opens the paywall instead of switching', async () => {
    const onScenePro = jest.fn();
    const onScanModeChange = jest.fn();
    const tree = await render(scanner({ sceneLocked: true, onScenePro, onScanModeChange }));
    await press(tree, () => sceneTab(tree, t('modeScenePro')).props.onPress());
    expect(onScenePro).toHaveBeenCalledTimes(1);
    expect(onScanModeChange).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the guard is told which mode the shutter is in', async () => {
    const onGuardScan = jest.fn(() => false);
    const tree = await render(scanner({ scanMode: 'scene', onGuardScan }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onGuardScan).toHaveBeenCalledWith('scene');
    await act(async () => tree.unmount());
  });

  // Сцену збережено як режим, а безкоштовну пробу вже використано (чи Pro
  // скінчився): сканер стоїть на предметі, і затвор сканує, а не відкриває
  // пейвол. Сцену можна обрати знову — тоді пейвол, як і раніше.
  test('a saved scene mode that is now locked falls back to objects', async () => {
    const onGuardScan = jest.fn(() => true);
    const onScenePro = jest.fn();
    const onScanModeChange = jest.fn();
    const tree = await render(scanner({ scanMode: 'scene', sceneLocked: true, onGuardScan, onScenePro, onScanModeChange }));
    expect(tab(tree, t('modeObject')).props.accessibilityState.selected).toBe(true);
    expect(tab(tree, t('modeScenePro')).props.accessibilityState.selected).toBe(false);
    expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutter'));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onGuardScan).toHaveBeenCalledWith('object');
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    expect(recognizeScene).not.toHaveBeenCalled();
    // збережений вибір не чіпаємо: з Pro сцена повернеться сама
    expect(onScanModeChange).not.toHaveBeenCalled();
    await press(tree, () => tab(tree, t('modeScenePro')).props.onPress());
    expect(onScenePro).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  // Остання безкоштовна сцена: лічильник оновлюється, поки вона ще на
  // екрані, — режим лишається сценою, доки її не закрили.
  test('the free scene that just locked it stays a scene until it is closed', async () => {
    const onGuardScan = jest.fn(() => true);
    const element = (locked) => scanner({ scanMode: 'scene', sceneLocked: locked, onGuardScan });
    let tree;
    await act(async () => {
      tree = create(<SafeAreaProvider initialMetrics={metrics}>{element(false)}</SafeAreaProvider>);
    });
    await settle();
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeScene).toHaveBeenCalledTimes(1);
    await act(async () => tree.update(<SafeAreaProvider initialMetrics={metrics}>{element(true)}</SafeAreaProvider>));
    expect(sceneView(tree).props.scene).not.toBeNull();
    expect(tab(tree, t('modeScenePro')).props.accessibilityState.selected).toBe(true);
    await press(tree, () => sceneView(tree).props.onClose());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(tab(tree, t('modeObject')).props.accessibilityState.selected).toBe(true);
    await act(async () => tree.unmount());
  });
});

// «Назад» на Android: спершу закривається картка «поділитись», а не весь
// результат з незбереженим словом.
test('back closes the share card first, then the result', async () => {
  const tree = await render(scanner());
  expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutter'));
  await press(tree, () => shutter(tree).props.onPress());

  // аркуш результату — Modal самого сканера, не згода й не сцена
  const result = () =>
    tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);
  const sharing = () => tree.root.findAllByType(ShareSheet).find((x) => x.parent?.type !== SceneView)?.props.visible;
  expect(result().props.visible).toBe(true);

  const shareBtn = tree.root.findAll((n) => n.props.accessibilityLabel === t('share') && typeof n.props.onPress === 'function')[0];
  await press(tree, () => shareBtn.props.onPress());
  expect(sharing()).toBe(true);

  await press(tree, () => result().props.onRequestClose());
  expect(sharing()).toBe(false);
  expect(result().props.visible).toBe(true);

  await press(tree, () => result().props.onRequestClose());
  expect(result().props.visible).toBe(false);
  await act(async () => tree.unmount());
});

describe('scene mode', () => {
  test('the mode switch reports the new mode to App', async () => {
    const onScanModeChange = jest.fn();
    const tree = await render(scanner({ onScanModeChange }));
    expect(tab(tree, t('modeObject')).props.accessibilityState.selected).toBe(true);
    expect(texts(tree)).toContain(t('hint'));

    await press(tree, () => tab(tree, t('modeScene')).props.onPress());
    expect(onScanModeChange).toHaveBeenCalledWith('scene');
    // повторний тап по активному режиму нічого не робить
    await press(tree, () => tab(tree, t('modeObject')).props.onPress());
    expect(onScanModeChange).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('scene mode has its own hint and shutter label', async () => {
    const tree = await render(scanner({ scanMode: 'scene' }));
    expect(tab(tree, t('modeScene')).props.accessibilityState.selected).toBe(true);
    expect(texts(tree)).toContain(t('sceneHint'));
    expect(shutter(tree).props.accessibilityLabel).toBe(t('sceneShutter'));
    await act(async () => tree.unmount());
  });

  test('without consent nothing is shot in scene mode either', async () => {
    const tree = await render(scanner({ scanMode: 'scene', aiConsent: false }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(consent(tree).props.visible).toBe(true);
    expect(shots).toHaveLength(0);
    expect(recognizeScene).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the limit guard stops the scene before the camera fires', async () => {
    const tree = await render(scanner({ scanMode: 'scene', onGuardScan: () => false }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(shots).toHaveLength(0);
    expect(recognizeScene).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('a scene goes out as a 9:16 crop and opens the scene view', async () => {
    const onSceneScanned = jest.fn((scene) => ({ ...scene, image: 'scenes/' + scene.id + '.jpg' }));
    const onScanned = jest.fn();
    const onResultVisible = jest.fn();
    const tree = await render(scanner({ scanMode: 'scene', onSceneScanned, onScanned, onResultVisible }));
    await press(tree, () => shutter(tree).props.onPress());

    // кадр 1200×1600 → центральні 900×1600; екрану — 1080 по ширині, моделі — 720
    const crops = chains.filter((c) => c.ops[0]?.crop?.height === 1600);
    expect(crops.map((c) => c.ops)).toEqual([
      [{ crop: { originX: 150, originY: 0, width: 900, height: 1600 } }, { resize: { width: 900 } }],
      [{ crop: { originX: 150, originY: 0, width: 900, height: 1600 } }, { resize: { width: 720 } }],
    ]);
    expect(recognizeScene).toHaveBeenCalledWith('b64', 'es', 'en', undefined);
    expect(onScanned).toHaveBeenCalledWith(SCENE);

    const fresh = onSceneScanned.mock.calls[0][0];
    expect(fresh).toMatchObject({ lang: 'es', nativeLang: 'en', hidden: [] });
    expect(fresh.objects.map((o) => [o.key, o.word])).toEqual([['o0', 'la taza'], ['o1', 'la lámpara']]);

    // екран сцени отримав збережений запис і тримає App у курсі
    expect(sceneView(tree).props.scene.image).toBe('scenes/' + fresh.id + '.jpg');
    expect(onResultVisible).toHaveBeenLastCalledWith(true);
    expect(texts(tree)).toContain(t('sceneTitle', { n: 2 }));
    await act(async () => tree.unmount());
  });

  test('while the model thinks: the frame is frozen and the status line says what is going on', async () => {
    let answer;
    recognizeScene.mockImplementation(() => new Promise((resolve) => (answer = resolve)));
    const tree = await render(scanner({ scanMode: 'scene' }));
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(texts(tree)).toContain(t('sceneStatus1'));
    // на екрані — саме той кадр 9:16, що піде на екран сцени
    expect(tree.root.findAll((n) => n.type === Image && n.props.source?.uri === 'file:///out1.jpg')).toHaveLength(1);
    expect(shutter(tree).props.disabled).toBe(true);
    await act(async () => answer(SCENE));
    await settle();
    expect(sceneView(tree).props.scene).not.toBeNull();
    await act(async () => tree.unmount());
  });

  test('stickers are cut from the full frame, then the frame is released', async () => {
    const tree = await render(scanner({ scanMode: 'scene' }));
    await press(tree, () => shutter(tree).props.onPress());
    const shot = shots[0];
    // Наліпки — квадрати з повного кадру (джерело — сам кадр, а не 9:16)
    const stickerCuts = chains.filter((c) => c.source === shot && c.ops[0]?.crop && c.ops[0].crop.height !== 1600);
    expect(stickerCuts).toHaveLength(2);
    for (const c of stickerCuts) {
      const { originX, originY, width, height } = c.ops[0].crop;
      expect(width).toBe(height);
      expect(originX + width).toBeLessThanOrEqual(1200);
      expect(originY + height).toBeLessThanOrEqual(1600);
    }
    expect(shot.release).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('the camera pauses under the scene and comes back when it closes', async () => {
    const onResultVisible = jest.fn();
    const tree = await render(scanner({ scanMode: 'scene', onResultVisible }));
    const camera = () => tree.root.findByType(CameraView);
    const frozen = () => tree.root.findAll((n) => n.type === Image && n.props.source?.uri === 'file:///out1.jpg');
    expect(camera().props.active).toBe(true);
    await press(tree, () => shutter(tree).props.onPress());
    expect(camera().props.active).toBe(false);

    await press(tree, () => sceneView(tree).props.onClose());
    expect(sceneView(tree).props.scene).toBeNull();
    expect(camera().props.active).toBe(true);
    expect(onResultVisible).toHaveBeenLastCalledWith(false);
    // заморожений кадр ще мить прикриває камеру, що прокидається
    expect(frozen()).toHaveLength(1);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 500));
    });
    expect(frozen()).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('nothing recognisable: a scene-specific hint, no scene view', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(new Error('SCAN_EMPTY')));
    const tree = await render(scanner({ scanMode: 'scene' }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(texts(tree)).toContain(t('sceneErrEmpty'));
    expect(sceneView(tree).props.scene).toBeNull();
    expect(shots[0].release).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('a forgotten device asks App for a new identity', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(new Error('SCAN_AUTH')));
    const onSessionLost = jest.fn();
    const tree = await render(scanner({ scanMode: 'scene', onSessionLost }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onSessionLost).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain(t('scanErrAuth'));
    await act(async () => tree.unmount());
  });
});

// ---------- скан під рівень ----------
describe('scan by level', () => {
  const EXTRAS = [
    { phrase: 'una taza de café', translation: 'a cup of coffee' },
    { phrase: 'llenar la taza', translation: 'fill the cup' },
  ];
  const resultSheet = (tree) =>
    tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);

  test('the level from the profile goes with the frame, in both modes', async () => {
    const tree = await render(scanner({ level: 8 }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeImage).toHaveBeenCalledWith('b64', 'es', 'en', 8);
    await act(async () => tree.unmount());

    const scene = await render(scanner({ level: 2, scanMode: 'scene' }));
    await press(scene, () => shutter(scene).props.onPress());
    expect(recognizeScene).toHaveBeenCalledWith('b64', 'es', 'en', 2);
    await act(async () => scene.unmount());
  });

  test('“More phrases” under the example: phrase and translation, a tap speaks the phrase', async () => {
    recognizeImage.mockImplementation(async () => ({ ...RESULT, example: 'Bebo té en mi taza.', extras: EXTRAS }));
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ level: 8, onSaveWord }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    const all = texts(tree);
    expect(all).toEqual(expect.arrayContaining([t('moreExpr'), 'una taza de café', 'a cup of coffee', 'llenar la taza']));
    // заголовок блоку — після прикладу
    expect(all.indexOf(t('moreExpr'))).toBeGreaterThan(all.findIndex((x) => typeof x === 'string' && x.includes('Bebo té')));

    const phrase = tree.root.findAll(
      (n) => n.props.accessibilityLabel === 'una taza de café, a cup of coffee' && typeof n.props.onPress === 'function'
    )[0];
    expect(phrase.props.accessibilityHint).toBe(t('listen'));
    Speech.speak.mockClear();
    await press(tree, () => phrase.props.onPress());
    expect(Speech.speak).toHaveBeenCalledWith('una taza de café', expect.objectContaining({ language: expect.stringMatching(/^es/) }));

    // у словник іде саме слово — вирази лишаються підказкою до цього скану
    const save = tree.root.findAll((n) => n.props.title === t('save') && typeof n.props.onPress === 'function')[0];
    await press(tree, () => save.props.onPress());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(onSaveWord.mock.calls[0][0]).not.toHaveProperty('extras');
    expect(onSaveWord.mock.calls[0][0]).toMatchObject({ word: 'la taza', lang: 'es', nativeLang: 'en' });
    await act(async () => tree.unmount());
  });

  test('no phrases from the server — no block', async () => {
    recognizeImage.mockImplementation(async () => ({ ...RESULT, extras: [] }));
    const tree = await render(scanner());
    await press(tree, () => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(texts(tree)).not.toContain(t('moreExpr'));
    await act(async () => tree.unmount());
  });

  test('App passes the level of the saved profile to the scanner', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    const profile = { goals: ['work'], field: 'it', level: 8, since: '2026-09-01' };
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true, profile }));
    const tree = await render(<App />);
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeImage).toHaveBeenCalledWith('b64', 'es', 'en', 8);
    await act(async () => tree.unmount());
  });
});

// ---------- мʼякий пейвол після першого скану ----------
describe('intro paywall after the first scan', () => {
  const resultSheet = (tree) =>
    tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);
  const paywall = (tree) => tree.root.findAllByType(PaywallScreen)[0] || null;
  const storedSettings = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  async function scanAndClose(tree) {
    await press(tree, () => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    // поки аркуш відкритий, пейвол чекає: під нативним Modal його не видно
    expect(paywall(tree)).toBeNull();
    await press(tree, () => resultSheet(tree).props.onRequestClose());
  }

  test('opens once ever, after the result sheet closes', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true }));
    const tree = await render(<App />);
    await scanAndClose(tree);
    expect(paywall(tree).props.reason).toBe('intro');
    expect((await storedSettings()).introPaywallShown).toBe(true);

    // для VoiceOver пейвол — модальний шар, жест «назад» його закриває
    const layer = paywall(tree).parent;
    expect(layer.props.accessibilityViewIsModal).toBe(true);
    await press(tree, () => layer.props.onAccessibilityEscape());
    expect(paywall(tree)).toBeNull();
    await scanAndClose(tree);
    expect(paywall(tree)).toBeNull();
    await act(async () => tree.unmount());

    // і після перезапуску — теж ні
    const again = await render(<App />);
    await scanAndClose(again);
    expect(paywall(again)).toBeNull();
    await act(async () => again.unmount());
  });

  test('a scene counts as the first scan too', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem(
      'll_settings_v1',
      JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true, scanMode: 'scene' })
    );
    const tree = await render(<App />);
    await press(tree, () => shutter(tree).props.onPress());
    expect(paywall(tree)).toBeNull();
    await press(tree, () => sceneView(tree).props.onClose());
    expect(paywall(tree).props.reason).toBe('intro');
    await act(async () => tree.unmount());
  });

  test('only a fallback: never after the onboarding paywall was shown', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem(
      'll_settings_v1',
      JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true, onbPaywallShown: true })
    );
    const tree = await render(<App />);
    await scanAndClose(tree);
    expect(paywall(tree)).toBeNull();
    await act(async () => tree.unmount());
  });

  test('people who scanned before this version already had their first scan', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true }));
    await AsyncStorage.setItem(
      'll_words_v1',
      JSON.stringify([{ id: 'a', word: 'el libro', translation: 'book', lang: 'es', addedAt: 1, srs: { box: 0, due: 0 } }])
    );
    const tree = await render(<App />);
    await scanAndClose(tree);
    expect(paywall(tree)).toBeNull();
    expect((await storedSettings()).introPaywallShown).toBe(true);
    await act(async () => tree.unmount());
  });
});

// ---------- перший скан в онбордингу ----------
// Той самий сканер, але лише один предмет, без перемикача режимів і
// лічильника, з хрестиком назад в онбординг; збережене слово закриває
// аркуш і вертає онбординг уже з ним.
describe('first-scan mode (onboarding)', () => {
  const { FIRST_SAVED_MS, FIRST_SHEET_MS } = require('../src/ScannerScreen');
  const resultSheet = (tree) =>
    tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);
  const exit = (tree) => tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && typeof n.props.onPress === 'function').at(-1);

  test('one object only: no mode picker and no scans counter, even if the saved mode is scene', async () => {
    const onExit = jest.fn();
    const tree = await render(scanner({ firstScan: true, onExit, scanMode: 'scene', scansLeft: 1, scanSource: 'onboarding' }));
    expect(tree.root.findAll((n) => n.props.accessibilityRole === 'tablist')).toHaveLength(0);
    expect(texts(tree)).not.toContain(t('scanFreeLeft', { n: 1 }));
    await press(tree, () => shutter(tree).props.onPress());
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    expect(recognizeScene).not.toHaveBeenCalled();
    // хрестик над камерою — назад в онбординг
    await press(tree, () => resultSheet(tree).props.onRequestClose());
    await press(tree, () => exit(tree).props.onPress());
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('saving the word closes the sheet and hands the word back', async () => {
    const onFirstSaved = jest.fn();
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ firstScan: true, onExit: jest.fn(), onFirstSaved, onSaveWord }));
    await press(tree, () => shutter(tree).props.onPress());
    await press(tree, () => tree.root.findAll((n) => n.props.title === t('save') && n.props.onPress)[0].props.onPress());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain(t('saved')); // «Збережено» видно мить
    expect(onFirstSaved).not.toHaveBeenCalled();
    await act(async () => {
      await new Promise((r) => setTimeout(r, FIRST_SAVED_MS + 20));
    });
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => {
      await new Promise((r) => setTimeout(r, FIRST_SHEET_MS + 20));
    });
    expect(onFirstSaved).toHaveBeenCalledTimes(1);
    expect(onFirstSaved.mock.calls[0][0]).toMatchObject({ word: 'la taza', translation: 'mug', lang: 'es', nativeLang: 'en' });
    await act(async () => tree.unmount());
  });

  test('without camera access there is still a way back', async () => {
    mockCamPerm = { granted: false, canAskAgain: false };
    const onExit = jest.fn();
    const tree = await render(scanner({ firstScan: true, onExit }));
    expect(texts(tree)).toContain(t('permTitle'));
    await press(tree, () => exit(tree).props.onPress());
    expect(onExit).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  // App Review 5.1.1(iv): наш екран перед системним запитом камери — лише
  // пояснення. Кнопка нейтральна («Далі», не «Дозволити»), і відкласти
  // запит хрестиком не можна: людина завжди доходить до системного вікна.
  test('before the system prompt: one neutral “Next”, no “Allow”, no way to put it off', async () => {
    mockCamPerm = { granted: false, canAskAgain: true };
    const onExit = jest.fn();
    const tree = await render(scanner({ firstScan: true, onExit }));
    const buttons = tree.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function');
    expect(buttons.map((b) => b.props.title)).toEqual([t('obNext')]);
    expect(JSON.stringify(texts(tree))).not.toMatch(/Allow/);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && typeof n.props.onPress === 'function')).toHaveLength(0);
    await press(tree, () => buttons[0].props.onPress());
    expect(mockAskCam).toHaveBeenCalledTimes(1);
    expect(onExit).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  // Після відмови посеред онбордингу в Параметри не ведемо: зміна доступу
  // до камери там змушує iOS вбити застосунок, і людина опинилась би на
  // початку знайомства. «Далі» веде онбординг далі, камера — потім.
  test('refused inside onboarding: “Next” moves on, Settings can wait', async () => {
    mockCamPerm = { granted: false, canAskAgain: false };
    const onExit = jest.fn();
    const tree = await render(scanner({ firstScan: true, onExit }));
    expect(texts(tree)).toContain(t('permDeniedLater'));
    expect(texts(tree)).not.toContain(t('openSettings'));
    const next = tree.root.findAll((n) => n.props.title === t('obNext') && typeof n.props.onPress === 'function')[0];
    await press(tree, () => next.props.onPress());
    expect(onExit).toHaveBeenCalledTimes(1);
    expect(Linking.openSettings).not.toHaveBeenCalled();
    expect(mockAskCam).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the regular scanner has no exit button', async () => {
    const tree = await render(scanner());
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && typeof n.props.onPress === 'function')).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});

// Звичайна вкладка сканера: те саме правило перед системним запитом, а
// після відмови — Параметри, єдиний спосіб увімкнути камеру.
describe('camera permission on the Scan tab', () => {
  const buttons = (tree) => tree.root.findAll((n) => typeof n.props.title === 'string' && typeof n.props.onPress === 'function');

  test('not asked yet: a neutral “Next” that brings up the system prompt', async () => {
    mockCamPerm = { granted: false, canAskAgain: true };
    const tree = await render(scanner());
    expect(buttons(tree).map((b) => b.props.title)).toEqual([t('obNext')]);
    await press(tree, () => buttons(tree)[0].props.onPress());
    expect(mockAskCam).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('refused: Settings', async () => {
    mockCamPerm = { granted: false, canAskAgain: false };
    const tree = await render(scanner());
    expect(texts(tree)).toContain(t('permDeniedText'));
    expect(buttons(tree).map((b) => b.props.title)).toEqual([t('openSettings')]);
    await press(tree, () => buttons(tree)[0].props.onPress());
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });
});

// v1.3: безкоштовний скан — один на все життя. Лічильник над камерою каже
// «лишився N безкоштовних», а не «на сьогодні»: завтра нових не буде.
describe('the free scans counter over the camera', () => {
  // нуль сканів — не «0 лишилось», а «використано» і чип Pro (polishApp.test.js)
  test('says how many free scans are left, never “today”', async () => {
    // v1.3: лічильник переїхав у статус над камерою — «1 безкоштовний скан»
    for (const [n, en, uk] of [
      [1, '1 free scan', '1 безкоштовний скан'],
      [3, '3 free scans', '3 безкоштовні скани'],
    ]) {
      let tree = await render(scanner({ scansLeft: n }));
      expect(texts(tree)).toContain(en);
      expect(texts(tree).some((s) => /today/i.test(s))).toBe(false);
      await act(async () => tree.unmount());
      tree = await render(scanner({ scansLeft: n, nativeLang: 'uk', t: makeT('uk') }));
      expect(texts(tree)).toContain(uk);
      expect(texts(tree).some((s) => /сьогодні/.test(s))).toBe(false);
      await act(async () => tree.unmount());
    }
  });

  test('with Pro (no ceiling) there is no counter at all', async () => {
    const tree = await render(scanner({ scansLeft: Infinity }));
    expect(texts(tree).some((s) => /free scans?/.test(s))).toBe(false);
    await act(async () => tree.unmount());
  });
});
