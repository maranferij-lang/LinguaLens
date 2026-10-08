/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
// Полірування даних «Поділитися» й віджетів (жовтень 2026): колаж тижня за
// addedAt, а не за порядком масиву; відкритий «Переклад» віджета переживає
// переписування таймлайну, але не переходить на інше слово.
import { weekStats } from '../src/share/layout';
import { makeT } from '../src/i18n';
import { buildMyWordsTimeline, rotationStart, ROTATE_HOURS } from '../src/widgets/wordsTimeline';
import { buildWordTimeline } from '../src/widgets';
import { carryReveals } from '../src/widgets/reveals';
import { FAST_CLOCK, REAL_CLOCK } from '../src/widgets/clock';
import { localDayKey } from '../src/storage';

const uk = makeT('uk');

// ── колаж «Мій тиждень» ─────────────────────────────────────────────────────
describe('weekStats picks the freshest stickers by addedAt, not by array order', () => {
  const days = ['09-25', '09-26', '09-27', '09-28', '09-29', '09-30', '10-01'].map((md) => ({ key: '2026-' + md, value: 0 }));
  const at = (m, d, h) => new Date(2026, m - 1, d, h).getTime();
  const w = (name, addedAt) => ({ word: name, lang: 'en', addedAt, photo: `stickers/${name}.jpg` });

  test('words pulled from the server land after the local ones, and today’s scan is still first', () => {
    // sync.js дописує віддалені (старіші) слова ПІСЛЯ місцевих
    const words = [w('today', at(10, 1, 9)), w('p6', at(9, 30, 9)), w('p5', at(9, 29, 9)), w('p4', at(9, 28, 9)), w('p3', at(9, 27, 9)), w('p2', at(9, 26, 9)), w('p1', at(9, 25, 9))];
    // найновіше слово стоїть у масиві першим: старий slice(-6) його губив
    const s = weekStats({ days, words, streak: 1 });
    expect(s.stickers.map((x) => x.word)).toEqual(['today', 'p6', 'p5', 'p4', 'p3', 'p2']);
  });

  test('a shuffled array gives the same six, newest first', () => {
    const base = [w('a', at(9, 25, 9)), w('b', at(9, 26, 9)), w('c', at(9, 27, 9)), w('d', at(9, 28, 9)), w('e', at(9, 29, 9)), w('f', at(9, 30, 9)), w('g', at(10, 1, 9))];
    const shuffled = [base[3], base[6], base[0], base[5], base[2], base[1], base[4]];
    expect(weekStats({ days, words: shuffled }).stickers.map((x) => x.word)).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
    expect(weekStats({ days, words: base }).stickers.map((x) => x.word)).toEqual(['g', 'f', 'e', 'd', 'c', 'b']);
  });

  test('the input is not reordered and words without a photo or addedAt do not break it', () => {
    const words = [w('old', at(9, 26, 9)), { word: 'nophoto', lang: 'en', addedAt: at(10, 1, 9) }, w('new', at(10, 1, 8))];
    const copy = words.map((x) => x.word);
    const s = weekStats({ days, words });
    expect(words.map((x) => x.word)).toEqual(copy);
    expect(s.stickers.map((x) => x.word)).toEqual(['new', 'old']);
    expect(s.weekWords).toBe(3);
  });
});

// ── «Мої слова»: key запису «зараз» ─────────────────────────────────────────
describe('My Words: the key of the “now” entry survives a rewrite', () => {
  const words = Array.from({ length: 4 }, (_, i) => ({
    id: 'id' + i,
    word: 'word' + i,
    translation: 'слово' + i,
    lang: 'en',
    addedAt: new Date(2026, 9, 1).getTime(),
    srs: { box: 1, due: new Date(2026, 9, 8, 12 + i).getTime() },
  }));
  const build = (now, extra = {}) => buildMyWordsTimeline(words, { t: uk, targetLang: 'en', now, ...extra });

  test('two builds in the same two-hour interval give the same first key, and the date stays “now”', () => {
    const a = build(new Date(2026, 9, 8, 10, 30));
    const b = build(new Date(2026, 9, 8, 10, 45));
    expect(a[0].props.key).toBe(b[0].props.key);
    expect(a[0].props.key).toBe(`words|id0|${new Date(2026, 9, 8, 10).getTime()}`);
    expect(a[0].date).toEqual(new Date(2026, 9, 8, 10, 30));
    expect(b[0].date).toEqual(new Date(2026, 9, 8, 10, 45));
  });

  test('an odd hour belongs to the interval that started an hour earlier', () => {
    expect(build(new Date(2026, 9, 8, 11, 59))[0].props.key).toBe(`words|id0|${new Date(2026, 9, 8, 10).getTime()}`);
    expect(build(new Date(2026, 9, 8, 12, 0))[0].props.key).toBe(`words|id0|${new Date(2026, 9, 8, 12).getTime()}`);
  });

  test('the interval is a new one after the even hour, so the next word starts hidden', () => {
    expect(build(new Date(2026, 9, 8, 11, 59))[0].props.key).not.toBe(build(new Date(2026, 9, 8, 12, 1))[0].props.key);
  });

  test('later entries keep their keys, all keys are unique and the “now” key never collides with the next entry', () => {
    const a = build(new Date(2026, 9, 8, 10, 30));
    const b = build(new Date(2026, 9, 8, 10, 45));
    expect(a.slice(1).map((e) => e.props.key)).toEqual(b.slice(1).map((e) => e.props.key));
    const keys = a.map((e) => e.props.key);
    expect(new Set(keys).size).toBe(keys.length);
    expect(a[1].date).toEqual(new Date(2026, 9, 8, 12));
  });

  test('the badge still counts at the real “now”, not at the interval start', () => {
    // слово id0 повторити о 12:00: о 10:30 ще ні, о 12:30 уже так
    expect(build(new Date(2026, 9, 8, 10, 30))[0].props.due).toBe('');
    expect(build(new Date(2026, 9, 8, 12, 30))[0].props.due).toBe('1');
  });

  test('the clock change night: the key start is on an even hour in local time', () => {
    const start = rotationStart(new Date(2026, 9, 25, 5, 20));
    expect(start.getHours() % ROTATE_HOURS).toBe(0);
    expect(start <= new Date(2026, 9, 25, 5, 20)).toBe(true);
  });

  test('fast clock (development): the key is stable inside one step of two “hours”', () => {
    const step = ROTATE_HOURS * FAST_CLOCK.hour;
    const base = Math.floor(new Date(2026, 9, 8, 10, 30).getTime() / step) * step;
    const a = build(new Date(base + 1000), { clock: FAST_CLOCK });
    const b = build(new Date(base + step - 1000), { clock: FAST_CLOCK });
    expect(a[0].props.key).toBe(b[0].props.key);
    expect(a[0].props.key).toBe(`words|id0|${base}`);
    expect(rotationStart(new Date(base + 5), REAL_CLOCK).getHours() % 2).toBe(0);
  });

  test('a reveal on the visible entry is carried over a foreground rewrite and dropped for another word', () => {
    const old = build(new Date(2026, 9, 8, 10, 30)).map((e, i) => (i === 0 ? { ...e, props: { ...e.props, revealed: '1' } } : e));
    const sameWord = carryReveals(old, build(new Date(2026, 9, 8, 10, 45)));
    expect(sameWord[0].props.revealed).toBe('1');
    expect(sameWord.slice(1).every((e) => e.props.revealed === '')).toBe(true);
    // пул змінився: на цьому місці вже інше слово (інший id у key)
    const other = build(new Date(2026, 9, 8, 10, 45)).map((e) => ({ ...e, props: { ...e.props, key: e.props.key.replace('id0', 'id9') } }));
    expect(carryReveals(old, other)[0].props.revealed).toBe('');
  });
});

// ── «Слово дня»: слово в key ───────────────────────────────────────────────
describe('Word of the Day: a reveal does not move to another word in the same slot', () => {
  const NOW = new Date(2026, 9, 1, 15, 30);
  const key = (d) => localDayKey(new Date(2026, 9, d));
  const day = (d, word, extra = {}) => ({ date: key(d), word, ipa: 'ɪ', translation: word + '-tr', example: `A ${word} here.`, example_translation: 'Приклад.', ...extra });
  const cache = (words) => ({ lang: 'en', native: 'uk', words, fetchedAt: NOW.getTime() });
  const opts = (extra = {}) => ({ t: uk, ui: 'uk', targetLang: 'en', nativeLang: 'uk', now: NOW, ...extra });

  test('the key carries the day, the slot and the word', () => {
    const [first] = buildWordTimeline(cache([day(1, 'lighthouse')]), opts());
    expect(first.props.key).toBe(`wod|${key(1)}|0|lighthouse`);
  });

  test('the same word on a rewrite keeps its reveal; another word in the same slot starts hidden', () => {
    const old = buildWordTimeline(cache([day(1, 'lighthouse'), day(2, 'harbour')]), opts()).map((e) => ({ ...e, props: { ...e.props, revealed: '1' } }));
    const same = carryReveals(old, buildWordTimeline(cache([day(1, 'lighthouse'), day(2, 'harbour')]), opts({ hide: true })));
    expect(same.map((e) => e.props.revealed)).toEqual(['1', '1', '1']);
    // після зміни мови чи кешу слот 0 того ж дня показує інше слово
    const swapped = carryReveals(old, buildWordTimeline(cache([day(1, 'beacon'), day(2, 'harbour')]), opts()));
    expect(swapped[0].props.word).toBe('beacon');
    expect(swapped[0].props.revealed).toBe('');
    expect(swapped[1].props.revealed).toBe('1');
  });

  test('empty entries keep the old key shape', () => {
    const entries = buildWordTimeline(cache([day(1, 'lighthouse')]), opts());
    expect(entries.at(-1).props.key).toBe(`wod|empty|${key(2)}`);
  });
});
