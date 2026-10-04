#!/usr/bin/env node
// Тестове фото симулятора (assets/dev/sample-desk.jpg, src/devSample.js)
// живе лише в розробці: у релізному бандлі його бути не повинно. Його
// require стоїть за __DEV__, і Metro викидає мертву гілку разом із файлом, —
// цей скрипт перевіряє, що так і є (план v1.3, інтеграція C3).
//
//   node scripts/check-dev-assets.js            — сам робить релізний експорт
//                                                 iOS у тимчасову теку
//   node scripts/check-dev-assets.js <тека>     — перевіряє вже готовий
//                                                 експорт (npx expo export)
// Лише Node, без пакетів. Код виходу 1 — dev-файл потрапив у реліз.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEV_NAMES = ['sample-desk'];

// Усі файли експорту, де може згадуватись асет: самі асети (Metro лишає
// їм хеш замість імені, тож шукаємо ще й у метаданих і бандлі).
function listFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

// → список знахідок: [{ file, name }]
function findDevAssets(dir) {
  const hits = [];
  for (const file of listFiles(dir)) {
    const rel = path.relative(dir, file);
    for (const name of DEV_NAMES) {
      if (rel.includes(name)) {
        hits.push({ file: rel, name });
        continue;
      }
      // асети Metro лежать під хешами — ім'я видно лише в текстових файлах
      // (metadata.json, assetmap.json, бандл)
      if (/\.(json|js|hbc|map)$/.test(file) && fs.statSync(file).size < 64 * 1024 * 1024) {
        const text = fs.readFileSync(file).toString('latin1');
        if (text.includes(name)) hits.push({ file: rel, name });
      }
    }
  }
  return hits;
}

function main() {
  let dir = process.argv[2];
  if (!dir) {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-release-'));
    console.log('Релізний експорт iOS → ' + dir);
    execFileSync('npx', ['expo', 'export', '--platform', 'ios', '--output-dir', dir], {
      stdio: 'inherit',
      env: { ...process.env, CI: '1', NODE_ENV: 'production' },
    });
  }
  const hits = findDevAssets(dir);
  if (hits.length) {
    console.error('У релізному експорті є файли лише для розробки:');
    for (const h of hits) console.error('  ' + h.name + ' — ' + h.file);
    process.exit(1);
  }
  console.log('Добре: у релізному експорті немає ' + DEV_NAMES.join(', ') + '.');
}

if (require.main === module) main();

module.exports = { findDevAssets, DEV_NAMES };
