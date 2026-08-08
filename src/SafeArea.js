// Безпечна зона.
//
// `react-native-safe-area-context` дає точні відступи під вирізи й смужку
// home indicator, але це окремий пакет. Якщо його ще не встановлено —
// не валимо застосунок, а падаємо на ручні відступи для iPhone без кнопки.
// Той самий підхід, що з expo-blur / notifications / secure-store: нова
// залежність ніколи не має ламати запуск.
import { Platform, View } from 'react-native';

let lib = null;
try {
  lib = require('react-native-safe-area-context');
  if (!lib?.SafeAreaView || !lib?.SafeAreaProvider) lib = null;
} catch (_) {}

export const SAFE_AREA_NATIVE = !!lib;

// Резервні відступи: типові значення для айфонів із вирізом.
// Точності бракує, але контент гарантовано не залізе під чубчик.
const FALLBACK = Platform.OS === 'ios' ? { top: 47, bottom: 34 } : { top: 24, bottom: 0 };

export const SafeAreaProvider = lib
  ? lib.SafeAreaProvider
  : ({ children }) => children;

export const SafeAreaView = lib
  ? lib.SafeAreaView
  : ({ style, children, ...rest }) => (
      <View style={[{ paddingTop: FALLBACK.top, paddingBottom: FALLBACK.bottom }, style]} {...rest}>
        {children}
      </View>
    );

export const useSafeAreaInsets = lib
  ? lib.useSafeAreaInsets
  : () => ({ top: FALLBACK.top, bottom: FALLBACK.bottom, left: 0, right: 0 });
