// Рядки v1.3 потоку W1 (сканер, «Навчання», серія 2.0). Власник — W1; інші потоки
// цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у чотирьох
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській, без емодзі й капсу.
// Ключ, який уже є в іншому фрагменті, не дублюємо. Наявний ключ із
// src/i18n.js перекриваємо, лише назвавши його в OVERRIDES (стереже
// __tests__/i18nFragments.test.js). Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// Фрази серії (скільки днів, «так тримати», «згасне опівночі»…) живуть у
// src/strings/shared.js і вибирає їх streakMessage — тут лише те, що
// належить самим екранам W1.

// scanErrEmpty — тепер підказує ліхтарик, який з'явився в сканері;
// scanProChip — чип переїхав нагору, у ряд статусу, і пише «Pro · …».
export const OVERRIDES = ['scanErrEmpty', 'scanProChip'];

export default {
  en: {
    // ── сканер ──
    scanTorch: 'Flashlight',
    scanLangA11y: 'Word language: {l}. Change',
    scanFreeLeft: '{n} free {n|scan|scans}',
    scanProBadgeA11y: 'You have Pro: unlimited scans',
    scanLastWordA11y: 'Last word: {w}. Open in your words',
    scanZoomA11y: 'Zoom {z}',
    scanShutterPro: 'Scan — Pro feature',
    scanFirstHint: 'Point at anything nearby — a mug, a plant, your keys',
    scanErrEmpty: 'Can’t see an object. Move closer or turn on the flashlight',
    scanProChip: 'Pro · unlimited scans',

    // ── «Навчання» до першого слова ──
    learnLockedCards: 'Save at least one word to unlock',
    learnLockedQuiz: 'Unlocks at {n} {n|word|words}',
    learnQuizLeft: '{k} more {k|word|words} to unlock the quiz',
    learnHowTitle: 'How to get your first word',
    learnHowText: 'Save the word of the day or scan something nearby to unlock flashcards.',
    learnScanPro: 'Unlimited scans with Pro',
    learnNoWod: 'The word of the day will appear once you’re online',
    learnUnlocked: 'Unlocked!',
    learnTipDaily: 'A new word of the day, every day. {k} more {k|word|words} to unlock the quiz.',

    // ── серія: чип, картка, свято, вечір ──
    streakChipA11y: 'Streak: {n} {n|day|days}. {s}',
    streakProgressOf: '{n} of {m}',
    streakGoalWeek: 'A week',
    streakGoalMonth: 'A month',
    streakGoalDays: '{m} {m|day|days}',
    streakContinue: 'Continue',
    streakAchChip: 'Achievement: {a}',
    streakRiskTitle: 'Your {n}-day streak ends at midnight',
    streakRiskBody: '{t} left. Review one word to keep your flame alive.',
    streakRiskCta: 'Review 1 card',
    streakNotifBody: 'Your streak is {n} {n|day|days}. One word today keeps it alive.',
    streakSectionTitle: 'Streak',
    streakRemind: 'Streak reminders',
    streakRemindHint: 'At {h} if you haven’t practiced today',

    // ── скільки лишилось (formatLeft у src/locale.js) ──
    timeLeftHM: '{h} h {m} min',
    timeLeftH: '{h} h',
    timeLeftM: '{m} min',
  },

  uk: {
    // ── сканер ──
    scanTorch: 'Ліхтарик',
    scanLangA11y: 'Мова слів: {l}. Змінити',
    scanFreeLeft: '{n} {n|безкоштовний скан|безкоштовні скани|безкоштовних сканів}',
    scanProBadgeA11y: 'У тебе Pro: скани без обмежень',
    scanLastWordA11y: 'Останнє слово: {w}. Відкрити в словнику',
    scanZoomA11y: 'Зум {z}',
    scanShutterPro: 'Скан — у Pro',
    scanFirstHint: 'Наведи на будь-яку річ поруч — чашку, рослину, ключі',
    scanErrEmpty: 'Не бачу предмета. Підійди ближче або увімкни ліхтарик',
    scanProChip: 'Pro · скани без обмежень',

    // ── «Навчання» до першого слова ──
    learnLockedCards: 'Збережи хоча б одне слово, щоб відкрити',
    learnLockedQuiz: 'Відкриється, коли буде {n} {n|слово|слова|слів}',
    learnQuizLeft: 'Ще {k} {k|слово|слова|слів} — і квіз відкриється',
    learnHowTitle: 'Як отримати перше слово',
    learnHowText: 'Збережи слово дня або відскануй річ поруч — і картки відкриються.',
    learnScanPro: 'Скани без обмежень — у Pro',
    learnNoWod: 'Слово дня зʼявиться, щойно буде інтернет',
    learnUnlocked: 'Відкрито!',
    learnTipDaily: 'Нове слово дня — щодня. Ще {k} {k|слово|слова|слів} — і відкриється квіз.',

    // ── серія: чип, картка, свято, вечір ──
    streakChipA11y: 'Серія: {n} {n|день|дні|днів}. {s}',
    streakProgressOf: '{n} з {m}',
    streakGoalWeek: 'Тиждень',
    streakGoalMonth: 'Місяць',
    streakGoalDays: '{m} {m|день|дні|днів}',
    streakContinue: 'Продовжити',
    streakAchChip: 'Досягнення: {a}',
    streakRiskTitle: 'Серія {n} {n|день|дні|днів} згасне опівночі',
    streakRiskBody: 'Ще {t}. Повтори одне слово — і вогник житиме.',
    streakRiskCta: 'Повторити 1 картку',
    streakNotifBody: 'Серія — {n} {n|день|дні|днів}. Одне слово сьогодні — і вона жива.',
    streakSectionTitle: 'Серія',
    streakRemind: 'Нагадувати про серію',
    streakRemindHint: 'О {h}, якщо сьогодні ще нічого не повторено',

    // ── скільки лишилось (formatLeft у src/locale.js) ──
    timeLeftHM: '{h} год {m} хв',
    timeLeftH: '{h} год',
    timeLeftM: '{m} хв',
  },

  de: {
    // ── сканер ──
    scanTorch: 'Taschenlampe',
    scanLangA11y: 'Sprache der Wörter: {l}. Ändern',
    scanFreeLeft: '{n} {n|Gratis-Scan|Gratis-Scans}',
    scanProBadgeA11y: 'Du hast Pro: unbegrenzt scannen',
    scanLastWordA11y: 'Letztes Wort: {w}. In deinen Wörtern öffnen',
    scanZoomA11y: 'Zoom {z}',
    scanShutterPro: 'Scannen — Pro-Funktion',
    scanFirstHint: 'Richte die Kamera auf etwas in deiner Nähe — eine Tasse, eine Pflanze, deine Schlüssel',
    scanErrEmpty: 'Kein Objekt erkannt. Geh näher ran oder schalte die Taschenlampe ein',
    scanProChip: 'Pro · unbegrenzt scannen',

    // ── «Навчання» до першого слова ──
    learnLockedCards: 'Speichere mindestens ein Wort, um sie freizuschalten',
    learnLockedQuiz: 'Wird mit {n} {n|Wort|Wörtern} freigeschaltet',
    learnQuizLeft: 'Noch {k} {k|Wort|Wörter}, dann ist das Quiz frei',
    learnHowTitle: 'So bekommst du dein erstes Wort',
    learnHowText: 'Speichere das Wort des Tages oder scanne etwas in deiner Nähe — dann werden die Karteikarten frei.',
    learnScanPro: 'Unbegrenzt scannen mit Pro',
    learnNoWod: 'Das Wort des Tages erscheint, sobald du online bist',
    learnUnlocked: 'Freigeschaltet!',
    learnTipDaily: 'Jeden Tag ein neues Wort des Tages. Noch {k} {k|Wort|Wörter}, dann ist das Quiz frei.',

    // ── серія: чип, картка, свято, вечір ──
    streakChipA11y: 'Serie: {n} {n|Tag|Tage}. {s}',
    streakProgressOf: '{n} von {m}',
    streakGoalWeek: 'Eine Woche',
    streakGoalMonth: 'Ein Monat',
    streakGoalDays: '{m} {m|Tag|Tage}',
    streakContinue: 'Weiter',
    streakAchChip: 'Erfolg: {a}',
    streakRiskTitle: 'Deine Serie von {n} {n|Tag|Tagen} erlischt um Mitternacht',
    streakRiskBody: 'Noch {t}. Wiederhole ein Wort, damit deine Flamme weiterbrennt.',
    streakRiskCta: '1 Karte wiederholen',
    streakNotifBody: 'Deine Serie: {n} {n|Tag|Tage}. Ein Wort heute hält sie am Leben.',
    streakSectionTitle: 'Serie',
    streakRemind: 'Serien-Erinnerung',
    streakRemindHint: 'Um {h}, wenn du heute noch nichts wiederholt hast',

    // ── скільки лишилось (formatLeft у src/locale.js) ──
    timeLeftHM: '{h} Std. {m} Min.',
    timeLeftH: '{h} Std.',
    timeLeftM: '{m} Min.',
  },

  es: {
    // ── сканер ──
    scanTorch: 'Linterna',
    scanLangA11y: 'Idioma de las palabras: {l}. Cambiar',
    scanFreeLeft: '{n} {n|escaneo gratis|escaneos gratis}',
    scanProBadgeA11y: 'Tienes Pro: escaneos ilimitados',
    scanLastWordA11y: 'Última palabra: {w}. Abrir en tus palabras',
    scanZoomA11y: 'Zoom {z}',
    scanShutterPro: 'Escanear: función Pro',
    scanFirstHint: 'Apunta a cualquier cosa cercana: una taza, una planta, tus llaves',
    scanErrEmpty: 'No veo ningún objeto. Acércate más o enciende la linterna',
    scanProChip: 'Pro · escaneos ilimitados',

    // ── «Навчання» до першого слова ──
    learnLockedCards: 'Guarda al menos una palabra para desbloquear',
    learnLockedQuiz: 'Se desbloquea con {n} {n|palabra|palabras}',
    learnQuizLeft: '{k|Falta|Faltan} {k} {k|palabra|palabras} para desbloquear el quiz',
    learnHowTitle: 'Cómo conseguir tu primera palabra',
    learnHowText: 'Guarda la palabra del día o escanea algo cercano para desbloquear las tarjetas.',
    learnScanPro: 'Escaneos ilimitados con Pro',
    learnNoWod: 'La palabra del día aparecerá cuando tengas conexión',
    learnUnlocked: '¡Desbloqueado!',
    learnTipDaily: 'Una palabra del día nueva, cada día. {k|Falta|Faltan} {k} {k|palabra|palabras} para desbloquear el quiz.',

    // ── серія: чип, картка, свято, вечір ──
    streakChipA11y: 'Racha: {n} {n|día|días}. {s}',
    streakProgressOf: '{n} de {m}',
    streakGoalWeek: 'Una semana',
    streakGoalMonth: 'Un mes',
    streakGoalDays: '{m} {m|día|días}',
    streakContinue: 'Continuar',
    streakAchChip: 'Logro: {a}',
    streakRiskTitle: 'Tu racha de {n} {n|día|días} se apaga a medianoche',
    streakRiskBody: 'Quedan {t}. Repasa una palabra y tu llama seguirá viva.',
    streakRiskCta: 'Repasar 1 tarjeta',
    streakNotifBody: 'Tu racha: {n} {n|día|días}. Una palabra hoy la mantiene viva.',
    streakSectionTitle: 'Racha',
    streakRemind: 'Recordatorio de racha',
    streakRemindHint: 'A las {h} si hoy aún no has repasado nada',

    // ── скільки лишилось (formatLeft у src/locale.js) ──
    timeLeftHM: '{h} h {m} min',
    timeLeftH: '{h} h',
    timeLeftM: '{m} min',
  },
};
