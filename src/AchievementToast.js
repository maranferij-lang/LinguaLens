// Спливаюче вітання, коли розблоковано нове досягнення.
//
// Правила руху:
//   • просторова послідовність — приходить згори і йде туди ж, звідки прийшов;
//   • без перельоту: елемент з'явився сам, його ніхто не кидав;
//   • вихід швидший за вхід (170 мс проти пружини на ~350);
//   • не з'являється зі scale(0) — у реальному світі ніщо не виникає з нічого;
//   • «Менше руху»: ні зсуву, ні масштабу — лише поява за непрозорістю.
//
// VoiceOver: iOS не озвучує liveRegion, тож розблокування оголошуємо самі, а
// час на прочитання подовжуємо (WCAG 2.2.1): тост без жесту не зникає за 3,6 с.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { DUR, EASE, SPRING, announce, travel, useReducedMotionCached, useScreenReader } from './motion';
import { Mascot } from './Mascot';
import { AchIcon } from './AchIcons';
import { CAPS, F, R, type, useTheme } from './theme';

const OFF = 150; // на скільки тост ховається за верхній край
export const SHOW_MS = 3600; // скільки тост видно
export const SHOW_MS_READER = 9000; // з VoiceOver: щоб устигнути знайти й прочитати

export default function AchievementToast({ achievement, onHide, onPress, t }) {
  const { C, SHADOW_LG } = useTheme();
  const a = useRef(new Animated.Value(0)).current; // 0 — сховано, 1 — на місці
  const timer = useRef(null);
  const leaving = useRef(false);
  const reduced = useReducedMotionCached();
  const reader = useScreenReader();

  useEffect(() => {
    if (!achievement) return;
    leaving.current = false;
    a.setValue(0);
    Animated.spring(a, { toValue: 1, ...SPRING.ui }).start();
    // «Відкрито. Перше слово»: без цього незрячий не дізнається про нагороду
    announce(`${t('unlocked')}. ${t('ach_' + achievement.id)}`);
    return () => a.stopAnimation();
  }, [achievement]);

  // Таймер окремо від появи: VoiceOver відповідає не одразу, і подовження
  // не має повторювати пружину
  useEffect(() => {
    if (!achievement) return;
    timer.current = setTimeout(hide, reader ? SHOW_MS_READER : SHOW_MS);
    return () => clearTimeout(timer.current);
  }, [achievement, reader]);

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

  if (!achievement) return null;

  const shift = travel(OFF);
  const transform = [
    { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [-shift, 0] }) },
    // масштаб стартує з 0.96, а не з нуля; «менше руху» — без масштабу
    ...(reduced ? [] : [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) }]),
  ];
  const label = `${t('unlocked')}, ${t('ach_' + achievement.id)}`;

  return (
    <Animated.View style={[styles.wrap, { opacity: a, transform }]} pointerEvents="box-none">
      {/* Тап по тосту — поділитись досягненням: саме тепер його найприємніше показати. */}
      <Pressable
        onPress={() => {
          if (onPress) onPress(achievement);
          hide();
        }}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={t('achShareHint')}
        // тап — поділитись; закрити без цього VoiceOver може дією «Закрити»
        accessibilityActions={[{ name: 'dismiss', label: t('close') }]}
        onAccessibilityAction={(e) => e.nativeEvent.actionName === 'dismiss' && hide()}
      >
        <View style={[styles.card, { backgroundColor: C.card }, SHADOW_LG]}>
          <View style={[styles.iconWrap, { backgroundColor: C.accentSoft }]}>
            <AchIcon id={achievement.id} size={30} color={C.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[CAPS, { color: C.accent }]}>{t('unlocked')}</Text>
            <Text style={[styles.title, { color: C.text }]} numberOfLines={2}>
              {t('ach_' + achievement.id)}
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
  icon: { fontSize: 24 },
  title: { ...type(16, F.bold, { noLead: true }), marginTop: 3 },
});
