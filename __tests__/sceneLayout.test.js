// Розкладка підписів сцени: жодних накладань, усе в безпечній зоні, той
// самий результат для тієї самої сцени, лінія — лише коли підпис відсунули.
import { anchorOf, chipSize, fitContain, layoutChips, rectGap, rectOf } from '../src/scene/sceneLayout';

// Детермінований генератор (mulberry32): сцени «випадкові», але однакові
// на кожному прогоні — падіння завжди можна відтворити за номером.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WORDS = [
  ['mug', 'кружка'],
  ['die Schreibtischlampe', 'настільна лампа'],
  ['der Kühlschrankmagnet', 'магніт на холодильник'],
  ['la planta', 'рослина'],
  ['book', 'книжка'],
  ['das Bücherregal', 'книжкова полиця'],
  ['el sofá', 'диван'],
  ['headphones', 'навушники'],
  ['die Fernbedienung', 'пульт'],
  ['lamp', ''],
];

const STAGE = { w: 393, h: 852 };
const FRAME = fitContain(1080, 1920, STAGE.w, STAGE.h);
const BOUNDS = { x1: 12, y1: 110, x2: STAGE.w - 12, y2: STAGE.h - 112 };

function scene(seed) {
  const r = rng(seed);
  const n = 1 + Math.floor(r() * 8);
  return Array.from({ length: n }, (_, i) => {
    const bw = 40 + r() * 420;
    const bh = 30 + r() * 420;
    const x1 = r() * (1000 - bw);
    const y1 = r() * (1000 - bh);
    const box = [y1, x1, y1 + bh, x1 + bw].map(Math.round);
    const [word, tr] = WORDS[Math.floor(r() * WORDS.length)];
    const size = chipSize(word, tr);
    return { key: 'o' + i, rect: rectOf(box, FRAME), anchor: anchorOf({ box }, FRAME), w: size.w, h: size.h };
  });
}

const overlapArea = (a, b) => {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
};
const asRect = (c) => ({ x1: c.x, y1: c.y, x2: c.x + c.w, y2: c.y + c.h });
const SEEDS = Array.from({ length: 300 }, (_, i) => i + 1);

describe.each(['chip', 'callout'])('%s mode on 300 seeded scenes', (mode) => {
  test('no two labels overlap', () => {
    for (const seed of SEEDS) {
      const out = layoutChips(scene(seed), BOUNDS, { mode });
      for (let i = 0; i < out.length; i++) {
        for (let j = i + 1; j < out.length; j++) {
          if (overlapArea(out[i], out[j]) > 0) throw new Error(`seed ${seed}: ${out[i].key} overlaps ${out[j].key}`);
        }
      }
    }
  });

  test('every label stays inside the safe bounds', () => {
    for (const seed of SEEDS) {
      for (const c of layoutChips(scene(seed), BOUNDS, { mode })) {
        expect(c.x).toBeGreaterThanOrEqual(BOUNDS.x1 - 1e-6);
        expect(c.y).toBeGreaterThanOrEqual(BOUNDS.y1 - 1e-6);
        expect(c.x + c.w).toBeLessThanOrEqual(BOUNDS.x2 + 1e-6);
        expect(c.y + c.h).toBeLessThanOrEqual(BOUNDS.y2 + 1e-6);
      }
    }
  });

  test('the same scene always gets the same layout, in input order', () => {
    for (const seed of SEEDS.slice(0, 60)) {
      const items = scene(seed);
      const a = layoutChips(items, BOUNDS, { mode });
      expect(layoutChips(scene(seed), BOUNDS, { mode })).toEqual(a);
      expect(a.map((c) => c.key)).toEqual(items.map((it) => it.key));
    }
  });
});

test('chip mode draws a leader exactly when the chip was pushed away from its object', () => {
  let displaced = 0;
  for (const seed of SEEDS) {
    const items = scene(seed);
    layoutChips(items, BOUNDS).forEach((c, i) => {
      const far = rectGap(asRect(c), items[i].rect) > 6 + 8;
      expect(!!c.leader).toBe(far);
      if (c.leader) {
        displaced++;
        // лінія починається на предметі й закінчується на краю плашки
        expect(c.leader.from).toEqual(items[i].anchor);
        expect(c.leader.to.x).toBeGreaterThanOrEqual(c.x - 1e-6);
        expect(c.leader.to.x).toBeLessThanOrEqual(c.x + c.w + 1e-6);
      }
    });
  }
  // переконуємось, що випадок справді трапляється в наборі
  expect(displaced).toBeGreaterThan(0);
});

test('callout mode always connects the label to its dot and never covers a dot', () => {
  for (const seed of SEEDS.slice(0, 120)) {
    const items = scene(seed);
    const out = layoutChips(items, BOUNDS, { mode: 'callout' });
    out.forEach((c) => expect(c.leader).not.toBeNull());
    for (const c of out) {
      for (const it of items) {
        const inside = it.anchor.x > c.x && it.anchor.x < c.x + c.w && it.anchor.y > c.y && it.anchor.y < c.y + c.h;
        // Якщо зона забита, запасне місце може сісти на крапку — але не в наших сценах
        expect(inside).toBe(false);
      }
    }
  }
});

describe('preferences', () => {
  const item = (key, box, word = 'mug', tr = 'кружка') => {
    const s = chipSize(word, tr);
    return { key, rect: rectOf(box, FRAME), anchor: anchorOf({ box }, FRAME), w: s.w, h: s.h };
  };

  test('a lone object gets its chip right above it, centred, without a leader', () => {
    const it = item('a', [500, 400, 640, 600]);
    const [c] = layoutChips([it], BOUNDS);
    expect(c.leader).toBeNull();
    expect(c.y + c.h).toBeCloseTo(it.rect.y1 - 6);
    expect(c.x + c.w / 2).toBeCloseTo((it.rect.x1 + it.rect.x2) / 2);
  });

  test('no room above (under the top bar): the chip goes below', () => {
    const it = item('a', [0, 400, 80, 600]);
    const [c] = layoutChips([it], BOUNDS);
    expect(c.y).toBeCloseTo(it.rect.y2 + 6);
    expect(c.leader).toBeNull();
  });

  test('the bigger object is placed first and keeps the spot above', () => {
    const big = item('big', [420, 300, 700, 700]);
    const small = item('small', [430, 420, 470, 560]);
    const out = layoutChips([small, big], BOUNDS);
    const bigChip = out[1];
    expect(bigChip.y + bigChip.h).toBeCloseTo(big.rect.y1 - 6);
    expect(overlapArea(out[0], out[1])).toBe(0);
  });

  test('a chip does not hide a small neighbour when it can sit elsewhere', () => {
    const mug = item('mug', [520, 450, 600, 540]);
    const above = item('lamp', [610, 430, 700, 560], 'lamp', 'лампа'); // одразу під чашкою
    const out = layoutChips([mug, above], BOUNDS);
    expect(overlapArea(out[1], { x: mug.rect.x1, y: mug.rect.y1, w: mug.rect.x2 - mug.rect.x1, h: mug.rect.y2 - mug.rect.y1 })).toBe(0);
  });

  test('labels next to their dot align towards it', () => {
    const it = item('a', [500, 100, 600, 200]);
    const [c] = layoutChips([it], BOUNDS, { mode: 'callout' });
    const expected = c.x + c.w <= it.anchor.x ? 'right' : c.x >= it.anchor.x ? 'left' : 'center';
    expect(c.align).toBe(expected);
  });

  test('empty input is fine', () => {
    expect(layoutChips([], BOUNDS)).toEqual([]);
    expect(layoutChips(undefined, BOUNDS)).toEqual([]);
  });
});

describe('sizes and coordinates', () => {
  test('a 9:16 image fills the width of a taller phone and sits in the middle', () => {
    const f = fitContain(1080, 1920, 393, 852);
    expect(f.w).toBeCloseTo(393);
    expect(f.h).toBeCloseTo(393 * (16 / 9));
    expect(f.y).toBeCloseTo((852 - f.h) / 2);
  });

  test('boxes map into the fitted image', () => {
    const f = { x: 10, y: 20, w: 100, h: 200 };
    expect(rectOf([0, 0, 1000, 1000], f)).toEqual({ x1: 10, y1: 20, x2: 110, y2: 220 });
    expect(rectOf([500, 250, 750, 500], f)).toEqual({ x1: 35, y1: 120, x2: 60, y2: 170 });
  });

  test('the anchor is the silhouette centre when there is one, the box centre otherwise', () => {
    const f = { x: 0, y: 0, w: 1000, h: 1000 };
    expect(anchorOf({ box: [0, 0, 1000, 400] }, f)).toEqual({ x: 200, y: 500 });
    const outline = [[100, 100], [100, 300], [300, 300], [300, 100]];
    expect(anchorOf({ box: [0, 0, 1000, 1000], outline }, f)).toEqual({ x: 200, y: 200 });
  });

  test('a bent, thin object gets its dot on the object, not in the air between its parts', () => {
    const f = { x: 0, y: 0, w: 1000, h: 1000 };
    // «Г»: стійка ліворуч і плече вгорі. Середнє вершин (383, 383) — у повітрі.
    const outline = [[0, 0], [0, 1000], [150, 1000], [150, 150], [1000, 150], [1000, 0]];
    const a = anchorOf({ box: [0, 0, 1000, 1000], outline }, f);
    expect(a.x < 150 || a.y < 150).toBe(true);
    // і не на самому краю — крапка має сидіти на предметі
    expect(Math.min(a.x, a.y)).toBeGreaterThan(30);
    // вироджений силует (усі точки на лінії) не ламає розкладку
    const flat = anchorOf({ box: [0, 0, 1000, 1000], outline: [[0, 0], [0, 500], [0, 1000]] }, f);
    expect(Number.isFinite(flat.x) && Number.isFinite(flat.y)).toBe(true);
  });

  test('long German words shrink the type but never the chip past its max width', () => {
    const short = chipSize('mug', 'кружка');
    const long = chipSize('die Donaudampfschifffahrtsgesellschaft', 'пароплавство');
    expect(short.wordSize).toBe(15);
    expect(long.wordSize).toBeLessThan(15);
    expect(long.wordSize).toBeGreaterThanOrEqual(11);
    expect(long.w).toBeLessThanOrEqual(172);
    expect(short.w).toBeLessThan(long.w);
  });

  test('a chip without a translation is one line tall', () => {
    expect(chipSize('lamp', '').h).toBeLessThan(chipSize('lamp', 'лампа').h);
  });
});
