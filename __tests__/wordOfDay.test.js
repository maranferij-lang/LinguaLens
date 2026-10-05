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

// ── v1.3: Pro — кілька слів на день (слоти) ──
describe('several words a day (Pro slots)', () => {
  const {
    PAST_DAYS,
    WOD_NOTIFY_CAP,
    defaultSlotHours,
    notificationPlan,
    slotHours,
    todayFrom,
    todaySlots,
    wodPerDay,
  } = require('../src/wordOfDay');

  // Сервер v1.3: perDay слів на день (без Pro — 1), не більше 42 слів
  function servePerDay({ pro = true, legacy = false } = {}) {
    served = [];
    global.fetch = jest.fn(async (url, init = {}) => {
      const body = init.body ? JSON.parse(init.body) : null;
      served.push({ path: new URL(url).pathname, method: init.method || 'GET', body });
      const perDay = pro && body?.perDay ? body.perDay : 1;
      const days = Math.min(body?.days || 7, Math.floor(42 / perDay));
      const words = [];
      for (let i = 0; i < days; i++) {
        for (let s = 0; s < perDay; s++) {
          const w = { date: day(i), word: `w${i}-${s}`, translation: 'tr', source: `w${i}-${s}`, topic: 'general' };
          words.push(legacy ? w : { ...w, slot: s });
        }
      }
      return { ok: true, status: 200, json: async () => (legacy ? { words } : { words, perDay }) };
    });
  }

  test('wodPerDay and the slot hours: 1 without Pro, 3 or 5 with it, rising hours from the first', () => {
    expect(wodPerDay({ wodPerDay: 5 }, false)).toBe(1);
    expect(wodPerDay({ wodPerDay: 5 }, true)).toBe(5);
    expect(wodPerDay({ wodPerDay: 4 }, true)).toBe(1);
    expect(wodPerDay({}, true)).toBe(1);

    expect(defaultSlotHours(1, 10)).toEqual([10]);
    expect(defaultSlotHours(3, 10)).toEqual([10, 16, 21]);
    expect(defaultSlotHours(5, 10)).toEqual([10, 13, 16, 18, 21]);
    expect(defaultSlotHours(5, 8)).toEqual([8, 11, 15, 18, 21]);
    // пізня перша година — крок у годину, до 23:00
    expect(defaultSlotHours(3, 20)).toEqual([20, 21, 22]);
    expect(defaultSlotHours(5, 20)).toEqual([19, 20, 21, 22, 23]);
    for (let first = 0; first < 24; first++) {
      for (const n of [3, 5]) {
        const h = defaultSlotHours(n, first);
        expect(h).toHaveLength(n);
        h.forEach((x, i) => {
          expect(Number.isInteger(x) && x >= 0 && x <= 23).toBe(true);
          if (i) expect(x).toBeGreaterThan(h[i - 1]);
        });
      }
    }

    expect(slotHours({ wodHour: 8, wodPerDay: 3, wodHours: null }, true)).toEqual([8, 15, 21]);
    expect(slotHours({ wodHour: 8, wodPerDay: 3, wodHours: [9, 12, 19] }, true)).toEqual([8, 12, 19]);
    // години не зростають (слово 1 пізніше за слово 2) — стартові
    expect(slotHours({ wodHour: 13, wodPerDay: 3, wodHours: [9, 12, 19] }, true)).toEqual([13, 17, 21]);
    expect(slotHours({ wodHour: 8, wodPerDay: 3, wodHours: [8, 12, 19] }, false)).toEqual([8]);
    expect(slotHours({ wodHour: 'x', wodPerDay: 1 }, true)).toEqual([10]);
  });

  test('perDay goes to the server only above 1; the cache keeps slots, perDay and the days it got', async () => {
    servePerDay();
    const c = await syncWordOfDay(args({ hours: [9, 14, 19] }));
    expect(served[0].body.perDay).toBe(3);
    expect(c).toMatchObject({ perDay: 3, asked: 3, days: 14 });
    expect(c.words).toHaveLength(42);
    expect(c.words.slice(0, 3).map((w) => w.slot)).toEqual([0, 1, 2]);

    await AsyncStorage.clear();
    servePerDay();
    await syncWordOfDay(args({ hours: [9] }));
    expect(served[0].body).not.toHaveProperty('perDay');

    await AsyncStorage.clear();
    servePerDay();
    const five = await syncWordOfDay(args({ hours: [9, 11, 14, 17, 20] }));
    expect(five).toMatchObject({ perDay: 5, days: 8 });
  });

  test('an old server (GET or no slots) means one word a day', async () => {
    servePerDay({ legacy: true });
    const c = await syncWordOfDay(args({ hours: [9, 14, 19] }));
    expect(c.perDay).toBe(1);
    expect(c.words.every((w) => w.slot === 0)).toBe(true);
    expect(new Set(c.words.map((w) => w.date)).size).toBe(c.words.length);
  });

  test('needsRefresh: a different number of words a day, but a short answer is retried only every 10 minutes', () => {
    const sig = wodSignature(PROFILE, []);
    const words = Array.from({ length: 14 }, (_, i) => ({ date: day(i), slot: 0 }));
    const now = Date.now();
    const want = (perDay) => ({ lang: 'en', native: 'uk', sig, perDay });
    const one = { lang: 'en', native: 'uk', sig, perDay: 1, asked: 1, words, fetchedAt: now };
    expect(needsRefresh(one, want(1), now)).toBe(false);
    expect(needsRefresh(one, want(3), now)).toBe(true);
    // просили 3, сервер дав 1 (RevenueCat ще не знає про покупку)
    const short = { ...one, asked: 3 };
    expect(needsRefresh(short, want(3), now + 60000)).toBe(false);
    expect(needsRefresh(short, want(3), now + 10 * 60000)).toBe(true);
    // Pro скінчився: кеш на 3 слова, тепер треба 1
    expect(needsRefresh({ ...one, perDay: 3, asked: 3 }, want(1), now)).toBe(true);
    // 5 на день — 8 днів; оновлюємо, коли лишилось менше 4
    const eight = { ...one, perDay: 5, asked: 5, days: 8, words: words.slice(0, 4) };
    expect(needsRefresh(eight, want(5), now)).toBe(false);
    expect(needsRefresh({ ...eight, words: words.slice(0, 3) }, want(5), now)).toBe(true);
    // минулі дні й додаткові слоти не рахуються як «запас»
    const past = Array.from({ length: 6 }, (_, i) => ({ date: day(-1 - i), slot: 0 }));
    const extra = words.slice(0, 6).map((w) => ({ ...w, slot: 1 }));
    expect(needsRefresh({ ...one, words: [...past, ...extra, ...words.slice(0, 6)] }, want(1), now)).toBe(true);
  });

  test('the past week survives a refresh for the same languages (for the large widget)', async () => {
    const old = Array.from({ length: 10 }, (_, i) => ({ date: day(i - 9), word: 'old' + i, slot: 0 }));
    const slotWord = { date: day(-2), word: 'extra', slot: 1 };
    await AsyncStorage.setItem('ll_wod_v1', JSON.stringify({ lang: 'en', native: 'uk', sig: 'other', words: [...old, slotWord] }));
    servePerDay();
    const c = await syncWordOfDay(args());
    const past = c.words.filter((w) => w.date < TODAY);
    expect(past.map((w) => w.date)).toEqual(Array.from({ length: PAST_DAYS }, (_, i) => day(i - PAST_DAYS)));
    expect(past.every((w) => w.slot === 0)).toBe(true);
    expect(todayFrom(c).word).toBe('w0-0');

    // інша пара мов — минулого не беремо
    servePerDay();
    const de = await syncWordOfDay(args({ lang: 'de' }));
    expect(de.words.some((w) => w.date < TODAY)).toBe(false);
  });

  // «Знаю» на слові дня: сервер будує план без нього наново, і сьогоднішні
  // слова зсуваються (як list[j % len] у wordplan). Міняється лише це слово —
  // уже відкриті сьогодні інші (слот 0 людина могла й зберегти) лишаються.
  describe('“I know it” replaces only that word of today', () => {
    afterEach(() => jest.useRealTimers());
    function serveShifting() {
      served = [];
      global.fetch = jest.fn(async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        served.push({ path: new URL(url).pathname, method: init.method || 'GET', body });
        const known = new Set(body?.known || []);
        const pool = Array.from({ length: 10 }, (_, i) => 'p' + i).filter((w) => !known.has(w));
        const words = [];
        for (let i = 0; i < 14; i++) {
          for (let s = 0; s < body.perDay; s++) {
            const w = pool[(3 + i * 5 + s * 4) % pool.length];
            words.push({ date: day(i), slot: s, word: w, translation: 'tr', source: w, topic: 'general' });
          }
        }
        return { ok: true, status: 200, json: async () => ({ words, perDay: body.perDay }) };
      });
    }
    const todayWords = (c) =>
      c.words
        .filter((w) => w.date === localDayKey())
        .sort((a, b) => a.slot - b.slot)
        .map((w) => w.word);
    const HOURS = [10, 16, 21];

    test('at 21:30 “I know it” on word 3: words 1 and 2 stay, word 3 is new and not a repeat', async () => {
      jest.useFakeTimers({ now: new Date(2026, 9, 8, 21, 30), doNotFake: ['nextTick', 'setImmediate'] });
      serveShifting();
      const first = await syncWordOfDay(args({ hours: HOURS }));
      expect(todayWords(first)).toEqual(['p3', 'p7', 'p1']);
      const c = await syncWordOfDay(args({ hours: HOURS, known: ['p1'], force: true, knownSlot: 2 }));
      const today = todayWords(c);
      expect(today.slice(0, 2)).toEqual(['p3', 'p7']);
      expect(today).toHaveLength(3);
      expect(new Set(today).size).toBe(3);
      expect(today[2]).not.toBe('p1');
      // наступні дні — уже з нового плану (без «Знаю»)
      expect(c.words.find((w) => w.date === day(1) && w.slot === 0).word).toBe('p9');
    });

    test('back on word 2 at 21:30: words 1 and 3 stay; in the morning the unopened ones may change', async () => {
      jest.useFakeTimers({ now: new Date(2026, 9, 8, 21, 30), doNotFake: ['nextTick', 'setImmediate'] });
      serveShifting();
      await syncWordOfDay(args({ hours: HOURS }));
      const c = await syncWordOfDay(args({ hours: HOURS, known: ['p7'], force: true, knownSlot: 1 }));
      const today = todayWords(c);
      expect([today[0], today[2]]).toEqual(['p3', 'p1']);
      expect(today[1]).not.toBe('p7');
      expect(new Set(today).size).toBe(3);

      // 11:00: відкрито лише слово 1 — «Знаю» на ньому, решта ще не бачена:
      // день — просто новий план сервера
      jest.setSystemTime(new Date(2026, 9, 9, 11, 0));
      await AsyncStorage.clear();
      expect(todayWords(await syncWordOfDay(args({ hours: HOURS })))).toEqual(['p3', 'p7', 'p1']);
      const morning = await syncWordOfDay(args({ hours: HOURS, known: ['p3'], force: true, knownSlot: 0 }));
      expect(todayWords(morning)).toEqual(['p4', 'p8', 'p2']);
    });
  });

  test('todayFrom is slot 0; todaySlots opens slot s at hours[s] and names the next one', () => {
    const at = (h, m = 0) => {
      const d = new Date();
      d.setHours(h, m, 0, 0);
      return d;
    };
    const words = [0, 1, 2].map((s) => ({ date: TODAY, word: 'w' + s, slot: s }));
    const cache = { words: [{ date: day(1), word: 'tomorrow', slot: 0 }, ...words.reverse()] };
    expect(todayFrom(cache).word).toBe('w0');
    const hours = [9, 14, 19];
    expect(todaySlots(cache, hours, at(8))).toMatchObject({ n: 3, next: { slot: 1, hour: 14 } });
    expect(todaySlots(cache, hours, at(8)).open.map((w) => [w.word, w.slot, w.hour])).toEqual([['w0', 0, 9]]);
    expect(todaySlots(cache, hours, at(13, 59)).open).toHaveLength(1);
    expect(todaySlots(cache, hours, at(14)).open.map((w) => w.word)).toEqual(['w0', 'w1']);
    expect(todaySlots(cache, hours, at(14)).next).toEqual({ slot: 2, hour: 19 });
    expect(todaySlots(cache, hours, at(23))).toMatchObject({ n: 3, next: null });
    expect(todaySlots(cache, hours, at(23)).open).toHaveLength(3);
    // Pro скінчився — одна година, один слот
    expect(todaySlots(cache, [9], at(23))).toMatchObject({ n: 1, next: null });
    // кеш без сьогодні
    expect(todaySlots({ words: [] }, hours, at(10))).toEqual({ n: 0, open: [], next: null });
    expect(todaySlots(null, hours, at(10))).toEqual({ n: 0, open: [], next: null });
  });

  test('notifications: one per slot at its hour, slot ids, data.slot, never more than 56', async () => {
    servePerDay();
    await syncWordOfDay(args({ enabled: true, hours: [9, 14, 23] }));
    const calls = Notifications.scheduleNotificationAsync.mock.calls.map(([n]) => n);
    expect(calls.length).toBeGreaterThan(30);
    expect(calls.length).toBeLessThanOrEqual(42);
    const tomorrow = calls.filter((n) => n.content.data.date === day(1));
    expect(tomorrow.map((n) => n.identifier)).toEqual([`wod-${day(1)}`, `wod-${day(1)}-1`, `wod-${day(1)}-2`]);
    expect(tomorrow.map((n) => n.trigger.date.getHours())).toEqual([9, 14, 23]);
    expect(tomorrow.map((n) => n.content.data)).toEqual([0, 1, 2].map((slot) => ({ type: 'word-of-day', date: day(1), slot })));
    const times = calls.map((n) => n.trigger.date.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // 5 на день на 14 днів дали б 70 — плануємо 56 найближчих
    const cache = { words: [] };
    for (let i = 0; i < 14; i++) for (let s = 0; s < 5; s++) cache.words.push({ date: day(i + 1), word: 'x', slot: s });
    const plan = notificationPlan(cache, [8, 11, 14, 17, 20]);
    expect(WOD_NOTIFY_CAP).toBe(56);
    expect(plan).toHaveLength(56);
    expect(plan[0].identifier).toBe(`wod-${day(1)}`);
    expect(plan.map((p) => p.date)).toEqual(Array.from({ length: 56 }, (_, i) => day(1 + Math.floor(i / 5))));
    // менше годин, ніж слотів у кеші: зайві слоти не плануємо
    expect(notificationPlan(cache, [8]).every((p) => p.slot === 0)).toBe(true);
    // стара сигнатура: одна година числом
    expect(notificationPlan(cache, 9)).toHaveLength(14);
  });
});
