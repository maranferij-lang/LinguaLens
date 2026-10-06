/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
// Модель серії (src/streak.js). Файл живе в київському часі: межа доби й
// перехід на зимовий час (неділя, 25.10.2026, 04:00 → 03:00) — саме там, де
// серія могла б тихо зламатися.
import fs from 'fs';
import path from 'path';
import { act, create } from 'react-test-renderer';

import {
  MILESTONES,
  activeDaySet,
  bestStreak,
  flameForm,
  flameStage,
  nextMilestone,
  phase,
  streakInfo,
  streakMessage,
  weekStrip,
} from '../src/streak';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';
import ProfileScreen from '../src/ProfileScreen';

const ROOT = path.join(__dirname, '..');
// Місцевий час Києва: місяць — з 1, як у календарі
const at = (y, m, d, h = 12, min = 0, s = 0) => new Date(y, m - 1, d, h, min, s);
const key = (y, m, d) => localDayKey(at(y, m, d));

// Дослівно той код, що рахував серію в App.js і ProfileScreen.js до v1.3.
function legacyStreak(activeDays) {
  let n = 0;
  const d = new Date();
  if (!activeDays.has(localDayKey(d))) d.setDate(d.getDate() - 1);
  while (activeDays.has(localDayKey(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return n;
}
function legacyActiveDays(activity, words) {
  const set = new Set([...Object.keys(activity), ...words.map((w) => localDayKey(new Date(w.addedAt || 0)))]);
  set.delete(localDayKey(new Date(0)));
  return set;
}

const days = (...list) => Object.fromEntries(list.map((k) => [k, 1]));
const span = (y, m, from, to) => {
  const out = [];
  for (let d = from; d <= to; d++) out.push(key(y, m, d));
  return out;
};

test('the test really runs in Kyiv time, across the October switch', () => {
  expect(at(2026, 10, 24).getTimezoneOffset()).toBe(-180);
  expect(at(2026, 10, 26).getTimezoneOffset()).toBe(-120);
});

// 12 фікстур: нове число серії збігається зі старим.
describe('streakInfo gives the same number as the old code', () => {
  const FIXTURES = [
    ['nothing at all', at(2026, 10, 14), {}, [], 0],
    ['only today', at(2026, 10, 14, 9), days(key(2026, 10, 14)), [], 1],
    ['yesterday and before, not yet today', at(2026, 10, 14, 20), days(key(2026, 10, 12), key(2026, 10, 13)), [], 2],
    ['five days ending today', at(2026, 10, 14, 23, 59, 59), days(...span(2026, 10, 10, 14)), [], 5],
    ['a gap breaks the run', at(2026, 10, 14), days(key(2026, 10, 11), key(2026, 10, 13), key(2026, 10, 14)), [], 2],
    ['missed yesterday — the streak is gone', at(2026, 10, 14), days(key(2026, 10, 11), key(2026, 10, 12)), [], 0],
    ['half a minute past midnight', at(2026, 10, 15, 0, 0, 30), days(...span(2026, 10, 12, 14)), [], 3],
    [
      'words count by the day they were added; a word without addedAt does not',
      at(2026, 10, 14, 18),
      {},
      [{ addedAt: at(2026, 10, 13, 23, 50).getTime() }, { addedAt: at(2026, 10, 14, 0, 5).getTime() }, { addedAt: 0 }],
      2,
    ],
    ['DST night, before the switch', at(2026, 10, 25, 0, 30), days(...span(2026, 10, 20, 24)), [], 5],
    ['DST night, the repeated hour', new Date(Date.UTC(2026, 9, 25, 1, 30)), days(...span(2026, 10, 21, 25)), [], 5],
    ['the day after the switch, not yet today', at(2026, 10, 26, 0, 15), days(...span(2026, 10, 19, 25)), [], 7],
    ['spring switch (29.03.2026), late evening', at(2026, 3, 30, 23, 30), days(...span(2026, 3, 27, 30)), [], 4],
  ];

  afterEach(() => jest.useRealTimers());

  test.each(FIXTURES)('%s', (name, now, activity, words, expected) => {
    jest.useFakeTimers({ now });
    const legacy = legacyStreak(legacyActiveDays(activity, words));
    const info = streakInfo({ activeDays: activeDaySet(activity, words), now: new Date() });
    expect(info.n).toBe(legacy);
    expect(info.n).toBe(expected);
    expect(info.todayKey).toBe(localDayKey(now));
  });

  test('the repeated hour is still the 25th', () => {
    const a = new Date(Date.UTC(2026, 9, 25, 0, 30)); // 03:30 EEST
    const b = new Date(Date.UTC(2026, 9, 25, 1, 30)); // 03:30 EET
    expect(localDayKey(a)).toBe('2026-10-25');
    expect(localDayKey(b)).toBe('2026-10-25');
  });

  test('App and Profile no longer count the streak themselves', () => {
    for (const file of ['App.js', 'src/ProfileScreen.js']) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      expect([file, /streakInfo\(/.test(src)]).toEqual([file, true]);
      expect([file, /setDate\(d\.getDate\(\) - 1\)/.test(src)]).toEqual([file, false]);
    }
  });
});

describe('streakInfo', () => {
  test('doneToday, todayKey and the last active day', () => {
    const active = new Set([key(2026, 10, 10), key(2026, 10, 12)]);
    expect(streakInfo({ activeDays: active, now: at(2026, 10, 12, 8) })).toEqual({
      n: 1,
      doneToday: true,
      todayKey: '2026-10-12',
      lastActiveKey: '2026-10-12',
    });
    // серія згасла: нуль, але активний день у минулому є
    expect(streakInfo({ activeDays: active, now: at(2026, 10, 20) })).toEqual({
      n: 0,
      doneToday: false,
      todayKey: '2026-10-20',
      lastActiveKey: '2026-10-12',
    });
    expect(streakInfo({ activeDays: [], now: at(2026, 10, 20) }).lastActiveKey).toBeNull();
  });

  test('an array works as well as a Set; future keys are not “last active”', () => {
    const info = streakInfo({ activeDays: [key(2026, 10, 13), key(2026, 10, 30)], now: at(2026, 10, 14) });
    expect(info).toMatchObject({ n: 1, doneToday: false, lastActiveKey: '2026-10-13' });
  });

  test('a frozen day bridges the gap without counting (v1.3.1 freezes)', () => {
    const active = [key(2026, 10, 10), key(2026, 10, 11), key(2026, 10, 13)];
    expect(streakInfo({ activeDays: active, now: at(2026, 10, 13) }).n).toBe(1);
    expect(streakInfo({ activeDays: active, frozen: [key(2026, 10, 12)], now: at(2026, 10, 13) }).n).toBe(3);
  });

  test('activeDaySet drops the epoch day of a word without addedAt', () => {
    const set = activeDaySet({ '2026-10-01': 2 }, [{ addedAt: 0 }, {}, { addedAt: at(2026, 10, 2).getTime() }]);
    expect([...set].sort()).toEqual(['2026-10-01', '2026-10-02']);
    expect(activeDaySet(null, null).size).toBe(0);
  });
});

test('bestStreak finds the longest run, across the DST switch too', () => {
  expect(bestStreak([])).toBe(0);
  expect(bestStreak(new Set([key(2026, 10, 1)]))).toBe(1);
  expect(bestStreak([...span(2026, 10, 1, 3), ...span(2026, 10, 22, 28), 'nonsense'])).toBe(7);
  expect(bestStreak([...span(2026, 9, 28, 30), ...span(2026, 10, 1, 2)])).toBe(5);
});

describe('flame', () => {
  // core.md C.2
  test('flameForm follows the table', () => {
    const rows = [0, 1, 2, 3, 4, 5, 6, 7, 13, 14, 29, 30, 99, 100, 365].map((n) => [n, flameForm(n)]);
    expect(Object.fromEntries(rows)).toEqual({
      0: { stage: 'ember', h: 46, w: 34, tongues: 0, tier: 0 },
      1: { stage: 'kindle', h: 54, w: 38, tongues: 0, tier: 0 },
      2: { stage: 'kindle', h: 62, w: 42, tongues: 0, tier: 0 },
      3: { stage: 'kindle', h: 70, w: 46, tongues: 1, tier: 0 },
      4: { stage: 'kindle', h: 78, w: 50, tongues: 2, tier: 0 },
      5: { stage: 'kindle', h: 86, w: 54, tongues: 2, tier: 0 },
      6: { stage: 'kindle', h: 94, w: 58, tongues: 2, tier: 0 },
      7: { stage: 'lit', h: 104, w: 64, tongues: 2, tier: 1 },
      13: { stage: 'lit', h: 104, w: 64, tongues: 2, tier: 1 },
      14: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 2 },
      29: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 2 },
      30: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 3 },
      99: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 3 },
      100: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 4 },
      365: { stage: 'lit', h: 104, w: 64, tongues: 4, tier: 4 },
    });
    expect(flameForm(-3)).toEqual(flameForm(0));
    expect(flameForm(undefined)).toEqual(flameForm(0));
  });

  // Контракт із віджетом «Серія» (widgets.md §5.3)
  test('flameStage on its boundaries', () => {
    const at = [0, 1, 2, 3, 6, 7, 29, 30].map((n) => [n, flameStage(n)]);
    expect(at).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
      [3, 2],
      [6, 2],
      [7, 3],
      [29, 3],
      [30, 4],
    ]);
  });
});

test('nextMilestone', () => {
  expect(MILESTONES).toEqual([3, 7, 14, 30, 60, 100, 180, 365]);
  expect(nextMilestone(0)).toEqual({ m: 3, left: 3, progress: 0 });
  expect(nextMilestone(2)).toEqual({ m: 3, left: 1, progress: 2 / 3 });
  expect(nextMilestone(3)).toEqual({ m: 7, left: 4, progress: 0 });
  expect(nextMilestone(10)).toEqual({ m: 14, left: 4, progress: 3 / 7 });
  expect(nextMilestone(364)).toEqual({ m: 365, left: 1, progress: 184 / 185 });
  // після року — щороку
  expect(nextMilestone(365)).toEqual({ m: 730, left: 365, progress: 0 });
  expect(nextMilestone(400)).toEqual({ m: 730, left: 330, progress: 35 / 365 });
});

describe('weekStrip', () => {
  const LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  // середа, 14.10.2026
  const now = at(2026, 10, 14, 10);
  const active = new Set([key(2026, 10, 12), key(2026, 10, 14)]);

  test('a week from Monday (Ukraine, Germany)', () => {
    const w = weekStrip({ activeDays: active, now, firstWeekday: 2, labels: LABELS });
    expect(w.map((d) => d.key)).toEqual(span(2026, 10, 12, 18));
    expect(w.map((d) => d.label)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
    expect(w.map((d) => d.state)).toEqual(['done', 'missed', 'today', 'future', 'future', 'future', 'future']);
  });

  test('a week from Sunday (US); today not done yet is pending', () => {
    const w = weekStrip({ activeDays: new Set([key(2026, 10, 12)]), now, firstWeekday: 1, labels: LABELS });
    expect(w.map((d) => d.key)).toEqual(span(2026, 10, 11, 17));
    expect(w.map((d) => d.dow)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(w.map((d) => d.state)).toEqual(['missed', 'done', 'missed', 'pending', 'future', 'future', 'future']);
  });

  test('the DST week has seven different days', () => {
    const w = weekStrip({ activeDays: [], now: at(2026, 10, 25, 3, 30), firstWeekday: 2 });
    expect(w.map((d) => d.key)).toEqual(span(2026, 10, 19, 25));
    expect(w[6].state).toBe('pending');
    expect(w[0].label).toBe('');
  });
});

test('phase of the day', () => {
  expect(phase(at(2026, 10, 14, 0, 0))).toBe('day');
  expect(phase(at(2026, 10, 14, 17, 59))).toBe('day');
  expect(phase(at(2026, 10, 14, 18, 0))).toBe('evening');
  expect(phase(at(2026, 10, 14, 21, 59))).toBe('evening');
  expect(phase(at(2026, 10, 14, 22, 0))).toBe('late');
  expect(phase(at(2026, 10, 14, 23, 59))).toBe('late');
});

describe('streakMessage — one choice of words for every screen', () => {
  const uk = makeT('uk');
  const en = makeT('en');
  const msg = (info, opts) => streakMessage(info, uk, opts);

  test('no streak: light the first flame, or start again after a lost one', () => {
    expect(msg({ n: 0 })).toBe(uk('streakNone'));
    expect(msg({ n: 0, lastActiveKey: '2026-10-01' })).toBe(uk('streakLost'));
    expect(msg({ n: 0, lost: true })).toBe(uk('streakLost'));
  });

  test('not yet today: by the time of day', () => {
    expect(msg({ n: 4, doneToday: false, phase: 'day' })).toBe(uk('streakPending'));
    expect(msg({ n: 4, doneToday: false, phase: 'day' }, { short: true })).toBe(uk('streakPendingShort'));
    expect(msg({ n: 4, doneToday: false, phase: 'evening' })).toBe(uk('streakEvening'));
    expect(msg({ n: 4, doneToday: false, phase: 'late' })).toBe(uk('streakLate'));
  });

  test('done today: the owner’s words for the first days, then the habit, the week and beyond', () => {
    expect(msg({ n: 1, doneToday: true })).toBe('1 день поспіль. Так тримати!');
    expect(msg({ n: 2, doneToday: true, phase: 'late' })).toBe('2 дні поспіль. Так тримати!');
    expect(msg({ n: 3, doneToday: true })).toBe(uk('streakHabit', { n: 3 }));
    expect(msg({ n: 6, doneToday: true })).toBe(uk('streakHabit', { n: 6 }));
    expect(msg({ n: 7, doneToday: true })).toBe(uk('streakWeek'));
    expect(msg({ n: 10, doneToday: true })).toBe('Вогонь горить. До 14 днів лишилося 4');
    expect(msg({ n: 30, doneToday: true })).toBe(uk('streak30'));
    expect(streakMessage({ n: 31, doneToday: true }, en)).toBe('Your flame is burning. 29 more days to reach 60');
  });

  test('the second line counts down to the next milestone', () => {
    expect(msg({ n: 0 }, { line: 'next' })).toBe('');
    expect(msg({ n: 4, doneToday: true }, { line: 'next' })).toBe('До тижня ще 3 дні, і вогник розгориться');
    expect(msg({ n: 6 }, { line: 'next' })).toBe('До тижня ще 1 день, і вогник розгориться');
    expect(msg({ n: 8 }, { line: 'next' })).toBe('Вогонь горить. До 14 днів лишилося 6');
  });
});

// Профіль показує те саме число, що й App: обидва беруть streakInfo.
test('the Profile card shows the streak from streakInfo', async () => {
  jest.useFakeTimers({ now: at(2026, 10, 26, 0, 15) });
  try {
    const activity = days(...span(2026, 10, 21, 25));
    const t = makeT('uk');
    let tree;
    await act(async () => {
      tree = create(
        <ProfileScreen words={[]} activity={activity} stats={{}} profile={{ name: '', avatar: 'wave' }} onUpdateProfile={() => {}} t={t} />
      );
    });
    const texts = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
    expect(texts).toContain(t('streakN', { n: 5 }));
    await act(async () => tree.unmount());
  } finally {
    jest.useRealTimers();
  }
});
