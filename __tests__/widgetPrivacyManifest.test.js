// Privacy manifest розширення віджетів (plugins/withWidgetPrivacyManifest.js) і
// явний маніфест головного застосунку (app.json, ios.privacyManifests).
// Без першого Apple надсилає лист ITMS-91053 («Missing API declaration») на
// ExpoWidgetsTarget.appex: expo-widgets свого PrivacyInfo.xcprivacy не кладе, а
// агрегація маніфестів у React Native чіпає лише таргети-застосунки. Другий без
// app.json існував би тільки як побічний результат `pod install` на EAS, без
// 1C8F.1 і з порожнім списком зібраних даних. Повну перевірку дає
// `CI=1 npx expo prebuild --platform ios --no-install --clean` (файл у теці
// ios/ExpoWidgetsTarget і в Resources таргета, TESTING.md). Фікстура —
// project.pbxproj, який prebuild Expo SDK 57 робить для LinguaLens.
import fs from 'fs';
import os from 'os';
import path from 'path';

const plugin = require('../plugins/withWidgetPrivacyManifest');
const appJson = require('../app.json');
const pkg = require('../package.json');
const xcode = require('xcode');
const plist = require('@expo/plist').default;
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const ROOT = path.join(__dirname, '..');
const FIX = path.join(__dirname, 'fixtures', 'ios', 'LinguaLens.sdk57.pbxproj');
const NODE_MODULES = path.join(ROOT, 'node_modules');
const TARGET = 'ExpoWidgetsTarget';
const FILE = 'PrivacyInfo.xcprivacy';
const CAT = 'NSPrivacyAccessedAPICategory';

// Що Apple приймає (Describing use of required reason API). Помилка в одній
// літері кода дає лист від Apple після завантаження, а не помилку збірки.
const REASONS = {
  [`${CAT}FileTimestamp`]: ['DDA9.1', 'C617.1', '3B52.1', '0A2A.1'],
  [`${CAT}SystemBootTime`]: ['35F9.1', '8FFB.1', '3D61.1'],
  [`${CAT}DiskSpace`]: ['85F4.1', 'E174.1', '7D9E.1', 'B728.1'],
  [`${CAT}ActiveKeyboards`]: ['3EC4.1', '54BD.1'],
  [`${CAT}UserDefaults`]: ['CA92.1', '1C8F.1', 'C56D.1', 'AC6B.1'],
};
const DATA_TYPES = [
  'Name', 'EmailAddress', 'PhoneNumber', 'PhysicalAddress', 'OtherUserContactInfo', 'Health', 'Fitness', 'PaymentInfo', 'CreditInfo',
  'OtherFinancialInfo', 'PreciseLocation', 'CoarseLocation', 'SensitiveInfo', 'Contacts', 'EmailsOrTextMessages', 'PhotosorVideos',
  'AudioData', 'GameplayContent', 'CustomerSupport', 'OtherUserContent', 'BrowsingHistory', 'SearchHistory', 'UserID', 'DeviceID',
  'PurchaseHistory', 'ProductInteraction', 'AdvertisingData', 'OtherUsageData', 'CrashData', 'PerformanceData', 'OtherDiagnosticData',
  'EnvironmentScanning', 'Hands', 'Head', 'OtherDataTypes',
].map((n) => `NSPrivacyCollectedDataType${n}`);
const PURPOSES = ['ThirdPartyAdvertising', 'DeveloperAdvertising', 'Analytics', 'ProductPersonalization', 'AppFunctionality', 'Other'].map(
  (n) => `NSPrivacyCollectedDataTypePurpose${n}`
);

// [{type, reasons}] → { тип: Set(кодів) }
const byType = (list) => {
  const out = {};
  for (const a of list || []) {
    out[a.NSPrivacyAccessedAPIType] = new Set([...(out[a.NSPrivacyAccessedAPIType] || []), ...a.NSPrivacyAccessedAPITypeReasons]);
  }
  return out;
};
// Чого з `need` бракує в `have`: ['тип код', ...]
const missing = (need, have) => {
  const h = byType(have);
  const out = [];
  for (const [type, reasons] of Object.entries(byType(need))) {
    for (const r of reasons) if (!(h[type] && h[type].has(r))) out.push(`${type.replace(CAT, '')} ${r}`);
  }
  return out.sort();
};

// Маніфести залежностей лежать у node_modules (iOS-пакети Expo, React Native
// з Folly, glog, boost); `pod install` зводить їх у маніфест застосунку.
function manifestsIn(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.git') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) manifestsIn(p, out);
    else if (e.name === FILE) out.push(p);
  }
  return out;
}
const apisOf = (file) => plist.parse(fs.readFileSync(file, 'utf8')).NSPrivacyAccessedAPITypes || [];
const podApis = (names) => {
  const files = names.filter((n) => fs.existsSync(path.join(NODE_MODULES, n))).flatMap((n) => manifestsIn(path.join(NODE_MODULES, n)));
  return { files, apis: files.flatMap(apisOf) };
};

const load = () => {
  const project = xcode.project(FIX);
  project.parseSync();
  return project;
};
const objectsOf = (project) => project.hash.project.objects;
const unquote = (s) => String(s == null ? '' : s).replace(/^"(.*)"$/, '$1');
const named = (section, name) => Object.entries(section).find(([k, v]) => !k.endsWith('_comment') && unquote(v.name) === name);
// назви файлів у фазах Resources таргета
const resourceFiles = (project, targetName) => {
  const o = objectsOf(project);
  const [, native] = named(o.PBXNativeTarget, targetName);
  const out = [];
  for (const ph of native.buildPhases) {
    const phase = o.PBXResourcesBuildPhase[ph.value];
    if (!phase) continue;
    for (const f of phase.files) {
      const ref = o.PBXFileReference[o.PBXBuildFile[f.value].fileRef] || o.PBXVariantGroup[o.PBXBuildFile[f.value].fileRef];
      out.push(unquote(ref.path || ref.name));
    }
  }
  return out;
};
const groupFiles = (project, name) => {
  const o = objectsOf(project);
  const [, group] = named(o.PBXGroup, name);
  return group.children.map((c) => c.comment);
};

describe('widget manifest content', () => {
  const manifest = plugin.MANIFEST;

  test('no tracking, no tracking domains, no collected data; the file name is the one Apple looks for', () => {
    expect(manifest.NSPrivacyTracking).toBe(false);
    expect(manifest.NSPrivacyTrackingDomains).toEqual([]);
    expect(manifest.NSPrivacyCollectedDataTypes).toEqual([]);
    expect(plugin.FILE).toBe('PrivacyInfo.xcprivacy');
    expect(plugin.TARGET).toBe('ExpoWidgetsTarget');
  });

  test('app group defaults 1C8F.1 plus the extension’s own CA92.1, file timestamps and boot time from React Native', () => {
    const t = byType(manifest.NSPrivacyAccessedAPITypes);
    expect(Object.keys(t).sort()).toEqual([`${CAT}FileTimestamp`, `${CAT}SystemBootTime`, `${CAT}UserDefaults`]);
    expect([...t[`${CAT}UserDefaults`]].sort()).toEqual(['1C8F.1', 'CA92.1']);
    expect([...t[`${CAT}FileTimestamp`]]).toEqual(['C617.1']);
    expect([...t[`${CAT}SystemBootTime`]]).toEqual(['35F9.1']);
  });

  test('only categories and reason codes Apple knows, each category once', () => {
    const types = manifest.NSPrivacyAccessedAPITypes.map((a) => a.NSPrivacyAccessedAPIType);
    expect(new Set(types).size).toBe(types.length);
    for (const a of manifest.NSPrivacyAccessedAPITypes) {
      expect(Object.keys(REASONS)).toContain(a.NSPrivacyAccessedAPIType);
      expect(a.NSPrivacyAccessedAPITypeReasons.length).toBeGreaterThan(0);
      for (const r of a.NSPrivacyAccessedAPITypeReasons) expect([a.NSPrivacyAccessedAPIType, REASONS[a.NSPrivacyAccessedAPIType].includes(r) && r]).toEqual([a.NSPrivacyAccessedAPIType, r]);
    }
  });

  // Розширення лінкує React Native (use_react_native в Podfile таргета), тож усе,
  // що декларують його маніфести, має бути й тут. Оновили React Native, і в
  // його маніфестах з'явився новий код, тест червоніє.
  test('everything the linked React Native pods declare is declared here too', () => {
    const rn = podApis(['react-native']);
    expect(rn.files.length).toBeGreaterThanOrEqual(5);
    expect(missing(rn.apis, manifest.NSPrivacyAccessedAPITypes)).toEqual([]);
  });

  test('DiskSpace is not declared: expo-file-system, the only reader, is not linked into the extension', () => {
    expect(Object.keys(byType(manifest.NSPrivacyAccessedAPITypes))).not.toContain(`${CAT}DiskSpace`);
    // а в застосунку він є
    expect(Object.keys(byType(appJson.expo.ios.privacyManifests.NSPrivacyAccessedAPITypes))).toContain(`${CAT}DiskSpace`);
  });

  test('the XML is a plist that reads back to the same data', () => {
    const xml = plugin.manifestXml();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<plist version="1.0">');
    expect(plist.parse(xml)).toEqual(manifest);
  });
});

describe('Xcode project', () => {
  test('the file joins the extension group and its Resources phase, and nothing else changes in the app target', () => {
    const project = load();
    const appBefore = resourceFiles(project, 'LinguaLens');
    expect(resourceFiles(project, TARGET)).not.toContain(FILE);
    expect(groupFiles(project, TARGET)).not.toContain(FILE);

    expect(plugin.addPrivacyManifest(project)).toBe(true);

    expect(resourceFiles(project, TARGET)).toEqual(expect.arrayContaining(['Localizable.strings', FILE]));
    expect(groupFiles(project, TARGET)).toContain(FILE);
    expect(resourceFiles(project, 'LinguaLens')).toEqual(appBefore);

    const o = objectsOf(project);
    const ref = Object.entries(o.PBXFileReference).find(([k, v]) => !k.endsWith('_comment') && v.path === FILE)[1];
    expect(ref).toEqual({ isa: 'PBXFileReference', lastKnownFileType: 'text.xml', path: FILE, sourceTree: '"<group>"' });
    // у збереженому файлі це звичайний рядок із коментарем «in Resources»
    expect(project.writeSync()).toMatch(/PrivacyInfo\.xcprivacy in Resources \*\/ = \{isa = PBXBuildFile; fileRef = [0-9A-F]{24} \/\* PrivacyInfo\.xcprivacy \*\/; \};/);
  });

  test('twice is the same as once', () => {
    const project = load();
    plugin.addPrivacyManifest(project);
    const once = project.writeSync();
    expect(plugin.addPrivacyManifest(project)).toBe(true);
    expect(project.writeSync()).toBe(once);
    expect(once.match(/PrivacyInfo\.xcprivacy in Resources/g)).toHaveLength(2); // PBXBuildFile + рядок фази
  });

  test('a target without a Resources phase gets one', () => {
    const project = load();
    const o = objectsOf(project);
    const [, native] = named(o.PBXNativeTarget, TARGET);
    native.buildPhases = native.buildPhases.filter((p) => !o.PBXResourcesBuildPhase[p.value]);
    expect(native.buildPhases.map((p) => p.comment)).toEqual(['Sources', 'Frameworks']);
    expect(plugin.addPrivacyManifest(project)).toBe(true);
    expect(native.buildPhases.map((p) => p.comment)).toEqual(['Sources', 'Frameworks', 'Resources']);
    expect(resourceFiles(project, TARGET)).toEqual([FILE]);
    expect(resourceFiles(project, 'LinguaLens')).not.toContain(FILE);
  });

  test('no extension target: false, and the project stays as it was', () => {
    const project = load();
    const before = project.writeSync();
    expect(plugin.addPrivacyManifest(project, 'NoSuchTarget')).toBe(false);
    expect(project.writeSync()).toBe(before);
  });
});

// Мод проєкту Xcode. Останній записаний мод іде першим, тож порядок плагінів
// у app.json мав би значення, якби ми правили проєкт, не чекаючи решти
// ланцюжка. «expo-widgets» тут підроблений: він «створює» таргет (повертає
// йому назву) лише у своєму моді, як це робить справжній.
describe('xcodeproj mod', () => {
  let dir;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'widget-privacy-'));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const rename = (project, from, to) => {
    const o = objectsOf(project);
    for (const section of ['PBXNativeTarget', 'PBXGroup']) {
      for (const [k, v] of Object.entries(o[section])) {
        if (k.endsWith('_comment')) continue;
        for (const f of ['name', 'path']) if (unquote(v[f]) === from) v[f] = to;
      }
    }
  };
  const fakeWidgets = (config) =>
    withXcodeProject(config, (c) => {
      rename(c.modResults, 'WidgetsNotYet', TARGET);
      return c;
    });
  const base = () => ({ name: 'LinguaLens', slug: 'lingualens' });
  const run = async (config, { hide = true } = {}) => {
    const project = load();
    if (hide) rename(project, TARGET, 'WidgetsNotYet');
    const out = await config.mods.ios.xcodeproj({ ...config, modRequest: { projectRoot: dir, platformProjectRoot: dir }, modResults: project });
    return out.modResults;
  };
  const written = () => path.join(dir, TARGET, FILE);

  test('it registers an Xcode project mod', () => {
    expect(typeof plugin(base()).mods.ios.xcodeproj).toBe('function');
  });

  test.each([
    ['after expo-widgets in app.json', (b) => plugin(fakeWidgets(b))],
    ['before expo-widgets in app.json', (b) => fakeWidgets(plugin(b))],
  ])('the extension is found %s, the file is written and linked', async (_, build) => {
    const project = await run(build(base()));
    expect(resourceFiles(project, TARGET)).toContain(FILE);
    expect(groupFiles(project, TARGET)).toContain(FILE);
    expect(plist.parse(fs.readFileSync(written(), 'utf8'))).toEqual(plugin.MANIFEST);
  });

  test('a second prebuild over the same project and folder changes nothing', async () => {
    const config = plugin(fakeWidgets(base()));
    const project = await run(config);
    const once = project.writeSync();
    const out = await config.mods.ios.xcodeproj({ ...config, modRequest: { projectRoot: dir, platformProjectRoot: dir }, modResults: project });
    expect(out.modResults.writeSync()).toBe(once);
    expect(fs.readdirSync(path.join(dir, TARGET))).toEqual([FILE]);
  });

  test('no extension target means a failed prebuild, not a build the App Store flags later', async () => {
    await expect(run(plugin(base()))).rejects.toThrow(/ExpoWidgetsTarget.*ITMS-91053/);
    expect(fs.existsSync(written())).toBe(false);
  });
});

describe('app.json', () => {
  const app = appJson.expo;
  const names = app.plugins.map((p) => (Array.isArray(p) ? p[0] : p));

  test('the plugin follows expo-widgets, withSceneLifecycle stays last', () => {
    const i = names.indexOf('./plugins/withWidgetPrivacyManifest');
    expect(i).toBeGreaterThan(-1);
    expect(names[i - 1]).toBe('expo-widgets');
    expect(names[names.length - 1]).toBe('./plugins/withSceneLifecycle');
    expect(names.filter((n) => n === './plugins/withWidgetPrivacyManifest')).toHaveLength(1);
    expect(fs.existsSync(path.join(ROOT, 'plugins', 'withWidgetPrivacyManifest.js'))).toBe(true);
  });

  describe('ios.privacyManifests (the app itself)', () => {
    const pm = app.ios.privacyManifests;

    test('no tracking and no tracking domains', () => {
      expect(pm.NSPrivacyTracking).toBe(false);
      expect(pm.NSPrivacyTrackingDomains).toEqual([]);
    });

    test('only categories and reason codes Apple knows, each category once', () => {
      const types = pm.NSPrivacyAccessedAPITypes.map((a) => a.NSPrivacyAccessedAPIType);
      expect(new Set(types).size).toBe(types.length);
      for (const a of pm.NSPrivacyAccessedAPITypes) {
        expect(Object.keys(REASONS)).toContain(a.NSPrivacyAccessedAPIType);
        for (const r of a.NSPrivacyAccessedAPITypeReasons) expect([a.NSPrivacyAccessedAPIType, REASONS[a.NSPrivacyAccessedAPIType].includes(r) && r]).toEqual([a.NSPrivacyAccessedAPIType, r]);
      }
    });

    test('app group defaults are declared (ExpoWidgets writes the suite the widgets read)', () => {
      expect([...byType(pm.NSPrivacyAccessedAPITypes)[`${CAT}UserDefaults`]]).toEqual(expect.arrayContaining(['CA92.1', '1C8F.1']));
    });

    // Те, що `pod install` усе одно зведе в маніфест застосунку, лежить тут
    // явно: коміт показує, що зміниться. Додали чи оновили пакет, і в його
    // маніфесті з'явився новий код, тест червоніє, поки його не внесено в app.json.
    test('covers everything the dependencies’ own manifests declare', () => {
      const expoTop = fs.readdirSync(NODE_MODULES).filter((n) => n.startsWith('expo-'));
      const pods = podApis([...Object.keys(pkg.dependencies), ...expoTop]);
      expect(pods.files.length).toBeGreaterThanOrEqual(12);
      expect(missing(pods.apis, pm.NSPrivacyAccessedAPITypes)).toEqual([]);
    });

    test('everything the widget extension declares is declared for the app too', () => {
      expect(missing(plugin.MANIFEST.NSPrivacyAccessedAPITypes, pm.NSPrivacyAccessedAPITypes)).toEqual([]);
    });

    test('collected data: known types and purposes, none used for tracking, each type once', () => {
      const types = pm.NSPrivacyCollectedDataTypes.map((d) => d.NSPrivacyCollectedDataType);
      expect(new Set(types).size).toBe(types.length);
      for (const d of pm.NSPrivacyCollectedDataTypes) {
        expect(Object.keys(d).sort()).toEqual(['NSPrivacyCollectedDataType', 'NSPrivacyCollectedDataTypeLinked', 'NSPrivacyCollectedDataTypePurposes', 'NSPrivacyCollectedDataTypeTracking']);
        expect(DATA_TYPES).toContain(d.NSPrivacyCollectedDataType);
        expect(d.NSPrivacyCollectedDataTypeLinked).toEqual(expect.any(Boolean));
        expect(d.NSPrivacyCollectedDataTypeTracking).toBe(false);
        expect(d.NSPrivacyCollectedDataTypePurposes.length).toBeGreaterThan(0);
        for (const p of d.NSPrivacyCollectedDataTypePurposes) expect(PURPOSES).toContain(p);
      }
    });

    // Таблиця «App Privacy» в APPSTORE.md і маніфест кажуть одне й те саме. Змінили
    // відповіді в App Store Connect, змініть обидва місця.
    test('collected data matches the App Privacy table in APPSTORE.md, row by row', () => {
      const text = fs.readFileSync(path.join(ROOT, 'APPSTORE.md'), 'utf8');
      const from = text.indexOf('## App Privacy');
      const to = text.indexOf('\n## ', from + 3);
      const section = text.slice(from, to === -1 ? undefined : to);
      const flat = (s) => s.replace(/[^A-Za-z]/g, '').toLowerCase();
      const rows = {};
      for (const m of section.matchAll(/^\| \*\*[^|*]*→ ([^|*]+)\*\* \| ([^|]+) \| ([^|]+) \| ([^|]+) \|$/gm)) {
        rows[flat(m[1])] = {
          linked: /yes/i.test(m[3]),
          tracking: /yes/i.test(m[4]),
          purposes: m[2].replace(/\*/g, '').split(',').map((s) => flat(s)).sort(),
        };
      }
      const declared = {};
      for (const d of pm.NSPrivacyCollectedDataTypes) {
        declared[flat(d.NSPrivacyCollectedDataType.replace('NSPrivacyCollectedDataType', ''))] = {
          linked: d.NSPrivacyCollectedDataTypeLinked,
          tracking: d.NSPrivacyCollectedDataTypeTracking,
          purposes: d.NSPrivacyCollectedDataTypePurposes.map((p) => flat(p.replace('NSPrivacyCollectedDataTypePurpose', ''))).sort(),
        };
      }
      expect(Object.keys(rows).length).toBeGreaterThanOrEqual(7);
      expect(declared).toEqual(rows);
    });

    test('Expo writes the file as it is (nothing to merge into on a clean prebuild)', () => {
      expect(IOSConfig.PrivacyInfo.mergePrivacyInfo({}, pm)).toEqual({
        NSPrivacyAccessedAPITypes: pm.NSPrivacyAccessedAPITypes,
        NSPrivacyCollectedDataTypes: pm.NSPrivacyCollectedDataTypes,
        NSPrivacyTracking: false,
        NSPrivacyTrackingDomains: [],
      });
    });
  });
});
