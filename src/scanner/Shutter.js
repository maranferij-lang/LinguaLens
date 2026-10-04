// Затвор = лінза з іконки застосунку (core.md A3, A11): біле кільце 80 pt,
// у ньому диск 62 pt із синьо-фіолетовим градієнтом іконки (#5380FF →
// #5F58E2) і білий гліф лінзи — кільце з крапкою-спалахом, як у LogoMark.
// Головна кнопка застосунку має бути впізнавано «нашою», а не білим колом
// Камери iOS.
//
// Стани:
//   lens — предмет;  room — сцена (гліф кімнати);
//   busy — модель думає: біла дуга обертається (900 мс), натиснути не можна;
//   pro  — сканів більше немає: кремовий диск і фіолетова корона. Тап іде тим
//          самим шляхом (guardScan відкриває пейвол scans) — корона заздалегідь
//          чесно каже, що буде.
// Натиск — диск стискається до 0,9. «Менше руху»: без стискання й
// обертання, на зайнятому затворі — статичні «…».
import { useEffect, useRef } from 'react';
import { Animated, Pressable, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { IcRoom } from '../icons';
import { PCrown } from '../ProIcons';
import { EASE, SPRING } from '../motion';
import { CAM } from './CamGlass';
import { SHUTTER } from './layout';

const DISC = 62;
const APressable = Animated.createAnimatedComponent(Pressable);

// Лінза з LogoMark: кільце й крапка-спалах на ньому
function Lens({ size = 30 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30">
      <Circle cx={15} cy={15} r={9.6} stroke="#FFFFFF" strokeWidth={3.6} fill="none" />
      <Circle cx={21.8} cy={8.4} r={2.7} fill="#FFFFFF" />
    </Svg>
  );
}

function Spinner({ reduced }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const loop = Animated.loop(Animated.timing(a, { toValue: 1, duration: 900, easing: EASE.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  if (reduced) {
    return (
      <Svg width={30} height={30} viewBox="0 0 30 30" testID="shutter-dots">
        <Path d="M8 15h.01M15 15h.01M22 15h.01" stroke="#FFFFFF" strokeWidth={4} strokeLinecap="round" />
      </Svg>
    );
  }
  const rotate = a.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  return (
    <Animated.View style={{ transform: [{ rotate }] }} testID="shutter-spinner">
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Circle cx={16} cy={16} r={12} stroke="rgba(255,255,255,0.28)" strokeWidth={3.4} fill="none" />
        <Path d="M16 4 A12 12 0 0 1 28 16" stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" fill="none" />
      </Svg>
    </Animated.View>
  );
}

export function shutterLabel(state, t) {
  if (state === 'busy') return t('scanning');
  if (state === 'room') return t('sceneShutter');
  if (state === 'pro') return t('scanShutterPro');
  return t('scanShutter');
}

export default function Shutter({ state = 'lens', onPress, reduced = false, t }) {
  const scale = useRef(new Animated.Value(1)).current;
  const busy = state === 'busy';
  const press = (to, cfg) => {
    if (!reduced) Animated.spring(scale, { toValue: to, ...cfg }).start();
  };
  const pro = state === 'pro';
  return (
    <APressable
      testID="shutter"
      onPress={onPress}
      disabled={busy}
      onPressIn={() => press(0.9, SPRING.snappy)}
      onPressOut={() => press(1, SPRING.ui)}
      accessibilityRole="button"
      accessibilityLabel={shutterLabel(state, t)}
      accessibilityState={{ disabled: busy, busy }}
      style={{ width: SHUTTER, height: SHUTTER, borderRadius: SHUTTER / 2, transform: [{ scale }] }}
    >
      <View
        style={{
          width: SHUTTER,
          height: SHUTTER,
          borderRadius: SHUTTER / 2,
          borderWidth: 4,
          borderColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
        }}
      >
        <View
          testID={'shutter-' + state}
          style={{ width: DISC, height: DISC, borderRadius: DISC / 2, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: pro ? CAM.cream : CAM.lens[1] }}
        >
          {pro ? null : (
            <Svg width={DISC} height={DISC} style={{ position: 'absolute' }}>
              <Defs>
                {/* 160° — від лівого верхнього до правого нижнього, як на іконці */}
                <LinearGradient id="shutterLens" x1="0.33" y1="0" x2="0.67" y2="1">
                  <Stop offset="0" stopColor={CAM.lens[0]} />
                  <Stop offset="1" stopColor={CAM.lens[1]} />
                </LinearGradient>
              </Defs>
              <Circle cx={DISC / 2} cy={DISC / 2} r={DISC / 2} fill="url(#shutterLens)" />
            </Svg>
          )}
          {pro ? <PCrown size={30} color={CAM.violet} /> : busy ? <Spinner reduced={reduced} /> : state === 'room' ? <IcRoom size={30} color="#FFFFFF" /> : <Lens />}
        </View>
      </View>
    </APressable>
  );
}
