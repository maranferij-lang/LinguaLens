import AsyncStorage from '@react-native-async-storage/async-storage';
import { canSaveWord, canScan, canUseLanguage, FREE, freeScansPerDay, loadUsage, PLANS, scansLeft } from '../src/subscription';
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

test('dictionary ceiling', () => {
  expect(canSaveWord({ pro: false, wordCount: FREE.maxWords })).toBe('words');
  expect(canSaveWord({ pro: false, wordCount: FREE.maxWords - 1 })).toBeNull();
  expect(canSaveWord({ pro: true, wordCount: 10000 })).toBeNull();
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

test('every trial plan has a renewal line for its own period', () => {
  expect(PLANS.map((p) => p.legalKey)).toEqual(['trialLegalWeek', 'trialLegalMonth', 'trialLegalQuarter', 'trialLegalYear']);
});
