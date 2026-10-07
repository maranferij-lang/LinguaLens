// Privacy manifest для розширення віджетів (ITMS-91053, «Missing API
// declaration»).
//
// Apple вимагає PrivacyInfo.xcprivacy у кожному бінарнику, що користується
// «required reason» API, і в розширенні теж. expo-widgets свого маніфеста не
// кладе, а агрегація маніфестів у React Native (privacy_manifest_utils.rb)
// чіпає лише таргети-застосунки (symbol_type == :application), тож
// ExpoWidgetsTarget.appex їхав би без жодної декларації. Плагін:
//   • пише ios/ExpoWidgetsTarget/PrivacyInfo.xcprivacy;
//   • додає його в групу таргета й у фазу Resources таргета (фази в
//     expo-widgets немає, її робить withWidgetLocalizations; якщо її ще немає,
//     створюємо сами), тож файл лягає в корінь ExpoWidgetsTarget.appex.
//
// Що задекларовано й чому (звірено з тим, що лінкується в розширення:
// ExpoWidgets, ExpoModulesCore, ExpoUI і React Native; маніфести цих
// залежностей лежать у node_modules, __tests__/widgetPrivacyManifest.test.js
// порівнює з ними):
//   • UserDefaults 1C8F.1: WidgetsStorage читає UserDefaults(suiteName:) з
//     App Group group.com.marik.lingualens, куди пише основний застосунок;
//   • UserDefaults CA92.1: React Native (React/Resources/PrivacyInfo.xcprivacy)
//     у тому самому бінарнику читає власні налаштування;
//   • FileTimestamp C617.1 (React Native, Folly, glog, boost, cxxreact);
//   • SystemBootTime 35F9.1 (boost, react/timing).
// DiskSpace не декларуємо: expo-file-system, єдиний, хто його читає, в
// розширення не лінкується. Трекінгу й зібраних даних у розширенні немає.
//
// Порядок у app.json не важливий. Моди виконуються у зворотному порядку
// (останній записаний іде першим), тож звичайний withXcodeProject тут бачив би
// таргет лише за умови, що плагін стоїть ПЕРЕД "expo-widgets" (так зроблено
// у withWidgetLocalizations). Ми ж спершу даємо відпрацювати решті ланцюжка
// (nextMod, зокрема модові expo-widgets, які створюють таргет) і лише тоді
// правимо проєкт, тому плагін працює де б не стояв. Файл пишемо в тому ж моді,
// бо «небезпечний» мод expo-widgets перед цим стирає й перестворює теку
// таргета. Таргета немає: prebuild падає, бо збірка без декларації дає лист
// від Apple, а не помилку на нашому боці.
const fs = require('fs');
const path = require('path');
const plist = require('@expo/plist').default;
const { withBaseMod } = require('expo/config-plugins');

const TARGET = 'ExpoWidgetsTarget';
const FILE = 'PrivacyInfo.xcprivacy';

const api = (type, reasons) => ({ NSPrivacyAccessedAPIType: `NSPrivacyAccessedAPICategory${type}`, NSPrivacyAccessedAPITypeReasons: reasons });

const MANIFEST = {
  NSPrivacyTracking: false,
  NSPrivacyTrackingDomains: [],
  NSPrivacyCollectedDataTypes: [],
  NSPrivacyAccessedAPITypes: [api('UserDefaults', ['CA92.1', '1C8F.1']), api('FileTimestamp', ['C617.1']), api('SystemBootTime', ['35F9.1'])],
};

// Вміст PrivacyInfo.xcprivacy (XML plist).
function manifestXml(manifest = MANIFEST) {
  return plist.build(manifest);
}

const unquote = (s) => String(s == null ? '' : s).replace(/^"(.*)"$/, '$1');
const entries = (section) => Object.keys(section || {}).filter((k) => !k.endsWith('_comment'));

// Додає PrivacyInfo.xcprivacy у групу таргета й у його фазу Resources
// (за потреби створює фазу). Повторний виклик нічого не дублює.
// → false, якщо таргета чи його групи немає.
function addPrivacyManifest(project, target = TARGET) {
  const objects = project.hash.project.objects;
  const natives = objects.PBXNativeTarget || {};
  const targetUuid = entries(natives).find((k) => unquote(natives[k].name) === target);
  const groups = objects.PBXGroup || {};
  const groupUuid = entries(groups).find((k) => unquote(groups[k].name) === target || unquote(groups[k].path) === target);
  if (!targetUuid || !groupUuid) return false;
  const native = natives[targetUuid];
  const group = groups[groupUuid];
  group.children = group.children || [];

  objects.PBXFileReference = objects.PBXFileReference || {};
  objects.PBXBuildFile = objects.PBXBuildFile || {};
  objects.PBXResourcesBuildPhase = objects.PBXResourcesBuildPhase || {};
  const refs = objects.PBXFileReference;

  // файл у групі таргета
  let refUuid = (group.children.find((c) => refs[c.value] && unquote(refs[c.value].path) === FILE) || {}).value;
  if (!refUuid) {
    refUuid = project.generateUuid();
    refs[refUuid] = { isa: 'PBXFileReference', lastKnownFileType: 'text.xml', path: FILE, sourceTree: '"<group>"' };
    refs[refUuid + '_comment'] = FILE;
    group.children.push({ value: refUuid, comment: FILE });
  }

  // фаза Resources таргета
  native.buildPhases = native.buildPhases || [];
  let phaseUuid = (native.buildPhases.find((p) => objects.PBXResourcesBuildPhase[p.value]) || {}).value;
  if (!phaseUuid) {
    phaseUuid = project.generateUuid();
    objects.PBXResourcesBuildPhase[phaseUuid] = {
      isa: 'PBXResourcesBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      runOnlyForDeploymentPostprocessing: 0,
    };
    objects.PBXResourcesBuildPhase[phaseUuid + '_comment'] = 'Resources';
    native.buildPhases.push({ value: phaseUuid, comment: 'Resources' });
  }
  const phase = objects.PBXResourcesBuildPhase[phaseUuid];
  phase.files = phase.files || [];
  const built = phase.files.some((f) => {
    const b = objects.PBXBuildFile[f.value];
    return b && b.fileRef === refUuid;
  });
  if (!built) {
    const buildUuid = project.generateUuid();
    objects.PBXBuildFile[buildUuid] = { isa: 'PBXBuildFile', fileRef: refUuid, fileRef_comment: FILE };
    objects.PBXBuildFile[buildUuid + '_comment'] = `${FILE} in Resources`;
    phase.files.push({ value: buildUuid, comment: `${FILE} in Resources` });
  }
  return true;
}

const withWidgetPrivacyManifest = (config) =>
  withBaseMod(config, {
    platform: 'ios',
    mod: 'xcodeproj',
    skipEmptyMod: false,
    isProvider: false,
    action: async ({ modRequest: { nextMod, ...modRequest }, ...rest }) => {
      // спершу решта ланцюжка: серед неї мод expo-widgets, що створює таргет
      const done = await nextMod({ ...rest, modRequest });
      if (!addPrivacyManifest(done.modResults)) {
        throw new Error(
          `withWidgetPrivacyManifest: таргет ${TARGET} не знайдено в Xcode-проєкті, а без PrivacyInfo.xcprivacy розширення віджетів дає лист ITMS-91053. ` +
            'Перевір, що "expo-widgets" є в plugins в app.json і працює на iOS.'
        );
      }
      const dir = path.join(modRequest.platformProjectRoot, TARGET);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, FILE), manifestXml());
      return done;
    },
  });

module.exports = withWidgetPrivacyManifest;
module.exports.TARGET = TARGET;
module.exports.FILE = FILE;
module.exports.MANIFEST = MANIFEST;
module.exports.manifestXml = manifestXml;
module.exports.addPrivacyManifest = addPrivacyManifest;
