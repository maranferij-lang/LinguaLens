// Налаштування продакшну: попередження при старті (по рядку на кожну відсутню
// змінну, сервер усе одно стартує), булеві прапорці в /health і ліміт нових
// пристроїв із DEVICE_LIMIT_PER_HOUR. Налаштування читаються при завантаженні
// модулів, тому кожен випадок — окремий процес `node server.js` зі своїм
// оточенням (як на Cloud Run).
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('crypto');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-config-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

// Усе, що сервер читає з оточення, явно порожнє: так server/.env (якщо він є
// на машині розробника) нічого не підсуне — він лише доповнює невизначені.
const BLANK = Object.fromEntries(
  [
    'PROVIDER', 'GEMINI_API_KEY', 'ANTHROPIC_API_KEY', 'AUTH_SECRET', 'APP_TOKEN', 'FIRESTORE_PROJECT',
    'FIRESTORE_EMULATOR_HOST', 'REVENUECAT_SECRET_KEY', 'REVENUECAT_WEBHOOK_AUTH', 'REVENUECAT_ENTITLEMENT',
    'SUPPORT_EMAIL', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY', 'APPLE_AUDIENCES', 'RATE_PER_MIN',
    'DEVICE_LIMIT_PER_HOUR', 'FREE_SCANS', 'FREE_SCENES', 'FREE_SCANS_PER_DAY', 'TRUST_PROXY_HOPS', 'DATA_FILE',
  ].map((k) => [k, ''])
);

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

let seq = 0;
// Запускає сервер, чекає останнього рядка старту. stdout і stderr зливаємо в
// один канал (2>&1), щоб порядок рядків був справжній.
async function startServer(env) {
  const port = await freePort();
  const child = spawn('sh', ['-c', 'exec node server.js 2>&1'], {
    cwd: SERVER_DIR,
    env: { PATH: process.env.PATH, ...BLANK, DATA_FILE: path.join(dir, `data-${++seq}.json`), ...env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let out = '';
  const exited = new Promise((r) => child.on('exit', r));
  child.stdout.on('data', (d) => (out += d));
  const deadline = Date.now() + 15000;
  while (!out.includes('/health')) {
    if (child.exitCode !== null) assert.fail('сервер завершився при старті:\n' + out);
    if (Date.now() > deadline) assert.fail('сервер не запустився:\n' + out);
    await new Promise((r) => setTimeout(r, 20));
  }
  const base = `http://127.0.0.1:${port}`;
  return {
    get out() {
      return out;
    },
    // рядки `config: …` без префікса
    get warnings() {
      return out.split('\n').filter((l) => l.startsWith('config: ')).map((l) => l.slice(8));
    },
    async health() {
      const res = await fetch(base + '/health');
      return { status: res.status, data: await res.json() };
    },
    async newDevice(ip = '203.0.113.5') {
      const res = await fetch(base + '/auth/device', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: '{}',
      });
      return res.status;
    },
    async stop() {
      child.kill('SIGTERM');
      await exited;
    },
  };
}

async function withServer(env, fn) {
  const srv = await startServer(env);
  try {
    return await fn(srv);
  } finally {
    await srv.stop();
  }
}

const FLAGS = ['ai', 'authSecret', 'firestore', 'revenuecat', 'webhookAuth', 'supportEmail', 'appleRevoke'];

// Повний набір, як у DEPLOY.md
function fullEnv() {
  const { privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    PROVIDER: 'gemini',
    GEMINI_API_KEY: 'g-key-must-not-leak',
    AUTH_SECRET: crypto.randomBytes(32).toString('hex'),
    FIRESTORE_PROJECT: 'demo-lingualens',
    REVENUECAT_SECRET_KEY: 'sk_must_not_leak',
    REVENUECAT_WEBHOOK_AUTH: 'hook-must-not-leak',
    SUPPORT_EMAIL: 'help@example.com',
    APPLE_TEAM_ID: 'TEAM123456',
    APPLE_KEY_ID: 'KEY1234567',
    APPLE_PRIVATE_KEY: privateKey.export({ format: 'pem', type: 'pkcs8' }).trim().replace(/\n/g, '\\n'),
  };
}

test('production with nothing configured: one warning per missing setting, the server still starts', async () => {
  await withServer({ PROVIDER: 'gemini' }, async (srv) => {
    const lines = srv.warnings;
    assert.equal(lines.length, 7, srv.out);
    for (const name of [
      'GEMINI_API_KEY',
      'AUTH_SECRET',
      'FIRESTORE_PROJECT',
      'REVENUECAT_SECRET_KEY',
      'REVENUECAT_WEBHOOK_AUTH',
      'SUPPORT_EMAIL',
      'APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY',
    ]) {
      assert.equal(lines.filter((l) => l.includes(name)).length, 1, name + '\n' + srv.out);
    }
    // сервер не завершився: /health відповідає, а прапорці чесно кажуть «ні»
    const h = await srv.health();
    assert.equal(h.status, 200);
    assert.equal(h.data.ok, true);
    assert.equal(h.data.provider, 'gemini');
    assert.equal(h.data.store, 'file');
    assert.deepEqual(h.data.config, Object.fromEntries(FLAGS.map((k) => [k, false])));
  });
});

test('fully configured production: no warnings, every /health flag is true, and no value leaks', async () => {
  const env = fullEnv();
  await withServer(env, async (srv) => {
    assert.deepEqual(srv.warnings, [], srv.out);
    const h = await srv.health();
    assert.equal(h.status, 200);
    assert.equal(h.data.store, 'firestore');
    assert.deepEqual(h.data.config, Object.fromEntries(FLAGS.map((k) => [k, true])));
    for (const v of Object.values(h.data.config)) assert.equal(typeof v, 'boolean');
    // булеві прапорці, а не значення: ні в /health, ні в лозі секретів немає
    const dump = JSON.stringify(h.data) + srv.out;
    for (const secret of ['g-key-must-not-leak', env.AUTH_SECRET, 'sk_must_not_leak', 'hook-must-not-leak', 'help@example.com']) {
      assert.equal(dump.includes(secret), false, secret);
    }
  });
});

test('PROVIDER=mock (local development) prints no production warnings, and the AI flag is true', async () => {
  await withServer({ PROVIDER: 'mock' }, async (srv) => {
    assert.deepEqual(srv.warnings, [], srv.out);
    const h = await srv.health();
    assert.equal(h.data.provider, 'mock');
    assert.equal(h.data.config.ai, true);
    assert.equal(h.data.config.authSecret, false);
  });
});

test('the AI key is checked for the chosen provider: anthropic wants ANTHROPIC_API_KEY, anything else Gemini', async () => {
  const rest = fullEnv();
  // anthropic із ключем Gemini: ключа Anthropic немає
  await withServer({ ...rest, PROVIDER: 'anthropic' }, async (srv) => {
    assert.equal(srv.warnings.length, 1, srv.out);
    assert.match(srv.warnings[0], /ANTHROPIC_API_KEY/);
    assert.equal((await srv.health()).data.config.ai, false);
  });
  await withServer({ ...rest, PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'a-key' }, async (srv) => {
    assert.deepEqual(srv.warnings, [], srv.out);
    assert.equal((await srv.health()).data.config.ai, true);
  });
  // gemini без ключа Gemini, але з ключем Anthropic
  await withServer({ ...rest, GEMINI_API_KEY: '', ANTHROPIC_API_KEY: 'a-key' }, async (srv) => {
    assert.equal(srv.warnings.length, 1, srv.out);
    assert.match(srv.warnings[0], /GEMINI_API_KEY/);
  });
});

test('a short AUTH_SECRET is flagged as weak: warning, and authSecret is false', async () => {
  await withServer({ ...fullEnv(), AUTH_SECRET: 'too-short' }, async (srv) => {
    assert.equal(srv.warnings.length, 1, srv.out);
    assert.match(srv.warnings[0], /AUTH_SECRET коротший/);
    assert.equal((await srv.health()).data.config.authSecret, false);
  });
});

test('a partial Sign in with Apple key names exactly what is missing; a broken key is reported too', async () => {
  const env = fullEnv();
  await withServer({ ...env, APPLE_KEY_ID: '', APPLE_PRIVATE_KEY: '' }, async (srv) => {
    const apple = srv.warnings.filter((l) => l.includes('APPLE_'));
    assert.equal(apple.length, 1, srv.out);
    assert.match(apple[0], /APPLE_KEY_ID, APPLE_PRIVATE_KEY/);
    assert.doesNotMatch(apple[0], /APPLE_TEAM_ID/);
    assert.equal((await srv.health()).data.config.appleRevoke, false);
  });
  await withServer({ ...env, APPLE_PRIVATE_KEY: 'не ключ' }, async (srv) => {
    const apple = srv.warnings.filter((l) => l.includes('Sign in with Apple'));
    assert.equal(apple.length, 1, srv.out);
    assert.match(apple[0], /не розібрався/);
    assert.equal((await srv.health()).data.config.appleRevoke, false);
  });
});

// ---------- DEVICE_LIMIT_PER_HOUR ----------
test('DEVICE_LIMIT_PER_HOUR raises or lowers the new-device limit per IP', async () => {
  await withServer({ PROVIDER: 'mock', DEVICE_LIMIT_PER_HOUR: '3' }, async (srv) => {
    const statuses = [];
    for (let i = 0; i < 5; i++) statuses.push(await srv.newDevice('203.0.113.10'));
    assert.deepEqual(statuses, [200, 200, 200, 429, 429]);
    // інша IP має свій ліміт
    assert.equal(await srv.newDevice('203.0.113.11'), 200);
  });
  await withServer({ PROVIDER: 'mock', DEVICE_LIMIT_PER_HOUR: '25' }, async (srv) => {
    let last;
    for (let i = 0; i < 25; i++) last = await srv.newDevice('203.0.113.12');
    assert.equal(last, 200); // старий жорсткий ліміт (20) уже не діє
    assert.equal(await srv.newDevice('203.0.113.12'), 429);
  });
});

test('without DEVICE_LIMIT_PER_HOUR (or with a bad value) the limit stays 20 per hour', async () => {
  for (const value of [undefined, '', 'багато', '0', '-5', '2.5']) {
    await withServer({ PROVIDER: 'mock', ...(value === undefined ? {} : { DEVICE_LIMIT_PER_HOUR: value }) }, async (srv) => {
      let last;
      for (let i = 0; i < 20; i++) last = await srv.newDevice('203.0.113.20');
      assert.equal(last, 200, String(value));
      assert.equal(await srv.newDevice('203.0.113.20'), 429, String(value));
      // зіпсоване значення чути в лозі, порожнє чи відсутнє мовчить
      const warned = srv.out.includes('DEVICE_LIMIT_PER_HOUR');
      assert.equal(warned, value !== undefined && value !== '', String(value));
    });
  }
});
