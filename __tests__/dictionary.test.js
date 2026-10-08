// Тестуємо лише чисті помічники. Нативні модулі, які тягнуть за собою
// екрани (аудіо, файли), у jest недоступні — підміняємо заглушками.
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn() }));

import { filterWords, gridMetrics, GRID, langsOf, tiltFor } from '../src/DictionaryScreen';
import { headLetter, splitArticle } from '../src/WordSheet';

const words = [
  { id: 'a', word: 'die Tasse', translation: 'чашка', lang: 'de', addedAt: 3 },
  { id: 'b', word: 'apple', translation: 'яблуко', lang: 'en', addedAt: 5 },
  { id: 'c', word: 'chair', translation: 'стілець', addedAt: 1 }, // старе слово без lang
  { id: 'd', word: 'la taza', translation: 'чашка', lang: 'es', addedAt: 4 },
];

describe('filterWords', () => {
  test('newest first and does not mutate the input', () => {
    const before = words.map((w) => w.id);
    expect(filterWords(words, '', null).map((w) => w.id)).toEqual(['b', 'd', 'a', 'c']);
    expect(words.map((w) => w.id)).toEqual(before);
  });

  test('searches word and translation, case-insensitive, trimmed', () => {
    expect(filterWords(words, '  ЧАШ ', null).map((w) => w.id)).toEqual(['d', 'a']);
    expect(filterWords(words, 'TASSE', null).map((w) => w.id)).toEqual(['a']);
  });

  test('language filter treats a missing lang as English', () => {
    expect(filterWords(words, '', 'en').map((w) => w.id)).toEqual(['b', 'c']);
    expect(filterWords(words, 'чашка', 'es').map((w) => w.id)).toEqual(['d']);
  });

  test('survives words with missing fields', () => {
    expect(filterWords([{ id: 'x' }], 'a', null)).toEqual([]);
  });
});

test('langsOf lists each language once, defaulting to en', () => {
  expect(langsOf(words)).toEqual(['de', 'en', 'es']);
});

describe('tiltFor', () => {
  test('is deterministic and stays within ±3°', () => {
    const ids = Array.from({ length: 200 }, (_, i) => Date.now().toString(36) + i);
    for (const id of ids) {
      const a = tiltFor(id);
      expect(a).toBe(tiltFor(id));
      expect(a).toBeGreaterThanOrEqual(-3);
      expect(a).toBeLessThanOrEqual(3);
    }
  });

  test('different words lean differently', () => {
    const set = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(tiltFor));
    expect(set.size).toBeGreaterThan(3);
  });

  test('handles a missing id', () => {
    expect(tiltFor(undefined)).toBe(tiltFor(''));
  });
});

test('gridMetrics fits three tiles and two gaps into the screen', () => {
  for (const width of [320, 375, 390, 430]) {
    const { tile, row } = gridMetrics(width);
    expect(tile * GRID.cols + GRID.gap * (GRID.cols - 1)).toBeLessThanOrEqual(width - GRID.pad * 2);
    // блюр-тінь у Sticker вмикається від 72 пт — на будь-якому айфоні вона є
    expect(tile).toBeGreaterThanOrEqual(72);
    expect(row).toBe(tile + GRID.label + GRID.rowGap);
  }
});

describe('splitArticle', () => {
  test('splits definite articles for languages that store them', () => {
    expect(splitArticle('die Tasse', 'de')).toEqual({ article: 'die ', rest: 'Tasse' });
    expect(splitArticle('la taza', 'es')).toEqual({ article: 'la ', rest: 'taza' });
    expect(splitArticle('het boek', 'nl')).toEqual({ article: 'het ', rest: 'boek' });
    expect(splitArticle('a caneca', 'pt')).toEqual({ article: 'a ', rest: 'caneca' });
  });

  test('handles elision in French and Italian', () => {
    expect(splitArticle("l'eau", 'fr')).toEqual({ article: "l'", rest: 'eau' });
    expect(splitArticle('l’albero', 'it')).toEqual({ article: 'l’', rest: 'albero' });
  });

  test('leaves words alone when there is no article', () => {
    expect(splitArticle('Tasse', 'de')).toEqual({ article: '', rest: 'Tasse' });
    expect(splitArticle('coffee mug', 'en')).toEqual({ article: '', rest: 'coffee mug' });
    expect(splitArticle('a cup', 'en')).toEqual({ article: '', rest: 'a cup' });
    expect(splitArticle('die', 'de')).toEqual({ article: '', rest: 'die' });
  });

  test('article + rest always gives back the word', () => {
    for (const [w, l] of [['die Tasse', 'de'], ["l'eau", 'fr'], ['los  libros', 'es'], ['chair', 'en']]) {
      const { article, rest } = splitArticle(w, l);
      expect(article + rest).toBe(w);
    }
  });
});

describe('headLetter', () => {
  test('uses the noun, not the article', () => {
    expect(headLetter('die Tasse', 'de')).toBe('T');
    expect(headLetter("l'eau", 'fr')).toBe('E');
    expect(headLetter('apple', 'en')).toBe('A');
  });

  test('keeps non-Latin scripts and surrogate pairs whole', () => {
    expect(headLetter('чашка', 'uk')).toBe('Ч');
    expect(headLetter('𝒜bc', 'en')).toBe('𝒜');
    expect(headLetter('猫', 'zh')).toBe('猫');
  });

  test('empty word gives an empty letter', () => {
    expect(headLetter('', 'en')).toBe('');
    expect(headLetter(undefined, 'de')).toBe('');
  });
});
