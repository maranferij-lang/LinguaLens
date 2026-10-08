// Вирізання наліпок: усі вирізання йдуть по одному (також на вимогу, коли
// «Зберегти всі» тисне одразу після появи сцени), а крива рамка від сервера не
// ламає ні наліпку, ні чергу (scanner-cutter-parallel-cuts,
// scanner-input-hardening, hygiene-duplicate-helpers).
import { boxToFrame, createCutter, cropToObject, renderAndSave, stickerCrop } from '../src/cutout';

// Кожен ланцюжок ImageManipulator стоїть, доки тест не скаже finish():
// так видно, скільки вирізань працює одночасно і в якому порядку вони стартують.
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const rec = { source, ops: [] };
    global.__calls.push(rec);
    const c = {
      crop: (r) => (rec.ops.push({ crop: r }), c),
      resize: (r) => (rec.ops.push({ resize: r }), c),
      renderAsync: () =>
        new Promise((resolve) => {
          global.__active += 1;
          global.__max = Math.max(global.__max, global.__active);
          rec.finish = () => {
            global.__active -= 1;
            resolve({ saveAsync: async () => ({ uri: 'file:///cut' + global.__calls.indexOf(rec) + '.jpg' }), release() {} });
          };
        }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

beforeEach(() => {
  global.__calls = [];
  global.__active = 0;
  global.__max = 0;
});

// усі мікрозадачі, що вже стоять у черзі
const tick = () => new Promise((r) => setTimeout(r, 0));
async function finishNext(n = 1) {
  for (let i = 0; i < n; i++) {
    await tick();
    const running = global.__calls.find((c) => c.finish);
    running.finish();
    delete running.finish;
  }
  await tick();
}

const W = 1200;
const H = 1600;
const crop = { x: 150, y: 0, width: 900, height: 1600 };
const objects = [
  { key: 'a', box: [100, 100, 300, 300], outline: null },
  { key: 'b', box: [400, 400, 600, 600], outline: null },
  { key: 'c', box: [700, 650, 900, 850], outline: null },
  { key: 'd', box: [200, 700, 400, 900], outline: null },
];
const originOf = (o) => stickerCrop(W, H, boxToFrame(o.box, crop, W, H)).L;
const cutter = (extra) => createCutter({ source: 'frame', width: W, height: H, crop, objects, ...extra });

describe('sticker cutter queue', () => {
  test('“Save all” right after the reveal: four on-demand cuts run one at a time', async () => {
    const c = cutter();
    const all = Promise.all(objects.map((o) => c.get(o.key)));
    await tick();
    expect(global.__active).toBe(1);
    expect(global.__calls).toHaveLength(1);
    await finishNext(4);
    const list = await all;
    expect(list.map((x) => x.uri)).toHaveLength(4);
    expect(list.every((x) => /^file:\/\/\/cut\d+\.jpg$/.test(x.uri))).toBe(true);
    expect(global.__max).toBe(1);
    expect(global.__calls).toHaveLength(4);
  });

  test('eager: the frame is cut in order, one at a time, and done says when the last one is over', async () => {
    const c = cutter({ eager: true });
    let done = false;
    c.done.then(() => (done = true));
    await tick();
    expect(global.__calls).toHaveLength(1);
    expect(global.__calls[0].ops[0].crop.originX).toBe(originOf(objects[0]));
    await finishNext(1);
    expect(global.__calls[1].ops[0].crop.originX).toBe(originOf(objects[1]));
    expect(done).toBe(false);
    await finishNext(3);
    expect(done).toBe(true);
    expect(global.__max).toBe(1);
  });

  test('a word the person taps jumps the queue: it is cut right after the one already running', async () => {
    const c = cutter({ eager: true });
    await tick();
    const wanted = c.get('d');
    await finishNext(1); // «a» закінчилась
    expect(global.__calls[1].ops[0].crop.originX).toBe(originOf(objects[3]));
    await finishNext(1);
    expect((await wanted).uri).toMatch(/^file:\/\/\/cut/);
    // решта йде далі за порядком: b, потім c
    expect(global.__calls[2].ops[0].crop.originX).toBe(originOf(objects[1]));
    await finishNext(2);
    await c.done;
    expect(global.__calls).toHaveLength(4);
  });

  test('the same key is the same promise, and a finished cut comes from memory', async () => {
    const c = cutter({ eager: true });
    expect(c.get('a')).toBe(c.get('a'));
    await finishNext(4);
    await c.done;
    const before = global.__calls.length;
    const again = await c.get('c');
    expect(again.uri).toMatch(/^file:\/\/\/cut/);
    expect(global.__calls).toHaveLength(before);
  });

  test('lazy: nothing happens until a word is asked for; an unknown key is an empty cut', async () => {
    const c = cutter();
    await c.done;
    await tick();
    expect(global.__calls).toHaveLength(0);
    expect(await c.get('missing')).toEqual({ uri: null, shape: null });
  });

  test('an object with a broken box gives an empty cut and does not block the rest of the queue', async () => {
    const c = createCutter({
      source: 'frame',
      width: W,
      height: H,
      crop,
      objects: [{ key: 'bad' }, ...objects.slice(0, 2)],
      eager: true,
    });
    const bad = await c.get('bad');
    expect(bad).toEqual({ uri: null, shape: null });
    await finishNext(2);
    await c.done;
    expect(global.__calls).toHaveLength(2);
  });
});

describe('a box from the server is not trusted blindly', () => {
  test('stickerCrop gives null for a box that is not four finite numbers, is upside down or is a speck', () => {
    expect(stickerCrop(W, H, null)).toBeNull();
    expect(stickerCrop(W, H, [1, 2, 3])).toBeNull();
    expect(stickerCrop(W, H, [NaN, 100, 300, 300])).toBeNull();
    expect(stickerCrop(W, H, [100, Infinity, 300, 300])).toBeNull();
    expect(stickerCrop(W, H, ['100', 100, 300, 300])).toBeNull();
    // перевернута: раніше давала S < 0
    expect(stickerCrop(W, H, [500, 500, 300, 300])).toBeNull();
    // кадр завбільшки з піксель
    expect(stickerCrop(4, 4, [0, 0, 1000, 1000])).toBeNull();
  });

  test('a good box is cut exactly as before', () => {
    expect(stickerCrop(1200, 1600, [400, 400, 600, 600])).toEqual({ L: 344, T: 544, S: 512 });
    expect(stickerCrop(1200, 1600, [0, 0, 1000, 1000])).toEqual({ L: 0, T: 200, S: 1200 });
  });

  test('cropToObject falls back to the whole frame (no crop operation) instead of failing silently', async () => {
    const run = cropToObject('frame', W, H, [500, 500, 300, 300], null);
    await tick();
    expect(global.__calls).toHaveLength(1);
    expect(global.__calls[0].ops.map((o) => Object.keys(o)[0])).toEqual(['resize']);
    global.__calls[0].finish();
    const out = await run;
    expect(out.uri).toMatch(/^file:\/\/\/cut/);
    expect(out.shape).toBeNull();
  });

  test('cropToObject with a good box crops a square', async () => {
    const run = cropToObject('frame', W, H, [400, 400, 600, 600], null);
    await tick();
    expect(global.__calls[0].ops[0]).toEqual({ crop: { originX: 344, originY: 544, width: 512, height: 512 } });
    global.__calls[0].finish();
    await run;
  });
});

describe('renderAndSave', () => {
  test('releases what it can and tolerates a context or an image without release()', async () => {
    const saved = { uri: 'file:///x.jpg' };
    const context = { renderAsync: async () => ({ saveAsync: async () => saved }) };
    await expect(renderAndSave(context, {})).resolves.toBe(saved);

    const release = jest.fn();
    const full = { renderAsync: async () => ({ saveAsync: async () => saved, release }), release };
    await expect(renderAndSave(full, {})).resolves.toBe(saved);
    expect(release).toHaveBeenCalledTimes(2);
  });

  test('releases even when saving fails', async () => {
    const release = jest.fn();
    const context = { renderAsync: async () => ({ saveAsync: async () => Promise.reject(new Error('disk')), release }), release };
    await expect(renderAndSave(context, {})).rejects.toThrow('disk');
    expect(release).toHaveBeenCalledTimes(2);
  });
});
