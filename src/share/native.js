// Які нативні можливості «Поділитися» є в цій збірці.
//
// Нові пакети v1.3 (expo-clipboard, expo-media-library, expo-image-picker)
// на верхньому рівні кличуть requireNativeModule і кидають, якщо нативної
// частини немає. А лінивий require такого пакета Metro не віддає в наш
// catch: у старій dev-збірці, зібраній до цих пакетів, вийшов би червоний
// екран (урок коміту 7c364a2, див. getWidget у src/widgets/index.js). Тому
// спершу питаємо requireOptionalNativeModule — він просто повертає null —
// і лише після «так» actions.js робить require самого пакета.
//
// Імена — з ios/*Module.swift пакетів: ExpoClipboard, ExpoMediaLibraryNext
// («next» API SDK 57, саме його бере типовий експорт expo-media-library),
// ExponentImagePicker. InstagramStories — наш модуль (modules/instagram-stories).
import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

function nativeModule(name) {
  if (Platform.OS === 'web') return null;
  try {
    return requireOptionalNativeModule(name) || null;
  } catch (_) {
    return null;
  }
}

const has = (name) => !!nativeModule(name);

// PNG з альфою прямо в буфер (UIPasteboard, тип public.png) — лише в
// збірці, де наш Swift-модуль уже вміє copyPng. Старіша збірка має модуль
// без цієї функції.
export function canCopyPng() {
  if (Platform.OS !== 'ios') return false;
  const m = nativeModule('InstagramStories');
  return !!m && typeof m.copyPng === 'function';
}

export function storiesModule() {
  return Platform.OS === 'ios' ? nativeModule('InstagramStories') : null;
}

// «Копіювати»: власний copyPng або, як запасний шлях (Expo Go), expo-clipboard.
export const canCopy = () => canCopyPng() || has('ExpoClipboard');
export const canClipboard = () => has('ExpoClipboard');
// «Зберегти» — поки лише iOS: на Android плагін просить ширші дозволи.
export const canSave = () => Platform.OS === 'ios' && has('ExpoMediaLibraryNext');
export const canPick = () => has('ExponentImagePicker');
