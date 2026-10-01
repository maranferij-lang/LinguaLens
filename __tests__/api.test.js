import { apiMe, apiWordOfDay, deviceForgotten, recognizeImage, recognizeScene, setSessionToken } from '../src/api';
import { localDayKey } from '../src/storage';

function respond(status, body) {
  global.fetch = jest.fn(async () => ({ ok: status >= 200 && status < 300, status, json: async () => body }));
}

afterEach(() => {
  delete global.fetch;
  setSessionToken('');
});

test('a successful scan maps fields and keeps the server usage', async () => {
  respond(200, { word: 'mug', example_translation: 'x', box: [1, 2, 3, 4], outline: [[1, 1]], usage: { scans: 2, limit: 5 } });
  const r = await recognizeImage('b64', 'en', 'uk');
  expect(r.word).toBe('mug');
  expect(r.exampleTranslation).toBe('x');
  expect(r.box).toEqual([1, 2, 3, 4]);
  expect(r.outline).toBeNull(); // менше 6 точок — не силует
  expect(r.usage).toEqual({ scans: 2, limit: 5 });
});

test.each([
  [402, 'SCAN_LIMIT'],
  [422, 'SCAN_EMPTY'],
  [429, 'SCAN_RATE'],
  [504, 'SCAN_TIMEOUT'],
  [502, 'SCAN_SERVER'],
])('HTTP %i becomes %s', async (status, code) => {
  respond(status, { error: 'x', used: 5 });
  await expect(recognizeImage('b64')).rejects.toThrow(code);
});

// SCAN_AUTH змушує сканер заводити нову ідентичність — лише коли сервер
// справді забув пристрій. Неправильний токен застосунку — звичайна помилка.
test.each([
  [401, 'UNAUTHORIZED', 'SCAN_AUTH'],
  [403, 'APP_TOKEN', 'SCAN_SERVER'],
  [401, 'Немає доступу.', 'SCAN_SERVER'],
])('HTTP %i %s becomes %s', async (status, error, code) => {
  respond(status, { error });
  await expect(recognizeImage('b64')).rejects.toThrow(code);
});

test('only an unknown device token counts as a forgotten device', async () => {
  respond(401, { error: 'UNAUTHORIZED' });
  expect(deviceForgotten(await apiMe().catch((e) => e))).toBe(true);
  respond(403, { error: 'APP_TOKEN' });
  expect(deviceForgotten(await apiMe().catch((e) => e))).toBe(false);
  respond(500, {});
  expect(deviceForgotten(await apiMe().catch((e) => e))).toBe(false);
});

// Вхід через Apple змінив токен, поки старий запит ще летів: сервер уже стер
// анонімний запис, але це не привід викидати людину з нового акаунта.
test('a 401 for a token replaced mid-flight does not count as a forgotten device', async () => {
  let answer;
  global.fetch = jest.fn(() => new Promise((r) => (answer = r)));
  setSessionToken('guest');
  const pending = apiMe().catch((e) => e);
  setSessionToken('account');
  answer({ ok: false, status: 401, json: async () => ({ error: 'UNAUTHORIZED' }) });
  const e = await pending;
  expect(global.fetch.mock.calls[0][1].headers.authorization).toBe('Bearer guest');
  expect(e.code).toBe('UNAUTHORIZED');
  expect(deviceForgotten(e)).toBe(false);
});

test('the paywall gets the server counters with a 402', async () => {
  respond(402, { error: 'SCAN_LIMIT', used: 5, limit: 5 });
  const e = await recognizeImage('b64').catch((x) => x);
  expect(e.data).toEqual({ error: 'SCAN_LIMIT', used: 5, limit: 5 });
});

test('network failure is OFFLINE, an aborted request is TIMEOUT', async () => {
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
  await expect(recognizeImage('b64')).rejects.toThrow('SCAN_OFFLINE');

  jest.useFakeTimers();
  // expo/fetch кидає FetchError (не AbortError), коли запит перервано
  global.fetch = jest.fn(
    (url, { signal }) =>
      new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('fetch failed: canceled'))))
  );
  const p = recognizeImage('b64');
  jest.advanceTimersByTime(26000);
  await expect(p).rejects.toThrow('SCAN_TIMEOUT');
  jest.useRealTimers();
});

test('requests carry the device token and the local day', async () => {
  respond(200, { words: [] });
  setSessionToken('tok');
  await apiWordOfDay(7, 'en', 'uk');
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toContain(`today=${localDayKey()}`);
  expect(init.headers.authorization).toBe('Bearer tok');
  expect(init.headers['x-local-date']).toBe(localDayKey());
});

// ---------- сцена ----------
const sceneObject = (word, extra = {}) => ({
  word,
  ipa: '/x/',
  translation: 'т',
  example: 'e',
  example_translation: 'е',
  box: [100, 100, 300, 300],
  outline: [[1, 1], [1, 2], [2, 2], [2, 1], [3, 1], [3, 3]],
  ...extra,
});

describe('recognizeScene', () => {
  test('asks the scan endpoint for a scene and maps every object like a single scan', async () => {
    respond(200, { mode: 'scene', objects: [sceneObject('mug'), sceneObject('lamp', { outline: [[1, 1]] })], usage: { scans: 3, limit: 5 } });
    const r = await recognizeScene('b64', 'de', 'uk');
    const [url, init] = global.fetch.mock.calls[0];
    expect(new URL(url).pathname).toBe('/scan');
    expect(JSON.parse(init.body)).toEqual({ image: 'b64', lang: 'de', nativeLang: 'uk', mode: 'scene' });
    expect(r.usage).toEqual({ scans: 3, limit: 5 });
    expect(r.objects).toEqual([
      { word: 'mug', ipa: '/x/', translation: 'т', example: 'e', exampleTranslation: 'е', box: [100, 100, 300, 300], outline: sceneObject('').outline },
      // менше 6 точок — не силует
      { word: 'lamp', ipa: '/x/', translation: 'т', example: 'e', exampleTranslation: 'е', box: [100, 100, 300, 300], outline: null },
    ]);
  });

  test('objects that cannot be placed on the photo are dropped, at most eight are kept', async () => {
    respond(200, {
      objects: [
        sceneObject('ok'),
        sceneObject('', {}),
        sceneObject('nobox', { box: null }),
        sceneObject('flat', { box: [300, 100, 300, 200] }),
        sceneObject('nan', { box: [1, 2, 'x', 4] }),
        null,
        ...Array.from({ length: 10 }, (_, i) => sceneObject('w' + i)),
      ],
    });
    const r = await recognizeScene('b64');
    expect(r.objects.map((o) => o.word)).toEqual(['ok', 'w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6']);
    expect(r.usage).toBeNull();
  });

  test('nothing usable is the same as an empty frame', async () => {
    respond(200, { objects: [sceneObject('nobox', { box: null })] });
    await expect(recognizeScene('b64')).rejects.toThrow('SCAN_EMPTY');
    respond(200, {});
    await expect(recognizeScene('b64')).rejects.toThrow('SCAN_EMPTY');
  });

  test.each([
    [402, 'SCAN_LIMIT', 'SCAN_LIMIT'],
    [422, 'NO_OBJECT', 'SCAN_EMPTY'],
    [429, 'x', 'SCAN_RATE'],
    [504, 'x', 'SCAN_TIMEOUT'],
    [502, 'x', 'SCAN_SERVER'],
    [401, 'UNAUTHORIZED', 'SCAN_AUTH'],
    [403, 'APP_TOKEN', 'SCAN_SERVER'],
  ])('HTTP %i %s becomes %s, with the server body attached', async (status, error, code) => {
    respond(status, { error, used: 5, limit: 5 });
    const e = await recognizeScene('b64').catch((x) => x);
    expect(e.message).toBe(code);
    if (code !== 'SCAN_AUTH') expect(e.data).toEqual({ error, used: 5, limit: 5 });
  });

  test('a scene gets 40 seconds before the client gives up, not the 25 of a single scan', async () => {
    jest.useFakeTimers();
    global.fetch = jest.fn(
      (url, { signal }) =>
        new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('fetch failed: canceled'))))
    );
    let settled = false;
    const p = recognizeScene('b64').catch((e) => {
      settled = true;
      return e;
    });
    jest.advanceTimersByTime(30000);
    await Promise.resolve();
    expect(settled).toBe(false);
    jest.advanceTimersByTime(10500);
    expect((await p).message).toBe('SCAN_TIMEOUT');
    jest.useRealTimers();
  });

  test('offline is reported as offline', async () => {
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(recognizeScene('b64')).rejects.toThrow('SCAN_OFFLINE');
  });
});
