// Спільні шляхи й запуск браузера для tools/store-shots.
// Усе рахується від розташування цього файла, тож рендер однаково працює в
// будь-якій копії репозиторію (Mac власника, CI, окремий worktree).
//
// Змінні середовища (усі необов'язкові):
//   OUT         — куди класти готові кадри й аркуші (типово store-shots-out/
//                 у корені репозиторію, він у .gitignore)
//   WORK        — кеш проміжних файлів: веб-збірка, арт, знімки екранів
//                 (типово OUT/.work)
//   PLAYWRIGHT  — шлях до index.mjs пакета playwright, якщо він не
//                 встановлений поруч із проєктом
//   CHROMIUM    — шлях до виконуваного файла Chromium (типово той, що
//                 поставив `npx playwright install chromium`)
//   PHOTOS      — тека зі справжніми фото власника замість намальованих
//                 (README.md, розділ «Справжні фото»)
//   ICON        — інша іконка на головному екрані кадру 6 (тест іконки в
//                 App Store, PPO): ім'я з assets/ знятої версії
//                 (icon-eye.png) або шлях до PNG; те саме, що --icon=…
//   PORT        — порт статичного сервера (типово перший вільний з 9100–9119)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '../..');
export const OUT = process.env.OUT ? path.resolve(process.env.OUT) : path.join(ROOT, 'store-shots-out');
export const WORK = process.env.WORK ? path.resolve(process.env.WORK) : path.join(OUT, '.work');
export const WEB = path.join(WORK, 'web'); // веб-збірка застосунку
export const LIB = path.join(WORK, 'lib'); // чисті модулі застосунку (рядки, геометрія наліпок)
export const STATIC = path.join(WORK, 'static'); // іконка й Лінго з тієї самої версії
export const ART = path.join(WORK, 'art'); // намальовані предмети й сцени (або фото власника)
export const UI = path.join(WORK, 'ui'); // знімки екранів застосунку
export const TMP = path.join(WORK, 'compose'); // HTML кадрів
export const FONTS = path.join(ROOT, 'node_modules/@expo-google-fonts/nunito');
// Транскрипцію застосунок пише системним заокругленим шрифтом (F.ipa у
// src/theme.js, SF Pro Rounded на iPhone). SF поза Apple немає; найближчий
// шрифт із повним IPA, що вже лежить у залежностях проєкту, — Inter
// (expo-dev-client → expo-dev-menu). Ним і підміняємо SF на знімках.
export const IPA_FONTS = {
  dir: path.join(ROOT, 'node_modules/expo-dev-menu/android/src/debug/res/font'),
  faces: [[400, 'inter_regular.ttf'], [500, 'inter_medium.ttf'], [600, 'inter_semibold.ttf'], [700, 'inter_bold.ttf']],
};
export const PHOTOS = process.env.PHOTOS ? path.resolve(process.env.PHOTOS) : null;

export const fileUrl = (p) => pathToFileURL(p).href;
// Скрипт запущено напряму (node file.mjs), а не імпортовано.
export const isMain = (url) => !!process.argv[1] && url === pathToFileURL(path.resolve(process.argv[1])).href;

// Playwright: з PLAYWRIGHT або звичайним import('playwright').
let pw = null;
export async function chromium() {
  if (!pw) {
    const mod = process.env.PLAYWRIGHT ? pathToFileURL(path.resolve(process.env.PLAYWRIGHT)).href : 'playwright';
    try {
      pw = await import(mod);
    } catch (e) {
      throw new Error(
        `Playwright не знайдено (${mod}). Один раз: npm i --no-save playwright && npx playwright install chromium ` +
          `(або PLAYWRIGHT=/шлях/до/playwright/index.mjs). ${e.message}`,
      );
    }
  }
  return pw.chromium || pw.default.chromium;
}

export async function launch(opts = {}) {
  const c = await chromium();
  const exe = process.env.CHROMIUM;
  if (exe && !fs.existsSync(exe)) throw new Error('CHROMIUM вказує на файл, якого немає: ' + exe);
  return c.launch({ ...(exe ? { executablePath: exe } : {}), ...opts });
}

export const readJson = (f, fallback = {}) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : fallback);
