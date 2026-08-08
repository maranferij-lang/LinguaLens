// Лого LinguaLens — «лінза, що говорить»:
// спіч-бабл, всередині якого об'єктив камери зі спалахом-крапкою.
import Svg, { Circle, Path } from 'react-native-svg';
import { Text, View } from 'react-native';
import { F, useTheme } from './theme';

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
