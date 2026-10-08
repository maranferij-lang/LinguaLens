// Живий попередній перегляд віджетів для кроку онбордингу «Віджети»
// (widgets.md §12, макет widgets-onboarding-step.png): «шпалери» головного
// екрана, на них — середнє «Слово дня» і малі «Серія» та «Мої слова».
// «Показати переклад» працює просто тут: людина вчиться жесту до того, як
// побачить віджет удома.
//
// Це RN-репліка, а не справжній SwiftUI: @expo/ui поза WidgetKit не має
// widgetURL і containerBackground, а онбординг мусить працювати й в Expo Go.
// Зате тексти й кольори — ті самі: кепс, транскрипція, фраза серії й палітра
// віджета (widgetPalette для поточної теми).
//
// <WidgetPreview
//   wod={todayWord | null}                 — слово дня людини (todayFrom(wod))
//   sample={{ word, ipa, translation }}    — приклад для «Моїх слів» (DEMO_WORDS)
//   streakN={1}                            — число для малої «Серії»
//   t={t} lang={lang}                      — мова інтерфейсу
//   targetLang="en"                        — (необов'язково) мова слова: кепс
//                                            «English · Подорожі» і лапки прикладу
//   onReveal={() => {}}                    — людина торкнулась «Показати переклад»
// />
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import Flame from '../streak/Flame';
import { IcEye } from '../icons';
import { headLetter } from '../WordSheet';
import { nameFor } from '../speech';
import { topicName } from '../profile';
import { ipaLabel } from '../share/layout';
import { DUR, EASE, useReducedMotion } from '../motion';
import { F, R, ipaFont, useTheme } from '../theme';
import { exampleMarkdown } from './format';
import { mix, widgetPalette } from './palette';
import { streakLines } from './streakTimeline';

// Розмітка для ілюстрації фіксована, як у справжнього віджета: системний
// розмір тексту її не роздуває (сам крок онбордингу масштабується).
const FIXED = { allowFontScaling: false };

// «**слово**» з markdown віджета → шматки тексту: парні звичайні, непарні жирні.
function boldParts(md) {
  const plain = (x) => x.replace(/\\([\\`*_[\]~#<>|])/g, '$1');
  return String(md || '')
    .split('**')
    .map((x, i) => ({ text: plain(x), bold: i % 2 === 1 }));
}

function Reveal({ label, onPress, pal, s, k = 1, testID }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [s.reveal, { backgroundColor: pal.accentSoft }, pressed && { opacity: 0.7 }]}
      testID={testID}
    >
      <IcEye size={Math.round(13 * k)} color={pal.accent} />
      <Text {...FIXED} style={[s.revealText, { color: pal.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Переклад з'являється м'яким проявом знизу на кілька пунктів, як у справжнього
// віджета (без руху — одразу). Пресети motion.js: DUR.panel й EASE.out.
function Appear({ children, style }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    Animated.timing(v, { toValue: 1, duration: DUR.panel, easing: EASE.out, useNativeDriver: true }).start();
    return () => v.stopAnimation();
  }, []);
  const rise = reduce ? [] : [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [4, 0] }) }];
  return <Animated.View style={[style, { opacity: v, transform: rise }]}>{children}</Animated.View>;
}

export function WidgetPreview({ wod = null, sample = null, streakN = 1, t, lang, targetLang, onReveal, style }) {
  const theme = useTheme();
  const { isDark, SHADOW } = theme;
  const pal = useMemo(() => {
    const p = widgetPalette(theme.key);
    return isDark ? p.d : p.l;
  }, [theme.key, isDark]);
  // Мініатюра масштабується як ціле: шрифти й відступи — від ширини
  // «шпалер» (макет — 335 pt, ширина кроку онбордингу на iPhone SE), тож
  // у вужчому чи ширшому місці віджети не тіснять і не розпливаються.
  const [width, setWidth] = useState(0);
  const k = width ? Math.min(Math.max(width / 335, 0.8), 1.3) : 1;
  const s = useMemo(() => makeStyles(pal, k), [pal, k]);
  // «Шпалери»: від бузкового до рожевого — з акценту теми, а не з картинки.
  const C = theme.C;
  const wallTop = mix(C.accent, C.bg, isDark ? 0.15 : 0.32);
  const wallBottom = mix(mix(C.red, C.accent, 0.3), C.bg, isDark ? 0.3 : 0.5);

  const [wodOpen, setWodOpen] = useState(false);
  const [wordsOpen, setWordsOpen] = useState(false);

  const word = wod && wod.word ? wod : sample;
  const mine = sample && sample.word ? sample : word;
  const topic = word ? topicName(t, word.topic) : '';
  const langName = targetLang ? nameFor(targetLang) : '';
  const caption = langName ? (topic ? `${langName} · ${topic}` : t('widgetCaption', { lang: langName })) : t('widgetTitle');
  const example = word?.example ? exampleMarkdown(word.example, word.word, targetLang || lang) : '';

  const n = Math.max(0, Math.floor(Number(streakN) || 0));
  const streak = streakLines(t, { n, state: n ? 'done' : 'none' });
  const unit = n ? t('streakUnit', { n }) : t('widgetDays', { n });

  function reveal(which) {
    Haptics.selectionAsync();
    if (which === 'wod') setWodOpen(true);
    else setWordsOpen(true);
    onReveal?.(which);
  }

  return (
    <View
      testID="widget-preview"
      style={[s.wall, style]}
      accessibilityLabel={t('widgetPreviewA11y')}
      onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}
    >
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="wall" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={wallTop} />
            <Stop offset="1" stopColor={wallBottom} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#wall)" />
      </Svg>

      {/* Середнє «Слово дня» */}
      <View style={[s.widget, s.medium, SHADOW]} testID="preview-wod">
        <Text {...FIXED} style={s.caps} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {caption}
        </Text>
        <View style={{ flex: 1 }} />
        {word ? (
          <>
            <View style={s.wordRow}>
              <Text {...FIXED} style={s.wordBig} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {word.word}
              </Text>
              {word.ipa ? (
                <Text {...FIXED} style={s.ipa} numberOfLines={1}>
                  {ipaLabel(word.ipa)}
                </Text>
              ) : null}
            </View>
            {wodOpen ? (
              <Appear>
                <Text {...FIXED} style={s.translation} numberOfLines={1}>
                  {word.translation}
                </Text>
                {example ? (
                  <Text {...FIXED} style={s.example} numberOfLines={1}>
                    {boldParts(example).map((p, i) => (
                      <Text key={i} style={p.bold ? s.exampleBold : null}>
                        {p.text}
                      </Text>
                    ))}
                  </Text>
                ) : null}
              </Appear>
            ) : (
              <Reveal label={t('widgetRevealLong')} onPress={() => reveal('wod')} pal={pal} s={s} k={k} testID="preview-reveal" />
            )}
          </>
        ) : null}
      </View>

      <View style={s.smallRow}>
        {/* Мала «Серія» */}
        <View style={[s.widget, s.small, SHADOW]} testID="preview-streak" accessible accessibilityLabel={`${n} ${unit}`}>
          <View style={s.streakTop}>
            <Text {...FIXED} style={s.streakN}>
              {n}
            </Text>
            <Flame n={n} size={Math.round(28 * k)} breathe={false} />
          </View>
          <Text {...FIXED} style={s.unit} numberOfLines={1}>
            {unit}
          </Text>
          <View style={{ flex: 1 }} />
          <Text {...FIXED} style={s.phrase} numberOfLines={3}>
            {streak.line}
          </Text>
        </View>

        {/* Малі «Мої слова» */}
        <View style={[s.widget, s.small, SHADOW]} testID="preview-words">
          <View style={s.wordsTop}>
            {/* «MEINE WÖRTER» поруч із плиткою — тісно: як і віджет
                (minimumScaleFactor 0.7), трохи зменшуємо, а не обрізаємо */}
            <Text {...FIXED} style={[s.caps, { flex: 1 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t('widgetWordsTitle')}
            </Text>
            {mine ? (
              <View style={s.tile}>
                <Text {...FIXED} style={s.tileLetter}>
                  {headLetter(mine.word, targetLang || lang)}
                </Text>
              </View>
            ) : null}
          </View>
          <View style={{ flex: 1 }} />
          {mine ? (
            <>
              <Text {...FIXED} style={s.wordSmall} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
                {mine.word}
              </Text>
              {mine.ipa ? (
                <Text {...FIXED} style={s.ipa} numberOfLines={1}>
                  {ipaLabel(mine.ipa)}
                </Text>
              ) : null}
              {wordsOpen ? (
                <Appear>
                  <Text {...FIXED} style={s.translationSmall} numberOfLines={1}>
                    {mine.translation}
                  </Text>
                </Appear>
              ) : (
                <Reveal label={t('widgetReveal')} onPress={() => reveal('words')} pal={pal} s={s} k={k} testID="preview-reveal-words" />
              )}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (pal, k = 1) => {
  const z = (v) => Math.round(v * k * 10) / 10;
  return StyleSheet.create({
    wall: { width: '100%', aspectRatio: 1, borderRadius: R.xl + 4, overflow: 'hidden', padding: '5%', gap: z(14), justifyContent: 'center' },
    widget: { backgroundColor: pal.bg, borderRadius: z(22), padding: z(14) },
    medium: { flex: 47, minHeight: 0 },
    smallRow: { flex: 50, flexDirection: 'row', gap: z(14) },
    small: { flex: 1 },
    caps: { color: pal.accent, fontFamily: F.extra, fontSize: z(10.5), letterSpacing: z(0.9), textTransform: 'uppercase' },
    wordRow: { flexDirection: 'row', alignItems: 'baseline', gap: z(8) },
    wordBig: { flexShrink: 1, color: pal.ink, fontFamily: F.extra, fontSize: z(30), letterSpacing: z(-0.6) },
    wordSmall: { color: pal.ink, fontFamily: F.extra, fontSize: z(23), letterSpacing: z(-0.3) },
    ipa: { color: pal.dim, ...ipaFont('500'), fontSize: z(12) },
    translation: { color: pal.soft, fontFamily: F.bold, fontSize: z(16), marginTop: z(2) },
    translationSmall: { color: pal.soft, fontFamily: F.bold, fontSize: z(14), marginTop: z(6) },
    example: { color: pal.dim, fontFamily: F.reg, fontSize: z(12), marginTop: z(4) },
    exampleBold: { color: pal.ink, fontFamily: F.extra },
    reveal: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: z(5),
      borderRadius: R.pill,
      paddingHorizontal: z(10),
      paddingVertical: z(5),
      marginTop: z(6),
    },
    revealText: { fontFamily: F.extra, fontSize: z(12.5) },
    streakTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    // число й підпис — щільно, як у віджета; фраза — внизу, з повітрям над нею
    streakN: { color: pal.ink, fontFamily: F.extra, fontSize: z(36), lineHeight: z(40), letterSpacing: z(-1) },
    unit: { color: pal.ink, fontFamily: F.bold, fontSize: z(12.5), lineHeight: z(16) },
    phrase: { color: pal.dim, fontFamily: F.semi, fontSize: z(11.5), lineHeight: z(14.5), marginTop: z(6) },
    wordsTop: { flexDirection: 'row', alignItems: 'flex-start', gap: z(6) },
    tile: { width: z(34), height: z(34), borderRadius: z(9), backgroundColor: pal.accentSoft, alignItems: 'center', justifyContent: 'center' },
    tileLetter: { color: pal.accent, fontFamily: F.extra, fontSize: z(17) },
  });
};

export default WidgetPreview;
