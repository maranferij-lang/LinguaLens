// Режим RevenueCat із підставленим SDK. Покупка й відновлення мусять іти на
// наш id пристрою: на анонімний $RCAnonymousID сервер не дивиться, і Pro,
// куплений там, не зняв би ліміт сканів.
import { act, create } from 'react-test-renderer';
import { purchaseNote, restoreNote, usePro, MODE } from '../src/purchases';

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
const PRO_INFO = { entitlements: { active: { pro: { expirationDateMillis: Date.now() + 864e5, periodType: 'NORMAL', willRenew: true } } } };
const OFFERING = {
  current: {
    availablePackages: [{ packageType: 'ANNUAL', product: { identifier: 'y', price: 34.99, priceString: '$34.99', introPrice: null } }],
  },
};

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
