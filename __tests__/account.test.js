// Вхід через Apple: правильний nonce туди й назад, жодних імені й пошти,
// перехід в існуючий акаунт забирає його токен, скасування — не помилка,
// вихід очищає телефон і дає нову анонімну ідентичність.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as AppleAuthentication from 'expo-apple-authentication';
import { Platform } from 'react-native';

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
const { STRINGS } = require('../src/i18n');
const { accountErrorKey, appleAvailable, loadAccount, signInWithApple, signOut, syncErrorKey } = require('../src/account');
const { apiMe, setSessionToken } = require('../src/api');

const CREDENTIAL = { user: 'apple-sub', identityToken: 'id.token.jwt', authorizationCode: 'auth-code', fullName: null, email: null };

// { 'POST /auth/apple': [status, body] | 'offline' }
function server(routes) {
  global.fetch = jest.fn(async (url, init) => {
    const r = routes[(init?.method || 'GET') + ' ' + new URL(url).pathname];
    if (!r || r === 'offline') throw new TypeError('Network request failed');
    const [status, body] = r;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  });
}
const callTo = (route) =>
  global.fetch.mock.calls.find(([url, init]) => (init?.method || 'GET') + ' ' + new URL(url).pathname === route);
const bodyOf = (route) => JSON.parse(callTo(route)[1].body);

const NONCE = [200, { nonce: 'signed.nonce', appleNonce: 'a1b2c3' }];
const linked = (switched, id = 'acc') => [200, { user: { id, createdAt: 1, apple: true }, token: 'acc-token', switched }];

beforeEach(async () => {
  keychain.clear();
  await AsyncStorage.clear();
  keychain.set('ll_token', 'guest-token');
  await AsyncStorage.setItem('ll_device_v1', 'guest');
  AppleAuthentication.signInAsync.mockReset();
  AppleAuthentication.isAvailableAsync.mockReset();
  AppleAuthentication.isAvailableAsync.mockResolvedValue(true);
});
afterEach(() => {
  delete global.fetch;
  setSessionToken('');
});

describe('signInWithApple', () => {
  test('nonce from the server → Apple with the hashed nonce and no scopes → server with the raw nonce', async () => {
    server({ 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': linked(false, 'guest') });
    AppleAuthentication.signInAsync.mockResolvedValueOnce(CREDENTIAL);

    expect(await signInWithApple()).toEqual({ userId: 'guest', switched: false });
    expect(AppleAuthentication.signInAsync).toHaveBeenCalledWith({ requestedScopes: [], nonce: 'a1b2c3' });
    expect(bodyOf('POST /auth/apple')).toEqual({ identityToken: 'id.token.jwt', nonce: 'signed.nonce', authorizationCode: 'auth-code' });
    // nonce видають цьому пристрою — запит іде з його токеном
    expect(callTo('POST /auth/apple/nonce')[1].headers.authorization).toBe('Bearer guest-token');
    expect(await loadAccount()).toEqual({ id: 'guest', nudgeOff: false });
  });

  test('switching into an existing account adopts its token and id', async () => {
    server({ 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': linked(true), 'GET /me': [200, { user: { id: 'acc', apple: true } }] });
    AppleAuthentication.signInAsync.mockResolvedValueOnce(CREDENTIAL);

    expect(await signInWithApple()).toEqual({ userId: 'acc', switched: true });
    expect(keychain.get('ll_token')).toBe('acc-token');
    expect(await AsyncStorage.getItem('ll_device_v1')).toBe('acc');
    expect((await loadAccount()).id).toBe('acc');
    // наступні запити — вже від імені акаунта
    await apiMe();
    expect(callTo('GET /me')[1].headers.authorization).toBe('Bearer acc-token');
  });

  test('closing the Apple sheet is silent: nothing sent, nothing stored', async () => {
    server({ 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': linked(true) });
    AppleAuthentication.signInAsync.mockRejectedValueOnce(Object.assign(new Error('canceled'), { code: 'ERR_REQUEST_CANCELED' }));

    expect(await signInWithApple()).toBeNull();
    expect(callTo('POST /auth/apple')).toBeUndefined();
    expect(keychain.get('ll_token')).toBe('guest-token');
    expect((await loadAccount()).id).toBeNull();
    expect(accountErrorKey('CANCELED')).toBeNull();
  });

  test('a token the server rejects is APPLE_INVALID and keeps the guest identity', async () => {
    server({ 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': [400, { error: 'APPLE_INVALID' }] });
    AppleAuthentication.signInAsync.mockResolvedValueOnce(CREDENTIAL);

    const e = await signInWithApple().catch((x) => x);
    expect(e.code).toBe('APPLE_INVALID');
    expect(accountErrorKey(e.code)).toBe('accountErrInvalid');
    expect(STRINGS.en.accountErrInvalid).toMatch(/Apple couldn’t confirm/);
    expect(keychain.get('ll_token')).toBe('guest-token');
    expect((await loadAccount()).id).toBeNull();
  });

  test.each([
    ['offline before the nonce', 'OFFLINE', { 'POST /auth/apple/nonce': 'offline' }, 'accountErrOffline'],
    ['too many attempts', 'RATE', { 'POST /auth/apple/nonce': [429, { error: 'TOO_MANY_ATTEMPTS' }] }, 'accountErrRate'],
    ['Apple keys unreachable', 'APPLE_UNAVAILABLE', { 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': [503, { error: 'APPLE_UNAVAILABLE' }] }, 'accountErrApple'],
    ['the device was forgotten', 'SESSION', { 'POST /auth/apple/nonce': [401, { error: 'UNAUTHORIZED' }] }, 'accountErrFailed'],
    ['a server error', 'FAILED', { 'POST /auth/apple/nonce': NONCE, 'POST /auth/apple': [500, { error: 'SERVER_ERROR' }] }, 'accountErrFailed'],
  ])('%s → %s', async (_, code, routes, key) => {
    server(routes);
    AppleAuthentication.signInAsync.mockResolvedValueOnce(CREDENTIAL);
    const e = await signInWithApple().catch((x) => x);
    expect(e.code).toBe(code);
    expect(accountErrorKey(e.code)).toBe(key);
  });

  test('the system sheet failing is a calm generic error', async () => {
    server({ 'POST /auth/apple/nonce': NONCE });
    AppleAuthentication.signInAsync.mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'ERR_REQUEST_FAILED' }));
    expect((await signInWithApple().catch((x) => x)).code).toBe('FAILED');
  });

  test('no identity yet and no network: OFFLINE before Apple is even asked', async () => {
    keychain.clear();
    await AsyncStorage.clear();
    server({ 'POST /auth/device': 'offline' });
    expect((await signInWithApple().catch((x) => x)).code).toBe('OFFLINE');
    expect(AppleAuthentication.signInAsync).not.toHaveBeenCalled();
  });
});

describe('appleAvailable', () => {
  const realOS = Platform.OS;
  afterEach(() => {
    Platform.OS = realOS;
  });

  test('only on iOS, and only if the system says so', async () => {
    Platform.OS = 'ios';
    expect(await appleAvailable()).toBe(true);
    AppleAuthentication.isAvailableAsync.mockResolvedValueOnce(false);
    expect(await appleAvailable()).toBe(false);
    AppleAuthentication.isAvailableAsync.mockRejectedValueOnce(new Error('no module'));
    expect(await appleAvailable()).toBe(false);
    for (const os of ['android', 'web']) {
      Platform.OS = os;
      expect(await appleAvailable()).toBe(false);
    }
  });
});

test('signing out clears the personal data, keeps settings and gets a fresh anonymous identity', async () => {
  keychain.set('ll_token', 'acc-token');
  const keep = { ll_settings_v1: '{"nativeLang":"uk"}', ll_onboarded_v1: '1', ll_wod_v1: '{}', ll_sync_nudge_v1: '1' };
  const wipe = {
    ll_words_v1: '[{"id":"a"}]',
    ll_activity_v1: '{}',
    ll_stats_v1: '{}',
    ll_seen_ach_v1: '[]',
    ll_sync_v1: '{"id":"acc","since":3}',
    ll_tombstones_v1: '[]',
    ll_scenes_v1: '[]',
    ll_account_v1: '{"id":"acc"}',
  };
  await AsyncStorage.multiSet(Object.entries({ ...keep, ...wipe, ll_device_v1: 'acc' }));
  server({ 'POST /auth/device': [200, { token: 'anon-token', user: { id: 'anon2', createdAt: 2 } }] });

  expect(await signOut()).toEqual({ token: 'anon-token', userId: 'anon2' });
  // старий токен — у тілі, щоб сервер переніс лічильники сканів і проби
  // сцени; сам запит уже без нього в заголовку
  expect(bodyOf('POST /auth/device')).toEqual({ previous: 'acc-token' });
  expect(callTo('POST /auth/device')[1].headers.authorization).toBeUndefined();
  for (const k of Object.keys(wipe)) expect(await AsyncStorage.getItem(k)).toBeNull();
  for (const [k, v] of Object.entries(keep)) expect(await AsyncStorage.getItem(k)).toBe(v);
  expect(keychain.get('ll_token')).toBe('anon-token');
  expect(await AsyncStorage.getItem('ll_device_v1')).toBe('anon2');
});

test('signing out offline still forgets the account token: no silent way back in', async () => {
  keychain.set('ll_token', 'acc-token');
  await AsyncStorage.multiSet([
    ['ll_device_v1', 'acc'],
    ['ll_account_v1', '{"id":"acc"}'],
  ]);
  server({ 'POST /auth/device': 'offline' });
  expect(await signOut()).toBeNull();
  expect(keychain.has('ll_token')).toBe(false);
  expect(await AsyncStorage.getItem('ll_device_v1')).toBeNull();
  expect((await loadAccount()).id).toBeNull();
});

test('every error key exists in all five languages', () => {
  const codes = ['OFFLINE', 'TIMEOUT', 'APPLE_INVALID', 'APPLE_UNAVAILABLE', 'RATE', 'SESSION', 'FAILED', 'DICT_FULL', 'HTTP_500'];
  const keys = new Set([...codes.map(accountErrorKey), ...codes.map(syncErrorKey)]);
  for (const lang of ['en', 'uk', 'de', 'es', 'ru']) for (const k of keys) expect(STRINGS[lang]).toHaveProperty(k);
  expect(syncErrorKey(null)).toBeNull();
});
