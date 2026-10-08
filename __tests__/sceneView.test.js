// Екран сцени: зберегти все, не закриваючи сцену, сховати хибний
// підпис перед тим, як ділитися, і правильний порядок «назад».
import { Image, Modal, Switch } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SceneView from '../src/scene/SceneView';
import { LiftedObjects, SceneChip } from '../src/scene/SceneArt';
import ShareSheet from '../src/share/ShareSheet';
import { makeT } from '../src/i18n';

// Записуємо, з чого ріжуться наліпки (для сцени з історії — з її фото).
const cuts = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const c = {
      crop: (r) => (cuts.push({ source, crop: r }), c),
      resize: () => c,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///cut' + cuts.length + '.jpg' }), release() {} }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

beforeEach(() => {
  cuts.length = 0;
});

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

const obj = (key, word, translation, box) => ({ key, word, translation, ipa: '/x/', example: 'An example.', exampleTranslation: 'Приклад.', box, outline: null });
const SCENE = {
  id: 'sc1',
  image: 'file:///scene.jpg',
  width: 1080,
  height: 1920,
  lang: 'en',
  nativeLang: 'uk',
  createdAt: 1,
  hidden: [],
  objects: [
    obj('o0', 'mug', 'кружка', [520, 380, 640, 560]),
    obj('o1', 'lamp', 'лампа', [120, 620, 420, 900]),
    obj('o2', 'book', 'книжка', [700, 120, 800, 420]),
  ],
};

// Різальник наліпок: відповідає одразу, як готовий кадр із камери
const cutter = () => ({ get: jest.fn(async (key) => ({ uri: 'file:///sticker-' + key + '.jpg', shape: [[0, 0]] })), done: Promise.resolve() });

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function render(props) {
  let tree;
  const all = { scene: SCENE, cutter: cutter(), savedWords: [], onSaveWords: jest.fn((list) => list.length), onUpdateScene: jest.fn(), onClose: jest.fn(), t, ...props };
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <SceneView {...all} />
      </SafeAreaProvider>
    );
  });
  await settle();
  return { tree, props: all };
}

async function run(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const chip = (tree, o) => byLabel(tree, `${o.word}, ${o.translation}`);
const sheet = (tree) => tree.root.findAllByType(ShareSheet)[0];

test('title and the save button count only words still missing from the list', async () => {
  const { tree, props } = await render({ savedWords: [{ word: 'Mug', lang: 'en' }] });
  expect(texts(tree)).toContain(t('sceneTitle', { n: 3 }));
  // частина вже в словнику — «Зберегти нові (2)», а не «Зберегти всі (2)»
  expect(byLabel(tree, t('sceneSaveAll', { n: 2 }))).toBeUndefined();
  const saveNew = byLabel(tree, t('sceneSaveNew', { n: 2 }));
  expect(saveNew).toBeTruthy();

  await run(() => saveNew.props.onPress());
  const list = props.onSaveWords.mock.calls[0][0];
  expect(list.map((w) => w.word)).toEqual(['lamp', 'book']);
  // кожне слово — з наліпкою з кадру, мовами сцени й посиланням на неї
  expect(list[0]).toMatchObject({ photo: 'file:///sticker-o1.jpg', shape: [[0, 0]], lang: 'en', nativeLang: 'uk', sceneId: 'sc1', translation: 'лампа' });
  expect(props.onClose).not.toHaveBeenCalled();
  // усе збережено — неактивна плашка замість кнопки
  expect(texts(tree)).toContain(t('sceneAllDone'));
  const done = tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityState?.disabled === true);
  expect(done.props.accessibilityRole).toBe('button');
  await act(async () => tree.unmount());
});

test('chips of words already in the list carry a check, and VoiceOver hears it', async () => {
  const { tree } = await render({ savedWords: [{ word: 'Mug', lang: 'en' }] });
  const chips = tree.root.findAllByType(SceneChip);
  expect(chips.map((c) => [c.props.word, c.props.saved])).toEqual([
    ['mug', true],
    ['lamp', false],
    ['book', false],
  ]);
  expect(chip(tree, SCENE.objects[0]).props.accessibilityValue).toEqual({ text: t('saved') });
  expect(chip(tree, SCENE.objects[1]).props.accessibilityValue).toBeUndefined();
  // нічого ще не збережено — «Зберегти всі»
  await act(async () => tree.unmount());
  const fresh = await render();
  expect(byLabel(fresh.tree, t('sceneSaveAll', { n: 3 }))).toBeTruthy();
  await act(async () => fresh.tree.unmount());
});

// Словник безкоштовний без меж, тож App зберігає менше лише коли якесь слово
// встигло з'явитись у словнику (синхронізація з іншого iPhone між показом
// сцени й тапом «Зберегти всі»). Це не привід закривати сцену: слово вже там.
test('App saved fewer words than asked (one was synced meanwhile): the scene stays, every chip counts as saved', async () => {
  const Haptics = require('expo-haptics');
  const note = jest.spyOn(Haptics, 'notificationAsync');
  const { tree, props } = await render({ onSaveWords: jest.fn(() => 1) });
  await run(() => byLabel(tree, t('sceneSaveAll', { n: 3 })).props.onPress());
  expect(props.onSaveWords.mock.calls[0][0]).toHaveLength(3);
  expect(props.onClose).not.toHaveBeenCalled();
  expect(texts(tree)).toContain(t('sceneAllDone'));
  expect(tree.root.findAllByType(SceneChip).map((c) => c.props.saved)).toEqual([true, true, true]);
  expect(note).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
  note.mockRestore();
  await act(async () => tree.unmount());
});

test('the same word twice in one scene is saved once', async () => {
  const twice = { ...SCENE, objects: [...SCENE.objects, obj('o3', 'Book', 'книжка', [820, 500, 900, 700])] };
  const { tree, props } = await render({ scene: twice });
  await run(() => byLabel(tree, t('sceneSaveAll', { n: 4 })).props.onPress());
  expect(props.onSaveWords.mock.calls[0][0].map((w) => w.word)).toEqual(['mug', 'lamp', 'book']);
  expect(props.onClose).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('a chip opens the word card; one word is saved from there', async () => {
  const { tree, props } = await render();
  await run(() => chip(tree, SCENE.objects[1]).props.onPress());
  expect(texts(tree)).toEqual(expect.arrayContaining(['lamp', '/x/', 'лампа', 'Приклад.']));
  await run(() => byLabel(tree, t('save')).props.onPress());
  expect(props.onSaveWords).toHaveBeenCalledWith([expect.objectContaining({ word: 'lamp', photo: 'file:///sticker-o1.jpg' })]);
  expect(texts(tree)).toContain(t('saved'));
  await act(async () => tree.unmount());
});

test('hiding a wrong label: gone from the count, the save list and the share card, and remembered', async () => {
  const { tree, props } = await render();
  await run(() => chip(tree, SCENE.objects[0]).props.onPress());
  const toggle = tree.root.findByType(Switch);
  expect(toggle.props.value).toBe(true);
  await run(() => toggle.props.onValueChange(false));
  expect(props.onUpdateScene).toHaveBeenCalledWith('sc1', { hidden: ['o0'] });
  expect(tree.root.findByType(Switch).props.value).toBe(false);

  // назад закриває картку слова, а не сцену
  await run(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(tree.root.findAllByType(Switch)).toHaveLength(0);
  expect(props.onClose).not.toHaveBeenCalled();

  expect(texts(tree)).toContain(t('sceneTitle', { n: 2 }));
  expect(byLabel(tree, t('sceneSaveAll', { n: 2 }))).toBeTruthy();
  // прихований підпис лишається на фото блідим — його можна повернути
  expect(chip(tree, SCENE.objects[0]).props.accessibilityHint).toBe(t('sceneHiddenHint'));

  await run(() => byLabel(tree, t('share')).props.onPress());
  const payload = sheet(tree).props.payload;
  expect(sheet(tree).props.visible).toBe(true);
  expect(payload.kind).toBe('scene');
  expect(payload.scene.objects.map((o) => o.key)).toEqual(['o1', 'o2']);
  await act(async () => tree.unmount());
});

test('hidden labels come back from history', async () => {
  const { tree } = await render({ scene: { ...SCENE, hidden: ['o2'] } });
  expect(texts(tree)).toContain(t('sceneTitle', { n: 2 }));
  await act(async () => tree.unmount());
});

test('back closes the share card first, then the whole scene', async () => {
  const { tree, props } = await render();
  await run(() => byLabel(tree, t('share')).props.onPress());
  expect(sheet(tree).props.visible).toBe(true);
  await run(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(sheet(tree).props.visible).toBe(false);
  expect(props.onClose).not.toHaveBeenCalled();
  await run(() => tree.root.findByType(Modal).props.onRequestClose());
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('the close button and the scene layer are reachable for VoiceOver', async () => {
  const { tree, props } = await render();
  const root = tree.root.find((n) => n.props.accessibilityViewIsModal && typeof n.type === 'string');
  expect(typeof root.props.onAccessibilityEscape).toBe('function');
  const close = byLabel(tree, t('close'));
  expect(close.props.accessibilityRole).toBe('button');
  await run(() => close.props.onPress());
  expect(props.onClose).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

test('a scene from history cuts stickers from its own photo only when saving', async () => {
  const { tree, props } = await render({ cutter: null });
  expect(cuts).toHaveLength(0);
  await run(() => byLabel(tree, t('sceneSaveAll', { n: 3 })).props.onPress());
  expect(cuts.map((c) => c.source)).toEqual(['file:///scene.jpg', 'file:///scene.jpg', 'file:///scene.jpg']);
  // квадрат усередині збереженого фото 1080×1920
  for (const { crop } of cuts) {
    expect(crop.width).toBe(crop.height);
    expect(crop.originX + crop.width).toBeLessThanOrEqual(1080);
    expect(crop.originY + crop.height).toBeLessThanOrEqual(1920);
  }
  expect(props.onSaveWords.mock.calls[0][0].every((w) => w.photo && w.photo.startsWith('file:///cut'))).toBe(true);
  await act(async () => tree.unmount());
});

test('a scene whose photo is gone keeps its words but draws no empty cut-outs and cannot be shared', async () => {
  const { tree } = await render();
  const photo = tree.root.findAll((n) => n.type === Image && n.props.source?.uri === SCENE.image)[0];
  expect(tree.root.findAllByType(LiftedObjects)).toHaveLength(1);
  await run(() => photo.props.onError());
  expect(tree.root.findAllByType(LiftedObjects)).toHaveLength(0);
  expect(byLabel(tree, t('share')).props.disabled).toBe(true);
  expect(byLabel(tree, t('sceneSaveAll', { n: 3 }))).toBeTruthy();
  await act(async () => tree.unmount());
});

test('no scene: the modal is closed', async () => {
  const { tree } = await render({ scene: null });
  expect(tree.root.findByType(Modal).props.visible).toBe(false);
  await act(async () => tree.unmount());
});
