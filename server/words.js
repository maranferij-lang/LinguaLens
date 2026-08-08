// Курований список слів для «Слова дня».
// Це базові англійські концепти — сервер перекладає їх мовою, яку вчить юзер.
// Порядок для кожного користувача СВІЙ (залежить від його seed), тож слова
// не повторюються, поки не пройде весь список (300+ днів).

const crypto = require('crypto');

const WORDS = [
  // побут і дім
  'window', 'mirror', 'pillow', 'blanket', 'curtain', 'drawer', 'shelf', 'ceiling', 'staircase', 'doorbell',
  'kettle', 'spoon', 'napkin', 'bucket', 'broom', 'towel', 'candle', 'lamp', 'carpet', 'basket',
  'wallet', 'keychain', 'umbrella', 'backpack', 'suitcase', 'ladder', 'toolbox', 'hammer', 'needle', 'rope',
  // їжа
  'breakfast', 'dessert', 'pepper', 'garlic', 'honey', 'flour', 'butter', 'cucumber', 'pumpkin', 'cherry',
  'walnut', 'seafood', 'noodles', 'dough', 'vinegar', 'pear', 'plum', 'grape', 'lettuce', 'yogurt',
  // природа
  'thunder', 'rainbow', 'breeze', 'puddle', 'fog', 'frost', 'sunrise', 'sunset', 'shadow', 'wave',
  'pebble', 'branch', 'root', 'seed', 'blossom', 'meadow', 'valley', 'cliff', 'stream', 'desert',
  'glacier', 'volcano', 'island', 'forest', 'swamp', 'cave', 'hill', 'shore', 'harbor', 'horizon',
  // тварини
  'squirrel', 'hedgehog', 'owl', 'sparrow', 'dolphin', 'turtle', 'butterfly', 'ant', 'bee', 'spider',
  'fox', 'wolf', 'deer', 'rabbit', 'frog', 'snail', 'whale', 'penguin', 'eagle', 'crab',
  // місто і транспорт
  'bridge', 'tunnel', 'sidewalk', 'crosswalk', 'traffic', 'subway', 'ferry', 'helicopter', 'bicycle', 'scooter',
  'parking', 'fountain', 'statue', 'market', 'bakery', 'pharmacy', 'library', 'museum', 'stadium', 'playground',
  'lighthouse', 'castle', 'chimney', 'balcony', 'fence', 'gate', 'roof', 'wall', 'floor', 'corner',
  // люди й тіло
  'shoulder', 'elbow', 'wrist', 'ankle', 'thumb', 'eyebrow', 'eyelash', 'cheek', 'chin', 'forehead',
  'neighbor', 'stranger', 'guest', 'crowd', 'twin', 'grandparent', 'colleague', 'teammate', 'audience', 'volunteer',
  // емоції та стани
  'courage', 'patience', 'curiosity', 'kindness', 'loneliness', 'surprise', 'relief', 'pride', 'envy', 'gratitude',
  'confidence', 'doubt', 'hope', 'regret', 'excitement', 'boredom', 'calmness', 'anger', 'joy', 'fear',
  // дії
  'whisper', 'shout', 'giggle', 'sigh', 'yawn', 'blink', 'stretch', 'lean', 'crawl', 'climb',
  'squeeze', 'stir', 'pour', 'fold', 'wrap', 'tie', 'sweep', 'polish', 'measure', 'carve',
  'wander', 'chase', 'hide', 'search', 'gather', 'share', 'borrow', 'lend', 'repair', 'build',
  // абстрактне
  'memory', 'dream', 'habit', 'promise', 'secret', 'mistake', 'chance', 'choice', 'reason', 'purpose',
  'silence', 'rhythm', 'balance', 'freedom', 'journey', 'adventure', 'tradition', 'legend', 'mystery', 'wisdom',
  // час
  'dawn', 'noon', 'midnight', 'weekend', 'holiday', 'anniversary', 'century', 'decade', 'moment', 'deadline',
  'schedule', 'delay', 'pause', 'routine', 'season', 'spring', 'autumn', 'winter', 'summer', 'birthday',
  // одяг
  'sleeve', 'collar', 'button', 'zipper', 'pocket', 'scarf', 'glove', 'sock', 'boot', 'sandal',
  'jacket', 'sweater', 'skirt', 'belt', 'hat', 'ribbon', 'apron', 'uniform', 'costume', 'jewelry',
  // навчання і робота
  'notebook', 'eraser', 'ruler', 'chalk', 'homework', 'lesson', 'exam', 'diploma', 'lecture', 'research',
  'meeting', 'salary', 'contract', 'invoice', 'client', 'project', 'goal', 'skill', 'effort', 'reward',
  // технології
  'screen', 'keyboard', 'charger', 'battery', 'speaker', 'headphones', 'printer', 'password', 'folder', 'download',
  // спорт і дозвілля
  'referee', 'trophy', 'goalkeeper', 'racket', 'helmet', 'sail', 'tent', 'campfire', 'fishing', 'puzzle',
  // погода й матеріали
  'drizzle', 'hail', 'humidity', 'lightning', 'blizzard', 'leather', 'silk', 'wool', 'marble', 'clay',
  'copper', 'steel', 'glass', 'plastic', 'cardboard', 'concrete', 'rubber', 'velvet', 'ceramic', 'bronze',
];

// Детермінований генератор псевдовипадкових чисел (mulberry32)
function rng(seedStr) {
  let h = 0;
  const s = crypto.createHash('sha256').update(String(seedStr)).digest();
  h = s.readUInt32LE(0);
  return function () {
    h |= 0;
    h = (h + 0x6d2b79f5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Унікальний для юзера порядок слів (перемішування Fisher-Yates із його seed)
function shuffledFor(seed) {
  const a = [...WORDS];
  const rand = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Номер дня від епохи (UTC) — однаковий для всіх пристроїв юзера
function dayIndex(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// Слово для конкретного дня. Без повторів, поки не вичерпається список.
function wordForDay(seed, dayOffset = 0) {
  const list = shuffledFor(seed);
  const idx = (dayIndex() + dayOffset) % list.length;
  return list[idx < 0 ? idx + list.length : idx];
}

function dateKey(dayOffset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return (
    d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  );
}

module.exports = { WORDS, wordForDay, dayIndex, dateKey, shuffledFor };
