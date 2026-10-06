// Розпізнавання й переклад через AI. Ключі живуть лише тут, на сервері.
//
// Провайдери: gemini (безкоштовний ключ для тестів), anthropic (якість),
// mock (без ключа взагалі — щоб ганяти застосунок локально й у тестах).

const store = require('./store');

const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

const LANG_NAMES = {
  en: 'English',
  uk: 'Ukrainian',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  pl: 'Polish',
  pt: 'Portuguese',
  nl: 'Dutch',
  cs: 'Czech',
  sk: 'Slovak',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
  sv: 'Swedish',
  da: 'Danish',
  no: 'Norwegian',
  fi: 'Finnish',
  tr: 'Turkish',
  ru: 'Russian',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese (Simplified)',
  ar: 'Arabic',
  he: 'Hebrew',
  hi: 'Hindi',
  th: 'Thai',
  vi: 'Vietnamese',
  id: 'Indonesian',
};

// Мови, де рід іменника не вгадати зі слова. Слово без артикля для них —
// напівзнання: «Tasse» без «die» доведеться перевчати.
const ARTICLE_EXAMPLES = {
  de: 'die Tasse',
  fr: 'la tasse',
  es: 'la taza',
  it: 'la tazza',
  pt: 'a caneca',
  nl: 'de mok',
};

// Версія підказки входить у ключ кешу перекладів: змінили правила (артиклі,
// регістр) — старі записи більше не підтягуються.
const PROMPT_VERSION = 2;
// Тематичні слова (персональне слово дня) перекладаються іншою підказкою —
// з темою й значенням — і кешуються окремо від загальних: «ledger» з фінансів
// і «ledger» без контексту — різні переклади.
const TOPIC_PROMPT_VERSION = 3;

// Назви тем для підказки моделі (ключі — як у server/topics). general тут
// немає: загальні слова перекладаються без теми, як і до персоналізації.
const TOPIC_NAMES = {
  workplace: 'office and workplace communication',
  academic: 'academic study and university life',
  travel: 'travel',
  relocation: 'moving abroad and settling in a new country',
  it: 'IT and software development',
  marketing: 'marketing',
  finance: 'finance and accounting',
  sales: 'sales',
  management: 'management',
  design: 'design',
  medicine: 'medicine and healthcare',
  law: 'law',
  engineering: 'engineering',
  education: 'teaching and education',
  hospitality: 'hospitality and tourism',
};

// Рівень зі слайдера онбордингу (1–10) змінює приклад: до 3 — коротке просте
// речення (новачок спотикається на «he knocked on the door and nobody
// answered»), від 7 — живе речення і ще 2–3 вирази зі словом (саме слово
// «mug» просунутому нічого не дає). Без рівня — рівно як до персоналізації:
// старі версії застосунку його не надсилають.
const SIMPLE_UP_TO_LEVEL = 3;
const EXTRAS_FROM_LEVEL = 7;
const MAX_EXTRAS = 3;

function levelOf(level) {
  return Number.isInteger(level) && level >= 1 && level <= 10 ? level : null;
}

function wantsExtras(level) {
  const lv = levelOf(level);
  return lv !== null && lv >= EXTRAS_FROM_LEVEL;
}

function exampleSpec(L, level) {
  const lv = levelOf(level);
  if (lv !== null && lv <= SIMPLE_UP_TO_LEVEL) {
    return `one very short, simple ${L} sentence using the word: at most 8 words, present tense`;
  }
  if (lv !== null && lv >= EXTRAS_FROM_LEVEL) {
    return `one natural, richer ${L} sentence using the word, the way a fluent speaker would say it`;
  }
  return `one short natural ${L} sentence using the word`;
}

// Рядки правил під рівень (порожньо без рівня і для 4–6).
function levelRules(L, N, level, extras) {
  const lv = levelOf(level);
  if (lv !== null && lv <= SIMPLE_UP_TO_LEVEL) {
    return '\nThe learner is a beginner: the example must be very short and simple, at most 8 words, present tense, everyday vocabulary.';
  }
  if (lv === null || lv < EXTRAS_FROM_LEVEL) return '';
  return (
    '\nThe learner is advanced: make the example natural and idiomatic, not a textbook sentence.' +
    (extras
      ? `\n"extras" are 2-3 useful ${L} collocations, idioms or phrasal verbs with this word that fluent speakers really use, each at most 5 words, with "translation" into ${N}. Never the word on its own.`
      : '')
  );
}

function langName(code, fallback) {
  return LANG_NAMES[code] || fallback;
}

// Правило власника: у тексті, який бачить людина, немає довгих тире. Слово,
// переклад, приклад і вирази модель пише без них. Сама підказка теж
// обходиться без тире: модель охоче повторює стиль запиту. Те, що все ж
// прослизне, прибирає undash() у cleanWord/cleanExtras.
const NO_DASHES_RULE =
  'Never use an em dash or an en dash as punctuation in any text you write (word, translation, example, example_translation, phrases): use a comma, a colon or a full stop instead. Hyphens inside words and number ranges like 1-2 are fine.';

function wordRules(lang) {
  const L = langName(lang, 'English');
  const article = ARTICLE_EXAMPLES[lang]
    ? ` Include the definite article, e.g. "${ARTICLE_EXAMPLES[lang]}".`
    : '';
  return `Write "word" in dictionary form: lowercase unless ${L} spelling requires a capital letter (German nouns are always capitalised).${article}`;
}

function buildScanPrompt(lang, nativeLang, level = null) {
  const L = langName(lang, 'English');
  const N = langName(nativeLang, 'Ukrainian');
  const extras = wantsExtras(level);
  const extrasJson = extras ? `"extras":[{"phrase":"<${L} phrase with the word>","translation":"<its translation into ${N}>"}],` : '';
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
Identify the single most prominent object in the photo.
Reply with ONLY minified JSON, no markdown, no extra text:
{"word":"<specific common ${L} name of the object, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<${exampleSpec(L, level)}>","example_translation":"<translation of that sentence into ${N}>",${extrasJson}"box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}
${wordRules(lang)}${levelRules(L, N, level, extras)}
${NO_DASHES_RULE}
Prefer specific but commonly used words (e.g. "mug", not "container").
"box" is the tight bounding box of that object, four integers 0-1000,
normalised to the image (y first, like Gemini spatial output). The app crops
the object out of the photo by this box, so the box must hug the object
tightly: no extra background, no cropping off parts of it.
"outline" is the object's silhouette as a closed polygon: 16 to 32 points,
each [y,x] with integers 0-1000 normalised to the WHOLE image, walking the
visible edge of the object clockwise. The app cuts the object out along this
line and draws a white sticker border around it, so follow the real contour
closely (handles, spouts, legs), not the bounding box, and stay just outside
the object's edge rather than inside it.
If no clear object is visible, return {"word":"unknown"}.`;
}

// Скан цілої сцени: кілька предметів з одного кадру. Кадр — портрет 9:16
// (формат Stories), тому координати рамок і контурів — від усього кадру.
// Правила відбору тут важливіші, ніж в одиночному скані: модель сама
// вирішує, що варте картки, а людина бачить результат як готову підбірку.
const MAX_SCENE_OBJECTS = 8;

// Рівень змінює лише приклади: вирази (extras) для восьми предметів
// роздули б відповідь і час очікування, тож вони тільки в одиночному скані.
function buildScenePrompt(lang, nativeLang, level = null) {
  const L = langName(lang, 'English');
  const N = langName(nativeLang, 'Ukrainian');
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
The photo shows a whole scene (a room, a desk, a shelf, a street). Find up to ${MAX_SCENE_OBJECTS} distinct, clearly visible physical objects that a learner can name.
Reply with ONLY minified JSON, no markdown, no extra text:
{"objects":[{"word":"<specific common ${L} name of the object, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<${exampleSpec(L, level)}>","example_translation":"<translation of that sentence into ${N}>","box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}]}
${wordRules(lang)}${levelRules(L, N, level, false)}
${NO_DASHES_RULE}
Which objects to include:
- Everyday vocabulary that is useful to a learner. Prefer specific but commonly used words (e.g. "mug", not "container").
- Variety: one entry per kind of object. Three books are one "book": describe the most visible one.
- Order the list by prominence: the largest, most central, sharpest object first.
- Never include people, faces, body parts, clothing worn by a person, text, signs, logos or brand names.
- Skip tiny objects (smaller than about 2% of the image) and objects cut off so much that they are hard to recognise.
- Skip surfaces and structure (wall, floor, ceiling, ground, sky) unless nothing else is visible.
"box" is the tight bounding box of the object: four integers 0-1000 normalised to the WHOLE image, y first (like Gemini spatial output). It must hug the object: no extra background, no parts cut off.
"outline" is the object's silhouette as a closed polygon of 12 to 24 points, each [y,x] with integers 0-1000 normalised to the WHOLE image (not to the box), walking the visible edge clockwise and staying just outside the object's edge. Follow the real contour (handles, legs, leaves), not the box.
If no suitable object is visible, return {"objects":[]}.`;
}

// Тема, яку знає підказка, або 'general' (невідома тема — як загальне слово).
function topicOf(topic) {
  return typeof topic === 'string' && Object.hasOwn(TOPIC_NAMES, topic) ? topic : 'general';
}

// Значення слова з тематичного списку (наші дані, ≤ 70 символів) — щоб
// «ledger» став «головною книгою», а не «полицею». Крапку в кінці ставить
// buildTranslatePrompt.
function hintText(hint) {
  return typeof hint === 'string' ? hint.trim().replace(/[.\s]+$/, '').slice(0, 200) : '';
}

// Загальне слово — та сама підказка, що й до персоналізації (і той самий
// кеш), лише зі значенням, якщо список його дає. Тематичне — з темою,
// значенням і прикладом із живої ситуації цієї теми.
function buildTranslatePrompt(enWord, lang, nativeLang, { topic, hint } = {}) {
  const L = langName(lang, 'English');
  const N = langName(nativeLang, 'Ukrainian');
  const t = topicOf(topic);
  const meaning = hintText(hint);
  if (t === 'general') {
    return (
      `Translate the English concept "${enWord}" for a language learner.\n` +
      (meaning ? `Meaning: ${meaning}.\n` : '') +
      `Target language: ${L}. Learner's native language: ${N}.\n` +
      `${wordRules(lang)}\n${NO_DASHES_RULE}\n` +
      `Reply with ONLY minified JSON, no markdown:\n` +
      `{"word":"<the word in ${L}>","ipa":"<IPA of that ${L} word>",` +
      `"translation":"<the word in ${N}>","example":"<one short natural ${L} sentence using it>",` +
      `"example_translation":"<that sentence in ${N}>"}`
    );
  }
  const name = TOPIC_NAMES[t];
  return (
    `Translate "${enWord}", an English term from ${name}, for a language learner.\n` +
    (meaning ? `Meaning in this context: ${meaning}.\n` : '') +
    `Target language: ${L}. Learner's native language: ${N}.\n` +
    `Give the equivalents that people really use in ${name} in both languages, not word-for-word calques.\n` +
    `${wordRules(lang)}\n${NO_DASHES_RULE}\n` +
    `Reply with ONLY minified JSON, no markdown:\n` +
    `{"word":"<the term in ${L}>","ipa":"<IPA of that ${L} term>",` +
    `"translation":"<the term in ${N}>","example":"<one natural ${L} sentence using it in a realistic situation from ${name}>",` +
    `"example_translation":"<that sentence in ${N}>"}`
  );
}

// Ключ кешу перекладу. Загальні слова — формат до персоналізації, тож уже
// перекладені слова не перекладаються вдруге; тематичні — свій простір.
// Firestore не приймає «/» в id, тому все, крім букв, цифр, «|» і «-», — «_».
function wordCacheKey(enWord, lang, nativeLang, topic) {
  const t = topicOf(topic);
  const raw =
    t === 'general'
      ? `v${PROMPT_VERSION}|${enWord}|${lang}|${nativeLang}`
      : `v${TOPIC_PROMPT_VERSION}|${t}|${enWord}|${lang}|${nativeLang}`;
  return raw.replace(/[^\w|-]/g, '_');
}

function parseModelJson(text) {
  const cleaned = String(text || '')
    .trim()
    .replace(/^```(json)?/i, '')
    .replace(/```$/, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch (_) {}
    }
  }
  return null;
}

// Скан має вкластися в таймаут застосунку (25 с, src/api.js): відповідь,
// що прийшла пізніше, людина вже не побачить. Тому один дедлайн на обидві
// спроби, із запасом на мережу. Сцену застосунок чекає 40 с — у ній до
// восьми предметів із контурами, і модель пише в кілька разів більше. Слово
// дня застосунок чекає 45 с.
const SCAN_BUDGET_MS = 21000;
const SCENE_BUDGET_MS = 34000;
const TEXT_BUDGET_MS = 40000;

// Стеля довжини відповіді Anthropic. Один предмет із контуром — це ~400
// токенів, вісім — до ~3200. Зі стелею одиночного скану сцена обривалась
// би на півслові й не розбиралась як JSON.
const SCAN_MAX_TOKENS = 600;
// Вирази для просунутих і довший приклад — ще ~150 токенів.
const SCAN_EXTRAS_MAX_TOKENS = 800;
const SCENE_MAX_TOKENS = 3500;

// fetch у межах дедлайну і з одним повтором при 503 (перевантаження AI),
// якщо на повтор ще лишається час
async function fetchAI(url, options, budgetMs) {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    const left = Math.max(1000, deadline - Date.now());
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(left) });
    if (res.status === 503 && attempt === 1 && deadline - Date.now() > 8000) {
      console.log('  503 від AI, повтор через 2с…');
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    return res;
  }
}

async function callAnthropic(content, budgetMs, maxTokens = SCAN_MAX_TOKENS) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY не заданий у .env');
  const res = await fetchAI('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content }],
    }),
  }, budgetMs);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Anthropic ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  return parseModelJson(data?.content?.[0]?.text);
}

// Ключ іде заголовком, а не в ?key= — URL з ключем осідає в логах проксі.
async function callGemini(parts, budgetMs) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не заданий у .env');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
  const res = await fetchAI(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        response_mime_type: 'application/json',
        // без цього модель "думає" 40-180с; minimal = майже миттєво
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    }),
  }, budgetMs);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Gemini ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  return parseModelJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

// ---------- MOCK ----------
// Канонічна відповідь без мережі: застосунок можна прогнати від камери до
// флешкарток без жодного ключа. Чашка по центру кадру.
const MOCK_SCAN = {
  en: { word: 'mug', ipa: '/mʌɡ/', example: 'I drink tea from my favourite mug.' },
  de: { word: 'die Tasse', ipa: '/diː ˈtasə/', example: 'Ich trinke Tee aus meiner Lieblingstasse.' },
  es: { word: 'la taza', ipa: '/la ˈtaθa/', example: 'Bebo té en mi taza favorita.' },
};
const MOCK_NATIVE = {
  uk: { translation: 'кружка', example_translation: 'Я п’ю чай зі своєї улюбленої кружки.' },
  en: { translation: 'mug', example_translation: 'I drink tea from my favourite mug.' },
};
const MOCK_OUTLINE = [
  [300, 360], [292, 450], [292, 550], [300, 640], [330, 650], [380, 700], [430, 730],
  [490, 735], [540, 715], [570, 680], [580, 650], [640, 645], [690, 630], [705, 600],
  [708, 500], [705, 400], [690, 370], [640, 355], [520, 352], [400, 352],
];

// Вирази для просунутих (рівень 7+). Переклад — українською, для решти
// рідних мов англійською, як у MOCK_NATIVE.
const MOCK_EXTRAS = {
  en: [
    { phrase: 'a mug of tea', uk: 'кружка чаю', en: 'a mug full of tea' },
    { phrase: 'travel mug', uk: 'термокружка', en: 'a lidded mug for drinks on the go' },
    { phrase: 'refill a mug', uk: 'знову наповнити кружку', en: 'fill a mug again' },
  ],
  de: [
    { phrase: 'eine Tasse Tee', uk: 'чашка чаю', en: 'a cup of tea' },
    { phrase: 'die Kaffeetasse', uk: 'кавова чашка', en: 'coffee cup' },
    { phrase: 'nicht alle Tassen im Schrank haben', uk: 'бути не сповна розуму', en: 'to be a bit crazy' },
  ],
  es: [
    { phrase: 'una taza de café', uk: 'чашка кави', en: 'a cup of coffee' },
    { phrase: 'la taza de té', uk: 'чашка для чаю', en: 'teacup' },
    { phrase: 'llenar la taza', uk: 'наповнити чашку', en: 'fill the cup' },
  ],
};

function mockScan(lang, nativeLang, level) {
  const w = MOCK_SCAN[lang] || MOCK_SCAN.en;
  const n = MOCK_NATIVE[nativeLang] || MOCK_NATIVE.en;
  const out = { ...w, ...n, box: [290, 350, 710, 740], outline: MOCK_OUTLINE };
  if (wantsExtras(level)) {
    out.extras = (MOCK_EXTRAS[lang] || MOCK_EXTRAS.en).map((x) => ({
      phrase: x.phrase,
      translation: nativeLang === 'uk' ? x.uk : x.en,
    }));
  }
  return out;
}

// Сцена без мережі: чотири предмети в кадрі 9:16, від найпомітнішого.
// Контури — вписані в рамку багатокутники за годинниковою стрілкою, як
// просить підказка. Рідна мова, якої тут немає, — англійська, як у MOCK_NATIVE.
const MOCK_SCENE = [
  {
    box: [520, 140, 760, 470],
    en: { word: 'mug', ipa: '/mʌɡ/', example: 'I drink tea from my favourite mug.' },
    de: { word: 'die Tasse', ipa: '/diː ˈtasə/', example: 'Ich trinke Tee aus meiner Lieblingstasse.' },
    es: { word: 'la taza', ipa: '/la ˈtaθa/', example: 'Bebo té en mi taza favorita.' },
    uk: { translation: 'кружка', example_translation: 'Я п’ю чай зі своєї улюбленої кружки.' },
  },
  {
    box: [150, 560, 600, 900],
    en: { word: 'plant', ipa: '/plænt/', example: 'The plant needs more light.' },
    de: { word: 'die Pflanze', ipa: '/diː ˈpflant͡sə/', example: 'Die Pflanze braucht mehr Licht.' },
    es: { word: 'la planta', ipa: '/la ˈplanta/', example: 'La planta necesita más luz.' },
    uk: { translation: 'рослина', example_translation: 'Рослині потрібно більше світла.' },
  },
  {
    box: [780, 380, 900, 860],
    en: { word: 'book', ipa: '/bʊk/', example: 'The book is on the table.' },
    de: { word: 'das Buch', ipa: '/das buːx/', example: 'Das Buch liegt auf dem Tisch.' },
    es: { word: 'el libro', ipa: '/el ˈliβɾo/', example: 'El libro está en la mesa.' },
    uk: { translation: 'книжка', example_translation: 'Книжка лежить на столі.' },
  },
  {
    box: [90, 100, 440, 420],
    en: { word: 'lamp', ipa: '/læmp/', example: 'Turn on the lamp, please.' },
    de: { word: 'die Lampe', ipa: '/diː ˈlampə/', example: 'Mach bitte die Lampe an.' },
    es: { word: 'la lámpara', ipa: '/la ˈlampaɾa/', example: 'Enciende la lámpara, por favor.' },
    uk: { translation: 'лампа', example_translation: 'Увімкни, будь ласка, лампу.' },
  },
];

// 16 точок по еліпсу, вписаному в рамку: старт угорі, далі праворуч, униз
// і ліворуч — тобто за годинниковою стрілкою на екрані (y росте донизу).
function ellipseOutline([y1, x1, y2, x2], points = 16) {
  const cy = (y1 + y2) / 2;
  const cx = (x1 + x2) / 2;
  return Array.from({ length: points }, (_, i) => {
    const a = (2 * Math.PI * i) / points;
    return [Math.round(cy - ((y2 - y1) / 2) * Math.cos(a)), Math.round(cx + ((x2 - x1) / 2) * Math.sin(a))];
  });
}

function mockScene(lang, nativeLang) {
  return {
    objects: MOCK_SCENE.map((o) => {
      const w = o[lang] || o.en;
      const n = nativeLang === 'uk' ? o.uk : { translation: o.en.word, example_translation: o.en.example };
      return { ...w, ...n, box: o.box, outline: ellipseOutline(o.box) };
    }),
  };
}

function mockTranslate(enWord, lang, nativeLang) {
  return {
    word: enWord,
    ipa: '',
    translation: `${enWord} (${nativeLang})`,
    example: `This is a ${enWord}.`,
    example_translation: `${enWord}: приклад (${lang}→${nativeLang}).`,
  };
}

// ---------- ПУБЛІЧНЕ ----------
// level — 1–10 зі слайдера або null (як до персоналізації).
async function recognize(base64, lang, nativeLang, level = null) {
  if (PROVIDER === 'mock') return mockScan(lang, nativeLang, level);
  const prompt = buildScanPrompt(lang, nativeLang, level);
  if (PROVIDER === 'anthropic') {
    return callAnthropic([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: prompt },
    ], SCAN_BUDGET_MS, wantsExtras(level) ? SCAN_EXTRAS_MAX_TOKENS : SCAN_MAX_TOKENS);
  }
  return callGemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], SCAN_BUDGET_MS);
}

// Сирий JSON моделі для сцени; розбирає й чистить його cleanScene.
async function recognizeScene(base64, lang, nativeLang, level = null) {
  if (PROVIDER === 'mock') return mockScene(lang, nativeLang);
  const prompt = buildScenePrompt(lang, nativeLang, level);
  if (PROVIDER === 'anthropic') {
    return callAnthropic([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: prompt },
    ], SCENE_BUDGET_MS, SCENE_MAX_TOKENS);
  }
  return callGemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], SCENE_BUDGET_MS);
}

async function callText(prompt) {
  if (PROVIDER === 'anthropic') return callAnthropic([{ type: 'text', text: prompt }], TEXT_BUDGET_MS);
  return callGemini([{ text: prompt }], TEXT_BUDGET_MS);
}

// Переклад слова дня з кешем (щоб не витрачати квоту на однакові пари).
// topic і hint — з тематичного списку (wordplan.js); без них — загальне
// слово, як у GET /word-of-day.
async function translateWord(enWord, lang, nativeLang, { topic, hint } = {}) {
  const key = wordCacheKey(enWord, lang, nativeLang, topic);
  const cached = await store.get('wordCache', key);
  // Запис кешу з часів до правила «без тире» чистимо на льоту, тож
  // PROMPT_VERSION заради нього не піднімаємо: усе вже перекладене не
  // перекладається вдруге.
  if (cached && cached.word) return { ...cached, ...cleanWord(cached) };

  const parsed =
    PROVIDER === 'mock'
      ? mockTranslate(enWord, lang, nativeLang)
      : await callText(buildTranslatePrompt(enWord, lang, nativeLang, { topic, hint }));
  if (!parsed || !parsed.word) throw new Error('bad translation');
  const out = { ...cleanWord(parsed), source: enWord };
  if (PROVIDER !== 'mock') await store.put('wordCache', key, out);
  return out;
}

// Відповідь моделі — недовірений текст: обрізаємо довжину, щоб випадковий
// «роман» у полі не розвалив картку в застосунку.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

// Довге тире, яке модель усе ж поставила (правило власника: у тексті його
// немає ніде), стає комою: «I love it — really.» → «I love it, really.».
// Діалогове тире на початку й висяче в кінці зникають, зайві коми після
// заміни теж. Дефіс у слові (T-shirt) і коротке тире діапазону без пробілів
// (1–2, A1–C2) лишаються. Текст без тире не змінюється ані на символ.
const DASHY = /[\u2014\u2015]|\s[\u2012\u2013-]\s|^[\u2012\u2013-]\s|\s[\u2012\u2013-]$/;

function undash(s) {
  if (!DASHY.test(s)) return s;
  return s
    .replace(/\s*[\u2014\u2015]\s*/g, ', ')
    .replace(/\s+[\u2012\u2013-]\s+/g, ', ')
    .replace(/^[\u2012\u2013-]\s+/, '')
    .replace(/\s+[\u2012\u2013-]$/, '')
    .replace(/\s*,(?:\s*,)+/g, ',')
    .replace(/\s+,/g, ',')
    .replace(/([(«„])\s*,\s*/g, '$1')
    .replace(/^\s*,\s*/, '')
    .replace(/,\s*(?=[.!?…:;)\]»”]|$)/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

// Текст, який людина побачить на картці: обрізаний і без довгих тире.
function cleanText(v, max) {
  return undash(clean(v, max));
}

function cleanWord(o) {
  return {
    word: cleanText(o.word, 60),
    ipa: clean(o.ipa, 80),
    translation: cleanText(o.translation, 80),
    example: cleanText(o.example, 240),
    example_translation: cleanText(o.example_translation, 240),
  };
}

// Вирази для просунутих: до трьох пар «вираз — переклад». Відповідь моделі
// недовірена: лише рядки, обрізані під картку, без повторів і без самого
// слова (воно й так на картці). Не масив чи порожньо — виразів немає.
function cleanExtras(raw, word) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set([String(word == null ? '' : word).trim().toLowerCase()]);
  const out = [];
  for (const x of raw.slice(0, MAX_EXTRAS * 4)) {
    if (!x || typeof x !== 'object' || typeof x.phrase !== 'string' || typeof x.translation !== 'string') continue;
    const phrase = cleanText(x.phrase, 60);
    const translation = cleanText(x.translation, 80);
    if (!phrase || !translation || seen.has(phrase.toLowerCase())) continue;
    seen.add(phrase.toLowerCase());
    out.push({ phrase, translation });
    if (out.length === MAX_EXTRAS) break;
  }
  return out;
}

function coord(v) {
  return Math.max(0, Math.min(1000, Math.round(Number(v) || 0)));
}

// Рамка предмета: 4 цілих 0–1000 у порядку y1,x1,y2,x2 (як у Gemini).
// Апка ріже по ній кадр, щоб дістати сам предмет без тла. Рамка, вужча
// за 4% кадру в будь-якому вимірі, — це не предмет, а помилка моделі.
function cleanBox(raw) {
  if (!Array.isArray(raw) || raw.length !== 4) return null;
  const box = raw.map(coord);
  return box[2] > box[0] + 40 && box[3] > box[1] + 40 ? box : null;
}

// Силует предмета. Менше 6 точок — це не контур, а трикутник; більше 40 —
// модель почала фантазувати.
function cleanOutline(raw) {
  if (!Array.isArray(raw) || raw.length < 6 || raw.length > 40) return null;
  const outline = raw.filter((p) => Array.isArray(p) && p.length === 2).map(([y, x]) => [coord(y), coord(x)]);
  return outline.length >= 6 ? outline : null;
}

function boxArea(b) {
  return (b[2] - b[0]) * (b[3] - b[1]);
}

// Відповідь моделі для сцени → до восьми чистих предметів у її порядку
// (від найпомітнішого). null — відповідь не розібрати (502), порожній
// масив — предметів немає (422). Предмет без придатної рамки викидаємо:
// апці нема з чого вирізати наліпку. Однакові слова (модель усе ж
// повторилась) зливаємо в одне: лишається більша рамка на місці першого.
function cleanScene(parsed) {
  if (!parsed || typeof parsed !== 'object') return null;
  if (!Array.isArray(parsed) && String(parsed.word || '').toLowerCase() === 'unknown') return [];
  const list = Array.isArray(parsed) ? parsed : parsed.objects;
  if (!Array.isArray(list)) return null;
  const out = [];
  const index = new Map();
  // Модель, що «розговорилась» на сотню предметів, не має коштувати сотні
  // перевірок: розглядаємо лише початок списку — він і найпомітніший.
  for (const raw of list.slice(0, MAX_SCENE_OBJECTS * 4)) {
    if (!raw || typeof raw !== 'object') continue;
    const item = cleanWord(raw);
    if (!item.word || item.word.toLowerCase() === 'unknown') continue;
    item.box = cleanBox(raw.box);
    if (!item.box) continue;
    item.outline = cleanOutline(raw.outline);
    const key = item.word.toLowerCase();
    if (!index.has(key)) {
      index.set(key, out.length);
      out.push(item);
    } else if (boxArea(item.box) > boxArea(out[index.get(key)].box)) {
      out[index.get(key)] = item;
    }
  }
  return out.slice(0, MAX_SCENE_OBJECTS);
}

module.exports = {
  PROVIDER,
  LANG_NAMES,
  TOPIC_NAMES,
  MAX_SCENE_OBJECTS,
  MAX_EXTRAS,
  EXTRAS_FROM_LEVEL,
  recognize,
  recognizeScene,
  translateWord,
  wantsExtras,
  clean,
  cleanWord,
  undash,
  cleanExtras,
  cleanBox,
  cleanOutline,
  cleanScene,
  parseModelJson,
  buildScanPrompt,
  buildScenePrompt,
  buildTranslatePrompt,
  wordCacheKey,
};
