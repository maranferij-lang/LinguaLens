// Демо-дані для кожної локалі App Store (BRIEF §2.10): мова інтерфейсу —
// мова телефона (застосунок іде за нею), слова на наліпках — мовою, яку
// вчать, переклади — «моєю мовою» з налаштувань:
//   uk     інтерфейс uk, вчить англійську, переклади uk
//   en-US  інтерфейс en, вчить іспанську (з артиклями: la taza), переклади en
//   en-GB  інтерфейс en, вчить англійську, переклади uk — так застосунок бачить
//          українець з англійським телефоном
//   es-MX  інтерфейс es, вчить англійську, переклади es (мексиканські:
//          audífonos, tenis, lentes)
// Слова, IPA й переклади — такі, які повертає сервер для цих предметів.
// Перед поданням їх можна замінити справжніми сканами власника (BRIEF §9).
//
// Варіант мови — той, який людина чує в застосунку. Сервер (server/ai.js)
// просить у моделі просто «English» чи «Spanish», а озвучка (LANGS у
// src/speech.js) — en-US і es-ES. Тож англійська тут американська (sneaker,
// /ˈhaʊsplænt/, /ˈɡlæsɪz/) у всіх трьох локалях, зокрема en-GB: британський
// телефон не робить британськими ні слова моделі, ні голос. Іспанська, якої
// вчать в en-US, — іспанська Іспанії, як голос es-ES і прапорець 🇪🇸: θ
// у /la ˈtaθa/ (так пише й зразок сервера), auriculares, zapatilla, gafas.
// IPA іспанських слів — з артиклем, як у сервера: «/la ˈtaθa/».
import { COLLECTION } from './art/objects.mjs';

export const STORE_LOCALES = ['uk', 'en-US', 'en-GB', 'es-MX'];

// ui — мова інтерфейсу (phone language), learn — мова навчання,
// native — мова перекладів; browser — мова, яку бачить веб-збірка;
// date — локаль дат, які малює компонувальник (екран блокування).
// Перший день тижня — не тут, а з регіону локалі (firstWeekdayFor нижче).
export const LOCALES = {
  uk: { ui: 'uk', learn: 'en', native: 'uk', name: 'Марко', browser: 'uk-UA', date: 'uk-UA' },
  'en-US': { ui: 'en', learn: 'es', native: 'en', name: 'Mark', browser: 'en-US', date: 'en-US' },
  'en-GB': { ui: 'en', learn: 'en', native: 'uk', name: 'Marko', browser: 'en-GB', date: 'en-GB' },
  'es-MX': { ui: 'es', learn: 'en', native: 'es', name: 'Marco', browser: 'es-MX', date: 'es-MX' },
};

// Перший день тижня, як його віддає календар iPhone цього регіону
// (expo-localization getCalendars()[0].firstWeekday: 1 неділя, 2 понеділок).
// Веб-збірка цього не знає й завжди бере понеділок, тож capture.mjs
// підставляє сторінці саме це число. За CLDR: США й Мексика — з неділі,
// Британія й Україна — з понеділка.
export function firstWeekdayFor(loc) {
  const L = new Intl.Locale(LOCALES[loc].browser);
  const info = typeof L.getWeekInfo === 'function' ? L.getWeekInfo() : L.weekInfo;
  return (info.firstDay % 7) + 1; // ISO (1 пн … 7 нд) → iOS (1 нд, 2 пн …)
}

// Порядок наліпок у колекції (словник, засів). en-GB: американського
// «sneaker» (британською trainer) немає серед перших дванадцяти, які видно
// на кадрі 2; на його місці окуляри. Слово лишається в колекції нижче.
export function collectionFor(loc) {
  if (loc !== 'en-GB') return COLLECTION;
  const out = COLLECTION.filter((k) => k !== 'glasses' && k !== 'sneaker');
  out.splice(COLLECTION.indexOf('sneaker'), 0, 'glasses');
  out.splice(COLLECTION.indexOf('glasses'), 0, 'sneaker');
  return out;
}

// Набір слів: пара «мова навчання > мова перекладу». en-GB бачить ті самі
// англійські слова, що й uk (див. вище).
const SET = { uk: 'en>uk', 'en-US': 'es>en', 'en-GB': 'en>uk', 'es-MX': 'en>es' };

// Англійська, американська вимова (голос en-US): key → [word, ipa]
const EN = {
  mug: ['mug', '/mʌɡ/'],
  plant: ['houseplant', '/ˈhaʊsplænt/'],
  apple: ['apple', '/ˈæpəl/'],
  headphones: ['headphones', '/ˈhedfoʊnz/'],
  sneaker: ['sneaker', '/ˈsniːkər/'],
  lemon: ['lemon', '/ˈlemən/'],
  camera: ['camera', '/ˈkæmərə/'],
  backpack: ['backpack', '/ˈbækpæk/'],
  umbrella: ['umbrella', '/ʌmˈbrelə/'],
  clock: ['alarm clock', '/əˈlɑːrm klɑːk/'],
  book: ['book', '/bʊk/'],
  cactus: ['cactus', '/ˈkæktəs/'],
  glasses: ['glasses', '/ˈɡlæsɪz/'],
  kettle: ['kettle', '/ˈketl/'],
  banana: ['banana', '/bəˈnænə/'],
  scissors: ['scissors', '/ˈsɪzərz/'],
  // лише сцена кухні
  window: ['window', '/ˈwɪndoʊ/'],
  pan: ['frying pan', '/ˈfraɪɪŋ pæn/'],
  jar: ['jar', '/dʒɑːr/'],
  board: ['cutting board', '/ˈkʌtɪŋ bɔːrd/'],
  towel: ['dish towel', '/ˈdɪʃ taʊəl/'],
};
const withTranslations = (tr) => Object.fromEntries(Object.entries(EN).map(([k, [w, ipa]]) => [k, [w, ipa, tr[k]]]));

// key → [word, ipa, translation]
const VOCAB = {
  'en>uk': withTranslations({
    mug: 'кружка', plant: 'кімнатна рослина', apple: 'яблуко', headphones: 'навушники', sneaker: 'кросівок', lemon: 'лимон',
    camera: 'фотоапарат', backpack: 'рюкзак', umbrella: 'парасолька', clock: 'будильник', book: 'книжка', cactus: 'кактус',
    glasses: 'окуляри', kettle: 'чайник', banana: 'банан', scissors: 'ножиці',
    window: 'вікно', pan: 'сковорідка', jar: 'банка', board: 'обробна дошка', towel: 'кухонний рушник',
  }),
  'en>es': withTranslations({
    mug: 'taza', plant: 'planta de interior', apple: 'manzana', headphones: 'audífonos', sneaker: 'tenis', lemon: 'limón',
    camera: 'cámara', backpack: 'mochila', umbrella: 'paraguas', clock: 'despertador', book: 'libro', cactus: 'cactus',
    glasses: 'lentes', kettle: 'tetera', banana: 'plátano', scissors: 'tijeras',
    window: 'ventana', pan: 'sartén', jar: 'frasco', board: 'tabla de picar', towel: 'trapo de cocina',
  }),
  // іспанська Іспанії (голос es-ES), переклади англійською
  'es>en': {
    mug: ['la taza', '/la ˈtaθa/', 'mug'],
    plant: ['la planta', '/la ˈplanta/', 'houseplant'],
    apple: ['la manzana', '/la manˈθana/', 'apple'],
    headphones: ['los auriculares', '/los awɾikuˈlaɾes/', 'headphones'],
    sneaker: ['la zapatilla', '/la θapaˈtiʝa/', 'sneaker'],
    lemon: ['el limón', '/el liˈmon/', 'lemon'],
    camera: ['la cámara', '/la ˈkamaɾa/', 'camera'],
    backpack: ['la mochila', '/la moˈtʃila/', 'backpack'],
    umbrella: ['el paraguas', '/el paˈɾaɣwas/', 'umbrella'],
    clock: ['el despertador', '/el despeɾtaˈðoɾ/', 'alarm clock'],
    book: ['el libro', '/el ˈliβɾo/', 'book'],
    cactus: ['el cactus', '/el ˈkaktus/', 'cactus'],
    glasses: ['las gafas', '/las ˈɡafas/', 'glasses'],
    kettle: ['la tetera', '/la teˈteɾa/', 'kettle'],
    banana: ['el plátano', '/el ˈplatano/', 'banana'],
    scissors: ['las tijeras', '/las tiˈxeɾas/', 'scissors'],
    window: ['la ventana', '/la benˈtana/', 'window'],
    pan: ['la sartén', '/la saɾˈten/', 'frying pan'],
    jar: ['el frasco', '/el ˈfɾasko/', 'jar'],
    board: ['la tabla de cortar', '/la ˈtaβla ðe koɾˈtaɾ/', 'cutting board'],
    towel: ['el trapo de cocina', '/el ˈtɾapo ðe koˈθina/', 'dish towel'],
  },
};

// Приклади (аркуш результату, звороти карток) для головних слів.
const EN_UK_EXAMPLES = {
  mug: ['I drink my morning coffee from this red mug.', 'Я пʼю ранкову каву з цієї червоної кружки.'],
  plant: ['Water the houseplant once a week.', 'Поливай кімнатну рослину раз на тиждень.'],
  umbrella: ['Take an umbrella, it’s going to rain.', 'Візьми парасольку, буде дощ.'],
};
const EXAMPLES = {
  'en>uk': EN_UK_EXAMPLES,
  'es>en': {
    mug: ['Tomo café en mi taza roja cada mañana.', 'I drink coffee from my red mug every morning.'],
    plant: ['Riego la planta una vez a la semana.', 'I water the plant once a week.'],
    umbrella: ['Llévate el paraguas, va a llover.', 'Take the umbrella, it’s going to rain.'],
  },
  'en>es': {
    mug: ['I drink my morning coffee from this red mug.', 'Tomo mi café de la mañana en esta taza roja.'],
    plant: ['Water the houseplant once a week.', 'Riega la planta una vez por semana.'],
    umbrella: ['Take an umbrella, it’s going to rain.', 'Llévate un paraguas, va a llover.'],
  },
};

export function vocab(loc, key) {
  const [word, ipa, translation] = VOCAB[SET[loc]][key];
  const ex = EXAMPLES[SET[loc]][key];
  return { word, ipa, translation, example: ex?.[0], exampleTranslation: ex?.[1] };
}

// Слово дня людини рівня B2+ з IT (кадр 5: «слова твоєї сфери»), зі
// server/topics/it.js ('deploy', 'pipeline'…).
const DEPLOY_EN = { word: 'deployment', ipa: '/dɪˈplɔɪmənt/', example: 'The deployment went live at midnight.', topic: 'it' };
export const WOD = {
  uk: { ...DEPLOY_EN, translation: 'розгортання', example_translation: 'Розгортання запустили опівночі.' },
  'en-US': { word: 'el despliegue', ipa: '/el desˈpljeɣe/', translation: 'deployment', example: 'Hicimos el despliegue a medianoche.', example_translation: 'We deployed at midnight.', topic: 'it' },
  'en-GB': { ...DEPLOY_EN, translation: 'розгортання', example_translation: 'Розгортання запустили опівночі.' },
  'es-MX': { ...DEPLOY_EN, translation: 'despliegue', example_translation: 'El despliegue salió a producción a medianoche.' },
};

// Кадр 6 (віджет) показує слово ІНШОГО дня — загальне слово рівня B2 з
// server/topics/general.js, щоб кадри 5 і 6 не повторювались і набір не
// виглядав лише для айтішників. topic 'general' → кепс «English · слово дня».
// en-US: blizzard → «la ventisca», слово без θ: іспанська тут та, яку чути
// в застосунку (es-ES), але кадр не мусить підкреслювати саме Іспанію.
const RESILIENT = { word: 'resilient', ipa: '/rɪˈzɪliənt/', example: 'Kids are more resilient than we think.', topic: 'general' };
export const WIDGET_WOD = {
  uk: { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'en-US': { word: 'la ventisca', ipa: '/la benˈtiska/', translation: 'blizzard', example: 'La ventisca nos dejó en casa todo el día.', example_translation: 'The blizzard kept us home all day.', topic: 'general' },
  'en-GB': { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'es-MX': { ...RESILIENT, translation: 'resiliente', example_translation: 'Los niños son más resilientes de lo que creemos.' },
};

// Старіші слова без наліпки — лише для профілю: разом 30 слів («етап 4 ·
// 30 із 48»), і 30 — число, з яким узгоджується фіксований uk-підпис
// «слів усього».
const OLDER_EN_UK = [['chair', 'стілець'], ['lamp', 'лампа'], ['pillow', 'подушка'], ['fork', 'виделка'], ['spoon', 'ложка'], ['plate', 'тарілка'], ['key', 'ключ'], ['wallet', 'гаманець'], ['candle', 'свічка'], ['towel', 'рушник'], ['mirror', 'дзеркало'], ['blanket', 'ковдра'], ['bottle', 'пляшка'], ['notebook', 'блокнот']];
const OLDER = {
  'en>uk': OLDER_EN_UK,
  'es>en': [['la silla', 'chair'], ['la lámpara', 'lamp'], ['la almohada', 'pillow'], ['el tenedor', 'fork'], ['la cuchara', 'spoon'], ['el plato', 'plate'], ['la llave', 'key'], ['la cartera', 'wallet'], ['la vela', 'candle'], ['la toalla', 'towel'], ['el espejo', 'mirror'], ['la manta', 'blanket'], ['la botella', 'bottle'], ['el cuaderno', 'notebook']],
  'en>es': [['chair', 'silla'], ['lamp', 'lámpara'], ['pillow', 'almohada'], ['fork', 'tenedor'], ['spoon', 'cuchara'], ['plate', 'plato'], ['key', 'llave'], ['wallet', 'cartera'], ['candle', 'vela'], ['towel', 'toalla'], ['mirror', 'espejo'], ['blanket', 'cobija'], ['bottle', 'botella'], ['notebook', 'cuaderno']],
};
export const olderWords = (loc) => OLDER[SET[loc]].map(([word, translation]) => ({ word, translation }));
