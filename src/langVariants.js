// Варіанти мов: англійська США / Британії, іспанська Іспанії / Латинської
// Америки. Мова слова лишається базовим кодом ('en', 'es') усюди, де слова
// зберігаються: збережені слова, фільтри словника, SRS, синхронізація,
// статистика. Тож нічого не ділиться навпіл і не мігрує: варіант — лише
// уподобання людини для цієї мови. Від нього залежать прапорець, голос
// озвучки й те, як сервер пише слово (правопис, словник, IPA).
//
// Обраний варіант живе в налаштуваннях поруч із мовою навчання:
// settings.variants = { en: 'gb' } (базовий код → id). Старі встановлення
// його не мають — тоді варіант за замовчуванням (defaultVariant). Варіант
// «моєї мови» (переклади для англомовних чи іспаномовних) вибору в
// інтерфейсі не має: його мовчки дає регіон телефона тим самим правилом.
//
// Додати варіанти мови (скажімо, португальська Португалії й Бразилії) =
// рядок у VARIANTS, назви регіонів langRegion_<id> у src/strings/onb.js і
// той самий id у server/ai.js (VARIETIES). Перший у списку — варіант за
// замовчуванням; regions — регіони телефона, де за замовчуванням цей.
import { getLocales } from 'expo-localization';

// Регіони обох Америк (ISO 3166-1): Північна (і США), Центральна, Карибські
// острови й Південна. Іспанську там чують латиноамериканську.
const AMERICAS = [
  'US', 'CA', 'MX', 'BM', 'PM',
  'BZ', 'CR', 'SV', 'GT', 'HN', 'NI', 'PA',
  'AG', 'AI', 'AW', 'BB', 'BL', 'BQ', 'BS', 'CU', 'CW', 'DM', 'DO', 'GD', 'GP', 'HT', 'JM', 'KN', 'KY',
  'LC', 'MF', 'MQ', 'MS', 'PR', 'SX', 'TC', 'TT', 'VC', 'VG', 'VI',
  'AR', 'BO', 'BR', 'CL', 'CO', 'EC', 'FK', 'GF', 'GY', 'PE', 'PY', 'SR', 'UY', 'VE',
];

// name — ендонім для списків («English (US)»), flag — прапорець, tts — голос
// iOS; alt — інші теги того ж варіанта, якщо основного голосу на телефоні
// немає; terms — чим його ще шукають (англійською й самою мовою, а ще
// українською й російською, коли регіон у назві починається інакше: «брит»
// не початок «Великобритании», «американ» не початок «США»).
export const VARIANTS = {
  en: [
    { id: 'us', name: 'English (US)', flag: '🇺🇸', tts: 'en-US', terms: ['american', 'usa', 'america', 'американский', 'американська'] },
    { id: 'gb', name: 'English (UK)', flag: '🇬🇧', tts: 'en-GB', terms: ['british', 'britain', 'uk', 'england', 'британия', 'британский', 'британська'] },
  ],
  es: [
    { id: 'es', name: 'Español (España)', flag: '🇪🇸', tts: 'es-ES', terms: ['spain', 'castellano', 'castilian'] },
    {
      id: 'latam',
      name: 'Español (Latinoamérica)',
      flag: '🇲🇽',
      tts: 'es-MX',
      alt: ['es-US', 'es-419'],
      regions: AMERICAS,
      terms: ['latin america', 'latam', 'mexico', 'mexican', 'latino', 'мексика', 'мексиканский', 'мексиканська', 'латиноамериканский', 'латиноамериканська'],
    },
  ],
};

// Варіанти мови (порожньо — у мови їх немає)
export function variantsOf(code) {
  return Object.hasOwn(VARIANTS, code) ? VARIANTS[code] : [];
}

export function hasVariants(code) {
  return variantsOf(code).length > 0;
}

// Опис варіанта або null (немає такого в цієї мови)
export function variantInfo(code, id) {
  return variantsOf(code).find((v) => v.id === id) || null;
}

export function isVariant(code, id) {
  return typeof id === 'string' && !!variantInfo(code, id);
}

// Регіон телефона: з «Регіону» в налаштуваннях iOS / Android; на вебі — з
// тегу мови. Нема — null.
export function phoneRegion(locales) {
  try {
    const list = Array.isArray(locales) ? locales : getLocales();
    for (const l of list || []) {
      const r = l?.regionCode || l?.languageRegionCode;
      if (r) return String(r).toUpperCase();
    }
  } catch (_) {}
  return null;
}

// Варіант за замовчуванням: той, у чиїх regions регіон телефона, інакше
// перший. Англійська — завжди США; іспанська — латиноамериканська в обох
// Америках (і в США), іспанська Іспанії деінде. Мова без варіантів — null.
export function defaultVariant(code, locales) {
  return defaultIn(code, phoneRegion(locales));
}

function defaultIn(code, region) {
  const list = variantsOf(code);
  if (!list.length) return null;
  const local = region && list.find((v) => Array.isArray(v.regions) && v.regions.includes(region));
  return (local || list[0]).id;
}

// Варіант мови навчання: обраний людиною (settings.variants), якщо такий у
// мови є, інакше за замовчуванням.
export function pickVariant(code, chosen, locales) {
  const id = chosen && typeof chosen === 'object' ? chosen[code] : null;
  return isVariant(code, id) ? id : defaultVariant(code, locales);
}

// ── Обрані варіанти для всього застосунку ─────────────────────────────────
// App кладе сюди settings.variants на кожному рендері (до рендеру дітей), і
// всі, хто показує прапорець мови чи озвучує слово (flagFor / speak у
// src/speech.js), бачать вибір людини без проводу пропсів через кожен екран.
// Слово зберігає лише базовий код, тож його прапорець і голос — це варіант,
// який людина обрала для цієї мови.
// Регіон телефона App перечитує тут же: прапорець рахують для кожного
// рядка словника, і питати систему щоразу ні до чого. Поки App нічого не
// поклав (тести окремих екранів), регіон читаємо щоразу.
let chosenNow = {};
let regionNow;

export function setChosenVariants(map, locales) {
  chosenNow = map && typeof map === 'object' && !Array.isArray(map) ? map : {};
  regionNow = phoneRegion(locales);
}

function regionOrPhone() {
  return regionNow === undefined ? phoneRegion() : regionNow;
}

// Варіант мови навчання зараз (вибір людини або за замовчуванням)
export function variantOf(code) {
  const id = chosenNow[code];
  return isVariant(code, id) ? id : defaultIn(code, regionOrPhone());
}

// Варіант «моєї мови»: лише з регіону телефона, без вибору в інтерфейсі
export function nativeVariantOf(code, locales) {
  return locales ? defaultVariant(code, locales) : defaultIn(code, regionOrPhone());
}

// Ключ рядка у списку мов: 'en-gb', 'es-latam'; мова без варіантів — код.
export function optionKey(code, variant) {
  return isVariant(code, variant) ? code + '-' + variant : code;
}

// Ключ рядка → { code, variant } (variant — null, якщо його немає)
export function parseOption(key) {
  const s = String(key || '');
  const i = s.indexOf('-');
  if (i > 0) {
    const code = s.slice(0, i);
    const variant = s.slice(i + 1);
    if (isVariant(code, variant)) return { code, variant };
  }
  return { code: s, variant: null };
}

// Коди → ключі рядків: мова з варіантами розгортається в усі свої варіанти
// (у порядку VARIANTS), решта лишається кодом.
export function expandOptions(codes) {
  return codes.flatMap((c) => (hasVariants(c) ? variantsOf(c).map((v) => c + '-' + v.id) : [c]));
}

// Поля запиту до сервера: variant — мови навчання, nativeVariant — мови
// перекладу. Лише для мов, у яких варіанти є: інакше тіло запиту таке, як
// до варіантів.
export function variantFields(lang, native, { variant = variantOf(lang), nativeVariant = nativeVariantOf(native) } = {}) {
  return {
    ...(isVariant(lang, variant) ? { variant } : null),
    ...(isVariant(native, nativeVariant) ? { nativeVariant } : null),
  };
}
