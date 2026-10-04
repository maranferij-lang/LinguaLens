// v1.2 у зв'язці App + екрани: «словник безкоштовний, скани платні».
//   • сцена — Pro з однією безкоштовною пробою: значок PRO, воротар, 402 SCENE_PRO;
//   • статистика: події існуючих дій ідуть у PostHog (заглушка з jest.setup.js),
//     властивості людини — без імен і слів; перемикач у налаштуваннях вимикає все.
// Магазин тут — імітація (ключа RevenueCat немає), PostHog — з тестовим ключем.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import PostHog from 'posthog-react-native';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import PaywallScreen from '../src/PaywallScreen';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import { localDayKey } from '../src/storage';
import { ACHIEVEMENTS } from '../src/achievements';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), POSTHOG_KEY: 'phc_test' }));

// Сповіщень ще не дозволяли: перемикач «Слово дня» спитає систему
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'undetermined', canAskAgain: true })),
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

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);

// Клієнт PostHog один на весь файл (модуль статистики живе між тестами) —
// перед кожним тестом лише очищаємо записані виклики.
beforeEach(async () => {
  await AsyncStorage.clear();
  for (const inst of PostHog.instances) for (const v of Object.values(inst)) v?.mockClear?.();
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

// Дерево розмонтовуємо й тоді, коли перевірка впала: інакше застосунок
// крутив би таймери далі, і решта тестів зависала б. Відкладені появи
// (FadeIn із delay у пейволі) мають встигнути відпрацювати до кінця файлу:
// таймер, що спрацює вже після знесення середовища jest, валить процес.
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

async function returning({ settings = { nativeLang: 'en', targetLang: 'es' }, words = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(settings));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ALL_ACH));
  if (wod) await AsyncStorage.setItem('ll_wod_v1', JSON.stringify(wod));
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

const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
function serve(route) {
  global.fetch = jest.fn(async (url, init) => {
    const r = route(new URL(url), init?.method || 'GET');
    if (!r) throw new TypeError('Network request failed');
    return r;
  });
}
// Сервер, що віддає лічильники сцен (v1.2)
function serveUsage(usage) {
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u' }, pro: { active: false }, usage: { day: localDayKey(), ...usage } });
    return null;
  });
}

const ph = () => PostHog.instances[0];
const events = (name) => (ph()?.capture.mock.calls || []).filter(([e]) => e === name).map(([, p]) => p);

describe('scene is Pro after one free try', () => {
  test('the free scene is used: PRO badge, the guard stops a scene but not a single object', async () => {
    await returning();
    serveUsage({ scans: 0, limit: 1, scenes: 1, sceneLimit: 1 });
    const tree = await renderApp();
    const scanner = () => one(tree, ScannerScreen);
    expect(scanner().props.sceneLocked).toBe(true);
    expect(scanner().props.onGuardScan('object')).toBe(true);
    expect(one(tree, PaywallScreen)).toBeNull();

    let allowed;
    await run(() => (allowed = scanner().props.onGuardScan('scene')));
    expect(allowed).toBe(false);
    expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'scene', freeScenes: 1, freeScans: 1 });
    expect(events('scan_denied')).toEqual([{ reason: 'scene', mode: 'scene' }]);
    expect(events('paywall_view')).toEqual([{ source: 'scene', ui: 'custom', offering: null }]);
  });

  test('the free scene is still there: no badge, the scene goes', async () => {
    await returning();
    serveUsage({ scans: 0, limit: 1, scenes: 0, sceneLimit: 1 });
    const tree = await renderApp();
    expect(one(tree, ScannerScreen).props.sceneLocked).toBe(false);
    expect(one(tree, ScannerScreen).props.onGuardScan('scene')).toBe(true);
  });

  test('the free scan is checked first, like on the server: a scene takes it too', async () => {
    await returning();
    serveUsage({ scans: 1, limit: 1, scenes: 1, sceneLimit: 1 });
    const tree = await renderApp();
    await run(() => one(tree, ScannerScreen).props.onGuardScan('scene'));
    expect(one(tree, PaywallScreen).props.reason).toBe('scans');
  });

  // Безкоштовний скан пішов на предмет — проба сцени ще «є», але сцена теж
  // займає скан, а його вже немає: стіна сканів, і без значка PRO на сцені.
  test('the free scan spent on an object leaves no scan for the free scene either', async () => {
    await returning();
    serveUsage({ scans: 1, limit: 1, scenes: 0, sceneLimit: 1 });
    const tree = await renderApp();
    expect(one(tree, ScannerScreen).props).toMatchObject({ scansLeft: 0, sceneLocked: false });
    let allowed;
    await run(() => (allowed = one(tree, ScannerScreen).props.onGuardScan('scene')));
    expect(allowed).toBe(false);
    expect(one(tree, PaywallScreen).props.reason).toBe('scans');
    expect(events('scan_denied')).toEqual([{ reason: 'scans', mode: 'scene' }]);
  });

  test('tapping the locked scene chip opens the scene paywall', async () => {
    await returning();
    serveUsage({ scans: 0, limit: 1, scenes: 1, sceneLimit: 1 });
    const tree = await renderApp();
    await run(() => one(tree, ScannerScreen).props.onScenePro());
    expect(one(tree, PaywallScreen).props.reason).toBe('scene');
  });

  test('a SCENE_PRO answer opens the scene paywall and remembers the lifetime count', async () => {
    await returning();
    const tree = await renderApp();
    expect(one(tree, ScannerScreen).props.sceneLocked).toBe(false); // сервер ще не відповідав
    const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCENE_PRO', used: 1, limit: 1 }, 'SCENE_PRO'));
    expect(retry).toBe(false);
    expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'scene', freeScenes: 1 });
    expect(await stored('ll_usage_v1')).toMatchObject({ scenes: 1, sceneLimit: 1 });
    expect(events('scan_denied')).toEqual([{ reason: 'scene', server: true }]);
    await run(() => one(tree, PaywallScreen).props.onClose());
    expect(one(tree, ScannerScreen).props.sceneLocked).toBe(true);
  });

  test('SCENE_PRO right after buying Pro: the server re-checks and the same frame goes again', async () => {
    await returning();
    let webhookLanded = false;
    serve((u) => {
      if (u.pathname !== '/me') return null;
      const pro = webhookLanded;
      return reply(200, { user: { id: 'u' }, pro: { active: pro }, usage: { day: localDayKey(), scans: 0, limit: pro ? null : 1, scenes: 1, sceneLimit: pro ? null : 1 } });
    });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    await openTab(tree, 'scan');
    // Pro на телефоні вже є — значка немає, навіть поки сервер не знає
    expect(one(tree, ScannerScreen).props.sceneLocked).toBe(false);
    webhookLanded = true;
    const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCENE_PRO', used: 1, limit: 1 }, 'SCENE_PRO'));
    expect(retry).toBe(true);
    expect(one(tree, PaywallScreen)).toBeNull();
  });
});

describe('anonymous statistics', () => {
  test('person properties are codes only, and nothing identifies the person', async () => {
    await returning({ settings: { nativeLang: 'uk', targetLang: 'en', profile: { goals: ['work'], field: 'finance', level: 8, since: '2026-09-01' } } });
    await renderApp();
    expect(PostHog.instances).toHaveLength(1);
    expect(ph().register).toHaveBeenLastCalledWith({
      ui_lang: 'uk',
      target_lang: 'en',
      native_lang: 'uk',
      level: 8,
      goals: ['work'],
      field: 'finance',
      pro: false,
    });
    expect(ph().identify).not.toHaveBeenCalled();
  });

  test('a paywall seen, closed, then a purchase and a restore', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    await run(() => one(tree, PaywallScreen).props.onClose());
    expect(events('paywall_view')).toEqual([{ source: 'info', ui: 'custom', offering: null }]);
    expect(events('paywall_close')).toEqual([{ source: 'info', step: 0, ui: 'custom' }]);

    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    expect(events('purchase_start')).toEqual([{ plan: 'year', source: 'info' }]);
    expect(events('purchase_success')).toEqual([{ plan: 'year', trial: true, source: 'info', ui: 'custom' }]);
    // покупка — не «закрили без покупки»
    expect(events('paywall_close')).toHaveLength(1);

    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onRestore());
    expect(events('restore')).toEqual([{ ok: true, pro: true, error: null }]);
  });

  test('a restore from inside the paywall closes it without counting a refusal', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    await run(() => one(tree, PaywallScreen).props.onPurchase('month'));
    // імітований Pro — тепер відновлення його «знайде»
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen)).not.toBeNull();
    const paywall = one(tree, PaywallScreen);
    await run(async () => {
      await paywall.props.onRestore();
      paywall.props.onClose();
    });
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(events('paywall_close')).toHaveLength(0);
  });

  test('saved words are counted, never sent', async () => {
    await returning();
    const tree = await renderApp();
    await run(() => one(tree, ScannerScreen).props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
    expect(events('word_saved')).toEqual([{ count: 1, total: 1, source: 'scan' }]);
    expect(JSON.stringify(ph().capture.mock.calls)).not.toContain('la taza');
  });

  test('turning on the word of the day asks iOS and records the answer', async () => {
    await returning({ settings: { nativeLang: 'en', targetLang: 'es', wodEnabled: false } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onToggleWod(true));
    expect(events('push_permission')).toEqual([{ granted: true, source: 'settings' }]);
  });

  test('“I know it” is counted without the word itself', async () => {
    const wod = { lang: 'es', native: 'en', words: [{ date: localDayKey(), word: 'la manzana', translation: 'apple', source: 'apple' }] };
    await returning({ wod });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onKnowWod());
    expect(events('wod_known')).toEqual([{ streak: 1, level: null }]);
    expect(JSON.stringify(ph().capture.mock.calls)).not.toContain('apple');
  });

  test('the widget tip: seen once per launch, and hidden', async () => {
    const w = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } });
    await returning({ settings: { nativeLang: 'en', targetLang: 'es', profileTipOff: true }, words: [w(1), w(2), w(3)] });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await openTab(tree, 'dict');
    await openTab(tree, 'cards');
    expect(events('widget_tip')).toEqual([{ action: 'shown' }]);
    await run(() => one(tree, FlashcardsScreen).props.onHideWidgetTip());
    expect(events('widget_tip')).toEqual([{ action: 'shown' }, { action: 'hide' }]);
  });

  test('the settings switch turns it off now and on the next launch', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'settings');
    const settings = () => one(tree, SettingsScreen);
    expect(settings().props).toMatchObject({ analyticsAvailable: true, analyticsOn: true });
    await run(() => settings().props.onToggleAnalytics(false));
    expect(ph().optOut).toHaveBeenCalledTimes(1);
    expect(settings().props.analyticsOn).toBe(false);
    expect((await stored('ll_settings_v1')).analytics).toBe(false);
    ph().capture.mockClear();
    await run(() => settings().props.onOpenPaywall());
    expect(ph().capture).not.toHaveBeenCalled();

    // наступний запуск із вимкненою статистикою: нічого не йде (що клієнта
    // тоді не створюємо зовсім, перевіряє analytics.test.js)
    await act(async () => mounted.pop().unmount());
    const again = await renderApp();
    ph().capture.mockClear();
    ph().register.mockClear();
    await openTab(again, 'settings');
    expect(one(again, SettingsScreen).props.analyticsOn).toBe(false);
    await run(() => one(again, SettingsScreen).props.onOpenPaywall());
    expect(ph().capture).not.toHaveBeenCalled();
    expect(ph().register).not.toHaveBeenCalled();
  });
});
