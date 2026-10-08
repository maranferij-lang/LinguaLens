// Демо-дані для кожної локалі App Store (BRIEF §2.10): мова інтерфейсу —
// мова телефона (застосунок іде за нею), слова на наліпках — мовою, яку
// вчать, переклади — «моєю мовою» з налаштувань:
//   uk     інтерфейс uk, вчить англійську США, переклади uk
//   en-US  інтерфейс en, вчить іспанську Латинської Америки (з артиклями:
//          la taza), переклади американською англійською
//   en-GB  інтерфейс en, вчить англійську Британії, переклади uk — так
//          застосунок бачить українець з англійським телефоном
//   es-MX  інтерфейс es, вчить англійську США, переклади мексиканською
//          іспанською (audífonos, tenis, lentes)
// Слова, IPA й переклади — такі, які повертає сервер для цих предметів.
// Перед поданням їх можна замінити справжніми сканами власника (BRIEF §9).
//
// Варіант мови (src/langVariants.js) — той, який застосунок дав би людині
// на цій сторінці: від нього прапорець, голос і те, як сервер пише слово
// (VARIETIES у server/ai.js: правопис, словник, IPA). Англійська й в
// Україні, і в Мексиці — американська за замовчуванням (🇺🇸, General
// American: sneaker, /ˈhaʊsplænt/). Іспанська в США — латиноамериканська
// за замовчуванням (🇲🇽, голос es-MX, сесео: /la ˈtasa/, audífonos, tenis,
// lentes). Британську англійську (🇬🇧, RP: /ˈhaʊsplɑːnt/, trainer,
// chopping board) людина в Британії обирає сама: за замовчуванням і там
// американська, тож засів кладе вибір у settings.variants, як зробив би
// список мов. IPA іспанських слів — з артиклем, як у сервера: «/la ˈtasa/».
export const STORE_LOCALES = ['uk', 'en-US', 'en-GB', 'es-MX'];

// ui — мова інтерфейсу (phone language), learn — мова навчання й variant —
// її варіант, flag — його прапорець у застосунку (VARIANTS у
// src/langVariants.js); native — мова перекладів, nativeVariant — її
// варіант з регіону телефона (nativeVariantOf; немає — у мови варіантів
// немає); browser — мова, яку бачить веб-збірка (і регіон телефона);
// date — локаль дат, які малює компонувальник (екран блокування).
// Перший день тижня — не тут, а з регіону локалі (firstWeekdayFor нижче).
export const LOCALES = {
  uk: { ui: 'uk', learn: 'en', variant: 'us', flag: '🇺🇸', native: 'uk', nativeVariant: null, name: 'Марко', browser: 'uk-UA', date: 'uk-UA' },
  'en-US': { ui: 'en', learn: 'es', variant: 'latam', flag: '🇲🇽', native: 'en', nativeVariant: 'us', name: 'Mark', browser: 'en-US', date: 'en-US' },
  'en-GB': { ui: 'en', learn: 'en', variant: 'gb', flag: '🇬🇧', native: 'uk', nativeVariant: null, name: 'Marko', browser: 'en-GB', date: 'en-GB' },
  'es-MX': { ui: 'es', learn: 'en', variant: 'us', flag: '🇺🇸', native: 'es', nativeVariant: 'latam', name: 'Marco', browser: 'es-MX', date: 'es-MX' },
};

// settings.variants засіву: варіант мови навчання, обраний явно (так його
// зберігає список мов, навіть коли він за замовчуванням).
export const variantsFor = (loc) => ({ [LOCALES[loc].learn]: LOCALES[loc].variant });

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

// Набір слів: «мова навчання-варіант > мова перекладу».
const SET = { uk: 'en-us>uk', 'en-US': 'es-latam>en', 'en-GB': 'en-gb>uk', 'es-MX': 'en-us>es' };

// Англійська США (General American, голос en-US): key → [word, ipa]
const EN_US = {
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
// Англійська Британії (RP, голос en-GB): британські слова там, де вони
// інші (trainer, rucksack, chopping board, tea towel), без «r» після
// голосної, əʊ у window, ɒ у clock, ɑː у plant, glasses, banana.
const EN_GB = {
  mug: ['mug', '/mʌɡ/'],
  plant: ['houseplant', '/ˈhaʊsplɑːnt/'],
  apple: ['apple', '/ˈæpl/'],
  headphones: ['headphones', '/ˈhedfəʊnz/'],
  sneaker: ['trainer', '/ˈtreɪnə/'],
  lemon: ['lemon', '/ˈlemən/'],
  camera: ['camera', '/ˈkæmərə/'],
  backpack: ['rucksack', '/ˈrʌksæk/'],
  umbrella: ['umbrella', '/ʌmˈbrelə/'],
  clock: ['alarm clock', '/əˈlɑːm klɒk/'],
  book: ['book', '/bʊk/'],
  cactus: ['cactus', '/ˈkæktəs/'],
  glasses: ['glasses', '/ˈɡlɑːsɪz/'],
  kettle: ['kettle', '/ˈketl/'],
  banana: ['banana', '/bəˈnɑːnə/'],
  scissors: ['scissors', '/ˈsɪzəz/'],
  window: ['window', '/ˈwɪndəʊ/'],
  pan: ['frying pan', '/ˈfraɪɪŋ pæn/'],
  jar: ['jar', '/dʒɑː/'],
  board: ['chopping board', '/ˈtʃɒpɪŋ bɔːd/'],
  towel: ['tea towel', '/ˈtiː taʊəl/'],
};
const withTranslations = (en, tr) => Object.fromEntries(Object.entries(en).map(([k, [w, ipa]]) => [k, [w, ipa, tr[k]]]));
const EN_UK = {
  mug: 'кружка', plant: 'кімнатна рослина', apple: 'яблуко', headphones: 'навушники', sneaker: 'кросівок', lemon: 'лимон',
  camera: 'фотоапарат', backpack: 'рюкзак', umbrella: 'парасолька', clock: 'будильник', book: 'книжка', cactus: 'кактус',
  glasses: 'окуляри', kettle: 'чайник', banana: 'банан', scissors: 'ножиці',
  window: 'вікно', pan: 'сковорідка', jar: 'банка', board: 'обробна дошка', towel: 'кухонний рушник',
};

// key → [word, ipa, translation]
const VOCAB = {
  'en-us>uk': withTranslations(EN_US, EN_UK),
  'en-gb>uk': withTranslations(EN_GB, EN_UK),
  // переклади мексиканською іспанською (nativeVariant 'latam' телефона в Мексиці)
  'en-us>es': withTranslations(EN_US, {
    mug: 'taza', plant: 'planta de interior', apple: 'manzana', headphones: 'audífonos', sneaker: 'tenis', lemon: 'limón',
    camera: 'cámara', backpack: 'mochila', umbrella: 'paraguas', clock: 'despertador', book: 'libro', cactus: 'cactus',
    glasses: 'lentes', kettle: 'tetera', banana: 'plátano', scissors: 'tijeras',
    window: 'ventana', pan: 'sartén', jar: 'frasco', board: 'tabla de picar', towel: 'trapo de cocina',
  }),
  // іспанська Латинської Америки (голос es-MX): сесео (z і c перед e/i —
  // /s/), мексиканські й нейтральні слова: los audífonos, los tenis, los
  // lentes, la tabla de picar; жовтий лимон — «el limón amarillo» («el
  // limón» у Мексиці — зелений лайм). IPA вузька, як у сервера (/el ˈliβɾo/):
  // b, d, g після голосної, і через межу слова, — β, ð, ɣ (/la βenˈtana/).
  // Переклади американською англійською.
  'es-latam>en': {
    mug: ['la taza', '/la ˈtasa/', 'mug'],
    plant: ['la planta', '/la ˈplanta/', 'houseplant'],
    apple: ['la manzana', '/la manˈsana/', 'apple'],
    headphones: ['los audífonos', '/los awˈðifonos/', 'headphones'],
    sneaker: ['los tenis', '/los ˈtenis/', 'sneakers'],
    lemon: ['el limón amarillo', '/el liˈmon amaˈɾiʝo/', 'lemon'],
    camera: ['la cámara', '/la ˈkamaɾa/', 'camera'],
    backpack: ['la mochila', '/la moˈtʃila/', 'backpack'],
    umbrella: ['el paraguas', '/el paˈɾaɣwas/', 'umbrella'],
    clock: ['el despertador', '/el despeɾtaˈðoɾ/', 'alarm clock'],
    book: ['el libro', '/el ˈliβɾo/', 'book'],
    cactus: ['el cactus', '/el ˈkaktus/', 'cactus'],
    glasses: ['los lentes', '/los ˈlentes/', 'glasses'],
    kettle: ['la tetera', '/la teˈteɾa/', 'kettle'],
    banana: ['el plátano', '/el ˈplatano/', 'banana'],
    scissors: ['las tijeras', '/las tiˈxeɾas/', 'scissors'],
    window: ['la ventana', '/la βenˈtana/', 'window'],
    pan: ['la sartén', '/la saɾˈten/', 'frying pan'],
    jar: ['el frasco', '/el ˈfɾasko/', 'jar'],
    board: ['la tabla de picar', '/la ˈtaβla ðe piˈkaɾ/', 'cutting board'],
    towel: ['el trapo de cocina', '/el ˈtɾapo ðe koˈsina/', 'dish towel'],
  },
};

// Приклади (аркуш результату, звороти карток) для головних слів. Англійські
// речення однакові для США й Британії.
const EN_UK_EXAMPLES = {
  mug: ['I drink my morning coffee from this red mug.', 'Я пʼю ранкову каву з цієї червоної кружки.'],
  plant: ['Water the houseplant once a week.', 'Поливай кімнатну рослину раз на тиждень.'],
  umbrella: ['Take an umbrella, it’s going to rain.', 'Візьми парасольку, буде дощ.'],
};
const EXAMPLES = {
  'en-us>uk': EN_UK_EXAMPLES,
  'en-gb>uk': EN_UK_EXAMPLES,
  'es-latam>en': {
    mug: ['Tomo café en mi taza roja cada mañana.', 'I drink coffee from my red mug every morning.'],
    plant: ['Riego la planta una vez a la semana.', 'I water the plant once a week.'],
    umbrella: ['Llévate el paraguas, va a llover.', 'Take the umbrella, it’s going to rain.'],
  },
  'en-us>es': {
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
// en-US — «la resiliencia», те саме слово, що resilient на інших сторінках,
// і з сесео (/resiˈljensja/), а не «la ventisca»: хуртовина мексиканцю ні
// до чого. deployment і resilient у RP звучать так само, як у США, тож
// en-GB бере ту саму IPA.
const RESILIENT = { word: 'resilient', ipa: '/rɪˈzɪliənt/', example: 'Kids are more resilient than we think.', topic: 'general' };
export const WIDGET_WOD = {
  uk: { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'en-US': { word: 'la resiliencia', ipa: '/la resiˈljensja/', translation: 'resilience', example: 'La resiliencia se construye día a día.', example_translation: 'Resilience is built day by day.', topic: 'general' },
  'en-GB': { ...RESILIENT, translation: 'стійкий', example_translation: 'Діти стійкіші, ніж ми думаємо.' },
  'es-MX': { ...RESILIENT, translation: 'resiliente', example_translation: 'Los niños son más resilientes de lo que creemos.' },
};

// Старіші слова без наліпки — лише для профілю: разом 30 слів («етап 4 ·
// 30 із 48»), і 30 — число, з яким узгоджується фіксований uk-підпис
// «слів усього». Іспанська Латинської Америки: «la cobija», не «la manta».
const OLDER_EN_UK = [['chair', 'стілець'], ['lamp', 'лампа'], ['pillow', 'подушка'], ['fork', 'виделка'], ['spoon', 'ложка'], ['plate', 'тарілка'], ['key', 'ключ'], ['wallet', 'гаманець'], ['candle', 'свічка'], ['towel', 'рушник'], ['mirror', 'дзеркало'], ['blanket', 'ковдра'], ['bottle', 'пляшка'], ['notebook', 'блокнот']];
const OLDER = {
  'en-us>uk': OLDER_EN_UK,
  'en-gb>uk': OLDER_EN_UK,
  'es-latam>en': [['la silla', 'chair'], ['la lámpara', 'lamp'], ['la almohada', 'pillow'], ['el tenedor', 'fork'], ['la cuchara', 'spoon'], ['el plato', 'plate'], ['la llave', 'key'], ['la cartera', 'wallet'], ['la vela', 'candle'], ['la toalla', 'towel'], ['el espejo', 'mirror'], ['la cobija', 'blanket'], ['la botella', 'bottle'], ['el cuaderno', 'notebook']],
  'en-us>es': [['chair', 'silla'], ['lamp', 'lámpara'], ['pillow', 'almohada'], ['fork', 'tenedor'], ['spoon', 'cuchara'], ['plate', 'plato'], ['key', 'llave'], ['wallet', 'cartera'], ['candle', 'vela'], ['towel', 'toalla'], ['mirror', 'espejo'], ['blanket', 'cobija'], ['bottle', 'botella'], ['notebook', 'cuaderno']],
};
export const olderWords = (loc) => OLDER[SET[loc]].map(([word, translation]) => ({ word, translation }));
