// A sticker with an object: a real cut-out along the silhouette.
//
// Why not a round crop: a circle is the same screenshot, just in a different frame.
// The background inside stays, the shape is the same for everything, and the feeling of a collection
// does not arise. Here the object is cut out along ITS OWN outline: the model returns
// a silhouette polygon (10-24 points), and an SVG mask shows only what is inside.
//
// Mechanics: <Mask> with a white polygon → everything outside the polygon is transparent.
// The outline is drawn with the same polygon, so it follows the edge of the object exactly,
// not a circle around it.
//
// If there is no outline (the model did not provide one or gave garbage), we fall back to a round
// mask. It is noticeably worse, but never empty.
import { useMemo } from 'react';
import { Image, View } from 'react-native';
import Svg, { ClipPath, Defs, Image as SvgImage, Path, Polygon } from 'react-native-svg';
import { useTheme } from './theme';

// Polygon in 0-1000 coordinates (y,x) → a path in sticker coordinates.
// The points come for the WHOLE frame, while the sticker is already cropped to the object's box,
// so we recalculate them into the local coordinates of the cropped square.
function outlineToPath(outline, box, size) {
  if (!outline || !box) return null;
  const [y1, x1, y2, x2] = box;
  // box with the same margin as in the scanner crop
  const pad = 0.06;
  const bw = (x2 - x1) / 1000 + pad * 2;
  const bh = (y2 - y1) / 1000 + pad * 2;
  const side = Math.max(bw, bh);
  const ox = (x1 / 1000 - pad) + bw / 2 - side / 2;
  const oy = (y1 / 1000 - pad) + bh / 2 - side / 2;

  const pts = outline
    .map(([y, x]) => {
      const lx = ((x / 1000) - ox) / side;
      const ly = ((y / 1000) - oy) / side;
      return [lx * size, ly * size];
    })
    // points that flew far out of bounds are a sign of hallucination
    .filter(([px, py]) => px > -size && px < size * 2 && py > -size && py < size * 2);

  if (pts.length < 6) return null;
  return pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ') + ' Z';
}

function Cut({ uri, outline, box, size, ringColor, ringWidth }) {
  const path = useMemo(() => outlineToPath(outline, box, size), [outline, box, size]);
  const id = useMemo(() => 'cut' + Math.random().toString(36).slice(2, 8), []);

  // no outline: a circle
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
      {/* Outline along the silhouette itself, not a circle around it */}
      <Path d={path} fill="none" stroke={ringColor} strokeWidth={ringWidth} strokeLinejoin="round" />
    </Svg>
  );
}

// A small sticker for a dictionary row.
export function Sticker({ uri, outline, box, size = 48, style }) {
  const { C } = useTheme();
  if (!uri) return null;
  return (
    <View style={[{ width: size, height: size }, style]}>
      <Cut uri={uri} outline={outline} box={box} size={size} ringColor={C.accent} ringWidth={1.6} />
    </View>
  );
}

// A large sticker for the result card and the back of the flashcard.
// Under it is a soft accent spot: it gives the object "ground" and holds
// the composition when the silhouette is narrow.
export function StickerLarge({ uri, outline, box, size = 132, style }) {
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
      <Cut uri={uri} outline={outline} box={box} size={size} ringColor={C.accent} ringWidth={2.2} />
    </View>
  );
}
