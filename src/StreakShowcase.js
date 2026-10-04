// Вітрина серії в онбордингу (onboarding.md §5.6, макет
// onboarding-act2-uk.png 1–4): не цифра, а вогник, якого можна торкнутися.
// Людина веде пальцем по днях 1→7 (чи тапає день) — і вогник росте тією ж
// формою, що й у застосунку (спільний src/streak/Flame.js, форма — від
// flameForm(n)). На 7-й день — «запалення» зі сяйвом та іскрами.
//
// Дотики: кожен новий день — selection, нова стадія вогника (як у віджеті
// «Серія»: 1–2 / 3–6 / 7) — Light, перший 7-й день — Success (один із трьох
// Success за весь онбординг). Через 1,5 с бездіяльності на нулі — підказка:
// «палець» двічі проводить по днях 1–3; з «Менше руху» — лише підпис.
// VoiceOver: ряд днів — один елемент adjustable.
//
// onPlay({ max, touched }) — на кожну зміну: найбільший день і чи людина
// взагалі торкалась (для onb_streak_play при виході з кроку).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle as SvgCircle } from 'react-native-svg';
import Flame from './streak/Flame';
import { flameStage, streakMessage } from './streak';
import { DUR, EASE, SPRING, useReducedMotion } from './motion';
import { F, R, type, useTheme } from './theme';

export const DAYS = 7;
export const HINT_IDLE_MS = 1500;
// Нижче цієї висоти вікна (SE) сцена вогника компактніша
const SHORT_H = 700;
const DOT = 38;
const SPARKS = 7;

// День під пальцем: x — відстань від лівого краю ряду, w — ширина ряду
export function dayAt(x, w) {
  if (!(w > 0)) return 0;
  return Math.max(1, Math.min(DAYS, Math.ceil((x / w) * DAYS)));
}

// Підпис під вогником: жаринка, «так тримати», «звичка», «тиждень»
export function showcaseLine(n, t) {
  if (!n) return t('streakEmber');
  return streakMessage({ n, doneToday: true }, t);
}

export default function StreakShowcase({ t, onPlay, initial = 0 }) {
  const { C, isDark, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();
  // SE і подібні: менша сцена вогника — ряд днів, підказка й «Далі»
  // вміщаються без прокрутки
  const short = useWindowDimensions().height < SHORT_H;
  const [n, setN] = useState(initial);
  const nRef = useRef(initial);
  const max = useRef(initial);
  const touched = useRef(false);
  const lit = useRef(false);
  const [hint, setHint] = useState(false);

  // Вогник «підскакує» на кожен новий день; на 7-й — іскри
  const pop = useRef(new Animated.Value(1)).current;
  const burst = useRef(new Animated.Value(0)).current;

  function set(next, { touch = true } = {}) {
    const v = Math.max(0, Math.min(DAYS, next));
    const prev = nRef.current;
    if (touch && !touched.current) {
      touched.current = true;
      setHint(false);
    }
    if (v === prev) return;
    nRef.current = v;
    setN(v);
    max.current = Math.max(max.current, v);
    Haptics.selectionAsync();
    if (flameStage(v) !== flameStage(prev)) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (v === DAYS && !lit.current) {
      lit.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (!reduced) {
      pop.setValue(0.88);
      Animated.spring(pop, { toValue: 1, ...SPRING.ui }).start();
      if (v === DAYS) {
        burst.setValue(0);
        Animated.timing(burst, { toValue: 1, duration: 900, easing: EASE.out, useNativeDriver: true }).start();
      }
    }
    onPlay?.({ max: max.current, touched: touched.current });
  }

  // Підказка-палець, якщо людина нічого не робить
  useEffect(() => {
    if (n !== 0 || touched.current) return undefined;
    const id = setTimeout(() => setHint(true), HINT_IDLE_MS);
    return () => clearTimeout(id);
  }, [n]);

  // Провести пальцем по ряду: день — під пальцем. Тап по дню — Pressable.
  const row = useRef(null);
  const box = useRef({ x: 0, w: 0 });
  const [rowW, setRowW] = useState(0);
  const measure = () => {
    try {
      row.current?.measureInWindow?.((x, y, w) => {
        if (w > 0) box.current = { x, w };
      });
    } catch (_) {}
  };
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
        onPanResponderGrant: () => measure(),
        onPanResponderMove: (_, g) => {
          const { x, w } = box.current;
          if (w > 0) set(dayAt(g.moveX - x, w));
        },
        onPanResponderTerminationRequest: () => false,
      }),
    []
  );

  const stage = flameStage(n);
  const label = showcaseLine(n, t);
  const week = n === DAYS;
  return (
    <View style={s.root}>
      <View style={[s.stage, short && s.stageShort]}>
        <View style={[s.glow, short && s.glowShort, { opacity: n ? 0.55 + stage * 0.15 : 0.45 }]} />
        {week && !reduced ? <Sparks v={burst} color={C.warm} /> : null}
        <Animated.View style={{ transform: [{ scale: pop }] }} testID="showcase-flame" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Flame n={n} size={short ? 92 : 112} />
        </Animated.View>
      </View>

      <View style={[s.pill, !week && SHADOW_SM, week && { backgroundColor: C.warm }]}>
        <Text style={[s.pillText, week && { color: isDark ? C.bg : C.text }]} numberOfLines={2} accessibilityLiveRegion="polite" testID="showcase-line">
          {label}
        </Text>
      </View>

      <View
        ref={row}
        onLayout={(e) => {
          setRowW(e.nativeEvent.layout.width);
          measure();
        }}
        {...pan.panHandlers}
        style={[s.row, short && { marginTop: 16 }]}
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={t('obStreakHint')}
        accessibilityValue={{ min: 0, max: DAYS, now: n, text: t('obStreakA11y', { n }) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(e) => set(nRef.current + (e.nativeEvent.actionName === 'increment' ? 1 : -1))}
        testID="showcase-days"
      >
        {Array.from({ length: DAYS }, (_, i) => {
          const d = i + 1;
          const on = d <= n;
          const goal = d === DAYS && !on;
          return (
            <Pressable key={d} onPress={() => set(d)} style={s.cell} hitSlop={4} accessible={false} testID={'showcase-day-' + d}>
              <View
                style={[
                  s.dot,
                  on && { backgroundColor: C.warm, borderColor: C.warm },
                  d === n && s.dotNow,
                  goal && s.dotGoal,
                ]}
              >
                {on ? <Flame n={1} size={11} breathe={false} pending /> : null}
              </View>
              <Text style={[s.dayNum, on && { color: C.text }]}>{d}</Text>
            </Pressable>
          );
        })}
        {hint ? <Finger reduced={reduced} C={C} step={rowW / DAYS} /> : null}
      </View>
      <Text style={[s.hint, { opacity: hint ? 1 : 0 }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {t('obStreakHint')}
      </Text>
    </View>
  );
}

// «Палець» підказки: двічі проводить по днях 1–3 і зникає
function Finger({ reduced, C, step }) {
  const x = useRef(new Animated.Value(0)).current;
  const o = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const once = Animated.sequence([
      Animated.parallel([
        Animated.timing(o, { toValue: 1, duration: DUR.micro, useNativeDriver: true }),
        Animated.timing(x, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
      Animated.timing(x, { toValue: 1, duration: 1100, easing: EASE.inOut, useNativeDriver: true }),
      Animated.timing(o, { toValue: 0, duration: DUR.exit, useNativeDriver: true }),
      Animated.delay(300),
    ]);
    const run = Animated.sequence([once, once]);
    run.start();
    return () => run.stop();
  }, [reduced]);
  if (reduced) return null;
  // від середини першого кружечка до третього (ряд — сім рівних клітинок)
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 4,
        left: `${(0.5 / DAYS) * 100}%`,
        marginLeft: -15,
        width: 30,
        height: 30,
        borderRadius: 15,
        backgroundColor: C.accent,
        opacity: o.interpolate({ inputRange: [0, 1], outputRange: [0, 0.32] }),
        transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, 2 * (step || 46)] }) }],
      }}
    />
  );
}

// Сім іскор розлітаються від вогника, коли він «розгорівся»
function Sparks({ v, color }) {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {Array.from({ length: SPARKS }, (_, i) => {
        const a = (i / SPARKS) * Math.PI * 2 - Math.PI / 2;
        const d = 78 + (i % 3) * 12;
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              marginLeft: -4,
              marginTop: -4,
              opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] }),
              transform: [
                { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(a) * d] }) },
                { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(a) * d] }) },
                { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
              ],
            }}
          >
            <Svg width={8} height={8}>
              <SvgCircle cx={4} cy={4} r={4} fill={color} />
            </Svg>
          </Animated.View>
        );
      })}
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { alignItems: 'center', paddingTop: 4 },
    stage: { width: 220, height: 200, alignItems: 'center', justifyContent: 'center' },
    glow: { position: 'absolute', width: 190, height: 190, borderRadius: 95, backgroundColor: C.warmSoft },
    stageShort: { height: 158 },
    glowShort: { width: 152, height: 152, borderRadius: 76 },
    pill: {
      marginTop: 8,
      backgroundColor: C.card,
      borderRadius: R.pill,
      paddingHorizontal: 16,
      paddingVertical: 9,
      maxWidth: 330,
    },
    pillText: { color: C.text, ...type(14, F.extra), textAlign: 'center' },
    row: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 26 },
    cell: { flex: 1, alignItems: 'center', minHeight: 60 },
    dot: {
      width: DOT,
      height: DOT,
      borderRadius: DOT / 2,
      backgroundColor: C.card3,
      borderWidth: 2,
      borderColor: C.card3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dotNow: { borderColor: C.text },
    dotGoal: { backgroundColor: 'transparent', borderColor: C.warm, borderStyle: 'dashed' },
    dayNum: { color: C.dim, ...type(12, F.bold, { noLead: true }), marginTop: 6 },
    hint: { color: C.accent, ...type(14, F.bold), marginTop: 6, textAlign: 'center' },
  });
