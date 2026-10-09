// Achievement icons: our own geometry, nothing ready-made from outside.
//
// Set rule: a 28 grid, 1.8 stroke, round caps, a soft circular backing.
// The main thing: every achievement has its OWN silhouette. Before, they differed
// only by the number of identical dots, and from a distance looked like one badge.
// Now the silhouette reads even in gray: a seed, a book, a tower, a crown, a comet.
import Svg, { Circle, Path, Rect, Polygon } from 'react-native-svg';

const S = (c, w = 1.8) => ({
  fill: 'none',
  stroke: c,
  strokeWidth: w,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});
const FILL = (c) => ({ fill: c, stroke: 'none' });
const SOFT = (c) => ({ fill: c, fillOpacity: 0.14, stroke: 'none' });

// The backing is shared: it holds the set together, the silhouette inside differs.
const Base = ({ size, color, children }) => (
  <Svg width={size} height={size} viewBox="0 0 28 28">
    <Circle cx="14" cy="14" r="12.4" {...SOFT(color)} />
    {children}
  </Svg>
);

// ─── WORDS: from a seed to a library ────────────────────────────────────────

// The first word is a sprout.
export const AchFirstWord = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 21v-6.5" {...S(color)} />
    <Path d="M14 15c0-3 2.4-5 5-5 0 3-2.2 5-5 5z" {...S(color)} />
    <Path d="M14 17.5c0-2.4-1.9-4-4-4 0 2.4 1.7 4 4 4z" {...S(color)} />
  </Base>
);

// 10 words: an open book.
export const AchWords10 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 9.5C12 8 9.5 7.6 7 8v11c2.5-.4 5 0 7 1.5 2-1.5 4.5-1.9 7-1.5V8c-2.5-.4-5 0-7 1.5z" {...S(color)} />
    <Path d="M14 9.5v11" {...S(color)} />
  </Base>
);

// 25 words: a stack of books.
export const AchWords25 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Rect x="6.5" y="17" width="15" height="3.6" rx="1.2" {...S(color)} />
    <Rect x="8" y="13" width="12" height="3.6" rx="1.2" {...S(color)} />
    <Rect x="9.5" y="9" width="9" height="3.6" rx="1.2" {...S(color)} />
  </Base>
);

// 50 words: a shelf with spines.
export const AchWords50 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M6.5 20.5h15" {...S(color)} />
    <Rect x="7.5" y="8" width="3" height="10" rx="1" {...S(color)} />
    <Rect x="11.5" y="10" width="3" height="8" rx="1" {...S(color)} />
    <Rect x="15.5" y="7" width="3" height="11" rx="1" {...S(color)} />
  </Base>
);

// 100 words: a temple of knowledge.
export const AchWords100 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 6.5 22 11H6z" {...S(color)} />
    <Path d="M8.5 11v8M13 11v8M17.5 11v8" {...S(color)} />
    <Path d="M6 21h16" {...S(color)} />
  </Base>
);

// 250 words: a crown.
export const AchWords250 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M6.5 18.5 5.5 9l4.6 3.4L14 7l3.9 5.4L22.5 9l-1 9.5z" {...S(color)} />
    <Path d="M6.5 21.2h15" {...S(color)} />
  </Base>
);

// 500 words: a crystal.
export const AchWords500 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 5.5 21 12l-7 10.5L7 12z" {...S(color)} />
    <Path d="M7 12h14M14 5.5 11 12l3 10.5M14 5.5 17 12l-3 10.5" {...S(color, 1.2)} />
  </Base>
);

// ─── STREAK: from a spark to a constellation ────────────────────────────────

// 3 days: a spark.
export const AchStreak3 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 6v4M14 18v4M6 14h4M18 14h4M8.8 8.8l2.8 2.8M16.4 16.4l2.8 2.8M19.2 8.8l-2.8 2.8M11.6 16.4l-2.8 2.8" {...S(color)} />
    <Circle cx="14" cy="14" r="2" {...FILL(color)} />
  </Base>
);

// 7 days: a flame.
export const AchStreak7 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 6s5 4.2 5 8.6a5 5 0 0 1-10 0c0-1.6.7-3 1.6-4 .3 1.2 1 2 1.8 2 1.5 0 1.3-3.8 1.6-6.6z" {...S(color)} />
  </Base>
);

// 14 days: a torch.
export const AchStreak14 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M14 5.5s3.4 2.8 3.4 5.6a3.4 3.4 0 0 1-6.8 0c0-1.1.5-2 1.1-2.7.2.8.7 1.3 1.2 1.3 1 0 .9-2.5 1.1-4.2z" {...S(color)} />
    <Path d="M12.4 14.6 11 22h6l-1.4-7.4" {...S(color)} />
  </Base>
);

// 30 days: a moon with stars.
export const AchStreak30 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M17.6 6.6a7 7 0 1 0 4.2 8.6 5.6 5.6 0 0 1-4.2-8.6z" {...S(color)} />
    <Circle cx="19.5" cy="9" r="1" {...FILL(color)} />
    <Circle cx="21.6" cy="12" r="0.7" {...FILL(color)} />
  </Base>
);

// 100 days: a comet.
export const AchStreak100 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="17.5" cy="10.5" r="4" {...S(color)} />
    <Path d="M13.5 14.5 6 22M11.5 11.5 6.5 13M16.5 16.5 15 21.5" {...S(color)} />
  </Base>
);

// ─── REVIEWS: a cycle ───────────────────────────────────────────────────────

export const AchReviews25 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M21 14a7 7 0 1 1-2.1-5" {...S(color)} />
    <Path d="M19.4 5.5v3.8h-3.8" {...S(color)} />
  </Base>
);

export const AchReviews100 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M21 14a7 7 0 1 1-2.1-5" {...S(color)} />
    <Path d="M19.4 5.5v3.8h-3.8" {...S(color)} />
    <Path d="M11.5 14.5 13.4 16.4 17 12.8" {...S(color, 1.6)} />
  </Base>
);

// 500 reviews: an hourglass, time laid into memory.
export const AchReviews500 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M9 6h10M9 22h10" {...S(color)} />
    <Path d="M10 6c0 4 4 6 4 8s-4 4-4 8M18 6c0 4-4 6-4 8s4 4 4 8" {...S(color)} />
  </Base>
);

// ─── LANGUAGES: a growing globe ─────────────────────────────────────────────

export const AchLangs2 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="14" r="7.5" {...S(color)} />
    <Path d="M6.5 14h15" {...S(color)} />
  </Base>
);

export const AchLangs3 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="14" r="7.5" {...S(color)} />
    <Path d="M6.5 14h15M14 6.5c2.2 2.2 2.2 12.8 0 15" {...S(color)} />
  </Base>
);

export const AchLangs5 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="14" r="7.5" {...S(color)} />
    <Path d="M6.5 14h15M14 6.5c2.2 2.2 2.2 12.8 0 15M14 6.5c-2.2 2.2-2.2 12.8 0 15" {...S(color)} />
    <Path d="M8 9.4c3.6 1.6 8.4 1.6 12 0M8 18.6c3.6-1.6 8.4-1.6 12 0" {...S(color, 1.2)} />
  </Base>
);

// ─── QUIZ ───────────────────────────────────────────────────────────────────

// The first quiz: a start flag.
export const AchQuizFirst = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M9 22V6" {...S(color)} />
    <Path d="M9 7h10l-2.4 3.6L19 14H9z" {...S(color)} />
  </Base>
);

// A perfect result: an arrow in the bullseye.
export const AchQuizPerfect = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="14" r="7.6" {...S(color)} />
    <Circle cx="14" cy="14" r="3.6" {...S(color)} />
    <Circle cx="14" cy="14" r="1.4" {...FILL(color)} />
    <Path d="M18.5 9.5 22.5 5.5M20.5 5.5h2.4v2.4" {...S(color, 1.4)} />
  </Base>
);

// 10 quizzes: a medal on a ribbon.
export const AchQuiz10 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="16" r="5.4" {...S(color)} />
    <Path d="M10.6 11.6 8.5 5.5h11l-2.1 6.1" {...S(color)} />
  </Base>
);

// 5 perfect ones: a trophy.
export const AchQuizPerfect5 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M9 6h10v4.5a5 5 0 0 1-10 0z" {...S(color)} />
    <Path d="M9 7.5H6.6v1.6A3 3 0 0 0 9.2 12M19 7.5h2.4v1.6a3 3 0 0 1-2.6 2.9" {...S(color, 1.3)} />
    <Path d="M14 15.5V19M10.5 22h7" {...S(color)} />
  </Base>
);

// ─── WORD OF THE DAY ────────────────────────────────────────────────────────

// A week: a calendar with marks.
export const AchWod7 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Rect x="6" y="8" width="16" height="14" rx="3" {...S(color)} />
    <Path d="M6 12.5h16M10.5 6v3.6M17.5 6v3.6" {...S(color)} />
    <Circle cx="11" cy="16.5" r="1.1" {...FILL(color)} />
    <Circle cx="14" cy="16.5" r="1.1" {...FILL(color)} />
    <Circle cx="17" cy="16.5" r="1.1" {...FILL(color)} />
  </Base>
);

// A month: the sun over the horizon, a daily ritual.
export const AchWod30 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Circle cx="14" cy="15" r="4.2" {...S(color)} />
    <Path d="M5.5 21.5h17" {...S(color)} />
    <Path d="M14 6.5v2.4M7.6 8.6l1.7 1.7M20.4 8.6l-1.7 1.7M4.5 15.5h2.4M21.1 15.5h2.4" {...S(color, 1.3)} />
  </Base>
);

// ─── SPECIAL ────────────────────────────────────────────────────────────────

// 10 words with a photo: a snapshot with a folded corner.
export const AchPhoto10 = ({ size, color }) => (
  <Base size={size} color={color}>
    <Rect x="6.5" y="8" width="15" height="12.5" rx="2.6" {...S(color)} />
    <Circle cx="12.2" cy="12.6" r="1.8" {...S(color)} />
    <Path d="M6.8 18.6 11.5 15l3.4 2.6 3.2-2.6 3 2.8" {...S(color)} />
  </Base>
);

// Night owl: a moon and closed eyes.
export const AchNightOwl = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M20.5 16.4a7.4 7.4 0 1 1-8.9-9.8 6 6 0 0 0 8.9 9.8z" {...S(color)} />
    <Circle cx="12" cy="12" r="0.9" {...FILL(color)} />
    <Circle cx="15.4" cy="16" r="0.7" {...FILL(color)} />
  </Base>
);

// Early bird: a little bird at dawn.
export const AchEarlyBird = ({ size, color }) => (
  <Base size={size} color={color}>
    <Path d="M5.5 20h17" {...S(color)} />
    <Path d="M8.5 20a5.5 5.5 0 0 1 11 0" {...S(color)} />
    <Path d="M14 6.5v3M8.6 8.6l1.8 1.8M19.4 8.6l-1.8 1.8" {...S(color, 1.3)} />
  </Base>
);

export const ACH_ICONS = {
  first_word: AchFirstWord,
  words_10: AchWords10,
  words_25: AchWords25,
  words_50: AchWords50,
  words_100: AchWords100,
  words_250: AchWords250,
  words_500: AchWords500,
  streak_3: AchStreak3,
  streak_7: AchStreak7,
  streak_14: AchStreak14,
  streak_30: AchStreak30,
  streak_100: AchStreak100,
  reviews_25: AchReviews25,
  reviews_100: AchReviews100,
  reviews_500: AchReviews500,
  langs_2: AchLangs2,
  langs_3: AchLangs3,
  langs_5: AchLangs5,
  quiz_first: AchQuizFirst,
  quiz_perfect: AchQuizPerfect,
  quiz_10: AchQuiz10,
  quiz_perfect_5: AchQuizPerfect5,
  wod_7: AchWod7,
  wod_30: AchWod30,
  photo_10: AchPhoto10,
  night_owl: AchNightOwl,
  early_bird: AchEarlyBird,
};

export function AchIcon({ id, size = 32, color }) {
  const Cmp = ACH_ICONS[id] || AchFirstWord;
  return <Cmp size={size} color={color} />;
}
