// Картка слова на екрані сцени (вихід, «зберігається», великий шрифт) і аркуш
// слова зі словника (великий шрифт, жест виходу VoiceOver, підказки).
import { AccessibilityInfo, Animated, Modal, ScrollView, Switch } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import SceneView from '../src/scene/SceneView';
import WordSheet from '../src/WordSheet';
import { Press } from '../src/ui';
import { C } from '../src/theme';
import { DUR } from '../src/motion';
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
// useWindowDimensions у jest: 750 × 1334 (заглушка Dimensions)
const WIN_H = 1334;

beforeEach(() => jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false));
afterEach(() => jest.restoreAllMocks());

async function settle(n = 3) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}
const wait = (ms) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

// ───────────────────────────────────────────────────────────────────────────
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
  objects: [obj('o0', 'mug', 'кружка', [520, 380, 640, 560]), obj('o1', 'lamp', 'лампа', [120, 620, 420, 900])],
};

async function renderScene(props = {}) {
  let release;
  const gate = new Promise((r) => (release = r));
  const cutter = {
    get: jest.fn(async (key) => {
      if (props.slow) await gate;
      return { uri: 'file:///sticker-' + key + '.jpg', shape: null };
    }),
    done: Promise.resolve(),
  };
  const all = { scene: SCENE, cutter, savedWords: [], onSaveWords: jest.fn((l) => l.length), onUpdateScene: jest.fn(), onClose: jest.fn(), t, ...props };
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <SceneView {...all} />
      </SafeAreaProvider>
    );
  });
  await settle();
  return { tree, props: all, release };
}

const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
const chip = (tree, o) => byLabel(tree, `${o.word}, ${o.translation}`)[0];
const pressEls = (tree, label) => tree.root.findAllByType(Press).filter((p) => p.props.accessibilityLabel === label);

describe('scene: the Save buttons while saving', () => {
  test('the bottom button and the card button are busy (full colour, no second tap), not disabled', async () => {
    const { tree, props, release } = await renderScene({ slow: true });
    const saveAll = pressEls(tree, t('sceneSaveAll', { n: 2 }))[0];
    expect(saveAll.props.busy).toBeFalsy();
    expect(saveAll.props.disabled).toBe(false);

    await act(async () => {
      saveAll.props.onPress();
    });
    await settle(1);
    const busyBtn = pressEls(tree, t('sceneSaveAll', { n: 2 }))[0];
    expect(busyBtn.props.busy).toBe(true);
    // disabled ≠ busy: disabled блякне до 45 %, а кнопка працює
    expect(busyBtn.props.disabled).toBe(false);
    await act(async () => release());
    await settle();
    expect(props.onSaveWords).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('on the word card too', async () => {
    const { tree, props, release } = await renderScene({ slow: true });
    await act(async () => chip(tree, SCENE.objects[1]).props.onPress());
    await settle();
    const card = () => pressEls(tree, t('save'))[0];
    expect(card().props.busy).toBeFalsy();
    await act(async () => {
      card().props.onPress();
    });
    await settle(1);
    expect(card().props.busy).toBe(true);
    expect(card().props.disabled).toBeFalsy();
    await act(async () => release());
    await settle();
    expect(props.onSaveWords).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('nothing left to save: the button really is disabled', async () => {
    const { tree } = await renderScene({ scene: { ...SCENE, hidden: ['o0', 'o1'] } });
    const btn = tree.root.findAllByType(Press).find((p) => /^Save/.test(p.props.accessibilityLabel || ''));
    expect(btn.props.disabled).toBe(true);
    await act(async () => tree.unmount());
  });
});

describe('scene: the word card leaves with a motion', () => {
  const cardBackdrop = (tree) => byLabel(tree, t('close')).at(-1);

  async function openCard(props) {
    const r = await renderScene(props);
    await act(async () => chip(r.tree, SCENE.objects[0]).props.onPress());
    await settle();
    expect(r.tree.root.findAllByType(Switch)).toHaveLength(1);
    return r;
  }

  test('a tap on the backdrop animates out in DUR.exit (faster than the entrance), then removes the card', async () => {
    const { tree, props } = await openCard();
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => cardBackdrop(tree).props.onPress());
    const exit = timing.mock.calls.map(([, cfg]) => cfg).find((cfg) => cfg.toValue === 0 && cfg.duration === DUR.exit);
    expect(exit).toMatchObject({ useNativeDriver: true });
    expect(DUR.exit).toBeLessThan(DUR.sheet);
    // ще їде
    expect(tree.root.findAllByType(Switch)).toHaveLength(1);
    await wait(DUR.exit + 200);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('Android back and the VoiceOver escape gesture take the same way', async () => {
    let { tree, props } = await openCard();
    await act(async () => tree.root.findByType(Modal).props.onRequestClose());
    await wait(DUR.exit + 200);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => tree.unmount());

    ({ tree, props } = await openCard());
    const escape = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityViewIsModal && typeof n.props.onAccessibilityEscape === 'function').at(-1);
    await act(async () => escape.props.onAccessibilityEscape());
    await wait(DUR.exit + 200);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    expect(props.onClose).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('a second tap while it leaves does not start a second exit', async () => {
    const { tree } = await openCard();
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => cardBackdrop(tree).props.onPress());
    await act(async () => cardBackdrop(tree).props.onPress());
    expect(timing.mock.calls.filter(([, cfg]) => cfg.toValue === 0 && cfg.duration === DUR.exit)).toHaveLength(1);
    await wait(DUR.exit + 200);
    await act(async () => tree.unmount());
  });

  test('“Reduce Motion”: it still fades out', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const { tree } = await openCard();
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => cardBackdrop(tree).props.onPress());
    expect(timing.mock.calls.some(([, cfg]) => cfg.toValue === 0 && cfg.duration === DUR.exit)).toBe(true);
    await wait(DUR.exit + 200);
    expect(tree.root.findAllByType(Switch)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('the card can be opened again after it left', async () => {
    const { tree } = await openCard();
    await act(async () => cardBackdrop(tree).props.onPress());
    await wait(DUR.exit + 200);
    await act(async () => chip(tree, SCENE.objects[1]).props.onPress());
    await settle();
    expect(tree.root.findAllByType(Switch)).toHaveLength(1);
    await act(async () => tree.unmount());
  });
});

describe('scene: the word card at a large text size', () => {
  test('the text scrolls inside a card that never grows past the screen; “Save” stays pinned below', async () => {
    const { tree } = await renderScene();
    await act(async () => chip(tree, SCENE.objects[0]).props.onPress());
    await settle();
    const scroll = tree.root.findAllByType(ScrollView).at(-1);
    expect(scroll.findAllByType(Switch)).toHaveLength(1);
    expect(scroll.findAll((n) => n.props.accessibilityLabel === t('save'))).toHaveLength(0);
    const card = tree.root.find((n) => typeof n.type === 'string' && [].concat(n.props.style).flat().some((x) => x && x.maxHeight));
    const maxHeight = [].concat(card.props.style).flat().find((x) => x && x.maxHeight).maxHeight;
    expect(maxHeight).toBe(WIN_H - metrics.insets.top - 8);
    expect(scroll.props.bounces).toBe(false);
    await act(async () => tree.unmount());
  });
});

describe('scene: ink colours', () => {
  test('“Saved” on the card is greenInk, the contrast token', async () => {
    const { tree } = await renderScene({ savedWords: [{ word: 'mug', lang: 'en' }] });
    await act(async () => chip(tree, SCENE.objects[0]).props.onPress());
    await settle();
    const saved = tree.root.findAll((n) => n.type === 'Text' && n.props.children === t('saved'));
    const colour = [].concat(saved.at(-1).props.style).flat().find((x) => x && x.color).color;
    expect(colour).toBe(C.greenInk);
    await act(async () => tree.unmount());
  });
});

// ───────────────────────────────────────────────────────────────────────────
describe('word sheet', () => {
  const ITEM = { id: 'w1', word: 'la taza', translation: 'mug', ipa: '/la ˈta.θa/', example: 'Bebo té en mi taza.', exampleTranslation: 'I drink tea from my mug.', lang: 'es' };

  async function open(props = {}) {
    const onClose = jest.fn();
    const onDelete = jest.fn();
    const el = (p) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <WordSheet item={ITEM} onClose={onClose} onDelete={onDelete} onShare={jest.fn()} t={t} {...p} {...props} />
      </SafeAreaProvider>
    );
    let tree;
    await act(async () => {
      tree = create(el());
    });
    await settle();
    return { tree, onClose, onDelete, el };
  }
  const sheet = (tree) => tree.root.find((n) => typeof n.type === 'string' && typeof n.props.onAccessibilityEscape === 'function');
  const maxOf = (node) => [].concat(node.props.style).flat().find((x) => x && x.maxHeight)?.maxHeight;

  test('the example says it will be spoken, like the phrase rows do', async () => {
    const { tree } = await open();
    const example = tree.root.find((n) => n.props.accessibilityHint === t('listen') && typeof n.props.onPress === 'function' && n.props.style?.padding === 14);
    expect(example).toBeTruthy();
    await act(async () => tree.unmount());
  });

  test('“Delete” is redInk, the contrast token', async () => {
    const { tree } = await open();
    const del = tree.root.find((n) => n.type === 'Text' && n.props.children === t('delete'));
    expect([].concat(del.props.style).flat().find((x) => x && x.color).color).toBe(C.redInk);
    await act(async () => tree.unmount());
  });

  test('VoiceOver escape closes the sheet like the backdrop does', async () => {
    const { tree, onClose } = await open();
    await act(async () => sheet(tree).props.onAccessibilityEscape());
    await wait(DUR.exit + 200);
    expect(onClose).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('a sheet that fits has no scroll view and a screen-bound max height', async () => {
    const { tree } = await open();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    expect(maxOf(sheet(tree))).toBe(WIN_H - metrics.insets.top - 8);
    await act(async () => sheet(tree).props.onLayout({ nativeEvent: { layout: { height: 560 } } }));
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('a sheet that hits the max height (large text) scrolls its content; the actions stay below', async () => {
    const { tree } = await open();
    const max = maxOf(sheet(tree));
    await act(async () => sheet(tree).props.onLayout({ nativeEvent: { layout: { height: max } } }));
    const scroll = tree.root.findByType(ScrollView);
    const inside = (label) => scroll.findAll((n) => n.props.accessibilityLabel === label || n.props.title === label).length;
    expect(scroll.findAll((n) => n.type === 'Text' && n.props.children === 'la taza').length).toBeGreaterThan(0);
    expect(inside(t('share'))).toBe(0);
    expect(inside(t('listen'))).toBeGreaterThan(0);
    expect(tree.root.findAll((n) => n.props.title === t('share') && typeof n.props.onPress === 'function').length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('the next word starts again without a scroll view', async () => {
    const { tree, el } = await open();
    await act(async () => sheet(tree).props.onLayout({ nativeEvent: { layout: { height: maxOf(sheet(tree)) } } }));
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(1);
    await act(async () => tree.update(el({ item: null })));
    await act(async () => tree.update(el({ item: { ...ITEM, id: 'w2', word: 'el vaso' } })));
    await settle();
    expect(tree.root.findAllByType(ScrollView)).toHaveLength(0);
    await act(async () => tree.unmount());
  });
});
