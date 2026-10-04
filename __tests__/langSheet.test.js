// Аркуш вибору мови (src/LangSheet.js). Старий виклик — як його робить чип
// мови в сканері (visible, current, native, onPick, onClose, t) — працює як
// раніше: обрати мову навчання, мова перекладу вибору не дає, хрестик і тап
// повз аркуш закривають. Нове, необов’язкове: пошук, «Популярні», вибір мови
// перекладу (mode 'native') з підписом «з телефона».
import { act, create } from 'react-test-renderer';
import LangSheet, { LangList, langOptions } from '../src/LangSheet';
import { LANGS } from '../src/speech';
import { makeT } from '../src/i18n';

const t = makeT('en');
const uk = makeT('uk');

async function render(el) {
  let tree;
  await act(async () => {
    tree = create(el);
  });
  return tree;
}
const rows = (tree) =>
  tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'radio' && /^lang-/.test(n.props.testID || ''));
const row = (tree, code) => tree.root.findAll((n) => n.props.testID === 'lang-' + code && n.props.accessibilityState)[0];
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

test('the old call still works: the title, every language, the current one ticked, the translation language not pickable', async () => {
  const onPick = jest.fn();
  const onClose = jest.fn();
  const tree = await render(<LangSheet visible current="es" native="en" onPick={onPick} onClose={onClose} t={t} />);
  expect(texts(tree)).toContain(t('obLangSheetTitle'));
  // кожна мова один раз (популярні не дублюються в «Усіх»)
  const codes = rows(tree).map((r) => r.props.testID.slice(5));
  expect(new Set(codes).size).toBe(LANGS.length);
  expect(row(tree, 'es').props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(row(tree, 'en').props.accessibilityState).toEqual({ checked: false, disabled: true });
  expect(row(tree, 'en').props.onPress).toBeUndefined();
  expect(texts(tree)).toContain(t('obLangIsNative'));
  await act(async () => row(tree, 'de').props.onPress());
  expect(onPick).toHaveBeenCalledWith('de');
  // хрестик і тап повз аркуш — закрити
  await act(async () => tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && n.props.onPress)[0].props.onPress());
  expect(onClose).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('hidden when not visible', async () => {
  const tree = await render(<LangSheet visible={false} current="es" native="en" onPick={() => {}} onClose={() => {}} t={t} />);
  expect(texts(tree)).not.toContain(t('obLangSheetTitle'));
  await act(async () => tree.unmount());
});

test('search narrows the list; a miss says so and keeps everything below', async () => {
  const tree = await render(<LangSheet visible current="es" native="en" onPick={() => {}} onClose={() => {}} t={t} ui="en" />);
  const input = tree.root.find((n) => n.props.testID === 'lang-search' && typeof n.props.onChangeText === 'function');
  await act(async () => input.props.onChangeText('fran'));
  expect(rows(tree).map((r) => r.props.testID)).toEqual(['lang-fr']);
  await act(async () => input.props.onChangeText('zzz'));
  expect(texts(tree)).toContain(t('obLangNone'));
  expect(rows(tree)).toHaveLength(LANGS.length);
  await act(async () => tree.unmount());
});

test('translation language mode: the phone’s language marked, the learnt one not pickable', async () => {
  const onPick = jest.fn();
  const tree = await render(
    <LangSheet visible mode="native" current="uk" other="en" phone="uk" onPick={onPick} onClose={() => {}} t={uk} ui="uk" />
  );
  expect(texts(tree)).toContain(uk('obNativeTitle'));
  expect(texts(tree)).toContain(uk('obNativePhone'));
  expect(rows(tree)[0].props.testID).toBe('lang-uk');
  expect(row(tree, 'en').props.accessibilityState.disabled).toBe(true);
  expect(texts(tree)).toContain(uk('obLangIsTarget'));
  await act(async () => row(tree, 'pl').props.onPress());
  expect(onPick).toHaveBeenCalledWith('pl');
  await act(async () => tree.unmount());
});

test('the inline list: popular first in the interface language, names lower case in Ukrainian', async () => {
  const tree = await render(<LangList value={null} off="uk" offNote={uk('obLangIsNative')} popularFor="uk" onPick={() => {}} t={uk} ui="uk" />);
  expect(texts(tree)).toEqual(expect.arrayContaining([uk('obLangPopular'), uk('obLangAll'), 'англійська']));
  expect(rows(tree).slice(0, 6).map((r) => r.props.testID)).toEqual(['lang-en', 'lang-de', 'lang-pl', 'lang-es', 'lang-fr', 'lang-it']);
  // нічого не обрано наперед
  expect(rows(tree).some((r) => r.props.accessibilityState.checked)).toBe(false);
  await act(async () => tree.unmount());
});

test('langOptions keeps the old order for whoever builds their own list', () => {
  const list = langOptions('fr', 'uk').map((l) => l.code);
  expect(list[0]).toBe('fr');
  expect(list).not.toContain('uk');
  expect(list).toHaveLength(LANGS.length - 1);
});
