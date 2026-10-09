// The Lingo mascot: 4 poses on a transparent background. Used on all screens.
import { useEffect, useRef } from 'react';
import { Animated, Image } from 'react-native';
import { EASE, useReducedMotion } from './motion';

const POSES = {
  wave: require('../assets/lingo-wave.png'),
  celebrate: require('../assets/lingo-celebrate.png'),
  think: require('../assets/lingo-think.png'),
  encourage: require('../assets/lingo-encourage.png'),
};

// Static Lingo
export function Mascot({ pose = 'wave', size = 120, style }) {
  return (
    <Image
      source={POSES[pose] || POSES.wave}
      style={[{ width: size, height: size, resizeMode: 'contain' }, style]}
    />
  );
}

// Lingo with light "breathing" (a smooth vertical bob), for empty states and finales
export function MascotBob({ pose = 'wave', size = 140, style }) {
  const y = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) {
      y.setValue(0); // "reduce motion": Lingo just stands
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
