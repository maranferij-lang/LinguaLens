// Збірка без магазину (релізна без ключа RevenueCat): пейвол наприкінці
// онбордингу не показуємо — купити однаково нічого не можна, — і прапорець
// не ставимо: пропозиція дочекається збірки, де її можна прийняти.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import OnboardingScreen from '../src/OnboardingScreen';
import OnboardingPaywall from '../src/OnboardingPaywall';
import PaywallScreen from '../src/PaywallScreen';
import FlashcardsScreen from '../src/FlashcardsScreen';
import { MODE } from '../src/purchases';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: '', IS_DEV: false }));

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

test('store unavailable: onboarding ends on the Learn tab without a paywall', async () => {
  expect(MODE).toBe('unavailable');
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  const onb = tree.root.findByType(OnboardingScreen);
  await act(async () => onb.props.onDone({ profile: null, heardFrom: 'friend', scanned: false, flow: 'control' }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  expect(tree.root.findAllByType(OnboardingPaywall)).toHaveLength(0);
  expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(0);
  expect(tree.root.findAllByType(FlashcardsScreen)).toHaveLength(1);
  expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).onbPaywallShown).not.toBe(true);
  await act(async () => tree.unmount());
});
