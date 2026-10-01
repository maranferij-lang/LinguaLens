// Наліпка з предметом — справжнє вирізання по силуету.
//
// Чому не круглий кроп: круг — це той самий скріншот, просто в іншій рамці.
// Тло всередині лишається, форма однакова для всього, і відчуття колекції
// не виникає. Тут предмет вирізається по СВОЄМУ контуру: модель віддає
// полігон силуету (10–24 точки), а SVG-маска показує тільки те, що всередині.
//
// Механіка: <Mask> з білим полігоном → все за межами полігона прозоре.
// Обводка малюється тим самим полігоном, тож вона йде точно по краю предмета,
// а не по колу навколо нього.
//
// Якщо контуру немає (модель не дала або дала сміття) — падаємо на круглу
// маску. Це помітно гірше, але ніколи не порожньо.
import { useMemo } from 'react';
import { Image, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Polygon } from 'react-native-svg';
import { useTheme } from './theme';

// Силует → SVG-шлях у координатах наліпки.
//
// `shape` — точки [x, y] 0–1 уже в координатах вирізаного квадрата; їх рахує
// сканер у момент кропу, коли відомі розміри кадру й зсув квадрата.
// `outline` + `box` — старий формат (0–1000 на весь кадр) для слів, збережених
// до цього: перерахунок наближений, бо розмірів кадру тут уже немає.
function outlineToPath(outline, box, size, shape) {
  if (Array.isArray(shape) && shape.length >= 6) return pointsToPath(shape.map(([x, y]) => [x * size, y * size]), size);
  if (!outline || !box) return null;
  const [y1, x1, y2, x2] = box;
  // рамка з тим самим запасом, що й у кропі сканера
  const pad = 0.06;
  const bw = (x2 - x1) / 1000 + pad * 2;
  const bh = (y2 - y1) / 1000 + pad * 2;
  const side = Math.max(bw, bh);
  const ox = (x1 / 1000 - pad) + bw / 2 - side / 2;
  const oy = (y1 / 1000 - pad) + bh / 2 - side / 2;

  const pts = outline.map(([y, x]) => {
    const lx = ((x / 1000) - ox) / side;
    const ly = ((y / 1000) - oy) / side;
    return [lx * size, ly * size];
  });
  return pointsToPath(pts, size);
}

function pointsToPath(points, size) {
  // точки, що вилетіли далеко за межі, — ознака галюцинації
  const pts = points.filter(([px, py]) => px > -size && px < size * 2 && py > -size && py < size * 2);
  if (pts.length < 6) return null;
  return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ') + ' Z';
}

function Cut({ uri, shape, outline, box, size, ringColor, ringWidth }) {
  const path = useMemo(() => outlineToPath(outline, box, size, shape), [outline, box, size, shape]);
  const id = useMemo(() => 'cut' + Math.random().toString(36).slice(2, 8), []);

  // немає контуру — круг
  if (!path) {
    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden' }}>
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
      </View>
    );
  }

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <ClipPath id={id}>
          <Path d={path} />
        </ClipPath>
      </Defs>
      <SvgImage
        href={{ uri }}
        x="0"
        y="0"
        width={size}
        height={size}
        preserveAspectRatio="xMidYMid slice"
        clipPath={`url(#${id})`}
      />
      {/* Обводка по самому силуету, а не по колу навколо нього */}
      <Path d={path} fill="none" stroke={ringColor} strokeWidth={ringWidth} strokeLinejoin="round" />
    </Svg>
  );
}

// Дрібна наліпка для рядка словника.
export function Sticker({ uri, shape, outline, box, size = 48, style }) {
  const { C } = useTheme();
  if (!uri) return null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Cut uri={uri} shape={shape} outline={outline} box={box} size={size} ringColor={C.accent} ringWidth={1.6} />
    </View>
  );
}

// Велика наліпка для картки результату і зворотної сторони флешкартки.
// Під нею м'яка акцентна пляма — вона дає предмету «землю» й тримає
// композицію, коли силует вузький.
export function StickerLarge({ uri, shape, outline, box, size = 132, style }) {
  const { C } = useTheme();
  if (!uri) return null;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View
        style={{
          position: 'absolute',
          width: size * 0.86,
          height: size * 0.86,
          borderRadius: size,
          backgroundColor: C.accentSoft,
        }}
      />
      <Cut uri={uri} shape={shape} outline={outline} box={box} size={size} ringColor={C.accent} ringWidth={2.2} />
    </View>
  );
}
