// Чиста геометрія й форматування для карток і наліпок «поділитись».
//
// Тут немає ні React, ні react-native: усе, що вирішує, як картка чи
// наліпка виглядає (кегль слова, висоти стовпчиків, колаж, фішки сцени,
// дати, які кнопки показати), перевіряється jest-ом без моків. Компоненти
// в ShareCards.js, Stickers.js і ShareSheet.js лише розкладають готові числа.

// Логічний розмір картки — 9:16, як Stories. Верстаємо завжди в цих точках,
// а в PNG віддаємо рівно 1080×1920: це рідний розмір Instagram Stories,
// тож ні Instagram, ні Telegram не перетискатимуть картинку вдруге.
export const CARD_W = 360;
export const CARD_H = 640;
export const EXPORT_W = 1080;
export const EXPORT_H = 1920;

// Поля. Зверху й знизу більші, ніж з боків: Instagram малює поверх Stories
// аватар зверху й поле відповіді знизу — головне має жити поза ними.
export const PAD_X = 32;
export const PAD_TOP = 52;
export const PAD_BOTTOM = 48;
export const CONTENT_W = CARD_W - PAD_X * 2;

// ─── Палітри ───────────────────────────────────────────────────────────────
// Кожна пара «текст/тло» тримає WCAG AA (≥ 4.5:1) — це перевіряє тест.
// Через це «приглушений» на фіолетовому не rgba(255,255,255,0.72), як
// хотілося спершу (3.9:1), а лавандовий #E4E1FB (4.7:1), а «Захід сонця» —
// глибокий корал #C0432F: яскравий #F26B4F з білим тексту дає лише 3:1.
//   pill / pillText — підкладка й текст транскрипції;
//   line — волосяні лінії й «порожні» стовпчики графіка;
//   tile / onTile — плитка з літерою, коли фото немає;
//   tiers — обідок медалі за рівнем досягнення: бронза, срібло, акцент.
export const PALETTES = [
  {
    key: 'violet',
    label: 'sharePalViolet',
    bg: '#5B4FD6',
    text: '#FFFFFF',
    muted: '#E4E1FB',
    accent: '#FFFFFF',
    pill: '#6F64DB',
    pillText: '#FFFFFF',
    line: '#8279E0',
    tile: '#FFFFFF',
    onTile: '#5B4FD6',
    tiers: ['#E9B98A', '#D9DAE6', '#FFFFFF'],
  },
  {
    key: 'chalk',
    label: 'sharePalChalk',
    bg: '#FAF8F4',
    text: '#1F1B16',
    muted: '#66625A',
    accent: '#5B4FD6',
    pill: '#ECE9FB',
    pillText: '#5B4FD6',
    line: '#E2DED7',
    tile: '#5B4FD6',
    onTile: '#FFFFFF',
    tiers: ['#C98F5C', '#A7ABB5', '#5B4FD6'],
  },
  {
    key: 'graphite',
    label: 'sharePalGraphite',
    bg: '#151412',
    text: '#F5F1EA',
    muted: '#A9A49B',
    accent: '#9B8FFF',
    pill: '#272623',
    pillText: '#C3BBFF',
    line: '#34322E',
    tile: '#9B8FFF',
    onTile: '#151412',
    tiers: ['#C99467', '#B5B8C2', '#9B8FFF'],
  },
  {
    key: 'sunset',
    label: 'sharePalSunset',
    bg: '#C0432F',
    text: '#FFFFFF',
    muted: '#FFEDE5',
    accent: '#FFFFFF',
    pill: '#B33A27',
    pillText: '#FFFFFF',
    line: '#D06A59',
    tile: '#FFFFFF',
    onTile: '#C0432F',
    tiers: ['#F6C79B', '#F1E6E2', '#FFFFFF'],
  },
];

export function paletteByKey(key) {
  return PALETTES.find((p) => p.key === key) || PALETTES[0];
}

export function tierColor(palette, tier) {
  const i = Math.min(Math.max((tier || 1) - 1, 0), palette.tiers.length - 1);
  return palette.tiers[i];
}

// Шаблони сцени: фото на весь кадр — з наліпками, з редакційними
// підписами або вставкою з пронумерованим списком (див. SceneCards.js).
export const SCENE_TEMPLATES = ['sceneStickers', 'sceneLabels', 'sceneFrame'];

// Які картки 9:16 має сенс гортати для цього payload. Слово — три вигляди,
// досягнення й тиждень — по одному: там композиція одна-єдина правильна.
// Колишній четвертий вигляд слова, «Без тла», став окремим режимом
// «Наліпка» (stickerStylesFor нижче) і з карток пішов.
export function templatesFor(payload) {
  if (payload?.kind === 'word' && payload.word) return ['sticker', 'entry', 'minimal'];
  if (payload?.kind === 'scene' && payload.scene) return SCENE_TEMPLATES;
  if (payload?.kind === 'achievement' && payload.achievement) return ['achievement'];
  if (payload?.kind === 'week' && payload.stats) return ['week'];
  return [];
}

// ─── Кегль слова ───────────────────────────────────────────────────────────
// Ширини гліфів Nunito ExtraBold у частках кегля — заміряні з самого TTF
// (hmtx), а не на око. Довге слово має зменшитись ДО рендера:
// adjustsFontSizeToFit — лише страховка, на вебі (прев'ю) його немає взагалі.
const NARROW = new Set("iíìïījlIı'.,:;!|іїј·");
const SEMI = new Set('frt-гт');
const WIDE = new Set('mwжфшщюы');
const WIDE_UP = new Set('MWЖФШЩЮЫ');

function glyphEm(ch) {
  const code = ch.codePointAt(0);
  // CJK, кана, хангиль — у Nunito їх немає, система підставляє квадратні гліфи
  const square =
    (code >= 0x1100 && code <= 0x11ff) ||
    (code >= 0x2e80 && code <= 0xd7af) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff00 && code <= 0xffef);
  if (square) return 1;
  if (ch === ' ') return 0.28;
  if (NARROW.has(ch)) return 0.3;
  if (SEMI.has(ch)) return 0.42;
  if (WIDE.has(ch)) return 0.87;
  if (WIDE_UP.has(ch)) return 1.08;
  if (ch >= '0' && ch <= '9') return 0.6;
  if (ch !== ch.toLowerCase()) return 0.74; // велика літера
  return 0.59;
}

// Ширина рядка в «кеглях». tracking — розрядка на літеру в частках кегля:
// track() для великих кеглів стискає кожну літеру на 0.022, капс навпаки
// розріджено. Без цього оцінка завжди трохи хибить.
export function textEm(text, tracking = -0.022) {
  const chars = Array.from(String(text || ''));
  return chars.reduce((sum, ch) => sum + glyphEm(ch), 0) + chars.length * tracking;
}

export function fontSizeForWord(word, { max = 64, min = 28, width = CONTENT_W, tracking } = {}) {
  const em = textEm(word, tracking);
  if (em <= 0) return max;
  // 4 % запасу: справжній рендер ще додає бокові відступи гліфів
  const fit = Math.floor((width * 0.96) / em);
  return Math.max(min, Math.min(max, fit));
}

// Підпис капсом під числом. Між словами він перенесеться, а всередині слова —
// ні, тож міряємо найдовше слово: «WIEDERHOLUNGEN» у третині картки
// інакше обрізалося б.
export const CAPS_TRACK = 0.06;

export function capsSize(label, width, max = 10, min = 8) {
  const words = String(label || '').toLocaleUpperCase().split(/\s+/);
  return Math.min(...words.map((w) => fontSizeForWord(w, { max, min, width, tracking: CAPS_TRACK })));
}

// ─── Текстові дрібниці ─────────────────────────────────────────────────────

// Транскрипція в косих дужках, як у словнику. Сервер іноді шле вже з ними.
export function ipaLabel(ipa) {
  const s = String(ipa || '').trim();
  if (!s) return '';
  if (s.startsWith('/') || s.startsWith('[')) return s;
  return '/' + s + '/';
}

// Лапки мови прикладу: «ялинки» в укр/ісп, „лапки“ в німецькій, “curly” в англ.
// Прямі "лапки" на картці — перше, що видає зроблене поспіхом.
const QUOTES = {
  uk: ['«', '»'],
  ru: ['«', '»'],
  es: ['«', '»'],
  fr: ['« ', ' »'],
  it: ['«', '»'],
  pt: ['«', '»'],
  no: ['«', '»'],
  el: ['«', '»'],
  tr: ['“', '”'],
  de: ['„', '“'],
  cs: ['„', '“'],
  sk: ['„', '“'],
  da: ['„', '“'],
  pl: ['„', '”'],
  ro: ['„', '”'],
  hu: ['„', '”'],
  nl: ['„', '”'],
  sv: ['”', '”'],
  fi: ['”', '”'],
  ja: ['「', '」'],
  zh: ['「', '」'],
};

// Слово й переклад у парі: «mug · чашка». Тире між ними власник заборонив.
export const PAIR_SEP = ' · ';

export function quote(text, lang) {
  const [open, close] = QUOTES[lang] || ['“', '”'];
  return open + String(text || '').trim() + close;
}

// Скорочує текст до кількох рядків по межі слова. numberOfLines обрізав би
// посеред слова й разом із закривальною лапкою — «…» всередині лапок
// виглядає як задумано, а не як баг верстки. 0.78 — запас на перенесення:
// рядок рідко заповнюється до краю.
export function clipLines(text, lines, fontSize, width = CONTENT_W) {
  const s = String(text || '').trim();
  const budget = lines * (width / fontSize) * 0.78;
  if (textEm(s, 0) <= budget) return s;
  let out = '';
  for (const w of s.split(/\s+/)) {
    const next = out ? out + ' ' + w : w;
    if (textEm(next, 0) > budget - 0.6) break;
    out = next;
  }
  // Хвіст з розділових знаків прибираємо разом із « · » пари і з тире, якщо
  // воно таки прийшло в тексті слова чи прикладу (дані сервера, від людини)
  return out.replace(/[\s,;:.!?·—–-]+$/, '') + '…';
}

// Літера для плитки, коли фото немає. Артикль пропускаємо: для «die Tasse»
// плитка з «D» нічого не каже, з «T» — так.
const ARTICLES = new Set([
  'der', 'die', 'das', 'el', 'la', 'los', 'las', 'le', 'les', "l'", 'il', 'lo', 'gli', 'un', 'una', 'une', 'ein', 'eine',
  'de', 'het', 'een', 'o', 'a', 'os', 'as', 'en', 'ett',
]);

export function initialOf(word) {
  const parts = String(word || '').trim().split(/\s+/).filter(Boolean);
  const main = parts.length > 1 && ARTICLES.has(parts[0].toLowerCase()) ? parts[1] : parts[0];
  const ch = main ? Array.from(main)[0] : '';
  return ch ? ch.toLocaleUpperCase() : '?';
}

// ─── Дати й числа ──────────────────────────────────────────────────────────

// Локаль приходить рядком з i18n. Якщо ключа немає, t() поверне сам ключ —
// а toLocaleDateString('shareLocale') кидає RangeError. Пропускаємо лише
// схоже на справжній мовний тег, інакше — системна локаль.
export function safeLocale(tag) {
  return typeof tag === 'string' && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(tag) ? tag : undefined;
}

function format(date, locale, opts) {
  try {
    return date.toLocaleDateString(locale, opts);
  } catch (_) {
    return date.toLocaleDateString(undefined, opts);
  }
}

// «1 жовт. 2026». Українська локаль дописує « р.» після року — на картці
// поруч із капсом це просто шум.
export function dateLabel(ts, locale) {
  const s = format(new Date(ts), locale, { day: 'numeric', month: 'short', year: 'numeric' });
  return s.replace(/\s*р\.$/, '');
}

// Ключ дня 'YYYY-MM-DD' → локальна північ. new Date('2026-10-01') дав би
// північ за UTC, і в Нью-Йорку тиждень почався б учора.
export function dayFromKey(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}

// «25 вер.–1 жовт.» / «Sep 24–30». formatRange сам знає, як у кожній мові
// скорочувати діапазон у межах місяця; де його немає — просто «а–б».
// Діапазон — коротке тире без пробілів (правило власника: тире з пробілами
// в тексті немає ніде), тож пробіли довкола тире з ICU знімаємо.
const tightRange = (s) => s.replace(/\s*[\u2013\u2014]\s*/g, '\u2013');

export function weekRangeLabel(days, locale) {
  const list = Array.isArray(days) ? days : [];
  const a = dayFromKey(list[0]?.key);
  const b = dayFromKey(list[list.length - 1]?.key);
  if (!a || !b) return '';
  const opts = { day: 'numeric', month: 'short' };
  try {
    const f = new Intl.DateTimeFormat(locale, opts);
    if (typeof f.formatRange === 'function') return tightRange(f.formatRange(a, b));
    return f.format(a) + '\u2013' + f.format(b);
  } catch (_) {
    return format(a, undefined, opts) + '\u2013' + format(b, undefined, opts);
  }
}

// Цифри картки «Мій тиждень» — рівно за ті сім календарних днів, що на
// графіку (days: від найстарішого до сьогодні; value — збереження й
// повторення за день, див. logActivity в App.js). Вікно — від локальної
// півночі першого дня, а не «168 годин тому»: інакше слово з дня, якого на
// графіку вже немає, лічилось би новим. Окремого журналу повторень немає,
// тож повторення тижня = активність тижня мінус слова, збережені за тиждень.
export function weekStats({ days = [], words = [], streak = 0 }) {
  const start = dayFromKey(days[0]?.key)?.getTime() ?? 0;
  const recent = words.filter((w) => (w.addedAt || 0) >= start);
  const active = days.reduce((sum, d) => sum + (d.value || 0), 0);
  return {
    words: words.length,
    weekWords: recent.length,
    streak,
    reviews: Math.max(0, active - recent.length),
    days,
    // найсвіжіші наліпки тижня — для колажу
    stickers: recent
      .filter((w) => w.photo)
      .slice(-6)
      .reverse(),
    langs: [...new Set(recent.map((w) => w.lang || 'en'))],
  };
}

export function formatCount(n, locale) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  try {
    return v.toLocaleString(locale);
  } catch (_) {
    return String(v);
  }
}

// Підписи днів тижня від неділі (як Date#getDay). Рядок перекладу —
// «Нд|Пн|Вт|…» через «|»: однією літерою понеділок і пʼятниця («П»), середа
// й субота («С») однакові. Рядок без «|» — по літері на день, як раніше.
export function weekdayLabels(list) {
  const str = String(list || '');
  return str.includes('|') ? str.split('|') : Array.from(str);
}

// Підпис дня тижня dow (0 — неділя)
export function dayLetter(dow, letters) {
  return weekdayLabels(letters)[dow] || '';
}

// ─── Графік тижня ──────────────────────────────────────────────────────────
// Нуль — коротка нейтральна «пенька», а не порожнеча: так видно, що день
// був, просто без слів. Ненульовий стовпчик не нижчий за MIN, щоб одиничка
// поруч із двадцяткою не зливалася з нулем.
export const BAR_STUB = 6;
const BAR_MIN = 14;

export function barHeights(days, max) {
  const list = Array.isArray(days) ? days : [];
  const peak = Math.max(1, ...list.map((d) => Number(d?.value) || 0));
  return list.map((d) => {
    const v = Math.max(0, Number(d?.value) || 0);
    if (!v) return BAR_STUB;
    return Math.round(BAR_MIN + ((max - BAR_MIN) * v) / peak);
  });
}

// ─── Колаж наліпок ─────────────────────────────────────────────────────────
// Розкладки під кількість: центр (частки ширини/висоти), розмір (частка
// висоти) і нахил. Розкладено руками, а не випадково: «випадковий» колаж
// щоразу інший і рано чи пізно ляже криво. Нахили чергуються за знаком.
const SLOTS = {
  1: [[0.5, 0.5, 1, -4]],
  2: [[0.3, 0.52, 0.92, -6], [0.7, 0.48, 0.92, 5]],
  3: [[0.18, 0.55, 0.8, -8], [0.5, 0.45, 0.88, 3], [0.82, 0.55, 0.8, 7]],
  4: [[0.14, 0.53, 0.68, -9], [0.38, 0.44, 0.74, 4], [0.62, 0.56, 0.7, -4], [0.86, 0.46, 0.7, 8]],
  5: [[0.17, 0.3, 0.62, -8], [0.5, 0.26, 0.62, 5], [0.83, 0.3, 0.62, -3], [0.33, 0.73, 0.62, 6], [0.67, 0.73, 0.62, -6]],
  6: [[0.15, 0.27, 0.58, -8], [0.5, 0.33, 0.58, 4], [0.85, 0.25, 0.58, -4], [0.17, 0.75, 0.58, 6], [0.5, 0.82, 0.56, -5], [0.83, 0.73, 0.58, 7]],
};

export const COLLAGE_H = 192;

// stickers — збережені слова (з photo/shape/outline/box) або голі URI.
// Без фото й повтори одного фото відкидаємо. Повертає готові пікселі.
export function pickCollage(stickers, n = 6, box = { w: CONTENT_W, h: COLLAGE_H }) {
  const seen = new Set();
  const items = [];
  for (const s of Array.isArray(stickers) ? stickers : []) {
    const item = typeof s === 'string' ? { photo: s } : s;
    if (!item?.photo || seen.has(item.photo)) continue;
    seen.add(item.photo);
    items.push(item);
    if (items.length >= Math.min(n, 6)) break;
  }
  const slots = SLOTS[items.length] || [];
  return items.map((item, i) => {
    const [cx, cy, k, rotate] = slots[i];
    const size = Math.round(box.h * k);
    return {
      item,
      size,
      rotate,
      left: Math.round(cx * box.w - size / 2),
      top: Math.round(cy * box.h - size / 2),
    };
  });
}

// ─── Експорт і прев'ю ──────────────────────────────────────────────────────

// Пікселі PNG картки. Усі картки — повний кадр Stories; прозорі наліпки
// мають свій розмір (stickerPixels).
export function exportPixels() {
  return { w: EXPORT_W, h: EXPORT_H };
}

// Розмір знімка для captureRef. На iOS view-shot міряє width/height у
// ТОЧКАХ і сам множить на PixelRatio, на Android і вебі — у пікселях.
// Без цієї поправки на iPhone 3x вийшла б картинка 3240×5760.
export function exportSize(os, ratio, w = EXPORT_W, h = EXPORT_H) {
  if (os === 'ios') return { width: w / ratio, height: h / ratio };
  return { width: w, height: h };
}

// iOS view-shot інколи повертає голий шлях без схеми, а expo-sharing
// хоче саме file:// URI.
export function toFileUri(uri) {
  if (!uri || /^[a-z][a-z0-9+.-]*:/i.test(uri)) return uri;
  return 'file://' + uri;
}

// Масштаб прев'ю, щоб картка разом із заголовком, крапками, палітрою й
// кнопками вмістилася на екрані з урахуванням вирізу та home indicator.
// chrome — висота всього, що в панелі не є самою карткою (≈300), плюс
// рядок помилки й зазор під статус-баром: поява помилки не має виштовхнути
// панель під виріз. Один шаблон — без підказки й крапок, мінус ~40 пт.
// stories — ще й кнопка «Instagram Stories» під головною, плюс STORIES_ROW.
export const SHEET_MAX_W = 520;
export const STORIES_ROW = 60;

// chrome — готова висота хрому аркуша (cardChrome нижче), якщо задана;
// min — найменший масштаб: у режимі «Картка» з плитками на iPhone SE
// картка мусить поступитися, інакше панель залізе під статус-бар.
export function previewScale({ width, height, top = 0, bottom = 0, multi = true, stories = false, chrome, min = 0.36 }) {
  const c = chrome ?? (multi ? 340 : 300) + (stories ? STORIES_ROW : 0);
  const byH = (height - top - bottom - c) / CARD_H;
  const byW = (Math.min(width, SHEET_MAX_W) - 96) / CARD_W;
  const s = Math.min(byH, byW, 0.8);
  return Math.max(min, Math.floor(s * 1000) / 1000);
}

// ─── Аркуш v1.3: ряди хрому ────────────────────────────────────────────────
// Висоти рядів аркуша «Поділитися» (з відступом над кожним), з яких
// рахується, скільки місця лишається прев'ю. Ті самі числа бере стиль
// ShareSheet.js, тож розрахунок і верстка не розходяться.
//   top — ручка й поле над заголовком; title — заголовок;
//   segment — перемикач «Наліпка · Картка»; style — крапки з назвою вигляду;
//   cta — головна кнопка; link — «або обрати фото з галереї» під нею;
//   tiles — ряд плиток із підписами; toast — рядок стану (резерв, щоб поява
//   «Скопійовано…» не виштовхнула аркуш під виріз); close — «Закрити»;
//   gap — зазор між аркушем і статус-баром.
export const SHEET_ROWS = {
  top: 20,
  title: 24,
  segment: 46,
  style: 26,
  cta: 64,
  link: 32,
  tiles: 86,
  toast: 76,
  close: 44,
  bottom: 8,
  gap: 10,
  swatches: 56,
};

// Невисокий екран (iPhone SE, 8): під рядок стану місця не резервуємо —
// він з'являється поверх заголовка й перемикача, а прев'ю лишається більшим.
// На високих — під плитками, як на макеті.
export const COMPACT_H = 700;
export function isCompact({ height, top = 0, bottom = 0 }) {
  return height - top - bottom < COMPACT_H;
}

// Хром режиму «Картка» з плитками: заголовок, перемикач (крім тижня),
// крапки шаблонів, кольори, головна кнопка, плитки, рядок стану, «Закрити».
export function cardChrome({ multi = true, segment = true, toast = true } = {}) {
  const r = SHEET_ROWS;
  return (
    r.top + r.title + (segment ? r.segment : 0) + 12 + (multi ? r.style : 0) + r.swatches + r.cta + r.tiles + (toast ? r.toast : 0) + r.close + r.bottom + r.gap
  );
}

// ─── Наліпки без тла ───────────────────────────────────────────────────────
// Наліпка — PNG, у якому прозоре все, крім предмета й таблички. Корінь
// знімка — View завширшки STICKER_W без тла; поле STICKER_PAD усередині
// кореня тримає тіні й нахилені кути (знімок обрізає все за межами
// кореня). У PNG — ×3 від логічного розміру на будь-якому iPhone: 300 pt →
// 900 px, з запасом чітко й після масштабування пальцями в Stories.
export const STICKER_W = 300;
export const STICKER_PAD = 12;
export const STICKER_SCALE = 3;
// Найменші висоти видів. Корінь росте за вмістом (дворядковий переклад),
// а знімок бере справжню висоту з onLayout.
export const STICKER_MIN_H = { object: 372, word: 236, badge: 290 };

// Плитка «Stories» без фото: наліпка на фірмовому градієнті іконки.
// Instagram без кольорів залив би тло сірим #222222.
export const STORIES_GRADIENT = ['#5380FF', '#5F58E2'];

// Які наліпки має сенс показати для payload: слово з фото — предмет із
// табличкою або лише табличка (для тла «фото скану», де предмет уже є);
// без фото — лише табличка; сцена — набір фішок; досягнення — медаль.
// Тижня немає: його природна форма — картка.
export function stickerStylesFor(payload) {
  if (payload?.kind === 'word' && payload.word) return payload.word.photo ? ['object', 'word'] : ['word'];
  if (payload?.kind === 'scene' && payload.scene?.objects?.length) return ['scene'];
  if (payload?.kind === 'achievement' && payload.achievement) return ['badge'];
  return [];
}

// Пікселі PNG наліпки висотою h точок.
export function stickerPixels(h, w = STICKER_W) {
  return { w: Math.round(w * STICKER_SCALE), h: Math.round(h * STICKER_SCALE) };
}

// ─── Наліпка сцени: набір фішок ────────────────────────────────────────────
// До SCENE_SET_MAX фішок «слово / переклад» по дві в ряд, далі «і ще N».
// Розкладка — чиста функція без flex-wrap: висота детермінована (її
// перевіряє тест), а перенесення рядків не залежить від рушія верстки.
export const SCENE_SET_MAX = 6;
// maxW: дві найширші фішки з проміжком і запасом на нахил і тінь не
// виходять за поле кореня (2 × 128 + 8 = 264 з 276)
export const SCENE_CHIP = { word: 19, sub: 13, lineW: 24, lineS: 17, padX: 12, padY: 6, maxW: 128, minW: 66, gap: 8, rowGap: 9 };
export const SCENE_HEAD_H = 34;
export const SCENE_MORE_H = 26;
const SCENE_TILTS = [-3, 2.5, -1.5, 3, -2.5, 1.5];
// Найменші кеглі, за яких назва ще вміщається у вузьку фішку; дрібніше —
// фішка стає широкою. Рядів не більше SCENE_ROWS (висота ≤ 385 pt).
const SCENE_CHIP_MIN_WORD = 14;
const SCENE_CHIP_MIN_SUB = 11;
export const SCENE_ROWS = 4;

export function sceneSetLayout(objects, { width = STICKER_W } = {}) {
  const c = SCENE_CHIP;
  const list = (Array.isArray(objects) ? objects : []).filter((o) => o && String(o.word || '').trim());
  // Довга назва («la lámpara de escritorio») у вузьку фішку влізла б лише
  // дрібним кеглем чи з «…» — така фішка стає широкою й займає ряд сама.
  const wideW = width - STICKER_PAD * 2 - 16;
  const sized = list.slice(0, SCENE_SET_MAX).map((o, i) => {
    const word = String(o.word).trim();
    const tr = String(o.translation || '').trim();
    const room = c.maxW - c.padX * 2 - 6;
    const wide = textEm(word) * SCENE_CHIP_MIN_WORD > room || (!!tr && textEm(tr, 0) * SCENE_CHIP_MIN_SUB > room);
    const maxW = wide ? wideW : c.maxW;
    const inner = maxW - c.padX * 2;
    const wordSize = fontSizeForWord(word, { max: c.word, min: 11, width: inner });
    const subSize = tr ? fontSizeForWord(tr, { max: c.sub, min: 9, width: inner, tracking: 0 }) : 0;
    const textW = Math.max(textEm(word) * wordSize, tr ? textEm(tr, 0) * subSize : 0);
    // +6: бокові відступи гліфів і волосяна рамка
    const w = Math.round(Math.min(maxW, Math.max(c.minW, textW + c.padX * 2 + 6)));
    const h = c.padY * 2 + c.lineW + (tr ? c.lineS : 0) + 2;
    return { key: o.key ?? String(i), word, translation: tr, wordSize, subSize, w, h, wide, rotate: SCENE_TILTS[i % SCENE_TILTS.length] };
  });
  // Ряди: дві вузькі фішки поруч, широка — сама. Не більше SCENE_ROWS
  // рядів, щоб наліпка лишалась наліпкою, а не списком; решта — у «і ще N».
  const rows = [];
  for (const ch of sized) {
    const last = rows[rows.length - 1];
    if (!ch.wide && last && last.length === 1 && !last[0].wide) last.push(ch);
    else if (rows.length < SCENE_ROWS) rows.push([ch]);
    else break;
  }
  const shownCount = rows.reduce((n, r) => n + r.length, 0);
  const more = list.length - shownCount;
  // Згори — поле, запас під нахил шапки, сама шапка й відступ до фішок
  let y = STICKER_PAD + 6 + SCENE_HEAD_H + 12;
  const chips = [];
  for (const row of rows) {
    const total = row.reduce((sum, ch) => sum + ch.w, 0) + c.gap * (row.length - 1);
    let x = Math.round((width - total) / 2);
    const rowH = Math.max(...row.map((ch) => ch.h));
    for (const ch of row) {
      // нижча фішка (без перекладу) стає по центру ряду
      chips.push({ ...ch, x, y: y + Math.round((rowH - ch.h) / 2) });
      x += ch.w + c.gap;
    }
    y += rowH + c.rowGap;
  }
  if (chips.length) y -= c.rowGap;
  const moreY = more > 0 ? y + 10 : null;
  if (more > 0) y += 10 + SCENE_MORE_H;
  // знизу — запас під тіні й нахил і поле кореня
  const height = y + 8 + STICKER_PAD;
  return { chips, more, moreY, height };
}

// ─── Прев'ю наліпки в аркуші ───────────────────────────────────────────────
// Поле прев'ю — шахівниця висотою до STICKER_PREVIEW_MAX (як на макеті).
// Решту висоти екрана забирає хром аркуша (SHEET_ROWS): з резервом під
// рядок стану панель не вилазить під виріз і на iPhone SE.
export const STICKER_PREVIEW_MAX = 292;
export const STICKER_PREVIEW_MIN = 160;
// Рядок підпису «Без тла: ляже на будь-яке фото» внизу поля прев'ю
export const STICKER_HINT_H = 30;

export function stickerChrome({ styles = 1, link = true, toast = true } = {}) {
  const r = SHEET_ROWS;
  return (
    r.top + r.title + r.segment + 12 + (styles > 1 ? r.style : 0) + r.cta + (link ? r.link : 0) + r.tiles + (toast ? r.toast : 0) + r.close + r.bottom + r.gap
  );
}

export function stickerPreviewH({ height, top = 0, bottom = 0, styles = 1, link = true }) {
  const toast = !isCompact({ height, top, bottom });
  const free = height - top - bottom - stickerChrome({ styles, link, toast });
  return Math.max(STICKER_PREVIEW_MIN, Math.min(STICKER_PREVIEW_MAX, Math.floor(free)));
}

// Масштаб наліпки всередині поля прев'ю w×h: уся наліпка видна, над
// підписом унизу лишається повітря; більше за натуральний розмір не росте.
export function stickerFit(boxW, boxH, stickerH, stickerW = STICKER_W) {
  const byW = (boxW - 16) / stickerW;
  const byH = (boxH - STICKER_HINT_H - 8) / Math.max(1, stickerH);
  const s = Math.min(1, byW, byH);
  return Math.max(0.2, Math.floor(s * 1000) / 1000);
}

// ─── Дії аркуша ────────────────────────────────────────────────────────────
// Головна кнопка режиму «Наліпка» (share.md §5.2):
//   Instagram є, є тло з payload (кадр свіжого скану, фото сцени) →
//     «Stories з цим фото» (під нею — «або обрати фото з галереї»);
//   Instagram є, тла немає, а вибір фото є → «Stories з твоїм фото»;
//   Instagram немає, а буфер є → «Копіювати наліпку»;
//   інакше → системне меню.
// Режим «Картка»: Instagram → картка тлом на весь екран, інакше — меню.
export function primaryAction({ mode = 'sticker', stories = false, backdrop = false, pick = false, copy = false }) {
  if (mode === 'card') return stories ? 'stories_card' : 'system';
  if (stories && backdrop) return 'stories_photo';
  if (stories && pick) return 'stories_gallery';
  if (copy) return 'copy';
  return 'system';
}

// Плитки під головною кнопкою. Немає в середовищі — немає плитки, жодних
// порожніх місць; дія головної кнопки плиткою не дублюється.
export function tilesFor({ mode = 'sticker', primary, stories = false, copy = false, save = false }) {
  const out = [];
  if (mode === 'sticker' && stories) out.push('stories_plain');
  if (copy && primary !== 'copy') out.push('copy');
  if (save) out.push('save');
  if (primary !== 'system') out.push('system');
  return out;
}
