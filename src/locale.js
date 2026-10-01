// Мова інтерфейсу → локаль для дат і чисел. Без явної локалі
// toLocaleDateString бере мову системи, і в українському інтерфейсі
// з'являлось «до October 8».
const LOCALES = { en: 'en-US', uk: 'uk-UA', de: 'de-DE', es: 'es-ES', pt: 'pt-PT', no: 'nb-NO', zh: 'zh-CN' };

export function localeFor(lang) {
  return LOCALES[lang] || lang || 'en-US';
}

export function formatDate(ts, lang, options = { day: 'numeric', month: 'long' }) {
  try {
    return new Date(ts).toLocaleDateString(localeFor(lang), options);
  } catch (_) {
    return new Date(ts).toLocaleDateString();
  }
}
