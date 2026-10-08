// Транскрипція (IPA) — шрифтом, у якому є весь IPA (F.ipa, src/theme.js).
// У Nunito немає ʊ, ɪ, ɔ, θ, β, ʝ…, і ці літери iOS брав би з іншого шрифту
// посеред слова, а власний ˈ у Nunito завширшки з «a»: «/ˈ haʊsplænt/». Тест
// знаходить у коді кожен <Text>, що показує транскрипцію ({….ipa},
// {ipaLabel(…)}, {ipaText}, {label} у IpaPill), і перевіряє його стиль.
import fs from 'fs';
import path from 'path';

import { F, ipaFont } from '../src/theme';

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const files = (dir) =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return files(p);
    return e.name.endsWith('.js') ? [p] : [];
  });

// Тіло об'єкта стилю `name: { … }` з урахуванням вкладених дужок.
function styleBody(code, name) {
  const m = new RegExp(`\\b${name}: \\{`).exec(code);
  if (!m) return null;
  let depth = 0;
  for (let i = m.index + m[0].length - 1; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(m.index, i + 1);
  }
  return null;
}

const IPA_OK = /F\.ipa|ipaFont\(|rounded\(/; // rounded(…) — SwiftUI-віджет: системний заокруглений шрифт

function ipaTexts(file) {
  const code = fs.readFileSync(file, 'utf8');
  const out = [];
  // <Text …>{w.ipa}</Text>, <Txt …>{ipaLabel(word.ipa)}</Txt>, <T …>{ipaText}</T>
  const re = /<(Text|Txt|T)\b((?:[^<>]|=>)*?)>\s*\{(!?[\w.?]*\.ipa\b[^{}]*|ipaLabel\([^)]*\)|ipaText|label)\}/g;
  for (const m of code.matchAll(re)) {
    const [, , attrs, expr] = m;
    if (expr === 'label' && !/function IpaPill/.test(code.slice(Math.max(0, m.index - 900), m.index))) continue;
    let ok = IPA_OK.test(attrs);
    if (!ok) {
      const names = [...attrs.matchAll(/\bs\.(\w+)/g)].map((x) => x[1]);
      ok = names.some((n) => IPA_OK.test(styleBody(code, n) || ''));
    }
    out.push({ at: `${path.relative(ROOT, file)}: {${expr}}`, ok });
  }
  return out;
}

test('F.ipa is a font with the whole IPA, not Nunito', () => {
  expect(F.ipa).toBeTruthy();
  expect(F.ipa).not.toMatch(/Nunito/);
  expect(ipaFont('700')).toEqual({ fontFamily: F.ipa, fontWeight: '700' });
});

test('every place that shows a transcription uses it', () => {
  const found = [...files(SRC), path.join(ROOT, 'App.js')].flatMap(ipaTexts);
  // знайшло саме те, що є в застосунку (інакше тест нічого не стереже)
  expect(found.length).toBeGreaterThanOrEqual(12);
  expect(found.filter((x) => !x.ok).map((x) => x.at)).toEqual([]);
});
