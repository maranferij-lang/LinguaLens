// Правило власника (жовтень 2026): жодних довгих тире в тексті, який бачить
// людина. Заборонено «—» будь-де і тире-розділювач з пробілами: « – » та
// « - ». Можна: коротке тире без пробілів у діапазонах («A1–C2», «7–12»,
// «10–15 хв») і звичайний дефіс усередині слова. Слово й переклад у парі
// пишемо через « · »: «mug · чашка».
// Стережемо все, що доходить до очей: усі значення всіх мов зведених
// STRINGS (разом із підписами й підказками VoiceOver), locales/*.json,
// рядки app.json, видимий текст server/public/*.html і рядкові літерали
// (разом із шаблонами й JSX-текстом) у src/**/*.js та App.js. Коментарі не
// рахуються: у них тире можна, як і в документації для себе.
import fs from 'fs';
import path from 'path';
// Парсер Babel уже є в node_modules (на ньому стоїть jest-expo); він бачить
// коментарі окремо від коду, тож «тире в коментарі» не плутаємо з рядком.
import { parse } from '@babel/parser';

import { STRINGS } from '../src/i18n';

const ROOT = path.join(__dirname, '..');

// Що саме не так у рядку (порожньо — усе гаразд)
function longDashes(s) {
  const out = [];
  if (/[\u2014\u2015]/.test(s)) out.push('em dash «—»');
  if (/(^|\s)[\u2013\u2012]|[\u2013\u2012](\s|$)/.test(s)) out.push('spaced en dash «–»');
  if (/(^|\s)-(\s|$)/.test(s)) out.push('hyphen used as a dash «-»');
  return out;
}

// Винятки за ключем. Кожен — з причиною; зараз їх немає (ob3HookText,
// підзаголовок першого екрана, зник разом із підзаголовком). Новий текст
// із тире переписуємо, а не додаємо сюди.
const ALLOWED_KEYS = new Set();

// Літерали коду, які не стають тире з пробілами: роздільник ключів
// split('-'), одиноке '–', яким склеюють діапазон без пробілів
// (a + '–' + b у weekRangeLabel), повідомлення в консоль розробника.
function codeOnlyLiteral(value, ctx) {
  if (value === '-' || value === '\u2013') return true;
  if (ctx.callee && /^console\./.test(ctx.callee)) return true;
  return false;
}

describe('the checker itself', () => {
  test('catches em dash, spaced en dash and a hyphen used as a dash', () => {
    expect(longDashes('Scan things — save words')).toEqual(['em dash «—»']);
    expect(longDashes('Скануй—зберігай')).toEqual(['em dash «—»']);
    expect(longDashes('Words – today')).toEqual(['spaced en dash «–»']);
    expect(longDashes('– list item')).toEqual(['spaced en dash «–»']);
    expect(longDashes('Words - today')).toEqual(['hyphen used as a dash «-»']);
  });

  test('lets ranges, hyphenated words, minus and the middle dot through', () => {
    for (const ok of ['A1–C2', 'вік 7–12', '10–15 хв', 'Wi-Fi', 'e-mail', '-5 °C', 'mug · чашка', 'Settings → Camera']) {
      expect(longDashes(ok)).toEqual([]);
    }
  });
});

describe('UI strings (all 4 languages, merged STRINGS)', () => {
  test('no long dashes in any value, including VoiceOver labels and hints', () => {
    const hits = [];
    for (const lang of Object.keys(STRINGS)) {
      for (const [key, value] of Object.entries(STRINGS[lang])) {
        if (typeof value !== 'string' || ALLOWED_KEYS.has(key)) continue;
        const bad = longDashes(value);
        if (bad.length) hits.push(`${lang}.${key}: ${bad.join(', ')} | ${value}`);
      }
    }
    expect(hits).toEqual([]);
  });
});

// Усі рядки з JSON (значення, не ключі)
function jsonStrings(node, at, out) {
  if (typeof node === 'string') out.push([at, node]);
  else if (Array.isArray(node)) node.forEach((v, i) => jsonStrings(v, `${at}[${i}]`, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) jsonStrings(v, at ? `${at}.${k}` : k, out);
  }
  return out;
}

describe('locales/*.json and app.json', () => {
  const files = [
    ...fs
      .readdirSync(path.join(ROOT, 'locales'))
      .filter((f) => f.endsWith('.json'))
      .map((f) => 'locales/' + f),
    'app.json',
  ];

  test.each(files)('%s', (rel) => {
    const json = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    const hits = jsonStrings(json, '', [])
      .filter(([, s]) => longDashes(s).length)
      .map(([at, s]) => `${at}: ${s}`);
    expect(hits).toEqual([]);
  });
});

// Видимий текст HTML: без <script>, <style>, коментарів і тегів, з
// розкодованими сутностями (&mdash; на сторінці — те саме «—»). Атрибути
// title/alt/content теж читає людина (чи скрінрідер), їх беремо окремо.
function htmlVisibleText(html) {
  const decode = (s) =>
    s
      .replace(/&mdash;|&#8212;|&#x2014;/gi, '\u2014')
      .replace(/&ndash;|&#8211;|&#x2013;/gi, '\u2013')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/&amp;/g, '&');
  const attrs = [...html.matchAll(/\b(?:title|alt|content|aria-label)="([^"]*)"/gi)].map((m) => m[1]);
  const body = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, '\n');
  return [...body.split('\n'), ...attrs].map((s) => decode(s).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

describe('server/public/*.html', () => {
  const dir = path.join(ROOT, 'server', 'public');
  const pages = fs.readdirSync(dir).filter((f) => f.endsWith('.html'));

  test('html checker sees entities and ignores comments', () => {
    const lines = htmlVisibleText('<!-- a — b --><p title="x &mdash; y">One &ndash; two</p><style>p{}</style>');
    expect(lines).toEqual(['One – two', 'x — y']);
  });

  test.each(pages)('%s', (page) => {
    const hits = htmlVisibleText(fs.readFileSync(path.join(dir, page), 'utf8')).filter((s) => longDashes(s).length);
    expect(hits).toEqual([]);
  });
});

// ── літерали в коді ──

function sourceFiles() {
  const out = ['App.js'];
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.posix.join(dir, e.name);
      if (e.isDirectory()) walk(rel);
      else if (e.name.endsWith('.js')) out.push(rel);
    }
  };
  walk('src');
  return out;
}

function calleeName(node) {
  const c = node && node.callee;
  if (!c) return null;
  if (c.type === 'Identifier') return c.name;
  if (c.type === 'MemberExpression' && c.object.type === 'Identifier' && c.property.type === 'Identifier') {
    return c.object.name + '.' + c.property.name;
  }
  return null;
}

function propKey(node) {
  if (node.type !== 'ObjectProperty') return null;
  if (node.key.type === 'Identifier') return node.key.name;
  if (node.key.type === 'StringLiteral') return node.key.value;
  return null;
}

// Рядкові літерали, частини шаблонів і JSX-текст разом із найближчим
// ключем об'єкта й викликом, у якому вони стоять. Коментарі парсер віддає
// окремо, у дерево вони не потрапляють.
function literalsOf(src) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const out = [];
  const visit = (node, ctx) => {
    if (!node || typeof node.type !== 'string') return;
    const here = { key: propKey(node) ?? ctx.key, callee: calleeName(node) ?? ctx.callee };
    if (node.type === 'StringLiteral') out.push({ value: node.value, line: node.loc.start.line, ...here });
    else if (node.type === 'TemplateElement') out.push({ value: node.value.cooked ?? node.value.raw, line: node.loc.start.line, ...here });
    else if (node.type === 'JSXText') out.push({ value: node.value, line: node.loc.start.line, ...here });
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => visit(c, here));
      else if (v && typeof v === 'object') visit(v, here);
    }
  };
  visit(ast.program, { key: null, callee: null });
  return out;
}

describe('string literals in src/**/*.js and App.js', () => {
  test('the walker skips comments and sees templates and JSX text', () => {
    const lits = literalsOf(
      [
        '// tip — comment',
        '/* block — comment */',
        "const a = { label: 'Scan — save' };",
        'const b = `${x} — ${y}`;',
        'const c = <Text>Hi — there</Text>;',
      ].join('\n'),
    );
    const bad = lits.filter((l) => longDashes(l.value).length).map((l) => [l.line, l.key]);
    expect(bad).toEqual([
      [3, 'label'],
      [4, null],
      [5, null],
    ]);
  });

  test.each(sourceFiles())('%s', (rel) => {
    const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const hits = literalsOf(src)
      .filter((l) => !ALLOWED_KEYS.has(l.key) && !codeOnlyLiteral(l.value, l))
      .filter((l) => longDashes(l.value).length)
      .map((l) => `${rel}:${l.line} ${l.key ?? ''} | ${l.value.trim()}`);
    expect(hits).toEqual([]);
  });
});
