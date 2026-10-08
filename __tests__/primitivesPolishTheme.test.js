// Токен C.scrim: затемнення під аркушами (згода на AI, мова, слово, редактор
// профілю). Один на тему, чорний із прозорістю: у темній версії густіший, бо
// 40 % чорного на #151412 ледь помітні.
import { PALETTES, THEMES, themeKeyOf } from '../src/theme';

const alpha = (rgba) => {
  const m = /^rgba\(0,0,0,([0-9.]+)\)$/.exec(rgba);
  return m ? Number(m[1]) : null;
};

describe('C.scrim', () => {
  test.each(Object.keys(THEMES))('%s has a black scrim with an alpha', (key) => {
    const { C, isDark } = THEMES[key];
    expect(alpha(C.scrim)).toBe(isDark ? 0.55 : 0.4);
  });

  test('every palette gets the same scrim per mode: it is not a palette colour', () => {
    for (const mode of ['light', 'dark']) {
      const set = new Set(PALETTES.map((p) => THEMES[themeKeyOf(p.key, mode === 'dark')].C.scrim));
      expect(set.size).toBe(1);
    }
  });

  test('dark themes dim more than light ones, and neither is opaque', () => {
    expect(alpha(THEMES.dark.C.scrim)).toBeGreaterThan(alpha(THEMES.light.C.scrim));
    expect(alpha(THEMES.dark.C.scrim)).toBeLessThan(0.7);
    expect(alpha(THEMES.light.C.scrim)).toBeGreaterThanOrEqual(0.35);
  });

  test('the scrim visibly separates a dark sheet backdrop from the page (at least 5 levels of the blue channel on the tinted palettes)', () => {
    const channel = (hex, i) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
    for (const key of ['dark', 'ocean-dark', 'berry-dark', 'graphite-dark', 'cocoa-dark']) {
      const { C } = THEMES[key];
      const a = alpha(C.scrim);
      // чорне поверх тла: колір * (1 - alpha)
      const drop = Math.max(...[0, 1, 2].map((i) => channel(C.bg, i) - Math.round(channel(C.bg, i) * (1 - a))));
      expect([key, drop >= 5]).toEqual([key, true]);
    }
  });

  test('existing tokens are untouched by the new one', () => {
    expect(THEMES.light.C.sheet).toBe(THEMES.light.C.card);
    expect(THEMES.dark.C.chrome).toMatch(/^rgba\(/);
  });
});
