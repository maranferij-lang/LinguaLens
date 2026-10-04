// Дизайн-система LinguaLens — перенесена з Figma
// (файл c5DX8UXHJUdO58fwjIRTFq, сторінка Foundations).
//
// Напрям: ТЕПЛА КРЕЙДА + ОДИН АКЦЕНТ.
// Тло ніколи не чисто-біле — крейдяне #FAF8F4. Акцент узятий піпеткою зі шкіри
// маскота Lingo (#6C6CCC / #8484E4) і поглиблений до #5B4FD6 заради контрасту
// 5.6:1 на цьому тлі. Це ЄДИНИЙ насичений колір інтерфейсу:
//   • бірюза з черевця Lingo — тільки стани успіху («Знаю», правильна відповідь)
//   • бурштин — тільки серія днів
//   • червоний — тільки помилка й видалення
// Тіні теплі, а не сірі: сіра тінь на теплому тлі виглядає брудно.
import { createContext, useContext } from 'react';

// Радіуси з макета: картка 28, рядок 22, поле 16, чип-пігулка 999.
export const R = { xl: 28, lg: 22, md: 16, sm: 12, pill: 999 };
export const SP = { xs: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32 };

export const F = {
  reg: 'Nunito_500Medium',
  semi: 'Nunito_600SemiBold',
  bold: 'Nunito_700Bold',
  extra: 'Nunito_800ExtraBold',
};

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

// ===== ДВІ ТЕМИ =====
// Замість галереї з восьми напівпродуманих — одна фірмова, доведена до ладу,
// у світлому й темному варіанті. Значення один-в-один із токенами Figma.
export const THEME_DEFS = [
  {
    key: 'light',
    name: 'Світла',
    dark: false,
    bg: '#FAF8F4',
    card: '#FFFFFF',
    accent: '#5B4FD6',
    swatch: '#FAF8F4',
  },
  {
    key: 'dark',
    name: 'Темна',
    dark: true,
    bg: '#151412',
    card: '#201F1C',
    accent: '#9B8FFF',
    swatch: '#151412',
  },
];

const PALETTE = {
  light: {
    bg: '#FAF8F4',
    card: '#FFFFFF',
    card2: '#F1EEE8',
    card3: '#E9E5DC',
    text: '#1C1B19',
    dim: '#6E6A62',
    // faint — лише декор (шеврони, доріжки, вимкнене): ≥3:1 і на тлі, і на
    // картці. Текст, який щось означає, — dim (≥4.5:1).
    faint: '#8A857C',
    sep: '#E8E4DC',
    accent: '#5B4FD6',
    accentSoft: '#E4E1FB',
    onAccent: '#FFFFFF',
    green: '#0E8C82',
    greenSoft: '#E0F5F2',
    red: '#D2483F',
    redSoft: '#FBEAE8',
    warm: '#E0A02E',
    warmSoft: '#FBF1DF',
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
    green: '#3ED8CB',
    greenSoft: '#123330',
    red: '#FF7A6E',
    redSoft: '#3A211E',
    warm: '#F0B84A',
    warmSoft: '#372C15',
  },
};

function buildTheme(def) {
  const dark = def.dark;
  const p = PALETTE[def.key];
  const c = {
    ...p,
    sheet: p.card,
    input: p.card2,
    tabbar: p.card,
    // Напівпрозорий шар під blur: контент має просвічувати, але текст
    // лишатись читабельним. Прозоріше — і підпис під іконкою «попливе».
    chrome: tint(p.card, dark ? 0.62 : 0.7),
  };

  return {
    key: def.key,
    name: def.name,
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
      caps: { color: p.faint, ...CAPS },
      word: { color: p.text, ...type(40, F.extra) },
      number: { color: p.text, ...type(28, F.extra) },
    },
    // Шкала тіней: більша поверхня має читатись товщою.
    // Колір теплий (#5C4F3D), не чорний — інакше крейда сіріє.
    SHADOW_SM: dark
      ? { shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 3 }
      : { shadowColor: '#5C4F3D', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
    SHADOW: dark
      ? { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 20, shadowOffset: { width: 0, height: 9 }, elevation: 6 }
      : { shadowColor: '#5C4F3D', shadowOpacity: 0.07, shadowRadius: 24, shadowOffset: { width: 0, height: 10 }, elevation: 4 },
    SHADOW_LG: dark
      ? { shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 34, shadowOffset: { width: 0, height: 18 }, elevation: 12 }
      : { shadowColor: '#5C4F3D', shadowOpacity: 0.1, shadowRadius: 40, shadowOffset: { width: 0, height: 20 }, elevation: 9 },
  };
}

export const THEMES = Object.fromEntries(THEME_DEFS.map((d) => [d.key, buildTheme(d)]));

// Міграція зі старих ключів: у користувача могла лишитись одна з восьми
// попередніх тем — світлі йдуть у light, темні в dark.
const LEGACY_DARK = ['charcoal', 'ocean', 'violet', 'neon'];
export function resolveThemeKey(stored, systemScheme) {
  if (THEMES[stored]) return stored;
  if (LEGACY_DARK.includes(stored)) return 'dark';
  if (['snow', 'matcha', 'sand', 'lavender'].includes(stored)) return 'light';
  return systemScheme === 'dark' ? 'dark' : 'light';
}

const ThemeCtx = createContext(THEMES.light);
export const ThemeProvider = ThemeCtx.Provider;
export function useTheme() {
  return useContext(ThemeCtx);
}

// Статичні експорти (fallback для модулів поза провайдером)
export const C = THEMES.light.C;
