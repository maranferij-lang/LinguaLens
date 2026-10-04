import AsyncStorage from '@react-native-async-storage/async-storage';
import * as subscription from '../src/subscription';
import { canScan, canScene, canUseLanguage, COMPARISON, FREE, freeScansPerDay, freeScenes, loadUsage, PLANS, PRO_BENEFITS, scansLeft, scenesLeft, SIMULATED_PLANS } from '../src/subscription';
import { localDayKey } from '../src/storage';

const today = localDayKey();

test('yesterday’s counter does not block scans this morning', () => {
  expect(canScan({ pro: false, usage: { day: '2000-01-01', scans: FREE.scansPerDay } })).toBeNull();
  expect(scansLeft({ pro: false, usage: { day: '2000-01-01', scans: FREE.scansPerDay } })).toBe(FREE.scansPerDay);
});

test('the free daily limit opens the scans paywall', () => {
  expect(canScan({ pro: false, usage: { day: today, scans: FREE.scansPerDay } })).toBe('scans');
  expect(canScan({ pro: true, usage: { day: today, scans: 99 } })).toBeNull();
  expect(scansLeft({ pro: true, usage: {} })).toBe(Infinity);
});

// v1.2: «словник безкоштовний, скани платні» — стелі словника більше немає
test('the dictionary has no ceiling and no “words” wall', () => {
  expect(subscription.canSaveWord).toBeUndefined();
  expect(FREE.maxWords).toBeUndefined();
  expect(COMPARISON.map((r) => r.id)).not.toContain('words');
  expect(PRO_BENEFITS.map((b) => b.id)).not.toContain('words');
});

test('one free scan a day and one free scene for life, by default', () => {
  expect(FREE).toEqual({ scansPerDay: 1, scenes: 1, languagePairs: 1 });
  expect(canScan({ pro: false, usage: { day: today, scans: 1 } })).toBe('scans');
});

test('the comparison: scans, scenes and languages first, then what stays free', () => {
  expect(COMPARISON).toEqual([
    { id: 'scans', free: '1', pro: '∞' },
    { id: 'scene', free: '1', pro: '∞' },
    { id: 'langs', free: '1', pro: '29' },
    { id: 'wod', free: true, pro: true },
    { id: 'srs', free: true, pro: true },
    { id: 'speech', free: true, pro: true },
  ]);
  expect(PRO_BENEFITS.map((b) => b.id)).toEqual(['scans', 'scene', 'langs', 'support']);
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
    expect(canScene({ pro: false, usage: { day: today, scans: 0, limit: 1 } })).toBeNull();
    expect(canScene({ pro: false, usage: undefined })).toBeNull();
  });

  test('the paywall shows the server’s free scene count', () => {
    expect(freeScenes({ sceneLimit: 2 })).toBe(2);
    expect(freeScenes({ sceneLimit: null })).toBe(FREE.scenes);
    expect(freeScenes(undefined)).toBe(FREE.scenes);
  });

  test('a new day resets the daily scans but not the lifetime scenes', async () => {
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ day: '2000-01-01', scans: 1, limit: 1, scenes: 1, sceneLimit: 1 }));
    expect(await loadUsage()).toEqual({ day: today, scans: 0, limit: 1, scenes: 1, sceneLimit: 1 });
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

// Стелю задає сервер (FREE_SCANS_PER_DAY): для тестів її піднімають до тисячі,
// і клієнт не має різати на п'яти чи показувати хибне «лишилось N».
test('the daily scan limit comes from the server', () => {
  expect(canScan({ pro: false, usage: { day: today, scans: 7, limit: 1000 } })).toBeNull();
  expect(scansLeft({ pro: false, usage: { day: today, scans: 7, limit: 1000 } })).toBe(993);
  expect(canScan({ pro: false, usage: { day: today, scans: 2, limit: 2 } })).toBe('scans');
  expect(scansLeft({ pro: false, usage: { day: today, scans: 1, limit: 2 } })).toBe(1);
  expect(freeScansPerDay({ limit: 2 })).toBe(2);
});

test('limit null means the server sees Pro: no ceiling', () => {
  expect(canScan({ pro: false, usage: { day: today, scans: 99, limit: null } })).toBeNull();
  expect(scansLeft({ pro: false, usage: { day: today, scans: 99, limit: null } })).toBe(Infinity);
  // у пейволі показуємо типову безкоштовну стелю, а не «null»
  expect(freeScansPerDay({ limit: null })).toBe(FREE.scansPerDay);
});

test('an old cached counter without a limit keeps the default ceiling', () => {
  expect(canScan({ pro: false, usage: { day: today, scans: FREE.scansPerDay } })).toBe('scans');
  expect(scansLeft({ pro: false, usage: { day: today, scans: 1 } })).toBe(FREE.scansPerDay - 1);
  expect(freeScansPerDay(undefined)).toBe(FREE.scansPerDay);
});

test('a new day resets the counter but keeps the server limit', async () => {
  await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ day: '2000-01-01', scans: 4, limit: 1000 }));
  expect(await loadUsage()).toEqual({ day: today, scans: 0, limit: 1000 });
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
