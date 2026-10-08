// Мережеві краї сервера: обрив завантаження не є «UNHANDLED», надто велике
// тіло отримує справжню відповідь 413 (а не скидання з'єднання), IPv6-клієнт
// з однієї мережі /64 ділить один ліміт. Справжній HTTP до сервера в цьому ж
// процесі, AI у режимі mock.
const { test, before, after, mock } = require('node:test');
const assert = require('node:assert/strict');
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-hardening-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: '',
});
delete process.env.DEVICE_LIMIT_PER_HOUR;
delete process.env.RATE_PER_MIN;
delete process.env.TRUST_PROXY_HOPS;

const { ipKey } = require('../server');
const store = require('../store');
const { startServer } = require('./helpers/http');

let srv;
let call;
let newDevice;
before(async () => {
  srv = await startServer();
  ({ call, newDevice } = srv);
});
after(async () => {
  await srv.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const port = () => srv.server.address().port;

// Сире з'єднання: сокет і текст відповіді, що встиг прийти.
function raw(request) {
  return new Promise((resolve, reject) => {
    const sock = net.connect(port(), '127.0.0.1', () => sock.write(request));
    let got = '';
    sock.on('data', (d) => {
      got += d;
      if (got.includes('\r\n\r\n')) resolve({ sock, head: got });
    });
    sock.on('error', reject);
    sock.on('close', () => resolve({ sock, head: got }));
  });
}

// ---------- обрив завантаження ----------
test('a client that drops mid-upload is one short log line, not UNHANDLED with a stack', async () => {
  const { token } = await newDevice();
  const errors = mock.method(console, 'error', () => {});
  const logs = mock.method(console, 'log', () => {});
  try {
    const sock = net.connect(port(), '127.0.0.1');
    await new Promise((r) => sock.once('connect', r));
    sock.write(
      'POST /scan HTTP/1.1\r\nhost: x\r\nx-forwarded-for: 198.51.100.77\r\ncontent-type: application/json\r\n' +
        `authorization: Bearer ${token}\r\ncontent-length: 100000\r\n\r\n{"image":"aGk`
    );
    await sleep(60);
    sock.destroy();
    await sleep(200);
    const errorText = errors.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    assert.ok(!errorText.includes('UNHANDLED'), errorText);
    assert.ok(!errorText.includes('aborted'), errorText);
    const logged = logs.mock.calls.map((c) => c.arguments.join(' ')).filter((l) => l.includes('client aborted'));
    assert.equal(logged.length, 1);
    assert.match(logged[0], /POST \/scan/);
    assert.ok(!/\n\s+at /.test(logged[0]), 'без стека');
  } finally {
    errors.mock.restore();
    logs.mock.restore();
  }
  assert.equal((await call('GET', '/health')).status, 200);
});

test('a real exception inside a handler is still UNHANDLED with a stack and a 500', async () => {
  const { token } = await newDevice();
  const errors = mock.method(console, 'error', () => {});
  const real = store.get;
  store.get = async () => {
    throw new Error('Firestore упав');
  };
  try {
    const r = await call('GET', '/me', { token });
    assert.equal(r.status, 500);
    assert.deepEqual(r.data, { error: 'SERVER_ERROR' });
  } finally {
    store.get = real;
    const text = errors.mock.calls.map((c) => c.arguments.join(' ')).join('\n');
    errors.mock.restore();
    assert.match(text, /UNHANDLED/);
    assert.match(text, /Firestore упав/);
  }
});

// ---------- 413 ----------
test('413 for an oversize body whose length is declared: a real answer, not a connection reset', async () => {
  const { token } = await newDevice();
  const r = await call('POST', '/scan', { token, body: JSON.stringify({ image: 'x'.repeat(5 * 1024 * 1024) }) });
  assert.equal(r.status, 413);
  assert.deepEqual(r.data, { error: 'Фото завелике' });
  // інші маршрути: код без людського тексту
  const sync = await call('POST', '/me/profile', { token, body: JSON.stringify({ pad: 'x'.repeat(8 * 1024) }) });
  assert.equal(sync.status, 413);
  assert.deepEqual(sync.data, { error: 'TOO_LARGE' });
  // сервер живий, і той самий токен працює далі
  assert.equal((await call('GET', '/me', { token })).status, 200);
});

test('413 for an oversize body with no declared length (chunked transfer)', async () => {
  const { token } = await newDevice();
  const chunk = Buffer.from('x'.repeat(256 * 1024));
  let sent = 0;
  const body = new ReadableStream({
    pull(c) {
      if (sent >= 6 * 1024 * 1024) return c.close();
      sent += chunk.length;
      c.enqueue(chunk);
    },
  });
  const res = await fetch(`http://127.0.0.1:${port()}/scan`, {
    method: 'POST',
    duplex: 'half',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token, 'x-forwarded-for': '198.51.100.78' },
    body,
  });
  assert.equal(res.status, 413);
  assert.deepEqual(await res.json(), { error: 'Фото завелике' });
  assert.equal((await call('GET', '/health')).status, 200);
});

test('413 comes before the body is read when the declared length is already too big', async () => {
  const { token } = await newDevice();
  const { sock, head } = await raw(
    'POST /scan HTTP/1.1\r\nhost: x\r\nx-forwarded-for: 198.51.100.79\r\ncontent-type: application/json\r\n' +
      `authorization: Bearer ${token}\r\ncontent-length: 104857600\r\n\r\n{"image":"`
  );
  assert.match(head, /^HTTP\/1\.1 413 /);
  sock.destroy();
  // а тіло в межах ліміту, як і раніше, читається до кінця
  assert.equal((await call('POST', '/scan', { token, body: { image: 'aGk=', lang: 'en', nativeLang: 'uk' } })).status, 200);
});

// ---------- IPv6: ліміт на мережу /64 ----------
test('ipKey: IPv4 as is, IPv4-mapped IPv6 as IPv4, IPv6 by its /64, odd forms tolerated', () => {
  assert.equal(ipKey('203.0.113.9'), '203.0.113.9');
  assert.equal(ipKey('203.0.113.9:51234'), '203.0.113.9');
  assert.equal(ipKey('::ffff:203.0.113.9'), '203.0.113.9');
  assert.equal(ipKey('::FFFF:cb00:7109'), '203.0.113.9');
  const net64 = '2001:db8:abcd:12::/64';
  for (const form of [
    '2001:db8:abcd:12::1',
    '2001:db8:abcd:12:0:0:0:19',
    '2001:0DB8:ABCD:0012:ffff:ffff:ffff:ffff',
    '[2001:db8:abcd:12::1]',
    '[2001:db8:abcd:12::1]:443',
    '2001:db8:abcd:12::',
    '2001:db8:abcd:12:aaaa:bbbb:cccc:dddd%eth0',
  ]) {
    assert.equal(ipKey(form), net64, form);
  }
  assert.notEqual(ipKey('2001:db8:abcd:13::1'), net64);
  assert.notEqual(ipKey('2001:db8:abce:12::1'), net64);
  // стиснення посередині: ключ той самий, що й у розгорнутого запису
  assert.equal(ipKey('2001:db8::1:2'), ipKey('2001:db8:0:0:0:0:1:2'));
  assert.equal(ipKey('::1'), '0:0:0:0::/64');
  // не адреса — як є; порожнє — порожнє
  assert.equal(ipKey('unknown'), 'unknown');
  assert.equal(ipKey(''), '');
  assert.equal(ipKey(undefined), '');
  assert.equal(ipKey('1:2:3:4:5:6:7:8:9'), '1:2:3:4:5:6:7:8:9');
});

test('25 addresses inside one /64 share one new-device limit; another /64 has its own', async () => {
  const statuses = [];
  for (let i = 1; i <= 25; i++) {
    const r = await call('POST', '/auth/device', { body: {}, ip: `2001:db8:abcd:12::${i.toString(16)}` });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [...Array(20).fill(200), ...Array(5).fill(429)]);
  assert.equal((await call('POST', '/auth/device', { body: {}, ip: '2001:db8:abcd:13::1' })).status, 200);
  // той самий /64 в іншому записі
  assert.equal((await call('POST', '/auth/device', { body: {}, ip: '2001:DB8:ABCD:12:0:0:0:99' })).status, 429);
  // IPv4 — як і було: 20 і 429
  const v4 = [];
  for (let i = 0; i < 21; i++) v4.push((await call('POST', '/auth/device', { body: {}, ip: '203.0.113.200' })).status);
  assert.deepEqual(v4, [...Array(20).fill(200), 429]);
});

test('behind a proxy only the entry the proxy added counts, and a spoofed first hop does not open a new bucket', async () => {
  const statuses = [];
  for (let i = 1; i <= 22; i++) {
    const r = await call('POST', '/auth/device', {
      body: {},
      headers: { 'x-forwarded-for': `2001:db8:1:${i}::1, 2001:db8:ffff:ffff::${i}` },
    });
    statuses.push(r.status);
  }
  assert.deepEqual(statuses, [...Array(20).fill(200), 429, 429]);
});
