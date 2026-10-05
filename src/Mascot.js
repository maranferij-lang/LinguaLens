// Маскот Lingo — 4 пози на прозорому фоні. Використовується по всіх екранах.
import { useEffect, useRef } from 'react';
import { Animated, Image, View } from 'react-native';
import { EASE, spring, useReducedMotion } from './motion';

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

// ─── Живий Lingo (онбординг 4.0) ───────────────────────────────────────────
// Один компонент на всі «живі» місця онбордингу:
//   enter — як зʼявляється: 'hop' — підскоком знизу (вітання, «Що таке слово
//     дня»), 'peek' — визирає з-за кнопки (крок імені), null — уже стоїть
//     (поява — разом із кроком);
//   waves — скільки разів махнути після появи: похитування навколо нижньої
//     точки, наче махає лапкою (поза wave);
//   hop — будь-яка зміна значення дає короткий підскок: людина щось обрала.
//     Підскок, що вже йде, не перезапускається — тягнуть повзунок рівня, а
//     Lingo не тремтить;
//   breathe — після всього спокійно «дихає», як MascotBob.
// Підскок і помах — характер, а не інтерфейс: тут переліт доречний (його
// «кинули»), тож пружина мʼяка. «Менше руху» — просто стоїть у своїй позі.
// Lingo — декор: VoiceOver його не бачить (усе сказано текстом поруч).
const HOP_UP = { duration: 130, easing: EASE.out, useNativeDriver: true };
const HOP_DOWN = spring(0.32, 0.55);
const WAVE_STEP = 210;

export function MascotLive({ pose = 'wave', size = 120, enter = null, waves = 0, hop, breathe = true, style, testID }) {
  const reduced = useReducedMotion();
  const appear = useRef(new Animated.Value(enter && !reduced ? 0 : 1)).current;
  const wave = useRef(new Animated.Value(0)).current;
  const jump = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;
  const running = useRef([]);
  const hopping = useRef(false);

  useEffect(() => {
    const stopAll = () => {
      running.current.forEach((a) => a.stop());
      running.current = [];
    };
    if (reduced) {
      stopAll();
      appear.setValue(1);
      wave.setValue(0);
      jump.setValue(0);
      bob.setValue(0);
      return undefined;
    }
    let alive = true;
    const intro = [];
    if (enter) {
      intro.push(
        enter === 'peek'
          ? Animated.spring(appear, { toValue: 1, ...spring(0.5, 0.72) })
          : Animated.sequence([
              Animated.timing(appear, { toValue: 0.7, duration: 220, easing: EASE.out, useNativeDriver: true }),
              Animated.spring(appear, { toValue: 1, ...spring(0.38, 0.5) }),
            ])
      );
    }
    for (let i = 0; i < waves; i++) {
      intro.push(
        Animated.timing(wave, { toValue: 1, duration: WAVE_STEP, easing: EASE.inOut, useNativeDriver: true }),
        Animated.timing(wave, { toValue: -0.7, duration: WAVE_STEP * 1.6, easing: EASE.inOut, useNativeDriver: true })
      );
    }
    if (waves) intro.push(Animated.timing(wave, { toValue: 0, duration: WAVE_STEP, easing: EASE.inOut, useNativeDriver: true }));
    const startBreath = () => {
      if (!alive || !breathe) return;
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(bob, { toValue: 1, duration: 1400, easing: EASE.inOut, useNativeDriver: true }),
          Animated.timing(bob, { toValue: 0, duration: 1400, easing: EASE.inOut, useNativeDriver: true }),
        ])
      );
      running.current.push(loop);
      loop.start();
    };
    if (intro.length) {
      const seq = Animated.sequence(intro);
      running.current.push(seq);
      seq.start(({ finished }) => finished && startBreath());
    } else startBreath();
    return () => {
      alive = false;
      stopAll();
    };
  }, [reduced]);

  // Підскок на кожну зміну hop (перший рендер — ні)
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced || hopping.current) return;
    hopping.current = true;
    const a = Animated.sequence([
      Animated.timing(jump, { toValue: 1, ...HOP_UP }),
      Animated.spring(jump, { toValue: 0, ...HOP_DOWN }),
    ]);
    a.start(() => {
      hopping.current = false;
    });
  }, [hop]);

  const k = size / 100;
  const from = enter === 'peek' ? size * 0.9 : 26 * k;
  const translateY = Animated.add(
    Animated.add(
      appear.interpolate({ inputRange: [0, 0.7, 1], outputRange: [from, enter === 'peek' ? from * 0.3 : -14 * k, 0] }),
      jump.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(8, 14 * k)] })
    ),
    bob.interpolate({ inputRange: [0, 1], outputRange: [0, -Math.max(3, 6 * k)] })
  );
  const rotate = wave.interpolate({ inputRange: [-1, 1], outputRange: ['-9deg', '9deg'] });
  const opacity = enter === 'peek' ? 1 : appear.interpolate({ inputRange: [0, 0.4, 1], outputRange: [0, 1, 1] });
  return (
    <View
      style={[{ width: size, height: size }, style]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      <Animated.Image
        source={POSES[pose] || POSES.wave}
        style={{
          width: size,
          height: size,
          resizeMode: 'contain',
          opacity,
          // махає «від низу», як справжній помах лапкою
          transformOrigin: '50% 100%',
          transform: [{ translateY }, { rotate }],
        }}
      />
    </View>
  );
}
