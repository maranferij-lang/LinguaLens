// Achievements. Each has an id, a threshold and a metric.
// The icons are our own vectors in src/AchIcons.js, chosen by id.
// Progress is computed from existing data (words, activity, reviews),
// so there is nothing extra to store except the set of achievements already shown.

export const ACHIEVEMENTS = [
  // Words: the main axis of progress
  { id: 'first_word', tier: 1, goal: 1, metric: 'words' },
  { id: 'words_10', tier: 1, goal: 10, metric: 'words' },
  { id: 'words_25', tier: 1, goal: 25, metric: 'words' },
  { id: 'words_50', tier: 2, goal: 50, metric: 'words' },
  { id: 'words_100', tier: 2, goal: 100, metric: 'words' },
  { id: 'words_250', tier: 3, goal: 250, metric: 'words' },
  { id: 'words_500', tier: 3, goal: 500, metric: 'words' },
  // Day streak
  { id: 'streak_3', tier: 1, goal: 3, metric: 'streak' },
  { id: 'streak_7', tier: 2, goal: 7, metric: 'streak' },
  { id: 'streak_14', tier: 2, goal: 14, metric: 'streak' },
  { id: 'streak_30', tier: 3, goal: 30, metric: 'streak' },
  { id: 'streak_100', tier: 3, goal: 100, metric: 'streak' },
  // Reviews
  { id: 'reviews_25', tier: 1, goal: 25, metric: 'reviews' },
  { id: 'reviews_100', tier: 2, goal: 100, metric: 'reviews' },
  { id: 'reviews_500', tier: 3, goal: 500, metric: 'reviews' },
  // Languages
  { id: 'langs_2', tier: 1, goal: 2, metric: 'langs' },
  { id: 'langs_3', tier: 2, goal: 3, metric: 'langs' },
  { id: 'langs_5', tier: 3, goal: 5, metric: 'langs' },
  // Quiz
  { id: 'quiz_first', tier: 1, goal: 1, metric: 'quizzes' },
  { id: 'quiz_perfect', tier: 2, goal: 1, metric: 'perfectQuiz' },
  { id: 'quiz_10', tier: 2, goal: 10, metric: 'quizzes' },
  { id: 'quiz_perfect_5', tier: 3, goal: 5, metric: 'perfectQuiz' },
  // Word of the day
  { id: 'wod_7', tier: 2, goal: 7, metric: 'wordOfDaySeen' },
  { id: 'wod_30', tier: 3, goal: 30, metric: 'wordOfDaySeen' },
  // Special: not about quantity, but about habit
  { id: 'photo_10', tier: 1, goal: 10, metric: 'photos' },
  { id: 'night_owl', tier: 2, goal: 1, metric: 'nightScan' },
  { id: 'early_bird', tier: 2, goal: 1, metric: 'morningScan' },
];

// Computes the current values of all metrics
export function computeMetrics({ words = [], activity = {}, stats = {} , streak = 0 }) {
  const reviews = words.reduce((sum, w) => sum + (w.srs?.reps || 0), 0);
  const langs = new Set(words.map((w) => w.lang || 'en')).size;
  return {
    words: words.length,
    streak,
    reviews,
    langs,
    perfectQuiz: stats.perfectQuiz || 0,
    quizzes: stats.quizzes || 0,
    wordOfDaySeen: stats.wordOfDaySeen || 0,
    // words with a photo anchor: we encourage scanning specifically, not adding by hand
    photos: words.filter((w) => w.photo).length,
    nightScan: stats.nightScan || 0,
    morningScan: stats.morningScan || 0,
  };
}

// Returns the list of achievements with progress and status
export function evaluate(metrics) {
  return ACHIEVEMENTS.map((a) => {
    const value = metrics[a.metric] || 0;
    return {
      ...a,
      value,
      unlocked: value >= a.goal,
      progress: Math.max(0, Math.min(1, value / a.goal)),
    };
  });
}

// Which achievements have just been unlocked (compared with the saved list)
export function newlyUnlocked(evaluated, seenIds = []) {
  return evaluated.filter((a) => a.unlocked && !seenIds.includes(a.id));
}

export function unlockedCount(evaluated) {
  return evaluated.filter((a) => a.unlocked).length;
}

// The user's level from the word count (profile gamification)
export function levelFromWords(n) {
  const level = Math.floor(Math.sqrt(n / 3)) + 1; // 3, 12, 27, 48, 75 words...
  const prevNeed = 3 * Math.pow(level - 1, 2);
  const nextNeed = 3 * Math.pow(level, 2);
  const progress = nextNeed === prevNeed ? 1 : (n - prevNeed) / (nextNeed - prevNeed);
  return { level, progress: Math.max(0, Math.min(1, progress)), nextNeed, current: n };
}
