// Полірування сканера (жовтень 2026): що відбувається, коли людина йде зі
// сканера посеред запиту, як сканер говорить із VoiceOver, який віброгук
// супроводжує невдачу, і що показує «Збережено». Камера, ImageManipulator,
// файлова система й розпізнавання підставні.
import { AccessibilityInfo, Animated, Image } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import ScannerScreen from '../src/ScannerScreen';
import SceneView from '../src/scene/SceneView';
import { abortScans, recognizeImage, recognizeScene } from '../src/api';
import { track } from '../src/analytics';
import { makeT } from '../src/i18n';
import { DUR } from '../src/motion';
import { IcCheck } from '../src/icons';
import { FadeIn } from '../src/ui';

const shots = [];
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => {
        const shot = { uri: 'file:///shot.jpg', width: 1200, height: 1600, release: jest.fn() };
        global.__shots.push(shot);
        return shot;
      },
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [global.__camPerm, jest.fn(), jest.fn()] };
});

const chains = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const chain = { source, ops: [], uri: null };
    global.__chains.push(chain);
    const c = {
      resize: (r) => (chain.ops.push({ resize: r }), c),
      crop: (r) => (chain.ops.push({ crop: r }), c),
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

// Які файли кешу сканер стер (dropFile)
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
jest.mock('../src/analytics', () => ({ ...jest.requireActual('../src/analytics'), track: jest.fn() }));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [200, 300, 700, 800], outline: null, usage: null };
const SCENE = {
  objects: [
    { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: [500, 400, 640, 560], outline: null },
    { word: 'la lámpara', ipa: '', translation: 'lamp', example: '', exampleTranslation: '', box: [100, 600, 420, 900], outline: null },
  ],
  usage: null,
};
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

beforeEach(() => {
  global.__shots = shots;
  global.__chains = chains;
  global.__deleted = deleted;
  global.__camPerm = { granted: true, canAskAgain: true };
  shots.length = 0;
  chains.length = 0;
  deleted.length = 0;
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
  recognizeScene.mockReset();
  recognizeScene.mockImplementation(async () => SCENE);
  abortScans.mockReset();
  track.mockReset();
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
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const saveBtn = (tree) => tree.root.findAll((n) => n.props.title === t('save') && typeof n.props.onPress === 'function')[0];

// ───────────────────────────────────────────────────────────────────────────
// Сканер каже App, що він у дорозі (onBusyChange): доки іде розпізнавання
// одного предмета, з вкладки не виходимо
describe('onBusyChange', () => {
  test('true while one object is being recognized, false when it is over, false again on unmount', async () => {
    let answer;
    recognizeImage.mockImplementation(() => new Promise((res) => (answer = res)));
    const onBusyChange = jest.fn();
    const tree = await render({ onBusyChange });
    expect(onBusyChange.mock.calls.at(-1)).toEqual([false]);
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(onBusyChange.mock.calls.at(-1)).toEqual([true]);
    await act(async () => answer(RESULT));
    await settle();
    expect(onBusyChange.mock.calls.at(-1)).toEqual([false]);
    await act(async () => tree.unmount());
    expect(onBusyChange.mock.calls.at(-1)).toEqual([false]);
  });

  test('a scene does not hold the tab, and the prop is optional', async () => {
    recognizeScene.mockImplementation(() => new Promise(() => {}));
    const onBusyChange = jest.fn();
    const tree = await render({ scanMode: 'scene', onBusyChange });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(onBusyChange.mock.calls.every(([on]) => on === false)).toBe(true);
    await act(async () => tree.unmount());
    // без пропа (сканер онбордингу) нічого не падає
    recognizeImage.mockImplementation(() => new Promise(() => {}));
    const plain = await render();
    await act(async () => {
      shutter(plain).props.onPress();
    });
    await settle();
    await act(async () => plain.unmount());
  });

  test('unmounting mid-scan releases the tab hold', async () => {
    recognizeImage.mockImplementation(() => new Promise(() => {}));
    const onBusyChange = jest.fn();
    const tree = await render({ onBusyChange });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(onBusyChange.mock.calls.at(-1)).toEqual([true]);
    await act(async () => tree.unmount());
    expect(onBusyChange.mock.calls.at(-1)).toEqual([false]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Вкладку змінено посеред розпізнавання (scanner-tab-switch-burns-scan)
describe('leaving the scanner while a scan is in flight', () => {
  async function startAndLeave(props = {}) {
    let answer;
    let fail;
    recognizeImage.mockImplementation(() => new Promise((res, rej) => ((answer = res), (fail = rej))));
    const tree = await render(props);
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    await act(async () => tree.unmount());
    // act() віддає thenable без ланцюжка, тож чекаємо по черзі
    const later = async (fn) => {
      await act(async () => fn());
      await settle();
    };
    return { answer: (v) => later(() => answer(v)), fail: (e) => later(() => fail(e)) };
  }

  test('the request is aborted on unmount', async () => {
    await startAndLeave();
    expect(abortScans).toHaveBeenCalledTimes(1);
  });

  test('an answer that still arrives opens nothing: no sheet, no buzz, no analytics; the counter is told; temp files and the frame go', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    const onScanned = jest.fn();
    const onResultVisible = jest.fn();
    const { answer } = await startAndLeave({ onScanned, onResultVisible });
    const backdrop = chains[1].uri; // тло 9:16 рендериться, поки модель думає
    await answer({ ...RESULT, usage: { scans: 1, limit: 1 } });
    // сервер скан зарахував, тож лічильник App мусить це знати
    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(onResultVisible).not.toHaveBeenCalledWith(true);
    // тло стерте, наліпку вже навіть не ріжемо (третього ланцюжка нема), кадр камери звільнено
    expect(deleted).toContain(backdrop);
    expect(chains).toHaveLength(2);
    expect(shots[0].release).toHaveBeenCalledTimes(1);
    expect(note).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith('scan', expect.anything());
  });

  test('an aborted request fails silently: no error pill, no buzz, no analytics', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    const { fail } = await startAndLeave();
    await fail(new Error('SCAN_TIMEOUT'));
    expect(note).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalledWith('scan', expect.anything());
    // тло, яке встигли відрендерити, не лишається в кеші
    expect(deleted).toContain(chains[1].uri);
  });

  test('a paywall answer after leaving does not open the paywall over another tab', async () => {
    const onLimitReached = jest.fn(async () => false);
    const { fail } = await startAndLeave({ onLimitReached });
    await fail(Object.assign(new Error('SCAN_LIMIT'), { data: { used: 1, limit: 1 } }));
    expect(onLimitReached).not.toHaveBeenCalled();
  });

  test('a forgotten device is still reported: that is about the app, not the screen', async () => {
    const onSessionLost = jest.fn();
    const { fail } = await startAndLeave({ onSessionLost });
    await fail(new Error('SCAN_AUTH'));
    expect(onSessionLost).toHaveBeenCalledTimes(1);
  });

  test('a scene: no history entry, the 9:16 frame is deleted, the camera frame released', async () => {
    let answer;
    recognizeScene.mockImplementation(() => new Promise((res) => (answer = res)));
    const onSceneScanned = jest.fn();
    const onScanned = jest.fn();
    const tree = await render({ scanMode: 'scene', onSceneScanned, onScanned });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    const frame = chains[0].uri; // captureScene: перша картинка — для екрана
    await act(async () => tree.unmount());
    await act(async () => answer(SCENE));
    await settle();
    expect(onSceneScanned).not.toHaveBeenCalled();
    expect(onScanned).toHaveBeenCalledTimes(1);
    expect(deleted).toContain(frame);
    expect(shots[0].release).toHaveBeenCalledTimes(1);
  });

  test('while recognising, the last-word sticker and the first-scan close button are off', async () => {
    let answer;
    recognizeImage.mockImplementation(() => new Promise((res) => (answer = res)));
    const last = { id: 'w1', word: 'la silla', translation: 'chair', lang: 'es', addedAt: 1 };
    const onExit = jest.fn();
    let tree = await render({ lastWord: last, onOpenWord: jest.fn() });
    const sticker = () => tree.root.findAll((n) => n.props.testID === 'last-word' && typeof n.props.onPress === 'function')[0];
    expect(sticker().props.disabled).toBeFalsy();
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(sticker().props.disabled).toBe(true);
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());

    tree = await render({ firstScan: true, onExit });
    const close = () => tree.root.findAll((n) => n.props.testID === 'scan-close' && typeof n.props.onPress === 'function')[0];
    expect(close().props.disabled).toBeFalsy();
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(close().props.disabled).toBe(true);
    expect(close().props.accessibilityState).toEqual({ disabled: true });
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// VoiceOver (scanner-voiceover-announcements): accessibilityLiveRegion на iOS мовчить
describe('VoiceOver announcements', () => {
  test('recognising starts: “Recognizing…” is spoken once', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    say.mockClear();
    let answer;
    recognizeImage.mockImplementation(() => new Promise((res) => (answer = res)));
    const tree = await render();
    expect(say).not.toHaveBeenCalled();
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(say).toHaveBeenCalledTimes(1);
    expect(say).toHaveBeenCalledWith(t('scanning'));
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());
  });

  test('a failed scan speaks the error line', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    say.mockClear();
    recognizeImage.mockImplementation(async () => Promise.reject(new Error('SCAN_OFFLINE')));
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(say).toHaveBeenCalledWith(t('scanErrOffline'));
    // і плашка на екрані та сама
    expect(texts(tree)).toContain(t('scanErrOffline'));
    await act(async () => tree.unmount());
  });

  test('the same error twice in a row is spoken twice', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    say.mockClear();
    // відповідь не миттєва, як у справжньої мережі: між двома помилками рядок
    // помилки встигає зникнути (інакше React зліпив би їх в один рендер)
    recognizeImage.mockImplementation(() => new Promise((_, rej) => setTimeout(() => rej(new Error('SCAN_RATE')), 50)));
    const tree = await render();
    // не чекаємо скан усередині act: інакше «порожній» рядок помилки між
    // двома спробами теж злипся б в один рендер
    for (let i = 0; i < 2; i++) {
      await act(async () => {
        shutter(tree).props.onPress();
      });
      await settle(6);
    }
    expect(say.mock.calls.filter(([x]) => x === t('scanErrRate'))).toHaveLength(2);
    await act(async () => tree.unmount());
  });

  test('scene mode speaks its first status line instead of the object one', async () => {
    const say = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    say.mockClear();
    let answer;
    recognizeScene.mockImplementation(() => new Promise((res) => (answer = res)));
    const tree = await render({ scanMode: 'scene' });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    expect(say).toHaveBeenCalledWith(t('sceneStatus1'));
    expect(say).not.toHaveBeenCalledWith(t('scanning'));
    await act(async () => answer(SCENE));
    await settle();
    await act(async () => tree.unmount());
  });

  test('the Android live regions stay', async () => {
    const tree = await render();
    expect(tree.root.findAll((n) => n.props.accessibilityLiveRegion === 'polite').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Віброгук невдачі (scanner-error-haptics)
describe('haptics on a failed scan', () => {
  const kinds = (spy) => spy.mock.calls.map(([k]) => k);
  const limit = () => Object.assign(new Error('SCAN_LIMIT'), { data: { used: 1, limit: 1 } });

  test('“nothing recognised” is a warning, not an error', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    recognizeImage.mockImplementation(async () => Promise.reject(new Error('SCAN_EMPTY')));
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(kinds(note)).toEqual([Haptics.NotificationFeedbackType.Warning]);
    await act(async () => tree.unmount());
  });

  test('network, timeout and server failures are errors', async () => {
    for (const code of ['SCAN_OFFLINE', 'SCAN_TIMEOUT', 'SCAN_SERVER']) {
      const note = jest.spyOn(Haptics, 'notificationAsync');
      recognizeImage.mockImplementation(async () => Promise.reject(new Error(code)));
      const tree = await render();
      await press(() => shutter(tree).props.onPress());
      expect(kinds(note)).toEqual([Haptics.NotificationFeedbackType.Error]);
      await act(async () => tree.unmount());
      note.mockRestore();
    }
  });

  test('the paywall hand-off is silent: no buzz, no error line', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    recognizeImage.mockImplementation(async () => Promise.reject(limit()));
    const onLimitReached = jest.fn(async () => false);
    const tree = await render({ onLimitReached });
    await press(() => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(note).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(t('scanErrServer'));
    // аналітика теж не рахує це помилкою скану
    expect(track).not.toHaveBeenCalledWith('scan', expect.objectContaining({ ok: false }));
    await act(async () => tree.unmount());
  });

  test('Pro bought, the frame resent, but the server still says 402: a normal error line, not silence', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    recognizeImage.mockImplementation(async () => Promise.reject(limit()));
    const onLimitReached = jest.fn(async () => true);
    const tree = await render({ onLimitReached });
    await press(() => shutter(tree).props.onPress());
    expect(recognizeImage).toHaveBeenCalledTimes(2);
    // App питали один раз: удруге пейвол однаково не відкрився б
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(texts(tree)).toContain(t('scanErrServer'));
    expect(kinds(note)).toEqual([Haptics.NotificationFeedbackType.Error]);
    await act(async () => tree.unmount());
  });

  test('a scene that fails with 402 and no handler is an ordinary error too', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(Object.assign(new Error('SCENE_PRO'), { data: { used: 1, limit: 1 } })));
    const tree = await render({ scanMode: 'scene' });
    await press(() => shutter(tree).props.onPress());
    expect(texts(tree)).toContain(t('scanErrServer'));
    await act(async () => tree.unmount());
  });

  test('success is still one Success buzz', async () => {
    const note = jest.spyOn(Haptics, 'notificationAsync');
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(kinds(note)).toEqual([Haptics.NotificationFeedbackType.Success]);
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scanner-failure-motion: кадр сцени відходить, а не зникає
describe('a failed scene scan', () => {
  const frozen = (tree) => tree.root.findAll((n) => n.type === Image && n.props.source?.uri === 'file:///cache/out0.jpg');

  test('the error line is there at once, the frozen frame fades out in DUR.exit and is gone shortly after', async () => {
    recognizeScene.mockImplementation(async () => Promise.reject(new Error('SCAN_EMPTY')));
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await render({ scanMode: 'scene' });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30));
    });
    // плашка не чекає на кадр
    expect(texts(tree)).toContain(t('sceneErrEmpty'));
    expect(frozen(tree)).toHaveLength(1);
    expect(timing.mock.calls.some(([, cfg]) => cfg.toValue === 0 && cfg.duration === DUR.exit && cfg.useNativeDriver === true)).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, DUR.exit + 120));
    });
    expect(frozen(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('“Reduce Motion”: the photo fades with the backdrop instead of cutting', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    let fail;
    recognizeScene.mockImplementation(() => new Promise((res, rej) => (fail = rej)));
    const tree = await render({ scanMode: 'scene' });
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await settle();
    const photo = frozen(tree)[0];
    expect(photo).toBeTruthy();
    // батько зображення — анімований View з непрозорістю, прив'язаною до кадру
    const holder = photo.parent;
    const style = [].concat(holder.props.style).flat().filter(Boolean);
    expect(style.some((x) => x.opacity !== undefined)).toBe(true);
    await act(async () => fail(new Error('SCAN_EMPTY')));
    await settle();
    await act(async () => tree.unmount());
  });

  test('a shutter tap during the thaw window does not leave the old frame over the camera', async () => {
    const tree = await render({ scanMode: 'scene' });
    await press(() => shutter(tree).props.onPress());
    const scene = tree.root.findByType(SceneView);
    expect(scene.props.scene).not.toBeNull();
    await press(() => scene.props.onClose());
    // кадр сцени ще мить прикриває камеру…
    expect(frozen(tree)).toHaveLength(1);
    // …і тут людина знову тисне затвор, уже на предметі
    let answer;
    recognizeImage.mockImplementation(() => new Promise((res) => (answer = res)));
    await act(async () =>
      tree.update(
        <SafeAreaProvider initialMetrics={metrics}>
          <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={Infinity} t={t} scanMode="object" />
        </SafeAreaProvider>
      )
    );
    await act(async () => {
      shutter(tree).props.onPress();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    expect(frozen(tree)).toHaveLength(0);
    await act(async () => answer(RESULT));
    await settle();
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scanner-saved-ignores-language
describe('“Saved” is per language', () => {
  const radio = { ...RESULT, word: 'radio', translation: 'radio' };

  test('radio saved in English, scanned as Spanish: the Save button, not the badge', async () => {
    recognizeImage.mockImplementation(async () => radio);
    const onSaveWord = jest.fn(() => true);
    const tree = await render({ savedWords: [{ id: 'a', word: 'radio', lang: 'en' }], onSaveWord });
    await press(() => shutter(tree).props.onPress());
    expect(saveBtn(tree)).toBeTruthy();
    expect(texts(tree)).not.toContain(t('saved'));
    await press(() => saveBtn(tree).props.onPress());
    expect(onSaveWord).toHaveBeenCalledWith(expect.objectContaining({ word: 'radio', lang: 'es' }));
    await act(async () => tree.unmount());
  });

  test('the same word in the same language is “Saved”, whatever the case', async () => {
    recognizeImage.mockImplementation(async () => ({ ...radio, word: 'Radio' }));
    const tree = await render({ savedWords: [{ id: 'a', word: 'radio', lang: 'es' }] });
    await press(() => shutter(tree).props.onPress());
    expect(saveBtn(tree)).toBeUndefined();
    expect(texts(tree)).toContain(t('saved'));
    await act(async () => tree.unmount());
  });

  test('with the last scan used, a cognate in another language still gets Save, not Done', async () => {
    recognizeImage.mockImplementation(async () => radio);
    const tree = await render({ scansLeft: 0, savedWords: [{ id: 'a', word: 'radio', lang: 'en' }] });
    await press(() => shutter(tree).props.onPress());
    expect(saveBtn(tree)).toBeTruthy();
    expect(tree.root.findAll((n) => n.props.title === t('finishBtn')).length).toBe(0);
    await act(async () => tree.unmount());
  });

  test('a corrupt record without a word does not crash the sheet', async () => {
    const tree = await render({ savedWords: [{ id: 'x' }, { id: 'y', word: 42 }, null].filter(Boolean) });
    await press(() => shutter(tree).props.onPress());
    expect(saveBtn(tree)).toBeTruthy();
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scanner-save-morph + ux-motion-scan-save-feedback
describe('the Saved badge', () => {
  test('appears with a fade (opacity only) and carries a check mark', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(tree.root.findAllByType(IcCheck)).toHaveLength(0);
    await press(() => saveBtn(tree).props.onPress());
    expect(texts(tree)).toContain(t('saved'));
    expect(tree.root.findAllByType(IcCheck)).toHaveLength(1);
    // FadeIn без зсуву: dy = 0
    expect(tree.root.findAllByType(FadeIn).some((f) => f.props.dy === 0)).toBe(true);
    await act(async () => tree.unmount());
  });

  test('the example sentence says it will be spoken; no empty translation line without a translation', async () => {
    recognizeImage.mockImplementation(async () => ({ ...RESULT, example: 'Bebo té en mi taza.', exampleTranslation: '' }));
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    const example = tree.root.findAll(
      (n) => n.props.accessibilityHint === t('listen') && typeof n.props.onPress === 'function' && n.props.style?.padding === 14
    )[0];
    expect(example).toBeTruthy();
    // речення є, порожнього рядка перекладу — ні
    const empties = tree.root.findAll((n) => n.type === 'Text' && n.props.children === '');
    expect(empties).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
// scanner-pinch-rerender: зум перемальовує сканер, але не видошукач
describe('zooming does not rebuild the viewfinder', () => {
  const finder = (tree) => tree.root.find((n) => typeof n.type === 'function' && n.props.frame && 'rootH' in n.props);

  test('the frame object is the same after the zoom changes, so the memoised viewfinder skips the render', async () => {
    const tree = await render();
    const before = finder(tree).props.frame;
    const zoom = tree.root.find((n) => n.props.testID === 'zoom' && typeof n.props.onPress === 'function');
    await press(() => zoom.props.onPress());
    expect(tree.root.find((n) => n.props.testID === 'zoom').props.accessibilityLabel).toBe(t('scanZoomA11y', { z: '2×' }));
    expect(finder(tree).props.frame).toBe(before);
    await act(async () => tree.unmount());
  });

  test('a new layout (another mode) does make a new frame', async () => {
    const tree = await render({ scanMode: 'object' });
    const before = finder(tree).props.frame;
    await act(async () =>
      tree.update(
        <SafeAreaProvider initialMetrics={metrics}>
          <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={Infinity} t={t} scanMode="scene" />
        </SafeAreaProvider>
      )
    );
    expect(finder(tree).props.frame).not.toBe(before);
    await act(async () => tree.unmount());
  });
});
