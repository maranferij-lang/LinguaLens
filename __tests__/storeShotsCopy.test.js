// Підписи скріншотів App Store (tools/store-shots/copy.js). Той самий модуль
// читає рендер кадрів, тож тут стережемо те, що в мініатюрі пошуку чи на
// модерації вже не виправиш: чотири локалі по вісім кадрів, довжину
// заголовків, правило власника «жодних довгих тире», заборонені слова
// (правило 2.3.7: ціни, «безкоштовно», чужі бренди) і підстановки чисел.
import fs from 'fs';
import path from 'path';

import { ACHIEVEMENTS } from '../src/achievements';
import { LANGS } from '../src/speech';
import { COPY, LOCALES, countAchievements, countLangs, fill, plainHead, ukGenitivePlural } from '../tools/store-shots/copy';

const ROOT = path.join(__dirname, '..');
const SLUGS = ['scan', 'dictionary', 'flashcards', 'scene', 'level', 'widget', 'streak', 'share'];
const counts = { langs: LANGS.length, ach: ACHIEVEMENTS.length };
const all = () => LOCALES.flatMap((loc) => COPY[loc].map((cp, i) => ({ loc, n: i + 1, ...cp })));
const texts = (cp) => [cp.head, cp.sub];

describe('store shots copy', () => {
  test('four App Store locales × the same eight frames', () => {
    expect(LOCALES).toEqual(['uk', 'en-US', 'en-GB', 'es-MX']);
    for (const loc of LOCALES) expect([loc, COPY[loc].map((cp) => cp.slug)]).toEqual([loc, SLUGS]);
  });

  test('every frame has a headline and a sub-line', () => {
    for (const cp of all()) {
      expect([cp.loc, cp.n, typeof cp.head, typeof cp.sub]).toEqual([cp.loc, cp.n, 'string', 'string']);
      expect(plainHead(cp).trim().length).toBeGreaterThan(0);
      expect(cp.sub.trim().length).toBeGreaterThan(0);
    }
  });

  test('headline ≤ 28 characters, sub-line ≤ 46, at most one forced break', () => {
    for (const cp of all()) {
      expect([cp.loc, cp.n, plainHead(cp), plainHead(cp).length <= 28]).toEqual([cp.loc, cp.n, plainHead(cp), true]);
      const sub = fill(cp.sub, counts);
      expect([cp.loc, cp.n, sub, sub.length <= 46]).toEqual([cp.loc, cp.n, sub, true]);
      expect((cp.head.match(/\n/g) || []).length).toBeLessThanOrEqual(1);
      expect(cp.sub).not.toMatch(/\n/);
    }
  });

  test('no long dashes anywhere (owner rule)', () => {
    for (const cp of all()) {
      for (const s of texts(cp)) {
        expect([cp.loc, cp.n, s, /[—―⸺⸻]/.test(s)]).toEqual([cp.loc, cp.n, s, false]); // — ― ⸺ ⸻
        expect([cp.loc, cp.n, s, /(^|\s)[–‒−-](\s|$)/.test(s)]).toEqual([cp.loc, cp.n, s, false]); // « – », « - » як тире
        expect([cp.loc, cp.n, s, /--/.test(s)]).toEqual([cp.loc, cp.n, s, false]);
        // короткий тире — лише в діапазоні без пробілів: A1–C2
        for (const m of s.matchAll(/–/g)) {
          expect([cp.loc, cp.n, s.slice(m.index - 2, m.index + 3)]).toEqual([cp.loc, cp.n, expect.stringMatching(/^\S\S–\S\S$/)]);
        }
      }
    }
  });

  test('no prices, «free», ranks or other brands (rule 2.3.7)', () => {
    const banned = [
      /free/i,
      /безкоштовн/i,
      /безплатн/i,
      /gratis/i,
      /gratuit/i,
      /№\s*1/,
      /#\s*1\b/,
      /\bno\.?\s*1\b/i,
      /[$€£₴]/,
      /\d\s*(грн|usd|eur)/i,
      /\b(instagram|whatsapp|telegram|facebook|messenger|tiktok|snapchat|duolingo|babbel|memrise|apple|iphone|google|android)\b/i,
    ];
    for (const cp of all()) {
      for (const s of texts(cp)) for (const re of banned) expect([cp.loc, cp.n, s, re.test(s)]).toEqual([cp.loc, cp.n, s, false]);
    }
  });

  test('placeholders: only {LANGS} and {ACH}, markup balanced', () => {
    for (const cp of all()) {
      for (const s of texts(cp)) {
        const names = [...s.matchAll(/\{([^{}]*)\}/g)].map((m) => m[1]);
        for (const name of names) expect([cp.loc, cp.n, name]).toEqual([cp.loc, cp.n, expect.stringMatching(/^(LANGS|ACH)$/)]);
        expect(s.replace(/\{(LANGS|ACH)\}/g, '')).not.toMatch(/[{}]/);
      }
      // [ключові слова] лише в заголовку: одна пара, без вкладень
      expect(cp.sub).not.toMatch(/[[\]]/);
      expect(cp.head).toMatch(/^[^[\]]*(\[[^[\]]+\][^[\]]*)?$/);
    }
    // числа з'являються там, де їх чекає рендер: мови — кадр 2, досягнення — кадр 7
    for (const loc of LOCALES) {
      expect([loc, COPY[loc][1].sub.includes('{LANGS}')]).toEqual([loc, true]);
      expect([loc, COPY[loc][6].sub.includes('{ACH}')]).toEqual([loc, true]);
    }
  });

  test('the renderer reads the same counts the app has', () => {
    expect(countLangs(fs.readFileSync(path.join(ROOT, 'src/speech.js'), 'utf8'))).toBe(LANGS.length);
    expect(countAchievements(fs.readFileSync(path.join(ROOT, 'src/achievements.js'), 'utf8'))).toBe(ACHIEVEMENTS.length);
  });

  test('uk numbers agree with «мов» and «досягнень» (genitive plural)', () => {
    expect(ukGenitivePlural(counts.langs)).toBe(true);
    expect(ukGenitivePlural(counts.ach)).toBe(true);
    expect([5, 11, 14, 20, 29].every(ukGenitivePlural)).toBe(true);
    expect([1, 2, 21, 31, 42].some(ukGenitivePlural)).toBe(false);
  });

  test('frame 1 names the language being learnt (search row)', () => {
    const lang = { uk: /англійськ/i, 'en-US': /Spanish/, 'en-GB': /English/, 'es-MX': /inglés/ };
    for (const loc of LOCALES) expect([loc, lang[loc].test(plainHead(COPY[loc][0]))]).toEqual([loc, true]);
  });

  test('only frame 4 (scene, Pro) carries the PRO chip', () => {
    for (const cp of all()) expect([cp.loc, cp.n, !!cp.pro]).toEqual([cp.loc, cp.n, cp.slug === 'scene']);
  });

  test('typography: curly apostrophes and quotes, no ellipsis dots, no final period', () => {
    for (const cp of all()) {
      for (const s of texts(cp)) {
        expect([cp.loc, cp.n, s, /['"]/.test(s)]).toEqual([cp.loc, cp.n, s, false]);
        expect(s).not.toMatch(/\.\.\./);
        expect(s).not.toMatch(/\.$/);
        expect(s).not.toMatch(/\s{2,}|^\s|\s$/);
      }
      if (cp.loc === 'uk') expect(cp.sub + cp.head).not.toMatch(/[“”’]/); // uk: «» і ʼ
      if (cp.loc.startsWith('en')) expect(cp.sub + cp.head).not.toMatch(/[«»ʼ]/); // en: ’ і “”
    }
  });
});
