import { centroid, circlePoints, inflate, silhouette, smoothPath, stickerPath } from '../src/stickerGeometry';

const square = [
  [0.2, 0.2], [0.5, 0.18], [0.8, 0.2], [0.82, 0.5], [0.8, 0.8], [0.5, 0.82], [0.2, 0.8], [0.18, 0.5],
];

test('crop-local shape is scaled to sticker pixels', () => {
  const pts = silhouette({ shape: square }, 100);
  expect(pts[0]).toEqual([20, 20]);
  expect(pts[3][0]).toBeCloseTo(82);
});

test('hallucinated far-away points and near-duplicates are dropped', () => {
  const noisy = [...square, [9, 9], [0.18, 0.5]];
  expect(silhouette({ shape: noisy }, 100)).toHaveLength(square.length);
});

test('too few points means no silhouette', () => {
  expect(silhouette({ shape: square.slice(0, 4) }, 100)).toBeNull();
  expect(silhouette({}, 100)).toBeNull();
});

test('legacy outline + box still maps into the sticker square', () => {
  const box = [300, 300, 700, 700];
  const outline = [[300, 300], [300, 500], [300, 700], [500, 700], [700, 700], [700, 500], [700, 300], [500, 300]];
  const pts = silhouette({ outline, box }, 100);
  expect(pts).not.toBeNull();
  for (const [x, y] of pts) {
    expect(x).toBeGreaterThanOrEqual(0);
    expect(y).toBeLessThanOrEqual(100);
  }
});

test('inflate moves every point away from the centre by the same distance', () => {
  const pts = silhouette({ shape: square }, 100);
  const [cx, cy] = centroid(pts);
  const out = inflate(pts, 3);
  out.forEach(([x, y], i) => {
    const before = Math.hypot(pts[i][0] - cx, pts[i][1] - cy);
    expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(before + 3);
  });
});

test('smooth path is closed and made of cubic curves through every point', () => {
  const d = smoothPath(silhouette({ shape: square }, 100));
  expect(d.startsWith('M20 20')).toBe(true);
  expect(d.endsWith(' Z')).toBe(true);
  expect(d.match(/C/g)).toHaveLength(square.length);
});

test('without a silhouette the sticker falls back to a circle', () => {
  const { d, shaped } = stickerPath({}, 100);
  expect(shaped).toBe(false);
  expect(d.match(/C/g)).toHaveLength(circlePoints(100).length);
});
