// Не-iOS: RevenueCat тут не налаштовується зовсім (ключ у нас лише iOS), тож
// і атрибуції Apple Ads (AdServices — API лише iOS) бути не може. А пейвол
// і Customer Center від RevenueCat не відкриваються — лишається наш.
import { act, create } from 'react-test-renderer';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    LOG_LEVEL: { WARN: 'WARN' },
    setLogLevel: jest.fn(async () => {}),
    configure: jest.fn(),
    enableAdServicesAttributionTokenCollection: jest.fn(async () => {}),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    getOfferings: jest.fn(async () => ({ current: null })),
  },
}));

const sdk = require('react-native-purchases').default;
const RevenueCatUI = require('react-native-purchases-ui').default;

// purchases.js читає платформу під час імпорту — тож підміняємо її ДО
// нього (require, а не import: import підняло б імпорт над цим рядком)
const { Platform } = require('react-native');
const realOS = Platform.OS;
Platform.OS = 'android';
const purchases = require('../src/purchases');
afterAll(() => {
  Platform.OS = realOS;
});

test('no SDK set-up and no AdServices call off iOS', async () => {
  expect(purchases.MODE).not.toBe('revenuecat');
  let hook;
  function Harness() {
    hook = purchases.usePro('u1');
    return null;
  }
  let tree;
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(sdk.configure).not.toHaveBeenCalled();
  expect(sdk.enableAdServicesAttributionTokenCollection).not.toHaveBeenCalled();
  expect(purchases.rcUiAvailable()).toBe(false);
  expect(purchases.paywallConfig().ui).toBe('custom');
  let res;
  await act(async () => {
    res = await hook.presentPaywall();
  });
  expect(res).toEqual({ fallback: true });
  expect(RevenueCatUI.presentPaywall).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});
