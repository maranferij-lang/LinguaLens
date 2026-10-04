// Тестове фото для симулятора iOS: assets/dev/sample-desk.jpg (1080×1440,
// 3:4 — як кадр справжньої камери). Камера симулятора не знімає, а віддає
// порожній квадрат 200×200, тож у розробці сканер підміняє його цим фото
// (src/devSample.js, onboarding.md §10.4). Сцена — той самий стіл із
// червоною чашкою, що в демо онбордингу: модель упізнає чашку, і перший
// скан проходить у симуляторі від початку до кінця.
//
// Без залежностей застосунку: потрібен лише Playwright з Chromium.
//   node tools/make-dev-sample.mjs
//   PLAYWRIGHT=/шлях/до/playwright/index.mjs node tools/make-dev-sample.mjs
// Результат — у репозиторії; запускати знову треба, лише якщо змінилась сцена.
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'assets/dev/sample-desk.jpg');
const W = 1080;
const H = 1440;

// Сцена у viewBox 342 × 456 (3:4): стіна з вікном і рослиною в розфокусі,
// стіл, червона чашка посередині. Геометрія чашки — як у демо.
const scene = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 342 456" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F3ECE0"/><stop offset="1" stop-color="#DCCDB7"/></linearGradient>
    <radialGradient id="sun" cx=".2" cy=".15" r=".7"><stop offset="0" stop-color="#FFF8E8" stop-opacity=".95"/><stop offset="1" stop-color="#FFF6E2" stop-opacity="0"/></radialGradient>
    <linearGradient id="desk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#D2A06F"/><stop offset="1" stop-color="#A0704A"/></linearGradient>
    <linearGradient id="mugBody" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#B8392A"/><stop offset=".35" stop-color="#E5583F"/><stop offset=".75" stop-color="#D84A35"/><stop offset="1" stop-color="#A93224"/></linearGradient>
    <linearGradient id="win" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#CFE3F2"/><stop offset="1" stop-color="#EEF4F6"/></linearGradient>
    <radialGradient id="vig" cx=".5" cy=".5" r=".78"><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
    <filter id="b4" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="b2" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <rect width="342" height="456" fill="url(#wall)"/>
  <rect width="342" height="456" fill="url(#sun)"/>
  <g filter="url(#b4)">
    <rect x="18" y="40" width="120" height="170" rx="4" fill="url(#win)"/>
    <rect x="76" y="40" width="5" height="170" fill="#F7F2EA"/><rect x="18" y="122" width="120" height="5" fill="#F7F2EA"/>
    <g transform="translate(258 150)"><path d="M30 130 C10 86 -4 42 6 6 C26 34 34 80 30 130Z" fill="#4E8A52"/><path d="M34 130 C40 78 58 36 78 18 C78 60 56 100 34 130Z" fill="#3E7646"/><path d="M28 130 C20 96 30 64 44 42 C50 74 42 104 28 130Z" fill="#6AA764"/>
      <path d="M2 122 L62 122 L56 142 L8 142 Z" fill="#C46F48"/><rect x="-2" y="116" width="68" height="10" rx="3" fill="#A95A38"/></g>
    <rect x="14" y="262" width="74" height="10" rx="3" fill="#D49A55"/><rect x="18" y="252" width="66" height="10" rx="3" fill="#7F9CC4"/>
  </g>
  <rect x="0" y="292" width="342" height="164" fill="url(#desk)"/>
  <rect x="0" y="292" width="342" height="2.5" fill="#E8BE92" opacity=".7"/>
  <g stroke="#B9875E" stroke-width="1" opacity=".35"><path d="M0 330 C120 326 220 334 342 328"/><path d="M0 372 C110 368 240 378 342 370"/><path d="M0 418 C130 414 230 422 342 416"/></g>
  <ellipse cx="178" cy="308" rx="62" ry="9" fill="#3a2214" opacity=".42" filter="url(#b2)"/>
  <g>
    <path d="M216 228 C246 226 248 276 214 274" fill="none" stroke="#B83A2B" stroke-width="13" stroke-linecap="round"/>
    <path d="M216 228 C242 228 243 272 214 270" fill="none" stroke="#E0604A" stroke-width="7" stroke-linecap="round"/>
    <path d="M123 200 L219 200 L215 294 Q214 306 202 306 L140 306 Q128 306 127 294 Z" fill="url(#mugBody)"/>
    <ellipse cx="171" cy="201" rx="48" ry="9" fill="#9C2F22"/>
    <ellipse cx="171" cy="202" rx="43" ry="6.5" fill="#4A2A1C"/>
    <ellipse cx="164" cy="201" rx="16" ry="2.4" fill="#7B4A33" opacity=".7"/>
    <path d="M138 214 Q136 260 141 292" stroke="#fff" stroke-width="6" stroke-linecap="round" opacity=".28" fill="none"/>
  </g>
  <g fill="#4A2A1C"><ellipse cx="74" cy="386" rx="6" ry="3.6" transform="rotate(28 74 386)"/><ellipse cx="90" cy="394" rx="6" ry="3.6" transform="rotate(-20 90 394)"/><ellipse cx="250" cy="404" rx="6" ry="3.6" transform="rotate(12 250 404)"/></g>
  <rect width="342" height="456" fill="url(#vig)"/>
</svg>`;

const mod = process.env.PLAYWRIGHT ? pathToFileURL(process.env.PLAYWRIGHT).href : 'playwright';
const { chromium } = await import(mod);
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#000">${scene}</body></html>`);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  await page.screenshot({ path: OUT, type: 'jpeg', quality: 84, clip: { x: 0, y: 0, width: W, height: H } });
  console.log(`${path.relative(ROOT, OUT)} ${W}×${H}, ${Math.round(fs.statSync(OUT).size / 1024)} KB`);
} finally {
  await browser.close();
}
