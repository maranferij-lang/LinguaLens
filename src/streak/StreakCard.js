// Картка серії в Профілі (core.md C.4.2, макет core-streak-screens.png):
// вогник на мʼякій плитці — тієї ж форми, що в чипі й святі, тож видно,
// як він росте день у день і на 7-й розгоряється; «5 днів поспіль» і фраза
// за станом (streakMessage), тиждень крапками, смужка до наступної віхи й
// рекорд. Кольори серії — токени flame* палітри (theme.js), не акцент.
//
// Рядка «Захист серії» тут немає — захист приходить у v1.3.1.
import { Text, View } from 'react-native';
import Flame from './Flame';
import { firstWeekday, milestoneName } from './calendar';
import { nextMilestone, phase, streakInfo, streakMessage, weekStrip } from '../streak';
import { weekdayLabels } from '../share/layout';
import { IcFlame } from '../icons';
import { Bar, Glass } from '../ui';
import { F, R, type, useTheme } from '../theme';

// Головна фраза картки: сьогодні вже було — «до тижня ще…» (а на 7-й і 30-й
// день — сама віха); сьогодні ще ні — «сьогодні ще ні» / «не дай згаснути».
export function cardLine(info, t) {
  if (info.n && info.doneToday && info.n !== 7 && info.n !== 30) return streakMessage(info, t, { line: 'next' });
  return streakMessage(info, t);
}

function Day({ day, C }) {
  const size = 30;
  const base = { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' };
  let dot;
  if (day.state === 'done') dot = <View style={[base, { backgroundColor: C.flameSoft }]}><IcFlame size={15} color={C.flame} /></View>;
  else if (day.state === 'today') dot = <View style={[base, { backgroundColor: C.flame }]}><IcFlame size={16} color={C.onFlame} /></View>;
  else if (day.state === 'pending') dot = <View style={[base, { borderWidth: 2, borderColor: C.flame, borderStyle: 'dashed' }]} />;
  else if (day.state === 'missed') dot = <View style={[base, { backgroundColor: C.card2 }]} />;
  else dot = <View style={[base, { borderWidth: 1.5, borderColor: C.sep }]} />;
  const today = day.state === 'today' || day.state === 'pending';
  return (
    <View style={{ flex: 1, alignItems: 'center', gap: 5 }} testID={'week-' + day.state}>
      {dot}
      <Text style={{ color: today ? C.text : C.dim, fontSize: 11, fontFamily: today ? F.extra : F.semi }} numberOfLines={1}>
        {day.label}
      </Text>
    </View>
  );
}

export default function StreakCard({ activeDays, best = 0, now = new Date(), weekStart, t, style }) {
  const { C } = useTheme();
  const base = streakInfo({ activeDays, now });
  const info = { ...base, phase: phase(now) };
  const n = info.n;
  const week = weekStrip({ activeDays, now, firstWeekday: weekStart || firstWeekday(), labels: weekdayLabels(t('dowShort')) });
  const next = nextMilestone(n);
  const record = Math.max(best, n);
  return (
    <Glass style={[{ marginBottom: 12, gap: 16 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <View
          style={{ width: 84, height: 84, borderRadius: R.lg, backgroundColor: C.flameSoft, alignItems: 'center', justifyContent: 'center' }}
        >
          <Flame n={n} size={52} pending={!!n && !info.doneToday} testID="streak-card-flame" />
        </View>
        <View style={{ flex: 1 }}>
          {/* Нуль днів — не провал, а старт: перший день так і кличе */}
          <Text style={{ color: C.text, ...type(20, F.extra) }}>{n ? t('streakN', { n }) : t('streakStartTitle')}</Text>
          <Text style={{ color: C.dim, ...type(14, F.reg), marginTop: 3 }}>{cardLine(info, t)}</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {week.map((d) => (
          <Day key={d.key} day={d} C={C} />
        ))}
      </View>

      {n ? (
        <View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 7 }}>
            <Text style={{ color: C.text, ...type(13, F.bold) }}>{t('streakProgressOf', { n, m: next.m })}</Text>
            <Text style={{ color: C.dim, ...type(13, F.semi) }}>{milestoneName(next.m, t)}</Text>
          </View>
          <Bar progress={next.progress} color={C.flame} bg={C.card2} height={7} />
        </View>
      ) : null}

      {record >= 2 && record > n ? (
        <View style={{ alignSelf: 'flex-start', backgroundColor: C.card2, borderRadius: R.pill, paddingHorizontal: 11, paddingVertical: 5 }}>
          <Text style={{ color: C.dim, ...type(12, F.bold, { noLead: true }) }}>{t('streakBest', { n: record })}</Text>
        </View>
      ) : null}
    </Glass>
  );
}
