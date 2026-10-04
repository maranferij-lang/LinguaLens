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
//
// Ключ Test Store (test_…) у dev build показує симульоване вікно покупки
// RevenueCat — це той самий режим revenuecat: пакети, покупка й CustomerInfo
// приходять від RevenueCat, лише без грошей.
//
// Віддалені перемикачі — у metadata поточної пропозиції (offering) RevenueCat
// (див. paywallConfigFrom): так RevenueCat Experiments може порівнювати
// пейволи, онбординг і ціни без оновлення застосунку.
import { useEffect, useRef, useState } from 'react';
import { Linking, Platform } from 'react-native';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_DEV, PRO_ENTITLEMENT, REVENUECAT_IOS_KEY } from './config';
import { PLANS, SIMULATED_PLANS } from './subscription';

let Purchases = null;
try {
  Purchases = require('react-native-purchases').default;
} catch (_) {}

const IN_EXPO_GO = Constants.executionEnvironment === 'storeClient';
const TEST_KEY = /^(test_|rcb_)/.test(REVENUECAT_IOS_KEY);
const CAN_USE_SDK = !!Purchases && Platform.OS === 'ios' && !!REVENUECAT_IOS_KEY && (!IN_EXPO_GO || TEST_KEY);

export const MODE = CAN_USE_SDK ? 'revenuecat' : IS_DEV ? 'simulated' : 'unavailable';

// Готові пейвол і Customer Center від RevenueCat (react-native-purchases-ui).
// Їхня нативна частина є лише в dev build, TestFlight і App Store; в Expo Go
// пакет працює в «режимі прев'ю» без справжніх покупок — там лишаємо наш
// пейвол і системне керування підпискою. Вантажимо ліниво: без потреби
// пакет навіть не ініціалізується.
let uiModule;
function revenueCatUI() {
  if (uiModule === undefined) {
    try {
      uiModule = require('react-native-purchases-ui').default || null;
    } catch (_) {
      uiModule = null;
    }
  }
  return uiModule;
}
export function rcUiAvailable() {
  return MODE === 'revenuecat' && !IN_EXPO_GO && !!revenueCatUI();
}

// Тип пакета в RevenueCat → наш план із PLANS (там підписи й позначки).
const PACKAGE_TO_PLAN = { WEEKLY: 'week', MONTHLY: 'month', THREE_MONTH: 'quarter', ANNUAL: 'year', LIFETIME: 'lifetime' };
const DAYS_IN = { DAY: 1, WEEK: 7, MONTH: 30, YEAR: 365 };
// INTRO_ELIGIBILITY_STATUS.INTRO_ELIGIBILITY_STATUS_ELIGIBLE
const ELIGIBLE = 2;

// Відмови, після яких гроші точно не списано: StoreKit чи RevenueCat
// зупинили покупку ДО оплати. Решта (мережа, чек, бекенд RevenueCat,
// NOT_ENTITLED, невідома) буває й ПІСЛЯ списання — там «гроші не списано»
// було б неправдою.
const BEFORE_PAYMENT = [
  'PURCHASE_NOT_ALLOWED_ERROR',
  'PURCHASE_INVALID_ERROR',
  'PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR',
  'INELIGIBLE_ERROR',
  'INVALID_PROMOTIONAL_OFFER_ERROR',
  'PRODUCT_REQUEST_TIMED_OUT_ERROR',
  'CONFIGURATION_ERROR',
];

function beforePayment(code) {
  const codes = Purchases?.PURCHASES_ERROR_CODE || {};
  return code != null && BEFORE_PAYMENT.some((name) => codes[name] === code);
}

// Пояснення під кнопкою після невдалої покупки — ключ рядка в i18n, або
// null: успіх чи людина сама скасувала у системному вікні.
export function purchaseNote(res) {
  if (!res || res.ok || res.cancelled) return null;
  if (res.pending) return 'purchasePending';
  if (res.error === 'UNAVAILABLE') return 'purchasesUnavailable';
  return res.uncharged ? 'purchaseFailed' : 'purchaseUnclear';
}

// Що сказати після «Відновити покупки». Збій зв'язку — не «покупок немає»:
// інакше людина з підпискою вирішила б, що її загубили.
export function restoreNote(res) {
  if (res?.error) return res.error === 'UNAVAILABLE' ? 'purchasesUnavailable' : 'restoreFailed';
  return res?.pro ? 'restoreDone' : 'restoreNothing';
}

// ── Стан Pro з CustomerInfo ─────────────────────────────────────────────────
// Активний entitlement без дати закінчення — покупка «назавжди»: нічого не
// продовжується і не скасовується, а налаштування пишуть «Pro назавжди».
export function stateFromInfo(info) {
  const managementURL = info?.managementURL || null;
  const ent = info?.entitlements?.active?.[PRO_ENTITLEMENT];
  if (!ent) return { pro: false, managementURL };
  const lifetime = !ent.expirationDateMillis && !ent.expirationDate;
  return {
    pro: true,
    until: ent.expirationDateMillis || null,
    trial: ent.periodType === 'TRIAL',
    willRenew: lifetime ? false : !!ent.willRenew,
    lifetime,
    productId: ent.productIdentifier || null,
    managementURL,
  };
}

// ── Віддалені перемикачі пейволу ────────────────────────────────────────────
// metadata поточної пропозиції в дашборді RevenueCat:
//   onboarding_paywall: "show" (типово) | "skip" — чи показувати пейвол
//     наприкінці онбордингу;
//   paywall_ui: "custom" (типово) | "revenuecat" — наш PaywallScreen чи
//     пейвол, зібраний у дашборді RevenueCat.
// Будь-що інше (немає ключа, помилка в слові, не рядок) — типове значення:
// одрук у дашборді не має ламати пейвол.
export const PAYWALL_DEFAULTS = Object.freeze({ onboardingPaywall: 'show', ui: 'custom' });

function pick(value, allowed, fallback) {
  const v = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return allowed.includes(v) ? v : fallback;
}

export function paywallConfigFrom(metadata) {
  const m = metadata && typeof metadata === 'object' ? metadata : {};
  return {
    onboardingPaywall: pick(m.onboarding_paywall, ['show', 'skip'], PAYWALL_DEFAULTS.onboardingPaywall),
    ui: pick(m.paywall_ui, ['custom', 'revenuecat'], PAYWALL_DEFAULTS.ui),
  };
}

// Остання поточна пропозиція з RevenueCat (її ставить usePro). Одна на весь
// застосунок, тож і читати її можна будь-звідки, без пропсів.
let currentOffering = null;

// → { onboardingPaywall: 'show'|'skip', ui: 'custom'|'revenuecat' }.
// ui — те, що справді покажемо: «revenuecat» без нативного RevenueCat UI
// (Expo Go, імітація, збірка без магазину) стає «custom».
export function paywallConfig() {
  const cfg = paywallConfigFrom(currentOffering?.metadata);
  return cfg.ui === 'revenuecat' && !rcUiAvailable() ? { ...cfg, ui: 'custom' } : cfg;
}

// id поточної пропозиції (для статистики й експериментів) або null
export function currentOfferingId() {
  return currentOffering?.identifier || null;
}

// Продукт із CustomerInfo → наш план ('year', 'lifetime'…) за пакетами
// поточної пропозиції. Для статистики покупок із пейволу RevenueCat, де
// тариф обирає не наш код. Невідомий продукт — null.
export function planOfProduct(productId) {
  if (!productId) return null;
  const pkg = (currentOffering?.availablePackages || []).find((p) => p.product?.identifier === productId);
  return (pkg && PACKAGE_TO_PLAN[pkg.packageType]) || null;
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
    // «Назавжди» — одна оплата: без пробного періоду, без ціни «на місяць»
    // і без «−N%» (порівнювати разову покупку з підпискою нечесно).
    if (plan.lifetime) {
      return { ...plan, price: product.priceString, perMonth: null, trialDays: 0, save: 0, pkg };
    }
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
    if (st?.lifetime) return { pro: true, until: null, trial: false, willRenew: false, lifetime: true, simulated: true };
    if (!st || !st.until || Date.now() > st.until) return { pro: false };
    return { pro: true, until: st.until, trial: !!st.trial, willRenew: true, simulated: true };
  } catch (_) {
    return { pro: false };
  }
}

async function activateSimulated(planId) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return { pro: false };
  if (plan.lifetime) {
    await AsyncStorage.setItem(K_SIM, JSON.stringify({ planId, lifetime: true }));
    return loadSimulated();
  }
  const days = plan.trialDays || plan.days;
  const st = { planId, until: Date.now() + days * 86400000, trial: !!plan.trialDays };
  await AsyncStorage.setItem(K_SIM, JSON.stringify(st));
  return { pro: true, until: st.until, trial: st.trial, willRenew: true, simulated: true };
}

// ── Хук для App.js ──────────────────────────────────────────────────────────
// Повертає { state, plans, ready, purchase(planId), restore(), manage(),
// presentPaywall(), refresh(), reloadPlans(), mode, config, offeringId }.
// purchase → { ok, cancelled?, pending?, error?, uncharged?, state }, де
// uncharged — відмова ще до оплати (див. BEFORE_PAYMENT).
export function usePro(appUserID) {
  const [state, setState] = useState({ pro: false });
  // Статичні USD-ціни — лише для імітації в розробці. Без магазину (релізна
  // збірка без ключа) тарифів немає: вигадані ціни й «7 днів безкоштовно»,
  // які не можна купити, — неправда.
  const [plans, setPlans] = useState(MODE === 'simulated' ? SIMULATED_PLANS : []);
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
    // Атрибуція Apple Ads: RevenueCat сам забирає токен AdServices і
    // показує, з якої кампанії прийшла покупка. Це не IDFA і не потребує
    // запиту ATT. API існує лише в iOS; відмова атрибуції покупкам не заважає.
    if (Platform.OS === 'ios') {
      try {
        Promise.resolve(Purchases.enableAdServicesAttributionTokenCollection()).catch(() => {});
      } catch (_) {}
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
      currentOffering = o.current;
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

  // logIn при старті міг не вдатись (офлайн), і тоді покупка лягла б на
  // анонімний $RCAnonymousID, якого сервер не перевіряє: Pro куплено, а ліміт
  // сканів лишився. Тож перед покупкою й відновленням перевіряємо ще раз.
  // Id пристрою ще немає (сервер не відповідав) — купуємо анонімно: logIn
  // пізніше перенесе покупку на наш id.
  async function identify() {
    if (!appUserID) return true;
    try {
      if ((await Purchases.getAppUserID()) !== appUserID) await Purchases.logIn(appUserID);
      return true;
    } catch (_) {
      return false;
    }
  }

  // Свіжий стан Pro (після пейволу RevenueCat чи Customer Center, де купують
  // і відновлюють не через наш код). → стан або null, якщо не вдалось.
  async function refresh() {
    if (MODE === 'simulated') {
      const next = await loadSimulated();
      setState(next);
      return next;
    }
    if (MODE !== 'revenuecat' || !configured.current) return null;
    try {
      const next = stateFromInfo(await Purchases.getCustomerInfo());
      setState(next);
      return next;
    } catch (_) {
      return null;
    }
  }

  async function purchase(planId) {
    if (MODE === 'simulated') {
      const next = await activateSimulated(planId);
      setState(next);
      return { ok: true, state: next };
    }
    if (MODE !== 'revenuecat') return { ok: false, error: 'UNAVAILABLE', uncharged: true };
    const plan = plans.find((p) => p.id === planId);
    if (!plan?.pkg) return { ok: false, error: 'UNAVAILABLE', uncharged: true };
    if (!(await identify())) return { ok: false, error: 'LOGIN_FAILED', uncharged: true };
    try {
      const { customerInfo } = await Purchases.purchasePackage(plan.pkg);
      const next = stateFromInfo(customerInfo);
      setState(next);
      // Покупка пройшла, але продукт не прив'язаний до entitlement
      // lingualens_pro у RevenueCat — це помилка налаштування, а не людини.
      return next.pro ? { ok: true, state: next } : { ok: false, error: 'NOT_ENTITLED' };
    } catch (e) {
      const codes = Purchases.PURCHASES_ERROR_CODE;
      // Людина передумала у системному вікні оплати — це не помилка.
      if (e?.code === codes.PURCHASE_CANCELLED_ERROR) return { ok: false, cancelled: true };
      // «Попросити купити» (сімейний доступ): чекаємо схвалення батьків.
      if (e?.code === codes.PAYMENT_PENDING_ERROR) return { ok: false, pending: true };
      return { ok: false, error: e?.code || 'FAILED', uncharged: beforePayment(e?.code) };
    }
  }

  // «Відновити покупки» — обов'язкова кнопка за правилами App Store.
  // Повертає стан Pro або { error }, якщо до магазину не достукались.
  async function restore() {
    if (MODE === 'simulated') {
      const next = await loadSimulated();
      setState(next);
      return next;
    }
    if (MODE !== 'revenuecat') return { error: 'UNAVAILABLE' };
    if (!(await identify())) return { error: 'LOGIN_FAILED' };
    try {
      const next = stateFromInfo(await Purchases.restorePurchases());
      setState(next);
      return next;
    } catch (e) {
      return { error: e?.code || 'FAILED' };
    }
  }

  // Пейвол із дашборду RevenueCat для поточної пропозиції — коли metadata
  // каже paywall_ui: "revenuecat". → { fallback: true }, якщо треба показати
  // наш PaywallScreen: RevenueCat UI вимкнений чи недоступний (Expo Go,
  // імітація), не вдалось увійти в наш id (покупка лягла б на анонімний —
  // наш пейвол скаже про це чесно), пейвол упав або повернув ERROR.
  // Інакше → { result, state, purchased, restored }; result — 'PURCHASED',
  // 'RESTORED', 'CANCELLED' чи 'NOT_PRESENTED' (значення PAYWALL_RESULT).
  // Після закриття стан Pro перечитуємо: купили — Pro діє одразу.
  async function presentPaywall() {
    const RCUI = revenueCatUI();
    if (paywallConfig().ui !== 'revenuecat' || !RCUI) return { fallback: true };
    if (!(await identify())) return { fallback: true };
    let result;
    try {
      result = await RCUI.presentPaywall({ ...(currentOffering ? { offering: currentOffering } : null), displayCloseButton: true });
    } catch (_) {
      return { fallback: true };
    }
    if (!result || result === 'ERROR') return { fallback: true, result: result || null };
    const next = await refresh();
    return { result, state: next, purchased: result === 'PURCHASED', restored: result === 'RESTORED' };
  }

  // «Керувати підпискою»: Customer Center від RevenueCat (скасування,
  // повернення коштів, відновлення — усе всередині застосунку). Немає його
  // (Expo Go, збірка без нативного модуля, помилка) — системний аркуш App
  // Store, а без нього — сторінка підписок Apple ID. → 'customerCenter' |
  // 'appStore' | 'url' — що саме відкрилось.
  async function manage() {
    if (MODE === 'revenuecat') {
      const RCUI = rcUiAvailable() ? revenueCatUI() : null;
      if (RCUI) {
        try {
          await RCUI.presentCustomerCenter({
            callbacks: {
              onRestoreCompleted: ({ customerInfo } = {}) => customerInfo && setState(stateFromInfo(customerInfo)),
              onRefundRequestCompleted: () => {
                refresh();
              },
            },
          });
          await refresh();
          return 'customerCenter';
        } catch (_) {}
      }
      try {
        await Purchases.showManageSubscriptions();
        return 'appStore';
      } catch (_) {}
    }
    Linking.openURL(state.managementURL || 'https://apps.apple.com/account/subscriptions').catch(() => {});
    return 'url';
  }

  return {
    state,
    plans,
    ready,
    purchase,
    restore,
    manage,
    presentPaywall,
    refresh,
    reloadPlans: loadPlans,
    mode: MODE,
    // перечитуються з кожним рендером: пропозиція приходить разом із plans
    config: paywallConfig(),
    offeringId: currentOfferingId(),
  };
}
