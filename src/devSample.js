// Тестове фото замість камери симулятора (onboarding.md §10.4).
//
// Камера в симуляторі iOS не знімає, а віддає згенерований квадрат 200×200
// (expo-camera ios/SimulatorUtils.swift) — модель не бачить на ньому жодного
// предмета, і перший скан онбордингу там не пройти. Тож у розробці сканер
// підміняє рівно такий кадр на це фото: та сама сцена столу з червоною
// чашкою, що в демо (tools/make-dev-sample.mjs).
//
// Лише __DEV__: у релізі require не виконується, і Metro викидає його разом із
// файлом (перевіряє scripts/check-dev-assets.js).
export const DEV_SAMPLE = __DEV__ ? require('../assets/dev/sample-desk.jpg') : null;

// Кадр, який віддає симулятор, — і лише він.
export function isSimulatorShot(photo, os) {
  return os === 'ios' && !!photo && photo.width === 200 && photo.height === 200;
}
