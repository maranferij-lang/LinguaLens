// LinguaLens proxy server: holds the API keys itself, the app never sees the keys.
// Start:  npm start   (reads settings from .env)
// No external dependencies: only Node 20+ is needed.

const http = require('http');
const os = require('os');
const store = require('./store');
const auth = require('./auth');
const words = require('./words');

// Load server/.env if it exists (local run).
// In the cloud (Cloud Run) the variables come from the environment, so the file is not needed.
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

// Protection of the public server:
// APP_TOKEN is a secret known only to the app (it sends it in the x-app-token header).
//   If it is not set, the check is turned off (convenient for local development).
const APP_TOKEN = process.env.APP_TOKEN || '';
// Limit of scans from one IP address per minute (protection against abuse).
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 20);
// Sign-in attempts are limited separately and much more strictly. The general limit of 20/min
// would allow 28,800 password attempts per day from one IP, which is enough to
// guess a weak password. Ten per 15 minutes makes brute force pointless.
const AUTH_TRIES = 10;
const AUTH_WINDOW = 15 * 60 * 1000;
const authHits = new Map();

function authRateLimited(key) {
  const now = Date.now();
  const arr = (authHits.get(key) || []).filter((t) => now - t < AUTH_WINDOW);
  arr.push(now);
  authHits.set(key, arr);
  // we do not let the map grow without bound: that is also a vector (memory exhaustion)
  if (authHits.size > 5000) {
    for (const [k, v] of authHits) if (!v.length || now - v[v.length - 1] > AUTH_WINDOW) authHits.delete(k);
  }
  return arr.length > AUTH_TRIES;
}

// A simple per-IP request counter (in memory, a 60 s sliding window).
const hits = new Map();
function rateLimited(ip) {
  const now = Date.now();
  const arr = (hits.get(ip) || []).filter((t) => now - t < 60000);
  arr.push(now);
  hits.set(ip, arr);
  // every now and then we clean old entries so that the map does not grow
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

// fetch with a 45 s timeout and one retry on 503 (AI overload)
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
        // without this the model "thinks" for 40-180 s; minimal = almost instant
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

// A text request to the AI (without a photo), for translating the "word of the day".
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

// Translation of the word of the day with a cache (so as not to spend quota on identical pairs)
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
    // A mobile app has no Origin, so CORS is needed here only for
    // local diagnostics from a browser. We allow it, but without credentials:
    // cookies and authorization do not pass with '*' according to the specification.
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  // CORS + Private Network Access preflight (allows requests from a browser to localhost)
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

  // ---------- AUTHORIZATION ----------
  if (req.method === 'POST' && (req.url === '/auth/register' || req.url === '/auth/login')) {
    if (authRateLimited(clientIp(req))) {
      return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
    }
    // The sign-in body is small. 64 KB for an email + password is a gift to an attacker,
    // 4 KB is more than enough.

    try {
      const body = JSON.parse((await readBody(req, 4 * 1024)) || '{}');
      const result =
        req.url === '/auth/register' ? await auth.register(body) : await auth.login(body);
      if (result.error) return json(res, result.status || 400, { error: result.error });
      // We do not write the email to the logs: more people can see Cloud Run logs than the database.
      console.log(new Date().toISOString(), req.url, '→ ok');
      return json(res, 200, result);
    } catch (e) {
      console.error('auth error:', e.message);
      return json(res, 500, { error: 'SERVER_ERROR' });
    }
  }

  // ---------- PROFILE ----------
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

  // ---------- WORD OF THE DAY ----------
  // GET /word-of-day?days=7&lang=en&native=uk  (a Bearer token is required)
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
          // if the AI is unavailable, we return at least the English word
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
    // 1) access: either an authorized user or the app's shared token
    const scanUser = await auth.userFromRequest(req).catch(() => null);
    if (!scanUser && APP_TOKEN && req.headers['x-app-token'] !== APP_TOKEN) {
      return json(res, 401, { error: 'Немає доступу.' });
    }
    // 2) per-IP limit
    if (rateLimited(clientIp(req))) {
      return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
    }
    try {
      // The app sends a 1024px/JPEG frame ≈ 150-400 KB in base64. A 15 MB limit
      // allowed throwing heavy bodies at the server; 4 MB is plenty.
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

      // Object box: 4 integers 0-1000 in the order y1,x1,y2,x2 (as in Gemini).
      // The app crops the frame with it to get the object itself without the background: a screenshot
      // of the whole screen looks like an accidental screen capture and loses the style.
      const box = Array.isArray(parsed.box) && parsed.box.length === 4
        ? parsed.box.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0))))
        : null;
      const validBox = box && box[2] > box[0] + 40 && box[3] > box[1] + 40 ? box : null;

      // Object silhouette. We accept only a sensible polygon: fewer than 6 points is
      // not an outline but a triangle; more than 40 means the model started making things up.
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
