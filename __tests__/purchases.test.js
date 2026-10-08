import { paywallConfigFrom, PAYWALL_DEFAULTS, plansFromOffering, purchaseNote, restoreNote, stateFromInfo } from '../src/purchases';
import { STRINGS } from '../src/i18n';
import { PLANS, SIMULATED_PLANS } from '../src/subscription';

const product = (price, priceString, extra = {}) => ({ price, priceString, pricePerMonthString: null, introPrice: null, ...extra });

const offering = {
  availablePackages: [
    { packageType: 'WEEKLY', product: product(4.99, '4,99 €') },
    { packageType: 'MONTHLY', product: product(9.99, '9,99 €') },
    { packageType: 'THREE_MONTH', product: product(24.99, '24,99 €') },
    {
      packageType: 'ANNUAL',
      product: product(59.99, '59,99 €', {
        pricePerMonthString: '4,99 €',
        introPrice: { price: 0, priceString: '0 €', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 },
      }),
    },
    { packageType: 'CUSTOM', product: product(1, '1 €') },
    { packageType: 'LIFETIME', product: product(129.99, '129,99 €', { pricePerMonthString: '10,83 €' }) },
  ],
};

test('store packages map onto our plans with local prices', () => {
  const plans = plansFromOffering(offering);
  expect(plans.map((p) => p.id)).toEqual(['week', 'month', 'quarter', 'year', 'lifetime']);
  const year = plans.find((p) => p.id === 'year');
  expect(year.price).toBe('59,99 €');
  expect(year.perMonth).toBe('4,99 €');
  expect(year.trialDays).toBe(7);
  expect(year.best).toBe(true);
});

test('savings are computed from real prices, not the fallback USD ones', () => {
  const plans = plansFromOffering(offering);
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  // 59,99 ÷ 12 = 4,999 → 1 − 4,999 / 9,99 = 49,96% → 50; 24,99 ÷ 3 → 17
  expect(byId.year.save).toBe(50);
  expect(byId.quarter.save).toBe(17);
  expect(byId.week.save).toBe(0);
  // в іншій країні знижка інша — і в пейволі саме вона, а не запасні −50%
  const local = plansFromOffering({
    availablePackages: [
      { packageType: 'MONTHLY', product: product(100, '100 ₴') },
      { packageType: 'ANNUAL', product: product(900, '900 ₴') },
    ],
  });
  expect(local.find((p) => p.id === 'year').save).toBe(25);
});

// Без pricePerMonthString з магазину запасне доларове «на місяць» не
// підставляємо: поруч із «24,99 €» стояло б «$8.33 на місяць».
test('no store per-month string → no per-month line, never the USD fallback', () => {
  const byId = Object.fromEntries(plansFromOffering(offering).map((p) => [p.id, p]));
  expect(byId.quarter.perMonth).toBeNull();
  expect(byId.year.perMonth).toBe('4,99 €');
});

// Запасні ціни (імітація в розробці) мусять показувати те саме, що покаже
// магазин із такими сумами: «на місяць» — униз до цента, як RevenueCat;
// «−N%» — та сама формула, що й для справжніх цін.
test('fallback plans: per-month and savings follow from their prices', () => {
  const amount = (s) => Number(s.replace(/[^0-9.]/g, ''));
  const TYPE = { week: 'WEEKLY', month: 'MONTHLY', quarter: 'THREE_MONTH', year: 'ANNUAL', lifetime: 'LIFETIME' };
  const live = plansFromOffering({
    availablePackages: PLANS.map((p) => ({ packageType: TYPE[p.id], product: product(amount(p.price), p.price) })),
  });
  for (const p of PLANS) {
    const store = live.find((l) => l.id === p.id);
    expect([p.id, p.save || 0]).toEqual([p.id, store.save]);
    if (p.days > 30) {
      const months = Math.round(p.days / 30.4375);
      expect([p.id, p.perMonth]).toEqual([p.id, '$' + (Math.floor((amount(p.price) / months) * 100) / 100).toFixed(2)]);
    }
  }
  const byId = Object.fromEntries(PLANS.map((p) => [p.id, p]));
  expect([byId.month.price, byId.year.price, byId.lifetime.price]).toEqual(['$9.99', '$59.99', '$129.99']);
  expect(byId.year).toMatchObject({ perMonth: '$4.99', save: 50, trialDays: 7, best: true });
  expect(SIMULATED_PLANS.map((p) => p.id)).toEqual(['month', 'year', 'lifetime']);
});

test('lifetime is a one-time purchase: no trial, no monthly price, no “save %”', () => {
  const life = plansFromOffering(offering).find((p) => p.id === 'lifetime');
  expect(life).toMatchObject({ price: '129,99 €', perMonth: null, trialDays: 0, save: 0, lifetime: true, legalKey: 'lifetimeLegal' });
  expect(life.best).toBeUndefined();
});

test('only what the offering has: monthly + yearly + lifetime', () => {
  const grid = { availablePackages: offering.availablePackages.filter((p) => ['MONTHLY', 'ANNUAL', 'LIFETIME'].includes(p.packageType)) };
  expect(plansFromOffering(grid).map((p) => p.id)).toEqual(['month', 'year', 'lifetime']);
});

test('missing offering gives no plans instead of fake prices', () => {
  expect(plansFromOffering(null)).toEqual([]);
});

// Пакети з власними id з дашборду (CUSTOM, SIX_MONTH…): без типу $rc_*, тож
// упізнаємо їх за id продукту з PLANS
describe('custom packages are matched by product id', () => {
  const MONTH_ID = PLANS.find((p) => p.id === 'month').productId;
  const YEAR_ID = PLANS.find((p) => p.id === 'year').productId;
  const LIFE_ID = PLANS.find((p) => p.id === 'lifetime').productId;
  const custom = (identifier, price, str, packageType = 'CUSTOM') => ({ packageType, identifier: '$custom', product: product(price, str, { identifier }) });

  test('a CUSTOM-only offering still gives the plans', () => {
    const plans = plansFromOffering({
      availablePackages: [custom(MONTH_ID, 9.99, '9,99 €'), custom(YEAR_ID, 59.99, '59,99 €'), custom(LIFE_ID, 129.99, '129,99 €', 'UNKNOWN')],
    });
    expect(plans.map((p) => p.id)).toEqual(['month', 'year', 'lifetime']);
    expect(plans.find((p) => p.id === 'year')).toMatchObject({ price: '59,99 €', save: 50 });
    expect(plans.find((p) => p.id === 'lifetime')).toMatchObject({ lifetime: true, trialDays: 0 });
  });

  test('a standard $rc_* package wins over a custom one for the same plan', () => {
    const std = { packageType: 'MONTHLY', product: product(9.99, 'standard', { identifier: 'whatever' }) };
    const plans = plansFromOffering({ availablePackages: [custom(MONTH_ID, 7.99, 'custom'), std] });
    expect(plans.map((p) => [p.id, p.price])).toEqual([['month', 'standard']]);
  });

  test('a custom package with a foreign product id is ignored', () => {
    expect(plansFromOffering({ availablePackages: [custom('com.other.app.pro', 1, '1 €'), custom(undefined, 1, '1 €')] })).toEqual([]);
    expect(plansFromOffering({ availablePackages: [] })).toEqual([]);
  });
});

test('free trial is only promised to users Apple will actually give it to', () => {
  // у фікстурі identifier не заданий — додаємо, щоб перевірити саме мапу статусів
  const withIds = {
    availablePackages: offering.availablePackages.map((p, i) => ({ ...p, product: { ...p.product, identifier: 'p' + i } })),
  };
  const year = (elig) => plansFromOffering(withIds, elig).find((p) => p.id === 'year');
  expect(year({ p3: 2 }).trialDays).toBe(7);
  expect(year({ p3: 1 }).trialDays).toBe(0);
  expect(year({}).trialDays).toBe(0);
});

describe('what the paywall says after a purchase or a restore', () => {
  test('“you haven’t been charged” only when the purchase stopped before payment', () => {
    expect(purchaseNote({ ok: false, error: 'LOGIN_FAILED', uncharged: true })).toBe('purchaseFailed');
    expect(purchaseNote({ ok: false, error: 'NOT_ENTITLED' })).toBe('purchaseUnclear');
    expect(purchaseNote({ ok: false, error: '10', uncharged: false })).toBe('purchaseUnclear');
    expect(purchaseNote({ ok: false, error: 'UNAVAILABLE', uncharged: true })).toBe('purchasesUnavailable');
    expect(purchaseNote({ ok: false, pending: true })).toBe('purchasePending');
    expect(purchaseNote({ ok: false, cancelled: true })).toBeNull();
    expect(purchaseNote({ ok: true })).toBeNull();
  });

  test('a failed restore is not “nothing to restore”', () => {
    expect(restoreNote({ error: '10' })).toBe('restoreFailed');
    expect(restoreNote({ error: 'UNAVAILABLE' })).toBe('purchasesUnavailable');
    expect(restoreNote({ pro: false })).toBe('restoreNothing');
    expect(restoreNote({ pro: true })).toBe('restoreDone');
  });

  test('every note is a real string', () => {
    const keys = [
      purchaseNote({ error: 'x', uncharged: true }),
      purchaseNote({ error: 'x' }),
      purchaseNote({ error: 'UNAVAILABLE' }),
      purchaseNote({ pending: true }),
      restoreNote({ error: 'x' }),
      restoreNote({ pro: true }),
      restoreNote({}),
    ];
    for (const k of keys) expect(STRINGS.en[k]).toEqual(expect.any(String));
  });
});

describe('offering metadata switches', () => {
  test('known values are read, case and spaces forgiven', () => {
    expect(paywallConfigFrom({ onboarding_paywall: 'skip', paywall_ui: 'revenuecat' })).toEqual({ onboardingPaywall: 'skip', ui: 'revenuecat' });
    expect(paywallConfigFrom({ onboarding_paywall: ' Show ', paywall_ui: 'RevenueCat' })).toEqual({ onboardingPaywall: 'show', ui: 'revenuecat' });
  });

  test('anything unknown falls back to the defaults', () => {
    for (const m of [undefined, null, 'x', {}, { onboarding_paywall: 'hide', paywall_ui: 'superwall' }, { onboarding_paywall: true, paywall_ui: 1 }]) {
      expect(paywallConfigFrom(m)).toEqual(PAYWALL_DEFAULTS);
    }
    expect(PAYWALL_DEFAULTS).toEqual({ onboardingPaywall: 'show', ui: 'custom' });
  });
});

describe('Pro state from CustomerInfo', () => {
  const ent = (extra) => ({ entitlements: { active: { lingualens_pro: { periodType: 'NORMAL', willRenew: true, ...extra } } }, managementURL: 'https://m' });

  test('a subscription keeps its expiry and renewal', () => {
    expect(stateFromInfo(ent({ expirationDateMillis: 5, expirationDate: 'x', periodType: 'TRIAL' }))).toMatchObject({
      pro: true,
      until: 5,
      trial: true,
      willRenew: true,
      lifetime: false,
      managementURL: 'https://m',
    });
  });

  test('no expiry means lifetime: nothing renews', () => {
    expect(stateFromInfo(ent({ expirationDateMillis: null, expirationDate: null, productIdentifier: 'lifetime' }))).toMatchObject({
      pro: true,
      until: null,
      willRenew: false,
      lifetime: true,
      productId: 'lifetime',
    });
  });

  test('no entitlement, no Pro', () => {
    expect(stateFromInfo({ entitlements: { active: {} } })).toEqual({ pro: false, managementURL: null });
    expect(stateFromInfo(null)).toEqual({ pro: false, managementURL: null });
  });
});
