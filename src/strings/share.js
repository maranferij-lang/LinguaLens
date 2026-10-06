// Рядки v1.3 потоку W4 (наліпки без тла: Stories, «Копіювати», «Зберегти»). Власник — W4; інші потоки
// цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській (у російській
// апострофа немає), без емодзі й капсу.
// Ключ, який уже є в іншому фрагменті, не дублюємо. Наявний ключ із
// src/i18n.js перекриваємо, лише назвавши його в OVERRIDES (стереже
// __tests__/i18nFragments.test.js). Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// shareTplSticker: картковий шаблон «Наліпка» став «Предмет» — «Наліпка»
// тепер окремий режим аркуша з прозорими наліпками (share.md D2).
export const OVERRIDES = ['shareTplSticker'];

export default {
  en: {
    // ── W4 ──
    shareTplSticker: 'Object',
    shareModeSticker: 'Sticker',
    shareModeCard: 'Card',
    shareStickerHint: 'No background: drops onto any photo',
    shareStickerLabel: 'Sticker without a background: {w}',
    shareStyleObject: 'Object + word',
    shareStyleWord: 'Word only',
    shareStoriesThisPhoto: 'Stories with this photo',
    shareStoriesMyPhoto: 'Stories with your photo',
    shareStoriesPickOther: 'or pick a photo from your library',
    shareStoriesPlain: 'Stories',
    shareCopy: 'Copy',
    shareCopyCta: 'Copy sticker',
    shareSave: 'Save',
    shareMore: 'More',
    shareCopied: 'Copied. In Stories or a chat, tap the screen and choose Paste.',
    shareSaved: 'Saved to Photos with a transparent background.',
    shareSaveDenied: 'LinguaLens can’t add to Photos. Allow it in Settings.',
    shareOpenSettings: 'Open Settings',
    shareCopyError: 'Couldn’t copy. Try again.',
    shareSaveError: 'Couldn’t save. Try again.',
  },

  uk: {
    // ── W4 ──
    shareTplSticker: 'Предмет',
    shareModeSticker: 'Наліпка',
    shareModeCard: 'Картка',
    shareStickerHint: 'Без тла: ляже на будь-яке фото',
    shareStickerLabel: 'Наліпка без тла: {w}',
    shareStyleObject: 'Предмет і слово',
    shareStyleWord: 'Лише слово',
    shareStoriesThisPhoto: 'Stories із цим фото',
    shareStoriesMyPhoto: 'Stories із твоїм фото',
    shareStoriesPickOther: 'або обрати фото з галереї',
    shareStoriesPlain: 'Stories',
    shareCopy: 'Копіювати',
    shareCopyCta: 'Копіювати наліпку',
    shareSave: 'Зберегти',
    shareMore: 'Ще',
    shareCopied: 'Скопійовано. Відкрий Stories чи чат, торкнись екрана й обери «Вставити».',
    shareSaved: 'Збережено у Фото, з прозорим тлом.',
    shareSaveDenied: 'LinguaLens не може додавати у Фото. Дозволь це в Параметрах.',
    shareOpenSettings: 'Відкрити Параметри',
    shareCopyError: 'Не вдалося скопіювати. Спробуй ще раз.',
    shareSaveError: 'Не вдалося зберегти. Спробуй ще раз.',
  },

  de: {
    // ── W4 ──
    shareTplSticker: 'Gegenstand',
    shareModeSticker: 'Sticker',
    shareModeCard: 'Karte',
    shareStickerHint: 'Ohne Hintergrund: passt auf jedes Foto',
    shareStickerLabel: 'Sticker ohne Hintergrund: {w}',
    shareStyleObject: 'Gegenstand + Wort',
    shareStyleWord: 'Nur das Wort',
    shareStoriesThisPhoto: 'Stories mit diesem Foto',
    shareStoriesMyPhoto: 'Stories mit deinem Foto',
    shareStoriesPickOther: 'oder ein Foto aus der Mediathek wählen',
    shareStoriesPlain: 'Stories',
    shareCopy: 'Kopieren',
    shareCopyCta: 'Sticker kopieren',
    shareSave: 'Sichern',
    shareMore: 'Mehr',
    shareCopied: 'Kopiert. Tippe in der Story oder im Chat auf den Bildschirm und wähle „Einsetzen“.',
    shareSaved: 'In Fotos gesichert, mit transparentem Hintergrund.',
    shareSaveDenied: 'LinguaLens darf nichts zu Fotos hinzufügen. Erlaube es in den Einstellungen.',
    shareOpenSettings: 'Einstellungen öffnen',
    shareCopyError: 'Kopieren hat nicht geklappt. Versuch es noch einmal.',
    shareSaveError: 'Sichern hat nicht geklappt. Versuch es noch einmal.',
  },

  es: {
    // ── W4 ──
    shareTplSticker: 'Objeto',
    shareModeSticker: 'Pegatina',
    shareModeCard: 'Tarjeta',
    shareStickerHint: 'Sin fondo: queda bien en cualquier foto',
    shareStickerLabel: 'Pegatina sin fondo: {w}',
    shareStyleObject: 'Objeto + palabra',
    shareStyleWord: 'Solo la palabra',
    shareStoriesThisPhoto: 'Stories con esta foto',
    shareStoriesMyPhoto: 'Stories con tu foto',
    shareStoriesPickOther: 'o elige una foto de tu galería',
    shareStoriesPlain: 'Stories',
    shareCopy: 'Copiar',
    shareCopyCta: 'Copiar pegatina',
    shareSave: 'Guardar',
    shareMore: 'Más',
    shareCopied: 'Copiado. En la historia o en un chat, toca la pantalla y elige «Pegar».',
    shareSaved: 'Guardado en Fotos con fondo transparente.',
    shareSaveDenied: 'LinguaLens no puede añadir a Fotos. Permítelo en Ajustes.',
    shareOpenSettings: 'Abrir Ajustes',
    shareCopyError: 'No se pudo copiar. Inténtalo de nuevo.',
    shareSaveError: 'No se pudo guardar. Inténtalo de nuevo.',
  },

  ru: {
    // ── W4 ──
    shareTplSticker: 'Предмет',
    shareModeSticker: 'Наклейка',
    shareModeCard: 'Карточка',
    shareStickerHint: 'Без фона: ляжет на любое фото',
    shareStickerLabel: 'Наклейка без фона: {w}',
    shareStyleObject: 'Предмет и слово',
    shareStyleWord: 'Только слово',
    shareStoriesThisPhoto: 'Stories с этим фото',
    shareStoriesMyPhoto: 'Stories с твоим фото',
    shareStoriesPickOther: 'или выбрать фото из галереи',
    shareStoriesPlain: 'Stories',
    shareCopy: 'Копировать',
    shareCopyCta: 'Копировать наклейку',
    shareSave: 'Сохранить',
    shareMore: 'Ещё',
    shareCopied: 'Скопировано. Открой Stories или чат, нажми на экран и выбери «Вставить».',
    shareSaved: 'Сохранено в Фото, с прозрачным фоном.',
    shareSaveDenied: 'LinguaLens не может добавлять в Фото. Разреши это в Настройках.',
    shareOpenSettings: 'Открыть Настройки',
    shareCopyError: 'Не удалось скопировать. Попробуй ещё раз.',
    shareSaveError: 'Не удалось сохранить. Попробуй ещё раз.',
  },
};
