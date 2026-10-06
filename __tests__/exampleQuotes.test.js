// Приклад речення — мовою слова, і лапки в нього — лапки цієї мови: quote()
// з src/share/layout.js («…» для es і uk, “…” для en, „…“ для de). Так уже
// робили віджети й картки «Поділитися», а екрани застосунку ставили “…”
// руками, тож на одній сторінці App Store іспанський приклад був то в “…”,
// то в «…». Тут стережемо, щоб жоден екран не повернувся до ручних лапок.
import fs from 'fs';
import path from 'path';

import { quote } from '../src/share/layout';

const SRC = path.join(__dirname, '../src');
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return e.name.endsWith('.js') ? [p] : [];
  });

test('quote() follows the language of the sentence', () => {
  expect(quote('Salimos bajo la llovizna.', 'es')).toBe('«Salimos bajo la llovizna.»');
  expect(quote('The deployment went live.', 'en')).toBe('“The deployment went live.”');
  expect(quote('Діти стійкіші.', 'uk')).toBe('«Діти стійкіші.»');
});

test('no screen wraps an example in hand-typed quotes', () => {
  const hits = [];
  for (const f of [...files(SRC), path.join(__dirname, '../App.js')]) {
    const code = fs.readFileSync(f, 'utf8');
    for (const m of code.matchAll(/[“«„"']\{[\w.?]*example\}[”»“"']/g)) hits.push(`${path.relative(SRC, f)}: ${m[0]}`);
  }
  expect(hits).toEqual([]);
});
