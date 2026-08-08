// Спільні UI-компоненти. Рух — за src/motion.js.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { DUR, EASE, SPRING, travel } from './motion';
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

export function Press({ children, style, onPress, onLongPress, disabled, scaleTo = 0.97, hitSlop = 6 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to, cfg) => Animated.spring(scale, { toValue: to, ...cfg }).start();

  return (
    <APressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      // вниз — швидко й різко (система почула), вгору — трохи спокійніше
      onPressIn={() => press(scaleTo, SPRING.snappy)}
      onPressOut={() => press(1, SPRING.ui)}
      style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}
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

// Дрібні розрядкові кепси — «СЛОВО ДНЯ», «АКАУНТ»
export function Caps({ children, style }) {
  const { C } = useTheme();
  return <Text style={[{ color: C.faint }, CAPS, style]}>{children}</Text>;
}

// Головна кнопка
export function GradBtn({ title, onPress, disabled, style, small }) {
  const { C, SHADOW } = useTheme();
  return (
    <Press onPress={onPress} disabled={disabled} style={style}>
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
        <Text style={{ color: C.onAccent, ...type(small ? 15 : 17, F.extra, { noLead: true }) }}>
          {title}
        </Text>
      </View>
    </Press>
  );
}

// Другорядна кнопка
export function SecBtn({ title, onPress, style }) {
  const { C } = useTheme();
  return (
    <Press onPress={onPress} style={style}>
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
// 12 px достатньо, щоб око зчитало напрямок. При reduced motion зсуву немає.
export function FadeIn({ children, style, delay = 0, dy = 12 }) {
  const a = useRef(new Animated.Value(0)).current;
  const shift = travel(dy);

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: DUR.panel,
      easing: EASE.out,
      delay,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View
      style={[
        style,
        {
          opacity: a,
          transform: shift
            ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }]
            : [],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

// Смужка прогресу. Масштабуємо по X, а не міняємо width: transform іде
// на GPU, width щоразу перераховує лейаут.
export function Bar({ progress, color, bg, height = 8, radius, duration = DUR.sheet }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: Math.max(0, Math.min(1, progress || 0)),
      duration,
      easing: EASE.out,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const r = radius ?? height / 2;
  return (
    <View style={{ height, backgroundColor: bg, borderRadius: r, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: r,
          backgroundColor: color,
          width: '100%',
          transform: [{ scaleX: a }],
          // масштабуємо від лівого краю, а не від центру
          transformOrigin: 'left',
        }}
      />
    </View>
  );
}
