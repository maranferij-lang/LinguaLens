// Прохання оцінити застосунок — лише після моменту, коли він уже приніс
// користь (десяте слово, ідеальний квіз), і не частіше, ніж раз на 4 місяці.
// Apple і так показує системне вікно не більше трьох разів на рік, але
// спам у ці три спроби — найшвидший шлях до одиничок.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as StoreReview from 'expo-store-review';

const KEY = 'll_review_asked_v1';
const GAP = 120 * 24 * 3600 * 1000;

export async function maybeAskForReview() {
  try {
    // isAvailableAsync, а не hasAction: той повертає true і тоді, коли є
    // лише посилання на App Store, — людину викинуло б із застосунку.
    if (!(await StoreReview.isAvailableAsync())) return false;
    const last = Number((await AsyncStorage.getItem(KEY)) || 0);
    if (Date.now() - last < GAP) return false;
    await StoreReview.requestReview();
    await AsyncStorage.setItem(KEY, String(Date.now()));
    return true;
  } catch (_) {
    return false;
  }
}
