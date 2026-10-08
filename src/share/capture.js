// Знімок картки чи наліпки → PNG → куди людина обрала.
//
// Знімаємо саму картку чи наліпку в повному логічному розмірі (360×640,
// 300×h), а не зменшене прев'ю: масштаб висить на обгортці вище, тож у
// PNG текст і наліпки виходять чіткими, а не розтягнутими з мініатюри.
//
// Лише PNG, ніколи JPEG: наліпка прозора. view-shot на iOS малює в
// UIGraphicsImageRenderer з opaque = NO, на Android — у ARGB-бітмапу,
// стерту до прозорого, тож де в знятого View немає тла, там у PNG альфа 0.
// На вебі (лише прев'ю верстки) html2canvas заливає тло білим.
//
// Файлами керує аркуш: один знімок живе, поки відкритий аркуш і не змінився
// вигляд, — «Копіювати», а потім «Зберегти» не знімають удруге. Тому тут
// нічого не прибирається само: аркуш кличе releaseShot, коли файл більше не
// потрібен.
import { PixelRatio, Platform } from 'react-native';
import { captureRef, releaseCapture } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import { EXPORT_H, EXPORT_W, exportSize, toFileUri } from './layout';

// size — пікселі PNG ({ w, h }: exportPixels для карток, stickerPixels для
// наліпок). Повертає file:// URI (на вебі — data-uri).
export async function captureView(view, { size = { w: EXPORT_W, h: EXPORT_H } } = {}) {
  if (!view) throw new Error('Nothing to capture');
  const web = Platform.OS === 'web';
  const uri = await captureRef(view, {
    format: 'png',
    quality: 1,
    // на вебі tmp-файлів немає — лише data-uri
    result: web ? 'data-uri' : 'tmpfile',
    ...exportSize(Platform.OS, PixelRatio.get(), size.w, size.h),
  });
  return web ? uri : toFileUri(uri);
}

// Прибирає тимчасовий PNG знімка. view-shot видаляє лише файли зі своєї
// теки tmp і хоче голий шлях, без file://.
export function releaseShot(uri) {
  if (!uri || Platform.OS === 'web' || String(uri).startsWith('data:')) return;
  try {
    releaseCapture(String(uri).replace(/^file:\/\//, ''));
  } catch (_) {}
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

// Системне меню «Поділитися» з готовим PNG. Кидає помилку з code:
// 'SHARE_UNAVAILABLE', якщо меню немає (буває на симуляторах і в обмежених
// профілях) — аркуш покаже окремий текст.
export async function shareFile(uri, { dialogTitle, fileName = 'lingualens.png' } = {}) {
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
