// Мова інтерфейсу: звідки береться і як із неї вийти на локаль для дат.
//
// Інтерфейс завжди говорить мовою телефону (pickUiLang у i18n.js), а не
// «моєю мовою» з налаштувань: та — лише мова перекладів. Телефон українською
// й переклади польською — застосунок українською; телефон російською —
// російською; телефон французькою — англійською, бо французького інтерфейсу
// в нас немає.
//
// Без явної локалі toLocaleDateString бере мову системи, і в українському
// інтерфейсі з'являлось «до October 8». Тож дати теж ідуть за uiLang: французу
// без перекладу UI речення пейволу англійське, і дата в ньому теж має бути
// англійською, а не «Free until 8 octobre».
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getLocales, useLocales } from 'expo-localization';
import { makeT, pickUiLang, uiLang } from './i18n';

const LOCALES = { en: 'en-US', uk: 'uk-UA', de: 'de-DE', es: 'es-ES', ru: 'ru-RU' };

// Мова інтерфейсу просто зараз — для тих, хто живе поза React (межа
// помилок над App) чи читає її один раз.
export function phoneUiLang() {
  try {
    return pickUiLang(getLocales());
  } catch (_) {
    return 'en';
  }
}

// Мова інтерфейсу, яка стежить за телефоном. Уже перший кадр — мовою
// телефону: значення читається синхронно, без «блимання» англійською.
// Змінити мову iOS перезапускає застосунок, тож там це майже завжди та сама
// мова; Android і веб міняють її на ходу — useLocales чує подію, а повернення
// з фону (там і змінюють мову) перечитує список про всяк випадок. Однакове
// значення React відкидає без перерендеру.
export function useUiLang() {
  const locales = useLocales();
  const [lang, setLang] = useState(() => pickUiLang(locales));
  useEffect(() => setLang(pickUiLang(locales)), [locales]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') setLang(phoneUiLang());
    });
    return () => sub?.remove?.();
  }, []);
  return lang;
}

// Регіон телефона для дат і часу: британець з англійським інтерфейсом бачить
// «8 October» і 24 години, а не американські «October 8» і AM/PM; австрієць —
// de-AT. Береться лише перша мова телефона, що збігається з мовою інтерфейсу
// (телефон [fr-FR, en-GB] має англійський інтерфейс, і французька дата в
// англійському реченні була б гірша за американську), і лише тег, який
// рушій знає. Нічого не вийшло — типова локаль мови з LOCALES.
function phoneTag(code) {
  try {
    for (const l of getLocales()) {
      const base = String(l?.languageCode || String(l?.languageTag || '').split(/[-_]/)[0] || '').toLowerCase();
      if (base !== code) continue;
      const tag = String(l.languageTag || '');
      return tag && Intl.DateTimeFormat.supportedLocalesOf(tag).length ? tag : null;
    }
  } catch (_) {}
  return null;
}

export function localeFor(lang) {
  const code = uiLang(lang);
  return phoneTag(code) || LOCALES[code] || code;
}

export function formatDate(ts, lang, options = { day: 'numeric', month: 'long' }) {
  try {
    return new Date(ts).toLocaleDateString(localeFor(lang), options);
  } catch (_) {
    return new Date(ts).toLocaleDateString();
  }
}

// Скільки лишилось до події — «3 год 13 хв», «3 h 13 min»: банер «серія
// згасне опівночі». Хвилини округлюємо вгору (за 30 секунд до півночі це ще
// «1 хв», а не «0 хв»); нульову частину не пишемо («2 год», «13 хв»).
export function formatLeft(ms, lang) {
  const t = makeT(uiLang(lang));
  const total = Math.max(1, Math.ceil((Number(ms) || 0) / 60000));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (!h) return t('timeLeftM', { m });
  return m ? t('timeLeftHM', { h, m }) : t('timeLeftH', { h });
}
