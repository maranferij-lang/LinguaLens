// Розкладка сканера (core.md A.2) — чиста функція без React: де стоять
// верхній ряд, кадр, підказка, перемикач режимів і ряд затвора на екрані
// будь-якої висоти. Від неї ж рахує «прожектор» Viewfinder.
//
//   верхній ряд: 8 від верху (усередині безпечної зони), висота 44, поля 16;
//   ряд затвора: низ — над таб-баром (UNDER_TAB + 16) або, у першому скані
//                онбордингу, де таб-бара немає, — 28 від низу;
//   перемикач:   висота 44, на 16 вище затвора (80);
//   кадр предмета: 264×264, центр — посередині між верхнім рядом і
//                перемикачем, ще на 24 вище; підказка — на 16 нижче кадру;
//   кадр сцени:  9:16 від верхнього ряду + 12 до перемикача − 12, підказка —
//                усередині кадру згори.
import { UNDER_TAB } from '../Chrome';

export const TOP = 8;
export const BAR_H = 44;
export const SIDE = 16;
export const FRAME = 264;
export const FRAME_R = 28;
export const MODE_H = 44;
export const SHUTTER = 80;
export const GAP = 16;
// Скільки займає підказка у два рядки: кадр не має насунути її на перемикач
const HINT_H = 52;
// Від центру затвора до наліпки останнього слова й кнопки зуму
export const SIDE_OFFSET = 110;

export function scannerLayout({ width, height, firstScan = false, scene = false }) {
  const shutterBottom = firstScan ? 28 : UNDER_TAB + GAP;
  const shutterTop = height - shutterBottom - SHUTTER;
  const modeBottom = shutterBottom + SHUTTER + GAP;
  const barBottom = TOP + BAR_H;
  // Перший скан — без перемикача: кадр може стояти нижче, до самого затвора
  const limit = firstScan ? shutterTop - GAP : height - modeBottom - MODE_H;
  const base = { shutterBottom, modeBottom, barBottom, limit };

  if (!scene) {
    // Вузький екран (iPhone SE — 375) кадр не стискає, але дуже вузький —
    // так, щоб довкола лишалось хоч по 32.
    const size = Math.max(160, Math.min(FRAME, width - 64));
    let y = Math.round((barBottom + limit) / 2 - 24 - size / 2);
    // підказка під кадром не налазить на перемикач…
    y = Math.min(y, limit - 8 - HINT_H - GAP - size);
    // …а кадр — на верхній ряд
    y = Math.max(barBottom + 12, y);
    return { ...base, frame: { x: Math.round((width - size) / 2), y, w: size, h: size }, hintTop: y + size + GAP, hintInside: false };
  }

  const top = barBottom + 12;
  const bottom = limit - 12;
  let h = Math.max(FRAME, bottom - top);
  let w = Math.round((h * 9) / 16);
  if (w > width - 56) {
    w = width - 56;
    h = Math.round((w * 16) / 9);
  }
  const y = Math.round(top + Math.max(0, bottom - top - h) / 2);
  return { ...base, frame: { x: Math.round((width - w) / 2), y, w, h }, hintTop: y + 14, hintInside: true };
}
