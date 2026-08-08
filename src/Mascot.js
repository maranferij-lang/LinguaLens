// Маскот Lingo — 4 пози на прозорому фоні. Використовується по всіх екранах.
import { useEffect, useRef } from 'react';
import { Animated, Image } from 'react-native';
import { EASE, useReducedMotion } from './motion';

const POSES = {
  wave: require('../assets/lingo-wave.png'),
  celebrate: require('../assets/lingo-celebrate.png'),
  think: require('../assets/lingo-think.png'),
  encourage: require('../assets/lingo-encourage.png'),
};

// Статичний Lingo
export function Mascot({ pose = 'wave', size = 120, style }) {
  return (
    <Image
      source={POSES[pose] || POSES.wave}
      style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
    />
  );
}

// Lingo з легким «диханням» (плавний вертикальний покач) — для порожніх станів і фіналів
export function MascotBob({ pose = 'wave', size = 140, style }) {
  const y = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      y.setValue(0); // «менше руху» — Lingo просто стоїть
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(y, { toValue: -1, duration: 1400, easing: EASE.inOut, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: 1400, easing: EASE.inOut, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  const translateY = y.interpolate({ inputRange: [-1, 0], outputRange: [-8, 0] });
  return (
    <Animated.Image
      source={POSES[pose] || POSES.wave}
      style={[
        { width: size, height: size, resizeMode: 'contain', transform: [{ translateY }] },
        style,
      ]}
    />
  );
}
