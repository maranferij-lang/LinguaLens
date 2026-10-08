// Холодний старт Pro-людини з 3 чи 5 словами на день: магазин (RevenueCat)
// відповідає після сервера, але слова дня мають піти з правильною кількістю
// одразу, а не спершу з одним на день і ще раз після відповіді магазину.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));

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

jest.setTimeout(30000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const DAY = 86400000;
const TODAY = localDayKey();
const PRO_INFO = {
  entitlements: {
    active: {
      lingualens_pro: { periodType: 'NORMAL', willRenew: true, productIdentifier: 'yearly', expirationDateMillis: Date.now() + 30 * DAY },
    },
  },
};
const OFFERING = {
  current: {
    identifier: 'default',
    metadata: {},
    availablePackages: [{ packageType: 'ANNUAL', product: { identifier: 'yearly', price: 59.99, priceString: '$59.99', introPrice: null } }],
  },
};

const day = (i) => localDayKey(new Date(Date.now() + i * DAY));
let calls = [];
function server() {
  calls = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, method, body });
    const reply = (code, b) => ({ ok: code < 300, status: code, json: async () => b });
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't1', user: { id: 'u1', createdAt: 1 } });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u1' }, pro: { active: true }, usage: { scans: 0, limit: null } });
    if (u.pathname === '/word-of-day' && method === 'POST') {
      const perDay = body.perDay || 1;
      const words = [];
      for (let i = 0; i < body.days; i++) {
        for (let s = 0; s < perDay; s++) {
          words.push({ date: day(i), slot: s, word: `w${i}-${s}`, ipa: '', translation: 'tr', example: '', example_translation: '', source: `w${i}-${s}` });
        }
      }
      return reply(200, { words, perDay });
    }
    if (u.pathname === '/me/profile') return reply(200, { ok: true });
    throw new TypeError('Network request failed');
  });
}
const wodPosts = () => calls.filter((c) => c.path === '/word-of-day' && c.method === 'POST');

let mounted = null;
beforeEach(async () => {
  await AsyncStorage.clear();
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
  jest.clearAllMocks();
  require('expo-localization').__setLocales(['uk-UA'], { silent: true });
  sdk.getOfferings.mockImplementation(async () => OFFERING);
  sdk.logIn.mockImplementation(async () => ({ customerInfo: PRO_INFO }));
  server();
});
afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount());
  mounted = null;
  jest.restoreAllMocks();
});

const wait = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));
async function renderApp() {
  await act(async () => {
    mounted = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
}
const seedSettings = (extra) =>
  AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'uk', targetLang: 'en', streakSeen: { celebrated: TODAY, best: 0 }, ...extra }));

describe('cold start of a Pro person with 3 words a day', () => {
  test('the store answers after the server: one request, with perDay 3, not one for 1 and another for 3', async () => {
    await seedSettings({ wodPerDay: 3 });
    // відповідь магазину тест віддає сам, коли захоче
    const waiting = [];
    const late = () => new Promise((resolve) => waiting.push(() => resolve(PRO_INFO)));
    sdk.getCustomerInfo.mockImplementation(late);
    sdk.logIn.mockImplementation(async () => ({ customerInfo: await late() }));
    await renderApp();
    await wait(200);
    // сервер уже відповів (id є), а магазин ще мовчить: слова дня чекають
    expect(calls.some((c) => c.path === '/me')).toBe(true);
    expect(wodPosts()).toHaveLength(0);
    await act(async () => waiting.splice(0).forEach((answer) => answer()));
    await wait(200);
    expect(wodPosts()).toHaveLength(1);
    expect(wodPosts()[0].body.perDay).toBe(3);
    // і ефект Pro нічого не перепитує: кеш уже на 3 слова
    await wait(300);
    expect(wodPosts()).toHaveLength(1);
  });

  test('the store never answers: the words still arrive, after the short wait, for the free plan', async () => {
    await seedSettings({ wodPerDay: 3 });
    sdk.getCustomerInfo.mockImplementation(() => new Promise(() => {}));
    sdk.logIn.mockImplementation(() => new Promise(() => {}));
    await renderApp();
    // очікування магазину обмежене ~1.5 с: посередині ще тихо, після нього слова пішли
    await wait(900);
    expect(wodPosts()).toHaveLength(0);
    await wait(1300);
    expect(wodPosts()).toHaveLength(1);
    expect(wodPosts()[0].body.perDay).toBeUndefined();
  });

  test('a free plan (one word a day) does not wait for the store at all', async () => {
    await seedSettings({});
    sdk.getCustomerInfo.mockImplementation(() => new Promise(() => {}));
    await renderApp();
    await wait(300);
    expect(wodPosts()).toHaveLength(1);
  });
});
