// Слово дня під людину (src/wordOfDay.js): 14 днів через POST із профілем і
// «Знаю», кеш із підписом профілю, тема в заголовку сповіщення.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { needsRefresh, notificationTitle, syncWordOfDay, wodSignature } from '../src/wordOfDay';
import { localDayKey } from '../src/storage';
import { setSessionToken } from '../src/api';
import { makeT } from '../src/i18n';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ status: 'granted', canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ status: 'granted' })),
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  setNotificationChannelAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
  getLastNotificationResponse: jest.fn(() => null),
  clearLastNotificationResponse: jest.fn(),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { DEFAULT: 3 },
  DEFAULT_ACTION_IDENTIFIER: 'default',
}));

const t = makeT('uk');
const TODAY = localDayKey();
const day = (i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return localDayKey(d);
};
const PROFILE = { goals: ['work'], field: 'finance', level: 8, since: '2026-09-01' };

// Сервер-заглушка: 14 днів, слова з поточного «уроку» мінус «Знаю»
let served;
function serve(status = 200) {
  served = [];
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : null;
    served.push({ path: u.pathname, method: init.method || 'GET', query: u.search, body });
    if (status !== 200) return { ok: false, status, json: async () => ({ error: 'Not found' }) };
    const known = new Set(body?.known || []);
    const pool = ['liquidity', 'accrual', 'ledger', 'equity', 'audit', 'yield'].filter((w) => !known.has(w));
    const topic = body?.profile?.field || 'general';
    const words = Array.from({ length: body?.days || 7 }, (_, i) => ({
      date: day(i),
      word: pool[i % pool.length],
      ipa: '',
      translation: 'переклад',
      example: '',
      example_translation: '',
      source: pool[i % pool.length],
      topic,
    }));
    return { ok: true, status: 200, json: async () => ({ words }) };
  });
}

beforeEach(async () => {
  await AsyncStorage.clear();
  setSessionToken('tok');
  Notifications.scheduleNotificationAsync.mockClear();
  serve();
});

const stored = async () => JSON.parse(await AsyncStorage.getItem('ll_wod_v1'));
const args = (over = {}) => ({ lang: 'en', native: 'uk', enabled: false, hour: 10, profile: PROFILE, known: [], t, ...over });

describe('the request', () => {
  test('14 days by POST with the cleaned profile and the “I know” list', async () => {
    await syncWordOfDay(args({ profile: { ...PROFILE, goals: ['self', 'work', 'nope'] }, known: ['ledger'] }));
    expect(served).toHaveLength(1);
    expect(served[0]).toMatchObject({ path: '/word-of-day', method: 'POST', query: '' });
    expect(served[0].body).toEqual({
      days: 14,
      lang: 'en',
      native: 'uk',
      today: TODAY,
      profile: { goals: ['work', 'self'], field: 'finance', level: 8, since: '2026-09-01' },
      known: ['ledger'],
    });
    const fetchInit = global.fetch.mock.calls[0][1];
    expect(fetchInit.headers.authorization).toBe('Bearer tok');
  });

  test('without a profile and “I know” the body is the legacy one: general words', async () => {
    await syncWordOfDay(args({ profile: null }));
    expect(served[0].body).toEqual({ days: 14, lang: 'en', native: 'uk', today: TODAY });
  });

  test('a server that does not know POST yet gets the old GET', async () => {
    serve(404);
    await syncWordOfDay(args());
    expect(served.map((r) => [r.method, r.path])).toEqual([
      ['POST', '/word-of-day'],
      ['GET', '/word-of-day'],
    ]);
    expect(served[1].query).toBe(`?days=14&lang=en&native=uk&today=${TODAY}`);
  });
});

describe('the cache and its profile signature', () => {
  test('the signature changes with goals, field, level, since and every new “I know”', () => {
    const base = wodSignature(PROFILE, ['a']);
    expect(wodSignature({ ...PROFILE, goals: ['work'] }, ['a'])).toBe(base);
    for (const p of [
      { ...PROFILE, goals: ['work', 'travel'] },
      { ...PROFILE, field: 'law' },
      { ...PROFILE, level: 9 },
      { ...PROFILE, since: '2026-09-02' },
      null,
    ]) {
      expect(wodSignature(p, ['a'])).not.toBe(base);
    }
    expect(wodSignature(PROFILE, ['a', 'b'])).not.toBe(base);
    // 500 найновіших: довжина та сама, але останнє слово інше
    const full = Array.from({ length: 500 }, (_, i) => 'w' + i);
    expect(wodSignature(PROFILE, [...full.slice(1), 'fresh'])).not.toBe(wodSignature(PROFILE, full));
  });

  test('needsRefresh: another signature or languages, a legacy cache, or under a week left', () => {
    const sig = wodSignature(PROFILE, []);
    const words = Array.from({ length: 14 }, (_, i) => ({ date: day(i) }));
    const cache = { lang: 'en', native: 'uk', sig, words };
    expect(needsRefresh(cache, { lang: 'en', native: 'uk', sig })).toBe(false);
    expect(needsRefresh(cache, { lang: 'en', native: 'uk', sig: wodSignature({ ...PROFILE, level: 9 }, []) })).toBe(true);
    expect(needsRefresh(cache, { lang: 'de', native: 'uk', sig })).toBe(true);
    expect(needsRefresh({ lang: 'en', native: 'uk', words }, { lang: 'en', native: 'uk', sig })).toBe(true); // кеш v1.1
    expect(needsRefresh({ ...cache, words: words.slice(0, 6) }, { lang: 'en', native: 'uk', sig })).toBe(true);
  });

  test('the same profile is served from the cache; a new level or “I know” asks the server again', async () => {
    await syncWordOfDay(args());
    expect((await stored()).sig).toBe(wodSignature(PROFILE, []));
    await syncWordOfDay(args());
    expect(served).toHaveLength(1);

    const c = await syncWordOfDay(args({ profile: { ...PROFILE, level: 9 } }));
    expect(served).toHaveLength(2);
    expect(served[1].body.profile.level).toBe(9);

    const after = await syncWordOfDay(args({ profile: { ...PROFILE, level: 9 }, known: [c.words[0].source] }));
    expect(served).toHaveLength(3);
    expect(after.words[0].source).not.toBe(c.words[0].source);
    expect((await stored()).sig).toBe(wodSignature({ ...PROFILE, level: 9 }, [c.words[0].source]));
  });

  test('offline: the old cache stays, and the next launch with a connection refreshes it', async () => {
    const first = await syncWordOfDay(args());
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const offline = await syncWordOfDay(args({ known: ['liquidity'], force: true }));
    expect(offline).toEqual(first);
    serve();
    await syncWordOfDay(args({ known: ['liquidity'] })); // без force: підпис уже інший
    expect(served).toHaveLength(1);
    expect(served[0].body.known).toEqual(['liquidity']);
  });

  test('two quick “I know” in a row: the later answer is the one that stays', async () => {
    await syncWordOfDay(args());
    const a = syncWordOfDay(args({ known: ['liquidity'], force: true }));
    const b = syncWordOfDay(args({ known: ['liquidity', 'accrual'], force: true }));
    await Promise.all([a, b]);
    expect((await stored()).sig).toBe(wodSignature(PROFILE, ['liquidity', 'accrual']));
  });
});

describe('notifications', () => {
  test('the title names the topic of a personal word, a general word stays bare', () => {
    expect(notificationTitle({ word: 'liquidity', topic: 'finance' }, t)).toBe('Фінанси · liquidity');
    expect(notificationTitle({ word: 'apple', topic: 'general' }, t)).toBe('apple');
    expect(notificationTitle({ word: 'apple' }, null)).toBe('apple');
  });

  test('every future day is scheduled with its topic in the title', async () => {
    await syncWordOfDay(args({ enabled: true, hour: 23 }));
    const titles = Notifications.scheduleNotificationAsync.mock.calls.map(([n]) => n.content.title);
    expect(titles.length).toBeGreaterThanOrEqual(13);
    expect(titles.every((x) => x.startsWith('Фінанси · '))).toBe(true);
  });
});
