// Що саме сервер просить у моделі: окремий процес із PROVIDER=anthropic і
// підробленим fetch — справжній ключ і мережа не потрібні.
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const fs = require('fs');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lingualens-ai-'));
Object.assign(process.env, {
  PROVIDER: 'anthropic',
  ANTHROPIC_API_KEY: 'sk-ant-test',
  DATA_FILE: path.join(dir, 'data.json'),
});
after(() => fs.rmSync(dir, { recursive: true, force: true }));

const realFetch = global.fetch;
const requests = [];
let reply = '{"word":"mug"}';
global.fetch = async (url, opts) => {
  if (String(url) !== 'https://api.anthropic.com/v1/messages') return realFetch(url, opts);
  requests.push({ body: JSON.parse(opts.body), signal: opts.signal });
  return new Response(JSON.stringify({ content: [{ type: 'text', text: reply }] }), { status: 200 });
};
after(() => {
  global.fetch = realFetch;
});

const ai = require('../ai');

test('a scene asks Anthropic for a long answer; a single scan keeps the short limit', async () => {
  reply = '```json\n{"objects":[{"word":"mug","box":[1,2,300,400]}]}\n```';
  const scene = await ai.recognizeScene('BASE64', 'de', 'uk');
  assert.deepEqual(scene, { objects: [{ word: 'mug', box: [1, 2, 300, 400] }] });
  const sent = requests.at(-1).body;
  assert.equal(sent.max_tokens, 3500);
  const [image, text] = sent.messages[0].content;
  assert.deepEqual(image, { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: 'BASE64' } });
  assert.equal(text.text, ai.buildScenePrompt('de', 'uk'));

  reply = '{"word":"mug"}';
  await ai.recognize('BASE64', 'en', 'uk');
  assert.equal(requests.at(-1).body.max_tokens, 600);
});

test('the scene prompt carries the selection rules', () => {
  const p = ai.buildScenePrompt('de', 'uk');
  for (const rule of [
    'up to 8 distinct',
    'German',
    'Ukrainian',
    'Include the definite article, e.g. "die Tasse"',
    'one entry per kind',
    'Order the list by prominence',
    'Never include people, faces, body parts, clothing worn by a person, text, signs, logos or brand names',
    'smaller than about 2% of the image',
    'wall, floor, ceiling',
    '12 to 24 points',
    'clockwise',
    'WHOLE image',
    '{"objects":[]}',
  ]) {
    assert.ok(p.includes(rule), rule);
  }
});

test('cleanScene: unreadable vs empty vs objects', () => {
  assert.equal(ai.cleanScene(null), null);
  assert.equal(ai.cleanScene('text'), null);
  assert.equal(ai.cleanScene({ objects: 'x' }), null);
  assert.equal(ai.cleanScene({ word: 'mug' }), null);
  assert.deepEqual(ai.cleanScene({ word: 'Unknown' }), []);
  assert.deepEqual(ai.cleanScene({ objects: [] }), []);
  // голий масив замість {"objects": …} — теж відповідь
  const bare = ai.cleanScene([{ word: 'mug', box: [0, 0, 500, 500], outline: [[1, 2]] }]);
  assert.deepEqual(bare, [
    { word: 'mug', ipa: '', translation: '', example: '', example_translation: '', box: [0, 0, 500, 500], outline: null },
  ]);
});

test('cleanScene keeps the model order, merges case-insensitive duplicates and caps at 8', () => {
  const box = (n) => [0, 0, 100 + n, 100 + n];
  const list = [
    { word: 'Book', box: box(0) },
    { word: 'lamp', box: box(50) },
    { word: 'book', box: box(10), translation: 'книжка' },
    { word: 'BOOK', box: box(5) },
    ...Array.from({ length: 12 }, (_, i) => ({ word: 'item' + i, box: box(i) })),
  ];
  const out = ai.cleanScene({ objects: list });
  assert.equal(out.length, ai.MAX_SCENE_OBJECTS);
  assert.deepEqual(out.slice(0, 3).map((o) => o.word), ['book', 'lamp', 'item0']);
  assert.equal(out[0].translation, 'книжка');
});

test('box and outline cleaning matches the single scan rules', () => {
  assert.equal(ai.cleanBox([0, 0, 40, 500]), null); // не вище за 4%
  assert.equal(ai.cleanBox([0, 0, 500]), null);
  assert.deepEqual(ai.cleanBox(['1', 2.4, 999.6, 5000]), [1, 2, 1000, 1000]);
  assert.equal(ai.cleanOutline(Array(5).fill([1, 1])), null);
  assert.equal(ai.cleanOutline(Array(41).fill([1, 1])), null);
  // точки з неправильною формою відкидаються; лишилось < 6 — контуру немає
  assert.equal(ai.cleanOutline([[1, 1], [2, 2], [3], 'x', [4, 4], [5, 5], [6, 6]]), null);
  assert.deepEqual(ai.cleanOutline(Array.from({ length: 6 }, (_, i) => [i, -i])), Array.from({ length: 6 }, (_, i) => [i, 0]));
});
