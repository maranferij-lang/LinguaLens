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

// Віджети головного екрана (expo-widgets): нативний модуль є лише в
// iOS-збірці. createWidget повертає об'єкт із тими самими методами, що й
// справжній, і пам'ятає таймлайн: getTimeline віддає те, що записав
// updateTimeline / updateSnapshot (дати — Date, як у справжнього).
// Ім'я віджета мусить бути в app.json — інакше розширення його не знає, і
// заглушка кидає помилку, як друкарську.
// Помічники для тестів (поза справжнім API):
//   __widgets[name]            — останній віджет із цим ім'ям;
//   __timeline(name)           — його записи (або null);
//   __interact(name, i, patch) — дотик у віджеті змінив props запису i, як
//                                кнопка «Переклад» (onPress → нові props);
//   __reset()                  — забути всі віджети.
jest.mock('expo-widgets', () => {
  const NAMES = require('./app.json')
    .expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-widgets')[1]
    .widgets.map((w) => w.name);
  const widgets = {};
  const copy = (list) => list.map((e) => ({ date: new Date(e.date), props: { ...e.props } }));
  function createWidget(name) {
    if (!NAMES.includes(name)) throw new Error(`expo-widgets (jest): widget "${name}" is not in app.json (${NAMES.join(', ')})`);
    let entries = [];
    const widget = {
      updateTimeline: jest.fn((list) => {
        entries = copy(list || []);
      }),
      updateSnapshot: jest.fn((props) => {
        entries = [{ date: new Date(), props: { ...props } }];
      }),
      reload: jest.fn(),
      getTimeline: jest.fn(async () => copy(entries)),
      __entries: () => entries,
    };
    widgets[name] = widget;
    return widget;
  }
  return {
    createWidget: jest.fn(createWidget),
    addUserInteractionListener: jest.fn(() => ({ remove() {} })),
    widgetsDirectory: 'file:///group/ExpoWidgets/',
    __widgets: widgets,
    __timeline: (name) => (widgets[name] ? copy(widgets[name].__entries()) : null),
    __interact(name, i, patch) {
      const e = widgets[name]?.__entries()[i];
      if (e) e.props = { ...e.props, ...patch };
    },
    __reset() {
      for (const k of Object.keys(widgets)) delete widgets[k];
    },
  };
});

// ── v1.3: нові нативні пакети (план §5.16) ──

// Які нативні модулі «є» в цій збірці. requireOptionalNativeModule з 'expo'
// для модулів v1.3 (ExpoClipboard, ExpoMediaLibraryNext, ExponentImagePicker
// — імена з ios/*Module.swift — і нашого InstagramStories) повертає лише те,
// що тест сам «встановив»; типово — нічого, як в Expo Go чи в старій
// dev-збірці до перезбирання: нові кнопки там ховаються. Решта імен
// (ExpoHaptics тощо) — як і раніше, із заглушок jest-expo.
//   nativeModules.set('ExpoClipboard')            — модуль є (порожній об'єкт)
//   nativeModules.set('InstagramStories', nativeModules.instagramStories())
//   nativeModules.set('ExpoWidgets', {})           — будь-яке інше ім'я теж
//   nativeModules.delete(name) / reset()           — знову немає
// Модуль, що читає requireOptionalNativeModule при імпорті
// (modules/instagram-stories), бачить мапу на момент require: «встановіть»
// модуль до нього (jest.isolateModules або require після set).
global.nativeModules = {
  map: new Map(),
  managed: new Set(['ExpoClipboard', 'ExpoMediaLibraryNext', 'ExponentImagePicker', 'InstagramStories']),
  set(name, impl = {}) {
    this.managed.add(name);
    this.map.set(name, impl);
    return impl;
  },
  delete(name) {
    this.map.delete(name);
  },
  reset() {
    this.map.clear();
  },
  get(name) {
    return this.map.has(name) ? this.map.get(name) : null;
  },
  resolve(name, fallback) {
    if (this.map.has(name)) return this.map.get(name);
    return this.managed.has(name) ? null : fallback(name);
  },
  // InstagramStories з copyPng (наліпка PNG з альфою в буфер, план S20)
  instagramStories: () => ({
    isAvailable: jest.fn(async () => true),
    share: jest.fn(async () => true),
    copyPng: jest.fn(async () => true),
  }),
};
jest.mock('expo', () => {
  const actual = jest.requireActual('expo');
  return {
    ...actual,
    __esModule: true,
    requireOptionalNativeModule: jest.fn((name) => global.nativeModules.resolve(name, actual.requireOptionalNativeModule)),
  };
});

// Буфер обміну (expo-clipboard): пам'ятає останню картинку й рядок.
jest.mock('expo-clipboard', () => {
  const state = { image: null, text: '' };
  return {
    setImageAsync: jest.fn(async (base64) => {
      state.image = base64;
    }),
    hasImageAsync: jest.fn(async () => !!state.image),
    getImageAsync: jest.fn(async () => (state.image ? { data: 'data:image/png;base64,' + state.image, size: { width: 0, height: 0 } } : null)),
    setStringAsync: jest.fn(async (text) => {
      state.text = String(text);
      return true;
    }),
    getStringAsync: jest.fn(async () => state.text),
    hasStringAsync: jest.fn(async () => !!state.text),
  };
});

// «Фото» (expo-media-library, «next» API SDK 57). Типово: дозволу ще не
// питали, запит його дає, Asset.create кладе файл у бібліотеку. Тест
// перевизначає через mockResolvedValueOnce (відмова, помилка).
jest.mock('expo-media-library', () => {
  const answer = (status) => ({ status, granted: status === 'granted', canAskAgain: status !== 'denied', expires: 'never', accessPrivileges: status === 'granted' ? 'all' : 'none' });
  return {
    PermissionStatus: { GRANTED: 'granted', DENIED: 'denied', UNDETERMINED: 'undetermined' },
    getPermissionsAsync: jest.fn(async () => answer('undetermined')),
    requestPermissionsAsync: jest.fn(async () => answer('granted')),
    Asset: { create: jest.fn(async (filePath) => ({ id: 'mock-asset-1', uri: filePath })) },
  };
});

// Вибір фото (expo-image-picker): типово людина закрила вікно, нічого не
// обравши. Фото — через mockResolvedValueOnce({ canceled: false, assets: [...] }).
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(async () => ({ canceled: true, assets: null })),
  getMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' })),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true, canAskAgain: true, expires: 'never' })),
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
