// LinguaLens proxy server — тримає API-ключі в себе, апка ключів не бачить.
// Запуск:  npm start   (читає налаштування з .env)
// Без зовнішніх залежностей — потрібен лише Node 20+.

const http = require('http');
const os = require('os');
const store = require('./store');
const auth = require('./auth');
const words = require('./words');

// Підвантажуємо server/.env, якщо він є (локальний запуск).
// У хмарі (Cloud Run) змінні приходять зі середовища — файл не потрібен.
try {
  const envText = require('fs').readFileSync(require('path').join(__dirname, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch (_) {}

const PORT = Number(process.env.PORT || 3000);
const PROVIDER = (process.env.PROVIDER || 'gemini').toLowerCase();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-4-5';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-lite';

// Захист публічного сервера:
// APP_TOKEN — секрет, який знає лише апка (шле в заголовку x-app-token).
//   Якщо не заданий — перевірка вимкнена (зручно для локальної розробки).
const APP_TOKEN = process.env.APP_TOKEN || '';
// Ліміт сканів з однієї IP-адреси за хвилину (захист від зловживань).
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 20);
// Спроби входу лімітуємо окремо й набагато суворіше. Загальний ліміт у 20/хв
// дозволяв би 28 800 спроб пароля за добу з однієї IP — цього достатньо, щоб
// підібрати слабкий пароль. Десять на 15 хвилин робить перебір безглуздим.
const AUTH_TRIES = 10;
const AUTH_WINDOW = 15 * 60 * 1000;
const authHits = new Map();

function authRateLimited(key) {
  const now = Date.now();
  const arr = (authHits.get(key) || []).filter((t) => now - t < AUTH_WINDOW);
  arr.push(now);
  authHits.set(key, arr);
  // не даємо мапі рости безмежно — це теж вектор (виснаження пам'яті)
  if (authHits.size > 5000) {
    for (const [k, v] of authHits) if (!v.length || now - v[v.length - 1] > AUTH_WINDOW) authHits.delete(k);
  }
  return arr.length > AUTH_TRIES;
}

// Простий лічильник запитів на IP (у памʼяті, ковзне вікно 60с).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  // раз-у-раз чистимо старі записи, щоб мапа не росла
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.some((t) => now - t < 60000)) hits.delete(k);
  }
  return arr.length > RATE_PER_MIN;
}
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  return (xff ? String(xff).split(',')[0].trim() : req.socket.remoteAddress) || 'unknown';
}

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

function buildPrompt(lang, nativeLang) {
  const L = LANG_NAMES[lang] || 'English';
  const N = LANG_NAMES[nativeLang] || 'Ukrainian';
  return `You are the recognition engine inside a language-learning app.
The user is learning ${L}; their native language is ${N}.
Identify the single most prominent object in the photo.
Reply with ONLY minified JSON, no markdown, no extra text:
{"word":"<specific common ${L} name of the object, lowercase, 1-3 words>","ipa":"<IPA transcription of that ${L} word>","translation":"<translation of the word into ${N}>","example":"<one short natural ${L} sentence using the word>","example_translation":"<translation of that sentence into ${N}>","box":[<ymin>,<xmin>,<ymax>,<xmax>],"outline":[[<y>,<x>],...]}
Prefer specific but commonly used words (e.g. "mug", not "container").
"box" is the tight bounding box of that object, four integers 0-1000,
normalised to the image (y first, like Gemini spatial output). The app crops
the object out of the photo by this box, so the box must hug the object
tightly — no extra background, no cropping off parts of it.
"outline" is the object's silhouette as a closed polygon: 10 to 24 points,
each [y,x] with integers 0-1000 normalised to the WHOLE image, walking the
visible edge of the object clockwise. The app uses it to cut the object away
from its background, so follow the real contour — not the bounding box.
If no clear object is visible, return {"word":"unknown"}.`;
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

// fetch з таймаутом 45с і одним повтором при 503 (перевантаження AI)
async function fetchAI(url, options) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
    if (res.status === 503 && attempt === 1) {
      console.log('  503 від AI, повтор через 2с…');
      await new Promise((r) => setTimeout(r, 2000));
      continue;
    }
    return res;
  }
}

async function callAnthropic(base64, prompt) {
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
      max_tokens: 400,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
            { type: 'text', text: prompt },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('Anthropic ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  return parseModelJson(data?.content?.[0]?.text);
}

async function callGemini(base64, prompt) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY не заданий у .env');
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL +
    ':generateContent?key=' +
    GEMINI_API_KEY;
  const res = await fetchAI(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: 'image/jpeg', data: base64 } },
            { text: prompt },
          ],
        },
      ],
      generationConfig: {
        response_mime_type: 'application/json',
        // без цього модель "думає" 40-180с; minimal = майже миттєво
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    if (res.status === 429) throw new Error('Gemini: вичерпано безкоштовний ліміт (429). Спробуй за хвилину.');
    throw new Error('Gemini ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  return parseModelJson(data?.candidates?.[0]?.content?.parts?.[0]?.text);
}

// Текстовий запит до AI (без фото) — для перекладу «слова дня».
async function callTextAI(prompt) {
  if (PROVIDER === 'anthropic') {
    const res = await fetchAI('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 400,
        messages: [{ role: 'user', content: [{ type: 'text', text: prompt }] }],
      }),
    });
    if (!res.ok) throw new Error('Anthropic ' + res.status);
    const d = await res.json();
    return parseModelJson(d?.content?.[0]?.text);
  }
  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    GEMINI_MODEL +
    ':generateContent?key=' +
    GEMINI_API_KEY;
  const res = await fetchAI(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        thinkingConfig: { thinkingLevel: 'minimal' },
      },
    }),
  });
  if (!res.ok) throw new Error('Gemini ' + res.status);
  const d = await res.json();
  return parseModelJson(d?.candidates?.[0]?.content?.parts?.[0]?.text);
}

// Переклад слова дня з кешем (щоб не витрачати квоту на однакові пари)
async function translateWord(enWord, lang, nativeLang) {
  const key = `${enWord}|${lang}|${nativeLang}`;
  const cached = await store.get('wordCache', key.replace(/[^\w|-]/g, '_'));
  if (cached && cached.word) return cached;

  const L = LANG_NAMES[lang] || 'English';
  const N = LANG_NAMES[nativeLang] || 'Ukrainian';
  const prompt =
    `Translate the English concept "${enWord}" for a language learner.\n` +
    `Target language: ${L}. Learner's native language: ${N}.\n` +
    `Reply with ONLY minified JSON, no markdown:\n` +
    `{"word":"<the word in ${L}, lowercase>","ipa":"<IPA of that ${L} word>",` +
    `"translation":"<the word in ${N}>","example":"<one short natural ${L} sentence using it>",` +
    `"example_translation":"<that sentence in ${N}>"}`;

  const parsed = await callTextAI(prompt);
  if (!parsed || !parsed.word) throw new Error('bad translation');
  const out = {
    word: String(parsed.word).toLowerCase(),
    ipa: parsed.ipa || '',
    translation: parsed.translation || '',
    example: parsed.example || '',
    example_translation: parsed.example_translation || '',
    source: enWord,
  };
  await store.put('wordCache', key.replace(/[^\w|-]/g, '_'), out);
  return out;
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('TOO_LARGE'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function json(res, status, obj) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    ...SECURITY_HEADERS,
    // Мобільний застосунок не має Origin, тому CORS тут потрібен лише для
    // локальної діагностики з браузера. Дозволяємо, але без credentials —
    // куки й авторизація через '*' не проходять за специфікацією.
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // CORS + Private Network Access preflight (дозволяє запити з браузера до localhost)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, x-app-token',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/health') {
    return json(res, 200, { ok: true, provider: PROVIDER, store: store.MODE });
  }

  // ---------- АВТОРИЗАЦІЯ ----------
  if (req.method === 'POST' && (req.url === '/auth/register' || req.url === '/auth/login')) {
    if (authRateLimited(clientIp(req))) {
      return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
    }
    // Тіло входу маленьке. 64 КБ на email+пароль — це подарунок атакуючому,
    // 4 КБ вистачає з запасом.

    try {
      const body = JSON.parse((await readBody(req, 4 * 1024)) || '{}');
      const result =
        req.url === '/auth/register' ? await auth.register(body) : await auth.login(body);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      // У логи не пишемо пошту: логи Cloud Run бачить більше людей, ніж база.
      console.log(new Date().toISOString(), req.url, '→ ok');
      return json(res, 200, result);
    } catch (e) {
      console.error('auth error:', e.message);
      return json(res, 500, { error: 'SERVER_ERROR' });
    }
  }

  // ---------- ПРОФІЛЬ ----------
  if (req.url === '/me' && (req.method === 'GET' || req.method === 'PATCH')) {
    const user = await auth.userFromRequest(req).catch(() => null);
    if (!user) return json(res, 401, { error: 'UNAUTHORIZED' });
    if (req.method === 'GET') return json(res, 200, { user: auth.publicUser(user) });
    try {
      const patch = JSON.parse((await readBody(req, 16 * 1024)) || '{}');
      const updated = await auth.updateProfile(user, patch);
      return json(res, 200, { user: updated });
    } catch (e) {
      return json(res, 500, { error: 'SERVER_ERROR' });
    }
  }

  // ---------- СЛОВО ДНЯ ----------
  // GET /word-of-day?days=7&lang=en&native=uk  (потрібен Bearer-токен)
  if (req.method === 'GET' && req.url.startsWith('/word-of-day')) {
    const user = await auth.userFromRequest(req).catch(() => null);
    if (!user) return json(res, 401, { error: 'UNAUTHORIZED' });
    if (rateLimited('wod:' + clientIp(req))) {
      return json(res, 429, { error: 'Забагато запитів.' });
    }
    try {
      const url = new URL(req.url, 'http://x');
      const days = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 14);
      const lang = LANG_NAMES[url.searchParams.get('lang')] ? url.searchParams.get('lang') : 'en';
      const native = LANG_NAMES[url.searchParams.get('native')]
        ? url.searchParams.get('native')
        : 'uk';

      const out = [];
      for (let i = 0; i < days; i++) {
        const en = words.wordForDay(user.seed || user.id, i);
        try {
          const w = await translateWord(en, lang, native);
          out.push({ date: words.dateKey(i), ...w });
        } catch (_) {
          // якщо AI недоступний — віддаємо принаймні англійське слово
          out.push({ date: words.dateKey(i), word: en, ipa: '', translation: '', example: '', example_translation: '', source: en });
        }
      }
      console.log(new Date().toISOString(), 'word-of-day', lang + '→' + native, out.length + 'д');
      return json(res, 200, { words: out });
    } catch (e) {
      console.error('word-of-day error:', e.message);
      return json(res, 500, { error: 'SERVER_ERROR' });
    }
  }

  if (req.method === 'POST' && req.url === '/scan') {
    const t0 = Date.now();
    // 1) доступ: або авторизований користувач, або спільний токен апки
    const scanUser = await auth.userFromRequest(req).catch(() => null);
    if (!scanUser && APP_TOKEN && req.headers['x-app-token'] !== APP_TOKEN) {
      return json(res, 401, { error: 'Немає доступу.' });
    }
    // 2) ліміт на IP
    if (rateLimited(clientIp(req))) {
      return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
    }
    try {
      // Апка надсилає кадр 1024px/JPEG ≈ 150–400 КБ у base64. Ліміт у 15 МБ
      // дозволяв закидати сервер важкими тілами — 4 МБ із запасом достатньо.
      const raw = await readBody(req, 4 * 1024 * 1024);
      const body = JSON.parse(raw || '{}');
      const image = body.image;
      if (!image || typeof image !== 'string') {
        return json(res, 400, { error: 'Поле "image" (base64 JPEG) обовʼязкове' });
      }
      const lang = LANG_NAMES[body.lang] ? body.lang : 'en';
      const nativeLang = LANG_NAMES[body.nativeLang] ? body.nativeLang : 'uk';
      const prompt = buildPrompt(lang, nativeLang);

      const parsed =
        PROVIDER === 'anthropic'
          ? await callAnthropic(image, prompt)
          : await callGemini(image, prompt);

      if (!parsed || !parsed.word) {
        return json(res, 502, { error: 'Модель повернула нерозбірливу відповідь. Спробуй ще раз.' });
      }
      if (parsed.word === 'unknown') {
        return json(res, 422, { error: "Не бачу чіткого об'єкта. Наведи камеру ближче." });
      }

      // Рамка предмета: 4 цілих 0–1000 у порядку y1,x1,y2,x2 (як у Gemini).
      // Апка ріже по ній кадр, щоб дістати сам предмет без тла — знімок
      // цілого екрана виглядає як випадковий скрін і губить стиль.
      const box = Array.isArray(parsed.box) && parsed.box.length === 4
        ? parsed.box.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0))))
        : null;
      const validBox = box && box[2] > box[0] + 40 && box[3] > box[1] + 40 ? box : null;

      // Силуэт предмета. Приймаємо лише розумний полігон: менше 6 точок —
      // це не контур, а трикутник; більше 40 — модель почала фантазувати.
      const rawOutline = Array.isArray(parsed.outline) ? parsed.outline : null;
      const outline =
        rawOutline && rawOutline.length >= 6 && rawOutline.length <= 40
          ? rawOutline
              .filter((p) => Array.isArray(p) && p.length === 2)
              .map(([y, x]) => [
                Math.max(0, Math.min(1000, Math.round(Number(y) || 0))),
                Math.max(0, Math.min(1000, Math.round(Number(x) || 0))),
              ])
          : null;
      const validOutline = outline && outline.length >= 6 ? outline : null;

      const result = {
        word: String(parsed.word).toLowerCase(),
        ipa: parsed.ipa || '',
        translation: parsed.translation || '',
        example: parsed.example || '',
        example_translation: parsed.example_translation || '',
        box: validBox,
        outline: validOutline,
      };
      console.log(
        new Date().toISOString(),
        PROVIDER,
        lang + '→' + nativeLang,
        Math.round((Date.now() - t0) / 100) / 10 + 's',
        '→',
        result.word
      );
      return json(res, 200, result);
    } catch (e) {
      if (e.name === 'TimeoutError' || e.name === 'AbortError') {
        console.error(new Date().toISOString(), 'TIMEOUT 45s');
        return json(res, 504, { error: 'AI відповідає надто довго. Спробуй ще раз.' });
      }
      if (e.message === 'TOO_LARGE') return json(res, 413, { error: 'Фото завелике' });
      console.error(new Date().toISOString(), 'ERROR:', e.message);
      return json(res, 502, { error: e.message });
    }
  }

  json(res, 404, { error: 'Not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('LinguaLens server запущено. Провайдер: ' + PROVIDER);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log('  → у Wi-Fi мережі: http://' + net.address + ':' + PORT);
      }
    }
  }
  console.log('  → перевірка: відкрий у браузері http://localhost:' + PORT + '/health');
});
