// Сканер із підставленими камерою, ImageManipulator і розпізнаванням.
// Перевіряємо дві речі, яких не видно з App окремо:
//   • згода на відправку кадру (App Review 5.1.2(i)): без неї кадр не йде нікуди;
//   • 402 після свіжої покупки Pro: той самий кадр іде ще раз, без пейволу.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Modal } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import ScannerScreen from '../src/ScannerScreen';
import ConsentSheet from '../src/ConsentSheet';
import ShareSheet from '../src/share/ShareSheet';
import { recognizeImage } from '../src/api';
import { makeT } from '../src/i18n';

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
  const context = () => {
    const c = {
      resize: () => c,
      crop: () => c,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///small.jpg', base64: 'b64' }), release() {} }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate: context }, SaveFormat: { JPEG: 'jpeg' } };
});

jest.mock('../src/api', () => ({ ...jest.requireActual('../src/api'), recognizeImage: jest.fn() }));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: null, outline: null, usage: null };
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
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
    tree = create(element);
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

test('the first shutter tap asks before any photo leaves the phone', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  const tree = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <App />
    </SafeAreaProvider>
  );

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
  expect(recognizeImage).toHaveBeenCalledWith('b64', 'es', 'en');
  await act(async () => tree.unmount());
});

describe('402 from the server', () => {
  const scanner = (onLimitReached) => (
    <ScannerScreen
      targetLang="es"
      nativeLang="en"
      savedWords={[]}
      onSaveWord={() => true}
      onLimitReached={onLimitReached}
      aiConsent
      t={makeT('en')}
    />
  );
  const limitError = () => Object.assign(new Error('SCAN_LIMIT'), { data: { error: 'SCAN_LIMIT', used: 5, limit: 5 } });

  test('Pro just bought and the server lifted the ceiling: the same frame goes again', async () => {
    recognizeImage.mockImplementationOnce(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => true);
    const tree = await render(scanner(onLimitReached));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledWith({ error: 'SCAN_LIMIT', used: 5, limit: 5 });
    expect(recognizeImage).toHaveBeenCalledTimes(2);
    expect(tree.root.findAll((n) => n.props.children === 'la taza').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('otherwise the paywall takes over and the frame is not resent', async () => {
    recognizeImage.mockImplementation(async () => Promise.reject(limitError()));
    const onLimitReached = jest.fn(async () => false);
    const tree = await render(scanner(onLimitReached));
    await press(tree, () => shutter(tree).props.onPress());
    expect(onLimitReached).toHaveBeenCalledTimes(1);
    expect(recognizeImage).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });
});

// «Назад» на Android: спершу закривається картка «поділитись», а не весь
// результат з незбереженим словом.
test('back closes the share card first, then the result', async () => {
  const t = makeT('en');
  const tree = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent t={t} />
    </SafeAreaProvider>
  );
  expect(shutter(tree).props.accessibilityLabel).toBe(t('scanShutter'));
  await press(tree, () => shutter(tree).props.onPress());

  // аркуш результату — єдиний Modal сканера, крім аркуша згоди
  const result = () => tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet);
  const sharing = () => tree.root.findByType(ShareSheet).props.visible;
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
