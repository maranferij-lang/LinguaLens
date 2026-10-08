// Рядки полірування «Навчання» (жовтень 2026): озвучка відповідей квізу для
// VoiceOver і підказка до тосту досягнення. Власник — потік learn; інші
// потоки цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській (у російській
// апострофа немає), без емодзі, капсу й довгих тире. Ключ, який уже є в
// іншому фрагменті, не дублюємо. Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// Інтегратору: додати `import * as polishLearn from './strings/polish-learn';`
// в src/i18n.js, у FRAGMENTS (після pro), у merged() і в NAMES тесту
// __tests__/i18nFragments.test.js.
export default {
  en: {
    // ── тост досягнення ──
    achShareHint: 'Share this achievement',

    // ── квіз: що чує VoiceOver після відповіді (кольору недостатньо) ──
    quizCorrectA11y: 'Correct',
    quizWrongA11y: 'Not quite. The answer is {a}',
    quizTimeUpA11y: 'Time’s up. The answer is {a}',
  },
  uk: {
    achShareHint: 'Поділитись досягненням',

    quizCorrectA11y: 'Правильно',
    quizWrongA11y: 'Не зовсім. Правильна відповідь: {a}',
    quizTimeUpA11y: 'Час вийшов. Правильна відповідь: {a}',
  },
  de: {
    achShareHint: 'Erfolg teilen',

    quizCorrectA11y: 'Richtig',
    quizWrongA11y: 'Leider falsch. Richtig ist {a}',
    quizTimeUpA11y: 'Zeit ist um. Richtig ist {a}',
  },
  es: {
    achShareHint: 'Compartir este logro',

    quizCorrectA11y: 'Correcto',
    quizWrongA11y: 'No exactamente. La respuesta es {a}',
    quizTimeUpA11y: 'Se acabó el tiempo. La respuesta es {a}',
  },
  ru: {
    achShareHint: 'Поделиться достижением',

    quizCorrectA11y: 'Верно',
    quizWrongA11y: 'Не совсем. Правильный ответ: {a}',
    quizTimeUpA11y: 'Время вышло. Правильный ответ: {a}',
  },
};
