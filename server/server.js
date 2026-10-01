// LinguaLens proxy server — тримає API-ключі в себе, апка ключів не бачить.
// Запуск:  npm start   (читає налаштування з .env)
// Без зовнішніх залежностей — потрібен лише Node 20+.

const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

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
const wordplan = require('./wordplan');
const profile = require('./profile');
const apple = require('./apple');
const sync = require('./sync');

const gzip = promisify(zlib.gzip);

const PORT = Number(process.env.PORT || 3000);

// Політика приватності й сторінка підтримки — обов'язкові посилання для
// App Store (Privacy Policy URL і Support URL). Сервер віддає їх сам: GitHub
// Pages для приватного репозиторію на безкоштовному тарифі недоступні, а
// Cloud Run у нас однаково є. Пошту підставляємо з оточення.
const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL || '';
function loadPage(file) {
  try {
    const html = fs.readFileSync(path.join(__dirname, 'public', file), 'utf8');
    if (!SUPPORT_EMAIL) return html;
    const link = `<a href="mailto:${SUPPORT_EMAIL}">${SUPPORT_EMAIL}</a>`;
    return html.replace(/<span class="contact">[^<]*<\/span>/g, link);
  } catch (_) {
    return null;
  }
}
const PAGES = { '/privacy': loadPage('privacy.html'), '/support': loadPage('support.html') };

// APP_TOKEN — секрет, який знає лише апка (шле в заголовку x-app-token).
// Якщо не заданий — перевірка вимкнена (зручно для локальної розробки).
// Це захист «від випадкових»: токен лежить у бінарнику. Основний захист —
// ліміти на id пристрою й на IP.
const APP_TOKEN = process.env.APP_TOKEN || '';
const RATE_PER_MIN = Number(process.env.RATE_PER_MIN || 20);

// ---------- ліміти частоти ----------
// Ковзне вікно в пам'яті. Мапа самоочищується, щоб не стати вектором
// виснаження пам'яті.
// Відмовлені запити не записуються: у масиві ніколи не більше max позначок,
// тож навіть шквал з однієї IP коштує O(max) на запит, а не росте без меж.
const LIMITER_KEYS = 5000;
function limiter(max, windowMs) {
  const hits = new Map();
  return function limited(key) {
    const now = Date.now();
    const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= max) {
      hits.set(key, arr);
      return true;
    }
    arr.push(now);
    hits.delete(key); // у кінець черги: Map пам'ятає порядок вставки
    hits.set(key, arr);
    if (hits.size > LIMITER_KEYS) {
      for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      // усі ще «гарячі» (розподілена атака) — забуваємо найдавніших
      for (const k of hits.keys()) {
        if (hits.size <= LIMITER_KEYS * 0.9) break;
        hits.delete(k);
      }
    }
    return false;
  };
}
const scanLimited = limiter(RATE_PER_MIN, 60000);
const wodLimited = limiter(RATE_PER_MIN, 60000);
// Персональне слово дня (POST) ще й на пристрій: кожен запит — до 14
// перекладів, а профіль і «Знаю» обирає сам клієнт. Застосунок питає його на
// старті, після зміни профілю і після «Знаю» — двадцять на хвилину з запасом.
const wodUserLimited = limiter(RATE_PER_MIN, 60000);
// Профіль з онбордингу: людина зберігає його раз, потім зрідка в Параметрах.
const profileLimited = limiter(20, 60000);
const profileUserLimited = limiter(10, 60000);
// /me: застосунок питає його при запуску й після покупки — кілька разів на день
const meLimited = limiter(RATE_PER_MIN, 60000);
// Нові пристрої: справжня людина створює один за все життя установки.
// Двадцять на годину з IP — запас для гуртожитку чи офісу за одним NAT,
// але не для скрипта, що фармить безкоштовні скани.
const deviceLimited = limiter(20, 60 * 60 * 1000);
// Вхід через Apple: nonce + сам вхід — два запити, людина робить це раз на
// телефон. Тридцять за 10 хвилин з IP (nonce і вхід рахуються разом)
// вистачає на кілька спроб для цілого офісу, але не на перебір.
const appleLimited = limiter(30, 10 * 60 * 1000);
// Синхронізація: на старті, при поверненні в застосунок, після змін, а
// перша — пачками по 500 слів (6000 слів — 12 запитів). Окремо на IP і
// на акаунт: акаунт з багатьох IP не має засипати свій документ записами.
const syncLimited = limiter(60, 60000);
const syncUserLimited = limiter(60, 60000);

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

// Мова з запиту, лише якщо ми її знаємо. Object.hasOwn, а не LANG_NAMES[x]:
// «constructor» чи «toString» знайшлися б у прототипі й пішли б у підказку
// моделі та в ключ кешу.
function langOr(code, fallback) {
  return typeof code === 'string' && Object.hasOwn(ai.LANG_NAMES, code) ? code : fallback;
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

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  ...SECURITY_HEADERS,
  // Мобільний застосунок не має Origin, тому CORS тут потрібен лише для
  // локальної діагностики з браузера. Дозволяємо, але без credentials —
  // куки й авторизація через '*' не проходять за специфікацією.
  'Access-Control-Allow-Origin': '*',
};

function json(res, status, obj) {
  res.writeHead(status, JSON_HEADERS);
  res.end(JSON.stringify(obj));
}

// gzip, якщо клієнт його приймає і явно не заборонив (q=0).
function acceptsGzip(req) {
  return String(req.headers['accept-encoding'] || '')
    .split(',')
    .some((part) => {
      const [name, ...params] = part.trim().toLowerCase().split(';').map((s) => s.trim());
      const q = params.find((p) => p.startsWith('q='));
      return name === 'gzip' && (!q || Number(q.slice(2)) > 0);
    });
}

// Повна синхронізація — це мегабайти JSON на 6000 слів. Телефон
// (NSURLSession) сам просить gzip і сам розпаковує; стиснення урізає
// трафік у кілька разів. Дрібні відповіді не стискаємо — не варто.
async function jsonCompressed(req, res, status, obj) {
  const text = JSON.stringify(obj);
  const headers = { ...JSON_HEADERS, Vary: 'Accept-Encoding' };
  if (text.length < 2048 || !acceptsGzip(req)) {
    res.writeHead(status, headers);
    return res.end(text);
  }
  const body = await gzip(text);
  res.writeHead(status, { ...headers, 'Content-Encoding': 'gzip' });
  res.end(body);
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
  const slot = await billing.reserveScan(user, day);
  if (slot.gone) return json(res, 401, { error: 'UNAUTHORIZED' });
  if (slot.busy) return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
  if (!slot.ok) {
    return json(res, 402, { error: 'SCAN_LIMIT', limit: slot.limit, used: slot.used });
  }
  // Слот зайнятий. Якщо далі щось піде не так (погане тіло, помилка AI,
  // «не бачу предмета», людина не дочекалась) — повертаємо його, і саме ДО
  // відповіді: інакше миттєвий повтор на межі ліміту отримав би 402.
  const release = () => slot.release().catch((e) => console.error('release failed:', e.message));
  let out;
  try {
    out = await scanWithSlot(req, user, day, slot, t0);
  } catch (e) {
    await release();
    throw e;
  }
  if (!out || out[0] !== 200) await release();
  if (out) return json(res, out[0], out[1]);
}

const UNREADABLE = [502, { error: 'Модель повернула нерозбірливу відповідь. Спробуй ще раз.' }];
const NOTHING_SEEN = [422, { error: "Не бачу чіткого об'єкта. Наведи камеру ближче." }];

// Повертає [статус, тіло] або null, якщо відповідати вже нікому.
async function scanWithSlot(req, user, day, slot, t0) {
  // Апка надсилає кадр 1024px/JPEG ≈ 150–400 КБ у base64. 4 МБ із запасом.
  const body = await readJson(req, 4 * 1024 * 1024);
  if (!body) return [400, { error: 'Некоректний JSON' }];
  if (!body.image || typeof body.image !== 'string') {
    return [400, { error: 'Поле "image" (base64 JPEG) обовʼязкове' }];
  }
  const lang = langOr(body.lang, 'en');
  const nativeLang = langOr(body.nativeLang, 'uk');
  // Сцена (кілька предметів з одного кадру) коштує так само один скан.
  // Відсутній чи невідомий mode — звичайний скан: старі версії застосунку
  // цього поля не знають.
  const scene = body.mode === 'scene';
  // Рівень зі слайдера (1–10) робить приклад простішим чи багатшим, а від 7
  // додає вирази. Немає рівня — відповідь рівно така, як до персоналізації.
  const level = profile.level(body.level);

  let parsed;
  try {
    parsed = scene
      ? await ai.recognizeScene(body.image, lang, nativeLang, level)
      : await ai.recognize(body.image, lang, nativeLang, level);
  } catch (e) {
    if (e.name === 'TimeoutError' || e.name === 'AbortError') {
      console.error(new Date().toISOString(), 'AI TIMEOUT');
      return [504, { error: 'AI відповідає надто довго. Спробуй ще раз.' }];
    }
    // Деталі помилки провайдера — лише в лог. Клієнту вони нічого не дають,
    // а назовні відкривають, яким AI і з якими параметрами ми користуємось.
    console.error(new Date().toISOString(), 'AI ERROR:', e.message);
    return [502, { error: 'AI тимчасово недоступний. Спробуй ще раз.' }];
  }

  let result;
  if (scene) {
    // Рамки, контури й рядки чистить ai.cleanScene: предмет без рамки
    // викинуто, повтори злито. Не лишилось жодного — як «не бачу предмета».
    const objects = ai.cleanScene(parsed);
    if (!objects) return UNREADABLE;
    if (!objects.length) return NOTHING_SEEN;
    result = { mode: 'scene', objects };
  } else {
    if (!parsed || !parsed.word) return UNREADABLE;
    if (String(parsed.word).toLowerCase() === 'unknown') return NOTHING_SEEN;
    result = { ...ai.cleanWord(parsed), box: ai.cleanBox(parsed.box), outline: ai.cleanOutline(parsed.outline) };
    if (ai.wantsExtras(level)) {
      const extras = ai.cleanExtras(parsed.extras, result.word);
      if (extras.length) result.extras = extras;
    }
  }
  // Застосунок уже перестав чекати (таймаут, закрив екран) — відповідь
  // ніхто не побачить, тож і скан не рахуємо.
  if (req.socket.destroyed) return null;

  const pro = slot.pro || (user.proUntil || 0) > Date.now();
  result.usage = billing.usageView(user, day, pro);
  console.log(
    new Date().toISOString(),
    ai.PROVIDER,
    lang + '→' + nativeLang + (level ? ' L' + level : ''),
    Math.round((Date.now() - t0) / 100) / 10 + 's',
    '→',
    scene ? 'сцена: ' + result.objects.map((o) => o.word).join(', ') : result.word
  );
  return [200, result];
}

// ---------- Sign in with Apple ----------
// 400, а не 401: застосунок на 401 UNAUTHORIZED вважає, що сервер забув
// пристрій, і бере нову ідентичність. Поганий токен Apple — інша історія.
async function handleAppleSignIn(req, res, user) {
  if (appleLimited(clientIp(req))) return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
  // identityToken Apple важить 1–2 КБ; 16 КБ із запасом.
  const body = await readJson(req, 16 * 1024);
  if (!body || typeof body !== 'object' || !auth.appleNonceValid(body.nonce, user.id)) {
    return json(res, 400, { error: 'APPLE_INVALID' });
  }
  let claims;
  try {
    claims = await apple.verifyIdentityToken(body.identityToken, auth.sha256hex(body.nonce));
  } catch (e) {
    if (e.code === 'APPLE_UNAVAILABLE') return json(res, 503, { error: 'APPLE_UNAVAILABLE' });
    if (e.code !== 'APPLE_INVALID') throw e;
    // Лише причина (aud, expired, nonce…): токен і sub у лог не пишемо.
    console.log(new Date().toISOString(), '/auth/apple → відхилено:', e.message);
    return json(res, 400, { error: 'APPLE_INVALID' });
  }

  const link = await auth.linkApple(user, claims.sub);
  if (link.gone) return json(res, 401, { error: 'UNAUTHORIZED' });
  if (link.busy) return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });

  // Refresh-токен потрібен лише щоб відкликати вхід, коли людина видалить
  // акаунт. Не вийшло — вхід однаково вдався, видалення просто не матиме
  // чого відкликати.
  const code = body.authorizationCode;
  if (apple.configured() && typeof code === 'string' && code && code.length <= 1024) {
    try {
      const refresh = await apple.exchangeCode(code, claims.aud, claims.sub);
      await auth.saveAppleRefresh(link.account.id, refresh, claims.aud);
    } catch (e) {
      console.error(new Date().toISOString(), 'apple: обмін коду не вдався:', e.message);
    }
  }
  console.log(new Date().toISOString(), '/auth/apple →', link.switched ? 'перехід в акаунт' : 'привʼязано');
  return json(res, 200, {
    user: auth.publicUser(link.account),
    token: auth.makeToken(link.account.id),
    switched: link.switched,
  });
}

// ---------- синхронізація словника ----------
async function handleSync(req, res, user) {
  if (syncLimited(clientIp(req)) || syncUserLimited(user.id)) {
    return json(res, 429, { error: 'TOO_MANY_REQUESTS' });
  }
  if (!(await auth.isLinked(user))) return json(res, 403, { error: 'SIGN_IN_REQUIRED' });
  // 500 слів — до пів мегабайта в найгіршому разі; 1 МБ із запасом.
  const body = await readJson(req, 1024 * 1024);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json(res, 400, { error: 'BAD_JSON' });
  const out = await sync.sync(user.id, body);
  if (out.status === 200) {
    const sent = Array.isArray(body.words) ? body.words.length : 0;
    console.log(new Date().toISOString(), '/sync → rev', out.body.rev, '↑' + sent, '↓' + out.body.words.length);
  }
  return jsonCompressed(req, res, out.status, out.body);
}

// GET — для версій застосунку до персоналізації: той самий список v1 і той
// самий порядок, тож після оновлення сервера в людей нічого не змінилось.
async function handleWordOfDay(req, res, user) {
  if (wodLimited(clientIp(req))) return json(res, 429, { error: 'Забагато запитів.' });
  const url = new URL(req.url, 'http://x');
  const days = Math.min(Math.max(Number(url.searchParams.get('days') || 7), 1), 14);
  const lang = langOr(url.searchParams.get('lang'), 'en');
  const native = langOr(url.searchParams.get('native'), 'uk');
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

// Скільки днів віддати: 1–14, без числа — 7, як у GET.
function wodDays(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Math.floor(Number(v)) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 14) : 7;
}

// POST — персональне слово дня: теми й рівень з профілю, без слів, на які
// людина натиснула «Знаю». Профіль приходить у кожному запиті, а не з бази:
// так він працює і без збереження на сервері, і одразу після зміни в
// Параметрах.
async function handleWordOfDayPost(req, res, user) {
  if (wodLimited(clientIp(req)) || wodUserLimited(user.id)) return json(res, 429, { error: 'Забагато запитів.' });
  // 500 «Знаю» по ≤ 60 символів — до ~35 КБ; 64 КБ із запасом.
  const body = await readJson(req, 64 * 1024);
  if (!profile.isPlainObject(body)) return json(res, 400, { error: 'BAD_JSON' });
  const days = wodDays(body.days);
  const lang = langOr(body.lang, 'en');
  const native = langOr(body.native, 'uk');
  // Дати — від локального «сьогодні» клієнта, як у GET.
  const today = billing.localDay(body.today);
  const plan = wordplan.schedule({
    seed: user.seed || user.id,
    profile: profile.forSchedule(body.profile, today),
    known: profile.known(body.known),
    today,
    days,
  });

  // Дні перекладаються паралельно, як у GET; невдалий переклад не валить
  // решту — день лишається хоча б з англійським словом.
  const out = await Promise.all(
    plan.map(async ({ date, en, topic, hint }) => {
      try {
        return { date, ...(await ai.translateWord(en, lang, native, { topic, hint })), source: en, topic };
      } catch (_) {
        return { date, word: en, ipa: '', translation: '', example: '', example_translation: '', source: en, topic };
      }
    })
  );
  const topics = {};
  for (const w of out) topics[w.topic] = (topics[w.topic] || 0) + 1;
  const mix = Object.entries(topics).map(([k, n]) => k + '×' + n).join(' ');
  console.log(new Date().toISOString(), 'word-of-day', lang + '→' + native, out.length + 'д', mix);
  return json(res, 200, { words: out });
}

// Відповіді онбордингу — у запис пристрою (users/<id>.profile), щоб
// власник міг порахувати, хто ці люди й звідки прийшли. Лише варіанти з
// готових списків, без особистих даних; стираються разом із записом
// («Стерти всі мої дані»).
async function handleProfile(req, res, user) {
  if (profileLimited(clientIp(req)) || profileUserLimited(user.id)) {
    return json(res, 429, { error: 'TOO_MANY_REQUESTS' });
  }
  const body = await readJson(req, 4 * 1024);
  if (!profile.isPlainObject(body)) return json(res, 400, { error: 'BAD_JSON' });
  const r = await store.update('users', user.id, { profile: profile.forStorage(body, user.profile) });
  // Запис стерли паралельним DELETE /me — пристрою більше немає.
  if (!r.ok) return json(res, 401, { error: 'UNAUTHORIZED' });
  console.log(new Date().toISOString(), '/me/profile → ok');
  return json(res, 200, { ok: true });
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
  if (req.method === 'GET' && Object.hasOwn(PAGES, route) && PAGES[route]) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, 'Cache-Control': 'public, max-age=3600' });
    return res.end(PAGES[route]);
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

  // 403, а не 401: застосунок на 401 вважає, що сервер забув пристрій, і
  // бере нову ідентичність. Неправильний APP_TOKEN — це помилка збірки.
  if (!appTokenOk(req)) return json(res, 403, { error: 'APP_TOKEN' });

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
    (req.method === 'POST' &&
      ['/scan', '/sync', '/auth/apple', '/auth/apple/nonce', '/me/profile', '/word-of-day'].includes(route)) ||
    (route === '/word-of-day' && req.method === 'GET');
  if (!known) return json(res, 404, { error: 'Not found' });

  const user = await auth.userFromRequest(req);
  if (!user) return json(res, 401, { error: 'UNAUTHORIZED' });

  // nonce для входу через Apple: без стану на сервері (див. auth.appleNonce)
  if (route === '/auth/apple/nonce') {
    if (appleLimited(clientIp(req))) return json(res, 429, { error: 'TOO_MANY_ATTEMPTS' });
    return json(res, 200, auth.appleNonce(user.id));
  }
  if (route === '/auth/apple') return handleAppleSignIn(req, res, user);
  if (route === '/sync') return handleSync(req, res, user);

  if (route === '/me' && req.method === 'GET') {
    if (meLimited(clientIp(req))) return json(res, 429, { error: 'Забагато запитів.' });
    const day = billing.localDay(req.headers['x-local-date']);
    // ?refresh=1 — одразу після покупки: перепитати RevenueCat без кешу
    const refresh = new URL(req.url, 'http://x').searchParams.get('refresh') === '1';
    const pro = await billing.proStatus(user, { refresh });
    return json(res, 200, {
      user: auth.publicUser(user),
      pro,
      usage: billing.usageView(user, day, pro.active),
    });
  }
  // Видалення даних з сервера — для приватності (і GDPR): запис зникає
  // повністю, разом зі словником і зв'язком з Apple ID.
  if (route === '/me' && req.method === 'DELETE') {
    await auth.deleteUser(user);
    // Apple вимагає відкликати вхід, коли людина видаляє акаунт. Невдача тут
    // не скасовує видалення — дані вже стерто; лишається запис у лозі.
    if (user.appleRefresh) {
      try {
        if (await apple.revoke(user.appleRefresh, user.appleClient || apple.AUDIENCES[0])) {
          console.log(new Date().toISOString(), 'apple: вхід відкликано');
        }
      } catch (e) {
        console.error(new Date().toISOString(), 'apple: відкликання не вдалося:', e.message);
      }
    }
    console.log(new Date().toISOString(), 'DELETE /me → ok');
    return json(res, 200, { ok: true });
  }
  if (route === '/me/profile') return handleProfile(req, res, user);
  if (route === '/scan') return handleScan(req, res, user);
  if (req.method === 'POST') return handleWordOfDayPost(req, res, user);
  return handleWordOfDay(req, res, user);
}

// Будь-який виняток усередині обробника без цієї обгортки стає
// unhandledRejection, а з Node 15 це валить увесь процес — разом із запитами
// інших користувачів. Тут він перетворюється на звичайну відповідь.
function createServer() {
  return http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      if (e && e.message === 'TOO_LARGE') {
        const scan = req.url.split('?')[0] === '/scan';
        if (!res.headersSent) json(res, 413, { error: scan ? 'Фото завелике' : 'TOO_LARGE' });
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
