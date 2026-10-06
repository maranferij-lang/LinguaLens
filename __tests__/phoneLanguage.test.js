// Мова інтерфейсу — завжди мова телефону (src/locale.js → useUiLang), а
// «моя мова» з налаштувань — лише мова перекладів. Тут — у зв'язці з App:
//   • перший кадр онбордингу вже мовою телефону, і вибір «моєї мови» (в
//     онбордингу чи в Параметрах) екранів не перемикає;
//   • [ru, uk] → російська, [uk, ru] → українська (перша, для якої є
//     переклад), [fr] → англійська;
//   • сповіщення слова дня, віджет, пейвол і межа помилок — тією ж мовою;
//   • мова телефону змінилась на ходу — інтерфейс і сповіщення за нею.
// Мови телефону задає заглушка expo-localization із jest.setup.js.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Notifications from 'expo-notifications';
import * as Localization from 'expo-localization';
import App from '../App';
import ErrorBoundary from '../src/ErrorBoundary';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';

// Сповіщення дозволені: слово дня планується одразу
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
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));

// Тут рендериться весь застосунок — див. пояснення в App.test.js.
jest.setTimeout(20000);

const uk = makeT('uk');
const en = makeT('en');
const de = makeT('de');
const ru = makeT('ru');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const phone = (...tags) => Localization.__setLocales(tags, { silent: true });

beforeEach(async () => {
  await AsyncStorage.clear();
  Notifications.scheduleNotificationAsync.mockClear();
  phone('en-US');
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
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

async function returning(settings, extra = []) {
  await AsyncStorage.multiSet([
    ['ll_onboarded_v1', '1'],
    ['ll_settings_v1', JSON.stringify(settings)],
    ['ll_words_v1', '[]'],
    ...extra,
  ]);
}

const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const tabLabels = (tree) => tree.root.findAll((n) => n.props.tb).map((n) => n.props.t(n.props.tb.label));
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const TABS = (t) => ['tabProfile', 'tabDict', 'tabScan', 'tabLearn', 'tabSettings'].map((k) => t(k));

describe('first launch', () => {
  test('a Ukrainian phone: the very first onboarding frame is Ukrainian', async () => {
    phone('uk-UA');
    const tree = await renderApp();
    expect(texts(tree)).toContain(uk('ob3HookTitle'));
  });

  // Багато хто в Україні тримає телефон російською: тоді й застосунок
  // російською, а не українською «за сусідством»
  test('[ru, uk] → Russian interface (the first we speak); translations in Russian', async () => {
    phone('ru-RU', 'uk-UA');
    const tree = await renderApp();
    expect(texts(tree)).toContain(ru('ob3HookTitle'));
    expect(one(tree, OnboardingScreen).props.uiLang).toBe('ru');
    await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
    expect(await stored('ll_settings_v1')).toMatchObject({ nativeLang: 'ru', targetLang: 'en' });
    expect(tabLabels(tree)).toEqual(TABS(ru));
    expect(TABS(ru)).toEqual(['Профиль', 'Словарь', 'Сканер', 'Учёба', 'Настройки']);
  });

  test('[uk, ru] → Ukrainian interface', async () => {
    phone('uk-UA', 'ru-RU');
    const tree = await renderApp();
    expect(texts(tree)).toContain(uk('ob3HookTitle'));
    await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
    expect(tabLabels(tree)).toEqual(TABS(uk));
  });

  test('a French phone: English interface, French translations', async () => {
    phone('fr-FR');
    const tree = await renderApp();
    expect(texts(tree)).toContain(en('ob3HookTitle'));
    await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false }));
    expect(await stored('ll_settings_v1')).toMatchObject({ nativeLang: 'fr' });
    expect(tabLabels(tree)).toEqual(TABS(en));
  });

  test('“my language” saved in an earlier run does not change the onboarding language', async () => {
    phone('uk-UA');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'de', targetLang: 'en' }));
    const tree = await renderApp();
    expect(one(tree, OnboardingScreen).props.t('obStart')).toBe(uk('obStart'));
    expect(texts(tree)).toContain(uk('ob3HookTitle'));
  });
});

describe('a returning user', () => {
  test('a Ukrainian phone with English translations: the app is Ukrainian', async () => {
    phone('uk-UA');
    await returning({ nativeLang: 'en', targetLang: 'es' });
    const tree = await renderApp();
    expect(tabLabels(tree)).toEqual(TABS(uk));
    await openTab(tree, 'settings');
    expect(texts(tree)).toContain(uk('setTitle'));
    expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'en', uiLang: 'uk' });
  });

  test('picking another “my language” in Settings changes translations, not the interface', async () => {
    phone('uk-UA');
    await returning({ nativeLang: 'uk', targetLang: 'en' });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    for (const code of ['de', 'pl', 'en']) {
      await run(() => one(tree, SettingsScreen).props.onSetNative(code));
      expect((await stored('ll_settings_v1')).nativeLang).toBe(code);
      expect(tabLabels(tree)).toEqual(TABS(uk));
      expect(one(tree, SettingsScreen).props.t('setTitle')).toBe(uk('setTitle'));
    }
  });

  test('a Russian phone with Ukrainian translations: the app and the paywall are Russian', async () => {
    phone('ru-RU');
    await returning({ nativeLang: 'uk', targetLang: 'en' });
    const tree = await renderApp();
    expect(tabLabels(tree)).toEqual(TABS(ru));
    await openTab(tree, 'settings');
    expect(texts(tree)).toContain(ru('setTitle'));
    expect(one(tree, SettingsScreen).props).toMatchObject({ nativeLang: 'uk', uiLang: 'ru' });
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen).props).toMatchObject({ lang: 'ru' });
    expect(one(tree, PaywallScreen).props.t('pwTitle')).toBe('Сними ограничения');
  });

  test('the paywall dates follow the interface, not “my language”', async () => {
    phone('uk-UA');
    await returning({ nativeLang: 'de', targetLang: 'en' });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen).props).toMatchObject({ lang: 'uk' });
    expect(one(tree, PaywallScreen).props.t('pwTitle')).toBe(uk('pwTitle'));
  });
});

// Слово дня: тема в заголовку сповіщення («Фінанси · liquidity») і підписи
// віджета — мовою інтерфейсу, хоч переклад самого слова — «моєю мовою».
describe('notifications and the widget', () => {
  const day = (i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return localDayKey(d);
  };
  const wod = {
    lang: 'es',
    native: 'en',
    sig: 'general#0:',
    words: [0, 1, 2, 3].map((i) => ({ date: day(i), word: 'liquidez', translation: 'liquidity', example: '', topic: 'finance' })),
  };
  const titles = () =>
    Notifications.scheduleNotificationAsync.mock.calls.map(([n]) => n.content.title).filter((x) => x.includes('liquidez'));
  const lastTimeline = () => {
    // віджетів три (v1.3) — беремо саме «Слово дня»
    return require('expo-widgets').__widgets.WordOfDay.updateTimeline.mock.calls.at(-1)[0];
  };

  test('a Russian phone: the widget caption and the notification titles are Russian', async () => {
    phone('ru-RU', 'uk-UA');
    await returning({ nativeLang: 'en', targetLang: 'es', wodEnabled: true }, [['ll_wod_v1', JSON.stringify(wod)]]);
    const tree = await renderApp();
    expect(lastTimeline()[0].props.caption).toBe('Español · Финансы');
    await openTab(tree, 'settings');
    Notifications.scheduleNotificationAsync.mockClear();
    await run(() => one(tree, SettingsScreen).props.onSetWodHour(18));
    expect(titles().length).toBeGreaterThan(0);
    for (const title of titles()) expect(title).toBe('Финансы · liquidez');
  });

  test('word-of-the-day notifications and the widget speak the phone language', async () => {
    phone('uk-UA');
    await returning({ nativeLang: 'en', targetLang: 'es', wodEnabled: true }, [['ll_wod_v1', JSON.stringify(wod)]]);
    const tree = await renderApp();
    expect(lastTimeline()[0].props).toMatchObject({ state: 'word', word: 'liquidez', caption: 'Español · ' + uk('topic_finance') });
    await openTab(tree, 'settings');
    Notifications.scheduleNotificationAsync.mockClear();
    await run(() => one(tree, SettingsScreen).props.onSetWodHour(18));
    expect(titles().length).toBeGreaterThan(0);
    for (const title of titles()) expect(title).toBe(`${uk('topic_finance')} · liquidez`);
  });

  test('the phone switches language while the app runs: screens, widget and notifications follow', async () => {
    phone('uk-UA');
    await returning({ nativeLang: 'en', targetLang: 'es', wodEnabled: true }, [['ll_wod_v1', JSON.stringify(wod)]]);
    const listenersFrom = AppState.addEventListener.mock.calls.length;
    const tree = await renderApp();
    expect(tabLabels(tree)).toEqual(TABS(uk));

    // Android і веб кажуть про нову мову подією (useLocales)
    Notifications.scheduleNotificationAsync.mockClear();
    await run(() => Localization.__setLocales(['de-DE', 'uk-UA']));
    expect(tabLabels(tree)).toEqual(TABS(de));
    expect(lastTimeline()[0].props.caption).toBe('Español · ' + de('topic_finance'));
    expect(titles().length).toBeGreaterThan(0);
    for (const title of titles()) expect(title).toBe(`${de('topic_finance')} · liquidez`);
    // «моя мова» лишилась, як була
    expect((await stored('ll_settings_v1')).nativeLang).toBe('en');

    // без події — нову мову підхоплює повернення з фону
    phone('fr-FR');
    expect(tabLabels(tree)).toEqual(TABS(de));
    const listeners = AppState.addEventListener.mock.calls
      .slice(listenersFrom)
      .filter(([type]) => type === 'change')
      .map((c) => c[1]);
    await run(() => listeners.forEach((fn) => fn('active')));
    expect(tabLabels(tree)).toEqual(TABS(en));
  });
});

// Межа помилок стоїть над App і не бачить його стану — але мова та сама.
test.each([
  [['uk-UA', 'ru-RU'], 'uk'],
  [['ru-RU', 'uk-UA'], 'ru'],
])('the crash screen speaks the phone language too: %j → %s', async (tags, lang) => {
  const tl = makeT(lang);
  phone(...tags);
  const Boom = () => {
    throw new Error('boom');
  };
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  let tree;
  try {
    await act(async () => {
      tree = create(
        <ErrorBoundary>
          <Boom />
          <Text>never</Text>
        </ErrorBoundary>
      );
    });
  } finally {
    spy.mockRestore();
  }
  expect(texts(tree)).toEqual(expect.arrayContaining([tl('crashTitle'), tl('crashText')]));
  await act(async () => tree.unmount());
});
