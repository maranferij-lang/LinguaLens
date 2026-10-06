// Геометрія кадрів App Store (tools/store-shots/layout.js): спільний нижній
// край кадрів 3, 5 і 7 (без порожньої смуги внизу), симетричне лице картки
// на кадрі 3, предмети, вимкнені на картці сцени кадру 8, і вибір іконки
// для варіанта кадру 6 (тест іконки, PPO).
import path from 'path';

import { BOTTOM, cardBelow, cardScene, faceCrop, flashcardsLayout, HIDDEN_ON_CARD, resolveIcon, stackTwo } from '../tools/store-shots/layout';

const H = 2868;

describe('store shots layout', () => {
  test('the shared bottom leaves a margin like frames 2 and 4, not an empty band', () => {
    expect(BOTTOM).toBeGreaterThan(H - 220);
    expect(BOTTOM).toBeLessThan(H - 120);
  });

  test('frame 3: the face crop is symmetric around word, IPA and the speaker', () => {
    // справжні виміри uk (pt): слово, IPA, кнопка «Слухати»
    const f = { word: { y: 385, h: 46 }, ipa: { y: 432, h: 23 }, speak: { y: 475, h: 50 } };
    const { y0, y1 } = faceCrop(f, 64);
    expect(f.word.y - y0).toBe(64);
    expect(y1 - (f.speak.y + f.speak.h)).toBe(64);
  });

  test('frame 3: cards and buttons end on the shared bottom', () => {
    const l = flashcardsLayout({ top: 710, backH: 730, frontH: 780, btnH: 183 });
    expect(l.end).toBeCloseTo(BOTTOM, 5);
    expect(l.fTop).toBeGreaterThanOrEqual(710 + 730 + 100); // проміжок не менший за 100
    // забагато місця: проміжки впираються в межі, низ не їде за BOTTOM
    const loose = flashcardsLayout({ top: 710, backH: 300, frontH: 300, btnH: 150 });
    expect(loose.end).toBeLessThanOrEqual(BOTTOM);
  });

  test('frame 5: the word-of-the-day card grows down to the shared bottom', () => {
    const r = cardBelow({ above: 1706, w: 400, h: 300, maxW: 1160 });
    expect(r.end).toBeCloseTo(BOTTOM, 5);
    expect(r.top).toBeGreaterThanOrEqual(1706 + 80);
    expect(400 * r.k).toBeLessThanOrEqual(1160);
  });

  test('frame 7: profile and achievements share one scale and end on the shared bottom', () => {
    const r = stackTwo({ top: 700, h1: 605, h2: 156, kMax: 1120 / 416 });
    expect(r.end).toBe(BOTTOM);
    expect(r.top2 + 156 * r.k).toBeCloseTo(BOTTOM, 5);
    expect(700 + 605 * r.k + 80).toBeLessThanOrEqual(r.top2 + 1e-6); // проміжок між картками
  });

  test('frame 8: board and towel are switched off on the scene card, the rest stay', () => {
    const scene = { id: 'kitchen', objects: ['window', 'plant', 'board', 'towel', 'mug'].map((key) => ({ key })) };
    expect(HIDDEN_ON_CARD).toEqual(['board', 'towel']);
    expect(cardScene(scene).objects.map((o) => o.key)).toEqual(['window', 'plant', 'mug']);
    expect(scene.objects).toHaveLength(5); // оригінал не змінено
  });

  describe('frame 6 icon (PPO variant)', () => {
    const env = (files) => ({
      staticDir: '/w/static',
      root: '/repo',
      cwd: '/repo',
      exists: (p) => files.includes(p),
      join: path.posix.join,
      isAbsolute: path.posix.isAbsolute,
    });
    test('default: assets/icon.png of the captured version', () => {
      expect(resolveIcon(undefined, env([]))).toBe('/w/static/icon.png');
    });
    test('ICON names an alternate icon of the same version', () => {
      const e = env(['/w/static/icon-eye.png', '/repo/assets/icon-eye.png']);
      expect(resolveIcon('icon-eye.png', e)).toBe('/w/static/icon-eye.png');
      expect(resolveIcon('assets/icon-eye.png', e)).toBe('/w/static/icon-eye.png');
    });
    test('ICON may be a path to any PNG', () => {
      expect(resolveIcon('/tmp/x.png', env(['/tmp/x.png']))).toBe('/tmp/x.png');
      expect(resolveIcon('assets/icon-eye.png', env(['/repo/assets/icon-eye.png']))).toBe('/repo/assets/icon-eye.png');
    });
    test('a missing icon is an error, not a silent fallback', () => {
      expect(() => resolveIcon('icon-nope.png', env([]))).toThrow(/icon-nope\.png/);
    });
  });
});
