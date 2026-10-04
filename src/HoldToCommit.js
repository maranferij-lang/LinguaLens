// «Натисни й тримай»: обіцянка наприкінці онбордингу — «Обіцянка 2.0»
// (onboarding.md §8, макети onboarding-act3-uk.png 7–9).
//
// Кільце довкола вогника заповнюється за HOLD_MS, поки палець на ньому, —
// рішення відчувається фізично, а не ще одним тапом «Далі». Тримаєш — вогник
// росте (перший день → кілька днів → «розгорівся»), сяйво сильнішає, мʼякі
// дотики наростають (5 × Soft, потім 2 × Medium), у кінці — системний
// Success, 14 іскор і «Домовились!». Відпустив раніше — кільце мʼяко стікає
// за 360 мс, вогник вертається, і підказка просить тримати до кінця кола.
//
// Без жесту: з «Менше руху» чи VoiceOver тримати палець на кільці, що
// повзе, — або незручно, або неможливо. Тоді це звичайна кнопка: один
// дотик (для VoiceOver — дія activate) і готово, без масштабів та іскор.
//
// Хто просто тапає, бачив би лише, як кільце спадає, — а пропустити цей
// крок нема як. Тож відпустив, не дотягнувши й третини кільця, — підказка
// на мить стає акцентною «Тримай довше» з легким дотиком, а після двох
// таких спроб кільце здається і стає звичайною кнопкою, як для «Менше руху».
//
// Кільце малює SVG (strokeDashoffset — лише JS-драйвер), а вогник, сяйво й
// іскри — native driver від окремого значення, яке рухається тим самим
// таймінгом. Дотики й сама обіцянка — таймери: точні й не залежать від кадрів.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';
import Flame from './streak/Flame';
import { EASE, SPRING, useReducedMotion, useScreenReader } from './motion';
import { F, type, useTheme } from './theme';

export const HOLD_MS = 1500;
// Відпустив раніше за цю частку кільця — це був тап, а не спроба втримати
export const SHORT_AT = 0.3;
// Скільки «Тримай довше» лишається на екрані
export const NUDGE_MS = 1500;
// Після стількох коротких дотиків кільце стає звичайною кнопкою
export const SHORTS_TO_TAP = 2;
// Відпустив — кільце стікає
export const DRAIN_MS = 360;
export const SPARKS = 14;
// 1/8 … 5/8 — мʼякі, 6/8 і 7/8 — середні; у кінці — Success
export const TICKS = [1, 2, 3, 4, 5, 6, 7].map((k) => ({ at: k / 8, style: k <= 5 ? 'Soft' : 'Medium' }));
const STROKE = 10;
// Три вогники-стадії, що перетікають один в одного: перший день, кілька
// днів, «розгорівся»
const STAGES = [1, 4, 7];

const ACircle = Animated.createAnimatedComponent(Circle);

// label — що робить кнопка («Пообіцяти»); holdHint / tapHint — підказка під
// кільцем для жесту й для дотику; keepHint — поки тримають; againHint —
// після відпущеної посеред кола спроби; longerHint — «Тримай довше» після
// надто короткого натиску; doneText / doneSub — після обіцянки.
// onCommit({ mode: 'hold' | 'tap', releases }) — пообіцяли.
export default function HoldToCommit({
  onCommit,
  label,
  holdHint,
  keepHint,
  againHint,
  tapHint,
  longerHint,
  doneText,
  doneSub,
  size = 200,
}) {
  const { C, isDark, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C, size), [C, size]);
  const reduced = useReducedMotion();
  const reader = useScreenReader();
  // двічі поспіль лише тапнули — далі кільце приймає звичайний дотик
  const [tapFallback, setTapFallback] = useState(false);
  const tapMode = reduced || reader || tapFallback;

  const [done, setDone] = useState(false);
  // іскри — лише після справжнього тримання з рухом
  const [sparkle, setSparkle] = useState(false);
  const doneRef = useRef(false);
  const [holding, setHolding] = useState(false);
  const [again, setAgain] = useState(false);
  // JS — для кільця (SVG), native — для вогника, сяйва й масштабу
  const fill = useRef(new Animated.Value(0)).current;
  const fillN = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const burst = useRef(new Animated.Value(0)).current;
  // скільки кільця вже заповнено: друге натискання продовжує звідти
  const level = useRef(0);
  const timers = useRef([]);
  // коли почався натиск і звідки: щоб при відпусканні знати, скільки встигли
  const press = useRef(null);
  const shorts = useRef(0);
  const releases = useRef(0);
  const [nudge, setNudge] = useState(false);
  const nudgeTimer = useRef(null);

  useEffect(() => {
    const id = fill.addListener(({ value }) => (level.current = value));
    return () => {
      fill.removeListener(id);
      clearTimers();
      clearTimeout(nudgeTimer.current);
    };
  }, []);

  function clearTimers() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }

  function stop() {
    fill.stopAnimation();
    fillN.stopAnimation();
  }

  function commit(mode = tapMode ? 'tap' : 'hold') {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    stop();
    fill.setValue(1);
    fillN.setValue(1);
    setDone(true);
    setHolding(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (!reduced && mode === 'hold') {
      // обідок кільця на мить товщає, іскри розлітаються
      setSparkle(true);
      pulse.setValue(0);
      burst.setValue(0);
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 140, easing: EASE.out, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 260, easing: EASE.out, useNativeDriver: true }),
        ]),
        Animated.timing(burst, { toValue: 1, duration: 700, easing: EASE.out, useNativeDriver: true }),
      ]).start();
    }
    if (onCommit) onCommit({ mode, releases: releases.current });
  }

  function pressIn() {
    if (doneRef.current || tapMode) return;
    clearTimers();
    stop();
    const from = level.current;
    const left = Math.max(0, HOLD_MS * (1 - from));
    press.current = { at: Date.now(), from };
    setHolding(true);
    setAgain(false);
    Haptics.selectionAsync();
    Animated.spring(scale, { toValue: 0.97, ...SPRING.snappy }).start();
    Animated.parallel([
      Animated.timing(fill, { toValue: 1, duration: left, easing: EASE.linear, useNativeDriver: false }),
      Animated.timing(fillN, { toValue: 1, duration: left, easing: EASE.linear, useNativeDriver: true }),
    ]).start();
    for (const tick of TICKS) {
      if (tick.at <= from) continue;
      const style = Haptics.ImpactFeedbackStyle[tick.style];
      timers.current.push(setTimeout(() => Haptics.impactAsync(style), (tick.at - from) * HOLD_MS));
    }
    timers.current.push(setTimeout(() => commit('hold'), left));
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, ...SPRING.ui }).start();
    if (doneRef.current || tapMode) return;
    setHolding(false);
    // відпустив раніше — кільце мʼяко стікає, вогник вертається
    clearTimers();
    stop();
    Animated.parallel([
      Animated.timing(fill, { toValue: 0, duration: DRAIN_MS, easing: EASE.out, useNativeDriver: false }),
      Animated.timing(fillN, { toValue: 0, duration: DRAIN_MS, easing: EASE.out, useNativeDriver: true }),
    ]).start();
    const p = press.current;
    press.current = null;
    if (!p) return;
    releases.current += 1;
    if (p.from + (Date.now() - p.at) / HOLD_MS < SHORT_AT) tooShort();
    else setAgain(true);
  }

  // Це був тап, а не спроба втримати: кажемо, що робити, і після кількох
  // таких спроб перестаємо вимагати жест
  function tooShort() {
    shorts.current += 1;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setNudge(true);
    clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(() => setNudge(false), NUDGE_MS);
    if (shorts.current >= SHORTS_TO_TAP) setTapFallback(true);
  }

  const r = (size - STROKE) / 2;
  const circ = 2 * Math.PI * r;
  const offset = fill.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });
  // круглий кінець малював би крапку й на нулі — до першого руху кільця немає
  const ringOpacity = fill.interpolate({ inputRange: [0, 0.004, 1], outputRange: [0, 1, 1] });
  const glow = fillN.interpolate({ inputRange: [0, 1], outputRange: [0.15, 0.6] });
  const flameScale = reduced ? 1 : fillN.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const layer = [
    fillN.interpolate({ inputRange: [0, 0.3, 0.36, 1], outputRange: [1, 1, 0, 0] }),
    fillN.interpolate({ inputRange: [0, 0.3, 0.36, 0.63, 0.69, 1], outputRange: [0, 0, 1, 1, 0, 0] }),
    fillN.interpolate({ inputRange: [0, 0.63, 0.69, 1], outputRange: [0, 0, 1, 1] }),
  ];
  const ringPulse = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.05] });

  const nudging = nudge && !done && !!longerHint;
  const hint = done
    ? doneText
    : nudging
      ? longerHint
      : tapMode
        ? tapHint
        : holding
          ? keepHint || holdHint
          : again
            ? againHint || holdHint
            : holdHint;
  const gid = 'htc' + size;

  return (
    <View style={s.wrap}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={tapMode ? () => commit('tap') : undefined}
        // довге натискання — наше, системне контекстне меню тут ні до чого
        delayLongPress={HOLD_MS * 4}
        disabled={done}
        testID="hold-to-commit"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={tapMode ? undefined : holdHint}
        accessibilityState={{ disabled: done }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && commit('tap')}
      >
        <Animated.View style={[s.ring, { transform: [{ scale }] }]}>
          {/* сяйво за кільцем */}
          <Animated.View style={[s.glow, { opacity: glow }]} pointerEvents="none">
            <Svg width={size * 1.5} height={size * 1.5}>
              <Defs>
                <RadialGradient id={gid + 'g'} cx="0.5" cy="0.5" r="0.5">
                  <Stop offset="0.45" stopColor={C.warm} stopOpacity={isDark ? 0.7 : 0.55} />
                  <Stop offset="1" stopColor={C.warm} stopOpacity={0} />
                </RadialGradient>
              </Defs>
              <Circle cx={size * 0.75} cy={size * 0.75} r={size * 0.75} fill={`url(#${gid}g)`} />
            </Svg>
          </Animated.View>
          {/* Кільце стартує згори: SVG малює коло від «трьох годин», тож
              повертаємо його на чверть оберту назад. */}
          <Animated.View style={[s.svg, { transform: [{ rotate: '-90deg' }, { scale: ringPulse }] }]}>
            <Svg width={size} height={size}>
              <Defs>
                <LinearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
                  <Stop offset="0" stopColor={C.accent} />
                  <Stop offset="1" stopColor={C.warm} />
                </LinearGradient>
              </Defs>
              <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.card3} strokeWidth={STROKE} fill="none" />
              <ACircle
                cx={size / 2}
                cy={size / 2}
                r={r}
                stroke={`url(#${gid})`}
                strokeWidth={STROKE}
                strokeLinecap="round"
                fill="none"
                strokeDasharray={`${circ} ${circ}`}
                strokeDashoffset={offset}
                opacity={ringOpacity}
                testID="commit-ring"
              />
            </Svg>
          </Animated.View>
          <View style={[s.core, SHADOW_SM]}>
            {STAGES.map((n, i) => (
              <Animated.View
                key={n}
                style={[s.flame, { opacity: layer[i], transform: [{ scale: flameScale }] }]}
                pointerEvents="none"
                testID={'commit-flame-' + (i + 1)}
              >
                <Flame n={n} size={58} breathe={!holding} />
              </Animated.View>
            ))}
          </View>
          {sparkle ? <Sparks v={burst} size={size} C={C} /> : null}
        </Animated.View>
      </Pressable>
      <Text style={[s.hint, nudging && s.hintNudge, done && s.hintDone]} accessibilityLiveRegion="polite" testID="commit-hint">
        {hint}
      </Text>
      {done && doneSub ? <Text style={s.sub}>{doneSub}</Text> : null}
    </View>
  );
}

// 14 іскор рівномірно по колу з детермінованим зсувом, 110–150 pt, 700 мс
function Sparks({ v, size, C }) {
  const tones = [C.warm, C.accent];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="commit-sparks">
      {Array.from({ length: SPARKS }, (_, i) => {
        const a = (i / SPARKS) * Math.PI * 2 + ((i * 7) % 5) * 0.05;
        const d = 110 + ((i * 13) % 41);
        const dot = 5 + (i % 3) * 2;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: size / 2 - dot / 2,
              top: size / 2 - dot / 2,
              width: dot,
              height: dot,
              borderRadius: dot / 2,
              backgroundColor: tones[i % 2],
              opacity: v.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d] }) },
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

const makeStyles = (C, size) =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
    ring: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', left: -size * 0.25, top: -size * 0.25 },
    svg: { position: 'absolute', top: 0, left: 0 },
    core: {
      width: size - STROKE * 2 - 18,
      height: size - STROKE * 2 - 18,
      borderRadius: size,
      backgroundColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    flame: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    hint: { color: C.dim, ...type(15, F.bold), marginTop: 18, textAlign: 'center' },
    hintNudge: { color: C.accent },
    hintDone: { color: C.accent, ...type(19, F.extra) },
    sub: { color: C.dim, ...type(14, F.semi), marginTop: 2, textAlign: 'center' },
  });
