// LinguaLens proxy server — тримає API-ключі в себе, апка ключів не бачить.
// Запуск:  npm start   (читає налаштування з .env)
// Без зовнішніх залежностей — потрібен лише Node 20+.

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Підвантажуємо server/.env, якщо він є (локальний запуск). Робимо це ДО
// підключення модулів — вони читають process.env при завантаженні.
// У хмарі (Cloud Run) змінні приходять зі середовища — файл не потрібен.
try {
  const envText = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
} catch (_) {}

const store = require('./store');
const auth = require('./auth');
const ai = require('./ai');
const billing = require('./billing');
const words = require('./words');

const PORT = Number(process.env.PORT || 3000);

// APP_TOKEN — секрет, який знає лише апка (шле в заголовку x-app-token).
// Якщо не заданий — перевірка вимкнена (зручно для локальної розробки).
// Це захист «від випадкових»: токен лежить у бінарнику. Основний захист —
// ліміти на id пристрою й на IP.
const APP_TOKEN = process.env.APP_TOKEN || '';
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 20);

// ---------- ліміти частоти ----------
// Ковзне вікно в пам'яті. Мапа самоочищується, щоб не стати вектором
// виснаження пам'яті.
function limiter(max, windowMs) {
  const hits = new Map();
  return function limited(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    arr.push(now);
    hits.set(key, arr);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return arr.length > max;
  };
}
const scanLimited = limiter(RATE_PER_MIN, 60000);
const wodLimited = limiter(RATE_PER_MIN, 60000);
// Нові пристрої: справжня людина створює один за все життя установки.
// Двадцять на годину з IP — запас для гуртожитку чи офісу за одним NAT,
// але не для скрипта, що фармить безкоштовні скани.
const deviceLimited = limiter(20, 60 * 60 * 1000);

// IP клієнта для лімітів. Перший запис у X-Forwarded-For пише сам клієнт —
// його можна підробити. Довіряємо лише запису, який додав наш проксі:
// Cloud Run (GFE) дописує справжню адресу в кінець. Якщо попереду ще й
// балансувальник — TRUST_PROXY_HOPS=2.
const TRUST_PROXY_HOPS = Math.max(1, Number(process.env.TRUST_PROXY_HOPS || 1));
function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const hops = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
    const ip = hops[Math.max(0, hops.length - TRUST_PROXY_HOPS)];
    if (ip) return ip;
  }
  return req.socket.remoteAddress || 'unknown';
}

// ---------- HTTP-утиліти ----------
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

async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  try {
    return JSON.parse(raw || '{}');
  } catch (_) {
    return null;
  }
}

// Заголовки безпеки на кожній відповіді (див. SECURITY.md).
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

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

function appTokenOk(req) {
  return !APP_TOKEN || req.headers['x-app-token'] === APP_TOKEN;
}

// ---------- обробники ----------
async function handleScan(req, res, user) {
  const t0 = Date.now();
  if (scanLimited(clientIp(req))) {
    return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
  }
  const day = billing.localDay(req.headers['x-local-date']);
  const check = await billing.checkScan(user, day);
  if (!check.ok) {
    return json(res, 402, { error: 'SCAN_LIMIT', limit: check.limit, used: check.used });
  }

  // Апка надсилає кадр 1024px/JPEG ≈ 150–400 КБ у base64. 4 МБ із запасом.
  const body = await readJson(req, 4 * 1024 * 1024);
  if (!body) return json(res, 400, { error: 'Некоректний JSON' });
  if (!body.image || typeof body.image !== 'string') {
    return json(res, 400, { error: 'Поле "image" (base64 JPEG) обовʼязкове' });
  }
  const lang = ai.LANG_NAMES[body.lang] ? body.lang : 'en';
  const nativeLang = ai.LANG_NAMES[body.nativeLang] ? body.nativeLang : 'uk';

  let parsed;
  try {
    parsed = await ai.recognize(body.image, lang, nativeLang);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error(new Date().toISOString(), 'TIMEOUT 45s');
      return json(res, 504, { error: 'AI відповідає надто довго. Спробуй ще раз.' });
    }
    // Деталі помилки провайдера — лише в лог. Клієнту вони нічого не дають,
    // а назовні відкривають, яким AI і з якими параметрами ми користуємось.
    console.error(new Date().toISOString(), 'AI ERROR:', e.message);
    return json(res, 502, { error: 'AI тимчасово недоступний. Спробуй ще раз.' });
  }

  if (!parsed || !parsed.word) {
    return json(res, 502, { error: 'Модель повернула нерозбірливу відповідь. Спробуй ще раз.' });
  }
  if (String(parsed.word).toLowerCase() === 'unknown') {
    return json(res, 422, { error: "Не бачу чіткого об'єкта. Наведи камеру ближче." });
  }

  // Рамка предмета: 4 цілих 0–1000 у порядку y1,x1,y2,x2 (як у Gemini).
  // Апка ріже по ній кадр, щоб дістати сам предмет без тла.
  const box =
    Array.isArray(parsed.box) && parsed.box.length === 4
      ? parsed.box.map((v) => Math.max(0, Math.min(1000, Math.round(Number(v) || 0))))
      : null;
  const validBox = box && box[2] > box[0] + 40 && box[3] > box[1] + 40 ? box : null;

  // Силует предмета. Менше 6 точок — це не контур, а трикутник; більше 40 —
  // модель почала фантазувати.
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

  await billing.countScan(user, day);
  const pro = check.pro || (user.proUntil || 0) > Date.now();

  const result = {
    word: ai.clean(parsed.word, 60),
    ipa: ai.clean(parsed.ipa, 80),
    translation: ai.clean(parsed.translation, 80),
    example: ai.clean(parsed.example, 240),
    example_translation: ai.clean(parsed.example_translation, 240),
    box: validBox,
    outline: validOutline,
    usage: billing.usageView(user, day, pro),
  };
  console.log(
    new Date().toISOString(),
    ai.PROVIDER,
    lang + '→' + nativeLang,
    Math.round((Date.now() - t0) / 100) / 10 + 's',
    '→',
    result.word
  );
  return json(res, 200, result);
}

async function handleWordOfDay(req, res, user) {
  if (wodLimited(clientIp(req))) return json(res, 429, { error: 'Забагато запитів.' });
  const url = new URL(req.url, 'http://x');
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 14);
  const lang = ai.LANG_NAMES[url.searchParams.get('lang')] ? url.searchParams.get('lang') : 'en';
  const native = ai.LANG_NAMES[url.searchParams.get('native')] ? url.searchParams.get('native') : 'uk';
  // Дати рахуємо від ЛОКАЛЬНОГО «сьогодні» клієнта: інакше ввечері в США
  // сервер (UTC) уже жив би завтрашнім днем і картка була б порожня.
  const today = billing.localDay(url.searchParams.get('today'));
  const list = words.shuffledFor(user.seed || user.id);
  const base = billing.dayIndexOf(today);

  // Дні перекладаються паралельно: на холодному кеші це 7 викликів AI,
  // і послідовно людина чекала б 10+ секунд.
  const out = await Promise.all(
    Array.from({ length: days }, async (_, i) => {
      const date = billing.addDays(today, i);
      const en = words.wordFor(list, base + i);
      try {
        return { date, ...(await ai.translateWord(en, lang, native)) };
      } catch (_) {
        // якщо AI недоступний — віддаємо принаймні англійське слово
        return { date, word: en, ipa: '', translation: '', example: '', example_translation: '', source: en };
      }
    })
  );
  console.log(new Date().toISOString(), 'word-of-day', lang + '→' + native, out.length + 'д');
  return json(res, 200, { words: out });
}

async function handle(req, res) {
  const route = req.url.split('?')[0];

  // CORS + Private Network Access preflight (дозволяє запити з браузера до localhost)
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type, authorization, x-app-token, x-local-date',
      'Access-Control-Allow-Private-Network': 'true',
      'Access-Control-Max-Age': '600',
    });
    return res.end();
  }
  if (req.method === 'GET' && route === '/health') {
    return json(res, 200, { ok: true, provider: ai.PROVIDER, store: store.MODE });
  }

  // Вебхук RevenueCat має власний секрет у заголовку Authorization.
  if (req.method === 'POST' && route === '/webhooks/revenuecat') {
    if (!billing.webhookAuthorized(req)) return json(res, 401, { error: 'UNAUTHORIZED' });
    const body = await readJson(req, 64 * 1024);
    if (!body) return json(res, 400, { error: 'BAD_JSON' });
    const r = await billing.handleWebhook(body);
    console.log(new Date().toISOString(), 'revenuecat', body.event && body.event.type, r.touched || 0);
    return json(res, 200, { ok: true });
  }

  if (!appTokenOk(req)) return json(res, 401, { error: 'Немає доступу.' });

  // ---------- ІДЕНТИЧНІСТЬ ПРИСТРОЮ ----------
  if (req.method === 'POST' && route === '/auth/device') {
    if (deviceLimited(clientIp(req))) return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
    const out = await auth.createDevice();
    console.log(new Date().toISOString(), '/auth/device → ok');
    return json(res, 200, out);
  }

  // Усе далі — лише з токеном пристрою.
  const known =
    (route === '/me' && (req.method === 'GET' || req.method === 'DELETE')) ||
    (route === '/scan' && req.method === 'POST') ||
    (route === '/word-of-day' && req.method === 'GET');
  if (!known) return json(res, 404, { error: 'Not found' });

  const user = await auth.userFromRequest(req);
  if (!user) return json(res, 401, { error: 'UNAUTHORIZED' });

  if (route === '/me' && req.method === 'GET') {
    const day = billing.localDay(req.headers['x-local-date']);
    const pro = await billing.proStatus(user);
    return json(res, 200, {
      user: auth.publicUser(user),
      pro,
      usage: billing.usageView(user, day, pro.active),
    });
  }
  // Видалення даних з сервера — для приватності (і GDPR): запис зникає повністю.
  if (route === '/me' && req.method === 'DELETE') {
    await auth.deleteUser(user);
    console.log(new Date().toISOString(), 'DELETE /me → ok');
    return json(res, 200, { ok: true });
  }
  if (route === '/scan') return handleScan(req, res, user);
  return handleWordOfDay(req, res, user);
}

// Будь-який виняток усередині обробника без цієї обгортки стає
// unhandledRejection, а з Node 15 це валить увесь процес — разом із запитами
// інших користувачів. Тут він перетворюється на звичайну відповідь.
function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e && e.message === 'TOO_LARGE') {
        if (!res.headersSent) json(res, 413, { error: 'Фото завелике' });
        return;
      }
      console.error(new Date().toISOString(), 'UNHANDLED:', e && e.stack ? e.stack : e);
      if (!res.headersSent) {
        try {
          json(res, 500, { error: 'SERVER_ERROR' });
        } catch (_) {}
      }
    });
  });
}

if (require.main === module) {
  createServer().listen(PORT, '0.0.0.0', () => {
    console.log('LinguaLens server запущено. Провайдер: ' + ai.PROVIDER);
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
}

module.exports = { createServer };
