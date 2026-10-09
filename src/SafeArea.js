// Safe area.
//
// `react-native-safe-area-context` gives exact insets for notches and the home indicator
// strip, but it is a separate package. If it is not installed yet,
// we do not crash the app but fall back to manual insets for iPhones without a home button.
// The same approach as with expo-blur / notifications / secure-store: a new
// dependency must never break the launch.
import { Platform, View } from 'react-native';

let lib = null;
try {
  lib = require('react-native-safe-area-context');
  if (!lib?.SafeAreaView || !lib?.SafeAreaProvider) lib = null;
} catch (_) {}

export const SAFE_AREA_NATIVE = !!lib;

// Fallback insets: typical values for iPhones with a notch.
// Not precise, but the content is guaranteed not to creep under the notch.
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
