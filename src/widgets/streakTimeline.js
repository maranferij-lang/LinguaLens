// Таймлайн віджета «Серія» (Streak) — widgets.md §5.3 з поправками плану:
// лише малий, середній і екран блокування; вогник — SF Symbol за стадією.
//
// Серію рахує лише src/streak.js (той самий streakInfo, що й застосунок), а
// фрази — streakMessage і ключі з src/strings/shared.js. Тут — лише коли
// який стан показати. Межі доби — місцевий час через new Date(y, m, d, h),
// тож перехід на зимовий час (25.10.2026 у Києві) не зсуває ні півночі,
// ні 18:00.
//
//   сьогодні вже є дія:  зараз — done; завтра 00:00 — pending; 18:00 —
//                        evening (таймер до півночі); 22:00 — late;
//                        післязавтра 00:00 — lost; ще за добу — none
//   сьогодні ще ні, учора так: зараз — pending/evening/late за годиною,
//                        далі ті самі межі сьогодні; 00:00 — lost; потім none
//   серії немає:         none (або lost до кінця дня, якщо серія з ≥ 2 днів
//                        обірвалась цієї ночі)
import { flameStage, nextMilestone, streakInfo, streakMessage, weekStrip } from '../streak';
import { weekdayLabels } from '../share/layout';
import { REAL_CLOCK, atHour, midnight } from './clock';
import { widgetLink } from './links';
import { widgetPalette } from './palette';
import { SCHEMA } from './wordTimeline';

export const EVENING = 18;
export const LATE = 22;

function shift(d, days) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, 12);
}

// Сегменти таймлайну: що показувати й від якого «справжнього» моменту.
function plan(activeDays, now) {
  const info = streakInfo({ activeDays, now });
  const out = [];
  const day = (real, n, state, done = false) => out.push({ real, n, state, done });
  // день без дії: від години залежить, чи вже вечір
  const waiting = (from, n, first) => {
    const h = from.getHours();
    if (first) day(from, n, h >= LATE ? 'late' : h >= EVENING ? 'evening' : 'pending');
    if (h < EVENING) day(atHour(from, EVENING), n, 'evening');
    if (h < LATE) day(atHour(from, LATE), n, 'late');
  };
  if (info.doneToday) {
    day(now, info.n, 'done', true);
    const tomorrow = midnight(now, 1);
    day(tomorrow, info.n, 'pending');
    waiting(tomorrow, info.n, false);
    day(midnight(now, 2), 0, 'lost');
    day(midnight(now, 3), 0, 'none');
  } else if (info.n > 0) {
    waiting(now, info.n, true);
    day(midnight(now, 1), 0, 'lost');
    day(midnight(now, 2), 0, 'none');
  } else {
    // серія обірвалась цієї ночі: позавчора ще горіла, учора — ні
    const before = streakInfo({ activeDays, now: shift(now, -2) });
    if (before.doneToday && before.n >= 2) {
      day(now, 0, 'lost');
      day(midnight(now, 1), 0, 'none');
    } else {
      day(now, 0, 'none');
    }
  }
  return out;
}

// Фраза стану. Число вже стоїть великим, тож у дні з дією — що далі
// («До тижня — ще 3 дні…»), а на віхах 7 і 30 — свято.
export function streakLines(t, seg) {
  const { n, state } = seg;
  if (state === 'done') {
    const main = streakMessage({ n, doneToday: true }, t);
    const next = n === 7 || n === 30 ? '' : streakMessage({ n, doneToday: true }, t, { line: 'next' });
    return { line: next || main, short: next || main };
  }
  if (state === 'pending') return { line: t('streakPending'), short: t('streakPendingShort') };
  if (state === 'evening') return { line: t('streakEvening'), short: t('streakEvening') };
  if (state === 'late') return { line: t('streakLate'), short: t('streakLate') };
  const msg = t(state === 'lost' ? 'streakLost' : 'streakNone');
  return { line: msg, short: msg };
}

// opts: t, now, firstWeekday (1 — неділя, 2 — понеділок), pal, clock.
export function buildStreakTimeline(activeDays, { t, now = new Date(), firstWeekday = 2, pal = widgetPalette('light'), clock = REAL_CLOCK }) {
  const segs = plan(activeDays, now);
  const labels = weekdayLabels(t('dowShort'));
  const title = t('widgetStreakTitle');
  // У «прискореному часі» кожна наступна межа — через 2 «години» (хвилини),
  // а таймер іде до віртуальної півночі — моменту запису lost.
  const at = segs.map((s, i) => (i === 0 ? now : clock.fast ? new Date(now.getTime() + i * 2 * clock.hour) : s.real));
  return segs.map((seg, i) => {
    const timed = seg.state === 'evening' || seg.state === 'late';
    let until = '';
    if (timed) {
      const end = clock.fast ? at[segs.findIndex((x, j) => j > i && x.state === 'lost')] : midnight(seg.real, 1);
      until = end ? String(end.getTime()) : '';
    }
    const { n } = seg;
    // «0 днів поспіль» читається дивно: без серії — просто «0 днів»
    const unit = n ? t('streakUnit', { n }) : t('widgetDays', { n });
    const goal = nextMilestone(n);
    const { line, short } = streakLines(t, seg);
    // день у тижні — той, що «справжній» для запису (у прискореному часі теж)
    const week = weekStrip({ activeDays, now: seg.real, firstWeekday, labels }).map((d) => ({ d: d.label, s: d.state }));
    const state = seg.state === 'evening' ? 'pending' : seg.state;
    return {
      date: at[i],
      props: {
        kind: 'streak',
        v: SCHEMA,
        key: `streak|${seg.real.getTime()}|${seg.state}`,
        state,
        link: widgetLink('streak', {}, 'streak'),
        a11y: [title, `${n} ${unit}`, line].join(', '),
        a11yShort: [title, `${n} ${unit}`].join(', '),
        pal,
        hide: '',
        revealed: '',
        revealShort: '',
        revealLong: '',
        title,
        n: String(n),
        unit,
        line,
        short,
        inline: `${n} ${unit}`,
        stage: String(flameStage(n)),
        until,
        goal: n ? goal.progress.toFixed(2) : '0',
        goalLabel: String(goal.m),
        week,
      },
    };
  });
}
