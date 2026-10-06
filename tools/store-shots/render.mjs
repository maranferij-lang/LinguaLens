// Скріншоти App Store однією командою (напрям A, BRIEF §6.A):
//   node tools/store-shots/render.mjs
// веб-збірка версії REF (типово HEAD) → арт → знімки екранів → кадри →
// аркуші для перевірки. Результат — у OUT (типово store-shots-out/):
//   <locale>/<locale>_<nn>_<slug>.png   32 кадри 1320×2868, PNG без альфи
//   contact-<locale>.png                вісім кадрів локалі поруч (1/3)
//   search-row.png                      перші три кадри кожної локалі в
//                                       розмірі пошуку App Store (~10%)
//
// Прапорці:
//   --export          зібрати веб-версію заново (інакше — лише якщо REF
//                     змінився)
//   --frames-only     не знімати екрани наново, лише перекомпонувати
//   --only=1,5        лише ці кадри (аркуші — з тим, що вже є)
//   --locales=uk,es-MX лише ці локалі
//   --no-sheets       без аркушів
// Змінні середовища: REF, OUT, WORK, PLAYWRIGHT, CHROMIUM, PHOTOS (paths.mjs).

// copy.js — ESM без "type": "module" (його читає й jest). Node 22 визначає
// це сам і лише попереджає; попередження прибираємо до першого імпорту.
process.removeAllListeners('warning');
process.on('warning', (w) => {
  if (w.code !== 'MODULE_TYPELESS_PACKAGE_JSON') console.warn(w.stack || String(w));
});

const { execFileSync } = await import('node:child_process');
const fs = await import('node:fs');
const path = await import('node:path');
const { OUT, PHOTOS, ROOT, TMP, WEB, fileUrl, launch } = await import('./paths.mjs');
// PNG — спільним кодеком проєкту (tools/png.js, CommonJS: default-імпорт)
const { default: png } = await import('../png.js');

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const list = (name) => (args.find((a) => a.startsWith(`--${name}=`)) || '').split('=')[1]?.split(',').filter(Boolean) || [];
const t0 = Date.now();

const { STORE_LOCALES } = await import('./data.mjs');
const LOCS = list('locales').length ? list('locales') : STORE_LOCALES;
for (const l of LOCS) if (!STORE_LOCALES.includes(l)) throw new Error(`невідома локаль ${l}; є ${STORE_LOCALES.join(', ')}`);
const ONLY = list('only').map(Number);

// ─── 1. веб-збірка, арт, знімки екранів ───────────────────────────────────
const ref = process.env.REF || 'HEAD';
const wantRev = execFileSync('git', ['-C', ROOT, 'rev-parse', '--short', ref + '^{commit}'], { encoding: 'utf8' }).trim();
if (!flag('--frames-only')) {
  const { exportWeb, exportedRev } = await import('./export.mjs');
  if (flag('--export') || !fs.existsSync(path.join(WEB, 'index.html')) || exportedRev() !== wantRev) exportWeb({ ref });
  const { buildArt } = await import('./art/build-art.mjs');
  await buildArt();
  // справжні фото власника поверх намальованих (photos.mjs)
  const { applyPhotos } = await import('./photos.mjs');
  for (const w of applyPhotos(PHOTOS)) console.warn('увага:', w);
  const { captureAll } = await import('./capture.mjs');
  const report = await captureAll({ locales: LOCS });
  for (const [loc, l] of Object.entries(report)) if (l.length) console.log('capture warnings', loc, '\n  ' + l.join('\n  '));
}

// ─── 2. кадри ──────────────────────────────────────────────────────────────
const { COPY } = await import('./copy.js');
const { FRAME_NUMBERS, H, W, frameHtml } = await import('./compose.mjs');
const { exportedRev } = await import('./export.mjs');
const rev = exportedRev();
if (rev !== wantRev) console.warn(`увага: екрани знято з ${rev}, а REF=${ref} — це ${wantRev}`);

const browser = await launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
fs.mkdirSync(TMP, { recursive: true });
const name = (loc, n) => `${loc}_${String(n).padStart(2, '0')}_${COPY[loc][n - 1].slug}.png`;
const frameFile = (loc, n) => path.join(OUT, loc, name(loc, n));

// App Store: PNG без альфа-каналу, sRGB, рівно 1320×2868. Знімок Chromium —
// RGBA; зводимо на непрозоре тло й пишемо RGB (тип кольору 2) самі.
async function renderFrame(n, loc) {
  const f = path.join(TMP, `${loc}-${n}.html`);
  fs.writeFileSync(f, frameHtml(n, loc));
  await page.goto(fileUrl(f));
  await page.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 20000 });
  await page.waitForTimeout(250);
  // заголовок у два рядки, як на сусідніх кадрах (однорядковий compose
  // центрує, але краще поставити \n у copy.js)
  const lines = await page.evaluate(() => document.body.dataset.lines);
  if (lines !== '2') console.warn(`увага: ${loc} кадр ${n}: заголовок у ${lines} рядок(и); перенос \n у copy.js вирівняє його з сусідами`);
  const shot = await page.screenshot({ clip: { x: 0, y: 0, width: W, height: H } });
  const dest = frameFile(loc, n);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, png.encode(png.flatten(png.decode(shot)), { srgb: true }));
  const i = png.info(dest);
  if (i.width !== W || i.height !== H || i.color !== 2 || i.depth !== 8) throw new Error(`${dest}: ${i.width}×${i.height}, тип ${i.color} — не те, що чекає App Store`);
  return dest;
}

for (const loc of LOCS) {
  for (const n of FRAME_NUMBERS) {
    if (ONLY.length && !ONLY.includes(n)) continue;
    await renderFrame(n, loc);
    console.log('frame', path.relative(OUT, frameFile(loc, n)));
  }
}

// ─── 3. аркуші для перевірки (BRIEF §7) ────────────────────────────────────
async function sheet(sections, dest, { bg = '#F2F0EC' } = {}) {
  const fonts = path.join(ROOT, 'node_modules/@expo-google-fonts/nunito');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face { font-family: Nunito; font-weight: 800; src: url(${fileUrl(path.join(fonts, '800ExtraBold/Nunito_800ExtraBold.ttf'))}); }
    @font-face { font-family: Nunito; font-weight: 600; src: url(${fileUrl(path.join(fonts, '600SemiBold/Nunito_600SemiBold.ttf'))}); }
    body { margin: 0; padding: 40px; background: ${bg}; font-family: Nunito; display: inline-block; }
    h2 { font-weight: 800; font-size: 28px; margin: 0 0 18px; color: #1C1B19; }
    h3 { font-weight: 600; font-size: 20px; margin: -10px 0 18px; color: #6E6A62; }
    section { margin-bottom: 36px; }
    .row { display: flex; align-items: flex-start; margin-bottom: 18px; }
    .lab { width: 84px; flex: none; font-weight: 800; font-size: 20px; color: #6E6A62; padding-top: 6px; }
    img { display: block; box-shadow: 0 3px 10px rgba(0,0,0,0.12); }
  </style></head><body>${sections
    .map(({ title, note, rows, w, gap }) => {
      const h = Math.round((w * H) / W);
      const r = Math.max(5, w * 0.055);
      return `<section><h2>${title}</h2>${note ? `<h3>${note}</h3>` : ''}${rows
        .map(([label, files]) => `<div class="row"><div class="lab">${label}</div><div style="display:flex;gap:${gap}px">${files
          .map((f) => `<img src="${fileUrl(f)}" style="width:${w}px;height:${h}px;border-radius:${r}px">`)
          .join('')}</div></div>`)
        .join('')}</section>`;
    })
    .join('')}</body></html>`;
  const f = path.join(TMP, 'sheet.html');
  fs.writeFileSync(f, html);
  const p2 = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  await p2.goto(fileUrl(f));
  await p2.waitForTimeout(800);
  const box = await p2.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await p2.setViewportSize({ width: box.w + 2, height: box.h + 2 });
  await p2.screenshot({ path: dest, fullPage: true });
  await p2.close();
  console.log('sheet', path.relative(OUT, dest));
}
const files = (loc, ns) => ns.map((n) => frameFile(loc, n)).filter((f) => fs.existsSync(f));
if (!flag('--no-sheets')) {
  for (const loc of LOCS) {
    await sheet([{ title: `LinguaLens · App Store · ${loc} · ${rev}`, rows: [[loc, files(loc, FRAME_NUMBERS)]], w: 440, gap: 24 }], path.join(OUT, `contact-${loc}.png`));
  }
  // Рядок пошуку: без відео App Store показує перші три кадри, кожен
  // ~10% ширини (132 px). Тут вони мусять розповісти історію без підрядків.
  await sheet(
    [
      { title: 'Рядок пошуку App Store: кадри 1–3 при ~10% (132×287 px)', note: 'заголовок має читатися, історія — без підрядків', rows: LOCS.map((l) => [l, files(l, [1, 2, 3])]), w: 132, gap: 10 },
      { title: 'Усі кадри при 10%', rows: LOCS.map((l) => [l, files(l, FRAME_NUMBERS)]), w: 132, gap: 10 },
    ],
    path.join(OUT, 'search-row.png'),
    { bg: '#FFFFFF' },
  );
}
await browser.close();
console.log(`done in ${Math.round((Date.now() - t0) / 1000)} s → ${OUT}`);
