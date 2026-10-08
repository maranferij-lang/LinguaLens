// Аркуш результату скану: вміст лишається, поки Modal їде вниз
// (scanner-result-sheet-motion, ux-motion-scan-sheet-mechanics), тап повз
// незбережене слово відповідає рухом «Зберегти» (scanner-backdrop-tap-feedback),
// а наліпка останнього слова чекає, поки аркуш поїде.
//
// На iOS справжній Modal тримає дітей, поки не прийде нативний dismiss, а
// jest-заглушка прибирає їх одразу. Тут заглушка поводиться як iOS для
// аркуша результату (прозорий slide), решта Modal — як звичайно.
import { AccessibilityInfo, Animated, Modal, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ScannerScreen from '../src/ScannerScreen';
import ShareSheet from '../src/share/ShareSheet';
import { recognizeImage } from '../src/api';
import { CAM } from '../src/scanner/CamGlass';
import { makeT } from '../src/i18n';

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
      takePictureAsync: async () => ({ uri: 'file:///shot.jpg', width: 1200, height: 1600, release() {} }),
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn(), jest.fn()] };
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
  recognizeScene: jest.fn(),
  abortScans: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: null, outline: null, usage: null };
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

beforeEach(() => {
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
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
    <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent scansLeft={3} t={t} {...props} />
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
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const byTitle = (tree, title) => tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const resultSheet = (tree) => tree.root.findAllByType(Modal).find((m) => m.props.animationType === 'slide' && m.props.transparent);
const backdrop = (tree) =>
  tree.root.findAll(
    (n) => n.props.accessible === false && typeof n.props.onPress === 'function' && StyleSheet.flatten(n.props.style)?.backgroundColor === CAM.scrim
  )[0];

describe('the sheet keeps its content while it slides down', () => {
  test('“Scan again” on an unsaved word: the word and “Save” stay, not an empty shell and not “Saved”', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());

    expect(resultSheet(tree).props.visible).toBe(false);
    // Modal ще на екрані (їде вниз): слово, кнопка «Зберегти» й «Сканувати ще» на місці
    expect(texts(tree)).toContain('la taza');
    expect(byTitle(tree, t('save'))).toBeTruthy();
    expect(byTitle(tree, t('scanAgain'))).toBeTruthy();
    expect(texts(tree)).not.toContain(t('saved'));
    await act(async () => tree.unmount());
  });

  test('after the native dismiss the snapshot is dropped, and the next scan shows its own word', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await act(async () => resultSheet(tree).props.onDismiss());
    await act(async () => tree.update(element()));
    expect(texts(tree)).not.toContain('la taza');
    expect(byTitle(tree, t('save'))).toBeUndefined();

    recognizeImage.mockImplementation(async () => ({ ...RESULT, word: 'la silla', translation: 'chair' }));
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(texts(tree)).toContain('la silla');
    expect(texts(tree)).not.toContain('la taza');
    await act(async () => tree.unmount());
  });

  test('the last free scan: “Saved” and “Done” stay on the way down; no “Scan again” appears', async () => {
    const tree = await render({ scansLeft: 0 });
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('save')).props.onPress());
    expect(byTitle(tree, t('finishBtn'))).toBeTruthy();
    await press(() => byTitle(tree, t('finishBtn')).props.onPress());

    expect(resultSheet(tree).props.visible).toBe(false);
    expect(texts(tree)).toContain(t('saved'));
    expect(byTitle(tree, t('finishBtn'))).toBeTruthy();
    expect(byTitle(tree, t('scanAgain'))).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('taps on the departing sheet do nothing: no save, no share card', async () => {
    const onSaveWord = jest.fn(() => true);
    const tree = await render({ onSaveWord });
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    await press(() => byTitle(tree, t('save')).props.onPress());
    expect(onSaveWord).not.toHaveBeenCalled();
    const share = tree.root.findAll((n) => n.props.accessibilityLabel === t('share') && typeof n.props.onPress === 'function')[0];
    await press(() => share.props.onPress());
    expect(tree.root.findAllByType(ShareSheet)[0].props.visible).toBe(false);
    await act(async () => tree.unmount());
  });
});

describe('a tap outside an unsaved word', () => {
  test('does not close the sheet, but “Save” answers with a short spring (1 → 1.03 → 1), no vibration', async () => {
    const Haptics = require('expo-haptics');
    const buzz = [jest.spyOn(Haptics, 'impactAsync'), jest.spyOn(Haptics, 'notificationAsync'), jest.spyOn(Haptics, 'selectionAsync')];
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    buzz.forEach((b) => b.mockClear());
    const spring = jest.spyOn(Animated, 'spring');
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    const to = spring.mock.calls.map(([, cfg]) => cfg.toValue);
    expect(to).toEqual(expect.arrayContaining([1.03, 1]));
    expect(spring.mock.calls.every(([, cfg]) => cfg.useNativeDriver === true)).toBe(true);
    buzz.forEach((b) => expect(b).not.toHaveBeenCalled());
    await act(async () => tree.unmount());
  });

  test('“Reduce Motion”: no scale, a single opacity dip instead', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(spring.mock.calls.some(([, cfg]) => cfg.toValue === 1.03)).toBe(false);
    expect(timing.mock.calls.some(([, cfg]) => cfg.toValue < 1)).toBe(true);
    await act(async () => tree.unmount());
  });

  test('once the word is saved the same tap closes the sheet', async () => {
    const tree = await render();
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(tree, t('save')).props.onPress());
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => tree.unmount());
  });

  test('the first scan of the onboarding ignores it while the sheet is saying goodbye', async () => {
    const onFirstSaved = jest.fn();
    const tree = await render({ firstScan: true, onExit: jest.fn(), onFirstSaved });
    await press(() => shutter(tree).props.onPress());
    const spring = jest.spyOn(Animated, 'spring');
    await press(() => byTitle(tree, t('save')).props.onPress());
    spring.mockClear();
    await press(() => backdrop(tree).props.onPress());
    // «Збережено» вже їде вниз сама: ні відповіді, ні закриття вдруге
    expect(spring.mock.calls.some(([, cfg]) => cfg.toValue === 1.03)).toBe(false);
    await act(async () => tree.unmount());
  });
});

describe('the last-word sticker waits while a sheet is open', () => {
  const stickers = (tree) => tree.root.findAll((n) => n.props.word && 'paused' in n.props && typeof n.props.onPress === 'function');

  test('paused while the result is open, free again after it closes', async () => {
    const last = { id: 'w1', word: 'la silla', translation: 'chair', lang: 'es', addedAt: 1 };
    const tree = await render({ lastWord: last, onOpenWord: jest.fn() });
    expect(stickers(tree)[0].props.paused).toBe(false);
    await press(() => shutter(tree).props.onPress());
    expect(stickers(tree)[0].props.paused).toBe(true);
    await press(() => byTitle(tree, t('scanAgain')).props.onPress());
    expect(stickers(tree)[0].props.paused).toBe(false);
    await act(async () => tree.unmount());
  });
});
