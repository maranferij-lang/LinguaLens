// Посилання, що виходять із застосунку. Лист до підтримки — єдиний шлях
// допомоги після незрозумілого списання, тож «нічого не сталося» тут гірше за
// все: на телефоні без поштового застосунку openURL відхиляється, і людина
// лишалась би з мовчазною кнопкою. Тоді копіюємо адресу й кажемо про це.
import { Alert, Linking } from 'react-native';
import * as Haptics from 'expo-haptics';
import { SUPPORT_EMAIL } from '../config';

async function copyText(text) {
  try {
    // require, а не import: збірка без модуля не має падати на старті
    await require('expo-clipboard').setStringAsync(text);
    return true;
  } catch (_) {
    return false;
  }
}

// → true, якщо поштовий застосунок відкрився; false — показали адресу.
export async function openSupportMail(t) {
  if (!SUPPORT_EMAIL) return false;
  try {
    await Linking.openURL('mailto:' + SUPPORT_EMAIL);
    return true;
  } catch (_) {
    const copied = await copyText(SUPPORT_EMAIL);
    if (copied) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Не вдалось і скопіювати — хоч покажемо адресу, щоб її можна було
    // переписати.
    Alert.alert(t('support'), copied ? t('supportCopied', { e: SUPPORT_EMAIL }) : SUPPORT_EMAIL);
    return false;
  }
}

// Звичайне посилання (умови, приватність): збій відкриття нікому не потрібен.
export function openLink(url) {
  if (url) Linking.openURL(url).catch(() => {});
}
