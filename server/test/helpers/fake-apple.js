// Підроблений Apple для тестів: свої ключі RSA (JWKS) і EC (ключ Sign in
// with Apple з .p8), identityToken на замовлення і /auth/token та
// /auth/revoke із записом викликів. Усе через підмінений global.fetch, як у
// billing.test.js; решта запитів (сервер тестів, емулятор) іде в мережу.
const crypto = require('crypto');

const ISSUER = 'https://appleid.apple.com';
const AUDIENCE = 'com.marik.lingualens';

function b64(o) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}

function rsaKey(kid) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}

function signRs256(key, claims, header = {}) {
  const data = b64({ alg: 'RS256', kid: key.kid, ...header }) + '.' + b64(claims);
  return data + '.' + crypto.sign('RSA-SHA256', Buffer.from(data), key.privateKey).toString('base64url');
}

// Ключ «з порталу Apple»: PKCS#8 PEM, як у файлі AuthKey_XXXX.p8.
function appleSigningKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return { publicKey, pem: privateKey.export({ format: 'pem', type: 'pkcs8' }) };
}

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function createFakeApple({ teamId, keyId, signingPublicKey } = {}) {
  const realFetch = global.fetch;
  const apple = {
    keys: [rsaKey('k1')],
    jwksCalls: 0,
    jwksDown: false,
    tokenCalls: [],
    revokeCalls: [],
    tokenFails: false,
    revokeFails: false,
    codes: new Map(),
    rsaKey,
  };

  apple.identityToken = ({ sub, nonce, aud = AUDIENCE, iss = ISSUER, key = apple.keys[0], iatOffset = 0, ttl = 600, header } = {}) => {
    const iat = Math.floor(Date.now() / 1000) + iatOffset;
    return signRs256(key, { iss, aud, sub, nonce, iat, exp: iat + ttl, nonce_supported: true }, header);
  };

  // authorizationCode, який Apple «видав» людині sub
  apple.authorizationCode = (sub) => {
    const code = 'c' + crypto.randomBytes(12).toString('hex');
    apple.codes.set(code, sub);
    return code;
  };

  // client_secret від сервера: ES256 нашим «.p8», підпис r||s (ieee-p1363)
  function clientSecretValid(secret, clientId) {
    if (!signingPublicKey) return false;
    const [h, c, s] = String(secret).split('.');
    const header = JSON.parse(Buffer.from(h, 'base64url'));
    const claims = JSON.parse(Buffer.from(c, 'base64url'));
    const sig = Buffer.from(s, 'base64url');
    const now = Math.floor(Date.now() / 1000);
    return (
      header.alg === 'ES256' &&
      header.kid === keyId &&
      claims.iss === teamId &&
      claims.aud === ISSUER &&
      claims.sub === clientId &&
      claims.exp > now &&
      sig.length === 64 &&
      crypto.verify('sha256', Buffer.from(h + '.' + c), { key: signingPublicKey, dsaEncoding: 'ieee-p1363' }, sig)
    );
  }

  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    if (u === ISSUER + '/auth/keys') {
      apple.jwksCalls++;
      if (apple.jwksDown) throw new TypeError('fetch failed');
      return json(200, { keys: apple.keys.map((k) => k.jwk) });
    }
    if (u === ISSUER + '/auth/token') {
      const form = new URLSearchParams(String(opts.body));
      const call = Object.fromEntries(form);
      call.secretValid = clientSecretValid(form.get('client_secret'), form.get('client_id'));
      apple.tokenCalls.push(call);
      if (apple.tokenFails) return json(400, { error: 'invalid_grant' });
      if (!call.secretValid) return json(400, { error: 'invalid_client' });
      const sub = apple.codes.get(form.get('code'));
      if (!sub || form.get('grant_type') !== 'authorization_code') return json(400, { error: 'invalid_grant' });
      return json(200, {
        access_token: 'at-' + sub,
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'rt-' + form.get('code'),
        id_token: apple.identityToken({ sub, aud: form.get('client_id') }),
      });
    }
    if (u === ISSUER + '/auth/revoke') {
      const form = new URLSearchParams(String(opts.body));
      const call = Object.fromEntries(form);
      call.secretValid = clientSecretValid(form.get('client_secret'), form.get('client_id'));
      apple.revokeCalls.push(call);
      if (apple.revokeFails) return json(500, { error: 'server_error' });
      return new Response('', { status: call.secretValid ? 200 : 400 });
    }
    return realFetch(url, opts);
  };
  apple.restore = () => {
    global.fetch = realFetch;
  };
  return apple;
}

// Повний вхід, як у застосунку: nonce від сервера → «Apple» підписує його
// хеш → identityToken назад на сервер.
function makeSignIn(call, apple) {
  return async function signIn(token, sub, { code, tokenOptions = {}, ip } = {}) {
    const n = await call('POST', '/auth/apple/nonce', { token, ip });
    if (n.status !== 200) return n;
    const identityToken = apple.identityToken({ sub, nonce: n.data.appleNonce, ...tokenOptions });
    return call('POST', '/auth/apple', {
      token,
      ip,
      body: { identityToken, nonce: n.data.nonce, ...(code ? { authorizationCode: code } : {}) },
    });
  };
}

module.exports = { createFakeApple, appleSigningKey, makeSignIn, rsaKey, signRs256, AUDIENCE, ISSUER };
