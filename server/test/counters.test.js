// Лічильники сканів і проби сцени йдуть за телефоном, коли він міняє запис:
// вхід через Apple в існуючий акаунт зливає їх з акаунтом, а вихід (POST
// /auth/device з токеном, з яким телефон іде) переносить у нову анонімну
// ідентичність. Інакше «вийти й увійти знову» щоразу давало б безкоштовну
// сцену й скан. Справжній HTTP, підроблений Apple, AI — mock.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createFakeApple, makeSignIn } = require('./helpers/fake-apple');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-counters-'));
Object.assign(process.env, {
  PROVIDER: 'mock',
  DATA_FILE: path.join(dir, 'data.json'),
  AUTH_SECRET: 'test-secret',
  APPLE_TEAM_ID: '',
  APPLE_KEY_ID: '',
  APPLE_PRIVATE_KEY: '',
  // Денних сканів із запасом: упираємось саме в пробу сцени.
  FREE_SCANS_PER_DAY: '10',
  FREE_SCENES: '1',
});
delete process.env.REVENUECAT_SECRET_KEY;
const apple = createFakeApple();
const { startServer } = require('./helpers/http');
const store = require('../store');
const billing = require('../billing');

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

const sub = () => 'sub.' + crypto.randomBytes(12).toString('hex');
const day = () => billing.utcDay();
const headers = () => ({ 'x-local-date': day() });
const SCENE = { image: 'aGk=', lang: 'en', nativeLang: 'uk', mode: 'scene' };
const scene = (token) => call('POST', '/scan', { token, body: SCENE, headers: headers() });
// Вихід, як його робить застосунок (account.signOut → auth.startOver).
const signOut = (token) => call('POST', '/auth/device', { body: { previous: token } });

async function usage(token) {
  const me = await call('GET', '/me', { token, headers: headers() });
  assert.equal(me.status, 200);
  return me.data.usage;
}

test('signing out and back in gives no new free scene or scan', async () => {
  const s = sub();
  const device = await newDevice();
  const acc = await signIn(device.token, s);
  assert.equal(acc.status, 200);
  let token = acc.data.token;
  assert.equal((await scene(token)).status, 200);
  assert.equal((await scene(token)).data.error, 'SCENE_PRO');

  for (let i = 0; i < 3; i++) {
    const out = await signOut(token);
    assert.equal(out.status, 200);
    assert.notEqual(out.data.user.id, acc.data.user.id);
    assert.equal(out.data.user.apple, false);
    // новий гість — з тими самими лічильниками, а не з новою пробою
    assert.deepEqual(await usage(out.data.token), { day: day(), scans: 1, limit: 10, scenes: 1, sceneLimit: 1 });
    const r = await scene(out.data.token);
    assert.equal(r.status, 402);
    assert.equal(r.data.error, 'SCENE_PRO');

    const back = await signIn(out.data.token, s);
    assert.equal(back.data.switched, true);
    assert.equal(back.data.user.id, acc.data.user.id);
    token = back.data.token;
    assert.equal((await scene(token)).data.error, 'SCENE_PRO');
  }
  const u = await usage(token);
  assert.equal(u.scenes, 1);
  assert.equal(u.scans, 1);
});

test('a guest that used its quota keeps it used after switching into an unused account', async () => {
  const s = sub();
  const owner = await newDevice();
  const acc = await signIn(owner.token, s);
  assert.equal(acc.data.switched, false);

  const guest = await newDevice();
  assert.equal((await scene(guest.token)).status, 200);
  const r = await signIn(guest.token, s);
  assert.equal(r.data.switched, true);
  assert.equal(r.data.user.id, acc.data.user.id);
  // анонімний запис стерто, а його лічильники — уже в акаунті
  assert.equal(await store.get('users', guest.user.id), null);
  assert.deepEqual(await usage(r.data.token), { day: day(), scans: 1, limit: 10, scenes: 1, sceneLimit: 1 });
  assert.equal((await scene(r.data.token)).data.error, 'SCENE_PRO');
  // і для першого телефона акаунта теж
  assert.equal((await scene(acc.data.token)).data.error, 'SCENE_PRO');
});

test('merging counters: scenes take the larger, scans the larger of the same day or the later day', async () => {
  const today = day();
  const yesterday = billing.addDays(today, -1);
  const on = (d, scans, scenes) => ({ usage: { day: d, scans }, ...(scenes === undefined ? {} : { scenes }) });
  const cases = [
    // [акаунт, гість, що має лишитися в акаунті]
    [on(today, 3, 2), on(today, 1, 1), on(today, 3, 2)],
    [on(today, 1), on(today, 4, 1), on(today, 4, 1)],
    [on(yesterday, 9), on(today, 1), on(today, 1)],
    [on(today, 1), on(yesterday, 9), on(today, 1)],
    // зіпсоване в гостя не псує акаунт
    [on(today, 2, 1), on('x', 50, -3), on(today, 2, 1)],
    [on(today, 2), { usage: { day: today, scans: 1.5 }, scenes: 'many' }, on(today, 2)],
    [{}, {}, {}],
  ];
  for (const [mine, theirs, want] of cases) {
    const s = sub();
    const owner = await newDevice();
    const acc = await signIn(owner.token, s);
    await store.update('users', acc.data.user.id, mine);
    const guest = await newDevice();
    await store.update('users', guest.user.id, theirs);
    assert.equal((await signIn(guest.token, s)).data.switched, true);
    const stored = await store.get('users', acc.data.user.id);
    const got = { usage: stored.usage, scenes: stored.scenes };
    assert.deepEqual(got, { usage: undefined, scenes: undefined, ...want }, JSON.stringify([mine, theirs]));
  }
});

test('a device with no previous token, or a bad one, starts with clean counters', async () => {
  const used = await newDevice();
  await store.update('users', used.user.id, { usage: { day: day(), scans: 7 }, scenes: 1 });
  const nonce = (await call('POST', '/auth/apple/nonce', { token: used.token })).data.nonce;
  const gone = await newDevice();
  await store.update('users', gone.user.id, { scenes: 1 });
  await call('DELETE', '/me', { token: gone.token });

  const clean = { day: day(), scans: 0, limit: 10, scenes: 0, sceneLimit: 1 };
  // чужий підпис, nonce Apple замість токена, стертий запис, сміття в тілі
  const bad = ['', 42, used.token + 'x', nonce, gone.token].map((previous) => ({ previous }));
  for (const body of [{}, '[1]', '{oops', ...bad]) {
    const r = await call('POST', '/auth/device', { body });
    assert.equal(r.status, 200, JSON.stringify(body));
    assert.deepEqual(await usage(r.data.token), clean, JSON.stringify(body));
  }
  // справжній токен — лічильники переходять, а сам старий запис не чіпаємо
  const r = await signOut(used.token);
  assert.deepEqual(await usage(r.data.token), { ...clean, scans: 7, scenes: 1 });
  assert.equal((await call('GET', '/me', { token: used.token })).status, 200);
});

test('a device linked to one Apple ID takes its counters into the new account of another', async () => {
  const device = await newDevice();
  const first = await signIn(device.token, sub());
  assert.equal((await scene(first.data.token)).status, 200);
  const second = await signIn(first.data.token, sub());
  assert.equal(second.data.switched, true);
  assert.notEqual(second.data.user.id, first.data.user.id);
  assert.equal((await usage(second.data.token)).scenes, 1);
  assert.equal((await scene(second.data.token)).data.error, 'SCENE_PRO');
});
