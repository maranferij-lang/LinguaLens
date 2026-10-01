// Геометрія вирізання: кадр 9:16 з кадру камери, рамки з 9:16 назад на
// повний кадр і квадрат під наліпку. Помилка тут — наліпка зі шматком
// сусіднього предмета або підпис, що висить поруч із річчю.
import {
  boxToFrame,
  captureScene,
  createCutter,
  outlineToFrame,
  sceneCrop,
  shapeInCrop,
  stickerCrop,
} from '../src/cutout';

const calls = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const ops = [];
    calls.push({ source, ops });
    const c = {
      crop: (r) => (ops.push({ crop: r }), c),
      resize: (r) => (ops.push({ resize: r }), c),
      renderAsync: async () => ({
        saveAsync: async (opts) => {
          const w = ops.find((o) => o.resize)?.resize.width || 0;
          return { uri: 'file:///out' + calls.length + '.jpg', width: w, height: Math.round((w * 16) / 9), base64: opts.base64 ? 'B64' : undefined };
        },
        release() {},
      }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

beforeEach(() => {
  calls.length = 0;
});

describe('9:16 scene crop', () => {
  test('a 3:4 portrait frame keeps its full height and loses the sides equally', () => {
    expect(sceneCrop(3024, 4032)).toEqual({ x: 378, y: 0, width: 2268, height: 4032 });
    expect(sceneCrop(1200, 1600)).toEqual({ x: 150, y: 0, width: 900, height: 1600 });
  });

  test('an exact 9:16 frame is left whole', () => {
    expect(sceneCrop(1080, 1920)).toEqual({ x: 0, y: 0, width: 1080, height: 1920 });
  });

  test('a frame taller than 9:16 is cropped top and bottom', () => {
    expect(sceneCrop(1170, 2532)).toEqual({ x: 0, y: 226, width: 1170, height: 2080 });
  });

  test('a landscape frame still gives a portrait crop inside it', () => {
    const c = sceneCrop(4032, 3024);
    expect(c.height).toBe(3024);
    expect(c.width / c.height).toBeCloseTo(9 / 16, 2);
    expect(c.x + c.width).toBeLessThanOrEqual(4032);
  });

  test('the crop is always whole pixels inside the frame', () => {
    for (const [W, H] of [[3024, 4032], [1001, 1777], [999, 3000], [4000, 3000], [7, 11]]) {
      const c = sceneCrop(W, H);
      for (const v of Object.values(c)) expect(Number.isInteger(v)).toBe(true);
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.width).toBeLessThanOrEqual(W);
      expect(c.y + c.height).toBeLessThanOrEqual(H);
    }
  });
});

describe('mapping back to the full frame', () => {
  const W = 1200;
  const H = 1600;
  const crop = sceneCrop(W, H); // x 150, ширина 900

  test('the whole 9:16 image is exactly the crop rectangle of the frame', () => {
    const [y1, x1, y2, x2] = boxToFrame([0, 0, 1000, 1000], crop, W, H);
    expect([y1, y2]).toEqual([0, 1000]);
    expect(x1).toBeCloseTo(125); // 150 / 1200
    expect(x2).toBeCloseTo(875); // 1050 / 1200
  });

  test('a point keeps its place in pixels', () => {
    const [y1, x1] = boxToFrame([500, 500, 600, 600], crop, W, H);
    expect((x1 / 1000) * W).toBeCloseTo(150 + 0.5 * 900);
    expect((y1 / 1000) * H).toBeCloseTo(800);
  });

  test('with the crop equal to the image (a scene from history) nothing moves', () => {
    const full = { x: 0, y: 0, width: 1080, height: 1920 };
    expect(boxToFrame([100, 200, 300, 400], full, 1080, 1920)).toEqual([100, 200, 300, 400]);
    expect(outlineToFrame([[100, 200], [300, 400]], full, 1080, 1920)).toEqual([[100, 200], [300, 400]]);
  });

  test('outline points map like the box and stay within 0–1000', () => {
    const out = outlineToFrame([[0, 0], [1000, 1000], [-20, 1200]], crop, W, H);
    expect(out[0][1]).toBeCloseTo(125);
    expect(out[1][1]).toBeCloseTo(875);
    expect(out[2]).toEqual([0, expect.any(Number)]);
    expect(out[2][1]).toBeLessThanOrEqual(1000);
    expect(outlineToFrame(null, crop, W, H)).toBeNull();
  });
});

describe('sticker square', () => {
  test('a square around the object with some air, in whole pixels inside the frame', () => {
    // предмет 240×320 px + по 6 % повітря → квадрат по довшій стороні,
    // центр — центр предмета (600, 800)
    const c = stickerCrop(1200, 1600, [400, 400, 600, 600]);
    expect(c).toEqual({ L: 344, T: 544, S: 512 });
    expect(c.L + c.S / 2).toBe(600);
    expect(c.T + c.S / 2).toBe(800);
  });

  test('an object at the edge pushes the square inside, never past the frame', () => {
    for (const box of [[0, 0, 100, 100], [900, 900, 1000, 1000], [0, 0, 1000, 1000], [480, 0, 520, 1000]]) {
      const { L, T, S } = stickerCrop(1200, 1600, box);
      expect(L).toBeGreaterThanOrEqual(0);
      expect(T).toBeGreaterThanOrEqual(0);
      expect(L + S).toBeLessThanOrEqual(1200);
      expect(T + S).toBeLessThanOrEqual(1600);
    }
  });

  test('the outline is re-expressed in the square, 0–1', () => {
    const crop = { L: 100, T: 200, S: 400 };
    // [y, x] у 0–1000 кадру 1000×1000 → [x, y] у частках квадрата
    expect(shapeInCrop([[200, 100], [600, 500]], 1000, 1000, crop)).toEqual([[0, 0], [1, 1]]);
    expect(shapeInCrop(null, 1000, 1000, crop)).toBeNull();
  });
});

test('captureScene renders the screen image first, then the small one for the model', async () => {
  const shot = await captureScene('frame', 1200, 1600);
  expect(calls.map((c) => c.ops)).toEqual([
    [{ crop: { originX: 150, originY: 0, width: 900, height: 1600 } }, { resize: { width: 900 } }],
    [{ crop: { originX: 150, originY: 0, width: 900, height: 1600 } }, { resize: { width: 720 } }],
  ]);
  expect(shot.base64).toBe('B64');
  expect(shot.crop).toEqual({ x: 150, y: 0, width: 900, height: 1600 });
  expect(shot.image).toEqual({ uri: 'file:///out1.jpg', width: 900, height: 1600 });

  calls.length = 0;
  const big = await captureScene('frame', 3024, 4032);
  expect(calls.map((c) => c.ops[1].resize.width)).toEqual([1080, 720]);
  expect(big.image.width).toBe(1080);
});

describe('sticker cutter', () => {
  const objects = [
    { key: 'a', box: [100, 100, 300, 300], outline: null },
    { key: 'b', box: [500, 500, 700, 700], outline: [[500, 500], [500, 700], [700, 700], [700, 500], [600, 500], [550, 500]] },
  ];
  const crop = { x: 150, y: 0, width: 900, height: 1600 };

  test('eager: cuts every object from the full frame, one after another, then says done', async () => {
    const cutter = createCutter({ source: 'frame', width: 1200, height: 1600, crop, objects, eager: true });
    await cutter.done;
    expect(calls).toHaveLength(2);
    expect(calls.every((c) => c.source === 'frame')).toBe(true);
    const b = await cutter.get('b');
    expect(b.uri).toMatch(/^file:\/\/\/out/);
    expect(b.shape).toHaveLength(6);
    // повторний запит — з пам'яті, без нового вирізання
    await cutter.get('a');
    expect(calls).toHaveLength(2);
  });

  test('lazy: nothing is cut until a word is actually saved', async () => {
    const cutter = createCutter({ source: 'photo.jpg', width: 1080, height: 1920, crop: { x: 0, y: 0, width: 1080, height: 1920 }, objects });
    await cutter.done;
    expect(calls).toHaveLength(0);
    await cutter.get('a');
    expect(calls).toHaveLength(1);
    expect(await cutter.get('missing')).toEqual({ uri: null, shape: null });
  });
});
