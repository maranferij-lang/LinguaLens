// Інтеграція v1.3 (план §8, C7): назви віджетів у галереї iOS мовою
// телефона. Плагін withWidgetLocalizations стоїть у app.json одразу ПЕРЕД
// expo-widgets: моди виконуються у зворотному порядку, і лише так мод
// Xcode-проєкту бачить уже створений таргет віджетів (після — лише
// попередження, і назви лишаються англійськими).
const fs = require('fs');
const path = require('path');
const appJson = require('../app.json');

const ROOT = path.join(__dirname, '..');
const names = appJson.expo.plugins.map((p) => (Array.isArray(p) ? p[0] : p));

test('the widget localizations plugin sits right before expo-widgets', () => {
  const at = names.indexOf('./plugins/withWidgetLocalizations');
  expect(at).toBeGreaterThan(-1);
  expect(names[at + 1]).toBe('expo-widgets');
  expect(fs.existsSync(path.join(ROOT, 'plugins', 'withWidgetLocalizations.js'))).toBe(true);
});

test('every app language has gallery names for the three widgets', () => {
  const table = require('../locales/widgets.json');
  const widgets = appJson.expo.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-widgets')[1].widgets;
  const keys = widgets.flatMap((w) => [w.displayName, w.description]);
  for (const lang of ['uk', 'de', 'es', 'ru']) {
    expect([lang, keys.filter((k) => !table[lang]?.[k])]).toEqual([lang, []]);
  }
});
