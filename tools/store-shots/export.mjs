// Веб-збірка застосунку з потрібної версії (REF, типово HEAD) із входом для
// скріншотів (app-entry/). Репозиторій не змінюється: дерево версії
// розпаковується `git archive` у тимчасову теку, туди ж — посилання на
// node_modules проєкту й app-entry/index.js замість index.js, потім
// `expo export -p web`, і тимчасова тека зникає.
//
// Поруч зі збіркою кладемо те, що читає компонувальник кадрів:
//   lib/*.mjs      — чисті модулі тієї ж версії (рядки, досягнення, геометрія
//                    наліпок) з розширенням .mjs, щоб Node імпортував їх сам;
//   lib/speech.src.js — список мов (LANGS) як текст: модуль тягне expo-speech;
//   static/        — assets/icon*.png (головна іконка й альтернативні для
//                    тесту іконки, PPO) і assets/lingo-*.png цієї версії.
//
//   node tools/store-shots/export.mjs            REF=… для іншої версії
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HERE, LIB, ROOT, STATIC, WEB, WORK, isMain } from './paths.mjs';

const git = (...args) => execFileSync('git', ['-C', ROOT, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

// Модуль без залежностей від React Native: копіюємо його й усі відносні
// імпорти, дописуючи .mjs (Node не вгадує розширення в ESM).
function copyPure(srcRoot, rel, seen = new Set()) {
  if (seen.has(rel)) return;
  seen.add(rel);
  const file = path.join(srcRoot, rel + '.js');
  let code = fs.readFileSync(file, 'utf8');
  code = code.replace(/(from\s+|import\s+)'([^']+)'/g, (m, kw, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${rel}.js імпортує '${spec}' — це не чистий модуль`);
    const dep = path.posix.normalize(path.posix.join(path.posix.dirname(rel), spec));
    copyPure(srcRoot, dep, seen);
    return `${kw}'${spec}.mjs'`;
  });
  const dest = path.join(LIB, rel + '.mjs');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, code);
}

// Прокладка для shot-gallery.js: варіанти мов (src/langVariants.js) є не в
// кожній версії, а Metro не збере імпорт файла, якого немає. Без варіантів
// setChosenVariants нічого не робить, як і застосунок тієї версії.
export function variantsShim(hasVariants) {
  return hasVariants
    ? "export { setChosenVariants } from './src/langVariants';\n"
    : 'export function setChosenVariants() {}\n';
}

export const STATIC_FILES = ['icon.png', 'lingo-wave.png', 'lingo-celebrate.png', 'lingo-think.png', 'lingo-encourage.png'];

export function exportWeb({ ref = process.env.REF || 'HEAD', keep = false } = {}) {
  const rev = git('rev-parse', '--short', ref + '^{commit}');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-shots-'));
  const tar = path.join(tmp, '..', path.basename(tmp) + '.tar');
  try {
    git('archive', '--format=tar', '-o', tar, rev);
    execFileSync('tar', ['-xf', tar, '-C', tmp]);
    fs.symlinkSync(fs.realpathSync(path.join(ROOT, 'node_modules')), path.join(tmp, 'node_modules'));
    // app-entry/index.js повторює Root з index.js. Якщо в версії він став
    // іншим (нові обгортки), скажемо про це: вхід треба оновити.
    const imports = [...fs.readFileSync(path.join(tmp, 'index.js'), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]).sort();
    const expected = ['./App', './src/ErrorBoundary', './src/SafeArea', 'expo'];
    if (imports.join() !== expected.join()) console.warn(`увага: index.js у ${ref} імпортує ${imports.join(', ')}; перевір app-entry/index.js`);
    fs.copyFileSync(path.join(HERE, 'app-entry/index.js'), path.join(tmp, 'index.js'));
    fs.copyFileSync(path.join(HERE, 'app-entry/shot-gallery.js'), path.join(tmp, 'shot-gallery.js'));
    fs.writeFileSync(path.join(tmp, 'shot-variants.js'), variantsShim(fs.existsSync(path.join(tmp, 'src/langVariants.js'))));
    fs.rmSync(WEB, { recursive: true, force: true });
    fs.mkdirSync(WORK, { recursive: true });
    console.log(`expo export -p web: ${ref} (${rev}) …`);
    const log = execFileSync('npx', ['expo', 'export', '-p', 'web', '--output-dir', WEB], {
      cwd: tmp,
      env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
      encoding: 'utf8',
      maxBuffer: 64 << 20,
      timeout: 900000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    fs.writeFileSync(path.join(WORK, 'export.log'), log);
    fs.writeFileSync(path.join(WEB, 'REV'), rev + '\n');

    fs.rmSync(LIB, { recursive: true, force: true });
    const src = path.join(tmp, 'src');
    for (const m of ['i18n', 'achievements', 'stickerGeometry']) copyPure(src, m);
    fs.copyFileSync(path.join(src, 'speech.js'), path.join(LIB, 'speech.src.js'));
    fs.mkdirSync(STATIC, { recursive: true });
    for (const f of STATIC_FILES) fs.copyFileSync(path.join(tmp, 'assets', f), path.join(STATIC, f));
    // альтернативні іконки (icon-eye.png…): кадр 6 з ICON=… бере їх з тієї ж версії
    for (const f of fs.readdirSync(path.join(tmp, 'assets')).filter((x) => /^icon-.+\.png$/.test(x))) {
      fs.copyFileSync(path.join(tmp, 'assets', f), path.join(STATIC, f));
    }
    console.log(`web export of ${ref} (${rev}) → ${WEB}`);
  } finally {
    fs.rmSync(tar, { force: true });
    if (!keep) fs.rmSync(tmp, { recursive: true, force: true });
    else console.log('тимчасова тека лишилась:', tmp);
  }
  return { rev, web: WEB };
}

export const exportedRev = () => {
  const f = path.join(WEB, 'REV');
  return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim() : null;
};

if (isMain(import.meta.url)) exportWeb({ keep: process.argv.includes('--keep') });
