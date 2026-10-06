// Демо-дані для кожної локалі App Store (BRIEF §2.10): мова інтерфейсу —
// мова телефона (застосунок іде за нею), слова на наліпках — мовою, яку
// вчать, переклади — «моєю мовою» з налаштувань:
//   uk     інтерфейс uk, вчить англійську, переклади uk
//   en-US  інтерфейс en, вчить іспанську (з артиклями: la taza), переклади en
//   en-GB  інтерфейс en, вчить англійську, переклади uk — так застосунок бачить
//          українець з англійським телефоном; слова британські (trainer,
//          chopping board, tea towel)
//   es-MX  інтерфейс es, вчить англійську, переклади es (мексиканські:
//          audífonos, tenis, lentes)
// Слова, IPA й переклади — такі, які повертає сервер для цих предметів.
// Перед поданням їх можна замінити справжніми сканами власника (BRIEF §9).

export const STORE_LOCALES = ['uk', 'en-US', 'en-GB', 'es-MX'];

// ui — мова інтерфейсу (phone language), learn — мова навчання,
// native — мова перекладів; browser — мова, яку бачить веб-збірка;
// date — локаль дат, які малює компонувальник (екран блокування).
export const LOCALES = {
  uk: { ui: 'uk', learn: 'en', native: 'uk', name: 'Марко', browser: 'uk-UA', date: 'uk-UA' },
  'en-US': { ui: 'en', learn: 'es', native: 'en', name: 'Mark', browser: 'en-US', date: 'en-US' },
  'en-GB': { ui: 'en', learn: 'en', native: 'uk', name: 'Marko', browser: 'en-GB', date: 'en-GB' },
  'es-MX': { ui: 'es', learn: 'en', native: 'es', name: 'Marco', browser: 'es-MX', date: 'es-MX' },
};

// Набір слів: пара «мова навчання > мова перекладу», а для en-GB — свій
// (британські назви).
const SET = { uk: 'en>uk', 'en-US': 'es>en', 'en-GB': 'en-GB>uk', 'es-MX': 'en>es' };

// key → [word, ipa, translation]
const EN_UK = {
  mug: ['mug', '/mʌɡ/', 'кружка'],
  plant: ['houseplant', '/ˈhaʊsplɑːnt/', 'кімнатна рослина'],
  apple: ['apple', '/ˈæpəl/', 'яблуко'],
  headphones: ['headphones', '/ˈhedfəʊnz/', 'навушники'],
  sneaker: ['sneaker', '/ˈsniːkə/', 'кросівок'],
  lemon: ['lemon', '/ˈlemən/', 'лимон'],
  camera: ['camera', '/ˈkæmərə/', 'фотоапарат'],
  backpack: ['backpack', '/ˈbækpæk/', 'рюкзак'],
  umbrella: ['umbrella', '/ʌmˈbrelə/', 'парасолька'],
  clock: ['alarm clock', '/əˈlɑːm klɒk/', 'будильник'],
  book: ['book', '/bʊk/', 'книжка'],
  cactus: ['cactus', '/ˈkæktəs/', 'кактус'],
  glasses: ['glasses', '/ˈɡlɑːsɪz/', 'окуляри'],
  kettle: ['kettle', '/ˈketl/', 'чайник'],
  banana: ['banana', '/bəˈnɑːnə/', 'банан'],
  scissors: ['scissors', '/ˈsɪzəz/', 'ножиці'],
  // лише сцена кухні
  window: ['window', '/ˈwɪndəʊ/', 'вікно'],
  pan: ['frying pan', '/ˈfraɪɪŋ pæn/', 'сковорідка'],
  jar: ['jar', '/dʒɑː/', 'банка'],
  board: ['cutting board', '/ˈkʌtɪŋ bɔːd/', 'обробна дошка'],
  towel: ['tea towel', '/ˈtiː taʊəl/', 'кухонний рушник'],
};

const VOCAB = {
  'en>uk': EN_UK,
  'en-GB>uk': {
    ...EN_UK,
    sneaker: ['trainer', '/ˈtreɪnə/', 'кросівок'],
    board: ['chopping board', '/ˈtʃɒpɪŋ bɔːd/', 'обробна дошка'],
  },
  'es>en': {
    mug: ['la taza', '/ˈta.sa/', 'mug'],
    plant: ['la planta', '/ˈplan.ta/', 'houseplant'],
    apple: ['la manzana', '/manˈsa.na/', 'apple'],
    headphones: ['los audífonos', '/awˈði.fo.nos/', 'headphones'],
    sneaker: ['el tenis', '/ˈte.nis/', 'sneaker'],
    lemon: ['el limón', '/liˈmon/', 'lemon'],
    camera: ['la cámara', '/ˈka.ma.ɾa/', 'camera'],
    backpack: ['la mochila', '/moˈt͡ʃi.la/', 'backpack'],
    umbrella: ['el paraguas', '/paˈɾa.ɣwas/', 'umbrella'],
    clock: ['el despertador', '/des.peɾ.taˈðoɾ/', 'alarm clock'],
    book: ['el libro', '/ˈli.βɾo/', 'book'],
    cactus: ['el cactus', '/ˈkak.tus/', 'cactus'],
    glasses: ['los lentes', '/ˈlen.tes/', 'glasses'],
    kettle: ['la tetera', '/teˈte.ɾa/', 'kettle'],
    banana: ['el plátano', '/ˈpla.ta.no/', 'banana'],
    scissors: ['las tijeras', '/tiˈxe.ɾas/', 'scissors'],
    window: ['la ventana', '/benˈta.na/', 'window'],
    pan: ['la sartén', '/saɾˈten/', 'frying pan'],
    jar: ['el frasco', '/ˈfɾas.ko/', 'jar'],
    board: ['la tabla de picar', '/ˈta.βla ðe piˈkaɾ/', 'cutting board'],
    towel: ['el trapo', '/ˈtɾa.po/', 'dish towel'],
  },
  'en>es': {
    mug: ['mug', '/mʌɡ/', 'taza'],
    plant: ['houseplant', '/ˈhaʊsplænt/', 'planta de interior'],
    apple: ['apple', '/ˈæpəl/', 'manzana'],
    headphones: ['headphones', '/ˈhedfoʊnz/', 'audífonos'],
    sneaker: ['sneaker', '/ˈsniːkər/', 'tenis'],
    lemon: ['lemon', '/ˈlemən/', 'limón'],
    camera: ['camera', '/ˈkæmərə/', 'cámara'],
    backpack: ['backpack', '/ˈbækpæk/', 'mochila'],
    umbrella: ['umbrella', '/ʌmˈbrelə/', 'paraguas'],
    clock: ['alarm clock', '/əˈlɑːrm klɑːk/', 'despertador'],
    book: ['book', '/bʊk/', 'libro'],
    cactus: ['cactus', '/ˈkæktəs/', 'cactus'],
    glasses: ['glasses', '/ˈɡlæsɪz/', 'lentes'],
    kettle: ['kettle', '/ˈketl/', 'tetera'],
    banana: ['banana', '/bəˈnænə/', 'plátano'],
    scissors: ['scissors', '/ˈsɪzərz/', 'tijeras'],
    window: ['window', '/ˈwɪndoʊ/', 'ventana'],
    pan: ['frying pan', '/ˈfraɪɪŋ pæn/', 'sartén'],
    jar: ['jar', '/dʒɑːr/', 'frasco'],
    board: ['cutting board', '/ˈkʌtɪŋ bɔːrd/', 'tabla de picar'],
    towel: ['dish towel', '/ˈdɪʃ taʊəl/', 'trapo de cocina'],
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
  'en-GB>uk': EN_UK_EXAMPLES,
  'es>en': {
    mug: ['Tomo café en mi taza roja cada mañana.', 'I drink coffee from my red mug every morning.'],
    plant: ['Riego la planta una vez a la semana.', 'I water the plant once a week.'],
    umbrella: ['Lleva el paraguas, va a llover.', 'Take the umbrella, it’s going to rain.'],
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
  'en-US': { word: 'el despliegue', ipa: '/desˈpljeɣe/', translation: 'deployment', example: 'Hicimos el despliegue a medianoche.', example_translation: 'We deployed at midnight.', topic: 'it' },
  'en-GB': { ...DEPLOY_EN, translation: 'розгортання', example_translation: 'Розгортання запустили опівночі.' },
  'es-MX': { ...DEPLOY_EN, translation: 'despliegue', example_translation: 'El despliegue salió a producción a medianoche.' },
};

// Кадр 6 (віджет) показує слово ІНШОГО дня — загальне слово рівня B2 з
// server/topics/general.js, щоб кадри 5 і 6 не повторювались і набір не
// виглядав лише для айтішників. topic 'general' → кепс «English · слово дня».
const RESILIENT = { word: 'resilient', ipa: '/rɪˈzɪliənt/', example: 'Kids are more resilient than we think.', topic: 'general' };
export const WIDGET_WOD = {
  uk: { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'en-US': { word: 'la llovizna', ipa: '/ʝoˈβis.na/', translation: 'drizzle', example: 'Salimos a caminar bajo la llovizna.', example_translation: 'We went for a walk in the drizzle.', topic: 'general' },
  'en-GB': { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'es-MX': { ...RESILIENT, translation: 'resiliente', example_translation: 'Los niños son más resilientes de lo que creemos.' },
};

// Старіші слова без наліпки — лише для профілю: разом 30 слів («етап 4 ·
// 30 із 48»), і 30 — число, з яким узгоджується фіксований uk-підпис
// «слів усього».
const OLDER_EN_UK = [['chair', 'стілець'], ['lamp', 'лампа'], ['pillow', 'подушка'], ['fork', 'виделка'], ['spoon', 'ложка'], ['plate', 'тарілка'], ['key', 'ключ'], ['wallet', 'гаманець'], ['candle', 'свічка'], ['towel', 'рушник'], ['mirror', 'дзеркало'], ['blanket', 'ковдра'], ['bottle', 'пляшка'], ['notebook', 'блокнот']];
const OLDER = {
  'en>uk': OLDER_EN_UK,
  'en-GB>uk': OLDER_EN_UK,
  'es>en': [['la silla', 'chair'], ['la lámpara', 'lamp'], ['la almohada', 'pillow'], ['el tenedor', 'fork'], ['la cuchara', 'spoon'], ['el plato', 'plate'], ['la llave', 'key'], ['la cartera', 'wallet'], ['la vela', 'candle'], ['la toalla', 'towel'], ['el espejo', 'mirror'], ['la cobija', 'blanket'], ['la botella', 'bottle'], ['el cuaderno', 'notebook']],
  'en>es': [['chair', 'silla'], ['lamp', 'lámpara'], ['pillow', 'almohada'], ['fork', 'tenedor'], ['spoon', 'cuchara'], ['plate', 'plato'], ['key', 'llave'], ['wallet', 'cartera'], ['candle', 'vela'], ['towel', 'toalla'], ['mirror', 'espejo'], ['blanket', 'cobija'], ['bottle', 'botella'], ['notebook', 'cuaderno']],
};
export const olderWords = (loc) => OLDER[SET[loc]].map(([word, translation]) => ({ word, translation }));
