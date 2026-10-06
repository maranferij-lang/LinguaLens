// Демо-дані скріншотів App Store (tools/store-shots/data.mjs і засів у
// capture.mjs). Модулі .mjs jest сам не імпортує, тож читаємо їх окремим
// процесом Node і перевіряємо результат:
//   • варіант мови на кожній сторінці — той, який дає застосунок
//     (src/langVariants.js): прапорець, голос, слова й IPA цього варіанта;
//     англійська США — General American, Британії — RP і британські слова,
//     іспанська Латинської Америки — сесео й мексиканські слова;
//   • засів кладе цей варіант у налаштування й кеш слова дня так, що
//     застосунок приймає кеш як є;
//   • словник і профіль засіяні однаковою кількістю слів.
import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

import { defaultVariant, nativeVariantOf, pickVariant, variantInfo } from '../src/langVariants';
import { samePair } from '../src/wordOfDay';

// сповіщення тут ні до чого: src/wordOfDay.js без них лише звіряє кеш
jest.mock('expo-notifications', () => ({}));

const DIR = path.join(__dirname, '../tools/store-shots');
const url = (f) => pathToFileURL(path.join(DIR, f)).href;

function run(code) {
  const out = execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', code], { encoding: 'utf8', env: { ...process.env, OUT: '/tmp/ll-shots-test' } });
  return JSON.parse(out);
}

const data = run(`
  import * as d from ${JSON.stringify(url('data.mjs'))};
  import { COLLECTION } from ${JSON.stringify(url('art/objects.mjs'))};
  const keys = [...COLLECTION, 'window', 'pan', 'jar', 'board', 'towel'];
  const out = { locales: d.STORE_LOCALES, L: d.LOCALES, vocab: {}, wod: d.WOD, widget: d.WIDGET_WOD, older: {}, week: {}, variants: {} };
  for (const l of d.STORE_LOCALES) {
    out.week[l] = d.firstWeekdayFor(l);
    out.variants[l] = d.variantsFor(l);
    out.vocab[l] = Object.fromEntries(keys.map((k) => [k, d.vocab(l, k)]));
    out.older[l] = d.olderWords(l);
  }
  console.log(JSON.stringify(out));
`);

// телефон цієї сторінки, як його бачить expo-localization
const phone = (loc) => {
  const [languageCode, regionCode] = data.L[loc].browser.split('-');
  return [{ languageTag: data.L[loc].browser, languageCode, regionCode }];
};
const entries = (loc) => [...Object.values(data.vocab[loc]), data.wod[loc], data.widget[loc]];
const byVariant = (code, variant) => data.locales.filter((l) => data.L[l].learn === code && data.L[l].variant === variant);
const words = (loc) => [...entries(loc), ...data.older[loc]].map((v) => v.word).join(' | ');

describe('store shots: the language variant of each page', () => {
  test('uk and es-MX learn American English, en-US Latin American Spanish, en-GB British English', () => {
    const got = Object.fromEntries(data.locales.map((l) => [l, [data.L[l].learn, data.L[l].variant, data.L[l].flag]]));
    expect(got).toEqual({ uk: ['en', 'us', '🇺🇸'], 'en-US': ['es', 'latam', '🇲🇽'], 'en-GB': ['en', 'gb', '🇬🇧'], 'es-MX': ['en', 'us', '🇺🇸'] });
  });

  test('flag and voice are the app’s own for that variant', () => {
    for (const l of data.locales) {
      const v = variantInfo(data.L[l].learn, data.L[l].variant);
      expect([l, v && v.flag]).toEqual([l, data.L[l].flag]);
    }
    expect(variantInfo('es', 'latam').tts).toBe('es-MX');
    expect(variantInfo('en', 'gb').tts).toBe('en-GB');
    expect(variantInfo('en', 'us').tts).toBe('en-US');
  });

  test('the app picks this variant on that phone: by default, or (en-GB) because the seed stores the choice', () => {
    for (const l of data.locales) {
      const { learn, variant } = data.L[l];
      expect(data.variants[l]).toEqual({ [learn]: variant });
      expect([l, pickVariant(learn, data.variants[l], phone(l))]).toEqual([l, variant]);
      // британську в Британії людина обирає сама: за замовчуванням там США
      const byDefault = defaultVariant(learn, phone(l));
      expect([l, byDefault === variant]).toEqual([l, l !== 'en-GB']);
    }
  });

  test('translations follow the phone’s region (nativeVariant)', () => {
    for (const l of data.locales) expect([l, nativeVariantOf(data.L[l].native, phone(l))]).toEqual([l, data.L[l].nativeVariant || null]);
  });
});

describe('store shots: words and IPA of the variant', () => {
  test('American English: General American IPA (rhotic, oʊ, æ in plant, glasses, banana)', () => {
    for (const loc of byVariant('en', 'us')) {
      for (const v of entries(loc)) {
        // британські ознаки: əʊ (go), ɒ (clock)
        expect([loc, v.word, v.ipa, /əʊ|ɒ/.test(v.ipa)]).toEqual([loc, v.word, v.ipa, false]);
        if (/r/.test(v.word)) expect([loc, v.word, v.ipa, /[rɹɚɝ]/.test(v.ipa)]).toEqual([loc, v.word, v.ipa, true]);
      }
      for (const k of ['plant', 'glasses', 'banana']) expect(data.vocab[loc][k].ipa).toMatch(/æ/);
      expect(words(loc)).toMatch(/\bsneaker\b/);
      expect(data.vocab[loc].board.word).toBe('cutting board');
    }
  });

  test('British English: RP IPA (no r before a consonant or at the end, əʊ, ɒ, ɑː) and UK words', () => {
    const [loc] = byVariant('en', 'gb');
    expect(loc).toBe('en-GB');
    for (const v of entries(loc)) {
      expect([v.word, v.ipa, /r(?![aeiouæɑɒɔəɜɪʊʌ])/.test(v.ipa)]).toEqual([v.word, v.ipa, false]);
      expect([v.word, v.ipa, /oʊ|[ɚɝ]/.test(v.ipa)]).toEqual([v.word, v.ipa, false]);
    }
    const V = data.vocab[loc];
    expect(V.window.ipa).toMatch(/əʊ/);
    expect(V.clock.ipa).toMatch(/ɒ/);
    for (const k of ['plant', 'glasses', 'banana']) expect(V[k].ipa).toMatch(/ɑː/);
    expect([V.sneaker.word, V.backpack.word, V.board.word, V.towel.word]).toEqual(['trainer', 'rucksack', 'chopping board', 'tea towel']);
    expect(words(loc)).not.toMatch(/\b(sneaker|backpack|cutting board|dish towel)\b/);
  });

  test('Latin American Spanish: seseo (no θ), Mexican words, the article in word and IPA', () => {
    const [loc] = byVariant('es', 'latam');
    expect(loc).toBe('en-US');
    for (const v of entries(loc)) {
      expect([v.word, v.ipa, /θ/.test(v.ipa)]).toEqual([v.word, v.ipa, false]);
      expect([v.word, v.ipa]).toEqual([v.word, expect.stringMatching(/^\/(el|la|los|las) /)]);
    }
    // z і c перед e/i — /s/: la taza /la ˈtasa/
    expect(data.vocab[loc].mug).toMatchObject({ word: 'la taza', ipa: '/la ˈtasa/' });
    expect(data.vocab[loc].apple.ipa).toBe('/la manˈsana/');
    const all = words(loc);
    for (const latam of ['los audífonos', 'los tenis', 'los lentes', 'la cobija']) expect(all).toContain(latam);
    for (const spain of ['auriculares', 'zapatilla', 'gafas', 'manta']) expect(all).not.toContain(spain);
  });

  test('es-MX translations are Mexican, like the phone’s region', () => {
    const tr = [...Object.values(data.vocab['es-MX']), ...data.older['es-MX']].map((v) => v.translation).join(' | ');
    for (const mx of ['audífonos', 'tenis', 'lentes', 'cobija']) expect(tr).toContain(mx);
  });

  // «el trapo» — це ганчірка; рушник для посуду — «trapo de cocina»
  test('a dish towel is «trapo de cocina» in both directions', () => {
    expect(data.vocab['en-US'].towel.word).toBe('el trapo de cocina');
    expect(data.vocab['es-MX'].towel.translation).toBe('trapo de cocina');
  });
});

describe('store shots: what a phone of that region shows', () => {
  // смужка тижня серії (кадр 7) починається з дня, який дає календар iPhone
  // регіону: США й Мексика — з неділі, Британія й Україна — з понеділка
  test('first day of the week, as iOS numbers it (1 Sunday, 2 Monday)', () => {
    expect(data.week).toEqual({ uk: 2, 'en-US': 1, 'en-GB': 2, 'es-MX': 1 });
  });
});

describe('store shots seed', () => {
  const seeded = run(`
    import { seedFor } from ${JSON.stringify(url('capture.mjs'))};
    import { STORE_LOCALES } from ${JSON.stringify(url('data.mjs'))};
    import { COLLECTION } from ${JSON.stringify(url('art/objects.mjs'))};
    const shapes = { objects: Object.fromEntries(COLLECTION.map((k) => [k, { shape: [] }])) };
    const n = (opts) => JSON.parse(seedFor('uk', { origin: 'http://x', shapes, ...opts }).ll_words_v1).length;
    const out = {
      dictionary: n({}),
      profile: n({ theme: 'dark', avatar: 'celebrate' }),
      photos: JSON.parse(seedFor('uk', { origin: 'http://x', shapes }).ll_words_v1).filter((w) => w.photo).length,
      settings: {},
      wod: {},
    };
    for (const l of STORE_LOCALES) {
      const s = seedFor(l, { origin: 'http://x', shapes });
      out.settings[l] = JSON.parse(s.ll_settings_v1);
      out.wod[l] = JSON.parse(s.ll_wod_v1);
    }
    console.log(JSON.stringify(out));
  `);

  test('the dictionary and the profile count the same words', () => {
    expect(seeded.dictionary).toBe(seeded.profile);
    expect(seeded.dictionary).toBe(30); // «30 слів усього» узгоджується з uk-підписом
    expect(seeded.photos).toBe(16); // наліпки колекції, решта — старіші слова без фото
  });

  test('settings carry the chosen variant, so the app shows its flag (🇬🇧 on en-GB)', () => {
    for (const l of data.locales) expect([l, seeded.settings[l].variants]).toEqual([l, data.variants[l]]);
  });

  // кеш слова дня — тієї ж пари мов і варіантів, з якою застосунок його
  // звіряє (settingsPair), тож слово дня не губиться й не тягнеться заново
  test('the word-of-day cache matches the variants the app checks it against', () => {
    for (const l of data.locales) {
      const st = seeded.settings[l];
      const pair = { lang: st.targetLang, native: st.nativeLang, variant: pickVariant(st.targetLang, st.variants, phone(l)), nativeVariant: nativeVariantOf(st.nativeLang, phone(l)) };
      expect([l, samePair(seeded.wod[l], pair)]).toEqual([l, true]);
      expect([l, seeded.wod[l].variant]).toEqual([l, data.L[l].variant]);
    }
    // і кеш іншого варіанта застосунок би відкинув: перевірка не порожня
    const gb = seeded.wod['en-GB'];
    expect(samePair({ ...gb, variant: 'us' }, { lang: 'en', native: 'uk', variant: 'gb', nativeVariant: null })).toBe(false);
  });
});

describe('store shots: element shots get the variants too', () => {
  // shot-gallery.js імпортує setChosenVariants з прокладки, яку export.mjs
  // кладе поруч: справжня функція застосунку, а у версії без варіантів мов
  // заглушка (інакше Metro не збере старішу версію)
  const shim = run(`
    import { variantsShim } from ${JSON.stringify(url('export.mjs'))};
    console.log(JSON.stringify({ with: variantsShim(true), without: variantsShim(false) }));
  `);

  test('the shim re-exports the app’s setChosenVariants, or a no-op without variants', () => {
    expect(shim.with).toMatch(/export \{ setChosenVariants \} from '\.\/src\/langVariants'/);
    expect(shim.without).toMatch(/export function setChosenVariants\(\) \{\}/);
    expect(typeof require('../src/langVariants').setChosenVariants).toBe('function');
  });

  test('the gallery applies shot.variants before it renders, and capture passes them', () => {
    const fs = require('fs');
    const gallery = fs.readFileSync(path.join(DIR, 'app-entry/shot-gallery.js'), 'utf8');
    expect(gallery).toMatch(/from '\.\/shot-variants'/);
    expect(gallery).toMatch(/setChosenVariants\(shot\.variants\)/);
    expect(fs.readFileSync(path.join(DIR, 'capture.mjs'), 'utf8')).toMatch(/variants: variantsFor\(loc\)/);
  });
});
