// Кольорові теми v1.3 (план §5.9, core.md E.7): «Крейда» безкоштовна й без
// змін, чотири палітри Pro у світлому й темному вигляді. Кожна тема має
// повний набір токенів, читабельний контраст і ті самі зелений, бурштин і
// червоний. Без Pro видно «Крейду», хоч би що людина обрала. Хром камери й
// іконка застосунку від палітри не залежать.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import {
  FREE_PALETTE,
  PALETTES,
  PALETTE_KEYS,
  PRO_PALETTES,
  THEMES,
  ThemeProvider,
  isDarkMode,
  resolveTheme,
  resolveThemeKey,
  shownPalette,
  themeKeyOf,
} from '../src/theme';
import { CAMERA_CHROME, Material } from '../src/Chrome';
import { AppIcon } from '../src/Logo';

// Токени, які мусить мати кожна тема (план §5.9)
const TOKENS = ['bg', 'card', 'card2', 'card3', 'text', 'dim', 'faint', 'sep', 'accent', 'accentSoft', 'onAccent', 'warm', 'warmSoft', 'green', 'red'];
const KEYS = ['light', 'dark', ...['ocean', 'berry', 'graphite', 'cocoa'].flatMap((p) => [`${p}-light`, `${p}-dark`])];

// Відносна яскравість і контраст за WCAG 2.x
function lum(hex) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe('palettes', () => {
  test('Chalk (free) plus Ocean, Berry, Graphite and Cocoa (Pro)', () => {
    expect(PALETTE_KEYS).toEqual(['chalk', 'ocean', 'berry', 'graphite', 'cocoa']);
    expect(PRO_PALETTES).toEqual(['ocean', 'berry', 'graphite', 'cocoa']);
    expect(FREE_PALETTE).toBe('chalk');
  });

  test('THEMES has a light and a dark theme for every palette, keyed as in §5.9', () => {
    expect(Object.keys(THEMES).sort()).toEqual([...KEYS].sort());
    for (const p of PALETTE_KEYS) {
      for (const dark of [false, true]) {
        const th = THEMES[themeKeyOf(p, dark)];
        expect(th.palette).toBe(p);
        expect(th.isDark).toBe(dark);
      }
    }
    // «Крейда» лишилась під старими ключами: збережені налаштування й
    // віджети знають саме їх
    expect(themeKeyOf('chalk', false)).toBe('light');
    expect(themeKeyOf('chalk', true)).toBe('dark');
    expect(themeKeyOf('ocean', true)).toBe('ocean-dark');
    expect(themeKeyOf('nope', true)).toBe('dark');
  });

  test.each(KEYS)('%s has every token as a #RRGGBB colour', (key) => {
    const { C } = THEMES[key];
    for (const tk of TOKENS) expect([tk, C[tk]]).toEqual([tk, expect.stringMatching(/^#[0-9A-F]{6}$/)]);
    // похідні, якими користуються екрани
    for (const tk of ['sheet', 'input', 'tabbar', 'chrome', 'greenSoft', 'redSoft']) expect(C[tk]).toBeTruthy();
  });

  // Критерій приймання W5: ≥ 4.5:1 для кожної пари в кожній темі
  const PAIRS = [
    ['text', 'bg'],
    ['text', 'card'],
    ['dim', 'bg'],
    ['dim', 'card'],
    ['accent', 'bg'],
    ['accent', 'card'],
    ['accent', 'accentSoft'],
    ['onAccent', 'accent'],
    // рядки стану й заголовки аркушів v1.3
    ['greenInk', 'greenSoft'],
    ['text', 'redSoft'],
    ['dim', 'sheet'],
  ];
  test.each(KEYS)('%s: text, dim and accent read at ≥ 4.5:1', (key) => {
    const { C } = THEMES[key];
    for (const [fg, bg] of PAIRS) {
      const r = contrast(C[fg], C[bg]);
      expect([key, `${fg}/${bg}`, r >= 4.5]).toEqual([key, `${fg}/${bg}`, true]);
    }
  });

  test.each(KEYS)('%s: faint (decoration only) stays ≥ 3:1 on the background and on cards', (key) => {
    const { C } = THEMES[key];
    expect(contrast(C.faint, C.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(C.faint, C.card)).toBeGreaterThanOrEqual(3);
  });

  test('green (success), amber (streak) and red (error) are the same in every palette', () => {
    for (const mode of ['light', 'dark']) {
      const base = THEMES[mode].C;
      for (const p of PRO_PALETTES) {
        const { C } = THEMES[`${p}-${mode}`];
        for (const tk of ['green', 'greenSoft', 'red', 'redSoft', 'warm', 'warmSoft']) expect(C[tk]).toBe(base[tk]);
      }
    }
  });

  test('every Pro palette has its own accent, unlike Chalk’s and each other’s', () => {
    for (const mode of ['light', 'dark']) {
      const accents = PALETTE_KEYS.map((p) => THEMES[themeKeyOf(p, mode === 'dark')].C.accent);
      expect(new Set(accents).size).toBe(PALETTE_KEYS.length);
    }
  });

  test('Chalk is exactly what it was before v1.3', () => {
    expect(THEMES.light.C).toMatchObject({
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
      chrome: 'rgba(255,255,255,0.7)',
    });
    expect(THEMES.dark.C).toMatchObject({
      bg: '#151412',
      card: '#201F1C',
      text: '#F5F2EC',
      dim: '#A9A49B',
      accent: '#9B8FFF',
      accentSoft: '#221E45',
      onAccent: '#100C2E',
    });
    expect(THEMES.light.SHADOW.shadowColor).toBe('#5C4F3D');
    expect(THEMES.dark.SHADOW.shadowColor).toBe('#000');
  });

  test('shadows take their colour from the palette in light mode and are black in dark mode', () => {
    const want = { chalk: '#5C4F3D', berry: '#5C4F3D', cocoa: '#5C4F3D', ocean: '#34465C', graphite: '#2A2A2A' };
    for (const [p, color] of Object.entries(want)) {
      const light = THEMES[themeKeyOf(p, false)];
      const dark = THEMES[themeKeyOf(p, true)];
      for (const k of ['SHADOW_SM', 'SHADOW', 'SHADOW_LG']) {
        expect(light[k].shadowColor).toBe(color);
        expect(dark[k].shadowColor).toBe('#000');
      }
    }
  });

  test('the type scale follows the palette’s text colours', () => {
    const th = THEMES['berry-dark'];
    expect(th.T.largeTitle.color).toBe(th.C.text);
    expect(th.T.callout.color).toBe(th.C.dim);
    expect(th.T.caps.color).toBe(th.C.faint);
  });

  test('the palette data has light and dark with the same tokens', () => {
    for (const p of PALETTES) expect(Object.keys(p.dark).sort()).toEqual(Object.keys(p.light).sort());
  });
});

describe('resolveTheme', () => {
  test('mode: auto follows the phone, light and dark are fixed', () => {
    expect(resolveTheme({ mode: 'system', scheme: 'dark' })).toBe('dark');
    expect(resolveTheme({ mode: 'system', scheme: 'light' })).toBe('light');
    expect(resolveTheme({ mode: 'system', scheme: null })).toBe('light');
    expect(resolveTheme({ mode: 'light', scheme: 'dark' })).toBe('light');
    expect(resolveTheme({ mode: 'dark', scheme: 'light' })).toBe('dark');
    expect(resolveTheme()).toBe('light');
  });

  test('a Pro palette in every mode', () => {
    expect(resolveTheme({ mode: 'system', palette: 'ocean', scheme: 'dark', pro: true })).toBe('ocean-dark');
    expect(resolveTheme({ mode: 'light', palette: 'berry', scheme: 'dark', pro: true })).toBe('berry-light');
    expect(resolveTheme({ mode: 'dark', palette: 'graphite', scheme: 'light', pro: true })).toBe('graphite-dark');
    expect(resolveTheme({ mode: 'system', palette: 'cocoa', scheme: 'light', pro: true })).toBe('cocoa-light');
    expect(resolveTheme({ mode: 'dark', palette: 'chalk', pro: true })).toBe('dark');
  });

  test('without Pro the app shows Chalk, in the same mode', () => {
    for (const p of PRO_PALETTES) {
      expect(resolveTheme({ mode: 'dark', palette: p, pro: false })).toBe('dark');
      expect(resolveTheme({ mode: 'system', palette: p, scheme: 'light' })).toBe('light');
      expect(shownPalette(p, false)).toBe('chalk');
      expect(shownPalette(p, true)).toBe(p);
    }
  });

  test('an unknown or missing palette falls back to Chalk', () => {
    expect(resolveTheme({ mode: 'dark', palette: 'neon', pro: true })).toBe('dark');
    expect(resolveTheme({ mode: 'light', palette: undefined, pro: true })).toBe('light');
    expect(resolveTheme({ mode: 'light', palette: null, pro: true })).toBe('light');
  });

  test('old theme keys from before v1.1 still land in light or dark', () => {
    // старий 'ocean' був темною темою, а не палітрою Океан
    for (const k of ['charcoal', 'ocean', 'violet', 'neon']) expect(isDarkMode(k, 'light')).toBe(true);
    for (const k of ['snow', 'matcha', 'sand', 'lavender']) expect(isDarkMode(k, 'dark')).toBe(false);
    expect(resolveTheme({ mode: 'ocean', palette: 'berry', pro: true })).toBe('berry-dark');
  });

  test('resolveThemeKey keeps its pre-v1.3 behaviour', () => {
    expect(resolveThemeKey('light', 'dark')).toBe('light');
    expect(resolveThemeKey('dark', 'light')).toBe('dark');
    expect(resolveThemeKey('system', 'dark')).toBe('dark');
    expect(resolveThemeKey(undefined, 'light')).toBe('light');
    expect(resolveThemeKey('charcoal', 'light')).toBe('dark');
    expect(resolveThemeKey('snow', 'dark')).toBe('light');
  });

  test('with PALETTES_ENABLED = false everyone sees Chalk, even with Pro', () => {
    jest.isolateModules(() => {
      jest.doMock('../src/flags', () => ({ ...jest.requireActual('../src/flags'), PALETTES_ENABLED: false }));
      const theme = require('../src/theme');
      expect(theme.resolveTheme({ mode: 'dark', palette: 'ocean', pro: true })).toBe('dark');
      expect(theme.shownPalette('berry', true)).toBe('chalk');
    });
    jest.dontMock('../src/flags');
  });
});

describe('what the palette never touches', () => {
  async function render(el, key) {
    let tree;
    await act(async () => {
      tree = create(<ThemeProvider value={THEMES[key]}>{el}</ThemeProvider>);
    });
    return tree;
  }

  test.each(KEYS)('the tab bar over the camera is the same dark glass in %s', async (key) => {
    const tree = await render(<Material camera />, key);
    const bg = StyleSheet.flatten(tree.root.findAll((n) => n.props.style && StyleSheet.flatten(n.props.style)?.backgroundColor)[0].props.style).backgroundColor;
    expect(bg).toBe(CAMERA_CHROME);
    await act(async () => tree.unmount());
  });

  test('the app icon is one picture with one shadow in every theme', async () => {
    const seen = new Set();
    for (const key of KEYS) {
      const tree = await render(<AppIcon size={64} />, key);
      const wrap = tree.root.findByProps({ testID: 'app-icon' });
      const img = wrap.findAll((n) => n.props.source)[0];
      seen.add(JSON.stringify([StyleSheet.flatten(wrap.props.style).shadowColor, img.props.source]));
      await act(async () => tree.unmount());
    }
    expect(seen.size).toBe(1);
  });
});
