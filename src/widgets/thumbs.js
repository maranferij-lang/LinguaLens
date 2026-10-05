// Мініатюри для «Моїх слів» (план W2: квадратний JPEG 200 px за прапорцем
// WIDGET_THUMBS; прозора вирізка — v1.3.1). Неквадратне фото — квадрат по
// центру (thumbCrop), а не сплющене.
//
// Віджет не бачить пісочниці застосунку — лише спільну теку App Group
// (widgetsDirectory). Тож для слів пулу й рядків «Далі» кладемо туди
// thumbs/<id>.jpg: 200 px, бо розширення має ≈30 МБ пам'яті, а картинку
// Image читає повністю. Не більше 30 файлів; зайві видаляємо. Розмітка від
// картинки не залежить: файлу немає (стерли, оновили збірку) — віджет
// просто покаже плитку з літерою.
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { Directory, File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { WIDGET_THUMBS } from '../flags';
import { photoUri } from '../photos';

// Рендер і збереження; нативні об'єкти звільняємо завжди.
async function renderAndSave(context, saveOptions) {
  let image = null;
  try {
    image = await context.renderAsync();
    return await image.saveAsync(saveOptions);
  } finally {
    image?.release?.();
    context.release?.();
  }
}

export const THUMB_PX = 200;
export const MAX_THUMBS = 30;
const DIR = 'thumbs';

// Квадрат по центру фото → { originX, originY, width, height }; фото вже
// квадратне (наліпка) чи розмір невідомий — null. Плитка віджета квадратна,
// а resize одразу до 200×200 iOS малює рівно в цей розмір: кадр 3:4 (слово
// без рамки предмета, слова v1.0) вийшов би сплющеним, і aspectRatio(fill)
// у віджеті цього вже не виправить.
export function thumbCrop(w, h) {
  if (!(w > 0 && h > 0) || w === h) return null;
  const side = Math.min(w, h);
  return { originX: Math.floor((w - side) / 2), originY: Math.floor((h - side) / 2), width: side, height: side };
}

// Розмір беремо з уже декодованого фото (як normalizeBackground у
// share/actions.js), тоді обрізаємо й зменшуємо.
async function makeThumb(src) {
  const base = ImageManipulator.manipulate(src);
  let ref = null;
  try {
    ref = await base.renderAsync();
    const crop = thumbCrop(ref?.width, ref?.height);
    let ctx = ImageManipulator.manipulate(ref);
    if (crop) ctx = ctx.crop(crop);
    return await renderAndSave(ctx.resize({ width: THUMB_PX, height: THUMB_PX }), { compress: 0.75, format: SaveFormat.JPEG });
  } finally {
    try {
      ref?.release?.();
    } catch (_) {}
    try {
      base.release?.();
    } catch (_) {}
  }
}

// file:// теки App Group або null (Expo Go, Android, збірка без віджетів).
// expo-widgets читаємо лише після перевірки: без нативної частини він падає
// вже на імпорті.
export function widgetsDir() {
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === 'storeClient') return null;
  try {
    const dir = require('expo-widgets').widgetsDirectory;
    return typeof dir === 'string' && dir ? (dir.endsWith('/') ? dir : dir + '/') : null;
  } catch (_) {
    return null;
  }
}

function folder() {
  const base = widgetsDir();
  return base ? new Directory(base, DIR) : null;
}

const fileName = (id) => String(id).replace(/[^\w-]/g, '_') + '.jpg';

// Мініатюри, що вже лежать: { id: file:// } для слів зі списку.
export function existingThumbs(words) {
  const dir = WIDGET_THUMBS ? folder() : null;
  const out = {};
  if (!dir) return out;
  for (const w of words) {
    try {
      const f = new File(dir, fileName(w.id));
      if (f.exists) out[String(w.id)] = f.uri;
    } catch (_) {}
  }
  return out;
}

// Готує мініатюри для слів (≤ 30, з фото) і прибирає зайві.
// → { id: file:// } для тих, що є. Ніколи не кидає.
export async function ensureThumbs(words) {
  const dir = WIDGET_THUMBS ? folder() : null;
  if (!dir) return {};
  const list = words.filter((w) => w && w.photo && w.id != null).slice(0, MAX_THUMBS);
  const out = {};
  try {
    dir.create({ intermediates: true, idempotent: true });
  } catch (_) {
    return out;
  }
  for (const w of list) {
    const target = new File(dir, fileName(w.id));
    try {
      if (!target.exists) {
        const made = await makeThumb(photoUri(w.photo));
        const tmp = new File(made.uri);
        tmp.copySync(target);
        try {
          tmp.delete();
        } catch (_) {}
      }
      if (target.exists) out[String(w.id)] = target.uri;
    } catch (_) {
      // фото зникло чи не читається — у віджеті буде плитка з літерою
    }
  }
  cleanThumbs(new Set(list.map((w) => fileName(w.id))));
  return out;
}

// Видаляє мініатюри, яких немає в keep (імена файлів); без keep — усі.
export function cleanThumbs(keep = null) {
  const dir = folder();
  if (!dir) return;
  try {
    if (!dir.exists) return;
    if (!keep) {
      dir.delete();
      return;
    }
    for (const item of dir.list()) {
      if (item instanceof File && !keep.has(item.name)) item.delete();
    }
  } catch (_) {}
}
