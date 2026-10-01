// Чиста геометрія й форматування для карток «поділитись».
//
// Тут немає ні React, ні react-native: усе, що вирішує, як картка виглядає
// (кегль слова, висоти стовпчиків, колаж, дати), перевіряється jest-ом без
// моків. Компоненти в ShareCards.js лише розкладають готові числа.

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

// Які шаблони має сенс гортати для цього payload. Слово — три вигляди,
// досягнення й тиждень — по одному: там композиція одна-єдина правильна.
export function templatesFor(payload) {
  if (payload?.kind === 'word' && payload.word) return ['sticker', 'entry', 'minimal'];
  if (payload?.kind === 'achievement' && payload.achievement) return ['achievement'];
  if (payload?.kind === 'week' && payload.stats) return ['week'];
  return [];
}

// ─── Кегль слова ───────────────────────────────────────────────────────────
// Ширини гліфів Nunito ExtraBold у частках кегля — заміряні з самого TTF
// (hmtx), а не на око. Довге слово має зменшитись ДО рендера:
// adjustsFontSizeToFit — лише страховка, на вебі (прев'ю) його немає взагалі.
const NARROW = new Set("iíìïījlIı'.,:;!|іїј");
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
  return out.replace(/[\s,;:.!?—–-]+$/, '') + '…';
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

// «25 вер. – 1 жовт.» / «Sep 24 – 30». formatRange сам знає, як у кожній
// мові скорочувати діапазон у межах місяця; де його немає — просто «а – б».
export function weekRangeLabel(days, locale) {
  const list = Array.isArray(days) ? days : [];
  const a = dayFromKey(list[0]?.key);
  const b = dayFromKey(list[list.length - 1]?.key);
  if (!a || !b) return '';
  const opts = { day: 'numeric', month: 'short' };
  try {
    const f = new Intl.DateTimeFormat(locale, opts);
    if (typeof f.formatRange === 'function') return f.formatRange(a, b);
    return f.format(a) + ' – ' + f.format(b);
  } catch (_) {
    return format(a, undefined, opts) + ' – ' + format(b, undefined, opts);
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

// Літера дня тижня. dowLetters — 7 літер від неділі (як Date#getDay).
export function dayLetter(dow, letters) {
  return Array.from(String(letters || ''))[dow] || '';
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

// Розмір знімка для captureRef. На iOS view-shot міряє width/height у
// ТОЧКАХ і сам множить на PixelRatio, на Android і вебі — у пікселях.
// Без цієї поправки на iPhone 3x вийшла б картинка 3240×5760.
export function exportSize(os, ratio) {
  if (os === 'ios') return { width: EXPORT_W / ratio, height: EXPORT_H / ratio };
  return { width: EXPORT_W, height: EXPORT_H };
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
export const SHEET_MAX_W = 520;

export function previewScale({ width, height, top = 0, bottom = 0, multi = true }) {
  const chrome = multi ? 340 : 300;
  const byH = (height - top - bottom - chrome) / CARD_H;
  const byW = (Math.min(width, SHEET_MAX_W) - 96) / CARD_W;
  const s = Math.min(byH, byW, 0.8);
  return Math.max(0.36, Math.floor(s * 1000) / 1000);
}
