// Shared UI components. Motion follows src/motion.js.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { DUR, EASE, SPRING, travel } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// A pressable element.
// Apple rule no. 1: respond to press-IN, not to the release. The moment a
// delay appears, it kills the feeling of direct action. The squeeze is subtle: 0.97, no less.
//
// IMPORTANT: it is the Pressable itself that is animated, not a View nested in it. The old version
// gave the style to the inner View, and it stayed inside the Pressable with no
// size, so any flex: 1 collapsed. This is exactly why the flashcard
// showed up as an empty rectangle.
const APressable = Animated.createAnimatedComponent(Pressable);

export function Press({ children, style, onPress, onLongPress, disabled, scaleTo = 0.97, hitSlop = 6 }) {
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to, cfg) => Animated.spring(scale, { toValue: to, ...cfg }).start();

  // Press in is fast and sharp (the system heard), press out is a bit calmer.
  return (
    <APressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => press(scaleTo, SPRING.snappy)}
      onPressOut={() => press(1, SPRING.ui)}
      style={[style, { transform: [{ scale }] }, disabled && { opacity: 0.45 }]}
    >
      {children}
    </APressable>
  );
}

// A floating card: a large radius, a soft shadow, no borders
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

// A colored pill badge: a soft background + saturated text
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

// Small letter-spaced caps: "WORD OF THE DAY", "ACCOUNT"
export function Caps({ children, style }) {
  const { C } = useTheme();
  return <Text style={[{ color: C.faint }, CAPS, style]}>{children}</Text>;
}

// The primary button
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

// The secondary button
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

// Element appearance.
// No overshoot: the element simply appeared, nobody threw it. The shift is small:
// 12 px is enough for the eye to read the direction. With reduced motion there is no shift.
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

// A progress strip. We scale along X instead of changing width: the transform goes
// to the GPU, while width recalculates the layout every time.
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
          // scale from the left edge, not from the center
          transformOrigin: 'left',
        }}
      />
    </View>
  );
}
