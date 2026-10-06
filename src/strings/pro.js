// Рядки v1.3 потоку W5 (Pro: кольорові теми, пейвол, умови тарифів). Власник — W5; інші потоки
// цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у чотирьох
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській, без емодзі й капсу.
// Ключ, який уже є в іншому фрагменті, не дублюємо. Наявний ключ із
// src/i18n.js перекриваємо, лише назвавши його в OVERRIDES (стереже
// __tests__/i18nFragments.test.js). Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// Назви палітр (palette_*) — ті самі слова, що й у pwThemesText: людина
// бачить їх і під плитками в Параметрах, і в пейволі.
// pwWodTitle / pro_wodn: {n} — найбільший варіант «слів дня» для Pro
// (PRO_WOD_OPTIONS у src/flags.js), а не число в тексті.
export const OVERRIDES = [];

export default {
  en: {
    // ── W5 ──
    // Параметри → «Тема»
    paletteLabel: 'Palette',
    palette_chalk: 'Chalk',
    palette_ocean: 'Ocean',
    palette_berry: 'Berry',
    palette_graphite: 'Graphite',
    palette_cocoa: 'Cocoa',
    paletteProHint: 'Palettes with a crown come with Pro. They color your Home Screen widgets too.',
    paletteHint: 'Your palette colors your Home Screen widgets too.',
    paletteKept: '{p} comes back with Pro. Until then, the app uses Chalk.',
    paletteA11yPro: '{p}, Pro palette',
    themeModeA11y: 'Appearance',

    // Пейвол «themes»
    pwThemesTitle: 'Color themes with Pro',
    pwThemesText: 'Ocean, Berry, Graphite or Cocoa, in light and dark. Your widgets change color too.',
    pwThemesPreview: 'How the app looks in {p}',
    themeSampleWord: 'el pasaporte',
    themeSampleIpa: '/el pasaˈpoɾte/',
    themeSampleTr: 'passport',

    // Пейвол «wod_per_day»
    pwWodTitle: 'Up to {n} {n|word|words} a day with Pro',
    pwWodText: 'In notifications and widgets, at times you choose. Your first word of the day stays free.',

    // Таблиця порівняння й переваги Pro
    cmp_wodn: 'Words of the day',
    cmp_themes: 'Color themes',
    cmp_core: 'Flashcards, quiz, widgets',
    cmpUpTo: 'up to {n}',
    cmpNone: 'none',
    cmpNew: 'new',
    pro_wodn: 'Up to {n} {n|word|words} of the day, at times you choose',
    pro_themes: 'Color themes for the app and widgets',
  },

  uk: {
    // ── W5 ──
    // Параметри → «Тема»
    paletteLabel: 'Палітра',
    palette_chalk: 'Крейда',
    palette_ocean: 'Океан',
    palette_berry: 'Ягода',
    palette_graphite: 'Графіт',
    palette_cocoa: 'Какао',
    paletteProHint: 'Палітри з короною доступні з Pro. Вони фарбують і віджети на головному екрані.',
    paletteHint: 'Палітра фарбує і віджети на головному екрані.',
    paletteKept: '{p} повернеться разом із Pro. Поки що застосунок у «Крейді».',
    paletteA11yPro: '{p}, палітра Pro',
    themeModeA11y: 'Вигляд',

    // Пейвол «themes»
    pwThemesTitle: 'Кольорові теми з Pro',
    pwThemesText: 'Океан, Ягода, Графіт чи Какао у світлому й темному вигляді. Віджети теж змінять колір.',
    pwThemesPreview: 'Так виглядатиме застосунок у палітрі {p}',
    themeSampleWord: 'boarding pass',
    themeSampleIpa: '/ˈbɔːdɪŋ pɑːs/',
    themeSampleTr: 'посадковий талон',

    // Пейвол «wod_per_day»
    pwWodTitle: 'До {n} {n|слова|слів|слів} на день із Pro',
    pwWodText: 'У сповіщеннях і віджеті, о годинах, які обереш. Перше слово дня лишається безкоштовним.',

    // Таблиця порівняння й переваги Pro
    cmp_wodn: 'Слова дня',
    cmp_themes: 'Кольорові теми',
    cmp_core: 'Картки, квіз, віджети',
    cmpUpTo: 'до {n}',
    cmpNone: 'немає',
    cmpNew: 'нове',
    pro_wodn: 'До {n} {n|слова|слів|слів} дня о годинах, які обереш',
    pro_themes: 'Кольорові теми для застосунку й віджетів',
  },

  de: {
    // ── W5 ──
    // Параметри → «Тема»
    paletteLabel: 'Farbpalette',
    palette_chalk: 'Kreide',
    palette_ocean: 'Ozean',
    palette_berry: 'Beere',
    palette_graphite: 'Graphit',
    palette_cocoa: 'Kakao',
    paletteProHint: 'Paletten mit Krone gibt es mit Pro. Sie färben auch deine Widgets auf dem Home-Bildschirm.',
    paletteHint: 'Deine Palette färbt auch die Widgets auf dem Home-Bildschirm.',
    paletteKept: '{p} kommt mit Pro zurück. Bis dahin nutzt die App Kreide.',
    paletteA11yPro: '{p}, Pro-Palette',
    themeModeA11y: 'Erscheinungsbild',

    // Пейвол «themes»
    pwThemesTitle: 'Farbthemen mit Pro',
    pwThemesText: 'Ozean, Beere, Graphit oder Kakao, jeweils hell und dunkel. Auch deine Widgets wechseln die Farbe.',
    pwThemesPreview: 'So sieht die App in {p} aus',
    themeSampleWord: 'boarding pass',
    themeSampleIpa: '/ˈbɔːdɪŋ pɑːs/',
    themeSampleTr: 'Bordkarte',

    // Пейвол «wod_per_day»
    pwWodTitle: 'Bis zu {n} {n|Wort|Wörter} am Tag mit Pro',
    pwWodText: 'In Mitteilungen und Widgets, zu Uhrzeiten, die du wählst. Dein erstes Wort des Tages bleibt gratis.',

    // Таблиця порівняння й переваги Pro
    cmp_wodn: 'Wörter des Tages',
    cmp_themes: 'Farbthemen',
    cmp_core: 'Karteikarten, Quiz, Widgets',
    cmpUpTo: 'bis {n}',
    cmpNone: 'keine',
    cmpNew: 'neu',
    pro_wodn: 'Bis zu {n} {n|Wort|Wörter} des Tages, zu Uhrzeiten deiner Wahl',
    pro_themes: 'Farbthemen für App und Widgets',
  },

  es: {
    // ── W5 ──
    // Параметри → «Тема»
    paletteLabel: 'Paleta',
    palette_chalk: 'Tiza',
    palette_ocean: 'Océano',
    palette_berry: 'Baya',
    palette_graphite: 'Grafito',
    palette_cocoa: 'Cacao',
    paletteProHint: 'Las paletas con corona son de Pro. También colorean tus widgets de la pantalla de inicio.',
    paletteHint: 'Tu paleta también colorea los widgets de la pantalla de inicio.',
    paletteKept: '{p} vuelve con Pro. Mientras tanto, la app usa Tiza.',
    paletteA11yPro: '{p}, paleta Pro',
    themeModeA11y: 'Apariencia',

    // Пейвол «themes»
    pwThemesTitle: 'Temas de color con Pro',
    pwThemesText: 'Océano, Baya, Grafito o Cacao, en claro y oscuro. Tus widgets también cambian de color.',
    pwThemesPreview: 'Así se ve la app en {p}',
    themeSampleWord: 'boarding pass',
    themeSampleIpa: '/ˈbɔːdɪŋ pɑːs/',
    themeSampleTr: 'tarjeta de embarque',

    // Пейвол «wod_per_day»
    pwWodTitle: 'Hasta {n} {n|palabra|palabras} al día con Pro',
    pwWodText: 'En notificaciones y widgets, a las horas que elijas. Tu primera palabra del día sigue siendo gratis.',

    // Таблиця порівняння й переваги Pro
    cmp_wodn: 'Palabras del día',
    cmp_themes: 'Temas de color',
    cmp_core: 'Tarjetas, quiz, widgets',
    cmpUpTo: 'hasta {n}',
    cmpNone: 'ninguno',
    cmpNew: 'nuevo',
    pro_wodn: 'Hasta {n} {n|palabra|palabras} del día, a las horas que elijas',
    pro_themes: 'Temas de color para la app y los widgets',
  },
};
