// Чип серії в шапці «Навчання» (core.md C.4.1): пігулка 34 pt з міні-
// вогником тієї ж форми, що в Профілі, і числом днів. Сьогодні ще ні —
// вогник блідий. Ввечері під загрозою (з 18:00, серія є, сьогодні ще нічого)
// — пунктирна рамка кольору вогника й червона крапка. Тап — Профіль, «Прогрес»,
// де картка серії (аркуш серії — v1.3.1).
import { Pressable, Text, View } from 'react-native';
import Flame from './Flame';
import { streakMessage } from '../streak';
import { F, R, useTheme } from '../theme';

const H = 34;

export function atRisk(info) {
  return !!info && info.n >= 1 && !info.doneToday && info.phase && info.phase !== 'day';
}

export default function StreakChip({ info, onPress, t, style }) {
  const { C, SHADOW_SM } = useTheme();
  if (!info) return null;
  const n = Math.max(0, info.n || 0);
  const risk = atRisk(info);
  const label = t('streakChipA11y', { n, s: streakMessage(info, t, { short: true }) });
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      hitSlop={{ top: 5, bottom: 5 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      testID="streak-chip"
      style={[
        {
          height: H,
          minWidth: 52,
          borderRadius: R.pill,
          paddingLeft: 9,
          paddingRight: 12,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 3,
          backgroundColor: C.card,
          borderWidth: 1.5,
          borderColor: risk ? C.flame : 'transparent',
          borderStyle: risk ? 'dashed' : 'solid',
        },
        risk ? null : SHADOW_SM,
        style,
      ]}
    >
      <Flame n={n} size={17} pending={!info.doneToday} breathe={false} testID="streak-chip-flame" />
      <Text
        style={{ color: C.text, fontSize: 15, fontFamily: F.extra, fontVariant: ['tabular-nums'] }}
        maxFontSizeMultiplier={1.3}
      >
        {String(n)}
      </Text>
      {risk ? (
        <View
          testID="streak-chip-dot"
          style={{ position: 'absolute', top: -2, right: -2, width: 10, height: 10, borderRadius: 5, backgroundColor: C.red, borderWidth: 2, borderColor: C.bg }}
        />
      ) : null}
    </Pressable>
  );
}
