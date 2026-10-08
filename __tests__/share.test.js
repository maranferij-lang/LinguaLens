import {
  BAR_STUB,
  CARD_H,
  CARD_W,
  CONTENT_W,
  EXPORT_H,
  EXPORT_W,
  PALETTES,
  STORIES_ROW,
  barHeights,
  capsSize,
  clipLines,
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
  exportPixels,
  exportSize,
  weekRangeLabel,
  weekStats,
  SCENE_ROWS,
  SCENE_SET_MAX,
  STICKER_MIN_H,
  STICKER_PAD,
  STICKER_PREVIEW_MAX,
  STICKER_PREVIEW_MIN,
  STICKER_W,
  STORIES_GRADIENT,
  cardChrome,
  isCompact,
  primaryAction,
  sceneSetLayout,
  stickerChrome,
  stickerFit,
  stickerPixels,
  stickerPreviewH,
  stickerStylesFor,
  tilesFor,
} from '../src/share/layout';
import { makeT } from '../src/i18n';

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

  // «Без тла» (cutout) пішов з карток у режим «Наліпка» (Stickers.js):
  // картки тепер завжди повний кадр Stories.
  test('every card exports at the full Stories size', () => {
    expect(exportPixels('sticker')).toEqual({ w: EXPORT_W, h: EXPORT_H });
    expect(exportPixels('week')).toEqual({ w: EXPORT_W, h: EXPORT_H });
    expect(exportPixels('sceneFrame')).toEqual({ w: EXPORT_W, h: EXPORT_H });
    // наліпка 900×1116: iOS — у точках, решта — у пікселях, як і для карток
    expect(exportSize('ios', 3, 900, 1116)).toEqual({ width: 300, height: 372 });
    expect(exportSize('android', 2.75, 900, 1116)).toEqual({ width: 900, height: 1116 });
  });

  test('templates per payload kind, without the old cutout', () => {
    // фото чи ні — ті самі три картки: прозора наліпка тепер окремий режим
    expect(templatesFor({ kind: 'word', word: { word: 'mug', photo: 'stickers/mug.jpg' } })).toEqual(['sticker', 'entry', 'minimal']);
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

  test('the Instagram Stories button gets its own room under the main one', () => {
    const screen = { width: 393, height: 852, top: 59, bottom: 34 };
    const s = previewScale({ ...screen, stories: true });
    expect(s).toBeLessThan(previewScale(screen));
    expect(CARD_H * s).toBeLessThan(852 - 59 - 34 - 300 - STORIES_ROW);
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
    // табличка «без тла» (кольори плитки) має виділятися на тлі Stories
    expect(contrast(p.tile, p.bg)).toBeGreaterThanOrEqual(3);
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

  test('long examples are cut at a word boundary with an ellipsis', () => {
    const short = 'I drink tea from my mug.';
    expect(clipLines(short, 3, 18)).toBe(short);
    const long = 'Ich habe eine neue Schreibtischlampe gekauft, weil die alte zu dunkel war und ständig flackerte, wenn ich abends lesen wollte.';
    const cut = clipLines(long, 2, 18);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length).toBeLessThan(long.length);
    expect(long.startsWith(cut.slice(0, -1))).toBe(true);
    expect(cut).not.toMatch(/[\s,]…$/);
    expect(clipLines(long, 3, 18).length).toBeGreaterThan(cut.length);
    expect(clipLines('', 2, 18)).toBe('');
  });

  test('a cut never ends on the « · » of a pair or on a dash', () => {
    // слово з парою: обрізали відразу після « · » — точка йде разом із пробілом
    const pair = 'Schreibtischlampe · настільна лампа з довгим поясненням, яке точно не влізе в один рядок картки';
    const cut = clipLines(pair, 1, 18);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut).not.toMatch(/[\s·\u2013\u2014-]…$/);
    // тире з даних (слово, приклад) теж не висить перед трикрапкою
    expect(clipLines('Schreibtischlampe \u2014 настільна лампа з довгим поясненням, яке не влізе', 1, 18)).not.toMatch(/[\s\u2014]…$/);
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
    expect(norm(weekRangeLabel(same, 'en-US'))).toMatch(/^Sep 24–30$/);
    const cross = week(25, [0, 0, 0, 0, 0, 0, 0]); // 25 вересня – 1 жовтня
    const label = norm(weekRangeLabel(cross, 'en-GB'));
    expect(label).toMatch(/25/);
    expect(label).toMatch(/1 Oct/);
    // діапазон — коротке тире без пробілів, навіть коли ICU ставить їх між
    // місяцями (правило власника: тире з пробілами немає ніде)
    for (const loc of ['en-GB', 'en-US', 'uk-UA', 'de-DE', 'es-ES', 'ru-RU']) {
      const s = weekRangeLabel(cross, loc);
      expect([loc, /\s[\u2013\u2014-]|[\u2013\u2014-]\s/.test(s)]).toEqual([loc, false]);
      expect(s).toMatch(/\u2013/);
    }
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

// «Мій тиждень» — рівно ті сім календарних днів, що на графіку, а не весь час.
describe('weekStats', () => {
  // сьогодні 1 жовтня; на графіку 25 вересня – 1 жовтня
  const days = ['09-25', '09-26', '09-27', '09-28', '09-29', '09-30', '10-01'].map((md) => ({ key: '2026-' + md, value: 0 }));
  const at = (m, d, h) => new Date(2026, m - 1, d, h).getTime();
  const old = Array.from({ length: 20 }, (_, i) => ({ word: 'old' + i, lang: 'fr', addedAt: at(1, 1, 12), srs: { reps: 50 } }));

  test('a year of reviews but none this week shows zero, not the lifetime total', () => {
    const s = weekStats({ days, words: old, streak: 0 });
    expect(s).toMatchObject({ words: 20, weekWords: 0, reviews: 0, langs: [] });
  });

  test('the window starts at midnight of the first bar, not 168 hours ago', () => {
    const words = [
      ...old,
      // 6,5 доби тому, але ще 24 вересня — цього дня на графіку немає
      { word: 'eve', lang: 'de', addedAt: at(9, 24, 18), photo: 'stickers/eve.jpg' },
      { word: 'la taza', lang: 'es', addedAt: at(9, 25, 1), photo: 'stickers/taza.jpg' },
      { word: 'el vaso', lang: 'es', addedAt: at(9, 26, 10) },
    ];
    const week = days.map((d) => ({ ...d, value: { '2026-09-25': 1, '2026-09-26': 3 }[d.key] || 0 }));
    const s = weekStats({ days: week, words, streak: 2 });
    expect(s.weekWords).toBe(2);
    // активність тижня 4 мінус 2 збережені слова
    expect(s.reviews).toBe(2);
    expect(s.langs).toEqual(['es']);
    expect(s.stickers.map((w) => w.word)).toEqual(['la taza']);
    expect(s.days).toBe(week);
  });

  test('never negative when words outnumber the logged activity', () => {
    const s = weekStats({ days, words: [{ word: 'x', addedAt: at(9, 30, 9) }] });
    expect(s.reviews).toBe(0);
  });
});

// Число на картці стоїть окремо, а підпис мусить з ним узгоджуватись:
// «1 зібране слово», а не «1 зібрані слова».
describe('count labels agree with the number', () => {
  test('Ukrainian: one, few, many', () => {
    const t = makeT('uk');
    expect([1, 3, 5].map((n) => t('shareStatWords', { n }))).toEqual(['зібране слово', 'зібрані слова', 'зібраних слів']);
    expect([1, 5].map((n) => t('shareStatStreak', { n }))).toEqual(['день поспіль', 'днів поспіль']);
    expect([1, 5].map((n) => t('shareStatNew', { n }))).toEqual(['нове слово', 'нових слів']);
    expect([1, 5].map((n) => t('shareStatReviews', { n }))).toEqual(['повторення', 'повторень']);
  });

  test('English, German and Spanish: singular for 1', () => {
    expect(makeT('en')('shareStatWords', { n: 1 })).toBe('word collected');
    expect(makeT('en')('shareStatNew', { n: 5 })).toBe('new words');
    expect(makeT('de')('shareStatStreak', { n: 1 })).toBe('Tag in Folge');
    expect(makeT('es')('shareStatReviews', { n: 1 })).toBe('repaso');
    expect(makeT('es')('shareStatWords', { n: 2 })).toBe('palabras guardadas');
  });
});

// ─── Наліпки без тла (v1.3, share.md §3, §5.2, §12.2) ─────────────────────
describe('sticker styles per payload', () => {
  test('word with a photo: object first, word only second; no photo: word only', () => {
    expect(stickerStylesFor({ kind: 'word', word: { word: 'mug', photo: 'stickers/mug.jpg' } })).toEqual(['object', 'word']);
    expect(stickerStylesFor({ kind: 'word', word: { word: 'mug' } })).toEqual(['word']);
  });

  test('scene → word set, achievement → medal, week → none (card only)', () => {
    expect(stickerStylesFor({ kind: 'scene', scene: { objects: [{ key: 'a', word: 'mug' }] } })).toEqual(['scene']);
    expect(stickerStylesFor({ kind: 'scene', scene: { objects: [] } })).toEqual([]);
    expect(stickerStylesFor({ kind: 'achievement', achievement: { id: 'streak_7' } })).toEqual(['badge']);
    expect(stickerStylesFor({ kind: 'week', stats: {} })).toEqual([]);
    expect(stickerStylesFor(null)).toEqual([]);
  });
});

describe('sticker export size', () => {
  test('×3 of the logical size: 300×372 → 900×1116', () => {
    expect(STICKER_W).toBe(300);
    expect(stickerPixels(372)).toEqual({ w: 900, h: 1116 });
    expect(stickerPixels(STICKER_MIN_H.object)).toEqual({ w: 900, h: 1116 });
    expect(stickerPixels(236.4)).toEqual({ w: 900, h: 709 });
  });
});

describe('scene word set layout', () => {
  const objs = (n, word = (i) => 'word' + i) => Array.from({ length: n }, (_, i) => ({ key: 'k' + i, word: word(i), translation: 'переклад ' + i }));

  test('at most six chips, the rest is «+N», two per row', () => {
    const L = sceneSetLayout(objs(10));
    expect(L.chips).toHaveLength(SCENE_SET_MAX);
    expect(L.more).toBe(4);
    expect(L.moreY).toBeGreaterThan(Math.max(...L.chips.map((c) => c.y + c.h)));
    const rows = [...new Set(L.chips.map((c) => c.y))];
    expect(rows).toHaveLength(3);
    // у ряду ліва фішка ліворуч від правої й не налазить на неї
    expect(L.chips[0].x + L.chips[0].w).toBeLessThan(L.chips[1].x);
  });

  test('height is deterministic and stops growing after six words', () => {
    expect(sceneSetLayout(objs(10)).height).toBe(sceneSetLayout(objs(10)).height);
    expect(sceneSetLayout(objs(7)).height).toBe(sceneSetLayout(objs(30)).height);
    expect(sceneSetLayout(objs(6)).height).toBeLessThan(sceneSetLayout(objs(7)).height);
    expect(sceneSetLayout(objs(2)).height).toBeLessThan(sceneSetLayout(objs(6)).height);
    // ≤ 385 pt → PNG ≤ 900×1155 (share.md §3)
    expect(sceneSetLayout(objs(30)).height).toBeLessThanOrEqual(385);
  });

  test('chips stay inside the transparent margin; a long name gets a wide chip of its own', () => {
    const long = sceneSetLayout(objs(6, (i) => (i % 2 ? 'die Geschirrspülmaschine' : 'la lámpara de escritorio')));
    for (const c of long.chips) {
      expect(c.x).toBeGreaterThanOrEqual(STICKER_PAD);
      expect(c.x + c.w).toBeLessThanOrEqual(STICKER_W - STICKER_PAD);
      // читається, а не дрібнота з «…»
      expect(c.wide).toBe(true);
      expect(c.wordSize).toBeGreaterThanOrEqual(14);
    }
    // широка фішка — сама в ряду; рядів не більше чотирьох, решта — «+N»
    expect(new Set(long.chips.map((c) => c.y)).size).toBe(long.chips.length);
    expect(long.chips.length).toBe(SCENE_ROWS);
    expect(long.more).toBe(2);
    expect(long.height).toBeLessThanOrEqual(385);
    // зовсім довга назва зменшується, але не нижче 11
    const huge = sceneSetLayout([{ key: 'x', word: 'Donaudampfschifffahrtsgesellschaftskapitän', translation: 'капітан' }]);
    expect(huge.chips[0].wordSize).toBeGreaterThanOrEqual(11);
    expect(huge.chips[0].x + huge.chips[0].w).toBeLessThanOrEqual(STICKER_W - STICKER_PAD);
    // короткі сусіди лишаються парами довкола широкої
    const mixed = sceneSetLayout([{ key: 'a', word: 'mug' }, { key: 'b', word: 'la lámpara de escritorio' }, { key: 'c', word: 'jar' }, { key: 'd', word: 'cup' }]);
    expect(mixed.chips.map((c) => c.wide)).toEqual([false, true, false, false]);
    expect(mixed.chips[2].y).toBe(mixed.chips[3].y);
    // одиночна остання фішка — по центру
    const odd = sceneSetLayout(objs(3));
    const last = odd.chips[2];
    expect(Math.abs(last.x + last.w / 2 - STICKER_W / 2)).toBeLessThanOrEqual(1);
  });

  test('words without text are skipped; an empty set has no chips', () => {
    const L = sceneSetLayout([{ key: 'a', word: '' }, { key: 'b', word: 'mug', translation: '' }]);
    expect(L.chips.map((c) => c.word)).toEqual(['mug']);
    expect(sceneSetLayout([]).chips).toEqual([]);
  });
});

describe('sticker preview in the sheet', () => {
  test.each([
    ['iPhone SE', 375, 667, 20, 0],
    ['iPhone 15', 393, 852, 59, 34],
    ['Pro Max', 440, 956, 62, 34],
  ])('%s: the preview and every row fit on screen', (_, width, height, top, bottom) => {
    for (const styles of [1, 2]) {
      const h = stickerPreviewH({ height, top, bottom, styles });
      expect(h).toBeGreaterThanOrEqual(STICKER_PREVIEW_MIN);
      expect(h).toBeLessThanOrEqual(STICKER_PREVIEW_MAX);
      // невисокий екран: рядок стану стає поверх заголовка, місця під ним не тримаємо
      const toast = !isCompact({ height, top, bottom });
      expect(h + stickerChrome({ styles, toast })).toBeLessThanOrEqual(height - top - bottom);
    }
  });

  test('only short screens put the status row over the header', () => {
    expect(isCompact({ height: 667, top: 20, bottom: 0 })).toBe(true);
    expect(isCompact({ height: 852, top: 59, bottom: 34 })).toBe(false);
    expect(isCompact({ height: 812, top: 50, bottom: 34 })).toBe(false);
    // на SE прев'ю від цього помітно більше
    expect(stickerPreviewH({ height: 667, top: 20, styles: 2 })).toBeGreaterThan(647 - stickerChrome({ styles: 2 }));
  });

  test('a tall phone gets the mockup size, the sticker is scaled to fit the box', () => {
    expect(stickerPreviewH({ height: 852, top: 59, bottom: 34, styles: 2 })).toBe(STICKER_PREVIEW_MAX);
    const s = stickerFit(353, 292, 372);
    expect(372 * s).toBeLessThanOrEqual(292);
    expect(300 * s).toBeLessThanOrEqual(353);
    // маленька наліпка не роздувається більше за натуральний розмір
    expect(stickerFit(1000, 1000, 100)).toBe(1);
  });

  test('card mode with tiles still fits an iPhone SE', () => {
    const chrome = cardChrome({ multi: true, segment: true, toast: false });
    const s = previewScale({ width: 375, height: 667, top: 20, bottom: 0, chrome, min: 0.3 });
    expect(CARD_H * s + chrome).toBeLessThanOrEqual(667 - 20);
    expect(s).toBeGreaterThan(0.35);
    expect(cardChrome({ multi: false, segment: false })).toBeLessThan(cardChrome());
    // високий екран тримає місце під рядок стану й однаково показує картку більшою
    const tall = cardChrome();
    expect(CARD_H * previewScale({ width: 393, height: 852, top: 59, bottom: 34, chrome: tall, min: 0.3 }) + tall).toBeLessThanOrEqual(852 - 93);
  });

  test('the Stories gradient is two valid hex colours', () => {
    expect(STORIES_GRADIENT).toHaveLength(2);
    for (const c of STORIES_GRADIENT) expect(c).toMatch(/^#[0-9A-F]{6}$/i);
  });
});

// Головна кнопка й плитки (share.md §5.1–5.2)
describe('main button and tiles', () => {
  const all = { copy: true, save: true, pick: true };

  test('sticker mode: Instagram × backdrop', () => {
    expect(primaryAction({ stories: true, backdrop: true, ...all })).toBe('stories_photo');
    expect(primaryAction({ stories: true, backdrop: false, ...all })).toBe('stories_gallery');
    expect(primaryAction({ stories: false, backdrop: true, ...all })).toBe('copy');
    expect(primaryAction({ stories: false, backdrop: false, ...all })).toBe('copy');
    // без вибору фото Instagram без тла не пропонуємо головною
    expect(primaryAction({ stories: true, backdrop: false, pick: false, copy: true })).toBe('copy');
    // веб і стара збірка: лише системне меню
    expect(primaryAction({ stories: false, copy: false })).toBe('system');
  });

  test('card mode: Instagram or the system menu', () => {
    expect(primaryAction({ mode: 'card', stories: true, backdrop: true, ...all })).toBe('stories_card');
    expect(primaryAction({ mode: 'card', stories: false, ...all })).toBe('system');
  });

  test('tiles never repeat the main button and skip what the build cannot do', () => {
    expect(tilesFor({ primary: 'stories_photo', stories: true, copy: true, save: true })).toEqual(['stories_plain', 'copy', 'save', 'system']);
    expect(tilesFor({ primary: 'copy', stories: false, copy: true, save: true })).toEqual(['save', 'system']);
    expect(tilesFor({ mode: 'card', primary: 'stories_card', stories: true, copy: true, save: true })).toEqual(['copy', 'save', 'system']);
    // стара dev-збірка: ні буфера, ні «Фото» — лише «Ще» (і то не як дубль)
    expect(tilesFor({ primary: 'stories_gallery', stories: true, copy: false, save: false })).toEqual(['stories_plain', 'system']);
    expect(tilesFor({ primary: 'system', stories: false, copy: false, save: false })).toEqual([]);
  });
});
