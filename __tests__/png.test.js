// tools/png.js — єдиний PNG-кодек проєкту (іконки, бренд, кадри App Store).
// Після злиття store-shots у ньому те, що мав tools/png.mjs: info, flatten і
// чанк sRGB; а іконка 192 px досі виходить байт у байт така, як у
// репозиторії (export-app-icon.mjs).
import fs from 'fs';
import path from 'path';

const { SIG, info, decode, resize, flatten, dropAlpha, encode } = require('../tools/png');

const ROOT = path.join(__dirname, '..');

// Картинка w × h з каналами ch: кожен байт залежить від x, y і каналу, щоб
// усі п'ять фільтрів рядка мали що вибирати
function pattern(w, h, ch, alpha = () => 255) {
  const data = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * ch;
      data[o] = (x * 37 + y * 11) & 0xff;
      data[o + 1] = (x * y + 3) & 0xff;
      data[o + 2] = (255 - x * 5 - y * 7) & 0xff;
      if (ch === 4) data[o + 3] = alpha(x, y);
    }
  }
  return { width: w, height: h, channels: ch, data };
}

// Типи чанків у файлі по порядку
function chunkTypes(buf) {
  const out = [];
  for (let off = 8; off < buf.length; off += 12 + buf.readUInt32BE(off)) out.push(buf.toString('latin1', off + 4, off + 8));
  return out;
}

describe('encode / decode', () => {
  test.each([3, 4])('%i channels: what is written is read back exactly', (ch) => {
    const img = pattern(37, 23, ch, (x, y) => (x + y) % 256);
    const buf = encode(img);
    expect(buf.subarray(0, 8).equals(SIG)).toBe(true);
    const back = decode(buf);
    expect([back.width, back.height, back.channels]).toEqual([37, 23, ch]);
    expect(back.data.equals(img.data)).toBe(true);
  });

  test('a path works as well as a buffer; anything else is “not a PNG”', () => {
    const icon = path.join(ROOT, 'assets/app-icon-192.png');
    expect(decode(icon).data.equals(decode(fs.readFileSync(icon)).data)).toBe(true);
    expect(() => decode(Buffer.from('GIF89a'))).toThrow(/not a PNG/);
  });
});

describe('info', () => {
  test('reads the header without unpacking: size, depth and colour type', () => {
    expect(info(encode(pattern(5, 3, 3)))).toEqual({ width: 5, height: 3, depth: 8, color: 2, interlace: 0 });
    expect(info(encode(pattern(5, 3, 4)))).toMatchObject({ color: 6 });
    expect(info(path.join(ROOT, 'assets/icon.png'))).toMatchObject({ width: 1024, height: 1024, color: 2 });
  });
});

describe('flatten', () => {
  test('RGBA becomes RGB: opaque pixels stay, transparent take the background, half-transparent blend', () => {
    const img = {
      width: 3,
      height: 1,
      channels: 4,
      data: Buffer.from([10, 20, 30, 255, 200, 100, 50, 0, 200, 100, 0, 128]),
    };
    const out = flatten(img, [0, 0, 255]);
    expect(out.channels).toBe(3);
    expect([...out.data]).toEqual([
      10, 20, 30,
      0, 0, 255,
      Math.round((200 * 128) / 255), Math.round((100 * 128) / 255), Math.round((255 * 127) / 255),
    ]);
    // типово тло чорне
    expect([...flatten(img).data.subarray(3, 6)]).toEqual([0, 0, 0]);
  });

  test('RGB is returned as it is; unlike dropAlpha, transparency is not an error', () => {
    const rgb = pattern(4, 4, 3);
    expect(flatten(rgb)).toBe(rgb);
    const see = pattern(4, 4, 4, (x) => (x ? 255 : 0));
    expect(() => dropAlpha(see)).toThrow(/transparent pixel/);
    expect(flatten(see).channels).toBe(3);
  });
});

describe('sRGB chunk (App Store frames)', () => {
  test('only on request, right after IHDR; the pixels are the same', () => {
    const img = pattern(16, 16, 3);
    const plain = encode(img);
    const srgb = encode(img, { srgb: true });
    expect(chunkTypes(plain)).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(chunkTypes(srgb)).toEqual(['IHDR', 'sRGB', 'IDAT', 'IEND']);
    expect(decode(srgb).data.equals(img.data)).toBe(true);
  });
});

describe('resize', () => {
  test('area averaging: a 2 × 2 block becomes its mean', () => {
    const img = { width: 2, height: 2, channels: 3, data: Buffer.from([0, 0, 0, 100, 100, 100, 200, 200, 200, 100, 0, 255]) };
    expect([...resize(img, 1, 1).data]).toEqual([100, 75, 139]);
  });

  // Той самий шлях, що в tools/export-app-icon.mjs: icon.png 1024 → 192.
  // Збіг байт у байт означає, що кодек після злиття пише так само, як писав.
  test('assets/app-icon-192.png comes out of assets/icon.png byte for byte', () => {
    const src = decode(path.join(ROOT, 'assets/icon.png'));
    const out = encode(resize(src, 192, Math.round((192 * src.height) / src.width)));
    expect(out.equals(fs.readFileSync(path.join(ROOT, 'assets/app-icon-192.png')))).toBe(true);
  });
});

// Після злиття store-shots кодек один: tools/png.mjs видалено, скрипти
// кадрів App Store беруть той самий tools/png.js, що й іконки.
describe('one codec', () => {
  test('tools/png.mjs is gone; every script imports tools/png.js', () => {
    expect(fs.existsSync(path.join(ROOT, 'tools/png.mjs'))).toBe(false);
    const scripts = ['tools/export-app-icon.mjs', 'tools/export-brand.mjs', 'tools/store-shots/render.mjs', 'tools/store-shots/compose.mjs'];
    for (const f of scripts) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
      expect([f, /png\.mjs/.test(src), /png\.js'/.test(src)]).toEqual([f, false, true]);
    }
  });
});
