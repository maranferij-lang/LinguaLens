// LinguaLens Pro subscription.
//
// PRICING LOGIC
// The ladder is built so that the week is the most expensive per year and
// the year is the cheapest. The weekly plan is not here for people to stay on it: it
// exists as an anchor, next to which the yearly one looks like the obvious choice.
//
//   week      $4.99  →  $259/year   (×7.4 of the yearly)
//   month     $6.99  →  $84/year    (×2.4)
//   3 months  $16.99 →  $68/year    (×1.9)
//   year      $34.99 →  $35/year    ← 7 days free
//
// The yearly plan with a trial week is the main plan. A competitor (CapWords, an
// Apple Design Award winner) charges $5.99/month and $29.99/year, so we are in the same field,
// but with a noticeably better yearly saving in the display.
//
// ABOUT THE TRIAL PERIOD, AND WHY IT IS HONEST HERE
// The concern is fair: a trial after which money is quietly charged is a
// dark pattern, and it comes back as one-star reviews in the App Store and as refunds.
// But a trial in itself is not a trick; what makes it one
// is the default. Therefore:
//   1. The paywall states in plain text when and how much will be charged.
//   2. 2 days before the end the app itself sends a reminder (scheduleTrialReminder).
//      Apple sends its own too, but we do not rely on that.
//   3. It can be canceled in one tap, and the link for that is in settings.
// If after testing the feeling is still unpleasant, turn the trial off with one line:
// remove trialDays from the yearly plan, and the whole mechanic disappears by itself.
//
// LIMITS LOGIC
// We limit what costs us money (AI calls) and what shows the value of
// accumulation (dictionary size). We do NOT limit the word of the day, reviews and
// pronunciation: that is exactly what brings the person back every day. Choking retention to
// sell a subscription is the most expensive mistake.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PLANS = [
  {
    id: 'week',
    productId: 'com.marik.lingualens.pro.week',
    days: 7,
    price: '$4.99',
    perMonth: '$21.6',
    labelKey: 'planWeek',
  },
  {
    id: 'month',
    productId: 'com.marik.lingualens.pro.month',
    days: 30,
    price: '$6.99',
    perMonth: '$6.99',
    labelKey: 'planMonth',
  },
  {
    id: 'quarter',
    productId: 'com.marik.lingualens.pro.quarter',
    days: 90,
    price: '$16.99',
    perMonth: '$5.66',
    labelKey: 'planQuarter',
    saveKey: 'save19',
  },
  {
    id: 'year',
    productId: 'com.marik.lingualens.pro.year',
    days: 365,
    price: '$34.99',
    perMonth: '$2.92',
    labelKey: 'planYear',
    saveKey: 'save58',
    trialDays: 7,
    best: true,
  },
];

// What the free tier gives
export const FREE = {
  scansPerDay: 5,
  maxWords: 100,
  languagePairs: 1,
};

// Storage keys
const K_STATE = 'll_sub_v1';
const K_USAGE = 'll_usage_v1';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Subscription state ──────────────────────────────────────────────────────
// Until payment processing is connected, we keep the state locally. Once it is connected,
// the source of truth will be the App Store receipt, and the data shape will not change.
export async function loadSubscription() {
  try {
    const raw = await AsyncStorage.getItem(K_STATE);
    const st = raw ? JSON.parse(raw) : null;
    if (!st || !st.planId || !st.until) return { pro: false };
    if (Date.now() > st.until) return { pro: false, expired: true, planId: st.planId };
    return { pro: true, planId: st.planId, until: st.until, trial: !!st.trial };
  } catch (_) {
    return { pro: false };
  }
}

export async function activatePlan(planId) {
  const plan = PLANS.find((p) => p.id === planId);
  if (!plan) return { pro: false };
  const days = plan.trialDays || plan.days;
  const state = {
    planId,
    until: Date.now() + days * 86400000,
    trial: !!plan.trialDays,
  };
  await AsyncStorage.setItem(K_STATE, JSON.stringify(state));
  return { pro: true, ...state };
}

export async function cancelSubscription() {
  await AsyncStorage.removeItem(K_STATE);
  return { pro: false };
}

// ── Scan accounting ─────────────────────────────────────────────────────────
export async function loadUsage() {
  try {
    const raw = await AsyncStorage.getItem(K_USAGE);
    const u = raw ? JSON.parse(raw) : null;
    // a new day: the counter starts from zero
    if (!u || u.day !== today()) return { day: today(), scans: 0 };
    return u;
  } catch (_) {
    return { day: today(), scans: 0 };
  }
}

export async function bumpScan(usage) {
  const next =
    usage && usage.day === today()
      ? { day: usage.day, scans: (usage.scans || 0) + 1 }
      : { day: today(), scans: 1 };
  await AsyncStorage.setItem(K_USAGE, JSON.stringify(next));
  return next;
}

// ── Gatekeeper ──────────────────────────────────────────────────────────────
// Returns null if the action can be done, or the reason for refusal.
// The reason is a string by which the paywall understands WHICH argument to show:
// a person who used up their scans and a person who filled the dictionary need different things.

export function canScan({ pro, usage }) {
  if (pro) return null;
  const used = usage?.scans || 0;
  if (used >= FREE.scansPerDay) return 'scans';
  return null;
}

export function scansLeft({ pro, usage }) {
  if (pro) return Infinity;
  return Math.max(0, FREE.scansPerDay - (usage?.scans || 0));
}

export function canSaveWord({ pro, wordCount }) {
  if (pro) return null;
  if (wordCount >= FREE.maxWords) return 'words';
  return null;
}

export function canUseLanguage({ pro, words, nextLang }) {
  if (pro) return null;
  const used = new Set(words.map((w) => w.lang || 'en'));
  used.add(nextLang);
  if (used.size > FREE.languagePairs) return 'langs';
  return null;
}

// Pro benefits: used both in the paywall and in settings.
// The order is deliberate: first the thing the person came here for.
// Pro benefits. Only what the person will really feel.
// "Export to file" was removed from here deliberately: only a few people use it, and in
// the list it takes the place of a real argument and dilutes the value.
export const PRO_BENEFITS = [
  { id: 'scans', icon: 'scan' },
  { id: 'words', icon: 'book' },
  { id: 'langs', icon: 'globe' },
  { id: 'photos', icon: 'sticker' },
  { id: 'support', icon: 'heart' },
];

// A "without subscription / with subscription" comparison. The main element of the paywall:
// a person should see not a list of benefits, but THEIR situation and how it will change.
export const COMPARISON = [
  { id: 'scans', free: '5 / день', pro: '∞' },
  { id: 'words', free: '100', pro: '∞' },
  { id: 'langs', free: '1', pro: '29' },
  { id: 'wod', free: true, pro: true },
  { id: 'srs', free: true, pro: true },
  { id: 'speech', free: true, pro: true },
];
