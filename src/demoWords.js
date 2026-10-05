// Слово демо-анімації онбордингу — «чашка» всіма 29 мовами (onboarding.md
// §6). Демо намальоване кодом саме тому, що його можна підписати будь-якою
// парою мов: на табличці — слово мовою, яку людина вчить, і переклад її
// мовою, без жодної нової картинки. Та сама пара — у прев’ю «Моїх слів» на
// кроці «Віджети» (план S11).
//
// Онбординг 4.0: у кожної чашки є приклад — одне й те саме речення («У цій
// чашці гаряча кава» — на столі в демо якраз парує червона чашка) усіма
// мовами. Його показують картка-приклад на кроці «Що таке слово дня» і
// сповіщення в рамці телефона на кроці сповіщень: план ще не складено, тож
// справжнього слова дня ще немає, а мережа не потрібна.
//
// Артиклі — як у server/ai.js ARTICLE_EXAMPLES (іменник із родом — з
// артиклем). Транскрипція — лише там, де вона усталена й перевірена; решта
// мов без неї (табличка просто не показує рядок). Перед релізом таблицю
// перевіряють носії (план, ризик R7).
export const DEMO_WORDS = {
  en: { word: 'mug', ipa: '/mʌɡ/', example: 'There’s hot coffee in this mug.' },
  uk: { word: 'чашка', example: 'У цій чашці гаряча кава.' },
  de: { word: 'die Tasse', ipa: '/diː ˈtasə/', example: 'In dieser Tasse ist heißer Kaffee.' },
  es: { word: 'la taza', ipa: '/la ˈta.θa/', example: 'En esta taza hay café caliente.' },
  fr: { word: 'la tasse', ipa: '/la tas/', example: 'Il y a du café chaud dans cette tasse.' },
  it: { word: 'la tazza', ipa: '/la ˈtat.tsa/', example: 'In questa tazza c’è caffè caldo.' },
  pl: { word: 'kubek', example: 'W tym kubku jest gorąca kawa.' },
  pt: { word: 'a caneca', example: 'Há café quente nesta caneca.' },
  nl: { word: 'de mok', example: 'In deze mok zit hete koffie.' },
  cs: { word: 'hrnek', example: 'V tomhle hrnku je horká káva.' },
  sk: { word: 'hrnček', example: 'V tomto hrnčeku je horúca káva.' },
  ro: { word: 'cană', example: 'În cana asta e cafea fierbinte.' },
  hu: { word: 'bögre', example: 'Ebben a bögrében forró kávé van.' },
  el: { word: 'κούπα', example: 'Σε αυτή την κούπα έχει ζεστό καφέ.' },
  sv: { word: 'mugg', example: 'Det är varmt kaffe i den här muggen.' },
  da: { word: 'krus', example: 'Der er varm kaffe i det her krus.' },
  no: { word: 'krus', example: 'Det er varm kaffe i dette kruset.' },
  fi: { word: 'muki', example: 'Tässä mukissa on kuumaa kahvia.' },
  tr: { word: 'kupa', example: 'Bu kupada sıcak kahve var.' },
  ru: { word: 'кружка', example: 'В этой кружке горячий кофе.' },
  ja: { word: 'マグカップ', example: 'このマグカップには熱いコーヒーが入っています。' },
  ko: { word: '머그잔', example: '이 머그잔에는 뜨거운 커피가 들어 있어요.' },
  zh: { word: '马克杯', example: '这个马克杯里有热咖啡。' },
  ar: { word: 'كوب', example: 'في هذا الكوب قهوة ساخنة.' },
  he: { word: 'ספל', example: 'בספל הזה יש קפה חם.' },
  hi: { word: 'मग', example: 'इस मग में गरम कॉफ़ी है।' },
  th: { word: 'แก้วมัค', example: 'ในแก้วมัคใบนี้มีกาแฟร้อน' },
  vi: { word: 'cốc', example: 'Trong cốc này có cà phê nóng.' },
  id: { word: 'cangkir', example: 'Di cangkir ini ada kopi panas.' },
};

// Сцена демо (онбординг 4.0, біт «Або цілу сцену»): над ноутбуком, рослиною
// й блокнотом на столі спливають їхні слова — тими ж правилами, що й чашка
// (артиклі для de/fr/es/it/pt/nl, словникова форма, з малої).
export const SCENE_WORDS = {
  en: { laptop: 'laptop', plant: 'plant', notebook: 'notebook' },
  uk: { laptop: 'ноутбук', plant: 'рослина', notebook: 'блокнот' },
  de: { laptop: 'der Laptop', plant: 'die Pflanze', notebook: 'das Notizbuch' },
  es: { laptop: 'el portátil', plant: 'la planta', notebook: 'el cuaderno' },
  fr: { laptop: 'l’ordinateur', plant: 'la plante', notebook: 'le carnet' },
  it: { laptop: 'il portatile', plant: 'la pianta', notebook: 'il quaderno' },
  pl: { laptop: 'laptop', plant: 'roślina', notebook: 'notes' },
  pt: { laptop: 'o laptop', plant: 'a planta', notebook: 'o caderno' },
  nl: { laptop: 'de laptop', plant: 'de plant', notebook: 'het notitieboek' },
  cs: { laptop: 'notebook', plant: 'rostlina', notebook: 'zápisník' },
  sk: { laptop: 'notebook', plant: 'rastlina', notebook: 'zápisník' },
  ro: { laptop: 'laptop', plant: 'plantă', notebook: 'carnet' },
  hu: { laptop: 'laptop', plant: 'növény', notebook: 'jegyzetfüzet' },
  el: { laptop: 'λάπτοπ', plant: 'φυτό', notebook: 'σημειωματάριο' },
  sv: { laptop: 'laptop', plant: 'växt', notebook: 'anteckningsbok' },
  da: { laptop: 'bærbar', plant: 'plante', notebook: 'notesbog' },
  no: { laptop: 'bærbar PC', plant: 'plante', notebook: 'notatbok' },
  fi: { laptop: 'kannettava', plant: 'kasvi', notebook: 'muistikirja' },
  tr: { laptop: 'dizüstü', plant: 'bitki', notebook: 'defter' },
  ru: { laptop: 'ноутбук', plant: 'растение', notebook: 'блокнот' },
  ja: { laptop: 'ノートパソコン', plant: '植物', notebook: 'ノート' },
  ko: { laptop: '노트북', plant: '식물', notebook: '공책' },
  zh: { laptop: '笔记本电脑', plant: '植物', notebook: '笔记本' },
  ar: { laptop: 'حاسوب محمول', plant: 'نبتة', notebook: 'دفتر' },
  he: { laptop: 'מחשב נייד', plant: 'צמח', notebook: 'מחברת' },
  hi: { laptop: 'लैपटॉप', plant: 'पौधा', notebook: 'नोटबुक' },
  th: { laptop: 'แล็ปท็อป', plant: 'ต้นไม้', notebook: 'สมุดโน้ต' },
  vi: { laptop: 'laptop', plant: 'cây cảnh', notebook: 'sổ tay' },
  id: { laptop: 'laptop', plant: 'tanaman', notebook: 'buku catatan' },
};
// Порядок підписів у сцені — так вони й спливають
export const SCENE_KEYS = ['mug', 'laptop', 'plant', 'notebook'];

// Пара для таблички: слово мовою навчання (з транскрипцією, якщо є) і
// переклад мовою перекладу. Невідомий код — англійська, як і всюди.
export function demoPair(target, native) {
  const w = DEMO_WORDS[target] || DEMO_WORDS.en;
  const tr = DEMO_WORDS[native] || DEMO_WORDS.en;
  return { word: w.word, ipa: w.ipa || '', translation: tr.word, lang: DEMO_WORDS[target] ? target : 'en' };
}

// Та сама пара з прикладом і його перекладом — для картки-прикладу слова
// дня й сповіщення в онбордингу
export function demoExample(target, native) {
  const pair = demoPair(target, native);
  const w = DEMO_WORDS[pair.lang];
  const tr = DEMO_WORDS[native] || DEMO_WORDS.en;
  return { ...pair, example: w.example, exampleTranslation: tr.example };
}

// Підписи сцени: [{ key, word, translation }] у порядку SCENE_KEYS
export function demoScene(target, native) {
  const lang = SCENE_WORDS[target] ? target : 'en';
  const from = SCENE_WORDS[native] || SCENE_WORDS.en;
  const pair = demoPair(target, native);
  return SCENE_KEYS.map((key) =>
    key === 'mug' ? { key, word: pair.word, translation: pair.translation } : { key, word: SCENE_WORDS[lang][key], translation: from[key] }
  );
}
