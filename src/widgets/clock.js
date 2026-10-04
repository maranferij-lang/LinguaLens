// Час для таймлайнів віджетів. Справжній годинник: «Мої слова» міняються на
// парних годинах, серія тьмяніє о 18:00, «згасне опівночі» — з 22:00, слоти
// Pro відкриваються о своїх годинах.
//
// «Прискорений час» (лише розробка; Параметри → «Віджети»): година стає
// хвилиною, а межі доби — найближчими хвилинами, щоб власник за кілька
// хвилин побачив усе без нічних чергувань: ротація «Моїх слів» кожні 2 хв,
// серія — вечір за 2 хв, «пізно» за 4, «північ» за 6, слоти Pro — за 2, 4…
// Будівники беруть clock параметром, тож обидва режими під тими самими
// тестами.
import { useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_DEV } from '../config';

export const HOUR = 3600000;
export const REAL_CLOCK = { hour: HOUR, fast: false };
export const FAST_CLOCK = { hour: 60000, fast: true };

const KEY = 'll_dev_widget_clock_v1';
let fast = false;
const listeners = new Set();

export function widgetClock() {
  return IS_DEV && fast ? FAST_CLOCK : REAL_CLOCK;
}

export function setFastClock(on) {
  const next = IS_DEV && !!on;
  if (next === fast) return;
  fast = next;
  AsyncStorage.setItem(KEY, fast ? '1' : '').catch(() => {});
  listeners.forEach((fn) => fn());
}

// На старті розробницької збірки — перемикач з минулого запуску.
export async function loadFastClock() {
  if (!IS_DEV) return false;
  try {
    const on = (await AsyncStorage.getItem(KEY)) === '1';
    if (on !== fast) {
      fast = on;
      listeners.forEach((fn) => fn());
    }
  } catch (_) {}
  return fast;
}

function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function useWidgetClock() {
  return useSyncExternalStore(subscribe, widgetClock, widgetClock);
}

// Локальна північ дня d (+ days) — через new Date(y, m, d): перехід на
// літній чи зимовий час не зсуває межу доби.
export function midnight(d, days = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

// Година h дня d (+ days) за місцевим часом.
export function atHour(d, h, days = 0) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, h);
}
