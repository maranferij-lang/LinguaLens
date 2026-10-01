// Pro-статус і денний ліміт сканів — на сервері, а не в телефоні.
//
// Чому тут: лічильник у AsyncStorage обнуляється перевстановленням, а будь-хто
// зі скриптом міг би безкоштовно витрачати наш AI-ключ. Тепер сервер сам
// рахує скани за id пристрою і питає RevenueCat, чи людина має Pro.
//
// Джерела правди про Pro (обидва необов'язкові, працюють разом):
//   1) вебхук RevenueCat → user.proUntil (миттєво після покупки/продовження);
//   2) REST-запит до RevenueCat, коли безкоштовний ліміт вичерпано, — на
//      випадок, якщо вебхук ще не налаштований або загубився. Кеш 10 хв.
const crypto = require('crypto');
const store = require('./store');

const FREE_SCANS_PER_DAY = Number(process.env.FREE_SCANS_PER_DAY || 5);
const RC_SECRET = process.env.REVENUECAT_SECRET_KEY || '';
const RC_WEBHOOK_AUTH = process.env.REVENUECAT_WEBHOOK_AUTH || '';
const ENTITLEMENT = process.env.REVENUECAT_ENTITLEMENT || 'pro';
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

// Ліміт «на день» має скидатись опівночі ЗА ЧАСОМ ЛЮДИНИ, а не за UTC — інакше
// в Києві скани «оновлювались» би о третій ночі. Клієнт надсилає свою дату;
// приймаємо її, якщо вона в межах доби від серверної (часові пояси -12…+14).
// Лише канонічна дата: «2026-09-31» чи «2026-08-62» Date.UTC мовчки
// перекотив би в сьогодні, і кожен такий псевдонім мав би свій лічильник.
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
  // міг би в циклі вичерпати квоту RevenueCat API для всіх.
  const canRefresh = refresh && !(user.proCheckedAt && now - user.proCheckedAt < REFRESH_MIN_MS);
  if (RC_SECRET && (canRefresh || stale)) {
    try {
      until = await fetchRevenueCatUntil(user.id);
      user.proUntil = until;
      user.proCheckedAt = now;
      await store.update('users', user.id, { proUntil: until, proCheckedAt: now });
    } catch (e) {
      console.error('revenuecat check failed:', e.message);
      if (user.proUntil && now - user.proUntil < GRACE_MS) return { active: true, until: user.proUntil };
    }
  }
  return { active: !!(until && until > now), until: until || null };
}

// ---------- ліміт сканів ----------
// День лічильника ніколи не йде назад. Інакше, чергуючи в x-local-date
// «сьогодні» і «завтра» (обидва в межах доби), можна було б щоразу обнуляти
// ліміт. Дати ISO порівнюються як рядки. Людина, що перелетіла на захід через
// північ, просто продовжить учорашній-завтрашній лічильник — це чесно.
function counterDay(user, day) {
  const last = user.usage && user.usage.day;
  return typeof last === 'string' && DAY_RE.test(last) && last > day ? last : day;
}

function usedOn(user, day) {
  const d = counterDay(user, day);
  return user.usage && user.usage.day === d ? user.usage.scans || 0 : 0;
}

function usageView(user, day, pro) {
  return { day, scans: usedOn(user, day), limit: pro ? null : FREE_SCANS_PER_DAY };
}

// Слот займаємо ДО виклику AI і атомарно. Перевірити ліміт, викликати AI і
// потім дописати +1 — це гонка: паралельні скани читали б той самий
// лічильник і проходили б усі. Тут запис умовний (версія документа): якщо
// хтось устиг раніше — перечитуємо і пробуємо ще раз.
//
// { ok: true, pro, release } — release() повертає слот, якщо скан не вдався
//   («не бачу предмета» людині не коштує спроби);
// { ok: false, used, limit } — ліміт вичерпано (402, AI не викликаємо);
// { ok: false, gone: true } — пристрій стерто; { ok: false, busy: true }.
async function reserveScan(user, day) {
  let current = user;
  for (let attempt = 0; attempt < 6; attempt++) {
    if (attempt > 0) current = await store.get('users', user.id);
    if (!current) return { ok: false, gone: true };
    const used = usedOn(current, day);
    let pro = false;
    if (used >= FREE_SCANS_PER_DAY) {
      pro = (await proStatus(current)).active;
      if (!pro) return { ok: false, used, limit: FREE_SCANS_PER_DAY };
    }
    const usage = { day: counterDay(current, day), scans: used + 1 };
    const r = await store.update('users', user.id, { usage }, { version: current.__version });
    if (r.ok) {
      user.usage = usage;
      if (current.proUntil !== undefined) user.proUntil = current.proUntil;
      return { ok: true, pro, release: () => releaseScan(user.id, usage.day) };
    }
    if (r.reason === 'missing') return { ok: false, gone: true };
  }
  return { ok: false, busy: true };
}

async function releaseScan(id, day) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const user = await store.get('users', id);
    if (!user || !user.usage || user.usage.day !== day || !(user.usage.scans > 0)) return;
    const usage = { day, scans: user.usage.scans - 1 };
    const r = await store.update('users', id, { usage }, { version: user.__version });
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
  FREE_SCANS_PER_DAY,
  utcDay,
  addDays,
  dayIndexOf,
  localDay,
  proStatus,
  usageView,
  reserveScan,
  webhookAuthorized,
  handleWebhook,
};
