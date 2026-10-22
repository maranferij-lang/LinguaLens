// Модулі Expo з вихідного коду (plugins/withSourceModules.js): без цього
// Xcode з новішим Swift, ніж у готових XCFramework, не збирає ExpoModulesCore.
const plugin = require('../plugins/withSourceModules');
const appJson = require('../app.json');

function runMod(props = {}) {
  const config = plugin({ name: 'LinguaLens', slug: 'lingualens' });
  const mod = config.mods.ios.podfileProperties;
  return mod({ ...config, modResults: { ...props }, modRequest: { platform: 'ios' } });
}

test('writes EXPO_USE_PRECOMPILED_MODULES=false into Podfile.properties.json', async () => {
  const out = await runMod({ 'expo.jsEngine': 'hermes' });
  expect(out.modResults).toEqual({ 'expo.jsEngine': 'hermes', EXPO_USE_PRECOMPILED_MODULES: 'false' });
});

test('overrides a true value left by a template', async () => {
  const out = await runMod({ EXPO_USE_PRECOMPILED_MODULES: 'true' });
  expect(out.modResults.EXPO_USE_PRECOMPILED_MODULES).toBe('false');
});

test('is listed in app.json before withSceneLifecycle, which stays last', () => {
  const pl = appJson.expo.plugins;
  expect(pl).toContain('./plugins/withSourceModules');
  expect(pl[pl.length - 1]).toBe('./plugins/withSceneLifecycle');
});
