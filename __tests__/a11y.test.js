// VoiceOver: вкладені кнопки не зливаються з карткою, а розгортання має
// власну ціль. Доступний предок робить нащадків невидимими для VoiceOver,
// тож перевіряємо саме ланцюжок предків.
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DictionaryScreen from '../src/DictionaryScreen';
import WordOfDayCard from '../src/WordOfDayCard';
import { makeT } from '../src/i18n';

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

async function render(element) {
  let tree;
  await act(async () => {
    tree = create(element);
  });
  return tree;
}

// Нативний елемент (View, Text…), що для VoiceOver один цілий об'єкт.
const isAccessibleHost = (n) => typeof n.type === 'string' && n.props.accessible === true;
function hiddenInsideAccessible(node) {
  for (let p = node.parent; p; p = p.parent) if (isAccessibleHost(p)) return true;
  return false;
}
// Найближчий нативний доступний елемент із цим підписом або текстом.
function control(tree, text) {
  const hit = tree.root.find(
    (n) => isAccessibleHost(n) && (n.props.accessibilityLabel === text || n.findAll((c) => c.props.children === text).length)
  );
  return hit;
}
function toggleTarget(tree) {
  return tree.root.find((n) => isAccessibleHost(n) && n.props.accessibilityState?.expanded !== undefined);
}

test('dictionary row: Listen, Share and Delete are reachable, the word expands the row', async () => {
  const words = [{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: 1 }];
  const tree = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DictionaryScreen words={words} onDelete={() => {}} onShare={() => {}} t={t} />
    </SafeAreaProvider>
  );

  expect(hiddenInsideAccessible(control(tree, t('listen')))).toBe(false);
  const row = toggleTarget(tree);
  expect(row.props.accessibilityRole).toBe('button');
  expect(row.props.accessibilityState.expanded).toBe(false);

  await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(toggleTarget(tree).props.accessibilityState.expanded).toBe(true);
  for (const label of [t('share'), t('delete')]) expect(hiddenInsideAccessible(control(tree, label))).toBe(false);
  await act(async () => tree.unmount());
});

test('word of the day: Listen and Save are separate from the card', async () => {
  const onSave = jest.fn();
  const word = { word: 'la manzana', translation: 'apple', example: 'Una manzana roja.', example_translation: 'A red apple.' };
  const tree = await render(<WordOfDayCard word={word} lang="es" saved={false} onSave={onSave} t={t} />);

  const row = toggleTarget(tree);
  await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  expect(toggleTarget(tree).props.accessibilityState.expanded).toBe(true);

  const save = control(tree, t('saveWord'));
  expect(hiddenInsideAccessible(save)).toBe(false);
  expect(hiddenInsideAccessible(control(tree, t('listen')))).toBe(false);
  await act(async () => tree.unmount());
});

test('backup nudge: the card and its close button are separate, labelled targets', async () => {
  const words = Array.from({ length: 12 }, (_, i) => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang: 'es', addedAt: i }));
  const onNudge = jest.fn();
  const onDismissNudge = jest.fn();
  const tree = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DictionaryScreen words={words} onDelete={() => {}} nudge onNudge={onNudge} onDismissNudge={onDismissNudge} t={t} />
    </SafeAreaProvider>
  );
  const open = control(tree, t('syncNudge', { n: 12 }));
  const hide = control(tree, t('syncNudgeHide'));
  expect(open.props.accessibilityRole).toBe('button');
  expect(hide.props.accessibilityRole).toBe('button');
  expect(hiddenInsideAccessible(open)).toBe(false);
  expect(hiddenInsideAccessible(hide)).toBe(false);

  await act(async () => open.props.onClick());
  await act(async () => hide.props.onClick());
  expect(onNudge).toHaveBeenCalledTimes(1);
  expect(onDismissNudge).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());

  // без nudge картки немає зовсім
  const plain = await render(
    <SafeAreaProvider initialMetrics={metrics}>
      <DictionaryScreen words={words} onDelete={() => {}} t={t} />
    </SafeAreaProvider>
  );
  expect(plain.root.findAll((n) => n.props.accessibilityLabel === t('syncNudgeHide'))).toHaveLength(0);
  await act(async () => plain.unmount());
});
