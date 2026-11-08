// Стиль «plain» (App Store Guideline 2.3.3): кадр 1320×2868 = коротка шапка
// із заголовком на фірмовому тлі + ОДИН цілий справжній екран застосунку
// (знімок capture.mjs, 440×956 pt @3x), зменшений, по центру, із заокругленими
// кутами й м'якою тінню. Нічого не лежить поверх екрана й не обрізає його:
// ні наліпок, ні реквізиту, ні нахилених карток.
import path from 'node:path';
import { PLAIN, fill } from './copy.js';
import { countsFor } from './compose.mjs';
import { FONTS, UI as UI_DIR, fileUrl } from './paths.mjs';

export const W = 1320;
export const H = 2868;
export const BAND = 480; // шапка із заголовком (~17% висоти)
const SIDE = 60, BOTTOM_GAP = 64, TOP_GAP = 8;

// Екран: на всю висоту, що лишилась, зі збереженням пропорцій 1320:2868.
const AVAIL_H = H - BAND - TOP_GAP - BOTTOM_GAP;
const SCALE = Math.min(AVAIL_H / H, (W - SIDE * 2) / W);
export const SCREEN = { w: Math.round(W * SCALE), h: Math.round(H * SCALE) };
SCREEN.left = Math.round((W - SCREEN.w) / 2);
SCREEN.top = BAND + TOP_GAP;
const RADIUS = 116;

const FONT = (w) => fileUrl(path.join(FONTS, w, `Nunito_${w}.ttf`));
const typo = (s) =>
  s
    .replace(/(^|[\s(«“[])(\p{L}) /gu, '$1$2 ')
    .replace(/([^\s[\]<>]+-[^\s[\]<>]+)/g, '<span style="white-space:nowrap">$1</span>')
    .replace(/\n/g, '<br>');
const strip = (s) => typo(s.replace(/\[|\]/g, ''));

const CSS = `
@font-face { font-family: Nunito; font-weight: 600; src: url(${FONT('600SemiBold')}); }
@font-face { font-family: Nunito; font-weight: 800; src: url(${FONT('800ExtraBold')}); }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #4B3BBE; }
body { font-family: Nunito, sans-serif; -webkit-font-smoothing: antialiased; }
.frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden;
  background: linear-gradient(180deg, #4A3FC4 0%, #5A52D8 45%, #6B7CFF 100%); }
.blob { position: absolute; border-radius: 50%; background: #8E8CED; opacity: 0.5; filter: blur(120px); }
.band { position: absolute; left: 0; top: 0; width: ${W}px; height: ${BAND}px; display: flex; flex-direction: column;
  align-items: center; justify-content: center; text-align: center; color: #fff; padding: 0 70px; }
.band h1 { font-weight: 800; font-size: 112px; line-height: 1.05; letter-spacing: -0.015em; text-wrap: balance; }
.band p { font-weight: 600; font-size: 44px; line-height: 1.2; margin-top: 22px; color: rgba(255,255,255,0.86); text-wrap: balance; }
.pro { display: inline-flex; align-items: center; justify-content: center; height: 54px; padding: 0 22px; border-radius: 27px;
  background: #fff; color: #5B4FD6; font-weight: 800; font-size: 32px; letter-spacing: 0.08em; vertical-align: 0.3em; margin-left: 20px; line-height: 1; }
.screen { position: absolute; left: ${SCREEN.left}px; top: ${SCREEN.top}px; width: ${SCREEN.w}px; height: ${SCREEN.h}px;
  border-radius: ${RADIUS}px; overflow: hidden; background: #fff;
  box-shadow: 0 36px 80px rgba(20,10,60,0.38), 0 8px 24px rgba(20,10,60,0.2); }
.screen img { display: block; width: 100%; height: 100%; }
`;

export const frames = (loc) => PLAIN[loc];
export const FRAME_NUMBERS = PLAIN.uk.map((_, i) => i + 1);

export function frameHtml(n, loc) {
  const cp = PLAIN[loc][n - 1];
  const sub = fill(cp.sub, countsFor(loc, PLAIN));
  const img = fileUrl(path.join(UI_DIR, loc, cp.shot + '.png'));
  return `<!doctype html><html lang="${loc}"><head><meta charset="utf-8"><style>${CSS}</style></head>
  <body><div class="frame">
    <div class="blob" style="left:-420px;top:${BAND + 700}px;width:840px;height:840px"></div>
    <div class="blob" style="right:-420px;top:${BAND + 1300}px;width:840px;height:840px"></div>
    <div class="band"><h1 data-fit>${strip(cp.head)}${cp.pro ? '<span class="pro">PRO</span>' : ''}</h1><p>${typo(sub)}</p></div>
    <div class="screen"><img src="${img}"></div>
  </div>
  <script>
    document.fonts.ready.then(async () => {
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      const band = document.querySelector('.band');
      const h = document.querySelector('[data-fit]');
      let size = parseFloat(getComputedStyle(h).fontSize);
      const lines = () => Math.round(h.getBoundingClientRect().height / (size * 1.05));
      const overflow = () => band.scrollHeight > band.clientHeight + 1 || document.querySelector('.band p').getBoundingClientRect().height > 44 * 1.2 * 1.5;
      while ((lines() > 2 || overflow()) && size > 72) { size -= 4; h.style.fontSize = size + 'px'; }
      document.body.dataset.lines = String(lines());
      document.body.dataset.fit = overflow() ? '0' : '1';
      document.body.dataset.ready = '1';
    });
  </script></body></html>`;
}
