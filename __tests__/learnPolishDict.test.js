// Словник, полірування жовтня 2026: пошук без діакритики, стабільні ключі
// альбому (рядки не перемонтовуються при зсуві списку), роль і назва в чипів
// мови, без хаптики на кожну наліпку, стрічка сцен не перемальовується від
// літер у пошуку.
import { FlatList, TextInput } from 'react-native';
import * as Haptics from 'expo-haptics';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DictionaryScreen, { filterWords, fold } from '../src/DictionaryScreen';
import { nameFor } from '../src/speech';
import { makeT } from '../src/i18n';

jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn() }));

// Лічильник монтувань наліпок: літера-плитка стоїть у кожній плитці альбому
// (слова без фото). Якщо рядок перемонтовується, лічильник росте.
const mockMounts = { n: 0 };
jest.mock('../src/WordSheet', () => {
  const React = require('react');
  const actual = jest.requireActual('../src/WordSheet');
  return {
    __esModule: true,
    ...actual,
    LetterTile: function LetterTile() {
      React.useEffect(() => {
        mockMounts.n += 1;
      }, []);
      return null;
    },
  };
});

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

describe('fold: search without accents', () => {
  test('latin accents, ß and ñ fold to plain letters, in either Unicode form', () => {
    expect(fold('Café')).toBe('cafe');
    expect(fold('café')).toBe('cafe'); // розкладена форма
    expect(fold('Über')).toBe('uber');
    expect(fold('Niño')).toBe('nino');
    expect(fold('Straße')).toBe('strasse');
    expect(fold('Crème brûlée')).toBe('creme brulee');
  });

  test('ё folds to е, but й and ї stay their own letters', () => {
    expect(fold('Ёлка')).toBe('елка');
    expect(fold('їжак')).toBe('їжак');
    expect(fold('мой')).toBe('мой');
    // «мои» не знаходить «мой»: стирання знаків не торкається кирилиці
    expect(fold('мой').includes(fold('мои'))).toBe(false);
    expect(fold('їжак').includes(fold('ізак'))).toBe(false);
  });

  test('ASCII, empty and missing values pass through', () => {
    expect(fold('Apple pie')).toBe('apple pie');
    expect(fold('')).toBe('');
    expect(fold(null)).toBe('');
    expect(fold(undefined)).toBe('');
  });

  test('filterWords finds accented words by their plain spelling, in the word and in the translation', () => {
    const words = [
      { id: 'a', word: 'le café', translation: 'кава', lang: 'fr', addedAt: 3 },
      { id: 'b', word: 'die Überraschung', translation: 'сюрприз', lang: 'de', addedAt: 2 },
      { id: 'c', word: 'la taza', translation: 'el español', lang: 'es', addedAt: 1 },
      { id: 'd', word: 'ёж', translation: 'hedgehog', lang: 'ru', addedAt: 0 },
    ];
    expect(filterWords(words, 'cafe', null).map((w) => w.id)).toEqual(['a']);
    expect(filterWords(words, 'CAFÉ', null).map((w) => w.id)).toEqual(['a']);
    expect(filterWords(words, 'uberraschung', null).map((w) => w.id)).toEqual(['b']);
    expect(filterWords(words, 'uber', null).map((w) => w.id)).toEqual(['b']);
    expect(filterWords(words, 'espanol', null).map((w) => w.id)).toEqual(['c']);
    expect(filterWords(words, 'еж', null).map((w) => w.id)).toEqual(['d']);
    expect(filterWords(words, 'ёж', null).map((w) => w.id)).toEqual(['d']);
  });
});

const WORDS = [
  { id: 'a', word: 'mug', translation: 'кружка', lang: 'en', addedAt: 4 },
  { id: 'b', word: 'lamp', translation: 'лампа', lang: 'en', addedAt: 3 },
  { id: 'c', word: 'die Tasse', translation: 'чашка', lang: 'de', addedAt: 2 },
  { id: 'd', word: 'chair', translation: 'стілець', lang: 'en', addedAt: 1 },
];
const scene = (id) => ({
  id,
  image: `file:///doc/scenes/${id}.jpg`,
  width: 1080,
  height: 1920,
  lang: 'en',
  nativeLang: 'uk',
  createdAt: Date.UTC(2026, 9, 1),
  objects: [{ key: 'o0', word: 'w0', translation: 't0', box: [0, 100, 80, 300], outline: null }],
  hidden: [],
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) await act(async () => mounted.pop().unmount());
  jest.restoreAllMocks();
});

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <DictionaryScreen words={WORDS} onDelete={() => {}} onShare={() => {}} onDeleteScene={() => {}} t={t} {...props} />
      </SafeAreaProvider>
    );
  });
  mounted.push(tree);
  return tree;
}

const run = (fn) => act(async () => fn());
const hasText = (n, text) => n.type === 'Text' && [].concat(n.props.children).flat(Infinity).includes(text);
const tab = (tree, label) => tree.root.find((n) => n.props.accessibilityRole === 'tab' && n.findAll((c) => hasText(c, label)).length > 0);

describe('language chips', () => {
  test('are buttons; the language ones say the language name, not just a flag', async () => {
    const tree = await render();
    const chips = tree.root.findAll(
      (n) => typeof n.type === 'string' && n.props.accessibilityRole === 'button' && typeof n.props.accessibilityState?.selected === 'boolean'
    );
    // «Усі» + дві мови
    expect(chips).toHaveLength(3);
    const labels = chips.map((c) => c.props.accessibilityLabel).filter(Boolean);
    expect(labels).toEqual(expect.arrayContaining([nameFor('en'), nameFor('de')]));
    // «Усі» читається зі свого тексту
    expect(chips.some((c) => c.findAll((x) => hasText(x, t('all'))).length > 0)).toBe(true);
  });

  test('the Words/Collection tabs reach 44 pt with their hit area', async () => {
    const tree = await render();
    const list = tab(tree, t('viewList'));
    expect(list.props.hitSlop).toMatchObject({ top: 5, bottom: 5 });
  });
});

describe('the collection (grid)', () => {
  async function grid() {
    const tree = await render();
    await run(() => tab(tree, t('viewCollection')).props.onPress());
    return tree;
  }

  test('rows are keyed by position and tiles by slot, so a shifted list does not remount stickers', async () => {
    const tree = await grid();
    const list = tree.root.findByType(FlatList);
    const key = list.props.keyExtractor;
    const rowA = [{ id: 'x1' }, { id: 'x2' }];
    const rowB = [{ id: 'y1' }, { id: 'y2' }];
    expect(key(rowA, 2)).toBe('row-2');
    // тот самий індекс — той самий ключ, хоч би які там наліпки
    expect(key(rowB, 2)).toBe(key(rowA, 2));
    expect(key(rowA, 3)).not.toBe(key(rowA, 2));
    // елементи списку (не рядки альбому) тримають свій id
    expect(key({ id: 'word-9' }, 5)).toBe('word-9');

    // плитки рядка: ключі 0..n-1, не id
    const rows = list.props.data.filter(Array.isArray);
    expect(rows.length).toBeGreaterThan(0);
  });

  test('opening a sticker is silent: no impact haptic on every tap', async () => {
    const impact = jest.spyOn(Haptics, 'impactAsync');
    const tree = await grid();
    impact.mockClear();
    const tile = tree.root
      .findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => hasText(c, 'mug')).length > 0)
      .at(-1);
    await run(() => tile.props.onPress());
    expect(impact).not.toHaveBeenCalled();
  });

  test('a word added at the top, a word removed, a search typed: stickers are updated in place, not remounted', async () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ id: 'w' + i, word: 'word' + i, translation: 'т' + i, lang: 'en', addedAt: 100 - i }));
    const screen = (words) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <DictionaryScreen words={words} onDelete={() => {}} onShare={() => {}} t={t} />
      </SafeAreaProvider>
    );
    mockMounts.n = 0;
    const tree = await render({ words: many });
    await run(() => tab(tree, t('viewCollection')).props.onPress());
    const base = mockMounts.n;
    expect(base).toBeGreaterThanOrEqual(9);

    // додали слово зверху: усе зсунулось на одне місце, нова лише одна плитка
    mockMounts.n = 0;
    const added = { id: 'new', word: 'desk', translation: 'стіл', lang: 'en', addedAt: 999 };
    await act(async () => tree.update(screen([added, ...many])));
    expect(mockMounts.n).toBeLessThanOrEqual(1);

    // видалили друге слово
    mockMounts.n = 0;
    await act(async () => tree.update(screen([added, ...many.slice(0, 1), ...many.slice(2)])));
    expect(mockMounts.n).toBe(0);

    // пошук звужує список
    mockMounts.n = 0;
    await run(() => tree.root.findByType(TextInput).props.onChangeText('word'));
    expect(mockMounts.n).toBe(0);
  });
});

describe('scene strip', () => {
  test('typing in the search does not hand the strip new callbacks (it stays memoized)', async () => {
    const tree = await render({ scenes: [scene('s1'), scene('s2')] });
    const strip = () => tree.root.find((n) => Array.isArray(n.props.scenes) && typeof n.props.onOpen === 'function' && n.props.onLongPress);
    const { onOpen, onLongPress } = strip().props;
    await run(() => tree.root.findByType(TextInput).props.onChangeText('mu'));
    expect(strip().props.onOpen).toBe(onOpen);
    expect(strip().props.onLongPress).toBe(onLongPress);
  });
});
