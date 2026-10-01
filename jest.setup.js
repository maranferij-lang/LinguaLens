// Нативних модулів у jest немає — підставляємо офіційні заглушки.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

// expo-audio у jest не має нативного модуля; нам потрібен лише режим звуку.
jest.mock('expo-audio', () => ({ setAudioModeAsync: jest.fn(async () => {}) }));
