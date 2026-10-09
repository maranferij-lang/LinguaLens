// A pop-up greeting when a new achievement is unlocked.
//
// Motion rules:
//   • spatial consistency: it comes from the top and goes back to where it came from;
//   • no overshoot: the element appeared by itself, nobody threw it;
//   • the exit is faster than the entrance (170 ms versus a spring of ~350);
//   • it does not appear from scale(0): in the real world nothing arises from nothing.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { DUR, EASE, SPRING, travel } from './motion';
import { Mascot } from './Mascot';
import { AchIcon } from './AchIcons';
import { CAPS, F, R, type, useTheme } from './theme';

const OFF = 150; // how far the toast hides above the top edge

export default function AchievementToast({ achievement, onHide, t }) {
  const { C, SHADOW_LG } = useTheme();
  const a = useRef(new Animated.Value(0)).current; // 0 = hidden, 1 = in place
  const timer = useRef(null);
  const leaving = useRef(false);

  useEffect(() => {
    if (!achievement) return;
    leaving.current = false;
    a.setValue(0);
    Animated.spring(a, { toValue: 1, ...SPRING.ui }).start();
    timer.current = setTimeout(hide, 3600);
    return () => clearTimeout(timer.current);
  }, [achievement]);

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
    // the scale starts from 0.96, not from zero
    { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }) },
  ];

  return (
    <Animated.View style={[styles.wrap, { opacity: a, transform }]} pointerEvents="box-none">
      <Pressable onPress={hide} accessibilityRole="button">
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
