import { canSaveWord, canScan, canUseLanguage, FREE, scansLeft } from '../src/subscription';
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
