// Картки сцени: кожен шаблон рендериться з 0, 1 і 8 предметами й з довгими
// німецькими словами, підписи кладуться без накладань, а кольори на фото
// тримають контраст.
import { StyleSheet } from 'react-native';
import { Line } from 'react-native-svg';
import { act, create } from 'react-test-renderer';
import { ShareCard } from '../src/share/ShareCards';
import { FRAME_ROWS, LABEL_INK, SCENE_INK, frameLayout, insetFrame, listFontSize, photoAnchor } from '../src/share/SceneCards';
import { chipSize } from '../src/scene/sceneLayout';
import { CARD_H, CARD_W, CONTENT_W, PAD_BOTTOM, PALETTES, SCENE_TEMPLATES, templatesFor } from '../src/share/layout';
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

// Номери «Рамки»: число в рядку списку й число в крапці на фото
const flat = (n) => StyleSheet.flatten(n.props.style) || {};
function frameNumbers(tree) {
  const dots = tree.root
    .findAll((n) => typeof n.type === 'string' && flat(n).width === 20 && flat(n).borderRadius === 10)
    .map((n) => ({ n: n.findAll((c) => typeof c.props?.children === 'number')[0]?.props.children, top: flat(n).top, left: flat(n).left }));
  // рядок списку: номер (або тиха крапка) і слово
  const rows = tree.root
    .findAll((n) => typeof n.type === 'string' && flat(n).height === 27 && flat(n).flexDirection === 'row')
    .map((row) => {
      const num = row.findAll((c) => typeof c.type === 'string' && flat(c).width === 26 && typeof c.props.children === 'number')[0];
      const word = row.findAll((c) => c.props?.numberOfLines === 1 && typeof c.props.children?.[0] === 'string')[0];
      return { n: num ? num.props.children : null, word: word.props.children[0] };
    });
  return { dots, rows };
}
const sceneOf = (objects) => ({ kind: 'scene', scene: { id: 's', image: 'file:///s.jpg', width: 1080, height: 1920, lang: 'en', nativeLang: 'uk', createdAt: 1, objects } });
// box: [ymin, xmin, ymax, xmax] у 0–1000
const ROOM = {
  sofa: { key: 'sofa', word: 'sofa', translation: 'диван', box: [560, 80, 760, 920], outline: null },
  lamp: { key: 'lamp', word: 'lamp', translation: 'лампа', box: [60, 400, 220, 600], outline: null },
  picture: { key: 'picture', word: 'picture', translation: 'картина', box: [250, 300, 420, 700], outline: null },
  rug: { key: 'rug', word: 'rug', translation: 'килим', box: [820, 100, 980, 900], outline: null },
  plant: { key: 'plant', word: 'plant', translation: 'рослина', box: [400, 820, 700, 990], outline: null },
  table: { key: 'table', word: 'table', translation: 'стіл', box: [740, 300, 860, 700], outline: null },
  cup: { key: 'cup', word: 'cup', translation: 'чашка', box: [720, 450, 760, 520], outline: null },
};

describe('Frame numbers match the dots on the photo', () => {
  test('lamp under the ceiling and rug on the floor: only what the inset shows is numbered', async () => {
    // лампа y≈0.14, диван y≈0.66, килим y≈0.9 — у вставку разом не влазять
    const tree = await card(sceneOf([ROOM.lamp, ROOM.sofa, ROOM.rug]), 'sceneFrame');
    const { dots, rows } = frameNumbers(tree);
    const listed = rows.filter((r) => r.n).map((r) => r.n);
    expect(listed.length).toBeGreaterThan(0);
    // кожен номер зі списку — крапкою на фото, і жодної крапки без рядка
    expect(dots.map((d) => d.n).sort()).toEqual([...listed].sort());
    expect(listed).toEqual(listed.map((_, i) => i + 1));
    // видимі — першими, лампа без номера, але в списку лишилась
    expect(rows.map((r) => [r.word, r.n])).toEqual([['sofa', 1], ['rug', 2], ['lamp', null]]);
    // крапка «1» (диван) вище за «2» (килим): номер стоїть на своєму предметі
    const at = (n) => dots.find((d) => d.n === n);
    expect(at(1).top).toBeLessThan(at(2).top);
    for (const d of dots) {
      expect(d.left).toBeGreaterThanOrEqual(0);
      expect(d.left + 20).toBeLessThanOrEqual(CONTENT_W);
    }
    await act(async () => tree.unmount());
  });

  test('a seven-object room with “+N”: every listed number is a dot', async () => {
    const tree = await card(sceneOf(Object.values(ROOM)), 'sceneFrame');
    const { dots, rows } = frameNumbers(tree);
    expect(rows).toHaveLength(FRAME_ROWS);
    const listed = rows.filter((r) => r.n).map((r) => r.n);
    expect(dots.map((d) => d.n).sort()).toEqual([...listed].sort());
    expect(listed).toEqual(listed.map((_, i) => i + 1));
    // рядки без номера — лише після пронумерованих
    expect(rows.slice(listed.length).every((r) => r.n === null)).toBe(true);
    await act(async () => tree.unmount());
  });

  test('a dot that would sit on another dot goes to the list without a number', () => {
    // подушка лежить на дивані, і крапки обох падають в одне місце
    const sofa = { key: 'sofa', word: 'sofa', translation: 'диван', box: [500, 100, 700, 900], outline: null };
    const cushion = { key: 'cushion', word: 'cushion', translation: 'подушка', box: [580, 480, 620, 520], outline: null };
    const { rows, marks } = frameLayout(sceneOf([sofa, cushion]).scene);
    expect(rows.map((r) => [r.o.key, r.n])).toEqual([['cushion', 1], ['sofa', null]]);
    expect(marks.map((m) => m.o.key)).toEqual(['cushion']);
  });

  test('random scenes: numbers are 1…k, each a separate dot inside the inset', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let run = 0; run < 200; run++) {
      const objects = Array.from({ length: 1 + Math.floor(rnd() * 10) }, (_, i) => {
        const y = Math.floor(rnd() * 900);
        const x = Math.floor(rnd() * 900);
        return { key: 'o' + i, word: 'w' + i, translation: '', box: [y, x, y + 20 + Math.floor(rnd() * (980 - y)), x + 20 + Math.floor(rnd() * (980 - x))], outline: null };
      });
      const { rows, marks, photoH } = frameLayout(sceneOf(objects).scene);
      expect(rows).toHaveLength(Math.min(objects.length, FRAME_ROWS));
      expect(marks.map((m) => m.n)).toEqual(marks.map((_, i) => i + 1));
      expect(rows.filter((r) => r.n).map((r) => r.n)).toEqual(marks.map((m) => m.n));
      for (const m of marks) {
        expect(m.a.x).toBeGreaterThanOrEqual(10);
        expect(m.a.x).toBeLessThanOrEqual(CONTENT_W - 10);
        expect(m.a.y).toBeGreaterThanOrEqual(10);
        expect(m.a.y).toBeLessThanOrEqual(photoH - 10);
        for (const k of marks) if (k !== m) expect(Math.hypot(k.a.x - m.a.x, k.a.y - m.a.y)).toBeGreaterThanOrEqual(22);
      }
    }
  });
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

// «Підписи»: білий текст стоїть на темній плашці, тож читається на будь-якій
// стіні. Перевіряємо найгірший випадок — плашку просто на білому чи бежевому
// без пригашення фото.
const rgba = (c) => {
  if (c.startsWith('#')) return [0, 2, 4].map((i) => parseInt(c.slice(1 + i, 3 + i), 16)).concat(1);
  return c.match(/[\d.]+/g).map(Number);
};
// колір top з альфою поверх непрозорого bottom → '#rrggbb'
const over = (top, bottom) => {
  const [r, g, b, a] = rgba(top);
  const base = rgba(bottom);
  return '#' + [r, g, b].map((v, i) => Math.round(v * a + base[i] * (1 - a)).toString(16).padStart(2, '0')).join('');
};

test.each(['#FFFFFF', '#F2EFEA'])('Labels keep the word and translation at WCAG AA on a %s wall', (wall) => {
  const plate = over(LABEL_INK.plate, wall);
  expect(contrast(LABEL_INK.word, plate)).toBeGreaterThanOrEqual(4.5);
  expect(contrast(over(LABEL_INK.sub, plate), plate)).toBeGreaterThanOrEqual(4.5);
});

test('Labels: a dimmed photo, a plate the size the layout planned and a dark underlay under every leader', async () => {
  const p = payload(8);
  const tree = await card(p, 'sceneLabels');
  const boxes = placed(tree);
  // пригашення на всю картку, як на «Наліпках»
  expect(boxes.some((st) => st.width === CARD_W && st.height === CARD_H && /^rgba\(0,0,0,/.test(st.backgroundColor))).toBe(true);
  const plates = boxes.filter((st) => st.backgroundColor === LABEL_INK.plate);
  expect(plates).toHaveLength(8);
  // розмір плашки — з chipSize з тими самими полями, що й у плашки
  const sizes = p.scene.objects.map((o) => chipSize(o.word, o.translation, { size: 15, sub: 12, maxW: 150, padX: plates[0].paddingHorizontal, padY: 3 }));
  expect(plates.map((st) => [st.width, st.height])).toEqual(sizes.map((z) => [z.w, z.h]));
  const lines = tree.root.findAllByType(Line);
  const dark = lines.filter((l) => l.props.stroke === '#000000');
  const light = lines.filter((l) => l.props.stroke === '#FFFFFF');
  expect(light.length).toBeGreaterThan(0);
  expect(dark).toHaveLength(light.length);
  for (const l of dark) expect(l.props.strokeWidth).toBeGreaterThan(light[0].props.strokeWidth);
  await act(async () => tree.unmount());
});

describe('dots stay off the brand footer and the Instagram avatar', () => {
  const frame = { x: 0, y: 0, w: CARD_W, h: CARD_H };
  // Перший рядок «LinguaLens» — нижче за цю межу
  const footerTop = CARD_H - PAD_BOTTOM - 40;

  test('a rug that reaches into the footer gets its dot on its own upper edge, above the footer', () => {
    const rug = { key: 'rug', word: 'rug', translation: 'килим', box: [850, 200, 990, 800], outline: null };
    const a = photoAnchor(rug, frame);
    expect(a.y).toBeLessThan(footerTop);
    expect(a.y).toBeGreaterThanOrEqual((850 / 1000) * CARD_H);
  });

  test('an object hidden entirely under the footer is not labelled on the photo; the rest are', async () => {
    const p = payload(3);
    p.scene.objects.push({ key: 'mat', word: 'die Fußmatte', translation: 'килимок', box: [930, 300, 995, 700], outline: null });
    for (const template of ['sceneStickers', 'sceneLabels']) {
      const tree = await card(p, template);
      const all = texts(tree);
      expect(all).not.toContain('die Fußmatte');
      for (const o of p.scene.objects.slice(0, 3)) expect(all).toContain(o.word);
      // крапки (кружечки svg) — жодної нижче межі бренду; на «Наліпках»
      // плашка стоїть на самому предметі, і крапка є лише з виносною лінією
      const dots = tree.root.findAll((n) => n.props && typeof n.props.cy === 'number');
      if (template === 'sceneLabels') expect(dots.length).toBeGreaterThan(0);
      for (const d of dots) expect(d.props.cy).toBeLessThan(footerTop);
      await act(async () => tree.unmount());
    }
  });
});
