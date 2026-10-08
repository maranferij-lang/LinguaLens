// Хаптика аркуша «Поділитися» (жовтень 2026): «Копіювати» і «Зберегти» дають
// один відгук (успіх чи помилку), а не легкий поштовх на старті плюс успіх
// за пів секунди. Цілі, що відкривають інший застосунок, лишаються з
// поштовхом на дотик: власного підтвердження в аркуші в них немає.
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import ShareSheet from '../src/share/ShareSheet';
import { captureView } from '../src/share/capture';
import { storiesAvailable, storiesSupported } from '../src/share/instagram';
import { makeT } from '../src/i18n';

jest.mock('../src/share/capture', () => ({
  captureView: jest.fn(),
  releaseShot: jest.fn(),
  shareFile: jest.fn(async () => {}),
}));
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

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const photoWord = { word: 'mug', translation: 'кружка', ipa: 'mʌɡ', lang: 'en', photo: 'file:///docs/stickers/mug.jpg', addedAt: 1 };
const scanned = { kind: 'word', word: photoWord, backdrop: 'file:///cache/backdrop.jpg' };

beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  captureView.mockImplementation(async () => 'file:///tmp/shot' + ++n + '.png');
  storiesSupported.mockReturnValue(true);
  storiesAvailable.mockResolvedValue(true);
  nativeModules.set('InstagramStories', nativeModules.instagramStories());
  nativeModules.set('ExpoClipboard');
  nativeModules.set('ExpoMediaLibraryNext');
  nativeModules.set('ExponentImagePicker');
});
afterEach(() => nativeModules.reset());

async function open(payload) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ShareSheet visible payload={payload} onClose={() => {}} t={t} />
      </SafeAreaProvider>
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  return tree;
}

const button = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress)[0] || null;
const press = (tree, label) => act(async () => button(tree, label).props.onPress());
const unmount = (tree) => act(async () => tree.unmount());

describe('one action, one buzz', () => {
  test('Copy: only the success tap, no light impact before it', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    await unmount(tree);
  });

  test('Save: only the success tap', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareSave'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    await unmount(tree);
  });

  test('a failed Save: only the error tap', async () => {
    MediaLibrary.Asset.create.mockRejectedValueOnce(new Error('disk'));
    const tree = await open(scanned);
    await press(tree, t('shareSave'));
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('error');
    await unmount(tree);
  });

  test('a slow capture changes nothing: still only the success tap, after the file is ready', async () => {
    let finish;
    captureView.mockImplementationOnce(() => new Promise((r) => (finish = r)));
    const tree = await open(scanned);
    await act(async () => {
      button(tree, t('shareCopy')).props.onPress();
    });
    await act(async () => finish('file:///tmp/slow.png'));
    // до готового знімка тиша: поштовху на старті немає
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });
});

describe('targets that leave the app keep the light tap on touch', () => {
  test('Stories with this photo: one light impact, no success tap from the sheet', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareStoriesThisPhoto'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await unmount(tree);
  });

  test('More (system sheet): one light impact', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareMore'));
    expect(Haptics.impactAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).toHaveBeenCalledWith('light');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    await unmount(tree);
  });
});
