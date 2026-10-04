// Заглушки нативних пакетів v1.3 із jest.setup.js (план §5.16): на них
// спираються тести наліпок, віджетів і онбордингу в паралельних гілках,
// тож їхня поведінка — теж контракт.
import { requireOptionalNativeModule } from 'expo';
import * as Clipboard from 'expo-clipboard';
import * as MediaLibrary from 'expo-media-library';
import * as ImagePicker from 'expo-image-picker';
import * as Widgets from 'expo-widgets';

afterEach(() => {
  global.nativeModules.reset();
  Widgets.__reset();
});

describe('requireOptionalNativeModule', () => {
  test('nothing is “installed” by default — like Expo Go or an old dev build', () => {
    for (const name of ['ExpoClipboard', 'ExpoMediaLibraryNext', 'ExponentImagePicker', 'InstagramStories']) {
      expect(requireOptionalNativeModule(name)).toBeNull();
    }
  });

  test('other native modules still come from jest-expo (haptics keeps working)', async () => {
    const Haptics = require('expo-haptics');
    await expect(Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)).resolves.toBeUndefined();
  });

  test('a test installs and removes modules', () => {
    const clip = global.nativeModules.set('ExpoClipboard');
    expect(requireOptionalNativeModule('ExpoClipboard')).toBe(clip);
    global.nativeModules.delete('ExpoClipboard');
    expect(requireOptionalNativeModule('ExpoClipboard')).toBeNull();
  });

  test('InstagramStories with copyPng, read by our module at import time', async () => {
    global.nativeModules.set('InstagramStories', global.nativeModules.instagramStories());
    let mod;
    jest.isolateModules(() => {
      mod = require('../modules/instagram-stories').default;
    });
    await expect(mod.copyPng('file:///sticker.png')).resolves.toBe(true);
    expect(mod.copyPng).toHaveBeenCalledWith('file:///sticker.png');
    await expect(mod.isAvailable()).resolves.toBe(true);
  });
});

test('clipboard remembers the image', async () => {
  expect(await Clipboard.hasImageAsync()).toBe(false);
  await Clipboard.setImageAsync('iVBORw0KGgo=');
  expect(await Clipboard.hasImageAsync()).toBe(true);
  expect(Clipboard.setImageAsync).toHaveBeenCalledWith('iVBORw0KGgo=');
});

test('Photos: not asked yet, the request grants, Asset.create saves the file', async () => {
  expect((await MediaLibrary.getPermissionsAsync(true)).status).toBe('undetermined');
  expect((await MediaLibrary.requestPermissionsAsync(true)).granted).toBe(true);
  await expect(MediaLibrary.Asset.create('file:///sticker.png')).resolves.toMatchObject({ uri: 'file:///sticker.png' });
  MediaLibrary.requestPermissionsAsync.mockResolvedValueOnce({ status: 'denied', granted: false, canAskAgain: false });
  expect((await MediaLibrary.requestPermissionsAsync(true)).granted).toBe(false);
});

test('photo picker: cancelled by default, a photo on request', async () => {
  expect(await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] })).toEqual({ canceled: true, assets: null });
  ImagePicker.launchImageLibraryAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///p.jpg', width: 3, height: 4 }] });
  expect((await ImagePicker.launchImageLibraryAsync()).assets[0].uri).toBe('file:///p.jpg');
});

describe('expo-widgets', () => {
  test('the shared folder of the app group', () => {
    expect(Widgets.widgetsDirectory).toBe('file:///group/ExpoWidgets/');
  });

  test('three widgets from app.json; a typo throws like a missing widget would fail on the phone', () => {
    for (const name of ['WordOfDay', 'MyWords', 'Streak']) expect(() => Widgets.createWidget(name, () => null)).not.toThrow();
    expect(() => Widgets.createWidget('WordOfTheDay', () => null)).toThrow(/not in app.json/);
  });

  test('getTimeline returns what was written; a tap in the widget changes one entry', async () => {
    const w = Widgets.createWidget('Streak', () => null);
    const date = new Date(2026, 9, 25, 0, 0);
    w.updateTimeline([
      { date, props: { n: '3', state: 'done' } },
      { date: new Date(2026, 9, 25, 18), props: { n: '3', state: 'pending' } },
    ]);
    expect(Widgets.__widgets.Streak).toBe(w);
    Widgets.__interact('Streak', 1, { revealed: '1' });
    const got = await w.getTimeline();
    expect(got[0]).toEqual({ date, props: { n: '3', state: 'done' } });
    expect(got[1].props).toEqual({ n: '3', state: 'pending', revealed: '1' });
    // копія, а не живі записи
    got[0].props.n = 'x';
    expect(Widgets.__timeline('Streak')[0].props.n).toBe('3');
    w.updateSnapshot({ n: '4' });
    expect(Widgets.__timeline('Streak')).toHaveLength(1);
    expect(Widgets.__timeline('MyWords')).toBeNull();
  });
});
