// Simple spaced repetition
// box 0..5 → interval until the next review
const DAY = 24 * 60 * 60 * 1000;
const INTERVALS = [10 * 60 * 1000, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY];

export function newSrs() {
  return { box: 0, due: Date.now(), reps: 0, correct: 0 };
}

export function isDue(item) {
  return (item.srs?.due ?? 0) <= Date.now();
}

export function dueWords(words) {
  return words.filter(isDue);
}

export function applyReview(item, known) {
  const srs = item.srs || newSrs();
  const box = known ? Math.min(srs.box + 1, INTERVALS.length - 1) : 0;
  return {
    ...item,
    srs: {
      box,
      due: Date.now() + INTERVALS[box],
      reps: (srs.reps || 0) + 1,
      correct: (srs.correct || 0) + (known ? 1 : 0),
    },
  };
}

// When the next review is: the string is built via i18n (t)
export function nextDueText(words, t) {
  if (!words.length) return '';
  const next = Math.min(...words.map((w) => w.srs?.due ?? 0));
  const diff = next - Date.now();
  if (diff <= 0) return t('dueNow');
  const h = Math.round(diff / (60 * 60 * 1000));
  if (h < 1) return t('inLessHour');
  if (h < 24) return t('inHours', { n: h });
  return t('inDays', { n: Math.round(h / 24) });
}
