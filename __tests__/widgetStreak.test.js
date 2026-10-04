/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
// Віджет «Серія»: коли який стан показати (src/widgets/streakTimeline.js) і як
// його малює розмітка. Серію рахує src/streak.js — та сама функція, що й у
// застосунку; межі доби — місцевий час, зокрема в день переходу на зимовий
// час (25.10.2026 у Києві доба триває 25 годин).
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { streakInfo } from '../src/streak';
import { buildStreakTimeline } from '../src/widgets/streakTimeline';
import { widgetPalette } from '../src/widgets/palette';
import { FAST_CLOCK } from '../src/widgets/clock';

const { compile, env, nodes, mods, texts } = require('../test-utils/widgetRuntime');

const uk = makeT('uk');
const en = makeT('en');
const D = (m, d, h = 0, min = 0) => new Date(2026, m - 1, d, h, min);
// n днів поспіль, що закінчуються днем end (включно)
const run = (end, n) => new Set(Array.from({ length: n }, (_, i) => localDayKey(new Date(end.getFullYear(), end.getMonth(), end.getDate() - i, 12))));
const plan = (entries) => entries.map((e) => [e.date.getTime(), e.props.state, e.props.n, e.props.until]);

describe('buildStreakTimeline', () => {
  test('done today: done now; tomorrow pending, 18:00 evening, 22:00 late (timer to midnight); then lost, then none', () => {
    const now = D(10, 8, 15, 30);
    const entries = buildStreakTimeline(run(now, 4), { t: uk, now });
    const midnight = String(D(10, 10).getTime());
    expect(plan(entries)).toEqual([
      [now.getTime(), 'done', '4', ''],
      [D(10, 9).getTime(), 'pending', '4', ''],
      [D(10, 9, 18).getTime(), 'pending', '4', midnight],
      [D(10, 9, 22).getTime(), 'late', '4', midnight],
      [D(10, 10).getTime(), 'lost', '0', ''],
      [D(10, 11).getTime(), 'none', '0', ''],
    ]);
    expect(entries.map((e) => e.props.line)).toEqual([
      uk('streakToWeek', { k: 3 }),
      uk('streakPending'),
      uk('streakEvening'),
      uk('streakLate'),
      uk('streakLost'),
      uk('streakNone'),
    ]);
    expect(entries[1].props.short).toBe(uk('streakPendingShort'));
  });

  test('not yet today (yesterday counts): the phase by the clock, the rest of today’s boundaries, lost at midnight', () => {
    const yesterday = D(10, 7, 12);
    const days = run(yesterday, 5);
    expect(plan(buildStreakTimeline(days, { t: uk, now: D(10, 8, 9) }))).toEqual([
      [D(10, 8, 9).getTime(), 'pending', '5', ''],
      [D(10, 8, 18).getTime(), 'pending', '5', String(D(10, 9).getTime())],
      [D(10, 8, 22).getTime(), 'late', '5', String(D(10, 9).getTime())],
      [D(10, 9).getTime(), 'lost', '0', ''],
      [D(10, 10).getTime(), 'none', '0', ''],
    ]);
    // 19:30 — вже вечір: таймер з цієї миті
    expect(plan(buildStreakTimeline(days, { t: uk, now: D(10, 8, 19, 30) }))[0]).toEqual([
      D(10, 8, 19, 30).getTime(),
      'pending',
      '5',
      String(D(10, 9).getTime()),
    ]);
    // 23:10 — «серія згасне опівночі»
    const late = buildStreakTimeline(days, { t: uk, now: D(10, 8, 23, 10) });
    expect(late.map((e) => e.props.state)).toEqual(['late', 'lost', 'none']);
    expect(late[0].props.line).toBe(uk('streakLate'));
  });

  test('no streak: none; a streak of two or more that went out last night is “lost” until midnight', () => {
    const now = D(10, 8, 10);
    expect(plan(buildStreakTimeline(new Set(), { t: uk, now }))).toEqual([[now.getTime(), 'none', '0', '']]);
    // позавчора — 3 дні поспіль, учора нічого
    expect(plan(buildStreakTimeline(run(D(10, 6, 12), 3), { t: uk, now }))).toEqual([
      [now.getTime(), 'lost', '0', ''],
      [D(10, 9).getTime(), 'none', '0', ''],
    ]);
    // один день — це ще не серія, яку шкода
    expect(plan(buildStreakTimeline(run(D(10, 6, 12), 1), { t: uk, now }))).toEqual([[now.getTime(), 'none', '0', '']]);
    // давня серія — теж просто «запали перший вогник»
    expect(buildStreakTimeline(run(D(9, 20, 12), 9), { t: uk, now })[0].props.state).toBe('none');
  });

  test('the number is the app’s own streakInfo, whatever the data', () => {
    const now = D(10, 8, 15);
    for (const days of [run(now, 1), run(now, 13), run(D(10, 7, 12), 6), new Set(['2026-10-01', '2026-10-08', 'junk'])]) {
      expect(buildStreakTimeline(days, { t: uk, now })[0].props.n).toBe(String(streakInfo({ activeDays: days, now }).n));
    }
  });

  test('25 October 2026 in Kyiv (the clocks go back): midnight, 18:00 and 22:00 stay local', () => {
    const now = D(10, 24, 21);
    const entries = buildStreakTimeline(run(now, 2), { t: uk, now });
    const at = entries.map((e) => [e.date.getDate(), e.date.getHours(), e.date.getMinutes()]);
    expect(at).toEqual([
      [24, 21, 0],
      [25, 0, 0],
      [25, 18, 0],
      [25, 22, 0],
      [26, 0, 0],
      [27, 0, 0],
    ]);
    // доба 25-го — 25 годин
    expect(entries[4].date - entries[1].date).toBe(25 * 3600000);
    expect(Number(entries[2].props.until)).toBe(D(10, 26).getTime());
  });

  test('flame stage at the boundaries, the next milestone and its share', () => {
    const now = D(10, 8, 12);
    const at = (n) => buildStreakTimeline(n ? run(now, n) : new Set(), { t: uk, now })[0].props;
    expect([0, 1, 2, 3, 6, 7, 29, 30].map((n) => at(n).stage)).toEqual(['0', '1', '1', '2', '2', '3', '3', '4']);
    expect(at(5)).toMatchObject({ goalLabel: '7', goal: '0.50' });
    expect(at(7)).toMatchObject({ goalLabel: '14', goal: '0.00', line: uk('streakWeek') });
    expect(at(30).line).toBe(uk('streak30'));
    expect(at(9).line).toBe(uk('streakToNext', { m: 14, k: 5 }));
    expect(at(0)).toMatchObject({ goal: '0', n: '0', unit: 'днів поспіль' });
  });

  test('the week: Monday first by default, Sunday first when the phone says so; today pending until there is activity', () => {
    const now = D(10, 8, 12); // четвер
    const [done, pending] = buildStreakTimeline(run(now, 3), { t: uk, now });
    expect(done.props.week).toEqual([
      { d: 'Пн', s: 'missed' },
      { d: 'Вт', s: 'done' },
      { d: 'Ср', s: 'done' },
      { d: 'Чт', s: 'today' },
      { d: 'Пт', s: 'future' },
      { d: 'Сб', s: 'future' },
      { d: 'Нд', s: 'future' },
    ]);
    expect(pending.props.week.map((x) => x.s)).toEqual(['missed', 'done', 'done', 'done', 'pending', 'future', 'future']);
    const sunday = buildStreakTimeline(run(now, 3), { t: en, now, firstWeekday: 1 })[0].props.week;
    expect(sunday.map((x) => x.d)).toEqual(['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']);
  });

  test('props: strings, flat string objects and pal; one key set in every state; small', () => {
    const now = D(10, 8, 15);
    const all = [
      ...buildStreakTimeline(run(now, 8), { t: uk, now, pal: widgetPalette('dark') }),
      ...buildStreakTimeline(run(D(10, 7, 12), 3), { t: uk, now }),
      ...buildStreakTimeline(new Set(), { t: uk, now }),
    ];
    const keys = Object.keys(all[0].props).sort();
    for (const { props } of all) {
      expect(Object.keys(props).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'pal') expect(Object.keys(v)).toEqual(['l', 'd']);
        else if (Array.isArray(v)) v.forEach((o) => Object.values(o).forEach((x) => expect(typeof x).toBe('string')));
        else expect([k, typeof v]).toEqual([k, 'string']);
      }
    }
    expect(JSON.stringify(buildStreakTimeline(run(now, 8), { t: uk, now })).length).toBeLessThanOrEqual(20000);
  });

  test('fast clock (development): the next phases come every two minutes', () => {
    const now = D(10, 8, 9);
    const entries = buildStreakTimeline(run(D(10, 7, 12), 3), { t: uk, now, clock: FAST_CLOCK });
    expect(entries.map((e) => (e.date - now) / 60000)).toEqual([0, 2, 4, 6, 8]);
    expect(entries.map((e) => e.props.state)).toEqual(['pending', 'pending', 'late', 'lost', 'none']);
    // таймер іде до «півночі» — запису lost
    expect(Number(entries[1].props.until)).toBe(entries[3].date.getTime());
  });
});

describe('Streak layout', () => {
  const w = compile('../src/widgets/StreakWidget');
  const now = D(10, 8, 15);
  const at = (n, extra = {}) => buildStreakTimeline(n ? run(now, n) : new Set(), { t: uk, now, ...extra });
  const symbols = (tree) => nodes(tree).filter((n) => n.type === 'ImageView').map((n) => n.props.systemName);

  test('small: number, unit, phrase; the flame grows with the stage and gets sparkles from a week', () => {
    const one = w.render(at(1)[0].props, env('systemSmall', { timestamp: now.getTime() }));
    expect(texts(one)).toEqual(['1', 'день поспіль', uk('streakToWeek', { k: 6 })]);
    expect(symbols(one)).toEqual(['flame.fill']);
    const size = (tree) => nodes(tree).find((n) => n.props.systemName?.startsWith('flame')).props.modifiers.find((m) => m.$type === 'font').size;
    expect([1, 3, 7, 30].map((n) => size(w.render(at(n)[0].props, env('systemSmall'))))).toEqual([22, 28, 34, 40]);
    const lit = w.render(at(7)[0].props, env('systemSmall'));
    expect(symbols(lit)).toEqual(['flame.fill', 'sparkles']);
    // з тижня — градієнт на вогнику й тепле тло
    const flame = nodes(lit).find((n) => n.props.systemName === 'flame.fill');
    expect(mods(flame).foregroundStyle.style.type).toBe('linearGradient');
    expect(mods(lit).containerBackground.style.type).toBe('linearGradient');
    // жаринка — контур
    expect(symbols(w.render(at(0)[0].props, env('systemSmall')))).toEqual(['flame']);
  });

  test('evening: the flame dims and a live timer counts down to midnight', () => {
    const evening = at(4)[2];
    const tree = w.render(evening.props, env('systemSmall', { timestamp: evening.date.getTime() }));
    const timer = nodes(tree).find((n) => n.type === 'TextView' && n.props.timerInterval);
    expect(timer.props.timerInterval).toEqual({ lower: evening.date.getTime(), upper: D(10, 10).getTime() });
    expect(timer.props.countsDown).toBe(true);
    const flame = nodes(tree).find((n) => n.props.systemName === 'flame.fill');
    expect(mods(flame).opacity.value).toBe(0.45);
    // удень таймера немає
    const day = at(4)[1];
    expect(nodes(w.render(day.props, env('systemSmall', { timestamp: day.date.getTime() }))).some((n) => n.props.timerInterval)).toBe(false);
  });

  test('medium: seven day dots with labels, today’s still to do is a dashed ring', () => {
    const pending = at(3)[1];
    const tree = w.render(pending.props, env('systemMedium', { timestamp: pending.date.getTime() }));
    expect(texts(tree)).toEqual(expect.arrayContaining(['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд', uk('streakPending')]));
    const dashed = nodes(tree).filter((n) => mods(n).strokeBorder);
    expect(dashed).toHaveLength(1);
    expect(mods(dashed[0]).strokeBorder.style.dash).toEqual([3, 3]);
  });

  test('lock screen: a ring to the next milestone with the flame and number; one inline line', () => {
    const props = at(5)[0].props;
    const ring = w.render(props, env('accessoryCircular'));
    const gauge = nodes(ring).find((n) => n.type === 'GaugeView');
    expect(gauge.props.value).toBe(0.5);
    expect(mods(gauge).gaugeStyle.style).toBe('circular');
    expect(texts(ring)).toEqual(['5']);
    const inline = w.render(props, env('accessoryInline'));
    expect(inline.type).toBe('LabelView');
    expect(inline.props).toMatchObject({ title: '5 днів поспіль', systemImage: 'flame.fill' });
    expect(texts(w.render(props, env('accessoryRectangular')))).toEqual(['5 днів поспіль', uk('streakToWeek', { k: 2 })]);
  });

  test('a tap opens Progress in the app', () => {
    expect(mods(w.render(at(2)[0].props, env('systemSmall'))).widgetURL.url).toBe('lingualens://streak?from=widget&w=streak&f=systemSmall');
  });
});
