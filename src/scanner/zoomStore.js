// Зум камери як окреме маленьке сховище, а не стан ScannerScreen.
//
// Щипок шле нове значення на кожну подію дотику (до 60 разів на секунду).
// Якби зум був станом сканера, кожна така подія звіряла б усе дерево хрому
// (скло, видошукач, затвор, наліпку) із попереднім, поки камера й так
// працює на межі, особливо на iPhone SE 2 / 11. Тут зум читають лише двоє
// (камера й кнопка «1×»), тож вони й перемальовуються, а сканер стоїть.
import { useSyncExternalStore } from 'react';
import { MAX_ZOOM } from './pinch';

// Зміна менша за це — не крок: iOS рахує зум як maxZoom^value, тож 0,004 —
// це близько +1% кратності, ока не торкається, а до нативної камери
// кожен крок іде окремим пропом.
export const ZOOM_EPS = 0.004;

export function createZoom(initial = 0) {
  let value = initial;
  // останнє значення щипка, яке не застосували як дрібне (див. settle)
  let skipped = null;
  const subs = new Set();

  const set = (v) => {
    skipped = null;
    if (v === value) return;
    value = v;
    subs.forEach((f) => f());
  };

  return {
    get: () => value,
    // пресет «1× / 2×» і будь-яке точне значення
    set,
    // крок щипка: дрібні зміни пропускаємо, але краї (0 і MAX_ZOOM) беремо
    // завжди, щоб до них можна було дотягнутись
    pinch(v) {
      if (v > 0 && v < MAX_ZOOM && Math.abs(v - value) < ZOOM_EPS) {
        skipped = v;
        return;
      }
      set(v);
    },
    // кінець жесту (або палець піднято): зум стає рівно там, де зупинились
    // пальці, а не на відстані пропущеного кроку
    settle() {
      if (skipped !== null) set(skipped);
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

export function useZoom(store) {
  return useSyncExternalStore(store.subscribe, store.get);
}
