// Вибір мови (onboarding.md §5.2): «Популярні» під мову перекладу (до шести,
// без неї самої), «Усі мови» за абеткою мовою інтерфейсу, пошук за початком
// будь-якого слова в ендонімі, назві мовою інтерфейсу, англійській назві й
// коді — без регістру й діакритики.
import { CODES, POPULAR, fold, langLabel, langSections, matches, popularTargets, searchLangs, sortLangs } from '../src/langPick';
import { LANGS } from '../src/speech';
import { makeT } from '../src/i18n';

const en = makeT('en');
const uk = makeT('uk');
const de = makeT('de');
const es = makeT('es');
const ru = makeT('ru');

describe('popular', () => {
  test('per translation language, never more than six, never the translation language itself', () => {
    expect(popularTargets('uk')).toEqual(['en', 'de', 'pl', 'es', 'fr', 'it']);
    expect(popularTargets('en')).toEqual(['es', 'fr', 'de', 'it', 'ja', 'ko']);
    expect(popularTargets('de')).toEqual(['en', 'es', 'fr', 'it', 'pt', 'nl']);
    expect(popularTargets('es')).toEqual(['en', 'fr', 'de', 'it', 'pt', 'ja']);
    expect(popularTargets('ru')).toEqual(['en', 'de', 'es', 'fr', 'it', 'pl']);
    expect(popularTargets('pl')).toEqual(['en', 'de', 'es', 'fr', 'it', 'uk']);
    // мова, якої немає в таблиці, — загальний список, але без неї самої
    expect(popularTargets('ko')).toEqual(POPULAR.default);
    expect(popularTargets('fr')).toEqual(['en', 'es', 'de', 'it', 'ja']);
    for (const native of CODES) {
      const list = popularTargets(native);
      expect(list.length).toBeLessThanOrEqual(6);
      expect(list).not.toContain(native);
      for (const c of list) expect(CODES).toContain(c);
    }
  });
});

describe('search', () => {
  test('by the name in the interface language, the endonym, the English name and the code — case and accents ignored', () => {
    expect(searchLangs('нім', uk, 'uk')).toEqual(['de']);
    expect(searchLangs('deu', uk, 'uk')).toEqual(['de']);
    expect(searchLangs('Deutsch', en, 'en')).toEqual(['de']);
    expect(searchLangs('espanol', en, 'en')).toEqual(['es']);
    expect(searchLangs('ESPAÑ', uk, 'uk')).toEqual(['es']);
    expect(searchLangs('ja', en, 'en')).toContain('ja');
    // англійська назва працює й з українським інтерфейсом
    expect(searchLangs('german', uk, 'uk')).toEqual(['de']);
    // і російська назва з російським інтерфейсом
    expect(searchLangs('нем', ru, 'ru')).toEqual(['de']);
    expect(searchLangs('укр', ru, 'ru')).toEqual(['uk']);
    // за початком будь-якого слова: «indo» — і «Bahasa Indonesia»
    expect(searchLangs('indo', en, 'en')).toEqual(['id']);
    expect(searchLangs('bahasa ind', en, 'en')).toEqual(['id']);
    // чеська без гачків
    expect(searchLangs('cestina', en, 'en')).toEqual(['cs']);
    expect(fold('Čeština')).toBe('cestina');
    expect(fold('Вʼєтнамська')).toBe('в єтнамська');
    // порожній запит — усе
    expect(searchLangs('  ', en, 'en')).toHaveLength(LANGS.length);
    expect(searchLangs('qqq', en, 'en')).toEqual([]);
    expect(matches('de', '', en)).toBe(true);
  });
});

describe('order and names', () => {
  test('all languages alphabetically by their name in the interface language', () => {
    const order = sortLangs('uk', uk);
    expect(order).toHaveLength(LANGS.length);
    expect(order[0]).toBe('en'); // «Англійська»
    const names = order.map((c) => uk('langName_' + c));
    expect([...names].sort((a, b) => a.localeCompare(b, 'uk'))).toEqual(names);
    expect(sortLangs('en', en)[0]).toBe('ar'); // Arabic
    expect(sortLangs('de', de)[0]).toBe('ar'); // Arabisch
    expect(sortLangs('ru', ru)[0]).toBe('en'); // «Английский»
  });

  test('sections: popular, then all the rest; with a query — only the matches', () => {
    const s = langSections({ native: 'uk', t: uk, ui: 'uk' });
    expect(s.popular).toEqual(popularTargets('uk'));
    expect(s.all).toHaveLength(LANGS.length - s.popular.length);
    for (const c of s.popular) expect(s.all).not.toContain(c);
    // мова перекладу — серед «Усіх» (у списку її видно, хоч обрати не можна)
    expect(s.all).toContain('uk');
    expect(langSections({ native: 'uk', query: 'pol', t: en, ui: 'en' })).toEqual({ results: ['pl'] });
  });

  test('language names mid-sentence: lower case in Ukrainian, Russian and Spanish, capitalised at the start', () => {
    expect(langLabel('en', uk, 'uk')).toBe('англійська');
    expect(langLabel('en', uk, 'uk', { capital: true })).toBe('Англійська');
    expect(langLabel('de', es, 'es')).toBe('alemán');
    expect(langLabel('en', ru, 'ru')).toBe('английский');
    expect(langLabel('en', ru, 'ru', { capital: true })).toBe('Английский');
    expect(langLabel('de', de, 'de')).toBe('Deutsch');
    expect(langLabel('ja', en, 'en')).toBe('Japanese');
    // усі 29 назв є в пʼяти мовах інтерфейсу
    for (const t of [en, uk, de, es, ru]) for (const c of CODES) expect(t('langName_' + c)).not.toBe('langName_' + c);
  });
});
