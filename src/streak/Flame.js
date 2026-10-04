// Вогник серії — одна параметрична SVG-форма на будь-яке число днів
// (core.md C.2, макет core-streak-flames.png; геометрія один-в-один із
// flame_svg макетів). Форму вибирає flameForm(n) зі src/streak.js: з 1-го по
// 6-й день крапля щодня трохи вища й ширша, з 3-го — бічні язики; на 7-й
// вогник «розгоряється» (градієнт, сяйво, іскри); 14, 30 і 100 — віхи.
//
// <Flame n={5} size={72} pending breathe />
//   size — ширина в pt (висота — size × 1,2, як у viewBox 100×120);
//   pending — сьогодні ще ні: та сама форма, непрозорість 45 %;
//   breathe — «дихає» (scaleY 1 ↔ 1,035 і ледь гойдається за 1,8 с, native
//   driver); з «Менше руху» вогник статичний.
// Сяйво й корона виходять за межі size (як на макеті) — під вогник
// не треба класти overflow: 'hidden'.
//
// Кольори: тіло жевріючого вогника й жаринка — з теми (warm, faint), решта —
// фіксований малюнок полум'я, як арт маскота: однаковий у всіх палітрах.
import { useEffect, useId, useMemo, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';
import { flameForm } from '../streak';
import { useReducedMotion } from '../motion';
import { useTheme } from '../theme';

const BASE = 112; // низ краплі у viewBox 100×120
const CX = 50;
// Запас довкола viewBox для сяйва (r до 74 довкола 50,72) і корони
// (вища за краплю): x −25…125, y −8…148.
const VB = { x: -25, y: -8, w: 150, h: 156 };
const ORIGIN = `50% ${Math.round(((BASE - VB.y) / VB.h) * 1000) / 10}%`;

const ART = {
  body: ['#FFD15C', '#F59A2C', '#E9772B'],
  heart: ['#FFF8DE', '#FFD877'],
  legend: ['#C9C1FF', '#7B6CF0'],
  glow: '#FFB547',
  ring: '#FFC24D',
  spark: '#FFC94D',
  crownBack: '#FFC94D',
  crownFront: '#FFB547',
  heartKindle: { light: '#FFE7AE', dark: '#FFE0A0' },
  tongueKindle: { light: '#EFAE43', dark: '#F3C16A' },
};

// Іскри-ромбики: x, y, півширина
const SPARKS = [
  [22, 30, 2.6],
  [80, 24, 2.2],
  [14, 58, 1.8],
  [88, 52, 2.0],
];

const f1 = (v) => (Math.round(v * 10) / 10).toString();

// Крапля з кінчиком, що може хилитися (lean): основа в (cx, base), висота H,
// півширина a.
export function tearPath(cx, base, H, a, lean = 0) {
  const ty = base - H;
  const tx = cx + lean;
  return (
    `M${f1(tx)},${f1(ty)} ` +
    `C${f1(tx + a * 0.18)},${f1(ty + H * 0.26)} ${f1(cx + a)},${f1(ty + H * 0.44)} ${f1(cx + a)},${f1(ty + H * 0.68)} ` +
    `C${f1(cx + a)},${f1(ty + H * 0.89)} ${f1(cx + a * 0.56)},${f1(base)} ${f1(cx)},${f1(base)} ` +
    `C${f1(cx - a * 0.56)},${f1(base)} ${f1(cx - a)},${f1(ty + H * 0.89)} ${f1(cx - a)},${f1(ty + H * 0.68)} ` +
    `C${f1(cx - a)},${f1(ty + H * 0.44)} ${f1(tx - a * 0.18)},${f1(ty + H * 0.26)} ${f1(tx)},${f1(ty)}Z`
  );
}

function Shape({ n, form, dark, C, id }) {
  const H = form.h;
  const a = form.w / 2;

  if (form.stage === 'ember') {
    return (
      <>
        <Path
          testID="flame-ember"
          d={tearPath(CX, BASE, H, a, 2)}
          fill="none"
          stroke={C.faint}
          strokeWidth={4}
          strokeDasharray="7 6"
          strokeLinecap="round"
        />
        <Circle cx={50} cy={100} r={5} fill={C.faint} opacity={0.7} />
      </>
    );
  }

  const lit = form.stage === 'lit';
  const mode = dark ? 'dark' : 'light';
  const body = lit ? `url(#${id}b)` : C.warm;
  const heart = lit ? `url(#${id}${form.tier === 4 ? 'v' : 'c'})` : ART.heartKindle[mode];
  const tongue = lit ? `url(#${id}b)` : ART.tongueKindle[mode];
  const op = lit ? 1 : 0.92;
  const lean = n % 2 ? 3 : -2;
  const tg = form.tongues;
  const parts = [];

  if (lit) {
    parts.push(<Circle key="glow" testID="flame-glow" cx={50} cy={72} r={50 + 6 * form.tier} fill={`url(#${id}g)`} />);
    if (form.tier >= 2) {
      parts.push(
        <Circle
          key="ring"
          testID="flame-ring"
          cx={50}
          cy={70}
          r={44 + 3 * form.tier}
          fill="none"
          stroke={ART.ring}
          strokeOpacity={0.35}
          strokeWidth={2}
          strokeDasharray="2 7"
          strokeLinecap="round"
        />
      );
    }
  }
  // Бічні язики — позаду тіла
  const side = [
    [1, -24, -0.55, 0.56, 0.42, -2, 6, 4, 1],
    [2, 24, 0.55, 0.5, 0.4, 2, 6, 4, 1],
    [4, -40, -0.8, 0.4, 0.32, -2, 4, 2, 0.9],
    [4, 40, 0.8, 0.38, 0.3, 2, 4, 2, 0.9],
  ];
  side.forEach(([need, deg, dx, hk, ak, ln, rot, lift, ok], i) => {
    if (tg < need) return;
    const x = CX + a * dx;
    parts.push(
      <Path
        key={'tongue' + i}
        testID="flame-tongue"
        transform={`rotate(${deg} ${f1(x)} ${BASE - rot})`}
        d={tearPath(x, BASE - lift, H * hk, a * ak, ln)}
        fill={tongue}
        opacity={op * ok}
      />
    );
  });
  // «Корона» з 30-го дня: два вищі кінчики позаду основного полум'я
  if (lit && form.tier >= 3) {
    parts.push(<Path key="crown1" testID="flame-crown" d={tearPath(CX - 7, BASE - 2, H * 1.1, a * 0.7, -9)} fill={ART.crownBack} opacity={0.95} />);
    parts.push(<Path key="crown2" testID="flame-crown" d={tearPath(CX + 8, BASE - 2, H, a * 0.62, 8)} fill={ART.crownFront} opacity={0.9} />);
  }
  parts.push(<Path key="body" testID="flame-body" d={tearPath(CX, BASE, H, a, lean)} fill={body} opacity={op} />);
  parts.push(
    <Path
      key="heart"
      testID="flame-heart"
      d={tearPath(CX, BASE - 3, H * (lit ? 0.5 : 0.42), a * 0.5, -1)}
      fill={heart}
      opacity={Math.min(1, op + 0.05)}
    />
  );
  if (lit) {
    SPARKS.slice(0, 2 + form.tier).forEach(([x, y, r], i) => {
      parts.push(
        <Path
          key={'spark' + i}
          testID="flame-spark"
          d={`M${x},${f1(y - r * 2)} L${f1(x + r * 0.7)},${y} L${x},${f1(y + r * 2)} L${f1(x - r * 0.7)},${y}Z`}
          fill={ART.spark}
        />
      );
    });
  }
  return parts;
}

export default function Flame({ n = 0, size = 72, pending = false, breathe = true, style, testID = 'flame' }) {
  const { C, isDark } = useTheme();
  const form = flameForm(n);
  const reduced = useReducedMotion();
  // id градієнтів — свій у кожного вогника: на одному екрані їх буває кілька
  const id = 'fl' + useId().replace(/[^A-Za-z0-9]/g, '');
  const live = breathe && !reduced && form.stage !== 'ember';
  const v = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!live) {
      v.setValue(0);
      return undefined;
    }
    const half = { duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([Animated.timing(v, { toValue: 1, ...half }), Animated.timing(v, { toValue: 0, ...half })])
    );
    loop.start();
    return () => {
      loop.stop();
      v.setValue(0);
    };
  }, [live]);

  const motion = useMemo(
    () =>
      live
        ? {
            // «дихає» від основи краплі, а не від краю запасу під сяйво
            transformOrigin: ORIGIN,
            transform: [
              { scaleY: v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] }) },
              { skewX: v.interpolate({ inputRange: [0, 1], outputRange: ['-1.5deg', '1.5deg'] }) },
            ],
          }
        : null,
    [live]
  );

  const h = Math.round(size * 1.2);
  const k = size / 100;
  return (
    <View
      testID={testID}
      style={[{ width: size, height: h }, style]}
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View
        testID={testID + '-motion'}
        style={[{ position: 'absolute', left: VB.x * k, top: VB.y * k, width: VB.w * k, height: VB.h * k, opacity: pending ? 0.45 : 1 }, motion]}
      >
        <Svg width={VB.w * k} height={VB.h * k} viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}>
          <Defs>
            <LinearGradient id={id + 'b'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ART.body[0]} />
              <Stop offset="0.55" stopColor={ART.body[1]} />
              <Stop offset="1" stopColor={ART.body[2]} />
            </LinearGradient>
            <LinearGradient id={id + 'c'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ART.heart[0]} />
              <Stop offset="1" stopColor={ART.heart[1]} />
            </LinearGradient>
            <LinearGradient id={id + 'v'} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={ART.legend[0]} />
              <Stop offset="1" stopColor={ART.legend[1]} />
            </LinearGradient>
            <RadialGradient id={id + 'g'} cx="0.5" cy="0.62" r="0.5">
              <Stop offset="0" stopColor={ART.glow} stopOpacity={isDark ? 0.55 : 0.42} />
              <Stop offset="1" stopColor={ART.glow} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Shape n={Math.floor(Number(n) || 0)} form={form} dark={isDark} C={C} id={id} />
        </Svg>
      </Animated.View>
    </View>
  );
}
