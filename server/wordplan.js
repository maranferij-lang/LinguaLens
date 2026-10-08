// Персональний розклад «слова дня» (POST /word-of-day).
//
// Профіль людини (profile.js) → з яких тем брати слова і скільки (ваги) →
// у якому порядку чергуються теми (pattern) → яке саме слово з теми (свій
// порядок для кожної людини, під її рівень, без «Знаю» й без
// інтернаціоналізмів для тих, кому вони очевидні).
//
// Усе детерміноване й без стану: той самий профіль того самого дня завжди
// дає те саме слово. Тому 14 днів у кеші телефона, віджет і пуш показують
// одне й те саме, а сервер нічого не пам'ятає між запитами. Конкретних слів
// тут немає — лише правила; списки лежать у server/topics.

const billing = require('./billing');
const words = require('./words');
const { lexicon: LEXICON } = require('./lexicon');

// Які рівні слів (1 базове · 2 робоче · 3 просунуте) отримує позначка
// слайдера 1–10 і в якому порядку. Від 9/10 — лише третій рівень: коли він
// закінчується, список іде по колу, але НІКОЛИ не падає до легших слів —
// «finance» для людини, що оцінила себе на 9, робить апку «тупою».
const BANDS = {
  1: [1, 2],
  2: [1, 2],
  3: [1, 2],
  4: [1, 2, 3],
  5: [1, 2, 3],
  6: [2, 3],
  7: [2, 3],
  8: [3, 2],
  9: [3],
  10: [3],
};
// З якого рівня ховаємо прозорі інтернаціоналізми (finance → фінанси).
const INTL_FROM_LEVEL = 4;

// null — рівень не відомий (немає профілю чи людина пропустила слайдер):
// тоді всі слова теми впереміш, як у загальному списку v1.
function bandsFor(level) {
  return level == null ? null : BANDS[level];
}

// Ваги тем: скільки днів циклу (він триває Σ ваг днів) дістається кожній.
// Для кожної мети — свій набір; тема, що трапилась у кількох метах, бере
// більшу вагу, а не суму. Загальні слова є
// завжди: навіть фінансисту потрібні «звичайні» слова, і вони ж — запасний
// варіант, коли тематичні закінчились. Без профілю — лише загальні (як у v1).
function weightsFor(profile) {
  const w = new Map();
  const add = (key, n) => w.set(key, Math.max(w.get(key) || 0, n));
  const goals = profile ? profile.goals : [];
  const field = profile && profile.field && profile.field !== 'other' ? profile.field : null;
  for (const goal of goals) {
    if (goal === 'work') {
      if (field) {
        add(field, 4);
        add('workplace', 2);
        add('general', 1);
      } else {
        add('workplace', 4);
        add('general', 2);
      }
    } else if (goal === 'study') {
      add('academic', 3);
      if (field) add(field, 1);
    } else if (goal === 'travel') add('travel', 2);
    else if (goal === 'relocation') add('relocation', 2);
    else if (goal === 'self') add('general', 2);
  }
  add('general', 1);
  return w;
}

// Плавний зважений round-robin (як у nginx): теми з вагами 4/2/1 дають цикл
// «f w f g f w f», а не «f f f f w w g» — фінанси не йдуть чотири дні
// поспіль. Теми впорядковані за ключем, нічия — на користь першої, тож цикл
// однаковий на кожному запиті.
function smoothPattern(weights) {
  const keys = [...weights.keys()].sort();
  const total = keys.reduce((s, k) => s + weights.get(k), 0);
  const current = new Map(keys.map((k) => [k, 0]));
  const pattern = [];
  for (let i = 0; i < total; i++) {
    let best = null;
    for (const k of keys) {
      current.set(k, current.get(k) + weights.get(k));
      if (best === null || current.get(k) > current.get(best)) best = k;
    }
    current.set(best, current.get(best) - total);
    pattern.push(best);
  }
  return pattern;
}

// Fisher–Yates із детермінованим генератором (той самий, що й у v1).
function shuffled(list, seed) {
  const a = [...list];
  const rand = words.rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Слова теми в порядку цієї людини: кожен рівень окремо перемішаний її seed,
// рівні йдуть у порядку слайдера. Перемішуємо ПОВНИЙ рівень, а фільтри
// застосовуємо потім: «Знаю» прибирає одне слово, і решта просто
// зсувається на місце, а не перетасовується вся наперед.
function ordered(topic, seed, bands) {
  if (!bands) return shuffled(topic.words, `${seed}|${topic.key}`);
  const out = [];
  for (const level of bands) {
    out.push(...shuffled(topic.words.filter((w) => w.level === level), `${seed}|${topic.key}|${level}`));
  }
  return out;
}

const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Усе, що залежить від людини, а не від дня: активні теми з готовими
// списками слів і цикл чергування.
//   seed    — seed пристрою (свій порядок слів для кожного);
//   profile — profile.forSchedule(…) або null;
//   known   — Set нормалізованих термінів «Знаю» (profile.known);
//   lex     — списки (тести підставляють свої).
function buildPlan({ seed, profile, known = new Set(), lex = LEXICON }) {
  const level = profile ? profile.level : null;
  const bands = bandsFor(level);
  const hideIntl = level != null && level >= INTL_FROM_LEVEL;
  const weights = weightsFor(profile);

  // Термін, що є в кількох активних темах, лишається лише в найважливішій
  // (більша вага, далі — за ключем): інакше «deadline» прийшов би двічі за
  // тиждень — з «роботи» і з «фінансів». Власника обираємо з ПОВНИХ списків,
  // до фільтрів рівня, «Знаю» й інтернаціоналізмів. Інакше слово, яке список
  // сфери вважає базовим (invoice у фінансах — 1), для 9/10 випало б із
  // фінансів і повернулося б із загальних, де воно позначене 3.
  // Заразом запам'ятовуємо найлегший рівень терміна серед усіх активних
  // списків: якщо хоч один із них ставить слово нижче за нижню межу слайдера,
  // людина його не отримує, хоч би звідки воно прийшло (lean: management 3,
  // але workplace 2 — для 9/10 це не слово).
  const priority = [...weights.keys()].sort((a, b) => weights.get(b) - weights.get(a) || byKey(a, b));
  const owner = new Map();
  const easiest = new Map();
  for (const key of priority) {
    const topic = lex.topics.get(key);
    if (!topic) continue;
    for (const w of topic.words) {
      if (!owner.has(w.norm)) owner.set(w.norm, key);
      easiest.set(w.norm, Math.min(easiest.get(w.norm) ?? w.level, w.level));
    }
  }
  const floor = bands ? Math.min(...bands) : 1;
  const tooEasy = (w) => easiest.get(w.norm) < floor;
  let sources = [];
  for (const key of priority) {
    const topic = lex.topics.get(key);
    if (!topic) continue;
    const list = ordered(topic, seed, bands).filter(
      (w) => owner.get(w.norm) === key && !tooEasy(w) && !(hideIntl && lex.intl.has(w.norm)) && !known.has(w.norm)
    );
    // Тема, де після фільтрів нічого не лишилось, випадає з циклу.
    if (list.length) sources.push({ key, weight: weights.get(key), list });
  }

  if (!sources.length) {
    // Усе позначене «Знаю» (чи списків немає): загальні слова знову, але
    // рівень і далі тримаємо — повтор кращий за слова, нижчі за рівень.
    const general = lex.topics.get('general');
    const list = general ? ordered(general, seed, bands).filter((w) => !tooEasy(w)) : [];
    sources = list.length
      ? [{ key: 'general', weight: 1, list }]
      : // Останній запасний варіант — список v1: слово дня є завжди.
        [{ key: 'general', weight: 1, list: words.shuffledFor(seed).map((en) => ({ en, level: null })) }];
  }

  sources.sort((a, b) => byKey(a.key, b.key));
  const pattern = smoothPattern(new Map(sources.map((s) => [s.key, s.weight])));
  // rank[i] — скільки разів тема pattern[i] вже трапилась у pattern[0..i)
  const seen = new Map();
  const rank = pattern.map((k) => {
    const n = seen.get(k) || 0;
    seen.set(k, n + 1);
    return n;
  });
  return {
    // Без профілю відлік — від епохи, як у v1: слово залежить лише від дати.
    origin: profile ? billing.dayIndexOf(profile.since) : 0,
    pattern,
    rank,
    sources: new Map(sources.map((s) => [s.key, s])),
  };
}

// Слово для дня k від початку прогресу (since): місце в циклі → котре це
// за ліком слово своєї теми (j) → j-те слово її списку по колу.
function pickAt(plan, k) {
  const P = plan.pattern.length;
  const pos = k % P;
  const source = plan.sources.get(plan.pattern[pos]);
  const j = Math.floor(k / P) * source.weight + plan.rank[pos];
  const w = source.list[j % source.list.length];
  return { en: w.en, topic: source.key, hint: w.hint, level: w.level };
}

// Слово на дату (підпис і поведінка — як до v1.3).
function pick(plan, date) {
  return { date, ...pickAt(plan, Math.max(0, billing.dayIndexOf(date) - plan.origin)) };
}

// Pro: кілька слів на день (v1.3) — 1, 3 або 5; будь-що інше дає 1.
// Додаткові слова (слоти 1…) беремо з «віртуальних днів» далеко за
// горизонтом основних: той самий цикл тем і ті самі списки, тож частки тем
// і рівень тримаються, а слово слоту 0 не залежить від perDay — після
// покупки чи кінця Pro «моє слово дня» не міняється.
const MAX_PER_DAY = 5;
const EXTRA_BASE = 100000;
// Скільки разів шукати інше слово, якщо додаткове збіглося з уже взятим
// того ж дня (вузькі списки), і на скільки «днів» стрибати.
const RETRIES = 8;
const RETRY_STEP = 7 * MAX_PER_DAY * 1000;

function perDayOf(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(Math.max(n, 1), MAX_PER_DAY) : 1;
}

// days днів, починаючи з today (локальний день клієнта), по perDay слів на
// день: [{ date, slot, en, topic, hint, level }] — день за днем, слоти по
// порядку. Слот s ≥ 1 не залежить від perDay: у 3 і 5 на день слоти 1–2
// однакові. У межах дня слова не повторюються.
function schedule({ seed, profile, known, today, days, lex, perDay = 1 }) {
  const n = perDayOf(perDay);
  const plan = buildPlan({ seed, profile, known, lex });
  const out = [];
  for (let i = 0; i < days; i++) {
    const date = billing.addDays(today, i);
    const k = Math.max(0, billing.dayIndexOf(date) - plan.origin);
    const main = { date, slot: 0, ...pickAt(plan, k) };
    out.push(main);
    const seen = new Set([main.en]);
    for (let s = 1; s < n; s++) {
      let x = EXTRA_BASE + k * (MAX_PER_DAY - 1) + (s - 1);
      let w = pickAt(plan, x);
      for (let tries = 0; seen.has(w.en) && tries < RETRIES; tries++) w = pickAt(plan, (x += RETRY_STEP));
      seen.add(w.en);
      out.push({ date, slot: s, ...w });
    }
  }
  return out;
}

module.exports = {
  BANDS,
  INTL_FROM_LEVEL,
  MAX_PER_DAY,
  bandsFor,
  weightsFor,
  smoothPattern,
  buildPlan,
  pickAt,
  pick,
  perDayOf,
  schedule,
};
