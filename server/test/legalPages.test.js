// Сторінки /privacy і /support: структура uk і en збігається, юридичні розділи на місці,
// пошта лише плейсхолдером (її підставляє сервер), у видимому тексті немає довгих тире.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const DIR = process.env.PUBLIC_DIR || path.join(__dirname, '..', 'public');
const read = (f) => fs.readFileSync(path.join(DIR, f), 'utf8');
const section = (html, id) => {
  const m = html.match(new RegExp('<section class="lang" id="' + id + '"[^>]*>([\\s\\S]*?)</section>'));
  assert.ok(m, 'section ' + id);
  return m[1];
};
const headings = (s) => [...s.matchAll(/<h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
const count = (s, re) => (s.match(re) || []).length;

test('privacy: uk and en have the same structure', () => {
  const html = read('privacy.html');
  const uk = section(html, 'uk');
  const en = section(html, 'en');
  assert.equal(headings(uk).length, headings(en).length);
  assert.equal(count(uk, /<li>/g), count(en, /<li>/g));
  assert.equal(count(uk, /<p>/g), count(en, /<p>/g));
  assert.equal(count(uk, /class="contact"/g), count(en, /class="contact"/g));
});

test('privacy: covers controller, legal bases, transfers, retention, rights, children', () => {
  const en = section(read('privacy.html'), 'en');
  for (const re of [
    /data controller/i, /seller on the app/i, /Art\. 6\(1\)\(b\)/, /Art\. 6\(1\)\(f\)/, /Art\. 6\(1\)\(a\)/,
    /outside the EU/i, /Standard Contractual Clauses/i, /How long we keep data/, /Your rights/,
    /complain to the data protection authority/i, /Children/, /under 13/, /request logs/i, /RevenueCat/, /PostHog/,
    /Anthropic/, /Gemini/, /Warsaw/,
  ]) assert.match(en, re);
  const uk = section(read('privacy.html'), 'uk');
  for (const re of [/Контролер даних/, /продавцем/, /ст\. 6\(1\)\(b\)/, /ст\. 6\(1\)\(f\)/, /ст\. 6\(1\)\(a\)/, /Як довго зберігаємо/, /Твої права/, /органу із захисту даних/, /Діти/, /до 13 років/]) {
    assert.match(uk, re);
  }
});

test('privacy: no hard-coded email, every contact is a placeholder span after text in a <p>', () => {
  for (const f of ['privacy.html', 'support.html']) {
    const html = read(f);
    assert.doesNotMatch(html, /mailto:|[\w.+-]+@[\w-]+\.[a-z]{2,}/i);
    const spans = [...html.matchAll(/<p>([^<]*)<span class="contact">([^<]*)<\/span>/g)];
    assert.equal(spans.length, count(html, /class="contact"/g));
    for (const [, before, ph] of spans) { assert.notEqual(before.trim(), ''); assert.match(ph, /^\[.+\]$/); }
  }
});

test('support: FAQ matches the sync behaviour and plural widgets', () => {
  const html = read('support.html');
  for (const id of ['uk', 'en']) {
    const s = section(html, id);
    assert.match(s, /\/privacy/);
  }
  const uk = section(html, 'uk');
  const en = section(html, 'en');
  assert.match(uk, /Без входу словник зберігається лише на телефоні/);
  assert.match(uk, /входив через Apple/);
  assert.match(uk, /синхронізований словник/);
  assert.match(uk, /відкликаємо/);
  assert.match(uk, /три віджети/);
  assert.match(en, /Without signing in, your word list lives only on the phone/);
  assert.match(en, /synced word list/);
  assert.match(en, /revoke the Sign in with Apple/);
  assert.match(en, /three widgets/);
  assert.doesNotMatch(en, /and widget are free/);
  assert.equal(headings(uk).length, headings(en).length);
});

test('placeholder substitution as in server.js loadPage', () => {
  const html = read('privacy.html');
  const email = 'help@example.test';
  const link = `<a href="mailto:${email}">${email}</a>`;
  const out = html.replace(/<span class="contact">[^<]*<\/span>/g, link);
  assert.doesNotMatch(out, /class="contact"|\[вкажи свою пошту\]|\[add your email\]/);
  assert.equal(count(out, /mailto:help@example\.test/g), count(html, /class="contact"/g));
});

test('no long dashes in visible text', () => {
  for (const f of ['privacy.html', 'support.html']) {
    const html = read(f).replace(/<style[\s\S]*?<\/style>/g, '').replace(/<!--[\s\S]*?-->/g, '');
    const text = html.replace(/<[^>]+>/g, '\n');
    assert.doesNotMatch(text, /[—―‒]/);
    assert.doesNotMatch(text, /(^|\s)–|–(\s|$)/);
    assert.doesNotMatch(text, /(^|[ \t])-([ \t]|$)/m);
    assert.doesNotMatch(html, /&mdash;|&ndash;|&#8212;|&#8211;/);
  }
});
