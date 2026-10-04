#!/usr/bin/env node
// Запобіжник релізної збірки. EAS запускає його як npm-скрипт
// «eas-build-pre-install» ще до встановлення залежностей — тому тут лише Node,
// без жодного пакета.
//
// Чому він потрібен: у середовищах EAS development/preview (і в локальному
// .env) EXPO_PUBLIC_REVENUECAT_IOS_KEY — це ключ Test Store (test_…), щоб
// покупки йшли через симульоване вікно RevenueCat. RevenueCat прямо пише:
// «Never submit an app configured with a Test Store API key» — така збірка в
// App Store не продасть нічого. А без ключа зовсім пейвол чесно скаже
// «покупки недоступні» — і застосунок теж не заробить. Обидві помилки
// непомітні, доки не прийдуть перші відгуки, тож production-збірку з ними
// зупиняємо одразу, на старті.

// Ключі Test Store і старого RevenueCat Billing — не для App Store.
const TEST_KEY = /^(test_|rcb_)/;

// → { ok: true } або { ok: false, reason: 'missing' | 'test-key', message }.
// env — process.env (у тесті — підставний об'єкт).
function checkReleaseEnv(env) {
  if ((env.EAS_BUILD_PROFILE || '').trim() !== 'production') return { ok: true };
  const key = (env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '').trim();
  if (!key) {
    return {
      ok: false,
      reason: 'missing',
      message:
        'EXPO_PUBLIC_REVENUECAT_IOS_KEY не задано для production. Додай ключ App Store (appl_…) у середовище EAS production: ' +
        'eas env:create --environment production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_…',
    };
  }
  if (TEST_KEY.test(key)) {
    return {
      ok: false,
      reason: 'test-key',
      message:
        'У production стоїть тестовий ключ RevenueCat (' + key.slice(0, 5) + '…). RevenueCat забороняє подавати збірку з ключем ' +
        'Test Store — заміни його на ключ App Store (appl_…) у середовищі EAS production.',
    };
  }
  return { ok: true };
}

module.exports = { checkReleaseEnv };

if (require.main === module) {
  const res = checkReleaseEnv(process.env);
  if (!res.ok) {
    console.error('\n✖ check-release-env: ' + res.message + '\n');
    process.exit(1);
  }
  if (process.env.EAS_BUILD_PROFILE) console.log('check-release-env: OK (' + process.env.EAS_BUILD_PROFILE + ')');
}
