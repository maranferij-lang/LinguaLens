// Спільні UI-компоненти. Рух — за src/motion.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { DUR, EASE, SPRING, haptic as fireHaptic, stagger, travel, useReducedMotionCached } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// Натискний елемент.
// Правило Apple №1: відгук на press-IN, не на відпускання. Мить, коли з'являється
// затримка, вбиває відчуття прямої дії. Стиснення subtle — 0.97, не менше.
//
// ВАЖЛИВО: анімований саме Pressable, а не вкладений у нього View. Стара версія
// віддавала style внутрішньому View, і той лишався всередині Pressable без
// розмірів — будь-який flex: 1 схлопувався. Саме через це флешкартка
// показувалась порожнім прямокутником.
const APressable = Animated.createAnimatedComponent(Pressable);

// Зона дотику не менша за 44 pt (HIG).
const MIN_TARGET = 44;

const slopOf = (h) =>
  typeof h === 'number'
    ? { top: h, left: h, bottom: h, right: h }
    : { top: h?.top ?? 0, left: h?.left ?? 0, bottom: h?.bottom ?? 0, right: h?.right ?? 0 };

// hitSlop, добитий до min по кожній осі, де елемент (разом зі своїм hitSlop)
// менший. Великий елемент лишає hitSlop, як був.
function reachMin(base, box, min) {
  if (!box || !min) return base;
  const b = slopOf(base);
  const gx = Math.max(0, (min - box.w - b.left - b.right) / 2);
  const gy = Math.max(0, (min - box.h - b.top - b.bottom) / 2);
  if (!gx && !gy) return base;
  return { top: b.top + gy, bottom: b.bottom + gy, left: b.left + gx, right: b.right + gx };
}

// Пропси понад Pressable:
//   feedback — як реагує на дотик:
//     'scale' (типово) — стиснення до scaleTo, для кнопок і карток;
//     'dim' — лише непрозорість до 0.6, для рядків на всю ширину, посилань,
//       чипів і хрестиків: стискати рядок на весь екран некрасиво;
//     'none' — власний відгук у дітей.
//   Під «Зменшити рух» scale замінюється на непрозорість (0.7): рух зникає,
//   відгук лишається. Disabled завжди перемагає (0.45).
//   haptic — 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error'
//     | null: легкий відгук на сам тап (див. haptic у motion.js). Не для
//     кожного рядка списку.
//   minTarget — мінімальна зона дотику, pt (44; 0 вимикає): після лейауту
//     hitSlop сам добирається до неї, видимий розмір не міняється.
// Решта пропсів (accessibilityLabel, accessibilityRole, testID…) іде прямо
// в Pressable: кнопки-іконки без підпису VoiceOver читає як «кнопка».
// busy — дія вже виконується: натиснути не можна, але кнопка не блякне —
// вона не вимкнена, вона працює (див. GradBtn loading).
export function Press({
  children,
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  onLayout,
  disabled,
  busy,
  scaleTo = 0.97,
  feedback = 'scale',
  haptic,
  hitSlop = 6,
  minTarget = MIN_TARGET,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(1)).current;
  const [box, setBox] = useState(null);

  // Режим вирішуємо на рендері, а не в обробниках: стиль і обробники мусять
  // бути з одного боку. Нормальний рух і feedback='scale' — стара поведінка
  // без жодного нового стилю. Слухач «Зменшити рух» дешевий (див. motion.js):
  // кнопка, відрендерена до першої відповіді системи, перемкнеться сама.
  const reduced = useReducedMotionCached();
  const mode = feedback === 'none' ? 'none' : feedback === 'dim' || reduced ? 'dim' : 'scale';
  const dimTo = feedback === 'dim' ? 0.6 : 0.7;

  // Непрозорість, задана викликачем, множимо, а не затираємо
  const own = mode === 'dim' ? StyleSheet.flatten(style)?.opacity : undefined;
  const opacity = useMemo(() => (own == null ? dim : Animated.multiply(dim, own)), [own]);

  const to = (value, toValue, duration, easing) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: true }).start();

  return (
    <APressable
      accessibilityRole="button"
      {...rest}
      onPress={
        haptic
          ? (e) => {
              fireHaptic(haptic);
              onPress?.(e);
            }
          : onPress
      }
      onLongPress={onLongPress}
      disabled={disabled || busy}
      hitSlop={reachMin(hitSlop, box, minTarget)}
      onLayout={(e) => {
        onLayout?.(e);
        if (!minTarget) return;
        const { width, height } = e.nativeEvent.layout;
        const small = width < minTarget || height < minTarget;
        // оновлюємо стан лише коли щось справді змінилось
        setBox((prev) => {
          if (!small) return prev ? null : prev;
          return prev && prev.w === width && prev.h === height ? prev : { w: width, h: height };
        });
      }}
      // вниз — швидко й різко (система почула), вгору — трохи спокійніше
      onPressIn={(e) => {
        if (mode === 'scale') Animated.spring(scale, { toValue: scaleTo, ...SPRING.snappy }).start();
        else if (mode === 'dim') to(dim, dimTo, DUR.press, EASE.out);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (mode === 'scale') Animated.spring(scale, { toValue: 1, ...SPRING.ui }).start();
        else if (mode === 'dim') to(dim, 1, DUR.micro, EASE.soft);
        onPressOut?.(e);
      }}
      style={[
        style,
        mode === 'scale' && { transform: [{ scale }] },
        mode === 'dim' && { opacity },
        disabled && !busy && { opacity: 0.45 },
      ]}
    >
      {children}
    </APressable>
  );
}

// Плаваюча картка: великий радіус, м'яка тінь, без рамок
export function Glass({ children, style, flat, big }) {
  const { C, SHADOW, SHADOW_LG } = useTheme();
  return (
    <View
      style={[
        { backgroundColor: C.card, borderRadius: R.xl, padding: 16 },
        !flat && (big ? SHADOW_LG : SHADOW),
        style,
      ]}
    >
      {children}
    </View>
  );
}

// Кольоровий піл-бейдж: м'який фон + насичений текст
export function Pill({ text, color, soft, style, size = 13 }) {
  return (
    <View
      style={[
        {
          backgroundColor: soft,
          borderRadius: R.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ color, ...type(size, F.bold, { noLead: true }) }}>{text}</Text>
    </View>
  );
}

// Дрібні розрядкові кепси — «СЛОВО ДНЯ», «АКАУНТ». Це текст, тож dim:
// faint лише для декору й на 11 pt не дотягує до 4.5:1.
export function Caps({ children, style }) {
  const { C } = useTheme();
  return <Text style={[{ color: C.dim }, CAPS, style]}>{children}</Text>;
}

// Головна кнопка. loading — дія вже йде (покупка чекає на App Store):
// замість підпису — індикатор у кольорі тексту, кнопка в повному кольорі
// (бліда виглядала б вимкненою, наче нічого не сталося), другий натиск не
// проходить, а VoiceOver чує підпис і «зайнято».
export function GradBtn({ title, onPress, disabled, loading = false, style, small, accessibilityLabel, ...rest }) {
  const { C, SHADOW } = useTheme();
  const size = small ? 15 : 17;
  return (
    <Press
      {...rest}
      onPress={onPress}
      disabled={disabled && !loading}
      busy={loading}
      style={style}
      // без підпису на екрані VoiceOver бере його звідси
      accessibilityLabel={loading ? title : accessibilityLabel}
      accessibilityState={loading ? { disabled: true, busy: true } : undefined}
    >
      <View
        style={[
          {
            backgroundColor: C.accent,
            borderRadius: R.lg,
            paddingVertical: small ? 11 : 16,
            alignItems: 'center',
          },
          SHADOW,
        ]}
      >
        {loading ? (
          // висота — як у рядка тексту (Nunito ≈ 1.36 кегля): кнопка не стрибає
          <ActivityIndicator color={C.onAccent} style={{ height: Math.round(size * 1.36) }} />
        ) : (
          <Text style={{ color: C.onAccent, ...type(size, F.extra, { noLead: true }) }}>{title}</Text>
        )}
      </View>
    </Press>
  );
}

// Другорядна кнопка
export function SecBtn({ title, onPress, style, ...rest }) {
  const { C } = useTheme();
  return (
    <Press {...rest} onPress={onPress} style={style}>
      <View
        style={[
          { backgroundColor: C.card2, borderRadius: R.lg, paddingVertical: 15, alignItems: 'center' },
        ]}
      >
        <Text style={{ color: C.text, ...type(16, F.bold, { noLead: true }) }}>{title}</Text>
      </View>
    </Press>
  );
}

// Поява елемента.
// Без перельоту: елемент просто з'явився, його ніхто не кидав. Зсув маленький —
// 12 px достатньо, щоб око зчитало напрямок. При reduced motion зсуву немає,
// лишається поява за непрозорістю.
//   delay — затримка, мс; index — номер у списку: до затримки додається
//     stagger(index) (55 мс на крок, не більше шести кроків);
//   dy / distance — зсув знизу вгору, px (distance — те саме, що dy);
//   dx — зсув по горизонталі (кроки онбордингу: уперед новий вміст заїжджає
//     справа, назад — зліва); тоді вертикального немає.
export function FadeIn({ children, style, delay = 0, index = 0, dy = 12, distance, dx = 0, testID }) {
  const a = useRef(new Animated.Value(0)).current;
  const shiftX = travel(dx);
  const shift = shiftX ? 0 : travel(distance ?? dy);

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: DUR.panel,
      easing: EASE.out,
      delay: delay + stagger(index),
      useNativeDriver: true,
    }).start();
    return () => a.stopAnimation();
  }, []);

  const transform = shiftX
    ? [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [shiftX, 0] }) }]
    : shift
      ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }]
      : [];
  return (
    <Animated.View style={[style, { opacity: a, transform }]} testID={testID}>
      {children}
    </Animated.View>
  );
}

// Заглушка на час завантаження: блок кольору card3 із тихою пульсацією
// непрозорості (1 до 0.55 і назад, по 800 мс, симетричний цикл — inOut тут
// на місці). Під «Зменшити рух» стоїть без руху. Для VoiceOver її нема:
// «завантажується» каже контейнер навколо (accessibilityLabel + busy).
//   width / height / radius — розмір блока; color — інший токен теми.
export function Skeleton({ width = '100%', height = 14, radius = R.sm, color, style, testID }) {
  const { C } = useTheme();
  const reduced = useReducedMotionCached();
  const a = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      a.setValue(1);
      return;
    }
    const pulse = (toValue) =>
      Animated.timing(a, { toValue, duration: 800, easing: EASE.inOut, useNativeDriver: true, isInteraction: false });
    const loop = Animated.loop(Animated.sequence([pulse(0.55), pulse(1)]));
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  return (
    <Animated.View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: color ?? C.card3, opacity: a }, style]}
    />
  );
}

// Смужка прогресу. Масштабуємо по X, а не міняємо width: transform іде
// на GPU, width щоразу перераховує лейаут.
// Для VoiceOver це progressbar із відсотком; accessibilityLabel — що саме
// заповнюється («Рівень»). Якщо поруч уже написано число («3 / 10»), смужку
// ховаємо від VoiceOver: decorative.
export function Bar({ progress, color, bg, height = 8, radius, duration = DUR.sheet, accessibilityLabel, decorative = false, testID }) {
  const { C } = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  const value = Math.max(0, Math.min(1, progress || 0));
  useEffect(() => {
    Animated.timing(a, {
      toValue: value,
      duration,
      easing: EASE.out,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const r = radius ?? height / 2;
  const pct = Math.round(value * 100);
  // text потрібен iOS: з самим now VoiceOver прочитав би «40» без відсотка
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
    : {
        accessible: true,
        accessibilityRole: 'progressbar',
        accessibilityLabel,
        accessibilityValue: { min: 0, max: 100, now: pct, text: `${pct}%` },
      };
  return (
    <View {...a11y} testID={testID} style={{ height, backgroundColor: bg ?? C.card2, borderRadius: r, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: r,
          backgroundColor: color ?? C.accent,
          width: '100%',
          transform: [{ scaleX: a }],
          // масштабуємо від лівого краю, а не від центру
          transformOrigin: 'left',
        }}
      />
    </View>
  );
}
