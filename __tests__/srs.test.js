import {
  INTERVALS,
  PRACTICE_SIZE,
  applyPractice,
  applyReview,
  dueWords,
  isDue,
  newSrs,
  nextDueText,
  practiceWords,
} from '../src/srs';

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const word = (srs, extra) => ({ id: 'w', word: 'cup', translation: 'чашка', srs, ...extra });
// t-заглушка: повертає ключ і змінні — перевіряємо вибір рядка, а не переклад
const t = (key, vars) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

describe('newSrs / isDue / dueWords', () => {
  test('a new word is due immediately', () => {
    expect(newSrs(NOW)).toEqual({ box: 0, due: NOW, reps: 0, correct: 0 });
    expect(isDue(word(newSrs(NOW)), NOW)).toBe(true);
  });

  test('future words are not due, past ones are', () => {
    expect(isDue(word({ box: 2, due: NOW + 1 }), NOW)).toBe(false);
    expect(isDue(word({ box: 2, due: NOW - 1 }), NOW)).toBe(true);
  });

  test('missing or broken dates count as due instead of vanishing forever', () => {
    expect(isDue(word(undefined), NOW)).toBe(true);
    expect(isDue(word({ box: 1, due: NaN }), NOW)).toBe(true);
  });

  test('dueWords filters by the given time, not by array index', () => {
    const list = [word({ box: 0, due: NOW - 5 }, { id: 'a' }), word({ box: 3, due: NOW + DAY }, { id: 'b' })];
    expect(dueWords(list, NOW).map((w) => w.id)).toEqual(['a']);
  });
});

describe('applyReview — a real, scheduled review', () => {
  test('"I know" moves to the next box and its interval', () => {
    const r = applyReview(word({ box: 1, due: NOW, reps: 3, correct: 2 }), true, NOW);
    expect(r.srs).toEqual({ box: 2, due: NOW + INTERVALS[2], reps: 4, correct: 3 });
  });

  test('"Still learning" drops back to box 0 (10 minutes)', () => {
    const r = applyReview(word({ box: 4, due: NOW, reps: 9, correct: 8 }), false, NOW);
    expect(r.srs).toEqual({ box: 0, due: NOW + 10 * 60 * 1000, reps: 10, correct: 8 });
  });

  test('the top box stays the top box', () => {
    const top = INTERVALS.length - 1;
    const r = applyReview(word({ box: top, due: NOW, reps: 1, correct: 1 }), true, NOW);
    expect(r.srs.box).toBe(top);
    expect(r.srs.due).toBe(NOW + 16 * DAY);
  });

  test('intervals grow from 10 minutes to 16 days', () => {
    expect(INTERVALS).toEqual([10 * 60 * 1000, DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY]);
  });

  test('legacy or corrupted records never produce NaN dates', () => {
    expect(applyReview(word(undefined), true, NOW).srs).toEqual({ box: 1, due: NOW + DAY, reps: 1, correct: 1 });
    const broken = applyReview(word({ box: 'x', due: NaN }), true, NOW).srs;
    expect(broken.box).toBe(1);
    expect(Number.isFinite(broken.due)).toBe(true);
    expect(applyReview(word({ box: 42, due: NOW }), true, NOW).srs.box).toBe(INTERVALS.length - 1);
  });

  test('does not mutate the input and keeps other fields', () => {
    const item = word({ box: 1, due: NOW, reps: 0, correct: 0 }, { photo: 'p.jpg' });
    const r = applyReview(item, true, NOW);
    expect(item.srs.box).toBe(1);
    expect(r.photo).toBe('p.jpg');
  });
});

describe('applyPractice — cramming must not wreck the schedule', () => {
  const notDue = () => word({ box: 3, due: NOW + 3 * DAY, reps: 5, correct: 4 });

  test('"I know" on a not-yet-due word keeps box and due date, counts the effort', () => {
    const r = applyPractice(notDue(), true, NOW);
    expect(r.srs).toEqual({ box: 3, due: NOW + 3 * DAY, reps: 6, correct: 5 });
  });

  test('repeated "I know" in one evening never pushes the word further', () => {
    let item = notDue();
    for (let i = 0; i < 10; i++) item = applyPractice(item, true, NOW + i * 60 * 1000);
    expect(item.srs.box).toBe(3);
    expect(item.srs.due).toBe(NOW + 3 * DAY);
    expect(item.srs.reps).toBe(15);
  });

  test('"Still learning" is a real lapse: back to box 0, due in 10 minutes', () => {
    const r = applyPractice(notDue(), false, NOW);
    expect(r.srs).toEqual({ box: 0, due: NOW + INTERVALS[0], reps: 6, correct: 4 });
  });

  test('a word that became due during practice gets a real review', () => {
    const item = word({ box: 0, due: NOW - 1, reps: 1, correct: 0 });
    expect(applyPractice(item, true, NOW)).toEqual(applyReview(item, true, NOW));
  });
});

describe('practiceWords', () => {
  test('picks the words closest to being forgotten, capped', () => {
    const list = Array.from({ length: 30 }, (_, i) => word({ box: 2, due: NOW + (30 - i) * HOUR }, { id: 'w' + i }));
    const picked = practiceWords(list);
    expect(picked).toHaveLength(PRACTICE_SIZE);
    expect(picked[0].id).toBe('w29');
    expect(picked.map((w) => w.id)).not.toContain('w0');
  });

  test('does not reorder the original list', () => {
    const list = [word({ due: NOW + 2 }, { id: 'b' }), word({ due: NOW + 1 }, { id: 'a' })];
    expect(practiceWords(list, 5).map((w) => w.id)).toEqual(['a', 'b']);
    expect(list.map((w) => w.id)).toEqual(['b', 'a']);
  });
});

describe('nextDueText', () => {
  const at = (ms) => [word({ box: 1, due: NOW + ms })];

  test('empty list → empty string', () => {
    expect(nextDueText([], t, NOW)).toBe('');
  });

  test('picks the right phrase for the nearest due date', () => {
    expect(nextDueText(at(-1), t, NOW)).toBe('dueNow');
    expect(nextDueText(at(10 * 60 * 1000), t, NOW)).toBe('inLessHour');
    expect(nextDueText(at(5 * HOUR), t, NOW)).toBe('inHours:{"n":5}');
    expect(nextDueText(at(2 * DAY), t, NOW)).toBe('inDays:{"n":2}');
  });

  test('uses the soonest of several words', () => {
    const list = [...at(3 * DAY), ...at(2 * HOUR)];
    expect(nextDueText(list, t, NOW)).toBe('inHours:{"n":2}');
  });
});
