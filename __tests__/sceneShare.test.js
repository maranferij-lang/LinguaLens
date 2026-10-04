// Сцена ділиться наліпкою-набором слів на тлі власного фото: SceneView
// передає в аркуш payload.backdrop = фото сцени (share.md §7), а аркуш
// пропонує «Stories з цим фото».
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SceneView from '../src/scene/SceneView';
import ShareSheet from '../src/share/ShareSheet';
import { sceneImageUri } from '../src/scene/scenes';
import { makeT } from '../src/i18n';

jest.mock('expo-image-manipulator', () => {
  const manipulate = () => {
    const c = {
      crop: () => c,
      resize: () => c,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///cut.jpg' }), release() {} }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const obj = (key, word, translation, box) => ({ key, word, translation, ipa: '', example: '', exampleTranslation: '', box, outline: null });

async function settle() {
  for (let i = 0; i < 3; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function shareScene(scene) {
  let tree;
  const cutter = () => ({ get: jest.fn(async (key) => ({ uri: 'file:///sticker-' + key + '.jpg', shape: [[0, 0]] })), done: Promise.resolve() });
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <SceneView scene={scene} cutter={cutter()} savedWords={[]} onSaveWords={jest.fn()} onUpdateScene={jest.fn()} onClose={jest.fn()} t={t} />
      </SafeAreaProvider>
    );
  });
  await settle();
  const share = tree.root.findAll((n) => n.props.accessibilityLabel === t('share') && n.props.onPress)[0];
  await act(async () => share.props.onPress());
  await settle();
  return { tree, sheet: tree.root.findAllByType(ShareSheet)[0] };
}

const OBJECTS = [obj('o0', 'mug', 'кружка', [520, 380, 640, 560]), obj('o1', 'lamp', 'лампа', [120, 620, 420, 900])];

test('a saved scene passes its photo (from Documents) as the Stories background', async () => {
  const scene = { id: 's1', image: 'scenes/s1.jpg', width: 1080, height: 1920, lang: 'en', nativeLang: 'uk', createdAt: 1, hidden: [], objects: OBJECTS };
  const { tree, sheet } = await shareScene(scene);
  expect(sheet.props.visible).toBe(true);
  expect(sheet.props.payload.kind).toBe('scene');
  expect(sheet.props.payload.backdrop).toBe(sceneImageUri(scene));
  expect(sheet.props.payload.backdrop).toMatch(/scenes\/s1\.jpg$/);
  expect(sheet.props.payload.scene.objects.map((o) => o.key)).toEqual(['o0', 'o1']);
  await act(async () => tree.unmount());
});

test('a fresh scene passes the photo it was just shot with', async () => {
  const scene = { id: 's2', image: 'file:///cache/scene-fresh.jpg', width: 1080, height: 1920, lang: 'en', nativeLang: 'uk', createdAt: 1, hidden: [], objects: OBJECTS };
  const { tree, sheet } = await shareScene(scene);
  expect(sheet.props.payload.backdrop).toBe('file:///cache/scene-fresh.jpg');
  await act(async () => tree.unmount());
});
