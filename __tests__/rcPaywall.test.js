// Пейвол із дашборду RevenueCat і Customer Center у зв'язці з App.
// metadata поточної пропозиції paywall_ui: "revenuecat" — кожна точка входу в
// пейвол показує пейвол RevenueCat; упав чи повернув ERROR — наш PaywallScreen.
// SDK RevenueCat підставлений (ключ Test Store), react-native-purchases-ui —
// заглушка з jest.setup.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RevenueCatUI from 'react-native-purchases-ui';
import App from '../App';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import ScannerScreen from '../src/ScannerScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { makeT } from '../src/i18n';

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
const t = makeT('en');
const FREE_INFO = { entitlements: { active: {} } };
const ent = (extra) => ({
  entitlements: { active: { lingualens_pro: { periodType: 'NORMAL', willRenew: true, productIdentifier: 'yearly', ...extra } } },
});
const PRO_INFO = ent({ expirationDateMillis: Date.now() + 30 * 864e5 });
const LIFETIME_INFO = ent({ expirationDateMillis: null, expirationDate: null, willRenew: false, productIdentifier: 'lifetime' });
const offering = (metadata) => ({
  current: {
    identifier: 'default',
    metadata,
    availablePackages: [
      { packageType: 'ANNUAL', product: { identifier: 'yearly', price: 59.99, priceString: '$59.99', introPrice: null } },
      { packageType: 'LIFETIME', product: { identifier: 'lifetime', price: 129.99, priceString: '$129.99', introPrice: null } },
    ],
  },
});

let info;
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
  jest.clearAllMocks();
  info = FREE_INFO;
  sdk.getCustomerInfo.mockImplementation(async () => info);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: info }));
  sdk.getOfferings.mockImplementation(async () => offering({ paywall_ui: 'revenuecat' }));
  RevenueCatUI.presentPaywall.mockImplementation(async () => 'CANCELLED');
  RevenueCatUI.presentCustomerCenter.mockImplementation(async () => {});
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
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
});

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
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

async function run(fn) {
  await act(async () => {
    await fn();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

test('every paywall entry shows the RevenueCat paywall; closing it changes nothing', async () => {
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
  expect(RevenueCatUI.presentPaywall.mock.calls[0][0].offering.identifier).toBe('default');
  expect(one(tree, PaywallScreen)).toBeNull();

  // стіна сканів — те саме
  await openTab(tree, 'scan');
  await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 1, limit: 1 }, 'SCAN_LIMIT'));
  expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(2);
  expect(one(tree, PaywallScreen)).toBeNull();
});

test('a purchase inside it unlocks Pro at once', async () => {
  const tree = await renderApp();
  RevenueCatUI.presentPaywall.mockImplementationOnce(async () => {
    info = PRO_INFO;
    return 'PURCHASED';
  });
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(one(tree, SettingsScreen).props.sub.pro).toBe(true);
  expect(one(tree, PaywallScreen)).toBeNull();
});

test('an ERROR or a crash falls back to our own paywall with the same reason', async () => {
  const tree = await renderApp();
  RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'ERROR');
  await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 1, limit: 1 }, 'SCAN_LIMIT'));
  expect(one(tree, PaywallScreen).props.reason).toBe('scans');
  await run(() => one(tree, PaywallScreen).props.onClose());

  RevenueCatUI.presentPaywall.mockImplementationOnce(async () => {
    throw new Error('native module missing');
  });
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(one(tree, PaywallScreen).props.reason).toBe('info');
});

test('with paywall_ui left at custom, our paywall shows and RevenueCat’s does not', async () => {
  sdk.getOfferings.mockImplementation(async () => offering({}));
  const tree = await renderApp();
  await openTab(tree, 'settings');
  // без Pro — «Відновити покупки» в налаштуваннях лишається
  expect(texts(tree)).toContain(t('restore'));
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(RevenueCatUI.presentPaywall).not.toHaveBeenCalled();
  expect(one(tree, PaywallScreen).props.reason).toBe('info');
  // тарифи — з пропозиції: рік і назавжди
  expect(one(tree, PaywallScreen).props.plans.map((p) => p.id)).toEqual(['year', 'lifetime']);
  // показ нашого пейволу RevenueCat бачить — інакше Experiments нема з чим порівнювати
  expect(sdk.trackCustomPaywallImpression).toHaveBeenCalledTimes(1);
  expect(sdk.trackCustomPaywallImpression.mock.calls[0][0]).toMatchObject({ paywallId: 'custom_info', offering: { identifier: 'default' } });
});

test('the RevenueCat paywall is not reported as a custom impression; its fallback is', async () => {
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(RevenueCatUI.presentPaywall).toHaveBeenCalled();
  expect(sdk.trackCustomPaywallImpression).not.toHaveBeenCalled();

  RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'ERROR');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  expect(one(tree, PaywallScreen).props.reason).toBe('info');
  expect(sdk.trackCustomPaywallImpression).toHaveBeenCalledTimes(1);
});

test('Pro users manage it in the Customer Center; restore stays for those without Pro', async () => {
  info = PRO_INFO;
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(texts(tree)).toContain(t('proActive'));
  expect(texts(tree)).not.toContain(t('restore'));
  await run(() => one(tree, SettingsScreen).props.onManageSub());
  expect(RevenueCatUI.presentCustomerCenter).toHaveBeenCalledTimes(1);
  expect(sdk.showManageSubscriptions).not.toHaveBeenCalled();
});

test('lifetime Pro reads «Pro forever» in settings, with no renewal date', async () => {
  info = LIFETIME_INFO;
  const tree = await renderApp();
  await openTab(tree, 'settings');
  const all = texts(tree);
  expect(all).toContain(t('proLifetime'));
  expect(all.some((s) => s.startsWith('until '))).toBe(false);
  expect(one(tree, SettingsScreen).props.sub).toMatchObject({ pro: true, lifetime: true, until: null, willRenew: false });
});

test('Apple Ads attribution is collected once the SDK is configured', async () => {
  await renderApp();
  expect(sdk.configure).toHaveBeenCalledTimes(1);
  expect(sdk.enableAdServicesAttributionTokenCollection).toHaveBeenCalledTimes(1);
});

// ---------- пейвол онбордингу з RevenueCat ----------
// metadata поточної пропозиції вирішує і чи показувати пейвол наприкінці
// онбордингу (onboarding_paywall), і чий третій екран (paywall_ui).
describe('onboarding paywall', () => {
  const OnboardingScreen = require('../src/OnboardingScreen').default;
  const OnboardingPaywall = require('../src/OnboardingPaywall').default;
  const yearlyWithTrial = (metadata) => ({
    current: {
      identifier: 'default',
      metadata,
      availablePackages: [
        {
          packageType: 'ANNUAL',
          product: { identifier: 'yearly', price: 59.99, priceString: '$59.99', introPrice: { price: 0, periodUnit: 'WEEK', periodNumberOfUnits: 1, cycles: 1 } },
        },
      ],
    },
  });
  async function finishOnboarding() {
    await AsyncStorage.removeItem('ll_onboarded_v1');
    const tree = await renderApp();
    await run(() => one(tree, OnboardingScreen).props.onDone({ profile: null, heardFrom: null, scanned: false, flow: 'control' }));
    return tree;
  }
  const settings = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  test('onboarding_paywall: "skip" — straight to the app; the post-scan paywall stays as the fallback', async () => {
    sdk.getOfferings.mockImplementation(async () => offering({ onboarding_paywall: 'skip' }));
    const tree = await finishOnboarding();
    expect(one(tree, OnboardingPaywall)).toBeNull();
    expect(RevenueCatUI.presentPaywall).not.toHaveBeenCalled();
    expect((await settings()).onbPaywallShown).not.toBe(true);
  });

  test('paywall_ui: "revenuecat" — our trial and reminder screens, then the RevenueCat paywall', async () => {
    sdk.checkTrialOrIntroductoryPriceEligibility.mockImplementation(async () => ({ yearly: { status: 2 } }));
    sdk.getOfferings.mockImplementation(async () => yearlyWithTrial({ paywall_ui: 'revenuecat' }));
    const tree = await finishOnboarding();
    expect(one(tree, OnboardingPaywall).props.ui).toBe('revenuecat');
    expect(texts(tree)).toContain('Try Pro free for 7 days');
    const next = () => tree.root.findAll((n) => n.props.title === t('obNext') && n.props.onPress)[0].props.onPress();
    await run(next);
    await run(next);
    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
    // закрили пейвол RevenueCat — нашого шару теж немає
    expect(one(tree, OnboardingPaywall)).toBeNull();
    expect(one(tree, PaywallScreen)).toBeNull();
  });

  test('no trial and the RevenueCat paywall fails: our plans screen right away', async () => {
    RevenueCatUI.presentPaywall.mockImplementation(async () => 'ERROR');
    const tree = await finishOnboarding();
    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
    expect(one(tree, OnboardingPaywall)).not.toBeNull();
    expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'intro', compact: true });
  });
});
