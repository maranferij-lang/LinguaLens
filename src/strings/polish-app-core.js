// Рядки полірування ядра застосунку (жовтень 2026): пояснення, коли
// перемикач сповіщень у Параметрах не може увімкнутись, бо iOS уже відмовив
// і системного вікна більше не покаже; підтвердження покупки Pro (ProToast).
// Власник — потік app-core; інші потоки цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, «» / “” / „“, ʼ в українській (у російській апострофа немає), без
// емодзі, капсу й довгих тире. Ключ, який уже є в іншому фрагменті, не
// дублюємо. Кожна мова — окремий блок у цьому ж форматі (`  en: {` … `  },`):
// тест шукає в ньому ключі-дублікати. Кнопки «Скасувати» і «Відкрити
// Параметри» беремо з бази (cancel, openSettings).
//
// Фрагмент підключений: src/i18n.js (FRAGMENTS, merged()) і NAMES тесту
// __tests__/i18nFragments.test.js.
export default {
  en: {
    // ── перемикачі сповіщень у Параметрах, коли iOS уже відмовив ──
    notifOffTitle: 'Notifications are off',
    notifOffText: 'iOS won’t ask again. Turn them on in Settings → LinguaLens → Notifications, then come back and switch this on.',
    // ── підтвердження покупки Pro (ProToast): «нагадаємо» лише коли нагадування є ──
    proToastTitle: 'You’re Pro now',
    proToastText: 'Everything is unlocked. Thank you!',
    proToastTrial: 'Your free trial has started.',
    proToastTrialRemind: 'Your free trial has started. We’ll remind you 2 days before it ends.',
  },
  uk: {
    notifOffTitle: 'Сповіщення вимкнено',
    notifOffText: 'iOS більше не питатиме. Увімкни їх у Параметрах → LinguaLens → Сповіщення, а потім повернись і ввімкни це.',
    proToastTitle: 'Тепер ти з Pro',
    proToastText: 'Усе відкрито. Дякуємо!',
    proToastTrial: 'Пробний період почався.',
    proToastTrialRemind: 'Пробний період почався. Нагадаємо за 2 дні до кінця.',
  },
  de: {
    notifOffTitle: 'Mitteilungen sind aus',
    notifOffText: 'iOS fragt nicht noch einmal. Aktiviere sie unter Einstellungen → LinguaLens → Mitteilungen und schalte das danach hier ein.',
    proToastTitle: 'Du hast jetzt Pro',
    proToastText: 'Alles ist freigeschaltet. Danke!',
    proToastTrial: 'Deine Testphase hat begonnen.',
    proToastTrialRemind: 'Deine Testphase hat begonnen. Wir erinnern dich 2 Tage vor dem Ende.',
  },
  es: {
    notifOffTitle: 'Las notificaciones están desactivadas',
    notifOffText: 'iOS no volverá a preguntar. Actívalas en Ajustes → LinguaLens → Notificaciones y luego vuelve y activa esto.',
    proToastTitle: 'Ya tienes Pro',
    proToastText: 'Todo está desbloqueado. ¡Gracias!',
    proToastTrial: 'Tu prueba gratis ha empezado.',
    proToastTrialRemind: 'Tu prueba gratis ha empezado. Te avisaremos 2 días antes de que termine.',
  },
  ru: {
    notifOffTitle: 'Уведомления выключены',
    notifOffText: 'iOS больше не спросит. Включи их в Настройках → LinguaLens → Уведомления, а потом вернись и включи это.',
    proToastTitle: 'Теперь у тебя Pro',
    proToastText: 'Всё открыто. Спасибо!',
    proToastTrial: 'Пробный период начался.',
    proToastTrialRemind: 'Пробный период начался. Напомним за 2 дня до конца.',
  },
};
