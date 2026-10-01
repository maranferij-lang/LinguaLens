// Нативних модулів у jest немає — підставляємо офіційні заглушки.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-audio у jest не має нативного модуля; нам потрібен лише режим звуку.
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => {}) }));

// Sign in with Apple: у jest нативного модуля немає. Тести, яким потрібна
// поведінка, перевизначають signInAsync/isAvailableAsync через mockResolvedValue.
jest.mock('expo-apple-authentication', () => {
  const React = require('react');
  return {
    isAvailableAsync: jest.fn(async () => true),
    signInAsync: jest.fn(async () => {
      throw Object.assign(new Error('not mocked'), { code: 'ERR_REQUEST_UNKNOWN' });
    }),
    signOutAsync: jest.fn(async () => {}),
    AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
    AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
    AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
    AppleAuthenticationButton: (props) => React.createElement('AppleAuthenticationButton', props),
  };
});

// Віджет головного екрана (expo-widgets): нативний модуль є лише в iOS-збірці.
// createWidget повертає об'єкт із тими самими методами, що й справжній.
jest.mock('expo-widgets', () => ({
  createWidget: jest.fn(() => ({
    updateTimeline: jest.fn(),
    updateSnapshot: jest.fn(),
    reload: jest.fn(),
    getTimeline: jest.fn(async () => []),
  })),
  addUserInteractionListener: jest.fn(() => ({ remove() {} })),
  widgetsDirectory: null,
}));

// @expo/ui — нативні SwiftUI-компоненти, і в застосунку їх імпортує лише
// розмітка віджета, яку babel-плагін expo-widgets однаково перетворює на
// рядок. Справжній пакет у jest — це ~4 с трансформації на холодному кеші,
// і платив би їх перший тест, що рендерить App (лінивий require віджета):
// на CI він вилітав за 5-секундний ліміт і тягнув за собою решту набору.
// Перевірка, що віджет використовує лише наявні компоненти, бере справжній
// пакет через jest.requireActual (__tests__/widget.test.js).
jest.mock('@expo/ui/swift-ui', () => ({}));
jest.mock('@expo/ui/swift-ui/modifiers', () => ({}));
