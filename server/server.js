// LinguaLens proxy server — тримає API-ключі в себе, апка ключів не бачить.
// Запуск:  npm start   (читає налаштування з .env)
// Без зовнішніх залежностей — потрібен лише Node 20+.

const http = require('http');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const net = require('net');
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
// Не Number(...): опечатка (RATE_PER_MIN=abc → NaN) мовчки вимкнула б ліміт,
// а 0 — відхиляла б усіх. Погане значення — попередження в лозі й 20.
const RATE_PER_MIN = envPositiveInt('RATE_PER_MIN', 20);

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
// /me: застосунок питає його при запуску й після покупки — кілька разів на
// день. Це лише читання, тож стеля з IP втричі вища за RATE_PER_MIN: мобільні
// оператори тримають тисячі телефонів за кількома адресами, і двадцять
// запусків на хвилину з однієї з них лишили б «Pro невідомий» (429). Скани й
// слово дня лишаються на RATE_PER_MIN, а перепитування RevenueCat після
// покупки окремо стримує REFRESH_MIN_MS (billing.js) на пристрій.
const ME_RATE_FACTOR = 3;
const meLimited = limiter(RATE_PER_MIN * ME_RATE_FACTOR, 60000);
// Нові пристрої: справжня людина створює один за все життя установки.
// Двадцять на годину з IP — запас для гуртожитку чи офісу за одним NAT,
// але не для скрипта, що фармить безкоштовні скани. У день запуску за одним
// NAT (кампус, офіс, оператор) нових установок може бути більше: ліміт
// піднімають змінною DEVICE_LIMIT_PER_HOUR без нової збірки (gcloud run
// services update --update-env-vars). Лічильник свій у кожного інстансу.
function envPositiveInt(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (Number.isInteger(n) && n > 0) return n;
  console.warn(`server: ${name}=${raw} не ціле число > 0, беру ${fallback}`);
  return fallback;
}
const DEVICE_LIMIT_PER_HOUR = envPositiveInt('DEVICE_LIMIT_PER_HOUR', 20);
const deviceLimited = limiter(DEVICE_LIMIT_PER_HOUR, 60 * 60 * 1000);
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
// балансувальник — TRUST_PROXY_HOPS=2. Опечатка в значенні (abc → NaN)
// зламала б вибір запису, і всі клієнти за Cloud Run ділили б одну адресу
// проксі, тож через envPositiveInt: погане значення — попередження й 1.
const TRUST_PROXY_HOPS = envPositiveInt('TRUST_PROXY_HOPS', 1);

// Розгортає IPv6 у вісім чисел (16 біт кожне) або null, якщо запис не розібрати.
function ipv6Groups(ip) {
  const halves = ip.split('::');
  if (halves.length > 2) return null;
  const groups = (s) => {
    if (!s) return [];
    const parts = s.split(':');
    const last = parts[parts.length - 1];
    if (last.includes('.')) {
      // IPv4 у хвості (::ffff:1.2.3.4) — це ще дві групи
      const o = last.split('.').map(Number);
      if (o.length !== 4 || o.some((n) => !(n >= 0 && n <= 255))) return null;
      parts.splice(-1, 1, ((o[0] << 8) | o[1]).toString(16), ((o[2] << 8) | o[3]).toString(16));
    }
    const nums = parts.map((p) => parseInt(p, 16));
    return nums.some((n) => !Number.isInteger(n)) ? null : nums;
  };
  const head = groups(halves[0]);
  const tail = halves.length === 2 ? groups(halves[1]) : [];
  if (!head || !tail) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const fill = 8 - head.length - tail.length;
  return fill < 1 ? null : [...head, ...Array(fill).fill(0), ...tail];
}

// Ключ ліміту з адреси клієнта. IPv4 лишається як є, ::ffff:a.b.c.d — це
// ту саму IPv4. Одне домашнє чи мобільне IPv6-підключення дістає цілу мережу
// /64 (2^64 адрес), тож для IPv6 ключ — її перші чотири групи: інакше
// достатньо міняти адресу всередині мережі, щоб обійти ліміти нових
// пристроїв (кожен дає безкоштовний скан) і сканів.
function ipKey(raw) {
  let ip = String(raw == null ? '' : raw).trim();
  if (ip.startsWith('[')) ip = ip.slice(1).split(']')[0];
  else if (/^\d+\.\d+\.\d+\.\d+:\d+$/.test(ip)) ip = ip.split(':')[0];
  ip = ip.split('%')[0]; // зона інтерфейсу (fe80::1%eth0)
  if (!net.isIPv6(ip)) return ip;
  const g = ipv6Groups(ip);
  if (!g) return ip;
  if (g.slice(0, 5).every((n) => n === 0) && g[5] === 0xffff) {
    return [g[6] >> 8, g[6] & 255, g[7] >> 8, g[7] & 255].join('.');
  }
  return g.slice(0, 4).map((n) => n.toString(16)).join(':') + '::/64';
}

function clientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) {
    const hops = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
    const ip = hops[Math.max(0, hops.length - TRUST_PROXY_HOPS)];
    if (ip) return ipKey(ip);
  }
  return ipKey(req.socket.remoteAddress) || 'unknown';
}

// Мова з запиту, лише якщо ми її знаємо. Object.hasOwn, а не LANG_NAMES[x]:
// «constructor» чи «toString» знайшлися б у прототипі й пішли б у підказку
// моделі та в ключ кешу.
function langOr(code, fallback) {
  return typeof code === 'string' && Object.hasOwn(ai.LANG_NAMES, code) ? code : fallback;
}

// Варіанти мов (англійська США / Британії, іспанська Іспанії / Латинської
// Америки) — лише зі списку ai.VARIETIES і лише ті, що є в цієї мови;
// решта — null, тобто як до варіантів. src — тіло чи параметри запиту.
function variantsOf(src, lang, nativeLang) {
  const get = (k) => (typeof src?.get === 'function' ? src.get(k) : src?.[k]);
  return { variant: ai.variantOr(lang, get('variant')), nativeVariant: ai.variantOr(nativeLang, get('nativeVariant')) };
}

// «en-gb→es-latam» для журналу
function pairTag(lang, nativeLang, vars) {
  return ai.langTag(lang, vars.variant) + '→' + ai.langTag(nativeLang, vars.nativeVariant);
}

// ---------- налаштування продакшну ----------
// Усе нижче в продакшні обов'язкове, але сервер без нього не падає: кожна
// відсутня змінна мовчки вмикає запасний варіант (див. DEPLOY.md), а
// `gcloud run deploy --set-env-vars` замінює ВСІ змінні, тож звичайний
// передеплой міг би тихо зняти їх. Тому: попередження в лог при старті й
// булеві прапорці в /health (самих значень там немає й не буде).
// Ключ AI — для обраного PROVIDER (будь-що, крім anthropic, іде в Gemini,
// як у ai.js); mock ключа не потребує.
// mock на Cloud Run (K_SERVICE ставить сам Cloud Run) — помилка налаштування:
// кожен скан віддавав би заготовлену чашку, а ключ «на місці».
function aiKeyConfigured() {
  if (ai.PROVIDER === 'mock') return !process.env.K_SERVICE;
  const name = ai.PROVIDER === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
  return !!String(process.env[name] || '').trim();
}

function configFlags() {
  return {
    ai: aiKeyConfigured(),
    authSecret: auth.secretStatus() === 'ok',
    firestore: store.MODE === 'firestore',
    revenuecat: billing.configured(),
    webhookAuth: billing.webhookConfigured(),
    supportEmail: !!SUPPORT_EMAIL,
    appleRevoke: apple.configured(),
    appToken: !!APP_TOKEN,
  };
}

// Рядки попереджень, по одному на кожну відсутню настройку. Для mock
// (локальна розробка й тести) їх немає, крім mock на Cloud Run.
function configWarnings() {
  if (ai.PROVIDER === 'mock') {
    return process.env.K_SERVICE
      ? ['PROVIDER=mock на Cloud Run: скани й слово дня віддають заглушку, а не справжній AI. Постав PROVIDER=gemini або anthropic']
      : [];
  }
  const flags = configFlags();
  const out = [];
  if (!flags.ai) {
    const name = ai.PROVIDER === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GEMINI_API_KEY';
    out.push(`${name} не заданий (PROVIDER=${ai.PROVIDER}): скани й слово дня віддаватимуть 502`);
  }
  if (!flags.authSecret) {
    out.push(
      auth.secretStatus() === 'short'
        ? `AUTH_SECRET коротший за ${auth.MIN_SECRET_LENGTH} символів: візьми openssl rand -hex 32`
        : 'AUTH_SECRET не заданий: підпис токенів тимчасовий, пристрої губитимуть вхід при рестарті й на інших інстансах'
    );
  }
  if (!flags.firestore) {
    out.push('FIRESTORE_PROJECT не заданий: дані лежать у файлі всередині контейнера й зникнуть при рестарті');
  }
  if (!flags.revenuecat) {
    out.push('REVENUECAT_SECRET_KEY не заданий: Pro визнається лише за вебхуком, без перевірки в RevenueCat');
  }
  if (!flags.webhookAuth) {
    out.push('REVENUECAT_WEBHOOK_AUTH не заданий: вебхук RevenueCat відповідатиме 401, покупки не дійдуть до сервера');
  }
  if (!flags.supportEmail) {
    out.push('SUPPORT_EMAIL не заданий: сторінки /privacy і /support лишаться із заглушкою замість пошти');
  }
  if (!flags.appleRevoke) {
    const missing = apple.missingSettings();
    out.push(
      missing.length
        ? `${missing.join(', ')} не задано: при видаленні акаунта вхід через Apple не відкликатиметься`
        : 'ключ Sign in with Apple (APPLE_PRIVATE_KEY) не розібрався: вхід через Apple не відкликатиметься'
    );
  }
  if (!flags.appToken) {
    out.push('APP_TOKEN не заданий (рекомендовано): сервер приймає запити від будь-кого, хто знає адресу, а не лише від збірки застосунку');
  }
  return out;
}

// ---------- HTTP-утиліти ----------
// Скільки тіла, що перевищило ліміт, ми ще проковтнемо (без збереження), щоб
// відповідь 413 встигла дійти. Закрити сокет одразу — означає скидання
// з'єднання: клієнт бачить обрив («немає зв'язку»), а не 413. Далі за це —
// обрив.
const DRAIN_MAX = 16 * 1024 * 1024;

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let over = false;
    const chunks = [];
    const tooLarge = () => {
      over = true;
      chunks.length = 0;
      reject(new Error('TOO_LARGE'));
    };
    // Розмір відомий із заголовка — відмовляємо, не прочитавши жодного байта.
    if (Number(req.headers['content-length']) > limit) tooLarge();
    req.on('data', (c) => {
      size += c.length;
      if (over) {
        if (size > DRAIN_MAX) req.destroy();
        return;
      }
      if (size > limit) return tooLarge();
      chunks.push(c);
    });
    req.on('end', () => {
      if (!over) resolve(Buffer.concat(chunks).toString('utf8'));
    });
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

function json(res, status, obj, headers) {
  res.writeHead(status, headers ? { ...JSON_HEADERS, ...headers } : JSON_HEADERS);
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

// Порівняння за сталий час (як у billing.webhookAuthorized): токен лежить у
// бінарнику, тож це гігієна, а не захист, але нічого не коштує.
function appTokenOk(req) {
  if (!APP_TOKEN) return true;
  const got = Buffer.from(String(req.headers['x-app-token'] || ''));
  const want = Buffer.from(APP_TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// ---------- обробники ----------
const BASE64_RE = /^[A-Za-z0-9+/]+={0,2}$/;
function cleanImage(raw) {
  if (typeof raw !== 'string') return null;
  const s = raw.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '').replace(/\s+/g, '');
  return BASE64_RE.test(s) ? s : null;
}

async function handleScan(req, res, user) {
  const t0 = Date.now();
  if (scanLimited(clientIp(req))) {
    return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
  }
  // Локальне «сьогодні» клієнта — лише для поля day у usage: ліміт сканів
  // довічний і від дати не залежить.
  const day = billing.localDay(req.headers['x-local-date']);
  // Тіло читаємо ДО слота: від нього залежить, що саме займати. Сцена
  // займає ще й довічну безкоштовну пробу, і обидва лічильники пишуться одним
  // умовним записом (див. billing.reserveScan). Погане тіло — просто 400.
  // Апка надсилає кадр 1024px/JPEG ≈ 150–400 КБ у base64. 4 МБ із запасом.
  const body = await readJson(req, 4 * 1024 * 1024);
  if (!body) return json(res, 400, { error: 'Некоректний JSON' });
  // Кадр — чистий base64 JPEG. Префікс data:image/…;base64, знімаємо; все, що
  // не base64, відхиляємо ДО слота: провайдер відповів би помилкою, а людина
  // побачила б «AI недоступний».
  const image = cleanImage(body.image);
  if (!image) return json(res, 400, { error: 'Поле "image" (base64 JPEG) обовʼязкове' });
  body.image = image;
  // Сцена (кілька предметів з одного кадру) коштує один скан із FREE_SCANS
  // довічних, а без Pro ще й одну з FREE_SCENES довічних проб. Відсутній чи
  // невідомий mode — звичайний скан: старі версії застосунку цього поля не
  // знають.
  const scene = body.mode === 'scene';
  const slot = await billing.reserveScan(user, { scene });
  if (slot.gone) return json(res, 401, { error: 'UNAUTHORIZED' });
  if (slot.busy) return json(res, 429, { error: 'Забагато запитів. Зачекай хвилинку.' });
  if (!slot.ok) {
    // Обидві відмови — до виклику AI. Застосунок розрізняє їх за error:
    // SCAN_LIMIT — пейвол сканів, SCENE_PRO — пейвол сцени.
    return json(res, 402, { error: slot.scene ? 'SCENE_PRO' : 'SCAN_LIMIT', limit: slot.limit, used: slot.used });
  }
  // Скан зайнятий. Якщо далі щось піде не так (помилка AI, «не бачу
  // предмета», людина не дочекалась) — повертаємо його, і саме ДО відповіді:
  // інакше миттєвий повтор єдиного безкоштовного скану отримав би 402.
  const release = () => slot.release().catch((e) => console.error('release failed:', e.message));
  let out;
  try {
    out = await scanWithSlot(req, body, scene, user, day, slot, t0);
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
async function scanWithSlot(req, body, scene, user, day, slot, t0) {
  const lang = langOr(body.lang, 'en');
  const nativeLang = langOr(body.nativeLang, 'uk');
  // Варіанти мов: який різновид англійської чи іспанської писати
  const vars = variantsOf(body, lang, nativeLang);
  // Рівень зі слайдера (1–10) робить приклад простішим чи багатшим, а від 7
  // додає вирази. Немає рівня — відповідь рівно така, як до персоналізації.
  const level = profile.level(body.level);

  let parsed;
  try {
    parsed = scene
      ? await ai.recognizeScene(body.image, lang, nativeLang, level, vars)
      : await ai.recognize(body.image, lang, nativeLang, level, vars);
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
    // Предмет без перекладу — порожня наліпка. Лишаємо тільки з перекладом;
    // не лишилось жодного — відповідь марна, скан людині не рахуємо.
    const usable = objects.filter((o) => ai.hasTranslation(o, lang, nativeLang));
    if (!usable.length) return UNREADABLE;
    result = { mode: 'scene', objects: usable };
  } else {
    if (!parsed || !parsed.word) return UNREADABLE;
    if (String(parsed.word).toLowerCase() === 'unknown') return NOTHING_SEEN;
    // Слово й переклад обов'язкові (приклад ні): інакше єдиний безкоштовний
    // скан витрачено на порожню наліпку, а слот звільняється лише для не-200.
    const item = ai.cleanWord(parsed);
    if (!item.word || !ai.hasTranslation(item, lang, nativeLang)) return UNREADABLE;
    result = { ...item, box: ai.cleanBox(parsed.box), outline: ai.cleanOutline(parsed.outline) };
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
    pairTag(lang, nativeLang, vars) + (level ? ' L' + level : ''),
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
  const days = wodDays(url.searchParams.get('days'));
  const lang = langOr(url.searchParams.get('lang'), 'en');
  const native = langOr(url.searchParams.get('native'), 'uk');
  const vars = variantsOf(url.searchParams, lang, native);
  // Дати рахуємо від ЛОКАЛЬНОГО «сьогодні» клієнта: інакше ввечері в США
  // сервер (UTC) уже жив би завтрашнім днем і картка була б порожня.
  const today = billing.localDay(url.searchParams.get('today'));
  const list = words.shuffledFor(user.seed || user.id);
  const base = billing.dayIndexOf(today);

  // Дні перекладаються паралельно (як у POST: не більше WOD_PARALLEL разом, під
  // спільним дедлайном): на холодному кеші це 7 викликів AI, і послідовно
  // людина чекала б 10+ секунд.
  const plan = Array.from({ length: days }, (_, i) => ({ date: billing.addDays(today, i), en: words.wordFor(list, base + i) }));
  const done = await translatePlan(plan, ({ date, en }, deadline) =>
    ai.translateWord(en, lang, native, { ...vars, deadline }).then((w) => ({ date, ...w }))
  );
  if (!done.words.length || !done.results[0]) return wodBusy(res);
  console.log(new Date().toISOString(), 'word-of-day', pairTag(lang, native, vars), done.words.length + 'д');
  return json(res, 200, { words: done.words, ...(done.words.length < plan.length ? { partial: true } : null) });
}

// Скільки днів віддати: 1–14, без числа — 7, як у GET.
function wodDays(v) {
  const n = typeof v === 'number' || (typeof v === 'string' && v.trim()) ? Math.floor(Number(v)) : NaN;
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), 14) : 7;
}

// Скільки слів на день: 1, а в Pro — до 5 (v1.3). Безкоштовний запис, що
// попросив більше, м'яко отримує 1, без 403: застосунок і так покаже
// пейвол сам, а збій перевірки Pro не має лишати людину без слова дня.
// Більше слів просять саме одразу після покупки (пейвол «wod_per_day»), а
// кеш «не Pro» зі старту живе 10 хв — тоді перепитуємо RevenueCat, як
// /me?refresh=1 (не частіше ніж раз на 30 с, див. billing.proStatus).
async function wodPerDay(asked, user) {
  const n = wordplan.perDayOf(asked);
  if (n <= 1) return 1;
  try {
    if ((await billing.proStatus(user)).active) return n;
    return (await billing.proStatus(user, { refresh: true })).active ? n : 1;
  } catch (_) {
    return 1;
  }
}

// Слів у відповіді — не більше 42: 14 днів по 3 або 8 днів по 5. Так запит
// лишається малим, а сповіщення телефона — під межею iOS (64).
const WOD_MAX_WORDS = 42;
// Скільки перекладів AI одночасно: 42 паралельні виклики на холодному кеші —
// це 429 від провайдера. Кеш слів спільний для всіх, тож платимо раз за слово.
const WOD_PARALLEL = 8;

// Спільний дедлайн слова дня. Клієнт чекає 45 с (src/api.js), Cloud Run
// обриває запит на 60 с (DEPLOY.md): краще віддати те, що встигли, ніж
// працювати над відповіддю, якої вже ніхто не чекає. Без нього 42 слова при
// 8 паралельних і 40 с на виклик — це 240 с роботи сервера на запит.
const WOD_DEADLINE_MS = Math.min(envPositiveInt('WOD_DEADLINE_MS', 35000), 40000);

// map з обмеженою паралельністю; порядок результатів — як у list. Після
// deadline нові виклики не починаються (їхні місця лишаються undefined).
async function mapLimit(list, limit, fn, deadline = Infinity) {
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length && Date.now() < deadline) {
      const i = next++;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) }, worker));
  return out;
}

// Переклад плану слів дня (GET і POST однаково). make(елемент, дедлайн) →
// готовий запис або виняток. Невдале слово НЕ віддаємо порожнім: клієнт
// кешує відповідь на тиждень, і порожня картка (англійське слово без
// перекладу й прикладу) висіла б там до наступного оновлення. Відсутнє слово
// він бачить і перепитує, а переклад сервер дістане з кешу слів.
// → { results, words, firstError }: results за порядком плану (null чи
// undefined — слово не вийшло), words — лише готові.
async function translatePlan(plan, make) {
  const deadline = Date.now() + WOD_DEADLINE_MS;
  let firstError = null;
  const results = await mapLimit(
    plan,
    WOD_PARALLEL,
    async (item) => {
      try {
        return await make(item, deadline);
      } catch (e) {
        firstError = firstError || (e && e.message) || String(e);
        return null;
      }
    },
    deadline
  );
  const words = results.filter(Boolean);
  if (words.length < plan.length) {
    console.error(
      new Date().toISOString(),
      `AI ERROR: слово дня, не перекладено ${plan.length - words.length} з ${plan.length}:`,
      firstError || 'не вистачило часу'
    );
  }
  return { results, words, firstError };
}

// Слова на сьогодні немає (або жодного не вийшло): часткова відповідь гірша
// за відмову. Картка, віджет і пуш показують саме сьогоднішнє слово; клієнт
// на 503 лишає старий кеш (src/api.js повертається до GET лише на 404/405) і
// пробує знову за кілька секунд, коли решта слів уже в кеші сервера.
function wodBusy(res) {
  return json(res, 503, { error: 'AI_BUSY' }, { 'Retry-After': '5' });
}

// POST — персональне слово дня: теми й рівень з профілю, без слів, на які
// людина натиснула «Знаю». Профіль приходить у кожному запиті, а не з бази:
// так він працює і без збереження на сервері, і одразу після зміни в
// Параметрах. perDay (Pro, v1.3) — додаткові слова дня (слоти 1…); старий
// клієнт без нього отримує рівно те саме, що й раніше (поле slot не читає).
async function handleWordOfDayPost(req, res, user) {
  if (wodLimited(clientIp(req)) || wodUserLimited(user.id)) return json(res, 429, { error: 'Забагато запитів.' });
  // 500 «Знаю» по ≤ 60 символів — до ~35 КБ; 64 КБ із запасом.
  const body = await readJson(req, 64 * 1024);
  if (!profile.isPlainObject(body)) return json(res, 400, { error: 'BAD_JSON' });
  const perDay = await wodPerDay(body.perDay, user);
  const days = Math.min(wodDays(body.days), Math.floor(WOD_MAX_WORDS / perDay));
  const lang = langOr(body.lang, 'en');
  const native = langOr(body.native, 'uk');
  const vars = variantsOf(body, lang, native);
  // Дати — від локального «сьогодні» клієнта, як у GET.
  const today = billing.localDay(body.today);
  const plan = wordplan.schedule({
    seed: user.seed || user.id,
    profile: profile.forSchedule(body.profile, today),
    known: profile.known(body.known),
    today,
    days,
    perDay,
  });

  // Невдалий переклад не валить решту, але й порожнім не віддається (див.
  // translatePlan): слово просто відсутнє, а клієнт перепитає.
  const done = await translatePlan(plan, async ({ date, slot, en, topic, hint }, deadline) => ({
    date,
    slot,
    ...(await ai.translateWord(en, lang, native, { topic, hint, ...vars, deadline })),
    source: en,
    topic,
  }));
  if (!done.words.length || !done.results[0]) return wodBusy(res);
  const topics = {};
  for (const w of done.words) topics[w.topic] = (topics[w.topic] || 0) + 1;
  const mix = Object.entries(topics).map(([k, n]) => k + '×' + n).join(' ');
  console.log(new Date().toISOString(), 'word-of-day', pairTag(lang, native, vars), days + 'д×' + perDay, mix);
  return json(res, 200, { words: done.words, perDay, ...(done.words.length < plan.length ? { partial: true } : null) });
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

// Apple вимагає відкликати вхід, коли людина видаляє акаунт. Одна повторна
// спроба — лише після тимчасової відмови (мережа, таймаут, 5xx, 429): поганий
// токен чи ключ (400 invalid_grant) повтором не вилікуєш. Найгірший випадок —
// два таймаути по 5 с, а застосунок чекає на DELETE /me 20 с. Нічого не кидає:
// невдача лише в лог, дані стирає викликач у будь-якому разі.
const REVOKE_RETRY_MS = 500;
async function revokeAppleLogin(user) {
  const stamp = () => new Date().toISOString();
  if (!user.appleRefresh) {
    // Запис прив'язаний до Apple ID, а токена немає: вхід був до того, як
    // ключ налаштували, або обмін коду не вдався. Відкликати нічого.
    if (user.appleKey) console.warn(stamp(), 'apple: в акаунта, що видаляється, немає refresh-токена, вхід не відкликано');
    return false;
  }
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      if (await apple.revoke(user.appleRefresh, user.appleClient || apple.AUDIENCES[0])) {
        console.log(stamp(), 'apple: вхід відкликано');
        return true;
      }
      console.warn(stamp(), 'apple: відкликання не налаштоване (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY), вхід не відкликано');
      return false;
    } catch (e) {
      const retry = attempt === 1 && apple.isTransient(e);
      console.error(stamp(), 'apple: відкликання не вдалося' + (retry ? ', повторюю' : '') + ':', e.message);
      if (!retry) return false;
      await new Promise((r) => setTimeout(r, REVOKE_RETRY_MS));
    }
  }
  return false;
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
  // /health і юридичні сторінки: GET, а для перевірок доступності й посилань у
  // App Store Connect ще й HEAD (лише заголовки: Node сам не шле тіло на HEAD).
  // Кінцевий слеш прощаємо: «/privacy/» у формі чи браузері не має давати 404.
  // Лише для цих маршрутів, API лишається з точним збігом.
  if (req.method === 'GET' || req.method === 'HEAD') {
    const page = route.replace(/\/+$/, '');
    if (page === '/health') {
      return json(res, 200, { ok: true, provider: ai.PROVIDER, store: store.MODE, config: configFlags() });
    }
    if (Object.hasOwn(PAGES, page) && PAGES[page]) {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', ...SECURITY_HEADERS, 'Cache-Control': 'public, max-age=3600' });
      return res.end(PAGES[page]);
    }
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
    // { previous } — токен, з яким телефон виходить з акаунта, або carry від
    // DELETE /me: лічильники сканів і проби сцени переходять у новий запис
    // (див. auth.createDevice).
    // Тіло, що не розібралось, — просто без нього: пристрій однаково
    // потрібен, а старі версії застосунку шлють {}.
    const body = await readJson(req, 4 * 1024);
    const out = await auth.createDevice({ previous: profile.isPlainObject(body) ? body.previous : undefined });
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
  // повністю, разом зі словником і зв'язком з Apple ID. Лишаються тільки
  // лічильники сканів у відповіді (carry, без id — див. auth.carryToken): їх
  // застосунок несе в нову ідентичність, тож стирання нового скану не дає.
  if (route === '/me' && req.method === 'DELETE') {
    const carry = auth.carryToken(user);
    // Відкликання Apple — ДО видалення запису: refresh-токен лежить лише в
    // ньому, і стерши запис першим, ми б назавжди втратили змогу відкликати
    // вхід, якщо Apple саме недоступний. Сама відмова видалення не скасовує.
    await revokeAppleLogin(user);
    await auth.deleteUser(user);
    console.log(new Date().toISOString(), 'DELETE /me → ok');
    return json(res, 200, { ok: true, carry });
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
      // Клієнт обірвав завантаження (застосунок у фоні, тунель, людина пішла
      // з екрана): телефони на мобільній мережі роблять це постійно. Це не
      // помилка сервера, і відповідати вже нікому: один короткий рядок без
      // стека й без UNHANDLED, за яким власник налаштовує сповіщення.
      if (e && (e.message === 'aborted' || (e.code === 'ECONNRESET' && req.socket.destroyed))) {
        console.log(new Date().toISOString(), 'client aborted', req.method, req.url.split('?')[0]);
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

// Cloud Run перед зупинкою інстансу (передеплой, зменшення кількості)
// шле SIGTERM і дає ~10 с. Node без обробника обривав би запити, що
// виконуються: скан, який людина вже оплатила своїм єдиним безкоштовним
// сканом, зникав би (лічильник повертається лише в тому ж процесі), а синхронізація й
// відкликання Apple стали б напівзаписаними. Тож: нових з'єднань не
// приймаємо, запити, що виконуються, доробляємо, вільні (keep-alive) з'єднання
// закриваємо, і виходимо одразу, як усе завершилось. Запобіжник на 8 с — під
// межею Cloud Run, щоб довгий скан не дочекався SIGKILL.
const SHUTDOWN_GRACE_MS = 8000;
function drainOnSigterm(server) {
  let stopping = false;
  process.on('SIGTERM', () => {
    if (stopping) return;
    stopping = true;
    console.log(new Date().toISOString(), 'SIGTERM: доробляю запити, що виконуються, і виходжу');
    server.close(() => process.exit(0));
    // close() закриває лише вільні з'єднання на мить виклику; з'єднання, на
    // якому щойно відповіли, стає вільним пізніше
    setInterval(() => server.closeIdleConnections(), 200).unref();
    setTimeout(() => process.exit(0), SHUTDOWN_GRACE_MS).unref();
  });
}

if (require.main === module) {
  const server = createServer();
  drainOnSigterm(server);
  server.listen(PORT, '0.0.0.0', () => {
    console.log('LinguaLens server запущено. Провайдер: ' + ai.PROVIDER);
    // Не зупиняємо старт: поганий старт у Cloud Run — це недоступний сервіс
    // за кілька днів до релізу, а прапорці в /health і рядки в лозі дають
    // змогу побачити пропуск одним запитом.
    for (const line of configWarnings()) console.warn('config: ' + line);
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

module.exports = { createServer, configFlags, configWarnings, ipKey };
