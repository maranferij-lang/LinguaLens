// Наліпка з предметом — справжня «вирубка» по силуету.
//
// Чому не круглий кроп: круг — це той самий скріншот, просто в іншій рамці.
// Тут предмет вирізається по СВОЄМУ контуру і отримує білу облямівку, як
// наліпка, яку відклеїли з аркуша: саме цей вигляд хочеться збирати й
// показувати іншим.
//
// Шари SVG (знизу догори):
//   1) м'яка тінь — той самий контур, розмитий і зсунутий вниз;
//   2) тонка тепла лінія по зовнішньому краю — без неї біла облямівка
//      зникає на білій картці;
//   3) біла облямівка — товстий штрих по контуру;
//   4) фото, обрізане по контуру.
// Геометрія (згладжування, запас під облямівку) — у stickerGeometry.js.
import { memo, useEffect, useId, useMemo, useRef } from 'react';
import { Animated, View } from 'react-native';
import Svg, { ClipPath, Defs, FeGaussianBlur, Filter, G, Image as SvgImage, Path } from 'react-native-svg';
import { stickerPath } from './stickerGeometry';
import { SPRING, useReducedMotion } from './motion';
import { useTheme } from './theme';

// Частки від розміру наліпки
const BORDER = 0.05; // ширина білої облямівки
const SHADOW_BLUR = 0.03;
const SHADOW_DROP = 0.025;
// Скільки місця лишити довкола контуру, щоб облямівка й тінь не обрізались
const MARGIN = BORDER + SHADOW_BLUR * 2 + SHADOW_DROP;

function Cut({ uri, shape, outline, box, size, shadow }) {
  const { d } = useMemo(() => stickerPath({ shape, outline, box }, size), [shape, outline, box, size]);
  // React 19 повертає id зі спецсимволами — у url(#…) вони ламають посилання
  const raw = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const clipId = 'cut' + raw;
  const blurId = 'blur' + raw;

  const m = size * MARGIN;
  const border = Math.max(2, size * BORDER);

  return (
    <Svg width={size} height={size} viewBox={`${-m} ${-m} ${size + m * 2} ${size + m * 2}`}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={d} />
        </ClipPath>
        {shadow ? (
          <Filter id={blurId} x="-30%" y="-30%" width="160%" height="160%">
            <FeGaussianBlur stdDeviation={size * SHADOW_BLUR} />
          </Filter>
        ) : null}
      </Defs>

      {shadow ? (
        <G transform={`translate(0 ${size * SHADOW_DROP})`} opacity={0.28}>
          <Path
            d={d}
            fill="#3B2F22"
            stroke="#3B2F22"
            strokeWidth={border * 2}
            strokeLinejoin="round"
            filter={`url(#${blurId})`}
          />
        </G>
      ) : null}

      <Path
        d={d}
        fill="none"
        stroke="rgba(59,47,34,0.14)"
        strokeWidth={border * 2 + Math.max(1, size * 0.008)}
        strokeLinejoin="round"
      />
      <Path d={d} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={border * 2} strokeLinejoin="round" />
      <SvgImage
        href={{ uri }}
        x="0"
        y="0"
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${clipId})`}
      />
    </Svg>
  );
}

// Дрібна наліпка для рядка словника й сітки колекції. Розмиту тінь вмикаємо
// лише від 72 пт: на 48 пт її майже не видно, а рядків у списку сотні.
// memo: це ціле дерево SVG, а пропси (фото, силует, розмір) міняються рідко,
// тоді як батьки (пошук у словнику, сканер зі своїм статусом і підказкою)
// перемальовуються на кожну літеру чи зміну.
export const Sticker = memo(function Sticker({ uri, shape, outline, box, size = 48, style }) {
  if (!uri) return null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Cut uri={uri} shape={shape} outline={outline} box={box} size={size} shadow={size >= 72} />
    </View>
  );
});

// Велика наліпка для картки результату, флешкартки й карток «поділитись».
// `pop` — коротка «шльоп»-анімація появи, наче наліпку щойно приліпили.
// Переліт тут доречний: це фізичний предмет, а не панель інтерфейсу.
export function StickerLarge({ uri, shape, outline, box, size = 132, style, pop = false, halo = true }) {
  const { C } = useTheme();
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(pop && !reduced ? 0 : 1)).current;

  useEffect(() => {
    if (!pop || reduced) return;
    Animated.spring(a, { toValue: 1, ...SPRING.gesture }).start();
  }, [pop, reduced]);

  if (!uri) return null;
  const transform = pop
    ? [
        { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) },
        { rotate: a.interpolate({ inputRange: [0, 1], outputRange: ['-9deg', '-2deg'] }) },
      ]
    : [{ rotate: '-2deg' }];

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {halo ? (
        // М'яка акцентна пляма дає предмету «землю» й тримає композицію,
        // коли силует вузький (олівець, пляшка).
        <View
          style={{
            position: 'absolute',
            width: size * 0.8,
            height: size * 0.8,
            borderRadius: size,
            backgroundColor: C.accentSoft,
          }}
        />
      ) : null}
      <Animated.View style={{ opacity: a, transform }}>
        <Cut uri={uri} shape={shape} outline={outline} box={box} size={size} shadow />
      </Animated.View>
    </View>
  );
}
