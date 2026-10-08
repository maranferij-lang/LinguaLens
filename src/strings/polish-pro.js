// Рядки полірування «Pro» (жовтень 2026): стирання даних і відновлення покупок
// у Параметрах, підпис аватарів у редакторі профілю, лист до підтримки без
// поштового застосунку, «вже куплено» на пейволі, заголовок діагностики,
// підпис заглушки цін на пейволі і мова, що відкриє Pro, у списку мов.
// Власник — потік pro; інші потоки цей файл лише читають.
//
// Правила тексту — у шапці src/i18n.js: однаковий набір ключів у пʼяти
// мовах, множини {n|…}, «» / “” / „“, ʼ в українській (у російській
// апострофа немає), без емодзі, капсу й довгих тире. Ключ, який уже є в
// іншому фрагменті, не дублюємо. Кожна мова — окремий блок у цьому ж
// форматі (`  en: {` … `  },`): тест шукає в ньому ключі-дублікати.
//
// Інтегратору: додати `import * as polishPro from './strings/polish-pro';`
// в src/i18n.js, у FRAGMENTS (після pro), у merged() і в NAMES тесту
// __tests__/i18nFragments.test.js.
export default {
  en: {
    // ── Параметри → «Стерти мої дані» ──
    eraseBusy: 'Erasing your data…',
    eraseDone: 'Data erased',
    eraseDoneText: 'Your data was removed from this iPhone and from our server.',

    // ── лист до підтримки, коли немає поштового застосунку ──
    supportCopied: 'We couldn’t open Mail, so the address {e} is copied. Write to us from any mail app.',

    // ── редактор профілю: VoiceOver називає кожного Lingo ──
    avatarOption: 'Lingo {n} of {total}',

    // ── пейвол: Pro вже є на цьому Apple ID ──
    purchaseAlreadyOwned: 'You may already have Pro on this Apple ID. Tap “Restore purchases”.',

    // ── пейвол: на місці цін заглушка (Skeleton прихований від VoiceOver) ──
    plansLoading: 'Loading prices',

    // ── Параметри → мова навчання: рядок, що відкриє пейвол ──
    langA11yPro: '{l}, available with Pro',

    // ── Параметри: прихована діагностика (сім дотиків по футеру) ──
    diagnostics: 'Diagnostics',
  },
  uk: {
    eraseBusy: 'Стираю твої дані…',
    eraseDone: 'Дані стерто',
    eraseDoneText: 'Твої дані стерто з цього iPhone і з нашого сервера.',

    supportCopied: 'Не вдалося відкрити Пошту, тож адресу {e} скопійовано. Напиши нам із будь-якого поштового застосунку.',

    avatarOption: 'Lingo {n} із {total}',

    purchaseAlreadyOwned: 'Схоже, Pro вже є на цьому Apple ID. Натисни «Відновити покупки».',

    plansLoading: 'Завантаження цін',

    langA11yPro: '{l}, доступна з Pro',

    diagnostics: 'Діагностика',
  },
  de: {
    eraseBusy: 'Deine Daten werden gelöscht…',
    eraseDone: 'Daten gelöscht',
    eraseDoneText: 'Deine Daten wurden von diesem iPhone und von unserem Server gelöscht.',

    supportCopied: 'Mail ließ sich nicht öffnen, deshalb ist die Adresse {e} kopiert. Schreib uns aus einer beliebigen Mail-App.',

    avatarOption: 'Lingo {n} von {total}',

    purchaseAlreadyOwned: 'Vielleicht hast du Pro mit dieser Apple-ID schon. Tippe auf „Käufe wiederherstellen“.',

    plansLoading: 'Preise werden geladen',

    langA11yPro: '{l}, mit Pro verfügbar',

    diagnostics: 'Diagnose',
  },
  es: {
    eraseBusy: 'Borrando tus datos…',
    eraseDone: 'Datos borrados',
    eraseDoneText: 'Tus datos se borraron de este iPhone y de nuestro servidor.',

    supportCopied: 'No se pudo abrir Mail, así que copiamos la dirección {e}. Escríbenos desde cualquier app de correo.',

    avatarOption: 'Lingo {n} de {total}',

    purchaseAlreadyOwned: 'Puede que ya tengas Pro con este Apple ID. Toca «Restaurar compras».',

    plansLoading: 'Cargando precios',

    langA11yPro: '{l}, disponible con Pro',

    diagnostics: 'Diagnóstico',
  },
  ru: {
    eraseBusy: 'Стираю твои данные…',
    eraseDone: 'Данные стёрты',
    eraseDoneText: 'Твои данные стёрты с этого iPhone и с нашего сервера.',

    supportCopied: 'Не удалось открыть Почту, поэтому адрес {e} скопирован. Напиши нам из любого почтового приложения.',

    avatarOption: 'Линго {n} из {total}',

    purchaseAlreadyOwned: 'Похоже, Pro уже есть на этом Apple ID. Нажми «Восстановить покупки».',

    plansLoading: 'Загрузка цен',

    langA11yPro: '{l}, доступен с Pro',

    diagnostics: 'Диагностика',
  },
};
