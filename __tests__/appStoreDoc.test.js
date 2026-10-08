// Тексти для App Store Connect в APPSTORE.md мають влазити в ліміти Apple, а
// числа в них збігатися з кодом. Це те, що не видно, доки ASC не відмовить:
// нотатки для рецензента (4000 байтів), ключові слова (100 байтів, кирилиця
// 2 байти на літеру), опис (4000 символів), кількість досягнень.
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');
const doc = fs.readFileSync(path.join(ROOT, 'APPSTORE.md'), 'utf8');
const achievementsSrc = fs.readFileSync(path.join(ROOT, 'src/achievements.js'), 'utf8');

const bytes = (s) => Buffer.byteLength(s, 'utf8');
const chars = (s) => [...s].length;
// Розділ від заголовка до наступного заголовка того ж чи вищого рівня
function section(heading) {
  const level = heading.match(/^#+/)[0].length;
  const i = doc.indexOf('\n' + heading);
  expect(i).toBeGreaterThan(-1);
  const rest = doc.slice(i + 1 + heading.length);
  const next = rest.search(new RegExp('\\n#{1,' + level + '} '));
  return rest.slice(0, next === -1 ? undefined : next);
}
const fences = (s) => [...s.matchAll(/```\n([\s\S]*?)\n```/g)].map((m) => m[1]);
// Довгі тире й тире-розділювач (правило власника); діапазони «A1–C2» можна
const longDash = (s) => /[‒—―]/.test(s) || /(^|\s)–|–(\s|$)/.test(s);

const LOCALES = {
  'en-US': '### English (U.S.) — основна мова',
  uk: '### Українська',
  'en-GB': '### English (U.K.) — для України, Польщі, Німеччини',
  'es-MX': '### Español (México) — іспаномовні в США',
};

describe('review notes', () => {
  const notes = section('## Нотатки для рецензента (App Review Information → Notes)');
  const [A, B] = fences(notes);
  const aiLine = A.split('\n').find((l) => l.startsWith('AI PROCESSING:'));
  const withConsent = A.replace(aiLine, B);

  test('the text for pasting starts with HOW TO TEST', () => {
    expect(A.startsWith('HOW TO TEST')).toBe(true);
  });
  test('both variants fit the 4000 byte limit with room to spare (3800)', () => {
    expect(bytes(A)).toBeLessThanOrEqual(3800);
    expect(bytes(withConsent)).toBeLessThanOrEqual(3800);
  });
  test('variant B replaces exactly one line', () => {
    expect(aiLine).toBeTruthy();
    expect(B.startsWith('AI PROCESSING:')).toBe(true);
    expect(B.includes('\n')).toBe(false);
  });
  test('plain ASCII, no placeholders, no long dashes, no talk of an update', () => {
    for (const t of [A, withConsent]) {
      expect(t).toMatch(/^[\x00-\x7f]+$/);
      expect(t).not.toMatch(/<[^>]*>/);
      expect(longDash(t)).toBe(false);
      expect(t).not.toMatch(/v1\.3|NEW IN THIS VERSION/);
    }
  });
});

describe('store texts', () => {
  for (const [loc, heading] of Object.entries(LOCALES)) {
    describe(loc, () => {
      const s = section(heading);
      const blocks = fences(s);
      test('keywords fit 100 bytes', () => {
        const kw = [...s.matchAll(/\*\*(?:Keywords|Ключові слова|Palabras clave)\*\*[^\n]*\n```\n([^\n]+)\n```/g)].map((m) => m[1]);
        expect(kw.length).toBeGreaterThan(0);
        expect(bytes(kw[0])).toBeLessThanOrEqual(100);
        expect(kw[0]).not.toMatch(/\s/);
      });
      test('name and subtitle: declared length is the real one, at most 30', () => {
        const found = [...s.matchAll(/\*\*(?:Name|Назва|Nombre|Subtitle|Підзаголовок|Subtítulo)\*\* \((\d+)\): `([^`]+)`/g)];
        expect(found.length).toBe(2);
        for (const [, n, v] of found) {
          expect(chars(v)).toBe(Number(n));
          expect(chars(v)).toBeLessThanOrEqual(30);
        }
      });
      test('description fits 4000 characters, promo 170, no long dashes', () => {
        const desc = blocks.filter((b) => chars(b) > 1500);
        expect(desc.length).toBe(1);
        expect(chars(desc[0])).toBeLessThanOrEqual(4000);
        for (const b of blocks) {
          expect(longDash(b)).toBe(false);
          if (!b.includes('\n') && !b.includes(',,') && b.includes(' ') && chars(b) > 100) expect(chars(b)).toBeLessThanOrEqual(170);
        }
      });
    });
  }

  test('en-US description uses US spelling, en-GB the British one', () => {
    const us = fences(section(LOCALES['en-US'])).join('\n');
    const gb = fences(section(LOCALES['en-GB'])).join('\n');
    expect(us).not.toMatch(/recognis|colour|cancelled/);
    expect(gb).not.toMatch(/recogniz|\bcolor|canceled/);
    expect(gb).toMatch(/recognise/);
    expect(gb).toMatch(/colour themes/);
  });

  test('every «N achievements» in the descriptions is the real count', () => {
    const n = (achievementsSrc.match(/^\s*\{ id: '/gm) || []).length;
    expect(n).toBeGreaterThan(0);
    const said = [...doc.matchAll(/\b(\d+) (achievements|досягнень|logros)\b/g)].map((m) => Number(m[1]));
    expect(said.length).toBeGreaterThanOrEqual(6);
    for (const v of said) expect(v).toBe(n);
  });
});
