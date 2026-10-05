// Контракт локалізації. Забутий переклад нічим не видає себе в коді: makeT
// тихо падає на англійську (або показує сам ключ), і посеред українського
// екрана вилазить «Due today» чи «scanErrCamera». Тому стережемо тут:
// однакові ключі й підстановки в усіх мовах, кожен t('…') з коду існує,
// множина й типографіка — за правилами з шапки src/i18n.js.
import fs from 'fs';
import path from 'path';

import { STRINGS, makeT, pickUiLang, pluralIndex, uiLang } from '../src/i18n';
import { formatDate } from '../src/locale';
import { ACHIEVEMENTS } from '../src/achievements';
import { COMPARISON, PLANS, PRO_BENEFITS } from '../src/subscription';
import { FIELDS, GOALS, HEARD, HEARD_BRANDS, STRUGGLES, TOPICS } from '../src/profile';
import { LANGS as LEARN_LANGS } from '../src/speech';

const ROOT = path.join(__dirname, '..');
const LANGS = ['en', 'uk', 'de', 'es'];
// Скільки форм множини в {n|…}: українська — три (1 слово, 2 слова, 5 слів)
const FORMS = { en: 2, uk: 3, de: 2, es: 2 };
// Ці рядки капсом свідомо: бейдж слова дня малюється без textTransform,
// літери днів тижня — це не текст, а сім підписів під стовпчиками, а ІТ —
// абревіатура, її й VoiceOver читає по літерах.
const CAPS_OK = ['wordOfDay', 'topic_it', 'field_it'];

const PLACEHOLDER = /\{(\w+)(?:\|[^{}]*)?\}/g;
const PLURAL = /\{(\w+)\|([^{}]*)\}/g;

function placeholders(s) {
  return [...new Set([...s.matchAll(PLACEHOLDER)].map((m) => m[1]))].sort();
}

// App.js + усе src/**/*.js
function sourceFiles() {
  const out = [path.join(ROOT, 'App.js')];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.js')) out.push(p);
    }
  };
  walk(path.join(ROOT, 'src'));
  return out;
}

// Ключі, які код просить у t(): буквальні t('key') плюс ті, що збираються
// з даних (тарифи, досягнення, переваги, вкладки, слайди, коди помилок).
function usedKeys() {
  const used = new Map(); // ключ → файли
  const add = (key, where) => {
    if (!used.has(key)) used.set(key, new Set());
    used.get(key).add(where);
  };
  for (const file of sourceFiles()) {
    const rel = path.relative(ROOT, file);
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(/\bt\(\s*(['"])([A-Za-z_]\w*)\1\s*[,)]/g)) add(m[2], rel);
    // { label: 'tabScan' } у TABS, { title: 'ob1t', desc: 'ob1d' } у слайдах,
    // { SCAN_RATE: 'scanErrRate' } у мапі помилок сканера
    for (const m of src.matchAll(/\blabel:\s*'(tab\w+)'/g)) add(m[1], rel);
    for (const m of src.matchAll(/\b(?:title|desc):\s*'(ob\d\w*)'/g)) add(m[1], rel);
    for (const m of src.matchAll(/\bSCAN_[A-Z_]+:\s*'(\w+)'/g)) add(m[1], rel);
  }
  for (const p of PLANS) {
    add(p.labelKey, 'src/subscription.js PLANS');
    add(p.legalKey, 'src/subscription.js PLANS');
    if (p.saveKey) add(p.saveKey, 'src/subscription.js PLANS');
  }
  for (const a of ACHIEVEMENTS) add('ach_' + a.id, 'src/achievements.js');
  for (const b of PRO_BENEFITS) add('pro_' + b.id, 'src/subscription.js PRO_BENEFITS');
  for (const r of COMPARISON) add('cmp_' + r.id, 'src/subscription.js COMPARISON');
  // Персоналізація: ключі збираються з переліків src/profile.js. Тема
  // «general» на картці не пишеться, але є в підсумку профілю.
  for (const g of GOALS) add('goal_' + g, 'src/profile.js GOALS');
  for (const f of FIELDS) add('field_' + f, 'src/profile.js FIELDS');
  for (const k of TOPICS) add('topic_' + k, 'src/profile.js TOPICS');
  for (const h of HEARD.filter((x) => !HEARD_BRANDS[x])) add('heard_' + h, 'src/profile.js HEARD');
  for (let i = 1; i <= 10; i++) add('lvl' + i, 'src/LevelSlider.js');
  // Онбординг 2.0: «що заважає» і рядки плану під кожну відповідь, назва
  // мови, яку вчать, у реченні-обіцянці — для кожної з 29 мов
  for (const k of STRUGGLES) {
    add('struggle_' + k, 'src/profile.js STRUGGLES');
    add('plan_' + k, 'src/OnboardingParts.js');
  }
  for (const l of LEARN_LANGS) add('langAcc_' + l.code, 'src/OnboardingScreen.js');
  for (let i = 1; i <= 5; i++) add('levelName' + i, 'src/profile.js levelName');
  return used;
}

describe('key sets', () => {
  test.each(LANGS.filter((l) => l !== 'en'))('%s has exactly the same keys as en', (lang) => {
    const en = Object.keys(STRINGS.en);
    const other = Object.keys(STRINGS[lang]);
    expect({
      missing: en.filter((k) => !(k in STRINGS[lang])),
      extra: other.filter((k) => !(k in STRINGS.en)),
    }).toEqual({ missing: [], extra: [] });
  });

  // У літералі об'єкта дубль ключа не помилка — останній мовчки перемагає.
  // Так колись «Save word» тихо перетворилось на «Save» лише в двох мовах.
  test('no key is defined twice inside one language block', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/i18n.js'), 'utf8');
    const dupes = {};
    for (const lang of LANGS) {
      const head = `\n  ${lang}: {`;
      const start = src.indexOf(head);
      expect(start).toBeGreaterThan(-1);
      const body = src
        .slice(start + head.length, src.indexOf('\n  },', start))
        .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
        .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
        .replace(/\/\/.*$/gm, '');
      const seen = new Set();
      for (const m of body.matchAll(/([A-Za-z_]\w*)\s*:/g)) {
        if (seen.has(m[1])) (dupes[lang] ||= []).push(m[1]);
        seen.add(m[1]);
      }
    }
    expect(dupes).toEqual({});
  });

  test('every key used in code exists in en', () => {
    const missing = [];
    for (const [key, files] of usedKeys()) {
      if (!(key in STRINGS.en)) missing.push(`${key} (${[...files].join(', ')})`);
    }
    expect(missing).toEqual([]);
  });
});

describe('placeholders and plurals', () => {
  test('every key has the same placeholders in all languages', () => {
    const diff = [];
    for (const key of Object.keys(STRINGS.en)) {
      const want = placeholders(STRINGS.en[key]);
      for (const lang of LANGS) {
        const s = STRINGS[lang][key];
        if (s === undefined) continue; // відсутні ключі ловить тест вище
        const got = placeholders(s);
        if (got.join() !== want.join()) diff.push(`${lang}.${key}: {${got}} ≠ en {${want}}`);
      }
    }
    expect(diff).toEqual([]);
  });

  test('plural blocks have the right number of forms for the language', () => {
    const bad = [];
    for (const lang of LANGS) {
      for (const [key, s] of Object.entries(STRINGS[lang])) {
        for (const m of s.matchAll(PLURAL)) {
          const n = m[2].split('|').length;
          if (n !== FORMS[lang]) bad.push(`${lang}.${key}: ${n} forms, want ${FORMS[lang]}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  test('Ukrainian plural rule', () => {
    const idx = (n) => pluralIndex('uk', n);
    expect([1, 21, 101, 1001].map(idx)).toEqual([0, 0, 0, 0]); // слово
    expect([2, 3, 4, 22, 34, 102].map(idx)).toEqual([1, 1, 1, 1, 1, 1]); // слова
    expect([0, 5, 9, 11, 12, 13, 14, 25, 111, 112].map(idx)).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2, 2]); // слів
    expect(idx(1.5)).toBe(1); // 1,5 години
  });

  test('two-form plural rule for en/de/es', () => {
    for (const lang of ['en', 'de', 'es']) {
      expect([0, 1, 2, 21].map((n) => pluralIndex(lang, n))).toEqual([1, 0, 1, 1]);
    }
  });
});

describe('makeT', () => {
  test('substitutes variables and picks plural forms', () => {
    const uk = makeT('uk');
    expect(uk('dueToday', { n: 1 })).toBe('На сьогодні: 1 слово');
    expect(uk('dueToday', { n: 3 })).toBe('На сьогодні: 3 слова');
    expect(uk('dueToday', { n: 11 })).toBe('На сьогодні: 11 слів');
    expect(uk('dueToday', { n: 21 })).toBe('На сьогодні: 21 слово');
    expect(makeT('en')('dueToday', { n: 1 })).toBe('Due today: 1 word');
    expect(makeT('en')('dueToday', { n: 4 })).toBe('Due today: 4 words');
    expect(makeT('de')('inDays', { n: 2 })).toBe('in 2 Tagen');
  });

  test('unknown language falls back to English, unknown key to the key itself', () => {
    expect(makeT('fr')('cancel')).toBe(STRINGS.en.cancel);
    expect(makeT('fr')('dueToday', { n: 2 })).toBe('Due today: 2 words');
    expect(makeT('uk')('__nope__')).toBe('__nope__');
  });

  test('without vars the string is returned untouched', () => {
    expect(makeT('en')('cancel')).toBe('Cancel');
  });

  test('a plural block whose variable is not passed is left as is', () => {
    expect(makeT('en')('dueToday', { x: 1 })).toBe(STRINGS.en.dueToday);
  });
});

describe('copy style', () => {
  const all = () => LANGS.flatMap((lang) => Object.entries(STRINGS[lang]).map(([k, s]) => [lang, k, s]));

  test('no emoji or check marks in UI copy', () => {
    const bad = all().filter(([, , s]) => /\p{Extended_Pictographic}|[✓✔✗✘]/u.test(s));
    expect(bad).toEqual([]);
  });

  test('typographic quotes, apostrophes and ellipsis only', () => {
    const bad = all()
      .filter(([, , s]) => /['"]|\.\.\./.test(s))
      .map(([lang, k, s]) => `${lang}.${k}: ${s}`);
    expect(bad).toEqual([]);
  });

  // Підписи секцій і кепс-лейбли переводить у верхній регістр стиль
  // (CAPS, sectionLabel). Капс у самому рядку VoiceOver читає по літерах.
  test('strings are not written in ALL CAPS', () => {
    const bad = all()
      .filter(([, k, s]) => !CAPS_OK.includes(k))
      .filter(([, , s]) => (s.match(/\p{L}/gu) || []).length > 1 && s === s.toUpperCase() && s !== s.toLowerCase())
      .map(([lang, k, s]) => `${lang}.${k}: ${s}`);
    expect(bad).toEqual([]);
  });
});

// v1.3: безкоштовно — один скан на все життя, а не на день. Жоден рядок не
// обіцяє скан «на сьогодні», «на день» чи «завтра», а серію тримає навчання.
describe('a lifetime free scan', () => {
  const PER_DAY = /today|tomorrow|a day|per day|every day|сьогодні|завтра|щодня|на день|heute|morgen|pro Tag|jeden Tag|hoy|mañana|al día|cada día/i;
  const SCAN = /scan|скан|escane/i;
  const SCAN_KEYS = ['scanFreeLeft', 'pwScansTitle', 'pwScansText', 'cmp_scans', 'pwContinueFree', 'pwContinueFreeNoScans'];

  test('the new and reworded keys exist in every language; the “next scan tomorrow” one is gone', () => {
    for (const lang of LANGS) {
      for (const k of SCAN_KEYS) expect([lang, k, typeof STRINGS[lang][k]]).toEqual([lang, k, 'string']);
      expect(STRINGS[lang]).not.toHaveProperty('pwContinueFreeTomorrow');
    }
  });

  test.each(LANGS)('%s: the scan copy never speaks of a day, today or tomorrow', (lang) => {
    const bad = SCAN_KEYS.filter((k) => PER_DAY.test(STRINGS[lang][k])).map((k) => `${k}: ${STRINGS[lang][k]}`);
    expect(bad).toEqual([]);
  });

  // Ширша сітка: будь-який рядок, де скан стоїть поруч зі словом про день
  test.each(LANGS)('%s: no string anywhere ties scanning to a day', (lang) => {
    const bad = Object.entries(STRINGS[lang])
      .filter(([, s]) => SCAN.test(s) && PER_DAY.test(s))
      .map(([k, s]) => `${k}: ${s}`);
    expect(bad).toEqual([]);
  });

  test.each(LANGS)('%s: the streak hints are about learning, not scanning', (lang) => {
    for (const k of ['streakNone', 'streakPending', 'streakPendingShort', 'streakEvening']) expect(STRINGS[lang][k]).not.toMatch(SCAN);
  });

  test('plurals of the scan counters', () => {
    const uk = makeT('uk');
    expect([1, 2, 5, 21].map((n) => uk('scanFreeLeft', { n }))).toEqual([
      '1 безкоштовний скан',
      '2 безкоштовні скани',
      '5 безкоштовних сканів',
      '21 безкоштовний скан',
    ]);
    expect(uk('pwScansTitle', { n: 1 })).toBe('Безкоштовний скан використано');
    expect(uk('pwScansTitle', { n: 3 })).toBe('Безкоштовні скани використано');
    expect(uk('cmp_scans')).toBe('Сканів загалом');
    const en = makeT('en');
    expect([1, 3].map((n) => en('scanFreeLeft', { n }))).toEqual(['1 free scan', '3 free scans']);
    expect(en('pwScansTitle', { n: 1 })).toBe('You’ve used your free scan');
    expect(makeT('de')('scanFreeLeft', { n: 1 })).toBe('1 Gratis-Scan');
    expect(makeT('es')('scanFreeLeft', { n: 2 })).toBe('2 escaneos gratis');
  });
});

// Французу без перекладу UI речення англійське — і дата в ньому теж.
describe('dates', () => {
  const ts = new Date(2026, 9, 8, 12).getTime();

  test('follow the language the interface actually speaks', () => {
    expect(formatDate(ts, 'fr')).toBe(formatDate(ts, 'en'));
    expect(formatDate(ts, 'pl')).toBe(formatDate(ts, 'en'));
    expect(uiLang('fr')).toBe('en');
    expect(uiLang('uk')).toBe('uk');
  });

  test('translated interfaces keep their own date format', () => {
    expect(formatDate(ts, 'uk')).not.toBe(formatDate(ts, 'en'));
    expect(formatDate(ts, 'de')).toMatch(/Oktober/);
  });
});

// Інтерфейс говорить мовою телефону: перша з бажаних мов iOS, для якої є
// переклад, — так само, як iOS обирає .lproj для системних запитів.
describe('interface language = phone language', () => {
  const loc = (...tags) => tags.map((tag) => ({ languageTag: tag, languageCode: tag.split('-')[0] }));

  test('the first preferred language we have a UI for', () => {
    expect(pickUiLang(loc('uk-UA'))).toBe('uk');
    expect(pickUiLang(loc('uk-UA', 'en-US'))).toBe('uk');
    expect(pickUiLang(loc('ru-RU', 'uk-UA'))).toBe('uk');
    expect(pickUiLang(loc('pl-PL', 'es-ES', 'en-US'))).toBe('es');
    expect(pickUiLang(loc('de-AT'))).toBe('de');
  });

  test('nothing we speak → English, as iOS falls back to the development language', () => {
    expect(pickUiLang(loc('fr-FR'))).toBe('en');
    expect(pickUiLang(loc('pl-PL', 'ru-RU'))).toBe('en');
    expect(pickUiLang([])).toBe('en');
    expect(pickUiLang(null)).toBe('en');
    expect(pickUiLang([{ languageCode: 'constructor' }])).toBe('en');
  });

  test('a locale without languageCode still counts by its tag', () => {
    expect(pickUiLang([{ languageCode: null, languageTag: 'es-MX' }])).toBe('es');
    expect(pickUiLang([{ languageTag: 'UK_ua' }])).toBe('uk');
  });

  // Перемикач мови в Параметри → LinguaLens показує мови з
  // CFBundleLocalizations (expo-localization → supportedLocales), а запити
  // камери й фото беруть тексти з app.json → locales. Обидва списки мусять
  // збігатися з мовами інтерфейсу — інакше запит говорив би однією мовою, а
  // екран перед ним іншою.
  test('iOS knows exactly the languages the interface speaks', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
    const plugin = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-localization');
    expect([...plugin[1].supportedLocales].sort()).toEqual([...LANGS].sort());
    expect(Object.keys(app.locales).sort()).toEqual([...LANGS].sort());
    expect(Object.keys(STRINGS).sort()).toEqual([...LANGS].sort());
  });

  test('the settings row is translated everywhere', () => {
    for (const l of LANGS) {
      expect(STRINGS[l].uiLangTitle).toBeTruthy();
      expect(STRINGS[l].uiLangHint).toContain('LinguaLens');
      if (l !== 'en') expect(STRINGS[l].uiLangHint).not.toBe(STRINGS.en.uiLangHint);
    }
    expect(STRINGS.uk.uiLangTitle).toBe('Мова інтерфейсу');
  });
});
