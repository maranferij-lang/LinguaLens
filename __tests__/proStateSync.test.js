// Стан Pro змінюється не лише через наш пейвол, і App це помічає:
//   • нагадування про кінець пробного періоду прибирається, коли пробний
//     скасували (willRenew false), він став платною підпискою чи Pro зник, і
//     ставиться, коли пробний триває (відновлення на новому телефоні);
//   • Pro, що прийшов зі слухача SDK («Попросити купити» схвалили, Customer
//     Center), закриває пейвол і просить сервер перепитати RevenueCat — рівно
//     один раз, навіть якщо Pro прийшов через наш же пейвол;
//   • пейвол онбордингу чекає тарифи, що ще вантажаться, замість тихо зникнути.
// SDK RevenueCat підставлений (ключ Test Store), сповіщення — заглушка.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import App from '../App';
import OnboardingScreen from '../src/OnboardingScreen';
import OnboardingPaywall from '../src/OnboardingPaywall';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));

// Сповіщення дозволені: нагадування ставиться одразу, без запиту
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date', DAILY: 'daily' },
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));

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
const DAY = 86400000;
const FREE_INFO = { entitlements: { active: {} } };
const ent = (extra) => ({
  entitlements: { active: { lingualens_pro: { periodType: 'NORMAL', willRenew: true, productIdentifier: 'yearly', ...extra } } },
});
// пробний тиждень: до списання лишилось 5 днів — нагадування (за 2 дні) ще попереду
const trial = (extra) => ent({ periodType: 'TRIAL', expirationDateMillis: Date.now() + 5 * DAY, ...extra });
const PRO_INFO = ent({ expirationDateMillis: Date.now() + 30 * DAY });
const OFFERING = {
  current: {
    identifier: 'default',
    metadata: {},
    availablePackages: [
      { packageType: 'ANNUAL', product: { identifier: 'yearly', price: 59.99, priceString: '$59.99', introPrice: null } },
      { packageType: 'LIFETIME', product: { identifier: 'lifetime', price: 129.99, priceString: '$129.99', introPrice: null } },
    ],
  },
};

let info;
let urls;
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
  jest.clearAllMocks();
  info = FREE_INFO;
  urls = [];
  sdk.getCustomerInfo.mockImplementation(async () => info);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: info }));
  sdk.getOfferings.mockImplementation(async () => OFFERING);
  sdk.purchasePackage.mockImplementation(async () => ({ customerInfo: PRO_INFO }));
  global.fetch = jest.fn(async (url) => {
    urls.push(String(url));
    throw new TypeError('Network request failed');
  });
});

const mounted = [];
afterEach(async () => {
  jest.restoreAllMocks();
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
// слухач CustomerInfo, якого SDK викликає, коли Pro змінюється поза нашим кодом
const sdkEvent = (next) => run(() => sdk.addCustomerInfoUpdateListener.mock.calls[0][0](next));
const trialEndScheduled = () => Notifications.scheduleNotificationAsync.mock.calls.map(([r]) => r).filter((r) => r.identifier === 'trial-end');
const trialEndCancelled = () => Notifications.cancelScheduledNotificationAsync.mock.calls.filter(([id]) => id === 'trial-end').length;
const serverRefreshes = () => urls.filter((u) => u.includes('/me?refresh=1')).length;

describe('the trial-end reminder follows the subscription', () => {
  test('a trial that is running (restored on this phone) gets its reminder, and it stays', async () => {
    info = trial();
    await renderApp();
    const reminders = trialEndScheduled();
    expect(reminders).toHaveLength(1);
    expect(reminders[0].trigger.date.getTime()).toBeLessThan(info.entitlements.active.lingualens_pro.expirationDateMillis - 2 * DAY + 1000);
    expect(trialEndCancelled()).toBe(0);
  });

  test('cancelling the trial in Apple ID settings (willRenew false) removes the reminder', async () => {
    info = trial();
    await renderApp();
    expect(trialEndCancelled()).toBe(0);
    await sdkEvent(trial({ willRenew: false }));
    expect(trialEndCancelled()).toBe(1);
    // Pro ще діє до кінця пробного, а нагадування не повертається
    expect(trialEndScheduled()).toHaveLength(1);
  });

  test('Pro gone (refund, expiry): the reminder is removed', async () => {
    info = trial();
    await renderApp();
    await sdkEvent(FREE_INFO);
    expect(trialEndCancelled()).toBe(1);
  });

  test('the trial became a paid subscription: no “subscription starts soon” left behind', async () => {
    info = trial();
    await renderApp();
    await sdkEvent(ent({ expirationDateMillis: Date.now() + 365 * DAY }));
    expect(trialEndCancelled()).toBe(1);
  });

  test('a free person: a stale reminder is cleared, nothing is scheduled', async () => {
    await renderApp();
    expect(trialEndCancelled()).toBeGreaterThan(0);
    expect(trialEndScheduled()).toHaveLength(0);
  });

  test('until the store has answered nothing is cancelled: the start-up { pro: false } is not an answer', async () => {
    sdk.getCustomerInfo.mockImplementation(() => new Promise(() => {}));
    await renderApp();
    expect(trialEndCancelled()).toBe(0);
  });

  test('a paid person with no trial never gets a reminder', async () => {
    info = PRO_INFO;
    await renderApp();
    expect(trialEndScheduled()).toHaveLength(0);
  });
});

describe('Pro that arrives from the SDK listener', () => {
  async function openPaywall(tree) {
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen)).not.toBeNull();
  }

  test('Ask to Buy approved while the paywall is open: it closes and the server re-checks once', async () => {
    const tree = await renderApp();
    await openPaywall(tree);
    expect(serverRefreshes()).toBe(0);
    await sdkEvent(PRO_INFO);
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(serverRefreshes()).toBe(1);
    // тієї ж миті Pro вже в Параметрах
    expect(one(tree, SettingsScreen).props.sub.pro).toBe(true);
  });

  test('an approved trial also gets its reminder, without asking for permission', async () => {
    const tree = await renderApp();
    await openPaywall(tree);
    await sdkEvent(trial());
    expect(trialEndScheduled()).toHaveLength(1);
    expect(Notifications.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  test('a purchase in our own paywall asks the server once, not twice', async () => {
    const tree = await renderApp();
    await openPaywall(tree);
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(serverRefreshes()).toBe(1);
    // слухач SDK потім присилає ту саму інформацію — нічого зайвого
    await sdkEvent(PRO_INFO);
    expect(serverRefreshes()).toBe(1);
  });

  test('Pro that was already there at launch is not “new”: no extra server round trip', async () => {
    info = PRO_INFO;
    await renderApp();
    expect(serverRefreshes()).toBe(0);
  });

  test('the same Pro reported again by the listener changes nothing', async () => {
    const tree = await renderApp();
    await openPaywall(tree);
    await sdkEvent(PRO_INFO);
    await sdkEvent({ ...PRO_INFO });
    expect(serverRefreshes()).toBe(1);
  });
});

describe('the onboarding paywall waits for plans that are still loading', () => {
  const TODAY = localDayKey();
  const RESULT = {
    profile: { goals: ['work'], field: 'finance', level: 8, since: TODAY },
    heardFrom: 'tiktok',
    name: '',
    struggles: [],
    wodEnabled: false,
    scanned: false,
  };
  const settingsNow = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  // getOfferings, який відповідає, коли скажемо
  function slowStore() {
    let resolve;
    let reject;
    sdk.getOfferings.mockImplementation(
      () =>
        new Promise((res, rej) => {
          resolve = res;
          reject = rej;
        })
    );
    return { resolve: (v = OFFERING) => run(async () => resolve(v)), reject: () => run(async () => reject(new Error('offline'))) };
  }

  async function finishOnboarding(tree) {
    await run(() => one(tree, OnboardingScreen).props.onDone(RESULT));
  }

  beforeEach(async () => {
    await AsyncStorage.removeItem('ll_onboarded_v1');
  });

  test('plans arrive a moment after the onboarding ended: the paywall opens then', async () => {
    const store = slowStore();
    const tree = await renderApp();
    await finishOnboarding(tree);
    expect(one(tree, OnboardingPaywall)).toBeNull();
    // ще не показували: прапорець «показано» не ставимо наперед
    expect((await settingsNow()).onbPaywallShown).toBeFalsy();

    await store.resolve();
    expect(one(tree, OnboardingPaywall)).not.toBeNull();
    expect((await settingsNow()).onbPaywallShown).toBe(true);
  });

  test('the store refused (offline): no late surprise, the wall at the next scan covers it', async () => {
    const store = slowStore();
    const tree = await renderApp();
    await finishOnboarding(tree);
    await store.reject();
    expect(one(tree, OnboardingPaywall)).toBeNull();
    expect((await settingsNow()).onbPaywallShown).toBeFalsy();
  });

  test('plans that took too long: the person is already in the app, no paywall pops up', async () => {
    const store = slowStore();
    const tree = await renderApp();
    await finishOnboarding(tree);
    const real = Date.now();
    jest.spyOn(Date, 'now').mockImplementation(() => real + 60000);
    await store.resolve();
    expect(one(tree, OnboardingPaywall)).toBeNull();
    expect((await settingsNow()).onbPaywallShown).toBeFalsy();
  });

  test('plans already there: the paywall opens at once, as before', async () => {
    const tree = await renderApp();
    await finishOnboarding(tree);
    expect(one(tree, OnboardingPaywall)).not.toBeNull();
  });

  test('onboarding_paywall: "skip" is still honoured once the plans arrive', async () => {
    const store = slowStore();
    const tree = await renderApp();
    await finishOnboarding(tree);
    await store.resolve({ current: { ...OFFERING.current, metadata: { onboarding_paywall: 'skip' } } });
    expect(one(tree, OnboardingPaywall)).toBeNull();
    expect((await settingsNow()).onbPaywallShown).toBeFalsy();
  });
});

// Пропозиція прийшла, але жодного пакета ми не впізнали (власні id в
// дашборді, одрук): пейвол каже це й дає спробувати ще раз, а не крутить
// індикатор без кінця.
describe('an offering with no recognised packages', () => {
  const t = makeT('en');
  const BROKEN = {
    current: {
      identifier: 'default',
      metadata: {},
      availablePackages: [{ packageType: 'CUSTOM', product: { identifier: 'monthly', price: 9.99, priceString: '$9.99', introPrice: null } }],
    },
  };
  const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

  test('the paywall shows the failure and a retry that recovers, not a spinner', async () => {
    sdk.getOfferings.mockImplementation(async () => BROKEN);
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());

    const pw = one(tree, PaywallScreen);
    expect(pw.props).toMatchObject({ plans: [], plansFailed: true, unavailable: false });
    expect(texts(tree)).toEqual(expect.arrayContaining([t('pricesFailed'), t('pricesFailedHint')]));
    expect(tree.root.findAll((n) => n.type === 'ActivityIndicator')).toHaveLength(0);

    // в дашборді виправили пакети — «Спробувати ще раз»
    sdk.getOfferings.mockImplementation(async () => OFFERING);
    await run(() => pw.props.onRetry());
    expect(one(tree, PaywallScreen).props.plans.map((p) => p.id)).toEqual(['year', 'lifetime']);
    expect(texts(tree)).not.toContain(t('pricesFailed'));
  });
});
