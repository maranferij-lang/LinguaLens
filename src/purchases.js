// Підписка Pro через RevenueCat.
//
// Три режими — щоб застосунок працював на кожному етапі:
//   revenuecat  — є ключ EXPO_PUBLIC_REVENUECAT_IOS_KEY і нативна збірка
//                 (dev build, TestFlight, App Store): справжні покупки StoreKit;
//   simulated   — розробка без ключа або Expo Go: покупка вмикає Pro локально,
//                 щоб можна було пройти всі сценарії лімітів. (У Expo Go SDK
//                 RevenueCat приймає лише тестові ключі test_/rcb_ і на
//                 бойовому appl_ кидав би виняток при старті.);
//   unavailable — релізна збірка без ключа: кнопка чесно каже, що покупки
//                 недоступні. Краще так, ніж роздати Pro безкоштовно.
//
// appUserID у RevenueCat = id пристрою з нашого сервера (src/auth.js). Тому
// сервер, отримавши вебхук або спитавши RevenueCat, бачить ту саму покупку
// і знімає денний ліміт сканів.
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_DEV, PRO_ENTITLEMENT, REVENUECAT_IOS_KEY } from './config';
import { PLANS } from './subscription';

let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (_) {}

const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';
const TEST_KEY = /^(test_|rcb_)/.test(REVENUECAT_IOS_KEY);
const CAN_USE_SDK = !!Purchases && Platform.OS === 'ios' && !!REVENUECAT_IOS_KEY && (!IN_EXPO_GO || TEST_KEY);

export const MODE = CAN_USE_SDK ? 'revenuecat' : IS_DEV ? 'simulated' : 'unavailable';

// Тип пакета в RevenueCat → наш план із PLANS (там підписи й позначки).
const PACKAGE_TO_PLAN = { WEEKLY: 'week', MONTHLY: 'month', THREE_MONTH: 'quarter', ANNUAL: 'year' };
const DAYS_IN = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
// INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
const ELIGIBLE = 2;

// ── Стан Pro з CustomerInfo ─────────────────────────────────────────────────
function stateFromInfo(info) {
  const ent = info?.entitlements?.active?.[PRO_ENTITLEMENT];
  if (!ent) return { pro: false, managementURL: info?.managementURL || null };
  return {
    pro: true,
    until: ent.expirationDateMillis || null,
    trial: ent.periodType === 'TRIAL',
    willRenew: !!ent.willRenew,
    managementURL: info?.managementURL || null,
  };
}

// ── Пакети з магазину → плани для пейволу ────────────────────────────────────
// Ціни беремо з App Store: у кожній країні своя валюта й сума, а знижку
// рахуємо від реальних чисел, а не від захардкоджених «−58%».
// eligibility — { [productId]: статус } з checkTrialOrIntroductoryPriceEligibility.
// Пробний період обіцяємо лише тим, кому Apple його справді дасть: хто вже
// пробував, заплатить одразу, і «7 днів безкоштовно» було б неправдою.
export function plansFromOffering(offering, eligibility = null) {
  const pkgs = offering?.availablePackages || [];
  const byPlan = {};
  for (const p of pkgs) {
    const id = PACKAGE_TO_PLAN[p.packageType];
    if (id) byPlan[id] = p;
  }
  const monthly = byPlan.month?.product;
  return PLANS.filter((plan) => byPlan[plan.id]).map((plan) => {
    const pkg = byPlan[plan.id];
    const product = pkg.product;
    const intro = product.introPrice;
    const eligible = !eligibility || eligibility[product.identifier] === ELIGIBLE;
    const trialDays =
      eligible && intro && intro.price === 0
        ? (DAYS_IN[intro.periodUnit] || 1) * (intro.periodNumberOfUnits || 1) * (intro.cycles || 1)
        : 0;
    const perMonthValue = monthlyValue(plan.days, product.price);
    const save =
      monthly && plan.days > 30 && monthly.price > 0
        ? Math.round((1 - perMonthValue / monthly.price) * 100)
        : 0;
    return {
      ...plan,
      // статичні «−19%/−58%» розраховані на долари — для реальних цін рахуємо save
      saveKey: undefined,
      price: product.priceString,
      perMonth: product.pricePerMonthString || plan.perMonth,
      trialDays,
      save: save > 0 ? save : 0,
      pkg,
    };
  });
}

// Ціна за місяць у календарних місяцях (рік = 12, квартал = 3) — так
// рахує людина, і так само показує App Store.
function monthlyValue(days, price) {
  return price / Math.max(1, Math.round(days / 30.4375));
}

// ── Імітація для розробки (без ключа RevenueCat) ────────────────────────────
const K_SIM = 'll_sub_v1';

async function loadSimulated() {
  try {
    const st = JSON.parse((await AsyncStorage.getItem(K_SIM)) || 'null');
    if (!st || !st.until || Date.now() > st.until) return { pro: false };
    return { pro: true, until: st.until, trial: !!st.trial, willRenew: true, simulated: true };
  } catch (_) {
    return { pro: false };
  }
}

async function activateSimulated(planId) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return { pro: false };
  const days = plan.trialDays || plan.days;
  const st = { planId, until: Date.now() + days * 86400000, trial: !!plan.trialDays };
  await AsyncStorage.setItem(K_SIM, JSON.stringify(st));
  return { pro: true, until: st.until, trial: st.trial, willRenew: true, simulated: true };
}

// ── Хук для App.js ──────────────────────────────────────────────────────────
// Повертає { state, plans, ready, purchase(planId), restore(), manage() }.
// purchase → { ok, cancelled?, error?, state }.
export function usePro(appUserID) {
  const [state, setState] = useState({ pro: false });
  const [plans, setPlans] = useState(MODE === 'revenuecat' ? [] : PLANS);
  const [ready, setReady] = useState(MODE === 'simulated');
  const configured = useRef(false);

  // Налаштовуємо SDK один раз. Якщо id пристрою ще немає (сервер не
  // відповів), RevenueCat стартує з анонімним id, а logIn нижче прив'яже
  // покупку до нашого id, щойно він з'явиться.
  useEffect(() => {
    if (MODE === 'simulated') {
      loadSimulated().then(setState);
      return;
    }
    if (MODE !== 'revenuecat' || configured.current) return;
    try {
      if (IS_DEV) Purchases.setLogLevel(Purchases.LOG_LEVEL.WARN).catch(() => {});
      Purchases.configure({ apiKey: REVENUECAT_IOS_KEY, appUserID: appUserID || null });
      configured.current = true;
    } catch (_) {
      // Невалідний ключ або немає нативного модуля — застосунок працює далі
      // без покупок, а не падає.
      return;
    }
    const onInfo = (info) => setState(stateFromInfo(info));
    Purchases.addCustomerInfoUpdateListener(onInfo);
    Purchases.getCustomerInfo().then(onInfo).catch(() => {});
    loadPlans();
    return () => Purchases.removeCustomerInfoUpdateListener(onInfo);
  }, []);

  // Пакети з магазину. Якщо перша спроба не вдалась (офлайн при старті),
  // пейвол перепитає їх, коли відкриється.
  async function loadPlans() {
    if (MODE !== 'revenuecat' || !configured.current) return;
    try {
      const o = await Purchases.getOfferings();
      if (!o.current) {
        setReady(false);
        return;
      }
      let eligibility = null;
      const withIntro = o.current.availablePackages.filter((p) => p.product.introPrice).map((p) => p.product.identifier);
      if (withIntro.length) {
        try {
          const res = await Purchases.checkTrialOrIntroductoryPriceEligibility(withIntro);
          eligibility = Object.fromEntries(Object.entries(res).map(([id, v]) => [id, v.status]));
        } catch (_) {
          // не знаємо — не обіцяємо пробний період нікому
          eligibility = {};
        }
      }
      setPlans(plansFromOffering(o.current, eligibility));
      setReady(true);
    } catch (_) {
      setReady(false);
    }
  }

  useEffect(() => {
    if (MODE !== 'revenuecat' || !appUserID || !configured.current) return;
    Purchases.logIn(appUserID)
      .then(({ customerInfo }) => setState(stateFromInfo(customerInfo)))
      .catch(() => {});
  }, [appUserID]);

  async function purchase(planId) {
    if (MODE === 'simulated') {
      const next = await activateSimulated(planId);
      setState(next);
      return { ok: true, state: next };
    }
    if (MODE !== 'revenuecat') return { ok: false, error: 'UNAVAILABLE' };
    const plan = plans.find((p) => p.id === planId);
    if (!plan?.pkg) return { ok: false, error: 'UNAVAILABLE' };
    try {
      const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
      const next = stateFromInfo(customerInfo);
      setState(next);
      // Покупка пройшла, але продукт не прив'язаний до entitlement 'pro' у
      // RevenueCat — це помилка налаштування, а не людини.
      return next.pro ? { ok: true, state: next } : { ok: false, error: 'NOT_ENTITLED' };
    } catch (e) {
      const codes = Purchases.PURCHASES_ERROR_CODE;
      // Людина передумала у системному вікні оплати — це не помилка.
      if (e?.code === codes.PURCHASE_CANCELLED_ERROR) return { ok: false, cancelled: true };
      // «Попросити купити» (сімейний доступ): чекаємо схвалення батьків.
      if (e?.code === codes.PAYMENT_PENDING_ERROR) return { ok: false, pending: true };
      return { ok: false, error: e?.code || 'FAILED' };
    }
  }

  // «Відновити покупки» — обов'язкова кнопка за правилами App Store.
  async function restore() {
    if (MODE !== 'revenuecat') {
      const next = MODE === 'simulated' ? await loadSimulated() : state;
      setState(next);
      return next;
    }
    try {
      const next = stateFromInfo(await Purchases.restorePurchases());
      setState(next);
      return next;
    } catch (_) {
      return state;
    }
  }

  // Керування підпискою — системний аркуш App Store, без виходу із застосунку.
  async function manage() {
    if (MODE === 'revenuecat') {
      try {
        await Purchases.showManageSubscriptions();
        return;
      } catch (_) {}
    }
    Linking.openURL(state.managementURL || 'https://apps.apple.com/account/subscriptions').catch(() => {});
  }

  return { state, plans, ready, purchase, restore, manage, reloadPlans: loadPlans, mode: MODE };
}
