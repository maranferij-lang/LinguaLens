// Альтернативні іконки в збірці — для A/B-тесту іконки в App Store (Product
// Page Optimization). Apple дає тестувати лише ті іконки, що вже є в бінарнику
// опублікованої версії: «any app icons you wish to use must be part of the app
// binary for the current App Store version… built with Xcode 13 or later and
// support alternate icons in asset catalogs», розмір — 1024 × 1024 (App Store
// Connect Help → Configure test treatments). Перемикати іконку в самому
// застосунку не треба, тож нативного коду немає.
//
// Що робить на prebuild:
//   • кладе кожну іконку з опцій набором ios/<Проєкт>/Images.xcassets/<Назва>.appiconset/
//     — як власний набір AppIcon від Expo: один PNG 1024 «universal / ios»;
//   • вмикає ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS = YES («Include
//     All App Icon Assets») у конфігураціях збірки ГОЛОВНОГО таргета: тоді
//     actool кладе в збірку всі набори іконок, а не лише AppIcon, і сам
//     записує їх у CFBundleIcons → CFBundleAlternateIcons в Info.plist.
//     Окремий ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES не потрібен: за
//     довідкою Xcode це альтернатива тому самому, для вибіркового списку.
//     Розширення віджетів не чіпаємо: іконок у ньому немає.
//
// app.json: ["./plugins/withAlternateIcons", { "icons": { "AppIcon-Eye": "./assets/icon-eye.png" } }]
// — після решти плагінів, але перед ./plugins/withSceneLifecycle (той лишається
// останнім). Файли пишемо в моді Xcode-проєкту, як withWidgetLocalizations:
// він іде після «небезпечних» модів, тож Images.xcassets від Expo вже на місці.
// Повторний prebuild без --clean переписує ті самі файли й нічого не дублює.
// PNG не 1024 × 1024 RGB (з альфою App Store іконку не прийме) — помилка
// prebuild, а не збірка, яку відхилять на завантаженні.
const fs = require('fs');
const path = require('path');
const { IOSConfig, withXcodeProject } = require('expo/config-plugins');

const INCLUDE_ALL = 'ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS';
const CATALOG = 'Images.xcassets';
const SIZE = 1024;
// назва набору = назва іконки в App Store Connect; без пробілів і крапок
const NAME = /^AppIcon-[A-Za-z0-9-]+$/;

// Як Images.xcassets/AppIcon.appiconset/Contents.json, що пише Expo SDK 57
// (@expo/prebuild-config, withIosIcons): одне зображення 1024 на все.
function iconSetContents(filename) {
  return {
    images: [{ filename, idiom: 'universal', platform: 'ios', size: `${SIZE}x${SIZE}` }],
    info: { version: 1, author: 'expo' },
  };
}

// Перевіряє PNG іконки за заголовком: 1024 × 1024, 8 біт, RGB (тип 2), без tRNS.
function assertIconPng(buf, label) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const fail = (why) => {
    throw new Error(`withAlternateIcons: ${label} — ${why}. Іконка App Store: PNG 1024 × 1024, RGB без альфа-каналу (tools/export-brand.mjs).`);
  };
  if (buf.length < 33 || !buf.subarray(0, 8).equals(sig)) fail('не PNG');
  const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
  if (w !== SIZE || h !== SIZE) fail(`розмір ${w} × ${h}`);
  if (buf[24] !== 8 || buf[25] !== 2) fail(`глибина ${buf[24]}, тип кольору ${buf[25]} (потрібен 2 — RGB)`);
  for (let off = 8; off + 8 <= buf.length; off += 12 + buf.readUInt32BE(off)) {
    if (buf.toString('latin1', off + 4, off + 8) === 'tRNS') fail('є прозорість (tRNS)');
  }
}

// { назва: шлях від кореня проєкту } з опцій → перевірений список
function iconsFromProps(props) {
  const icons = (props && props.icons) || {};
  const list = Object.entries(icons);
  if (!list.length) throw new Error('withAlternateIcons: у опціях немає icons — { "AppIcon-Eye": "./assets/icon-eye.png" }.');
  for (const [name, src] of list) {
    if (!NAME.test(name)) throw new Error(`withAlternateIcons: назва набору «${name}» має бути на кшталт AppIcon-Eye.`);
    if (typeof src !== 'string' || !src) throw new Error(`withAlternateIcons: для ${name} не вказано PNG.`);
  }
  return list;
}

// Пише <Назва>.appiconset у каталог ресурсів головного таргета. Каталогу
// немає — шаблон не той, якого чекаємо, і набір просто не потрапив би в збірку.
function writeIconSet({ projectRoot, platformProjectRoot, projectName }, name, src) {
  const catalog = path.join(platformProjectRoot, projectName, CATALOG);
  if (!fs.existsSync(catalog)) {
    throw new Error(`withAlternateIcons: немає ${path.relative(projectRoot, catalog)} — шаблон prebuild не схожий на Expo SDK 57.`);
  }
  const png = fs.readFileSync(path.resolve(projectRoot, src));
  assertIconPng(png, src);
  const filename = `${name}-${SIZE}x${SIZE}@1x.png`;
  const dir = path.join(catalog, `${name}.appiconset`);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of fs.readdirSync(dir)) if (f !== filename && f !== 'Contents.json') fs.rmSync(path.join(dir, f));
  fs.writeFileSync(path.join(dir, filename), png);
  fs.writeFileSync(path.join(dir, 'Contents.json'), JSON.stringify(iconSetContents(filename), null, 2) + '\n');
  return dir;
}

// Вмикає «Include All App Icon Assets» у Debug і Release головного таргета.
function includeAllAppIcons(project, projectName) {
  const { target } = IOSConfig.XcodeUtils.getApplicationNativeTarget({ project, projectName });
  for (const [, cfg] of IOSConfig.XcodeUtils.getBuildConfigurationsForListId(project, target.buildConfigurationList)) {
    cfg.buildSettings[INCLUDE_ALL] = 'YES';
  }
  return project;
}

const withAlternateIcons = (config, props) => {
  const icons = iconsFromProps(props);
  return withXcodeProject(config, (cfg) => {
    for (const [name, src] of icons) writeIconSet(cfg.modRequest, name, src);
    includeAllAppIcons(cfg.modResults, cfg.modRequest.projectName);
    return cfg;
  });
};

module.exports = withAlternateIcons;
module.exports.INCLUDE_ALL = INCLUDE_ALL;
module.exports.iconSetContents = iconSetContents;
module.exports.assertIconPng = assertIconPng;
module.exports.iconsFromProps = iconsFromProps;
module.exports.writeIconSet = writeIconSet;
module.exports.includeAllAppIcons = includeAllAppIcons;
