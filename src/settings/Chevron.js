// Шеврон розгортання: повертається разом із блоком, який відкриває, а не
// перекидається на півкроку раніше за нього. DUR.panel на розкриття, DUR.exit
// на згортання (вихід швидший за вхід), EASE.out, нативний драйвер. «Зменшити
// рух»: без повороту, шеврон одразу в новому положенні.
import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';
import { IcChevron } from '../icons';
import { DUR, EASE, isReducedMotion } from '../motion';

// from / to — кути у закритому й відкритому стані (типово 0 → 180: вниз → вгору)
export default function TurnChevron({ open, color, size, from = '0deg', to = '180deg' }) {
  const v = useRef(new Animated.Value(open ? 1 : 0)).current;
  const mounted = useRef(false);

  useEffect(() => {
    // перший рендер: уже в потрібному положенні, анімувати нічого
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (isReducedMotion()) {
      v.setValue(open ? 1 : 0);
      return;
    }
    const anim = Animated.timing(v, {
      toValue: open ? 1 : 0,
      duration: open ? DUR.panel : DUR.exit,
      easing: EASE.out,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, [open]);

  const rotate = v.interpolate({ inputRange: [0, 1], outputRange: [from, to] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }}>
      <IcChevron color={color} size={size} />
    </Animated.View>
  );
}
