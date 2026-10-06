import AsyncStorage from '@react-native-async-storage/async-storage';
import * as subscription from '../src/subscription';
import { canScan, canScene, canUseLanguage, COMPARISON, FREE, freeScans, freeScenes, loadUsage, PLANS, PRO_BENEFITS, scansLeft, scenesLeft, SIMULATED_PLANS } from '../src/subscription';
import { localDayKey } from '../src/storage';

beforeEach(() => AsyncStorage.clear());

// v1.3: безкоштовно — один скан за все життя запису, а не на день. Лічильник
// рахує сервер; клієнт лише памʼятає його відповідь і не обнуляє її з новим днем.
describe('the free scan is for life, not per day', () => {
  afterEach(() => jest.useRealTimers());

  test('a counter cached yesterday evening still blocks this morning, and a week later', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    jest.setSystemTime(new Date(2026, 9, 3, 22, 30));
    const cached = { day: localDayKey(), scans: 1, limit: 1, scenes: 0, sceneLimit: 1 };
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify(cached));
    expect(canScan({ pro: false, usage: cached })).toBe('scans');

    jest.setSystemTime(new Date(2026, 9, 4, 8, 0));
    expect(localDayKey()).not.toBe(cached.day);
    const morning = await loadUsage();
    expect(morning).toEqual(cached);
    expect(canScan({ pro: false, usage: morning })).toBe('scans');
    expect(scansLeft({ pro: false, usage: morning })).toBe(0);

    jest.setSystemTime(new Date(2026, 9, 11, 8, 0));
    const later = await loadUsage();
    expect(canScan({ pro: false, usage: later })).toBe('scans');
    expect(scansLeft({ pro: false, usage: later })).toBe(0);
    // Pro — без меж, хоч би що лежало в кеші
    expect(canScan({ pro: true, usage: later })).toBeNull();
    expect(scansLeft({ pro: true, usage: later })).toBe(Infinity);
  });

  test('the state kept in memory overnight blocks too: there is no day in the check', () => {
    const usage = { day: '2000-01-01', scans: 1 };
    expect(canScan({ pro: false, usage })).toBe('scans');
    expect(scansLeft({ pro: false, usage })).toBe(0);
  });

  test('a fresh install, before the server answers, has its one free scan', async () => {
    const usage = await loadUsage();
    expect(usage).toEqual({ scans: 0 });
    expect(canScan({ pro: false, usage })).toBeNull();
    expect(scansLeft({ pro: false, usage })).toBe(1);
  });

  test('a broken cache falls back to an empty counter instead of crashing', async () => {
    await AsyncStorage.setItem('ll_usage_v1', '{not json');
    expect(await loadUsage()).toEqual({ scans: 0 });
    await AsyncStorage.setItem('ll_usage_v1', 'null');
    expect(await loadUsage()).toEqual({ scans: 0 });
  });
});

test('the free scan used up opens the scans paywall', () => {
  expect(canScan({ pro: false, usage: { scans: FREE.scans } })).toBe('scans');
  expect(canScan({ pro: true, usage: { scans: 99 } })).toBeNull();
  expect(scansLeft({ pro: true, usage: {} })).toBe(Infinity);
});

// v1.2: «словник безкоштовний, скани платні» — стелі словника більше немає
test('the dictionary has no ceiling and no “words” wall', () => {
  expect(subscription.canSaveWord).toBeUndefined();
  expect(FREE.maxWords).toBeUndefined();
  expect(COMPARISON.map((r) => r.id)).not.toContain('words');
  expect(PRO_BENEFITS.map((b) => b.id)).not.toContain('words');
});

test('one free scan and one free scene for life, by default', () => {
  expect(FREE).toEqual({ scans: 1, scenes: 1, languagePairs: 1 });
  expect(FREE.scansPerDay).toBeUndefined();
  expect(canScan({ pro: false, usage: { scans: 1 } })).toBe('scans');
});

test('the comparison: scans, scenes and languages first, then what stays free', () => {
  expect(COMPARISON).toEqual([
    { id: 'scans', free: '1', pro: '∞' },
    { id: 'scene', free: '1', pro: '∞' },
    { id: 'langs', free: '1', pro: '29' },
    // v1.3 (план §5.12): слова дня й теми — з прапорців; картки, квіз і
    // віджети — один рядок
    { id: 'wodn', free: '1', pro: 5, upTo: true, fresh: true },
    { id: 'themes', free: false, none: true, pro: '4', fresh: true },
    { id: 'core', free: true, pro: true },
  ]);
  expect(PRO_BENEFITS.map((b) => b.id)).toEqual(['scans', 'scene', 'wodn', 'themes', 'langs', 'support']);
});

describe('scenes (a whole room in one shot)', () => {
  test('the free scene is gone once the server says so', () => {
    expect(canScene({ pro: false, usage: { scenes: 0, sceneLimit: 1 } })).toBeNull();
    expect(scenesLeft({ pro: false, usage: { scenes: 0, sceneLimit: 1 } })).toBe(1);
    expect(canScene({ pro: false, usage: { scenes: 1, sceneLimit: 1 } })).toBe('scene');
    expect(scenesLeft({ pro: false, usage: { scenes: 3, sceneLimit: 1 } })).toBe(0);
  });

  test('Pro, or sceneLimit null from the server, means no ceiling', () => {
    expect(canScene({ pro: true, usage: { scenes: 9, sceneLimit: 1 } })).toBeNull();
    expect(canScene({ pro: false, usage: { scenes: 9, sceneLimit: null } })).toBeNull();
    expect(scenesLeft({ pro: false, usage: { scenes: 9, sceneLimit: null } })).toBe(Infinity);
  });

  test('without a count from the server the client blocks nothing — the server decides', () => {
    expect(canScene({ pro: false, usage: { scans: 0, limit: 1 } })).toBeNull();
    expect(canScene({ pro: false, usage: undefined })).toBeNull();
  });

  test('the paywall shows the server’s free scene count', () => {
    expect(freeScenes({ sceneLimit: 2 })).toBe(2);
    expect(freeScenes({ sceneLimit: null })).toBe(FREE.scenes);
    expect(freeScenes(undefined)).toBe(FREE.scenes);
  });

  test('a new day resets neither the scans nor the scenes: both are for life', async () => {
    const old = { day: '2000-01-01', scans: 1, limit: 1, scenes: 1, sceneLimit: 1 };
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify(old));
    const usage = await loadUsage();
    expect(usage).toEqual(old);
    expect(canScan({ pro: false, usage })).toBe('scans');
    expect(canScene({ pro: false, usage })).toBe('scene');
  });
});

test('one learning language for free, switching back is always allowed', () => {
  const en = [{ lang: 'en' }, { lang: 'en' }];
  expect(canUseLanguage({ pro: false, words: [], nextLang: 'es' })).toBeNull();
  expect(canUseLanguage({ pro: false, words: en, nextLang: 'es' })).toBe('langs');
  expect(canUseLanguage({ pro: false, words: en, nextLang: 'en' })).toBeNull();
  expect(canUseLanguage({ pro: false, words: [...en, { lang: 'es' }], nextLang: 'en' })).toBeNull();
  expect(canUseLanguage({ pro: true, words: en, nextLang: 'ja' })).toBeNull();
});

// Стелю задає сервер (FREE_SCANS): для тестів її піднімають до тисячі,
// і клієнт не має різати на одному чи показувати хибне «лишилось N».
test('the free scan ceiling comes from the server', () => {
  expect(canScan({ pro: false, usage: { scans: 7, limit: 1000 } })).toBeNull();
  expect(scansLeft({ pro: false, usage: { scans: 7, limit: 1000 } })).toBe(993);
  expect(canScan({ pro: false, usage: { scans: 2, limit: 2 } })).toBe('scans');
  expect(scansLeft({ pro: false, usage: { scans: 1, limit: 2 } })).toBe(1);
  expect(freeScans({ limit: 2 })).toBe(2);
});

test('limit null means the server sees Pro: no ceiling', () => {
  expect(canScan({ pro: false, usage: { scans: 99, limit: null } })).toBeNull();
  expect(scansLeft({ pro: false, usage: { scans: 99, limit: null } })).toBe(Infinity);
  // у пейволі показуємо типову безкоштовну стелю, а не «null»
  expect(freeScans({ limit: null })).toBe(FREE.scans);
});

test('an old cached counter without a limit keeps the default ceiling', () => {
  expect(canScan({ pro: false, usage: { scans: FREE.scans } })).toBe('scans');
  expect(scansLeft({ pro: false, usage: { scans: 0 } })).toBe(FREE.scans);
  expect(freeScans(undefined)).toBe(FREE.scans);
});

// Кеш із часів денного ліміту (v1.2) лежить під тим самим ключем: скани
// ОДНОГО дня не можуть перевищити скани за все життя, тож він або блокує по
// праву, або недораховує — і тоді вирішить сервер (402, без виклику AI).
test('a cache left from the daily limit keeps its counter and the server limit', async () => {
  await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ day: '2000-01-01', scans: 4, limit: 1000 }));
  const usage = await loadUsage();
  expect(usage).toMatchObject({ scans: 4, limit: 1000 });
  expect(scansLeft({ pro: false, usage })).toBe(996);
});

test('every plan has a legal line for its own period; lifetime says it is not a subscription', () => {
  expect(PLANS.map((p) => p.legalKey)).toEqual(['trialLegalWeek', 'trialLegalMonth', 'trialLegalQuarter', 'trialLegalYear', 'lifetimeLegal']);
  const life = PLANS.find((p) => p.id === 'lifetime');
  expect(life).toMatchObject({ lifetime: true, labelKey: 'planLifetime' });
  expect(life.trialDays).toBeUndefined();
});

test('the simulated store shows the same grid as the default offering', () => {
  expect(SIMULATED_PLANS.map((p) => p.id)).toEqual(['month', 'year', 'lifetime']);
});
