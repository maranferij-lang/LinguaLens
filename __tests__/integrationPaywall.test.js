// Інтеграція v1.3 (план §8, C4): кожна причина, з якою код відкриває
// пейвол, має свій заголовок у PaywallScreen. Причини збирає сам тест: усі
// рядкові літерали openPaywall('…') / onOpenPaywall('…') у застосунку плюс
// ті, що повертають «воротарі» лімітів (canScan, canScene, canUseLanguage).
// Нова причина без заголовка показала б загальне «Зніми обмеження» там, де
// людина чекає пояснення, чому її зупинили (так було з wod_per_day до W5).
import fs from 'fs';
import path from 'path';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import PaywallScreen from '../src/PaywallScreen';
import { PLANS, canScan, canScene, canUseLanguage } from '../src/subscription';
import { makeT } from '../src/i18n';

const ROOT = path.join(__dirname, '..');
const t = makeT('en');

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

function reasonsInCode() {
  const found = new Set();
  for (const f of [path.join(ROOT, 'App.js'), ...sources(path.join(ROOT, 'src'))]) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/\b[oO]penPaywall\??\.?\(\s*(['"])(\w+)\1/g)) found.add(m[2]);
  }
  // стіни лімітів: причину повертає воротар, App передає її далі як є
  found.add(canScan({ pro: false, usage: { scans: 1, limit: 1 } }));
  found.add(canScene({ pro: false, usage: { scans: 0, limit: 1, scenes: 1, sceneLimit: 1 } }));
  found.add(canUseLanguage({ pro: false, words: [{ lang: 'es' }], nextLang: 'de' }));
  return [...found];
}

// Загальна шапка — свідомо: «Перейти на Pro» з Параметрів і «Навчання»
// (info) і мʼякий пейвол після першого скану (intro: своя шапка з пробним
// періодом, без нього — загальна).
const GENERIC = ['info', 'intro'];

async function title(reason) {
  let tree;
  await act(async () => {
    tree = create(
      <PaywallScreen reason={reason} plans={PLANS} onClose={() => {}} onPurchase={async () => ({ ok: true })} onRestore={async () => ({})} lang="en" t={t} />
    );
  });
  const texts = tree.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string').join(''))
    .filter(Boolean);
  await act(async () => tree.unmount());
  return texts;
}

test('the code opens the paywall for the reasons we know', () => {
  expect(reasonsInCode().sort()).toEqual(['info', 'intro', 'langs', 'scans', 'scene', 'themes', 'wod_per_day']);
});

test.each(reasonsInCode().filter((r) => !GENERIC.includes(r)))('“%s” has its own title, not the generic one', async (reason) => {
  const texts = await title(reason);
  expect(texts).not.toContain(t('pwTitle'));
  expect(texts.length).toBeGreaterThan(0);
});

test('the generic ones are only the deliberate ones', async () => {
  for (const reason of GENERIC.filter((r) => reasonsInCode().includes(r))) {
    expect([reason, (await title(reason)).includes(t('pwTitle'))]).toEqual([reason, true]);
  }
});
