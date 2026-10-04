// Pro-статус, довічний ліміт безкоштовних сканів і довічна проба сцени — на
// сервері, а не в телефоні.
//
// Чому тут: лічильник у AsyncStorage обнуляється перевстановленням, а будь-хто
// зі скриптом міг би безкоштовно витрачати наш AI-ключ. Тепер сервер сам
// рахує скани за записом (анонімний пристрій чи акаунт Apple) і питає
// RevenueCat, чи людина має Pro.
//
// Безкоштовний рівень (рішення власника 2026-10-04): FREE_SCANS сканів за все
// життя запису, а не на день — кожен виклик AI коштує грошей. Сцена теж
// забирає цей скан. Словник, картки, квізи, слово дня й віджет — без меж.
//
// Джерела правди про Pro (обидва необов'язкові, працюють разом):
//   1) вебхук RevenueCat → user.proUntil (миттєво після покупки/продовження);
//   2) REST-запит до RevenueCat, коли безкоштовний ліміт вичерпано, — на
//      випадок, якщо вебхук ще не налаштований або загубився. Кеш 10 хв.
const crypto = require('crypto');
const store = require('./store');

// Кількість з оточення: ціле ≥ 0, інакше — значення за замовчуванням.
// Опечатка на кшталт FREE_SCANS=три дала б NaN, а `used >= NaN` завжди
// false — тобто безлімітні безкоштовні скани за наш рахунок.
function envCount(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || String(raw).trim() === '') return fallback;
  const n = Number(raw);
  if (Number.isInteger(n) && n >= 0) return n;
  console.warn(`billing: ${name}=${raw} — не ціле число ≥ 0, беру ${fallback}`);
  return fallback;
}

// Безкоштовних сканів на все життя запису, за замовчуванням один.
const FREE_SCANS = envCount('FREE_SCANS', 1);
// FREE_SCANS_PER_DAY — стара денна ручка. Сервіс Cloud Run міг її зберегти:
// кажемо в лог, що вона більше нічого не важить, щоб її не крутили даремно.
if (process.env.FREE_SCANS_PER_DAY !== undefined) {
  console.warn(
    `billing: FREE_SCANS_PER_DAY=${process.env.FREE_SCANS_PER_DAY} ігнорую — ` +
      `ліміт тепер на все життя запису, його задає FREE_SCANS (зараз ${FREE_SCANS})`
  );
}
// Скан цілої кімнати — функція Pro, але з пробою: FREE_SCENES сцен за все
// життя запису, щоб людина побачила «вау» до того, як побачить ціну. Окрема
// ручка: з FREE_SCANS > 1 проба сцени однаково кінчається на FREE_SCENES.
const FREE_SCENES = envCount('FREE_SCENES', 1);
const RC_SECRET = process.env.REVENUECAT_SECRET_KEY || '';
const RC_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH || '';
// Ідентифікатор entitlement у RevenueCat (Project → Entitlements).
const ENTITLEMENT = process.env.REVENUECAT_ENTITLEMENT || 'lingualens_pro';
const RC_CACHE_MS = 10 * 60 * 1000;
const REFRESH_MIN_MS = 30 * 1000;
// Якщо RevenueCat недоступний, людина, в якої Pro щойно закінчився, ще три
// дні не впирається в ліміт: краще подарувати кілька сканів, ніж заблокувати
// того, хто заплатив і просто чекає продовження.
const GRACE_MS = 3 * 86400000;
const FOREVER = 4102444800000; // 2100-01-01 — довічна покупка

// ---------- день ----------
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function utcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function dayIndexOf(day) {
  const [y, m, d] = day.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

function addDays(day, n) {
  return utcDay(new Date((dayIndexOf(day) + n) * 86400000));
}

// «Сьогодні» ЗА ЧАСОМ ЛЮДИНИ, а не за UTC — для слова дня (інакше ввечері в
// США картка вже жила б завтрашнім днем) і поля day у usage. На ліміт сканів
// дата більше не впливає: він довічний. Клієнт надсилає свою дату; приймаємо
// її, якщо вона в межах доби від серверної (часові пояси -12…+14). Лише
// канонічна дата: «2026-09-31» чи «2026-08-62» Date.UTC мовчки перекотив би
// в сьогодні.
function localDay(value) {
  const today = utcDay();
  if (typeof value === 'string' && DAY_RE.test(value) && addDays(value, 0) === value) {
    if (Math.abs(dayIndexOf(value) - dayIndexOf(today)) <= 1) return value;
  }
  return today;
}

// ---------- Pro ----------
async function fetchRevenueCatUntil(userId) {
  const res = await fetch('https://api.revenuecat.com/v1/subscribers/' + encodeURIComponent(userId), {
    headers: { authorization: 'Bearer ' + RC_SECRET, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('revenuecat ' + res.status);
  const data = await res.json();
  const ent = data?.subscriber?.entitlements?.[ENTITLEMENT];
  if (!ent) return null;
  // expires_date: null — довічна покупка
  if (ent.expires_date == null) return FOREVER;
  const t = Date.parse(ent.expires_date);
  return Number.isFinite(t) ? t : null;
}

// Повертає { active, until }. Може оновити й зберегти user (кеш перевірки).
// refresh — одразу після покупки: клієнт просить перепитати RevenueCat, а не
// чекати вебхука чи кінця 10-хвилинного кешу.
async function proStatus(user, { refresh = false } = {}) {
  const now = Date.now();
  let until = user.proUntil || null;
  if (until && until > now && !refresh) return { active: true, until };

  const stale = !user.proCheckedAt || now - user.proCheckedAt > RC_CACHE_MS;
  // refresh не частіше ніж раз на 30 с: інакше будь-хто з токеном пристрою
  // міг би в циклі вичерпати квоту RevenueCat API для всіх. Окрема позначка,
  // а не proCheckedAt: звичайна перевірка при запуску за мить до покупки не
  // має з'їсти перепитування після оплати.
  const canRefresh = refresh && !(user.proRefreshedAt && now - user.proRefreshedAt < REFRESH_MIN_MS);
  if (RC_SECRET && (canRefresh || stale)) {
    try {
      until = await fetchRevenueCatUntil(user.id);
      user.proUntil = until;
      user.proCheckedAt = now;
      const fields = { proUntil: until, proCheckedAt: now };
      if (canRefresh) fields.proRefreshedAt = user.proRefreshedAt = now;
      await store.update('users', user.id, fields);
    } catch (e) {
      console.error('revenuecat check failed:', e.message);
      if (user.proUntil && now - user.proUntil < GRACE_MS) return { active: true, until: user.proUntil };
    }
  }
  return { active: !!(until && until > now), until: until || null };
}

// ---------- ліміт сканів ----------
function count(n) {
  return Number.isInteger(n) && n > 0 ? n : 0;
}

// Сканів за все життя запису (users/<id>.scans), і в Pro теж: наперед ми не
// знаємо, чи людина має Pro (див. reserveScan). Хто мав Pro і перестав,
// безкоштовний скан уже витратив.
//
// Записи з часів денного ліміту рахували скани в usage { day, scans }. Беремо
// більше з двох: тестувальник, що сьогодні вже сканував, не отримає ще один
// безкоштовний. Саме поле usage більше ніколи не пишемо.
function scansUsed(user) {
  if (!user) return 0;
  const legacy = user.usage && typeof user.usage === 'object' ? count(user.usage.scans) : 0;
  return Math.max(count(user.scans), legacy);
}

// Сцен за все життя запису, і в Pro теж — з тієї самої причини.
function scenesUsed(user) {
  return count(user && user.scenes);
}

// Лічильники телефона, що переходить в інший запис (вхід в існуючий акаунт,
// вихід у нову анонімну ідентичність), йдуть разом із ним. Інакше «вийти й
// увійти знову» щоразу давало б новий безкоштовний скан і нову пробу сцени.
// І скани, і сцени — більше з двох (не сума: це той самий телефон, що ходить
// між записами туди й назад).
// → поля, які треба дописати в into, або null, якщо в into уже не менше.
function mergeCounters(into, from) {
  const fields = {};
  const scans = scansUsed(from);
  if (scans > scansUsed(into)) fields.scans = scans;
  const scenes = scenesUsed(from);
  if (scenes > scenesUsed(into)) fields.scenes = scenes;
  return Object.keys(fields).length ? fields : null;
}

// null у лімітах — «без меж» (Pro). day — локальне «сьогодні» клієнта: старі
// версії застосунку його читають, на ліміт він не впливає. period каже
// клієнту, що scans — за все життя, а не за день.
function usageView(user, day, pro) {
  return {
    day,
    scans: scansUsed(user),
    limit: pro ? null : FREE_SCANS,
    scenes: scenesUsed(user),
    sceneLimit: pro ? null : FREE_SCENES,
    period: 'lifetime',
  };
}

// Скан займаємо ДО виклику AI і атомарно. Перевірити ліміт, викликати AI і
// потім дописати +1 — це гонка: паралельні скани читали б той самий
// лічильник і проходили б усі. Тут запис умовний (версія документа): якщо
// хтось устиг раніше — перечитуємо і пробуємо ще раз.
//
// Сцена займає і довічний скан, і одну з довічних безкоштовних сцен — ТИМ
// САМИМ записом. Двома окремими записами паралельні сцени могли б пройти
// обидві, а невдала сцена повертала б лише половину.
//
// Порядок перевірок: спершу ліміт сканів (402 SCAN_LIMIT), потім сцени
// (402 SCENE_PRO). Pro питаємо лише тоді, коли безкоштовне скінчилось, і не
// більше разу на спробу: безкоштовний скан не коштує запиту до RevenueCat.
//
// { ok: true, pro, release } — release() повертає скан (і сцену), якщо скан
//   не вдався («не бачу предмета» людині не коштує спроби);
// { ok: false, used, limit } — безкоштовні скани вичерпано (402, AI не викликаємо);
// { ok: false, scene: true, used, limit } — безкоштовні сцени вичерпано;
// { ok: false, gone: true } — пристрій стерто; { ok: false, busy: true }.
async function reserveScan(user, { scene = false } = {}) {
  let current = user;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) current = await store.get('users', user.id);
    if (!current) return { ok: false, gone: true };
    let pro = null;
    const isPro = async () => (pro ??= (await proStatus(current)).active);
    const used = scansUsed(current);
    if (used >= FREE_SCANS && !(await isPro())) return { ok: false, used, limit: FREE_SCANS };
    const fields = { scans: used + 1 };
    if (scene) {
      const scenes = scenesUsed(current);
      if (scenes >= FREE_SCENES && !(await isPro())) {
        return { ok: false, scene: true, used: scenes, limit: FREE_SCENES };
      }
      fields.scenes = scenes + 1;
    }
    const r = await store.update('users', user.id, fields, { version: current.__version });
    if (r.ok) {
      Object.assign(user, fields);
      if (current.proUntil !== undefined) user.proUntil = current.proUntil;
      return { ok: true, pro: !!pro, release: () => releaseScan(user.id, scene) };
    }
    if (r.reason === 'missing') return { ok: false, gone: true };
  }
  return { ok: false, busy: true };
}

// Повертає те, що зайняв reserveScan, одним умовним записом: скан і, якщо це
// була сцена, сцену. Обидва довічні, тож жодних умов про день; нижче нуля —
// ніколи.
async function releaseScan(id, scene) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const user = await store.get('users', id);
    if (!user) return;
    const fields = {};
    const scans = scansUsed(user);
    const scenes = scenesUsed(user);
    if (scans > 0) fields.scans = scans - 1;
    if (scene && scenes > 0) fields.scenes = scenes - 1;
    if (!Object.keys(fields).length) return;
    const r = await store.update('users', id, fields, { version: user.__version });
    if (r.ok || r.reason === 'missing') return;
  }
}

// ---------- вебхук ----------
// RevenueCat шле подію на кожну зміну підписки. Ми не намагаємось відтворити
// всю машину станів: беремо дату закінчення з події, а для переносу покупки
// між id просто скидаємо кеш — наступний скан перепитає RevenueCat.
const EXTENDS = new Set([
  'INITIAL_PURCHASE',
  'RENEWAL',
  'PRODUCT_CHANGE',
  'UNCANCELLATION',
  'NON_RENEWING_PURCHASE',
  'SUBSCRIPTION_EXTENDED',
  'TEMPORARY_ENTITLEMENT_GRANT',
  'REFUND_REVERSED',
]);

// Порівняння за сталий час: інакше секрет можна було б підбирати за тим,
// наскільки швидко сервер каже «ні».
function webhookAuthorized(req) {
  if (!RC_WEBHOOK_AUTH) return false;
  const got = Buffer.from(String(req.headers.authorization || ''));
  const want = Buffer.from(RC_WEBHOOK_AUTH);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

// Що подія означає для конкретного користувача, якщо RevenueCat REST
// недоступний (немає секретного ключа). Повертає новий proUntil або undefined.
function untilFromEvent(ev, id, current) {
  if (ev.type === 'TRANSFER') {
    // покупку перенесли на інший id (відновлення на іншому пристрої):
    // старий власник її втрачає, новий отримає при наступній перевірці
    return (ev.transferred_from || []).includes(id) ? null : undefined;
  }
  if (EXTENDS.has(ev.type)) return ev.expiration_at_ms || FOREVER;
  if (ev.type === 'EXPIRATION') return Math.min(current || Infinity, ev.expiration_at_ms || Date.now());
  // Повернення коштів через підтримку Apple — доступ припиняється одразу.
  if (ev.type === 'CANCELLATION' && ev.cancel_reason === 'CUSTOMER_SUPPORT') return Date.now();
  return undefined;
}

async function handleWebhook(body) {
  const ev = body && body.event;
  if (!ev || !ev.type) return { handled: false };
  const ids = new Set(
    [ev.app_user_id, ev.original_app_user_id, ...(ev.aliases || []), ...(ev.transferred_from || []), ...(ev.transferred_to || [])]
      .filter((x) => typeof x === 'string' && x && !x.startsWith('$RCAnonymousID'))
  );
  const forPro = !Array.isArray(ev.entitlement_ids) || ev.entitlement_ids.includes(ENTITLEMENT);
  let touched = 0;
  for (const id of ids) {
    const user = await store.get('users', id);
    if (!user) continue;
    // Найнадійніше — сприйняти подію як сигнал і перечитати стан у
    // RevenueCat (так радить і сам RevenueCat): не треба відтворювати всю
    // машину станів підписки.
    let fresh = false;
    if (RC_SECRET) {
      try {
        user.proUntil = await fetchRevenueCatUntil(id);
        user.proCheckedAt = Date.now();
        fresh = true;
      } catch (_) {}
    }
    if (!fresh) {
      const until = forPro || ev.type === 'TRANSFER' ? untilFromEvent(ev, id, user.proUntil) : undefined;
      if (until !== undefined) user.proUntil = until;
      user.proCheckedAt = 0;
    }
    // лише поля підписки: паралельний скан не має затерти відкликання Pro,
    // а вебхук — свіжий лічильник сканів
    const r = await store.update('users', id, { proUntil: user.proUntil ?? null, proCheckedAt: user.proCheckedAt });
    if (r.ok) touched++;
  }
  return { handled: true, touched };
}

module.exports = {
  FREE_SCANS,
  FREE_SCENES,
  ENTITLEMENT,
  utcDay,
  addDays,
  dayIndexOf,
  localDay,
  proStatus,
  usageView,
  mergeCounters,
  reserveScan,
  webhookAuthorized,
  handleWebhook,
};
