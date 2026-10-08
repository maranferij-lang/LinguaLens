// Варіанти мов (src/langVariants.js): англійська США / Британії, іспанська
// Іспанії / Латинської Америки. Мова слова — базовий код усюди, варіант —
// уподобання людини: прапорець, голос, що просимо в сервера. За
// замовчуванням англійська — США, іспанська — латиноамериканська в обох
// Америках і іспанська Іспанії деінде; «моя мова» — так само з регіону.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Speech from 'expo-speech';
import App from '../App';
import SettingsScreen from '../src/SettingsScreen';
import LangSheet from '../src/LangSheet';
import FlashcardsScreen from '../src/FlashcardsScreen';
import {
  VARIANTS,
  defaultVariant,
  expandOptions,
  isVariant,
  nativeVariantOf,
  optionKey,
  parseOption,
  pickVariant,
  setChosenVariants,
  variantFields,
  variantOf,
} from '../src/langVariants';
import { flagFor, loadVoices, nameFor, resetVoices, speak, ttsFor } from '../src/speech';
import { optionLabel, optionMatches, variantLabel, langSections } from '../src/langPick';
import { apiWordOfDay, recognizeImage, recognizeScene } from '../src/api';
import { needsRefresh, samePair, wodSignature } from '../src/wordOfDay';
import { STRINGS, makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { ACHIEVEMENTS } from '../src/achievements';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}), getAvailableVoicesAsync: jest.fn(async () => []) }));

const uk = makeT('uk');
const en = makeT('en');
const de = makeT('de');
const es = makeT('es');
const ru = makeT('ru');
const locales = (...tags) =>
  tags.map((tag) => {
    const [code, region = null] = tag.split('-');
    return { languageTag: tag, languageCode: code, regionCode: region, languageRegionCode: region };
  });
const setPhone = (...tags) => require('expo-localization').__setLocales(tags, { silent: true });

beforeEach(() => {
  setPhone('en-US');
  setChosenVariants({}, locales('en-US'));
  resetVoices();
});

describe('defaults', () => {
  test('English is American; Spanish is Latin American in the Americas and Spain’s elsewhere', () => {
    for (const region of ['UA', 'GB', 'DE', 'ES', 'PL', 'MX', 'US', 'AR', 'CA', 'BR']) {
      expect([region, defaultVariant('en', locales('uk-' + region))]).toEqual([region, 'us']);
    }
    for (const region of ['US', 'MX', 'AR', 'CO', 'CA', 'PR', 'BR', 'CL']) {
      expect([region, defaultVariant('es', locales('es-' + region))]).toEqual([region, 'latam']);
    }
    for (const region of ['ES', 'UA', 'DE', 'GB', 'FR']) {
      expect([region, defaultVariant('es', locales('es-' + region))]).toEqual([region, 'es']);
    }
    // регіону немає зовсім — перший варіант
    expect(defaultVariant('es', locales('es'))).toBe('es');
    expect(defaultVariant('es', [])).toBe('es');
    // мова без варіантів
    expect(defaultVariant('de', locales('de-DE'))).toBeNull();
  });

  test('the chosen variant wins when the language has it; junk falls back to the default', () => {
    const at = locales('uk-UA');
    expect(pickVariant('en', { en: 'gb' }, at)).toBe('gb');
    expect(pickVariant('en', { en: 'latam' }, at)).toBe('us');
    expect(pickVariant('es', { en: 'gb' }, at)).toBe('es');
    for (const junk of [null, undefined, 'gb', [], { en: 42 }, { en: 'constructor' }]) expect(pickVariant('en', junk, at)).toBe('us');
    expect(pickVariant('de', { de: 'us' }, at)).toBeNull();
  });

  test('the registry: chosen variants for every screen, the native one from the region only', () => {
    setChosenVariants({ en: 'gb' }, locales('uk-MX'));
    expect(variantOf('en')).toBe('gb');
    expect(variantOf('es')).toBe('latam');
    expect(variantOf('de')).toBeNull();
    // «моя мова» не бере вибору мови навчання
    expect(nativeVariantOf('en')).toBe('us');
    expect(nativeVariantOf('es')).toBe('latam');
    setChosenVariants('junk', locales('uk-UA'));
    expect(variantOf('en')).toBe('us');
    expect(variantOf('es')).toBe('es');
  });

  // Вчити англійську — американську всюди; а переклади для англомовного з
  // Британії, Ірландії, Австралії чи Нової Зеландії — британські (colour,
  // flat), не американські
  test('my language: English from the UK, Ireland, Australia or New Zealand is British; learning English stays American', () => {
    for (const region of ['GB', 'IE', 'AU', 'NZ']) {
      expect([region, nativeVariantOf('en', locales('en-' + region))]).toEqual([region, 'gb']);
      expect([region, defaultVariant('en', locales('en-' + region))]).toEqual([region, 'us']);
    }
    for (const region of ['US', 'CA', 'UA', 'DE']) expect([region, nativeVariantOf('en', locales('en-' + region))]).toEqual([region, 'us']);
    expect(nativeVariantOf('en', [])).toBe('us');
    // іспанська — як і була
    expect(nativeVariantOf('es', locales('es-MX'))).toBe('latam');
    expect(nativeVariantOf('es', locales('es-GB'))).toBe('es');
    // з регістру: так рахують запити застосунку
    setChosenVariants({}, locales('en-GB'));
    expect(nativeVariantOf('en')).toBe('gb');
    expect(variantOf('en')).toBe('us');
    expect(variantFields('es', 'en')).toEqual({ variant: 'es', nativeVariant: 'gb' });
  });

  test('list keys: a row per variant, a plain code for the rest', () => {
    expect(expandOptions(['de', 'en', 'es'])).toEqual(['de', 'en-us', 'en-gb', 'es-es', 'es-latam']);
    expect(optionKey('en', 'gb')).toBe('en-gb');
    expect(optionKey('en', 'latam')).toBe('en');
    expect(optionKey('de', null)).toBe('de');
    expect(parseOption('es-latam')).toEqual({ code: 'es', variant: 'latam' });
    expect(parseOption('de')).toEqual({ code: 'de', variant: null });
    expect(parseOption('en-xx')).toEqual({ code: 'en-xx', variant: null });
    expect(isVariant('en', 'gb')).toBe(true);
    expect(isVariant('en', 'es')).toBe(false);
    // кожен варіант має прапорець, голос і ендонім
    for (const [code, list] of Object.entries(VARIANTS)) {
      for (const v of list) expect([code, v.id, !!v.flag, /^[a-z]{2}-[A-Z]{2}$/.test(v.tts), v.name.length > 0]).toEqual([code, v.id, true, true, true]);
    }
  });
});

describe('flags, names and voices', () => {
  test('the flag and the voice follow the chosen variant; the name stays the language unless asked', () => {
    expect(flagFor('en')).toBe('🇺🇸');
    expect(flagFor('es')).toBe('🇲🇽'); // телефон у регіоні США
    expect(flagFor('de')).toBe('🇩🇪');
    setChosenVariants({ en: 'gb', es: 'es' }, locales('en-US'));
    expect(flagFor('en')).toBe('🇬🇧');
    expect(flagFor('es')).toBe('🇪🇸');
    expect(flagFor('en', 'us')).toBe('🇺🇸');
    expect(nameFor('en')).toBe('English');
    expect(nameFor('en', 'gb')).toBe('English (UK)');
    expect(nameFor('es', 'latam')).toBe('Español (Latinoamérica)');
    expect(nameFor('de', 'gb')).toBe('Deutsch');
    speak('flat', 'en');
    expect(Speech.speak).toHaveBeenLastCalledWith('flat', expect.objectContaining({ language: 'en-GB' }));
    speak('la taza', 'es', 'latam');
    expect(Speech.speak).toHaveBeenLastCalledWith('la taza', expect.objectContaining({ language: 'es-MX' }));
    speak('die Tasse', 'de');
    expect(Speech.speak).toHaveBeenLastCalledWith('die Tasse', expect.objectContaining({ language: 'de-DE' }));
  });

  test('a variant voice missing on the phone: another tag of the variant, then the base voice', async () => {
    Speech.getAvailableVoicesAsync.mockResolvedValueOnce([
      { identifier: 'a', language: 'es-US' },
      { identifier: 'b', language: 'es-ES' },
      { identifier: 'c', language: 'en_US' },
    ]);
    await loadVoices();
    expect(ttsFor('es', 'latam')).toBe('es-US');
    expect(ttsFor('es', 'es')).toBe('es-ES');
    expect(ttsFor('en', 'gb')).toBe('en-US');
    expect(ttsFor('en', 'us')).toBe('en-US');
    resetVoices();
    Speech.getAvailableVoicesAsync.mockResolvedValueOnce([{ identifier: 'b', language: 'es-ES' }]);
    await loadVoices();
    expect(ttsFor('es', 'latam')).toBe('es-ES');
    speak('la taza', 'es', 'latam');
    expect(Speech.speak).toHaveBeenLastCalledWith('la taza', expect.objectContaining({ language: 'es-ES' }));
  });

  test('voices not known yet (or an empty list on the web): the variant voice as is', async () => {
    expect(ttsFor('es', 'latam')).toBe('es-MX');
    Speech.getAvailableVoicesAsync.mockResolvedValueOnce([]);
    await loadVoices();
    expect(ttsFor('en', 'gb')).toBe('en-GB');
  });
});

describe('names in the interface language', () => {
  test('the language as everywhere, the region in brackets as it is written', () => {
    expect(variantLabel('en', 'us', uk, 'uk')).toBe('англійська (США)');
    expect(variantLabel('en', 'gb', uk, 'uk', { capital: true })).toBe('Англійська (Британія)');
    expect(variantLabel('es', 'es', uk, 'uk')).toBe('іспанська (Іспанія)');
    expect(variantLabel('es', 'latam', uk, 'uk')).toBe('іспанська (Латинська Америка)');
    expect(variantLabel('en', 'gb', en, 'en')).toBe('English (UK)');
    expect(variantLabel('es', 'latam', de, 'de')).toBe('Spanisch (Lateinamerika)');
    expect(variantLabel('en', 'us', es, 'es')).toBe('inglés (EE. UU.)');
    expect(optionLabel('es-latam', es, 'es')).toBe('español (Latinoamérica)');
    expect(optionLabel('de', uk, 'uk')).toBe('німецька');
    // російською, як і українською: мова з малої посеред рядка, регіон з великої
    expect(variantLabel('en', 'us', ru, 'ru')).toBe('английский (США)');
    expect(variantLabel('en', 'gb', ru, 'ru', { capital: true })).toBe('Английский (Великобритания)');
    expect(optionLabel('es-es', ru, 'ru')).toBe('испанский (Испания)');
    expect(optionLabel('es-latam', ru, 'ru', { capital: true })).toBe('Испанский (Латинская Америка)');
    // кожен регіон є в п'яти мовах інтерфейсу
    for (const l of ['en', 'uk', 'de', 'es', 'ru']) {
      for (const list of Object.values(VARIANTS)) for (const v of list) expect(STRINGS[l]['langRegion_' + v.id]).toBeTruthy();
    }
  });

  test('search: the language finds both rows, the region only its own', () => {
    expect(optionMatches('en-gb', 'brit', en)).toBe(true);
    expect(optionMatches('en-us', 'brit', en)).toBe(false);
    expect(optionMatches('es-latam', 'латин', uk)).toBe(true);
    expect(optionMatches('es-latam', 'mex', uk)).toBe(true);
    expect(optionMatches('es-es', 'mex', uk)).toBe(false);
    expect(optionMatches('es-es', 'españa', en)).toBe(true);
    expect(langSections({ native: 'uk', query: 'англ', t: uk, ui: 'uk', variants: true })).toEqual({ results: ['en-us', 'en-gb'] });
    const s = langSections({ native: 'uk', t: uk, ui: 'uk', variants: true });
    expect(s.popular).toEqual(['en-us', 'en-gb', 'de', 'pl', 'es-es', 'es-latam', 'fr', 'it']);
    expect(s.all).not.toContain('en-us');
    expect(s.all.length + s.popular.length).toBe(31);
  });
});

describe('requests', () => {
  const sent = () => JSON.parse(global.fetch.mock.calls.at(-1)[1].body);
  beforeEach(() => {
    global.fetch = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ word: 'mug', objects: [{ word: 'mug', box: [1, 1, 500, 500] }], words: [] }) }));
  });
  afterEach(() => {
    delete global.fetch;
  });

  test('a scan carries the chosen variant and the native one from the region; other languages send nothing new', async () => {
    setChosenVariants({ en: 'gb' }, locales('es-MX'));
    await recognizeImage('b64', 'en', 'es');
    expect(sent()).toMatchObject({ lang: 'en', nativeLang: 'es', variant: 'gb', nativeVariant: 'latam' });
    await recognizeScene('b64', 'es', 'uk');
    expect(sent()).toMatchObject({ lang: 'es', nativeLang: 'uk', variant: 'latam', mode: 'scene' });
    expect('nativeVariant' in sent()).toBe(false);
    await recognizeImage('b64', 'de', 'uk');
    expect(sent()).toEqual({ image: 'b64', lang: 'de', nativeLang: 'uk' });
    // явні варіанти перекривають обрані
    await recognizeImage('b64', 'en', 'uk', undefined, { variant: 'us' });
    expect(sent().variant).toBe('us');
    expect(variantFields('en', 'es', { variant: 'xx', nativeVariant: 'gb' })).toEqual({});
  });

  test('the word of the day: variants in the body and in the old GET', async () => {
    await apiWordOfDay({ days: 3, lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'gb' });
    expect(sent()).toMatchObject({ lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'gb' });
    // сервер без POST (404) — старий GET
    global.fetch = jest.fn(async (url, init = {}) => {
      const post = init.method === 'POST';
      return { ok: !post, status: post ? 404 : 200, json: async () => ({ words: [] }) };
    });
    await apiWordOfDay({ days: 3, lang: 'en', native: 'uk', variant: 'gb' });
    const get = global.fetch.mock.calls.at(-1)[0];
    expect(get).toContain('lang=en&native=uk&variant=gb&today=');
  });

  test('the cached words fit only their variants; a cache from before variants fits the first one', () => {
    const words = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() + i);
      return { date: localDayKey(d), word: 'w' + i };
    });
    const sig = wodSignature(null, []);
    const old = { lang: 'en', native: 'uk', sig, words };
    expect(samePair(old, { lang: 'en', native: 'uk', variant: 'us' })).toBe(true);
    expect(samePair(old, { lang: 'en', native: 'uk', variant: 'gb' })).toBe(false);
    expect(needsRefresh(old, { lang: 'en', native: 'uk', variant: 'us', sig })).toBe(false);
    expect(needsRefresh(old, { lang: 'en', native: 'uk', variant: 'gb', sig })).toBe(true);
    const latam = { lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'us', sig, words };
    expect(needsRefresh(latam, { lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'us', sig })).toBe(false);
    expect(needsRefresh(latam, { lang: 'es', native: 'en', variant: 'es', nativeVariant: 'us', sig })).toBe(true);
    expect(needsRefresh(latam, { lang: 'es', native: 'en', variant: 'latam', nativeVariant: 'gb', sig })).toBe(true);
    // мови без варіантів — як і раніше
    expect(samePair({ lang: 'de', native: 'uk', words }, { lang: 'de', native: 'uk', variant: 'gb' })).toBe(true);
  });
});

// ── У зв'язці з App: вибір у Параметрах і в аркуші, збереження, слово дня ──
describe('in the app', () => {
  jest.setTimeout(20000);
  const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
  const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
  let calls = [];
  let mounted = null;

  beforeEach(async () => {
    await AsyncStorage.clear();
    setPhone('uk-UA');
    calls = [];
    global.fetch = jest.fn(async (url, init = {}) => {
      const u = new URL(url);
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      calls.push({ path: u.pathname, method, body });
      if (method === 'POST' && u.pathname === '/auth/device') return reply(200, { token: 't1', user: { id: 'u1', createdAt: 1 } });
      if (u.pathname === '/me') return reply(200, { user: { id: 'u1' }, pro: { active: false }, usage: { day: localDayKey(), scans: 0, limit: 5 } });
      if (u.pathname === '/word-of-day') {
        const tag = body.variant || '-';
        return reply(200, { words: [{ date: localDayKey(), slot: 0, word: 'flat ' + tag, ipa: '', translation: 'квартира', example: '', example_translation: '', source: 'flat' }] });
      }
      throw new TypeError('Network request failed');
    });
  });
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
    setPhone('en-US');
    delete global.fetch;
  });

  async function settle(n = 5) {
    for (let i = 0; i < n; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
  }
  async function renderApp(settings) {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(settings));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
    await act(async () => {
      mounted = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await settle(8);
    return mounted;
  }
  const openTab = async (tree, key) => {
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
    await settle();
  };
  const wodPosts = () => calls.filter((c) => c.path === '/word-of-day' && c.method === 'POST');
  const stored = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  test('an old install without variants gets the default, and its word of the day asks for it', async () => {
    const tree = await renderApp({ nativeLang: 'uk', targetLang: 'es' });
    await openTab(tree, 'settings');
    expect(tree.root.findByType(SettingsScreen).props.targetVariant).toBe('es'); // телефон в Україні
    expect(wodPosts().at(-1).body).toMatchObject({ lang: 'es', native: 'uk', variant: 'es' });
    expect(flagFor('es')).toBe('🇪🇸');
  });

  test('picking English (UK) in Settings: saved with the language, the flag, the word of the day asked again', async () => {
    const tree = await renderApp({ nativeLang: 'uk', targetLang: 'en' });
    await openTab(tree, 'settings');
    const screen = () => tree.root.findByType(SettingsScreen);
    expect(screen().props.targetVariant).toBe('us');
    const before = wodPosts().length;
    await act(async () => screen().props.onSetLang('en', 'gb'));
    await settle();
    expect(screen().props.targetVariant).toBe('gb');
    expect((await stored()).variants).toEqual({ en: 'gb' });
    expect((await stored()).targetLang).toBe('en');
    expect(flagFor('en')).toBe('🇬🇧');
    expect(wodPosts().length).toBe(before + 1);
    expect(wodPosts().at(-1).body).toMatchObject({ lang: 'en', variant: 'gb' });
    // рядок у списку Параметрів — обраний варіант
    const head = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === 'English (UK)');
    expect(head.length).toBeGreaterThan(0);
  });

  // Офлайн новий кеш не приходить, а старий лишається американським: картка
  // «Навчання», слоти Pro й віджет не мають видавати його за британський
  test('switched to English (UK) offline: the US word of the day is not shown as the UK one', async () => {
    const tree = await renderApp({ nativeLang: 'uk', targetLang: 'en' });
    const cards = () => tree.root.findByType(FlashcardsScreen);
    const widget = () => require('expo-widgets').__widgets.WordOfDay.updateTimeline.mock.calls.at(-1)[0][0].props;
    await openTab(tree, 'cards');
    expect(cards().props.wordOfDay?.word).toBe('flat us');
    expect(widget().word).toBe('flat us');
    const online = global.fetch;
    global.fetch = jest.fn(async (url, init) => {
      if (new URL(url).pathname === '/word-of-day') throw new TypeError('Network request failed');
      return online(url, init);
    });
    await openTab(tree, 'settings');
    await act(async () => tree.root.findByType(SettingsScreen).props.onSetLang('en', 'gb'));
    await settle();
    expect(tree.root.findByType(SettingsScreen).props.targetVariant).toBe('gb');
    // кеш той самий, американський: новий не прийшов
    expect(JSON.parse(await AsyncStorage.getItem('ll_wod_v1')).variant).toBe('us');
    await openTab(tree, 'cards');
    expect(cards().props.wordOfDay).toBeNull();
    expect(widget().state).toBe('empty');
    // повернулись до США — той самий кеш знову годиться
    await openTab(tree, 'settings');
    await act(async () => tree.root.findByType(SettingsScreen).props.onSetLang('en', 'us'));
    await settle();
    await openTab(tree, 'cards');
    expect(cards().props.wordOfDay?.word).toBe('flat us');
    expect(widget().word).toBe('flat us');
  });

  test('the scanner’s sheet: another variant of the same language is not a new language (no paywall)', async () => {
    const words = [{ id: 'w1', word: 'mug', translation: 'кружка', lang: 'en', nativeLang: 'uk', addedAt: 1 }];
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
    const tree = await renderApp({ nativeLang: 'uk', targetLang: 'en' });
    const sheet = () => tree.root.findByType(LangSheet);
    expect(sheet().props.variant).toBe('us');
    await act(async () => sheet().props.onPick('en', 'gb'));
    await settle();
    expect((await stored()).variants).toEqual({ en: 'gb' });
    expect(sheet().props.variant).toBe('gb');
    // та сама мова, той самий варіант — нічого не міняємо й не тягнемо
    const n = wodPosts().length;
    await act(async () => sheet().props.onPick('en', 'gb'));
    await settle();
    expect(wodPosts().length).toBe(n);
  });

  test('an explicit pick of the default variant is kept: a new phone region does not flip it', async () => {
    const tree = await renderApp({ nativeLang: 'uk', targetLang: 'es' });
    const sheet = () => tree.root.findByType(LangSheet);
    expect(sheet().props.variant).toBe('es'); // Україна — іспанська Іспанії за замовчуванням
    await act(async () => sheet().props.onPick('es', 'es'));
    await settle();
    expect((await stored()).variants).toEqual({ es: 'es' });
    // людина переїхала: регіон телефона — Мексика, а обрана іспанська та сама
    setPhone('uk-MX');
    await act(async () => tree.root.findByType(LangSheet).props.onClose());
    await settle();
    expect(sheet().props.variant).toBe('es');
    expect(variantOf('es')).toBe('es');
    expect(nativeVariantOf('es')).toBe('latam');
  });
});
