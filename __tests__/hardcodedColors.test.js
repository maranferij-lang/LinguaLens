// Кольори інтерфейсу — лише з теми (план §5.14). З палітрами Pro будь-який
// прописаний у коді колір «вилазить» у чужій палітрі: фіолетова кнопка
// «Крейди» посеред Океану чи Какао. Фіксовані кольори дозволено тільки там,
// де вони не залежать від теми за задумом: хром камери, наліпки й картки
// (вони живуть на фото), сцена демо, арт (Lingo, іконка), віджети
// (значення за замовчуванням) і сам theme.js, де палітри визначено. Вогник
// серії з 5.10.2026 — уже не арт, а токени flame* теми: Flame.js під
// загальною перевіркою.
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
    for (const f of ['src/ScannerScreen.js', 'src/SettingsScreen.js', 'src/WordSheet.js', 'src/scene/SceneView.js', 'src/streak/Flame.js']) {
      expect([f, CHECKED.includes(f)]).toEqual([f, true]);
    }
  });
});

// Власник (5.10.2026): вогник серії — у фірмових кольорах, «не оранжево-
// жовтий». Кольори вогника — лише токени flame* теми; бурштин warm лишився
// для часу й «нового» і до серії не повертається. Перевірка діє й там, де
// фіксовані кольори дозволено (віджет «Серія» — його запасні значення).
describe('no orange or yellow flame can come back', () => {
  const FLAME_FILES = [
    'src/streak/Flame.js',
    'src/streak/StreakChip.js',
    'src/streak/StreakCard.js',
    'src/streak/RiskBanner.js',
    'src/streak/StreakCelebration.js',
    'src/StreakShowcase.js',
    'src/HoldToCommit.js',
    'src/Celebrate.js',
    'src/widgets/StreakWidget.js',
    'src/widgets/WidgetPreview.js',
  ];
  // Колишній бурштиновий малюнок вогника, сяйво демо й градієнт віджета
  const OLD_FLAME = /#(FFD15C|F59A2C|E9772B|FFF8DE|FFD877|FFB547|FFC24D|FFC94D|FFE7AE|FFE0A0|EFAE43|F3C16A|FFB13B|FFC24B|F0602A)\b|rgba\(\s*255\s*,\s*194\s*,\s*77/i;

  function hsl(hex) {
    let h = hex.replace('#', '');
    if (h.length === 3 || h.length === 4) h = [...h.slice(0, 3)].map((c) => c + c).join('');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const d = max - min;
    if (!d) return { h: 0, s: 0, l };
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    const hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: (hue * 60 + 360) % 360, s, l };
  }
  // Помаранчевий, бурштиновий, жовтий: відтінок 15–65°, насичений, не білий
  function orange(color) {
    const c = color.replace(/\s/g, '');
    let hex = c;
    const m = /^rgba?\((\d+),(\d+),(\d+)/i.exec(c);
    if (m) hex = '#' + [m[1], m[2], m[3]].map((v) => Number(v).toString(16).padStart(2, '0')).join('');
    if (!/^#[0-9a-f]{3,8}$/i.test(hex)) return false;
    const { h, s, l } = hsl(hex);
    return h >= 15 && h <= 65 && s >= 0.45 && l >= 0.3 && l <= 0.9;
  }
  const literals = (src) =>
    stripComments(src)
      .split('\n')
      .flatMap((line, i) => [...line.matchAll(LITERAL)].map((m) => `${i + 1}: ${m[2]}`));

  test('the detector knows the old amber and lets the brand flame through', () => {
    for (const c of ['#E0A02E', '#F0B84A', '#FFD15C', '#E9772B', 'rgba(255,194,77,0.95)', '#FC0']) expect([c, orange(c)]).toEqual([c, true]);
    for (const c of ['#6152E0', '#9B8FFF', '#3FCFC2', '#FFFFFF', '#FFF8DE', '#2A66DD', 'rgba(20,18,16,0.62)']) expect([c, orange(c)]).toEqual([c, false]);
  });

  test.each(FLAME_FILES)('%s: no orange or yellow colour literal', (file) => {
    const found = literals(fs.readFileSync(path.join(ROOT, file), 'utf8')).filter((x) => orange(x.replace(/^\d+: /, '')));
    expect(found).toEqual([]);
  });

  test.each(FLAME_FILES)('%s: the streak never takes the amber tokens', (file) => {
    const src = stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8'));
    expect(src.match(/\b[A-Z]\.warm\w*|pick\(\s*'warm\w*'/g) || []).toEqual([]);
  });

  test('the old amber flame art is gone from the whole app', () => {
    const leaks = ['App.js', ...filesUnder('src')].filter((f) => OLD_FLAME.test(stripComments(fs.readFileSync(path.join(ROOT, f), 'utf8'))));
    expect(leaks).toEqual([]);
  });

  test('every flame file is real (no stale entries)', () => {
    for (const f of FLAME_FILES) expect([f, fs.existsSync(path.join(ROOT, f))]).toEqual([f, true]);
  });
});
