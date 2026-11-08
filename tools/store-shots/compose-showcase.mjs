// Стиль «showcase» (App Store Guideline 2.3.3): кадр 1320×2868 = ОДИН цілий
// справжній екран застосунку у корпусі iPhone (тонка темна титанова рамка,
// Dynamic Island, велике заокруглення, тінь) на панорамному фіолетовому тлі
// з м'якими кольоровими відблисками, над ним великий заголовок з одним
// виділеним словом. Тло й заголовок лише поза екраном: нічого не лежить
// поверх екрана (острів — частина корпусу, над порожнім місцем знімка), без
// нахилу й обрізання. Відблиски лежать у «світових» координатах усіх вісьмох
// кадрів поруч, тож кадри в рядку читаються як одна панорама.
import path from 'node:path';
import { SHOWCASE } from './copy.js';
import { FONTS, UI as UI_DIR, fileUrl } from './paths.mjs';

export const W = 1320;
export const H = 2868;
const N = 8;
const PHONE_TOP = 480; // верх корпусу; над ним шапка із заголовком
const BOTTOM = 56;
const BEZEL = 20; // титан 8 + чорна рамка 12
export const PHONE = { h: H - PHONE_TOP - BOTTOM };
PHONE.screenH = PHONE.h - BEZEL * 2;
PHONE.screenW = Math.round((PHONE.screenH * 440) / 956);
PHONE.w = PHONE.screenW + BEZEL * 2;
PHONE.left = Math.round((W - PHONE.w) / 2);
const K = PHONE.screenW / 440; // піксель кадру на pt екрана
const SCREEN_R = Math.round(62 * K); // радіус екрана iPhone 17 Pro Max ~62 pt
const ISLAND = { w: Math.round(126 * K), h: Math.round(37 * K), top: Math.round(11 * K) };

const FONT = (w) => fileUrl(path.join(FONTS, w, `Nunito_${w}.ttf`));
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const headHtml = (s) => esc(s).replace(/\[([^\]]+)\]/g, '<span class="hl">$1</span>').replace(/\n/g, '<br>');

// Відблиски: [x центру, y центру, діаметр, колір, прозорість] у координатах
// смуги з 8 кадрів (x 0..10560). Багато їх ліворуч-праворуч від телефона й у
// шапці, де їх видно; кілька перетинають межі кадрів.
const GLOWS = [
  [-120, 2650, 1100, '#FF9E7D', 0.55], [120, 330, 700, '#C9BBFF', 0.6], [880, 2780, 900, '#C9BBFF', 0.5],
  [1320, 1500, 700, '#6EE7C2', 0.38], [1700, 260, 900, '#FF9E7D', 0.5], [2350, 2700, 1000, '#6EE7C2', 0.45],
  [2640, 1100, 700, '#C9BBFF', 0.45], [3200, 220, 900, '#6EE7C2', 0.4], [3900, 2760, 1100, '#FF9E7D', 0.55],
  [3960, 1300, 650, '#FF9E7D', 0.35], [4600, 300, 1000, '#C9BBFF', 0.6], [5280, 1700, 700, '#6EE7C2', 0.38],
  [5500, 2750, 1000, '#C9BBFF', 0.5], [6200, 240, 900, '#FF9E7D', 0.5], [6900, 2700, 1100, '#6EE7C2', 0.42],
  [7240, 1200, 700, '#C9BBFF', 0.45], [7800, 280, 1000, '#6EE7C2', 0.4], [8500, 2780, 1000, '#FF9E7D', 0.55],
  [9100, 1500, 700, '#C9BBFF', 0.45], [9300, 260, 1000, '#FF9E7D', 0.5], [10000, 2700, 1000, '#C9BBFF', 0.55],
  [10500, 600, 900, '#6EE7C2', 0.4],
];
const DEEP = [
  [660, 1200, 1300], [2000, 1900, 1300], [3300, 1100, 1300], [4700, 1800, 1300],
  [6000, 1200, 1300], [7400, 1900, 1300], [8700, 1100, 1300], [10000, 1800, 1300],
];
const NOISE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><filter id="n"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch"/><feColorMatrix values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.5 0"/></filter><rect width="300" height="300" filter="url(#n)"/></svg>',
)}")`;

const CSS = `
@font-face { font-family: Nunito; font-weight: 800; src: url(${FONT('800ExtraBold')}); }
@font-face { font-family: Nunito; font-weight: 900; src: url(${FONT('900Black')}); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #4B3FC4; }
body { font-family: Nunito, sans-serif; -webkit-font-smoothing: antialiased; }
.frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
.base { position: absolute; inset: 0; background-size: ${W * N}px 100%; }
.shade { position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(40,22,130,0.28) 0%, rgba(40,22,130,0) 30%, rgba(30,14,100,0) 60%, rgba(30,14,100,0.38) 100%); }
.glow { position: absolute; border-radius: 50%; filter: blur(120px); }
.grain { position: absolute; inset: 0; background-image: ${NOISE}; opacity: 0.09; mix-blend-mode: soft-light; }
.head { position: absolute; left: 0; top: 0; width: ${W}px; height: ${PHONE_TOP - 24}px; display: flex; align-items: center; justify-content: center;
  text-align: center; color: #fff; padding: 36px 50px 0; }
.head h1 { font-weight: 900; font-size: 136px; line-height: 1.0; letter-spacing: -0.02em; text-shadow: 0 6px 30px rgba(35,15,110,0.35); }
.hl { color: #FFE9A6; position: relative; white-space: nowrap; z-index: 0; }
.hl::after { content: ''; position: absolute; left: -0.05em; right: -0.05em; bottom: 0.04em; height: 0.2em; border-radius: 0.12em;
  background: #FF8F6B; z-index: -1; transform: rotate(-1.2deg); }
.pro { display: inline-flex; align-items: center; justify-content: center; height: 62px; padding: 0 26px; border-radius: 31px;
  background: #fff; color: #5B4FD6; font-weight: 900; font-size: 38px; letter-spacing: 0.08em; vertical-align: 0.42em; margin-left: 24px; line-height: 1;
  text-shadow: none; box-shadow: 0 8px 24px rgba(35,15,110,0.3); }
.phone { position: absolute; left: ${PHONE.left}px; top: ${PHONE_TOP}px; width: ${PHONE.w}px; height: ${PHONE.h}px; border-radius: ${SCREEN_R + BEZEL}px;
  padding: 8px; background: linear-gradient(145deg, #7d7e86 0%, #3a3a40 18%, #232327 50%, #3d3e44 82%, #6d6e76 100%);
  box-shadow: 0 70px 130px rgba(20,8,80,0.55), 0 24px 50px rgba(20,8,80,0.4), inset 0 0 0 2px rgba(255,255,255,0.12); }
.bezel { width: 100%; height: 100%; border-radius: ${SCREEN_R + 12}px; background: #000; padding: 12px; }
.screen { position: relative; width: 100%; height: 100%; border-radius: ${SCREEN_R}px; overflow: hidden; background: #fff; }
.screen img { display: block; width: 100%; height: 100%; }
.island { position: absolute; left: 50%; top: ${ISLAND.top}px; width: ${ISLAND.w}px; height: ${ISLAND.h}px; margin-left: ${-ISLAND.w / 2}px; border-radius: ${ISLAND.h / 2}px; background: #000; }
.btn { position: absolute; width: 9px; border-radius: 4px; background: linear-gradient(90deg, #2a2a2e, #5a5b62); }
`;

const side = (top, h, left) => `<div class="btn" style="top:${top}px;height:${h}px;${left ? `left:${PHONE.left - 8}px` : `left:${PHONE.left + PHONE.w - 1}px;transform:scaleX(-1)`}"></div>`;

export const frames = (loc) => SHOWCASE[loc];
export const FRAME_NUMBERS = SHOWCASE.uk.map((_, i) => i + 1);

export function frameHtml(n, loc) {
  const cp = SHOWCASE[loc][n - 1];
  const img = fileUrl(path.join(UI_DIR, loc, cp.shot + '.png'));
  const off = (n - 1) * W;
  const glows = GLOWS.filter(([x, , d]) => x + d / 2 > off && x - d / 2 < off + W)
    .map(([x, y, d, c, o]) => `<div class="glow" style="left:${x - off - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;background:${c};opacity:${Math.min(0.9, o * 1.55)}"></div>`)
    .join('');
  const deep = DEEP.filter(([x, , d]) => x + d / 2 > off && x - d / 2 < off + W)
    .map(([x, y, d]) => `<div class="glow" style="left:${x - off - d / 2}px;top:${y - d / 2}px;width:${d}px;height:${d}px;background:#3326A8;opacity:0.5"></div>`)
    .join('');
  return `<!doctype html><html lang="${loc}"><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body><div class="frame">
    <div class="base" style="background-image:linear-gradient(90deg,#5446D0 0%,#6254E0 12%,#5B4FD6 25%,#4F42C6 37%,#6757E3 50%,#5B4FD6 62%,#5043C8 75%,#6556E1 88%,#5446D0 100%);background-position:${-off}px 0"></div>
    ${deep}${glows}
    <div class="shade"></div>
    <div class="grain"></div>
    <div class="head"><h1 data-fit>${headHtml(cp.head)}${cp.pro ? '<span class="pro">PRO</span>' : ''}</h1></div>
    ${side(PHONE_TOP + 330, 120, true)}${side(PHONE_TOP + 500, 210, true)}${side(PHONE_TOP + 760, 210, true)}${side(PHONE_TOP + 600, 330, false)}
    <div class="phone"><div class="bezel"><div class="screen"><img src="${img}"><div class="island"></div></div></div></div>
  </div>
  <script>
    document.fonts.ready.then(async () => {
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      const h = document.querySelector('[data-fit]');
      const box = document.querySelector('.head');
      let size = parseFloat(getComputedStyle(h).fontSize);
      const lines = () => Math.round(h.getBoundingClientRect().height / (size * 1.0));
      const bad = () => h.scrollWidth > box.clientWidth - 100 || h.getBoundingClientRect().height > box.clientHeight - 40 || h.getBoundingClientRect().width > box.clientWidth - 100;
      while ((lines() > 2 || bad()) && size > 84) { size -= 4; h.style.fontSize = size + 'px'; }
      document.body.dataset.lines = String(lines());
      document.body.dataset.fit = bad() ? '0' : '1';
      document.body.dataset.size = String(size);
      document.body.dataset.ready = '1';
    });
  </script></body></html>`;
}
