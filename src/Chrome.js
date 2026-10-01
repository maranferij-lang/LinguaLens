// Напівпрозорий «хром» застосунку.
//
// Правило Apple: панелі — це плаваючий матеріал, а не суцільна смуга, що з'їдає
// екран. Контент має проїжджати під ним. Замість жорсткої лінії-роздільника —
// м'який край, який проявляється лише там, де контент реально перекривається.
//
// expo-blur може бути ще не встановлений — тоді тихо падаємо на суцільний фон.
import { StyleSheet, View } from 'react-native';
import { useTheme } from './theme';

let BlurView = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (_) {}

export const BLUR_AVAILABLE = !!BlurView;

// Висота таб-бара. Екрани додають її знизу до контенту, щоб останній рядок
// не ховався під панеллю, але при цьому проїжджав під нею на скролі.
export const TAB_H = 62;
export const UNDER_TAB = TAB_H + 16;

// Матеріал під панель. Велика поверхня → сильніше розмиття (правило «більше = товще»).
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

// Верхній край панелі: замість hairline-бордюра — тонка світла лінія, наче
// матеріал ловить світло згори. У темних темах вона біла й ледь помітна.
export function MaterialEdge() {
  const { isDark } = useTheme();
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
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
