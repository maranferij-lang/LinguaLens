// Обгортка «Instagram Stories»: кнопка лише там, де все справді спрацює, і
// жодних винятків назовні — у гіршому разі просто false.
import { Platform } from 'react-native';
import { shareToStories, storiesAvailable, storiesSupported } from '../src/share/instagram';

let mockStories = null;
let mockAppId = '1234567890';
jest.mock('../modules/instagram-stories', () => ({
  __esModule: true,
  get default() {
    return mockStories;
  },
}));
jest.mock('../src/config', () => ({
  get FACEBOOK_APP_ID() {
    return mockAppId;
  },
}));

const os = Platform.OS;
beforeEach(() => {
  mockStories = { isAvailable: jest.fn(async () => true), share: jest.fn(async () => true) };
  mockAppId = '1234567890';
});
afterEach(() => {
  Platform.OS = os;
});

describe('availability', () => {
  test('iOS build with the module, an App ID and Instagram installed', async () => {
    expect(storiesSupported()).toBe(true);
    expect(await storiesAvailable()).toBe(true);
  });

  test('Instagram not installed', async () => {
    mockStories.isAvailable.mockResolvedValueOnce(false);
    expect(await storiesAvailable()).toBe(false);
  });

  test.each([
    ['no native module (Expo Go, web)', () => (mockStories = null)],
    ['no Meta App ID in the build', () => (mockAppId = '')],
    ['Android', () => (Platform.OS = 'android')],
  ])('%s: no button, Instagram is not even asked', async (_, setup) => {
    const module = mockStories;
    setup();
    expect(storiesSupported()).toBe(false);
    expect(await storiesAvailable()).toBe(false);
    expect(module.isAvailable).not.toHaveBeenCalled();
  });

  test('a native error means “not available”, not a crash', async () => {
    mockStories.isAvailable.mockRejectedValueOnce(new Error('boom'));
    expect(await storiesAvailable()).toBe(false);
  });
});

describe('shareToStories', () => {
  test('a card goes as the background, with our App ID and nothing else', async () => {
    expect(await shareToStories({ backgroundImage: 'file:///tmp/card.png' })).toBe(true);
    expect(mockStories.share).toHaveBeenCalledWith({ appId: '1234567890', backgroundImage: 'file:///tmp/card.png' });
  });

  test('a cutout goes as a sticker on the palette colour', async () => {
    await shareToStories({ stickerImage: 'file:///tmp/cut.png', topColor: '#5B4FD6', bottomColor: '#5B4FD6' });
    expect(mockStories.share).toHaveBeenCalledWith({
      appId: '1234567890',
      stickerImage: 'file:///tmp/cut.png',
      topColor: '#5B4FD6',
      bottomColor: '#5B4FD6',
    });
  });

  test('nothing to share, no App ID or no module: false without calling native', async () => {
    expect(await shareToStories({})).toBe(false);
    mockAppId = '';
    expect(await shareToStories({ backgroundImage: 'file:///a.png' })).toBe(false);
    expect(mockStories.share).not.toHaveBeenCalled();
    mockStories = null;
    mockAppId = '1';
    expect(await shareToStories({ backgroundImage: 'file:///a.png' })).toBe(false);
  });

  test('Instagram did not open, or native threw: false', async () => {
    mockStories.share.mockResolvedValueOnce(false);
    expect(await shareToStories({ backgroundImage: 'file:///a.png' })).toBe(false);
    mockStories.share.mockRejectedValueOnce(new Error('pasteboard'));
    expect(await shareToStories({ backgroundImage: 'file:///a.png' })).toBe(false);
  });
});
