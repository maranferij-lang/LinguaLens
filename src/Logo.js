// Лого LinguaLens — «лінза, що говорить»:
// спіч-бабл, всередині якого об'єктив камери зі спалахом-крапкою.
// LogoMark — одноколірний знак для наліпок і карток; AppIcon — справжня
// іконка застосунку (футер Параметрів, вітання онбордингу).
import Svg, { Circle, Path } from 'react-native-svg';
import { Image, Text, View } from 'react-native';
import { F, useTheme } from './theme';

// Іконка застосунку — той самий PNG, що на головному екрані (assets/icon.png,
// зменшений до 192 px скриптом tools/export-app-icon.mjs), у формі iOS:
// радіус 22,37 % сторони й «неперервна» крива кута, як у системних іконок.
// Однакова в обох темах — як на головному екрані. Тінь — у кольорі іконки.
export const APP_ICON_RADIUS = 0.2237;

export function AppIcon({ size = 64, style }) {
  return (
    <View
      testID="app-icon"
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * APP_ICON_RADIUS,
          borderCurve: 'continuous',
          shadowColor: '#535AE6',
          shadowOpacity: 0.28,
          shadowRadius: size / 8,
          shadowOffset: { width: 0, height: size * 0.09 },
        },
        style,
      ]}
      // назву поруч прочитає VoiceOver, сама картинка нічого не додає
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Image
        source={require('../assets/app-icon-192.png')}
        style={{ width: size, height: size, borderRadius: size * APP_ICON_RADIUS, borderCurve: 'continuous' }}
      />
    </View>
  );
}

// Знак. color = колір бабла, fg = колір лінзи всередині
export function LogoMark({ size = 40, color, fg = '#FFFFFF' }) {
  const { C } = useTheme();
  const c = color || C.accent;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {/* бабл із хвостиком (одна фігура) */}
      <Path
        d="M24 4C35.5 4 44 11.6 44 22.4C44 33.2 35.5 40.8 24 40.8C21.9 40.8 19.9 40.6 18.1 40.1L9.5 44.6C8.4 45.2 7.1 44.2 7.4 43L8.9 36.5C5.8 33.1 4 28.1 4 22.4C4 11.6 12.5 4 24 4Z"
        fill={c}
      />
      {/* об'єктив */}
      <Circle cx="24" cy="22.4" r="8.6" stroke={fg} strokeWidth="3.2" fill="none" />
      {/* спалах-крапка (фірмовий елемент) */}
      <Circle cx="30" cy="16.6" r="2.3" fill={fg} />
    </Svg>
  );
}

// Знак + назва (для онбордингу, футера налаштувань)
export function LogoRow({ size = 30, style }) {
  const { C } = useTheme();
  return (
    <View style={[{ flexDirection: 'row', alignItems: 'center', gap: 9 }, style]}>
      <LogoMark size={size} />
      <Text style={{ color: C.text, fontSize: size * 0.62, fontFamily: F.extra }}>
        LinguaLens
      </Text>
    </View>
  );
}
