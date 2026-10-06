// Рядки v1.3 розкладені по фрагментах src/strings/*.js — по одному на потік,
// щоб п'ять паралельних гілок не правили той самий src/i18n.js. Злиття
// тихе: ключ, визначений у двох фрагментах, чи фрагмент, що перекрив
// базовий рядок, нічим себе не видадуть — просто посеред екрана з'явиться
// не той текст. Тому стережемо тут (решту правил тексту — однакові ключі,
// множини, типографіку — уже перевіряє __tests__/i18n.test.js на злитому
// STRINGS).
import fs from 'fs';
import path from 'path';

import { BASE_STRINGS, FRAGMENTS, STRINGS, makeT } from '../src/i18n';

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'uk', 'de', 'es', 'ru'];
const NAMES = ['shared', 'core', 'widgets', 'onb', 'share', 'pro'];
const keysOf = (name) => Object.keys(FRAGMENTS[name].default.en);

test('six fragments, merged in a fixed order', () => {
  expect(Object.keys(FRAGMENTS)).toEqual(NAMES);
  for (const f of NAMES) expect(fs.existsSync(path.join(ROOT, 'src/strings', `${f}.js`))).toBe(true);
});

test.each(NAMES)('%s has the five languages with the same keys', (name) => {
  const frag = FRAGMENTS[name].default;
  expect(Object.keys(frag).sort()).toEqual([...LANGS].sort());
  const en = Object.keys(frag.en).sort();
  for (const l of LANGS) expect([l, Object.keys(frag[l]).sort()]).toEqual([l, en]);
});

test('no key is defined in two fragments', () => {
  const owner = {};
  const twice = [];
  for (const name of NAMES) {
    for (const k of keysOf(name)) {
      if (owner[k]) twice.push(`${k}: ${owner[k]} + ${name}`);
      else owner[k] = name;
    }
  }
  expect(twice).toEqual([]);
});

test('a fragment overrides a base string only when it says so in OVERRIDES', () => {
  const bad = [];
  for (const name of NAMES) {
    const declared = FRAGMENTS[name].OVERRIDES || [];
    for (const k of keysOf(name)) {
      if (k in BASE_STRINGS.en && !declared.includes(k)) bad.push(`${name}.${k} overrides the base without OVERRIDES`);
    }
    // OVERRIDES без самого рядка чи без базового ключа — забута правка
    for (const k of declared) {
      if (!keysOf(name).includes(k)) bad.push(`${name}.OVERRIDES lists ${k}, but the fragment does not define it`);
      if (!(k in BASE_STRINGS.en)) bad.push(`${name}.OVERRIDES lists ${k}, which is not a base key`);
    }
  }
  expect(bad).toEqual([]);
});

test('the merged strings carry the fragment’s text', () => {
  for (const name of NAMES) {
    for (const l of LANGS) {
      for (const [k, v] of Object.entries(FRAGMENTS[name].default[l])) expect([l, k, STRINGS[l][k]]).toEqual([l, k, v]);
    }
  }
  // базові рядки, яких фрагменти не чіпали, — ті самі
  expect(STRINGS.uk.cancel).toBe(BASE_STRINGS.uk.cancel);
});

// Дубль ключа в літералі об'єкта — не помилка JS: останній мовчки перемагає
// (так само, як тест для src/i18n.js). Блок мови — `  en: {` … `  },`.
test.each(NAMES)('%s: no key is defined twice inside one language block', (name) => {
  const src = fs.readFileSync(path.join(ROOT, 'src/strings', `${name}.js`), 'utf8');
  const dupes = {};
  for (const lang of LANGS) {
    const head = `\n  ${lang}: {`;
    const start = src.indexOf(head);
    expect([lang, start > -1]).toEqual([lang, true]);
    const end = src.indexOf('\n  },', start);
    expect([lang, end > start]).toEqual([lang, true]);
    const body = src
      .slice(start + head.length, end)
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/\/\/.*$/gm, '');
    const seen = new Set();
    for (const m of body.matchAll(/([A-Za-z_]\w*)\s*:/g)) {
      if (seen.has(m[1])) (dupes[lang] ||= []).push(m[1]);
      seen.add(m[1]);
    }
  }
  expect(dupes).toEqual({});
});

// Тексти серії й футера (план §5.4): точні фрази власника для 1–2 днів і
// слоган без назви застосунку.
describe('shared strings', () => {
  test('the owner’s words for the first days, with plurals', () => {
    const uk = makeT('uk');
    expect(uk('streakKeep', { n: 1 })).toBe('1 день поспіль. Так тримати!');
    expect(uk('streakKeep', { n: 2 })).toBe('2 дні поспіль. Так тримати!');
    expect(uk('streakHabit', { n: 5 })).toBe('5 днів поспіль. Звичка вже формується');
    expect(uk('streakToWeek', { k: 1 })).toBe('До тижня ще 1 день, і вогник розгориться');
    expect(uk('streakBest', { n: 21 })).toBe('Рекорд: 21 день');
    const en = makeT('en');
    expect(en('streakKeep', { n: 1 })).toBe('1 day in a row. Keep it up!');
    // «7 more to 14 days» читалось незграбно: тепер з одиницею й дієсловом
    expect(en('streakToNext', { k: 7, m: 14 })).toBe('Your flame is burning. 7 more days to reach 14');
    expect(en('streakToNext', { k: 1, m: 30 })).toBe('Your flame is burning. 1 more day to reach 30');
    // «До 14 днів ще 2» без тире звучало обрубано
    expect(uk('streakToNext', { k: 2, m: 14 })).toBe('Вогонь горить. До 14 днів лишилося 2');
    // «Noch 4 bis 14 Tage» читалося як «ще від 4 до 14 днів»
    const de = makeT('de');
    expect(de('streakToNext', { k: 4, m: 14 })).toBe('Deine Flamme brennt. Noch 4 bis zum 14. Tag');
    // дієслово узгоджене з числом: «Falta 1», «Faltan 2»
    const es = makeT('es');
    expect(es('streakToWeek', { k: 1 })).toBe('Falta 1 día para la semana, y tu llama se encenderá');
    expect(es('streakToWeek', { k: 3 })).toBe('Faltan 3 días para la semana, y tu llama se encenderá');
    expect(es('streakToNext', { k: 1, m: 14 })).toBe('Tu llama arde. Falta 1 para los 14 días');
    expect(es('streakToNext', { k: 5, m: 30 })).toBe('Tu llama arde. Faltan 5 para los 30 días');
    // після «до» — родовий відмінок за числом m: «до 14 дней», «до 21 дня»
    const ru = makeT('ru');
    expect(ru('streakKeep', { n: 1 })).toBe('1 день подряд. Так держать!');
    expect(ru('streakKeep', { n: 3 })).toBe('3 дня подряд. Так держать!');
    expect(ru('streakToNext', { k: 2, m: 14 })).toBe('Огонь горит. До 14 дней осталось 2');
    expect(ru('streakToNext', { k: 7, m: 21 })).toBe('Огонь горит. До 21 дня осталось 7');
    expect(ru('streakBest', { n: 22 })).toBe('Рекорд: 22 дня');
  });

  test('the footer slogan no longer repeats the name; the version has a label', () => {
    for (const l of LANGS) {
      expect(STRINGS[l].footer).not.toMatch(/LinguaLens/);
      expect(makeT(l)('versionLabel', { v: '1.3.0' })).toContain('1.3.0');
    }
    expect(makeT('uk')('versionLabel', { v: '1.3.0' })).toBe('Версія 1.3.0');
    expect(STRINGS.uk.footer).toBe('Скануй · вивчай · повторюй');
    expect(makeT('ru')('versionLabel', { v: '1.3.0' })).toBe('Версия 1.3.0');
  });
});
