// Аркуш «Поділитися»: кнопка Instagram Stories і шаблон «без тла».
import { ActivityIndicator, ScrollView, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ShareSheet from '../src/share/ShareSheet';
import { CUTOUT_H, CUTOUT_W, PALETTES, exportPixels } from '../src/share/layout';
import { captureCard, shareCard } from '../src/share/capture';
import { shareToStories, storiesAvailable, storiesSupported } from '../src/share/instagram';
import { makeT } from '../src/i18n';
import { track } from '../src/analytics';

jest.mock('../src/share/capture', () => ({
  captureCard: jest.fn(async () => 'file:///tmp/card.png'),
  shareCard: jest.fn(async () => {}),
}));
// Статистика: перевіряємо, що саме полетіло б у PostHog
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/share/instagram', () => ({
  storiesSupported: jest.fn(() => true),
  storiesAvailable: jest.fn(async () => true),
  shareToStories: jest.fn(async () => true),
}));

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const photoWord = { word: 'mug', translation: 'кружка', ipa: 'mʌɡ', lang: 'en', photo: 'file:///docs/stickers/mug.jpg', addedAt: 1 };

beforeEach(() => {
  jest.clearAllMocks();
});

async function open(word = photoWord) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ShareSheet visible payload={{ kind: 'word', word }} onClose={() => {}} t={t} />
      </SafeAreaProvider>
    );
  });
  // FadeIn у аркуші стартує із затримкою — даємо їй відіграти, поки тест живий
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100));
  });
  return tree;
}

const button = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress)[0] || null;
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const press = (tree, label) => act(async () => button(tree, label).props.onPress());

// Перегортає на сторінку шаблону, як це робить свайп (onScroll за зсувом).
async function goToPage(tree, i) {
  const scroller = tree.root.findByType(ScrollView);
  const pageW = Math.min(750, 520); // jest: вікно 750 пт, аркуш не ширший за SHEET_MAX_W
  await act(async () => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: i * pageW } } }));
}

describe('Instagram Stories button', () => {
  test('shown only when Instagram can actually open', async () => {
    let tree = await open();
    expect(button(tree, t('shareStories'))).not.toBeNull();
    await act(async () => tree.unmount());

    storiesAvailable.mockResolvedValueOnce(false);
    tree = await open();
    expect(button(tree, t('shareStories'))).toBeNull();
    // головна кнопка на місці
    expect(button(tree, t('shareCta'))).not.toBeNull();
    await act(async () => tree.unmount());
  });

  test('a card template goes to Stories as a full-screen background', async () => {
    const tree = await open();
    await press(tree, t('shareStories'));
    expect(captureCard).toHaveBeenCalledWith(expect.anything(), { size: exportPixels('sticker') });
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///tmp/card.png' });
    expect(shareCard).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the cutout goes as a movable sticker on the palette colour', async () => {
    const tree = await open();
    await goToPage(tree, 3);
    expect(texts(tree)).toContain(t('shareTplCutout'));
    await press(tree, t('sharePalGraphite'));
    await press(tree, t('shareStories'));
    expect(captureCard).toHaveBeenCalledWith(expect.anything(), { size: { w: CUTOUT_W * 3, h: CUTOUT_H * 3 } });
    const { bg } = PALETTES.find((p) => p.key === 'graphite');
    expect(shareToStories).toHaveBeenCalledWith({ stickerImage: 'file:///tmp/card.png', topColor: bg, bottomColor: bg });
    await act(async () => tree.unmount());
  });

  test('if Instagram does not open, the sheet says so and stays', async () => {
    shareToStories.mockResolvedValueOnce(false);
    const tree = await open();
    await press(tree, t('shareStories'));
    expect(texts(tree)).toContain(t('shareStoriesError'));
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('one action at a time: a second tap while capturing is ignored', async () => {
    let finish;
    captureCard.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const tree = await open();
    const stories = button(tree, t('shareStories'));
    await act(async () => {
      stories.props.onPress();
    });
    expect(button(tree, t('shareStories')).props.accessibilityState).toEqual({ busy: true });
    await act(async () => {
      button(tree, t('shareCta')).props.onPress();
      stories.props.onPress();
    });
    expect(shareCard).not.toHaveBeenCalled();
    await act(async () => finish('file:///tmp/card.png'));
    expect(captureCard).toHaveBeenCalledTimes(1);
    expect(shareToStories).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('the preview leaves room for the button only when the build can share to Stories', async () => {
    // ширина прев'ю — у рамці зі скругленням 18
    const previewW = (tree) =>
      tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.borderRadius === 18)
        .map((n) => StyleSheet.flatten(n.props.style).width)
        .find(Boolean);
    // на великому вікні jest прев'ю впирається в стелю 0.8 — беремо справжній iPhone
    const RN = require('react-native');
    const dims = jest.spyOn(RN, 'useWindowDimensions', 'get').mockReturnValue(() => ({ width: 393, height: 852, scale: 3, fontScale: 1 }));
    const roomy = await open();
    const withRoom = previewW(roomy);
    await act(async () => roomy.unmount());
    storiesSupported.mockReturnValue(false);
    const plain = await open();
    expect(withRoom).toBeLessThan(previewW(plain));
    await act(async () => plain.unmount());
    storiesSupported.mockReturnValue(true);
    dims.mockRestore();
  });
});

describe('the cutout template in the system share sheet', () => {
  test('a transparent sticker PNG at its own size', async () => {
    const tree = await open();
    await goToPage(tree, 3);
    await press(tree, t('shareCta'));
    expect(shareCard).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ fileName: 'lingualens-cutout.png', size: { w: CUTOUT_W * 3, h: CUTOUT_H * 3 } })
    );
    await act(async () => tree.unmount());
  });

  test('cards keep the Stories size', async () => {
    const tree = await open();
    await press(tree, t('shareCta'));
    expect(shareCard).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ size: { w: 1080, h: 1920 } }));
    await act(async () => tree.unmount());
  });

  test('a word without a photo has no cutout to offer', async () => {
    const withPhoto = await open();
    expect(button(withPhoto, t('shareTplCutout'))).not.toBeNull();
    await act(async () => withPhoto.unmount());
    const noPhoto = await open({ ...photoWord, photo: null });
    expect(button(noPhoto, t('shareTplMinimal'))).not.toBeNull();
    expect(button(noPhoto, t('shareTplCutout'))).toBeNull();
    await act(async () => noPhoto.unmount());
  });
});

// Статистика: що й куди поділились — лише коди, без самого слова.
describe('share statistics', () => {
  test('the system share and Stories are counted with the card kind and template', async () => {
    const tree = await open();
    await press(tree, t('shareCta'));
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'word', target: 'system', template: 'sticker' });
    await press(tree, t('shareStories'));
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'word', target: 'stories', template: 'sticker' });
    expect(JSON.stringify(track.mock.calls)).not.toContain('mug');
    await act(async () => tree.unmount());
  });

  test('a failed share is not counted', async () => {
    shareCard.mockImplementationOnce(async () => {
      throw Object.assign(new Error('x'), { code: 'SHARE_UNAVAILABLE' });
    });
    const tree = await open();
    await press(tree, t('shareCta'));
    expect(track).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});
