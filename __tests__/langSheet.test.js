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
const ru = makeT('ru');

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
  // кожна мова один раз (популярні не дублюються в «Усіх»); англійська й
  // іспанська — по рядку на варіант
  const codes = rows(tree).map((r) => r.props.testID.slice(5));
  expect(codes).toHaveLength(LANGS.length + 2);
  expect(new Set(codes).size).toBe(LANGS.length + 2);
  // варіант не названо — обраний зараз, тобто за замовчуванням: телефон у
  // США, тож іспанська латиноамериканська
  expect(row(tree, 'es-latam').props.accessibilityState).toEqual({ checked: true, disabled: false });
  expect(row(tree, 'es-es').props.accessibilityState).toEqual({ checked: false, disabled: false });
  // мову перекладу не обрати в жодному варіанті
  for (const v of ['en-us', 'en-gb']) {
    expect(row(tree, v).props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(row(tree, v).props.onPress).toBeUndefined();
  }
  expect(texts(tree)).toContain(t('obLangIsNative'));
  await act(async () => row(tree, 'de').props.onPress());
  expect(onPick).toHaveBeenCalledWith('de');
  // мова з варіантами — другим аргументом id варіанта
  await act(async () => row(tree, 'es-es').props.onPress());
  expect(onPick).toHaveBeenLastCalledWith('es', 'es');
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
  expect(rows(tree)).toHaveLength(LANGS.length + 2);
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
  expect(texts(tree)).toEqual(expect.arrayContaining([uk('obLangPopular'), uk('obLangAll'), 'англійська (США)', 'німецька']));
  // шість популярних мов, англійська й іспанська — двома рядками кожна
  expect(rows(tree).slice(0, 8).map((r) => r.props.testID)).toEqual([
    'lang-en-us',
    'lang-en-gb',
    'lang-de',
    'lang-pl',
    'lang-es-es',
    'lang-es-latam',
    'lang-fr',
    'lang-it',
  ]);
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

describe('language variants', () => {
  const textsOf = (tree, key) =>
    row(tree, key)
      .findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string')
      .map((n) => n.props.children);
  const flagOf = (tree, key) => textsOf(tree, key)[0];

  test('each variant: its flag, its endonym and the name in the interface language under it', async () => {
    const tree = await render(<LangList value={null} popularFor="uk" onPick={() => {}} t={uk} ui="uk" />);
    expect(textsOf(tree, 'en-us')).toEqual(['🇺🇸', 'English (US)', 'англійська (США)']);
    expect(textsOf(tree, 'en-gb')).toEqual(['🇬🇧', 'English (UK)', 'англійська (Британія)']);
    expect(textsOf(tree, 'es-es')).toEqual(['🇪🇸', 'Español (España)', 'іспанська (Іспанія)']);
    expect(textsOf(tree, 'es-latam')).toEqual(['🇲🇽', 'Español (Latinoamérica)', 'іспанська (Латинська Америка)']);
    expect(row(tree, 'en-gb').props.accessibilityLabel).toBe('English (UK), англійська (Британія)');
    // мова без варіантів — як і була: ендонім і назва праворуч
    expect(textsOf(tree, 'de')).toEqual(['🇩🇪', 'Deutsch', 'німецька']);
    await act(async () => tree.unmount());
  });

  test('when the interface speaks that language, the endonym is enough', async () => {
    const tree = await render(<LangList value={null} popularFor="de" onPick={() => {}} t={t} ui="en" />);
    expect(textsOf(tree, 'en-gb')).toEqual(['🇬🇧', 'English (UK)']);
    expect(textsOf(tree, 'es-latam')).toEqual(['🇲🇽', 'Español (Latinoamérica)', 'Spanish (Latin America)']);
    await act(async () => tree.unmount());
    const es = await render(<LangList value={null} popularFor="de" onPick={() => {}} t={makeT('es')} ui="es" />);
    expect(textsOf(es, 'es-latam')).toEqual(['🇲🇽', 'Español (Latinoamérica)']);
    expect(textsOf(es, 'en-us')).toEqual(['🇺🇸', 'English (US)', 'inglés (EE. UU.)']);
    await act(async () => es.unmount());
  });

  test('the chosen variant is ticked; a language without variants ignores it', async () => {
    const tree = await render(<LangList value="en" variant="gb" popularFor="uk" onPick={() => {}} t={uk} ui="uk" />);
    expect(row(tree, 'en-gb').props.accessibilityState.checked).toBe(true);
    expect(row(tree, 'en-us').props.accessibilityState.checked).toBe(false);
    expect(flagOf(tree, 'en-gb')).toBe('🇬🇧');
    await act(async () => tree.unmount());
    const de = await render(<LangList value="de" variant="gb" popularFor="uk" onPick={() => {}} t={uk} ui="uk" />);
    expect(row(de, 'de').props.accessibilityState.checked).toBe(true);
    expect(rows(de).filter((r) => r.props.accessibilityState.checked)).toHaveLength(1);
    await act(async () => de.unmount());
  });

  test('search finds a variant by its region, the language finds both', async () => {
    const tree = await render(<LangSheet visible current="de" native="uk" onPick={() => {}} onClose={() => {}} t={uk} ui="uk" />);
    const input = tree.root.find((n) => n.props.testID === 'lang-search' && typeof n.props.onChangeText === 'function');
    const found = () => rows(tree).map((r) => r.props.testID);
    for (const [q, want] of [
      ['брит', ['lang-en-gb']],
      ['british', ['lang-en-gb']],
      ['сша', ['lang-en-us']],
      ['латин', ['lang-es-latam']],
      ['mexic', ['lang-es-latam']],
      ['англ', ['lang-en-us', 'lang-en-gb']],
      ['español', ['lang-es-es', 'lang-es-latam']],
    ]) {
      await act(async () => input.props.onChangeText(q));
      expect([q, found()]).toEqual([q, want]);
    }
    await act(async () => tree.unmount());
  });

  // Російською регіон — «Великобритания», тож «брит» знаходять слова з
  // terms, а не назва регіону; так само «американ», «мексик», «латиноамер».
  test('search in Russian and Ukrainian finds a variant by the adjective too', async () => {
    const tree = await render(<LangSheet visible current="de" native="ru" onPick={() => {}} onClose={() => {}} t={ru} ui="ru" />);
    const input = tree.root.find((n) => n.props.testID === 'lang-search' && typeof n.props.onChangeText === 'function');
    const found = () => rows(tree).map((r) => r.props.testID);
    for (const [q, want] of [
      ['брит', ['lang-en-gb']],
      ['британский', ['lang-en-gb']],
      ['великобр', ['lang-en-gb']],
      ['американ', ['lang-en-us']],
      ['мексик', ['lang-es-latam']],
      ['латиноамер', ['lang-es-latam']],
      ['латин', ['lang-es-latam']],
      ['англ', ['lang-en-us', 'lang-en-gb']],
    ]) {
      await act(async () => input.props.onChangeText(q));
      expect([q, found()]).toEqual([q, want]);
    }
    await act(async () => tree.unmount());
    const ua = await render(<LangSheet visible current="de" native="uk" onPick={() => {}} onClose={() => {}} t={uk} ui="uk" />);
    const field = ua.root.find((n) => n.props.testID === 'lang-search' && typeof n.props.onChangeText === 'function');
    for (const [q, want] of [
      ['британська', ['lang-en-gb']],
      ['американська', ['lang-en-us']],
      ['мексиканська', ['lang-es-latam']],
    ]) {
      await act(async () => field.props.onChangeText(q));
      expect([q, rows(ua).map((r) => r.props.testID)]).toEqual([q, want]);
    }
    await act(async () => ua.unmount());
  });

  test('the translation language picks a language, not a variant', async () => {
    const onPick = jest.fn();
    const tree = await render(<LangSheet visible mode="native" current="uk" other="de" onPick={onPick} onClose={() => {}} t={uk} ui="uk" />);
    expect(row(tree, 'en')).toBeTruthy();
    expect(row(tree, 'en-gb')).toBeUndefined();
    await act(async () => row(tree, 'es').props.onPress());
    expect(onPick).toHaveBeenCalledWith('es');
    await act(async () => tree.unmount());
  });
});
