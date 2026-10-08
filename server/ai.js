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

// Варіанти мов (src/langVariants.js у застосунку): яким саме різновидом
// писати слово, приклад і транскрипцію. name — назва для підказки замість
// «English»; words — правопис і словник; ipa — вимова, за якою писати IPA.
// Застосунок шле variant (мова навчання) і nativeVariant (мова перекладу);
// старі версії не шлють нічого, і підказка тоді та сама, що до варіантів.
const VARIETIES = {
  en: {
    us: {
      name: 'American English',
      words: 'US spelling and vocabulary (color, apartment, cell phone, favorite)',
      ipa: 'General American pronunciation',
    },
    gb: {
      name: 'British English',
      words: 'UK spelling and vocabulary (colour, flat, mobile phone, favourite)',
      ipa: 'RP (Received Pronunciation)',
    },
  },
  es: {
    es: {
      name: 'Spanish from Spain',
      words: 'Castilian vocabulary as used in Spain (ordenador, móvil, zumo, coche)',
      ipa: 'Castilian pronunciation with distinción: "z" and "c" before "e" or "i" are /θ/, e.g. la taza /la ˈtaθa/',
    },
    latam: {
      name: 'Latin American Spanish',
      words:
        'Mexican and neutral Latin American vocabulary (computadora, celular, jugo, carro), "ustedes" and never "vosotros"',
      ipa: 'Latin American pronunciation with seseo: "z" and "c" before "e" or "i" are /s/, e.g. la taza /la ˈtasa/',
    },
  },
};

// Варіант, з яким сервер жив до варіантів (голос es-ES і транскрипція з θ у
// застосунку, en-US для англійської). Слова, перекладені тоді, лежать у
// кеші під ключем без варіанта — для цього варіанта вони й лишаються.
const DEFAULT_VARIETY = { en: 'us', es: 'es' };

// Варіант із запиту, лише якщо він є в цієї мови (Object.hasOwn — щоб
// «constructor» не знайшовся в прототипі), інакше null.
function variantOr(lang, v) {
  return typeof v === 'string' && Object.hasOwn(VARIETIES, lang) && Object.hasOwn(VARIETIES[lang], v) ? v : null;
}

function variety(lang, v) {
  const id = variantOr(lang, v);
  return id ? VARIETIES[lang][id] : null;
}

// Мова з варіантом для ключа кешу й журналу: 'en-gb'; варіант за
// замовчуванням і без варіанта — просто 'en'.
function langTag(lang, v) {
  const id = variantOr(lang, v);
  return id && id !== DEFAULT_VARIETY[lang] ? lang + '-' + id : lang;
}

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

function langName(code, fallback, v = null) {
  return variety(code, v)?.name || LANG_NAMES[code] || fallback;
}

// Рядки підказки про варіанти: для мови навчання — правопис, словник і
// вимова транскрипції; для мови перекладу — правопис і словник. Без
// варіантів — порожньо, і підказка та сама, що до них.
function varietyRules({ lang, variant, nativeLang, nativeVariant } = {}) {
  const out = [];
  const v = variety(lang, variant);
  if (v) out.push(`The learner's language is ${v.name}: use ${v.words} in the word, the example and any phrases, and write "ipa" in ${v.ipa}.`);
  const n = variety(nativeLang, nativeVariant);
  if (n) out.push(`The learner's native language is ${n.name}: use ${n.words} in every translation.`);
  return out.length ? '\n' + out.join('\n') : '';
}

// Правило власника: у тексті, який бачить людина, немає довгих тире. Слово,
// переклад, приклад і вирази модель пише без них. Сама підказка теж
// обходиться без тире: модель охоче повторює стиль запиту. Те, що все ж
// прослизне, прибирає undash() у cleanWord/cleanExtras.
const NO_DASHES_RULE =
  'Never use an em dash or an en dash as punctuation in any text you write (word, translation, example, example_translation, phrases): rewrite the sentence so it needs none. Where Ukrainian or Russian would put a dash between the subject and the predicate, never put a comma there: leave the dash out ("Чашка порожня", "Це моя чашка") or use a verb ("Я люблю каву"). Hyphens inside words and number ranges like 1-2 are fine.';

function wordRules(lang, variant = null) {
  const L = langName(lang, 'English', variant);
  const article = ARTICLE_EXAMPLES[lang]
    ? ` Include the definite article, e.g. "${ARTICLE_EXAMPLES[lang]}".`
    : '';
  // Підказка про німецькі іменники лише для німецької: в іспанській чи
  // англійській вона зайва і може підштовхнути модель до великої літери.
  const caps = lang === 'de' ? ' (German nouns are always capitalised)' : '';
  return `Write "word" in dictionary form: lowercase unless ${L} spelling requires a capital letter${caps}.${article}`;
}

// vars — { variant, nativeVariant } з запиту (src/langVariants.js).
function buildScanPrompt(lang, nativeLang, level = null, { variant = null, nativeVariant = null } = {}) {
  const L = langName(lang, 'English', variant);
  const N = langName(nativeLang, 'Ukrainian', nativeVariant);
  const extras = wantsExtras(level);
  const extrasJson = extras ? `"extras":[{"phrase":"<${L} phrase with the word>","translation":"<its translation into ${N}>"}],` : '';
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
Identify the single most prominent object in the photo.
Reply with ONLY minified JSON, no markdown, no extra text:
{"word":"<specific common ${L} name of the object, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<${exampleSpec(L, level)}>","example_translation":"<translation of that sentence into ${N}>",${extrasJson}"box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}
${wordRules(lang, variant)}${levelRules(L, N, level, extras)}${varietyRules({ lang, variant, nativeLang, nativeVariant })}
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
function buildScenePrompt(lang, nativeLang, level = null, { variant = null, nativeVariant = null } = {}) {
  const L = langName(lang, 'English', variant);
  const N = langName(nativeLang, 'Ukrainian', nativeVariant);
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
The photo shows a whole scene (a room, a desk, a shelf, a street). Find up to ${MAX_SCENE_OBJECTS} distinct, clearly visible physical objects that a learner can name.
Reply with ONLY minified JSON, no markdown, no extra text:
{"objects":[{"word":"<specific common ${L} name of the object, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<${exampleSpec(L, level)}>","example_translation":"<translation of that sentence into ${N}>","box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}]}
${wordRules(lang, variant)}${levelRules(L, N, level, false)}${varietyRules({ lang, variant, nativeLang, nativeVariant })}
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
function buildTranslatePrompt(enWord, lang, nativeLang, { topic, hint, variant = null, nativeVariant = null } = {}) {
  const L = langName(lang, 'English', variant);
  const N = langName(nativeLang, 'Ukrainian', nativeVariant);
  const t = topicOf(topic);
  const meaning = hintText(hint);
  const rules = `${wordRules(lang, variant)}${varietyRules({ lang, variant, nativeLang, nativeVariant })}\n${NO_DASHES_RULE}\n`;
  if (t === 'general') {
    return (
      `Translate the English concept "${enWord}" for a language learner.\n` +
      (meaning ? `Meaning: ${meaning}.\n` : '') +
      `Target language: ${L}. Learner's native language: ${N}.\n` +
      rules +
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
    rules +
    `Reply with ONLY minified JSON, no markdown:\n` +
    `{"word":"<the term in ${L}>","ipa":"<IPA of that ${L} term>",` +
    `"translation":"<the term in ${N}>","example":"<one natural ${L} sentence using it in a realistic situation from ${name}>",` +
    `"example_translation":"<that sentence in ${N}>"}`
  );
}

// Ключ кешу перекладу. Загальні слова — формат до персоналізації, тож уже
// перекладені слова не перекладаються вдруге; тематичні — свій простір.
// Варіант мови — у коді мови ('en-gb', 'es-latam'); варіант за
// замовчуванням (DEFAULT_VARIETY) і запит без варіанта — старий ключ, тож
// уже перекладене лишається в силі.
// Firestore не приймає «/» в id, тому все, крім букв, цифр, «|» і «-», — «_».
function wordCacheKey(enWord, lang, nativeLang, topic, { variant = null, nativeVariant = null } = {}) {
  const t = topicOf(topic);
  const L = langTag(lang, variant);
  const N = langTag(nativeLang, nativeVariant);
  const raw =
    t === 'general'
      ? `v${PROMPT_VERSION}|${enWord}|${L}|${N}`
      : `v${TOPIC_PROMPT_VERSION}|${t}|${enWord}|${L}|${N}`;
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
// токенів, а для тайської чи хінді з прикладом рівня 7+ і виразами — до
// ~750: стеля з запасом, бо оплата йде за вироблені токени, а не за стелю.
// Вісім предметів сцени — до ~3200. Зі стелею одиночного скану сцена
// обривалась би на півслові й не розбиралась як JSON.
const SCAN_MAX_TOKENS = 1000;
// Вирази для просунутих і довший приклад — ще ~150 токенів.
const SCAN_EXTRAS_MAX_TOKENS = 1200;
const SCENE_MAX_TOKENS = 3500;

// Тимчасові відмови провайдера: 429 (ліміт запитів Gemini), 500/502/503/504 і
// 529 (перевантаження Anthropic). Решту 4xx (поганий ключ, поганий запит)
// повтором не вилікувати, і таймаут теж: час вичерпано.
const RETRY_STATUS = new Set([429, 500, 502, 503, 504, 529]);
const AI_ATTEMPTS = 3;
// Повтор має сенс, лише якщо після паузи лишається час на саму відповідь:
// здоровий скан займає 1,5–2 с, тож тиха друга спроба людина не помічає.
const RETRY_MIN_LEFT_MS = 8000;
const RETRY_BASE_MS = 300;
const RETRY_CAP_MS = 1500;
// Retry-After довший за це — провайдер просить чекати, повтор лише збільшить
// навантаження: віддаємо відмову як є.
const RETRY_AFTER_MAX_MS = 3000;

// Retry-After у секундах або датою → мс, або null
function retryAfterMs(res) {
  const v = res && res.headers && typeof res.headers.get === 'function' ? res.headers.get('retry-after') : null;
  if (!v) return null;
  const sec = Number(v);
  if (Number.isFinite(sec) && sec >= 0) return sec * 1000;
  const at = Date.parse(v);
  return Number.isFinite(at) ? Math.max(0, at - Date.now()) : null;
}

// Збій мережі (обрив, скидання з'єднання), а не таймаут чи скасування.
function isNetworkError(e) {
  if (!e || e.name === 'AbortError' || e.name === 'TimeoutError') return false;
  return e instanceof TypeError || e.code === 'ECONNRESET' || (e.cause && e.cause.code === 'ECONNRESET');
}

// Скільки чекати перед наступною спробою, або null, якщо пробувати не варто.
// Повна випадковість у межах min(1500, 300·2^n): паралельні запити не
// б'ються в провайдера хвилею.
function retryWait(attempt, res, deadline) {
  if (attempt >= AI_ATTEMPTS) return null;
  let wait = Math.random() * Math.min(RETRY_CAP_MS, RETRY_BASE_MS * 2 ** attempt);
  const after = retryAfterMs(res);
  if (after !== null) {
    if (after > RETRY_AFTER_MAX_MS) return null;
    wait = Math.max(wait, after);
  }
  return deadline - Date.now() - wait > RETRY_MIN_LEFT_MS ? Math.round(wait) : null;
}

// fetch у межах дедлайну: до трьох спроб при тимчасових відмовах (див.
// RETRY_STATUS) і збоях мережі, якщо на повтор ще лишається час. Відкинуту
// відповідь закриваємо, інакше її з'єднання висить до збирача сміття.
async function fetchAI(url, options, budgetMs) {
  const deadline = Date.now() + budgetMs;
  for (let attempt = 1; ; attempt++) {
    const left = Math.max(1000, deadline - Date.now());
    let res;
    try {
      res = await fetch(url, { ...options, signal: AbortSignal.timeout(left) });
    } catch (e) {
      const wait = isNetworkError(e) ? retryWait(attempt, null, deadline) : null;
      if (wait === null) throw e;
      console.log(`  збій мережі до AI (${e.cause?.code || e.message}), повтор через ${wait} мс…`);
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const wait = RETRY_STATUS.has(res.status) ? retryWait(attempt, res, deadline) : null;
    if (wait === null) return res;
    console.log(`  ${res.status} від AI, повтор через ${wait} мс…`);
    try {
      await res.body?.cancel();
    } catch (_) {}
    await new Promise((r) => setTimeout(r, wait));
  }
}

// Відповідь, яку модель відмовилась давати через політику безпеки (фото
// людей чи чутливого змісту): для цього кадру вона буде такою щоразу, тож
// «спробуй ще раз» марне. Віддаємо як «не бачу предмета» (422), а не як
// нерозбірливу відповідь (502), і не перепитуємо.
const BLOCKED = Object.freeze({ word: 'unknown' });

const GEMINI_BLOCKED_FINISH = new Set(['SAFETY', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY', 'IMAGE_PROHIBITED_CONTENT']);

function geminiBlocked(data) {
  const reason = data && data.promptFeedback && data.promptFeedback.blockReason;
  if (reason && reason !== 'BLOCK_REASON_UNSPECIFIED') return true;
  return GEMINI_BLOCKED_FINISH.has(data && data.candidates && data.candidates[0] && data.candidates[0].finishReason);
}

// Тіло відповіді як JSON; порожнє чи обірване тіло — null (нерозбірливо), а
// таймаут під час читання лишається помилкою (504).
async function readJsonBody(res) {
  try {
    return await res.json();
  } catch (e) {
    if (e && e.name === 'SyntaxError') return null;
    throw e;
  }
}

// Модель інколи відповідає не JSON-ом (flash-lite) або без обов'язкових
// полів; друга спроба майже завжди вдається. Одне повторне запитання, лише
// якщо лишається час, і ніколи — після відмови за політикою безпеки.
// once(мс) → розібрана відповідь, null або BLOCKED; accept(відповідь) каже,
// чи годиться вона для показу. Не вийшло вдруге — віддаємо кращу з двох.
async function askModel(once, budgetMs, accept = (p) => p !== null) {
  const deadline = Date.now() + budgetMs;
  const first = await once(budgetMs);
  if (first === BLOCKED || accept(first)) return first;
  const left = deadline - Date.now();
  if (left <= RETRY_MIN_LEFT_MS) return first;
  console.log('  відповідь AI не годиться, перепитую…');
  const again = await once(left);
  return again !== null ? again : first;
}

async function callAnthropic(content, budgetMs, maxTokens = SCAN_MAX_TOKENS, accept) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY не заданий у .env');
  return askModel(async (left) => {
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
    }, left);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Anthropic ' + res.status + ': ' + body.slice(0, 300));
    }
    const data = await readJsonBody(res);
    const parsed = parseModelJson(data?.content?.[0]?.text);
    if (parsed === null && data?.stop_reason === 'refusal') {
      console.log('  Anthropic відмовився відповідати (refusal)');
      return BLOCKED;
    }
    return parsed;
  }, budgetMs, accept);
}

// Ключ іде заголовком, а не в ?key= — URL з ключем осідає в логах проксі.
async function callGemini(parts, budgetMs, accept) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не заданий у .env');
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent';
  return askModel(async (left) => {
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
    }, left);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error('Gemini ' + res.status + ': ' + body.slice(0, 300));
    }
    const data = await readJsonBody(res);
    const parsed = parseModelJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
    if (parsed === null && geminiBlocked(data)) {
      console.log('  Gemini заблокував відповідь (політика безпеки)');
      return BLOCKED;
    }
    return parsed;
  }, budgetMs, accept);
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

// Варіанти в mock: американська англійська пише «favorite», британська —
// «favourite» (як і mock без варіанта); латиноамериканська іспанська
// транскрибує з seseo (/ˈtasa/), іспанська Іспанії — з θ. Так тести бачать,
// що варіант дійшов до відповіді, без мережі.
const MOCK_VARIANT_FIX = {
  'en-us': (s) => s.replace(/favourite/g, 'favorite'),
  'es-latam': (s) => s.replace(/θ/g, 's'),
};

function mockFix(fields, lang, v, keys) {
  const fix = MOCK_VARIANT_FIX[lang + '-' + variantOr(lang, v)];
  if (!fix) return fields;
  const out = { ...fields };
  for (const k of keys) if (typeof out[k] === 'string') out[k] = fix(out[k]);
  return out;
}

// Слово мовою навчання й переклад — кожне під свій варіант
function mockWord(w, n, { lang, nativeLang, variant, nativeVariant } = {}) {
  return {
    ...mockFix(w, lang, variant, ['word', 'ipa', 'example']),
    ...mockFix(n, nativeLang, nativeVariant, ['translation', 'example_translation']),
  };
}

function mockScan(lang, nativeLang, level, { variant = null, nativeVariant = null } = {}) {
  const w = MOCK_SCAN[lang] || MOCK_SCAN.en;
  const n = MOCK_NATIVE[nativeLang] || MOCK_NATIVE.en;
  const out = { ...mockWord(w, n, { lang, nativeLang, variant, nativeVariant }), box: [290, 350, 710, 740], outline: MOCK_OUTLINE };
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

function mockScene(lang, nativeLang, vars = {}) {
  return {
    objects: MOCK_SCENE.map((o) => {
      const w = o[lang] || o.en;
      const n = nativeLang === 'uk' ? o.uk : { translation: o.en.word, example_translation: o.en.example };
      return { ...mockWord(w, n, { lang, nativeLang, ...vars }), box: o.box, outline: ellipseOutline(o.box) };
    }),
  };
}

// Пара мов у mock-перекладі — з варіантами, якщо їх надіслали ('en-gb').
function mockTag(lang, v) {
  const id = variantOr(lang, v);
  return id ? lang + '-' + id : lang;
}

function mockTranslate(enWord, lang, nativeLang, { variant = null, nativeVariant = null } = {}) {
  return {
    word: enWord,
    ipa: '',
    translation: `${enWord} (${mockTag(nativeLang, nativeVariant)})`,
    example: `This is a ${enWord}.`,
    example_translation: `${enWord}: приклад (${mockTag(lang, variant)}→${mockTag(nativeLang, nativeVariant)}).`,
  };
}

// ---------- ПУБЛІЧНЕ ----------
// level — 1–10 зі слайдера або null (як до персоналізації); vars —
// { variant, nativeVariant } (без них — як до варіантів мов).
async function recognize(base64, lang, nativeLang, level = null, vars = {}) {
  if (PROVIDER === 'mock') return mockScan(lang, nativeLang, level, vars);
  const prompt = buildScanPrompt(lang, nativeLang, level, vars);
  const accept = (p) => scanComplete(p, lang, nativeLang);
  if (PROVIDER === 'anthropic') {
    return callAnthropic([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: prompt },
    ], SCAN_BUDGET_MS, wantsExtras(level) ? SCAN_EXTRAS_MAX_TOKENS : SCAN_MAX_TOKENS, accept);
  }
  return callGemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], SCAN_BUDGET_MS, accept);
}

// Сирий JSON моделі для сцени; розбирає й чистить його cleanScene.
async function recognizeScene(base64, lang, nativeLang, level = null, vars = {}) {
  if (PROVIDER === 'mock') return mockScene(lang, nativeLang, vars);
  const prompt = buildScenePrompt(lang, nativeLang, level, vars);
  const accept = (p) => sceneComplete(p, lang, nativeLang);
  if (PROVIDER === 'anthropic') {
    return callAnthropic([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: prompt },
    ], SCENE_BUDGET_MS, SCENE_MAX_TOKENS, accept);
  }
  return callGemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], SCENE_BUDGET_MS, accept);
}

// Придатність відповіді моделі до показу. Переклад обов'язковий (без нього
// наліпка порожня, а скан змарновано), приклад ні. Мова навчання збігається
// з рідною — переклад може бути порожнім, перевірку пропускаємо. Тут, а не в
// cleanWord/cleanScene: ті приймають і мінімальні об'єкти.
function hasTranslation(item, lang, nativeLang) {
  return !!(item && item.translation) || lang === nativeLang;
}

// Одиночний скан: «unknown» (предмета немає) — повна відповідь; решта має
// слово і переклад.
function scanComplete(parsed, lang, nativeLang) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (String(parsed.word == null ? '' : parsed.word).toLowerCase() === 'unknown') return true;
  const item = cleanWord(parsed);
  return !!item.word && hasTranslation(item, lang, nativeLang);
}

// Сцена: порожня (предметів немає) — повна відповідь; інакше хоч один
// предмет має переклад.
function sceneComplete(parsed, lang, nativeLang) {
  const objects = cleanScene(parsed);
  if (objects === null) return false;
  return !objects.length || objects.some((o) => hasTranslation(o, lang, nativeLang));
}

// budgetMs — скільки часу лишилось (слово дня має спільний дедлайн, див.
// WOD_DEADLINE_MS у server.js); за замовчуванням повний бюджет тексту.
async function callText(prompt, budgetMs = TEXT_BUDGET_MS) {
  const accept = (p) => wordComplete(p && typeof p === 'object' ? cleanWord(p) : null);
  if (PROVIDER === 'anthropic') return callAnthropic([{ type: 'text', text: prompt }], budgetMs, SCAN_MAX_TOKENS, accept);
  return callGemini([{ text: prompt }], budgetMs, accept);
}

// Картка слова дня годиться, лише коли є слово, переклад і приклад (IPA та
// переклад прикладу можуть бути порожні). Кеш спільний для всіх людей і без
// строку дії: один поганий запис показувався б усім, хто отримує це слово.
function wordComplete(o) {
  return !!(o && o.word && o.translation && o.example);
}

// Переклади, що зараз виконуються, за ключем кешу: однакове слово, якого
// ще немає в кеші, просять багато людей одночасно, і кожен викликав би AI.
// Невдачі не запам'ятовуємо: запис зникає, щойно завдання завершилось.
const translating = new Map();

// Переклад слова дня з кешем (щоб не витрачати квоту на однакові пари).
// topic і hint — з тематичного списку (wordplan.js); без них — загальне
// слово, як у GET /word-of-day. variant / nativeVariant — варіанти мов.
// deadline — момент (мс), до якого відповідь ще потрібна: після нього AI не
// викликаємо, а поточному виклику дається лише решта часу. Неповна відповідь
// моделі — помилка: у кеш вона не потрапляє.
async function translateWord(enWord, lang, nativeLang, { topic, hint, variant = null, nativeVariant = null, deadline } = {}) {
  const vars = { variant: variantOr(lang, variant), nativeVariant: variantOr(nativeLang, nativeVariant) };
  const key = wordCacheKey(enWord, lang, nativeLang, topic, vars);
  let job = translating.get(key);
  if (!job) {
    job = translateUncached(enWord, lang, nativeLang, key, { topic, hint, vars, deadline }).finally(() => translating.delete(key));
    translating.set(key, job);
  }
  return { ...(await job) };
}

async function translateUncached(enWord, lang, nativeLang, key, { topic, hint, vars, deadline }) {
  const cached = await store.get('wordCache', key);
  // Запис кешу з часів до правила «без тире» чистимо на льоту, тож
  // PROMPT_VERSION заради нього не піднімаємо: усе вже перекладене не
  // перекладається вдруге. Неповний запис (колись модель відповіла лише
  // словом) ігноруємо й перекладаємо наново: добра відповідь його замінить.
  if (cached && cached.word) {
    const fixed = { ...cached, ...cleanWord(cached) };
    if (wordComplete(fixed)) return fixed;
  }

  let parsed;
  if (PROVIDER === 'mock') {
    parsed = mockTranslate(enWord, lang, nativeLang, vars);
  } else {
    const left = deadline === undefined ? TEXT_BUDGET_MS : Math.min(TEXT_BUDGET_MS, deadline - Date.now());
    if (left < 500) throw new Error('немає часу на переклад');
    parsed = await callText(buildTranslatePrompt(enWord, lang, nativeLang, { topic, hint, ...vars }), left);
  }
  const out = parsed && typeof parsed === 'object' ? { ...cleanWord(parsed), source: enWord } : null;
  if (!wordComplete(out)) throw new Error('bad translation');
  if (PROVIDER !== 'mock') await store.put('wordCache', key, out);
  return out;
}

// Керівні символи (переноси рядків, табуляція, \u0000…) у полі картки зайві.
const CONTROL_CHARS = /[\u0000-\u001f\u007f-\u009f]+/g;

// Відповідь моделі — недовірений текст: обрізаємо довжину, щоб випадковий
// «роман» у полі не розвалив картку в застосунку. Лише рядок чи число:
// об'єкт чи масив дали б «[object Object]» або «x,y» просто на картці.
// Обрізка посеред емодзі лишила б самотню половину пари: її прибираємо.
function clean(v, max) {
  if (typeof v !== 'string' && !(typeof v === 'number' && Number.isFinite(v))) return '';
  return String(v).replace(CONTROL_CHARS, ' ').trim().slice(0, max).replace(/[\uD800-\uDBFF]$/, '').trimEnd();
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

// Тире між підметом і присудком в українському (і російському) реченні
// комою не заміниш: «Кава — мій улюблений напій» стало б «Кава, мій
// улюблений напій». У реченні прикладу таке тире просто зникає: «Кава мій
// улюблений напій», «Чашка порожня». Перед займенником («Чашка — вона
// порожня») і поза кирилицею лишається кома з undash(). Слово, переклад
// і вирази це не зачіпає: там тире розділяє варіанти («чашка, кружка»).
const CYRILLIC = /[\u0400-\u04FF]/;
const COPULA_DASH =
  /([\p{L}\d])\s+[\u2012\u2013\u2014\u2015-]\s+(?!(?:він|вона|воно|вони|он|она|оно|они)(?![\p{L}\d]))(?=[\p{L}\d])/giu;

function uncopula(s) {
  return CYRILLIC.test(s) ? s.replace(COPULA_DASH, '$1 ') : s;
}

// Речення прикладу на картці: обрізане і без довгих тире.
function cleanSentence(v, max) {
  return undash(uncopula(clean(v, max)));
}

function cleanWord(o) {
  return {
    word: cleanText(o.word, 60),
    ipa: clean(o.ipa, 80),
    translation: cleanText(o.translation, 80),
    example: cleanSentence(o.example, 240),
    example_translation: cleanSentence(o.example_translation, 240),
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
  VARIETIES,
  DEFAULT_VARIETY,
  variantOr,
  langTag,
  TOPIC_NAMES,
  MAX_SCENE_OBJECTS,
  MAX_EXTRAS,
  EXTRAS_FROM_LEVEL,
  recognize,
  recognizeScene,
  translateWord,
  wordComplete,
  hasTranslation,
  scanComplete,
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
