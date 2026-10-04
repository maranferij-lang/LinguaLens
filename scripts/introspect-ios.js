#!/usr/bin/env node
// Info.plist такий, яким його зробить prebuild: app.json разом з усіма
// конфіг-плагінами (камера, «Фото», вибір фото…). Те саме, що
// `npx expo config --type introspect`, але лише iOS і лише потрібні ключі —
// без Xcode і без теки ios/. Друкує JSON у stdout.
// Запуск: node scripts/introspect-ios.js [корінь проєкту]
const path = require('path');

async function main() {
  const root = path.resolve(process.argv[2] || path.join(__dirname, '..'));
  // Пакети CLI лежать усередині expo — беремо їх звідти, як і сам CLI.
  const from = (id) => require(require.resolve(id, { paths: [require.resolve('expo/package.json', { paths: [root] })] }));
  const { getPrebuildConfigAsync } = from('@expo/prebuild-config');
  const { compileModsAsync } = from('@expo/config-plugins/build/plugins/mod-compiler.js');
  // Плагіни іноді пишуть попередження в консоль — stdout лишаємо для JSON.
  const log = console.log;
  console.log = console.warn = () => {};
  const config = await getPrebuildConfigAsync(root, { platforms: ['ios'] });
  await compileModsAsync(config.exp, { projectRoot: root, introspect: true, platforms: ['ios'], assertMissingModProviders: false });
  console.log = log;
  process.stdout.write(JSON.stringify({ infoPlist: config.exp.ios?.infoPlist || {} }));
}

main().catch((e) => {
  process.stderr.write(String(e?.stack || e));
  process.exit(1);
});
