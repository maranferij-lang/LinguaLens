// Анонімна ідентичність пристрою.
//
// У v1 немає реєстрації: кожна установка тихо отримує запис-користувача з
// випадковим id і підписаний токен. Цього досить для слова дня (свій seed),
// лімітів сканів на сервері й прив'язки підписки RevenueCat. Пароля, пошти
// й імені сервер не знає взагалі — нічого особистого, що могло б витекти.
//
// Токен: base64url(payload).hmacSHA256 — без залежностей, лише crypto.
const crypto = require('crypto');
const store = require('./store');

// Секрет для підпису токенів. У проді ОБОВ'ЯЗКОВО задати AUTH_SECRET.
const SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    console.warn('auth: AUTH_SECRET не заданий — використовую тимчасовий (сесії злетять при рестарті)');
    return crypto.randomBytes(32).toString('hex');
  })();

// Пристрій живе довго; токен лежить у Keychain і переживає перевстановлення.
const TOKEN_DAYS = 3650;

function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  return body + '.' + sig;
}

function verify(token) {
  try {
    const [body, sig] = String(token).split('.');
    if (!body || !sig) return null;
    const expect = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
    if (sig.length !== expect.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))) return null;
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch (_) {
    return null;
  }
}

function makeToken(userId) {
  return sign({ uid: userId, exp: Date.now() + TOKEN_DAYS * 86400000 });
}

function publicUser(u) {
  return { id: u.id, createdAt: u.createdAt };
}

async function createDevice() {
  const user = {
    id: crypto.randomUUID(),
    kind: 'device',
    // seed визначає УНІКАЛЬНИЙ для кожного юзера порядок слів дня
    seed: crypto.randomBytes(8).toString('hex'),
    createdAt: Date.now(),
  };
  await store.put('users', user.id, user);
  return { user: publicUser(user), token: makeToken(user.id) };
}

// Витягує користувача з заголовка Authorization: Bearer <token>
async function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  return (await store.get('users', payload.uid)) || null;
}

// Повне видалення: запис зникає разом із лічильником сканів і статусом Pro.
// Старі токени після цього самі стають недійсними (користувача не знайдено).
async function deleteUser(user) {
  await store.del('users', user.id);
}

module.exports = { createDevice, userFromRequest, deleteUser, publicUser, makeToken, verify };
