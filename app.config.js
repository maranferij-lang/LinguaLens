// Конфіг лежить в app.json; цей файл лише прибирає «Вхід через Apple» для
// локальної збірки в симулятор (npm run sim, SETUP_MAC.md, варіант В).
//
// `expo run:ios` вимагає сертифікат розробника навіть для симулятора, щойно в
// entitlements є com.apple.developer.applesignin, — і падає з «No code
// signing certificates are available». Без цього права симулятор збирається
// без жодного акаунта Apple; кнопка Apple в Параметрах тоді покаже помилку
// входу, решта застосунку працює як завжди. EAS і звичайний prebuild
// LL_SIMULATOR не ставлять — там конфіг рівно той, що в app.json.
//
// Право додає плагін expo-apple-authentication, і Expo вмикає його сам, навіть
// без запису в plugins. Плагін одноразовий (createRunOncePlugin): позначка в
// історії плагінів каже Expo, що він уже відпрацював, і той його пропускає.
const APPLE_AUTH = 'expo-apple-authentication';

module.exports = ({ config }) => {
  if (process.env.LL_SIMULATOR !== '1') return config;
  const internal = config._internal || {};
  return {
    ...config,
    ios: { ...config.ios, usesAppleSignIn: false },
    _internal: {
      ...internal,
      pluginHistory: { ...internal.pluginHistory, [APPLE_AUTH]: { name: APPLE_AUTH, version: 'skipped-for-simulator' } },
    },
  };
};
