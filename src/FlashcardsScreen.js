// "Learning": a hub with flashcards (3D flip) + quiz
import { useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { dueWords, nextDueText } from './srs';
import { speak } from './speech';
import QuizScreen from './QuizScreen';
import { IcCards, IcChevron, IcMedal, IcSpeaker } from './icons';
import { Mascot, MascotBob } from './Mascot';
import { PCrown } from './ProIcons';
import { StickerLarge } from './Sticker';
import WordOfDayCard from './WordOfDayCard';
import { FadeIn, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';

import { F, R, useTheme } from './theme';
import { DUR, EASE } from './motion';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function FlashcardsScreen({
  words,
  onReview,
  t,
  wordOfDay,
  wodSaved,
  onSaveWod,
  targetLang,
  onQuizDone,
  onSignIn,
  onOpenPro,
  isPro,
}) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C, SHADOW), [C]);

  const [mode, setMode] = useState('hub');
  const [session, setSession] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const due = useMemo(() => dueWords(words), [words]);
  const quizReady = words.length >= 4;

  function doFlip(to) {
    setFlipped(to);
    Haptics.selectionAsync();
    Animated.timing(flipAnim, {
      toValue: to ? 1 : 0,
      duration: DUR.panel,
      easing: EASE.inOut,
      useNativeDriver: true,
    }).start();
  }

  function start(list) {
    if (!list.length) return;
    flipAnim.setValue(0);
    setFlipped(false);
    setSession({ ids: shuffle(list.map((w) => w.id)), index: 0, correct: 0 });
    setMode('cards');
  }

  const nextIdx = session
    ? session.ids.findIndex((id, i) => i >= session.index && words.some((w) => w.id === id))
    : -1;

  function answer(known) {
    if (nextIdx === -1) return;
    onReview(session.ids[nextIdx], known);
    Haptics.impactAsync(known ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    flipAnim.setValue(0);
    setFlipped(false);
    setSession({ ...session, index: nextIdx + 1, correct: session.correct + (known ? 1 : 0) });
  }

  if (mode === 'quiz') {
    return <QuizScreen words={words} t={t} onExit={() => setMode('hub')} onQuizDone={onQuizDone} />;
  }

  if (mode === 'hub') {
    return (
      <ScrollView
        style={s.hubRoot}
        contentContainerStyle={{ paddingBottom: UNDER_TAB + 14 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hubHead}>
          <Text style={s.title}>{t('learnTitle')}</Text>
          {/* Pro is always in sight but does not shout: a small pill instead of a
              popup. A popup that flies out on its own is annoying and hurts the rating. */}
          {onOpenPro && !isPro ? (
            <Press style={s.proPill} onPress={onOpenPro}>
              <PCrown size={13} color={C.accent} />
              <Text style={s.proPillText}>PRO</Text>
            </Press>
          ) : (
            <Mascot pose="wave" size={64} />
          )}
        </View>

        <WordOfDayCard
          word={wordOfDay}
          lang={targetLang}
          saved={wodSaved}
          onSave={onSaveWod}
          onSignIn={onSignIn}
          t={t}
        />

        {!words.length ? (
          <FadeIn delay={45} style={{ alignItems: 'center', paddingVertical: 30 }}>
            <MascotBob pose="think" size={140} />
            <Text style={s.bigTitle}>{t('cardsEmptyTitle')}</Text>
            <Text style={s.dimText}>{t('cardsEmptyText')}</Text>
          </FadeIn>
        ) : (
        <>
        <FadeIn delay={45}>
          <Press onPress={() => (due.length ? start(due) : start(words))}>
            <View style={[s.hubCard, SHADOW]}>
              <View style={s.hubIconWrap}>
                <IcCards size={26} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.hubCardTitle}>{t('flashcards')}</Text>
                <Text style={s.hubCardHint}>
                  {due.length
                    ? t('dueToday', { n: due.length })
                    : t('nextRep', { t: nextDueText(words, t) })}
                </Text>
              </View>
              {due.length ? (
                <View style={s.dueBadge}>
                  <Text style={s.dueBadgeText}>{due.length}</Text>
                </View>
              ) : null}
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <IcChevron color={C.faint} />
              </View>
            </View>
          </Press>
        </FadeIn>
        <FadeIn delay={90}>
          <Press onPress={() => quizReady && setMode('quiz')} disabled={!quizReady}>
            <View style={[s.hubCard, SHADOW]}>
              <View style={s.hubIconWrap}>
                <IcMedal size={26} color={C.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.hubCardTitle}>{t('quiz')}</Text>
                <Text style={s.hubCardHint}>
                  {quizReady ? t('quizHint') : t('quizNeed', { n: 4 })}
                </Text>
              </View>
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <IcChevron color={C.faint} />
              </View>
            </View>
          </Press>
        </FadeIn>
        </>
        )}
      </ScrollView>
    );
  }

  if (session && nextIdx === -1) {
    const pct = Math.round((session.correct / session.ids.length) * 100);
    return (
      <View style={s.center}>
        <FadeIn style={{ alignItems: 'center', width: '100%' }}>
          <MascotBob pose={pct >= 60 ? 'celebrate' : 'encourage'} size={160} />
          <Text style={s.bigTitle}>{t('done')}</Text>
          <Text style={s.dimText}>{t('resultOf', { c: session.correct, n: session.ids.length })}</Text>
          <GradBtn title={t('next')} onPress={() => setMode('hub')} style={{ alignSelf: 'stretch' }} />
        </FadeIn>
      </View>
    );
  }

  const current = words.find((w) => w.id === session.ids[nextIdx]);
  const progress = (session.index / session.ids.length) * 100;
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  // 0.5 is the moment when the card stands on its edge. That is exactly where we swap which side is visible.
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  return (
    <View style={s.root}>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: progress + '%' }]} />
      </View>
      <Text style={s.progress}>{session.index + 1} / {session.ids.length}</Text>

      <View style={s.cardWrap}>
        <Animated.View
          style={[
            s.card,
            SHADOW,
            { opacity: frontOpacity, transform: [{ perspective: 1200 }, { rotateY: frontRotate }] },
          ]}
          pointerEvents={flipped ? 'none' : 'auto'}
        >
          <Press style={s.cardInner} onPress={() => doFlip(true)}>
            <Text style={s.cardWord}>{current.word}</Text>
            {current.ipa ? <Text style={s.cardIpa}>{current.ipa}</Text> : null}
            <Press style={s.speakBtn} onPress={() => speak(current.word, current.lang)}>
              <IcSpeaker size={22} color={C.accent} />
            </Press>
            <Text style={s.tapHint}>{t('tapFlip')}</Text>
          </Press>
        </Animated.View>

        <Animated.View
          style={[
            s.card,
            SHADOW,
            { opacity: backOpacity, transform: [{ perspective: 1200 }, { rotateY: backRotate }] },
          ]}
          pointerEvents={flipped ? 'auto' : 'none'}
        >
          <Press style={s.cardInner} onPress={() => doFlip(false)}>
            {current.photo ? (
              <StickerLarge uri={current.photo} outline={current.outline} box={current.box} size={136} style={{ marginBottom: 16 }} />
            ) : null}
            <Text style={s.cardTranslation}>{current.translation}</Text>
            {current.example ? (
              <View style={s.exampleBox}>
                <Text style={s.example}>“{current.example}”</Text>
                <Text style={s.exampleTr}>{current.exampleTranslation}</Text>
              </View>
            ) : null}
          </Press>
        </Animated.View>
      </View>

      {flipped ? (
        <View style={s.answerRow}>
          <Press style={[s.answerBtn, { backgroundColor: C.redSoft }]} onPress={() => answer(false)}>
            <Text style={[s.answerText, { color: C.red }]}>{t('stillLearning')}</Text>
          </Press>
          <Press style={[s.answerBtn, { backgroundColor: C.greenSoft }]} onPress={() => answer(true)}>
            <Text style={[s.answerText, { color: C.green }]}>{t('know')}</Text>
          </Press>
        </View>
      ) : (
        <View style={s.answerRow}>
          <Press style={[s.answerBtn, { backgroundColor: C.card2 }]} onPress={() => doFlip(true)}>
            <Text style={s.answerText}>{t('showAnswer')}</Text>
          </Press>
        </View>
      )}
    </View>
  );
}

const makeStyles = (C, SHADOW) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20 },
    hubRoot: { flex: 1, backgroundColor: C.bg, padding: 20 },
    proPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 11,
      paddingVertical: 6,
    },
    proPillText: { color: C.accent, fontSize: 11, fontFamily: F.extra, letterSpacing: 1.2 },
    hubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 36 },
    title: { color: C.text, fontSize: 34, letterSpacing: -0.75, fontFamily: F.bold, marginBottom: 18 },
    bigTitle: { color: C.text, fontSize: 22, fontFamily: F.bold, marginTop: 14 },
    dimText: { color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 8, lineHeight: 21, marginBottom: 22 },

    hubCard: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12,
    },
    hubIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hubCardTitle: { color: C.text, fontSize: 17, letterSpacing: -0.1, fontFamily: F.semi },
    hubCardHint: { color: C.dim, fontSize: 13, marginTop: 2 },
    dueBadge: {
      backgroundColor: C.accent,
      borderRadius: R.pill,
      minWidth: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    dueBadgeText: { color: C.onAccent, fontSize: 13, fontFamily: F.bold },

    progressTrack: { height: 4, backgroundColor: C.card2, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    progressFill: { height: 4, borderRadius: 2, backgroundColor: C.accent },
    progress: { color: C.dim, fontSize: 13, textAlign: 'center', marginTop: 8 },
    cardWrap: { flex: 1, marginVertical: 16 },
    card: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: C.card,
      borderRadius: R.xl,
      backfaceVisibility: 'hidden',
    },
    cardInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    cardWord: { color: C.text, fontSize: 38, letterSpacing: -0.84, fontFamily: F.bold, textAlign: 'center' },
    cardIpa: { color: C.dim, fontSize: 17, marginTop: 10 },
    speakBtn: {
      marginTop: 20,
      backgroundColor: C.card2,
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tapHint: { color: C.faint, fontSize: 12, letterSpacing: 0.24, position: 'absolute', bottom: 18 },
    cardTranslation: { color: C.text, fontSize: 28, fontFamily: F.bold, textAlign: 'center' },
    exampleBox: { marginTop: 24, backgroundColor: C.card2, borderRadius: R.md, padding: 14 },
    example: { color: C.text, fontSize: 15, lineHeight: 22, textAlign: 'center' },
    exampleTr: { color: C.dim, fontSize: 13, marginTop: 6, textAlign: 'center', lineHeight: 19 },
    answerRow: { flexDirection: 'row', gap: 12, marginBottom: 8 },
    answerBtn: { flex: 1, paddingVertical: 16, borderRadius: R.md, alignItems: 'center' },
    answerText: { color: C.text, fontSize: 17, fontFamily: F.semi },
  });
