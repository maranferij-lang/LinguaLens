// Icons for the paywall: our own vectors in the style of the rest of the set.
// A 24 grid, 1.8 stroke, round caps. No ready-made pictures from outside.
import Svg, { Circle, Path, Rect } from 'react-native-svg';

const S = (c, w = 1.8) => ({
  fill: 'none',
  stroke: c,
  strokeWidth: w,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const box = (n) => ({ width: n, height: n, viewBox: '0 0 24 24' });

// Unlimited scans: a viewfinder with an infinity sign inside.
const PScan = ({ size, color }) => (
  <Svg {...box(size)}>
    <Path d="M3 8.5V6a3 3 0 0 1 3-3h2.5M15.5 3H18a3 3 0 0 1 3 3v2.5M21 15.5V18a3 3 0 0 1-3 3h-2.5M8.5 21H6a3 3 0 0 1-3-3v-2.5" {...S(color)} />
    <Path d="M9.6 12a1.7 1.7 0 1 1 2.4 1.6 1.7 1.7 0 1 0 2.4 1.6" {...S(color, 1.5)} />
    <Path d="M14.4 12a1.7 1.7 0 1 0-2.4-1.6A1.7 1.7 0 1 1 9.6 8.8" {...S(color, 1.5)} />
  </Svg>
);

// A dictionary without a ceiling: a book with an upward arrow.
const PBook = ({ size, color }) => (
  <Svg {...box(size)}>
    <Path d="M4 5.2A1.2 1.2 0 0 1 5.2 4H13a2 2 0 0 1 2 2v10H6a2 2 0 0 0-2 2z" {...S(color)} />
    <Path d="M4 18.2A2.2 2.2 0 0 0 6.2 20.4H15" {...S(color)} />
    <Path d="M17.5 12V4.8M14.6 7.4l2.9-2.9 2.9 2.9" {...S(color)} />
  </Svg>
);

// All languages: a globe with meridians.
const PGlobe = ({ size, color }) => (
  <Svg {...box(size)}>
    <Circle cx="12" cy="12" r="8.4" {...S(color)} />
    <Path d="M3.6 12h16.8M12 3.6c2.5 2.5 2.5 14.3 0 16.8M12 3.6c-2.5 2.5-2.5 14.3 0 16.8" {...S(color, 1.4)} />
  </Svg>
);

// Stickers: an object in a circle with an outline.
const PSticker = ({ size, color }) => (
  <Svg {...box(size)}>
    <Circle cx="12" cy="12" r="8.4" {...S(color)} />
    <Path d="M8.4 14.6 10.9 11.8l2.1 2.2 1.8-1.6 2 2.2" {...S(color, 1.5)} />
    <Circle cx="9.6" cy="9.4" r="1.3" {...S(color, 1.5)} />
  </Svg>
);

// Export: a sheet with an arrow pointing out.
const PExport = ({ size, color }) => (
  <Svg {...box(size)}>
    <Path d="M14 3.5H7.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V12" {...S(color)} />
    <Path d="M13 10.8 20.5 3.4M15.6 3.4h4.9v4.9" {...S(color)} />
  </Svg>
);

// Support the development: a heart.
const PHeart = ({ size, color }) => (
  <Svg {...box(size)}>
    <Path d="M12 20.4S3.6 15.6 3.6 9.7A4.3 4.3 0 0 1 12 8a4.3 4.3 0 0 1 8.4 1.7c0 5.9-8.4 10.7-8.4 10.7z" {...S(color)} />
  </Svg>
);

// A crown for the Pro title.
export const PCrown = ({ size = 28, color }) => (
  <Svg width={size} height={size} viewBox="0 0 28 28">
    <Path d="M5 19 3.6 8.4l5.4 3.8L14 6l5 6.2 5.4-3.8L23 19z" {...S(color, 2)} />
    <Path d="M5.6 22.4h16.8" {...S(color, 2)} />
  </Svg>
);

const MAP = {
  scan: PScan,
  book: PBook,
  globe: PGlobe,
  sticker: PSticker,
  export: PExport,
  heart: PHeart,
};

export function ProIcon({ name, size = 22, color }) {
  const Cmp = MAP[name] || PScan;
  return <Cmp size={size} color={color} />;
}
