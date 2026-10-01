// Мови + озвучка нативними голосами iOS
// Кожна мова має перевірену iOS TTS-локаль. Щоб прибрати мову — видали рядок.
import * as Speech from 'expo-speech';
import { setAudioModeAsync } from 'expo-audio';

export const LANGS = [
  { code: 'en', name: 'English', flag: '🇬🇧', tts: 'en-US' },
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

// Дозволяє звуку грати навіть коли iPhone у беззвучному режимі.
export async function initAudio() {
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
  } catch (_) {}
}

export function speak(text, lang = 'en') {
  Speech.stop().catch(() => {});
  Speech.speak(text, { language: langOf(lang).tts, rate: 0.92 });
}

export function flagFor(code) {
  return langOf(code).flag;
}

export function nameFor(code) {
  return langOf(code).name;
}
