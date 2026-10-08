// Рядки полірування примітивів (жовтень 2026): підписи для VoiceOver там, де
// на екрані замість вмісту стоїть Skeleton (src/ui.js). Сам Skeleton від
// VoiceOver прихований, тож «завантажується» каже контейнер навколо нього.
// Власник — потік primitives; інші потоки цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській (у російській
// апострофа немає), без емодзі, капсу й довгих тире. Ключ, який уже є в
// іншому фрагменті, не дублюємо. Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// Інтегратору: додати `import * as polishPrimitives from './strings/polish-primitives';`
// в src/i18n.js, у FRAGMENTS (після polish-scanner), у merged() і в NAMES тесту
// __tests__/i18nFragments.test.js (там же «ten fragments» стане «eleven»).
export default {
  en: {
    // ── підпис контейнера зі Skeleton (accessible, busy) ──
    loading: 'Loading',
  },
  uk: {
    loading: 'Завантаження',
  },
  de: {
    loading: 'Wird geladen',
  },
  es: {
    loading: 'Cargando',
  },
  ru: {
    loading: 'Загрузка',
  },
};
