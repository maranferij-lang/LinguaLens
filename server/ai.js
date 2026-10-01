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

function langName(code, fallback) {
  return LANG_NAMES[code] || fallback;
}

function wordRules(lang) {
  const L = langName(lang, 'English');
  const article = ARTICLE_EXAMPLES[lang]
    ? ` Include the definite article, e.g. "${ARTICLE_EXAMPLES[lang]}".`
    : '';
  return `Write "word" in dictionary form: lowercase unless ${L} spelling requires a capital letter (German nouns are always capitalised).${article}`;
}

function buildScanPrompt(lang, nativeLang) {
  const L = langName(lang, 'English');
  const N = langName(nativeLang, 'Ukrainian');
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
Identify the single most prominent object in the photo.
Reply with ONLY minified JSON, no markdown, no extra text:
{"word":"<specific common ${L} name of the object, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<one short natural ${L} sentence using the word>","example_translation":"<translation of that sentence into ${N}>","box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}
${wordRules(lang)}
Prefer specific but commonly used words (e.g. "mug", not "container").
"box" is the tight bounding box of that object, four integers 0-1000,
normalised to the image (y first, like Gemini spatial output). The app crops
the object out of the photo by this box, so the box must hug the object
tightly — no extra background, no cropping off parts of it.
"outline" is the object's silhouette as a closed polygon: 16 to 32 points,
each [y,x] with integers 0-1000 normalised to the WHOLE image, walking the
visible edge of the object clockwise. The app cuts the object out along this
line and draws a white sticker border around it, so follow the real contour
closely (handles, spouts, legs) — not the bounding box — and stay just outside
the object's edge rather than inside it.
If no clear object is visible, return {"word":"unknown"}.`;
}

function buildTranslatePrompt(enWord, lang, nativeLang) {
  const L = langName(lang, 'English');
  const N = langName(nativeLang, 'Ukrainian');
  return (
    `Translate the English concept "${enWord}" for a language learner.\n` +
    `Target language: ${L}. Learner's native language: ${N}.\n` +
    `${wordRules(lang)}\n` +
    `Reply with ONLY minified JSON, no markdown:\n` +
    `{"word":"<the word in ${L}>","ipa":"<IPA of that ${L} word>",` +
    `"translation":"<the word in ${N}>","example":"<one short natural ${L} sentence using it>",` +
    `"example_translation":"<that sentence in ${N}>"}`
  );
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
// спроби, із запасом на мережу. Слово дня застосунок чекає 45 с.
const SCAN_BUDGET_MS = 21000;
const TEXT_BUDGET_MS = 40000;

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

async function callAnthropic(content, budgetMs) {
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
      max_tokens: 600,
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

function mockScan(lang, nativeLang) {
  const w = MOCK_SCAN[lang] || MOCK_SCAN.en;
  const n = MOCK_NATIVE[nativeLang] || MOCK_NATIVE.en;
  return { ...w, ...n, box: [290, 350, 710, 740], outline: MOCK_OUTLINE };
}

function mockTranslate(enWord, lang, nativeLang) {
  return {
    word: enWord,
    ipa: '',
    translation: `${enWord} (${nativeLang})`,
    example: `This is a ${enWord}.`,
    example_translation: `${enWord} — приклад (${lang}→${nativeLang}).`,
  };
}

// ---------- ПУБЛІЧНЕ ----------
async function recognize(base64, lang, nativeLang) {
  if (PROVIDER === 'mock') return mockScan(lang, nativeLang);
  const prompt = buildScanPrompt(lang, nativeLang);
  if (PROVIDER === 'anthropic') {
    return callAnthropic([
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
      { type: 'text', text: prompt },
    ], SCAN_BUDGET_MS);
  }
  return callGemini([{ inline_data: { mime_type: 'image/jpeg', data: base64 } }, { text: prompt }], SCAN_BUDGET_MS);
}

async function callText(prompt) {
  if (PROVIDER === 'anthropic') return callAnthropic([{ type: 'text', text: prompt }], TEXT_BUDGET_MS);
  return callGemini([{ text: prompt }], TEXT_BUDGET_MS);
}

// Переклад слова дня з кешем (щоб не витрачати квоту на однакові пари)
async function translateWord(enWord, lang, nativeLang) {
  const key = `v${PROMPT_VERSION}|${enWord}|${lang}|${nativeLang}`.replace(/[^\w|-]/g, '_');
  const cached = await store.get('wordCache', key);
  if (cached && cached.word) return cached;

  const parsed =
    PROVIDER === 'mock'
      ? mockTranslate(enWord, lang, nativeLang)
      : await callText(buildTranslatePrompt(enWord, lang, nativeLang));
  if (!parsed || !parsed.word) throw new Error('bad translation');
  const out = {
    word: clean(parsed.word, 60),
    ipa: clean(parsed.ipa, 80),
    translation: clean(parsed.translation, 80),
    example: clean(parsed.example, 240),
    example_translation: clean(parsed.example_translation, 240),
    source: enWord,
  };
  if (PROVIDER !== 'mock') await store.put('wordCache', key, out);
  return out;
}

// Відповідь моделі — недовірений текст: обрізаємо довжину, щоб випадковий
// «роман» у полі не розвалив картку в застосунку.
function clean(v, max) {
  return String(v == null ? '' : v).trim().slice(0, max);
}

module.exports = { PROVIDER, LANG_NAMES, recognize, translateWord, clean, parseModelJson };
