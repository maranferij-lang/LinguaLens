// Дії аркуша «Поділитися» (share.md §5.3, §8, §12.3): копіювати, зберегти
// у «Фото», своє фото тлом, Instagram Stories. Головне — нативний пакет,
// якого в збірці немає, не require-иться зовсім: лінивий require Metro не
// віддає в catch, і стара dev-збірка показала б червоний екран.
import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import {
  backgroundPlan,
  copyImage,
  dropFile,
  normalizeBackground,
  pickBackground,
  saveImage,
  storiesWith,
} from '../src/share/actions';
import { canCopy, canCopyPng, canPick, canSave } from '../src/share/native';
import { shareToStories } from '../src/share/instagram';
import { STORIES_GRADIENT } from '../src/share/layout';

jest.mock('../src/share/instagram', () => ({ shareToStories: jest.fn(async () => true) }));

// Файли: base64 для запасного буфера й видалення тимчасового тла
const mockFiles = { deleted: [], base64: jest.fn(async () => 'UE5H') };
jest.mock('expo-file-system', () => ({
  File: jest.fn().mockImplementation((uri) => ({
    uri,
    base64: () => mockFiles.base64(uri),
    delete: () => mockFiles.deleted.push(uri),
  })),
}));

// Маніпулятор: перший manipulate(uri).renderAsync() — «декодоване» фото з
// розміром mockDecoded (уже з поворотом EXIF), далі — ланцюжок операцій.
let mockDecoded = { width: 1170, height: 2532 };
const mockOps = [];
const mockSaves = [];
jest.mock('expo-image-manipulator', () => {
  const manipulate = (source) => {
    const ops = [];
    const c = {
      crop: (r) => (ops.push({ crop: r }), c),
      resize: (r) => (ops.push({ resize: r }), c),
      renderAsync: async () => {
        if (typeof source === 'string') return { ...mockDecoded, release() {} };
        mockOps.push(...ops);
        return {
          saveAsync: async (opts) => {
            mockSaves.push(opts);
            return { uri: 'file:///cache/bg.jpg', width: 1080, height: 1920 };
          },
          release() {},
        };
      },
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg', PNG: 'png' } };
});

const os = Platform.OS;
beforeEach(() => {
  jest.clearAllMocks();
  mockFiles.deleted.length = 0;
  mockOps.length = 0;
  mockSaves.length = 0;
  mockDecoded = { width: 1170, height: 2532 };
});
afterEach(() => {
  nativeModules.reset();
  Platform.OS = os;
});

describe('without the native modules (old dev build, Expo Go without them)', () => {
  test('nothing is available and no package is ever required', () => {
    jest.isolateModules(() => {
      const required = [];
      for (const name of ['expo-clipboard', 'expo-media-library', 'expo-image-picker']) {
        jest.doMock(name, () => {
          required.push(name);
          throw new Error(name + ' must not be required without its native module');
        });
      }
      const native = require('../src/share/native');
      const actions = require('../src/share/actions');
      expect(native.canCopy()).toBe(false);
      expect(native.canSave()).toBe(false);
      expect(native.canPick()).toBe(false);
      expect(native.canCopyPng()).toBe(false);
      return Promise.all([
        expect(actions.copyImage('file:///tmp/s.png')).rejects.toMatchObject({ code: 'COPY_FAILED' }),
        expect(actions.saveImage('file:///tmp/s.png')).rejects.toMatchObject({ code: 'SAVE_FAILED' }),
        expect(actions.pickBackground()).resolves.toBeNull(),
      ]).then(() => expect(required).toEqual([]));
    });
  });

  test('our module from an older build has no copyPng — that is not a copy path', () => {
    nativeModules.set('InstagramStories', { isAvailable: jest.fn(), share: jest.fn() });
    expect(canCopyPng()).toBe(false);
    expect(canCopy()).toBe(false);
  });

  test('web: nothing native at all, even if a module answers', () => {
    nativeModules.set('ExpoClipboard');
    Platform.OS = 'web';
    expect(canCopy()).toBe(false);
    expect(canPick()).toBe(false);
    expect(canSave()).toBe(false);
  });
});

describe('copy', () => {
  test('copyPng puts the PNG bytes on the pasteboard; expo-clipboard is not touched', async () => {
    const stories = nativeModules.set('InstagramStories', nativeModules.instagramStories());
    nativeModules.set('ExpoClipboard');
    expect(await copyImage('file:///tmp/s.png')).toBe('png');
    expect(stories.copyPng).toHaveBeenCalledTimes(1);
    expect(stories.copyPng).toHaveBeenCalledWith('file:///tmp/s.png');
    expect(Clipboard.setImageAsync).not.toHaveBeenCalled();
  });

  test('Expo Go: base64 of the file into expo-clipboard, once', async () => {
    nativeModules.set('ExpoClipboard');
    expect(await copyImage('file:///tmp/s.png')).toBe('clipboard');
    expect(mockFiles.base64).toHaveBeenCalledWith('file:///tmp/s.png');
    expect(Clipboard.setImageAsync).toHaveBeenCalledTimes(1);
    expect(Clipboard.setImageAsync).toHaveBeenCalledWith('UE5H');
  });

  test('copyPng failed — falls back to expo-clipboard if there is one, otherwise COPY_FAILED', async () => {
    const stories = nativeModules.set('InstagramStories', nativeModules.instagramStories());
    stories.copyPng.mockResolvedValueOnce(false);
    nativeModules.set('ExpoClipboard');
    expect(await copyImage('file:///tmp/s.png')).toBe('clipboard');
    nativeModules.delete('ExpoClipboard');
    stories.copyPng.mockRejectedValueOnce(new Error('pasteboard'));
    await expect(copyImage('file:///tmp/s.png')).rejects.toMatchObject({ code: 'COPY_FAILED' });
  });
});

describe('save to Photos', () => {
  beforeEach(() => nativeModules.set('ExpoMediaLibraryNext'));

  test('asks only for “add” access (writeOnly), then imports the PNG as is', async () => {
    await saveImage('file:///tmp/s.png');
    expect(MediaLibrary.getPermissionsAsync).toHaveBeenCalledWith(true);
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalledWith(false);
    expect(MediaLibrary.Asset.create).toHaveBeenCalledWith('file:///tmp/s.png');
  });

  test('already allowed: no system prompt', async () => {
    MediaLibrary.getPermissionsAsync.mockResolvedValueOnce({ status: 'granted', granted: true, canAskAgain: true });
    await saveImage('file:///tmp/s.png');
    expect(MediaLibrary.requestPermissionsAsync).not.toHaveBeenCalled();
    expect(MediaLibrary.Asset.create).toHaveBeenCalledTimes(1);
  });

  test('denied → SAVE_DENIED with canAskAgain, nothing saved', async () => {
    MediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: false });
    await expect(saveImage('file:///tmp/s.png')).rejects.toMatchObject({ code: 'SAVE_DENIED', canAskAgain: false });
    MediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: true });
    await expect(saveImage('file:///tmp/s.png')).rejects.toMatchObject({ code: 'SAVE_DENIED', canAskAgain: true });
    expect(MediaLibrary.Asset.create).not.toHaveBeenCalled();
  });

  test('the import itself fails → SAVE_FAILED', async () => {
    MediaLibrary.Asset.create.mockRejectedValueOnce(new Error('no extension'));
    await expect(saveImage('file:///tmp/s')).rejects.toMatchObject({ code: 'SAVE_FAILED' });
  });

  test('iOS only for now', () => {
    expect(canSave()).toBe(true);
    Platform.OS = 'android';
    expect(canSave()).toBe(false);
  });
});

describe('your own photo as the Stories background', () => {
  beforeEach(() => nativeModules.set('ExponentImagePicker'));

  test('cancelled: null, nothing rendered', async () => {
    expect(await pickBackground()).toBeNull();
    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
      expect.objectContaining({ mediaTypes: ['images'], allowsEditing: false, preferredAssetRepresentationMode: 'compatible' })
    );
    expect(mockOps).toEqual([]);
  });

  test('a portrait photo is cropped to 9:16 and scaled to 1080×1920, JPEG', async () => {
    ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///p.heic', width: 1170, height: 2532 }] });
    const bg = await pickBackground();
    expect(bg).toEqual({ uri: 'file:///cache/bg.jpg', width: 1080, height: 1920 });
    expect(mockOps).toEqual([{ crop: { originX: 0, originY: 226, width: 1170, height: 2080 } }, { resize: { width: 1080 } }]);
  });

  test('the decoded size wins over the picker’s (EXIF rotation)', async () => {
    // вибір фото каже «горизонтальне», а після повороту воно вертикальне
    mockDecoded = { width: 1170, height: 2532 };
    await normalizeBackground({ uri: 'file:///p.jpg', width: 2532, height: 1170 });
    expect(mockOps[0]).toEqual({ crop: { originX: 0, originY: 226, width: 1170, height: 2080 } });
  });

  test('plan: landscape is not cropped, only the long side capped; small photos stay as they are', () => {
    expect(backgroundPlan(4032, 3024)).toEqual({ crop: null, resize: { width: 1920 } });
    expect(backgroundPlan(3000, 4000)).toEqual({ crop: null, resize: { height: 1920 } });
    expect(backgroundPlan(800, 600)).toEqual({ crop: null, resize: null });
    const p = backgroundPlan(900, 1600);
    expect(p.crop).toEqual({ x: 0, y: 0, width: 900, height: 1600 });
    expect(p.resize).toBeNull();
    expect(backgroundPlan(0, 0)).toEqual({ crop: null, resize: null });
  });

  test('always saved as JPEG 0.9', async () => {
    mockDecoded = { width: 4032, height: 3024 };
    await normalizeBackground({ uri: 'file:///l.heic', width: 4032, height: 3024 });
    expect(mockOps).toEqual([{ resize: { width: 1920 } }]);
    expect(mockSaves).toEqual([{ compress: 0.9, format: 'jpeg' }]);
  });
});

describe('Instagram Stories', () => {
  test('a background and the sticker as two layers, no colours', async () => {
    await storiesWith({ background: 'file:///scan.jpg', sticker: 'file:///s.png' });
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///scan.jpg', stickerImage: 'file:///s.png' });
  });

  test('no photo: the sticker on the app icon gradient', async () => {
    await storiesWith({ sticker: 'file:///s.png' });
    expect(shareToStories).toHaveBeenCalledWith({ stickerImage: 'file:///s.png', topColor: STORIES_GRADIENT[0], bottomColor: STORIES_GRADIENT[1] });
  });

  test('a card goes as a full-screen background only', async () => {
    await storiesWith({ background: 'file:///card.png' });
    expect(shareToStories).toHaveBeenCalledWith({ backgroundImage: 'file:///card.png' });
  });

  test('Instagram did not open → STORIES_FAILED', async () => {
    shareToStories.mockResolvedValueOnce(false);
    await expect(storiesWith({ sticker: 'file:///s.png' })).rejects.toMatchObject({ code: 'STORIES_FAILED' });
  });
});

test('temporary files are deleted; data: URIs are left alone', () => {
  dropFile('file:///cache/bg.jpg');
  dropFile('data:image/png;base64,AAAA');
  dropFile(null);
  expect(mockFiles.deleted).toEqual(['file:///cache/bg.jpg']);
});
