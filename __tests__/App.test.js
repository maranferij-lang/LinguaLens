// Димовий тест: застосунок стартує офлайн, читає збережені дані й показує
// головний екран без падінь. Ловить те, що інакше видно лише на пристрої:
// неіснуючі імпорти, падіння рендеру, хуки в неправильному порядку.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import DictionaryScreen from '../src/DictionaryScreen';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
import ProfileScreen from '../src/ProfileScreen';
import ShareSheet from '../src/share/ShareSheet';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

// Тут рендериться весь застосунок. Перший рендер на холодному кеші CI
// (2 ядра, кілька наборів паралельно) займає секунди, і стандартних 5 с
// не вистачало: тест, що вилетів за ліміт, лишав дерево змонтованим, і
// падали всі наступні. Логіка тестів від ліміту не залежить.
jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  // телефон англійською (див. заглушку expo-localization у jest.setup.js)
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
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
  // кілька тиків: читання сховища, шрифти, спроба мережі
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

const texts = (tree) =>
  tree.root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children);

test('first launch shows onboarding', async () => {
  const tree = await renderApp();
  expect(texts(tree).length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

test('returning user lands on the main screen with the tab bar, offline', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  await AsyncStorage.setItem(
    'll_words_v1',
    JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } }])
  );
  const tree = await renderApp();
  const all = texts(tree);
  expect(all).toEqual(expect.arrayContaining(['Words', 'Learn', 'Settings']));
  await act(async () => tree.unmount());
});

// ---------- сценарії, які видно лише в зв'язці App + екрани ----------
// Екрани тут не «тапаємо», а викликаємо їхні колбеки: так перевіряється саме
// логіка App (ліміти, пейвол, відкладені слова й тости), без камери й жестів.

const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const word = (i, lang = 'es') => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang, addedAt: Date.now(), srs: { box: 0, due: 0 } });
const words100 = () => Array.from({ length: 100 }, (_, i) => word(i));

async function returning({ settings = { nativeLang: 'en', targetLang: 'es' }, words = [], seen = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(settings));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(seen));
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

test('fresh install on an English phone learns Spanish, not English → English', async () => {
  const tree = await renderApp();
  await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
  expect(await stored('ll_settings_v1')).toMatchObject({ nativeLang: 'en', targetLang: 'es', wodEnabled: false });
  await act(async () => tree.unmount());
});

test('skipping a replayed intro keeps word-of-day reminders on', async () => {
  await returning({ settings: { nativeLang: 'en', targetLang: 'es', wodEnabled: true } });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onReplayOnb());
  await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.wodEnabled).toBe(true);
  expect((await stored('ll_settings_v1')).wodEnabled).toBe(true);
  await act(async () => tree.unmount());
});

test('choosing the learned language as native cannot bypass the one-language limit', async () => {
  await returning({ settings: { nativeLang: 'uk', targetLang: 'en' }, words: [word(1, 'en')], seen: ALL_ACH });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onSetNative('en'));
  expect(one(tree, PaywallScreen).props.reason).toBe('langs');
  expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'uk', targetLang: 'en' });
  await act(async () => tree.unmount());
});

test('with no words yet, the same choice just swaps the languages', async () => {
  await returning({ settings: { nativeLang: 'uk', targetLang: 'en' } });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onSetNative('en'));
  expect(one(tree, PaywallScreen)).toBeNull();
  expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'en', targetLang: 'uk' });
  await act(async () => tree.unmount());
});

// v1.2: словник безкоштовний без меж — сотий і сто перший слова
// зберігаються так само, як перше, і пейвол «словник заповнено» не з'являється.
test('the free dictionary has no ceiling', async () => {
  await returning({ words: words100(), seen: ALL_ACH });
  const tree = await renderApp();
  const saved = await run(() => one(tree, ScannerScreen).props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
  expect(saved).toBe(true);
  expect(one(tree, PaywallScreen)).toBeNull();
  const ws = await stored('ll_words_v1');
  expect(ws).toHaveLength(101);
  expect(ws[100].word).toBe('la taza');
  await act(async () => tree.unmount());
});

test('an achievement unlocked from the scan result waits until the sheet closes', async () => {
  await returning();
  const tree = await renderApp();
  const scanner = () => one(tree, ScannerScreen);
  await run(() => scanner().props.onResultVisible(true));
  await run(() => scanner().props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
  expect(one(tree, AchievementToast).props.achievement).toBeNull();
  await run(() => scanner().props.onResultVisible(false));
  expect(one(tree, AchievementToast).props.achievement).not.toBeNull();
  await act(async () => tree.unmount());
});

describe('word of the day', () => {
  const wodFor = (lang, native, w = 'la manzana') => ({ lang, native, words: [{ date: localDayKey(), word: w, translation: 'apple' }] });

  test('a cached word from another language pair is not shown', async () => {
    await returning({ wod: wodFor('fr', 'en', 'la pomme') });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, FlashcardsScreen).props.wordOfDay).toBeNull();
    await act(async () => tree.unmount());
  });

  test('is saved in its own language and counted once', async () => {
    await returning({ wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    expect((await stored('ll_words_v1')).map((w) => [w.word, w.lang, w.nativeLang])).toEqual([['la manzana', 'es', 'en']]);
    expect((await stored('ll_stats_v1')).wordOfDaySeen).toBe(1);
    await act(async () => tree.unmount());
  });

  // Віджет: заглушка expo-widgets із jest.setup.js; таймлайн — останній виклик.
  const lastTimeline = () => {
    // віджетів три (v1.3) — беремо саме «Слово дня»
    const calls = require('expo-widgets').__widgets.WordOfDay.updateTimeline.mock.calls;
    return calls.at(-1)[0];
  };

  test('the home-screen widget gets the cached word and speaks the phone language, not “my language”', async () => {
    await returning({ wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    expect(lastTimeline()[0].props).toMatchObject({ state: 'word', word: 'la manzana', caption: 'Español · word of the day' });
    // переклади тепер німецькою, а вчимо далі іспанську — кеш пари es→en не
    // годиться; підписи ж лишаються мовою телефону, тобто англійською
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onSetNative('de'));
    expect(lastTimeline()[0].props).toMatchObject({ state: 'empty', message: 'Open LinguaLens for new words' });
    // а телефон перейшов на німецьку — віджет за ним
    await run(() => require('expo-localization').__setLocales(['de-DE']));
    expect(lastTimeline()[0].props).toMatchObject({ state: 'empty', message: 'Öffne LinguaLens für neue Wörter' });
    await act(async () => tree.unmount());
  });

  test('a widget tap opens the Learn tab, on a cold start and while running', async () => {
    const { Linking } = require('react-native');
    await returning({ wod: wodFor('es', 'en') });
    Linking.getInitialURL.mockResolvedValueOnce('lingualens://word-of-day');
    const cold = await renderApp();
    expect(one(cold, FlashcardsScreen)).not.toBeNull();
    await act(async () => cold.unmount());

    const warm = await renderApp();
    expect(one(warm, FlashcardsScreen)).toBeNull();
    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await run(() => onUrl({ url: 'lingualens://word-of-day' }));
    expect(one(warm, FlashcardsScreen)).not.toBeNull();
    await act(async () => warm.unmount());
  });

  test('a widget tap with a session fetches fresh words if the cache ran dry while asleep', async () => {
    const { Linking } = require('react-native');
    await returning();
    serve((u, method) => {
      if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
      if (u.pathname === '/me') return reply(200, { user: { id: 'u' }, usage: { day: localDayKey(), scans: 0, limit: 5 } });
      if (u.pathname === '/word-of-day') return reply(503, { error: 'busy' });
    });
    const tree = await renderApp();
    const wodCalls = () => global.fetch.mock.calls.filter(([url]) => new URL(url).pathname === '/word-of-day').length;
    expect(wodCalls()).toBe(1);
    const onUrl = Linking.addEventListener.mock.calls.filter(([type]) => type === 'url').at(-1)[1];
    await run(() => onUrl({ url: 'lingualens://word-of-day' }));
    expect(wodCalls()).toBe(2);
    await act(async () => tree.unmount());
  });

  test('saving it with a full hundred words still counts — there is no cap', async () => {
    await returning({ words: words100(), wod: wodFor('es', 'en'), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onSaveWod());
    expect(one(tree, PaywallScreen)).toBeNull();
    expect((await stored('ll_stats_v1')).wordOfDaySeen).toBe(1);
    expect(await stored('ll_words_v1')).toHaveLength(101);
    await act(async () => tree.unmount());
  });
});

// 401 UNAUTHORIZED — сервер забув пристрій: нова ідентичність. 403 APP_TOKEN —
// проблема збірки: ідентичність лишається.
test.each([
  [403, 'APP_TOKEN', 1],
  [401, 'UNAUTHORIZED', 2],
])('GET /me answering %i %s creates %i device identity(ies)', async (status, error, creations) => {
  await returning();
  global.fetch = jest.fn(async (url, { method }) => {
    const path = new URL(url).pathname;
    const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
    if (method === 'POST' && path === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (path === '/me') return reply(status, { error });
    throw new TypeError('Network request failed');
  });
  const tree = await renderApp();
  const created = global.fetch.mock.calls.filter(([url, { method }]) => method === 'POST' && new URL(url).pathname === '/auth/device');
  expect(created).toHaveLength(creations);
  await act(async () => tree.unmount());
});

// ---------- ліміт сканів із сервера ----------
const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
function serve(route) {
  global.fetch = jest.fn(async (url, init) => {
    const r = route(new URL(url), init?.method || 'GET');
    if (!r) throw new TypeError('Network request failed');
    return r;
  });
}

test('the scan ceiling comes from the server, not the hard-coded five', async () => {
  await returning();
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u' }, pro: { active: false }, usage: { day: localDayKey(), scans: 7, limit: 1000 } });
  });
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(993);
  expect(one(tree, ScannerScreen).props.onGuardScan()).toBe(true);
  expect(await stored('ll_usage_v1')).toMatchObject({ scans: 7, limit: 1000 });
  await act(async () => tree.unmount());
});

test('without Pro a 402 opens the paywall with the server’s limit', async () => {
  await returning();
  const tree = await renderApp();
  const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 3, limit: 3 }));
  expect(retry).toBe(false);
  expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'scans', freeScans: 3, scansLeft: 0 });
  // лічильник за все життя — без дня, який міг би його «обнулити»
  expect(await stored('ll_usage_v1')).toEqual({ scans: 3, limit: 3 });
  await act(async () => tree.unmount());
});

// v1.3: безкоштовний скан — один на все життя. Лічильник, збережений
// колись раніше, блокує й сьогодні, навіть офлайн, поки сервер мовчить.
test('a free scan used on an earlier day still blocks today: the paywall, and no “tomorrow”', async () => {
  await returning({ seen: ALL_ACH });
  await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ day: '2000-01-01', scans: 1, limit: 1 }));
  const tree = await renderApp();
  // без сканів застосунок відкривається на навчанні — сканер на своїй вкладці
  expect(one(tree, ScannerScreen)).toBeNull();
  await openTab(tree, 'scan');
  const scanner = () => one(tree, ScannerScreen);
  expect(scanner().props.scansLeft).toBe(0);
  let allowed;
  await run(() => (allowed = scanner().props.onGuardScan('object')));
  expect(allowed).toBe(false);
  expect(one(tree, PaywallScreen).props).toMatchObject({ reason: 'scans', freeScans: 1, scansLeft: 0 });
  const all = texts(tree);
  expect(all).toContain('You’ve used your free scan');
  expect(all).toContain('Scans in total');
  expect(all.some((s) => /today|tomorrow|a day|per day/i.test(s))).toBe(false);
  await act(async () => tree.unmount());
});

test('the server’s lifetime count from /me replaces the cache and is kept without a day', async () => {
  await returning();
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't', user: { id: 'u', createdAt: 1 } });
    if (u.pathname === '/me')
      return reply(200, { user: { id: 'u' }, pro: { active: false }, usage: { day: localDayKey(), scans: 1, limit: 1, scenes: 0, sceneLimit: 1, period: 'lifetime' } });
  });
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(0);
  expect(await stored('ll_usage_v1')).toEqual({ scans: 1, limit: 1, scenes: 0, sceneLimit: 1 });
  await act(async () => tree.unmount());
});

// «Стерти мої дані»: /me для нового запису питаємо одразу. Сервер, що не дав
// carry (див. наступний тест), заводить запис із нуля — екран показує його.
test('after “erase all my data” the new record’s counter is asked for at once', async () => {
  await returning({ seen: ALL_ACH });
  let records = 0;
  const meCalls = [];
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') {
      records++;
      return reply(200, { token: 't' + records, user: { id: 'u' + records, createdAt: 1 } });
    }
    if (u.pathname === '/me' && method === 'DELETE') return reply(200, { ok: true });
    if (u.pathname === '/me') {
      meCalls.push(records);
      const used = records === 1 ? 1 : 0;
      return reply(200, { user: { id: 'u' + records, apple: false }, pro: { active: false }, usage: { day: localDayKey(), scans: used, limit: 1, scenes: used, sceneLimit: 1 } });
    }
  });
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(0);
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onEraseEverything());
  expect(records).toBe(2);
  expect(meCalls).toContain(2);
  await openTab(tree, 'scan');
  expect(one(tree, ScannerScreen).props).toMatchObject({ scansLeft: 1, sceneLocked: false });
  expect(await stored('ll_usage_v1')).toEqual({ scans: 0, limit: 1, scenes: 0, sceneLimit: 1 });
  await act(async () => tree.unmount());
});

// Стирання нового безкоштовного скану не дає: DELETE /me віддає carry, нова
// ідентичність його несе, а екран не обнуляє лічильник — навіть коли /me
// після стирання не відповів.
test('after “erase all my data” the counters carry over and the screen does not promise a new free scan', async () => {
  await returning({ seen: ALL_ACH });
  let records = 0;
  serve((u, method) => {
    if (method === 'POST' && u.pathname === '/auth/device') {
      records++;
      return reply(200, { token: 't' + records, user: { id: 'u' + records, createdAt: 1 } });
    }
    if (u.pathname === '/me' && method === 'DELETE') return reply(200, { ok: true, carry: 'carry-1' });
    if (u.pathname === '/me' && records === 1)
      return reply(200, { user: { id: 'u1', apple: false }, pro: { active: false }, usage: { day: localDayKey(), scans: 1, limit: 1, scenes: 1, sceneLimit: 1 } });
    return null; // /me нового запису не відповідає
  });
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(0);
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onEraseEverything());
  expect(records).toBe(2);
  const bodies = global.fetch.mock.calls
    .filter(([url, init]) => init?.method === 'POST' && new URL(url).pathname === '/auth/device')
    .map(([, init]) => JSON.parse(init.body));
  expect(bodies).toEqual([{}, { previous: 'carry-1' }]);
  await openTab(tree, 'scan');
  expect(one(tree, ScannerScreen).props.scansLeft).toBe(0);
  expect(await stored('ll_usage_v1')).toEqual({ scans: 1, limit: 1, scenes: 1, sceneLimit: 1 });
  await act(async () => tree.unmount());
});

test('a 402 right after buying Pro makes the server re-check instead of showing the paywall', async () => {
  await returning();
  let webhookLanded = false;
  serve((u) => {
    if (u.pathname !== '/me') return null;
    const limit = webhookLanded ? null : 5;
    return reply(200, { user: { id: 'u' }, pro: { active: limit === null }, usage: { day: localDayKey(), scans: 5, limit } });
  });
  const tree = await renderApp();
  await openTab(tree, 'settings');
  await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
  await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
  await openTab(tree, 'scan');

  webhookLanded = true; // сервер дізнається, щойно перепитає RevenueCat
  global.fetch.mockClear();
  const retry = await run(() => one(tree, ScannerScreen).props.onLimitReached({ error: 'SCAN_LIMIT', used: 5, limit: 5 }));
  expect(retry).toBe(true);
  expect(one(tree, PaywallScreen)).toBeNull();
  expect(global.fetch.mock.calls.map(([url]) => new URL(url).search)).toContain('?refresh=1');
  await act(async () => tree.unmount());
});

// ---------- картки «поділитись» ----------
const openShare = (tree) => tree.root.findAllByType(ShareSheet).find((x) => x.props.visible)?.props.payload;

test('an achievement is “fresh” only from the toast, not from the profile', async () => {
  await returning();
  const tree = await renderApp();
  const a = { id: 'first_word', tier: 1, goal: 1, metric: 'words' };
  await run(() => one(tree, AchievementToast).props.onPress(a));
  expect(openShare(tree)).toMatchObject({ kind: 'achievement', fresh: true });
  await run(() => one(tree, ShareSheet).props.onClose());

  await openTab(tree, 'profile');
  await run(() => one(tree, ProfileScreen).props.onShareAchievement(a));
  expect(openShare(tree)).toMatchObject({ kind: 'achievement', fresh: false });
  await act(async () => tree.unmount());
});

// v1.3: безкоштовний скан один на все життя — сканувати щодня безкоштовно
// вже не вийде, тож серію тримає навчання: картки, квіз, слово дня.
describe('the streak is kept by learning, not by scanning', () => {
  const longAgo = Date.now() - 60 * 86400000;
  const known = () => [0, 1, 2, 3].map((i) => ({ ...word(i), addedAt: longAgo }));
  const yesterday = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return localDayKey(d);
  };

  test('a finished quiz counts for today: every answer is a review, and the streak goes on', async () => {
    await returning({ words: known(), seen: ALL_ACH });
    await AsyncStorage.setItem('ll_activity_v1', JSON.stringify({ [yesterday()]: 3 }));
    const tree = await renderApp();
    await openTab(tree, 'cards');
    // одна помилка (її одразу пише onMiss → onReview), три правильні — у кінці
    await run(() => one(tree, FlashcardsScreen).props.onReview('w0', false));
    await run(() => one(tree, FlashcardsScreen).props.onQuizDone(false, 3));
    expect((await stored('ll_activity_v1'))[localDayKey()]).toBe(4);
    expect((await stored('ll_stats_v1')).quizzes).toBe(1);

    await openTab(tree, 'profile');
    const all = texts(tree);
    expect(all).toContain('2 days in a row');
    expect(all).toContain('Keep it up — review your words every day.');
    // картка «Мій тиждень»: нових слів немає, а повторення — і вчора, і сьогодні
    await run(() => one(tree, ProfileScreen).props.onShareWeek());
    expect(openShare(tree).stats).toMatchObject({ streak: 2, weekWords: 0, reviews: 7 });
    await act(async () => tree.unmount());
  });

  test('a flashcards session alone starts a streak', async () => {
    await returning({ words: known(), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'profile');
    expect(texts(tree)).toContain('Review your cards or save the word of the day to start a streak.');
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onReview('w1', true));
    await run(() => one(tree, FlashcardsScreen).props.onReview('w2', true));
    expect((await stored('ll_activity_v1'))[localDayKey()]).toBe(2);
    await openTab(tree, 'profile');
    expect(texts(tree)).toContain('1 day in a row');
    await act(async () => tree.unmount());
  });

  test('a quiz with no right answers adds no empty day of its own', async () => {
    await returning({ words: known(), seen: ALL_ACH });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onQuizDone(false, 0));
    expect((await stored('ll_activity_v1')) || {}).toEqual({});
    expect((await stored('ll_stats_v1')).quizzes).toBe(1);
    await act(async () => tree.unmount());
  });
});

test('the week card counts this week, not a lifetime of reviews', async () => {
  const longAgo = Date.now() - 60 * 86400000;
  const veteran = Array.from({ length: 5 }, (_, i) => ({ ...word(i, 'fr'), addedAt: longAgo, srs: { box: 3, due: 0, reps: 40 } }));
  await returning({ words: veteran, seen: ALL_ACH });
  const tree = await renderApp();
  await openTab(tree, 'profile');
  await run(() => one(tree, ProfileScreen).props.onShareWeek());
  expect(openShare(tree).stats).toMatchObject({ words: 5, weekWords: 0, reviews: 0, langs: [] });
  await act(async () => tree.unmount());
});

// ---------- сцени ----------
const sceneWord = (w) => ({ word: w, translation: 't', lang: 'es', nativeLang: 'en', photo: null, shape: null, sceneId: 'sc' });

test('scene words: every new one is saved, even past a hundred', async () => {
  await returning({ words: words100().slice(0, 98), seen: ALL_ACH });
  const tree = await renderApp();
  const list = ['w1', 'la taza', 'el libro', 'la lámpara', 'la planta'].map(sceneWord); // w1 вже є
  const saved = await run(() => one(tree, ScannerScreen).props.onSaveWords(list));
  expect(saved).toBe(4);
  expect(one(tree, PaywallScreen)).toBeNull();
  const ws = await stored('ll_words_v1');
  expect(ws.map((w) => w.word).slice(98)).toEqual(['la taza', 'el libro', 'la lámpara', 'la planta']);
  expect(ws.every((w) => w.srs && w.addedAt)).toBe(true);
  await act(async () => tree.unmount());
});

test('scene words already in the list are skipped and every new one counts as activity', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  const tree = await renderApp();
  const saved = await run(() => one(tree, ScannerScreen).props.onSaveWords(['w1', 'la taza', 'La Taza', 'el libro'].map(sceneWord)));
  expect(saved).toBe(2);
  expect(one(tree, PaywallScreen)).toBeNull();
  const ws = await stored('ll_words_v1');
  expect(ws.map((w) => [w.word, w.sceneId])).toEqual([['w1', undefined], ['la taza', 'sc'], ['el libro', 'sc']]);
  expect((await stored('ll_activity_v1'))[localDayKey()]).toBe(2);
  await act(async () => tree.unmount());
});

test('a scene lands in history, counts for achievements and shows up in the dictionary', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  const tree = await renderApp();
  const scene = {
    id: 'sc1',
    image: 'file:///cache/sc1.jpg',
    width: 1080,
    height: 1920,
    lang: 'es',
    nativeLang: 'en',
    createdAt: 1,
    objects: [{ key: 'o0', word: 'la taza', translation: 'mug', box: [1, 2, 300, 400], outline: null }],
    hidden: [],
  };
  const storedScene = await run(() => one(tree, ScannerScreen).props.onSceneScanned(scene));
  expect(storedScene.id).toBe('sc1');
  expect((await stored('ll_scenes_v1')).map((s) => s.id)).toEqual(['sc1']);
  expect((await stored('ll_stats_v1')).scenes).toBe(1);

  await run(() => one(tree, ScannerScreen).props.onUpdateScene('sc1', { hidden: ['o0'] }));
  expect((await stored('ll_scenes_v1'))[0].hidden).toEqual(['o0']);

  await openTab(tree, 'dict');
  const dict = one(tree, DictionaryScreen);
  expect(dict.props.scenes.map((s) => s.id)).toEqual(['sc1']);
  await run(() => dict.props.onDeleteScene('sc1'));
  expect(await stored('ll_scenes_v1')).toEqual([]);
  await act(async () => tree.unmount());
});

test('“delete all words” takes the scenes with it', async () => {
  await returning({ words: [word(1)], seen: ALL_ACH });
  await AsyncStorage.setItem('ll_scenes_v1', JSON.stringify([{ id: 'a', image: 'file:///x.jpg', objects: [] }]));
  const tree = await renderApp();
  await openTab(tree, 'settings');
  expect(one(tree, SettingsScreen).props.scenesCount).toBe(1);
  await run(() => one(tree, SettingsScreen).props.onClearAll());
  expect(await AsyncStorage.getItem('ll_scenes_v1')).toBeNull();
  expect(one(tree, SettingsScreen).props.scenesCount).toBe(0);
  await act(async () => tree.unmount());
});

test('the scanner mode is remembered between launches', async () => {
  await returning();
  const tree = await renderApp();
  expect(one(tree, ScannerScreen).props.scanMode).toBe('object');
  await run(() => one(tree, ScannerScreen).props.onScanModeChange('scene'));
  expect(one(tree, ScannerScreen).props.scanMode).toBe('scene');
  expect((await stored('ll_settings_v1')).scanMode).toBe('scene');
  await act(async () => tree.unmount());
});
