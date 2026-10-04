// Слово демо-анімації онбордингу — «чашка» всіма 29 мовами (onboarding.md
// §6). Демо намальоване кодом саме тому, що його можна підписати будь-якою
// парою мов: на табличці — слово мовою, яку людина вчить, і переклад її
// мовою, без жодної нової картинки. Та сама пара — у прев’ю «Моїх слів» на
// кроці «Віджети» (план S11).
//
// Артиклі — як у server/ai.js ARTICLE_EXAMPLES (іменник із родом — з
// артиклем). Транскрипція — лише там, де вона усталена й перевірена; решта
// мов без неї (табличка просто не показує рядок). Перед релізом таблицю
// перевіряють носії (план, ризик R7).
export const DEMO_WORDS = {
  en: { word: 'mug', ipa: '/mʌɡ/' },
  uk: { word: 'чашка' },
  de: { word: 'die Tasse', ipa: '/diː ˈtasə/' },
  es: { word: 'la taza', ipa: '/la ˈta.θa/' },
  fr: { word: 'la tasse', ipa: '/la tas/' },
  it: { word: 'la tazza', ipa: '/la ˈtat.tsa/' },
  pl: { word: 'kubek' },
  pt: { word: 'a caneca' },
  nl: { word: 'de mok' },
  cs: { word: 'hrnek' },
  sk: { word: 'hrnček' },
  ro: { word: 'cană' },
  hu: { word: 'bögre' },
  el: { word: 'κούπα' },
  sv: { word: 'mugg' },
  da: { word: 'krus' },
  no: { word: 'krus' },
  fi: { word: 'muki' },
  tr: { word: 'kupa' },
  ru: { word: 'кружка' },
  ja: { word: 'マグカップ' },
  ko: { word: '머그잔' },
  zh: { word: '马克杯' },
  ar: { word: 'كوب' },
  he: { word: 'ספל' },
  hi: { word: 'मग' },
  th: { word: 'แก้วมัค' },
  vi: { word: 'cốc' },
  id: { word: 'cangkir' },
};

// Пара для таблички: слово мовою навчання (з транскрипцією, якщо є) і
// переклад мовою перекладу. Невідомий код — англійська, як і всюди.
export function demoPair(target, native) {
  const w = DEMO_WORDS[target] || DEMO_WORDS.en;
  const tr = DEMO_WORDS[native] || DEMO_WORDS.en;
  return { word: w.word, ipa: w.ipa || '', translation: tr.word, lang: DEMO_WORDS[target] ? target : 'en' };
}
