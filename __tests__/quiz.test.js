import { QUIZ_MIN, buildQuestions, isQuizReady } from '../src/QuizScreen';

// Озвучка тягне expo-audio, якому в jest бракує нативного модуля. Логіка квізу
// від неї не залежить — підміняємо заглушкою.
jest.mock('../src/speech', () => ({ speak: jest.fn() }));

// Детермінований генератор: однаковий «випадок» на кожному прогоні тестів
function seeded(seed = 7) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

let n = 0;
const w = (word, translation, extra) => ({ id: 'id' + n++, word, translation, lang: 'en', nativeLang: 'uk', ...extra });

const norm = (s) => s.trim().toLowerCase();

describe('isQuizReady', () => {
  test('needs at least four different non-empty translations', () => {
    const three = [w('cup', 'чашка'), w('mug', 'Чашка '), w('table', 'стіл'), w('chair', 'стілець'), w('x', '  ')];
    expect(QUIZ_MIN).toBe(4);
    expect(isQuizReady(three)).toBe(false);
    expect(isQuizReady([...three, w('lamp', 'лампа')])).toBe(true);
  });

  test('missing translations do not count', () => {
    expect(isQuizReady([w('a', ''), w('b', null), w('c', 'с'), w('d', 'д'), w('e', 'е')])).toBe(false);
  });
});

describe('buildQuestions', () => {
  const deck = [
    w('cup', 'чашка'),
    w('mug', 'чашка'),
    w('table', 'стіл'),
    w('chair', 'стілець'),
    w('lamp', 'лампа'),
    w('door', 'двері'),
    w('cup', 'чашка'), // те саме слово, збережене вдруге
  ];

  test('every question has 4 distinct options with exactly one right answer', () => {
    for (let seed = 1; seed < 40; seed++) {
      for (const q of buildQuestions(deck, { rand: seeded(seed) })) {
        expect(q.options).toHaveLength(4);
        expect(new Set(q.options.map(norm)).size).toBe(4);
        expect(norm(q.options[q.answer])).toBe(norm(q.word.translation));
        expect(q.options.filter((o) => norm(o) === norm(q.word.translation))).toHaveLength(1);
      }
    }
  });

  test('the same word saved twice is asked only once', () => {
    const qs = buildQuestions(deck, { rand: seeded(3) });
    const asked = qs.map((q) => q.word.word);
    expect(asked.filter((x) => x === 'cup')).toHaveLength(1);
    expect(qs).toHaveLength(6);
  });

  test('respects the question count', () => {
    const many = Array.from({ length: 30 }, (_, i) => w('w' + i, 't' + i));
    expect(buildQuestions(many, { rand: seeded(1) })).toHaveLength(10);
    expect(buildQuestions(many, { count: 5, rand: seeded(1) })).toHaveLength(5);
  });

  test('words without translation are never asked nor used as options', () => {
    const qs = buildQuestions([...deck, w('ghost', '')], { rand: seeded(5) });
    expect(qs.map((q) => q.word.word)).not.toContain('ghost');
    for (const q of qs) expect(q.options).not.toContain('');
  });

  test('distractors prefer the same target language when there are enough', () => {
    const mixed = [
      w('cup', 'чашка'),
      w('table', 'стіл'),
      w('chair', 'стілець'),
      w('lamp', 'лампа'),
      w('Tisch', 'стіл німецький', { lang: 'de' }),
      w('Tür', 'двері', { lang: 'de' }),
      w('Hund', 'пес', { lang: 'de' }),
    ];
    for (let seed = 1; seed < 30; seed++) {
      const q = buildQuestions(mixed, { rand: seeded(seed) }).find((x) => x.word.word === 'cup');
      expect(q.options.map(norm).sort()).toEqual(['лампа', 'стіл', 'стілець', 'чашка']);
    }
  });

  test('translations in another native language are the last resort', () => {
    const mixed = [
      w('cup', 'чашка'),
      w('table', 'стіл', { lang: 'de' }),
      w('chair', 'стілець', { lang: 'de' }),
      w('lamp', 'лампа', { lang: 'de' }),
      w('door', 'door', { lang: 'en', nativeLang: 'en' }),
    ];
    for (let seed = 1; seed < 30; seed++) {
      const q = buildQuestions(mixed, { rand: seeded(seed) }).find((x) => x.word.word === 'cup');
      expect(q.options.map(norm)).not.toContain('door');
    }
  });

  test('distractors vary between questions', () => {
    const many = Array.from({ length: 12 }, (_, i) => w('w' + i, 't' + i));
    const qs = buildQuestions(many, { rand: seeded(11) });
    const sets = new Set(qs.map((q) => q.options.filter((_, i) => i !== q.answer).sort().join()));
    expect(sets.size).toBeGreaterThan(5);
  });
});
