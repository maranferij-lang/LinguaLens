// «Відкрити слово» (план S6): наліпка останнього слова в сканері й віджети
// (lingualens://word/<id>) ведуть у «Слова» з аркушем саме цього слова.
// Аркуш відкривається один раз на запит; видаленого слова вже немає — тоді
// просто вкладка, без порожнього аркуша.
import fs from 'fs';
import path from 'path';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import DictionaryScreen from '../src/DictionaryScreen';
import WordSheet from '../src/WordSheet';
import { makeT } from '../src/i18n';

const t = makeT('uk');
const WORDS = [
  { id: 'a', word: 'die Tasse', translation: 'чашка', lang: 'de', addedAt: 3 },
  { id: 'b', word: 'apple', translation: 'яблуко', lang: 'en', addedAt: 5 },
];

const METRICS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };
const screen = (props) => (
  <SafeAreaProvider initialMetrics={METRICS}>
    <DictionaryScreen words={WORDS} onDelete={() => {}} t={t} {...props} />
  </SafeAreaProvider>
);

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(screen(props));
  });
  return tree;
}
const sheetItem = (tree) => tree.root.findByType(WordSheet).props.item;

test('openWordId opens that word’s sheet once and reports it done', async () => {
  const done = jest.fn();
  const tree = await render({ openWordId: 'b', onOpenWordDone: done });
  expect(sheetItem(tree)?.id).toBe('b');
  expect(done).toHaveBeenCalledTimes(1);
  // людина закрила аркуш — той самий проп його не відкриває знову
  await act(async () => tree.root.findByType(WordSheet).props.onClose());
  await act(async () => tree.update(screen({ words: [...WORDS], openWordId: 'b', onOpenWordDone: done })));
  expect(sheetItem(tree)).toBeNull();
  expect(done).toHaveBeenCalledTimes(1);
  // новий запит (App скинув id і попросив знову) — відкриває
  await act(async () => tree.update(screen({ openWordId: null, onOpenWordDone: done })));
  await act(async () => tree.update(screen({ openWordId: 'b', onOpenWordDone: done })));
  expect(sheetItem(tree)?.id).toBe('b');
  expect(done).toHaveBeenCalledTimes(2);
  await act(async () => tree.unmount());
});

test('a deleted word opens nothing — just the tab', async () => {
  const done = jest.fn();
  const tree = await render({ openWordId: 'gone', onOpenWordDone: done });
  expect(sheetItem(tree)).toBeNull();
  expect(done).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('without a request nothing opens', async () => {
  const tree = await render({});
  expect(sheetItem(tree)).toBeNull();
  await act(async () => tree.unmount());
});

// App: openWord(id) веде на вкладку «Слова» і передає id словнику; той
// скидає запит через onOpenWordDone.
test('App wires openWord to the dictionary', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  expect(src).toMatch(/function openWord\(id\) \{[\s\S]*?setTab\('dict'\)[\s\S]*?setOpenWordId\(/);
  expect(src).toMatch(/openWordId=\{openWordId\}/);
  expect(src).toMatch(/onOpenWordDone=\{\(\) => setOpenWordId\(null\)\}/);
});
