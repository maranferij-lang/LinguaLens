// Підписка LinguaLens Pro.
//
// ЦІНОВА ЛОГІКА
// Тарифи — те, що має поточна пропозиція (offering) у RevenueCat: застосунок
// не вирішує сам, які пакети існують, а малює ті, що прийшли з магазину.
// PLANS нижче — лише довідник підписів і юридичних рядків для кожного типу
// пакета. Основна сітка (v1.2): місяць, рік із пробним тижнем і «назавжди».
// Тиждень і квартал лишаються в довіднику: якщо їх колись додадуть у
// пропозицію (наприклад, для експерименту RevenueCat), вони просто з'являться.
//
//   місяць    $6.99  →  $84/рік
//   рік       $34.99 →  $35/рік    ← 7 днів безкоштовно
//   назавжди  одна оплата, ≈2–2.5 річних (ціна — в App Store Connect)
//
// «Назавжди» — для тих, хто не хоче ще однієї підписки. Це не підписка:
// без пробного періоду, без «на місяць», без знижки у відсотках, і юридичний
// рядок прямо каже, що нічого не продовжується.
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
// Пробний період задається в App Store Connect; без нього вся механіка
// (таймлайн, «спробуй безкоштовно») зникає сама.
//
// ЛОГІКА ЛІМІТІВ (v1.2: «словник безкоштовний, скани платні»)
// Обмежуємо лише те, що коштує нам грошей, — виклики AI: один скан на день і
// одну пробу скану цілої кімнати за все життя. Словник, картки, слово дня,
// віджет і вимова — без меж: саме вони вертають людину щодня, і застосунок,
// «марний, доки не заплатиш», — скарга номер один у цій категорії.
import AsyncStorage from '@react-native-async-storage/async-storage';

// legalKey — рядок «безкоштовно до…, потім ціна за період»: пробний період
// може бути на будь-якому тарифі, і період у ньому мусить бути саме цей.
export const PLANS = [
  {
    id: 'week',
    productId: 'com.marik.lingualens.pro.week',
    days: 7,
    price: '$4.99',
    perMonth: '$21.6',
    labelKey: 'planWeek',
    legalKey: 'trialLegalWeek',
  },
  {
    id: 'month',
    productId: 'com.marik.lingualens.pro.month',
    days: 30,
    price: '$6.99',
    perMonth: '$6.99',
    labelKey: 'planMonth',
    legalKey: 'trialLegalMonth',
  },
  {
    id: 'quarter',
    productId: 'com.marik.lingualens.pro.quarter',
    days: 90,
    price: '$16.99',
    perMonth: '$5.66',
    labelKey: 'planQuarter',
    legalKey: 'trialLegalQuarter',
    saveKey: 'save19',
  },
  {
    id: 'year',
    productId: 'com.marik.lingualens.pro.year',
    days: 365,
    price: '$34.99',
    perMonth: '$2.92',
    labelKey: 'planYear',
    legalKey: 'trialLegalYear',
    saveKey: 'save58',
    trialDays: 7,
    best: true,
  },
  // Одна оплата — Pro назавжди. Ціна тут — лише для імітації в розробці.
  {
    id: 'lifetime',
    productId: 'com.marik.lingualens.pro.lifetime',
    days: null,
    price: '$79.99',
    perMonth: null,
    labelKey: 'planLifetime',
    legalKey: 'lifetimeLegal',
    lifetime: true,
  },
];

// Імітація покупок у розробці показує ту саму сітку, що й пропозиція
// `default` у RevenueCat: місяць, рік, назавжди.
export const SIMULATED_PLANS = PLANS.filter((p) => ['month', 'year', 'lifetime'].includes(p.id));

// За скільки днів до кінця пробного періоду нагадуємо (див. пункт 2 вище):
// і таймлайн пейволу, і саме сповіщення (scheduleTrialReminder) беруть
// число звідси — обіцянка й дія не можуть розійтись.
export const TRIAL_REMIND_DAYS = 2;

// Що дає безкоштовний рівень. Стелі задає сервер (FREE_SCANS_PER_DAY,
// FREE_SCENES) і віддає разом із лічильниками; тут — запасні значення на
// випадок, коли сервер ще не відповідав.
export const FREE = {
  scansPerDay: 1,
  // скан цілої кімнати — функція Pro, але одну сцену за все життя можна
  // спробувати безкоштовно (вона ще й займає денний скан)
  scenes: 1,
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
    // новий день — денний лічильник з нуля; стеля — та сама, що казав
    // сервер; сцени довічні — їх новий день не обнуляє
    if (!u || u.day !== today()) return { day: today(), scans: 0, limit: u?.limit, ...sceneFields(u) };
    return u;
  } catch (_) {
    return { day: today(), scans: 0 };
  }
}

function sceneFields(u) {
  const out = {};
  if (u && u.scenes !== undefined) out.scenes = u.scenes;
  if (u && u.sceneLimit !== undefined) out.sceneLimit = u.sceneLimit;
  return out;
}

export async function saveUsage(usage) {
  try {
    await AsyncStorage.setItem(K_USAGE, JSON.stringify(usage));
  } catch (_) {}
}

// ── Воротар ─────────────────────────────────────────────────────────────────
// Повертає null, якщо дію можна робити, або причину відмови.
// Причина — це рядок, за яким пейвол розуміє, ЯКИЙ саме аргумент показати:
// людині, що вичерпала скани на сьогодні, і людині, що хоче сканувати
// кімнати, треба різне.

// Скільки сканів витрачено СЬОГОДНІ. Стан `usage` вантажиться при старті і
// живе, поки застосунок відкритий, — якщо його не закривали з учорашнього
// вечора, там лежить учорашній лічильник, і без цієї перевірки людина
// вранці впиралась би у вчорашній ліміт.
function usedToday(usage) {
  return usage && usage.day === today() ? usage.scans || 0 : 0;
}

// Денну стелю задає сервер (FREE_SCANS_PER_DAY) і віддає разом із лічильником:
// для тестів її піднімають до тисячі, і клієнт не має різати на одному.
// null — сервер бачить Pro, стелі немає. Старий кеш без поля — FREE.
function dailyLimit(usage) {
  return usage && usage.limit !== undefined ? usage.limit : FREE.scansPerDay;
}

// Скільки безкоштовних сканів на день показувати в пейволі й таблиці.
export function freeScansPerDay(usage) {
  return usage?.limit ?? FREE.scansPerDay;
}

export function canScan({ pro, usage }) {
  if (pro) return null;
  const limit = dailyLimit(usage);
  if (limit !== null && usedToday(usage) >= limit) return 'scans';
  return null;
}

export function scansLeft({ pro, usage }) {
  const limit = dailyLimit(usage);
  if (pro || limit === null) return Infinity;
  return Math.max(0, limit - usedToday(usage));
}

// ── Сцени (скан цілої кімнати) ──────────────────────────────────────────────
// Сервер рахує сцени за все життя запису і віддає { scenes, sceneLimit }:
// sceneLimit null — Pro, без меж. Кеш від старого сервера цих полів не має —
// тоді клієнт не забороняє нічого, а вирішує сервер (402 SCENE_PRO).
function sceneLimitOf(usage) {
  return usage && usage.sceneLimit !== undefined ? usage.sceneLimit : FREE.scenes;
}

export function scenesLeft({ pro, usage }) {
  const limit = sceneLimitOf(usage);
  if (pro || limit === null || !usage || usage.scenes === undefined) return Infinity;
  return Math.max(0, limit - (usage.scenes || 0));
}

export function canScene({ pro, usage }) {
  return scenesLeft({ pro, usage }) > 0 ? null : 'scene';
}

// Скільки безкоштовних сцен показувати в пейволі й таблиці
export function freeScenes(usage) {
  return usage?.sceneLimit ?? FREE.scenes;
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

// Переваги Pro — для пейволу. Тут лише те, що людина реально відчує.
// Порядок не випадковий: спершу те, через що людина сюди прийшла.
// «Експорт у файл» звідси прибраний свідомо: ним користуються одиниці, а в
// списку він займає місце справжнього аргументу і розмиває цінність.
export const PRO_BENEFITS = [
  { id: 'scans', icon: 'scan' },
  { id: 'scene', icon: 'room' },
  { id: 'langs', icon: 'globe' },
  { id: 'support', icon: 'heart' },
];

// Порівняння «без підписки / з підпискою». Головний елемент пейволу:
// людина має бачити не список благ, а СВОЮ ситуацію і те, як вона зміниться.
// Нижні рядки з галочками з обох боків — теж аргумент: безкоштовне лишається
// безкоштовним, Pro нічого в людини не забирає.
export const COMPARISON = [
  { id: 'scans', free: String(FREE.scansPerDay), pro: '∞' },
  { id: 'scene', free: String(FREE.scenes), pro: '∞' },
  { id: 'langs', free: String(FREE.languagePairs), pro: '29' },
  { id: 'wod', free: true, pro: true },
  { id: 'srs', free: true, pro: true },
  { id: 'speech', free: true, pro: true },
];
