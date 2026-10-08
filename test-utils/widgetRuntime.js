// «Рантайм віджета» для jest — так само, як розширення iOS виконує розмітку.
//
// expo-widgets збирає окремий бандл (node_modules/expo-widgets/bundle): у
// ньому справжні компоненти й модифікатори @expo/ui/swift-ui, але 'expo',
// 'react' і 'react/jsx-runtime' підмінено заглушками (metro.config.js
// пакета): requireNativeView повертає функцію → { type: 'TextView', props },
// а jsx викликає компонент-функцію одразу. Розмітка віджета — рядок
// (babel-плагін 'widget'), і виконується вона з цими іменами як
// глобальними. Відтворюємо саме це: справжні файли компонентів @expo/ui зі
// справжніми заглушками й декоратором кнопок пакета, тож тест бачить те
// саме дерево вузлів, що й SwiftUI-частина (TextView, VStackView, Button з
// onButtonPress…).
//
// Компоненти вантажимо поштучно, а не через index @expo/ui: той тягне Host,
// клавіатуру й State, яким у jest потрібен справжній react-native.
// Модифікатори — справжній модуль, як і в застосунку.
const fs = require('fs');
const path = require('path');

const PKG = (name) => path.dirname(require.resolve(name + '/package.json'));
const BUNDLE = path.join(PKG('expo-widgets'), 'bundle');
const SWIFT_UI = path.join(PKG('@expo/ui'), 'src', 'swift-ui');

// Компоненти, які віджет може використати (усі вони — у @expo/ui/swift-ui).
const COMPONENTS = [
  'Text',
  'Button',
  'HStack',
  'VStack',
  'ZStack',
  'Spacer',
  'Image',
  'Gauge',
  'ProgressView',
  'Link',
  'Label',
  'Divider',
  'Shapes',
  'AccessoryWidgetBackground',
];

const STUBS = {
  react: 'react-stub.ts',
  'react/jsx-runtime': 'jsx-runtime-stub.ts',
  'react/jsx-dev-runtime': 'jsx-runtime-stub.ts',
};

function loadScope() {
  const modifiers = jest.requireActual('@expo/ui/swift-ui/modifiers');
  // 'expo' у jest уже замоканий (jest.setup.js) і закешований, тож doMock в
  // ізоляції його не перекриває: на час завантаження компонентів підміняємо
  // requireNativeView у самому об'єкті — компоненти беруть його лише при
  // імпорті.
  const expo = require('expo');
  const realView = expo.requireNativeView;
  expo.requireNativeView = jest.requireActual(path.join(BUNDLE, 'expo-stub.ts')).requireNativeView;
  let scope = null;
  try {
    jest.isolateModules(() => {
      for (const [name, file] of Object.entries(STUBS)) jest.doMock(name, () => jest.requireActual(path.join(BUNDLE, file)));
      // Image бере font і foregroundStyle з '../modifiers' — той самий модуль
      const modIndex = path.join(SWIFT_UI, 'modifiers', 'index.ts');
      jest.doMock(modIndex, () => modifiers);
      const swiftUI = {};
      for (const c of COMPONENTS) Object.assign(swiftUI, jest.requireActual(path.join(SWIFT_UI, c)));
      const jsx = jest.requireActual(path.join(BUNDLE, 'jsx-runtime-stub.ts'));
      const React = jest.requireActual(path.join(BUNDLE, 'react-stub.ts'));
      const { decorateInteractiveTargets } = jest.requireActual(path.join(BUNDLE, 'decorator.ts'));
      // як Object.assign(globalThis, …) у bundle/index.ts
      scope = { ...swiftUI, ...modifiers, ...jsx, ...React, React };
      scope.__decorate = decorateInteractiveTargets;
      scope.__components = swiftUI;
      // doMock діє на весь файл тесту — знімаємо, щоб решта бачила справжні модулі
      for (const name of [...Object.keys(STUBS), modIndex]) jest.dontMock(name);
    });
  } finally {
    expo.requireNativeView = realView;
  }
  return scope;
}

let cached = null;
function runtime() {
  if (!cached) cached = loadScope();
  return cached;
}

// Типи вузлів, які вміє намалювати розширення (case "…" у DynamicView.swift):
// вузол іншого типу на пристрої — порожнє місце (а в debug — червона плашка).
function supportedTypes() {
  const src = fs.readFileSync(path.join(PKG('expo-widgets'), 'ios', 'Widgets', 'DynamicView.swift'), 'utf8');
  return new Set([...src.matchAll(/case "([^"]+)":/g)].map((m) => m[1]).filter((t) => t !== 'RedBoxView'));
}

// Рядок розмітки, який модуль віджета передав у createWidget(name, layout).
function layoutOf(modulePath) {
  const { createWidget } = require('expo-widgets');
  createWidget.mockClear();
  jest.isolateModules(() => require(modulePath));
  return createWidget.mock.calls[0][1];
}

// → { render(props, env), press(props, env, target), layout }
// render — як __expoWidgetRender: environment.timestamp → date, кнопкам —
// target; press — як __expoWidgetHandlePress: знаходить кнопку за target і
// повертає те, що віддав її onPress (нові props запису).
function compile(modulePath) {
  const layout = layoutOf(modulePath);
  const scope = runtime();
  const names = Object.keys(scope).filter((n) => /^[A-Za-z_$][\w$]*$/.test(n) && !n.startsWith('__'));
  const fn = new Function(...names, `"use strict"; return (${layout});`)(...names.map((n) => scope[n]));
  const render = (props, environment) => {
    const { timestamp, ...rest } = environment;
    const env = { ...rest };
    if (timestamp) env.date = new Date(timestamp);
    return scope.__decorate(fn(props, env));
  };
  const press = (props, environment, target) => {
    const { target: _t, ...renderEnv } = environment;
    const find = (node) => {
      const p = node && node.props;
      if (p && p.onButtonPress && p.target === target) return p.onButtonPress();
      for (const child of kids(node)) {
        const r = find(child);
        if (r) return r;
      }
      return undefined;
    };
    return find(render(props, renderEnv));
  };
  return { layout, render, press, scope };
}

// Середовище, яке дає WidgetKit (ios/Widgets/Utils.swift getWidgetEnvironment).
//   ios: 17 — є widgetContentMargins (iOS 17+), 16 — немає.
function env(widgetFamily, extra = {}) {
  const { ios = 17, ...rest } = extra;
  const accessory = widgetFamily.startsWith('accessory');
  const base = {
    widgetFamily,
    widgetRenderingMode: accessory ? 'vibrant' : 'fullColor',
    colorScheme: 'light',
    showsContainerBackground: !accessory,
    isLuminanceReduced: false,
    showsWidgetLabel: false,
    timestamp: Date.now(),
  };
  if (ios >= 17) base.widgetContentMargins = { top: 16, bottom: 16, leading: 16, trailing: 16 };
  return { ...base, ...rest };
}

function kids(n) {
  const c = n && n.props && n.props.children;
  if (c == null) return [];
  return Array.isArray(c) ? c.flat(Infinity) : [c];
}

// Обхід дерева вузлів.
function nodes(n) {
  if (Array.isArray(n)) return n.flatMap(nodes);
  if (n && typeof n === 'object' && 'type' in n) return [n, ...kids(n).flatMap(nodes)];
  return [];
}

const mods = (n) => Object.fromEntries(((n && n.props && n.props.modifiers) || []).map((m) => [m.$type, m]));
const texts = (tree) =>
  nodes(tree)
    .filter((n) => n.type === 'TextView' && n.props.text != null)
    .map((n) => n.props.text);

module.exports = { compile, env, nodes, mods, texts, kids, supportedTypes };
