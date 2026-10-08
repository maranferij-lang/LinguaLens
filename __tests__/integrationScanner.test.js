// Інтеграція v1.3: перший скан онбордингу на всю висоту (W1 bleedTop + W3).
// Онбординг тримає статус-бар теми (у світлій — темний текст), а камера
// тепер іде під нього: над камерою сканер ставить свій, світлий. Лише поки
// видно камеру — екран дозволу камери лежить на тлі теми. У вкладці
// статус-бар і далі веде App (пейвол над камерою має бути темним).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import App from '../App';
import OnboardingScreen from '../src/OnboardingScreen';
import ScannerScreen from '../src/ScannerScreen';
import { makeT } from '../src/i18n';

jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

let mockPerm = { granted: true, canAskAgain: true };
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({ takePictureAsync: async () => null }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [mockPerm, jest.fn()] };
});

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');

async function render(props) {
  StatusBar.mockClear();
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent t={t} {...props} />
      </SafeAreaProvider>
    );
  });
  const styles = StatusBar.mock.calls.map(([p]) => p.style);
  await act(async () => tree.unmount());
  return styles;
}

afterEach(() => {
  mockPerm = { granted: true, canAskAgain: true };
});

test('the first scan under the status bar sets a light one over the camera', async () => {
  expect(await render({ firstScan: true, onExit() {}, bleedTop: 59 })).toContain('light');
});

test('not on the camera permission screen, which sits on the theme background', async () => {
  mockPerm = { granted: false, canAskAgain: true };
  expect(await render({ firstScan: true, onExit() {}, bleedTop: 59 })).toEqual([]);
});

test('in the tab the App keeps the status bar (a paywall over the camera needs a dark one)', async () => {
  expect(await render({ bleedTop: 59, scansLeft: 1 })).toEqual([]);
});

test('the App gives the first scan the whole screen, like the tab scanner', async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  for (let i = 0; i < 5; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
  const onb = tree.root.findAllByType(OnboardingScreen)[0];
  const scanner = onb.props.renderScanner({ onSaved() {}, onExit() {}, level: 1 });
  expect(scanner.props.firstScan).toBe(true);
  expect(scanner.props.bleedTop).toBe(metrics.insets.top);
  await act(async () => tree.unmount());
});
