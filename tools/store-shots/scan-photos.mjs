// Контури для справжніх фото (PHOTOS, див. photos.mjs): проганяє кожне фото
// через той самий AI, що й сервер застосунку (server/ai.js: та сама
// підказка, ті самі recognize / recognizeScene і чистка), і пише
// PHOTOS/shapes.json. Ключі API — з server/.env (GEMINI_API_KEY чи
// ANTHROPIC_API_KEY + PROVIDER), як у локального сервера (SETUP_MAC.md §3).
//
//   PHOTOS=~/Desktop/store-photos node tools/store-shots/scan-photos.mjs
//
// Слова, які назвала модель, скрипт лише показує поруч з очікуваними
// (data.mjs): назви на кадрах беруться з data.mjs, тож якщо твоя річ — не
// «mug», виправ слово там.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PHOTOS, ROOT, readJson } from './paths.mjs';
import { COLLECTION } from './art/objects.mjs';
import { vocab } from './data.mjs';
import { jpegSize } from './photos.mjs';

if (!PHOTOS) throw new Error('Вкажи теку з фото: PHOTOS=/шлях node tools/store-shots/scan-photos.mjs');

// server/.env → process.env (лише те, чого ще немає)
const envFile = path.join(ROOT, 'server/.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
const ai = createRequire(import.meta.url)(path.join(ROOT, 'server/ai.js'));
console.log('AI:', ai.PROVIDER);

const out = readJson(path.join(PHOTOS, 'shapes.json'), { objects: {} });
out.objects ||= {};
const b64 = (f) => fs.readFileSync(f).toString('base64');
const pair = { lang: 'en', native: 'uk' }; // контур від мови не залежить

// Один предмет: фото → { word, box, outline }
async function single(file) {
  const raw = await ai.recognize(b64(file), pair.lang, pair.native);
  return { word: ai.cleanWord(raw || {}).word, box: ai.cleanBox(raw?.box), outline: ai.cleanOutline(raw?.outline) };
}

// Квадратні фото предметів (кадр 2): shape — [x, y] 0–1 у квадраті
for (const key of COLLECTION) {
  const f = path.join(PHOTOS, `obj-${key}.jpg`);
  if (!fs.existsSync(f)) continue;
  const r = await single(f);
  if (!r.outline) { console.warn(`obj-${key}.jpg: модель не дала контуру (${r.word || 'нічого'})`); continue; }
  out.objects[key] = { shape: r.outline.map(([y, x]) => [x / 1000, y / 1000]), bbox: r.box ? [r.box[1], r.box[0], r.box[3], r.box[2]].map((v) => v / 1000) : undefined };
  console.log(`obj-${key}.jpg: «${r.word}» (на кадрах: «${vocab('uk', key).word}»)`);
}

// Кадр 1: чашка на столі
const hero = path.join(PHOTOS, 'hero.jpg');
if (fs.existsSync(hero)) {
  const r = await single(hero);
  if (r.box && r.outline) {
    out.hero = { ...jpegSize(hero), objects: { mug: { box: r.box, outline: r.outline } } };
    console.log(`hero.jpg: «${r.word}» (на кадрі: «${vocab('uk', 'mug').word}»)`);
  } else console.warn('hero.jpg: модель не дала рамки чи контуру');
}

// Кадр 4: кухня. Слова моделі → ключі сцени за англійськими назвами з
// data.mjs (і кількома синонімами); що не впізнали — показуємо.
const kitchen = path.join(PHOTOS, 'kitchen.jpg');
if (fs.existsSync(kitchen)) {
  const KEYS = ['window', 'plant', 'pan', 'jar', 'board', 'kettle', 'apple', 'mug', 'towel'];
  const SYN = { plant: ['plant', 'potted plant'], pan: ['pan', 'skillet'], board: ['chopping board', 'board'], towel: ['towel', 'dish towel', 'kitchen towel'], mug: ['cup', 'coffee mug'] };
  const keyOf = (w) => {
    const s = String(w).toLowerCase().replace(/^(the|a|an) /, '');
    return KEYS.find((k) => vocab('uk', k).word === s || (SYN[k] || []).includes(s)) || null;
  };
  const objects = ai.cleanScene(await ai.recognizeScene(b64(kitchen), pair.lang, pair.native)) || [];
  const found = {};
  for (const o of objects) {
    const k = keyOf(o.word);
    if (k && o.box && o.outline && !found[k]) found[k] = { box: o.box, outline: o.outline };
    console.log(`kitchen.jpg: «${o.word}» → ${k || 'не з цієї сцени (додай у data.mjs, щоб показати)'}`);
  }
  out.kitchen = { ...jpegSize(kitchen), objects: found };
  const missing = KEYS.filter((k) => !found[k]);
  if (missing.length) console.warn('kitchen.jpg: без контуру лишились ' + missing.join(', '));
}

fs.writeFileSync(path.join(PHOTOS, 'shapes.json'), JSON.stringify(out) + '\n');
console.log('→', path.join(PHOTOS, 'shapes.json'));
