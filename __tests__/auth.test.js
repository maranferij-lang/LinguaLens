// Ідентичність пристрою: її не можна втратити через збій мережі, неправильний
// токен застосунку чи перевстановлення — інакше людина отримує новий
// безкоштовний ліміт, а Pro — новий appUserID у RevenueCat.
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-secure-store', () => {
  const keychain = new Map();
  return {
    AFTER_FIRST_UNLOCK: 0,
    keychain,
    getItemAsync: async (k) => keychain.get(k) ?? null,
    setItemAsync: async (k, v) => void keychain.set(k, v),
    deleteItemAsync: async (k) => void keychain.delete(k),
  };
});

const { keychain } = require('expo-secure-store');
const { ensureSession, eraseServerData, renewSession, startOver } = require('../src/auth');

const USER_KEY = 'll_device_v1';

// Маршрутизатор відповідей сервера: { 'GET /me': [status, body] | 'offline' }
function server(routes) {
  global.fetch = jest.fn(async (url, { method }) => {
    const r = routes[method + ' ' + new URL(url).pathname];
    if (!r || r === 'offline') throw new TypeError('Network request failed');
    const [status, body] = r;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}
const called = (route) => global.fetch.mock.calls.some(([url, { method }]) => method + ' ' + new URL(url).pathname === route);
// Тіла всіх POST /auth/device цього тесту, по черзі
const deviceBodies = () =>
  global.fetch.mock.calls.filter(([url]) => new URL(url).pathname === '/auth/device').map(([, init]) => JSON.parse(init.body));

const NEW_DEVICE = [200, { token: 'new', user: { id: 'u2', createdAt: 1 } }];

beforeEach(async () => {
  keychain.clear();
  await AsyncStorage.clear();
});
afterEach(() => {
  delete global.fetch;
});

describe('reinstall: the token survived in the Keychain, the user id did not', () => {
  beforeEach(() => keychain.set('ll_token', 'old'));

  test('recovers the id from the server instead of creating a new device', async () => {
    server({ 'GET /me': [200, { user: { id: 'u1', createdAt: 1 }, pro: { active: false }, usage: {} }], 'POST /auth/device': NEW_DEVICE });
    expect(await ensureSession()).toEqual({ token: 'old', userId: 'u1' });
    expect(called('POST /auth/device')).toBe(false);
    expect(await AsyncStorage.getItem(USER_KEY)).toBe('u1');
  });

  test.each([
    ['offline', 'offline'],
    ['a wrong app token', [403, { error: 'APP_TOKEN' }]],
    ['a server error', [502, { error: 'x' }]],
  ])('%s keeps the token and creates nothing', async (_, me) => {
    server({ 'GET /me': me, 'POST /auth/device': NEW_DEVICE });
    expect(await ensureSession()).toEqual({ token: 'old', userId: null });
    expect(called('POST /auth/device')).toBe(false);
    expect(keychain.get('ll_token')).toBe('old');
  });

  test('a forgotten token gets a new identity', async () => {
    server({ 'GET /me': [401, { error: 'UNAUTHORIZED' }], 'POST /auth/device': NEW_DEVICE });
    expect(await ensureSession()).toEqual({ token: 'new', userId: 'u2' });
    expect(keychain.get('ll_token')).toBe('new');
  });
});

test('first launch offline: no identity yet, nothing stored', async () => {
  server({ 'POST /auth/device': 'offline' });
  expect(await ensureSession()).toBeNull();
  expect(keychain.size).toBe(0);
});

test('a failed renewal keeps the old identity', async () => {
  keychain.set('ll_token', 'old');
  await AsyncStorage.setItem(USER_KEY, 'u1');
  server({ 'POST /auth/device': 'offline' });
  expect(await renewSession()).toBeNull();
  expect(keychain.get('ll_token')).toBe('old');
  expect(await AsyncStorage.getItem(USER_KEY)).toBe('u1');

  server({ 'POST /auth/device': NEW_DEVICE });
  expect(await renewSession()).toEqual({ token: 'new', userId: 'u2' });
  expect(keychain.get('ll_token')).toBe('new');
  expect(await AsyncStorage.getItem(USER_KEY)).toBe('u2');
});

test('erasing drops the old token even if a new identity cannot be created yet', async () => {
  keychain.set('ll_token', 'old');
  await AsyncStorage.setItem(USER_KEY, 'u1');
  server({ 'DELETE /me': [200, { ok: true }], 'POST /auth/device': 'offline' });
  expect(await eraseServerData()).toBeNull();
  expect(keychain.has('ll_token')).toBe(false);
  expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
});

test('erasing fails loudly when the server is unreachable and keeps the identity', async () => {
  keychain.set('ll_token', 'old');
  await AsyncStorage.setItem(USER_KEY, 'u1');
  server({ 'DELETE /me': 'offline' });
  await expect(eraseServerData()).rejects.toThrow('OFFLINE');
  expect(keychain.get('ll_token')).toBe('old');
});

test('erasing a device the server already forgot still starts fresh', async () => {
  keychain.set('ll_token', 'old');
  await AsyncStorage.setItem(USER_KEY, 'u1');
  server({ 'DELETE /me': [401, { error: 'UNAUTHORIZED' }], 'POST /auth/device': NEW_DEVICE });
  expect(await eraseServerData()).toEqual({ token: 'new', userId: 'u2' });
  expect(keychain.get('ll_token')).toBe('new');
  // стирання — не вихід: старого токена сервер не отримує, а лічильників
  // (carry) сервер, що вже забув пристрій, не дав — нести нічого
  expect(deviceBodies()).toEqual([{}]);
});

// Вихід без мережі (чи відповідь /auth/device загубилась): старий токен уже
// прибрано, нової ідентичності ще немає. Наступний старт мусить усе одно
// нести лічильники, інакше «вийти офлайн → увійти знову» щоразу дарувало б
// безкоштовний скан, а словник лишався б в акаунті.
test('signing out offline keeps the carry until a new identity actually exists', async () => {
  keychain.set('ll_token', 'acct-token');
  await AsyncStorage.setItem(USER_KEY, 'acct');
  server({ 'POST /auth/device': 'offline' });
  expect(await startOver({ carry: true })).toBeNull();
  // в акаунт тихо не повернутись: токена сесії немає
  expect(keychain.has('ll_token')).toBe(false);
  expect(await AsyncStorage.getItem(USER_KEY)).toBeNull();
  // наступний старт теж офлайн — carry не губиться
  expect(await ensureSession()).toBeNull();

  server({ 'POST /auth/device': NEW_DEVICE });
  expect(await ensureSession()).toEqual({ token: 'new', userId: 'u2' });
  expect(deviceBodies()).toEqual([{ previous: 'acct-token' }]);
  // донесено — більше не потрібен і не лежить у Keychain
  expect([...keychain.keys()]).toEqual(['ll_token']);
  expect(await renewSession()).toEqual({ token: 'new', userId: 'u2' });
  expect(deviceBodies()).toEqual([{ previous: 'acct-token' }, {}]);
});

test('erasing carries the counters the server returned, even past a failed new identity', async () => {
  keychain.set('ll_token', 'old');
  await AsyncStorage.setItem(USER_KEY, 'u1');
  server({ 'DELETE /me': [200, { ok: true, carry: 'carry-1' }], 'POST /auth/device': 'offline' });
  expect(await eraseServerData()).toBeNull();
  expect(keychain.has('ll_token')).toBe(false);

  server({ 'POST /auth/device': NEW_DEVICE });
  expect(await ensureSession()).toEqual({ token: 'new', userId: 'u2' });
  // лише лічильники — токена стертого запису сервер більше не бачить
  expect(deviceBodies()).toEqual([{ previous: 'carry-1' }]);
  expect([...keychain.keys()]).toEqual(['ll_token']);
});
