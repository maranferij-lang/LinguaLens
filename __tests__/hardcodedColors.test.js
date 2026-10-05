// Кольори інтерфейсу — лише з теми (план §5.14). З палітрами Pro будь-який
// прописаний у коді колір «вилазить» у чужій палітрі: фіолетова кнопка
// «Крейди» посеред Океану чи Какао. Фіксовані кольори дозволено тільки там,
// де вони не залежать від теми за задумом: хром камери, наліпки й картки
// (вони живуть на фото), сцена демо, арт (Lingo, вогник, іконка), віджети
// (значення за замовчуванням) і сам theme.js, де палітри визначено.
// Чорний і білий з будь-якою прозорістю — не колір палітри (затемнення під
// аркушем, повзунок перемикача, текст на фото), їх можна будь-де.
//
// Інтеграція v1.3 (C2): перевірка діє для всіх файлів поза ALLOWED. Біла
// «табличка» на фото (WordSheet, чипи сцени) бере кольори PLATE зі
// src/WordPlate.js, хром камери живе в src/scanner/*.
import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..');

// §5.14: де фіксовані кольори дозволено
const ALLOWED = [
  /^src\/theme\.js$/, // палітри
  /^src\/scanner\//, // хром камери
  /^src\/Chrome\.js$/, // CAMERA_CHROME — таб-бар над камерою
  /^src\/share\//, // наліпки, картки, градієнт Stories
  /^src\/WordPlate\.js$/,
  /^src\/Sticker\.js$/,
  /^src\/DemoDesk\.js$/, // сцена демо онбордингу
  /^src\/ScanDemo\.js$/,
  /^src\/scene\/SceneArt\.js$/, // арт
  /^src\/Mascot\.js$/,
  /^src\/streak\/Flame\.js$/,
  /^src\/Logo\.js$/, // іконка застосунку й знак — бренд, а не тема
  /^src\/widgets\/[^/]*Widget\.js$/, // значення за замовчуванням у віджетах
];

function filesUnder(dir) {
  const out = [];
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(rel));
    else if (/\.js$/.test(e.name)) out.push(rel);
  }
  return out;
}

// Коментарі не рахуються: там кольори згадують, щоб пояснити рішення
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\w])\/\/.*$/gm, '$1');
}

// Рядкові літерали з кольором: '#RGB', "#RRGGBB", '#RRGGBBAA', 'rgb(…)', 'rgba(…)'
const LITERAL = /(['"`])(#[0-9A-Fa-f]{3,8}|rgba?\([^)'"`]*\))\1/g;

function neutral(color) {
  const c = color.toLowerCase().replace(/\s/g, '');
  if (/^#(fff|ffffff|000|000000)([0-9a-f]{2})?$/.test(c)) return true;
  const m = /^rgba?\((\d+),(\d+),(\d+)/.exec(c);
  return !!m && [m[1], m[2], m[3]].every((v) => v === m[1]) && (m[1] === '255' || m[1] === '0');
}

function chromaticColors(src) {
  const found = [];
  stripComments(src)
    .split('\n')
    .forEach((line, i) => {
      for (const m of line.matchAll(LITERAL)) if (!neutral(m[2])) found.push(`${i + 1}: ${m[2]}`);
    });
  return found;
}

const FILES = ['App.js', ...filesUnder('src')].filter((f) => !ALLOWED.some((r) => r.test(f)));
const CHECKED = FILES;

describe('the checker itself', () => {
  test('finds a chromatic colour, skips black, white, comments and non-strings', () => {
    const src = [
      "const a = { color: '#5B4FD6' };",
      'const b = "#fff"; const c = \'rgba(0,0,0,0.4)\'; const d = "rgba(255, 255, 255, 0.7)";',
      '// accent #9B8FFF in a comment',
      '/* rgba(12,10,8,0.6) */',
      '<Path stroke="#E0A02E" />',
      'const e = rgb(hex); const url = "https://x.y/#frag";',
      "const f = 'rgba(12,10,8,0.6)';",
    ].join('\n');
    expect(chromaticColors(src)).toEqual(['1: #5B4FD6', '5: #E0A02E', '7: rgba(12,10,8,0.6)']);
  });

  test('every allowed path is real (no stale entries)', () => {
    const all = ['App.js', ...filesUnder('src')];
    for (const r of ALLOWED) expect([String(r), all.some((f) => r.test(f))]).toEqual([String(r), true]);
  });
});

describe('UI colours come from the theme (plan §5.14)', () => {
  test.each(CHECKED)('%s', (file) => {
    const found = chromaticColors(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    expect(found).toEqual([]);
  });

  test('Chalk’s brand accents never show up outside theme.js and the art', () => {
    const accents = /#5B4FD6|#9B8FFF/i;
    const leaks = CHECKED.filter((f) => accents.test(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
    expect(leaks).toEqual([]);
  });

  test('the screens this stream owns are clean without exceptions', () => {
    for (const f of ['App.js', 'src/PaywallScreen.js', 'src/settings/ThemeSection.js', 'src/subscription.js']) {
      expect([f, CHECKED.includes(f)]).toEqual([f, true]);
    }
  });

  // C2: файли, що до злиття гілок ще мали прописані кольори, теж під перевіркою
  test('after integration nothing waits for an exception', () => {
    for (const f of ['src/ScannerScreen.js', 'src/SettingsScreen.js', 'src/WordSheet.js', 'src/scene/SceneView.js']) {
      expect([f, CHECKED.includes(f)]).toEqual([f, true]);
    }
  });
});
