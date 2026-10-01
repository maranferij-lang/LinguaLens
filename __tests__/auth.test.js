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
const { ensureSession, eraseServerData, renewSession } = require('../src/auth');

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
});
