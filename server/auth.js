// Анонімна ідентичність пристрою і (з v1.1) необов'язковий вхід через Apple.
//
// Реєстрації немає: кожна установка тихо отримує запис-користувача з
// випадковим id і підписаний токен. Цього досить для слова дня (свій seed),
// лімітів сканів на сервері й прив'язки підписки RevenueCat. Пароля, пошти
// й імені сервер не знає взагалі — нічого особистого, що могло б витекти.
//
// Sign in with Apple лише прив'язує такий запис до Apple ID, щоб словник
// жив на кількох телефонах. Від Apple ми беремо тільки стабільний `sub` і
// зберігаємо не його, а HMAC від нього (див. appleKey).
//
// Токен: base64url(payload).hmacSHA256 — без залежностей, лише crypto.
const crypto = require('crypto');
const store = require('./store');
const sync = require('./sync');

// Секрет для підпису токенів. У проді ОБОВ'ЯЗКОВО задати AUTH_SECRET.
const SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    console.warn('auth: AUTH_SECRET не заданий — використовую тимчасовий (сесії злетять при рестарті)');
    return crypto.randomBytes(32).toString('hex');
  })();

// Пристрій живе довго; токен лежить у Keychain і переживає перевстановлення.
const TOKEN_DAYS = 3650;
// Між «дай nonce» і відповіддю Apple людина дивиться на системний аркуш
// входу. Десяти хвилин досить і на Face ID, і на введення пароля Apple ID.
const NONCE_MS = 10 * 60 * 1000;

const USERS = 'users';
// appleAccounts/<HMAC(sub)> = { userId } — єдине місце, яке каже, чий це Apple ID.
const APPLE = 'appleAccounts';

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
  return { id: u.id, createdAt: u.createdAt, apple: !!u.apple };
}

async function createUser(fields = {}) {
  const user = {
    id: crypto.randomUUID(),
    kind: 'device',
    // seed визначає УНІКАЛЬНИЙ для кожного юзера порядок слів дня
    seed: crypto.randomBytes(8).toString('hex'),
    createdAt: Date.now(),
    ...fields,
  };
  await store.put(USERS, user.id, user);
  return user;
}

async function createDevice() {
  const user = await createUser();
  return { user: publicUser(user), token: makeToken(user.id) };
}

// Витягує користувача з заголовка Authorization: Bearer <token>.
// Підписане тим самим секретом, але з purpose (nonce для Apple) — не
// токен пристрою, і в ролі токена не годиться.
async function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const payload = verify(token);
  if (!payload || payload.purpose || typeof payload.uid !== 'string') return null;
  return (await store.get(USERS, payload.uid)) || null;
}

// ---------- Sign in with Apple ----------
function sha256hex(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex');
}

// Ключ документа зв'язку. Сирий sub Apple ніде не зберігаємо: витік бази
// не скаже, які Apple ID у нас є, а без AUTH_SECRET зв'язок не підробити.
// Префікс розводить цей HMAC з підписами токенів на тому самому секреті.
function appleKey(sub) {
  return crypto.createHmac('sha256', SECRET).update('apple-sub|' + sub).digest('hex');
}

// Nonce без стану на сервері: підписаний токен «для входу через Apple цього
// пристрою, до такого часу». Апка віддає Apple його SHA-256, Apple вшиває
// хеш у identityToken, а ми звіряємо обидва. Так перехоплений identityToken
// не годиться ні з іншого пристрою, ні через десять хвилин.
function appleNonce(uid) {
  const nonce = sign({ uid, purpose: 'apple', exp: Date.now() + NONCE_MS, r: crypto.randomBytes(16).toString('hex') });
  return { nonce, appleNonce: sha256hex(nonce) };
}

function appleNonceValid(nonce, uid) {
  if (typeof nonce !== 'string' || nonce.length > 512) return false;
  const p = verify(nonce);
  return !!p && p.purpose === 'apple' && p.uid === uid;
}

// Стерти запис користувача. Словника в нього немає: синхронізація вимагає
// зв'язку з Apple, а він вказує на інший акаунт (див. linkApple).
async function dropUser(user) {
  await store.del(USERS, user.id);
}

// Прив'язує Apple ID (уже перевірений apple.verifyIdentityToken) до акаунта.
//   { account, switched: false } — цей пристрій і є акаунтом Apple ID;
//   { account, switched: true }  — Apple ID уже має акаунт: пристрій
//                                  переходить у нього, а свій анонімний
//                                  запис стирає;
//   { gone: true }               — пристрій стерто посеред входу;
//   { busy: true }               — забагато одночасних спроб.
//
// Зв'язок створюється умовно (store.create): два телефони, що входять
// одночасно з тим самим Apple ID, не можуть обидва стати «першим» —
// програвший перечитує зв'язок і переходить в акаунт переможця.
// Позначку apple ставимо ДО зв'язку: щойно зв'язок з'явився, інший
// телефон може перейти в цей акаунт і одразу синхронізуватись.
async function linkApple(caller, sub) {
  const key = appleKey(sub);
  // Пристрій уже прив'язаний до ІНШОГО Apple ID — його не переписуємо і не
  // стираємо: цей вхід веде людину в окремий, новий акаунт. Стара позначка
  // без живого зв'язку (вхід обірвався посередині) не рахується.
  const callerFree = !caller.appleKey || caller.appleKey === key || !(await isLinked(caller));
  let fresh = null;
  for (let attempt = 0; attempt < 6; attempt++) {
    const mapping = await store.get(APPLE, key);
    if (mapping) {
      const mine = mapping.userId === caller.id ? caller : fresh && mapping.userId === fresh.id ? fresh : null;
      if (mine) {
        if (!(await markApple(mine, key))) return { gone: true };
        return { account: mine, switched: mine !== caller };
      }
      const owner = await store.get(USERS, mapping.userId);
      if (owner) {
        if (fresh) await dropUser(fresh);
        if (callerFree) await dropUser(caller);
        return { account: owner, switched: true };
      }
      // Зв'язок лишився від стертого акаунта — займаємо його (нижче, умовно).
    }
    const account = callerFree ? caller : (fresh = fresh || (await createUser({ apple: true, appleKey: key })));
    if (!(await markApple(account, key))) return { gone: true };
    const doc = { userId: account.id, linkedAt: Date.now() };
    const r = mapping
      ? await store.update(APPLE, key, doc, { version: mapping.__version })
      : await store.create(APPLE, key, doc);
    if (r.ok) return { account, switched: account !== caller };
    // Хтось устиг раніше — перечитуємо зв'язок і вирішуємо знову.
  }
  if (fresh) await dropUser(fresh);
  return { busy: true };
}

// false — запис уже стерто (паралельний DELETE /me).
async function markApple(user, key) {
  if (user.apple && user.appleKey === key) return true;
  const r = await store.update(USERS, user.id, { apple: true, appleKey: key });
  if (!r.ok) return false;
  user.apple = true;
  user.appleKey = key;
  return true;
}

// Синхронізувати словник можна лише акаунту, на який зараз указує зв'язок
// Apple ID. Позначки apple у записі мало: вона ставиться до зв'язку, і
// програвший у гонці входу якусь мить теж її має.
async function isLinked(user) {
  if (!user.apple || typeof user.appleKey !== 'string') return false;
  const mapping = await store.get(APPLE, user.appleKey);
  return !!mapping && mapping.userId === user.id;
}

// Refresh-токен Apple потрібен лише для відкликання при видаленні акаунта.
async function saveAppleRefresh(userId, refresh, clientId) {
  return store.update(USERS, userId, { appleRefresh: refresh, appleClient: clientId });
}

// Повне видалення: запис зникає разом із лічильником сканів, статусом Pro,
// словником і зв'язком з Apple ID. Старі токени після цього самі стають
// недійсними (користувача не знайдено).
//
// Порядок важливий. Зв'язок — першим: поки він є, інший телефон міг би
// перейти в акаунт, який ми саме стираємо. Чужий зв'язок не чіпаємо (Apple ID
// міг уже перейти до іншого акаунта). Словник стираємо і до, і після
// запису: синхронізація, що саме зараз писала, могла встигнути між ними.
async function deleteUser(user) {
  if (typeof user.appleKey === 'string') {
    const mapping = await store.get(APPLE, user.appleKey);
    if (mapping && mapping.userId === user.id) await store.del(APPLE, user.appleKey);
  }
  await sync.deleteDict(user.id);
  await store.del(USERS, user.id);
  await sync.deleteDict(user.id);
}

module.exports = {
  createDevice,
  userFromRequest,
  deleteUser,
  publicUser,
  makeToken,
  verify,
  sha256hex,
  appleKey,
  appleNonce,
  appleNonceValid,
  linkApple,
  isLinked,
  saveAppleRefresh,
};
