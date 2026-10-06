// Таймлайн віджета «Слово дня» (WordOfDay) — widgets.md §5.1, §8.
//
// Застосунок не тримає віджет «живим»: він один раз віддає WidgetKit
// таймлайн, і система сама перемикає слова, навіть коли застосунок не
// запускали тиждень. Записи:
//   • «зараз» — сьогоднішнє слово (у Pro — останній уже відкритий слот);
//   • кожен наступний день із кешу — з його локальної півночі (слот 0);
//   • Pro: ще запис на кожен слот s ≥ 1 о годині hours[s] — тієї ж хвилини
//     приходить і сповіщення з цим словом;
//   • після останнього закешованого дня (і в кожній дірці) — «відкрий
//     застосунок», щоб слово не жило довше за свій день.
// Props — лише рядки, масиви плоских об'єктів із рядків і pal (схема §8),
// однаковий набір ключів у кожному записі: WidgetKit зберігає їх у plist.
import { localDayKey } from '../storage';
import { nameFor } from '../speech';
import { topicName } from '../profile';
import { dayFromKey, ipaLabel } from '../share/layout';
import { WIDGET_MARKDOWN } from '../flags';
import { DEFAULT_HOUR } from '../wordOfDay';
import { REAL_CLOCK, atHour, midnight } from './clock';
import { exampleMarkdown, examplePlain, hourLabel, shortDate, timeLabel } from './format';
import { widgetLink } from './links';
import { widgetPalette } from './palette';

export const SCHEMA = '2';
// «Цього тижня» у великому віджеті — стільки попередніх днів; «Сьогодні»
// (Pro) — не більше 4 рядків разом із наступним словом.
const WEEK_ROWS = 3;
const LIST_ROWS = 4;
// Приклад: два рядки по ~300 pt кеглем 15 (великий віджет). Середній
// показує той самий текст кеглем 13 на ~290 pt — у два рядки він теж
// вміщується. Ріжемо по слову самі: SwiftUI обрізав би посеред слова
// разом із закривальною лапкою.
const EXAMPLE = { lines: 2, size: 15, width: 300 };

const text = (v) => (typeof v === 'string' ? v.trim() : '');
const slotOf = (w) => (Number.isInteger(w?.slot) && w.slot > 0 ? w.slot : 0);

// Справжній день 'YYYY-MM-DD': '2026-02-31' Date тихо переніс би на березень.
function isDayKey(key) {
  const d = dayFromKey(key);
  return !!d && localDayKey(d) === key;
}

function nextDayKey(key) {
  const d = dayFromKey(key);
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

// Спільні ключі всіх записів «Слова дня».
function common(o) {
  return {
    kind: 'wod',
    v: SCHEMA,
    key: o.key,
    state: o.state,
    link: o.link,
    a11y: o.a11y,
    a11yShort: o.a11yShort,
    pal: o.pal,
    hide: o.hide ? '1' : '',
    revealed: '',
    revealShort: o.t('widgetReveal'),
    revealLong: o.t('widgetRevealLong'),
  };
}

const EMPTY_WORD = {
  title: '',
  caption: '',
  topic: '',
  word: '',
  ipa: '',
  translation: '',
  example: '',
  md: '',
  exampleTr: '',
  line: '',
  message: '',
  slotLabel: '',
  slotN: '',
  slotI: '',
  next: '',
  listTitle: '',
  list: [],
  sentenceTitle: '',
  date: '',
};

function emptyProps(ctx, date) {
  const message = ctx.t('widgetEmpty');
  return {
    ...common({
      ...ctx,
      key: 'wod|empty|' + (date || ''),
      state: 'empty',
      link: widgetLink('word-of-day', {}, 'wod'),
      a11y: message,
      a11yShort: message,
    }),
    ...EMPTY_WORD,
    title: ctx.title,
    message,
    line: ctx.t('widgetEmptyShort'),
  };
}

// Запис зі словом. day — 'YYYY-MM-DD'; slots — слова дня за слотами
// (відкриті й ні); s — поточний слот; labels — підписи часу слотів
// («Наступне слово о 19:00»); week — слова попередніх днів.
function wordProps(ctx, { day, slots, s, labels, week }) {
  const { t, lang, langName, title } = ctx;
  const w = slots[s];
  const n = slots.length;
  const word = text(w.word);
  const translation = text(w.translation);
  const example = text(w.example);
  const topic = topicName(t, w.topic);
  const caption = topic ? `${langName} · ${topic}` : t('widgetCaption', { lang: langName });
  const label = (i) => labels[i];
  const next = s + 1 < n ? t('widgetNextAt', { t: label(s + 1) }) : '';

  let listTitle = '';
  let list = [];
  if (n > 1) {
    listTitle = t('widgetToday');
    list = slots.slice(0, s + 1).map((x, i) => ({
      w: text(x.word),
      t: text(x.translation),
      time: label(i),
      cur: i === s ? '1' : '',
      lock: '',
    }));
    if (next) list.push({ w: '', t: next, time: label(s + 1), cur: '', lock: '1' });
    // у великому віджеті вміщається 4 рядки: найраніші слова дня поступаються
    if (list.length > LIST_ROWS) list = list.slice(list.length - LIST_ROWS);
  } else if (week.length) {
    listTitle = t('widgetThisWeek');
    list = week.map((x) => ({ w: text(x.word), t: text(x.translation), time: '', cur: '', lock: '' }));
  }

  // Приклад — markdown зі словом жирним (md: '1'), а якщо markdown вимкнено
  // чи небезпечний — звичайний текст. Одне поле: таймлайн лишається малим.
  const md = ctx.markdown ? exampleMarkdown(example, word, lang, EXAMPLE) : '';
  const a11yShort = [title, topic, word].filter(Boolean).join(', ');
  return {
    ...common({
      ...ctx,
      key: `wod|${day}|${s}`,
      state: 'word',
      link: widgetLink('word-of-day', { date: day, slot: s }, 'wod'),
      a11y: [title, topic, word, translation].filter(Boolean).join(', '),
      a11yShort,
    }),
    title,
    caption,
    topic,
    word,
    ipa: ipaLabel(w.ipa),
    translation,
    example: md || examplePlain(example, lang, EXAMPLE),
    md: md ? '1' : '',
    exampleTr: example ? text(w.example_translation) : '',
    line: translation ? `${word} · ${translation}` : word, // пара через « · »: тире власник заборонив
    message: '',
    slotLabel: n > 1 ? t('widgetSlot', { i: s + 1, n }) : '',
    slotN: n > 1 ? String(n) : '',
    slotI: n > 1 ? String(s + 1) : '',
    next,
    listTitle,
    list,
    sentenceTitle: example ? t('widgetSentence') : '',
    date: shortDate(dayFromKey(day), ctx.ui),
  };
}

// Слова кешу за днями й слотами: { 'YYYY-MM-DD': [w0, w1, …] } — лише
// слоти підряд від 0 і не більше, ніж годин (стільки слів на день людина
// зараз отримує).
function byDay(words, perDay) {
  const days = {};
  for (const w of words) {
    if (!w || !isDayKey(w.date) || !text(w.word)) continue;
    const s = slotOf(w);
    if (s >= perDay) continue;
    const list = days[w.date] || (days[w.date] = []);
    if (!list[s]) list[s] = w;
  }
  for (const k of Object.keys(days)) {
    const list = days[k];
    let n = 0;
    while (list[n]) n++;
    if (!n) delete days[k];
    else days[k] = list.slice(0, n);
  }
  return days;
}

// Коли відкривається слот s дня day. Слот 0 — з півночі; решта — о своїй
// годині (у «прискореному часі» сьогоднішні — за 2, 4… хвилини).
function slotTime(day, s, hours, now, clock) {
  const d = dayFromKey(day);
  if (!s) return midnight(d);
  if (clock.fast && day === localDayKey(now)) return new Date(now.getTime() + s * 2 * clock.hour);
  return atHour(d, hours[s] ?? DEFAULT_HOUR);
}

// opts: t — перекладач інтерфейсу; ui — мова інтерфейсу (дати, години);
// targetLang/nativeLang — пара мов кешу; hours — години слотів (slotHours);
// hide — ховати переклад до дотику; pal — widgetPalette; clock — REAL_CLOCK.
export function buildWordTimeline(
  cache,
  {
    t,
    ui = 'en',
    targetLang,
    nativeLang,
    now = new Date(),
    hours = [DEFAULT_HOUR],
    hide = false,
    pal = widgetPalette('light'),
    clock = REAL_CLOCK,
    markdown = WIDGET_MARKDOWN,
  }
) {
  const title = t('widgetTitle');
  const langName = nameFor(targetLang);
  const ctx = { t, ui, lang: targetLang, langName, title, hide, pal, markdown };
  const fits = !!cache && cache.lang === targetLang && cache.native === nativeLang && Array.isArray(cache.words);
  const perDay = Math.max(1, Array.isArray(hours) && hours.length ? hours.length : 1);
  const days = fits ? byDay(cache.words, perDay) : {};
  const today = localDayKey(now);
  const ahead = Object.keys(days)
    .filter((k) => k >= today)
    .sort();
  const past = Object.keys(days)
    .filter((k) => k < today)
    .sort();

  const entries = [];
  if (!ahead.length || ahead[0] !== today) entries.push({ date: now, props: emptyProps(ctx, today) });
  ahead.forEach((day, i) => {
    const slots = days[day];
    const times = slots.map((_, s) => slotTime(day, s, hours, now, clock));
    // слот 0 видно з півночі, але його година — година сповіщення
    const labels = times.map((at, s) => (s ? timeLabel(at, ui) : hourLabel(hours[0] ?? DEFAULT_HOUR, ui)));
    // попередні дні (слот 0), найновіші першими — «Цього тижня»
    const before = [...past, ...ahead.slice(0, i)].slice(-WEEK_ROWS).reverse();
    const week = before.map((k) => days[k][0]);
    // сьогодні: поточний — останній уже відкритий слот, і він «зараз»
    let first = 0;
    if (day === today) {
      while (first + 1 < slots.length && times[first + 1] <= now) first++;
    }
    for (let s = first; s < slots.length; s++) {
      const date = day === today && s === first ? now : times[s];
      entries.push({ date, props: wordProps(ctx, { day, slots, s, labels, week }) });
    }
    const next = nextDayKey(day);
    if (ahead[i + 1] !== next) entries.push({ date: dayFromKey(next), props: emptyProps(ctx, next) });
  });
  return entries;
}
