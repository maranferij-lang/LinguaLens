// Мови + озвучка нативними голосами iOS
// Кожна мова має перевірену iOS TTS-локаль. Щоб прибрати мову — видали рядок.
// Англійська й іспанська мають варіанти (src/langVariants.js): прапорець і
// голос тоді беремо з варіанта, а тут лишається базовий голос (він же запасний).
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';
import { variantInfo, variantOf } from './langVariants';

export const LANGS = [
  { code: 'en', name: 'English', flag: '🇺🇸', tts: 'en-US' },
  { code: 'uk', name: 'Українська', flag: '🇺🇦', tts: 'uk-UA' },
  { code: 'de', name: 'Deutsch', flag: '🇩🇪', tts: 'de-DE' },
  { code: 'es', name: 'Español', flag: '🇪🇸', tts: 'es-ES' },
  { code: 'fr', name: 'Français', flag: '🇫🇷', tts: 'fr-FR' },
  { code: 'it', name: 'Italiano', flag: '🇮🇹', tts: 'it-IT' },
  { code: 'pl', name: 'Polski', flag: '🇵🇱', tts: 'pl-PL' },
  { code: 'pt', name: 'Português', flag: '🇵🇹', tts: 'pt-PT' },
  { code: 'nl', name: 'Nederlands', flag: '🇳🇱', tts: 'nl-NL' },
  { code: 'cs', name: 'Čeština', flag: '🇨🇿', tts: 'cs-CZ' },
  { code: 'sk', name: 'Slovenčina', flag: '🇸🇰', tts: 'sk-SK' },
  { code: 'ro', name: 'Română', flag: '🇷🇴', tts: 'ro-RO' },
  { code: 'hu', name: 'Magyar', flag: '🇭🇺', tts: 'hu-HU' },
  { code: 'el', name: 'Ελληνικά', flag: '🇬🇷', tts: 'el-GR' },
  { code: 'sv', name: 'Svenska', flag: '🇸🇪', tts: 'sv-SE' },
  { code: 'da', name: 'Dansk', flag: '🇩🇰', tts: 'da-DK' },
  { code: 'no', name: 'Norsk', flag: '🇳🇴', tts: 'nb-NO' },
  { code: 'fi', name: 'Suomi', flag: '🇫🇮', tts: 'fi-FI' },
  { code: 'tr', name: 'Türkçe', flag: '🇹🇷', tts: 'tr-TR' },
  { code: 'ru', name: 'Русский', flag: '🇷🇺', tts: 'ru-RU' },
  { code: 'ja', name: '日本語', flag: '🇯🇵', tts: 'ja-JP' },
  { code: 'ko', name: '한국어', flag: '🇰🇷', tts: 'ko-KR' },
  { code: 'zh', name: '中文', flag: '🇨🇳', tts: 'zh-CN' },
  { code: 'ar', name: 'العربية', flag: '🇸🇦', tts: 'ar-SA' },
  { code: 'he', name: 'עברית', flag: '🇮🇱', tts: 'he-IL' },
  { code: 'hi', name: 'हिन्दी', flag: '🇮🇳', tts: 'hi-IN' },
  { code: 'th', name: 'ไทย', flag: '🇹🇭', tts: 'th-TH' },
  { code: 'vi', name: 'Tiếng Việt', flag: '🇻🇳', tts: 'vi-VN' },
  { code: 'id', name: 'Bahasa Indonesia', flag: '🇮🇩', tts: 'id-ID' },
];

function langOf(code) {
  return LANGS.find((l) => l.code === code) || LANGS[0];
}

// Дозволяє звуку грати навіть коли iPhone у беззвучному режимі. Заразом
// дізнаємось, які голоси є на телефоні: голосу варіанта (es-MX) може не
// бути, і тоді iOS читала б іспанське слово голосом мови системи.
export async function initAudio() {
  loadVoices();
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch (_) {}
}

// Мовні теги голосів телефона ('es-mx', 'en-gb'); null — ще не знаємо.
let voiceTags = null;
let voicesP = null;
const tagKey = (tag) => String(tag || '').replace(/_/g, '-').toLowerCase();

export function loadVoices() {
  if (voicesP) return voicesP;
  if (typeof Speech.getAvailableVoicesAsync !== 'function') return Promise.resolve(null);
  voicesP = Speech.getAvailableVoicesAsync()
    .then((list) => {
      const tags = new Set((Array.isArray(list) ? list : []).map((v) => tagKey(v?.language)).filter(Boolean));
      // Веб віддає голоси не одразу: порожній список — ще не знаємо
      voiceTags = tags.size ? tags : null;
      if (!voiceTags) voicesP = null;
      return voiceTags;
    })
    .catch(() => {
      voicesP = null;
      return null;
    });
  return voicesP;
}

// Для тестів: забути, які голоси є
export function resetVoices() {
  voiceTags = null;
  voicesP = null;
}

// Голос для мови й варіанта. Голосу варіанта на телефоні немає — інший тег
// того ж варіанта (es-US для Латинської Америки), далі базовий голос мови
// (es-ES). Поки список голосів невідомий — голос варіанта як є.
export function ttsFor(code, variant = variantOf(code)) {
  const base = langOf(code).tts;
  const v = variantInfo(code, variant);
  if (!v) return base;
  if (!voiceTags) return v.tts;
  return [v.tts, ...(v.alt || []), base].find((tag) => voiceTags.has(tagKey(tag))) || v.tts;
}

export function speak(text, lang = 'en', variant = variantOf(lang)) {
  Speech.stop().catch(() => {});
  Speech.speak(text, { language: ttsFor(lang, variant), rate: 0.92 });
  if (!voiceTags) loadVoices();
}

// Прапорець мови: варіанта, який людина обрала (чи за замовчуванням), або
// мови, якщо варіантів у неї немає.
export function flagFor(code, variant = variantOf(code)) {
  return variantInfo(code, variant)?.flag || langOf(code).flag;
}

// Ендонім мови («English»). З явним варіантом — ендонім варіанта
// («English (UK)»): для списків вибору й рядка мови в Параметрах.
export function nameFor(code, variant = null) {
  return variantInfo(code, variant)?.name || langOf(code).name;
}
