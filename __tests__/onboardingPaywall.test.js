// Пейвол наприкінці онбордингу: (а) пробний період і три переваги →
// (б) «нагадаємо за 2 дні» і таймлайн → (в) тарифи (наш PaywallScreen у
// компактному 'intro' або пейвол RevenueCat). Без пробного періоду — одразу
// (в) без таймлайну. Хрестик на кожному екрані. App Review 3.1.2: на (в)
// сума списання — перша й найпомітніша цифра, умови й відновлення поруч.
import { act, create } from 'react-test-renderer';
import OnboardingPaywall, { PAYWALL_STEP_INDEX, paywallSteps } from '../src/OnboardingPaywall';
import PaywallScreen, { defaultPlan } from '../src/PaywallScreen';
import { PLANS, SIMULATED_PLANS } from '../src/subscription';
import { formatDate } from '../src/locale';
import { makeT } from '../src/i18n';

const t = makeT('en');
const NO_TRIAL = SIMULATED_PLANS.map(({ trialDays, ...p }) => p);

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  // відкладені появи (FadeIn із delay) мають відпрацювати до кінця файлу
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
});

async function render(props = {}) {
  const handlers = {
    onClose: jest.fn(),
    onStep: jest.fn(),
    onPurchase: jest.fn(async () => ({ ok: true })),
    onRestore: jest.fn(async () => ({})),
    onOpen: jest.fn(),
  };
  let tree;
  await act(async () => {
    tree = create(<OnboardingPaywall plans={SIMULATED_PLANS} freeScans={1} scansLeft={0} lang="en" t={t} {...handlers} {...props} />);
  });
  mounted.push(tree);
  return { tree, ...handlers };
}

// Рядки таймлайну — «День 7» і дата в одному Text, тож беремо й рядки з масивів
const strings = (tree) =>
  tree.root
    .findAll((n) => typeof n.props?.children === 'string' || Array.isArray(n.props?.children))
    .flatMap((n) => [n.props.children].flat())
    .filter((c) => typeof c === 'string');
const has = (tree, s) => strings(tree).includes(s);
async function press(tree, text) {
  await act(async () => {
    const hit = tree.root.findAll(
      (n) =>
        typeof n.props.onPress === 'function' &&
        (n.props.title === text || n.props.accessibilityLabel === text || n.findAll((c) => c.props.children === text).length)
    );
    if (!hit.length) throw new Error('no control: ' + text);
    await hit.at(-1).props.onPress();
  });
}
const closeBtn = (tree) => tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && typeof n.props.onPress === 'function')[0];

test('steps: three with a trial, only the plans without one', () => {
  expect(paywallSteps(SIMULATED_PLANS)).toEqual(['trial', 'reminder', 'plans']);
  expect(paywallSteps(NO_TRIAL)).toEqual(['plans']);
  expect(paywallSteps([])).toEqual(['plans']);
  // пробний — лише в обраного за замовчуванням тарифу (річного)
  expect(defaultPlan(SIMULATED_PLANS).id).toBe('year');
  expect(PAYWALL_STEP_INDEX).toEqual({ trial: 0, reminder: 1, plans: 2 });
});

test('trial → reminder → plans, each screen reported, prices only on the last one', async () => {
  const { tree, onStep, onClose } = await render();
  // (а): тривалість із тарифу і три переваги, ціни ще немає
  expect(has(tree, 'Try Pro free for 7 days')).toBe(true);
  for (const k of ['pro_scans', 'pro_scene', 'pro_langs']) expect(has(tree, t(k))).toBe(true);
  expect(has(tree, t('pro_support'))).toBe(false);
  expect(strings(tree).some((s) => s.includes('$'))).toBe(false);
  expect(onStep).toHaveBeenLastCalledWith(0, 'trial');
  expect(closeBtn(tree)).toBeTruthy();

  // (б): нагадування за 2 дні до кінця — день 5 із 7, і дата списання
  await press(tree, t('obNext'));
  expect(onStep).toHaveBeenLastCalledWith(1, 'reminder');
  expect(has(tree, t('opwRemindTitle'))).toBe(true);
  expect(has(tree, t('tlDay', { n: 5 }))).toBe(true);
  expect(has(tree, t('tlRemindText'))).toBe(true);
  expect(has(tree, t('tlDay', { n: 7 }))).toBe(true);
  expect(has(tree, '  ·  ' + formatDate(Date.now() + 7 * 86400000, 'en'))).toBe(true);
  expect(has(tree, t('tlChargeText', { p: '$34.99' }))).toBe(true);
  expect(has(tree, t('opwCancel'))).toBe(true);

  // (в): тарифи першими — сума списання видна без прокрутки
  await press(tree, t('obNext'));
  expect(onStep).toHaveBeenLastCalledWith(2, 'plans');
  const pw = tree.root.findByType(PaywallScreen);
  expect(pw.props).toMatchObject({ reason: 'intro', compact: true, scansLeft: 0 });
  const all = strings(tree);
  expect(all).toContain(t('pwPlansTitle'));
  const firstPrice = all.findIndex((s) => s === '$6.99');
  expect(firstPrice).toBeGreaterThan(-1);
  expect(firstPrice).toBeLessThan(all.indexOf(t('tlToday')));
  // без Lingo, таблиці й переваг — їх щойно показали
  expect(all).not.toContain(t('colFree'));
  expect(all).not.toContain(t('pro_scans'));
  // що буде після пробного періоду, як скасувати, умови, відновлення
  expect(all.some((s) => s.startsWith('Free until') && s.includes('$34.99 a year'))).toBe(true);
  for (const s of [t('terms'), t('restore'), t('startTrial')]) expect(all.includes(s) || !!tree.root.findAll((n) => n.props.title === s).length).toBe(true);
  // скан на сьогодні вже витрачено — «ще один сьогодні» не обіцяємо
  expect(all).toContain(t('pwContinueFreeTomorrow'));
  expect(all.some((s) => s.startsWith('Continue for free — 1'))).toBe(false);
  await press(tree, t('pwContinueFreeTomorrow'));
  expect(onClose).toHaveBeenCalledWith(2);
});

test('the close button works on every screen and reports which one', async () => {
  for (const [nexts, step] of [
    [0, 0],
    [1, 1],
    [2, 2],
  ]) {
    const { tree, onClose } = await render();
    for (let i = 0; i < nexts; i++) await press(tree, t('obNext'));
    await act(async () => closeBtn(tree).props.onPress());
    expect(onClose).toHaveBeenCalledWith(step);
  }
});

test('no reminder can be sent: the second screen promises none', async () => {
  const { tree } = await render({ canRemind: false });
  await press(tree, t('obNext'));
  expect(has(tree, t('opwNoRemindTitle'))).toBe(true);
  expect(has(tree, t('opwRemindTitle'))).toBe(false);
  expect(has(tree, t('tlRemindText'))).toBe(false);
  expect(has(tree, t('tlDay', { n: 7 }))).toBe(true);
});

test('no trial in the offering: straight to the plans, no timeline, no “free” promise', async () => {
  const { tree, onStep } = await render({ plans: NO_TRIAL, scansLeft: 1 });
  expect(onStep).toHaveBeenCalledTimes(1);
  expect(onStep).toHaveBeenCalledWith(2, 'plans');
  const all = strings(tree);
  expect(all).not.toContain(t('tlToday'));
  expect(all.some((s) => /free for/i.test(s))).toBe(false);
  expect(all).toContain('Continue for free — 1 scan a day');
  expect(tree.root.findAll((n) => n.props.title === t('subscribe')).length).toBeGreaterThan(0);
});

test('a plan that arrives later does not throw the person back to the first screen', async () => {
  const { tree } = await render({ plans: [] });
  expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(1);
  await act(async () => tree.update(<OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} onClose={() => {}} onStep={() => {}} />));
  expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(1);
});

describe('RevenueCat paywall as the third screen', () => {
  test('shown: our plans screen is never drawn', async () => {
    const onPresentRc = jest.fn(async () => true);
    const { tree } = await render({ ui: 'revenuecat', onPresentRc });
    await press(tree, t('obNext'));
    await press(tree, t('obNext'));
    expect(onPresentRc).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(0);
  });

  test('unavailable or failed: our plans screen instead', async () => {
    const onPresentRc = jest.fn(async () => false);
    const { tree } = await render({ ui: 'revenuecat', onPresentRc, plans: NO_TRIAL });
    expect(onPresentRc).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(1);
  });

  test('custom ui never asks RevenueCat', async () => {
    const onPresentRc = jest.fn(async () => true);
    const { tree } = await render({ ui: 'custom', onPresentRc, plans: NO_TRIAL });
    expect(onPresentRc).not.toHaveBeenCalled();
    expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(1);
  });
});

test('the default plan is never a pricier pre-selection', () => {
  expect(defaultPlan(PLANS).id).toBe('year');
  expect(defaultPlan(PLANS.filter((p) => p.id !== 'year')).best).toBeFalsy();
  expect(defaultPlan([])).toBeNull();
});
