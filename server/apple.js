// Sign in with Apple: перевірка identityToken і REST Apple для відкликання.
// Без залежностей — RS256/ES256 уміє вбудований crypto.
//
// Що ми беремо від Apple: лише `sub` (стабільний id людини в межах нашої
// команди розробника). Пошту й ім'я не просимо й не зберігаємо.
//
// Двоє обов'язків:
//   1) verifyIdentityToken — підпис ключем із JWKS Apple, iss, aud, exp і
//      nonce, прив'язаний до пристрою (див. auth.appleNonce);
//   2) exchangeCode / revoke — якщо задано ключ Sign in with Apple
//      (APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY): Apple вимагає при
//      видаленні акаунта відкликати токени, а для цього потрібен
//      refresh-токен, який дає лише обмін authorizationCode.
//
// Токени й sub ніколи не пишемо в лог: у помилках лише причина відмови.
const crypto = require('crypto');

const ISSUER = 'https://appleid.apple.com';
const KEYS_URL = ISSUER + '/auth/keys';
const TOKEN_URL = ISSUER + '/auth/token';
const REVOKE_URL = ISSUER + '/auth/revoke';

// Для нативного застосунку aud = bundle id. Кілька значень через кому — на
// випадок, якщо колись з'явиться веб-вхід зі своїм Services ID.
const AUDIENCES = (process.env.APPLE_AUDIENCES || 'com.marik.lingualens')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const TEAM_ID = process.env.APPLE_TEAM_ID || '';
const KEY_ID = process.env.APPLE_KEY_ID || '';

// Годинники сервера й Apple можуть розходитись на секунди.
const LEEWAY_S = 60;
// Apple міняє ключі рідко, а запит за ними на кожен вхід — зайва затримка.
const KEYS_TTL_MS = 6 * 3600 * 1000;
// Невідомий kid — привід перепитати Apple (ключі змінились), але не частіше
// разу на хвилину: інакше підробні токени з випадковими kid робили б із
// нас генератор запитів до Apple.
const REFETCH_MIN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;
const MAX_TOKEN_LENGTH = 8192;

// Вміст .p8-файлу. У змінній середовища переноси рядків часто стають «\n»
// (так його можна вписати одним рядком у server/.env) — повертаємо їх.
// Ключ розбираємо одразу: зіпсоване значення має бути видно в лозі при
// старті, а не через місяць, коли хтось видалить акаунт.
const SIGNING_KEY = (() => {
  const pem = (process.env.APPLE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();
  if (!TEAM_ID || !KEY_ID || !pem) return null;
  try {
    const key = crypto.createPrivateKey(pem);
    if (key.asymmetricKeyType !== 'ec') throw new Error('очікувався EC-ключ (.p8 від Apple)');
    return key;
  } catch (e) {
    console.error('apple: APPLE_PRIVATE_KEY не розібрався, відкликання вимкнене:', e.message);
    return null;
  }
})();

function fail(code, reason) {
  const e = new Error(reason ? code + ': ' + reason : code);
  e.code = code;
  return e;
}

// ---------- JWKS ----------
let keys = new Map();
let keysAt = 0;
let lastFetch = 0;
let lastFetchFailed = false;
let inflight = null;

// Один запит на всіх: десять одночасних входів після рестарту не мають
// робити десять запитів до Apple.
function fetchKeys() {
  if (!inflight) {
    lastFetch = Date.now();
    inflight = (async () => {
      const res = await fetch(KEYS_URL, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
      if (!res.ok) throw new Error('JWKS ' + res.status);
      const body = await res.json();
      const next = new Map();
      for (const jwk of Array.isArray(body?.keys) ? body.keys : []) {
        if (!jwk || jwk.kty !== 'RSA' || typeof jwk.kid !== 'string') continue;
        if ((jwk.alg && jwk.alg !== 'RS256') || (jwk.use && jwk.use !== 'sig')) continue;
        try {
          next.set(jwk.kid, crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' }));
        } catch (_) {}
      }
      if (!next.size) throw new Error('JWKS без RSA-ключів');
      keys = next;
      keysAt = Date.now();
      lastFetchFailed = false;
    })()
      .catch((e) => {
        lastFetchFailed = true;
        console.error('apple: ключі Apple недоступні:', e.message);
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

async function keyFor(kid) {
  if (keys.has(kid) && Date.now() - keysAt < KEYS_TTL_MS) return keys.get(kid);
  // Кеш застарів, порожній, або Apple уже підписує новим ключем.
  if (inflight || Date.now() - lastFetch >= REFETCH_MIN_MS) await fetchKeys();
  // Навіть застарілий ключ досі справжній ключ Apple: якщо Apple зараз
  // недоступний, краще впустити людину з ним, ніж зламати вхід.
  if (keys.has(kid)) return keys.get(kid);
  // Не змогли спитати Apple — не знаємо, чи токен справжній: це 503, а не
  // «поганий токен».
  throw lastFetchFailed ? fail('APPLE_UNAVAILABLE', 'JWKS') : fail('APPLE_INVALID', 'unknown kid');
}

// ---------- identityToken ----------
function decodePart(part) {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

function sameString(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Повертає claims перевіреного токена або кидає помилку з code
// APPLE_INVALID (400) чи APPLE_UNAVAILABLE (503).
async function verifyIdentityToken(token, expectedNonce) {
  const parts = typeof token === 'string' && token.length <= MAX_TOKEN_LENGTH ? token.split('.') : [];
  if (parts.length !== 3) throw fail('APPLE_INVALID', 'format');
  let header;
  let claims;
  try {
    header = decodePart(parts[0]);
    claims = decodePart(parts[1]);
  } catch (_) {
    throw fail('APPLE_INVALID', 'format');
  }
  if (!header || header.alg !== 'RS256' || typeof header.kid !== 'string') throw fail('APPLE_INVALID', 'alg');
  if (!claims || typeof claims !== 'object') throw fail('APPLE_INVALID', 'format');
  // Чужий видавець чи застосунок — відмова ще до запиту ключів Apple.
  if (claims.iss !== ISSUER) throw fail('APPLE_INVALID', 'iss');
  if (typeof claims.aud !== 'string' || !AUDIENCES.includes(claims.aud)) throw fail('APPLE_INVALID', 'aud');

  const key = await keyFor(header.kid);
  const signed = Buffer.from(parts[0] + '.' + parts[1]);
  if (!crypto.verify('RSA-SHA256', signed, key, Buffer.from(parts[2], 'base64url'))) {
    throw fail('APPLE_INVALID', 'signature');
  }

  const now = Math.floor(Date.now() / 1000);
  if (!Number.isFinite(claims.exp) || now > claims.exp + LEEWAY_S) throw fail('APPLE_INVALID', 'expired');
  if (Number.isFinite(claims.iat) && claims.iat > now + LEEWAY_S) throw fail('APPLE_INVALID', 'iat');
  if (typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255) throw fail('APPLE_INVALID', 'sub');
  if (typeof claims.nonce !== 'string' || !sameString(claims.nonce, expectedNonce)) throw fail('APPLE_INVALID', 'nonce');
  return claims;
}

// ---------- REST Apple (обмін коду, відкликання) ----------
function configured() {
  return !!SIGNING_KEY;
}

// client_secret для REST Apple — JWT, підписаний нашим ключем .p8 (ES256).
// Apple дозволяє до шести місяців, але нам він потрібен на один запит.
// JWS для ES256 хоче підпис r||s (64 байти), а не DER — звідси ieee-p1363.
function clientSecret(clientId) {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = enc({ alg: 'ES256', kid: KEY_ID }) + '.' + enc({ iss: TEAM_ID, iat: now, exp: now + 300, aud: ISSUER, sub: clientId });
  const sig = crypto.sign('sha256', Buffer.from(data), { key: SIGNING_KEY, dsaEncoding: 'ieee-p1363' });
  return data + '.' + sig.toString('base64url');
}

async function postForm(url, params) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (res.ok) return res;
  // У тілі помилки Apple — код на кшталт invalid_grant; більше в лог не несемо.
  const err = await res.json().catch(() => null);
  const code = typeof err?.error === 'string' ? ' ' + err.error.replace(/[^a-z_]/g, '').slice(0, 40) : '';
  throw new Error(new URL(url).pathname + ' ' + res.status + code);
}

// authorizationCode → refresh-токен. sub у відповіді Apple має збігтися з
// перевіреним identityToken: інакше хтось міг би підкласти код ЧУЖОГО
// входу, і видалення його акаунта відкликало б вхід іншої людини.
// id_token тут прийшов напряму від Apple через TLS, тож підпис не звіряємо.
async function exchangeCode(code, clientId, sub) {
  if (!configured()) return null;
  const res = await postForm(TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret(clientId),
    code,
    grant_type: 'authorization_code',
  });
  const data = await res.json();
  if (typeof data?.refresh_token !== 'string' || !data.refresh_token) throw new Error('/auth/token без refresh_token');
  let idSub = null;
  try {
    idSub = decodePart(String(data.id_token).split('.')[1]).sub;
  } catch (_) {}
  if (idSub !== sub) throw new Error('/auth/token: код від іншого входу');
  return data.refresh_token;
}

// true — відкликали; false — відкликання не налаштоване.
async function revoke(refreshToken, clientId) {
  if (!configured()) return false;
  await postForm(REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret(clientId),
    token: refreshToken,
    token_type_hint: 'refresh_token',
  });
  return true;
}

module.exports = { AUDIENCES, verifyIdentityToken, configured, exchangeCode, revoke };
