// Дії аркуша «Поділитися» з готовим PNG: копіювати, зберегти у «Фото»,
// обрати своє фото тлом і відкрити Instagram Stories.
//
// Кожен новий нативний пакет — лише після перевірки з native.js: require
// пакета, якого немає в збірці, дав би червоний екран (див. там). Помилки
// виходять назовні з code — аркуш показує під нього свій текст:
//   COPY_FAILED, SAVE_DENIED (+ canAskAgain), SAVE_FAILED, STORIES_FAILED.
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { renderAndSave, sceneCrop } from '../cutout';
import { shareToStories } from './instagram';
import { STORIES_GRADIENT } from './layout';
import { canClipboard, canCopyPng, canPick, canSave, storiesModule } from './native';

export function shareError(code, extra) {
  return Object.assign(new Error(code), { code }, extra);
}

// Тимчасовий файл більше не потрібен (тло з галереї після Instagram).
export function dropFile(uri) {
  if (!uri || String(uri).startsWith('data:')) return;
  try {
    new File(uri).delete();
  } catch (_) {}
}

// ─── Копіювати ─────────────────────────────────────────────────────────────
// Спершу власний copyPng (UIPasteboard з типом public.png — альфа цілою).
// expo-clipboard кладе UIImage, і iOS може віддати її далі JPEG-ом без
// прозорості, тож він лише запасний шлях: Expo Go, де нашого модуля немає.
// Повертає, яким шляхом скопійовано: 'png' | 'clipboard'.
export async function copyImage(uri) {
  if (canCopyPng()) {
    try {
      if ((await storiesModule().copyPng(uri)) === true) return 'png';
    } catch (_) {}
  }
  if (canClipboard()) {
    try {
      const b64 = await new File(uri).base64();
      await require('expo-clipboard').setImageAsync(b64);
      return 'clipboard';
    } catch (_) {}
  }
  throw shareError('COPY_FAILED');
}

// ─── Зберегти у «Фото» ─────────────────────────────────────────────────────
// Лише дозвіл «додавати» (writeOnly = true): системне вікно iOS тоді питає
// про додавання, а не про доступ до всієї бібліотеки. Asset.create імпортує
// PNG як є — з прозорим тлом; файл мусить мати розширення (.png у view-shot).
export async function saveImage(uri) {
  if (!canSave()) throw shareError('SAVE_FAILED');
  const ML = require('expo-media-library');
  let p;
  try {
    p = await ML.getPermissionsAsync(true);
    if (!granted(p)) p = await ML.requestPermissionsAsync(true);
  } catch (_) {
    throw shareError('SAVE_FAILED');
  }
  // canAskAgain: true — наступний дотик знову покаже системне вікно
  if (!granted(p)) throw shareError('SAVE_DENIED', { canAskAgain: p?.canAskAgain !== false });
  try {
    await ML.Asset.create(uri);
  } catch (_) {
    throw shareError('SAVE_FAILED');
  }
}

function granted(p) {
  return !!p && (p.granted === true || p.status === 'granted');
}

// ─── Своє фото тлом ────────────────────────────────────────────────────────
// Системний вибір фото (PHPicker) дозволу на бібліотеку не просить: людина
// віддає одне фото. Скасували — null, без помилки.
export async function pickBackground() {
  if (!canPick()) return null;
  const IP = require('expo-image-picker');
  const res = await IP.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: false,
    quality: 1,
    exif: false,
    // HEIC і «живі» фото — у сумісний JPEG ще на боці iOS
    preferredAssetRepresentationMode: 'compatible',
  });
  const asset = res && !res.canceled ? res.assets?.[0] : null;
  if (!asset?.uri) return null;
  return normalizeBackground(asset);
}

// Тло Stories — 9:16. Вертикальне фото (ширина ≤ 0.7 висоти) ріжемо по
// центру до 9:16 і стискаємо до 1080×1920. Решту не кропимо: Instagram сам
// упише фото, а людина розтягне його пальцями; лише довша сторона ≤ 1920.
export const BG_PORTRAIT = 0.7;
export const BG_W = 1080;
export const BG_LONG = 1920;

export function backgroundPlan(w, h) {
  if (!(w > 0 && h > 0)) return { crop: null, resize: null };
  if (w / h <= BG_PORTRAIT) {
    const crop = sceneCrop(w, h);
    return { crop, resize: crop.width > BG_W ? { width: BG_W } : null };
  }
  if (Math.max(w, h) <= BG_LONG) return { crop: null, resize: null };
  return { crop: null, resize: w >= h ? { width: BG_LONG } : { height: BG_LONG } };
}

// Завжди JPEG 0.9: HEIC і поворот з EXIF маніпулятор переписує. Розмір
// беремо з уже декодованого фото: width/height з вибору фото бувають «до
// повороту», і тоді вертикальне різалося б як горизонтальне.
export async function normalizeBackground(asset) {
  const base = ImageManipulator.manipulate(asset.uri);
  let ref = null;
  try {
    ref = await base.renderAsync();
    const plan = backgroundPlan(ref?.width || asset.width, ref?.height || asset.height);
    let ctx = ImageManipulator.manipulate(ref);
    if (plan.crop) {
      const c = plan.crop;
      ctx = ctx.crop({ originX: c.x, originY: c.y, width: c.width, height: c.height });
    }
    if (plan.resize) ctx = ctx.resize(plan.resize);
    const out = await renderAndSave(ctx, { compress: 0.9, format: SaveFormat.JPEG });
    return { uri: out.uri, width: out.width, height: out.height };
  } finally {
    try {
      ref?.release?.();
    } catch (_) {}
    try {
      base.release?.();
    } catch (_) {}
  }
}

// ─── Instagram Stories ─────────────────────────────────────────────────────
// background — фото тлом (кадр скану, фото сцени, обране з галереї) або
// картка на весь екран; sticker — прозора наліпка зверху. Тло й наліпка —
// два окремі шари Meta: людина рухає наліпку пальцями у своєму Instagram.
// Без тла наліпка лягає на фірмовий градієнт (кольори з тлом Meta ігнорує).
export async function storiesWith({ background, sticker }) {
  const options = background
    ? { backgroundImage: background, ...(sticker ? { stickerImage: sticker } : null) }
    : { stickerImage: sticker, topColor: STORIES_GRADIENT[0], bottomColor: STORIES_GRADIENT[1] };
  if (!(await shareToStories(options))) throw shareError('STORIES_FAILED');
}
