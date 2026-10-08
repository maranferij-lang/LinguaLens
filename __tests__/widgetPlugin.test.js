// Розтяжка S1: назви й описи віджетів у галереї iOS мовою телефона
// (plugins/withWidgetLocalizations.js, widgets.md §11). Плагін пише
// <мова>.lproj/Localizable.strings у розширення й додає їх у таргет
// ExpoWidgetsTarget. Повну перевірку дає `npx expo prebuild --platform ios
// --clean` (TESTING.md); тут — переклади, екранування й зміни Xcode-проєкту.
import fs from 'fs';
import os from 'os';
import path from 'path';

const plugin = require('../plugins/withWidgetLocalizations');
const appJson = require('../app.json');
const table = require('../locales/widgets.json');

const LANGS = ['en', 'uk', 'de', 'es', 'ru'];

describe('strings for the widget gallery', () => {
  const keys = plugin.widgetKeys(appJson.expo);

  test('the keys are the English names and descriptions of all three widgets from app.json', () => {
    const widgets = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-widgets')[1].widgets;
    expect(widgets.map((w) => w.name)).toEqual(['WordOfDay', 'MyWords', 'Streak']);
    expect(keys).toEqual(widgets.flatMap((w) => [w.displayName, w.description]));
  });

  test('every language of the app has every key translated', () => {
    expect(Object.keys(table).sort()).toEqual([...LANGS].sort());
    for (const lang of LANGS) {
      for (const k of keys) expect([lang, k, typeof table[lang][k]]).toEqual([lang, k, 'string']);
    }
    // перекладено, а не скопійовано англійське
    for (const lang of ['uk', 'de', 'es', 'ru']) {
      expect(keys.filter((k) => table[lang][k] === k)).toEqual([]);
    }
    expect(table.uk['Word of the Day']).toBe('Слово дня');
    expect(table.ru['My Words']).toBe('Мои слова');
  });

  test('one .strings file per language with all keys; quotes and backslashes are escaped', () => {
    const files = plugin.stringsFiles(table, keys);
    expect(Object.keys(files)).toEqual(Object.keys(table));
    for (const lang of LANGS) {
      for (const k of keys) expect(files[lang]).toContain(`"${plugin.escapeStrings(k)}" = "${plugin.escapeStrings(table[lang][k])}";`);
    }
    expect(plugin.escapeStrings('a "b" \\ c\nd')).toBe('a \\"b\\" \\\\ c\\nd');
    // ключа немає в мові — англійський текст, а не порожньо
    const partial = plugin.stringsFiles({ fr: { 'My Words': 'Mes mots' } }, ['My Words', 'Streak']);
    expect(partial.fr).toContain('"My Words" = "Mes mots";');
    expect(partial.fr).toContain('"Streak" = "Streak";');
  });
});

// Мінімальний проєкт: таргет розширення з групою і фазою Sources, як після
// expo-widgets (без фази Resources).
const PBXPROJ = `// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 54;
	objects = {

/* Begin PBXGroup section */
		AAAA00000000000000000001 = {
			isa = PBXGroup;
			children = (
				AAAA00000000000000000002 /* ExpoWidgetsTarget */,
			);
			sourceTree = "<group>";
		};
		AAAA00000000000000000002 /* ExpoWidgetsTarget */ = {
			isa = PBXGroup;
			children = (
			);
			name = ExpoWidgetsTarget;
			path = ExpoWidgetsTarget;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		AAAA00000000000000000003 /* ExpoWidgetsTarget */ = {
			isa = PBXNativeTarget;
			buildPhases = (
				AAAA00000000000000000004 /* Sources */,
			);
			name = ExpoWidgetsTarget;
			productType = "com.apple.product-type.app-extension";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		AAAA00000000000000000005 /* Project object */ = {
			isa = PBXProject;
			developmentRegion = en;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = AAAA00000000000000000001;
			targets = (
				AAAA00000000000000000003 /* ExpoWidgetsTarget */,
			);
		};
/* End PBXProject section */

/* Begin PBXSourcesBuildPhase section */
		AAAA00000000000000000004 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */
	};
	rootObject = AAAA00000000000000000005 /* Project object */;
}
`;

function project(text = PBXPROJ) {
  const xcode = require('xcode');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pbx-')), 'project.pbxproj');
  fs.writeFileSync(file, text);
  const p = xcode.project(file);
  p.parseSync();
  return p;
}
const count = (s, needle) => s.split(needle).length - 1;

describe('the widget extension target in the Xcode project', () => {
  test('gets Localizable.strings for each language, a Resources phase and the known regions', () => {
    const p = project();
    expect(plugin.addLocalizations(p, LANGS)).toBe(true);
    const out = p.writeSync();
    for (const lang of LANGS) expect(out).toContain(`name = ${lang}; path = "${lang}.lproj/Localizable.strings"`);
    expect(out).toContain('isa = PBXVariantGroup');
    expect(out).toContain('/* Localizable.strings in Resources */ = {isa = PBXBuildFile;');
    // фаза Resources — у таргеті розширення
    const target = out.slice(out.indexOf('AAAA00000000000000000003 /* ExpoWidgetsTarget */ = {'));
    expect(target.slice(0, target.indexOf('};'))).toMatch(/\/\* Resources \*\//);
    expect(out.replace(/\s+/g, ' ')).toContain('knownRegions = ( en, Base, uk, de, es, ru, );');
    // група Localizable.strings — у групі таргета
    const group = out.slice(out.indexOf('AAAA00000000000000000002 /* ExpoWidgetsTarget */ = {'));
    expect(group.slice(0, group.indexOf('};'))).toContain('/* Localizable.strings */');
  });

  test('a second prebuild run adds nothing twice', () => {
    const p = project();
    plugin.addLocalizations(p, LANGS);
    const once = p.writeSync();
    plugin.addLocalizations(p, LANGS);
    const twice = p.writeSync();
    expect(twice).toBe(once);
    expect(count(twice, 'isa = PBXVariantGroup')).toBe(1);
    expect(count(twice, 'isa = PBXResourcesBuildPhase')).toBe(1);
  });

  test('no widget target (the plugin ran before expo-widgets made it) — nothing changes, no crash', () => {
    const p = project(PBXPROJ.replace(/ExpoWidgetsTarget/g, 'OtherTarget'));
    const before = p.writeSync();
    expect(plugin.addLocalizations(p, LANGS)).toBe(false);
    expect(p.writeSync()).toBe(before);
  });
});
