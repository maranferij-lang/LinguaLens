// Справжні фото власника замість намальованих (BRIEF §9: P1, P3, P4).
//   PHOTOS=/шлях/до/теки node tools/store-shots/render.mjs
// Тека може містити будь-що з цього (чого немає — лишається намальоване):
//   hero.jpg         кадр 1: червона чашка на столі, портрет 9:16
//                    (1080×1920), чашка у верхній середині кадру — там, де
//                    рамка прицілу сканера (x ≈ 25–75 %, y ≈ 27–55 %)
//   kitchen.jpg      кадр 4: кухня, портрет 9:16 (1080×1920) з предметами
//                    window, plant, pan, jar, board, kettle, apple, mug, towel
//   obj-<key>.jpg    кадр 2 (словник), 3, 8: квадратне фото одного предмета
//                    по центру (800×800), key — з COLLECTION (art/objects.mjs):
//                    mug, plant, apple, headphones, sneaker, lemon, camera,
//                    backpack, umbrella, clock, book, cactus, glasses, kettle,
//                    banana, scissors
//   shapes.json      контури предметів на цих фото (той самий формат, що
//                    WORK/art/shapes.json); його пише scan-photos.mjs тим
//                    самим AI, що й сервер застосунку
// Без контуру з shapes.json наліпку вирізало б по контуру намальованого
// предмета — тоді рендер попереджає.
import fs from 'node:fs';
import path from 'node:path';
import { COLLECTION } from './art/objects.mjs';
import { ART, readJson } from './paths.mjs';

export const SCENE_PHOTOS = ['hero', 'kitchen'];
export const PHOTO_FILES = [...SCENE_PHOTOS.map((s) => s + '.jpg'), ...COLLECTION.map((k) => `obj-${k}.jpg`)];

// Розмір JPEG із заголовка SOFn — без залежностей.
export function jpegSize(file) {
  const b = fs.readFileSync(file);
  if (b[0] !== 0xff || b[1] !== 0xd8) throw new Error('не JPEG: ' + file);
  let i = 2;
  while (i < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const m = b[i + 1];
    const len = b.readUInt16BE(i + 2);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
    i += 2 + len;
  }
  throw new Error('не знайшов розмір JPEG: ' + file);
}

// Кладе фото з теки поверх намальованого арту й зливає контури. Повертає
// список попереджень (для журналу рендера).
export function applyPhotos(dir) {
  if (!dir) return [];
  if (!fs.existsSync(dir)) throw new Error('PHOTOS: теки немає: ' + dir);
  const warn = [];
  const shapesFile = path.join(ART, 'shapes.json');
  const shapes = readJson(shapesFile);
  const given = readJson(path.join(dir, 'shapes.json'), null);
  for (const f of PHOTO_FILES) {
    const src = path.join(dir, f);
    if (!fs.existsSync(src)) continue;
    fs.copyFileSync(src, path.join(ART, f));
    const name = f.replace(/\.jpg$/, '');
    if (SCENE_PHOTOS.includes(name)) {
      // прозорий шар намальованої чашки (hero-mug.png) до фото не пасує:
      // кадр 1 ріже наліпку з самого фото, як застосунок
      for (const layer of fs.readdirSync(ART).filter((x) => x.startsWith(name + '-') && x.endsWith('.png'))) fs.rmSync(path.join(ART, layer));
      const { width, height } = jpegSize(src);
      if (Math.abs(width / height - 9 / 16) > 0.02) warn.push(`${f}: ${width}×${height}, а треба портрет 9:16 (1080×1920)`);
      const sc = given?.[name];
      // На справжньому фото — лише ті предмети, які на ньому знайшов AI:
      // контур намальованого предмета до фото не пасує.
      if (!sc?.objects || !Object.keys(sc.objects).length) warn.push(`${f}: немає контурів у shapes.json (запусти scan-photos.mjs)`);
      else if (name === 'hero' && !sc.objects.mug) warn.push(`${f}: немає контуру чашки (hero.objects.mug)`);
      shapes[name] = { width, height, objects: sc?.objects && Object.keys(sc.objects).length ? sc.objects : shapes[name].objects };
    } else {
      const key = name.slice(4);
      const { width, height } = jpegSize(src);
      if (width !== height) warn.push(`${f}: ${width}×${height}, а треба квадрат`);
      const o = given?.objects?.[key];
      if (o?.shape) shapes.objects[key] = o;
      else warn.push(`${f}: немає контуру в shapes.json (objects.${key}.shape)`);
    }
    console.log('photo', f);
  }
  fs.writeFileSync(shapesFile, JSON.stringify(shapes));
  return warn;
}
