// Свято першої дії дня (core.md C.3, макет core-streak-screens.png): «2 дні
// поспіль — так тримати!». Шар у корені App (не Modal), як тост досягнення;
// App показує його лише тоді, коли нічого не заважає (черга оверлеїв §5.13).
//
//   • тло проявляється (240 мс), за вогником — бурштинове сяйво;
//   • вогник переходить із учорашньої форми в сьогоднішню: старий тане й
//     меншає, новий виростає (0,8 → 1, SPRING.calm) і коротко спалахує
//     (scaleY 1 → 1,08 → 1); число перекручується — старе їде вгору, нове
//     виринає знизу; сьогоднішня крапка тижня вискакує;
//   • віхи від 7 днів («запалення»): кільце сяйва розходиться й гасне,
//     12 променів, іскри здіймаються, два легкі поштовхи хаптики, Lingo радіє;
//   • звичайний день закривається сам за 2,6 с (тап будь-де — теж); віхи
//     (3, 7, 14, 30, 60, 100, 180, 365) чекають «Продовжити», а «Поділитися»
//     відкриває наліпку-медаль досягнення streak_N; з VoiceOver автозакриття
//     немає, «Продовжити» є завжди;
//   • «Менше руху»: лише проявлення за 160 мс.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, Line, RadialGradient, Rect, Stop } from 'react-native-svg';
import Flame from './Flame';
import { firstWeekday } from './calendar';
import { MILESTONES, streakMessage, weekStrip } from '../streak';
import { ACHIEVEMENTS } from '../achievements';
import { weekdayLabels } from '../share/layout';
import { track } from '../analytics';
import { IcFlame, IcMedal, IcShare } from '../icons';
import { Mascot } from '../Mascot';
import { useSafeAreaInsets } from '../SafeArea';
import { GradBtn, Press } from '../ui';
import { DUR, EASE, SPRING, useReducedMotion, useScreenReader } from '../motion';
import { F, R, type, useTheme } from '../theme';

// Скільки звичайний день лишається на екрані
export const CELEBRATE_MS = 2600;
// Звичайний і низький екран (iPhone SE): на SE вогник і число менші, а
// Lingo віх не показуємо — інакше «Поділитися» не вміщалось би
const SIZES = { full: { flame: 124, num: 78, font: 68 }, compact: { flame: 92, num: 64, font: 56 } };

export function isMilestone(n) {
  return MILESTONES.includes(n);
}

// Досягнення, що збігається з віхою (streak_3, streak_7…), або null
export function streakAchievement(n) {
  return ACHIEVEMENTS.find((a) => a.id === 'streak_' + n) || null;
}

function Rays({ a, C }) {
  const lines = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const r1 = 82;
    const r2 = 104;
    lines.push(
      <Line
        key={i}
        x1={120 + Math.cos(ang) * r1}
        y1={120 + Math.sin(ang) * r1}
        x2={120 + Math.cos(ang) * r2}
        y2={120 + Math.sin(ang) * r2}
        stroke={C.warm}
        strokeWidth={3}
        strokeLinecap="round"
      />
    );
  }
  return (
    <Animated.View
      pointerEvents="none"
      style={{ position: 'absolute', width: 240, height: 240, opacity: a.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 0] }), transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.15] }) }] }}
    >
      <Svg width={240} height={240}>{lines}</Svg>
    </Animated.View>
  );
}

function Sparks({ a, C }) {
  const spots = [
    [-58, 10, 7],
    [54, -4, 6],
    [-34, -46, 5],
    [40, -52, 6],
  ];
  return spots.map(([x, y, s], i) => (
    <Animated.View
      key={i}
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: s * 2,
        height: s * 2,
        backgroundColor: C.warm,
        borderRadius: 2,
        opacity: a.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
        transform: [
          { translateX: x },
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [y, y - 64] }) },
          { rotate: '45deg' },
        ],
      }}
    />
  ));
}

function WeekDots({ activeDays, pop, C, t }) {
  const days = weekStrip({ activeDays, firstWeekday: firstWeekday(), labels: weekdayLabels(t('dowShort')) });
  return (
    <View style={{ flexDirection: 'row', gap: 8 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {days.map((d) => {
        const today = d.state === 'today';
        const done = d.state === 'done' || today;
        const dot = (
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: today ? C.warm : done ? C.warmSoft : C.card2,
            }}
          >
            {done ? <IcFlame size={14} color={today ? C.card : C.warm} /> : null}
          </View>
        );
        return (
          <View key={d.key} style={{ alignItems: 'center', gap: 4 }}>
            {today ? <Animated.View style={{ transform: [{ scale: pop }] }}>{dot}</Animated.View> : dot}
            <Text style={{ color: today ? C.text : C.dim, fontSize: 11, fontFamily: today ? F.extra : F.semi }}>{d.label}</Text>
          </View>
        );
      })}
    </View>
  );
}

export default function StreakCelebration({ data, activeDays, onDone, onShare, t }) {
  const { C } = useTheme();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const reader = useScreenReader();
  const compact = useWindowDimensions().height < 760;
  const { flame: FLAME, num: NUM_H, font: NUM_FONT } = compact ? SIZES.compact : SIZES.full;
  // Показуємо копію data: App прибирає своє, лише коли ми вже згасли
  const [shown, setShown] = useState(null);
  const fade = useRef(new Animated.Value(0)).current;
  const grow = useRef(new Animated.Value(0)).current;
  const flash = useRef(new Animated.Value(0)).current;
  const roll = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;
  const timers = useRef([]);
  const leaving = useRef(false);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  useEffect(() => {
    if (!data || shown) return;
    leaving.current = false;
    const to = data.to;
    const milestone = isMilestone(to);
    const lit = milestone && to >= 7;
    setShown(data);
    track('streak_celebrate', { n: to, milestone });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    AccessibilityInfo.announceForAccessibility?.(`${streakMessage({ n: to, doneToday: true }, t)}. ${streakMessage({ n: to }, t, { line: 'next' })}`);
    if (reduced) {
      [grow, flash, roll, burst].forEach((v) => v.setValue(1));
      flash.setValue(0);
      Animated.timing(fade, { toValue: 1, duration: DUR.micro, easing: EASE.out, useNativeDriver: true }).start();
    } else {
      [fade, grow, flash, roll, burst].forEach((v) => v.setValue(0));
      pop.setValue(0.6);
      Animated.timing(fade, { toValue: 1, duration: 240, easing: EASE.out, useNativeDriver: true }).start();
      Animated.parallel([
        Animated.spring(grow, { toValue: 1, ...SPRING.calm, delay: 120 }),
        Animated.sequence([
          Animated.delay(220),
          Animated.timing(flash, { toValue: 1, duration: 150, easing: EASE.out, useNativeDriver: true }),
          Animated.timing(flash, { toValue: 0, duration: 150, easing: EASE.out, useNativeDriver: true }),
        ]),
        Animated.timing(roll, { toValue: 1, duration: 280, delay: 200, easing: EASE.out, useNativeDriver: true }),
        Animated.spring(pop, { toValue: 1, ...SPRING.ui, delay: 360 }),
      ]).start();
      if (lit) Animated.timing(burst, { toValue: 1, duration: 900, delay: 160, easing: EASE.out, useNativeDriver: true }).start();
    }
    if (lit) {
      timers.current.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 180));
      timers.current.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), 360));
    }
    if (!milestone && !reader) timers.current.push(setTimeout(close, CELEBRATE_MS));
  }, [data]);

  function close() {
    if (leaving.current) return;
    leaving.current = true;
    clear();
    Animated.timing(fade, { toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: true }).start(() => {
      setShown(null);
      onDone?.();
    });
  }

  if (!shown) return null;
  const { from, to } = shown;
  const milestone = isMilestone(to);
  const lit = milestone && to >= 7;
  const ach = milestone ? streakAchievement(to) : null;
  const headline = streakMessage({ n: to, doneToday: true }, t);
  const sub = streakMessage({ n: to }, t, { line: 'next' });
  const waits = milestone || reader;

  const oldStyle = reduced
    ? { opacity: 0 }
    : { opacity: grow.interpolate({ inputRange: [0, 0.6], outputRange: [1, 0], extrapolate: 'clamp' }), transform: [{ scale: grow.interpolate({ inputRange: [0, 1], outputRange: [1, 0.9] }) }] };
  const newStyle = reduced
    ? null
    : {
        opacity: grow.interpolate({ inputRange: [0, 0.4], outputRange: [0, 1], extrapolate: 'clamp' }),
        transform: [
          { scale: grow.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
          { scaleY: flash.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
        ],
      };

  return (
    <Animated.View
      style={[StyleSheet.absoluteFill, { zIndex: 300, opacity: fade }]}
      accessibilityViewIsModal
      onAccessibilityEscape={close}
      testID="streak-celebration"
    >
      <Pressable
        style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }]}
        onPress={waits ? undefined : close}
        accessible={false}
        testID="streak-celebration-backdrop"
      >
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <RadialGradient id="celebrateGlow" cx="0.5" cy="0.36" r="0.55">
              <Stop offset="0" stopColor={C.warm} stopOpacity={lit ? 0.42 : 0.26} />
              <Stop offset="1" stopColor={C.warm} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#celebrateGlow)" />
        </Svg>
      </Pressable>

      <View
        pointerEvents="box-none"
        style={{ flex: 1, paddingTop: insets.top + (compact ? 12 : 24), paddingBottom: insets.bottom + (compact ? 16 : 24), paddingHorizontal: 28 }}
      >
        <View pointerEvents="none" style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 240, height: FLAME * 1.2 + 24, alignItems: 'center', justifyContent: 'center' }}>
            {lit ? (
              <>
                <Animated.View
                  style={{
                    position: 'absolute',
                    width: 170,
                    height: 170,
                    borderRadius: 85,
                    borderWidth: 3,
                    borderColor: C.warm,
                    opacity: burst.interpolate({ inputRange: [0, 0.15, 0.55], outputRange: [0, 0.9, 0], extrapolate: 'clamp' }),
                    transform: [{ scale: burst.interpolate({ inputRange: [0, 0.55], outputRange: [0.6, 1.4], extrapolate: 'clamp' }) }],
                  }}
                />
                <Rays a={burst} C={C} />
                <Sparks a={burst} C={C} />
              </>
            ) : null}
            {from !== to ? (
              <Animated.View style={[{ position: 'absolute' }, oldStyle]}>
                <Flame n={from} size={FLAME} breathe={false} testID="celebration-flame-from" />
              </Animated.View>
            ) : null}
            <Animated.View style={newStyle}>
              <Flame n={to} size={FLAME} testID="celebration-flame" />
            </Animated.View>
          </View>

          {/* число перекручується: учорашнє їде вгору, сьогоднішнє виринає */}
          <View style={{ height: NUM_H, overflow: 'hidden', alignSelf: 'stretch', alignItems: 'center', marginTop: 4 }}>
            {from !== to && !reduced ? (
              <Animated.Text
                style={[s.num(C, NUM_H, NUM_FONT), { position: 'absolute', opacity: roll.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }), transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [0, -NUM_H] }) }] }]}
              >
                {String(from)}
              </Animated.Text>
            ) : null}
            <Animated.Text
              testID="celebration-number"
              style={[s.num(C, NUM_H, NUM_FONT), reduced ? null : { transform: [{ translateY: roll.interpolate({ inputRange: [0, 1], outputRange: [NUM_H, 0] }) }] }]}
            >
              {String(to)}
            </Animated.Text>
          </View>

          <Text style={{ color: C.text, ...type(22, F.extra), textAlign: 'center', marginTop: 2 }} accessibilityRole="header">
            {headline}
          </Text>
          {sub ? <Text style={{ color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8, maxWidth: 320 }}>{sub}</Text> : null}

          <View style={{ marginTop: compact ? 16 : 22 }}>
            <WeekDots activeDays={activeDays} pop={pop} C={C} t={t} />
          </View>

          {ach ? (
            <View style={[s.chip(C), compact && { marginTop: 14 }]} testID="celebration-achievement">
              <IcMedal size={16} color={C.accent} />
              <Text style={{ color: C.accent, ...type(14, F.bold, { noLead: true }) }}>{t('streakAchChip', { a: t('ach_' + ach.id) })}</Text>
            </View>
          ) : null}
          {lit && !compact ? <Mascot pose="celebrate" size={84} style={{ marginTop: 14 }} /> : null}
        </View>

        {waits ? (
          <View style={{ marginTop: compact ? 14 : 24, gap: 10 }}>
            <GradBtn title={t('streakContinue')} onPress={close} />
            {ach && onShare ? (
              <Press
                onPress={() => {
                  close();
                  onShare(ach);
                }}
                accessibilityLabel={t('share')}
              >
                <View style={s.share(C)}>
                  <IcShare size={18} color={C.text} />
                  <Text style={{ color: C.text, ...type(16, F.bold, { noLead: true }) }}>{t('share')}</Text>
                </View>
              </Press>
            ) : null}
          </View>
        ) : null}
      </View>
    </Animated.View>
  );
}

const s = {
  num: (C, h, size) => ({ color: C.text, fontSize: size, lineHeight: h, fontFamily: F.extra, letterSpacing: -1.5, fontVariant: ['tabular-nums'] }),
  chip: (C) => ({
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 18,
    backgroundColor: C.accentSoft,
    borderRadius: R.pill,
    paddingHorizontal: 14,
    paddingVertical: 8,
  }),
  share: (C) => ({
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: C.card2,
    borderRadius: R.lg,
    paddingVertical: 15,
  }),
};
