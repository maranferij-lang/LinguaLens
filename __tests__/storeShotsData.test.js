// Демо-дані скріншотів App Store (tools/store-shots/data.mjs і засів у
// capture.mjs). Модулі .mjs jest сам не імпортує, тож читаємо їх окремим
// процесом Node і перевіряємо результат:
//   • варіант мови — той, який людина чує в застосунку: англійська вимова
//     американська (голос en-US), іспанська — іспанська Іспанії (голос
//     es-ES), без британської IPA біля американських слів;
//   • словник і профіль засіяні однаковою кількістю слів.
import { execFileSync } from 'child_process';
import path from 'path';
import { pathToFileURL } from 'url';

import { LANGS } from '../src/speech';

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
  const out = { locales: d.STORE_LOCALES, learn: {}, vocab: {}, wod: d.WOD, widget: d.WIDGET_WOD, older: {} };
  for (const l of d.STORE_LOCALES) {
    out.learn[l] = d.LOCALES[l].learn;
    out.vocab[l] = Object.fromEntries(keys.map((k) => [k, d.vocab(l, k)]));
    out.older[l] = d.olderWords(l);
  }
  console.log(JSON.stringify(out));
`);

const tts = (code) => LANGS.find((l) => l.code === code).tts;
const entries = (loc) => [...Object.values(data.vocab[loc]), data.wod[loc], data.widget[loc]];

describe('store shots demo data', () => {
  test('the voices the app speaks with (the variants below follow them)', () => {
    expect(tts('en')).toBe('en-US');
    expect(tts('es')).toBe('es-ES');
  });

  test('English IPA is American, like the en-US voice', () => {
    for (const loc of data.locales.filter((l) => data.learn[l] === 'en')) {
      for (const v of entries(loc)) {
        // британські ознаки: əʊ (go), ɒ (clock), і «r», якого не чути
        expect([loc, v.word, v.ipa, /əʊ|ɒ/.test(v.ipa)]).toEqual([loc, v.word, v.ipa, false]);
        if (/r/.test(v.word)) expect([loc, v.word, v.ipa, /[rɹɚɝ]/.test(v.ipa)]).toEqual([loc, v.word, v.ipa, true]);
      }
      // trap-bath: американське æ у plant, glasses, banana
      for (const k of ['plant', 'glasses', 'banana']) expect(data.vocab[loc][k].ipa).toMatch(/æ/);
    }
  });

  test('en-GB shows the same English words as uk: the server asks for plain English', () => {
    for (const k of Object.keys(data.vocab.uk)) {
      expect([k, data.vocab['en-GB'][k].word, data.vocab['en-GB'][k].ipa]).toEqual([k, data.vocab.uk[k].word, data.vocab.uk[k].ipa]);
    }
  });

  test('Spanish taught in en-US is Spain’s Spanish, like the es-ES voice', () => {
    const es = entries('en-US');
    for (const v of es) {
      // θ там, де пишуть z або c перед e/i (taza /ˈtaθa/), і артикль, як у сервера
      if (/z|c[eiéí]/.test(v.word)) expect([v.word, v.ipa, /θ/.test(v.ipa)]).toEqual([v.word, v.ipa, true]);
      expect([v.word, v.ipa]).toEqual([v.word, expect.stringMatching(/^\/(el|la|los|las) /)]);
    }
    const words = [...es, ...data.older['en-US']].map((v) => v.word);
    for (const latam of ['audífonos', 'lentes', 'tenis', 'cobija']) expect(words.join(' ')).not.toMatch(new RegExp(latam));
  });
});

describe('store shots seed', () => {
  const counts = run(`
    import { seedFor } from ${JSON.stringify(url('capture.mjs'))};
    import { COLLECTION } from ${JSON.stringify(url('art/objects.mjs'))};
    const shapes = { objects: Object.fromEntries(COLLECTION.map((k) => [k, { shape: [] }])) };
    const n = (opts) => JSON.parse(seedFor('uk', { origin: 'http://x', shapes, ...opts }).ll_words_v1).length;
    console.log(JSON.stringify({
      dictionary: n({}),
      profile: n({ theme: 'dark', avatar: 'celebrate' }),
      photos: JSON.parse(seedFor('uk', { origin: 'http://x', shapes }).ll_words_v1).filter((w) => w.photo).length,
    }));
  `);

  test('the dictionary and the profile count the same words', () => {
    expect(counts.dictionary).toBe(counts.profile);
    expect(counts.dictionary).toBe(30); // «30 слів усього» узгоджується з uk-підписом
    expect(counts.photos).toBe(16); // наліпки колекції, решта — старіші слова без фото
  });
});
