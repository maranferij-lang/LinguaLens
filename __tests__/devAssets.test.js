// scripts/check-dev-assets.js: тестове фото симулятора не має потрапити в
// релізний експорт. Перевіряємо сам пошук на підставних теках.
import fs from 'fs';
import os from 'os';
import path from 'path';

const { findDevAssets } = require('../scripts/check-dev-assets');

function exportDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'll-export-'));
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), text);
  }
  return dir;
}

test('a clean release export passes', () => {
  const dir = exportDir({ 'metadata.json': '{"assets":[]}', '_expo/static/js/ios/index.hbc': 'bytecode' });
  expect(findDevAssets(dir)).toEqual([]);
});

test('the photo is found by file name, in the asset map and in the bundle', () => {
  const dir = exportDir({
    'assets/dev/sample-desk.jpg': 'jpg',
    'metadata.json': '{"assets":[{"path":"assets/abc","ext":"jpg","name":"sample-desk"}]}',
    '_expo/static/js/ios/index.js': 'require("./assets/dev/sample-desk.jpg")',
  });
  expect(findDevAssets(dir).map((h) => h.file).sort()).toEqual(
    ['_expo/static/js/ios/index.js', 'assets/dev/sample-desk.jpg', 'metadata.json'].sort()
  );
});

test('the asset really is development-only in the source', () => {
  const src = fs.readFileSync(path.join(__dirname, '../src/devSample.js'), 'utf8');
  expect(src).toMatch(/__DEV__ \? require\('\.\.\/assets\/dev\/sample-desk\.jpg'\) : null/);
  expect(fs.existsSync(path.join(__dirname, '../assets/dev/sample-desk.jpg'))).toBe(true);
});
