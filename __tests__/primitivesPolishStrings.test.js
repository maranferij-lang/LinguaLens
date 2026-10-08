// Фрагмент src/strings/polish-primitives.js: підпис «Завантаження» для
// контейнера зі Skeleton. Фрагмент перевіряємо сам по собі, а не через
// STRINGS: тест не залежить від того, чи інтегратор уже підключив файл до
// src/i18n.js (після підключення __tests__/i18nFragments.test.js стереже
// решту правил для всіх фрагментів).
import fs from 'fs';
import path from 'path';
import frag from '../src/strings/polish-primitives';
import { BASE_STRINGS, FRAGMENTS } from '../src/i18n';

const LANGS = ['en', 'uk', 'de', 'es', 'ru'];
const OTHERS = Object.entries(FRAGMENTS).filter(([name]) => name !== 'polish-primitives');

test('five languages with the same keys, no empty strings', () => {
  expect(Object.keys(frag).sort()).toEqual([...LANGS].sort());
  const en = Object.keys(frag.en).sort();
  expect(en).toContain('loading');
  for (const l of LANGS) {
    expect([l, Object.keys(frag[l]).sort()]).toEqual([l, en]);
    for (const v of Object.values(frag[l])) expect(v.trim().length).toBeGreaterThan(0);
  }
});

test('same placeholders in every language', () => {
  const ph = (s) => [...new Set([...s.matchAll(/\{(\w+)(?:\|[^{}]*)?\}/g)].map((m) => m[1]))].sort();
  for (const k of Object.keys(frag.en)) for (const l of LANGS) expect([l, k, ph(frag[l][k])]).toEqual([l, k, ph(frag.en[k])]);
});

test('no key collides with the base strings or another fragment', () => {
  const clash = [];
  for (const k of Object.keys(frag.en)) {
    if (k in BASE_STRINGS.en) clash.push(`${k} is a base key`);
    for (const [name, f] of OTHERS) if (k in f.default.en) clash.push(`${k} is in ${name}`);
  }
  expect(clash).toEqual([]);
});

test('no long dashes and no emoji in the text, no key defined twice per language', () => {
  // (коментарі в шапці фрагментів довгі тире мають, це дозволено: рахується текст для людини)
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/strings/polish-primitives.js'), 'utf8');
  for (const l of LANGS) for (const v of Object.values(frag[l])) expect(v).not.toMatch(/[\u2014\u2013\u{1F300}-\u{1FAFF}]/u);
  for (const l of LANGS) {
    const head = `\n  ${l}: {`;
    const start = src.indexOf(head);
    const end = src.indexOf('\n  },', start);
    expect([l, start > -1 && end > start]).toEqual([l, true]);
    const keys = [...src.slice(start + head.length, end).replace(/\/\/.*$/gm, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''").matchAll(/([A-Za-z_]\w*)\s*:/g)].map((m) => m[1]);
    expect([l, new Set(keys).size]).toEqual([l, keys.length]);
  }
});

test('the text is the right word for a VoiceOver label (no trailing dots)', () => {
  expect(frag.en.loading).toBe('Loading');
  expect(frag.uk.loading).toBe('Завантаження');
  for (const l of LANGS) expect(frag[l].loading).not.toMatch(/[.…]$/);
});
