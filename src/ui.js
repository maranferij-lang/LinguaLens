// Спільні UI-компоненти. Рух — за src/motion.js.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { CAMERA_CHROME, GlassBlurView } from './Chrome';
import { DUR, EASE, SPRING, haptic as fireHaptic, stagger, travel, useReducedMotionCached } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// expo-glass-effect (Liquid Glass, iOS 26+). Без нативного модуля (старий
// білд, веб, jest) тихо падаємо на blur.
let GlassViewNative = null;
let liquidGlass = () => false;
try {
  const g = require('expo-glass-effect');
  GlassViewNative = g.GlassView;
  liquidGlass = g.isLiquidGlassAvailable;
} catch (_) {}
export const hasLiquidGlass = () => {
  try {
    return !!GlassViewNative && !!liquidGlass();
  } catch (_) {
    return false;
  }
};

// Натискний елемент.
// Правило Apple №1: відгук на press-IN, не на відпускання. Мить, коли з'являється
// затримка, вбиває відчуття прямої дії. Стиснення subtle — 0.97, не менше.
//
// ВАЖЛИВО: анімований саме Pressable, а не вкладений у нього View. Стара версія
// віддавала style внутрішньому View, і той лишався всередині Pressable без
// розмірів — будь-який flex: 1 схлопувався. Саме через це флешкартка
// показувалась порожнім прямокутником.
const APressable = Animated.createAnimatedComponent(Pressable);

// Зона дотику не менша за 44 pt (HIG).
const MIN_TARGET = 44;
// hitSlop за замовчуванням, коли Press сам дбає про зону дотику
const DEFAULT_SLOP = 6;

const slopOf = (h) =>
  typeof h === 'number'
    ? { top: h, left: h, bottom: h, right: h }
    : { top: h?.top ?? 0, left: h?.left ?? 0, bottom: h?.bottom ?? 0, right: h?.right ?? 0 };

// hitSlop, добитий до min по кожній осі, де елемент (разом зі своїм hitSlop)
// менший. Великий елемент лишає hitSlop, як був.
function reachMin(base, box, min) {
  if (!box || !min) return base;
  const b = slopOf(base);
  const gx = Math.max(0, (min - box.w - b.left - b.right) / 2);
  const gy = Math.max(0, (min - box.h - b.top - b.bottom) / 2);
  if (!gx && !gy) return base;
  return { top: b.top + gy, bottom: b.bottom + gy, left: b.left + gx, right: b.right + gx };
}

// Пропси понад Pressable:
//   feedback — як реагує на дотик:
//     'scale' (типово) — стиснення до scaleTo, для кнопок і карток;
//     'dim' — лише непрозорість до 0.6, для рядків на всю ширину, посилань,
//       чипів і хрестиків: стискати рядок на весь екран некрасиво;
//     'none' — власний відгук у дітей.
//   Під «Зменшити рух» scale замінюється на непрозорість (0.7): рух зникає,
//   відгук лишається. Disabled завжди перемагає (0.45).
//   haptic — 'selection' | 'light' | 'medium' | 'success' | 'warning' | 'error'
//     | null: легкий відгук на сам тап (див. haptic у motion.js). Не для
//     кожного рядка списку.
//   minTarget — мінімальна зона дотику, pt (44; 0 вимикає): після лейауту
//     hitSlop сам добирається до неї, видимий розмір не міняється.
//   hitSlop — типово 6 pt навколо; з minTarget={0} («зону дотику задає сам
//     елемент») типово 0, тож заміна сирого Pressable на Press не змінює
//     геометрію дотику, а рядки списку не відбирають по 6 pt один в одного.
//     Явний hitSlop завжди перемагає.
// Рецепти:
//   рядок/картка списку — <Press feedback="dim" minTarget={0}>;
//   чип/сегмент/хрестик — <Press feedback="dim"> (зона добереться до 44 pt);
//   кнопка — Press як є (scale 0.97), основна — GradBtn.
// style — об'єкт чи масив, не функція ({ pressed }) => …: відгук задає
// feedback. Власний transform у style під scale перекривається масштабом;
// щоб повернути чи зсунути елемент, оберніть Press у View.
// Решта пропсів (accessibilityLabel, accessibilityRole, testID…) іде прямо
// в Pressable: кнопки-іконки без підпису VoiceOver читає як «кнопка».
// busy — дія вже виконується: натиснути не можна, але кнопка не блякне —
// вона не вимкнена, вона працює (див. GradBtn loading).
export function Press({
  children,
  style,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  onLayout,
  disabled,
  busy,
  scaleTo = 0.97,
  feedback = 'scale',
  haptic,
  hitSlop,
  minTarget = MIN_TARGET,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const dim = useRef(new Animated.Value(1)).current;
  const [box, setBox] = useState(null);

  // Режим вирішуємо на рендері, а не в обробниках: стиль і обробники мусять
  // бути з одного боку. Нормальний рух і feedback='scale' — стара поведінка
  // без жодного нового стилю. Слухач «Зменшити рух» дешевий (див. motion.js):
  // кнопка, відрендерена до першої відповіді системи, перемкнеться сама.
  const reduced = useReducedMotionCached();
  const mode = feedback === 'none' ? 'none' : feedback === 'dim' || reduced ? 'dim' : 'scale';
  const dimTo = feedback === 'dim' ? 0.6 : 0.7;

  // Непрозорість, задана викликачем, множимо, а не затираємо
  const own = mode === 'dim' ? StyleSheet.flatten(style)?.opacity : undefined;
  const opacity = useMemo(() => (own == null ? dim : Animated.multiply(dim, own)), [own]);

  const to = (value, toValue, duration, easing) =>
    Animated.timing(value, { toValue, duration, easing, useNativeDriver: true }).start();

  return (
    <APressable
      accessibilityRole="button"
      {...rest}
      onPress={
        haptic
          ? (e) => {
              fireHaptic(haptic);
              onPress?.(e);
            }
          : onPress
      }
      onLongPress={onLongPress}
      disabled={disabled || busy}
      hitSlop={reachMin(hitSlop ?? (minTarget ? DEFAULT_SLOP : 0), box, minTarget)}
      onLayout={(e) => {
        onLayout?.(e);
        if (!minTarget) return;
        const { width, height } = e.nativeEvent.layout;
        const small = width < minTarget || height < minTarget;
        // оновлюємо стан лише коли щось справді змінилось
        setBox((prev) => {
          if (!small) return prev ? null : prev;
          return prev && prev.w === width && prev.h === height ? prev : { w: width, h: height };
        });
      }}
      // вниз — швидко й різко (система почула), вгору — трохи спокійніше
      onPressIn={(e) => {
        if (mode === 'scale') Animated.spring(scale, { toValue: scaleTo, ...SPRING.snappy }).start();
        else if (mode === 'dim') to(dim, dimTo, DUR.press, EASE.out);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (mode === 'scale') Animated.spring(scale, { toValue: 1, ...SPRING.ui }).start();
        else if (mode === 'dim') to(dim, 1, DUR.micro, EASE.soft);
        onPressOut?.(e);
      }}
      style={[
        style,
        mode === 'scale' && { transform: [{ scale }] },
        mode === 'dim' && { opacity },
        disabled && !busy && { opacity: 0.45 },
      ]}
    >
      {children}
    </APressable>
  );
}

// «rgba(r,g,b,a)» -> те саме з a = 0 (кінець радіального градієнта плями)
const clear = (c) => String(c).replace(/,\s*[\d.]+\)$/, ',0)');

// Ледь тонований акцентом градієнт «героя» екрана (один на екран). Малюємо SVG
// з градієнтом: дешево, без runtime-blur.
function HeroTint({ radius }) {
  const { C } = useTheme();
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="hero" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.heroFrom} />
            <Stop offset="1" stopColor={C.heroTo} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#hero)" />
      </Svg>
    </View>
  );
}

// Скляна поверхня: заливка (Liquid Glass на iOS 26+, інакше blur) і 1 px
// кромка, що лежать ПІД дітьми. Діти й layout-стилі лишаються на зовнішньому
// View, тож padding, flexDirection тощо працюють, а тінь не обрізається.
//   camera — над камерою: завжди темна, незалежно від теми;
//   strong — щільніша заливка (аркуші з текстом).
function GlassLayer({ radius, camera, strong, intensity, interactive }) {
  const { C, isDark } = useTheme();
  const dark = camera || isDark;
  const clip = { borderRadius: radius, overflow: 'hidden' };
  const border = (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: camera ? 'rgba(255,255,255,0.14)' : C.glassBorder }]}
    />
  );
  if (hasLiquidGlass()) {
    return (
      <>
        <GlassViewNative
          pointerEvents="none"
          glassEffectStyle="regular"
          colorScheme={dark ? 'dark' : 'light'}
          isInteractive={!!interactive}
          style={[StyleSheet.absoluteFill, clip]}
        />
        {border}
      </>
    );
  }
  const fill = camera ? CAMERA_CHROME : strong ? C.glassStrong : C.glass;
  return (
    <>
      {GlassBlurView ? (
        <GlassBlurView pointerEvents="none" intensity={intensity} tint={dark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, clip]} />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, clip, { backgroundColor: fill }]} />
      {border}
    </>
  );
}

// Плаваюча скляна панель: таб-бар, чипи над камерою. Радіус 32, тінь, blur 42.
//   camera — темна над камерою; radius, intensity — свої.
// Розмір, позицію й layout задає style (як у View).
export function GlassBar({ children, style, camera = false, radius = R.bar, intensity = 42, interactive, ...rest }) {
  const { SHADOW_LG } = useTheme();
  return (
    <View {...rest} style={[{ borderRadius: radius }, SHADOW_LG, style]}>
      <GlassLayer radius={radius} camera={camera} intensity={intensity} interactive={interactive} />
      {children}
    </View>
  );
}

// Нижній аркуш: радіус 40, щільніше скло, сильніший blur, «ручка» зверху
// (grabber=false ховає). Діти — вміст; відступи задає style.
export function GlassSheet({ children, style, camera = false, radius = R.sheet, intensity = 60, grabber = true, ...rest }) {
  const { C, SHADOW_LG } = useTheme();
  return (
    <View {...rest} style={[{ borderRadius: radius }, SHADOW_LG, style]}>
      <GlassLayer radius={radius} camera={camera} strong intensity={intensity} />
      {grabber ? (
        <View
          pointerEvents="none"
          style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 12, backgroundColor: camera ? 'rgba(255,255,255,0.35)' : C.hairline }}
        />
      ) : null}
      {children}
    </View>
  );
}

// Картка «Soft Glass»: напівпрозора заливка, 1 px кромка, м'яка тінь, радіус 24,
// padding 16. Пропси:
//   flat — без тіні; big — глибша тінь (плаваючі блоки);
//   hero — ледь тонований акцентом градієнт (ОДНА така картка на екран);
//   blur — справжнє розмиття за карткою (дорого: лише для малих карток над
//     контентом, що рухається; звичайні картки без нього);
//   radius — інший радіус; решта пропсів (testID, accessibility…) — у View.
export function Glass({ children, style, flat, big, hero, blur, radius = R.xl, ...rest }) {
  const { C, isDark, SHADOW, SHADOW_LG } = useTheme();
  return (
    <View
      {...rest}
      style={[
        { backgroundColor: C.glass, borderRadius: radius, padding: 16, borderWidth: 1, borderColor: C.glassBorder },
        !flat && (big ? SHADOW_LG : SHADOW),
        style,
      ]}
    >
      {blur && GlassBlurView ? (
        <GlassBlurView pointerEvents="none" intensity={30} tint={isDark ? 'dark' : 'light'} style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]} />
      ) : null}
      {hero ? <HeroTint radius={radius} /> : null}
      {children}
    </View>
  );
}

// Стрілка ↗ у правому куті картки, що щось відкриває. Декор (VoiceOver її не
// читає: роль і підпис має сама картка).
export function CardArrow({ style, color }) {
  const { C } = useTheme();
  return (
    <View pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants" style={[{ position: 'absolute', top: 14, right: 14 }, style]}>
      <Svg width={14} height={14} viewBox="0 0 24 24">
        <Path d="M7 17 17 7M8.5 7H17v8.5" fill="none" stroke={color ?? C.dim} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

// Тло екрана «Soft Glass»: тепле тло теми й три дуже м'які кольорові плями
// (лаванда, мʼята, персик; у темній темі ледь помітні). Статичне: радіальні
// градієнти SVG, без runtime-blur і анімацій, нуль вартості на скролі. Кладіть
// першим дитям кореня екрана (воно absoluteFill і не ловить дотики); якщо
// кореню вже задано backgroundColor — залиште, фон тут лише підстраховує.
export function ScreenBackground({ style, testID }) {
  const { C } = useTheme();
  const blobs = [
    { c: C.blob1, cx: 85, cy: 8, rx: 52, ry: 30 },
    { c: C.blob2, cx: 0, cy: 45, rx: 46, ry: 28 },
    { c: C.blob3, cx: 92, cy: 88, rx: 54, ry: 30 },
  ];
  return (
    <View pointerEvents="none" testID={testID} accessible={false} importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: C.bg }, style]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
        <Defs>
          {blobs.map((b, i) => (
            <RadialGradient key={i} id={`b${i}`} cx={b.cx} cy={b.cy} rx={b.rx} ry={b.ry} gradientUnits="userSpaceOnUse">
              <Stop offset="0" stopColor={b.c} />
              <Stop offset="1" stopColor={clear(b.c)} />
            </RadialGradient>
          ))}
        </Defs>
        {blobs.map((b, i) => (
          <Rect key={i} x="0" y="0" width="100" height="100" fill={`url(#b${i})`} />
        ))}
      </Svg>
    </View>
  );
}

// Кругла кнопка-іконка 44 pt на склі (чипи біля заголовка, закриття, дзвінок).
// children — іконка; accessibilityLabel обовʼязковий. camera — темна над камерою.
export function IconBtn({ children, onPress, size = 44, camera = false, style, accessibilityLabel, ...rest }) {
  const { C } = useTheme();
  return (
    <Press
      {...rest}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: camera ? CAMERA_CHROME : C.glass,
          borderWidth: 1,
          borderColor: camera ? 'rgba(255,255,255,0.14)' : C.glassBorder,
        },
        style,
      ]}
    >
      {children}
    </Press>
  );
}

// Сегментований перемикач: м'яка доріжка, виділений сегмент — біла (темна:
// світліше скло) «таблетка». options: [{ key, label, testID?, accessibilityLabel? }].
export function Segmented({ options, value, onChange, style, testID }) {
  const { C, isDark } = useTheme();
  return (
    <View
      testID={testID}
      accessibilityRole="tablist"
      style={[{ flexDirection: 'row', padding: 3, borderRadius: 14, backgroundColor: C.soft }, style]}
    >
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Press
            key={o.key}
            feedback="dim"
            testID={o.testID}
            accessibilityRole="tab"
            accessibilityLabel={o.accessibilityLabel ?? o.label}
            accessibilityState={{ selected: on }}
            onPress={() => onChange?.(o.key)}
            style={[
              { flex: 1, minHeight: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
              on && { backgroundColor: isDark ? C.card3 : C.card, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
            ]}
          >
            <Text numberOfLines={1} style={{ color: on ? C.text : C.dim, ...type(13, on ? F.semi : F.reg, { noLead: true }) }}>
              {o.label}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

// Кольоровий піл-бейдж: м'який фон + насичений текст
export function Pill({ text, color, soft, style, size = 13 }) {
  return (
    <View
      style={[
        {
          backgroundColor: soft,
          borderRadius: R.pill,
          paddingHorizontal: 10,
          paddingVertical: 4,
          alignSelf: 'flex-start',
        },
        style,
      ]}
    >
      <Text style={{ color, ...type(size, F.bold, { noLead: true }) }}>{text}</Text>
    </View>
  );
}

// Дрібні розрядкові кепси — «СЛОВО ДНЯ», «АКАУНТ». Це текст, тож dim:
// faint лише для декору й на 11 pt не дотягує до 4.5:1.
export function Caps({ children, style }) {
  const { C } = useTheme();
  return <Text style={[{ color: C.dim }, CAPS, style]}>{children}</Text>;
}

// Головна кнопка. loading — дія вже йде (покупка чекає на App Store):
// замість підпису — індикатор у кольорі тексту, кнопка в повному кольорі
// (бліда виглядала б вимкненою, наче нічого не сталося), другий натиск не
// проходить, а VoiceOver чує підпис і «зайнято». maxFontScale — стеля системного
// шрифту для підпису (типово без стелі; обмежуємо лише там, де кнопка має вміститись).
export function GradBtn({ title, onPress, disabled, loading = false, style, small, accessibilityLabel, maxFontScale, ...rest }) {
  const { C, isDark } = useTheme();
  const size = small ? 15 : 17;
  return (
    <Press
      {...rest}
      onPress={onPress}
      disabled={disabled && !loading}
      busy={loading}
      style={style}
      // без підпису на екрані VoiceOver бере його звідси
      accessibilityLabel={loading ? title : accessibilityLabel}
      accessibilityState={loading ? { disabled: true, busy: true } : undefined}
    >
      <View
        style={[
          {
            backgroundColor: C.accent,
            borderRadius: R.pill,
            minHeight: small ? 44 : 54,
            paddingVertical: small ? 11 : 15,
            paddingHorizontal: 20,
            alignItems: 'center',
            justifyContent: 'center',
          },
          // м'яка кольорова тінь у тон акценту (макет: 0 6 16 accent .3)
          { shadowColor: C.accent, shadowOpacity: isDark ? 0.35 : 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
        ]}
      >
        {loading ? (
          // висота — як у рядка тексту (Nunito ≈ 1.36 кегля): кнопка не стрибає
          <ActivityIndicator color={C.onAccent} style={{ height: Math.round(size * 1.36) }} />
        ) : (
          <Text maxFontSizeMultiplier={maxFontScale} style={{ color: C.onAccent, ...type(size, F.semi, { noLead: true }) }}>{title}</Text>
        )}
      </View>
    </Press>
  );
}

// Другорядна кнопка
export function SecBtn({ title, onPress, style, maxFontScale, ...rest }) {
  const { C } = useTheme();
  return (
    <Press {...rest} onPress={onPress} style={style}>
      <View
        style={[
          {
            backgroundColor: C.glass,
            borderRadius: R.pill,
            borderWidth: 1,
            borderColor: C.hairline,
            minHeight: 50,
            paddingVertical: 14,
            paddingHorizontal: 20,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text maxFontSizeMultiplier={maxFontScale} style={{ color: C.text, ...type(16, F.semi, { noLead: true }) }}>{title}</Text>
      </View>
    </Press>
  );
}

// Поява елемента.
// Без перельоту: елемент просто з'явився, його ніхто не кидав. Зсув маленький —
// 12 px достатньо, щоб око зчитало напрямок. При reduced motion зсуву немає,
// лишається поява за непрозорістю.
//   delay — затримка, мс; index — номер у списку: до затримки додається
//     stagger(index) (55 мс на крок, не більше шести кроків);
//   dy / distance — зсув знизу вгору, px (distance — те саме, що dy);
//   dx — зсув по горизонталі (кроки онбордингу: уперед новий вміст заїжджає
//     справа, назад — зліва); тоді вертикального немає.
export function FadeIn({ children, style, delay = 0, index = 0, dy = 12, distance, dx = 0, testID }) {
  const a = useRef(new Animated.Value(0)).current;
  const shiftX = travel(dx);
  const shift = shiftX ? 0 : travel(distance ?? dy);

  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: DUR.panel,
      easing: EASE.out,
      delay: delay + stagger(index),
      useNativeDriver: true,
    }).start();
    return () => a.stopAnimation();
  }, []);

  const transform = shiftX
    ? [{ translateX: a.interpolate({ inputRange: [0, 1], outputRange: [shiftX, 0] }) }]
    : shift
      ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [shift, 0] }) }]
      : [];
  return (
    <Animated.View style={[style, { opacity: a, transform }]} testID={testID}>
      {children}
    </Animated.View>
  );
}

// Заглушка на час завантаження: блок кольору card3 із тихою пульсацією
// непрозорості (1 до 0.55 і назад, по 800 мс, симетричний цикл — inOut тут
// на місці). Під «Зменшити рух» стоїть без руху. Для VoiceOver її нема:
// «завантажується» каже контейнер навколо (accessibilityLabel + busy).
//   width / height / radius — розмір блока; color — інший токен теми.
export function Skeleton({ width = '100%', height = 14, radius = R.sm, color, style, testID }) {
  const { C } = useTheme();
  const reduced = useReducedMotionCached();
  const a = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (reduced) {
      a.setValue(1);
      return;
    }
    const pulse = (toValue) =>
      Animated.timing(a, { toValue, duration: 800, easing: EASE.inOut, useNativeDriver: true, isInteraction: false });
    const loop = Animated.loop(Animated.sequence([pulse(0.55), pulse(1)]));
    loop.start();
    return () => loop.stop();
  }, [reduced]);

  return (
    <Animated.View
      testID={testID}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width, height, borderRadius: radius, backgroundColor: color ?? C.card3, opacity: a }, style]}
    />
  );
}

// Смужка прогресу. Масштабуємо по X, а не міняємо width: transform іде
// на GPU, width щоразу перераховує лейаут.
// Для VoiceOver це progressbar із відсотком; accessibilityLabel — що саме
// заповнюється («Рівень»). Якщо поруч уже написано число («3 / 10»), смужку
// ховаємо від VoiceOver: decorative.
export function Bar({ progress, color, bg, height = 8, radius, duration = DUR.sheet, accessibilityLabel, decorative = false, testID }) {
  const { C } = useTheme();
  const a = useRef(new Animated.Value(0)).current;
  const value = Math.max(0, Math.min(1, progress || 0));
  useEffect(() => {
    Animated.timing(a, {
      toValue: value,
      duration,
      easing: EASE.out,
      useNativeDriver: true,
    }).start();
  }, [progress]);

  const r = radius ?? height / 2;
  const pct = Math.round(value * 100);
  // text потрібен iOS: з самим now VoiceOver прочитав би «40» без відсотка
  const a11y = decorative
    ? { accessible: false, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' }
    : {
        accessible: true,
        accessibilityRole: 'progressbar',
        accessibilityLabel,
        accessibilityValue: { min: 0, max: 100, now: pct, text: `${pct}%` },
      };
  return (
    <View {...a11y} testID={testID} style={{ height, backgroundColor: bg ?? C.soft, borderRadius: r, overflow: 'hidden' }}>
      <Animated.View
        style={{
          height,
          borderRadius: r,
          backgroundColor: color ?? C.accent,
          width: '100%',
          transform: [{ scaleX: a }],
          // масштабуємо від лівого краю, а не від центру
          transformOrigin: 'left',
        }}
      />
    </View>
  );
}
