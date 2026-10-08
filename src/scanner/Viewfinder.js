// Видошукач (core.md A4, A11): кути-дуги радіуса 28 — як у карток
// застосунку — і м'яке затемнення-«прожектор» довкола кадру, щоб око
// одразу бачило, куди наводити.
//
// Поки модель думає, кути наливаються лавандовим і «дихають» (1 ↔ 0,97 за
// 1,4 с), а кадром іде м'яка лавандова смуга 110 pt — видно, що прилад
// працює. «Менше руху»: кути одразу лавандові, без дихання й смуги.
//
// Тінь кутів — ширший темний штрих під білим (а не shadow* у View: на вебі
// той малював би прямокутну тінь довкола порожнього кадру).
import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { EASE } from '../motion';
import { CAM } from './CamGlass';
import { FRAME_R } from './layout';

const STROKE = 4;
const ARM = 44;
// поле довкола кадру під штрих і його тінь
const PAD = 6;
export const BAND = 110;

const f1 = (v) => Math.round(v * 10) / 10;

// Чотири кути-дуги для кадру w×h (у координатах полотна з полем PAD).
export function cornersPath(w, h, r = FRAME_R, arm = ARM) {
  const i = PAD + STROKE / 2;
  const R = Math.min(r, arm - 2);
  const L = i;
  const T = i;
  const Rr = i + w - STROKE;
  const B = i + h - STROKE;
  return [
    `M${L},${f1(T + arm)} V${f1(T + R)} A${R},${R} 0 0 1 ${f1(L + R)},${T} H${f1(L + arm)}`,
    `M${f1(Rr - arm)},${T} H${f1(Rr - R)} A${R},${R} 0 0 1 ${Rr},${f1(T + R)} V${f1(T + arm)}`,
    `M${Rr},${f1(B - arm)} V${f1(B - R)} A${R},${R} 0 0 1 ${f1(Rr - R)},${B} H${f1(Rr - arm)}`,
    `M${f1(L + arm)},${B} H${f1(L + R)} A${R},${R} 0 0 1 ${L},${f1(B - R)} V${f1(B - arm)}`,
  ].join(' ');
}

// Затемнення всього сканера з вирізом-заокругленим прямокутником кадру —
// один шлях, fillRule evenodd.
export function spotlightPath(W, H, { x, y, w, h }, r = FRAME_R) {
  return (
    `M0,0 H${W} V${H} H0 Z ` +
    `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} ` +
    `A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} ` +
    `V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`
  );
}

// memo: рамка, кути й «прожектор» від зуму не залежать, а щипок перемальовує
// весь сканер на кожен дотик (рамка приходить стабільним обʼєктом, див. ScannerScreen).
function Viewfinder({ frame, rootW, rootH, loading = false, reduced = false }) {
  const { x, y, w, h } = frame;
  const breath = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const live = loading && !reduced;

  useEffect(() => {
    if (!live) {
      breath.setValue(0);
      sweep.setValue(0);
      return undefined;
    }
    const half = { duration: 700, easing: EASE.inOut, useNativeDriver: true };
    const a = Animated.loop(Animated.sequence([Animated.timing(breath, { toValue: 1, ...half }), Animated.timing(breath, { toValue: 0, ...half })]));
    // Смуга — рівний хід згори вниз: linear тут читається як робота приладу
    const b = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1400, easing: EASE.linear, useNativeDriver: true }));
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [live]);

  const corners = cornersPath(w, h);
  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="viewfinder">
      {rootW && rootH ? (
        <Svg width={rootW} height={rootH} style={StyleSheet.absoluteFill}>
          <Path d={spotlightPath(rootW, rootH, frame)} fill={CAM.dim24} fillRule="evenodd" />
        </Svg>
      ) : null}
      <Animated.View style={{ position: 'absolute', left: x, top: y, width: w, height: h, transform: live ? [{ scale }] : [] }}>
        {live ? (
          <View style={[StyleSheet.absoluteFill, { borderRadius: FRAME_R, overflow: 'hidden' }]} testID="scan-band">
            <Animated.View
              style={{
                height: BAND,
                transform: [{ translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [-BAND, h] }) }],
              }}
            >
              <Svg width={w} height={BAND}>
                <Defs>
                  <LinearGradient id="scanBand" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor={CAM.accent} stopOpacity={0} />
                    <Stop offset="0.55" stopColor={CAM.accent} stopOpacity={0.4} />
                    <Stop offset="1" stopColor={CAM.accent} stopOpacity={0} />
                  </LinearGradient>
                </Defs>
                <Rect width={w} height={BAND} fill="url(#scanBand)" />
              </Svg>
            </Animated.View>
          </View>
        ) : null}
        <Svg width={w + PAD * 2} height={h + PAD * 2} style={{ position: 'absolute', left: -PAD, top: -PAD }}>
          <Path d={corners} fill="none" stroke="rgba(0,0,0,0.2)" strokeWidth={STROKE + 3} strokeLinecap="round" strokeLinejoin="round" />
          <Path
            testID="viewfinder-corners"
            d={corners}
            fill="none"
            stroke={loading ? CAM.accent : CAM.ring}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

export default memo(Viewfinder);
