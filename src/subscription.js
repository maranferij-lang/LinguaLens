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
//   місяць    $9.99   →  $119.88/рік
//   рік       $59.99  →  $4.99/міс, −50% до місячного   ← 7 днів безкоштовно
//   назавжди  $129.99 —  одна оплата, ≈2,2 річних
// (рішення власника 5 жовтня 2026; Україна — ті самі долари, MONETIZATION.md).
// Ціни нижче — запасні, для імітації в розробці. У збірці з магазином суми,
// «на місяць» і «−N%» приходять з App Store (plansFromOffering у purchases.js).
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
// ЛОГІКА ЛІМІТІВ (v1.3: «словник безкоштовний, скан — один на пробу»)
// Обмежуємо лише те, що коштує нам грошей, — виклики AI: один безкоштовний
// скан за все життя (не на день: кожен виклик AI — це гроші) і одну пробу
// скану цілої кімнати, яка теж займає цей скан. Словник, картки, квіз, слово
// дня, віджет і вимова — без меж: саме вони вертають людину щодня, і
// застосунок, «марний, доки не заплатиш», — скарга номер один у цій категорії.
// Pro у v1.3 ще й ДОДАЄ (а не відкриває заблоковане): 3 або 5 слів дня на
// день о годинах людини і чотири кольорові палітри. Ліміту колекції й
// захисту серії в v1.3 немає — у таблиці пейволу їх теж немає (MONETIZATION.md).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { PALETTES_ENABLED, PRO_WOD_OPTIONS } from './flags';
import { PRO_PALETTES } from './theme';

// legalKey — рядок «безкоштовно до…, потім ціна за період»: пробний період
// може бути на будь-якому тарифі, і період у ньому мусить бути саме цей.
// perMonth і save — похідні від ціни, порахані так само, як для цін з App
// Store: perMonth — ціна ÷ кількість місяців, униз до цента (так його дає
// RevenueCat, pricePerMonthString), save — знижка до місячного в цілих
// відсотках (plansFromOffering у purchases.js). Тест у
// __tests__/purchases.test.js звіряє їх із ціною — змінив суму, зміни й їх.
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
    price: '$9.99',
    perMonth: '$9.99',
    labelKey: 'planMonth',
    legalKey: 'trialLegalMonth',
  },
  // Квартал не продається (MONETIZATION.md, розділ 2) — ціна довідкова, щоб
  // сходинка лишалась між місяцем і роком: $24.99 ÷ 3 = $8.33, −17%.
  {
    id: 'quarter',
    productId: 'com.marik.lingualens.pro.quarter',
    days: 90,
    price: '$24.99',
    perMonth: '$8.33',
    labelKey: 'planQuarter',
    legalKey: 'trialLegalQuarter',
    save: 17,
  },
  // $59.99 ÷ 12 = $4.999 → $4.99 на місяць; 1 − 4.999 / 9.99 = 49,96% → −50%
  {
    id: 'year',
    productId: 'com.marik.lingualens.pro.year',
    days: 365,
    price: '$59.99',
    perMonth: '$4.99',
    labelKey: 'planYear',
    legalKey: 'trialLegalYear',
    save: 50,
    trialDays: 7,
    best: true,
  },
  // Одна оплата — Pro назавжди. Ціна тут — лише для імітації в розробці.
  {
    id: 'lifetime',
    productId: 'com.marik.lingualens.pro.lifetime',
    days: null,
    price: '$129.99',
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

// Що дає безкоштовний рівень. Стелі задає сервер (FREE_SCANS, FREE_SCENES)
// і віддає разом із лічильниками; тут — запасні значення на випадок, коли
// сервер ще не відповідав. Обидві — за все життя запису (анонімного
// пристрою чи акаунта Apple), а не на день.
export const FREE = {
  // один скан на пробу — далі Pro
  scans: 1,
  // скан цілої кімнати — функція Pro, але одну сцену за все життя можна
  // спробувати безкоштовно (вона ще й займає безкоштовний скан)
  scenes: 1,
  languagePairs: 1,
};

// Кеш лічильника сканів за все життя. Рахує сервер (за записом пристрою чи
// акаунта), тут лише його остання відповідь — щоб показати пейвол ще ДО
// зйомки. Стан підписки живе в src/purchases.js (RevenueCat).
// Ключ лишився з часів денного ліміту, і це безпечно: старий кеш тримає
// скани ОДНОГО дня, а їх не буває більше, ніж за все життя. Тож він або
// блокує по праву, або недораховує — тоді сервер відмовить 402 без виклику
// AI, а /me при старті однаково перепише кеш свіжими числами.
const K_USAGE = 'll_usage_v1';

// ── Облік сканів ────────────────────────────────────────────────────────────
// Лічильник довічний: новий день його не обнуляє — кеш, збережений учора,
// блокує і сьогодні, доки сервер не скаже інакше.
export async function loadUsage() {
  try {
    const raw = await AsyncStorage.getItem(K_USAGE);
    const u = raw ? JSON.parse(raw) : null;
    return u && typeof u === 'object' ? u : { scans: 0 };
  } catch (_) {
    return { scans: 0 };
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
// людині, що вже витратила безкоштовний скан, і людині, що хоче сканувати
// кімнати, треба різне.

// Скільки сканів витрачено за все життя запису. Дня тут немає свідомо:
// завтра безкоштовних сканів не додасться.
function usedScans(usage) {
  return (usage && usage.scans) || 0;
}

// Стелю задає сервер (FREE_SCANS) і віддає разом із лічильником: для тестів
// її піднімають до тисячі, і клієнт не має різати на одному.
// null — сервер бачить Pro, стелі немає. Старий кеш без поля — FREE.
function scanLimit(usage) {
  return usage && usage.limit !== undefined ? usage.limit : FREE.scans;
}

// Скільки безкоштовних сканів показувати в пейволі й таблиці.
export function freeScans(usage) {
  return usage?.limit ?? FREE.scans;
}

export function canScan({ pro, usage }) {
  if (pro) return null;
  const limit = scanLimit(usage);
  if (limit !== null && usedScans(usage) >= limit) return 'scans';
  return null;
}

export function scansLeft({ pro, usage }) {
  const limit = scanLimit(usage);
  if (pro || limit === null) return Infinity;
  return Math.max(0, limit - usedScans(usage));
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
// Рядки «слова дня» й «теми» є, лише коли ці функції ввімкнені прапорцями
// (src/flags.js): обіцяти вимкнене не можна (App Review 3.1.2). wodn — {n}:
// найбільший варіант слів дня для Pro.
export function proBenefits({ wodOptions = PRO_WOD_OPTIONS, palettes = PALETTES_ENABLED } = {}) {
  const most = wodOptions.length ? Math.max(...wodOptions) : 0;
  return [
    { id: 'scans', icon: 'scan' },
    { id: 'scene', icon: 'room' },
    ...(most ? [{ id: 'wodn', icon: 'bell', n: most }] : []),
    ...(palettes ? [{ id: 'themes', icon: 'palette' }] : []),
    { id: 'langs', icon: 'globe' },
    { id: 'support', icon: 'heart' },
  ];
}
export const PRO_BENEFITS = proBenefits();

// Головні чотири — для мʼякого пейволу й таймлайну пробного періоду: скани,
// сцени й нове у v1.3. Вимкнене прапорцем місце займає наступна перевага
// (мови), тож рядків завжди чотири.
export function topBenefits(list = PRO_BENEFITS, n = 4) {
  return list.filter((b) => b.id !== 'support').slice(0, n);
}

// Порівняння «без підписки / з підпискою». Головний елемент пейволу:
// людина має бачити не список благ, а СВОЮ ситуацію і те, як вона зміниться.
// Нижній рядок з галочками з обох боків — теж аргумент: безкоштовне лишається
// безкоштовним, Pro нічого в людини не забирає.
//   upTo — значення Pro «до N» (cmpUpTo); none — у безкоштовному цього немає:
//   free: false, тиха позначка ✕ (не риска: тире власник заборонив), VoiceOver
//   читає «немає»; fresh — нове у v1.3 (позначка «нове»).
// Рядки слів дня й тем — лише з увімкненими прапорцями; без варіантів слів
// дня на їхньому місці звичайне «Слово дня ✓ / ✓». Ліміту колекції й
// захисту серії тут немає ніколи: у v1.3 їх немає в застосунку.
export function comparison({ wodOptions = PRO_WOD_OPTIONS, palettes = PALETTES_ENABLED } = {}) {
  const most = wodOptions.length ? Math.max(...wodOptions) : 0;
  return [
    { id: 'scans', free: String(FREE.scans), pro: '∞' },
    { id: 'scene', free: String(FREE.scenes), pro: '∞' },
    { id: 'langs', free: String(FREE.languagePairs), pro: '29' },
    most ? { id: 'wodn', free: '1', pro: most, upTo: true, fresh: true } : { id: 'wod', free: true, pro: true },
    ...(palettes ? [{ id: 'themes', free: false, none: true, pro: String(PRO_PALETTES.length), fresh: true }] : []),
    { id: 'core', free: true, pro: true },
  ];
}
export const COMPARISON = comparison();
