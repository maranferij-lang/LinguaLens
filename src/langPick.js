// Вибір мови (onboarding.md §5.2): «Популярні» під мову перекладу, «Усі
// мови» за абеткою мовою інтерфейсу і пошук без регістру й діакритики.
// Чисті функції без React — їх ділять крок «Яку мову вчиш?» в онбордингу й
// аркуш LangSheet (він же — чип мови в сканері).
//
// Назви мов — з рядків langName_xx (називний відмінок). Українською,
// російською й іспанською назва мови посеред рядка пишеться з малої
// («англійська», «английский», «inglés») — так і в списку; з великої лише
// на початку речення (реакція Lingo: «Англійська? Чудовий вибір!»).
// Англійською й німецькою назви мов завжди з великої.
//
// Варіанти мов (src/langVariants.js): у списку мови навчання англійська
// й іспанська — по рядку на варіант («англійська (США)», «англійська
// (Британія)»). Рядок списку — ключ 'en-gb' (optionKey); мова без
// варіантів — просто код. Розділи, пошук і порядок рахуються за мовами, а
// на рядки їх розгортає expandOptions.
import { LANGS } from './speech';
import { STRINGS } from './i18n';
import { expandOptions, parseOption, variantInfo } from './langVariants';

export const CODES = LANGS.map((l) => l.code);

// Популярні мови навчання для людей з цією мовою перекладу — не більше
// шести, саму мову перекладу не показуємо (вчити її з перекладом на неї ж
// нема сенсу).
export const POPULAR = {
  uk: ['en', 'de', 'pl', 'es', 'fr', 'it'],
  ru: ['en', 'de', 'es', 'fr', 'it', 'pl'],
  pl: ['en', 'de', 'es', 'fr', 'it', 'uk'],
  en: ['es', 'fr', 'de', 'it', 'ja', 'ko'],
  de: ['en', 'es', 'fr', 'it', 'pt', 'nl'],
  es: ['en', 'fr', 'de', 'it', 'pt', 'ja'],
  default: ['en', 'es', 'fr', 'de', 'it', 'ja'],
};
export const POPULAR_MAX = 6;

// Мови інтерфейсу, у яких назва мови посеред рядка — з малої
const LOWER_UI = ['uk', 'ru', 'es'];

export function popularTargets(native) {
  const list = POPULAR[native] || POPULAR.default;
  return list.filter((c) => c !== native && CODES.includes(c)).slice(0, POPULAR_MAX);
}

// Назва мови мовою інтерфейсу: для списку й підписів (з малої там, де так
// пишуть) або для початку речення (capital).
export function langLabel(code, t, ui, { capital = false } = {}) {
  const name = t('langName_' + code);
  if (capital) return name.charAt(0).toLocaleUpperCase(ui) + name.slice(1);
  return LOWER_UI.includes(ui) ? name.toLocaleLowerCase(ui) : name;
}

// Назва варіанта мовою інтерфейсу: «англійська (США)», «Englisch
// (Großbritannien)». Регіон у дужках — з великої, як і пишеться; мала чи
// велика — лише сама назва мови (як у langLabel). Без варіанта — langLabel.
export function variantLabel(code, variant, t, ui, opts = {}) {
  const name = langLabel(code, t, ui, opts);
  return variantInfo(code, variant) ? `${name} (${t('langRegion_' + variant)})` : name;
}

// Те саме для ключа рядка списку ('en-gb' чи 'de')
export function optionLabel(key, t, ui, opts = {}) {
  const { code, variant } = parseOption(key);
  return variantLabel(code, variant, t, ui, opts);
}

// Для пошуку: нижній регістр, без діакритики («Español» → «espanol»,
// «Čeština» → «cestina», «й» → «и»), ʼ і дефіси — як пробіли.
export function fold(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[ʼ’'`\-()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Усе, за чим мову можна знайти: ендонім, назва мовою інтерфейсу,
// англійська назва й код.
function haystack(code, t) {
  const l = LANGS.find((x) => x.code === code);
  return [l?.name, t('langName_' + code), STRINGS.en['langName_' + code]].map(fold).filter(Boolean);
}

// Збіг за початком будь-якого слова в будь-якій назві (і за початком назви
// цілком — для «bahasa ind»), або за початком коду.
export function matches(code, q, t) {
  const needle = fold(q);
  if (!needle) return true;
  if (code.startsWith(needle)) return true;
  return hit(haystack(code, t), needle);
}

function hit(list, needle) {
  return list.some((h) => h.startsWith(needle) || h.split(' ').some((w) => w.startsWith(needle)));
}

// Рядок варіанта знаходить і сама мова («англ», «español» — обидва
// варіанти), і те, що є лише в нього: регіон мовою інтерфейсу й
// англійською, ендонім варіанта і слова з terms («brit», «mexic», «latam»).
export function optionMatches(key, q, t) {
  const { code, variant } = parseOption(key);
  if (matches(code, q, t)) return true;
  const v = variantInfo(code, variant);
  if (!v) return false;
  const needle = fold(q);
  return hit([v.name, t('langRegion_' + variant), STRINGS.en['langRegion_' + variant], ...(v.terms || [])].map(fold), needle);
}

// Усі мови за абеткою назви мовою інтерфейсу.
export function sortLangs(ui, t, codes = CODES) {
  return [...codes].sort((a, b) => {
    const x = t('langName_' + a);
    const y = t('langName_' + b);
    try {
      return x.localeCompare(y, ui);
    } catch (_) {
      return x < y ? -1 : x > y ? 1 : 0;
    }
  });
}

// Пошук → коди за абеткою мовою інтерфейсу.
export function searchLangs(q, t, ui = 'en') {
  return sortLangs(ui, t).filter((c) => matches(c, q, t));
}

// Розділи списку для мови навчання. Без запиту — «Популярні» й «Усі мови»
// (решта за абеткою); із запитом — лише збіги одним списком. native — мова
// перекладу: вона в списку лишається (вимкнена, з підписом), але в
// «Популярні» не потрапляє. variants — рядки замість кодів: мови з
// варіантами розгорнуті (expandOptions), «Популярні» — ті самі мови.
export function langSections({ native, query = '', t, ui = 'en', popular = true, variants = false }) {
  if (variants) {
    if (fold(query)) return { results: expandOptions(sortLangs(ui, t)).filter((k) => optionMatches(k, query, t)) };
    const top = popular ? popularTargets(native) : [];
    return { popular: expandOptions(top), all: expandOptions(sortLangs(ui, t).filter((c) => !top.includes(c))) };
  }
  if (fold(query)) return { results: searchLangs(query, t, ui) };
  const top = popular ? popularTargets(native) : [];
  return { popular: top, all: sortLangs(ui, t).filter((c) => !top.includes(c)) };
}
