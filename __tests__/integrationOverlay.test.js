// Інтеграція v1.3: черга оверлеїв (план §5.13) і пейвол RevenueCat.
// Пейвол із дашборду — нативний, App про нього знає лише з прапорця. Свято
// серії, що вже стоїть у черзі, має відступити, щойно цей пейвол відкрився,
// і повернутись, коли його закрили (раніше прапорець був лише ref і рендеру
// не викликав: свято лишалось під пейволом і там «закінчувалось»).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RevenueCatUI from 'react-native-purchases-ui';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import StreakCelebration from '../src/streak/StreakCelebration';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1', PAYMENT_PENDING_ERROR: '20' },
    LOG_LEVEL: { WARN: 'WARN' },
    setLogLevel: jest.fn(async () => {}),
    configure: jest.fn(),
    enableAdServicesAttributionTokenCollection: jest.fn(async () => {}),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
    getAppUserID: jest.fn(async () => '$RCAnonymousID:x'),
    logIn: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    showManageSubscriptions: jest.fn(async () => {}),
    trackCustomPaywallImpression: jest.fn(async () => {}),
  },
}));
const sdk = require('react-native-purchases').default;

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const FREE_INFO = { entitlements: { active: {} } };
const offering = {
  current: {
    identifier: 'default',
    metadata: { paywall_ui: 'revenuecat' },
    availablePackages: [{ packageType: 'ANNUAL', product: { identifier: 'yearly', price: 34.99, priceString: '$34.99', introPrice: null } }],
  },
};
const ago = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDayKey(d);
};
const word = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't' + i, lang: 'es', addedAt: Date.now() - 90 * 864e5, srs: { box: 0, due: 0 } });

beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  jest.clearAllMocks();
  sdk.getCustomerInfo.mockImplementation(async () => FREE_INFO);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: FREE_INFO }));
  sdk.getOfferings.mockImplementation(async () => offering);
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
});

async function settle(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}
async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  mounted.push(tree);
  await settle(5);
  return tree;
}
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const run = async (fn) => {
  await act(async () => {
    fn();
  });
  await settle();
};

test('a celebration steps aside while the RevenueCat paywall is up and comes back after it', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true }));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify([word(1), word(2)]));
  await AsyncStorage.setItem('ll_activity_v1', JSON.stringify({ [ago(1)]: 2 }));
  let close;
  RevenueCatUI.presentPaywall.mockImplementation(
    () =>
      new Promise((resolve) => {
        close = () => resolve('CANCELLED');
      })
  );
  const tree = await renderApp();
  await run(() => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
  const data = () => one(tree, StreakCelebration).props.data;

  // перша дія дня — свято в черзі й на екрані
  await run(() => one(tree, FlashcardsScreen).props.onReview('w1', true));
  expect(data()).toEqual({ from: 1, to: 2 });

  // «Перейти на Pro» — нативний пейвол RevenueCat: свято відступає
  await run(() => one(tree, FlashcardsScreen).props.onOpenPro());
  expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
  expect(data()).toBeNull();

  // закрили — свято повертається. Магазин після пейволу не відповів
  // (refresh без нового стану): App перемальовує лише власний прапорець.
  sdk.getCustomerInfo.mockImplementation(async () => {
    throw new Error('offline');
  });
  await run(() => close());
  expect(data()).toEqual({ from: 1, to: 2 });
});
