// Покупки (RevenueCat із підставленим SDK): «вже куплено» не прикидається
// списанням, а тарифи, прочитані при запуску, оновлюються тихо, коли
// застосунок знову стає активним.
import { AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import { PLANS_MAX_AGE, purchaseNote, restoreTitle, restoreNote, usePro } from '../src/purchases';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    PURCHASES_ERROR_CODE: {
      PURCHASE_CANCELLED_ERROR: '1',
      PURCHASE_NOT_ALLOWED_ERROR: '3',
      PRODUCT_ALREADY_PURCHASED_ERROR: '6',
      RECEIPT_ALREADY_IN_USE_ERROR: '7',
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
// річний тариф із безкоштовним тижнем; чи дадуть його, вирішує eligibility
const offering = () => ({
  current: {
    identifier: 'default',
    metadata: {},
    availablePackages: [
      { packageType: 'MONTHLY', product: { identifier: 'm', price: 9.99, priceString: '$9.99', introPrice: null } },
      {
        packageType: 'ANNUAL',
        product: {
          identifier: 'y',
          price: 59.99,
          priceString: '$59.99',
          introPrice: { price: 0, periodUnit: 'DAY', periodNumberOfUnits: 7, cycles: 1 },
        },
      },
      { packageType: 'LIFETIME', product: { identifier: 'l', price: 129.99, priceString: '$129.99', introPrice: null } },
    ],
  },
});
const eligible = (on) => async () => ({ y: { status: on ? 2 : 1 } });

let hook;
const statuses = [];
function Harness({ id }) {
  hook = usePro(id);
  statuses.push(hook.plansStatus);
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
const year = () => hook.plans.find((p) => p.id === 'year');

let handlers;
let appState;
let now;
let clock;
beforeEach(() => {
  jest.clearAllMocks();
  statuses.length = 0;
  handlers = [];
  appState = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    handlers.push([type, fn]);
    return { remove: jest.fn() };
  });
  clock = 1_700_000_000_000;
  now = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  sdk.getCustomerInfo.mockImplementation(async () => FREE_INFO);
  sdk.getOfferings.mockImplementation(async () => offering());
  sdk.checkTrialOrIntroductoryPriceEligibility.mockImplementation(eligible(true));
  sdk.getAppUserID.mockImplementation(async () => 'u1');
  sdk.logIn.mockImplementation(async () => ({ customerInfo: FREE_INFO }));
  sdk.purchasePackage.mockImplementation(async () => ({ customerInfo: PRO_INFO }));
});
afterEach(() => {
  appState.mockRestore();
  now.mockRestore();
});
const becomeActive = async () => {
  const change = handlers.find(([type]) => type === 'change')?.[1];
  await act(async () => {
    change?.('active');
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
};

describe('“already purchased” is not a failure to explain with “if you were charged”', () => {
  const buy = async () => {
    let res;
    await act(async () => {
      res = await hook.purchase('year');
    });
    return res;
  };

  test.each(['6', '7'])('error %s: owned, not uncharged, the Restore note', async (code) => {
    const tree = await mount();
    sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code }));
    const res = await buy();
    expect(res).toMatchObject({ ok: false, error: code, owned: true, uncharged: false });
    expect(purchaseNote(res)).toBe('purchaseAlreadyOwned');
    expect(sdk.purchasePackage).toHaveBeenCalledTimes(1);
    expect(sdk.restorePurchases).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the other notes are exactly as before, and carry no `owned`', async () => {
    const tree = await mount();
    sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '10' }));
    const net = await buy();
    expect(purchaseNote(net)).toBe('purchaseUnclear');
    expect(net).not.toHaveProperty('owned');
    sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '3' }));
    expect(purchaseNote(await buy())).toBe('purchaseFailed');
    sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '1' }));
    expect(purchaseNote(await buy())).toBeNull();
    sdk.purchasePackage.mockImplementationOnce(async () => Promise.reject({ code: '20' }));
    expect(purchaseNote(await buy())).toBe('purchasePending');
    await act(async () => tree.unmount());
  });

  test('the note, with no SDK codes for it, never matches by accident', () => {
    expect(purchaseNote({ ok: false, error: '6' })).toBe('purchaseUnclear');
    expect(purchaseNote({ ok: false, error: 'UNAVAILABLE', owned: true })).toBe('purchasesUnavailable');
  });
});

describe('restore titles are shared', () => {
  test('every restore note has a short title; unknown notes fall back to the failure title', () => {
    expect(restoreTitle(restoreNote({ pro: true }))).toBe('restoreTitleOk');
    expect(restoreTitle(restoreNote({ pro: false }))).toBe('restoreTitleNone');
    expect(restoreTitle(restoreNote({ error: '10' }))).toBe('restoreTitleFail');
    expect(restoreTitle(restoreNote({ error: 'UNAVAILABLE' }))).toBe('restoreTitleFail');
    expect(restoreTitle('somethingElse')).toBe('restoreTitleFail');
  });
});

describe('stale prices and trial eligibility', () => {
  test('a fresh list is not reloaded when the app comes back', async () => {
    const tree = await mount();
    expect(year().trialDays).toBe(7);
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    clock += PLANS_MAX_AGE - 1000;
    await becomeActive();
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('an old list is re-read quietly: the week free is gone for someone who used it, and the status never flickers', async () => {
    const tree = await mount();
    expect(year().trialDays).toBe(7);
    statuses.length = 0;

    sdk.checkTrialOrIntroductoryPriceEligibility.mockImplementation(eligible(false));
    clock += PLANS_MAX_AGE + 1000;
    await becomeActive();
    expect(sdk.getOfferings).toHaveBeenCalledTimes(2);
    expect(year().trialDays).toBe(0);
    expect(hook.ready).toBe(true);
    expect(hook.plansStatus).toBe('ready');
    expect(statuses).not.toContain('loading');
    expect(statuses).not.toContain('failed');
    await act(async () => tree.unmount());
  });

  test('when the refresh fails, the person keeps the list they had', async () => {
    const tree = await mount();
    const before = hook.plans;
    sdk.getOfferings.mockImplementation(async () => {
      throw new Error('offline');
    });
    clock += PLANS_MAX_AGE + 1000;
    await becomeActive();
    expect(sdk.getOfferings).toHaveBeenCalledTimes(2);
    expect(hook.plans).toBe(before);
    expect(hook.ready).toBe(true);
    expect(hook.plansStatus).toBe('ready');

    // пропозицію зняли, або жодного пакета не впізнали: те саме
    sdk.getOfferings.mockImplementation(async () => ({ current: null, all: {} }));
    clock += PLANS_MAX_AGE + 1000;
    await becomeActive();
    expect(hook.plans).toBe(before);
    expect(hook.plansStatus).toBe('ready');
    await act(async () => tree.unmount());
  });

  test('two returns in a row while a refresh runs ask the store once', async () => {
    const tree = await mount();
    let finish;
    sdk.getOfferings.mockImplementation(() => new Promise((r) => (finish = () => r(offering()))));
    clock += PLANS_MAX_AGE + 1000;
    const change = handlers.find(([type]) => type === 'change')[1];
    await act(async () => {
      change('active');
      change('active');
    });
    expect(sdk.getOfferings).toHaveBeenCalledTimes(2); // старт + одне оновлення
    await act(async () => finish());
    await act(async () => tree.unmount());
  });

  test('going to the background does nothing', async () => {
    const tree = await mount();
    clock += PLANS_MAX_AGE * 3;
    const change = handlers.find(([type]) => type === 'change')[1];
    await act(async () => change('background'));
    expect(sdk.getOfferings).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('the first load that failed is still retried by the paywall with the loading state, as before', async () => {
    sdk.getOfferings.mockImplementationOnce(async () => {
      throw new Error('offline');
    });
    const tree = await mount();
    expect(hook.plansStatus).toBe('failed');
    let finish;
    sdk.getOfferings.mockImplementation(() => new Promise((r) => (finish = () => r(offering()))));
    await act(async () => {
      hook.reloadPlans();
    });
    expect(hook.plansStatus).toBe('loading');
    await act(async () => finish());
    expect(hook.plansStatus).toBe('ready');
    expect(hook.plans.length).toBe(3);
    await act(async () => tree.unmount());
  });
});
