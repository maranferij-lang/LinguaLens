// Sign in with Apple: справжній HTTP, підроблений Apple (свої ключі й JWKS
// через global.fetch), відкликання налаштоване. Окремий процес, бо ключі
// Apple читаються при завантаженні модуля.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createFakeApple, appleSigningKey, makeSignIn } = require('./helpers/fake-apple');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-apple-'));
const signing = appleSigningKey();
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  APPLE_TEAM_ID: 'TEAM123456',
  APPLE_KEY_ID: 'KEY1234567',
  // одним рядком, як у server/.env: переноси — літерали \n
  APPLE_PRIVATE_KEY: signing.pem.trim().replace(/\n/g, '\\n'),
});
const apple = createFakeApple({ teamId: 'TEAM123456', keyId: 'KEY1234567', signingPublicKey: signing.publicKey });
const { startServer, withClock } = require('./helpers/http');
const store = require('../store');
const auth = require('../auth');

let srv;
let call;
let newDevice;
let signIn;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
  signIn = makeSignIn(call, apple);
});
after(async () => {
  await srv.close();
  apple.restore();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sub = () => '001234.' + crypto.randomBytes(16).toString('hex') + '.1234';

test('the nonce endpoint needs a device and returns a nonce with its SHA-256', async () => {
  assert.equal((await call('POST', '/auth/apple/nonce')).status, 401);
  const { token } = await newDevice();
  const r = await call('POST', '/auth/apple/nonce', { token });
  assert.equal(r.status, 200);
  assert.equal(r.data.appleNonce, crypto.createHash('sha256').update(r.data.nonce).digest('hex'));
  // nonce підписаний тим самим секретом, але як токен пристрою не годиться
  assert.equal((await call('GET', '/me', { token: r.data.nonce })).status, 401);
});

test('a new Apple ID is linked to the calling device', async () => {
  const device = await newDevice();
  assert.equal(device.user.apple, false);
  assert.equal((await call('GET', '/me', { token: device.token })).data.user.apple, false);
  const s = sub();
  const r = await signIn(device.token, s, { code: apple.authorizationCode(s) });
  assert.equal(r.status, 200);
  assert.equal(r.data.switched, false);
  assert.deepEqual(r.data.user, { id: device.user.id, createdAt: device.user.createdAt, apple: true });
  assert.ok(r.data.token);

  // і новий, і старий токен — того самого пристрою
  for (const token of [r.data.token, device.token]) {
    const me = await call('GET', '/me', { token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.apple, true);
    assert.equal(me.data.user.id, device.user.id);
  }

  // зв'язок лежить під HMAC від sub; сирого sub немає ніде в записах
  const mapping = await store.get('appleAccounts', auth.appleKey(s));
  assert.equal(mapping.userId, device.user.id);
  const user = await store.get('users', device.user.id);
  assert.ok(!JSON.stringify(user).includes(s));
  assert.ok(!JSON.stringify(mapping).includes(s));

  // код обміняли на refresh-токен з правильним client_secret (ES256)
  const exchange = apple.tokenCalls.at(-1);
  assert.equal(exchange.secretValid, true);
  assert.equal(exchange.client_id, 'com.marik.lingualens');
  assert.equal(exchange.grant_type, 'authorization_code');
  assert.match(user.appleRefresh, /^rt-c/);
  assert.equal(user.appleClient, 'com.marik.lingualens');
});

test('signing in again with the same Apple ID is idempotent', async () => {
  const device = await newDevice();
  const s = sub();
  const first = await signIn(device.token, s);
  const again = await signIn(device.token, s);
  assert.equal(again.status, 200);
  assert.equal(again.data.switched, false);
  assert.equal(again.data.user.id, first.data.user.id);
  assert.equal((await store.get('appleAccounts', auth.appleKey(s))).userId, device.user.id);
});

test('a second device switches into the existing account and its anonymous record is deleted', async () => {
  const a = await newDevice();
  const b = await newDevice();
  const s = sub();
  assert.equal((await signIn(a.token, s)).data.switched, false);

  const r = await signIn(b.token, s);
  assert.equal(r.status, 200);
  assert.equal(r.data.switched, true);
  assert.equal(r.data.user.id, a.user.id);
  assert.equal(r.data.user.apple, true);

  const me = await call('GET', '/me', { token: r.data.token });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.id, a.user.id);
  // осиротілий анонімний запис B стерто, його старий токен більше не діє
  assert.equal(await store.get('users', b.user.id), null);
  assert.equal((await call('GET', '/me', { token: b.token })).status, 401);
  // а пристрій A нічого не помітив
  assert.equal((await call('GET', '/me', { token: a.token })).status, 200);
});

test('two devices signing in with the same Apple ID at once end up in ONE account', async () => {
  const a = await newDevice();
  const b = await newDevice();
  const s = sub();
  const key = auth.appleKey(s);
  // Обидва спершу бачать «зв'язку ще немає» — саме тоді й буває гонка.
  const get = store.get;
  let waiting = [];
  const releaseAll = () => {
    if (!waiting) return;
    waiting.forEach((f) => f());
    waiting = null;
  };
  const safety = setTimeout(releaseAll, 3000); // щоб зламаний код не завис, а впав
  store.get = async (coll, id) => {
    const out = await get(coll, id);
    if (coll === 'appleAccounts' && id === key && waiting) {
      await new Promise((r) => {
        waiting.push(r);
        if (waiting.length === 2) releaseAll();
      });
    }
    return out;
  };
  let results;
  try {
    results = await Promise.all([signIn(a.token, s), signIn(b.token, s)]);
  } finally {
    store.get = get;
    clearTimeout(safety);
  }
  assert.deepEqual(results.map((r) => r.status), [200, 200]);
  const ids = new Set(results.map((r) => r.data.user.id));
  assert.equal(ids.size, 1);
  assert.deepEqual(results.map((r) => r.data.switched).sort(), [false, true]);
  const [winner] = ids;
  assert.equal((await store.get('appleAccounts', key)).userId, winner);
  const loser = winner === a.user.id ? b : a;
  assert.equal(await store.get('users', loser.user.id), null);
  assert.equal((await store.get('users', winner)).apple, true);
});

test('a device already linked to one Apple ID gets a separate account for another', async () => {
  const device = await newDevice();
  const first = sub();
  await signIn(device.token, first);
  const second = sub();
  const r = await signIn(device.token, second);
  assert.equal(r.status, 200);
  assert.equal(r.data.switched, true);
  assert.notEqual(r.data.user.id, device.user.id);
  assert.equal((await store.get('appleAccounts', auth.appleKey(second))).userId, r.data.user.id);
  // перший акаунт цілий і досі прив'язаний
  assert.equal((await store.get('appleAccounts', auth.appleKey(first))).userId, device.user.id);
  assert.equal((await call('GET', '/me', { token: device.token })).data.user.apple, true);
});

test('a stale Apple mark without a live link does not count as linked elsewhere', async () => {
  const device = await newDevice();
  const first = sub();
  await signIn(device.token, first);
  // вхід обірвався між позначкою і зв'язком — зв'язку немає
  await store.del('appleAccounts', auth.appleKey(first));
  const second = sub();
  const r = await signIn(device.token, second);
  assert.equal(r.status, 200);
  assert.equal(r.data.switched, false);
  assert.equal(r.data.user.id, device.user.id);
  assert.equal((await store.get('users', device.user.id)).appleKey, auth.appleKey(second));
});

test('a link left over from a deleted account is taken over by the next sign-in', async () => {
  const old = await newDevice();
  const s = sub();
  await signIn(old.token, s);
  // запис зник, а зв'язок лишився (напр., відновлення бази з різних копій)
  await store.del('users', old.user.id);
  const fresh = await newDevice();
  const r = await signIn(fresh.token, s);
  assert.equal(r.status, 200);
  assert.equal(r.data.switched, false);
  assert.equal(r.data.user.id, fresh.user.id);
  assert.equal((await store.get('appleAccounts', auth.appleKey(s))).userId, fresh.user.id);
});

test('wrong audience, issuer, expired token, bad signature and other algorithms are rejected with 400', async () => {
  const { token } = await newDevice();
  const s = sub();
  const forged = apple.rsaKey('k1'); // той самий kid, але не ключ Apple
  const cases = [
    { aud: 'com.evil.app' },
    { iss: 'https://evil.example.com' },
    { ttl: -120 }, // exp дві хвилини тому — поза 60 с запасу
    { iatOffset: 600 }, // видано «в майбутньому»
    { key: forged },
    { header: { alg: 'HS256' } },
  ];
  for (const tokenOptions of cases) {
    const r = await signIn(token, s, { tokenOptions });
    assert.equal(r.status, 400, JSON.stringify(Object.keys(tokenOptions)));
    assert.equal(r.data.error, 'APPLE_INVALID');
  }
  // у межах 60 с запасу на розбіжність годинників — ще дійсний
  assert.equal((await signIn(token, s, { tokenOptions: { ttl: -30 } })).status, 200);
});

test('garbage input answers 400 APPLE_INVALID, never 401', async () => {
  const { token } = await newDevice();
  const n = (await call('POST', '/auth/apple/nonce', { token })).data;
  for (const body of [{}, { nonce: n.nonce }, { nonce: n.nonce, identityToken: 'a.b.c' }, { nonce: n.nonce, identityToken: 42 }, '{oops']) {
    const r = await call('POST', '/auth/apple', { token, body });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'APPLE_INVALID');
  }
});

test('nonce mismatch, a nonce of another device, a tampered or expired nonce are rejected', async () => {
  const a = await newDevice();
  const b = await newDevice();
  const s = sub();
  const na = (await call('POST', '/auth/apple/nonce', { token: a.token })).data;
  const nb = (await call('POST', '/auth/apple/nonce', { token: b.token })).data;

  // Apple підписав хеш одного nonce, а на сервер прийшов інший
  let r = await call('POST', '/auth/apple', {
    token: a.token,
    body: { identityToken: apple.identityToken({ sub: s, nonce: nb.appleNonce }), nonce: na.nonce },
  });
  assert.equal(r.status, 400);

  // перехоплений вхід пристрою B (токен + nonce) з пристрою A не працює
  r = await call('POST', '/auth/apple', {
    token: a.token,
    body: { identityToken: apple.identityToken({ sub: s, nonce: nb.appleNonce }), nonce: nb.nonce },
  });
  assert.equal(r.status, 400);

  // підправлений nonce (свій uid у тілі, старий підпис)
  const [body, sig] = na.nonce.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url'));
  const tampered = Buffer.from(JSON.stringify({ ...payload, exp: payload.exp + 1 })).toString('base64url') + '.' + sig;
  r = await call('POST', '/auth/apple', {
    token: a.token,
    body: { identityToken: apple.identityToken({ sub: s, nonce: crypto.createHash('sha256').update(tampered).digest('hex') }), nonce: tampered },
  });
  assert.equal(r.status, 400);

  // nonce живе 10 хвилин
  r = await withClock(11 * 60 * 1000, () =>
    call('POST', '/auth/apple', {
      token: a.token,
      body: { identityToken: apple.identityToken({ sub: s, nonce: na.appleNonce }), nonce: na.nonce },
    })
  );
  assert.equal(r.status, 400);
  assert.equal(await store.get('appleAccounts', auth.appleKey(s)), null);

  // а в межах строку той самий nonce працює
  r = await call('POST', '/auth/apple', {
    token: a.token,
    body: { identityToken: apple.identityToken({ sub: s, nonce: na.appleNonce }), nonce: na.nonce },
  });
  assert.equal(r.status, 200);
});

test('an unknown kid refetches the JWKS once, and not more often than once a minute', async () => {
  const { token } = await newDevice();
  const rotated = apple.rsaKey('k2');
  apple.keys.push(rotated);
  await withClock(2 * 60 * 1000, async () => {
    const before = apple.jwksCalls;
    const ok = await signIn(token, sub(), { tokenOptions: { key: rotated } });
    assert.equal(ok.status, 200);
    assert.equal(apple.jwksCalls, before + 1);

    // невідомий kid одразу після запиту — Apple не перепитуємо
    const stranger = apple.rsaKey('k-unknown');
    for (let i = 0; i < 3; i++) {
      const r = await signIn(token, sub(), { tokenOptions: { key: stranger } });
      assert.equal(r.status, 400);
    }
    assert.equal(apple.jwksCalls, before + 1);
  });
});

test('JWKS unreachable: 503 for an unknown key, stale cached keys keep working', async () => {
  const { token } = await newDevice();
  apple.jwksDown = true;
  try {
    await withClock(4 * 60 * 1000, async () => {
      const r = await signIn(token, sub(), { tokenOptions: { key: apple.rsaKey('k-new') } });
      assert.equal(r.status, 503);
      assert.equal(r.data.error, 'APPLE_UNAVAILABLE');
    });
    // кеш застарів (> 6 год), Apple мовчить — відомий ключ досі приймаємо
    await withClock(7 * 3600 * 1000, async () => {
      const r = await signIn(token, sub());
      assert.equal(r.status, 200);
    });
  } finally {
    apple.jwksDown = false;
  }
});

test('a failed code exchange does not fail the sign-in; a code of another Apple user is not stored', async () => {
  const s = sub();
  const a = await newDevice();
  apple.tokenFails = true;
  try {
    const r = await signIn(a.token, s, { code: apple.authorizationCode(s) });
    assert.equal(r.status, 200);
  } finally {
    apple.tokenFails = false;
  }
  assert.equal((await store.get('users', a.user.id)).appleRefresh, undefined);

  const b = await newDevice();
  const r = await signIn(b.token, sub(), { code: apple.authorizationCode(sub()) });
  assert.equal(r.status, 200);
  assert.equal((await store.get('users', b.user.id)).appleRefresh, undefined);
});

test('DELETE /me removes the dictionary and the Apple link and revokes the Apple token', async () => {
  const device = await newDevice();
  const s = sub();
  await signIn(device.token, s, { code: apple.authorizationCode(s) });
  const sync = await call('POST', '/sync', {
    token: device.token,
    body: { since: 0, words: [{ id: 'w1', updatedAt: Date.now(), word: 'mug' }] },
  });
  assert.equal(sync.status, 200);
  assert.ok(await store.get('dicts', device.user.id));
  const refresh = (await store.get('users', device.user.id)).appleRefresh;

  const before = apple.revokeCalls.length;
  assert.equal((await call('DELETE', '/me', { token: device.token })).status, 200);
  assert.equal(await store.get('users', device.user.id), null);
  assert.equal(await store.get('dicts', device.user.id), null);
  assert.equal(await store.get('appleAccounts', auth.appleKey(s)), null);
  assert.equal(apple.revokeCalls.length, before + 1);
  const revoke = apple.revokeCalls.at(-1);
  assert.equal(revoke.token, refresh);
  assert.equal(revoke.token_type_hint, 'refresh_token');
  assert.equal(revoke.client_id, 'com.marik.lingualens');
  assert.equal(revoke.secretValid, true);

  // той самий Apple ID після видалення — новий порожній акаунт
  const next = await newDevice();
  const again = await signIn(next.token, s);
  assert.equal(again.data.switched, false);
  assert.equal(again.data.user.id, next.user.id);
});

test('DELETE /me still succeeds when Apple revocation fails', async () => {
  const device = await newDevice();
  const s = sub();
  await signIn(device.token, s, { code: apple.authorizationCode(s) });
  apple.revokeFails = true;
  const before = apple.revokeCalls.length;
  try {
    assert.equal((await call('DELETE', '/me', { token: device.token })).status, 200);
  } finally {
    apple.revokeFails = false;
  }
  assert.equal(apple.revokeCalls.length, before + 1);
  assert.equal(await store.get('users', device.user.id), null);
  assert.equal(await store.get('appleAccounts', auth.appleKey(s)), null);
});

test('DELETE /me never removes an Apple link that already points to another account', async () => {
  const a = await newDevice();
  const s = sub();
  await signIn(a.token, s);
  // зв'язок уже веде до іншого акаунта — стирання A його не чіпає
  await store.update('appleAccounts', auth.appleKey(s), { userId: 'someone-else' });
  assert.equal((await call('DELETE', '/me', { token: a.token })).status, 200);
  assert.equal((await store.get('appleAccounts', auth.appleKey(s))).userId, 'someone-else');
});

test('sign-in endpoints are rate limited per IP', async () => {
  const { token } = await newDevice();
  const statuses = [];
  for (let i = 0; i < 32; i++) {
    statuses.push((await call('POST', '/auth/apple/nonce', { token, ip: '203.0.113.77' })).status);
  }
  assert.equal(statuses.slice(0, 30).every((s) => s === 200), true);
  assert.deepEqual(statuses.slice(30), [429, 429]);
  const r = await call('POST', '/auth/apple', { token, ip: '203.0.113.77', body: {} });
  assert.equal(r.status, 429);
});
