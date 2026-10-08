// Спливаюче підтвердження покупки Pro: «Тепер ти з Pro».
//
// Людина щойно заплатила (чи почала пробний період), а екран, на який вона
// дивилась, просто зник. Системний аркуш StoreKit уже закрився, тож без цього
// вона лишається віч-на-віч з вкладкою, яка нічого не каже. Найдешевший момент
// довіри в усій воронці.
//
// Рух і час — ті самі, що в тосту досягнення (AchievementToast): приходить
// згори, без перельоту, зі scale 0.96 (не з нуля), іде швидше, ніж прийшов
// (DUR.exit), під «Менше руху» лише проявляється. Окремого хаптика немає: про
// успіх покупки App уже сказав його сам (proActivated).
//
// Текст чесний: «нагадаємо за 2 дні» лише тоді, коли нагадування справді
// заплановане (дозвіл дали, пробний довший за два дні). Інакше — просто «пробний
// період почався».
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { DUR, EASE, SPRING, announce, travel, useReducedMotionCached, useScreenReader } from './motion';
import { SHOW_MS, SHOW_MS_READER } from './AchievementToast';
import { Mascot } from './Mascot';
import { IcSparkle } from './icons';
import { CAPS, F, R, type, useTheme } from './theme';

const OFF = 150; // на скільки тост ховається за верхній край

// toast: { trial, reminded } або null (нічого не показуємо).
export default function ProToast({ toast, onHide, t }) {
  const { C, SHADOW_LG } = useTheme();
  const a = useRef(new Animated.Value(0)).current; // 0 — сховано, 1 — на місці
  const timer = useRef(null);
  const leaving = useRef(false);
  const reduced = useReducedMotionCached();
  const reader = useScreenReader();

  const text = !toast
    ? ''
    : toast.trial
      ? toast.reminded
        ? t('proToastTrialRemind')
        : t('proToastTrial')
      : t('proToastText');

  useEffect(() => {
    if (!toast) return;
    leaving.current = false;
    a.setValue(0);
    Animated.spring(a, { toValue: 1, ...SPRING.ui }).start();
    // незрячий теж має почути, що купівля вдалась
    announce(`${t('proToastTitle')}. ${text}`);
    return () => a.stopAnimation();
  }, [toast]);

  // Таймер окремо від появи: VoiceOver відповідає не одразу (WCAG 2.2.1)
  useEffect(() => {
    if (!toast) return;
    timer.current = setTimeout(hide, reader ? SHOW_MS_READER : SHOW_MS);
    return () => clearTimeout(timer.current);
  }, [toast, reader]);

  function hide() {
    if (leaving.current) return;
    leaving.current = true;
    clearTimeout(timer.current);
    Animated.timing(a, {
      toValue: 0,
      duration: DUR.exit,
      easing: EASE.out,
      useNativeDriver: true,
    }).start(({ finished }) => finished && onHide());
  }

  if (!toast) return null;

  const shift = travel(OFF);
  const transform = [
    { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-shift, 0] }) },
    // масштаб стартує з 0.96, а не з нуля; «менше руху» — без масштабу
    ...(reduced ? [] : [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]),
  ];

  return (
    <Animated.View style={[styles.wrap, { opacity: a, transform }]} pointerEvents="box-none">
      {/* Тап закриває; те саме VoiceOver робить дією «Закрити» */}
      <Pressable
        onPress={hide}
        accessibilityRole="button"
        accessibilityLabel={`${t('proToastTitle')}. ${text}`}
        accessibilityActions={[{ name: 'dismiss', label: t('close') }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'dismiss' && hide()}
        testID="pro-toast"
      >
        <View style={[styles.card, { backgroundColor: C.card }, SHADOW_LG]}>
          <View style={[styles.iconWrap, { backgroundColor: C.accentSoft }]}>
            <IcSparkle size={26} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[CAPS, { color: C.accent }]}>{t('proToastTitle')}</Text>
            <Text style={[styles.text, { color: C.text }]} numberOfLines={3}>
              {text}
            </Text>
          </View>
          <Mascot pose="celebrate" size={48} />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', top: 8, left: 14, right: 14, zIndex: 100 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: R.xl,
    padding: 12,
  },
  iconWrap: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { ...type(15, F.bold, { noLead: true }), marginTop: 3 },
});
