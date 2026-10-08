// Доказ прозорості: справжні PNG наліпок, розібрані побайтово.
//
// __tests__/fixtures/stickers/*.png — чотири види з цієї гілки (StickerArt,
// шрифти Nunito, фото чашки), відрендерені react-native-web і зняті ×3
// html2canvas з прозорим полотном (backgroundColor: null). Так само малює й
// iOS: view-shot бере UIGraphicsImageRenderer з opaque = NO, і де в кореня
// немає тла, там у PNG альфа 0 (share.md §4). Скрипт, що їх знімає, —
// scratchpad v13/build/W4/work/alpha-shoot.mjs (сторінка ?share=alpha&alpha=1).
//
// Перевіряємо: розмір — рівно ×3 від логічного (900 × h·3), формат RGBA,
// кути повністю прозорі, прозорого — значна частка кадру, а сама наліпка
// непрозора. Декодер PNG — нижче, без залежностей (zlib із Node).
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { STICKER_MIN_H, sceneSetLayout, stickerPixels } from '../src/share/layout';

function decodePng(buf) {
  const SIG = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== SIG) throw new Error('not a PNG');
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.subarray(pos + 4, pos + 8).toString('ascii');
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), depth: data[8], color: data[9], interlace: data[12] };
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  const { width, height, depth, color, interlace } = ihdr;
  if (depth !== 8 || color !== 6 || interlace !== 0) return { ...ihdr, pixels: null };
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? out[y * stride + x - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + x] : 0;
      const c = x >= bpp && y > 0 ? out[(y - 1) * stride + x - bpp] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[y * stride + x] = v & 0xff;
    }
  }
  return { ...ihdr, pixels: out };
}

const alphaAt = (img, x, y) => img.pixels[(y * img.width + x) * 4 + 3];

// Об'єкти сцени на сторінці зйомки (українською, як і решта знімків)
const SCENE = [
  ['kettle', 'чайник'], ['lemon', 'лимон'], ['cutting board', 'обробна дошка'], ['frying pan', 'сковорідка'], ['jar', 'банка'],
  ['apple', 'яблуко'], ['mug', 'кружка'], ['towel', 'рушник'], ['plant', 'рослина'], ['window', 'вікно'],
].map(([word, translation], i) => ({ key: 'o' + i, word, translation }));

const CASES = [
  ['object', stickerPixels(STICKER_MIN_H.object)],
  ['word', stickerPixels(STICKER_MIN_H.word)],
  ['scene', stickerPixels(sceneSetLayout(SCENE).height)],
  ['badge', stickerPixels(STICKER_MIN_H.badge)],
];

const load = (kind) => decodePng(fs.readFileSync(path.join(__dirname, 'fixtures', 'stickers', kind + '.png')));

test('the object sticker is exactly 900×1116', () => {
  expect(stickerPixels(STICKER_MIN_H.object)).toEqual({ w: 900, h: 1116 });
  const img = load('object');
  expect([img.width, img.height]).toEqual([900, 1116]);
});

describe.each(CASES)('%s', (kind, size) => {
  const img = load(kind);

  test('×3 of the measured layout, RGBA with an alpha channel', () => {
    expect(img.width).toBe(size.w);
    expect(img.height).toBe(size.h);
    expect(img.color).toBe(6);
    expect(img.depth).toBe(8);
  });

  test('corners are fully transparent', () => {
    const w = img.width - 1;
    const h = img.height - 1;
    for (const [x0, y0] of [[0, 0], [w - 4, 0], [0, h - 4], [w - 4, h - 4]]) {
      for (let dy = 0; dy < 5; dy++) for (let dx = 0; dx < 5; dx++) expect(alphaAt(img, x0 + dx, y0 + dy)).toBe(0);
    }
  });

  test('much of the frame is transparent, the sticker itself is opaque', () => {
    let clear = 0;
    let solid = 0;
    const total = img.width * img.height;
    for (let i = 0; i < total; i++) {
      const a = img.pixels[i * 4 + 3];
      if (a === 0) clear++;
      else if (a === 255) solid++;
    }
    // без тла: прозорого — щонайменше третина кадру, і є що показати
    expect(clear / total).toBeGreaterThan(0.33);
    expect(solid / total).toBeGreaterThan(0.12);
    // середина кадру — це наліпка, а не дірка (у сцени між фішками є
    // проміжки, тож дивимось на центральну третину, а не на одну точку)
    let middle = 0;
    for (let y = Math.round(img.height / 3); y < Math.round((img.height * 2) / 3); y += 3) {
      for (let x = Math.round(img.width / 3); x < Math.round((img.width * 2) / 3); x += 3) if (alphaAt(img, x, y) === 255) middle++;
    }
    expect(middle).toBeGreaterThan(1000);
  });
});

test('the decoder itself: a 2×1 PNG with one clear and one solid pixel', () => {
  // фільтр 0, RGBA: прозорий білий і непрозорий фіолетовий
  const raw = Buffer.from([0, 255, 255, 255, 0, 0x5b, 0x4f, 0xd6, 255]);
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    return Buffer.concat([len, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  const img = decodePng(png);
  expect([alphaAt(img, 0, 0), alphaAt(img, 1, 0)]).toEqual([0, 255]);
});
