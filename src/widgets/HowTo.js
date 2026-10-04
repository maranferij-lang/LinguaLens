// «Як додати віджет» — три кроки м'якою анімацією по колу: палець натискає
// на порожнє місце → «+» → іконка LinguaLens. Один компонент для онбордингу
// (W3), Параметрів і підказки на «Навчанні» (widgets.md §12, макет
// widgets-onboarding-step.png). Намальовано кодом, тексти — з i18n, тож
// анімація говорить мовою телефона. З «Менше руху» — статичні кадри.
//
// <WidgetHowTo t={t} />           три колонки: плитки з номерами й короткі підписи
// <WidgetHowTo t={t} compact />   рядки: маленька плитка й повний текст кроку
//
// Колір — лише токени теми; іконка застосунку — справжня (AppIcon).
import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { AppIcon } from '../Logo';
import { IcPlus } from '../icons';
import { useReducedMotion } from '../motion';
import { F, R, type, useTheme } from '../theme';

// Один крок — 1,2 с, коло з трьох — 3,6 с.
export const STEP_MS = 1200;

// Дотик: крапка пальця й коло, що розходиться (ripple), поки крок активний.
function Touch({ size, color, ripple }) {
  const r = size / 2;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {ripple ? (
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            { borderRadius: r, borderWidth: 2, borderColor: color },
            { opacity: ripple.opacity, transform: [{ scale: ripple.scale }] },
          ]}
        />
      ) : null}
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx="12" cy="12" r="4.2" fill={color} />
        <Circle cx="12" cy="12" r="8.2" fill="none" stroke={color} strokeWidth="1.6" opacity="0.45" />
      </Svg>
    </View>
  );
}

export function WidgetHowTo({ t, compact = false, style }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduce = useReducedMotion();
  const phase = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduce) {
      phase.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(phase, { toValue: 3, duration: STEP_MS * 3, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, phase]);

  // Плитка кроку i «підстрибує», поки її черга.
  const lift = (i) =>
    reduce
      ? null
      : {
          transform: [
            {
              scale: phase.interpolate({
                inputRange: [i, i + 0.18, i + 0.7, i + 0.92],
                outputRange: [1, 1.09, 1.09, 1],
                extrapolate: 'clamp',
              }),
            },
          ],
        };
  const ripple = reduce
    ? null
    : {
        scale: phase.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0.5, 0.6, 1.5, 1.5], extrapolate: 'clamp' }),
        opacity: phase.interpolate({ inputRange: [0, 0.15, 0.85, 1], outputRange: [0, 0.8, 0, 0], extrapolate: 'clamp' }),
      };

  const tile = compact ? 40 : 60;
  const icon = (i) =>
    i === 0 ? (
      <Touch size={compact ? 22 : 30} color={C.accent} ripple={ripple} />
    ) : i === 1 ? (
      <View style={[s.plus, compact && s.plusFlat, { width: tile * 0.56, height: tile * 0.56, borderRadius: tile * 0.28 }]}>
        <IcPlus size={compact ? 15 : 20} color={C.text} />
      </View>
    ) : (
      <AppIcon size={compact ? 26 : 38} />
    );
  const steps = compact
    ? [t('widgetTipStep1'), t('widgetTipStep2'), t('widgetTipStep3')]
    : [t('widgetHow1'), t('widgetHow2'), t('widgetHow3')];

  const tileView = (i) => (
    <Animated.View
      style={[s.tile, compact ? s.tileFlat : SHADOW_SM, { width: tile, height: tile, borderRadius: compact ? 13 : 18 }, lift(i)]}
    >
      {icon(i)}
      <View style={[s.badge, compact && s.badgeSmall]}>
        <Text style={[s.badgeText, compact && s.badgeTextSmall]} allowFontScaling={false}>
          {i + 1}
        </Text>
      </View>
    </Animated.View>
  );

  if (compact) {
    return (
      <View testID="widget-howto" style={[s.rows, style]}>
        {steps.map((text, i) => (
          <View key={i} style={s.rowItem}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {tileView(i)}
            </View>
            <Text style={s.rowText} maxFontSizeMultiplier={1.3}>
              {text}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  return (
    <View
      testID="widget-howto"
      style={[s.cols, style]}
      accessible
      accessibilityRole="image"
      accessibilityLabel={t('widgetHowA11y')}
    >
      {steps.map((text, i) => (
        <View key={i} style={s.col}>
          {tileView(i)}
          <Text style={s.colText} numberOfLines={3} maxFontSizeMultiplier={1.2}>
            {text}
          </Text>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    cols: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 8 },
    col: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
    colText: { color: C.text, ...type(13, F.semi, { dense: true }), textAlign: 'center', marginTop: 10 },
    rows: { gap: 12, paddingTop: 4 },
    rowItem: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    rowText: { flex: 1, color: C.text, ...type(14, F.semi) },
    tile: { backgroundColor: C.card, alignItems: 'center', justifyContent: 'center' },
    // у картці (підказка, Параметри) плитка — пласка, на тоні картки
    tileFlat: { backgroundColor: C.card2 },
    plus: { backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
    plusFlat: { backgroundColor: C.card },
    badge: {
      position: 'absolute',
      top: -7,
      left: -7,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: C.bg,
    },
    badgeSmall: { width: 18, height: 18, borderRadius: 9, top: -6, left: -6, borderWidth: 1.5, borderColor: C.card },
    badgeText: { color: C.onAccent, ...type(11, F.extra, { noLead: true }) },
    badgeTextSmall: { fontSize: 10 },
  });

export default WidgetHowTo;
