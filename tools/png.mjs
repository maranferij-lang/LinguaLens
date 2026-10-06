// PNG без залежностей: читання, запис, зменшення й зведення на непрозоре тло.
// Лише zlib з Node. Підтримує те, що дають наші джерела: 8 біт на канал,
// RGB (тип кольору 2) чи RGBA (тип 6), без черезрядковості.
//
// Користувачі: tools/export-app-icon.mjs (зменшена іконка) і
// tools/store-shots (кадри App Store мусять бути PNG без альфа-каналу).
import fs from 'node:fs';
import zlib from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function chunks(buf) {
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG');
  const list = [];
  let off = 8;
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    list.push({ type, body: buf.subarray(off + 8, off + 8 + len) });
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return list;
}

const asBuffer = (src) => (Buffer.isBuffer(src) ? src : fs.readFileSync(src));

// Заголовок: { width, height, depth, color, interlace } — для перевірок
// (кадр App Store: color 2, тобто RGB без альфи).
export function info(src) {
  const ihdr = chunks(asBuffer(src)).find((c) => c.type === 'IHDR').body;
  const [depth, color, , , interlace] = ihdr.subarray(8, 13);
  return { width: ihdr.readUInt32BE(0), height: ihdr.readUInt32BE(4), depth, color, interlace };
}

// → { width, height, channels, data } (8 біт на канал, без черезрядковості)
export function decode(src) {
  const list = chunks(asBuffer(src));
  const ihdr = list.find((c) => c.type === 'IHDR').body;
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, color, , , interlace] = ihdr.subarray(8, 13);
  const channels = { 2: 3, 6: 4 }[color];
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG: depth ${depth}, color ${color}, interlace ${interlace}`);
  const raw = zlib.inflateSync(Buffer.concat(list.filter((c) => c.type === 'IDAT').map((c) => c.body)));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = y * stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? data[row + i - channels] : 0;
      const b = y ? data[row - stride + i] : 0;
      const c = y && i >= channels ? data[row - stride + i - channels] : 0;
      const pred = filter === 0 ? 0 : filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : paeth(a, b, c);
      data[row + i] = (line[i] + pred) & 0xff;
    }
  }
  return { width, height, channels, data };
}

// Ваги усереднення за площею для однієї осі: для кожного пікселя
// результату — які пікселі джерела в нього падають і якою часткою.
function weights(from, to) {
  const k = from / to;
  return Array.from({ length: to }, (_, o) => {
    const start = o * k;
    const end = start + k;
    const list = [];
    for (let i = Math.floor(start); i < Math.min(from, Math.ceil(end)); i++) {
      const w = Math.min(end, i + 1) - Math.max(start, i);
      if (w > 0) list.push([i, w / k]);
    }
    return list;
  });
}

// Зменшення усередненням за площею (для зменшення в кілька разів чесніше за
// найближчого сусіда й не мильніше за білінійне).
export function resize(img, w, h) {
  const { width, height, channels: ch, data } = img;
  const wx = weights(width, w);
  const wy = weights(height, h);
  // спершу по горизонталі (w × height), потім по вертикалі
  const mid = new Float64Array(w * height * ch);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < w; x++) {
      for (const [sx, wt] of wx[x]) {
        for (let c = 0; c < ch; c++) mid[(y * w + x) * ch + c] += data[(y * width + sx) * ch + c] * wt;
      }
    }
  }
  const out = Buffer.alloc(w * h * ch);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      for (let c = 0; c < ch; c++) {
        let v = 0;
        for (const [sy, wt] of wy[y]) v += mid[(sy * w + x) * ch + c] * wt;
        out[(y * w + x) * ch + c] = Math.max(0, Math.min(255, Math.round(v)));
      }
    }
  }
  return { width: w, height: h, channels: ch, data: out };
}

// RGBA → RGB: зводимо на непрозоре тло (типово чорне), альфа-каналу більше
// немає. RGB повертається як є.
export function flatten(img, bg = [0, 0, 0]) {
  if (img.channels === 3) return img;
  const { width, height, data } = img;
  const out = Buffer.alloc(width * height * 3);
  for (let i = 0, j = 0; i < data.length; i += 4, j += 3) {
    const a = data[i + 3];
    if (a === 255) {
      out[j] = data[i];
      out[j + 1] = data[i + 1];
      out[j + 2] = data[i + 2];
    } else {
      for (let c = 0; c < 3; c++) out[j + c] = Math.round((data[i + c] * a + bg[c] * (255 - a)) / 255);
    }
  }
  return { width, height, channels: 3, data: out };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

// sRGB (rendering intent: perceptual) — App Store чекає sRGB.
const SRGB = Buffer.from([0]);

// Фільтр рядка — той, що дає найменшу суму відхилень (звична евристика).
// RGB → тип кольору 2, RGBA → 6.
export function encode({ width, height, channels: ch, data }, { srgb = false } = {}) {
  const stride = width * ch;
  const rows = [];
  const line = Buffer.alloc(stride + 1);
  for (let y = 0; y < height; y++) {
    let best = null;
    const row = y * stride;
    for (let f = 0; f < 5; f++) {
      line[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? data[row + i - ch] : 0;
        const b = y ? data[row - stride + i] : 0;
        const c = y && i >= ch ? data[row - stride + i - ch] : 0;
        const pred = f === 0 ? 0 : f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (data[row + i] - pred) & 0xff;
        line[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (!best || score < best.score) best = { line: Buffer.from(line), score };
    }
    rows.push(best.line);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, ch === 4 ? 6 : 2, 0, 0, 0], 8);
  return Buffer.concat([
    SIG,
    chunk('IHDR', ihdr),
    ...(srgb ? [chunk('sRGB', SRGB)] : []),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
