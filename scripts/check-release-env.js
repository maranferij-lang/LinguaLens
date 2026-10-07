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
//
// У production перевіряємо ще й адресу сервера: без EXPO_PUBLIC_SERVER_URL
// (або з http://, шляхом, localhost) застосунок збирається, але не
// сканує, не синхронізується, а посилання на політику конфіденційності
// зникає з пейвола й Параметрів (src/config.js, App Store 3.1.2 і 5.1.1).
// Ключ RevenueCat — за білим списком appl_…, бо секретний sk_ у публічній
// змінній ліг би в IPA. Бракує необов'язкового (пошта підтримки, PostHog,
// Facebook App ID) — лише попередження, збірка йде.

// Ключі Test Store і старого RevenueCat Billing — не для App Store.
const TEST_KEY = /^(test_|rcb_)/;
// Публічний ключ App Store RevenueCat. Білий список, а не чорний: будь-що інше
// (секретний sk_…, ключ Android goog_…, описка) у production не пропускаємо —
// EXPO_PUBLIC_* вбудовується у відкритий бінарник, а sk_ читає й видає
// entitlement усім покупцям.
const APP_STORE_KEY = /^appl_\S+$/;
// Адреса сервера: лише https і лише походження (хост[:порт]) — без шляху, без
// логіна й параметрів. Слеші в кінці не заважають: src/config.js їх відкидає
// (ENV.SERVER_URL), тож '/privacy' не стає '//privacy', і перед перевіркою їх
// знімаємо так само. Release-збірка з http:// впирається в ATS.
const HTTPS_ORIGIN = /^https:\/\/[^\s/?#@]+$/i;
// Хости, яких у production бути не може: заглушка src/config.js (.invalid),
// локальний сервер розробки, адреси LAN і loopback.
const LOCAL_HOST =
  /^(localhost|0\.0\.0\.0|127(\.\d+){3}|10(\.\d+){3}|192\.168(\.\d+){2}|172\.(1[6-9]|2\d|3[01])(\.\d+){2}|\[.*\])$|\.(invalid|local|localhost)$/;

// Початок значення (test_, sk_, goog_…) без решти: повний ключ у лог не пишемо.
function keyHint(key) {
  const m = /^[A-Za-z]{1,6}_/.exec(key);
  return m ? m[0] + '…' : 'невідомий формат';
}

// → null, якщо адреса годиться, інакше пояснення, що з нею не так.
function serverUrlProblem(url) {
  if (!url) return 'не задано';
  // логін:пароль у адресі в лог не друкуємо
  const shown = url.replace(/\/\/[^/]*@/, '//…@');
  // як у src/config.js: слеші в кінці застосунок усе одно відкине
  const origin = url.replace(/\/+$/, '');
  if (!HTTPS_ORIGIN.test(origin)) {
    return 'має бути https://хост[:порт] без шляху, логіна й параметрів (зараз: «' + shown + '»)';
  }
  let host = '';
  try {
    host = new URL(origin).hostname;
  } catch (e) {
    return 'не схожа на адресу (зараз: «' + shown + '»)';
  }
  if (LOCAL_HOST.test(host)) {
    return 'веде на локальну чи тимчасову адресу (' + host + '), а в production потрібен справжній сервер';
  }
  return null;
}

// → { ok: true } або { ok: false, reason, reasons, message }; reason: 'missing'
// | 'test-key' | 'secret-key' | 'bad-key' | 'server-url' | 'simulator'.
// У production перевірки не зупиняються на першій помилці: message перелічує
// усі, а reason — перша. warnings (лише коли є) — необов'язкові змінні, яких
// бракує: збірка йде, але щось тихо вимкнеться.
// env — process.env (у тесті — підставний об'єкт).
function checkReleaseEnv(env) {
  const profile = (env.EAS_BUILD_PROFILE || '').trim();
  // LL_SIMULATOR=1 прибирає «Вхід через Apple» (app.config.js) — це лише для
  // локального симулятора. Збірка EAS з ним іде на справжні iPhone, де кнопка
  // Apple тоді не працює, тож її зупиняємо в будь-якому профілі.
  if (profile && (env.LL_SIMULATOR || '').trim() === '1') {
    return {
      ok: false,
      reason: 'simulator',
      message:
        'LL_SIMULATOR=1 це прапорець лише для локального симулятора: він прибирає «Вхід через Apple». ' +
        'Прибери змінну з середовища EAS (' + profile + ').',
    };
  }
  if (profile !== 'production') return { ok: true };

  const problems = [];
  const key = (env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || '').trim();
  if (!key) {
    problems.push({
      reason: 'missing',
      message:
        'EXPO_PUBLIC_REVENUECAT_IOS_KEY не задано для production. Додай ключ App Store (appl_…) у середовище EAS production: ' +
        'eas env:set production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext',
    });
  } else if (TEST_KEY.test(key)) {
    problems.push({
      reason: 'test-key',
      message:
        'У production стоїть тестовий ключ RevenueCat (' + keyHint(key) + '). RevenueCat забороняє подавати збірку з ключем ' +
        'Test Store. Заміни його на ключ App Store (appl_…) у середовищі EAS production.',
    });
  } else if (/^sk_/.test(key)) {
    problems.push({
      reason: 'secret-key',
      message:
        'У EXPO_PUBLIC_REVENUECAT_IOS_KEY лежить СЕКРЕТНИЙ ключ RevenueCat (sk_…). Усе з EXPO_PUBLIC_ потрапляє у відкритий бінарник, ' +
        'а sk_ керує покупками всіх користувачів. Заміни його на публічний ключ App Store (appl_…) і перевипусти sk_ у RevenueCat.',
    });
  } else if (!APP_STORE_KEY.test(key)) {
    problems.push({
      reason: 'bad-key',
      message:
        'EXPO_PUBLIC_REVENUECAT_IOS_KEY у production має починатися з appl_ (ключ App Store), а тут ' + keyHint(key) + '. ' +
        'Перевір, що це публічний iOS-ключ, без пробілів: eas env:set production --name EXPO_PUBLIC_REVENUECAT_IOS_KEY --value appl_… --visibility plaintext',
    });
  }

  const serverProblem = serverUrlProblem((env.EXPO_PUBLIC_SERVER_URL || '').trim());
  if (serverProblem) {
    problems.push({
      reason: 'server-url',
      message:
        'EXPO_PUBLIC_SERVER_URL у production ' + serverProblem + '. Без неї не працюють скан, синхронізація й слово дня, ' +
        'а в пейволі та Параметрах зникає посилання на політику конфіденційності (App Store 3.1.2 і 5.1.1). ' +
        'Задай: eas env:set production --name EXPO_PUBLIC_SERVER_URL --value https://<адреса-сервера> --visibility plaintext',
    });
  }

  // Необов'язкове: збірка йде, але без цього щось мовчки зникає.
  const warnings = [];
  if (!(env.EXPO_PUBLIC_SUPPORT_EMAIL || '').trim()) {
    warnings.push(
      'EXPO_PUBLIC_SUPPORT_EMAIL не задано: у Параметрах не буде рядка «Contact support», єдиного зв\'язку з підтримкою в застосунку.'
    );
  }
  if (!(env.EXPO_PUBLIC_POSTHOG_KEY || '').trim()) {
    warnings.push('EXPO_PUBLIC_POSTHOG_KEY не задано: анонімна статистика вимкнена.');
  }
  if (!(env.EXPO_PUBLIC_FACEBOOK_APP_ID || '').trim()) {
    warnings.push('EXPO_PUBLIC_FACEBOOK_APP_ID не задано: кнопки Instagram Stories не буде, картки підуть через системне меню.');
  }

  const out = problems.length
    ? {
        ok: false,
        reason: problems[0].reason,
        reasons: problems.map((p) => p.reason),
        message:
          problems.length === 1
            ? problems[0].message
            : 'Проблем: ' + problems.length + '.\n' + problems.map((p) => '- ' + p.message).join('\n'),
      }
    : { ok: true };
  if (warnings.length) out.warnings = warnings;
  return out;
}

module.exports = { checkReleaseEnv };

if (require.main === module) {
  const res = checkReleaseEnv(process.env);
  for (const w of res.warnings || []) console.warn('⚠ check-release-env: ' + w);
  if (!res.ok) {
    console.error('\n✖ check-release-env: ' + res.message + '\n');
    process.exit(1);
  }
  if (process.env.EAS_BUILD_PROFILE) console.log('check-release-env: OK (' + process.env.EAS_BUILD_PROFILE + ')');
}
