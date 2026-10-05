// Життєвий цикл сцен (UIScene) — без нього iOS 27 зупиняє застосунок одразу
// на старті (EXC_BREAKPOINT у _UIApplicationEvaluateRuntimeIssueForNoScene-
// LifecycleAdoption), якщо його зібрано з SDK iOS 27, тобто Xcode 27.
//
// Шаблон prebuild Expo SDK 57 сцен ще не має: AppDelegate сам створює вікно й
// запускає в ньому React Native. Перехід є лише в шаблоні SDK 58, а сам пакет
// expo 57 уже містить усе потрібне (ExpoAppSceneDelegate, протокол
// ExpoReactNativeFactoryProvider). Плагін робить із шаблону SDK 57 те саме,
// що в SDK 58:
//   • ios/<Проєкт>/SceneDelegate.swift — підклас ExpoAppSceneDelegate: він
//     створює вікно зі сцени й запускає в ньому React Native, а події сцени
//     (посилання, віджети, повернення в застосунок) передає в AppDelegate;
//   • файл — у фазу Sources головного таргета (не розширення віджетів);
//   • UIApplicationSceneManifest в Info.plist;
//   • AppDelegate приймає ExpoReactNativeFactoryProvider і більше не створює
//     вікно сам. Його обробники посилань лишаються: ExpoAppSceneDelegate
//     розрахований на AppDelegate SDK 57 і не доставляє посилання двічі.
//
// Шаблон уже зі сценами (SDK 58+) плагін не чіпає. Незнайомий AppDelegate —
// помилка prebuild, а не застосунок, що падає на запуску.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withAppDelegate, withInfoPlist, withXcodeProject } = require('expo/config-plugins');

const FILE = 'SceneDelegate.swift';
const PROVIDER = 'ExpoReactNativeFactoryProvider';

// Як ios/HelloWorld/SceneDelegate.swift у expo-template-bare-minimum SDK 58.
const SCENE_DELEGATE = `internal import Expo

// Creates the window from the scene and starts React Native in it
// (plugins/withSceneLifecycle.js; the same file as in the Expo SDK 58 template).
@objc(SceneDelegate)
class SceneDelegate: ExpoAppSceneDelegate {
  // Extension point for config plugins.
}
`;

// Як в Info.plist шаблону SDK 58: одна сцена, делегат — SceneDelegate.
const SCENE_MANIFEST = {
  UIApplicationSupportsMultipleScenes: false,
  UISceneConfigurations: {
    UIWindowSceneSessionRoleApplication: [
      {
        UISceneConfigurationName: 'Default Configuration',
        UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
      },
    ],
  },
};

const CLASS_LINE = /class AppDelegate: ExpoAppDelegate \{/;
// Створення вікна й старт React Native у didFinishLaunching шаблону SDK 57.
const START_BLOCK =
  /\n#if os\(iOS\) \|\| os\(tvOS\)\n[ \t]*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n[ \t]*factory\.startReactNative\([^)]*\)\n#endif\n/;
const START_COMMENT = `
    // The window is created and React Native is started by \`SceneDelegate\` under the
    // scene-based life cycle (required by the iOS 27 SDK; plugins/withSceneLifecycle.js).
`;

// Текст AppDelegate.swift → той самий під сценами. Уже зі сценами — без змін.
function sceneAppDelegate(src) {
  if (src.includes(PROVIDER)) return src;
  if (!CLASS_LINE.test(src) || !START_BLOCK.test(src)) {
    throw new Error(
      'withSceneLifecycle: AppDelegate.swift не схожий на шаблон Expo SDK 57 — не знайдено ' +
        '`class AppDelegate: ExpoAppDelegate {` або блок, що створює вікно й запускає React Native. ' +
        'Без сцен iOS 27 зупинить застосунок на старті; перенеси зміни вручну за шаблоном SDK 58.'
    );
  }
  return src.replace(CLASS_LINE, `class AppDelegate: ExpoAppDelegate, ${PROVIDER} {`).replace(START_BLOCK, START_COMMENT);
}

// Додає маніфест сцен, якщо його ще немає. Мутує й повертає infoPlist.
function addSceneManifest(infoPlist) {
  if (!infoPlist.UIApplicationSceneManifest) {
    infoPlist.UIApplicationSceneManifest = JSON.parse(JSON.stringify(SCENE_MANIFEST));
  }
  return infoPlist;
}

// Пише SceneDelegate.swift і додає його в Sources головного таргета. Файл уже
// є (шаблон зі сценами чи повторний prebuild) — нічого не робить.
function linkSceneDelegate(project, { projectName, platformProjectRoot }) {
  const filepath = `${projectName}/${FILE}`;
  const abs = path.join(platformProjectRoot, filepath);
  if (fs.existsSync(abs)) return project;
  const target = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
  fs.writeFileSync(abs, SCENE_DELEGATE);
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({ filepath, groupName: projectName, project, targetUuid: target.uuid });
  return project;
}

const withSceneLifecycle = (config) => {
  config = withInfoPlist(config, (cfg) => {
    addSceneManifest(cfg.modResults);
    return cfg;
  });
  config = withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error(`withSceneLifecycle: очікувався AppDelegate.swift, а не ${cfg.modResults.language}.`);
    }
    cfg.modResults.contents = sceneAppDelegate(cfg.modResults.contents);
    return cfg;
  });
  config = withXcodeProject(config, (cfg) => {
    linkSceneDelegate(cfg.modResults, cfg.modRequest);
    return cfg;
  });
  return config;
};

module.exports = withSceneLifecycle;
module.exports.SCENE_DELEGATE = SCENE_DELEGATE;
module.exports.SCENE_MANIFEST = SCENE_MANIFEST;
module.exports.sceneAppDelegate = sceneAppDelegate;
module.exports.addSceneManifest = addSceneManifest;
module.exports.linkSceneDelegate = linkSceneDelegate;
