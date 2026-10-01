import AsyncStorage from '@react-native-async-storage/async-storage';
import { loadSettings, mergeSettings } from '../src/storage';

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
