// Напівпрозорий «хром» застосунку.
//
// Правило Apple: панелі — це плаваючий матеріал, а не суцільна смуга, що з'їдає
// екран. Контент має проїжджати під ним. Замість жорсткої лінії-роздільника —
// м'який край, який проявляється лише там, де контент реально перекривається.
//
// expo-blur може бути ще не встановлений — тоді тихо падаємо на суцільний фон.
import { StyleSheet, View } from 'react-native';
import { useTheme } from './theme';
import { useReduceTransparency } from './motion';

let BlurView = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (_) {}

export const BLUR_AVAILABLE = !!BlurView;
// Для скляних поверхонь у ui.js (GlassSurface); null, якщо expo-blur немає
export const GlassBlurView = BlurView;

// Таб-бар — плаваюча скляна пігулка заввишки 64 (радіус 32), з відступом 16 з
// боків і ≈28 від низу екрана. Екрани додають UNDER_TAB знизу до контенту, щоб
// останній рядок не ховався під пігулкою, але проїжджав під нею на скролі:
// Пігулка 64 + 22: на iPhone SE (без home indicator, відступ 14) це точно, а на
// моделях із вирізом (відступ ≈28) контент і так лишає собі додатковий padding,
// тож останній рядок на 6 pt заїжджає під скло, чого й хоче матеріал.
export const TAB_H = 64;
export const UNDER_TAB = TAB_H + 22;

// Темний тон панелі над живою камерою — як хром Камери iOS: світла панель
// над яскравою сценою губила підписи вкладок у будь-якій темі.
export const CAMERA_CHROME = 'rgba(0,0,0,0.58)';
// те саме суцільне: коли ввімкнено «Зменшити прозорість»
export const CAMERA_SOLID = '#1C1B19';

// Матеріал під панель. Велика поверхня → сильніше розмиття (правило «більше = товще»).
// camera — панель лежить над камерою: завжди темна, незалежно від теми.
export function Material({ children, style, intensity = 42, camera = false }) {
  const { C, isDark } = useTheme();
  const solid = useReduceTransparency();
  const dark = camera || isDark;

  if (solid) {
    return <View style={[{ backgroundColor: camera ? CAMERA_SOLID : isDark ? C.card2 : C.card }, style]}>{children}</View>;
  }
  if (!BlurView) {
    return <View style={[{ backgroundColor: camera ? CAMERA_CHROME : C.tabbar }, style]}>{children}</View>;
  }

  return (
    <BlurView
      intensity={intensity}
      tint={dark ? 'dark' : 'light'}
      style={[{ backgroundColor: camera ? CAMERA_CHROME : C.chrome }, style]}
    >
      {children}
    </BlurView>
  );
}

// Верхній край панелі: замість hairline-бордюра — тонка світла лінія, наче
// матеріал ловить світло згори. У темних темах (і над камерою) вона біла й
// ледь помітна.
export function MaterialEdge({ camera = false }) {
  const { isDark: themeDark } = useTheme();
  const isDark = camera || themeDark;
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
