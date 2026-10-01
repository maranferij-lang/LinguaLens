import {
  BAR_STUB,
  CARD_H,
  CARD_W,
  CONTENT_W,
  EXPORT_H,
  EXPORT_W,
  PALETTES,
  barHeights,
  capsSize,
  dateLabel,
  dayFromKey,
  dayLetter,
  fontSizeForWord,
  formatCount,
  initialOf,
  ipaLabel,
  paletteByKey,
  pickCollage,
  previewScale,
  quote,
  safeLocale,
  templatesFor,
  textEm,
  tierColor,
  toFileUri,
  exportSize,
  weekRangeLabel,
} from '../src/share/layout';

// Пробіли в Intl різні (вузький нерозривний, тонкий) — порівнюємо без них
const norm = (s) => s.replace(/\s+/g, ' ');

// WCAG 2.x відносна яскравість і контраст
function luminance(hex) {
  const v = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

const week = (start, values) =>
  values.map((value, i) => {
    const d = new Date(2026, 8, start + i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { key, dow: d.getDay(), value };
  });

describe('card format', () => {
  test('9:16 layout exports at exactly 1080x1920', () => {
    expect(CARD_W / CARD_H).toBeCloseTo(9 / 16);
    expect(EXPORT_W / CARD_W).toBe(EXPORT_H / CARD_H);
  });

  test('iOS capture size is in points, Android in pixels', () => {
    expect(exportSize('ios', 3)).toEqual({ width: 360, height: 640 });
    expect(exportSize('ios', 2)).toEqual({ width: 540, height: 960 });
    expect(exportSize('android', 2.75)).toEqual({ width: 1080, height: 1920 });
    expect(exportSize('web', 1)).toEqual({ width: 1080, height: 1920 });
  });

  test('bare tmp paths get a file:// scheme, URIs stay as they are', () => {
    expect(toFileUri('/var/mobile/tmp/ReactNative/a.png')).toBe('file:///var/mobile/tmp/ReactNative/a.png');
    expect(toFileUri('file:///tmp/a.png')).toBe('file:///tmp/a.png');
    expect(toFileUri('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(toFileUri(null)).toBe(null);
  });

  test('templates per payload kind', () => {
    expect(templatesFor({ kind: 'word', word: { word: 'mug' } })).toEqual(['sticker', 'entry', 'minimal']);
    expect(templatesFor({ kind: 'achievement', achievement: { id: 'words_10' } })).toEqual(['achievement']);
    expect(templatesFor({ kind: 'week', stats: {} })).toEqual(['week']);
    expect(templatesFor({ kind: 'word' })).toEqual([]);
    expect(templatesFor(null)).toEqual([]);
  });
});

describe('preview scale', () => {
  test('fits a 393x852 iPhone with room for the controls', () => {
    const s = previewScale({ width: 393, height: 852, top: 59, bottom: 34 });
    expect(s).toBeGreaterThan(0.6);
    expect(CARD_H * s).toBeLessThan(852 - 59 - 34 - 300);
    expect(CARD_W * s).toBeLessThan(393 - 80);
  });

  test('a single template gets a bigger preview: no hint and no dots', () => {
    const screen = { width: 375, height: 667, top: 20, bottom: 0 };
    expect(previewScale({ ...screen, multi: false })).toBeGreaterThan(previewScale(screen));
  });

  test('small phones still get a usable preview, big screens are capped', () => {
    expect(previewScale({ width: 320, height: 568, top: 20, bottom: 0 })).toBeGreaterThanOrEqual(0.36);
    expect(previewScale({ width: 1600, height: 1400 })).toBeLessThanOrEqual(0.8);
  });
});

describe('palettes', () => {
  test.each(PALETTES.map((p) => [p.key, p]))('%s keeps every text pair at WCAG AA', (_, p) => {
    expect(contrast(p.text, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.muted, p.bg)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.pillText, p.pill)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(p.onTile, p.tile)).toBeGreaterThanOrEqual(4.5);
    // акцент — графіка (стовпчики, іконка), їй досить 3:1
    expect(contrast(p.accent, p.bg)).toBeGreaterThanOrEqual(3);
    expect(contrast(p.accent, p.pill)).toBeGreaterThanOrEqual(3);
  });

  test('unknown key falls back to the first palette', () => {
    expect(paletteByKey('nope')).toBe(PALETTES[0]);
    expect(paletteByKey('graphite').key).toBe('graphite');
  });

  test('tier colour is clamped to the known tiers', () => {
    const p = PALETTES[1];
    expect(tierColor(p, 1)).toBe(p.tiers[0]);
    expect(tierColor(p, 3)).toBe(p.tiers[2]);
    expect(tierColor(p, 9)).toBe(p.tiers[2]);
    expect(tierColor(p, undefined)).toBe(p.tiers[0]);
  });
});

describe('fontSizeForWord', () => {
  test('short words get the full size', () => {
    expect(fontSizeForWord('mug')).toBe(64);
    expect(fontSizeForWord('apple')).toBe(64);
  });

  test('longer words shrink monotonically but never below min', () => {
    const a = fontSizeForWord('refrigerator');
    const b = fontSizeForWord('Kühlschrankmagnet');
    const c = fontSizeForWord('Donaudampfschifffahrtsgesellschaft');
    expect(a).toBeLessThan(64);
    expect(b).toBeLessThan(a);
    expect(c).toBe(28);
  });

  test('the chosen size actually fits the content width', () => {
    for (const w of ['refrigerator', 'la taza de café', 'холодильник', 'Schreibtischlampe']) {
      const size = fontSizeForWord(w);
      if (size > 28) expect(textEm(w) * size).toBeLessThanOrEqual(CONTENT_W);
    }
  });

  test('wide scripts count as wider than latin', () => {
    expect(textEm('冷蔵庫')).toBeGreaterThan(textEm('abc'));
    expect(fontSizeForWord('ВЕЛИКІ ЛІТЕРИ')).toBeLessThan(fontSizeForWord('великі літери'));
  });

  test('custom bounds', () => {
    expect(fontSizeForWord('12', { max: 40, min: 22, width: 80 })).toBe(40);
    expect(fontSizeForWord('123456', { max: 40, min: 22, width: 80 })).toBeLessThan(40);
    expect(fontSizeForWord('', { max: 40 })).toBe(40);
  });
});

describe('capsSize', () => {
  test('short labels keep the default size', () => {
    expect(capsSize('day streak', 90)).toBe(10);
    expect(capsSize('повторення', 90)).toBe(10);
  });

  test('a single long word shrinks to fit a third of the card', () => {
    const size = capsSize('Wiederholungen', 90);
    expect(size).toBeLessThan(10);
    expect(size).toBeGreaterThanOrEqual(8);
  });

  test('multi-word labels are measured by their longest word', () => {
    expect(capsSize('words collected', 90)).toBe(capsSize('collected', 90));
  });
});

describe('text helpers', () => {
  test('IPA is wrapped in slashes once', () => {
    expect(ipaLabel('mʌɡ')).toBe('/mʌɡ/');
    expect(ipaLabel(' /mʌɡ/ ')).toBe('/mʌɡ/');
    expect(ipaLabel('[ˈtasə]')).toBe('[ˈtasə]');
    expect(ipaLabel('')).toBe('');
    expect(ipaLabel(undefined)).toBe('');
  });

  test('quotes follow the language of the example', () => {
    expect(quote('Hallo', 'de')).toBe('„Hallo“');
    expect(quote(' Привіт ', 'uk')).toBe('«Привіт»');
    expect(quote('Hi', 'en')).toBe('“Hi”');
    expect(quote('Hi', 'xx')).toBe('“Hi”');
  });

  test('tile letter skips articles', () => {
    expect(initialOf('die Tasse')).toBe('T');
    expect(initialOf('la taza')).toBe('T');
    expect(initialOf('coffee cup')).toBe('C');
    expect(initialOf('яблуко')).toBe('Я');
    expect(initialOf('')).toBe('?');
  });

  test('day letters are picked by getDay index', () => {
    expect(dayLetter(0, 'SMTWTFS')).toBe('S');
    expect(dayLetter(1, 'НПВСЧПС')).toBe('П');
    expect(dayLetter(9, 'SMTWTFS')).toBe('');
  });
});

describe('dates and numbers', () => {
  const ts = new Date(2026, 9, 1, 12).getTime();

  test('only real language tags pass as a locale', () => {
    expect(safeLocale('uk-UA')).toBe('uk-UA');
    expect(safeLocale('en')).toBe('en');
    // t() повертає сам ключ, якщо рядка ще немає
    expect(safeLocale('shareLocale')).toBeUndefined();
    expect(safeLocale(undefined)).toBeUndefined();
  });

  test('date label is localized and drops the Ukrainian year suffix', () => {
    expect(norm(dateLabel(ts, 'en-GB'))).toBe('1 Oct 2026');
    const uk = dateLabel(ts, 'uk-UA');
    expect(uk).toMatch(/^1 жовт\.? 2026$/);
    expect(dateLabel(ts, undefined)).toMatch(/2026/);
  });

  test('day keys are parsed as local days', () => {
    const d = dayFromKey('2026-10-01');
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 1, 0]);
    expect(dayFromKey('nope')).toBeNull();
  });

  test('week range collapses the month when it can', () => {
    const same = week(24, [0, 0, 0, 0, 0, 0, 0]); // 24–30 вересня
    expect(norm(weekRangeLabel(same, 'en-US'))).toMatch(/^Sep 24 – 30$/);
    const cross = week(25, [0, 0, 0, 0, 0, 0, 0]); // 25 вересня – 1 жовтня
    const label = norm(weekRangeLabel(cross, 'en-GB'));
    expect(label).toMatch(/25/);
    expect(label).toMatch(/1 Oct/);
    expect(weekRangeLabel([], 'en')).toBe('');
    expect(weekRangeLabel(undefined, 'en')).toBe('');
  });

  test('counts are grouped by locale and never negative', () => {
    expect(formatCount(1234, 'en-US')).toBe('1,234');
    expect(formatCount(-3, 'en-US')).toBe('0');
    expect(formatCount(undefined, 'en-US')).toBe('0');
  });
});

describe('barHeights', () => {
  test('zero days are short stubs, the busiest day is full height', () => {
    const hs = barHeights(week(24, [0, 2, 4, 0, 1, 0, 4]), 84);
    expect(hs).toHaveLength(7);
    expect(hs[0]).toBe(BAR_STUB);
    expect(hs[2]).toBe(84);
    expect(hs[6]).toBe(84);
    expect(hs[4]).toBeGreaterThan(BAR_STUB);
    expect(hs[1]).toBeGreaterThan(hs[4]);
  });

  test('an empty week is all stubs', () => {
    expect(barHeights(week(24, [0, 0, 0, 0, 0, 0, 0]), 84)).toEqual(Array(7).fill(BAR_STUB));
    expect(barHeights(undefined, 84)).toEqual([]);
  });
});

describe('pickCollage', () => {
  const box = { w: 296, h: 168 };
  const items = Array.from({ length: 9 }, (_, i) => ({ word: 'w' + i, photo: `stickers/${i}.jpg` }));

  test('takes up to n stickers with a photo, without duplicates', () => {
    const list = [{ word: 'no photo' }, items[0], items[0], ...items.slice(1)];
    const out = pickCollage(list, 6, box);
    expect(out).toHaveLength(6);
    expect(new Set(out.map((c) => c.item.photo)).size).toBe(6);
    expect(out[0].item).toBe(items[0]);
    expect(pickCollage(list, 3, box)).toHaveLength(3);
  });

  test('accepts bare URIs too', () => {
    const out = pickCollage(['file:///a.jpg', 'file:///b.jpg'], 6, box);
    expect(out.map((c) => c.item.photo)).toEqual(['file:///a.jpg', 'file:///b.jpg']);
  });

  test('every layout keeps sticker centres inside the box and tilts both ways', () => {
    for (let n = 1; n <= 6; n++) {
      const out = pickCollage(items.slice(0, n), 6, box);
      expect(out).toHaveLength(n);
      for (const c of out) {
        expect(c.left + c.size / 2).toBeGreaterThan(0);
        expect(c.left + c.size / 2).toBeLessThan(box.w);
        expect(c.top + c.size / 2).toBeGreaterThan(0);
        expect(c.top + c.size / 2).toBeLessThan(box.h);
        expect(Math.abs(c.rotate)).toBeLessThanOrEqual(10);
      }
      if (n > 1) {
        expect(out.some((c) => c.rotate < 0)).toBe(true);
        expect(out.some((c) => c.rotate > 0)).toBe(true);
      }
    }
  });

  test('nothing to show', () => {
    expect(pickCollage(undefined)).toEqual([]);
    expect(pickCollage([{ word: 'x' }])).toEqual([]);
  });
});
