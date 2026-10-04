// Просте інтервальне повторення (spaced repetition, коробки Лейтнера)
// box 0..5 → інтервал до наступного повторення
//
// Усі функції чисті й беруть «зараз» останнім аргументом (за замовчуванням
// Date.now()): так розклад перевіряється тестами без підміни годинника.
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;
export const INTERVALS = [10 * MIN, 1 * DAY, 2 * DAY, 4 * DAY, 8 * DAY, 16 * DAY];
const TOP = INTERVALS.length - 1;

// Тренування без розкладу — не більше стількох карток за раз. Двадцять
// проходяться за кілька хвилин; сотня — це вже не тренування, а покарання.
export const PRACTICE_SIZE = 20;

export function newSrs(now = Date.now()) {
  return { box: 0, due: now, reps: 0, correct: 0 };
}

// Записи зі старих версій або пошкоджені (немає srs, box поза межами, due NaN)
// не мають ламати розклад: NaN у box дав би due = NaN, а таке слово вже
// ніколи не стало б «на часі» — тихо зникло б із повторень назавжди.
function readSrs(item, now) {
  const srs = item.srs || {};
  return {
    box: Number.isInteger(srs.box) ? Math.min(Math.max(srs.box, 0), TOP) : 0,
    due: Number.isFinite(srs.due) ? srs.due : now,
    reps: srs.reps || 0,
    correct: srs.correct || 0,
  };
}

// Слово без коректної дати вважаємо «на часі» — з тієї ж причини, що вище.
function dueOf(item) {
  const due = item.srs?.due;
  return Number.isFinite(due) ? due : 0;
}

export function isDue(item, now = Date.now()) {
  return dueOf(item) <= now;
}

export function dueWords(words, now = Date.now()) {
  // isDue не передаємо у filter напряму: другим аргументом туди прийшов би
  // індекс елемента, і функція порівнювала б дату з числом 0, 1, 2…
  return words.filter((w) => isDue(w, now));
}

// Справжнє повторення слова, чий час настав.
// «Знаю» — у наступну коробку (довший інтервал), «ще вчу» — назад у нульову.
export function applyReview(item, known, now = Date.now()) {
  const srs = readSrs(item, now);
  const box = known ? Math.min(srs.box + 1, TOP) : 0;
  return {
    ...item,
    srs: {
      box,
      due: now + INTERVALS[box],
      reps: srs.reps + 1,
      correct: srs.correct + (known ? 1 : 0),
    },
  };
}

// Тренування поза розкладом: нічого не на часі, а людина все одно хоче вчитись.
//
// «Знаю» тут НЕ подовжує інтервал. Коробки працюють, бо слово згадують після
// паузи, коли воно вже майже забулось. Відповідь через годину після
// попередньої нічого не каже про довгу пам'ять — якби вона рухала коробку,
// кілька «знаю» за вечір закинули б слово на 16 днів, і воно забулося б
// задовго до наступної зустрічі.
//
// «Ще вчу» — скидає в нульову, як і звичайне повторення: провал є провалом,
// байдуже, коли його помітили. Слово, якого не згадав сьогодні, не можна
// лишати спокійно лежати ще тиждень.
//
// reps і correct рахуємо завжди: це лічильник зусиль (статистика, досягнення
// за повторення), а не пам'яті — тренування теж праця.
//
// Якщо час слова вже настав (тренування затяглось, а нульова коробка — це
// 10 хвилин), відповідь і є повноцінним повторенням після паузи.
export function applyPractice(item, known, now = Date.now()) {
  if (!known || isDue(item, now)) return applyReview(item, known, now);
  const srs = readSrs(item, now);
  return { ...item, srs: { ...srs, reps: srs.reps + 1, correct: srs.correct + 1 } };
}

// Що тренувати, коли нічого не на часі: слова, які найближче до забування.
// Саме їм додаткова зустріч корисна найбільше, а свіжовивчені почекають.
export function practiceWords(words, limit = PRACTICE_SIZE) {
  return [...words].sort((a, b) => dueOf(a) - dueOf(b)).slice(0, limit);
}

// «Вивчено»: слово дійшло до коробки з інтервалом ≥ 8 днів. Одне визначення
// для віджета «Мої слова» й підсумків — щоб числа ніде не розходились.
export const LEARNED_BOX = 4;
export function isLearned(item) {
  const box = item?.srs?.box;
  return Number.isInteger(box) && box >= LEARNED_BOX;
}

// Коли наступне повторення: рядок формується через i18n (t)
export function nextDueText(words, t, now = Date.now()) {
  if (!words.length) return '';
  const next = Math.min(...words.map(dueOf));
  const diff = next - now;
  if (diff <= 0) return t('dueNow');
  const h = Math.round(diff / (60 * MIN));
  if (h < 1) return t('inLessHour');
  if (h < 24) return t('inHours', { n: h });
  return t('inDays', { n: Math.round(h / 24) });
}
