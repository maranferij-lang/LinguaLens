// Слайдер рівня 1–10 з мітками CEFR.
//
// Свій, без бібліотеки: нам потрібен дискретний повзунок з десятьма
// зупинками, великим числом і підписом, що змінюється просто під пальцем, —
// стандартний Slider цього не вміє, а тягнути залежність заради одного екрана
// не варто.
//
// Як поводиться:
//   • тягнеш — бігунок іде за пальцем, а число й підпис перемикаються на
//     кожній зупинці з легким тактильним «клацом»;
//   • відпускаєш — бігунок доїжджає до найближчої зупинки (без перельоту);
//   • тап по доріжці — одразу туди;
//   • VoiceOver: елемент «регульований», свайп угору/вниз — ±1, значення
//     читається як «8 з 10, B2+»; на вебі — стрілки, Home і End;
//   • «Менше руху» — бігунок переставляється без анімації.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { CEFR_MARKS, LEVEL_MAX, LEVEL_MIN, cefrFor, clampLevel } from './profile';
import { SPRING, useReducedMotion } from './motion';
import { F, R, type, useTheme } from './theme';

const THUMB = 30;
const TRACK = 8;
const STOPS = LEVEL_MAX - LEVEL_MIN; // 9 проміжків між 10 зупинками

// Позиція центру бігунка (від лівого краю доріжки) для значення.
export function offsetFor(level, width) {
  return ((clampLevel(level) - LEVEL_MIN) / STOPS) * width;
}

// Найближча зупинка для точки на доріжці.
export function levelAt(x, width) {
  if (!(width > 0)) return LEVEL_MIN;
  const k = Math.max(0, Math.min(1, x / width));
  return LEVEL_MIN + Math.round(k * STOPS);
}

// desc={false} — без фрази рівня під числом: її показує власник (онбординг
// пише під доріжкою назву рівня й цю фразу).
export default function LevelSlider({ value, onChange, label, t, style, desc = true }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();
  const level = clampLevel(value);

  // Ширина доріжки, по якій ходить центр бігунка (уся ширина мінус бігунок).
  const [width, setWidth] = useState(0);
  const x = useRef(new Animated.Value(0)).current;

  // PanResponder створюється один раз, тож свіже — через ref.
  const live = useRef({});
  live.current.level = level;
  live.current.width = width;
  live.current.onChange = onChange;
  live.current.reduced = reduced;

  function moveTo(px, animate) {
    if (animate && !live.current.reduced) Animated.spring(x, { toValue: px, ...SPRING.snappy }).start();
    else x.setValue(px);
  }

  // Значення змінилось ззовні (тап, VoiceOver, клавіатура) або щойно
  // відома ширина — ставимо бігунок на зупинку. Під час перетягування — ні:
  // там бігунок веде палець.
  useEffect(() => {
    if (!width || live.current.dragging) return;
    moveTo(offsetFor(level, width), live.current.placed);
    live.current.placed = true;
  }, [level, width]);

  // Нове значення — з тактильним клацом. Повертає, чи справді змінилось.
  function pick(next) {
    const v = clampLevel(next);
    if (v === live.current.level) return false;
    live.current.level = v;
    Haptics.selectionAsync();
    live.current.onChange?.(v);
    return true;
  }

  function follow(px) {
    const w = live.current.width;
    if (!w) return;
    const clamped = Math.max(0, Math.min(w, px));
    x.setValue(clamped);
    pick(levelAt(clamped, w));
  }

  function release(px) {
    const w = live.current.width;
    live.current.dragging = false;
    if (!w) return;
    const v = levelAt(px, w);
    pick(v);
    moveTo(offsetFor(v, w), true);
  }

  // Шар для дотиків лежить поверх усього й не має дітей, тож locationX
  // завжди відраховується від його лівого краю, а не від бігунка.
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      // свайп по повзунку не віддаємо скролу екрана
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: (e) => {
        live.current.dragging = true;
        live.current.start = e.nativeEvent.locationX - THUMB / 2;
        follow(live.current.start);
      },
      onPanResponderMove: (_, g) => follow(live.current.start + g.dx),
      onPanResponderRelease: (_, g) => release(live.current.start + g.dx),
      onPanResponderTerminate: (_, g) => release(live.current.start + g.dx),
    })
  ).current;

  // ±1 від VoiceOver чи клавіатури — від останнього обраного значення, а не
  // від того, що в пропсах: два швидкі натиски до перерендеру дають +2.
  // Бігунок переставить ефект вище, щойно екран-власник поверне значення.
  function step(delta) {
    pick(live.current.level + delta);
  }

  function onAction(e) {
    if (e.nativeEvent.actionName === 'increment') step(1);
    if (e.nativeEvent.actionName === 'decrement') step(-1);
  }

  // Клавіатура (веб, iPad з клавіатурою): стрілки ±1, Home/End — краї.
  function onKeyDown(e) {
    const key = e?.nativeEvent?.key || e?.key;
    const map = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };
    if (map[key]) step(map[key]);
    else if (key === 'Home') pick(LEVEL_MIN);
    else if (key === 'End') pick(LEVEL_MAX);
    else return;
    e?.preventDefault?.();
  }

  const cefr = cefrFor(level);
  const fill = width
    ? x.interpolate({ inputRange: [0, width], outputRange: [-width, 0], extrapolate: 'clamp' })
    : -1000;

  return (
    <View style={style}>
      {/* Велике число, рівень CEFR і що це означає — оновлюються наживо */}
      <View style={[s.head, !desc && s.headBare]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <View style={s.numRow}>
          <Text style={s.num}>{level}</Text>
          <Text style={s.of}>/10</Text>
          <View style={s.badge}>
            <Text style={s.badgeText}>{cefr}</Text>
          </View>
        </View>
        {desc ? (
          <Text style={s.desc} numberOfLines={2}>
            {t('lvl' + level)}
          </Text>
        ) : null}
      </View>

      <View
        style={s.slider}
        accessible
        focusable
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityHint={t('lvl' + level)}
        accessibilityValue={{ min: LEVEL_MIN, max: LEVEL_MAX, now: level, text: t('levelA11y', { n: level, c: cefr }) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onKeyDown={onKeyDown}
        onLayout={(e) => setWidth(Math.max(0, e.nativeEvent.layout.width - THUMB))}
      >
        <View style={s.track} pointerEvents="none">
          <Animated.View style={[s.fill, { width: width || 0, transform: [{ translateX: fill }] }]} />
        </View>
        {/* Зупинки: крапки на доріжці, пройдені — світлі на акценті */}
        {width
          ? Array.from({ length: STOPS + 1 }, (_, i) => {
              const v = LEVEL_MIN + i;
              return (
                <View
                  key={v}
                  pointerEvents="none"
                  style={[s.tick, { left: THUMB / 2 + offsetFor(v, width) - 2 }, v <= level && s.tickOn]}
                />
              );
            })
          : null}
        <Animated.View pointerEvents="none" style={[s.thumb, SHADOW_SM, { transform: [{ translateX: x }] }]}>
          <View style={s.thumbDot} />
        </Animated.View>
        <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />
      </View>

      {/* Мітки CEFR під доріжкою: видно, де починається кожен рівень */}
      <View style={s.marks} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        {width
          ? CEFR_MARKS.map((m) => {
              const on = cefr.startsWith(m.label);
              return (
                <Text
                  key={m.label}
                  style={[s.mark, { left: THUMB / 2 + offsetFor(m.level, width) - MARK_W / 2 }, on && s.markOn]}
                  numberOfLines={1}
                >
                  {m.label}
                </Text>
              );
            })
          : null}
      </View>
    </View>
  );
}

const MARK_W = 30;

const makeStyles = (C) =>
  StyleSheet.create({
    head: { alignItems: 'center', minHeight: 132 },
    headBare: { minHeight: 0 },
    numRow: { flexDirection: 'row', alignItems: 'center' },
    // табличні цифри — число не стрибає по ширині між 9 і 10
    num: { color: C.text, ...type(64, F.extra, { noLead: true }), fontVariant: ['tabular-nums'] },
    of: { color: C.faint, ...type(22, F.bold, { noLead: true }), marginLeft: 2, marginTop: 18 },
    badge: {
      marginLeft: 12,
      marginTop: 6,
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 11,
      paddingVertical: 5,
      minWidth: 48,
      alignItems: 'center',
    },
    badgeText: { color: C.accent, ...type(15, F.extra, { noLead: true }), letterSpacing: 0.4 },
    desc: { color: C.text, ...type(17, F.semi), textAlign: 'center', marginTop: 6, minHeight: 46 },

    // Висота шару — 48: ціль для пальця більша за саму доріжку.
    slider: { height: 48, justifyContent: 'center', marginTop: 14 },
    track: {
      marginHorizontal: THUMB / 2,
      height: TRACK,
      borderRadius: TRACK / 2,
      backgroundColor: C.card3,
      overflow: 'hidden',
    },
    fill: { height: TRACK, borderRadius: TRACK / 2, backgroundColor: C.accent },
    tick: {
      position: 'absolute',
      top: 24 - 2,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor: C.faint,
      opacity: 0.55,
    },
    tickOn: { backgroundColor: C.onAccent, opacity: 0.85 },
    thumb: {
      position: 'absolute',
      left: 0,
      top: 24 - THUMB / 2,
      width: THUMB,
      height: THUMB,
      borderRadius: THUMB / 2,
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    thumbDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

    marks: { height: 20, marginTop: 4 },
    mark: {
      position: 'absolute',
      width: MARK_W,
      textAlign: 'center',
      // A1…C2 несуть зміст, тож dim (≥ 4,5:1), а не faint
      color: C.dim,
      ...type(12, F.bold, { noLead: true }),
    },
    markOn: { color: C.accent },
  });
