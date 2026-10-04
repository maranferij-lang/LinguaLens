// Ліміти безкоштовного рівня без жодних змінних оточення: один скан і одна
// сцена за все життя запису, entitlement lingualens_pro. І як змінні їх
// перекривають — ціле ≥ 0 береться, сміття не робить скани безлімітними, а
// стара денна FREE_SCANS_PER_DAY лише дає попередження в лог.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-limits-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  REVENUECAT_SECRET_KEY: '',
});
const LIMIT_VARS = ['FREE_SCANS', 'FREE_SCANS_PER_DAY', 'FREE_SCENES', 'REVENUECAT_ENTITLEMENT'];
for (const name of LIMIT_VARS) delete process.env[name];

// billing — ДО сервера: server.js підвантажує server/.env розробника, і його
// FREE_SCANS перекрив би значення за замовчуванням, які тут і перевіряємо.
// Модуль читає оточення один раз, при завантаженні.
const billing = require('../billing');
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

const IMAGE = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };
const SCENE = { ...IMAGE, mode: 'scene' };

// Свіжий екземпляр billing із заданим оточенням (для перевірки розбору).
function billingWith(env) {
  const saved = Object.fromEntries(LIMIT_VARS.map((k) => [k, process.env[k]]));
  const warn = console.warn;
  const warnings = [];
  console.warn = (msg) => warnings.push(String(msg));
  const id = require.resolve('../billing');
  const loaded = require.cache[id];
  try {
    for (const k of LIMIT_VARS) delete process.env[k];
    Object.assign(process.env, env);
    delete require.cache[id];
    return { ...require('../billing'), warnings };
  } finally {
    // сервер у цьому процесі й далі працює зі своїм екземпляром
    require.cache[id] = loaded;
    console.warn = warn;
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

test('defaults: one free scan for life, one free scene for life, entitlement lingualens_pro', async () => {
  assert.equal(billing.FREE_SCANS, 1);
  assert.equal(billing.FREE_SCENES, 1);
  assert.equal(billing.ENTITLEMENT, 'lingualens_pro');
  // старої денної ручки більше немає взагалі
  assert.equal('FREE_SCANS_PER_DAY' in billing, false);
  const { token } = await newDevice();
  const day = billing.utcDay();
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': day } });
  assert.deepEqual(me.data.usage, { day, scans: 0, limit: 1, scenes: 0, sceneLimit: 1, period: 'lifetime' });
});

test('the free scene uses the only free scan: after it a single scan is SCAN_LIMIT, today and tomorrow', async () => {
  const { token } = await newDevice();
  const today = billing.utcDay();
  const tomorrow = billing.addDays(today, 1);
  const scene = await call('POST', '/scan', { token, body: SCENE, headers: { 'x-local-date': today } });
  assert.equal(scene.status, 200);
  assert.deepEqual(scene.data.usage, { day: today, scans: 1, limit: 1, scenes: 1, sceneLimit: 1, period: 'lifetime' });

  for (const day of [today, tomorrow]) {
    const single = await call('POST', '/scan', { token, body: IMAGE, headers: { 'x-local-date': day } });
    assert.equal(single.status, 402, day);
    assert.deepEqual(single.data, { error: 'SCAN_LIMIT', limit: 1, used: 1 }, day);
    // спершу ліміт сканів, потім сцени: і друга сцена — SCAN_LIMIT
    const again = await call('POST', '/scan', { token, body: SCENE, headers: { 'x-local-date': day } });
    assert.deepEqual(again.data, { error: 'SCAN_LIMIT', limit: 1, used: 1 }, day);
  }
  const me = await call('GET', '/me', { token, headers: { 'x-local-date': tomorrow } });
  assert.deepEqual(me.data.usage, { day: tomorrow, scans: 1, limit: 1, scenes: 1, sceneLimit: 1, period: 'lifetime' });
});

test('env overrides: whole numbers ≥ 0 are taken, anything else falls back to the default with a warning', () => {
  const custom = billingWith({ FREE_SCANS: '5', FREE_SCENES: '3', REVENUECAT_ENTITLEMENT: 'pro' });
  assert.equal(custom.FREE_SCANS, 5);
  assert.equal(custom.FREE_SCENES, 3);
  assert.equal(custom.ENTITLEMENT, 'pro');
  assert.deepEqual(custom.warnings, []);

  // 0 — свідомий вибір: сцени лише в Pro, без проби
  const none = billingWith({ FREE_SCENES: '0' });
  assert.equal(none.FREE_SCENES, 0);
  assert.equal(none.FREE_SCANS, 1);
  assert.deepEqual(none.usageView({}, '2026-10-04', false), {
    day: '2026-10-04',
    scans: 0,
    limit: 1,
    scenes: 0,
    sceneLimit: 0,
    period: 'lifetime',
  });
  // і скани: FREE_SCANS=0 — без жодного безкоштовного
  assert.equal(billingWith({ FREE_SCANS: '0' }).FREE_SCANS, 0);

  for (const bad of ['три', '-1', '2.5', 'Infinity', '1e400', ' ']) {
    const b = billingWith({ FREE_SCANS: bad, FREE_SCENES: bad });
    assert.equal(b.FREE_SCANS, 1, bad);
    assert.equal(b.FREE_SCENES, 1, bad);
    assert.equal(b.warnings.length, bad.trim() ? 2 : 0, bad);
    if (bad.trim()) assert.match(b.warnings[0], /FREE_SCANS=/, bad);
  }
});

test('FREE_SCANS_PER_DAY left over from the daily limit is ignored with one warning naming FREE_SCANS', () => {
  const old = billingWith({ FREE_SCANS_PER_DAY: '5' });
  assert.equal(old.FREE_SCANS, 1);
  assert.equal('FREE_SCANS_PER_DAY' in old, false);
  assert.equal(old.warnings.length, 1);
  assert.match(old.warnings[0], /FREE_SCANS_PER_DAY=5/);
  assert.match(old.warnings[0], /ігнорую/);
  assert.match(old.warnings[0], /FREE_SCANS \(зараз 1\)/);

  // поруч із новою ручкою: береться FREE_SCANS, а стара — лише попередження
  const both = billingWith({ FREE_SCANS_PER_DAY: '50', FREE_SCANS: '3' });
  assert.equal(both.FREE_SCANS, 3);
  assert.equal(both.warnings.length, 1);
  assert.match(both.warnings[0], /FREE_SCANS \(зараз 3\)/);

  // без неї — тиша
  assert.deepEqual(billingWith({ FREE_SCANS: '2' }).warnings, []);
});

test('usage view: Pro has no limits; missing or broken counters read as zero', () => {
  const day = '2026-10-04';
  const user = { scans: 3, scenes: 2 };
  assert.deepEqual(billing.usageView(user, day, true), {
    day,
    scans: 3,
    limit: null,
    scenes: 2,
    sceneLimit: null,
    period: 'lifetime',
  });
  for (const n of [undefined, null, -1, 1.5, '2', NaN, {}]) {
    assert.equal(billing.usageView({ scenes: n }, day, false).scenes, 0, String(n));
    assert.equal(billing.usageView({ scans: n }, day, false).scans, 0, String(n));
    assert.equal(billing.usageView({ usage: { day, scans: n } }, day, false).scans, 0, String(n));
  }
  for (const usage of [null, 'x', 7, []]) assert.equal(billing.usageView({ usage }, day, false).scans, 0);
});
