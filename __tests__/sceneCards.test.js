// Картки сцени: кожен шаблон рендериться з 0, 1 і 8 предметами й з довгими
// німецькими словами, підписи кладуться без накладань, а кольори на фото
// тримають контраст.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ShareCard } from '../src/share/ShareCards';
import { FRAME_ROWS, SCENE_INK, insetFrame, listFontSize } from '../src/share/SceneCards';
import { CARD_H, CARD_W, PALETTES, SCENE_TEMPLATES, templatesFor } from '../src/share/layout';
import { makeT } from '../src/i18n';

const t = makeT('en');
const locale = 'en-GB';

const WORDS = [
  ['die Schreibtischlampe', 'настільна лампа'],
  ['der Kühlschrankmagnet', 'магніт на холодильник'],
  ['die Kaffeetasse', 'чашка для кави'],
  ['das Bücherregal', 'книжкова полиця'],
  ['die Zimmerpflanze', 'кімнатна рослина'],
  ['der Wäscheständer', 'сушарка для білизни'],
  ['die Fernbedienung', 'пульт'],
  ['der Teppich', ''],
];

function objects(n) {
  return Array.from({ length: n }, (_, i) => {
    const x = (i % 3) * 300 + 40;
    const y = Math.floor(i / 3) * 280 + 120;
    const [word, translation] = WORDS[i % WORDS.length];
    return { key: 'o' + i, word, translation, box: [y, x, y + 200, x + 240], outline: null };
  });
}

const payload = (n) => ({
  kind: 'scene',
  scene: { id: 's', image: 'file:///scene.jpg', width: 1080, height: 1920, lang: 'de', nativeLang: 'uk', createdAt: Date.UTC(2026, 9, 1), objects: objects(n) },
});

async function card(p, template, pal = PALETTES[0]) {
  let tree;
  await act(async () => {
    tree = create(<ShareCard payload={p} template={template} pal={pal} t={t} locale={locale} />);
  });
  return tree;
}

const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
// Абсолютно розставлені підписи — View з left/top і шириною
const placed = (tree) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && n.type !== 'RNSVGSvgView')
    .map((n) => StyleSheet.flatten(n.props.style) || {})
    .filter((st) => st.position === 'absolute' && typeof st.width === 'number' && typeof st.left === 'number');

test('a scene payload offers the three scene templates', () => {
  expect(templatesFor(payload(2))).toEqual(SCENE_TEMPLATES);
  expect(templatesFor({ kind: 'scene' })).toEqual([]);
});

describe.each(SCENE_TEMPLATES)('%s', (template) => {
  test.each([0, 1, 8])('renders with %i objects in every palette', async (n) => {
    for (const pal of PALETTES) {
      const tree = await card(payload(n), template, pal);
      const all = texts(tree);
      expect(all).toContain('LinguaLens');
      // мова й кількість — тихим капсом
      expect(all).toContain(`Deutsch · ${t('sceneCardWords', { n })}`);
      await act(async () => tree.unmount());
    }
  });

  test('the card is exactly 360×640', async () => {
    const tree = await card(payload(3), template);
    const root = tree.root.findAll((n) => typeof n.type === 'string')[0];
    expect(root.props.style).toMatchObject({ width: CARD_W, height: CARD_H });
    await act(async () => tree.unmount());
  });
});

test('Stickers and Labels show every word and translation on the photo, without overlaps, inside the card', async () => {
  for (const template of ['sceneStickers', 'sceneLabels']) {
    const tree = await card(payload(8), template);
    const all = texts(tree);
    for (const [word, tr] of WORDS) {
      expect(all).toContain(word);
      if (tr) expect(all).toContain(tr);
    }
    const boxes = placed(tree).filter((st) => st.height && st.width < CARD_W);
    expect(boxes.length).toBeGreaterThanOrEqual(8);
    const labels = boxes.slice(-8);
    for (const a of labels) {
      expect(a.left).toBeGreaterThanOrEqual(0);
      expect(a.top).toBeGreaterThanOrEqual(0);
      expect(a.left + a.width).toBeLessThanOrEqual(CARD_W);
      expect(a.top + a.height).toBeLessThanOrEqual(CARD_H);
    }
    for (let i = 0; i < labels.length; i++) {
      for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
        const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
        expect(w > 0 && h > 0).toBe(false);
      }
    }
    await act(async () => tree.unmount());
  }
});

test('Frame lists six rows, then “+N”, numbered from one', async () => {
  const tree = await card(payload(8), 'sceneFrame');
  const all = texts(tree);
  expect(FRAME_ROWS).toBe(6);
  expect(all).toEqual(expect.arrayContaining([' — настільна лампа', t('sceneCardMore', { n: 2 })]));
  // номери — лише в рядків списку: і в самому списку, і на фото
  const numbers = tree.root.findAll((n) => typeof n.props?.children === 'number').map((n) => n.props.children);
  expect([...new Set(numbers)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(all).not.toContain('der Teppich'); // восьмий — лише в «+2»
  await act(async () => tree.unmount());
});

test('Frame without objects has no list and no “+N”', async () => {
  const tree = await card(payload(0), 'sceneFrame');
  expect(texts(tree).some((s) => s.startsWith('+'))).toBe(false);
  await act(async () => tree.unmount());
});

test('long German rows shrink the whole list together, never below 12', () => {
  expect(listFontSize(objects(1).map((o) => ({ ...o, word: 'mug', translation: 'кружка' })))).toBe(17);
  const long = listFontSize([{ word: 'die Donaudampfschifffahrtsgesellschaft', translation: 'пароплавна компанія на Дунаї' }]);
  expect(long).toBe(12);
  expect(listFontSize(objects(8))).toBeLessThan(17);
  expect(listFontSize([])).toBe(17);
});

describe('Frame inset crop', () => {
  test('without slack the photo just covers the inset', () => {
    expect(insetFrame(1080, 1920, 90, 160, [{ x: 0.5, y: 0.5 }])).toEqual({ x: 0, y: 0, w: 90, h: 160 });
  });

  test('a short inset slides to the band with the most objects', () => {
    // фото 296×526 у вставці 296×260: усі предмети — у верхній половині
    const f = insetFrame(1080, 1920, 296, 260, [{ x: 0.5, y: 0.1 }, { x: 0.3, y: 0.2 }, { x: 0.6, y: 0.3 }]);
    expect(f.w).toBeCloseTo(296);
    expect(f.y).toBeLessThanOrEqual(0);
    for (const y of [0.1, 0.2, 0.3]) {
      const py = f.y + y * f.h;
      expect(py).toBeGreaterThan(0);
      expect(py).toBeLessThan(260);
    }
  });

  test('objects at both ends: the band keeps the larger group', () => {
    const pts = [{ x: 0.5, y: 0.08 }, { x: 0.5, y: 0.85 }, { x: 0.4, y: 0.9 }, { x: 0.6, y: 0.93 }];
    const f = insetFrame(1080, 1920, 296, 260, pts);
    const inside = pts.filter((p) => f.y + p.y * f.h > 0 && f.y + p.y * f.h < 260);
    expect(inside).toHaveLength(3);
  });

  test('no objects: centred', () => {
    const f = insetFrame(1080, 1920, 296, 260, []);
    expect(f.y).toBeCloseTo((260 - f.h) / 2);
  });
});

// WCAG 2.x — та сама перевірка, що й для палітр карток
function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
};

test.each(PALETTES.map((p) => [p.key]))('%s chips on the photo keep text at WCAG AA', (key) => {
  const ink = SCENE_INK[key];
  expect(ink).toBeTruthy();
  expect(contrast(ink.word, ink.chip)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(ink.sub, ink.chip)).toBeGreaterThanOrEqual(4.5);
});
