// Нативних модулів у jest немає — підставляємо офіційні заглушки.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-audio у jest не має нативного модуля; нам потрібен лише режим звуку.
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => {}) }));

// Sign in with Apple: у jest нативного модуля немає. Тести, яким потрібна
// поведінка, перевизначають signInAsync/isAvailableAsync через mockResolvedValue.
jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  return {
    isAvailableAsync: jest.fn(async () => true),
    signInAsync: jest.fn(async () => {
      throw Object.assign(new Error('not mocked'), { code: 'ERR_REQUEST_UNKNOWN' });
    }),
    signOutAsync: jest.fn(async () => {}),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: (props) => React.createElement('AppleAuthenticationButton', props),
  };
});

// Віджет головного екрана (expo-widgets): нативний модуль є лише в iOS-збірці.
// createWidget повертає об'єкт із тими самими методами, що й справжній.
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({
    updateTimeline: jest.fn(),
    updateSnapshot: jest.fn(),
    reload: jest.fn(),
    getTimeline: jest.fn(async () => []),
  })),
  addUserInteractionListener: jest.fn(() => ({ remove() {} })),
  widgetsDirectory: null,
}));

// @expo/ui — нативні SwiftUI-компоненти, і в застосунку їх імпортує лише
// розмітка віджета, яку babel-плагін expo-widgets однаково перетворює на
// рядок. Справжній пакет у jest — це ~4 с трансформації на холодному кеші,
// і платив би їх перший тест, що рендерить App (лінивий require віджета):
// на CI він вилітав за 5-секундний ліміт і тягнув за собою решту набору.
// Перевірка, що віджет використовує лише наявні компоненти, бере справжній
// пакет через jest.requireActual (__tests__/widget.test.js).
jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));

// Анонімна статистика (src/analytics.js): нативних модулів PostHog у jest
// немає, а мережі — тим паче. Заглушка повторює методи, якими користується
// обгортка; instances — щоб тести бачили створений клієнт і його виклики.
jest.mock('posthog-react-native', () => {
  const instances = [];
  function PostHog(apiKey, options) {
    this.apiKey = apiKey;
    this.options = options;
    this.capture = jest.fn();
    this.register = jest.fn(async () => {});
    this.optIn = jest.fn(async () => {});
    this.optOut = jest.fn(async () => {});
    this.reset = jest.fn();
    this.identify = jest.fn();
    this.getFeatureFlag = jest.fn(() => undefined);
    this.onFeatureFlags = jest.fn(() => () => {});
    instances.push(this);
  }
  PostHog.instances = instances;
  return { __esModule: true, default: PostHog, PostHog };
});

// Пейвол і Customer Center від RevenueCat (react-native-purchases-ui): нативна
// частина є лише в iOS-збірці. Типово пейвол «закрили без покупки»; тести,
// яким потрібне інше, перевизначають через mockResolvedValueOnce.
jest.mock('react-native-purchases-ui', () => {
  const PAYWALL_RESULT = {
    NOT_PRESENTED: 'NOT_PRESENTED',
    ERROR: 'ERROR',
    CANCELLED: 'CANCELLED',
    PURCHASED: 'PURCHASED',
    RESTORED: 'RESTORED',
  };
  const RevenueCatUI = {
    PAYWALL_RESULT,
    presentPaywall: jest.fn(async () => PAYWALL_RESULT.CANCELLED),
    presentPaywallIfNeeded: jest.fn(async () => PAYWALL_RESULT.NOT_PRESENTED),
    presentCustomerCenter: jest.fn(async () => {}),
  };
  return { __esModule: true, default: RevenueCatUI, PAYWALL_RESULT };
});

// Мови телефону (expo-localization). Типово — en-US, як в офіційній заглушці.
// Тест задає свої: require('expo-localization').__setLocales(['ru-RU', 'uk-UA'])
// — так, ніби людина змінила мову (Android і веб кажуть про це подією, яку
// чує useLocales). { silent: true } — без події: нову мову тоді бачить лише
// той, хто перечитає getLocales (повернення з фону, див. src/locale.js).
jest.mock('expo-localization', () => {
  const React = require('react');
  const actual = jest.requireActual('expo-localization');
  const base = actual.getLocales()[0];
  let tags = ['en-US'];
  const listeners = new Set();
  const getLocales = () =>
    tags.map((tag) => {
      const [code, region = null] = tag.split('-');
      return { ...base, languageTag: tag, languageCode: code.toLowerCase(), regionCode: region, languageRegionCode: region };
    });
  function useLocales() {
    // як справжній: перечитує мови лише після події
    const [key, bump] = React.useReducer((n) => n + 1, 0);
    React.useEffect(() => {
      listeners.add(bump);
      return () => listeners.delete(bump);
    }, []);
    return React.useMemo(getLocales, [key]);
  }
  return {
    ...actual,
    getLocales,
    useLocales,
    __setLocales(next, { silent = false } = {}) {
      tags = next;
      if (!silent) listeners.forEach((fn) => fn());
    },
  };
});
