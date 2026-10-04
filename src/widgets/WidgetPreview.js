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
import { useReducedMotion } from '../motion';
import { F, R, useTheme } from '../theme';
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

function Reveal({ label, onPress, pal, s, testID }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => [s.reveal, { backgroundColor: pal.accentSoft }, pressed && { opacity: 0.7 }]}
      testID={testID}
    >
      <IcEye size={13} color={pal.accent} />
      <Text {...FIXED} style={[s.revealText, { color: pal.accent }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

// Переклад з'являється м'яким проявом (без руху — одразу).
function Appear({ children, style }) {
  const reduce = useReducedMotion();
  const v = useRef(new Animated.Value(reduce ? 1 : 0)).current;
  useEffect(() => {
    if (reduce) return;
    Animated.timing(v, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, []);
  return <Animated.View style={[style, { opacity: v }]}>{children}</Animated.View>;
}

export function WidgetPreview({ wod = null, sample = null, streakN = 1, t, lang, targetLang, onReveal, style }) {
  const theme = useTheme();
  const { isDark, SHADOW } = theme;
  const pal = useMemo(() => {
    const p = widgetPalette(theme.key);
    return isDark ? p.d : p.l;
  }, [theme.key, isDark]);
  const s = useMemo(() => makeStyles(pal), [pal]);
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

  function reveal(which) {
    Haptics.selectionAsync();
    if (which === 'wod') setWodOpen(true);
    else setWordsOpen(true);
    onReveal?.(which);
  }

  return (
    <View testID="widget-preview" style={[s.wall, style]} accessibilityLabel={t('widgetPreviewA11y')}>
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
        <Text {...FIXED} style={s.caps} numberOfLines={1}>
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
              <Reveal label={t('widgetRevealLong')} onPress={() => reveal('wod')} pal={pal} s={s} testID="preview-reveal" />
            )}
          </>
        ) : null}
      </View>

      <View style={s.smallRow}>
        {/* Мала «Серія» */}
        <View style={[s.widget, s.small, SHADOW]} testID="preview-streak" accessible accessibilityLabel={`${n} ${t('streakUnit', { n })}`}>
          <View style={s.streakTop}>
            <Text {...FIXED} style={s.streakN}>
              {n}
            </Text>
            <Flame n={n} size={30} breathe={false} />
          </View>
          <Text {...FIXED} style={s.unit} numberOfLines={1}>
            {t('streakUnit', { n })}
          </Text>
          <View style={{ flex: 1 }} />
          <Text {...FIXED} style={s.phrase} numberOfLines={3}>
            {streak.line}
          </Text>
        </View>

        {/* Малі «Мої слова» */}
        <View style={[s.widget, s.small, SHADOW]} testID="preview-words">
          <View style={s.wordsTop}>
            <Text {...FIXED} style={[s.caps, { flex: 1 }]} numberOfLines={1}>
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
                <Reveal label={t('widgetReveal')} onPress={() => reveal('words')} pal={pal} s={s} testID="preview-reveal-words" />
              )}
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (pal) =>
  StyleSheet.create({
    wall: { width: '100%', aspectRatio: 1, borderRadius: R.xl + 4, overflow: 'hidden', padding: '5%', gap: 14, justifyContent: 'center' },
    widget: { backgroundColor: pal.bg, borderRadius: 22, padding: 14 },
    medium: { flex: 47, minHeight: 0 },
    smallRow: { flex: 50, flexDirection: 'row', gap: 14 },
    small: { flex: 1 },
    caps: { color: pal.accent, fontFamily: F.extra, fontSize: 10.5, letterSpacing: 0.9, textTransform: 'uppercase' },
    wordRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
    wordBig: { flexShrink: 1, color: pal.ink, fontFamily: F.extra, fontSize: 30, letterSpacing: -0.6 },
    wordSmall: { color: pal.ink, fontFamily: F.extra, fontSize: 23, letterSpacing: -0.3 },
    ipa: { color: pal.dim, fontFamily: F.reg, fontSize: 12 },
    translation: { color: pal.soft, fontFamily: F.bold, fontSize: 16, marginTop: 2 },
    translationSmall: { color: pal.soft, fontFamily: F.bold, fontSize: 14, marginTop: 6 },
    example: { color: pal.dim, fontFamily: F.reg, fontSize: 12, marginTop: 4 },
    exampleBold: { color: pal.ink, fontFamily: F.extra },
    reveal: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderRadius: R.pill,
      paddingHorizontal: 10,
      paddingVertical: 5,
      marginTop: 6,
    },
    revealText: { fontFamily: F.extra, fontSize: 12.5 },
    streakTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    streakN: { color: pal.ink, fontFamily: F.extra, fontSize: 40, lineHeight: 44, letterSpacing: -1 },
    unit: { color: pal.ink, fontFamily: F.bold, fontSize: 13 },
    phrase: { color: pal.dim, fontFamily: F.semi, fontSize: 11.5, lineHeight: 15 },
    wordsTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
    tile: { width: 34, height: 34, borderRadius: 9, backgroundColor: pal.accentSoft, alignItems: 'center', justifyContent: 'center' },
    tileLetter: { color: pal.accent, fontFamily: F.extra, fontSize: 17 },
  });

export default WidgetPreview;
