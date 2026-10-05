// Банер «серія під загрозою» згори на «Навчанні» (core.md C.4.4): з 18:00,
// коли серія є, а сьогодні ще нічого не було. Блідий вогник, «Серія 5 днів
// згасне опівночі», скільки лишилось (щохвилини) і одна дія, що рятує
// серію: повторити одну картку (є слова) або зберегти слово дня (слів
// немає). Тон спокійний, без докорів. Щойно дія зроблена, App більше не
// показує банер — він зникає сам.
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import Flame from './Flame';
import { formatLeft } from '../locale';
import { track } from '../analytics';
import { GradBtn } from '../ui';
import { F, R, type, useTheme } from '../theme';

// Скільки мілісекунд до найближчої місцевої півночі
export function msToMidnight(now = new Date()) {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0);
  return Math.max(0, midnight.getTime() - now.getTime());
}

export default function RiskBanner({ n, lang, ctaLabel, onCta, t, style }) {
  const { C } = useTheme();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    track('streak_risk', { action: 'shown' });
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);
  const left = formatLeft(msToMidnight(new Date(now)), lang);
  return (
    <View
      testID="risk-banner"
      style={[{ backgroundColor: C.flameSoft, borderRadius: R.xl, padding: 16, marginBottom: 14 }, style]}
    >
      <View style={{ flexDirection: 'row', gap: 12 }} accessible accessibilityLabel={`${t('streakRiskTitle', { n })}. ${t('streakRiskBody', { t: left })}`}>
        <View style={{ width: 44, alignItems: 'center', paddingTop: 2 }}>
          <Flame n={n} size={38} pending breathe={false} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: C.text, ...type(16, F.extra) }}>{t('streakRiskTitle', { n })}</Text>
          <Text style={{ color: C.dim, ...type(14, F.reg), marginTop: 2 }}>{t('streakRiskBody', { t: left })}</Text>
        </View>
      </View>
      {onCta && ctaLabel ? (
        <GradBtn
          small
          title={ctaLabel}
          onPress={() => {
            track('streak_risk', { action: 'cta' });
            onCta();
          }}
          style={{ marginTop: 12 }}
        />
      ) : null}
    </View>
  );
}
