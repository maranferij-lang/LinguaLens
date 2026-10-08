// Усі PNG бренду з векторних майстрів у assets/brand/:
//   icon-lingo.svg (іконка «Лінго», концепт B — основна) →
//     assets/icon.png                 1024, RGB без альфи (App Store не бере
//                                     іконку з альфа-каналом; кути заокруглює iOS)
//     assets/splash-icon.png          1024, заокруглена іконка на прозорому:
//                                     однаково читається на обох тлах сплешу
//                                     (#FAF8F4 і темне #151412), як та, на яку
//                                     щойно натиснули на головному екрані
//     assets/android-icon-foreground.png  512, Лінго на прозорому
//     assets/android-icon-background.png  512, лише тло
//     assets/favicon.png              48, заокруглена іконка для вебу
//     assets/app-icon-192.png         через tools/export-app-icon.mjs
//   icon-eye.svg (концепт A «Око Лінго») →
//     assets/icon-eye.png             1024, RGB без альфи: альтернативна іконка
//                                     для A/B-тесту в App Store
//                                     (plugins/withAlternateIcons.js)
//   lingo-mark.svg (двоколірний знак) →
//     assets/android-icon-monochrome.png  512, силует для тематичних іконок
//                                     Android 13+: очі й рот прозорі
//
// Адаптивна іконка Android — шар 108 dp, з якого лаунчер показує середні
// 72 dp (2/3), а маска будь-якої форми гарантовано не ріже коло 66 dp. Тому
// Лінго кладемо так, щоб видима частина збігалася з іконкою iOS (масштаб
// 2/3 по центру): голова з очима — в колі ~45 dp, всередині безпечних 66 dp.
// Плечі продовжено вниз до краю шару, щоб паралакс лаунчера не відкрив зріз.
//
// Без залежностей застосунку: потрібен лише Playwright з Chromium.
//   node tools/export-brand.mjs
//   PLAYWRIGHT=/шлях/до/playwright/index.mjs node tools/export-brand.mjs
// Результат — у репозиторії; запускати знову треба, лише якщо змінився майстер.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import codec from './png.js';

const { decode, dropAlpha, encode } = codec;

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, 'assets/brand', f), 'utf8').replace(/<!--[\s\S]*?-->/g, '');
const LINGO = read('icon-lingo.svg');
const EYE = read('icon-eye.svg');
const MARK = read('lingo-mark.svg');

// радіус кута іконки iOS — як APP_ICON_RADIUS у src/Logo.js
const RADIUS = '22.37%';
// шар 108 dp, видимі 72 dp = майстер 1024 по центру: viewBox на 1536
const ADAPTIVE_VIEWBOX = '-256 -256 1536 1536';
// монохромний знак ~46 dp з 108: viewBox 1600 довкола центру голови (512, 516)
const MONO_VIEWBOX = '-288 -284 1600 1600';

// вміст групи <g id="…">…</g> зі знака
function group(id) {
  const m = new RegExp(`<g id="${id}"[^>]*>([\\s\\S]*?)</g>`).exec(MARK);
  if (!m) throw new Error(`lingo-mark.svg: no <g id="${id}">`);
  return m[1];
}

// Силует знака з прозорими очима й ротом: маска біла скрізь, чорна на
// «вирізах», знову біла на зіницях.
const MONO = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MONO_VIEWBOX}">
  <defs><mask id="cut" maskUnits="userSpaceOnUse" x="-288" y="-284" width="1600" height="1600">
    <rect x="-288" y="-284" width="1600" height="1600" fill="#FFFFFF"/>
    <g fill="#000000">${group('cutouts')}</g>
    <g fill="#FFFFFF">${group('pupils')}</g>
  </mask></defs>
  <g mask="url(#cut)" fill="#000000">${group('silhouette')}${group('pupils')}</g>
</svg>`;

// Розмітка майстра → SVG на весь блок; prep(svg) правлять DOM перед знімком.
const JOBS = [
  { out: 'icon.png', svg: LINGO, size: 1024, opaque: true },
  { out: 'icon-eye.png', svg: EYE, size: 1024, opaque: true },
  { out: 'splash-icon.png', svg: LINGO, size: 1024, rounded: true },
  { out: 'favicon.png', svg: LINGO, size: 48, rounded: true },
  { out: 'android-icon-background.png', svg: LINGO, size: 512, opaque: true, prep: 'background' },
  { out: 'android-icon-foreground.png', svg: LINGO, size: 512, prep: 'foreground' },
  { out: 'android-icon-monochrome.png', svg: MONO, size: 512 },
];

// Виконується в браузері: шари адаптивної іконки з майстра Лінго.
function prepare([kind, viewBox]) {
  const svg = document.querySelector('svg');
  svg.setAttribute('viewBox', viewBox);
  const bg = svg.querySelector('#background');
  const lingo = svg.querySelector('#lingo');
  if (kind === 'background') {
    lingo.remove();
    // тло на весь шар, а градієнт — той самий, що під видимою частиною
    bg.setAttribute('x', '-256');
    bg.setAttribute('y', '-256');
    bg.setAttribute('width', '1536');
    bg.setAttribute('height', '1536');
    const g = svg.querySelector('#bg');
    g.setAttribute('gradientUnits', 'userSpaceOnUse');
    g.setAttribute('cx', String(0.5 * 1024));
    g.setAttribute('cy', String(0.42 * 1024));
    g.setAttribute('r', String(0.75 * 1024));
  } else {
    bg.remove();
    // плечі вниз до краю шару: продовження боків #bodyP кольором його низу
    const ext = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    ext.setAttribute('d', 'M206 1020 L170 1280 L854 1280 L818 1020 Z');
    ext.setAttribute('fill', '#3FA9B4');
    lingo.insertBefore(ext, lingo.firstChild);
  }
}

const mod = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright';
const { chromium } = await import(mod);
const browser = await chromium.launch();
try {
  for (const job of JOBS) {
    const { size } = job;
    const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
    const svg = job.svg.replace(/<svg ([^>]*?)width="\d+" height="\d+"/, '<svg $1').replace('<svg ', '<svg width="100%" height="100%" ');
    const clip = job.rounded ? `border-radius:${RADIUS};overflow:hidden;` : '';
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px;${clip}">${svg}</div></body></html>`
    );
    if (job.prep) await page.evaluate(prepare, [job.prep, ADAPTIVE_VIEWBOX]);
    const shot = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size }, omitBackground: !job.opaque });
    await page.close();
    let img = decode(shot);
    if (job.opaque) img = dropAlpha(img);
    const png = encode(img);
    fs.writeFileSync(path.join(ROOT, 'assets', job.out), png);
    console.log(`assets/${job.out}: ${size}×${size} ${img.channels === 3 ? 'RGB' : 'RGBA'}, ${Math.round(png.length / 1024)} KB`);
  }
} finally {
  await browser.close();
}
// 192 px для AppIcon — з щойно зробленого assets/icon.png
execFileSync(process.execPath, [path.join(ROOT, 'tools/export-app-icon.mjs')], { stdio: 'inherit' });
