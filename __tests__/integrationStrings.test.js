// Інтеграція v1.3 (план §8, C1): у рядках немає мертвих ключів. Онбординг
// 3.0, нове «Навчання», наліпки й пейвол замінили цілі екрани, і старі тексти
// («Спробуй зараз», «Поки нема чого повторювати», «Без тла», «Лишився 1
// безкоштовний скан»…) лишались би в перекладах, які хтось вичитує й
// перекладає далі. Ключ «живий», якщо код називає його буквально ('key')
// або збирає з префікса ('ach_' + id, `topic_${k}`, 'lvl' + n).
import fs from 'fs';
import path from 'path';
import { STRINGS } from '../src/i18n';

const ROOT = path.join(__dirname, '..');

function sources(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sources(p, out);
    else if (/\.js$/.test(e.name)) out.push(p);
  }
  return out;
}

const code = [path.join(ROOT, 'App.js'), ...sources(path.join(ROOT, 'src'))]
  .filter((f) => !/src[\\/](i18n\.js|strings[\\/])/.test(f))
  .map((f) => fs.readFileSync(f, 'utf8'))
  .join('\n');

// Префікси ключів, які код складає сам: 'ach_' + id, `cmp_${id}`. Короткі
// шматки без підкреслення ('o' + …) ключами не є.
const prefixes = new Set();
for (const m of code.matchAll(/(['"`])([A-Za-z_]\w*)\1\s*\+/g)) prefixes.add(m[2]);
for (const m of code.matchAll(/`([A-Za-z_]\w*)\$\{/g)) prefixes.add(m[1]);
const dynamic = [...prefixes].filter((p) => /_$/.test(p) || p.length >= 3);

const used = (k) => new RegExp(`(['"\`])${k}\\1`).test(code) || dynamic.some((p) => k.startsWith(p) && k.length > p.length);

test('every string key is used by the code', () => {
  expect(Object.keys(STRINGS.en).filter((k) => !used(k))).toEqual([]);
});

test('the keys v1.3 replaced are gone from every language', () => {
  const gone = [
    'obWowTitle', 'obWowText', 'obWowOpen', 'obWowDone', 'obHookTitle', 'obHookText', 'obPlanDaily',
    'notifText', 'notifTextTopic', 'topicIn_travel', 'quizNeed', 'cardsEmptyTitle', 'cardsEmptyText',
    'scansLeftN', 'streakGo', 'streakStart', 'shareTplCutout', 'shareSwipeHint', 'cmp_srs', 'cmp_speech',
  ];
  for (const lang of Object.keys(STRINGS)) {
    expect([lang, gone.filter((k) => k in STRINGS[lang])]).toEqual([lang, []]);
  }
  // «Пізніше» демо онбордингу й запасний рядок таблиці без варіантів слів дня лишаються
  expect(used('obWowLater')).toBe(true);
  expect(STRINGS.uk.cmp_wod).toBe('Слово дня');
});

// «Quedan 1 min.» — дієслово в множині з однією хвилиною (зауваження W1):
// фраза без узгодження читається правильно з будь-яким залишком
test('the Spanish streak-risk banner reads right with one minute left', () => {
  const es = require('../src/i18n').makeT('es');
  for (const t of ['1 min', '2 h 5 min']) expect(es('streakRiskBody', { t })).toMatch(new RegExp('^Tiempo restante: ' + t + '\\. '));
});
