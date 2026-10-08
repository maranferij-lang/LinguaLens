// Дизайн-система LinguaLens — перенесена з Figma
// (файл c5DX8UXHJUdO58fwjIRTFq, сторінка Foundations).
//
// Напрям: ТЕПЛА КРЕЙДА + ОДИН АКЦЕНТ.
// Тло ніколи не чисто-біле — крейдяне #FAF8F4. Акцент узятий піпеткою зі шкіри
// маскота Lingo (#6C6CCC / #8484E4) і поглиблений до #5B4FD6 заради контрасту
// 5.6:1 на цьому тлі. Це ЄДИНИЙ насичений колір інтерфейсу:
//   • бірюза з черевця Lingo — тільки стани успіху («Знаю», правильна відповідь)
//   • вогник серії — фірмовий, як сам Lingo: фіолетове тіло, мʼятне серце,
//     з 7-го дня бірюзовий кінчик і сяйво (токени flame*, див. PALETTES)
//   • бурштин — лише тихі позначки часу й новизни (таймер вікторини,
//     «на повторення», «нове»), не серія
//   • червоний — тільки помилка й видалення
// Тіні теплі, а не сірі: сіра тінь на теплому тлі виглядає брудно.
//
// v1.3: «Крейда» лишається фірмовою й безкоштовною, а Pro отримує ще чотири
// палітри (Океан, Ягода, Графіт, Какао) — кожну у світлому й темному
// вигляді. Правило те саме: насичений лише акцент; зелений, бурштин і
// червоний однакові в усіх палітрах, тож акценти обрано так, щоб із ними не
// плутатись (синій, маджента, графіт, какао — бірюзу й корал відкинуто).
// Вогник серії (5.10.2026, рішення власника) — у кольорах палітри: кожна
// перефарбовує його під себе, жодного оранжево-жовтого вогника.
import { createContext, useContext } from 'react';
import { Platform } from 'react-native';
import { PALETTES_ENABLED } from './flags';

// Радіуси з макета: картка 28, рядок 22, поле 16, чип-пігулка 999.
export const R = { xl: 28, lg: 22, md: 16, sm: 12, pill: 999 };
export const SP = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 };

// Транскрипція (IPA). У Nunito немає ʊ, ɪ, ɔ, θ, β, ʝ…: iOS добирав би
// їх із системного шрифту посеред слова, іншої ваги й ширини, а власний ˈ
// у Nunito завширшки з літеру «a» («/ˈ haʊsplænt/»). Тому IPA пишемо
// системним заокругленим шрифтом, як і SwiftUI-віджети (rounded): у SF Pro
// Rounded є весь IPA, тож транскрипція — одним шрифтом. На вебі — той
// самий шрифт, якщо він є, інакше системний.
const IPA_FAMILY = Platform.select({
  ios: 'ui-rounded',
  android: 'sans-serif',
  default: '"SF Pro Rounded", ui-rounded, system-ui, sans-serif',
});

export const F = {
  reg: 'Nunito_500Medium',
  semi: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
  ipa: IPA_FAMILY,
};

// Шрифт транскрипції вагою weight: '500' там, де поруч F.reg, '600' — F.semi,
// '700' — F.bold. Системний шрифт один на всі ваги, тож вага — окремо.
export const ipaFont = (weight = '500') => ({ fontFamily: F.ipa, fontWeight: weight });

// ===== ТИПОГРАФІКА =====
// Правило Apple: трекінг і інтерліньяж залежать від кегля, одне значення на всі
// розміри завжди десь неправильне.

export function track(size) {
  if (size >= 30) return -size * 0.022; // 34 → −0.75
  if (size >= 22) return -size * 0.014; // 26 → −0.36
  if (size >= 16) return -size * 0.006; // 17 → −0.10
  if (size >= 13) return 0;
  return size * 0.02; // 11 → +0.22
}

export function lead(size, dense) {
  const k = size >= 30 ? 1.1 : size >= 22 ? 1.2 : size >= 16 ? 1.35 : 1.45;
  return Math.round(size * (dense ? k - 0.1 : k));
}

export function type(size, family = F.reg, opts = {}) {
  return {
    fontSize: size,
    fontFamily: family,
    letterSpacing: opts.letterSpacing ?? track(size),
    ...(opts.noLead ? null : { lineHeight: lead(size, opts.dense) }),
  };
}

// Дрібні розрядкові кепси — «СЛОВО ДНЯ», «АКАУНТ», підписи під цифрами.
export const CAPS = {
  fontSize: 11,
  fontFamily: F.extra,
  letterSpacing: 1.1,
  textTransform: 'uppercase',
};

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}
function tint(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

// Змішує два кольори #RRGGBB: k — частка другого. Не #RRGGBB — як є.
// Похідні відтінки вогника (Flame.js) і віджетів (widgets/palette.js).
export function mix(a, b, k) {
  if (!/^#[0-9a-f]{6}$/i.test(String(a)) || !/^#[0-9a-f]{6}$/i.test(String(b))) return a;
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ===== ПАЛІТРИ =====
// Зелений (успіх), бурштин (час, «нове») і червоний (помилка) — спільні для
// всіх палітр: людина вчиться читати їх раз і назавжди. Вогник серії — ні:
// він у кольорах палітри (flame* нижче).
// green і red — заливки й іконки. Текст успіху й помилки — greenInk і redInk:
// у світлих темах заливки на своїх м'яких тлах дають лише 3,6–4,4:1.
const SHARED = {
  light: {
    green: '#0E8C82',
    greenSoft: '#E0F5F2',
    // текст на greenSoft: чистий green на ньому лише 3,8:1
    greenInk: '#0B6A62',
    red: '#D2483F',
    redSoft: '#FBEAE8',
    // текст помилки: чистий red на redSoft лише 3,8:1, на тлі 4,0–4,2:1
    redInk: '#AE3029',
    warm: '#E0A02E',
    warmSoft: '#FBF1DF',
  },
  dark: {
    green: '#3ED8CB',
    greenSoft: '#123330',
    greenInk: '#3ED8CB',
    red: '#FF7A6E',
    redSoft: '#3A211E',
    redInk: '#FF7A6E',
    warm: '#F0B84A',
    warmSoft: '#372C15',
  },
};

// Кожна палітра — світла й темна версії однакового набору токенів (core.md
// E.7). Контраст перевіряє __tests__/themes.test.js: text, dim і accent на
// тлі й картці, accent на accentSoft, onAccent на акценті — усе ≥ 4.5:1;
// faint — лише декор (шеврони, доріжки, вимкнене), ≥ 3:1 і на тлі, і на
// картці. Текст, який щось означає (підписи, кепси, плейсхолдери), — dim.
// shadow — колір тіні у світлому вигляді: теплий для теплих палітр,
// холодний для Океану, нейтральний для Графіту (у темному — завжди чорний).
// pro — палітра лише з Pro; «Крейда» безкоштовна.
//
// Вогник серії (src/streak/Flame.js, чип, картка, свято, віджет «Серія»):
//   flame — тіло вогника 1–6 днів, значки, крапки тижня, смужка до віхи;
//     ≥ 3:1 на тлі, картці й flameSoft (графіка, WCAG 1.4.11);
//   flameSoft — мʼяке тло під вогником (плитка, банер, пігулка): text і dim
//     на ньому ≥ 4.5:1;
//   flameTip — кінчик розгорілого вогника з 7-го дня, іскри й кільце;
//   flameCore — серце вогника;
//   onFlame — текст на flame (≥ 4.5:1).
// «Крейда» — фіолетовий акцент із бірюзою Lingo; Океан — синій із бірюзою;
// Ягода — маджента з рожевим; Графіт — сланець із бірюзою; Какао — какао з
// вершками. Відтінок flame* — завжди родина акценту палітри або бірюзи
// (перевіряє __tests__/themes.test.js).
export const PALETTES = [
  {
    key: 'chalk',
    pro: false,
    shadow: '#5C4F3D',
    light: {
      bg: '#FAF8F4',
      card: '#FFFFFF',
      card2: '#F1EEE8',
      card3: '#E9E5DC',
      text: '#1C1B19',
      dim: '#6E6A62',
      faint: '#8A857C',
      sep: '#E8E4DC',
      accent: '#5B4FD6',
      accentSoft: '#E4E1FB',
      onAccent: '#FFFFFF',
      flame: '#6152E0',
      flameSoft: '#EFEDFD',
      flameTip: '#3FCFC2',
      flameCore: '#C4F3EC',
      onFlame: '#FFFFFF',
    },
    dark: {
      bg: '#151412',
      card: '#201F1C',
      card2: '#2A2825',
      card3: '#35322E',
      text: '#F5F2EC',
      dim: '#A9A49B',
      faint: '#8A857D',
      sep: '#302D29',
      accent: '#9B8FFF',
      accentSoft: '#221E45',
      onAccent: '#100C2E',
      flame: '#9B8FFF',
      flameSoft: '#26224A',
      flameTip: '#5FE6D9',
      flameCore: '#CFFFF9',
      onFlame: '#100C2E',
    },
  },
  {
    key: 'ocean',
    pro: true,
    shadow: '#34465C',
    light: {
      bg: '#F5F8FC',
      card: '#FFFFFF',
      card2: '#EBF0F7',
      card3: '#DFE6F0',
      text: '#14202E',
      dim: '#5B6878',
      faint: '#808D9D',
      sep: '#E1E7EF',
      accent: '#1F5BD1',
      accentSoft: '#E1EAFB',
      onAccent: '#FFFFFF',
      flame: '#2A66DD',
      flameSoft: '#E8EFFC',
      flameTip: '#3FCFC2',
      flameCore: '#C4F3EC',
      onFlame: '#FFFFFF',
    },
    dark: {
      bg: '#0E141C',
      card: '#18212C',
      card2: '#212C39',
      card3: '#2B3746',
      text: '#EEF3F9',
      dim: '#9AA8B8',
      faint: '#7D8B9B',
      sep: '#243040',
      accent: '#7AA7FF',
      accentSoft: '#16294A',
      onAccent: '#08162E',
      flame: '#7AA7FF',
      flameSoft: '#172B4C',
      flameTip: '#5FE6D9',
      flameCore: '#CFFFF9',
      onFlame: '#08162E',
    },
  },
  {
    key: 'berry',
    pro: true,
    shadow: '#5C4F3D',
    light: {
      bg: '#FCF7F9',
      card: '#FFFFFF',
      card2: '#F5ECF0',
      card3: '#ECDFE6',
      text: '#24171D',
      dim: '#735F68',
      faint: '#9A8790',
      sep: '#F0E3E9',
      accent: '#B02E7C',
      accentSoft: '#F8DCEC',
      onAccent: '#FFFFFF',
      flame: '#BC3486',
      flameSoft: '#FBE8F2',
      flameTip: '#FF9ACF',
      flameCore: '#FFE1F0',
      onFlame: '#FFFFFF',
    },
    dark: {
      bg: '#161013',
      card: '#21181C',
      card2: '#2C2126',
      card3: '#382A31',
      text: '#F7EEF2',
      dim: '#B5A2AB',
      faint: '#937F88',
      sep: '#32252B',
      accent: '#F07CC0',
      accentSoft: '#3D1730',
      onAccent: '#2A0619',
      flame: '#F07CC0',
      flameSoft: '#3D1730',
      flameTip: '#FFB9DE',
      flameCore: '#FFE8F4',
      onFlame: '#2A0619',
    },
  },
  {
    key: 'graphite',
    pro: true,
    shadow: '#2A2A2A',
    light: {
      bg: '#F4F4F2',
      card: '#FFFFFF',
      card2: '#EAEAE6',
      card3: '#DEDED9',
      text: '#151514',
      dim: '#62625E',
      faint: '#8C8C87',
      sep: '#E4E4E0',
      accent: '#24262B',
      accentSoft: '#E2E3E6',
      onAccent: '#FFFFFF',
      flame: '#3E444E',
      flameSoft: '#E7E8EA',
      flameTip: '#3FCFC2',
      flameCore: '#C4F3EC',
      onFlame: '#FFFFFF',
    },
    dark: {
      bg: '#0F0F10',
      card: '#1B1B1D',
      card2: '#252528',
      card3: '#303033',
      text: '#F2F2F0',
      dim: '#A3A3A0',
      faint: '#82827F',
      sep: '#2A2A2D',
      accent: '#ECECE8',
      accentSoft: '#2E2E31',
      onAccent: '#121214',
      flame: '#C9CDD4',
      flameSoft: '#2B2D31',
      flameTip: '#5FE6D9',
      flameCore: '#FFFFFF',
      onFlame: '#121214',
    },
  },
  {
    key: 'cocoa',
    pro: true,
    shadow: '#5C4F3D',
    light: {
      bg: '#F7F1EA',
      card: '#FFFCF8',
      card2: '#EFE6DB',
      card3: '#E5D9CB',
      text: '#21180F',
      dim: '#6F6253',
      faint: '#958777',
      sep: '#EADFD2',
      accent: '#8A4F2A',
      accentSoft: '#F0DFD0',
      onAccent: '#FFFFFF',
      flame: '#91552F',
      flameSoft: '#F3E6DA',
      flameTip: '#E8C9B0',
      flameCore: '#FBEFE4',
      onFlame: '#FFFFFF',
    },
    dark: {
      bg: '#17120E',
      card: '#221B15',
      card2: '#2D241C',
      card3: '#392E24',
      text: '#F6EEE6',
      dim: '#B3A493',
      faint: '#928372',
      sep: '#30261D',
      accent: '#D4A78C',
      accentSoft: '#3A2717',
      onAccent: '#24130A',
      flame: '#D4A78C',
      flameSoft: '#3A2717',
      flameTip: '#F3DCCB',
      flameCore: '#FFF5EC',
      onFlame: '#24130A',
    },
  },
];

export const PALETTE_KEYS = PALETTES.map((p) => p.key);
// Палітри з короною — лише з Pro (рядок «Кольорові теми — / 4» у пейволі)
export const PRO_PALETTES = PALETTES.filter((p) => p.pro).map((p) => p.key);
export const FREE_PALETTE = 'chalk';

// Ключ теми: «Крейда» — це 'light' / 'dark', як і до v1.3 (так їх уже
// знають збережені налаштування, тести й віджети), палітри Pro —
// '<палітра>-light' / '<палітра>-dark'.
export function themeKeyOf(palette, dark) {
  const mode = dark ? 'dark' : 'light';
  return palette === FREE_PALETTE || !PALETTE_KEYS.includes(palette) ? mode : `${palette}-${mode}`;
}

function buildTheme(palette, dark) {
  const p = { ...palette[dark ? 'dark' : 'light'], ...SHARED[dark ? 'dark' : 'light'] };
  const c = {
    ...p,
    sheet: p.card,
    input: p.card2,
    tabbar: p.card,
    // Напівпрозорий шар під blur: контент має просвічувати, але текст
    // лишатись читабельним. Прозоріше — і підпис під іконкою «попливе».
    chrome: tint(p.card, dark ? 0.62 : 0.7),
    // Затемнення під аркушами (згода на AI, мова, слово, редактор профілю).
    // Чорне 40 % на темному тлі (#151412) ледь помітне й край аркуша тримається
    // лише на кольорі картки, тож у темній версії шар густіший. Тіні камери,
    // сцени й карток для поширення мають власні значення й цього не беруть.
    scrim: tint('#000000', dark ? 0.55 : 0.4),
  };
  // Колір тіні: у світлому вигляді — з палітри (теплий на теплому тлі, сіра
  // тінь там виглядає брудно), у темному — чорний.
  const sh = palette.shadow;

  return {
    key: themeKeyOf(palette.key, dark),
    palette: palette.key,
    name: palette.key === FREE_PALETTE ? (dark ? 'Темна' : 'Світла') : palette.key,
    isDark: dark,
    C: c,
    R,
    SP,
    F,
    T: {
      // Заголовок вкладки: однаковий кегль, накреслення й місце на всіх
      // вкладках (Слова, Навчання, Профіль, Параметри)
      largeTitle: { color: p.text, ...type(34, F.bold) },
      title: { color: p.text, ...type(26, F.extra) },
      headline: { color: p.text, ...type(19, F.bold) },
      bodyStrong: { color: p.text, ...type(16, F.semi) },
      body: { color: p.text, ...type(16, F.reg) },
      callout: { color: p.dim, ...type(15, F.reg) },
      footnote: { color: p.dim, ...type(13, F.reg) },
      caps: { color: p.dim, ...CAPS },
      word: { color: p.text, ...type(40, F.extra) },
      number: { color: p.text, ...type(28, F.extra) },
    },
    // Шкала тіней: більша поверхня має читатись товщою.
    SHADOW_SM: dark
      ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }
      : { shadowColor: sh, shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    SHADOW: dark
      ? { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 6 }
      : { shadowColor: sh, shadowOpacity: 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
    SHADOW_LG: dark
      ? { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 34, shadowOffset: { width: 0, height: 18 }, elevation: 12 }
      : { shadowColor: sh, shadowOpacity: 0.1, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 9 },
  };
}

// light, dark (це «Крейда») + ocean-light, ocean-dark, berry-…, graphite-…,
// cocoa-… (план §5.9). Віджети (src/widgets/palette.js) лише читають їх.
export const THEMES = Object.fromEntries(
  PALETTES.flatMap((p) => [false, true].map((dark) => buildTheme(p, dark))).map((th) => [th.key, th])
);

// ===== ЯКУ ТЕМУ ПОКАЗАТИ =====
// mode — settings.theme: 'system' | 'light' | 'dark'. Міграція зі старих
// ключів: у користувача могла лишитись одна з восьми тем до v1.1 — темні
// йдуть у темний вигляд, світлі у світлий (тодішній 'ocean' був темною
// темою, а не палітрою Океан).
const LEGACY_DARK = ['charcoal', 'ocean', 'violet', 'neon'];
const LEGACY_LIGHT = ['snow', 'matcha', 'sand', 'lavender'];
export function isDarkMode(mode, scheme) {
  if (mode === 'dark' || LEGACY_DARK.includes(mode)) return true;
  if (mode === 'light' || LEGACY_LIGHT.includes(mode)) return false;
  return scheme === 'dark';
}

// Палітра, яку справді видно: без Pro (чи з вимкненими палітрами) — «Крейда».
// Сам вибір у налаштуваннях лишається, і з Pro він повертається.
export function shownPalette(palette, pro) {
  return PALETTES_ENABLED && pro && PRO_PALETTES.includes(palette) ? palette : FREE_PALETTE;
}

// → ключ THEMES. scheme — useColorScheme() ('light' | 'dark' | null).
export function resolveTheme({ mode = 'system', palette = FREE_PALETTE, scheme = null, pro = false } = {}) {
  return themeKeyOf(shownPalette(palette, pro), isDarkMode(mode, scheme));
}

// Як до v1.3: лише режим, «Крейда». Лишається для наявних викликів.
export function resolveThemeKey(stored, systemScheme) {
  return resolveTheme({ mode: stored, scheme: systemScheme });
}

const ThemeCtx = createContext(THEMES.light);
export const ThemeProvider = ThemeCtx.Provider;
export function useTheme() {
  return useContext(ThemeCtx);
}

// Статичні експорти (fallback для модулів поза провайдером)
export const C = THEMES.light.C;
