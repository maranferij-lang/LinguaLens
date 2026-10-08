// «Поділитися в Instagram Stories» напряму, без системного меню.
//
// Instagram забирає картинку з буфера обміну (нативний модуль
// modules/instagram-stories) і з 2023 року приймає її лише разом з App ID
// застосунку Meta. Тому кнопки немає, якщо бракує бодай чогось: iOS-збірки з
// модулем (Android, веб і Expo Go — без нього), App ID у конфігу чи самого
// Instagram на телефоні. Звичайне «Поділитися» працює за будь-яких умов.
import { Platform } from 'react-native';
import Stories from '../../modules/instagram-stories';
import { FACEBOOK_APP_ID } from '../config';

// Чи вміє ця збірка ділитися в Stories взагалі (синхронно, без Instagram).
// Аркуш за цим одразу резервує місце під кнопку — щоб прев'ю не стрибало.
export function storiesSupported() {
  return Platform.OS === 'ios' && !!Stories && !!FACEBOOK_APP_ID;
}

// Чи показувати кнопку. Питаємо щоразу, коли відкривається аркуш:
// Instagram могли встановити чи видалити, поки застосунок жив у фоні.
export async function storiesAvailable() {
  if (!storiesSupported()) return false;
  try {
    return (await Stories.isAvailable()) === true;
  } catch (_) {
    return false;
  }
}

// backgroundImage — картка на весь екран Stories. stickerImage — наліпка,
// яку в Stories можна рухати й масштабувати, на тлі topColor → bottomColor.
// Картинки — локальні PNG (file://). true — Instagram відкрився з картинкою.
export async function shareToStories({ backgroundImage, stickerImage, topColor, bottomColor }) {
  if (!storiesSupported() || !(backgroundImage || stickerImage)) return false;
  // Лише задані поля: порожні ключі нативному Record ні до чого.
  const options = { appId: FACEBOOK_APP_ID };
  if (backgroundImage) options.backgroundImage = backgroundImage;
  if (stickerImage) options.stickerImage = stickerImage;
  if (topColor) options.topColor = topColor;
  if (bottomColor) options.bottomColor = bottomColor;
  try {
    return (await Stories.share(options)) === true;
  } catch (_) {
    return false;
  }
}
