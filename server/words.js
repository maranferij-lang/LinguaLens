// A curated word list for the "Word of the Day".
// These are basic English concepts: the server translates them into the language the user is learning.
// The order is UNIQUE for each user (it depends on their seed), so words
// do not repeat until the whole list is used up (300+ days).

const crypto = require('crypto');

const WORDS = [
  // household and home
  'window', 'mirror', 'pillow', 'blanket', 'curtain', 'drawer', 'shelf', 'ceiling', 'staircase', 'doorbell',
  'kettle', 'spoon', 'napkin', 'bucket', 'broom', 'towel', 'candle', 'lamp', 'carpet', 'basket',
  'wallet', 'keychain', 'umbrella', 'backpack', 'suitcase', 'ladder', 'toolbox', 'hammer', 'needle', 'rope',
  // food
  'breakfast', 'dessert', 'pepper', 'garlic', 'honey', 'flour', 'butter', 'cucumber', 'pumpkin', 'cherry',
  'walnut', 'seafood', 'noodles', 'dough', 'vinegar', 'pear', 'plum', 'grape', 'lettuce', 'yogurt',
  // nature
  'thunder', 'rainbow', 'breeze', 'puddle', 'fog', 'frost', 'sunrise', 'sunset', 'shadow', 'wave',
  'pebble', 'branch', 'root', 'seed', 'blossom', 'meadow', 'valley', 'cliff', 'stream', 'desert',
  'glacier', 'volcano', 'island', 'forest', 'swamp', 'cave', 'hill', 'shore', 'harbor', 'horizon',
  // animals
  'squirrel', 'hedgehog', 'owl', 'sparrow', 'dolphin', 'turtle', 'butterfly', 'ant', 'bee', 'spider',
  'fox', 'wolf', 'deer', 'rabbit', 'frog', 'snail', 'whale', 'penguin', 'eagle', 'crab',
  // city and transport
  'bridge', 'tunnel', 'sidewalk', 'crosswalk', 'traffic', 'subway', 'ferry', 'helicopter', 'bicycle', 'scooter',
  'parking', 'fountain', 'statue', 'market', 'bakery', 'pharmacy', 'library', 'museum', 'stadium', 'playground',
  'lighthouse', 'castle', 'chimney', 'balcony', 'fence', 'gate', 'roof', 'wall', 'floor', 'corner',
  // people and body
  'shoulder', 'elbow', 'wrist', 'ankle', 'thumb', 'eyebrow', 'eyelash', 'cheek', 'chin', 'forehead',
  'neighbor', 'stranger', 'guest', 'crowd', 'twin', 'grandparent', 'colleague', 'teammate', 'audience', 'volunteer',
  // emotions and states
  'courage', 'patience', 'curiosity', 'kindness', 'loneliness', 'surprise', 'relief', 'pride', 'envy', 'gratitude',
  'confidence', 'doubt', 'hope', 'regret', 'excitement', 'boredom', 'calmness', 'anger', 'joy', 'fear',
  // actions
  'whisper', 'shout', 'giggle', 'sigh', 'yawn', 'blink', 'stretch', 'lean', 'crawl', 'climb',
  'squeeze', 'stir', 'pour', 'fold', 'wrap', 'tie', 'sweep', 'polish', 'measure', 'carve',
  'wander', 'chase', 'hide', 'search', 'gather', 'share', 'borrow', 'lend', 'repair', 'build',
  // abstract
  'memory', 'dream', 'habit', 'promise', 'secret', 'mistake', 'chance', 'choice', 'reason', 'purpose',
  'silence', 'rhythm', 'balance', 'freedom', 'journey', 'adventure', 'tradition', 'legend', 'mystery', 'wisdom',
  // time
  'dawn', 'noon', 'midnight', 'weekend', 'holiday', 'anniversary', 'century', 'decade', 'moment', 'deadline',
  'schedule', 'delay', 'pause', 'routine', 'season', 'spring', 'autumn', 'winter', 'summer', 'birthday',
  // clothing
  'sleeve', 'collar', 'button', 'zipper', 'pocket', 'scarf', 'glove', 'sock', 'boot', 'sandal',
  'jacket', 'sweater', 'skirt', 'belt', 'hat', 'ribbon', 'apron', 'uniform', 'costume', 'jewelry',
  // learning and work
  'notebook', 'eraser', 'ruler', 'chalk', 'homework', 'lesson', 'exam', 'diploma', 'lecture', 'research',
  'meeting', 'salary', 'contract', 'invoice', 'client', 'project', 'goal', 'skill', 'effort', 'reward',
  // technology
  'screen', 'keyboard', 'charger', 'battery', 'speaker', 'headphones', 'printer', 'password', 'folder', 'download',
  // sports and leisure
  'referee', 'trophy', 'goalkeeper', 'racket', 'helmet', 'sail', 'tent', 'campfire', 'fishing', 'puzzle',
  // weather and materials
  'drizzle', 'hail', 'humidity', 'lightning', 'blizzard', 'leather', 'silk', 'wool', 'marble', 'clay',
  'copper', 'steel', 'glass', 'plastic', 'cardboard', 'concrete', 'rubber', 'velvet', 'ceramic', 'bronze',
];

// Deterministic pseudo-random number generator (mulberry32)
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

// A per-user word order (Fisher-Yates shuffle from their seed)
function shuffledFor(seed) {
  const a = [...WORDS];
  const rand = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Day number since the epoch (UTC): the same for all of the user's devices
function dayIndex(date = new Date()) {
  return Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000);
}

// The word for a specific day. No repeats until the list runs out.
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
