// Модулі Expo збираються з вихідного коду, а не беруться готовими.
//
// Готові (precompiled) XCFramework модулів Expo зібрано конкретною версією
// Swift. Xcode з новішим Swift їх не імпортує: «Failed to build module
// 'ExpoModulesCore'; this SDK is not supported by the compiler» (так було
// 18.10.2026: Xcode 27.1 і Swift 6.4, а модулі зібрано Swift 6.3.1). Збірка з
// вихідного коду трохи довша, зате працює з будь-яким Xcode, і локально, і
// на EAS. Плагін пише прапорець у ios/Podfile.properties.json, тож він
// переживає `expo prebuild --clean`.
const { withPodfileProperties } = require('expo/config-plugins');

const KEY = 'EXPO_USE_PRECOMPILED_MODULES';

const withSourceModules = (config) =>
  withPodfileProperties(config, (cfg) => {
    cfg.modResults[KEY] = 'false';
    return cfg;
  });

module.exports = withSourceModules;
module.exports.KEY = KEY;
