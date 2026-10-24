import { StyleSheet, View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

// Три м'які плями за карткою (лаванда, мʼята, персик): статичний SVG, без blur.
export function Blobs({ pal }) {
  const list = pal.blobs || [];
  const spots = [
    { cx: 90, cy: 6, rx: 70, ry: 34 },
    { cx: 0, cy: 50, rx: 60, ry: 30 },
    { cx: 92, cy: 94, rx: 70, ry: 32 },
  ];
  const clear = (c) => c.replace(/[\d.]+\)$/, '0)');
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {list.map((c, i) => (
            <RadialGradient key={i} id={`sb${i}`} cx={spots[i].cx} cy={spots[i].cy} rx={spots[i].rx} ry={spots[i].ry} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={c} />
              <Stop offset="1" stopColor={clear(c)} />
            </RadialGradient>
          ))}
        </Defs>
        {list.map((c, i) => (
          <Rect key={i} x="0" y="0" width="100" height="100" fill={`url(#sb${i})`} />
        ))}
      </Svg>
    </View>
  );
}
