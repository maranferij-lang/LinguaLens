// Альтернативна іконка «Око Лінго» в збірці (plugins/withAlternateIcons.js):
// без неї A/B-тест іконки в App Store (Product Page Optimization) неможливий
// до нової версії — Apple показує в тесті лише іконки з бінарника
// опублікованої версії. Фікстура — project.pbxproj, який prebuild Expo SDK 57
// робить для LinguaLens (з таргетом віджетів). Повну перевірку дає
// `npx expo prebuild --platform ios` (TESTING.md).
import fs from 'fs';
import os from 'os';
import path from 'path';

const plugin = require('../plugins/withAlternateIcons');
const appJson = require('../app.json');
const xcode = require('xcode');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'ios');
const EYE = './assets/icon-eye.png';

describe('icon set', () => {
  let dir;
  const req = () => ({ projectRoot: ROOT, platformProjectRoot: path.join(dir, 'ios'), projectName: 'LinguaLens' });
  const set = () => path.join(dir, 'ios', 'LinguaLens', 'Images.xcassets', 'AppIcon-Eye.appiconset');
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alt-icons-'));
    fs.mkdirSync(path.join(dir, 'ios', 'LinguaLens', 'Images.xcassets', 'AppIcon.appiconset'), { recursive: true });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  test('AppIcon-Eye.appiconset next to AppIcon: the PNG as is and a Contents.json like Expo’s own set', () => {
    plugin.writeIconSet(req(), 'AppIcon-Eye', EYE);
    expect(fs.readdirSync(set()).sort()).toEqual(['AppIcon-Eye-1024x1024@1x.png', 'Contents.json']);
    expect(fs.readFileSync(path.join(set(), 'AppIcon-Eye-1024x1024@1x.png')).equals(fs.readFileSync(path.join(ROOT, EYE)))).toBe(true);
    expect(JSON.parse(fs.readFileSync(path.join(set(), 'Contents.json'), 'utf8'))).toEqual({
      images: [{ filename: 'AppIcon-Eye-1024x1024@1x.png', idiom: 'universal', platform: 'ios', size: '1024x1024' }],
      info: { version: 1, author: 'expo' },
    });
    // основний набір Expo не зачеплено
    expect(fs.readdirSync(path.join(dir, 'ios', 'LinguaLens', 'Images.xcassets')).sort()).toEqual(['AppIcon-Eye.appiconset', 'AppIcon.appiconset']);
  });

  test('a second prebuild without --clean writes the same two files, leftovers go', () => {
    plugin.writeIconSet(req(), 'AppIcon-Eye', EYE);
    fs.writeFileSync(path.join(set(), 'old-name.png'), 'x');
    plugin.writeIconSet(req(), 'AppIcon-Eye', EYE);
    expect(fs.readdirSync(set()).sort()).toEqual(['AppIcon-Eye-1024x1024@1x.png', 'Contents.json']);
  });

  test('no asset catalog means an unfamiliar template: prebuild fails instead of a binary without the icon', () => {
    fs.rmSync(path.join(dir, 'ios', 'LinguaLens', 'Images.xcassets'), { recursive: true });
    expect(() => plugin.writeIconSet(req(), 'AppIcon-Eye', EYE)).toThrow(/Images\.xcassets/);
  });
});

describe('PNG check', () => {
  const png = (f) => fs.readFileSync(path.join(ROOT, 'assets', f));

  test('the alternate icon passes: 1024 × 1024 RGB', () => {
    expect(() => plugin.assertIconPng(png('icon-eye.png'), 'icon-eye.png')).not.toThrow();
    expect(() => plugin.assertIconPng(png('icon.png'), 'icon.png')).not.toThrow();
  });

  test('alpha, a wrong size or not a PNG fail prebuild', () => {
    // splash-icon.png — 1024 × 1024, але RGBA
    expect(() => plugin.assertIconPng(png('splash-icon.png'), 'splash')).toThrow(/тип кольору 6/);
    expect(() => plugin.assertIconPng(png('app-icon-192.png'), 'small')).toThrow(/192 × 192/);
    expect(() => plugin.assertIconPng(Buffer.from('not a png at all, just some text'), 'txt')).toThrow(/не PNG/);
    // RGB, але з tRNS — теж прозорість
    const rgb = png('icon-eye.png');
    const trns = Buffer.concat([rgb.subarray(0, 33), Buffer.from([0, 0, 0, 6]), Buffer.from('tRNS'), Buffer.alloc(10), rgb.subarray(33)]);
    expect(() => plugin.assertIconPng(trns, 'trns')).toThrow(/tRNS/);
  });
});

describe('options', () => {
  test('a name like AppIcon-Eye and a path are required', () => {
    expect(plugin.iconsFromProps({ icons: { 'AppIcon-Eye': EYE } })).toEqual([['AppIcon-Eye', EYE]]);
    expect(() => plugin.iconsFromProps({})).toThrow(/icons/);
    expect(() => plugin.iconsFromProps(undefined)).toThrow(/icons/);
    expect(() => plugin.iconsFromProps({ icons: { 'Eye icon': EYE } })).toThrow(/AppIcon-Eye/);
    expect(() => plugin.iconsFromProps({ icons: { AppIcon: EYE } })).toThrow(/AppIcon-Eye/);
    expect(() => plugin.iconsFromProps({ icons: { 'AppIcon-Eye': '' } })).toThrow(/PNG/);
  });

  test('the plugin adds an Xcode project mod', () => {
    const out = plugin({ name: 'LinguaLens', slug: 'lingualens' }, { icons: { 'AppIcon-Eye': EYE } });
    expect(typeof out.mods.ios.xcodeproj).toBe('function');
  });
});

describe('Xcode project', () => {
  const load = () => {
    const project = xcode.project(path.join(FIX, 'LinguaLens.sdk57.pbxproj'));
    project.parseSync();
    return project;
  };
  // { назва таргета: { конфігурація: значення INCLUDE_ALL } }, а також проєкт
  const settings = (project) => {
    const o = project.hash.project.objects;
    const list = (id) =>
      Object.fromEntries(
        o.XCConfigurationList[id].buildConfigurations.map(({ value }) => [o.XCBuildConfiguration[value].name, o.XCBuildConfiguration[value].buildSettings[plugin.INCLUDE_ALL]])
      );
    const out = {};
    for (const [id, t] of Object.entries(o.PBXNativeTarget)) if (!id.endsWith('_comment')) out[t.name] = list(t.buildConfigurationList);
    const proj = Object.values(o.PBXProject).find((p) => typeof p === 'object');
    out.project = list(proj.buildConfigurationList);
    return out;
  };

  test('“Include All App Icon Assets” is on for the app in Debug and Release, not for the widgets', () => {
    const project = load();
    expect(settings(project).LinguaLens).toEqual({ Debug: undefined, Release: undefined });
    plugin.includeAllAppIcons(project, 'LinguaLens');
    expect(settings(project)).toEqual({
      LinguaLens: { Debug: 'YES', Release: 'YES' },
      ExpoWidgetsTarget: { Debug: undefined, Release: undefined },
      project: { Debug: undefined, Release: undefined },
    });
    const text = project.writeSync();
    expect(text.match(/ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES;/g)).toHaveLength(2);
    // основна іконка лишається AppIcon
    expect(text.match(/ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;/g)).toHaveLength(2);
  });

  test('twice is the same as once', () => {
    const project = load();
    plugin.includeAllAppIcons(project, 'LinguaLens');
    const once = project.writeSync();
    plugin.includeAllAppIcons(project, 'LinguaLens');
    expect(project.writeSync()).toBe(once);
  });
});

test('app.json: the eye icon after every other plugin, right before withSceneLifecycle, which stays last', () => {
  const names = appJson.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
  expect(names.slice(-2)).toEqual(['./plugins/withAlternateIcons', './plugins/withSceneLifecycle']);
  const opts = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === './plugins/withAlternateIcons')[1];
  expect(opts).toEqual({ icons: { 'AppIcon-Eye': EYE } });
  expect(fs.existsSync(path.join(ROOT, EYE))).toBe(true);
});
