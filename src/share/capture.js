// Знімок картки → PNG 1080×1920 → системне меню «Поділитися».
//
// Знімаємо саму картку в повному логічному розмірі (360×640), а не її
// зменшене прев'ю: масштаб висить на обгортці вище, тож у PNG текст і
// наліпки виходять чіткими, а не розтягнутими з мініатюри.
//
// Лише PNG, ніколи JPEG: шаблон «без тла» — прозорий. view-shot на iOS малює
// в UIGraphicsImageRenderer з opaque = NO, на Android — у ARGB-бітмапу,
// стерту до прозорого, тож де в знятого View немає тла, там у PNG альфа 0.
import { PixelRatio, Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { EXPORT_H, EXPORT_W, exportSize, toFileUri } from './layout';

// Останній тимчасовий PNG. Прибираємо його перед наступним знімком: на той
// момент попереднє меню «поділитись» (чи Instagram) уже забрало файл, а
// файл по 1–3 МБ інакше лежав би в tmp до кінця сесії.
let previous = null;

// size — пікселі PNG ({ w, h }, див. exportPixels). Повертає file:// URI
// (на вебі — data-uri).
export async function captureCard(view, { size = { w: EXPORT_W, h: EXPORT_H } } = {}) {
  if (!view) throw new Error('Card is not mounted');
  const web = Platform.OS === 'web';
  if (previous) {
    try {
      releaseCapture(previous);
    } catch (_) {}
    previous = null;
  }
  const uri = await captureRef(view, {
    format: 'png',
    quality: 1,
    // на вебі tmp-файлів немає — лише data-uri
    result: web ? 'data-uri' : 'tmpfile',
    ...exportSize(Platform.OS, PixelRatio.get(), size.w, size.h),
  });
  if (web) return uri;
  previous = uri;
  return toFileUri(uri);
}

// Веб — лише для перегляду верстки: файлом поділитися там не можна
// (Web Share API не бере локальні файли), тож просто завантажуємо PNG.
function download(dataUri, fileName) {
  if (typeof document === 'undefined') return;
  const a = document.createElement('a');
  a.href = dataUri;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Кидає помилку з code: 'SHARE_UNAVAILABLE', якщо системного меню немає
// (буває на симуляторах і в обмежених профілях) — аркуш покаже окремий текст.
// cancelled() — людина закрила аркуш, поки картка рендерилась: меню тоді не
// відкриваємо, інакше воно вискочило б над екраном, з якого вже пішли.
export async function shareCard(view, { dialogTitle, fileName = 'lingualens.png', size, cancelled } = {}) {
  const uri = await captureCard(view, { size });
  if (cancelled?.()) return;
  if (Platform.OS === 'web') {
    download(uri, fileName);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) {
    const err = new Error('Sharing is not available');
    err.code = 'SHARE_UNAVAILABLE';
    throw err;
  }
  await Sharing.shareAsync(uri, { mimeType: 'image/png', UTI: 'public.png', dialogTitle });
}
