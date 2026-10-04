// Слово дня під людину (src/wordOfDay.js): 14 днів через POST із профілем і
// «Знаю», кеш із підписом профілю, тема в заголовку сповіщення.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import {
  needsRefresh,
  notificationTitle,
  permissionStatus,
  scheduleTrialReminder,
  syncWordOfDay,
  trialReminderAt,
  wodSignature,
} from '../src/wordOfDay';
import { TRIAL_REMIND_DAYS } from '../src/subscription';
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

// Нагадування про кінець пробного періоду: пейвол обіцяє його «за 2 дні до
// кінця» (таймлайн: «День 5» для тижня), тож дата має бути саме така — і
// не вночі.
describe('trial-end reminder', () => {
  const DAY = 86400000;
  const at = (y, m, d, h, min = 0) => new Date(y, m - 1, d, h, min).getTime();
  const NOW = at(2026, 10, 4, 12);

  test('exactly 2 days before the end in the daytime', () => {
    expect(TRIAL_REMIND_DAYS).toBe(2);
    // пробний тиждень з 4 жовтня 14:30 → списання 11-го → нагадування 9-го о 14:30
    expect(trialReminderAt(at(2026, 10, 11, 14, 30), NOW)).toBe(at(2026, 10, 9, 14, 30));
  });

  test('a late-night purchase is reminded the same evening at 20:00, never later', () => {
    expect(trialReminderAt(at(2026, 10, 11, 23, 40), NOW)).toBe(at(2026, 10, 9, 20));
  });

  test('an early-morning purchase is reminded the evening before', () => {
    const r = trialReminderAt(at(2026, 10, 11, 2, 15), NOW);
    expect(r).toBe(at(2026, 10, 8, 20));
    expect(at(2026, 10, 11, 2, 15) - r).toBeGreaterThan(2 * DAY);
  });

  test('too late or no date: nothing to schedule; a short trial keeps the exact hour when the evening has passed', () => {
    expect(trialReminderAt(NOW + DAY, NOW)).toBeNull();
    expect(trialReminderAt(null, NOW)).toBeNull();
    // списання 7-го о 23:00 → мінус 2 дні — 5-те о 23:00, це ніч → 20:00 того ж дня
    expect(trialReminderAt(at(2026, 10, 7, 23), NOW)).toBe(at(2026, 10, 5, 20));
    // вечір того ж дня вже минув (зараз 21:00) — точна година, щоб не втратити нагадування
    expect(trialReminderAt(at(2026, 10, 6, 22, 30), at(2026, 10, 4, 21))).toBe(at(2026, 10, 4, 22, 30));
  });

  test('scheduled as a one-off date notification with the trial copy', async () => {
    Notifications.scheduleNotificationAsync.mockClear();
    const until = Date.now() + 7 * DAY;
    expect(await scheduleTrialReminder(until, 'Title', 'Body')).toBe(true);
    const [req] = Notifications.scheduleNotificationAsync.mock.calls[0];
    expect(req).toMatchObject({ identifier: 'trial-end', content: { title: 'Title', body: 'Body', data: { type: 'trial-end' } } });
    expect(req.trigger.type).toBe('date');
    expect(req.trigger.date.getTime()).toBe(trialReminderAt(until));
    expect(until - req.trigger.date.getTime()).toBeGreaterThanOrEqual(2 * DAY);
  });

  test('without permission — not scheduled', async () => {
    Notifications.scheduleNotificationAsync.mockClear();
    Notifications.getPermissionsAsync.mockImplementationOnce(async () => ({ status: 'denied', canAskAgain: false }));
    expect(await scheduleTrialReminder(Date.now() + 7 * DAY, 'T', 'B')).toBe(false);
    expect(Notifications.scheduleNotificationAsync).not.toHaveBeenCalled();
  });
});

describe('permission status for onboarding', () => {
  test('undetermined only while iOS can still ask', async () => {
    const cases = [
      [{ status: 'granted', canAskAgain: true }, 'granted'],
      [{ status: 'undetermined', canAskAgain: true }, 'undetermined'],
      [{ status: 'denied', canAskAgain: false }, 'denied'],
    ];
    for (const [p, want] of cases) {
      Notifications.getPermissionsAsync.mockImplementationOnce(async () => p);
      expect(await permissionStatus()).toBe(want);
    }
    Notifications.getPermissionsAsync.mockImplementationOnce(async () => {
      throw new Error('no module');
    });
    expect(await permissionStatus()).toBe('unavailable');
  });
});
