// Життєвий цикл сцен для iOS 27 (plugins/withSceneLifecycle.js). Без нього
// збірка з Xcode 27 падає на запуску: EXC_BREAKPOINT у
// _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption. Фікстури —
// AppDelegate.swift і project.pbxproj, які prebuild Expo SDK 57 робить для
// LinguaLens (з таргетом віджетів). Повну перевірку дає `npm run sim`.
import fs from 'fs';
import os from 'os';
import path from 'path';

const plugin = require('../plugins/withSceneLifecycle');
const appJson = require('../app.json');
const xcode = require('xcode');

const FIX = path.join(__dirname, 'fixtures', 'ios');
const appDelegate = fs.readFileSync(path.join(FIX, 'AppDelegate.sdk57.swift'), 'utf8');

describe('AppDelegate', () => {
  const out = plugin.sceneAppDelegate(appDelegate);

  test('the fixture is the SDK 57 template that builds the window itself', () => {
    expect(appDelegate).toContain('window = UIWindow(frame: UIScreen.main.bounds)');
    expect(appDelegate).toContain('factory.startReactNative(');
    expect(appDelegate).not.toContain('ExpoReactNativeFactoryProvider');
  });

  test('provides the factory to the scene delegate and no longer builds the window', () => {
    expect(out).toContain('class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    expect(out).not.toContain('UIWindow(frame:');
    expect(out).not.toContain('startReactNative');
    expect(out).not.toContain('#if os(iOS) || os(tvOS)');
    // фабрику, як і раніше, створює didFinishLaunching — сцена бере її звідси
    expect(out).toContain('reactNativeFactory = factory');
    expect(out).toContain('return super.application(application, didFinishLaunchingWithOptions: launchOptions)');
    // вікно, яке сцена дзеркалить у делегат (expo-system-ui читає його звідти)
    expect(out).toContain('var window: UIWindow?');
  });

  test('link handlers stay: the scene delegate forwards links to them', () => {
    expect(out).toContain('RCTLinkingManager.application(app, open: url, options: options)');
    expect(out).toContain('continue userActivity: NSUserActivity');
  });

  test('applying it twice changes nothing; a template that already has scenes is left alone', () => {
    expect(plugin.sceneAppDelegate(out)).toBe(out);
    const sdk58 = 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {\n}\n';
    expect(plugin.sceneAppDelegate(sdk58)).toBe(sdk58);
  });

  test('an unfamiliar AppDelegate fails prebuild instead of shipping an app that dies on launch', () => {
    expect(() => plugin.sceneAppDelegate('class AppDelegate: UIResponder {}')).toThrow(/SDK 57/);
    const noStart = appDelegate.replace(/factory\.startReactNative\(/, 'factory.start(');
    expect(() => plugin.sceneAppDelegate(noStart)).toThrow(/withSceneLifecycle/);
  });
});

describe('Info.plist', () => {
  test('one scene whose delegate is SceneDelegate, as in the SDK 58 template', () => {
    const plist = plugin.addSceneManifest({ CFBundleName: 'x' });
    expect(plist.UIApplicationSceneManifest).toEqual({
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          { UISceneConfigurationName: 'Default Configuration', UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate' },
        ],
      },
    });
    expect(plist.CFBundleName).toBe('x');
  });

  test('an existing manifest is kept', () => {
    const own = { UIApplicationSupportsMultipleScenes: true };
    expect(plugin.addSceneManifest({ UIApplicationSceneManifest: own }).UIApplicationSceneManifest).toBe(own);
  });
});

describe('Xcode project', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scene-'));
    fs.mkdirSync(path.join(dir, 'LinguaLens'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const load = () => {
    const project = xcode.project(path.join(FIX, 'LinguaLens.sdk57.pbxproj'));
    project.parseSync();
    return project;
  };
  // { назва таргета: [файли у фазі Sources] }
  const sources = (project) => {
    const o = project.hash.project.objects;
    const out = {};
    for (const [id, t] of Object.entries(o.PBXNativeTarget)) {
      if (id.endsWith('_comment')) continue;
      out[t.name] = t.buildPhases
        .map((b) => o.PBXSourcesBuildPhase[b.value])
        .filter(Boolean)
        .flatMap((ph) => ph.files.map((f) => f.comment.replace(/ in Sources$/, '')));
    }
    return out;
  };

  test('SceneDelegate.swift is written and compiled into the app, not into the widget extension', () => {
    const project = load();
    expect(sources(project).LinguaLens).toEqual(['AppDelegate.swift']);
    plugin.linkSceneDelegate(project, { projectName: 'LinguaLens', platformProjectRoot: dir });
    expect(fs.readFileSync(path.join(dir, 'LinguaLens', 'SceneDelegate.swift'), 'utf8')).toBe(plugin.SCENE_DELEGATE);
    const after = sources(project);
    expect(after.LinguaLens).toEqual(['AppDelegate.swift', 'SceneDelegate.swift']);
    expect(after.ExpoWidgetsTarget).not.toContain('SceneDelegate.swift');
    expect(project.writeSync()).toContain('path = "LinguaLens/SceneDelegate.swift"');
  });

  test('a second prebuild without --clean adds nothing twice', () => {
    const project = load();
    plugin.linkSceneDelegate(project, { projectName: 'LinguaLens', platformProjectRoot: dir });
    plugin.linkSceneDelegate(project, { projectName: 'LinguaLens', platformProjectRoot: dir });
    expect(sources(project).LinguaLens).toEqual(['AppDelegate.swift', 'SceneDelegate.swift']);
  });

  test('the Swift class matches the Info.plist entry and subclasses ExpoAppSceneDelegate', () => {
    expect(plugin.SCENE_DELEGATE).toContain('@objc(SceneDelegate)');
    expect(plugin.SCENE_DELEGATE).toContain('class SceneDelegate: ExpoAppSceneDelegate {');
    // клас, на який спирається плагін, справді є у встановленому пакеті expo
    const expoIos = path.join(path.dirname(require.resolve('expo/package.json')), 'ios', 'AppDelegates');
    expect(fs.readFileSync(path.join(expoIos, 'ExpoAppSceneDelegate.swift'), 'utf8')).toContain('open class ExpoAppSceneDelegate');
    expect(fs.readFileSync(path.join(expoIos, 'ExpoReactNativeFactoryProvider.swift'), 'utf8')).toContain(
      'public protocol ExpoReactNativeFactoryProvider'
    );
  });
});

test('app.json applies the plugin', () => {
  expect(appJson.expo.plugins).toContain('./plugins/withSceneLifecycle');
});
