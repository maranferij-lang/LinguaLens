// Запобіжник production-збірки (scripts/check-release-env.js): EAS запускає
// його як «eas-build-pre-install». Тестовий ключ RevenueCat чи його
// відсутність у production зупиняють збірку; розробку й preview — ні. Прапорець
// симулятора LL_SIMULATOR=1 зупиняє будь-яку збірку EAS.
import { execFileSync } from 'child_process';
import path from 'path';
import pkg from '../package.json';

const { checkReleaseEnv } = require('../scripts/check-release-env');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-release-env.js');

test('production needs a real App Store key', () => {
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_AbC123' })).toEqual({ ok: true });
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production' })).toMatchObject({ ok: false, reason: 'missing' });
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: '   ' })).toMatchObject({ ok: false, reason: 'missing' });
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_abc' })).toMatchObject({ ok: false, reason: 'test-key' });
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: ' rcb_abc' })).toMatchObject({ ok: false, reason: 'test-key' });
});

test('development, preview and local runs are never blocked', () => {
  for (const profile of ['development', 'preview', '', undefined]) {
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_abc' })).toEqual({ ok: true });
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile })).toEqual({ ok: true });
  }
});

// app.config.js прибирає «Вхід через Apple» з LL_SIMULATOR=1 — у хмарну
// збірку цей прапорець потрапити не має в жодному профілі
test('any EAS build with the simulator flag stops; local runs do not', () => {
  for (const profile of ['development', 'preview', 'production']) {
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile, LL_SIMULATOR: '1', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x' })).toMatchObject({ ok: false, reason: 'simulator' });
  }
  expect(checkReleaseEnv({ LL_SIMULATOR: '1' })).toEqual({ ok: true });
  expect(checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', LL_SIMULATOR: '0', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x' })).toEqual({ ok: true });
});

test('the message never prints the whole key', () => {
  const res = checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_SECRETPART' });
  expect(res.message).not.toContain('SECRETPART');
});

test('EAS runs it before installing dependencies, and it fails the build', () => {
  expect(pkg.scripts['eas-build-pre-install']).toBe('node scripts/check-release-env.js');
  const run = (env) => {
    try {
      execFileSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, ...env }, stdio: 'pipe' });
      return 0;
    } catch (e) {
      return e.status;
    }
  };
  expect(run({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_x' })).toBe(1);
  expect(run({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x' })).toBe(0);
  expect(run({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_x' })).toBe(0);
  expect(run({ EAS_BUILD_PROFILE: 'preview', LL_SIMULATOR: '1' })).toBe(1);
});

// purchases-ui вимагає рівно ту саму версію react-native-purchases: розбіжність
// дає збірку, що падає вже на пристрої
test('react-native-purchases and purchases-ui are pinned to the same exact version', () => {
  const core = pkg.dependencies['react-native-purchases'];
  expect(core).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.dependencies['react-native-purchases-ui']).toBe(core);
});
