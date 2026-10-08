// Рядки полірування ядра застосунку (жовтень 2026): пояснення, коли
// перемикач сповіщень у Параметрах не може увімкнутись, бо iOS уже відмовив
// і системного вікна більше не покаже. Власник — потік app-core; інші потоки
// цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, «» / “” / „“, ʼ в українській (у російській апострофа немає), без
// емодзі, капсу й довгих тире. Ключ, який уже є в іншому фрагменті, не
// дублюємо. Кожна мова — окремий блок у цьому ж форматі (`  en: {` … `  },`):
// тест шукає в ньому ключі-дублікати. Кнопки «Скасувати» і «Відкрити
// Параметри» беремо з бази (cancel, openSettings).
//
// Інтегратору: додати `import * as polishAppCore from './strings/polish-app-core';`
// в src/i18n.js, у FRAGMENTS, у merged() і в NAMES тесту
// __tests__/i18nFragments.test.js.
export default {
  en: {
    // ── перемикачі сповіщень у Параметрах, коли iOS уже відмовив ──
    notifOffTitle: 'Notifications are off',
    notifOffText: 'iOS won’t ask again. Turn them on in Settings → LinguaLens → Notifications, then come back and switch this on.',
  },
  uk: {
    notifOffTitle: 'Сповіщення вимкнено',
    notifOffText: 'iOS більше не питатиме. Увімкни їх у Параметрах → LinguaLens → Сповіщення, а потім повернись і ввімкни це.',
  },
  de: {
    notifOffTitle: 'Mitteilungen sind aus',
    notifOffText: 'iOS fragt nicht noch einmal. Aktiviere sie unter Einstellungen → LinguaLens → Mitteilungen und schalte das danach hier ein.',
  },
  es: {
    notifOffTitle: 'Las notificaciones están desactivadas',
    notifOffText: 'iOS no volverá a preguntar. Actívalas en Ajustes → LinguaLens → Notificaciones y luego vuelve y activa esto.',
  },
  ru: {
    notifOffTitle: 'Уведомления выключены',
    notifOffText: 'iOS больше не спросит. Включи их в Настройках → LinguaLens → Уведомления, а потом вернись и включи это.',
  },
};
