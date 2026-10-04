// app.json для v1.3: три віджети з точними розмірами, плагіни «Фото» й вибору
// фото — і жоден із них не забирає в камери її дозвіл. Помилки тут не видно
// ні в jest, ні в Expo Go: вони вилазять лише в збірці (зламаний таргет
// віджетів, камера без NSCameraUsageDescription падає) або на перевірці
// App Store (ITMS-90683 без рядка про бібліотеку фото).
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const ROOT = path.join(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
const LOCALES = ['en', 'uk', 'de', 'es'];
const locale = (l) => JSON.parse(fs.readFileSync(path.join(ROOT, 'locales', `${l}.json`), 'utf8')).ios;
const plugin = (name) => {
  const p = app.plugins.find((x) => (Array.isArray(x) ? x[0] : x) === name);
  return Array.isArray(p) ? p[1] : p;
};

describe('widgets', () => {
  const cfg = plugin('expo-widgets');

  test('one app group, set explicitly', () => {
    expect(cfg.groupIdentifier).toBe('group.com.marik.lingualens');
  });

  test('three widgets with English gallery names and the planned sizes', () => {
    const got = Object.fromEntries(cfg.widgets.map((w) => [w.name, w.ios.supportedFamilies]));
    expect(got).toEqual({
      WordOfDay: ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular', 'accessoryInline'],
      MyWords: ['systemSmall', 'systemMedium', 'systemLarge', 'accessoryRectangular', 'accessoryInline'],
      // великий «Серія» з місячною картою — v1.3.1
      Streak: ['systemSmall', 'systemMedium', 'accessoryCircular', 'accessoryRectangular', 'accessoryInline'],
    });
    for (const w of cfg.widgets) {
      expect(w.displayName).toBeTruthy();
      expect(w.description).toBeTruthy();
      // назва стає іменем Swift-структури
      expect(w.name).toMatch(/^[A-Z][A-Za-z]+$/);
      // налаштовуваний віджет зник би на iOS 16 (widgets.md, Д4)
      expect(w.ios.configuration).toBeUndefined();
    }
  });
});

describe('photos', () => {
  const PICK = 'LinguaLens only opens the photo you pick, to put your sticker on it for Stories.';
  const SAVE = 'LinguaLens saves your stickers and cards to Photos when you tap “Save”.';

  test('media library: read text is honest, write text matches Info.plist, photos only', () => {
    expect(plugin('expo-media-library')).toEqual({
      photosPermission: PICK,
      savePhotosPermission: SAVE,
      isAccessMediaLocationEnabled: false,
      granularPermissions: ['photo'],
    });
    expect(app.ios.infoPlist.NSPhotoLibraryAddUsageDescription).toBe(SAVE);
  });

  test('image picker: same read text, no microphone', () => {
    expect(plugin('expo-image-picker')).toEqual({ photosPermission: PICK, microphonePermission: false });
  });

  // cameraPermission: false прибрав би NSCameraUsageDescription, який ставить
  // expo-camera, — і сканер упав би на першому ж запиті камери.
  test('no plugin switches the camera permission off', () => {
    const offenders = app.plugins
      .filter(Array.isArray)
      .filter(([, opts]) => opts && Object.prototype.hasOwnProperty.call(opts, 'cameraPermission') && opts.cameraPermission === false)
      .map(([name]) => name);
    expect(offenders).toEqual([]);
    expect(plugin('expo-camera').cameraPermission).toEqual(expect.any(String));
  });

  test('both photo keys and the camera key are translated in all four languages', () => {
    const en = locale('en');
    expect(en.NSPhotoLibraryUsageDescription).toBe(PICK);
    expect(en.NSPhotoLibraryAddUsageDescription).toBe(SAVE);
    for (const l of LOCALES) {
      const ios = locale(l);
      for (const key of ['NSCameraUsageDescription', 'NSPhotoLibraryUsageDescription', 'NSPhotoLibraryAddUsageDescription']) {
        expect([l, key, typeof ios[key]]).toEqual([l, key, 'string']);
        expect(ios[key]).toContain('LinguaLens');
        // типографіка як у src/i18n.js: без прямих лапок
        expect(ios[key]).not.toMatch(/['"]/);
        if (l !== 'en') expect(ios[key]).not.toBe(en[key]);
      }
    }
  });
});

// Справжній Info.plist після всіх конфіг-плагінів (як `npx expo config
// --type introspect`): рядок камери на місці, обидва рядки «Фото» є, а
// мікрофона немає — ми його ніколи не просимо.
test('the Info.plist that prebuild will write keeps the camera and has both photo keys', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/introspect-ios.js'), ROOT], { encoding: 'utf8', timeout: 60000 });
  const plist = JSON.parse(out).infoPlist;
  expect(plist.NSCameraUsageDescription).toBe(plugin('expo-camera').cameraPermission);
  expect(plist.NSPhotoLibraryUsageDescription).toBe(plugin('expo-image-picker').photosPermission);
  expect(plist.NSPhotoLibraryAddUsageDescription).toBe(app.ios.infoPlist.NSPhotoLibraryAddUsageDescription);
  expect(plist.NSMicrophoneUsageDescription).toBeUndefined();
}, 60000);
