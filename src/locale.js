// Мова інтерфейсу → локаль для дат і чисел. Без явної локалі
// toLocaleDateString бере мову системи, і в українському інтерфейсі
// з'являлось «до October 8».
//
// Мова — та, якою інтерфейс реально говорить (uiLang): французу без
// перекладу UI речення пейволу англійське, і дата в ньому теж має бути
// англійською, а не «Free until 8 octobre».
import { uiLang } from './i18n';

const LOCALES = { en: 'en-US', uk: 'uk-UA', de: 'de-DE', es: 'es-ES' };

export function localeFor(lang) {
  const code = uiLang(lang);
  return LOCALES[code] || code;
}

export function formatDate(ts, lang, options = { day: 'numeric', month: 'long' }) {
  try {
    return new Date(ts).toLocaleDateString(localeFor(lang), options);
  } catch (_) {
    return new Date(ts).toLocaleDateString();
  }
}
