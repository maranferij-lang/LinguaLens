// Віджети головного екрана й екрана блокування: «Слово дня», «Мої слова»,
// «Серія» (widgets.md, план W2). Публічне API для App, онбордингу й
// Параметрів.
//
// Застосунок не тримає віджети «живими»: він віддає WidgetKit таймлайни
// наперед (слова днів і слотів, ротацію слів на тиждень, фази серії до
// півночі), і система сама перемикає записи, навіть коли застосунок не
// запускали тиждень.
//
// Нативна частина є лише в iOS-збірці (не в Expo Go, не на Android, не в
// jest без заглушки), тож усе тут тихо нічого не робить, якщо її немає, і
// ніколи не кидає помилок у застосунок.
import { Linking } from 'react-native';
import { makeT } from '../i18n';
import { phoneUiLang } from '../locale';
import { buildWordTimeline } from './wordTimeline';
import { buildMyWordsTimeline } from './wordsTimeline';
import { buildStreakTimeline } from './streakTimeline';
import { carryReveals, forgetReveals, harvestReveals, readTimeline } from './reveals';
import { getWidget } from './registry';
import { cleanThumbs } from './thumbs';
import { parseWidgetLink } from './links';

export { buildWordTimeline } from './wordTimeline';
export { buildMyWordsTimeline, wordsPool, thumbIds } from './wordsTimeline';
export { buildStreakTimeline } from './streakTimeline';
export { carryReveals, harvestReveals } from './reveals';
export { isWidgetLink, parseWidgetLink, widgetLink } from './links';
export { streakPalette, widgetPalette } from './palette';
export { getWidget, widgetsAvailable } from './registry';

// Записує таймлайн, перенісши «Переклад», який людина вже відкрила у
// віджеті (reveals.js). true — таймлайн передано WidgetKit. Ніколи не кидає:
// віджет — приємний додаток, і його збій не має зачепити застосунок.
async function write(name, build) {
  const w = getWidget(name);
  if (!w) return false;
  try {
    const next = build();
    const old = await readTimeline(w);
    w.updateTimeline(carryReveals(old, next));
    return true;
  } catch (_) {
    return false;
  }
}

// cache — кеш слова дня; opts — див. buildWordTimeline.
export function updateWordWidget(cache, opts) {
  return write('WordOfDay', () => buildWordTimeline(cache, opts));
}

// words — словник; opts — див. buildMyWordsTimeline.
export function updateMyWordsWidget(words, opts) {
  return write('MyWords', () => buildMyWordsTimeline(words, opts));
}

// activeDays — streak.activeDaySet(…); opts — див. buildStreakTimeline.
export function updateStreakWidget(activeDays, opts) {
  return write('Streak', () => buildStreakTimeline(activeDays, opts));
}

// Усі три — у порожній стан: стерли дані, «Почати з нуля», вихід. Мініатюри
// й лік розкриттів — теж. t необов'язковий (мова телефону).
export async function resetWidgets(t) {
  const tt = typeof t === 'function' ? t : makeT(phoneUiLang());
  cleanThumbs();
  await forgetReveals();
  const now = new Date();
  const done = await Promise.all([
    updateWordWidget(null, { t: tt, targetLang: '', nativeLang: '', now }),
    updateMyWordsWidget([], { t: tt, targetLang: '', now }),
    updateStreakWidget(new Set(), { t: tt, now }),
  ]);
  return done.some(Boolean);
}

// Скільки разів відкрили «Переклад» у віджетах з минулого разу:
// → { wod: n, words: n } (кожен запис рахується один раз).
export async function collectReveals() {
  const timelines = {};
  for (const [kind, name] of [
    ['wod', 'WordOfDay'],
    ['words', 'MyWords'],
  ]) {
    const w = getWidget(name);
    timelines[kind] = w ? await readTimeline(w) : [];
  }
  return harvestReveals(timelines);
}

// Тап по віджету → onLink(розібране посилання). Як і зі сповіщеннями,
// холодний старт приносить адресу через getInitialURL, а запущений
// застосунок — подією 'url'. Обидва шляхи можуть повідомити той самий тап —
// колбек має бути ідемпотентним.
export function subscribeToWidgetTaps(onLink) {
  let active = true;
  Linking.getInitialURL()
    .then((url) => {
      const link = parseWidgetLink(url);
      if (active && link) onLink(link);
    })
    .catch(() => {});
  const sub = Linking.addEventListener('url', (e) => {
    const link = parseWidgetLink(e?.url);
    if (link) onLink(link);
  });
  return () => {
    active = false;
    sub?.remove?.();
  };
}
