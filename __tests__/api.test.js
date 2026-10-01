import { apiMe, apiWordOfDay, deviceForgotten, recognizeImage, setSessionToken } from '../src/api';
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
