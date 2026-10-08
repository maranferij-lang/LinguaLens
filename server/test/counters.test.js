// Довічні лічильники сканів і проби сцени йдуть за телефоном, коли він міняє
// запис: вхід через Apple в існуючий акаунт зливає їх з акаунтом, а вихід
// (POST /auth/device з токеном, з яким телефон іде) переносить у нову
// анонімну ідентичність. Інакше «вийти й увійти знову» щоразу давало б
// безкоштовну сцену й скан. Справжній HTTP, підроблений Apple, AI — mock.
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
  // Сканів із запасом: у більшості тестів упираємось саме в пробу сцени, а до
  // ліміту сканів доводимо лічильник напряму.
  FREE_SCANS: '10',
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
const IMAGE = { image: 'aGk=', lang: 'en', nativeLang: 'uk' };
const SCENE = { ...IMAGE, mode: 'scene' };
const scene = (token) => call('POST', '/scan', { token, body: SCENE, headers: headers() });
const single = (token) => call('POST', '/scan', { token, body: IMAGE, headers: headers() });
const view = (scans, scenes) => ({ day: day(), scans, limit: 10, scenes, sceneLimit: 1, period: 'lifetime' });
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
    assert.deepEqual(await usage(out.data.token), view(1, 1));
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
  assert.deepEqual(await usage(r.data.token), view(1, 1));
  assert.equal((await scene(r.data.token)).data.error, 'SCENE_PRO');
  // і для першого телефона акаунта теж
  assert.equal((await scene(acc.data.token)).data.error, 'SCENE_PRO');
});

test('the lifetime scan limit survives signing out and back in, both ways', async () => {
  const s = sub();
  const device = await newDevice();
  const acc = await signIn(device.token, s);
  // дев'ять сканів уже витрачено, десятий — останній безкоштовний
  await store.update('users', acc.data.user.id, { scans: 9 });
  let token = acc.data.token;
  assert.equal((await single(token)).status, 200);
  assert.deepEqual((await single(token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });

  for (let i = 0; i < 3; i++) {
    // вихід: новий гість приносить довічний лічильник із собою
    const out = await signOut(token);
    assert.equal(out.status, 200);
    assert.deepEqual(await usage(out.data.token), view(10, 0));
    assert.deepEqual((await single(out.data.token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });
    assert.deepEqual((await scene(out.data.token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });

    // вхід назад — і акаунт не отримує нового скану
    const back = await signIn(out.data.token, s);
    assert.equal(back.data.switched, true);
    token = back.data.token;
    assert.deepEqual((await single(token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });
  }
  assert.equal((await store.get('users', acc.data.user.id)).scans, 10);
});

test('a guest at the scan limit takes it into an unused account; an account at the limit keeps it for a fresh guest', async () => {
  // гість витратив усе → входить в акаунт, що не сканував
  const s = sub();
  const owner = await newDevice();
  const acc = await signIn(owner.token, s);
  const guest = await newDevice();
  await store.update('users', guest.user.id, { scans: 10 });
  const r = await signIn(guest.token, s);
  assert.equal(r.data.switched, true);
  assert.equal((await single(r.data.token)).status, 402);
  assert.equal((await single(acc.data.token)).status, 402);

  // акаунт витратив усе → свіжий гість, що входить у нього, нового не приносить
  const s2 = sub();
  const owner2 = await newDevice();
  const acc2 = await signIn(owner2.token, s2);
  await store.update('users', acc2.data.user.id, { scans: 10 });
  const fresh = await newDevice();
  assert.equal((await usage(fresh.token)).scans, 0);
  const r2 = await signIn(fresh.token, s2);
  assert.equal(r2.data.switched, true);
  assert.deepEqual((await single(r2.data.token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });
  assert.equal((await store.get('users', acc2.data.user.id)).scans, 10);
});

test('merging counters: lifetime scans and scenes take the larger of both, the legacy usage counts too', async () => {
  const yesterday = billing.addDays(day(), -1);
  const legacy = (scans) => ({ usage: { day: yesterday, scans } });
  const cases = [
    // [акаунт, гість, що має лишитися в акаунті (лише scans і scenes)]
    [{ scans: 3, scenes: 2 }, { scans: 1, scenes: 1 }, { scans: 3, scenes: 2 }],
    [{ scans: 1 }, { scans: 4, scenes: 1 }, { scans: 4, scenes: 1 }],
    // не сума: це той самий телефон, що ходить між записами
    [{ scans: 2 }, { scans: 2 }, { scans: 2 }],
    // лічильник часів денного ліміту в гостя переходить як довічний
    [{}, legacy(5), { scans: 5 }],
    [{ scans: 2 }, { scans: 1, ...legacy(6) }, { scans: 6 }],
    // в акаунта старий лічильник більший — дописувати нічого
    [legacy(7), { scans: 3 }, {}],
    // зіпсоване в гостя не псує акаунт
    [{ scans: 2, scenes: 1 }, { scans: 'x', scenes: -3, usage: { day: 'x', scans: 1.5 } }, { scans: 2, scenes: 1 }],
    [{ scans: 2 }, { scans: 50.5, scenes: 'many' }, { scans: 2 }],
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
    const got = { scans: stored.scans, scenes: stored.scenes };
    const expect = { scans: mine.scans, scenes: mine.scenes, ...want };
    assert.deepEqual(got, expect, JSON.stringify([mine, theirs]));
    // старий лічильник акаунта лишився як був: його більше не пишемо
    assert.deepEqual(stored.usage, mine.usage, JSON.stringify([mine, theirs]));
  }
  // і напряму: null — «в into уже не менше»
  assert.equal(billing.mergeCounters({ scans: 3, scenes: 1 }, { scans: 3, scenes: 1 }), null);
  assert.deepEqual(billing.mergeCounters({}, legacy(2)), { scans: 2 });
  assert.equal(billing.mergeCounters({}, null), null);
});

test('a device with no previous token, or a bad one, starts with clean counters', async () => {
  const used = await newDevice();
  await store.update('users', used.user.id, { scans: 7, scenes: 1 });
  const nonce = (await call('POST', '/auth/apple/nonce', { token: used.token })).data.nonce;
  const gone = await newDevice();
  await store.update('users', gone.user.id, { scenes: 1 });
  await call('DELETE', '/me', { token: gone.token });

  const clean = view(0, 0);
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

// «Стерти всі мої дані» гостем, що щойно вийшов з акаунта: DELETE /me віддає
// підписані лічильники без id, і застосунок несе їх у нову ідентичність, як
// токен при виході. Інакше цикл «вийти → стерти як гість → сканувати → увійти
// назад» давав би безкоштовний скан щоразу, а словник лишався б в акаунті.
test('erasing as a guest after signing out gives no new free scan, and the account gets none back', async () => {
  const s = sub();
  const device = await newDevice();
  const acc = await signIn(device.token, s);
  await store.update('users', acc.data.user.id, { scans: 9 });
  let token = acc.data.token;
  assert.equal((await scene(token)).status, 200);
  assert.deepEqual((await single(token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });

  for (let i = 0; i < 3; i++) {
    const out = await signOut(token);
    assert.equal(out.status, 200);
    const erased = await call('DELETE', '/me', { token: out.data.token });
    assert.equal(erased.status, 200);
    assert.equal(erased.data.ok, true);
    assert.equal(typeof erased.data.carry, 'string');
    // запис справді стерто
    assert.equal(await store.get('users', out.data.user.id), null);

    // нова ідентичність — як її бере застосунок після стирання
    const fresh = await call('POST', '/auth/device', { body: { previous: erased.data.carry } });
    assert.equal(fresh.status, 200);
    assert.deepEqual(await usage(fresh.data.token), view(10, 1));
    assert.deepEqual((await single(fresh.data.token)).data, { error: 'SCAN_LIMIT', limit: 10, used: 10 });

    const back = await signIn(fresh.data.token, s);
    assert.equal(back.data.switched, true);
    assert.equal(back.data.user.id, acc.data.user.id);
    token = back.data.token;
  }
  const stored = await store.get('users', acc.data.user.id);
  assert.equal(stored.scans, 10);
  assert.equal(stored.scenes, 1);
});

test('the erase carry holds only the counters: no id, not a session, not to be forged', async () => {
  const d = await newDevice();
  const yesterday = billing.addDays(day(), -1);
  await store.update('users', d.user.id, { scans: 3, scenes: 1, usage: { day: yesterday, scans: 5 } });
  const { carry } = (await call('DELETE', '/me', { token: d.token })).data;
  const [body, sig] = carry.split('.');
  const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
  assert.deepEqual(Object.keys(payload).sort(), ['exp', 'purpose', 'scans', 'scenes']);
  // старий денний лічильник теж іде в рахунок, як при злитті
  assert.deepEqual({ ...payload, exp: 0 }, { purpose: 'carry', scans: 5, scenes: 1, exp: 0 });
  // як токен пристрою не годиться
  assert.equal((await call('GET', '/me', { token: carry })).status, 401);
  assert.equal((await call('POST', '/scan', { token: carry, body: IMAGE, headers: headers() })).status, 401);
  // переписані лічильники з чужим підписом — чисті лічильники, а не нулі з «carry»
  const forged = Buffer.from(JSON.stringify({ ...payload, scans: 0 })).toString('base64url') + '.' + sig;
  const r = await call('POST', '/auth/device', { body: { previous: forged } });
  assert.deepEqual(await usage(r.data.token), view(0, 0));
  // справжній carry — лічильники переходять
  const ok = await call('POST', '/auth/device', { body: { previous: carry } });
  assert.deepEqual(await usage(ok.data.token), view(5, 1));
  // скрипт без previous — той самий фарм пристроїв, що й завжди: чисті лічильники
  const bare = await call('POST', '/auth/device', { body: {} });
  assert.deepEqual(await usage(bare.data.token), view(0, 0));
});
