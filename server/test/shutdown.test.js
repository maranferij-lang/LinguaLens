// SIGTERM (Cloud Run перед зупинкою інстансу): скан, що виконується, доробляється
// й отримує відповідь, нові з'єднання не приймаються, вільний сервер виходить
// одразу, а затяжний запит не переживає запобіжник 8 с. Окремий процес
// `node -r slow-ai server.js`, як на Cloud Run.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const SERVER_DIR = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-shutdown-'));
after(() => fs.rmSync(dir, { recursive: true, force: true }));

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
async function start(slowMs) {
  const port = await freePort();
  const child = spawn('sh', ['-c', 'exec node -r ./test/helpers/slow-ai.js server.js 2>&1'], {
    cwd: SERVER_DIR,
    env: {
      PATH: process.env.PATH,
      PROVIDER: 'gemini',
      GEMINI_API_KEY: 'g-test',
      AUTH_SECRET: 'x'.repeat(40),
      APP_TOKEN: '',
      FIRESTORE_PROJECT: '',
      REVENUECAT_SECRET_KEY: '',
      FREE_SCANS: '5',
      SLOW_AI_MS: String(slowMs),
      DATA_FILE: path.join(dir, `data-${++seq}.json`),
      PORT: String(port),
    },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let out = '';
  child.stdout.on('data', (d) => (out += d));
  const exited = new Promise((r) => child.on('exit', (code, signal) => r({ code, signal, at: Date.now() })));
  const deadline = Date.now() + 15000;
  while (!out.includes('/health')) {
    if (child.exitCode !== null) assert.fail('сервер завершився при старті:\n' + out);
    if (Date.now() > deadline) assert.fail('сервер не запустився:\n' + out);
    await new Promise((r) => setTimeout(r, 20));
  }
  const base = `http://127.0.0.1:${port}`;
  const token = (await (await fetch(base + '/auth/device', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })).json()).token;
  return {
    base,
    token,
    exited,
    kill: () => child.kill('SIGTERM'),
    stop: () => child.kill('SIGKILL'),
    get out() {
      return out;
    },
    scan: () =>
      fetch(base + '/scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify({ image: 'aGk=', lang: 'en', nativeLang: 'uk' }),
      }),
  };
}

test('SIGTERM during a scan: the scan is finished and answered with 200, new connections are refused, then the process exits 0', async () => {
  const srv = await start(1500);
  try {
    const scan = srv.scan();
    await new Promise((r) => setTimeout(r, 400));
    const t0 = Date.now();
    srv.kill();
    await new Promise((r) => setTimeout(r, 150));
    await assert.rejects(() => fetch(srv.base + '/health'), /fetch failed/, 'нові зєднання не приймаються');

    const res = await scan;
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.translation, 'кружка');
    assert.equal(data.usage.scans, 1);

    const exit = await srv.exited;
    assert.equal(exit.code, 0);
    assert.ok(exit.at - t0 >= 900, 'чекав на скан: ' + (exit.at - t0));
    assert.ok(exit.at - t0 < 4000, 'але не довше: ' + (exit.at - t0));
    assert.match(srv.out, /SIGTERM/);
  } finally {
    srv.stop();
  }
});

test('an idle server exits at once on SIGTERM, even with a keep-alive connection open', async () => {
  const srv = await start(100);
  try {
    // з'єднання keep-alive лишається відкритим після відповіді
    assert.equal((await fetch(srv.base + '/health')).status, 200);
    const t0 = Date.now();
    srv.kill();
    const exit = await srv.exited;
    assert.equal(exit.code, 0);
    assert.ok(exit.at - t0 < 1500, 'вийшов за ' + (exit.at - t0) + ' мс');
  } finally {
    srv.stop();
  }
});

test('a request that outlives the grace period is cut at 8 s, under the Cloud Run limit', async () => {
  const srv = await start(30000);
  try {
    const scan = srv.scan().catch((e) => e);
    await new Promise((r) => setTimeout(r, 300));
    const t0 = Date.now();
    srv.kill();
    const exit = await srv.exited;
    assert.equal(exit.code, 0);
    const took = exit.at - t0;
    assert.ok(took >= 7500 && took < 9500, 'запобіжник 8 с: ' + took);
    assert.ok((await scan) instanceof Error, 'клієнт отримав обрив, а не зависання');
  } finally {
    srv.stop();
  }
});
