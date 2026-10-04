// Таймлайн віджета «Мої слова» (MyWords) — widgets.md §5.2, §8.
//
// Пул — збережені слова мови, яку людина вчить (немає таких — усі), у
// порядку інтервального повторення: спершу ті, що вже чекають, далі — що
// найближче до забування; щойно збережене (за останню добу) — першим, бо
// новому слову потрібні зустрічі. Віджет крутить пул сам: запис «зараз» і
// далі на кожній парній годині тиждень наперед. Бейдж «12 на повторення»
// рахується на час кожного запису — віджет «сам» показує, що слів на
// повторення більшає, хоч застосунок закритий.
import { isDue, isLearned, practiceWords } from '../srs';
import { ipaLabel } from '../share/layout';
import { headLetter } from '../WordSheet';
import { WIDGET_MARKDOWN } from '../flags';
import { REAL_CLOCK } from './clock';
import { exampleMarkdown, examplePlain } from './format';
import { widgetLink } from './links';
import { widgetPalette } from './palette';
import { SCHEMA } from './wordTimeline';

export const ROTATE_HOURS = 2;
export const WORDS_DAYS = 7;
// «зараз» + 12 записів на добу × 7 діб
export const MAX_ENTRIES = 1 + (24 / ROTATE_HOURS) * WORDS_DAYS;
export const POOL_SIZE = 24;
export const NEXT_ROWS = 3;
const DAY = 86400000;
// Приклад у середньому віджеті вужчий (ліворуч — фото), у великому — на всю ширину.
const EXAMPLE = { lines: 2, size: 13, width: 190 };

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Пул слів віджета (≤ 24), у порядку показу.
export function wordsPool(words, targetLang, now = Date.now()) {
  const list = (Array.isArray(words) ? words : []).filter((w) => w && w.id != null && text(w.word));
  const own = list.filter((w) => w.lang === targetLang);
  const base = own.length ? own : list;
  const fresh = base.filter((w) => Number(w.addedAt) > now - DAY).sort((a, b) => b.addedAt - a.addedAt);
  const rest = practiceWords(
    base.filter((w) => !fresh.includes(w)),
    POOL_SIZE
  );
  return [...fresh, ...rest].slice(0, POOL_SIZE);
}

// Слова, яким потрібна мініатюра: пул і рядки «Далі» (≤ 30 файлів).
export function thumbIds(pool) {
  return pool.filter((w) => !!w.photo).map((w) => String(w.id));
}

// Моменти записів: «зараз» і далі кожна парна година (у «прискореному
// часі» — кожні 2 хвилини від now). Години рахуємо від півночі сьогодні
// через new Date(y, m, d, h): перехід на літній чи зимовий час не зсуває
// записи з парних годин (Date сам переносить h ≥ 24 на наступні дні).
function rotations(now, clock) {
  const out = [now];
  if (clock.fast) {
    for (let i = 1; out.length < MAX_ENTRIES; i++) out.push(new Date(now.getTime() + i * ROTATE_HOURS * clock.hour));
    return out;
  }
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  let h = now.getHours() + 1;
  if (h % ROTATE_HOURS) h++;
  for (; out.length < MAX_ENTRIES; h += ROTATE_HOURS) {
    const at = new Date(y, m, d, h);
    if (at > out[out.length - 1]) out.push(at);
  }
  return out;
}

function common(ctx, o) {
  return {
    kind: 'words',
    v: SCHEMA,
    key: o.key,
    state: o.state,
    link: o.link,
    a11y: o.a11y,
    a11yShort: o.a11yShort,
    pal: ctx.pal,
    hide: ctx.hide ? '1' : '',
    revealed: '',
    revealShort: ctx.t('widgetReveal'),
    revealLong: ctx.t('widgetRevealLong'),
  };
}

function emptyProps(ctx) {
  const message = ctx.t('widgetWordsEmpty');
  const hint = ctx.t('widgetWordsEmptyHint');
  return {
    ...common(ctx, {
      key: 'words|empty',
      state: 'empty',
      link: widgetLink('word-of-day', {}, 'words'),
      a11y: message + '. ' + hint,
      a11yShort: message,
    }),
    caption: ctx.t('widgetWordsTitle'),
    id: '',
    word: '',
    ipa: '',
    translation: '',
    example: '',
    md: '',
    exampleTr: '',
    line: message,
    dir: '',
    photo: '',
    letter: '',
    due: '',
    dueLabel: '',
    nextTitle: '',
    next: [],
    learnedLabel: '',
    learned: '',
    reviewLabel: '',
    reviewLink: '',
    message,
    hint,
  };
}

function wordProps(ctx, { w, at, k, pool, stats }) {
  const { t } = ctx;
  const id = String(w.id);
  const word = text(w.word);
  const translation = text(w.translation);
  const example = text(w.example);
  const lang = w.lang || ctx.lang;
  const due = ctx.all.filter((x) => isDue(x, at.getTime())).length;
  const next = [];
  for (let i = 1; i <= NEXT_ROWS && i < pool.length; i++) {
    const x = pool[(k + i) % pool.length];
    next.push({
      id: String(x.id),
      w: text(x.word),
      t: text(x.translation),
      photo: ctx.photo(x.id),
      letter: headLetter(text(x.word), x.lang || ctx.lang),
    });
  }
  const caption = t('widgetWordsTitle');
  const md = ctx.markdown ? exampleMarkdown(example, word, lang, EXAMPLE) : '';
  return {
    ...common(ctx, {
      key: `words|${id}|${at.getTime()}`,
      state: 'word',
      link: widgetLink('word', { id }, 'words'),
      a11y: [caption, word, translation].filter(Boolean).join(', '),
      a11yShort: [caption, word].join(', '),
    }),
    caption,
    id,
    word,
    ipa: ipaLabel(w.ipa),
    translation,
    example: md || examplePlain(example, lang, EXAMPLE),
    md: md ? '1' : '',
    exampleTr: example ? text(w.exampleTranslation || w.example_translation) : '',
    line: translation ? `${word} — ${translation}` : word,
    dir: ctx.dir,
    photo: ctx.photo(id),
    letter: headLetter(word, lang),
    due: due ? String(due) : '',
    dueLabel: due ? t('widgetDue', { n: due }) : '',
    nextTitle: next.length ? t('widgetUpNext') : '',
    next,
    learnedLabel: stats.total ? t('widgetLearned', { k: stats.learned, n: stats.total }) : '',
    learned: stats.total ? (stats.learned / stats.total).toFixed(2) : '0',
    reviewLabel: t('widgetReview'),
    reviewLink: widgetLink('learn', {}, 'words'),
    message: '',
    hint: '',
  };
}

// words — увесь словник; targetLang — мова, яку вчать; thumbs — { id: file:// }
// (мініатюри з thumbs.js); решта — як у buildWordTimeline.
export function buildMyWordsTimeline(
  words,
  {
    t,
    targetLang,
    now = new Date(),
    hide = false,
    pal = widgetPalette('light'),
    clock = REAL_CLOCK,
    thumbs = {},
    markdown = WIDGET_MARKDOWN,
  }
) {
  const all = (Array.isArray(words) ? words : []).filter((w) => w && text(w.word));
  // Мініатюри лежать в одній теці App Group: шлях теки — один раз (dir), у
  // словах — лише імена файлів. Так тижневий таймлайн лишається малим.
  const uris = thumbs || {};
  const first = Object.values(uris).find((u) => typeof u === 'string' && u) || '';
  const dir = first.replace(/[^/]*$/, '');
  const photo = (id) => {
    const u = uris[String(id)];
    if (typeof u !== 'string' || !u) return '';
    return dir && u.startsWith(dir) ? u.slice(dir.length) : u;
  };
  const ctx = { t, lang: targetLang, hide, pal, dir, photo, all, markdown };
  const pool = wordsPool(all, targetLang, now.getTime());
  if (!pool.length) return [{ date: now, props: emptyProps(ctx) }];
  const stats = { total: all.length, learned: all.filter(isLearned).length };
  const entries = rotations(now, clock).map((at, k) => ({
    date: at,
    props: wordProps(ctx, { w: pool[k % pool.length], at, k, pool, stats }),
  }));
  return withinBudget(entries);
}

// Таймлайн повністю вантажиться в пам'ять розширення (≈30 МБ на все), тож
// тримаємо його меншим за MAX_BYTES: довгі слова й приклади, палітра й шляхи
// до мініатюр у кожному записі скорочують горизонт з тижня до кількох днів —
// застосунок однаково переписує таймлайн щоразу, як його відкривають.
// Не менше доби записів.
export const MAX_BYTES = 110000;
function withinBudget(entries) {
  const sizes = entries.map((e) => JSON.stringify(e).length + 1);
  let total = sizes.reduce((a, b) => a + b, 2);
  let n = entries.length;
  const floor = Math.min(n, 1 + 24 / ROTATE_HOURS);
  while (n > floor && total > MAX_BYTES) total -= sizes[--n];
  return n === entries.length ? entries : entries.slice(0, n);
}
