// Посилання віджетів (і сповіщень) у застосунок — widgets.md §9.
//
//   lingualens://word-of-day?date=YYYY-MM-DD&slot=N  → «Навчання», слово дня цього слоту
//   lingualens://word/<id>                           → «Слова», аркуш цього слова
//   lingualens://learn                               → «Навчання», картки на повторення
//   lingualens://streak                              → «Профіль», серія
//
// Віджет дописує from=widget&w=<wod|words|streak>, а розмітка — &f=<родина>
// (systemSmall…): так статистика знає, звідки прийшов тап. Сторонні адреси,
// зокрема exp+lingualens://expo-development-client…, — не наші.

export const ROUTES = ['word-of-day', 'word', 'learn', 'streak'];
const KINDS = ['wod', 'words', 'streak'];
// Родини віджетів, які ми знаємо (решта в статистиці — '').
const FAMILIES = ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'];

const SCHEME = /^lingualens:\/\/\/?([^?#]*)(?:\?([^#]*))?/i;

// Адреса для віджета: widgetLink('word', { id }, 'words').
export function widgetLink(route, params = {}, kind = '') {
  const { id, ...query } = params;
  const path = route === 'word' && id != null ? 'word/' + encodeURIComponent(String(id)) : route;
  const pairs = Object.entries({ ...query, from: 'widget', w: kind })
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => k + '=' + encodeURIComponent(String(v)));
  return 'lingualens://' + path + (pairs.length ? '?' + pairs.join('&') : '');
}

function decode(v) {
  try {
    return decodeURIComponent(v.replace(/\+/g, ' '));
  } catch (_) {
    return '';
  }
}

function query(raw) {
  const out = {};
  for (const part of (raw || '').split('&')) {
    if (!part) continue;
    const i = part.indexOf('=');
    const k = decode(i < 0 ? part : part.slice(0, i));
    if (k && !(k in out)) out[k] = i < 0 ? '' : decode(part.slice(i + 1));
  }
  return out;
}

const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s);

// → { route, id, date, slot, kind, family, from } | null
//   id — лише для word (рядок), date/slot — лише для word-of-day (slot — число
//   або null), kind/family/from — '' якщо немає.
export function parseWidgetLink(url) {
  if (typeof url !== 'string') return null;
  const m = SCHEME.exec(url.trim());
  if (!m) return null;
  const parts = m[1].split('/').filter(Boolean);
  const route = (parts[0] || '').toLowerCase();
  if (!ROUTES.includes(route)) return null;
  const q = query(m[2]);
  let id = null;
  if (route === 'word') {
    id = parts[1] ? decode(parts[1]) : '';
    if (!id) return null;
  } else if (parts.length > 1) {
    return null;
  }
  const slotNum = /^\d$/.test(q.slot || '') ? Number(q.slot) : null;
  return {
    route,
    id,
    date: route === 'word-of-day' && isDay(q.date || '') ? q.date : null,
    slot: route === 'word-of-day' ? slotNum : null,
    kind: KINDS.includes(q.w) ? q.w : '',
    family: FAMILIES.includes(q.f) ? q.f : '',
    from: q.from === 'widget' ? 'widget' : '',
  };
}

// Стара назва (тести й виклики до v1.3): чи це посилання віджета.
export function isWidgetLink(url) {
  return !!parseWidgetLink(url);
}
