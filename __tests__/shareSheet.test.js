// Аркуш «Поділитися» v1.3 (share.md §5, §12.4): спершу наліпка без тла,
// картка — другим режимом. Головна кнопка й плитки — за тим, що вміє
// збірка (Instagram, буфер, «Фото», вибір фото); один знімок на вигляд;
// одна дія за раз; закрили під час знімка — нічого не робимо.
import { AccessibilityInfo, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import ShareSheet from '../src/share/ShareSheet';
import { STORIES_GRADIENT, exportPixels, stickerPixels } from '../src/share/layout';
import { captureView, releaseShot, shareFile } from '../src/share/capture';
import { shareToStories, storiesAvailable, storiesSupported } from '../src/share/instagram';
import { makeT } from '../src/i18n';
import { track } from '../src/analytics';

jest.mock('../src/share/capture', () => ({
  captureView: jest.fn(),
  releaseShot: jest.fn(),
  shareFile: jest.fn(async () => {}),
}));
// Статистика: перевіряємо, що саме полетіло б у PostHog
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/share/instagram', () => ({
  storiesSupported: jest.fn(() => true),
  storiesAvailable: jest.fn(async () => true),
  shareToStories: jest.fn(async () => true),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));
const mockDeleted = [];
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri) => ({ uri, base64: async () => 'UE5H', delete: () => mockDeleted.push(uri) })),
}));
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const c = {
      crop: () => c,
      resize: () => c,
      renderAsync: async () =>
        typeof source === 'string'
          ? { width: 1080, height: 1920, release() {} }
          : { saveAsync: async () => ({ uri: 'file:///cache/picked-bg.jpg', width: 1080, height: 1920 }), release() {} },
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const photoWord = { word: 'mug', translation: 'кружка', ipa: 'mʌɡ', lang: 'en', photo: 'file:///docs/stickers/mug.jpg', addedAt: 1 };
const scanned = { kind: 'word', word: photoWord, backdrop: 'file:///cache/backdrop.jpg' };
const fromDictionary = { kind: 'word', word: photoWord };
const scene = { kind: 'scene', scene: { id: 's1', image: 'file:///docs/scene.jpg', width: 1080, height: 1920, lang: 'en', objects: [{ key: 'a', word: 'mug', translation: 'кружка', box: [100, 100, 400, 400] }] }, backdrop: 'file:///docs/scene.jpg' };
const achievement = { kind: 'achievement', achievement: { id: 'streak_7', tier: 2, goal: 7, metric: 'streak' }, fresh: true, stats: { words: 5, streak: 7 } };
const week = { kind: 'week', stats: { words: 5, weekWords: 2, streak: 3, reviews: 4, days: [], stickers: [], langs: ['en'] } };

// Можливості збірки: «є» лише встановлене в мапі nativeModules (jest.setup.js)
function build({ png = true, clipboard = true, photos = true, picker = true } = {}) {
  if (png) nativeModules.set('InstagramStories', nativeModules.instagramStories());
  if (clipboard) nativeModules.set('ExpoClipboard');
  if (photos) nativeModules.set('ExpoMediaLibraryNext');
  if (picker) nativeModules.set('ExponentImagePicker');
}

beforeEach(() => {
  jest.clearAllMocks();
  // знімки нумеруються з 1 у кожному тесті: так видно, який файл куди пішов
  let n = 0;
  captureView.mockImplementation(async () => 'file:///tmp/shot' + ++n + '.png');
  mockDeleted.length = 0;
  storiesSupported.mockReturnValue(true);
  storiesAvailable.mockResolvedValue(true);
  shareToStories.mockResolvedValue(true);
});
afterEach(() => nativeModules.reset());

async function open(payload, { onClose = () => {} } = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ShareSheet visible payload={payload} onClose={onClose} t={t} />
      </SafeAreaProvider>
    );
  });
  // FadeIn у аркуші стартує із затримкою — даємо їй відіграти, поки тест живий
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  return tree;
}

const button = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress)[0] || null;
const tab = (tree, label) => tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label)[0] || null;
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const press = (tree, label) => act(async () => button(tree, label).props.onPress());
const unmount = (tree) => act(async () => tree.unmount());

describe('modes', () => {
  test.each([
    ['a scanned word', scanned],
    ['a scene', scene],
    ['an achievement', achievement],
  ])('%s opens in Sticker mode, Card is the second tab', async (_, payload) => {
    build();
    const tree = await open(payload);
    expect(tab(tree, t('shareModeSticker')).props.accessibilityState).toEqual({ selected: true });
    expect(tab(tree, t('shareModeCard')).props.accessibilityState).toEqual({ selected: false });
    expect(texts(tree)).toContain(t('shareStickerHint'));
    await unmount(tree);
  });

  test('the week is a card only: no tabs, no sticker', async () => {
    build();
    const tree = await open(week);
    expect(tab(tree, t('shareModeSticker'))).toBeNull();
    expect(texts(tree)).not.toContain(t('shareStickerHint'));
    expect(button(tree, t('shareStories'))).not.toBeNull();
    await unmount(tree);
  });

  test('a word with a photo has two looks to swipe between', async () => {
    build();
    const tree = await open(fromDictionary);
    expect(button(tree, t('shareStyleObject'))).not.toBeNull();
    expect(button(tree, t('shareStyleWord'))).not.toBeNull();
    await unmount(tree);
    const noPhoto = await open({ kind: 'word', word: { ...photoWord, photo: null } });
    expect(button(noPhoto, t('shareStyleObject'))).toBeNull();
    await unmount(noPhoto);
  });
});

// share.md §5.2: є/немає Instagram × є/немає тла з payload
describe('main button', () => {
  test('Instagram + backdrop → «Stories with this photo» and the library link under it', async () => {
    build();
    const tree = await open(scanned);
    expect(button(tree, t('shareStoriesThisPhoto'))).not.toBeNull();
    expect(texts(tree)).toContain(t('shareStoriesPickOther'));
    await unmount(tree);
  });

  test('Instagram, no backdrop → «Stories with your photo», no link', async () => {
    build();
    const tree = await open(fromDictionary);
    expect(button(tree, t('shareStoriesMyPhoto'))).not.toBeNull();
    expect(texts(tree)).not.toContain(t('shareStoriesPickOther'));
    await unmount(tree);
  });

  test.each([
    ['with', scanned],
    ['without', fromDictionary],
  ])('no Instagram, %s backdrop → «Copy sticker»', async (_, payload) => {
    storiesAvailable.mockResolvedValue(false);
    build();
    const tree = await open(payload);
    expect(button(tree, t('shareCopyCta'))).not.toBeNull();
    expect(button(tree, t('shareStoriesThisPhoto'))).toBeNull();
    expect(button(tree, t('shareStoriesPlain'))).toBeNull();
    // копіювання вже головна дія — плиткою не дублюється
    expect(button(tree, t('shareCopy'))).toBeNull();
    expect(button(tree, t('shareSave'))).not.toBeNull();
    expect(button(tree, t('shareMore'))).not.toBeNull();
    await unmount(tree);
  });

  test('old dev build: no copy, no save, no red screen — just the system menu', async () => {
    storiesSupported.mockReturnValue(false);
    const tree = await open(scanned);
    expect(button(tree, t('shareCta'))).not.toBeNull();
    for (const k of ['shareCopy', 'shareCopyCta', 'shareSave', 'shareMore', 'shareStoriesPlain']) expect(button(tree, t(k))).toBeNull();
    expect(storiesAvailable).not.toHaveBeenCalled();
    await unmount(tree);
  });
});

describe('Instagram Stories', () => {
  test('«Stories with this photo»: the scan frame as background, the sticker on top, no colours', async () => {
    build();
    const tree = await open(scanned);
    await press(tree, t('shareStoriesThisPhoto'));
    expect(captureView).toHaveBeenCalledWith(expect.anything(), { size: stickerPixels(372) });
    expect(stickerPixels(372)).toEqual({ w: 900, h: 1116 });
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///cache/backdrop.jpg', stickerImage: 'file:///tmp/shot1.png' });
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'word', format: 'sticker', style: 'object', target: 'stories_photo' });
    await unmount(tree);
  });

  test('the Stories tile puts the sticker on the icon gradient', async () => {
    build();
    const tree = await open(achievement);
    await press(tree, t('shareStoriesPlain'));
    expect(shareToStories).toHaveBeenCalledWith({
      stickerImage: expect.stringMatching(/^file:\/\/\/tmp\/shot\d+\.png$/),
      topColor: STORIES_GRADIENT[0],
      bottomColor: STORIES_GRADIENT[1],
    });
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'achievement', format: 'sticker', style: 'badge', target: 'stories_plain' });
    await unmount(tree);
  });

  test('the scene shares its own photo as the background', async () => {
    build();
    const tree = await open(scene);
    await press(tree, t('shareStoriesThisPhoto'));
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///docs/scene.jpg', stickerImage: expect.any(String) });
    await unmount(tree);
  });

  test('library: cancelling is silent — no Stories, no error, no statistics, no capture', async () => {
    build();
    const tree = await open(scanned);
    await press(tree, t('shareStoriesPickOther'));
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(shareToStories).not.toHaveBeenCalled();
    expect(captureView).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(t('shareError'));
    await unmount(tree);
  });

  test('library: the picked photo, normalised, goes as the background and is deleted after', async () => {
    build();
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///picked.heic', width: 3024, height: 4032 }] });
    const tree = await open(fromDictionary);
    await press(tree, t('shareStoriesMyPhoto'));
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///cache/picked-bg.jpg', stickerImage: expect.any(String) });
    expect(mockDeleted).toEqual(['file:///cache/picked-bg.jpg']);
    expect(track).toHaveBeenLastCalledWith('share', expect.objectContaining({ target: 'stories_gallery' }));
    await unmount(tree);
  });

  test('if Instagram does not open, the sheet says so and stays', async () => {
    build();
    shareToStories.mockResolvedValueOnce(false);
    const tree = await open(scanned);
    await press(tree, t('shareStoriesThisPhoto'));
    expect(texts(tree)).toContain(t('shareStoriesError'));
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(track).not.toHaveBeenCalled();
    await unmount(tree);
  });
});

describe('copy and save', () => {
  test('copy: a toast, a success tap, VoiceOver hears it, statistics count it', async () => {
    build();
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    expect(nativeModules.get('InstagramStories').copyPng).toHaveBeenCalledWith('file:///tmp/shot1.png');
    expect(texts(tree)).toContain(t('shareCopied'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(announce).toHaveBeenCalledWith(t('shareCopied'));
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'word', format: 'sticker', style: 'object', target: 'copy' });
    expect(JSON.stringify(track.mock.calls)).not.toContain('mug');
    await unmount(tree);
  });

  test('copy, then save: the sticker is captured once', async () => {
    build();
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    await press(tree, t('shareSave'));
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///tmp/shot1.png');
    expect(texts(tree)).toContain(t('shareSaved'));
    await unmount(tree);
  });

  test('save denied: the reason and a way to Settings', async () => {
    build();
    MediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: false });
    const settings = jest.spyOn(Linking, 'openSettings').mockImplementation(async () => {});
    const tree = await open(scanned);
    await press(tree, t('shareSave'));
    expect(texts(tree)).toContain(t('shareSaveDenied'));
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
    await press(tree, t('shareOpenSettings'));
    expect(settings).toHaveBeenCalledTimes(1);
    settings.mockRestore();
    await unmount(tree);
  });

  test('two quick taps → one action', async () => {
    build();
    let finish;
    captureView.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const tree = await open(scanned);
    const copy = button(tree, t('shareCopy'));
    await act(async () => {
      copy.props.onPress();
    });
    expect(button(tree, t('shareCopy')).props.accessibilityState).toEqual({ busy: true });
    await act(async () => {
      copy.props.onPress();
      button(tree, t('shareSave')).props.onPress();
      button(tree, t('shareStoriesThisPhoto')).props.onPress();
    });
    await act(async () => finish('file:///tmp/slow.png'));
    expect(captureView).toHaveBeenCalledTimes(1);
    expect(nativeModules.get('InstagramStories').copyPng).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
    expect(shareToStories).not.toHaveBeenCalled();
    await unmount(tree);
  });

  test('closing the sheet while capturing: the action is dropped', async () => {
    build();
    let finish;
    captureView.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const tree = await open(scanned);
    await act(async () => {
      button(tree, t('shareCopy')).props.onPress();
    });
    await act(async () => {
      button(tree, t('shareClose')).props.onPress();
    });
    await act(async () => finish('file:///tmp/late.png'));
    expect(nativeModules.get('InstagramStories').copyPng).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
    await unmount(tree);
  });

  test('another look is a new capture; the old file and the last one are released', async () => {
    build();
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    const scroller = tree.root.findAllByType(ScrollView)[0];
    await act(async () => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: 520 - 40 } } }));
    await press(tree, t('shareCopy'));
    expect(captureView).toHaveBeenCalledTimes(2);
    expect(releaseShot).toHaveBeenCalledWith('file:///tmp/shot1.png');
    expect(track).toHaveBeenLastCalledWith('share', expect.objectContaining({ style: 'word', target: 'copy' }));
    await unmount(tree);
    expect(releaseShot).toHaveBeenCalledWith('file:///tmp/shot2.png');
  });
});

describe('Card mode works as before', () => {
  async function cards(payload = scanned) {
    build();
    const tree = await open(payload);
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    return tree;
  }

  test('the card goes to Stories as a full-screen background', async () => {
    const tree = await cards();
    await press(tree, t('shareStories'));
    expect(captureView).toHaveBeenCalledWith(expect.anything(), { size: exportPixels('sticker') });
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: expect.any(String) });
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'word', format: 'card', template: 'sticker', target: 'stories_card' });
    await unmount(tree);
  });

  test('palettes, «More» with the card’s file name, copy and save of the 1080×1920 PNG', async () => {
    const tree = await cards();
    expect(button(tree, t('sharePalGraphite'))).not.toBeNull();
    await press(tree, t('shareMore'));
    expect(shareFile).toHaveBeenCalledWith(expect.any(String), { dialogTitle: t('shareTitleWord'), fileName: 'lingualens-sticker.png' });
    await press(tree, t('shareSave'));
    // той самий знімок картки — удруге не знімаємо
    expect(captureView).toHaveBeenCalledTimes(1);
    await press(tree, t('sharePalGraphite'));
    await press(tree, t('shareCopy'));
    expect(captureView).toHaveBeenCalledTimes(2);
    await unmount(tree);
  });

  test('without Instagram the main button is the system menu', async () => {
    storiesAvailable.mockResolvedValue(false);
    const tree = await cards(achievement);
    await press(tree, t('shareCta'));
    expect(shareFile).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ fileName: 'lingualens-achievement.png' }));
    expect(track).toHaveBeenLastCalledWith('share', { kind: 'achievement', format: 'card', template: 'achievement', target: 'system' });
    await unmount(tree);
  });

  test('the cutout card is gone; the photo card is «Object»', async () => {
    const tree = await cards();
    expect(button(tree, t('shareTplSticker'))).not.toBeNull();
    expect(t('shareTplSticker')).toBe('Object');
    // шаблону «Без тла» немає, як і його назви в рядках
    expect(button(tree, 'Cutout')).toBeNull();
    expect(t('shareTplCutout')).toBe('shareTplCutout');
    await unmount(tree);
  });
});

test('a failed system share is not counted', async () => {
  shareFile.mockImplementationOnce(async () => {
    throw Object.assign(new Error('x'), { code: 'SHARE_UNAVAILABLE' });
  });
  storiesSupported.mockReturnValue(false);
  const tree = await open(fromDictionary);
  await press(tree, t('shareCta'));
  expect(track).not.toHaveBeenCalled();
  expect(texts(tree)).toContain(t('shareUnavailable'));
  await unmount(tree);
});
