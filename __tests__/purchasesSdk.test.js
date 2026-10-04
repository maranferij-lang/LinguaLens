// Режим RevenueCat із підставленим SDK. Покупка й відновлення мусять іти на
// наш id пристрою: на анонімний $RCAnonymousID сервер не дивиться, і Pro,
// куплений там, не зняв би ліміт сканів.
import { act, create } from 'react-test-renderer';
import RevenueCatUI from 'react-native-purchases-ui';
import { paywallConfig, planOfProduct, purchaseNote, restoreNote, usePro, MODE } from '../src/purchases';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
      PURCHASE_NOT_ALLOWED_ERROR: '3',
      NETWORK_ERROR: '10',
      PAYMENT_PENDING_ERROR: '20',
    },
    LOG_LEVEL: { WARN: 'WARN' },
    setLogLevel: jest.fn(async () => {}),
    configure: jest.fn(),
    enableAdServicesAttributionTokenCollection: jest.fn(async () => {}),
    showManageSubscriptions: jest.fn(async () => {}),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(),
    getAppUserID: jest.fn(),
    logIn: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
  },
}));

const sdk = require('react-native-purchases').default;

const FREE_INFO = { entitlements: { active: {} } };
const PRO_INFO = {
  entitlements: {
    active: { lingualens_pro: { expirationDateMillis: Date.now() + 864e5, periodType: 'NORMAL', willRenew: true, productIdentifier: 'y' } },
  },
};
// Покупка «назавжди»: entitlement без дати закінчення
const LIFETIME_INFO = {
  entitlements: {
    active: { lingualens_pro: { expirationDate: null, expirationDateMillis: null, periodType: 'NORMAL', willRenew: false, productIdentifier: 'l' } },
  },
};
const offering = (metadata = {}) => ({
  current: {
    identifier: 'default',
    metadata,
    availablePackages: [
      { packageType: 'MONTHLY', product: { identifier: 'm', price: 6.99, priceString: '$6.99', introPrice: null } },
      { packageType: 'ANNUAL', product: { identifier: 'y', price: 34.99, priceString: '$34.99', introPrice: null } },
      { packageType: 'LIFETIME', product: { identifier: 'l', price: 79.99, priceString: '$79.99', introPrice: null } },
    ],
  },
});
const OFFERING = offering();

let hook;
function Harness({ id }) {
  hook = usePro(id);
  return null;
}

async function mount(id = 'u1') {
  let tree;
  await act(async () => {
    tree = create(<Harness id={id} />);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
  return tree;
}

beforeEach(() => {
  jest.clearAllMocks();
  sdk.getCustomerInfo.mockImplementation(async () => FREE_INFO);
  sdk.getOfferings.mockImplementation(async () => OFFERING);
  RevenueCatUI.presentPaywall.mockImplementation(async () => 'CANCELLED');
  RevenueCatUI.presentCustomerCenter.mockImplementation(async () => {});
  sdk.getAppUserID.mockImplementation(async () => '$RCAnonymousID:abc');
  sdk.logIn.mockImplementation(async () => ({ customerInfo: FREE_INFO }));
  sdk.purchasePackage.mockImplementation(async () => ({ customerInfo: PRO_INFO }));
});

test('runs in RevenueCat mode with a key', () => {
  expect(MODE).toBe('revenuecat');
});

test('buys on our device id even if the start-up logIn failed', async () => {
  sdk.logIn.mockImplementationOnce(async () => {
    throw new Error('offline');
  });
  const tree = await mount();
  let res;
  await act(async () => {
    res = await hook.purchase('year');
  });
  expect(sdk.logIn).toHaveBeenLastCalledWith('u1');
  expect(sdk.logIn).toHaveBeenCalledTimes(2);
  expect(sdk.purchasePackage).toHaveBeenCalledTimes(1);
  expect(res.ok).toBe(true);
  await act(async () => tree.unmount());
});

test('does not buy anonymously when logIn keeps failing', async () => {
  sdk.logIn.mockImplementation(async () => {
    throw new Error('offline');
  });
  const tree = await mount();
  let res;
  await act(async () => {
    res = await hook.purchase('year');
  });
  expect(sdk.purchasePackage).not.toHaveBeenCalled();
  expect(res).toMatchObject({ ok: false, error: 'LOGIN_FAILED', uncharged: true });
  expect(purchaseNote(res)).toBe('purchaseFailed');
  await act(async () => tree.unmount());
});

test('an already identified user is not logged in again', async () => {
  sdk.getAppUserID.mockImplementation(async () => 'u1');
  const tree = await mount();
  await act(async () => {
    await hook.purchase('year');
  });
  expect(sdk.logIn).toHaveBeenCalledTimes(1); // лише при старті
  expect(sdk.purchasePackage).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('“not charged” only for refusals before payment', async () => {
  const tree = await mount();
  const buy = async () => {
    let res;
    await act(async () => {
      res = await hook.purchase('year');
    });
    return res;
  };

  // Apple списала гроші, а продукт не прив'язаний до entitlement 'pro'
  sdk.purchasePackage.mockImplementationOnce(async () => ({ customerInfo: FREE_INFO }));
  expect(purchaseNote(await buy())).toBe('purchaseUnclear');

  sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '10' }));
  expect(purchaseNote(await buy())).toBe('purchaseUnclear');

  sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '3' }));
  expect(purchaseNote(await buy())).toBe('purchaseFailed');

  sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '1' }));
  expect(purchaseNote(await buy())).toBeNull();
  await act(async () => tree.unmount());
});

test('restore logs in first and reports a store failure as an error', async () => {
  const tree = await mount();
  sdk.restorePurchases.mockImplementationOnce(async () => PRO_INFO);
  let res;
  await act(async () => {
    res = await hook.restore();
  });
  expect(sdk.logIn).toHaveBeenLastCalledWith('u1');
  expect(restoreNote(res)).toBe('restoreDone');

  sdk.restorePurchases.mockImplementationOnce(async () => Promise.reject({ code: '10' }));
  await act(async () => {
    res = await hook.restore();
  });
  expect(res).toEqual({ error: '10' });
  expect(restoreNote(res)).toBe('restoreFailed');
  await act(async () => tree.unmount());
});

// ---------- v1.2: entitlement lingualens_pro, «назавжди», AdServices ----------

test('Apple Ads attribution is switched on once, right after configure', async () => {
  const tree = await mount();
  expect(sdk.configure).toHaveBeenCalledTimes(1);
  expect(sdk.enableAdServicesAttributionTokenCollection).toHaveBeenCalledTimes(1);
  expect(sdk.configure.mock.invocationCallOrder[0]).toBeLessThan(sdk.enableAdServicesAttributionTokenCollection.mock.invocationCallOrder[0]);
  await act(async () => tree.unmount());
});

test('a failing attribution call does not break purchases', async () => {
  sdk.enableAdServicesAttributionTokenCollection.mockImplementationOnce(async () => {
    throw new Error('not available');
  });
  const tree = await mount();
  expect(hook.plans.map((p) => p.id)).toEqual(['month', 'year', 'lifetime']);
  await act(async () => tree.unmount());
});

test('the offering renders what it has: monthly, yearly and a one-time lifetime', async () => {
  const tree = await mount();
  const life = hook.plans.find((p) => p.id === 'lifetime');
  expect(life).toMatchObject({ lifetime: true, price: '$79.99', trialDays: 0, save: 0, perMonth: null, labelKey: 'planLifetime' });
  expect(planOfProduct('l')).toBe('lifetime');
  expect(planOfProduct('y')).toBe('year');
  expect(planOfProduct('zzz')).toBeNull();
  await act(async () => tree.unmount());
});

test('an active lingualens_pro without an expiry is lifetime Pro', async () => {
  sdk.getCustomerInfo.mockImplementation(async () => LIFETIME_INFO);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: LIFETIME_INFO }));
  const tree = await mount();
  expect(hook.state).toMatchObject({ pro: true, until: null, willRenew: false, lifetime: true, productId: 'l' });
  await act(async () => tree.unmount());
});

test('the old “pro” entitlement no longer unlocks anything', async () => {
  const old = { entitlements: { active: { pro: { expirationDateMillis: Date.now() + 864e5, periodType: 'NORMAL', willRenew: true } } } };
  sdk.getCustomerInfo.mockImplementation(async () => old);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: old }));
  const tree = await mount();
  expect(hook.state.pro).toBe(false);
  await act(async () => tree.unmount());
});

describe('remote switches in the offering metadata', () => {
  test('defaults when the metadata says nothing', async () => {
    const tree = await mount();
    expect(hook.config).toEqual({ onboardingPaywall: 'show', ui: 'custom' });
    expect(hook.offeringId).toBe('default');
    await act(async () => tree.unmount());
  });

  test('skip and revenuecat are read from the current offering', async () => {
    sdk.getOfferings.mockImplementation(async () => offering({ onboarding_paywall: 'skip', paywall_ui: 'revenuecat' }));
    const tree = await mount();
    expect(hook.config).toEqual({ onboardingPaywall: 'skip', ui: 'revenuecat' });
    expect(paywallConfig()).toEqual({ onboardingPaywall: 'skip', ui: 'revenuecat' });
    await act(async () => tree.unmount());
  });
});

describe('the RevenueCat paywall', () => {
  async function withRcUi() {
    sdk.getOfferings.mockImplementation(async () => offering({ paywall_ui: 'revenuecat' }));
    return mount();
  }
  const present = async () => {
    let res;
    await act(async () => {
      res = await hook.presentPaywall();
    });
    return res;
  };

  test('is not shown while the offering asks for our own paywall', async () => {
    const tree = await mount();
    expect(await present()).toEqual({ fallback: true });
    expect(RevenueCatUI.presentPaywall).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('presents the current offering and unlocks Pro right after a purchase', async () => {
    const tree = await withRcUi();
    RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'PURCHASED');
    sdk.getCustomerInfo.mockImplementation(async () => PRO_INFO);
    const res = await present();
    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledWith(expect.objectContaining({ displayCloseButton: true }));
    expect(RevenueCatUI.presentPaywall.mock.calls[0][0].offering.identifier).toBe('default');
    expect(res).toMatchObject({ result: 'PURCHASED', purchased: true, restored: false });
    expect(res.state.pro).toBe(true);
    expect(hook.state.pro).toBe(true);
    // покупка — на наш id, а не на анонімний
    expect(sdk.logIn).toHaveBeenLastCalledWith('u1');
    await act(async () => tree.unmount());
  });

  test('a restore inside it counts too; closing it changes nothing', async () => {
    const tree = await withRcUi();
    RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'RESTORED');
    sdk.getCustomerInfo.mockImplementation(async () => PRO_INFO);
    expect(await present()).toMatchObject({ restored: true, purchased: false });

    RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'CANCELLED');
    expect(await present()).toMatchObject({ result: 'CANCELLED', purchased: false, restored: false });
    expect((await present()).fallback).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('an ERROR result or a crash falls back to our paywall', async () => {
    const tree = await withRcUi();
    RevenueCatUI.presentPaywall.mockImplementationOnce(async () => 'ERROR');
    expect(await present()).toMatchObject({ fallback: true });
    RevenueCatUI.presentPaywall.mockImplementationOnce(async () => {
      throw new Error('no native module');
    });
    expect(await present()).toMatchObject({ fallback: true });
    await act(async () => tree.unmount());
  });

  test('when logging into our id fails, our paywall says so honestly instead', async () => {
    sdk.logIn.mockImplementation(async () => {
      throw new Error('offline');
    });
    const tree = await withRcUi();
    expect(await present()).toEqual({ fallback: true });
    expect(RevenueCatUI.presentPaywall).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});

describe('managing the subscription', () => {
  const manage = async () => {
    let res;
    await act(async () => {
      res = await hook.manage();
    });
    return res;
  };

  test('opens the RevenueCat Customer Center and refreshes Pro afterwards', async () => {
    const tree = await mount();
    sdk.getCustomerInfo.mockClear();
    expect(await manage()).toBe('customerCenter');
    const { callbacks } = RevenueCatUI.presentCustomerCenter.mock.calls[0][0];
    expect(typeof callbacks.onRestoreCompleted).toBe('function');
    expect(typeof callbacks.onRefundRequestCompleted).toBe('function');
    expect(sdk.getCustomerInfo).toHaveBeenCalled();
    // відновлення всередині Customer Center одразу вмикає Pro
    await act(async () => callbacks.onRestoreCompleted({ customerInfo: PRO_INFO }));
    expect(hook.state.pro).toBe(true);
    expect(sdk.showManageSubscriptions).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('falls back to the App Store sheet when the Customer Center fails', async () => {
    const tree = await mount();
    RevenueCatUI.presentCustomerCenter.mockImplementationOnce(async () => {
      throw new Error('unavailable');
    });
    expect(await manage()).toBe('appStore');
    expect(sdk.showManageSubscriptions).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });
});
