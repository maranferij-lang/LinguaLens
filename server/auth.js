// Authorization: sign-up, sign-in, session tokens.
// No external dependencies: only the built-in crypto.
//   password -> scrypt (salt + 64 bytes)
//   session  -> our own signed token:  base64url(payload).hmacSHA256
const crypto = require('crypto');
const store = require('./store');

// The secret for signing tokens. In production AUTH_SECRET MUST be set.
const SECRET =
  process.env.AUTH_SECRET ||
  (() => {
    console.warn('auth: AUTH_SECRET не заданий — використовую тимчасовий (сесії злетять при рестарті)');
    return crypto.randomBytes(32).toString('hex');
  })();

const TOKEN_DAYS = 180;

// ---------- passwords ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored) {
  try {
    const [salt, hash] = String(stored).split(':');
    const test = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(test, 'hex'));
  } catch (_) {
    return false;
  }
}

// ---------- tokens ----------
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
    if (
      sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))
    )
      return null;
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

// ---------- users ----------
const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    name: u.name || '',
    avatar: u.avatar || 'wave',
    createdAt: u.createdAt,
  };
}

async function register({ email, password, name }) {
  email = String(email || '').trim().toLowerCase();
  password = String(password || '');
  name = String(name || '').trim().slice(0, 40);

  if (!emailRe.test(email)) return { error: 'INVALID_EMAIL', status: 400 };
  // Eight characters is the minimum at which brute force stops being trivial.
  // Six gave ~2 billion variants; scrypt slows them down, but does not make them
  // impossible after a database leak.
  if (typeof password !== 'string' || password.length < 8) {
    return { error: 'WEAK_PASSWORD', status: 400 };
  }
  if (password.length > 200) return { error: 'WEAK_PASSWORD', status: 400 };

  const exists = await store.findBy('users', 'email', email);
  if (exists) return { error: 'EMAIL_TAKEN', status: 409 };

  const id = crypto.randomUUID();
  const user = {
    id,
    email,
    name: name || email.split('@')[0],
    avatar: 'wave',
    pass: hashPassword(password),
    // the seed defines a word-of-the-day order that is UNIQUE for each user
    seed: crypto.randomBytes(8).toString('hex'),
    createdAt: Date.now(),
  };
  await store.put('users', id, user);
  return { user: publicUser(user), token: makeToken(id) };
}

async function login({ email, password }) {
  email = String(email || '').trim().toLowerCase();
  const user = await store.findBy('users', 'email', email);
  if (!user || !verifyPassword(String(password || ''), user.pass)) {
    return { error: 'BAD_CREDENTIALS', status: 401 };
  }
  return { user: publicUser(user), token: makeToken(user.id) };
}

// Extracts the user from the Authorization: Bearer <token> header
async function userFromRequest(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) return null;
  const payload = verify(token);
  if (!payload) return null;
  const user = await store.get('users', payload.uid);
  return user || null;
}

async function updateProfile(user, patch) {
  const next = { ...user };
  if (typeof patch.name === 'string') next.name = patch.name.trim().slice(0, 40);
  if (typeof patch.avatar === 'string') next.avatar = patch.avatar.slice(0, 20);
  await store.put('users', user.id, next);
  return publicUser(next);
}

module.exports = { register, login, userFromRequest, updateProfile, publicUser, makeToken };
