import { plansFromOffering, purchaseNote, restoreNote } from '../src/purchases';
import { STRINGS } from '../src/i18n';

const product = (price, priceString, extra = {}) => ({ price, priceString, pricePerMonthString: null, introPrice: null, ...extra });

const offering = {
  availablePackages: [
    { packageType: 'WEEKLY', product: product(4.99, '4,99 €') },
    { packageType: 'MONTHLY', product: product(6.99, '6,99 €') },
    { packageType: 'THREE_MONTH', product: product(16.99, '16,99 €') },
    {
      packageType: 'ANNUAL',
      product: product(34.99, '34,99 €', {
        pricePerMonthString: '2,92 €',
        introPrice: { price: 0, priceString: '0 €', cycles: 1, period: 'P1W', periodUnit: 'WEEK', periodNumberOfUnits: 1 },
      }),
    },
    { packageType: 'CUSTOM', product: product(1, '1 €') },
  ],
};

test('store packages map onto our plans with local prices', () => {
  const plans = plansFromOffering(offering);
  expect(plans.map((p) => p.id)).toEqual(['week', 'month', 'quarter', 'year']);
  const year = plans.find((p) => p.id === 'year');
  expect(year.price).toBe('34,99 €');
  expect(year.perMonth).toBe('2,92 €');
  expect(year.trialDays).toBe(7);
  expect(year.best).toBe(true);
});

test('savings are computed from real prices, not the hard-coded USD badges', () => {
  const plans = plansFromOffering(offering);
  const byId = Object.fromEntries(plans.map((p) => [p.id, p]));
  expect(byId.year.save).toBe(58);
  expect(byId.quarter.save).toBe(19);
  expect(byId.week.save).toBe(0);
  expect(byId.year.saveKey).toBeUndefined();
});

test('missing offering gives no plans instead of fake prices', () => {
  expect(plansFromOffering(null)).toEqual([]);
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
