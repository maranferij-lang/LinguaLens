// Скло хрому камери (core.md A1–A2): один рецепт на всі плаваючі елементи
// над живим відео — мова, статус, ліхтарик, підказка, перемикач режимів,
// зум, наліпка останнього слова й помилка. Раніше їх було чотири різні.
//
// Хром камери завжди темний — у світлій і темній темі, у будь-якій палітрі
// однаковий: над живим відео світлі панелі губляться, тож камера — «темна
// кімната» застосунку з токенами темної палітри. Кольори тут фіксовані
// (план §5.14 дозволяє це саме для src/scanner/*).
//
// Розмиття — BlurView (intensity 30, tint dark) поверх напівпрозорого тла;
// без нього (прапорець CAM_BLUR, веб) — трохи щільніше пласке тло. Білий
// текст на ньому над білою стіною — 4,7:1. На вебі expo-blur підміняє наше
// тло своїм (rgba(25,25,25,.23)) — над світлою сценою це заблідо, тож там
// завжди пласке скло. Android без BlurTargetView дає напівпрозоре тло —
// прийнятно (документація expo-blur v57).
import { Platform, View } from 'react-native';
import { CAM_BLUR } from '../flags';

// expo-blur є в Expo Go і в збірці; не знайшовся — тихо пласке скло (як
// src/Chrome.js).
let BlurView = null;
try {
  BlurView = require('expo-blur').BlurView;
} catch (_) {}

export const CAM = {
  // текст і гліфи над камерою — «текст» темної палітри
  text: '#F5F2EC',
  dim: 'rgba(245,242,236,0.72)',
  // акцент темної палітри й текст на ньому: чип Pro, кути під час скану
  accent: '#9B8FFF',
  onAccent: '#100C2E',
  // кремова поверхня (активний режим, ліхтарик, що світить) і текст на ній
  cream: '#F5F2EC',
  ink: '#1C1B19',
  // фірмовий фіолетовий застосунку — корона на кремовому затворі
  violet: '#5B4FD6',
  // лінза іконки застосунку: синьо-фіолетовий градієнт затвора
  lens: ['#5380FF', '#5F58E2'],
  // кути видошукача й кільце затвора
  ring: 'rgba(255,255,255,0.96)',
  // бурштин темної палітри — значок помилки
  warn: '#F0B84A',
  glass: 'rgba(21,20,18,0.55)',
  flat: 'rgba(21,20,18,0.62)',
  // «прожектор» довкола кадру
  dim24: 'rgba(10,9,8,0.24)',
  // тло під камерою, заморожений кадр сцени й відблиск, що ним проходить,
  // затемнення під аркушем результату
  black: '#000000',
  frozenDim: 'rgba(0,0,0,0.28)',
  glint: '#FFFFFF',
  scrim: 'rgba(0,0,0,0.4)',
};

// Великий системний шрифт не має розпирати хром камери: підписи ростуть
// лише до 1,3 (core.md A.2).
export const CAM_FONT = 1.3;

export function CamGlass({ children, style, radius = 999, blur = CAM_BLUR, ...rest }) {
  const shape = { borderRadius: radius, overflow: 'hidden' };
  if (blur && BlurView && Platform.OS !== 'web') {
    return (
      <BlurView intensity={30} tint="dark" style={[shape, { backgroundColor: CAM.glass }, style]} {...rest}>
        {children}
      </BlurView>
    );
  }
  return (
    <View style={[shape, { backgroundColor: CAM.flat }, style]} {...rest}>
      {children}
    </View>
  );
}

export default CamGlass;
