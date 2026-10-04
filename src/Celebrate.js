// Свято першого слова (onboarding.md §5.11, макет onboarding-act3-uk.png 6):
// наліпка, яку людина щойно зробила сама, табличка «слово — переклад»,
// конфеті, «Перше слово — твоє!» і пігулка «Серія почалась: 1 день» з
// вогником першого дня. Серія справжня: збережене слово вже зробило день
// активним.
//
// Хаптики тут немає: Success уже прозвучав на «Зберегти» в сканері. Кнопку
// «Далі» показує OnboardingScreen через CELEBRATE_NEXT_MS — щоб мить свята
// не проскочили тим самим дотиком. «Менше руху» — без конфеті й «шльопу»
// наліпки. VoiceOver одразу чує заголовок, слово з перекладом і серію.
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { StickerLarge } from './Sticker';
import WordPlate from './WordPlate';
import Flame from './streak/Flame';
import { Mascot } from './Mascot';
import { photoUri } from './photos';
import { speak } from './speech';
import { IcSpeaker } from './icons';
import { EASE, useReducedMotion, useScreenReader } from './motion';
import { F, R, type, useTheme } from './theme';

export const CELEBRATE_NEXT_MS = 900;
export const CONFETTI = 12;
const FALL_MS = 900;

// Детерміновані «випадкові» шматочки: x (частка ширини), затримка, кут,
// форма — однакові на кожному запуску, без Math.random у рендері.
const PIECES = Array.from({ length: CONFETTI }, (_, i) => ({
  x: ((i * 37) % 100) / 100,
  y0: -20 - ((i * 23) % 50),
  fall: 150 + ((i * 41) % 110),
  delay: (i * 53) % 220,
  spin: (i % 2 ? 1 : -1) * (120 + ((i * 29) % 200)),
  round: i % 3 === 0,
  tone: i % 3,
}));

function Confetti({ C }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: FALL_MS + 220, easing: EASE.out, useNativeDriver: true }).start();
  }, []);
  const tones = [C.accent, C.warm, C.green];
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="confetti" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {PIECES.map((p, i) => {
        const start = p.delay / (FALL_MS + 220);
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              left: `${6 + p.x * 88}%`,
              top: 40,
              width: p.round ? 8 : 6,
              height: p.round ? 8 : 12,
              borderRadius: p.round ? 4 : 2,
              backgroundColor: tones[p.tone],
              opacity: v.interpolate({ inputRange: [0, start, start + 0.05, 0.8, 1], outputRange: [0, 0, 1, 1, 0] }),
              transform: [
                { translateY: v.interpolate({ inputRange: [0, start, 1], outputRange: [p.y0, p.y0, p.y0 + p.fall] }) },
                { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
              ],
            }}
          />
        );
      })}
    </View>
  );
}

// word — щойно збережене слово { word, translation, ipa, lang, photo, shape,
// outline, box }
export default function Celebrate({ word, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();
  const reader = useScreenReader();
  const titleRef = useRef(null);
  // Високі екрани (Pro Max): свято ближче до середини, а не під самим
  // прогресом із порожньою половиною екрана під ним. SE — як було.
  const lift = Math.min(110, Math.max(0, (useWindowDimensions().height - 700) * 0.36));
  const uri = photoUri(word?.photo);
  const pair = word?.translation ? `${word.word} — ${word.translation}` : word?.word || '';
  const label = [t('obCelebrateTitle'), pair, t('obCelebrateStreak')].filter(Boolean).join('. ');

  useEffect(() => {
    if (!reader || !titleRef.current) return;
    try {
      AccessibilityInfo.sendAccessibilityEvent?.(titleRef.current, 'focus');
    } catch (_) {}
  }, [reader]);

  return (
    <View style={[s.root, lift ? { paddingTop: 8 + lift } : null]} testID="celebrate">
      {reduced ? null : <Confetti C={C} />}
      <View style={s.art} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {uri ? (
          <StickerLarge uri={uri} shape={word.shape} outline={word.outline} box={word.box} size={170} pop={!reduced} style={s.sticker} />
        ) : null}
        <Pressable
          onPress={() => word?.word && speak(word.word, word.lang)}
          style={({ pressed }) => [s.plate, !uri && { marginTop: 24 }, pressed && { opacity: 0.85 }]}
          accessible={false}
          testID="celebrate-plate"
        >
          <WordPlate word={word} size="md" ipa tilt={-3} />
          <View style={[s.speaker, SHADOW_SM]}>
            <IcSpeaker size={15} color={C.onAccent} />
          </View>
        </Pressable>
      </View>

      <Text ref={titleRef} style={s.title} accessibilityRole="header" accessibilityLabel={label}>
        {t('obCelebrateTitle')}
      </Text>
      <View style={s.pill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Flame n={1} size={16} breathe={false} />
        <Text style={s.pillText}>{t('obCelebrateStreak')}</Text>
      </View>
      <Mascot pose="celebrate" size={92} style={s.lingo} />
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { alignItems: 'center', paddingTop: 8, minHeight: 420 },
    art: { alignItems: 'center' },
    sticker: { transform: [{ rotate: '-5deg' }] },
    plate: { marginTop: -26, alignItems: 'center' },
    speaker: {
      position: 'absolute',
      right: -10,
      top: -8,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: C.text, ...type(28, F.extra), textAlign: 'center', marginTop: 22 },
    pill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.warmSoft,
      borderRadius: R.pill,
      paddingLeft: 12,
      paddingRight: 16,
      paddingVertical: 7,
      marginTop: 12,
    },
    pillText: { color: C.text, ...type(14, F.extra, { noLead: true }) },
    lingo: { alignSelf: 'flex-end', marginTop: 10, marginRight: 6 },
  });
