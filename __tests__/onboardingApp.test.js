// Онбординг 2.0 у зв'язці з App (магазин — імітація, PostHog — тестовий ключ):
//   • відповіді зберігаються, імʼя — лише на телефоні (ні в мережу, ні в
//     статистику);
//   • наприкінці першого запуску — пейвол онбордингу поверх вкладки
//     навчання, один раз; не для Pro і не в повторі;
//   • перший скан — справжній сканер у режимі першого скану, без пейволів;
//   • покупка з пробним періодом ставить нагадування за 2 дні до кінця.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PostHog from 'posthog-react-native';
import * as Notifications from 'expo-notifications';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import OnboardingPaywall from '../src/OnboardingPaywall';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), POSTHOG_KEY: 'phc_test' }));

// Сповіщення вже дозволені: нагадування про пробний період ставиться одразу
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

// Тут рендериться весь застосунок — див. пояснення в App.test.js.
jest.setTimeout(20000);

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const TODAY = localDayKey();
const PROFILE = { goals: ['work'], field: 'finance', level: 8, since: TODAY };

let calls;
beforeEach(async () => {
  await AsyncStorage.clear();
  for (const inst of PostHog.instances) for (const v of Object.values(inst)) v?.mockClear?.();
  jest.clearAllMocks();
  calls = [];
  global.fetch = jest.fn(async (url, init) => {
    calls.push({ url: String(url), body: init?.body ? String(init.body) : '' });
    throw new TypeError('Network request failed');
  });
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  await act(async () => {
    await new Promise((r) => setTimeout(r, 150));
  });
});

async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  mounted.push(tree);
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

async function run(fn) {
  let out;
  await act(async () => {
    out = await fn();
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
  return out;
}

const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const ph = () => PostHog.instances[0];
const events = (name) => (ph()?.capture.mock.calls || []).filter(([e]) => e === name).map(([, p]) => p);
async function press(tree, text) {
  await run(async () => {
    const hit = tree.root.findAll(
      (n) => typeof n.props.onPress === 'function' && (n.props.title === text || n.findAll((c) => c.props.children === text).length)
    );
    if (!hit.length) throw new Error('no control: ' + text);
    await hit.at(-1).props.onPress();
  });
}

const RESULT = { profile: PROFILE, heardFrom: 'tiktok', name: 'Олена', struggles: ['time', 'forget'], wodEnabled: true, scanned: false, flow: 'control' };

test('first run: answers saved, the name stays on the phone, Learn tab under the onboarding paywall', async () => {
  const tree = await renderApp();
  const onb = one(tree, OnboardingScreen);
  expect(onb.props).toMatchObject({ replay: false, canWow: true, name: '', struggles: [] });
  await run(() => onb.props.onDone(RESULT));

  const st = await stored('ll_settings_v1');
  expect(st).toMatchObject({
    profile: PROFILE,
    heardFrom: 'tiktok',
    profileName: 'Олена',
    struggles: ['forget', 'time'],
    wodEnabled: true,
    onbPaywallShown: true,
  });
  // крок 13 — вкладка навчання, поверх неї пейвол онбордингу
  expect(one(tree, FlashcardsScreen)).not.toBeNull();
  const pw = one(tree, OnboardingPaywall);
  expect(pw).not.toBeNull();
  expect(pw.parent.props.accessibilityViewIsModal).toBe(true);
  expect(events('paywall_view')).toEqual([{ source: 'onboarding', ui: 'custom', offering: null }]);
  expect(events('paywall_step')).toEqual([{ i: 0, step: 'trial', source: 'onboarding' }]);

  // імʼя не пішло ні в мережу, ні в статистику; «що заважає» — теж лише тут
  expect(calls.length).toBeGreaterThan(0);
  expect(calls.some((c) => c.body.includes('Олена') || c.url.includes(encodeURIComponent('Олена')))).toBe(false);
  expect(calls.some((c) => c.body.includes('struggles'))).toBe(false);
  expect(JSON.stringify(ph().capture.mock.calls)).not.toMatch(/Олена/);
  expect(JSON.stringify(ph().register.mock.calls)).not.toMatch(/Олена/);
  expect(ph().identify).not.toHaveBeenCalled();

  // закрили на першому екрані — людина на вкладці навчання
  await run(() => tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && n.props.onPress)[0].props.onPress());
  expect(one(tree, OnboardingPaywall)).toBeNull();
  expect(events('paywall_close')).toEqual([{ source: 'onboarding', step: 0, ui: 'custom' }]);
  expect(one(tree, FlashcardsScreen)).not.toBeNull();
});

test('a trial bought in the onboarding paywall: reminder 2 days before it ends, as the timeline said', async () => {
  const tree = await renderApp();
  await run(() => one(tree, OnboardingScreen).props.onDone(RESULT));
  await press(tree, t('obNext'));
  await press(tree, t('obNext'));
  expect(events('paywall_step').map((e) => e.i)).toEqual([0, 1, 2]);
  const before = Date.now();
  await press(tree, t('startTrial'));
  for (let i = 0; i < 3; i++) await run(() => new Promise((r) => setTimeout(r, 20)));

  expect(events('purchase_success')).toEqual([{ plan: 'year', trial: true, source: 'onboarding', ui: 'custom' }]);
  expect(one(tree, OnboardingPaywall)).toBeNull();
  const reminder = Notifications.scheduleNotificationAsync.mock.calls.map(([r]) => r).find((r) => r.identifier === 'trial-end');
  expect(reminder).toBeTruthy();
  expect(reminder.content).toMatchObject({ title: t('trialEndTitle'), body: t('trialEndBody'), data: { type: 'trial-end' } });
  const at = reminder.trigger.date.getTime();
  const charge = before + 7 * 86400000;
  // не пізніше ніж за 2 дні до списання й не раніше ніж напередодні того дня
  expect(at).toBeLessThanOrEqual(charge - 2 * 86400000 + 1000);
  expect(at).toBeGreaterThan(charge - 3 * 86400000);
  const h = reminder.trigger.date.getHours();
  expect(h >= 8 && h < 22).toBe(true);
});

test('Pro already: no onboarding paywall, and no reason to show the post-scan one later', async () => {
  await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * 86400000 }));
  const tree = await renderApp();
  await run(() => one(tree, OnboardingScreen).props.onDone(RESULT));
  expect(one(tree, OnboardingPaywall)).toBeNull();
  expect(one(tree, PaywallScreen)).toBeNull();
  expect((await stored('ll_settings_v1')).onbPaywallShown).toBe(false);
  expect(events('paywall_view')).toEqual([]);
});

test('replay from Settings: back to Settings, no paywall, the name and struggles can change', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem(
    'll_settings_v1',
    JSON.stringify({ nativeLang: 'en', targetLang: 'es', profile: PROFILE, profileName: 'Олена', struggles: ['time'] })
  );
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onReplayOnb());
  const onb = one(tree, OnboardingScreen);
  expect(onb.props).toMatchObject({ replay: true, canWow: false, name: 'Олена', struggles: ['time'], profile: PROFILE });
  await run(() => onb.props.onDone({ profile: PROFILE, heardFrom: null, name: 'Оля', struggles: ['boring'], scanned: false, flow: 'replay' }));
  expect(one(tree, SettingsScreen)).not.toBeNull();
  expect(one(tree, OnboardingPaywall)).toBeNull();
  expect(await stored('ll_settings_v1')).toMatchObject({ profileName: 'Оля', struggles: ['boring'], profile: PROFILE });
});

describe('first scan inside onboarding', () => {
  const word = { word: 'la taza', translation: 'mug', ipa: '', example: '', exampleTranslation: '', lang: 'es', nativeLang: 'en' };

  test('the real scanner in first-scan mode: word saved from onboarding, then no more “Try it now”', async () => {
    const tree = await renderApp();
    const onSaved = jest.fn();
    const onClose = jest.fn();
    const el = one(tree, OnboardingScreen).props.renderScanner({ onSaved, onClose, level: 7 });
    expect(el.props).toMatchObject({ firstScan: true, scanSource: 'onboarding', level: 7, onExit: onClose, onFirstSaved: onSaved });
    await run(() => el.props.onSaveWord(word));
    expect(await stored('ll_words_v1')).toHaveLength(1);
    expect(events('word_saved')).toEqual([{ count: 1, total: 1, source: 'onboarding' }]);
    // словник уже не порожній — крок «Спробуй зараз» більше не потрібен
    expect(one(tree, OnboardingScreen).props.canWow).toBe(false);
    // на час онбордингу мʼякий пейвол після першого скану не готується
    await run(() => el.props.onScanned({ usage: { day: TODAY, scans: 1, limit: 1 } }));
    await run(() => el.props.onResultVisible(true));
    await run(() => el.props.onResultVisible(false));
    expect(one(tree, PaywallScreen)).toBeNull();
  });

  test('no scan left or the server says no: back to onboarding, no paywall in the middle', async () => {
    const tree = await renderApp();
    const onClose = jest.fn();
    const el = () => one(tree, OnboardingScreen).props.renderScanner({ onSaved: jest.fn(), onClose, level: undefined });
    let ok;
    await run(async () => {
      ok = await el().props.onLimitReached({ used: 1, limit: 1 }, 'SCAN_LIMIT');
    });
    expect(ok).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(events('scan_denied')).toEqual([{ reason: 'scans', server: true, source: 'onboarding' }]);
    // стелю запамʼятали — сканувати вже нічим, тож і кроку немає
    expect(one(tree, OnboardingScreen).props.canWow).toBe(false);
    expect(el().props.onGuardScan('object')).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(2);
    // пейвол ні тут, ні після онбордингу через цей відмовлений скан
    await run(() => one(tree, OnboardingScreen).props.onDone({ ...RESULT, scanned: false }));
    expect(one(tree, PaywallScreen)).toBeNull();
  });
});

// iOS вбиває застосунок, коли в Параметрах міняють доступ до камери (чи
// просто вивантажує його з пам'яті) — посеред онбордингу людина не має
// відповідати на все вдруге. Чернетка — лише на телефоні, у мережу й у
// статистику нічого з неї не йде.
describe('a cold start in the middle of onboarding', () => {
  const header = (tree) =>
    tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header').props.children;

  test('carries on from the same step with the same answers; finishing clears the draft', async () => {
    let tree = await renderApp();
    await press(tree, t('obStart'));
    await run(() => tree.root.findAll((n) => typeof n.props.onChangeText === 'function')[0].props.onChangeText('Олена'));
    await press(tree, t('obNext'));
    await press(tree, t('goal_travel'));
    await press(tree, t('obNext'));
    await press(tree, t('obNext')); // рівень
    await press(tree, t('obSkip')); // що заважає
    await press(tree, t('obNext')); // план
    expect(header(tree)).toBe(t('obWowTitle'));
    expect(await stored('ll_onb_draft_v1')).toMatchObject({ phase: 'wow', name: 'Олена', goals: ['travel'], level: 5 });

    // застосунок вбито — і запущено знову
    await act(async () => mounted.pop().unmount());
    tree = await renderApp();
    const onb = one(tree, OnboardingScreen);
    expect(onb.props.draft).toMatchObject({ phase: 'wow', name: 'Олена' });
    expect(header(tree)).toBe(t('obWowTitle'));
    expect(calls.some((c) => c.body.includes('Олена') || c.url.includes(encodeURIComponent('Олена')))).toBe(false);
    expect(JSON.stringify(ph().capture.mock.calls)).not.toMatch(/Олена/);

    await run(() => one(tree, OnboardingScreen).props.onDone(RESULT));
    expect(await AsyncStorage.getItem('ll_onb_draft_v1')).toBeNull();
    // далі — звичайний застосунок, а не знову онбординг
    await act(async () => mounted.pop().unmount());
    tree = await renderApp();
    expect(one(tree, OnboardingScreen)).toBeNull();
  });
});
