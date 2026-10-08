// Мобільний оператор тримає тисячі телефонів за кількома IPv4. Кожен запуск
// застосунку питає /me (статус Pro, лічильники) і слово дня. /me — лише
// читання, тож його стеля з IP втричі вища за RATE_PER_MIN; скани й слово дня
// лишаються на RATE_PER_MIN, а ліміти різних IP не змішуються.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-cgnat-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: '',
  // явно, щоб server/.env розробника не змінив межі
  RATE_PER_MIN: '20',
});
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

const CARRIER_IP = '100.64.12.34'; // діапазон CGNAT (RFC 6598)

test('30 distinct devices behind one carrier IP all get /me within a minute; the IP ceiling is 60', async () => {
  const devices = [];
  for (let i = 0; i < 30; i++) devices.push(await newDevice()); // кожен створено зі своєї IP: ліміт нових пристроїв не заважає
  const statuses = [];
  for (let round = 0; round < 2; round++) {
    for (const d of devices) statuses.push((await call('GET', '/me', { token: d.token, ip: CARRIER_IP })).status);
  }
  assert.deepEqual(statuses, Array(60).fill(200));
  // 61-й запит з тієї самої IP: стеля, навіть для іншого пристрою
  const over = await call('GET', '/me', { token: devices[0].token, ip: CARRIER_IP });
  assert.equal(over.status, 429);
  assert.deepEqual(over.data, { error: 'Забагато запитів.' });
  // а та сама людина з іншої IP (Wi-Fi) проходить
  assert.equal((await call('GET', '/me', { token: devices[0].token, ip: '203.0.113.77' })).status, 200);
});

test('one device from a fresh IP gets 429 only after the 60th /me call', async () => {
  const { token } = await newDevice();
  const ip = '100.64.99.1';
  const statuses = [];
  for (let i = 0; i < 61; i++) statuses.push((await call('GET', '/me', { token, ip })).status);
  assert.deepEqual(statuses, [...Array(60).fill(200), 429]);
});

test('the word of the day and scans stay on RATE_PER_MIN (20) per IP, and /me has its own bucket', async () => {
  const { token } = await newDevice();
  const ip = '100.64.55.5';
  const wod = [];
  for (let i = 0; i < 22; i++) wod.push((await call('GET', '/word-of-day?days=1', { token, ip })).status);
  assert.deepEqual(wod, [...Array(20).fill(200), 429, 429]);
  // слово дня вичерпано, але /me з тієї самої IP ще вільний
  assert.equal((await call('GET', '/me', { token, ip })).status, 200);

  // скани: 429 після 20 запитів з IP, ще до того як хтось платить за AI
  const ip2 = '100.64.55.6';
  const bad = [];
  for (let i = 0; i < 22; i++) bad.push((await call('POST', '/scan', { token, ip: ip2, body: { image: 'не base64!' } })).status);
  assert.deepEqual(bad, [...Array(20).fill(400), 429, 429]);
});
