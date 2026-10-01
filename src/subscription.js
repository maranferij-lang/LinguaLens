// Підписка LinguaLens Pro.
//
// ЦІНОВА ЛОГІКА
// Драбина побудована так, щоб тиждень був найдорожчим у перерахунку на рік, а
// рік — найдешевшим. Тижневий тариф тут не для того, щоб на ньому сиділи: він
// існує як якір, поруч з яким річний виглядає очевидним вибором.
//
//   тиждень   $4.99  →  $259/рік   (×7.4 від річного)
//   місяць    $6.99  →  $84/рік    (×2.4)
//   3 місяці  $16.99 →  $68/рік    (×1.9)
//   рік       $34.99 →  $35/рік    ← 7 днів безкоштовно
//
// Річний із пробним тижнем — головний тариф. Конкурент (CapWords, лауреат
// Apple Design Award) тримає $5.99/міс і $29.99/рік, тож ми в тому ж полі,
// але з відчутно кращою річною економією у показі.
//
// ПРО ПРОБНИЙ ПЕРІОД — і чому він тут чесний
// Занепокоєння справедливе: тріал, після якого тихо списуються гроші, — це
// темний патерн, і він повертається одиничками в App Store та поверненнями
// коштів. Але сам по собі тріал не є обманом; обманом його робить
// замовчування. Тому:
//   1. У пейволі прямим текстом написано, коли і скільки спишеться.
//   2. За 2 дні до кінця застосунок сам надсилає нагадування (scheduleTrialReminder,
//      ставить App.js після покупки з пробним періодом).
//      Apple теж надсилає своє, але ми не покладаємось на це.
//   3. Скасувати можна в один дотик, і посилання на це є в налаштуваннях.
// Якщо після тесту відчуття все одно неприємне — вимкни тріал одним рядком:
// прибери trialDays з річного плану, і вся механіка зникне сама.
//
// ЛОГІКА ЛІМІТІВ
// Обмежуємо те, що коштує нам грошей (виклики AI), і те, що показує цінність
// накопичення (розмір словника). НЕ обмежуємо слово дня, повторення й
// вимову — це саме те, що вертає людину щодня. Задушити retention, щоб
// продати підписку, — найдорожча помилка.
import AsyncStorage from '@react-native-async-storage/async-storage';

export const PLANS = [
  {
    id: 'week',
    productId: 'com.marik.lingualens.pro.week',
    days: 7,
    price: '$4.99',
    perMonth: '$21.6',
    labelKey: 'planWeek',
  },
  {
    id: 'month',
    productId: 'com.marik.lingualens.pro.month',
    days: 30,
    price: '$6.99',
    perMonth: '$6.99',
    labelKey: 'planMonth',
  },
  {
    id: 'quarter',
    productId: 'com.marik.lingualens.pro.quarter',
    days: 90,
    price: '$16.99',
    perMonth: '$5.66',
    labelKey: 'planQuarter',
    saveKey: 'save19',
  },
  {
    id: 'year',
    productId: 'com.marik.lingualens.pro.year',
    days: 365,
    price: '$34.99',
    perMonth: '$2.92',
    labelKey: 'planYear',
    saveKey: 'save58',
    trialDays: 7,
    best: true,
  },
];

// Що дає безкоштовний рівень
export const FREE = {
  scansPerDay: 5,
  maxWords: 100,
  languagePairs: 1,
};

// Кеш денного лічильника сканів. Рахує сервер (за id пристрою), тут лише
// його остання відповідь — щоб показати пейвол ще ДО зйомки. Стан підписки
// живе в src/purchases.js (RevenueCat).
const K_USAGE = 'll_usage_v1';

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Облік сканів ────────────────────────────────────────────────────────────
export async function loadUsage() {
  try {
    const raw = await AsyncStorage.getItem(K_USAGE);
    const u = raw ? JSON.parse(raw) : null;
    // новий день — лічильник з нуля
    if (!u || u.day !== today()) return { day: today(), scans: 0 };
    return u;
  } catch (_) {
    return { day: today(), scans: 0 };
  }
}

export async function saveUsage(usage) {
  try {
    await AsyncStorage.setItem(K_USAGE, JSON.stringify(usage));
  } catch (_) {}
}

// ── Воротар ─────────────────────────────────────────────────────────────────
// Повертає null, якщо дію можна робити, або причину відмови.
// Причина — це рядок, за яким пейвол розуміє, ЯКИЙ саме аргумент показати:
// людині, що вичерпала скани, і людині, що набила словник, треба різне.

// Скільки сканів витрачено СЬОГОДНІ. Стан `usage` вантажиться при старті і
// живе, поки застосунок відкритий, — якщо його не закривали з учорашнього
// вечора, там лежить учорашній лічильник, і без цієї перевірки людина
// вранці впиралась би у вчорашній ліміт.
function usedToday(usage) {
  return usage && usage.day === today() ? usage.scans || 0 : 0;
}

export function canScan({ pro, usage }) {
  if (pro) return null;
  if (usedToday(usage) >= FREE.scansPerDay) return 'scans';
  return null;
}

export function scansLeft({ pro, usage }) {
  if (pro) return Infinity;
  return Math.max(0, FREE.scansPerDay - usedToday(usage));
}

export function canSaveWord({ pro, wordCount }) {
  if (pro) return null;
  if (wordCount >= FREE.maxWords) return 'words';
  return null;
}

// Перемикатися на мову, у якій уже є слова, можна завжди — інакше людина, що
// колись зібрала слова у двох мовах, не змогла б повернутись до жодної з них.
export function canUseLanguage({ pro, words, nextLang }) {
  if (pro) return null;
  const used = new Set(words.map((w) => w.lang || 'en'));
  if (used.has(nextLang)) return null;
  if (used.size >= FREE.languagePairs) return 'langs';
  return null;
}

// Переваги Pro — використовуються і в пейволі, і в налаштуваннях.
// Порядок не випадковий: спершу те, через що людина сюди прийшла.
// Переваги Pro. Тут лише те, що людина реально відчує.
// «Експорт у файл» звідси прибраний свідомо: ним користуються одиниці, а в
// списку він займає місце справжнього аргументу і розмиває цінність.
export const PRO_BENEFITS = [
  { id: 'scans', icon: 'scan' },
  { id: 'words', icon: 'book' },
  { id: 'langs', icon: 'globe' },
  { id: 'support', icon: 'heart' },
];

// Порівняння «без підписки / з підпискою». Головний елемент пейволу:
// людина має бачити не список благ, а СВОЮ ситуацію і те, як вона зміниться.
export const COMPARISON = [
  { id: 'scans', free: String(FREE.scansPerDay), pro: '∞' },
  { id: 'words', free: '100', pro: '∞' },
  { id: 'langs', free: '1', pro: '29' },
  { id: 'wod', free: true, pro: true },
  { id: 'srs', free: true, pro: true },
  { id: 'speech', free: true, pro: true },
];
