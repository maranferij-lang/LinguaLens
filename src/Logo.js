// Лого LinguaLens — «Лінго»: голова маскота-хамелеона з очима-турелями
// (концепт B, вибір власника 5.10.2026). Майстри — assets/brand/*.svg, PNG
// з них робить tools/export-brand.mjs.
// AppIcon — справжня іконка застосунку (футер Параметрів, онбординг, підказка
// про віджети); LogoMark — двоколірний знак для наліпок і карток, де повна
// іконка на 16–22 pt була б кашею.
import Svg, { Circle, Path } from 'react-native-svg';
import { Image, View } from 'react-native';
import { useTheme } from './theme';

// Іконка застосунку — той самий PNG, що на головному екрані (assets/icon.png,
// зменшений до 192 px скриптом tools/export-app-icon.mjs), у формі iOS:
// радіус 22,37 % сторони й «неперервна» крива кута, як у системних іконок.
// Однакова в обох темах — як на головному екрані. Тінь — у кольорі тла іконки.
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
          shadowColor: '#372E9F',
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

// Геометрія знака — з assets/brand/lingo-mark.svg, у координатах іконки
// (1024 × 1024); тест звіряє її з майстром. Обідок ока й зіниця трохи більші,
// ніж в іконці: на 16 pt вони інакше тоншають до пів пікселя.
export const MARK = {
  viewBox: '152 156 720 720',
  // голова з гребенем
  head: 'M512 178 C562 178 590 222 616 258 C734 276 826 362 844 492 C864 646 770 850 512 854 C254 850 160 646 180 492 C198 362 290 276 408 258 C434 222 462 178 512 178 Z',
  // очі-турелі: обідок (силует), очне яблуко (виріз), зіниця, зведена до носа
  eyes: [
    { rim: [316, 418, 146], ball: [314, 422, 106], pupil: [336, 428, 68] },
    { rim: [708, 418, 146], ball: [710, 422, 106], pupil: [688, 428, 68] },
  ],
  // усміхнений рот (виріз)
  mouth: 'M300 626 C390 662 634 662 724 626 C696 732 604 776 512 776 C420 776 328 732 300 626 Z',
};

// Знак. color — силует голови й зіниці, fg — очі й рот, «вирізані» кольором
// тла під знаком. Тому знак читається в обох полярностях: темний на світлому
// і білий на фіолетовому чи на фото.
export function LogoMark({ size = 40, color, fg = '#FFFFFF' }) {
  const { C } = useTheme();
  const c = color || C.accent;
  const circle = ([cx, cy, r], fill, key) => <Circle key={key} cx={cx} cy={cy} r={r} fill={fill} />;
  return (
    <Svg width={size} height={size} viewBox={MARK.viewBox} testID="logo-mark">
      <Path d={MARK.head} fill={c} />
      {MARK.eyes.map((e, i) => circle(e.rim, c, `rim${i}`))}
      {MARK.eyes.map((e, i) => circle(e.ball, fg, `ball${i}`))}
      <Path d={MARK.mouth} fill={fg} />
      {MARK.eyes.map((e, i) => circle(e.pupil, c, `pupil${i}`))}
    </Svg>
  );
}
