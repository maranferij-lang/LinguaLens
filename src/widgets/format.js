// Підписи для віджетів і Параметрів: години слотів, дата великого віджета,
// приклад зі словом жирним (markdown для Text у віджеті).
import { localeFor } from '../locale';
import { clipLines, quote } from '../share/layout';

// Година слова дня — у форматі годинника мови інтерфейсу: де годинник
// 12-годинний (en-US) — «8 AM», де 24-годинний — «08:00».
export function hourLabel(h, lang) {
  const loc = localeFor(lang);
  const at = new Date(2000, 0, 1, h);
  try {
    // 13:00 у 12-годинному форматі — «1 PM»: числа 13 там немає
    const h12 = !/13/.test(new Date(2000, 0, 1, 13).toLocaleTimeString(loc, { hour: 'numeric' }));
    return h12
      ? at.toLocaleTimeString(loc, { hour: 'numeric', hour12: true })
      : at.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (_) {
    return String(h).padStart(2, '0') + ':00';
  }
}

// Час дня (години й хвилини) — для «прискореного часу», де слоти не на
// цілих годинах.
export function timeLabel(d, lang) {
  if (d.getMinutes() === 0) return hourLabel(d.getHours(), lang);
  try {
    return d.toLocaleTimeString(localeFor(lang), { hour: '2-digit', minute: '2-digit' });
  } catch (_) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
}

// Коротка дата для кепсу великого віджета: «чт, 8 жовт.» / «Thu, Oct 8».
// Великими літерами її робить розмітка (textCase).
export function shortDate(d, lang) {
  try {
    return d.toLocaleDateString(localeFor(lang), { weekday: 'short', day: 'numeric', month: 'short' });
  } catch (_) {
    return '';
  }
}

// Markdown у віджеті — це LocalizedStringKey SwiftUI: службові символи
// слова й речення екрануємо, щоб «*» чи «_» у прикладі не зробили курсив.
const MD_SPECIAL = /([\\`*_[\]~#<>|])/g;
export function escapeMarkdown(s) {
  return String(s).replace(MD_SPECIAL, '\\$1');
}

// Межі «цілого слова» для всіх алфавітів: літера чи цифра поруч — це вже
// інше слово (lighthouse ≠ lighthouses ≠ alighthouse).
const LETTER = /[\p{L}\p{N}]/u;

// Приклад у лапках мови, слово (без урахування регістру, лише цілим словом)
// — у **…**. Порожній рядок, якщо markdown тут небезпечний: «%» SwiftUI
// може прочитати як формат рядка — тоді розмітка покаже звичайний приклад.
// Обрізаємо по слову самі: SwiftUI обрізав би посеред слова разом із
// закривальною лапкою.
export function exampleMarkdown(example, word, lang, { lines = 2, size = 13, width = 290 } = {}) {
  const text = String(example || '').trim();
  const target = String(word || '').trim();
  if (!text || /%/.test(text)) return '';
  const clipped = clipLines(text, lines, size, width);
  const quoted = quote(clipped, lang);
  if (!target) return escapeMarkdown(quoted);
  const lower = quoted.toLocaleLowerCase();
  const needle = target.toLocaleLowerCase();
  let at = -1;
  for (let from = 0; ; from = at + 1) {
    at = lower.indexOf(needle, from);
    if (at < 0) break;
    const before = quoted[at - 1];
    const after = quoted[at + needle.length];
    if ((!before || !LETTER.test(before)) && (!after || !LETTER.test(after))) break;
  }
  if (at < 0) return escapeMarkdown(quoted);
  return (
    escapeMarkdown(quoted.slice(0, at)) +
    '**' +
    escapeMarkdown(quoted.slice(at, at + needle.length)) +
    '**' +
    escapeMarkdown(quoted.slice(at + needle.length))
  );
}

// Той самий приклад без markdown (запасний шлях і iOS без жирного).
export function examplePlain(example, lang, { lines = 2, size = 13, width = 290 } = {}) {
  const text = String(example || '').trim();
  return text ? quote(clipLines(text, lines, size, width), lang) : '';
}
