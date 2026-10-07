// Усі налаштування, які відрізняються між розробкою і релізом, — в одному місці.
//
// Значення беруться зі змінних оточення EXPO_PUBLIC_* (файл .env у корені або
// «Environment variables» у EAS). Так релізна збірка не залежить від того,
// чи не забули поправити рядок у коді перед `eas build`.
import Constants from 'expo-constants';

// УВАГА: лише process.env.EXPO_PUBLIC_X дослівно. Expo вбудовує змінні в
// релізну збірку, тільки коли бачить саме такий запис; доступ через змінну-ключ
// працює в розробці, а в TestFlight тихо дає порожнечу (тест config.test.js).
const clean = (v) => (v || '').trim();
const ENV = {
  // слеш у кінці зайвий: SERVER_URL + '/privacy' інакше дав би '//privacy' (404)
  SERVER_URL: clean(process.env.EXPO_PUBLIC_SERVER_URL).replace(/\/+$/, ''),
  APP_TOKEN: clean(process.env.EXPO_PUBLIC_APP_TOKEN),
  REVENUECAT_IOS_KEY: clean(process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY),
  TERMS_URL: clean(process.env.EXPO_PUBLIC_TERMS_URL),
  PRIVACY_URL: clean(process.env.EXPO_PUBLIC_PRIVACY_URL),
  SUPPORT_EMAIL: clean(process.env.EXPO_PUBLIC_SUPPORT_EMAIL),
  FACEBOOK_APP_ID: clean(process.env.EXPO_PUBLIC_FACEBOOK_APP_ID),
  POSTHOG_KEY: clean(process.env.EXPO_PUBLIC_POSTHOG_KEY),
  POSTHOG_HOST: clean(process.env.EXPO_PUBLIC_POSTHOG_HOST),
};
const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

// РОЗРОБКА: адресу НЕ треба вписувати руками. Metro вже знає IP компа —
// беремо його з hostUri (там 192.168.x.x:8081) і міняємо порт на серверний.
// Це прибирає найчастішу причину «скан не працює»: IP змінився після
// перепідключення до Wi-Fi, а в коді лишився старий.
const DEV_PORT = 3000;
function devServerUrl() {
  const host =
    Constants.expoConfig?.hostUri ||
    Constants.expoGoConfig?.debuggerHost ||
    Constants.manifest2?.extra?.expoGo?.debuggerHost ||
    '';
  const ip = String(host).split(':')[0];
  // тунель (exp.direct) не дає доступу до локального сервера — там потрібен
  // або справжній LAN, або вже задеплоєний хмарний сервер
  if (!ip || ip.includes('exp.direct')) return null;
  return `http://${ip}:${DEV_PORT}`;
}

const DEV_URL = isDev ? devServerUrl() : null;

// Порядок: явна адреса з оточення → локальний сервер у розробці → заглушка.
// Заглушка навмисно непрацююча: краще помилка «офлайн» у першому ж тесті
// TestFlight, ніж реліз, що стукає на чужу адресу.
export const SERVER_URL = ENV.SERVER_URL || DEV_URL || 'https://set-EXPO_PUBLIC_SERVER_URL.invalid';
export const SERVER_SOURCE = ENV.SERVER_URL ? 'env' : DEV_URL ? 'auto' : 'missing';

// Спільний токен застосунку (той самий, що APP_TOKEN на сервері). Захист
// «від випадкових»: він лежить у бінарнику. Можна лишити порожнім.
export const APP_TOKEN = ENV.APP_TOKEN;

// Публічний iOS-ключ RevenueCat. У розробці (локальний .env і середовища EAS
// development/preview) — ключ Test Store (test_…): покупки йдуть через
// симульоване вікно RevenueCat, без справжніх грошей. У production — ключ
// App Store (appl_…): з тестовим ключем RevenueCat забороняє подавати збірку,
// тож production-збірку з ним зупиняє scripts/check-release-env.js.
// Без ключа покупки вимкнені: у розробці пейвол імітує покупку, у релізі
// кнопка чесно каже, що недоступно.
export const REVENUECAT_IOS_KEY = ENV.REVENUECAT_IOS_KEY;
// Ідентифікатор entitlement у RevenueCat — той самий, що REVENUECAT_ENTITLEMENT
// на сервері: за ним і застосунок, і сервер вирішують, чи людина має Pro.
export const PRO_ENTITLEMENT = 'lingualens_pro';

// Юридичні посилання — обов'язкові в пейволі (App Store Guideline 3.1.2).
// Terms: стандартна ліцензія Apple (EULA) — її можна використовувати як є.
export const TERMS_URL =
  ENV.TERMS_URL || 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
// Політику віддає наш сервер (/privacy), тож окремо її можна не задавати.
export const PRIVACY_URL = ENV.PRIVACY_URL || (SERVER_SOURCE === 'missing' ? '' : SERVER_URL + '/privacy');
export const SUPPORT_EMAIL = ENV.SUPPORT_EMAIL;

// App ID застосунку Meta (developers.facebook.com). Instagram з 2023 року
// приймає «поділитись у Stories» лише з ним; без нього кнопки Instagram
// немає, а картки йдуть через звичайне системне меню.
export const FACEBOOK_APP_ID = ENV.FACEBOOK_APP_ID;

// Анонімна статистика PostHog (src/analytics.js). Ключ проєкту (phc_…)
// публічний за задумом PostHog — він лише приймає події. Без ключа вся
// статистика мовчки нічого не робить: тести, локальна розробка, Expo Go.
// Сервер — європейський: дані людей з Європи не виїжджають за її межі.
export const POSTHOG_KEY = ENV.POSTHOG_KEY;
export const POSTHOG_HOST = ENV.POSTHOG_HOST || 'https://eu.i.posthog.com';

export const IS_DEV = isDev;
