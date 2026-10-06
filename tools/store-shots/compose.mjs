// Компонує кадри App Store (1320×2868) як HTML; render.mjs знімає їх у PNG.
// Екрани — справжні знімки застосунку (capture.mjs, WORK/ui); наліпки
// малюються геометрією самого застосунку (src/stickerGeometry.js) у його ж
// стилі (src/Sticker.js); картки, наліпки «Поділитися» й віджети — власні
// експорти застосунку. Іконка й Лінго — assets/ тієї ж версії (WORK/static).
//
// Напрям A «Наліпки на фіолетовому» (BRIEF §6.A): без рамки телефона,
// картки UI з радіусом 64, білі заголовки на фіолетовому градієнті.
import fs from 'node:fs';
import path from 'node:path';
import { COPY, countAchievements, countLangs, fill, ukGenitivePlural } from './copy.js';
import { cardBelow, faceCrop, flashcardsLayout, resolveIcon, stackTwo } from './layout.js';
import { LOCALES, WIDGET_WOD, vocab as vocabFor } from './data.mjs';
import codec from '../png.js';
import { ART as ART_DIR, FONTS, LIB, ROOT, STATIC as STATIC_DIR, UI as UI_DIR, fileUrl, readJson } from './paths.mjs';

// PNG — спільним кодеком проєкту (tools/png.js, CommonJS: default-імпорт)
const { info } = codec;

const { stickerPath } = await import(fileUrl(path.join(LIB, 'stickerGeometry.mjs')));

const UI = (loc, name) => fileUrl(path.join(UI_DIR, loc, name + '.png'));
const ART = (name) => fileUrl(path.join(ART_DIR, name));
const STATIC = (name) => fileUrl(path.join(STATIC_DIR, name));
const FONT = (w) => fileUrl(path.join(FONTS, w, `Nunito_${w}.ttf`));
// IPA: у Nunito немає θ, ʌ, ɡ, ʊ, ː…, і браузер добирав би їх з іншого
// шрифту посеред слова. Транскрипцію на фішці кадру 1 пишемо одним шрифтом
// з повним IPA: Inter, що лежить у залежностях проєкту (expo-dev-client →
// expo-dev-menu), або системний.
const IPA_FONT = path.join(ROOT, 'node_modules/expo-dev-menu/android/src/debug/res/font/inter_semibold.ttf');
const IPA_FACE = fs.existsSync(IPA_FONT) ? `@font-face { font-family: LLIPA; font-weight: 600; src: url(${fileUrl(IPA_FONT)}); }` : '';
const IPA_STACK = `LLIPA, 'SF Pro Rounded', 'SF Pro Text', 'Helvetica Neue', 'DejaVu Sans', sans-serif`;
export const W = 1320;
export const H = 2868;
const PT = { w: 440, h: 956 }; // логічний екран iPhone 17 Pro Max

const shapes = () => readJson(path.join(ART_DIR, 'shapes.json'));
const rects = (loc, name) => readJson(path.join(UI_DIR, loc, name + '.json'));
const pngSize = (loc, name) => info(path.join(UI_DIR, loc, name + '.png'));

// Справжні числа з тієї ж версії, що й екрани.
export const achievementCount = () => countAchievements(fs.readFileSync(path.join(LIB, 'achievements.mjs'), 'utf8'));
export const languageCount = () => countLangs(fs.readFileSync(path.join(LIB, 'speech.src.js'), 'utf8'));
export function countsFor(loc) {
  const counts = { langs: languageCount(), ach: achievementCount() };
  const used = COPY[loc].map((cp) => cp.sub).join(' ');
  if (loc === 'uk') {
    for (const [key, n] of [['LANGS', counts.langs], ['ACH', counts.ach]]) {
      if (used.includes(`{${key}}`) && !ukGenitivePlural(n)) throw new Error(`uk: «${n} …» не узгоджується з підписом; перепиши {${key}} у copy.js`);
    }
  }
  return counts;
}

// ─── система карток (v2) ───────────────────────────────────────────────────
// Кожен кадр: картки без рамки, радіус 64, 1120 px завширшки (поля 100 px),
// верхній край на y=700, UI обрізано одразу під статус-баром (жодного 9:41,
// крім годинника екрана блокування в кадрі 6).
const CL = 100, CT = 700, CW = 1120;
// Нижній край вмісту кадрів 3, 5 і 7 — спільний BOTTOM (layout.js).
const K = CW / 440; // px на pt для картки на всю ширину екрана
const SB = 62; // висота статус-бару iPhone 17 Pro Max (pt)

// ─── палітра ───────────────────────────────────────────────────────────────
const C = {
  accent: '#5B4FD6', accentSoft: '#E4E1FB', chalk: '#FAF8F4', text: '#1C1B19', dim: '#6E6A62',
  blob: '#8E8CED', mint: '#65D89E', darkFrame: '#2A2470',
};
const mix = (a, b, t) => {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

// ─── будівельні блоки ──────────────────────────────────────────────────────
const BASE_CSS = `
@font-face { font-family: Nunito; font-weight: 500; src: url(${FONT('500Medium')}); }
@font-face { font-family: Nunito; font-weight: 600; src: url(${FONT('600SemiBold')}); }
@font-face { font-family: Nunito; font-weight: 700; src: url(${FONT('700Bold')}); }
@font-face { font-family: Nunito; font-weight: 800; src: url(${FONT('800ExtraBold')}); }
${IPA_FACE}
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${W}px; height: ${H}px; overflow: hidden; background: #000; }
body { font-family: Nunito, sans-serif; -webkit-font-smoothing: antialiased; }
.frame { position: relative; width: ${W}px; height: ${H}px; overflow: hidden; }
.abs { position: absolute; }
.cap { position: absolute; left: 80px; right: 80px; text-align: center; }
.cap h1 { font-weight: 800; font-size: 130px; line-height: 1.05; letter-spacing: -0.015em; text-wrap: balance; }
.cap p { font-weight: 600; font-size: 56px; line-height: 1.22; margin-top: 30px; text-wrap: balance; }
.pro { display: inline-flex; align-items: center; justify-content: center; height: 62px; padding: 0 26px; border-radius: 31px;
  background: #fff; color: ${C.accent}; font-weight: 800; font-size: 36px; letter-spacing: 0.08em; vertical-align: 0.36em;
  box-shadow: 0 10px 24px rgba(20,10,60,0.28); margin-left: 24px; line-height: 1; }
.card { position: absolute; overflow: hidden; }
.shadowA { box-shadow: 0 40px 80px rgba(20,10,60,0.35), 0 8px 24px rgba(20,10,60,0.18); }
`;

// Справжній екран (чи його шматок) у масштабі k (px на pt).
//   crop: {x, y, w, h} у pt.
function screen({ loc, shot, k, left, top, crop = null, radius = 64, rot = 0, shadow = 'shadowA', z = 1, extra = '' }) {
  const c = crop || { x: 0, y: 0, w: PT.w, h: PT.h };
  return `<div class="card ${shadow}" style="left:${left}px;top:${top}px;width:${c.w * k}px;height:${c.h * k}px;border-radius:${radius}px;transform:rotate(${rot}deg);z-index:${z};${extra}">
    <div class="abs" style="left:${-c.x * k}px;top:${-c.y * k}px;width:${PT.w}px;height:${PT.h}px;transform:scale(${k});transform-origin:0 0">
      <img src="${UI(loc, shot)}" style="width:${PT.w}px;height:${PT.h}px;display:block">
    </div>
  </div>`;
}

// Наліпка рівно як у src/Sticker.js (Cut): м'яка тінь, тепла тонка лінія,
// біла облямівка, фото обрізане згладженим силуетом.
let SID = 0;
function stickerSvg({ uri, shape, size, img = null, maxBorder = Infinity }) {
  const BORDER = 0.05, SHADOW_BLUR = 0.03, SHADOW_DROP = 0.025;
  const MARGIN = BORDER + SHADOW_BLUR * 2 + SHADOW_DROP;
  const { d } = stickerPath({ shape }, size);
  const m = size * MARGIN;
  const border = Math.min(maxBorder, Math.max(2, size * BORDER));
  const id = 's' + ++SID;
  // img: де лежить фото в координатах наліпки (вирізки зі сцени)
  const im = img || { x: 0, y: 0, w: size, h: size };
  return `<svg width="${size}" height="${size}" viewBox="${-m} ${-m} ${size + m * 2} ${size + m * 2}" style="overflow:visible;display:block">
    <defs><clipPath id="c${id}"><path d="${d}"/></clipPath>
      <filter id="b${id}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${size * SHADOW_BLUR}"/></filter></defs>
    <g transform="translate(0 ${size * SHADOW_DROP})" opacity="0.28"><path d="${d}" fill="#3B2F22" stroke="#3B2F22" stroke-width="${border * 2}" stroke-linejoin="round" filter="url(#b${id})"/></g>
    <path d="${d}" fill="none" stroke="rgba(59,47,34,0.14)" stroke-width="${border * 2 + Math.max(1, size * 0.008)}" stroke-linejoin="round"/>
    <path d="${d}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${border * 2}" stroke-linejoin="round"/>
    <image href="${uri}" x="${im.x}" y="${im.y}" width="${im.w}" height="${im.h}" preserveAspectRatio="xMidYMid slice" clip-path="url(#c${id})"/>
  </svg>`;
}
// Наліпка одного з предметів колекції.
const MAX_BORDER = 24;
function objSticker(name, { size, left, top, rot = 0, z = 5, glow = true }) {
  const sh = shapes().objects[name].shape;
  return `<div class="abs" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg);z-index:${z};${glow ? 'filter:drop-shadow(0 26px 34px rgba(20,10,60,0.33))' : ''}">${stickerSvg({ uri: ART(`obj-${name}.jpg`), shape: sh, size, maxBorder: MAX_BORDER })}</div>`;
}
// Наліпка, вирізана з фото сцени рівно як cutout.js (stickerCrop/shapeInCrop).
// Якщо поруч є прозорий шар самого предмета (art/<сцена>-<key>.png, лише
// намальований замінник), фото під контуром — він: у вирізку не потрапляє
// ні стільниця, ні стіна в ручці. Зі справжнім фото шару немає, і наліпка
// така, як її виріже застосунок.
function sceneSticker(scene, key, { size, left, top, rot = 0, z = 5 }) {
  const sc = shapes()[scene];
  const o = sc.objects[key];
  const [y1, x1, y2, x2] = o.box;
  const Wp = sc.width, Hp = sc.height, PAD = 0.06;
  const l = (x1 / 1000 - PAD) * Wp, t = (y1 / 1000 - PAD) * Hp;
  const w = ((x2 - x1) / 1000 + PAD * 2) * Wp, h = ((y2 - y1) / 1000 + PAD * 2) * Hp;
  const S = Math.min(Math.max(w, h), Math.min(Wp, Hp));
  const L = Math.max(0, Math.min(Wp - S, l + w / 2 - S / 2));
  const T = Math.max(0, Math.min(Hp - S, t + h / 2 - S / 2));
  const shape = o.outline.map(([y, x]) => [((x / 1000) * Wp - L) / S, ((y / 1000) * Hp - T) / S]);
  const k = size / S;
  const layer = `${scene}-${key}.png`;
  const uri = fs.existsSync(path.join(ART_DIR, layer)) ? ART(layer) : ART(scene + '.jpg');
  return `<div class="abs" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg);z-index:${z};filter:drop-shadow(0 26px 34px rgba(20,10,60,0.33))">${stickerSvg({ uri, shape, size, img: { x: -L * k, y: -T * k, w: Wp * k, h: Hp * k }, maxBorder: MAX_BORDER })}</div>`;
}

// Типографіка: слова з дефісом і діапазони (A1–C2) не розриваються, а
// однолітерні слова («і», «й», «y», «a») не висять у кінці рядка — їх
// тримає з наступним словом нерозривний пробіл.
const typo = (s) =>
  s
    .replace(/(^|[\s(«“[])(\p{L}) /gu, '$1$2\u00A0')
    .replace(/([^\s[\]<>]+[-–][^\s[\]<>]+)/g, '<span style="white-space:nowrap">$1</span>')
    .replace(/\n/g, '<br>');
const plain = (s) => typo(s.replace(/\[|\]/g, ''));

// ─── тло й підпис ──────────────────────────────────────────────────────────
function bgA(i) {
  const t = i / 7;
  const top = mix('#4A3FC4', '#4B3BBE', t);
  const bottom = mix('#6B7CFF', '#7A6BF2', t);
  // Плями лежать на краях кадру на однаковій висоті, тож сусідні кадри
  // продовжують одне одного в рядку пошуку.
  const yL = [1700, 1250, 2150, 1500, 1900, 1300, 0, 1700][i];
  const yR = [1250, 2150, 1500, 1900, 1300, 2000, 1700, 1100][i];
  return `<div class="abs" style="inset:0;background:linear-gradient(180deg, ${top} 0%, ${mix(top, bottom, 0.45)} 38%, ${bottom} 100%)"></div>
    <div class="abs" style="left:-420px;top:${yL - 420}px;width:840px;height:840px;border-radius:50%;background:${C.blob};opacity:0.55;filter:blur(120px)"></div>
    <div class="abs" style="right:-420px;top:${yR - 420}px;width:840px;height:840px;border-radius:50%;background:${C.blob};opacity:0.55;filter:blur(120px)"></div>
    <div class="abs" style="left:${[880, 140, 900, 200, 860, 160, 900, 180][i]}px;top:${[620, 640, 600, 650, 620, 660, 600, 640][i]}px;width:300px;height:300px;border-radius:50%;background:${C.mint};opacity:0.20;filter:blur(110px)"></div>`;
}
// Кадр 7: тло світліше за #2A2470 з v1, щоб майже чорна картка читалась як
// картка, але все ще явно «темна тема».
function bgDark() {
  return `<div class="abs" style="inset:0;background:linear-gradient(180deg, #2E2690 0%, #3A2FA8 40%, #5246C8 100%)"></div>
    <div class="abs" style="left:-340px;top:1500px;width:900px;height:900px;border-radius:50%;background:${C.blob};opacity:0.30;filter:blur(140px)"></div>
    <div class="abs" style="right:-300px;top:360px;width:760px;height:760px;border-radius:50%;background:#6B7CFF;opacity:0.26;filter:blur(150px)"></div>`;
}
function captionA(cp, counts, { top = 170 } = {}) {
  return `<div class="cap" style="top:${top}px;color:#fff">
    <h1 data-fit>${plain(cp.head)}${cp.pro ? '<span class="pro">PRO</span>' : ''}</h1>
    <p style="color:rgba(255,255,255,0.86)">${typo(fill(cp.sub, counts))}</p>
  </div>`;
}

// Картка екрана: шматок {x0..x1, y0..y1} у pt; типово на всю ширину
// (440 pt), тож k = K і картка рівно 1120 px.
function uiCard(loc, shot, { y0 = SB, y1, x0 = 0, x1 = 440, top = CT, left = null, k = null, rot = 0, z = 2, radius = 64, extra = '' }) {
  const kk = k || CW / (x1 - x0);
  const w = (x1 - x0) * kk;
  const l = left ?? Math.round((W - w) / 2);
  return screen({ loc, shot, k: kk, left: l, top, crop: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, radius, rot, z, extra });
}

// Згладжений контур (геометрія самої наліпки) точок у px полотна.
function outlinePath(pts) {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x1 = Math.min(...xs), x2 = Math.max(...xs), y1 = Math.min(...ys), y2 = Math.max(...ys);
  const side = Math.max(x2 - x1, y2 - y1);
  const sx = x1 - (side - (x2 - x1)) / 2, sy = y1 - (side - (y2 - y1)) / 2;
  const { d } = stickerPath({ shape: pts.map(([x, y]) => [(x - sx) / side, (y - sy) / side]) }, side);
  return { d, sx, sy, side, box: { x1, y1, x2, y2 } };
}

// Пунктирна «траєкторія скану» від a до b (px полотна) зі стрілкою в b.
function trail(a, b, c1, c2, { color = '#fff', z = 5 } = {}) {
  const ang = Math.atan2(b[1] - c2[1], b[0] - c2[0]);
  const L = 46, sp = 0.55;
  const p1 = [b[0] - L * Math.cos(ang - sp), b[1] - L * Math.sin(ang - sp)];
  const p2 = [b[0] - L * Math.cos(ang + sp), b[1] - L * Math.sin(ang + sp)];
  return `<svg class="abs" style="left:0;top:0;z-index:${z};overflow:visible;filter:drop-shadow(0 3px 8px rgba(20,10,60,0.45))" width="${W}" height="${H}">
    <path d="M ${a} C ${c1} ${c2} ${b}" stroke="${color}" stroke-width="13" stroke-dasharray="1 27" stroke-linecap="round" fill="none"/>
    <path d="M ${p1} L ${b} L ${p2}" stroke="${color}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`;
}
const sparkle = (x, y, s, color, rot = 0) =>
  `<svg class="abs" style="left:${x - 50 * s}px;top:${y - 50 * s}px;z-index:5;overflow:visible" width="${100 * s}" height="${100 * s}" viewBox="-50 -50 100 100"><g transform="rotate(${rot})"><path d="M0 -40 C 6 -9 9 -6 40 0 C 9 6 6 9 0 40 C -6 9 -9 6 -40 0 C -9 -6 -6 -9 0 -40 Z" fill="${color}"/></g></svg>`;

// Табличка слова біля головної наліпки: фішка сцени застосунку (біла
// пігулка, слово жирним, переклад сірим) у маркетинговому розмірі, щоб
// слово читалось у рядку пошуку (≥ 150 px → ~15 px при 10%). Під словом —
// /IPA/ з кнопкою «Слухати» (IcSpeaker з src/icons.js), як на картці слова
// в застосунку: підрядок обіцяє вимову, і її видно.
const SPEAKER = (size, color) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4.5 6.5 8.5H3.5v7h3l4.5 4z"/><path d="M15 9.2a4 4 0 0 1 0 5.6M17.9 6.3a8 8 0 0 1 0 11.4"/></svg>`;
function wordChip(word, translation, { cx, top, rot = -3, z = 7, ipa = null }) {
  const big = word.length > 9 ? 136 : 168;
  const pron = ipa
    ? `<div style="display:flex;align-items:center;justify-content:center;gap:20px;margin-top:10px">
        <div style="width:92px;height:92px;border-radius:46px;background:${C.accentSoft};display:flex;align-items:center;justify-content:center">${SPEAKER(54, C.accent)}</div>
        <div style="font-family:${IPA_STACK};font-weight:600;font-size:62px;line-height:1;color:${C.accent}">${ipa}</div>
      </div>`
    : '';
  return `<div class="abs" style="left:${cx}px;top:${top}px;transform:translateX(-50%) rotate(${rot}deg);z-index:${z};background:#fff;border-radius:64px;padding:26px 70px 34px;text-align:center;white-space:nowrap;box-shadow:0 26px 60px rgba(20,10,60,0.32), 0 6px 16px rgba(20,10,60,0.14)">
    <div style="font-weight:800;font-size:${big}px;line-height:1.04;color:${C.text};letter-spacing:-0.02em">${word}</div>
    ${pron}
    <div style="font-weight:700;font-size:70px;line-height:1.1;color:${C.dim};margin-top:${ipa ? 12 : 2}px">${translation}</div>
  </div>`;
}

// Лінго (assets/lingo-*.png тієї ж версії) — «приправа», ніколи не поверх
// UI (BRIEF §2.8).
function lingo(pose, { left, top, size, rot = 0, z = 8, extra = '' }) {
  return `<img class="abs" src="${STATIC(`lingo-${pose}.png`)}" style="left:${left}px;top:${top}px;width:${size}px;height:${size}px;transform:rotate(${rot}deg);z-index:${z};filter:drop-shadow(0 18px 26px rgba(20,10,60,0.32));${extra}">`;
}

// ─── кадр 6: віджети ───────────────────────────────────────────────────────
// Головний екран зібрано зі справжніх віджетів застосунку (WidgetPreview —
// його RN-репліка SwiftUI-віджетів, знята поодинці), іконка — assets/icon.png
// знятої версії (або ICON=…, appIcon нижче). Екран блокування — HTML-копія accessoryRectangular з
// src/widgets/WordOfDayWidget.js (слово, переклад, IPA; білий «vibrant»
// текст): RN-репліки екрана блокування в застосунку немає. Шпалери —
// власний градієнт, без шпалер Apple (BRIEF кадр 6).
const WALL = `background:radial-gradient(90% 45% at 22% 8%, rgba(126,120,236,0.75) 0%, rgba(126,120,236,0) 70%), radial-gradient(80% 45% at 92% 92%, rgba(83,128,255,0.55) 0%, rgba(83,128,255,0) 70%), linear-gradient(180deg, #121236 0%, #1B1D52 50%, #262A6E 100%)`;
// Іконка: assets/icon.png знятої версії або ICON=… (варіант для тесту
// іконки в App Store, PPO; layout.js → resolveIcon).
export const appIcon = () =>
  resolveIcon(process.env.ICON, { staticDir: STATIC_DIR, root: ROOT, cwd: process.cwd(), exists: fs.existsSync, join: path.join, isAbsolute: path.isAbsolute });
const WIDGET_K = 404 / 335; // масштаб WidgetPreview при ширині 404 pt (k у makeStyles)
function widgetImg(loc, part, { left, top, width, z = 2 }) {
  const name = `widget-${part}`;
  const { width: pw, height: ph } = pngSize(loc, name);
  const s = width / (pw / 3); // pt знімка → pt екрана
  const r = 22 * WIDGET_K * s; // радіус кутів віджета (z(22) у WidgetPreview)
  return `<div class="abs" style="left:${left}px;top:${top}px;width:${width}px;height:${(ph / 3) * s}px;border-radius:${r}px;overflow:hidden;z-index:${z};box-shadow:0 8px 24px rgba(0,0,0,0.22)">
    <img src="${UI(loc, name)}" style="display:block;width:calc(100% + 2px);height:calc(100% + 2px);margin:-1px">
  </div>`;
}
function widgetScreen(loc, kind, { top, y1, rot = 0, z = 1 }) {
  const L = LOCALES[loc];
  const w = WIDGET_WOD[loc];
  let inner;
  if (kind === 'lock') {
    const date = new Intl.DateTimeFormat(L.date, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(2026, 9, 6));
    const cap = date.charAt(0).toUpperCase() + date.slice(1);
    // accessoryRectangular: без підкладки, білий «vibrant» текст
    inner = `
      <div class="abs" style="left:0;right:0;top:84px;text-align:center;color:rgba(255,255,255,0.9);font-weight:700;font-size:21px">${cap}</div>
      <div class="abs" style="left:0;right:0;top:102px;text-align:center;color:rgba(255,255,255,0.94);font-weight:800;font-size:116px;letter-spacing:-2px;line-height:1.1">9:41</div>
      <div class="abs" style="left:0;right:0;top:248px;display:flex;justify-content:center">
        <div style="width:200px;color:#fff;text-align:left">
          <div style="font-weight:800;font-size:21px;line-height:1.2;white-space:nowrap">${w.word}</div>
          <div style="font-weight:600;font-size:16px;line-height:1.25;color:rgba(255,255,255,0.72)">${w.translation}</div>
          <div style="font-weight:500;font-size:14px;line-height:1.25;color:rgba(255,255,255,0.72)">${w.ipa}</div>
        </div>
      </div>`;
  } else {
    inner = `
      ${widgetImg(loc, 'preview-wod', { left: 38, top: 76, width: 364 })}
      ${widgetImg(loc, 'preview-streak', { left: 38, top: 274, width: 170 })}
      <div class="abs" style="left:250px;top:280px;width:68px;text-align:center">
        <img src="${fileUrl(appIcon())}" style="width:64px;height:64px;border-radius:15px;display:block;margin:0 auto;box-shadow:0 4px 12px rgba(0,0,0,0.25)">
        <div style="font-weight:600;font-size:12px;color:#fff;margin-top:5px;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.3)">LinguaLens</div>
      </div>`;
  }
  // лише смуга віджетів екрана (x 26…414 pt), під статус-баром
  const x0 = 26, x1 = 414, k = CW / (x1 - x0);
  return `<div class="card shadowA" style="left:${CL}px;top:${top}px;width:${CW}px;height:${(y1 - SB) * k}px;border-radius:64px;transform:rotate(${rot}deg);z-index:${z}">
    <div class="abs" style="left:${-x0 * k}px;top:${-SB * k}px;width:${PT.w}px;height:${PT.h}px;transform:scale(${k});transform-origin:0 0;${WALL}">${inner}</div>
  </div>`;
}

// ─── кадри ─────────────────────────────────────────────────────────────────
// Кожен повертає вміст одного кадру 1320×2868.
const FRAMES = {
  // 1 — диво: чашка в справжній камері відклеюється наліпкою й несе своє
  // слово. Картка — сканер застосунку; «привид» — контур чашки (дані
  // контуру скану); наліпку вирізано з того самого фото, як це робить
  // cutout.js. Лінго визирає з правого нижнього кута (голова й лапа).
  1(loc, cp, counts) {
    const cam = rects(loc, 'camera');
    const v = cam.video;
    const mug = shapes().hero.objects.mug;
    const s = Math.max(v.w / v.vw, v.h / v.vh); // objectFit: cover
    const ox = v.x + (v.w - v.vw * s) / 2, oy = v.y + (v.h - v.vh * s) / 2;
    // від рамки прицілу до підказки під нею («Наведи на предмет…»)
    const y0 = (cam.corners ? cam.corners.y : 247) - 40;
    const y1 = (cam.hint ? cam.hint.y + cam.hint.h : 553) + 24;
    const toCanvas = ([y, x]) => [CL + (ox + (x / 1000) * v.vw * s) * K, CT + (oy + (y / 1000) * v.vh * s - y0) * K];
    const g = outlinePath(mug.outline.map(toCanvas));
    // Лише пунктир скану й м'яке сяйво: сама чашка в прицілі лишається
    // червоною, у повному кольорі, тож «ця річ стає цією наліпкою» видно й
    // у рядку пошуку.
    const ghost = `<svg class="abs" style="left:${g.sx}px;top:${g.sy}px;z-index:3;overflow:visible;filter:drop-shadow(0 0 14px rgba(255,255,255,0.75)) drop-shadow(0 4px 10px rgba(20,10,60,0.35))" width="${g.side}" height="${g.side}">
      <path d="${g.d}" fill="none" stroke="#fff" stroke-width="10" stroke-dasharray="24 17" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
    // наліпка відходить від свого «отвору»: більша за привид, зсунута
    // вниз-праворуч, лягає на нижній край картки під підказкою
    const S = 1000;
    const cardBottom = CT + (y1 - y0) * K;
    const cx = (g.box.x1 + g.box.x2) / 2 + 120, cy = cardBottom - 120 + S / 2;
    const v1 = vocabFor(loc, 'mug');
    const a = [g.box.x2 + 30, g.box.y1 + (g.box.y2 - g.box.y1) * 0.18];
    const b = [cx + S * 0.33, cy - S * 0.36];
    return `${bgA(0)}${captionA(cp, counts)}
      ${uiCard(loc, 'camera', { y0, y1, z: 2 })}
      ${ghost}
      ${trail(a, b, [a[0] + 200, a[1] + 10], [b[0] + 170, b[1] - 170])}
      ${sparkle(a[0] + 120, a[1] - 70, 0.9, C.mint, 12)}
      ${sceneSticker('hero', 'mug', { size: S, left: cx - S / 2, top: cy - S / 2, rot: -6, z: 6 })}
      ${wordChip(v1.word, v1.translation, { cx: cx - 60, top: cy + S * 0.27, rot: -3, ipa: v1.ipa })}
      ${lingo('wave', { left: W - 360, top: H - 290, size: 470, rot: -14, z: 4 })}`;
  },

  // 2 — фотословник: дві наліпки виходять зі своїх місць (місце лишається
  // порожнім, пунктиром) і з картки; лимон перетинає правий край у бік
  // кадру 3.
  2(loc, cp, counts) {
    const g = rects(loc, 'dict-grid');
    const y1 = g.tabbar.y - 6; // над таб-баром
    const at = (r) => ({ x: CL + r.x * K, y: CT + (r.y - SB) * K, w: r.w * K, h: r.h * K });
    const MARGIN = 0.05 + 0.03 * 2 + 0.025;
    const slot = (key) => {
      const r = g['sticker_' + key];
      const p = at(r);
      const size = p.w, m = size * MARGIN;
      const { d } = stickerPath({ shape: shapes().objects[key].shape }, size);
      return `<div class="abs" style="left:${p.x}px;top:${p.y}px;width:${p.w}px;height:${p.h}px;background:${r.bg};z-index:3"></div>
        <svg class="abs" style="left:${p.x}px;top:${p.y}px;z-index:4" width="${size}" height="${size}" viewBox="${-m} ${-m} ${size + m * 2} ${size + m * 2}">
          <path d="${d}" fill="rgba(91,79,214,0.05)" stroke="#C9C2E8" stroke-width="${size * 0.022}" stroke-dasharray="${size * 0.05} ${size * 0.04}" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>`;
    };
    const pop = (key, dx, dy, size, rot) => {
      const p = at(g['sticker_' + key]);
      return objSticker(key, { size, left: p.x + p.w / 2 + dx - size / 2, top: p.y + p.h / 2 + dy - size / 2, rot, z: 6 });
    };
    return `${bgA(1)}${captionA(cp, counts)}
      ${uiCard(loc, 'dict-grid', { y1, z: 2 })}
      ${slot('lemon')}${slot('camera')}
      ${pop('lemon', 150, -80, 450, 12)}
      ${pop('camera', -165, -20, 380, -10)}`;
  },

  // 3 — картки: картка посеред перегортання. Лице (слово, IPA, «Слухати»)
  // велике спереду, зворот (наліпка й переклад) за ним, нахилений; під ними —
  // справжні кнопки «Ще вчу / Знаю».
  3(loc, cp, counts) {
    const f = rects(loc, 'cards-front');
    const b = rects(loc, 'cards-back');
    const st = b.sticker_plant;
    const by0 = st.y - 30, by1 = b.translation.y + b.translation.h + 22;
    // лице: слово, IPA й «Слухати» рівно посередині, поля згори й знизу
    // однакові (без порожньої нижньої третини)
    const { y0: fy0, y1: fy1 } = faceCrop(f, 64);
    const kb = 2.55, kf = 2.85;
    const backCrop = { x: b.card.x, y: by0, w: b.card.w, h: by1 - by0 };
    const frontCrop = { x: f.card.x, y: fy0, w: f.card.w, h: fy1 - fy0 };
    const btn = { x: 0, y: b.still.y - 12, w: PT.w, h: b.still.h + 24 };
    // лице картки — під зворотом, щоб переклад на звороті було видно цілим;
    // вільне місце до спільного низу — між картками й кнопками
    const { fTop, bTop } = flashcardsLayout({ top: CT + 10, backH: backCrop.h * kb, frontH: frontCrop.h * kf, btnH: btn.h * K });
    return `${bgA(2)}${captionA(cp, counts)}
      ${screen({ loc, shot: 'cards-back', k: kb, left: Math.round((W - backCrop.w * kb) / 2) + 60, top: CT + 10, crop: backCrop, radius: 60, rot: 6, z: 2 })}
      ${screen({ loc, shot: 'cards-front', k: kf, left: Math.round((W - frontCrop.w * kf) / 2) - 10, top: fTop, crop: frontCrop, radius: 64, rot: -3, z: 3 })}
      ${screen({ loc, shot: 'cards-back', k: K, left: CL, top: bTop, crop: btn, radius: 56, z: 4 })}`;
  },

  // 4 — ціла кімната одним кадром (PRO). Екран сцени v1.3 сам показує
  // кожен предмет наліпкою з підписом, тож «відклеєних» наліпок поверх
  // нього немає: вони подвоїли б чайник і чашку.
  4(loc, cp, counts) {
    return `${bgA(3)}${captionA(cp, counts)}
      ${uiCard(loc, 'scene', { y1: 845, z: 2 })}`;
  },

  // 5 — твій рівень і слово дня з твоєї сфери: крок рівня (повзунок, CEFR,
  // назва рівня) і ОДНА картка слова дня під ним, з відступом 60 px і
  // нахилом; жоден текст першої картки не перекрито.
  5(loc, cp, counts) {
    const p = rects(loc, 'pf-level');
    const y0 = p.chip.y - 18, y1 = (p.name ? p.name.y + p.name.h : p.c2.y + p.c2.h) + 24;
    const wod = rects(loc, 'learn-wod').wod;
    // картка слова дня — завширшки як картка рівня й до спільного низу
    const { k: kw, top: top2 } = cardBelow({ above: CT + (y1 - y0) * K, w: wod.w, h: wod.h, maxW: CW + 40 });
    const w2 = wod.w * kw;
    return `${bgA(4)}${captionA(cp, counts)}
      ${uiCard(loc, 'pf-level', { y0, y1, z: 2 })}
      ${screen({ loc, shot: 'learn-wod', k: kw, left: Math.round((W - w2) / 2), top: top2, crop: { x: wod.x, y: wod.y, w: wod.w, h: wod.h }, radius: 22 * kw, rot: -3, z: 3 })}`;
  },

  // 6 — віджет «Слово дня»: екран блокування й головний екран, трохи
  // перекриваються; екран блокування більший, позаду
  6(loc, cp, counts) {
    return `${bgA(5)}${captionA(cp, counts)}
      ${widgetScreen(loc, 'lock', { top: CT, y1: 332, rot: -2, z: 2 })}
      ${widgetScreen(loc, 'home', { top: 1510, y1: 455, rot: 2, z: 3 })}`;
  },

  // 7 — щоденна звичка, темна тема. Лінго — аватар самого профілю, що
  // святкує, просто над серією. Під профілем (до картки серії) — перший
  // ряд вкладки «Досягнення» того ж профілю, нахилений, як картка слова дня
  // на кадрі 5: підрядок обіцяє досягнення, і їх видно. Картки мають тонку
  // лінію й сяйво, щоб відокремитись від (світлішого) фіолетового тла.
  7(loc, cp, counts) {
    const pr = rects(loc, 'profile-dark');
    const ach = rects(loc, 'profile-ach');
    const glow = 'box-shadow:0 0 0 2px rgba(255,255,255,0.10), 0 0 90px rgba(155,143,255,0.35), 0 40px 90px rgba(10,6,40,0.5)';
    const x0 = 12, x1 = 428, k = CW / (x1 - x0);
    if (!ach.ach0 || !pr.streak) {
      // без вкладки досягнень — як раніше: до рядка «слів усього»
      const y1 = pr.stats ? pr.stats.y + pr.stats.h + 12 : Math.min(pr.tabbar.y - 8, pr.share.y + pr.share.h + 28);
      return `${bgDark()}${captionA(cp, counts)}
        ${uiCard(loc, 'profile-dark', { y1, x0, x1, z: 2, extra: glow })}`;
    }
    const y1 = pr.streak.y + pr.streak.h + 8;
    const row = { x: x0, y: ach.ach0.y - 12, w: x1 - x0, h: ach.ach0.h + 24 };
    // обидві картки в одному масштабі, разом із проміжком — до спільного низу
    const { k: kk, top2 } = stackTwo({ top: CT, h1: y1 - SB, h2: row.h, kMax: k });
    const wk = (x1 - x0) * kk;
    return `${bgDark()}${captionA(cp, counts)}
      ${uiCard(loc, 'profile-dark', { y1, x0, x1, k: kk, z: 2, extra: glow })}
      ${screen({ loc, shot: 'profile-ach', k: kk, left: Math.round((W - wk) / 2), top: top2, crop: row, radius: 64, rot: -2.5, z: 3, shadow: '', extra: glow })}`;
  },

  // 8 — поділитися: картка сцени позаду, спереду — наліпка чашки без тла
  // (так її віддає «Поділитися», головне, чим діляться з v1.3) і картка
  // тижня. Чашка затуляє лише куток фото сцени, текст карток видно. Лінго
  // махає в нижньому куті: «до зустрічі».
  8(loc, cp, counts) {
    const card = (name, x, y, rot, z, w) => `<div class="abs shadowA" style="left:${x}px;top:${y}px;width:${w}px;height:${Math.round((w * 1920) / 1080)}px;border-radius:40px;overflow:hidden;transform:rotate(${rot}deg);z-index:${z}"><img src="${UI(loc, name)}" style="width:100%;height:100%;display:block"></div>`;
    const st = pngSize(loc, 'sticker-object');
    const sw = 760, sh = Math.round((sw * st.height) / st.width);
    return `${bgA(7)}${captionA(cp, counts)}
      ${card('card-scene', (W - 660) / 2, CT, 0, 2, 660)}
      <img class="abs" src="${UI(loc, 'sticker-object')}" style="left:-30px;top:1420px;width:${sw}px;height:${sh}px;transform:rotate(-6deg);z-index:4;filter:drop-shadow(0 30px 40px rgba(20,10,60,0.35))">
      ${card('card-week-graphite', W - 40 - 600, 1470, 6, 3, 600)}
      ${lingo('wave', { left: W - 300, top: H - 300, size: 230, rot: -8, z: 5 })}`;
  },
};

export function frameHtml(n, loc) {
  const cp = COPY[loc][n - 1];
  const body = FRAMES[n](loc, cp, countsFor(loc));
  return `<!doctype html><html lang="${loc}"><head><meta charset="utf-8"><style>${BASE_CSS}</style></head>
  <body><div class="frame">${body}</div>
  <script>
    // Заголовок — не більше двох рядків (BRIEF §2.3). Однорядковий
    // опускаємо на пів рядка: підрядок і картка стоять там само, де на
    // сусідніх кадрах, і в рядку кадрів нічого не «стрибає». Скільки вийшло
    // рядків, render.mjs читає з data-lines і попереджає про не два.
    document.fonts.ready.then(async () => {
      await Promise.all([...document.images].map((i) => (i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; }))));
      for (const h of document.querySelectorAll('[data-fit]')) {
        let size = parseFloat(getComputedStyle(h).fontSize);
        const lines = () => Math.round(h.getBoundingClientRect().height / (size * 1.05));
        while (lines() > 2 && size > 96) { size -= 4; h.style.fontSize = size + 'px'; }
        const n = lines();
        if (n === 1) h.style.marginTop = size * 1.05 / 2 + 'px';
        document.body.dataset.lines = String(n);
      }
      document.body.dataset.ready = '1';
    });
  </script></body></html>`;
}

export const FRAME_NUMBERS = Object.keys(FRAMES).map(Number);
