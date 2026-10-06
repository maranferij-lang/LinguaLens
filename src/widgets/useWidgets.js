// Як App годує три віджети (widgets.md §10). Окремий хук, щоб App.js не
// розростався: App лише передає дані, а коли й що переписати — тут.
//
//   «Слово дня» — на кожен новий кеш, мову (чи її варіант), години слотів,
//     приховування перекладу чи тему;
//   «Мої слова» — із затримкою 2 с і лише коли змінився пул (id, переклади,
//     година повторення): під час карток кожна відповідь міняє srs, і без
//     підпису й затримки ми переписували б таймлайн на кожен тап;
//   «Серія» — коли змінились активні дні.
// Повернення застосунку на передній план переписує всі три (минув час:
// ротація, фази серії) — поки застосунок відкритий, WidgetKit такі
// перезавантаження в бюджет не рахує. На першому запуску всі три
// реєструються навіть без даних: віджет, доданий раніше за перше оновлення,
// інакше показав би «No layout found».
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getCalendars } from 'expo-localization';
import { activeDaySet } from '../streak';
import { settingsPair, slotHours } from '../wordOfDay';
import { WIDGET_REVEAL } from '../flags';
import { track } from '../analytics';
import { collectReveals, updateMyWordsWidget, updateStreakWidget, updateWordWidget } from './index';
import { widgetsAvailable } from './registry';
import { paletteSig, streakPalette, widgetPalette } from './palette';
import { thumbIds, wordsPool } from './wordsTimeline';
import { ensureThumbs, existingThumbs } from './thumbs';
import { useWidgetClock } from './clock';

export const WORDS_DEBOUNCE_MS = 2000;

function firstWeekdayOfPhone() {
  try {
    const n = getCalendars()[0]?.firstWeekday;
    return Number.isInteger(n) && n >= 1 && n <= 7 ? n : 2;
  } catch (_) {
    return 2;
  }
}

// ready — дані завантажено (до того віджет показав би «відкрий застосунок»);
// t, ui — перекладач і мова інтерфейсу; settings — мови, години, перемикач
// «ховати переклад»; wod — кеш слова дня; words, activity — словник і дні з
// діями; pro — чи є Pro (кілька слів на день); themeKey — ключ теми.
export function useWidgets({ ready, t, ui, settings, wod, words, activity, pro, themeKey }) {
  const available = useMemo(() => widgetsAvailable(), []);
  const clock = useWidgetClock();
  const [tick, setTick] = useState(0);
  const pal = useMemo(() => widgetPalette(themeKey), [themeKey]);
  // «Серії» — ще й вогник у кольорах палітри (flame*)
  const streakPal = useMemo(() => streakPalette(themeKey), [themeKey]);
  const palSig = paletteSig(pal);
  const hours = slotHours(settings, pro);
  const hoursSig = hours.join(',');
  const hide = WIDGET_REVEAL && settings.widgetHideTranslation !== false;
  const targetLang = settings.targetLang;
  const nativeLang = settings.nativeLang;
  // варіанти мов: кеш слова дня для англійської США не годиться для Британії
  const { variant, nativeVariant } = settingsPair(settings);
  const firstWeekday = useMemo(firstWeekdayOfPhone, []);

  // Повернення на передній план — свіжі таймлайни (минув час).
  useEffect(() => {
    if (!available) return undefined;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((x) => x + 1);
    });
    return () => sub?.remove?.();
  }, [available]);

  // Скільки разів відкривали «Переклад» у віджетах — один раз на старті.
  const harvested = useRef(false);
  useEffect(() => {
    if (!available || !ready || harvested.current) return;
    harvested.current = true;
    collectReveals()
      .then((counts) => {
        for (const [kind, n] of Object.entries(counts)) if (n) track('widget_reveal', { kind, n });
      })
      .catch(() => {});
  }, [available, ready]);

  // ── «Слово дня» ──
  useEffect(() => {
    if (!available || !ready) return;
    updateWordWidget(wod, { t, ui, targetLang, nativeLang, variant, nativeVariant, hours, hide, pal, clock });
    // hours і pal — за підписами: новий масив з тими самими годинами не причина
  }, [available, ready, wod, t, ui, targetLang, nativeLang, variant, nativeVariant, hoursSig, hide, palSig, clock, tick]);

  // ── «Мої слова» ──
  const wordsRef = useRef(words);
  wordsRef.current = words;
  const wordsSig = useMemo(() => {
    const pool = wordsPool(words, targetLang);
    const hour = (w) => Math.floor((Number(w.srs?.due) || 0) / 3600000);
    return [words.length, ...pool.map((w) => [w.id, w.word, w.translation, w.photo ? 1 : 0, hour(w), w.srs?.box ?? 0].join('|'))].join(
      '·'
    );
  }, [words, targetLang]);
  useEffect(() => {
    if (!available || !ready) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      const list = wordsRef.current;
      const opts = { t, targetLang, hide, pal, clock };
      const pool = wordsPool(list, targetLang).filter((w) => thumbIds([w]).length);
      // спершу з тим, що вже лежить, — і вдруге, коли мініатюри готові
      const have = existingThumbs(pool);
      updateMyWordsWidget(list, { ...opts, thumbs: have });
      ensureThumbs(pool)
        .then((thumbs) => {
          if (!alive) return;
          const added = Object.keys(thumbs).some((id) => !have[id]);
          if (added) updateMyWordsWidget(wordsRef.current, { ...opts, thumbs });
        })
        .catch(() => {});
    }, WORDS_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [available, ready, wordsSig, t, targetLang, hide, palSig, clock, tick]);

  // ── «Серія» ──
  const activeDays = useMemo(() => activeDaySet(activity, words), [activity, words]);
  const daysSig = useMemo(() => [...activeDays].sort().join(','), [activeDays]);
  useEffect(() => {
    if (!available || !ready) return;
    updateStreakWidget(activeDays, { t, firstWeekday, pal: streakPal, clock });
  }, [available, ready, daysSig, t, firstWeekday, palSig, clock, tick]);

  return available;
}
