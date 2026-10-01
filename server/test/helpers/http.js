// Справжній HTTP до сервера в тому самому процесі. Кожен запит — зі своєї
// IP (X-Forwarded-For), щоб ліміти частоти не заважали тестам, які їх не
// перевіряють; ті, що перевіряють, передають ip явно.
const assert = require('node:assert/strict');

let ipSeq = 0;
function nextIp() {
  ipSeq++;
  return `198.18.${Math.floor(ipSeq / 250) % 250}.${(ipSeq % 250) + 1}`;
}

async function startServer() {
  const { createServer } = require('../../server');
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  async function call(method, route, { token, body, ip, headers = {}, signal } = {}) {
    const res = await fetch(base + route, {
      method,
      signal,
      headers: {
        'content-type': 'application/json',
        'x-forwarded-for': ip || nextIp(),
        ...(token ? { authorization: 'Bearer ' + token } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (_) {}
    return { status: res.status, data, headers: res.headers };
  }

  async function newDevice() {
    const r = await call('POST', '/auth/device', { body: {} });
    assert.equal(r.status, 200);
    return r.data;
  }

  return { server, base, call, newDevice, close: () => new Promise((r) => server.close(r)) };
}

// Зсув годинника для перевірок часу (TTL кешу, строк дії токенів). Лише
// Date.now: таймери справжні, тож мережа й емулятор працюють як завжди.
async function withClock(offsetMs, fn) {
  const realNow = Date.now;
  Date.now = () => realNow() + offsetMs;
  try {
    return await fn();
  } finally {
    Date.now = realNow;
  }
}

module.exports = { startServer, withClock, nextIp };
