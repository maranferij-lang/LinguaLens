// «Навчання»: хаб — флешкартки (3D-фліп) + квіз
import { useMemo, useRef, useState } from 'react';
import { Animated, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { dueWords, nextDueText, practiceWords } from './srs';
import { speak } from './speech';
import QuizScreen, { QUIZ_MIN, SessionClose, isQuizReady } from './QuizScreen';
import { IcCards, IcChevron, IcMedal, IcSpeaker } from './icons';
import { Mascot, MascotBob } from './Mascot';
import { PCrown } from './ProIcons';
import { StickerLarge } from './Sticker';
import { photoUri } from './photos';
import WordOfDayCard from './WordOfDayCard';
import { Bar, FadeIn, GradBtn, Pill, Press } from './ui';
import { UNDER_TAB } from './Chrome';

import { F, R, type, useTheme } from './theme';
import { DUR, EASE, useReducedMotion } from './motion';

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
  onOpenPro,
  isPro,
}) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();

  const [mode, setMode] = useState('hub');
  const [session, setSession] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const due = useMemo(() => dueWords(words), [words]);
  const quizReady = useMemo(() => isQuizReady(words), [words]);

  function doFlip(to) {
    setFlipped(to);
    Haptics.selectionAsync();
    Animated.timing(flipAnim, {
      toValue: to ? 1 : 0,
      // без обертання лишається коротка зміна непрозорості
      duration: reduced ? DUR.micro : DUR.panel,
      easing: EASE.inOut,
      useNativeDriver: true,
    }).start();
  }

  // practice — сесія зі слів, чий час ще не настав. Відповіді в ній не мають
  // зсувати розклад уперед (див. applyPractice у srs.js).
  function start(list, practice) {
    if (!list.length) return;
    flipAnim.setValue(0);
    setFlipped(false);
    setSession({ ids: shuffle(list.map((w) => w.id)), index: 0, correct: 0, practice });
    setMode('cards');
  }

  // «На часі» рахуємо в момент натиску, а не беремо з мемо: хаб міг простояти
  // відкритим пів години, і слово з нульової коробки (10 хв) вже чекає.
  function startCards() {
    const fresh = dueWords(words);
    if (fresh.length) start(fresh, false);
    else start(practiceWords(words), true);
  }

  // Вихід без підтвердження: кожна відповідь уже збережена в onReview.
  function close() {
    setSession(null);
    setMode('hub');
  }

  const nextIdx = session
    ? session.ids.findIndex((id, i) => i >= session.index && words.some((w) => w.id === id))
    : -1;

  function answer(known) {
    if (nextIdx === -1) return;
    // Третій аргумент — режим тренування: App.js обирає applyPractice замість applyReview.
    onReview(session.ids[nextIdx], known, session.practice);
    Haptics.impactAsync(known ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Heavy);
    flipAnim.setValue(0);
    setFlipped(false);
    setSession({ ...session, index: nextIdx + 1, correct: session.correct + (known ? 1 : 0) });
  }

  if (mode === 'quiz') {
    return (
      <QuizScreen
        words={words}
        t={t}
        onExit={() => setMode('hub')}
        onQuizDone={onQuizDone}
        // помилка в квізі — це «ще вчу»: звичайне повторення, нульова коробка
        onMiss={(id) => onReview(id, false)}
      />
    );
  }

  if (mode === 'hub') {
    return (
      <ScrollView
        style={s.hubRoot}
        contentContainerStyle={{ padding: 20, paddingBottom: UNDER_TAB + 14 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={s.hubHead}>
          <Text style={s.title}>{t('learnTitle')}</Text>
          {/* Pro завжди на очах, але не кричить: маленький піл замість
              попапа. Попап, що вилітає сам, бісить і псує оцінку. */}
          {onOpenPro && !isPro ? (
            <Press style={s.proPill} onPress={onOpenPro}>
              <PCrown size={13} color={C.accent} />
              <Text style={s.proPillText}>PRO</Text>
            </Press>
          ) : (
            <Mascot pose="wave" size={64} />
          )}
        </View>

        <WordOfDayCard word={wordOfDay} lang={targetLang} saved={wodSaved} onSave={onSaveWod} t={t} />

        {!words.length ? (
          <FadeIn delay={45} style={{ alignItems: 'center', paddingVertical: 30 }}>
            <MascotBob pose="think" size={140} />
            <Text style={s.bigTitle}>{t('cardsEmptyTitle')}</Text>
            <Text style={s.dimText}>{t('cardsEmptyText')}</Text>
          </FadeIn>
        ) : (
          <>
            <FadeIn delay={45}>
              <Press onPress={startCards}>
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
                      {quizReady ? t('quizHint') : t('quizNeed', { n: QUIZ_MIN })}
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
          {/* Після справжнього повторення — коли повертатись (це і є звичка).
              Після тренування — чому «знаю» не відсунуло слова на потім. */}
          {session.practice ? (
            <Text style={s.note}>{t('practiceNote')}</Text>
          ) : words.length ? (
            <Text style={s.note}>{t('nextRep', { t: nextDueText(words, t) })}</Text>
          ) : null}
          <GradBtn title={t('next')} onPress={close} style={{ alignSelf: 'stretch', marginTop: 22 }} />
        </FadeIn>
      </View>
    );
  }

  const current = words.find((w) => w.id === session.ids[nextIdx]);
  const frontRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const backRotate = flipAnim.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  // 0.5 — момент, коли картка стоїть ребром. Саме там міняємо, хто видимий.
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.499, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });
  // «Менше руху»: замість 3D-обертання — просте перетікання сторін.
  const frontStyle = reduced
    ? { opacity: flipAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }) }
    : { opacity: frontOpacity, transform: [{ perspective: 1200 }, { rotateY: frontRotate }] };
  const backStyle = reduced
    ? { opacity: flipAnim }
    : { opacity: backOpacity, transform: [{ perspective: 1200 }, { rotateY: backRotate }] };

  return (
    <View style={s.root}>
      <View style={s.top}>
        <SessionClose onPress={close} label={t('close')} />
        {/* Bar з ui.js: scaleX від лівого краю на нативному драйвері, без перерахунку лейауту */}
        <View style={{ flex: 1 }}>
          <Bar progress={nextIdx / session.ids.length} color={C.accent} bg={C.card2} height={6} />
        </View>
        <Text style={s.progress}>
          {nextIdx + 1} / {session.ids.length}
        </Text>
      </View>
      {session.practice ? <Pill text={t('practiceMode')} color={C.accent} soft={C.accentSoft} style={s.modePill} /> : null}

      {/* key — кожна нова картка м'яко з'являється, а не підміняється миттєво */}
      <FadeIn key={current.id} style={s.cardWrap} dy={10}>
        <Animated.View style={[s.card, SHADOW, frontStyle]} pointerEvents={flipped ? 'none' : 'auto'}>
          <Press style={s.cardInner} onPress={() => doFlip(true)}>
            <Text style={s.cardWord}>{current.word}</Text>
            {current.ipa ? <Text style={s.cardIpa}>{current.ipa}</Text> : null}
            <Press style={s.speakBtn} onPress={() => speak(current.word, current.lang)}>
              <IcSpeaker size={22} color={C.accent} />
            </Press>
            <Text style={s.tapHint}>{t('tapFlip')}</Text>
          </Press>
        </Animated.View>

        <Animated.View style={[s.card, SHADOW, backStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
          <Press style={s.cardInner} onPress={() => doFlip(false)}>
            {current.photo ? (
              <StickerLarge
                uri={photoUri(current.photo)}
                shape={current.shape}
                outline={current.outline}
                box={current.box}
                size={136}
                style={{ marginBottom: 16 }}
              />
            ) : null}
            <Text style={s.cardTranslation}>{current.translation}</Text>
            {current.example ? (
              <View style={s.exampleBox}>
                <Text style={s.example}>“{current.example}”</Text>
                {current.exampleTranslation ? <Text style={s.exampleTr}>{current.exampleTranslation}</Text> : null}
              </View>
            ) : null}
          </Press>
        </Animated.View>
      </FadeIn>

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

const makeStyles = (C) =>
  StyleSheet.create({
    // Таб-бар лежить поверх контенту (position: absolute), тож знизу сесії
    // резервуємо UNDER_TAB — інакше кнопки відповіді ховались під панеллю.
    root: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 20, paddingBottom: UNDER_TAB },
    hubRoot: { flex: 1, backgroundColor: C.bg },
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
    // UNDER_TAB знизу — щоб блок центрувався у видимій частині, а не під панеллю
    center: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 36,
      paddingTop: 20,
      paddingBottom: UNDER_TAB,
    },
    // без власного marginBottom: відступ дає hubHead, інакше заголовок
    // з'їжджав угору відносно PRO-пігулки в тому ж рядку
    title: { color: C.text, ...type(34, F.bold) },
    bigTitle: { color: C.text, ...type(22, F.bold), marginTop: 14, textAlign: 'center' },
    dimText: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8 },
    note: { color: C.faint, ...type(13, F.reg), textAlign: 'center', marginTop: 6 },

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
    hubCardTitle: { color: C.text, ...type(17, F.semi) },
    hubCardHint: { color: C.dim, ...type(13, F.reg), marginTop: 1 },
    dueBadge: {
      backgroundColor: C.accent,
      borderRadius: R.pill,
      minWidth: 26,
      height: 26,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    dueBadgeText: { color: C.onAccent, ...type(13, F.bold, { noLead: true }) },

    top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    // табличні цифри — лічильник не стрибає по ширині від картки до картки
    progress: { color: C.dim, ...type(13, F.semi), fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
    modePill: { alignSelf: 'center', marginTop: 14 },
    cardWrap: { flex: 1, marginVertical: 16 },
    card: {
      ...StyleSheet.absoluteFill,
      backgroundColor: C.card,
      borderRadius: R.xl,
      backfaceVisibility: 'hidden',
    },
    cardInner: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    cardWord: { color: C.text, ...type(38, F.bold), textAlign: 'center' },
    cardIpa: { color: C.dim, ...type(17, F.reg), marginTop: 8 },
    speakBtn: {
      marginTop: 20,
      backgroundColor: C.card2,
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tapHint: { color: C.faint, ...type(12, F.reg), position: 'absolute', bottom: 18 },
    cardTranslation: { color: C.text, ...type(28, F.bold), textAlign: 'center' },
    exampleBox: { marginTop: 24, backgroundColor: C.card2, borderRadius: R.md, padding: 14, alignSelf: 'stretch' },
    example: { color: C.text, ...type(15, F.reg), textAlign: 'center' },
    exampleTr: { color: C.dim, ...type(13, F.reg), marginTop: 6, textAlign: 'center' },
    answerRow: { flexDirection: 'row', gap: 12 },
    answerBtn: { flex: 1, paddingVertical: 16, borderRadius: R.md, alignItems: 'center' },
    answerText: { color: C.text, ...type(17, F.semi, { noLead: true }) },
  });
