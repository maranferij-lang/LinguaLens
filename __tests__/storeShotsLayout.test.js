// Геометрія кадрів App Store (tools/store-shots/layout.js): спільний нижній
// край кадрів 3, 5 і 7 (без порожньої смуги внизу), лице картки й квіз на
// кадрі 3, нахилена картка тижня цілком у кадрі 8, предмети, вимкнені на
// картці сцени кадру 8, дата екрана блокування й вибір іконки для варіанта
// кадру 6 (тест іконки, PPO).
import path from 'path';

import { BOTTOM, backCrop, cardBelow, cardScene, faceCrop, flashcardsTrio, HIDDEN_ON_CARD, insetLeft, lockScreenDate, resolveIcon, rotatedBox, stackTwo, TRIO } from '../tools/store-shots/layout';

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

  // справжні виміри uk (pt): зворот — наліпка й переклад, лице — середина
  // картки довкола слова, квіз — від «7 / 10» до зеленої відповіді
  const trio = () => flashcardsTrio({ top: 700, back: { w: 400, h: 266 }, front: { w: 230, h: 203 }, quiz: { w: 440, h: 281 }, W: 1320 });

  test('frame 3: the word side is the biggest thing on the frame, the quiz ends on the shared bottom', () => {
    const l = trio();
    // слово на лиці ~34 pt × k: не менше ~130 px, як фішка кадру 1 (BRIEF: «mug» читається в пошуку)
    expect(34 * l.front.k).toBeGreaterThanOrEqual(130);
    expect(l.front.k).toBeGreaterThan(l.back.k);
    expect(l.quiz.top + 281 * l.quiz.k).toBeCloseTo(BOTTOM, 5);
    expect(440 * l.quiz.k).toBeLessThanOrEqual(TRIO.maxQuizW + 1e-6);
  });

  test('frame 3: the front starts below the back’s translation and clears the quiz', () => {
    const l = trio();
    // без text у шматку звороту переклад закінчується backPad над його низом
    expect(l.front.top).toBeCloseTo(700 + (266 - TRIO.backPad) * l.back.k + TRIO.below, 6);
    expect(l.front.top + 203 * l.front.k + TRIO.gap).toBeLessThanOrEqual(l.quiz.top + 1e-6);
  });

  // справжні виміри звороту (pt): переклад «mug» і рамка прикладу під ним,
  // що починається за 24 pt (у всіх чотирьох локалях однаково)
  const backOf = (translation, example) => ({ card: { x: 20, y: 134, w: 400, h: 639 }, sticker_mug: { y: 291.7 }, translation, example });

  test('frame 3: the back crop ends above the example box, not on the tops of its letters', () => {
    const t = { x: 191.6, y: 480, w: 56.8, h: 34 };
    const example = { x: 44, y: 538, w: 352, h: 75 };
    const back = backCrop(backOf(t, example));
    expect(back.y + back.h).toBeLessThanOrEqual(example.y - TRIO.exampleGap + 1e-6);
    // і все ж поле під перекладом лишається, хай і менше за backPad
    expect(back.y + back.h - (t.y + t.h)).toBeGreaterThanOrEqual(16);
    // приклад далеко (або його нема) — поле рівно backPad
    expect(backCrop(backOf(t, { ...example, y: 700 })).h).toBeCloseTo(t.y + t.h + TRIO.backPad - back.y, 6);
    expect(backCrop(backOf(t)).h).toBeCloseTo(t.y + t.h + TRIO.backPad - back.y, 6);
  });

  test('frame 3: where the back crop ends does not move the front', () => {
    const t = { x: 191.6, y: 480, w: 56.8, h: 34 };
    const at = (example) => flashcardsTrio({ top: 700, back: backCrop(backOf(t, example)), front: { w: 230, h: 203 }, quiz: { w: 440, h: 281 }, W: 1320 });
    expect(at({ y: 520 }).front.top).toBeCloseTo(at().front.top, 6);
    expect(at().front.top).toBeCloseTo(700 + (t.y + t.h - backCrop(backOf(t)).y) * TRIO.kBack + TRIO.below, 6);
  });

  test('frame 3: the tilted front covers empty back-card space, not the translation', () => {
    // справжні виміри звороту (pt): uk «кружка», en-US «mug»; лице й квіз — як вище
    const rot = ([x, y], [cx, cy], deg) => {
      const a = (deg * Math.PI) / 180;
      return [cx + (x - cx) * Math.cos(a) - (y - cy) * Math.sin(a), cy + (x - cx) * Math.sin(a) + (y - cy) * Math.cos(a)];
    };
    const front = { x: 105, y: 352, w: 230, h: 203 };
    for (const translation of [{ x: 169.7, y: 480, w: 100.7, h: 34 }, { x: 191.6, y: 480, w: 56.8, h: 34 }]) {
      const back = backCrop(backOf(translation, { x: 44, y: 538, w: 352, h: 75 }));
      const l = flashcardsTrio({ top: 700, back, front, quiz: { w: 440, h: 281 }, W: 1320 });
      // верхній край лиця після повороту на −6° навколо його центру
      const fc = [l.front.left + (front.w * l.front.k) / 2, l.front.top + (front.h * l.front.k) / 2];
      const [p, q] = [[l.front.left, l.front.top], [l.front.left + front.w * l.front.k, l.front.top]].map((pt) => rot(pt, fc, -6));
      const edgeY = (x) => p[1] + ((q[1] - p[1]) * (x - p[0])) / (q[0] - p[0]);
      // низ рядка перекладу (з хвостиками літер) після повороту звороту на +8°
      const bc = [l.back.left + (back.w * l.back.k) / 2, l.back.top + (back.h * l.back.k) / 2];
      for (const x of [translation.x, translation.x + translation.w]) {
        const [px, py] = rot([l.back.left + (x - back.x) * l.back.k, l.back.top + (translation.y + translation.h - back.y) * l.back.k], bc, 8);
        expect(edgeY(px) - py).toBeGreaterThanOrEqual(16);
      }
    }
  });

  test('a rotated box: bounds grow with the angle and stay centred', () => {
    const b = rotatedBox({ left: 100, top: 200, w: 600, h: 1000, deg: 6 });
    expect((b.x1 + b.x2) / 2).toBeCloseTo(400, 6);
    expect((b.y1 + b.y2) / 2).toBeCloseTo(700, 6);
    expect(b.x2 - b.x1).toBeGreaterThan(600);
    expect(rotatedBox({ left: 0, top: 0, w: 10, h: 20, deg: 0 })).toEqual({ x1: 0, y1: 0, x2: 10, y2: 20 });
  });

  test('frame 8: the tilted week card keeps all four corners inside the frame', () => {
    const w = 600, h = Math.round((600 * 1920) / 1080);
    const left = insetLeft({ w, h, rot: 6, W: 1320, margin: 60 });
    const b = rotatedBox({ left, top: 1470, w, h, deg: 6 });
    expect(b.x2).toBeCloseTo(1320 - 60, 6);
    expect(b.x1).toBeGreaterThanOrEqual(40);
    expect(b.y2).toBeLessThanOrEqual(2868 - 40);
    // раніше картка стояла на W − 40 − 600 і різала правий край
    expect(rotatedBox({ left: 1320 - 40 - w, top: 1470, w, h, deg: 6 }).x2).toBeGreaterThan(1320);
  });

  test('frame 6: the Lock Screen date is written the way iOS writes it in each language', () => {
    const d = new Date(2026, 9, 6);
    expect(lockScreenDate('uk-UA', d)).toBe('вівторок, 6 жовтня');
    expect(lockScreenDate('es-MX', d)).toBe('martes, 6 de octubre');
    expect(lockScreenDate('en-US', d)).toBe('Tuesday, October 6');
    expect(lockScreenDate('en-GB', d)).toBe('Tuesday 6 October');
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
