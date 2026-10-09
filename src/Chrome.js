// The app's translucent "chrome".
//
// Apple's rule: bars are a floating material, not a solid strip that eats
// the screen. Content should scroll under it. Instead of a hard divider line,
// a soft edge that appears only where the content really overlaps.
//
// expo-blur may not be installed yet, in which case we quietly fall back to a solid background.
import { StyleSheet, View } from 'react-native';
import { useTheme } from './theme';

let BlurView = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (_) {}

export const BLUR_AVAILABLE = !!BlurView;

// Tab bar height. Screens add it to the bottom of the content so that the last row
// does not hide under the bar, but still scrolls under it.
export const TAB_H = 62;
export const UNDER_TAB = TAB_H + 16;

// The material for the bar. A large surface → stronger blur (the "bigger = thicker" rule).
export function Material({ children, style, intensity = 42 }) {
  const { C, isDark } = useTheme();

  if (!BlurView) {
    return <View style={[{ backgroundColor: C.tabbar }, style]}>{children}</View>;
  }

  return (
    <BlurView
      intensity={intensity}
      tint={isDark ? 'dark' : 'light'}
      style={[{ backgroundColor: C.chrome }, style]}
    >
      {children}
    </BlurView>
  );
}

// Top edge of the bar: instead of a hairline border, a thin light line, as if
// the material catches light from above. In dark themes it is white and barely visible.
export function MaterialEdge() {
  const { isDark } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        {
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.65)',
          bottom: undefined,
          height: 1,
        },
      ]}
    />
  );
}
