// Зум щипком (чиста функція без React, щоб її перевіряв jest без жестів).
// iOS рахує зум як maxZoom^value, тож значення 0–MAX_ZOOM; чутливість 0,35 на
// кожне подвоєння відстані між пальцями підібрана руками.
export const MAX_ZOOM = 0.6;
const SENSITIVITY = 0.35;

// Один крок щипка.
//   base    — { d, z } з попереднього кроку (відстань між пальцями й зум на мить,
//             коли їх стало двоє) або null;
//   touches — пальці поточної події;
//   zoom    — зум зараз.
// Повертає { base, zoom }. zoom === null — міняти нічого: або це перший крок
// нової бази, або палець піднято. Піднятий палець скидає базу: коли він
// повернеться на іншу відстань, зум не стрибне зі старої бази, а відлік піде
// наново з поточного зуму.
export function pinchStep(base, touches, zoom, max = MAX_ZOOM) {
  if (!touches || touches.length !== 2) return { base: null, zoom: null };
  const d = Math.hypot(touches[0].pageX - touches[1].pageX, touches[0].pageY - touches[1].pageY);
  // два пальці в одній точці (d = 0) бази не дають: ділити на нуль не можна
  if (!base || !(base.d > 0)) return { base: d > 0 ? { d, z: zoom } : null, zoom: null };
  const z = Math.max(0, Math.min(max, base.z + (d / base.d - 1) * SENSITIVITY));
  return { base, zoom: z };
}
