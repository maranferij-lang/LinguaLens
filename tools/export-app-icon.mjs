// Зменшена копія іконки застосунку для футера Параметрів і онбордингу
// (AppIcon у src/Logo.js): assets/icon.png 1024 px → assets/app-icon-192.png.
// Та сама картинка, що на головному екрані, а не перемальована SVG-копія:
// власник просив «наш логотип». 192 px — це 64 pt на екрані @3x.
//
// Без залежностей: PNG читаємо й пишемо самі (zlib з Node), зменшуємо
// усередненням за площею — для зменшення в 5,3 раза це чесніше за
// найближчого сусіда й не мильніше за білінійне.
//
// Запуск із кореня проєкту:  node tools/export-app-icon.mjs [розмір]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/icon.png');
const SIZE = Number(process.argv[2]) || 192;
const OUT = path.join(ROOT, `assets/app-icon-${SIZE}.png`);

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

// → { width, height, channels, data } (8 біт на канал, без черезрядковості)
function decode(file) {
  const buf = fs.readFileSync(file);
  if (!buf.subarray(0, 8).equals(SIG)) throw new Error('not a PNG: ' + file);
  let off = 8;
  let ihdr;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') ihdr = body;
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [depth, color, , , interlace] = ihdr.subarray(8, 13);
  const channels = { 2: 3, 6: 4 }[color];
  if (depth !== 8 || !channels || interlace) throw new Error(`unsupported PNG: depth ${depth}, color ${color}, interlace ${interlace}`);
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? data[y * stride + i - channels] : 0;
      const b = y ? data[(y - 1) * stride + i] : 0;
      const c = y && i >= channels ? data[(y - 1) * stride + i - channels] : 0;
      const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][filter];
      data[y * stride + i] = (line[i] + pred) & 0xff;
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

function resize(img, w, h) {
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

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

// Фільтр рядка — той, що дає найменшу суму відхилень (звична евристика).
function encode({ width, height, channels: ch, data }) {
  const stride = width * ch;
  const rows = [];
  for (let y = 0; y < height; y++) {
    let best = null;
    for (let f = 0; f < 5; f++) {
      const line = Buffer.alloc(stride + 1);
      line[0] = f;
      let score = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? data[y * stride + i - ch] : 0;
        const b = y ? data[(y - 1) * stride + i] : 0;
        const c = y && i >= ch ? data[(y - 1) * stride + i - ch] : 0;
        const pred = [0, a, b, (a + b) >> 1, paeth(a, b, c)][f];
        const v = (data[y * stride + i] - pred) & 0xff;
        line[i + 1] = v;
        score += v < 128 ? v : 256 - v;
      }
      if (!best || score < best.score) best = { line, score };
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
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const src = decode(SRC);
const png = encode(resize(src, SIZE, Math.round((SIZE * src.height) / src.width)));
fs.writeFileSync(OUT, png);
console.log(`${path.relative(ROOT, OUT)}: ${SIZE} px, ${(png.length / 1024).toFixed(1)} KB (з ${(fs.statSync(SRC).size / 1024).toFixed(0)} KB)`);
