// Зменшена копія іконки застосунку для футера Параметрів і онбордингу
// (AppIcon у src/Logo.js): assets/icon.png 1024 px → assets/app-icon-192.png.
// Та сама картинка, що на головному екрані, а не перемальована SVG-копія:
// власник просив «наш логотип». 192 px — це 64 pt на екрані @3x.
//
// Без залежностей: PNG читаємо й пишемо самі (tools/png.mjs, лише zlib з
// Node), зменшуємо усередненням за площею — для зменшення в 5,3 раза це
// чесніше за найближчого сусіда й не мильніше за білінійне.
//
// Запуск із кореня проєкту:  node tools/export-app-icon.mjs [розмір]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, encode, resize } from './png.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'assets/icon.png');
const SIZE = Number(process.argv[2]) || 192;
const OUT = path.join(ROOT, `assets/app-icon-${SIZE}.png`);

const src = decode(SRC);
const png = encode(resize(src, SIZE, Math.round((SIZE * src.height) / src.width)));
fs.writeFileSync(OUT, png);
console.log(`${path.relative(ROOT, OUT)}: ${SIZE} px, ${(png.length / 1024).toFixed(1)} KB (з ${(fs.statSync(SRC).size / 1024).toFixed(0)} KB)`);
