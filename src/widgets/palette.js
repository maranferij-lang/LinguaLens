// Палітра віджетів з теми застосунку (план §5.9, S17). Віджет сам не знає
// тем: кольори приходять у props як pal = { l, d } — світла й темна версії
// тієї самої палітри, а розмітка обирає за environment.colorScheme.
//
// Лише ЧИТАЄ THEMES (власник theme.js — потік тем): «Крейда» — це ключі
// light / dark, палітри Pro — '<назва>-light' / '<назва>-dark'. Невідомий
// ключ (палітри ще немає, чи її прибрали) — «Крейда».
import { THEMES, mix } from '../theme';

// mix жив тут до вогника в кольорах палітри — лишається й звідси
export { mix };

// Ключі pal — однакові для l і d (схема props, widgets.md §8):
//   bg, ink (основний текст), soft (переклад), dim, faint, sep,
//   accent, accentSoft, onAccent (текст на акценті), chip (нейтральні
//   плитки й порожні дні),
//   warm, warmSoft, warmInk (бурштин: «на повторення»), green.
// Віджет «Серія» отримує ще FLAME_KEYS (streakPalette нижче).
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

// Вогник серії в кольорах палітри (токени flame* теми, 5.10.2026): flame,
// flameSoft, flameInk (текст таймера на flameSoft), flameTip, onFlame. Лише
// для «Серії»: таймлайн «Моїх слів» обмежений MAX_BYTES, і зайві ключі в
// кожному записі вкоротили б його горизонт.
export const FLAME_KEYS = ['flame', 'flameSoft', 'flameInk', 'flameTip', 'onFlame'];

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

function flameOf(theme) {
  const C = theme.C;
  return {
    flame: C.flame,
    flameSoft: C.flameSoft,
    // таймер до півночі на flameSoft: у світлому — трохи глибший за flame
    flameInk: theme.isDark ? C.flame : mix(C.flame, C.text, 0.25),
    flameTip: C.flameTip,
    onFlame: C.onFlame,
  };
}

const base = (key) => {
  const m = /^(.+)-(light|dark)$/.exec(String(key || ''));
  return m ? m[1] : '';
};

// Світла й темна теми тієї ж палітри
function pair(themeKey) {
  const b = base(themeKey);
  return [(b && THEMES[b + '-light']) || THEMES.light, (b && THEMES[b + '-dark']) || THEMES.dark];
}

// → { l, d } для ключа теми застосунку ('light', 'dark', 'ocean-dark'…).
export function widgetPalette(themeKey) {
  const [l, d] = pair(themeKey);
  return { l: fromTheme(l), d: fromTheme(d) };
}

// → { l, d } для віджета «Серія»: те саме, що widgetPalette, і FLAME_KEYS.
export function streakPalette(themeKey) {
  const [l, d] = pair(themeKey);
  return { l: { ...fromTheme(l), ...flameOf(l) }, d: { ...fromTheme(d), ...flameOf(d) } };
}

// Короткий підпис палітри — щоб не переписувати таймлайни, коли тема та сама.
export function paletteSig(pal) {
  return pal ? PAL_KEYS.map((k) => pal.l[k] + pal.d[k]).join('') : '';
}
