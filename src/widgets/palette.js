// Палітра віджетів з теми застосунку (план §5.9, S17). Віджет сам не знає
// тем: кольори приходять у props як pal = { l, d } — світла й темна версії
// тієї самої палітри, а розмітка обирає за environment.colorScheme.
//
// Лише ЧИТАЄ THEMES (власник theme.js — потік тем): «Крейда» — це ключі
// light / dark, палітри Pro — '<назва>-light' / '<назва>-dark'. Невідомий
// ключ (палітри ще немає, чи її прибрали) — «Крейда».
import { THEMES } from '../theme';

// Ключі pal — однакові для l і d (схема props, widgets.md §8):
//   bg, ink (основний текст), soft (переклад), dim, faint, sep,
//   accent, accentSoft, onAccent (текст на акценті), chip (нейтральні
//   плитки й порожні дні),
//   warm, warmSoft, warmInk (текст на теплому — серія), green.
export const PAL_KEYS = [
  'bg',
  'ink',
  'soft',
  'dim',
  'faint',
  'sep',
  'accent',
  'accentSoft',
  'onAccent',
  'chip',
  'warm',
  'warmSoft',
  'warmInk',
  'green',
];

function rgb(hex) {
  const h = String(hex).replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

// Змішує два кольори: k — частка другого.
export function mix(a, b, k) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return a;
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function fromTheme(theme) {
  const C = theme.C;
  const dark = theme.isDark;
  return {
    bg: C.bg,
    ink: C.text,
    // переклад — трохи тихіший за слово, але ще не «підпис»
    soft: mix(C.text, C.dim, 0.35),
    dim: C.dim,
    faint: C.faint,
    sep: C.sep,
    accent: C.accent,
    accentSoft: C.accentSoft,
    onAccent: C.onAccent,
    chip: C.card2,
    warm: C.warm,
    warmSoft: C.warmSoft,
    // бурштин на світлому тлі для тексту замалоконтрастний — темніший відтінок
    warmInk: dark ? C.warm : mix(C.warm, C.text, 0.45),
    green: C.green,
  };
}

const base = (key) => {
  const m = /^(.+)-(light|dark)$/.exec(String(key || ''));
  return m ? m[1] : '';
};

// → { l, d } для ключа теми застосунку ('light', 'dark', 'ocean-dark'…).
export function widgetPalette(themeKey) {
  const b = base(themeKey);
  const l = (b && THEMES[b + '-light']) || THEMES.light;
  const d = (b && THEMES[b + '-dark']) || THEMES.dark;
  return { l: fromTheme(l), d: fromTheme(d) };
}

// Короткий підпис палітри — щоб не переписувати таймлайни, коли тема та сама.
export function paletteSig(pal) {
  return pal ? PAL_KEYS.map((k) => pal.l[k] + pal.d[k]).join('') : '';
}
