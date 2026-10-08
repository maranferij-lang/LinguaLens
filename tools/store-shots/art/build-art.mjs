// Раструє намальований арт і обводить силует кожного предмета так, як його
// віддала б застосунку модель розпізнавання (16–32 точки):
//   WORK/art/obj-<name>.jpg    «фото» предмета, 800×800 (з нього ріжеться наліпка)
//   WORK/art/hero.jpg          чашка на столі, 1080×1920 (кадр сканера на кадрі 1)
//   WORK/art/hero-sticker.jpg  те саме фото з білою підкладкою під вирубкою
//                              чашки: з нього кадр 1 ріже наліпку по контуру,
//                              як застосунок
//   WORK/art/kitchen.jpg       кухня, 1080×1920
//   WORK/art/shapes.json       { objects: {name: {shape}}, hero: {...}, kitchen: {...} }
// shape   = [[x, y], …] 0–1 у квадратному фото (по ньому обрізає наліпка);
// box     = [y1, x1, y2, x2] 0–1000, outline = [[y, x], …] 0–1000 (формат сервера).
// Тло «фото» в межах вирубки кожної наліпки — біле, як облямівка (backing.js):
// без цього в ручці чашки видно стіну, а під дном — стіл.
import fs from 'fs';
import path from 'path';
import { OBJECTS, objectPhotoSvg, objectSvg } from './objects.mjs';
import { heroScene, kitchenScene, sceneSvg } from './scenes.mjs';
import { GROW, backedKeys, heroCut, objectCut, sceneCut } from './backing.js';
import { ART as OUT, isMain, launch } from '../paths.mjs';


// Працює в сторінці: SVG → canvas → маска → розширення → заливка дірок →
// обхід зовнішнього контуру (окіл Мура) → N точок, рівномірно за довжиною.
const PAGE_LIB = `
window.load = (svg) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
window.raster = async (svg, w, h, type = 'image/jpeg', q = 0.93) => {
  const img = await load(svg); const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); if (type === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
  g.drawImage(img, 0, 0, w, h); return c.toDataURL(type, q).split(',')[1];
};
// Фото з білою підкладкою: у межах вирубок cuts ({d, x, y}, px фото, плюс
// grow px) тло фото замінене білим, а предмети й те, що перед ними (front —
// той самий кадр без тла, на білому), лишаються. Поза вирубками — фото як є.
window.backed = async (photo, front, w, h, cuts, grow, q = 0.93) => {
  const [p, f] = await Promise.all([load(photo), load(front)]);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  const layer = (img) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h); return g.getImageData(0, 0, w, h); };
  const P = layer(p), F = layer(f);
  g.clearRect(0, 0, w, h);
  g.fillStyle = '#000'; g.strokeStyle = '#000'; g.lineWidth = grow * 2; g.lineJoin = 'round';
  for (const { d, x, y } of cuts) {
    const path = new Path2D(d);
    g.save(); g.translate(x, y); g.fill(path); if (grow) g.stroke(path); g.restore();
  }
  const M = g.getImageData(0, 0, w, h).data;
  for (let i = 0; i < M.length; i += 4) {
    const a = M[i + 3] / 255; if (!a) continue;
    for (let k = 0; k < 3; k++) P.data[i + k] = Math.round(P.data[i + k] * (1 - a) + F.data[i + k] * a);
  }
  g.putImageData(P, 0, 0);
  return c.toDataURL('image/jpeg', q).split(',')[1];
};
window.trace = async (svg, W, H, k, N, dil) => {
  const w = Math.round(W * k), h = Math.round(H * k);
  const img = await load(svg); const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
  const a = g.getImageData(0, 0, w, h).data;
  let m = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) m[i] = a[i * 4 + 3] > 40 ? 1 : 0;
  // розширення (коло радіуса dil)
  const d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (!m[y * w + x]) continue;
    for (let dy = -dil; dy <= dil; dy++) for (let dx = -dil; dx <= dil; dx++) {
      if (dx * dx + dy * dy > dil * dil) continue;
      const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < w && Y < h) d[Y * w + X] = 1;
    }
  }
  m = d;
  // заливка дірок: тло заливаємо від країв
  const out = new Uint8Array(w * h); const st = [];
  for (let x = 0; x < w; x++) { st.push(x, (h - 1) * w + x); }
  for (let y = 0; y < h; y++) { st.push(y * w, y * w + w - 1); }
  while (st.length) { const i = st.pop(); if (out[i] || m[i]) continue; out[i] = 1; const x = i % w, y = (i / w) | 0;
    if (x > 0) st.push(i - 1); if (x < w - 1) st.push(i + 1); if (y > 0) st.push(i - w); if (y < h - 1) st.push(i + w); }
  for (let i = 0; i < w * h; i++) m[i] = out[i] ? 0 : 1;
  // лишаємо найбільшу пляму
  const lab = new Int32Array(w * h); let best = 0, bestN = 0, L = 0;
  for (let i = 0; i < w * h; i++) { if (!m[i] || lab[i]) continue; L++; let n = 0; const s2 = [i];
    while (s2.length) { const j = s2.pop(); if (!m[j] || lab[j]) continue; lab[j] = L; n++; const x = j % w, y = (j / w) | 0;
      if (x > 0) s2.push(j - 1); if (x < w - 1) s2.push(j + 1); if (y > 0) s2.push(j - w); if (y < h - 1) s2.push(j + w); }
    if (n > bestN) { bestN = n; best = L; } }
  for (let i = 0; i < w * h; i++) m[i] = lab[i] === best ? 1 : 0;
  let x1 = w, y1 = h, x2 = 0, y2 = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (m[y * w + x]) { x1 = Math.min(x1, x); x2 = Math.max(x2, x); y1 = Math.min(y1, y); y2 = Math.max(y2, y); }
  // обхід Мура
  const at = (x, y) => x >= 0 && y >= 0 && x < w && y < h && m[y * w + x];
  const dirs = [[-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1]];
  let s0 = m.indexOf(1); const sx = s0 % w, sy = (s0 / w) | 0;
  let cx = sx, cy = sy, b = 0; const pts = [[cx + 0.5, cy + 0.5]];
  for (let it = 0; it < w * h * 4; it++) {
    let moved = false;
    for (let kk = 1; kk <= 8; kk++) {
      const dd = (b + kk) % 8; const nx = cx + dirs[dd][0], ny = cy + dirs[dd][1];
      if (at(nx, ny)) { const pd = (b + kk - 1) % 8; const bx = cx + dirs[pd][0], by = cy + dirs[pd][1];
        cx = nx; cy = ny; b = dirs.findIndex(([ex, ey]) => ex === bx - cx && ey === by - cy); moved = true; break; }
    }
    if (!moved || (cx === sx && cy === sy)) break;
    pts.push([cx + 0.5, cy + 0.5]);
  }
  // перерозподіл точок за довжиною дуги
  const segs = []; let tot = 0;
  for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; const l = Math.hypot(q[0] - p[0], q[1] - p[1]); segs.push(l); tot += l; }
  const res = []; let acc = 0, si = 0;
  for (let n = 0; n < N; n++) { const target = (n / N) * tot;
    while (si < pts.length - 1 && acc + segs[si] < target) { acc += segs[si]; si++; }
    const p = pts[si], q = pts[(si + 1) % pts.length]; const t = segs[si] ? (target - acc) / segs[si] : 0;
    res.push([(p[0] + (q[0] - p[0]) * t) / k, (p[1] + (q[1] - p[1]) * t) / k]); }
  return { pts: res, bbox: [x1 / k, y1 / k, (x2 + 1) / k, (y2 + 1) / k] };
};
`;

export async function buildArt() {
  fs.mkdirSync(OUT, { recursive: true });
  // прозорий шар чашки зі старих версій рендера: наліпку кадру 1 тепер
  // ріжемо з фото (hero-sticker.jpg), як застосунок
  for (const f of fs.readdirSync(OUT)) if (/^hero-.+\.png$/.test(f)) fs.rmSync(path.join(OUT, f));
  const browser = await launch();
  const page = await browser.newPage();
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: PAGE_LIB });
  const r3 = (v) => Math.round(v * 1000) / 1000;
  const shapes = { objects: {}, hero: null, kitchen: null };

  const save = (file, b64) => fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64'));

  // окремі предмети: фото видно лише крізь вирубку наліпки, тож біла
  // підкладка — на всю вирубку
  const PX = 800;
  for (const name of Object.keys(OBJECTS)) {
    const t = await page.evaluate(([svg]) => trace(svg, 1000, 1000, 0.3, 32, 4), [objectSvg(name)]);
    const base = t.bbox[3];
    const shape = t.pts.map(([x, y]) => [r3(x / 1000), r3(y / 1000)]);
    const cuts = [objectCut(shape, PX)];
    save(`obj-${name}.jpg`, await page.evaluate(([a, b, w, cuts, grow]) => backed(a, b, w, w, cuts, grow), [objectPhotoSvg(name, 1000, base), objectSvg(name), PX, cuts, GROW]));
    shapes.objects[name] = { shape, bbox: t.bbox.map((v) => r3(v / 1000)) };
  }

  // сцени
  for (const [key, sc] of [['hero', heroScene()], ['kitchen', kitchenScene()]]) {
    const objs = {};
    for (const o of sc.objects) {
      // hero — щільний контур (розширення 1 px), бо кадр 1 показує його
      // великим; кухня — з запасом, як від моделі
      const dil = key === 'hero' ? 1 : 2;
      const t = await page.evaluate(([svg, w, h, dil]) => trace(svg, w, h, 0.25, 28, dil), [sceneSvg(sc, o.key), sc.width, sc.height, dil]);
      const [x1, y1, x2, y2] = t.bbox;
      objs[o.key] = {
        box: [y1 / sc.height, x1 / sc.width, y2 / sc.height, x2 / sc.width].map((v) => Math.round(v * 1000)),
        outline: t.pts.map(([x, y]) => [Math.round((y / sc.height) * 1000), Math.round((x / sc.width) * 1000)]),
      };
    }
    shapes[key] = { width: sc.width, height: sc.height, objects: objs };
    const W = sc.width, H = sc.height;
    const front = sceneSvg(sc, null, { bg: false });
    const withBacking = (cuts) => page.evaluate(([a, b, w, h, cuts, grow]) => backed(a, b, w, h, cuts, grow), [sceneSvg(sc), front, W, H, cuts, GROW]);
    if (key === 'hero') {
      // кадр сканера — фото як є; наліпку кадр 1 ріже з копії з підкладкою
      save('hero.jpg', await page.evaluate(([svg, w, h]) => raster(svg, w, h), [sceneSvg(sc), W, H]));
      save('hero-sticker.jpg', await withBacking([heroCut(objs.mug, W, H)]));
    } else {
      // фото сцени видно й довкола піднятих предметів, але підкладку (лише
      // на GROW px за вирубкою) там закриває біла облямівка їхніх наліпок
      save(`${key}.jpg`, await withBacking(backedKeys(Object.keys(objs)).map((k) => sceneCut(objs[k].outline, W, H))));
    }
  }
  fs.writeFileSync(path.join(OUT, 'shapes.json'), JSON.stringify(shapes));
  await browser.close();
  console.log('art →', OUT);
  return shapes;
}

if (isMain(import.meta.url)) await buildArt();
