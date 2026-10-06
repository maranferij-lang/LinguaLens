// Спільні рядки v1.3 (власник — фундамент W0): тексти серії, які однаково
// говорять картка в Профілі, свято першої дії дня, віджет «Серія» й
// онбординг, і футер Параметрів. Яку фразу показати, вирішує одна функція —
// streakMessage у src/streak.js; екрани самі фраз не обирають.
//
// Як і всі фрагменти src/strings/*.js: правила тексту — у шапці src/i18n.js,
// однаковий набір ключів у пʼяти мовах, жодного ключа з іншого фрагмента.
// Наявний ключ із src/i18n.js перекриваємо, лише назвавши його в OVERRIDES
// (стереже __tests__/i18nFragments.test.js).

// footer: слоган під іконкою більше не повторює назву — вона вже написана
// над ним.
export const OVERRIDES = ['footer'];

export default {
  en: {
    // ── серія ──
    streakUnit: '{n|day|days} in a row',
    streakKeep: '{n} {n|day|days} in a row. Keep it up!',
    streakHabit: '{n} {n|day|days} in a row. It’s becoming a habit',
    streakToWeek: '{k} more {k|day|days} to a week, then your flame catches fire',
    streakWeek: 'A whole week! Your flame is lit',
    streakToNext: 'Your flame is burning. {k} more {k|day|days} to reach {m}',
    streak30: 'A month without a break!',
    streakPending: 'Not yet today: one word keeps it growing',
    streakPendingShort: 'Not yet today: one word',
    streakEvening: 'Don’t let your flame go out',
    streakLate: 'Your streak ends at midnight',
    streakLost: 'Your streak went out. Start a new one today',
    streakNone: 'Save a word to light your first flame',
    streakEmber: 'Just an ember for now',
    streakBest: 'Best: {n} {n|day|days}',

    // ── футер Параметрів ──
    footer: 'Scan · learn · repeat',
    versionLabel: 'Version {v}',
  },

  uk: {
    // ── серія ──
    streakUnit: '{n|день|дні|днів} поспіль',
    streakKeep: '{n} {n|день|дні|днів} поспіль. Так тримати!',
    streakHabit: '{n} {n|день|дні|днів} поспіль. Звичка вже формується',
    streakToWeek: 'До тижня ще {k} {k|день|дні|днів}, і вогник розгориться',
    streakWeek: 'Тиждень! Вогонь розгорівся',
    streakToNext: 'Вогонь горить. До {m} днів лишилося {k}',
    streak30: 'Місяць без перерви!',
    streakPending: 'Сьогодні ще ні: одне слово, і серія росте',
    streakPendingShort: 'Сьогодні ще ні: одне слово',
    streakEvening: 'Не дай вогнику згаснути',
    streakLate: 'Серія згасне опівночі',
    streakLost: 'Серія згасла. Почни нову сьогодні',
    streakNone: 'Збережи слово й запали перший вогник',
    streakEmber: 'Поки що жаринка',
    streakBest: 'Рекорд: {n} {n|день|дні|днів}',

    // ── футер Параметрів ──
    footer: 'Скануй · вивчай · повторюй',
    versionLabel: 'Версія {v}',
  },

  de: {
    // ── серія ──
    streakUnit: '{n|Tag|Tage} in Folge',
    streakKeep: '{n} {n|Tag|Tage} in Folge. Weiter so!',
    streakHabit: '{n} {n|Tag|Tage} in Folge. Es wird zur Gewohnheit',
    streakToWeek: 'Noch {k} {k|Tag|Tage} bis zur Woche, dann lodert deine Flamme',
    streakWeek: 'Eine ganze Woche! Deine Flamme lodert',
    streakToNext: 'Deine Flamme brennt. Noch {k} bis zum {m}. Tag',
    streak30: 'Ein Monat ohne Pause!',
    streakPending: 'Heute noch nicht: ein Wort, und die Serie wächst',
    streakPendingShort: 'Heute noch nicht: ein Wort',
    streakEvening: 'Lass deine Flamme nicht ausgehen',
    streakLate: 'Deine Serie endet um Mitternacht',
    streakLost: 'Deine Serie ist erloschen. Starte heute eine neue',
    streakNone: 'Speichere ein Wort und entzünde deine erste Flamme',
    streakEmber: 'Noch ist es nur Glut',
    streakBest: 'Rekord: {n} {n|Tag|Tage}',

    // ── футер Параметрів ──
    footer: 'Scannen · lernen · wiederholen',
    versionLabel: 'Version {v}',
  },

  es: {
    // ── серія ──
    streakUnit: '{n|día seguido|días seguidos}',
    streakKeep: '{n} {n|día seguido|días seguidos}: ¡sigue así!',
    streakHabit: '{n} {n|día seguido|días seguidos}: ya se está volviendo un hábito',
    streakToWeek: '{k|Falta|Faltan} {k} {k|día|días} para la semana, y tu llama se encenderá',
    streakWeek: '¡Una semana entera! Tu llama ya arde',
    streakToNext: 'Tu llama arde. {k|Falta|Faltan} {k} para los {m} días',
    streak30: '¡Un mes sin descanso!',
    streakPending: 'Hoy todavía no: una palabra y la racha crece',
    streakPendingShort: 'Hoy todavía no: una palabra',
    streakEvening: 'No dejes que tu llama se apague',
    streakLate: 'Tu racha termina a medianoche',
    streakLost: 'Tu racha se apagó. Empieza una nueva hoy',
    streakNone: 'Guarda una palabra y enciende tu primera llama',
    streakEmber: 'Por ahora, solo una brasa',
    streakBest: 'Récord: {n} {n|día|días}',

    // ── футер Параметрів ──
    footer: 'Escanea · aprende · repasa',
    versionLabel: 'Versión {v}',
  },

  ru: {
    // ── серія ──
    streakUnit: '{n|день|дня|дней} подряд',
    streakKeep: '{n} {n|день|дня|дней} подряд. Так держать!',
    streakHabit: '{n} {n|день|дня|дней} подряд. Привычка уже складывается',
    streakToWeek: 'До недели ещё {k} {k|день|дня|дней}, и огонёк разгорится',
    streakWeek: 'Неделя! Огонь разгорелся',
    // «До 21 дня», «до 30 дней»: після «до» родовий відмінок, тож форма за m
    streakToNext: 'Огонь горит. До {m} {m|дня|дней|дней} осталось {k}',
    streak30: 'Месяц без перерыва!',
    streakPending: 'Сегодня ещё нет: одно слово, и серия растёт',
    streakPendingShort: 'Сегодня ещё нет: одно слово',
    streakEvening: 'Не дай огоньку погаснуть',
    streakLate: 'Серия погаснет в полночь',
    streakLost: 'Серия погасла. Начни новую сегодня',
    streakNone: 'Сохрани слово и зажги первый огонёк',
    streakEmber: 'Пока что уголёк',
    streakBest: 'Рекорд: {n} {n|день|дня|дней}',

    // ── футер Параметрів ──
    footer: 'Сканируй · учи · повторяй',
    versionLabel: 'Версия {v}',
  },
};
