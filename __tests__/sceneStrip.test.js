// Стрічка сцен у словнику: тап відкриває сцену з історії, довгий натиск
// (або дія VoiceOver) видаляє її після підтвердження.
import { Alert, Modal, Switch } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import DictionaryScreen from '../src/DictionaryScreen';
import SceneView from '../src/scene/SceneView';
import { makeT } from '../src/i18n';
import { Press } from '../src/ui';

jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn() }));

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const scene = (id, n, hidden = []) => ({
  id,
  image: `file:///doc/scenes/${id}.jpg`,
  width: 1080,
  height: 1920,
  lang: 'en',
  nativeLang: 'uk',
  createdAt: Date.UTC(2026, 9, 1),
  objects: Array.from({ length: n }, (_, i) => ({ key: 'o' + i, word: 'w' + i, translation: 't' + i, box: [100 * i, 100, 100 * i + 80, 300], outline: null })),
  hidden,
});
const WORDS = [{ id: 'a', word: 'mug', translation: 'кружка', lang: 'en', addedAt: 1 }];

// Порожній словник показує маскота з нескінченною анімацією: дерево, що
// лишилось змонтованим після впалого тесту, не дало б jest завершитись.
const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
});

async function render(props) {
  let tree;
  const all = {
    words: WORDS,
    onDelete: jest.fn(),
    onShare: jest.fn(),
    onScan: jest.fn(),
    scenes: [scene('s1', 7), scene('s2', 3, ['o1'])],
    onSaveWords: jest.fn(() => 1),
    onUpdateScene: jest.fn(),
    onDeleteScene: jest.fn(),
    onSceneVisible: jest.fn(),
    t,
    ...props,
  };
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <DictionaryScreen {...all} />
      </SafeAreaProvider>
    );
  });
  mounted.push(tree);
  return { tree, props: all };
}

const thumbs = (tree) =>
  tree.root.findAll((n) => n.type === Press && String(n.props.accessibilityLabel).startsWith(t('sceneThumb') + ','));
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

test('each scene shows its thumbnail with the number of visible words', async () => {
  const { tree } = await render();
  expect(texts(tree)).toEqual(expect.arrayContaining([t('scenesTitle'), t('sceneThumbWords', { n: 7 }), t('sceneThumbWords', { n: 2 })]));
  expect(thumbs(tree).map((n) => n.props.accessibilityLabel)).toEqual([
    `${t('sceneThumb')}, ${t('sceneThumbWords', { n: 7 })}, 1 Oct 2026`,
    `${t('sceneThumb')}, ${t('sceneThumbWords', { n: 2 })}, 1 Oct 2026`,
  ]);
});

test('tapping a scene opens it from history and tells App a layer is open', async () => {
  const { tree, props } = await render();
  const view = () => tree.root.findByType(SceneView);
  expect(view().props.scene).toBeNull();
  await act(async () => thumbs(tree)[1].props.onPress());
  expect(view().props.scene.id).toBe('s2');
  expect(view().props.savedWords).toBe(WORDS);
  expect(tree.root.findAllByType(Modal).find((m) => m.props.visible)).toBeTruthy();
  expect(props.onSceneVisible).toHaveBeenLastCalledWith(true);

  await act(async () => view().props.onClose());
  expect(view().props.scene).toBeNull();
  expect(props.onSceneVisible).toHaveBeenLastCalledWith(false);
});

test('a long press asks first and deletes only after the confirmation', async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const { tree, props } = await render();
  await act(async () => thumbs(tree)[0].props.onLongPress());
  const [title, msg, buttons] = alert.mock.calls[0];
  expect([title, msg]).toEqual([t('sceneDelTitle'), t('sceneDelMsg')]);
  expect(props.onDeleteScene).not.toHaveBeenCalled();
  await act(async () => buttons.find((b) => b.style === 'destructive').onPress());
  expect(props.onDeleteScene).toHaveBeenCalledWith('s1');

  // те саме для VoiceOver — дією «Видалити»
  const thumb = thumbs(tree)[1];
  expect(thumb.props.accessibilityActions).toEqual([{ name: 'delete', label: t('delete') }]);
  await act(async () => thumb.props.onAccessibilityAction({ nativeEvent: { actionName: 'delete' } }));
  expect(alert).toHaveBeenCalledTimes(2);
  alert.mockRestore();
});

test('no saved words yet, but scenes exist: the strip stays and invites to save from them', async () => {
  const { tree } = await render({ words: [] });
  expect(thumbs(tree)).toHaveLength(2);
  expect(texts(tree)).toEqual(expect.arrayContaining([t('sceneDictEmptyTitle'), t('sceneDictEmptyText')]));
  expect(texts(tree)).not.toContain(t('scanFirstWord'));
});

test('without scenes the dictionary looks exactly as before', async () => {
  const { tree } = await render({ scenes: [] });
  expect(texts(tree)).not.toContain(t('scenesTitle'));
  const empty = await render({ scenes: [], words: [] });
  expect(texts(empty.tree)).toEqual(expect.arrayContaining([t('dictEmptyTitle'), t('scanFirstWord')]));
});

// Порожній словник і звичайний — різні гілки рендеру. Перше слово, збережене
// зі сцени, перемикає гілку; сцена й відкрита картка слова мусять це пережити,
// а не перемонтуватись разом із Modal (на iOS модалка тоді й зовсім пропадає).
test('saving the first word from an open scene keeps the same SceneView, Modal and word card', async () => {
  const onSceneVisible = jest.fn();
  const all = {
    onDelete: jest.fn(),
    onShare: jest.fn(),
    onScan: jest.fn(),
    scenes: [scene('s1', 3)],
    onSaveWords: jest.fn(() => 1),
    onUpdateScene: jest.fn(),
    onDeleteScene: jest.fn(),
    onSceneVisible,
    t,
  };
  const el = (words) => (
    <SafeAreaProvider initialMetrics={metrics}>
      <DictionaryScreen {...all} words={words} />
    </SafeAreaProvider>
  );
  let tree;
  await act(async () => {
    tree = create(el([]));
  });
  mounted.push(tree);
  await act(async () => thumbs(tree)[0].props.onPress());
  const view = tree.root.findByType(SceneView);
  const modal = view.findByType(Modal);
  // картка слова «w1» відкрита — у ній перемикач «Показувати на картці»
  const chip = tree.root.findAll((n) => n.props.accessibilityLabel === 'w1, t1' && typeof n.props.onPress === 'function')[0];
  await act(async () => chip.props.onPress());
  expect(tree.root.findAllByType(Switch)).toHaveLength(1);

  // App.addWords додав слово — словник уже не порожній
  await act(async () => tree.update(el([{ id: 'w1', word: 'w1', translation: 't1', lang: 'en', addedAt: 2 }])));
  expect(texts(tree)).toContain(t('dictCount', { n: 1 }));
  expect(tree.root.findByType(SceneView)).toBe(view);
  expect(view.findByType(Modal)).toBe(modal);
  expect(view.props.scene.id).toBe('s1');
  expect(tree.root.findAllByType(Switch)).toHaveLength(1);
  expect(onSceneVisible.mock.calls).toEqual([[true]]);
});
