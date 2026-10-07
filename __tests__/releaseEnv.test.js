// Запобіжник production-збірки (scripts/check-release-env.js): EAS запускає
// його як «eas-build-pre-install». Ключ RevenueCat не з білого списку appl_…
// (тестовий, секретний sk_, чужий, відсутній) і неробоча адреса сервера
// зупиняють збірку; розробку й preview — ні. Бракує пошти підтримки чи
// статистики — лише попередження. Прапорець симулятора LL_SIMULATOR=1
// зупиняє будь-яку збірку EAS.
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import pkg from '../package.json';

const { checkReleaseEnv } = require('../scripts/check-release-env');
const SCRIPT = path.join(__dirname, '..', 'scripts', 'check-release-env.js');

// Повний набір для production: усе гаразд, попереджень немає
const GOOD = {
  EAS_BUILD_PROFILE: 'production',
  EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_AbC123xYz789',
  EXPO_PUBLIC_SERVER_URL: 'https://api.lingualens.example',
  EXPO_PUBLIC_SUPPORT_EMAIL: 'help@lingualens.example',
  EXPO_PUBLIC_POSTHOG_KEY: 'phc_abc',
  EXPO_PUBLIC_FACEBOOK_APP_ID: '123456789',
};
const prod = (over) => ({ ...GOOD, ...over });

test('production needs a real App Store key', () => {
  expect(checkReleaseEnv(GOOD)).toEqual({ ok: true });
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_AbC123' }))).toEqual({ ok: true });
  // пробіли навколо значення EAS не залишає, але trim не шкодить
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: '  appl_AbC123xYz789 ' }))).toEqual({ ok: true });
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: undefined }))).toMatchObject({ ok: false, reason: 'missing' });
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: '   ' }))).toMatchObject({ ok: false, reason: 'missing' });
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_abc' }))).toMatchObject({ ok: false, reason: 'test-key' });
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: ' rcb_abc' }))).toMatchObject({ ok: false, reason: 'test-key' });
});

// Білий список: усе, що не appl_…, у production не пускаємо. Секретний sk_
// у публічній змінній ліг би в IPA, а sk_ керує покупками всіх користувачів.
test('the RevenueCat key is an allow-list: only appl_ passes', () => {
  const secret = checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'sk_AbCdEfGhIjKlMnOp' }));
  expect(secret).toMatchObject({ ok: false, reason: 'secret-key' });
  expect(secret.message).toContain('sk_');
  expect(secret.message).toContain('appl_');
  for (const bad of ['goog_AbCdEfGhIjKl', 'AbCdEfGhIjKlMnOp', 'appl', 'appl_', 'APPL_abc', 'appl_ab cd', 'xappl_abc', '=appl_abc']) {
    expect([bad, checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: bad })).reason]).toEqual([bad, 'bad-key']);
  }
});

test('the key problems never print the whole key, and name the key kind', () => {
  for (const [key, secretPart] of [
    ['test_SECRETPART', 'SECRETPART'],
    ['sk_SECRETPART', 'SECRETPART'],
    ['goog_SECRETPART', 'SECRETPART'],
    ['SECRETPARTwithoutPrefix', 'SECRETPART'],
  ]) {
    const res = checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: key }));
    expect(res.ok).toBe(false);
    expect(res.message).not.toContain(secretPart);
  }
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'goog_SECRETPART' })).message).toContain('goog_…');
});

describe('server address in production', () => {
  const url = (v) => checkReleaseEnv(prod({ EXPO_PUBLIC_SERVER_URL: v }));

  test('missing or blank stops the build', () => {
    for (const v of [undefined, '', '   ']) {
      expect(url(v)).toMatchObject({ ok: false, reason: 'server-url' });
    }
    expect(url(undefined).message).toContain('EXPO_PUBLIC_SERVER_URL');
  });

  test('only a real https origin passes', () => {
    for (const v of ['https://api.lingualens.example', 'https://api.lingualens.example:8443', ' https://api.lingualens.example ', 'https://lingualens-prod.fly.dev']) {
      expect([v, url(v)]).toEqual([v, { ok: true }]);
    }
    for (const v of [
      'http://api.lingualens.example', // ATS у релізі заблокує
      'api.lingualens.example', // без схеми
      'https://api.lingualens.example/', // SERVER_URL + '/privacy' стало б '//privacy'
      'https://api.lingualens.example/v1', // сервер віддає маршрути від кореня
      'https://api.lingualens.example?x=1',
      'https://',
      'https://api.lingualens example',
    ]) {
      expect([v, url(v).reason]).toEqual([v, 'server-url']);
    }
  });

  test('the placeholder and local addresses never ship', () => {
    for (const v of [
      'https://set-EXPO_PUBLIC_SERVER_URL.invalid', // заглушка src/config.js
      'https://localhost',
      'https://localhost:3000',
      'https://127.0.0.1',
      'https://0.0.0.0',
      'https://192.168.1.20',
      'https://10.0.0.5:3000',
      'https://172.16.4.2',
      'https://macbook.local',
    ]) {
      expect([v, url(v).reason]).toEqual([v, 'server-url']);
    }
    // 172.32 уже не приватна мережа
    expect(url('https://172.32.0.1')).toEqual({ ok: true });
  });

  test('a login inside the address is not echoed into the build log', () => {
    const res = url('https://admin:TOPSECRET@api.lingualens.example/');
    expect(res.reason).toBe('server-url');
    expect(res.message).not.toContain('TOPSECRET');
  });
});

test('every production problem is listed at once, the first one is the reason', () => {
  const res = checkReleaseEnv({ EAS_BUILD_PROFILE: 'production' });
  expect(res).toMatchObject({ ok: false, reason: 'missing', reasons: ['missing', 'server-url'] });
  expect(res.message).toContain('EXPO_PUBLIC_REVENUECAT_IOS_KEY');
  expect(res.message).toContain('EXPO_PUBLIC_SERVER_URL');
  expect(checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'sk_x', EXPO_PUBLIC_SERVER_URL: 'http://x.example' }))).toMatchObject({
    reason: 'secret-key',
    reasons: ['secret-key', 'server-url'],
  });
  // одна проблема: reasons з одного елемента, без «Проблем: N»
  const one = checkReleaseEnv(prod({ EXPO_PUBLIC_SERVER_URL: '' }));
  expect(one.reasons).toEqual(['server-url']);
  expect(one.message).not.toMatch(/^Проблем/);
});

// Необов'язкове: збірка йде, але мовчки втрачає рядок «Contact support»,
// статистику чи кнопку Instagram. Про це лише попередження.
describe('optional settings only warn', () => {
  const warnsOf = (over) => checkReleaseEnv(prod(over)).warnings || [];

  test('a complete environment has no warnings at all', () => {
    expect(checkReleaseEnv(GOOD)).toEqual({ ok: true });
  });

  test('a missing support email is a warning, not a failure', () => {
    for (const v of [undefined, '', '  ']) {
      const res = checkReleaseEnv(prod({ EXPO_PUBLIC_SUPPORT_EMAIL: v }));
      expect(res.ok).toBe(true);
      expect(res.warnings).toHaveLength(1);
      expect(res.warnings[0]).toContain('EXPO_PUBLIC_SUPPORT_EMAIL');
    }
  });

  test('PostHog key and Facebook App ID are warnings too', () => {
    expect(warnsOf({ EXPO_PUBLIC_POSTHOG_KEY: '' }).join('\n')).toContain('EXPO_PUBLIC_POSTHOG_KEY');
    expect(warnsOf({ EXPO_PUBLIC_FACEBOOK_APP_ID: '' }).join('\n')).toContain('EXPO_PUBLIC_FACEBOOK_APP_ID');
    expect(checkReleaseEnv(prod({ EXPO_PUBLIC_POSTHOG_KEY: '', EXPO_PUBLIC_FACEBOOK_APP_ID: '' })).ok).toBe(true);
  });

  test('warnings ride along with a failure too', () => {
    const res = checkReleaseEnv({ EAS_BUILD_PROFILE: 'production', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'appl_x', EXPO_PUBLIC_SERVER_URL: 'http://x.example' });
    expect(res.ok).toBe(false);
    expect(res.warnings.join('\n')).toContain('EXPO_PUBLIC_SUPPORT_EMAIL');
  });
});

// Підказка для власника: поточна команда EAS CLI (eas env:create там уже
// прихована й застаріла, див. eas env:set --help)
test('the fix hints use the current eas env:set command', () => {
  for (const res of [
    checkReleaseEnv({ EAS_BUILD_PROFILE: 'production' }),
    checkReleaseEnv(prod({ EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'goog_x' })),
    checkReleaseEnv(prod({ EXPO_PUBLIC_SERVER_URL: '' })),
  ]) {
    expect(res.message).toMatch(/eas env:set production --name EXPO_PUBLIC_[A-Z_]+ --value \S+ --visibility plaintext/);
    expect(res.message).not.toContain('env:create');
  }
});

// Назви змінних у запобіжнику мають збігатися з тими, що читає застосунок:
// інакше guard перевіряв би одне, а збірка вбудовувала інше
test('the guard checks exactly the variables src/config.js embeds', () => {
  const config = fs.readFileSync(path.join(__dirname, '..', 'src', 'config.js'), 'utf8');
  const guard = fs.readFileSync(SCRIPT, 'utf8');
  for (const name of ['SERVER_URL', 'REVENUECAT_IOS_KEY', 'SUPPORT_EMAIL', 'POSTHOG_KEY', 'FACEBOOK_APP_ID']) {
    expect(config).toContain('process.env.EXPO_PUBLIC_' + name);
    expect(guard).toContain('env.EXPO_PUBLIC_' + name);
  }
});

test('development, preview and local runs are never blocked', () => {
  for (const profile of ['development', 'preview', '', undefined]) {
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_abc' })).toEqual({ ok: true });
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'sk_abc', EXPO_PUBLIC_SERVER_URL: 'http://localhost:3000' })).toEqual({ ok: true });
    expect(checkReleaseEnv({ EAS_BUILD_PROFILE: profile })).toEqual({ ok: true });
  }
});

// app.config.js прибирає «Вхід через Apple» з LL_SIMULATOR=1 — у хмарну
// збірку цей прапорець потрапити не має в жодному профілі
test('any EAS build with the simulator flag stops; local runs do not', () => {
  for (const profile of ['development', 'preview', 'production']) {
    expect(checkReleaseEnv({ ...GOOD, EAS_BUILD_PROFILE: profile, LL_SIMULATOR: '1' })).toMatchObject({ ok: false, reason: 'simulator' });
  }
  expect(checkReleaseEnv({ LL_SIMULATOR: '1' })).toEqual({ ok: true });
  expect(checkReleaseEnv({ ...GOOD, LL_SIMULATOR: '0' })).toEqual({ ok: true });
});

test('EAS runs it before installing dependencies, and it fails the build', () => {
  expect(pkg.scripts['eas-build-pre-install']).toBe('node scripts/check-release-env.js');
  const run = (env) => {
    const r = spawnSync(process.execPath, [SCRIPT], { env: { PATH: process.env.PATH, ...env }, encoding: 'utf8' });
    return { code: r.status, out: r.stdout + r.stderr };
  };
  expect(run({ ...GOOD, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_x' }).code).toBe(1);
  expect(run({ ...GOOD, EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'sk_x' }).code).toBe(1);
  expect(run({ ...GOOD, EXPO_PUBLIC_SERVER_URL: '' }).code).toBe(1);
  expect(run({ ...GOOD, EXPO_PUBLIC_SERVER_URL: 'http://api.lingualens.example' }).code).toBe(1);
  expect(run({ ...GOOD }).code).toBe(0);
  expect(run({ EAS_BUILD_PROFILE: 'preview', EXPO_PUBLIC_REVENUECAT_IOS_KEY: 'test_x' }).code).toBe(0);
  expect(run({ EAS_BUILD_PROFILE: 'preview', LL_SIMULATOR: '1' }).code).toBe(1);
  // немає пошти підтримки: збірка йде, а попередження видно в логу EAS
  const warned = run({ ...GOOD, EXPO_PUBLIC_SUPPORT_EMAIL: '' });
  expect(warned.code).toBe(0);
  expect(warned.out).toContain('EXPO_PUBLIC_SUPPORT_EMAIL');
  expect(run({ ...GOOD }).out).not.toContain('EXPO_PUBLIC_SUPPORT_EMAIL');
});

// purchases-ui вимагає рівно ту саму версію react-native-purchases: розбіжність
// дає збірку, що падає вже на пристрої
test('react-native-purchases and purchases-ui are pinned to the same exact version', () => {
  const core = pkg.dependencies['react-native-purchases'];
  expect(core).toMatch(/^\d+\.\d+\.\d+$/);
  expect(pkg.dependencies['react-native-purchases-ui']).toBe(core);
});
