// Generating brand assets via Gemini (nano banana / gemini-3.1-flash-image)
// Run from the project root:  node tools/gen-assets.js
// The key is taken from server/.env (GEMINI_API_KEY)
//
// Concept: the Lingo mascot is a small curious chameleon that "changes color"
// to match the language you are learning (a violet-turquoise gradient). The same character
// in all illustrations = a recognizable style for the app.

const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', 'server', '.env');
const env = {};
for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.+?)\s*$/);
  if (m) env[m[1]] = m[2];
}
const KEY = env.GEMINI_API_KEY;
if (!KEY) {
  console.error('GEMINI_API_KEY не знайдено у server/.env');
  process.exit(1);
}

const MODEL = 'gemini-3.1-flash-image';
const OUT = path.join(__dirname, '..', 'assets');

const MASCOT =
  'Lingo, a small curious chameleon mascot with big friendly eyes and a spiral tail, ' +
  'its skin shifts in a smooth aurora gradient from violet (#8B7CF8) to teal (#5EE6D0). ' +
  'Rounded, modern, minimal 3D-ish vector style with soft glow, high polish, adorable but not childish.';

const STYLE =
  'Deep near-black navy background (#07090D), soft aurora glow, glassy translucent accents, ' +
  'clean composition with generous negative space, premium mobile-app illustration, no text, no watermark.';

const ASSETS = [
  {
    file: 'icon.png',
    prompt:
      'Square iOS app icon, flat modern vector style. Logo mark: a white rounded speech bubble ' +
      'with a short tail at the bottom left, containing a bold camera lens ring in indigo, ' +
      'with a small mint-green sparkle dot at the top right of the ring. ' +
      'Background: smooth vertical gradient from #527CFF to #5E5CE6. ' +
      'Soft subtle shadow under the mark, generous margins, no text, no watermark, crisp edges.',
  },
  {
    file: 'onb-1.png',
    prompt:
      'Square onboarding illustration. ' + MASCOT +
      ' Lingo holds up a glowing phone, aiming its camera at a coffee mug; a bright viewfinder frame ' +
      'with rounded corners highlights the mug. ' + STYLE,
  },
  {
    file: 'onb-2.png',
    prompt:
      'Square onboarding illustration. ' + MASCOT +
      ' Lingo listens with delight to a floating glassy word-card with a speaker symbol and sound waves; ' +
      'abstract letter shapes float around like fireflies. ' + STYLE,
  },
  {
    file: 'onb-3.png',
    prompt:
      'Square onboarding illustration. ' + MASCOT +
      ' Lingo balances a neat stack of glowing flashcards on its tail; a small warm flame above marks a streak. ' +
      STYLE,
  },
  {
    file: 'empty-dict.png',
    prompt:
      'Square empty-state illustration. ' + MASCOT +
      ' Lingo sits on top of a big open book with softly glowing gradient pages, looking up expectantly, ' +
      'a few faint letters floating above. ' + STYLE,
  },
];

async function generate({ file, prompt }) {
  process.stdout.write('Генерую ' + file + '… ');
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1/models/' + MODEL + ':generateContent',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error('HTTP ' + res.status + ': ' + body.slice(0, 300));
  }
  const data = await res.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const img = parts.find((p) => p.inlineData || p.inline_data);
  if (!img) throw new Error('у відповіді немає зображення');
  const b64 = (img.inlineData || img.inline_data).data;
  fs.writeFileSync(path.join(OUT, file), Buffer.from(b64, 'base64'));
  console.log('✓');
}

(async () => {
  console.log('Модель: ' + MODEL + ' · маскот: хамелеон Lingo\n');
  for (const a of ASSETS) {
    try {
      await generate(a);
    } catch (e) {
      console.log('✗ ' + e.message);
      console.log('  (апка працюватиме з поточним плейсхолдером)');
    }
  }
  console.log('\nГотово. Перезапусти expo (r), щоб побачити нові асети.');
})();
