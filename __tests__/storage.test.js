import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearLocalData,
  clearOnboardingDraft,
  loadOnboardingDraft,
  loadSettings,
  mergeSettings,
  persistOnboardingDraft,
} from '../src/storage';

const EN_PHONE = { nativeLang: 'en', targetLang: 'es', theme: 'system' };
const UK_PHONE = { nativeLang: 'uk', targetLang: 'en', theme: 'system' };

beforeEach(() => AsyncStorage.clear());

test('fresh install: nothing stored, so the phone language decides', async () => {
  const st = await loadSettings();
  expect(st).toEqual({});
  expect(mergeSettings(EN_PHONE, st)).toEqual(EN_PHONE);
});

test('stored choices still win', async () => {
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'de', targetLang: 'ja', theme: 'dark' }));
  expect(mergeSettings(EN_PHONE, await loadSettings())).toEqual({ nativeLang: 'de', targetLang: 'ja', theme: 'dark' });
});

test('never English → English after the merge', () => {
  // старий запис лише з мовою навчання на англомовному телефоні
  expect(mergeSettings(EN_PHONE, { targetLang: 'en' })).toMatchObject({ nativeLang: 'en', targetLang: 'es' });
  // запис, де пара вже зіпсована
  expect(mergeSettings(EN_PHONE, { nativeLang: 'en', targetLang: 'en' })).toMatchObject({ nativeLang: 'en', targetLang: 'es' });
  // рідну обрали ту, що типово вчать, — міняємо місцями, як saveSetting
  expect(mergeSettings(UK_PHONE, { nativeLang: 'en' })).toMatchObject({ nativeLang: 'en', targetLang: 'uk' });
});

// Чернетка недопройденого онбордингу: крок, варіант і відповіді лежать на
// телефоні, поки знайомство не скінчилось. Зіпсований запис — як нічого.
describe('onboarding draft', () => {
  const DRAFT = { phase: 'wow', variant: 'control', name: 'Олена', goals: ['travel'], level: 5 };

  test('saved, read back and cleared', async () => {
    expect(await loadOnboardingDraft()).toBeNull();
    await persistOnboardingDraft(DRAFT);
    expect(await loadOnboardingDraft()).toEqual(DRAFT);
    await clearOnboardingDraft();
    expect(await loadOnboardingDraft()).toBeNull();
    await AsyncStorage.setItem('ll_onb_draft_v1', '{oops');
    expect(await loadOnboardingDraft()).toBeNull();
  });

  // У чернетці імʼя й відповіді — «Стерти мої дані» прибирає й її
  test('“Erase my data” takes it too', async () => {
    await persistOnboardingDraft(DRAFT);
    await clearLocalData();
    expect(await loadOnboardingDraft()).toBeNull();
  });
});
