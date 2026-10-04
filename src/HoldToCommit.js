// «Натисни й тримай»: обіцянка наприкінці онбордингу.
//
// Кільце навколо Lingo заповнюється за HOLD_MS, поки палець на ньому, —
// рішення відчувається фізично, а не ще одним тапом «Далі». На чвертях
// кільця — дотики від легкого до важкого (наростання), у кінці — системний
// «успіх». Відпустив раніше — кільце швидко спадає, і можна почати знову.
//
// Без жесту: з «Менше руху» чи VoiceOver тримати палець на кільці, що
// повзе, — або незручно, або неможливо. Тоді це звичайна кнопка: один
// дотик (для VoiceOver — дія activate) і готово.
//
// Хто просто тапає, бачив би лише, як кільце спадає, — а пропустити цей
// крок нема як. Тож відпустив, не дотягнувши й третини кільця, — підказка
// на мить стає акцентною «Тримай довше» з легким дотиком, а після двох
// таких спроб кільце здається і стає звичайною кнопкою, як для «Менше руху».
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle } from 'react-native-svg';
import { Mascot } from './Mascot';
import { DUR, EASE, SPRING, useReducedMotion, useScreenReader } from './motion';
import { F, type, useTheme } from './theme';

export const HOLD_MS = 1200;
// Відпустив раніше за цю частку кільця — це був тап, а не спроба втримати
export const SHORT_AT = 0.3;
// Скільки «Тримай довше» лишається на екрані
export const NUDGE_MS = 1500;
// Після стількох коротких дотиків кільце стає звичайною кнопкою
export const SHORTS_TO_TAP = 2;
const TICKS = [
  { at: 0.25, style: 'Light' },
  { at: 0.5, style: 'Medium' },
  { at: 0.75, style: 'Heavy' },
];
const STROKE = 9;

const ACircle = Animated.createAnimatedComponent(Circle);

// label — що робить кнопка («Пообіцяти»), holdHint / tapHint — підказка
// під кільцем для жесту й для дотику, longerHint — «Тримай довше» після
// надто короткого натиску, doneText — після обіцянки.
export default function HoldToCommit({ onCommit, label, holdHint, tapHint, longerHint, doneText, size = 184 }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C, size), [C, size]);
  const reduced = useReducedMotion();
  const reader = useScreenReader();
  // двічі поспіль лише тапнули — далі кільце приймає звичайний дотик
  const [tapFallback, setTapFallback] = useState(false);
  const tapMode = reduced || reader || tapFallback;

  const [done, setDone] = useState(false);
  const doneRef = useRef(false);
  const fill = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  // скільки кільця вже заповнено: друге натискання продовжує звідти
  const level = useRef(0);
  const timers = useRef([]);
  // коли почався натиск і звідки: щоб при відпусканні знати, скільки встигли
  const press = useRef(null);
  const shorts = useRef(0);
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

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    clearTimers();
    fill.stopAnimation();
    fill.setValue(1);
    setDone(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (onCommit) onCommit();
  }

  function pressIn() {
    if (doneRef.current || tapMode) return;
    clearTimers();
    fill.stopAnimation();
    const from = level.current;
    const left = Math.max(0, HOLD_MS * (1 - from));
    press.current = { at: Date.now(), from };
    Haptics.selectionAsync();
    Animated.spring(scale, { toValue: 0.96, ...SPRING.snappy }).start();
    // Кільце малює Animated (властивість SVG — лише без native driver), а
    // дотики й сама обіцянка — таймери: вони точні й не залежать від кадрів.
    Animated.timing(fill, { toValue: 1, duration: left, easing: EASE.linear, useNativeDriver: false }).start();
    for (const tick of TICKS) {
      if (tick.at <= from) continue;
      const style = Haptics.ImpactFeedbackStyle[tick.style];
      timers.current.push(setTimeout(() => Haptics.impactAsync(style), (tick.at - from) * HOLD_MS));
    }
    timers.current.push(setTimeout(commit, left));
  }

  function pressOut() {
    Animated.spring(scale, { toValue: 1, ...SPRING.ui }).start();
    if (doneRef.current || tapMode) return;
    // відпустив раніше — усе спочатку
    clearTimers();
    fill.stopAnimation();
    Animated.timing(fill, { toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: false }).start();
    const p = press.current;
    press.current = null;
    if (p && p.from + (Date.now() - p.at) / HOLD_MS < SHORT_AT) tooShort();
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
  const nudging = nudge && !done && !!longerHint;
  const hint = done ? doneText : nudging ? longerHint : tapMode ? tapHint : holdHint;

  return (
    <View style={s.wrap}>
      <Pressable
        onPressIn={pressIn}
        onPressOut={pressOut}
        onPress={tapMode ? commit : undefined}
        // довге натискання — наше, системне контекстне меню тут ні до чого
        delayLongPress={HOLD_MS * 4}
        disabled={done}
        testID="hold-to-commit"
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={tapMode ? undefined : holdHint}
        accessibilityState={{ disabled: done }}
        accessibilityActions={[{ name: 'activate' }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'activate' && commit()}
      >
        <Animated.View style={[s.ring, { transform: [{ scale }] }]}>
          {/* Кільце стартує згори: SVG малює коло від «трьох годин», тож
              повертаємо його на чверть оберту назад. */}
          <Svg width={size} height={size} style={s.svg}>
            <Circle cx={size / 2} cy={size / 2} r={r} stroke={C.card3} strokeWidth={STROKE} fill="none" />
            <ACircle
              cx={size / 2}
              cy={size / 2}
              r={r}
              stroke={C.accent}
              strokeWidth={STROKE}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={`${circ} ${circ}`}
              strokeDashoffset={offset}
            />
          </Svg>
          <View style={s.core}>
            <Mascot pose={done ? 'celebrate' : 'encourage'} size={size * 0.6} />
          </View>
        </Animated.View>
      </Pressable>
      <Text style={[s.hint, nudging && s.hintNudge, done && s.hintDone]} accessibilityLiveRegion="polite">
        {hint}
      </Text>
    </View>
  );
}

const makeStyles = (C, size) =>
  StyleSheet.create({
    wrap: { alignItems: 'center' },
    ring: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
    svg: { position: 'absolute', top: 0, left: 0, transform: [{ rotate: '-90deg' }] },
    core: {
      width: size - STROKE * 2 - 14,
      height: size - STROKE * 2 - 14,
      borderRadius: size,
      backgroundColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    hint: { color: C.dim, ...type(15, F.bold), marginTop: 16, textAlign: 'center' },
    hintNudge: { color: C.accent },
    hintDone: { color: C.accent, ...type(17, F.extra) },
  });
