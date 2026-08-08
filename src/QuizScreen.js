// Квіз: вгадай переклад із 4 варіантів, таймер 10с, серія правильних
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcFlame, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, Glass, GradBtn, Press } from './ui';
import { EASE } from './motion';
import { F, R, useTheme } from './theme';

const Q_TIME = 10000;
const Q_COUNT = 10;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function buildQuestions(words) {
  const qs = shuffle(words).slice(0, Q_COUNT);
  return qs.map((w) => {
    const others = shuffle(
      [...new Set(words.filter((x) => x.id !== w.id).map((x) => x.translation))].filter(Boolean)
    ).slice(0, 3);
    return { word: w, options: shuffle([w.translation, ...others]) };
  });
}

export default function QuizScreen({ words, t, onExit, onQuizDone }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [questions, setQuestions] = useState(() => buildQuestions(words));
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState(null);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [finished, setFinished] = useState(false);

  const timer = useRef(new Animated.Value(1)).current;
  const timeout = useRef(null);

  const q = questions[idx];

  useEffect(() => {
    if (finished) return;
    timer.setValue(1);
    // Таймер — єдиний випадок, де linear доречний: він показує рівний плин часу.
    // Масштабуємо по X замість width, щоб не перераховувати лейаут щокадру.
    Animated.timing(timer, {
      toValue: 0,
      duration: Q_TIME,
      easing: EASE.linear,
      useNativeDriver: true,
    }).start();
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => pick(-1), Q_TIME);
    return () => clearTimeout(timeout.current);
  }, [idx, finished]);

  function pick(i) {
    if (picked !== null) return;
    clearTimeout(timeout.current);
    timer.stopAnimation();
    setPicked(i);
    const correct = i >= 0 && q.options[i] === q.word.translation;
    if (correct) {
      setScore((v) => v + 1);
      setStreak((v) => v + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setStreak(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
    setTimeout(() => {
      setPicked(null);
      if (idx + 1 >= questions.length) {
        const finalScore = score + (correct ? 1 : 0);
        setFinished(true);
        if (onQuizDone) onQuizDone(finalScore === questions.length);
      } else setIdx(idx + 1);
    }, 900);
  }

  function restart() {
    setQuestions(buildQuestions(words));
    setIdx(0);
    setScore(0);
    setStreak(0);
    setFinished(false);
  }

  if (finished) {
    const pct = Math.round((score / questions.length) * 100);
    return (
      <View style={s.center}>
        <FadeIn style={{ alignItems: 'center', width: '100%' }}>
          <MascotBob pose={pct >= 60 ? 'celebrate' : 'encourage'} size={160} />
          <Text style={s.bigTitle}>{t('quizDone')}</Text>
          <Text style={s.dimText}>{t('quizScore', { s: score, n: questions.length })}</Text>
          <GradBtn title={t('quizAgain')} onPress={restart} style={{ alignSelf: 'stretch' }} />
          <Press style={s.exitBtn} onPress={onExit}>
            <Text style={s.exitText}>{t('next')}</Text>
          </Press>
        </FadeIn>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <View style={s.timerTrack}>
        <Animated.View
          style={[s.timerFill, { transform: [{ scaleX: timer }], transformOrigin: 'left' }]}
        />
      </View>

      <View style={s.metaRow}>
        <Text style={s.meta}>{t('quizQ', { i: idx + 1, n: questions.length })}</Text>
        {streak > 1 ? (
          <View style={s.streakRow}>
            <IcFlame size={15} color={C.accent} />
            <Text style={s.streakText}>{t('quizStreak', { n: streak })}</Text>
          </View>
        ) : null}
      </View>

      <Glass style={s.qCard}>
        <View style={s.qRow}>
          <Text style={s.qWord}>{q.word.word}</Text>
          <Press style={s.speakBtn} onPress={() => speak(q.word.word, q.word.lang)}>
            <IcSpeaker size={18} color={C.accent} />
          </Press>
        </View>
        {q.word.ipa ? <Text style={s.qIpa}>{q.word.ipa}</Text> : null}
      </Glass>

      <View style={{ gap: 10, marginTop: 18 }}>
        {q.options.map((opt, i) => {
          const isCorrect = opt === q.word.translation;
          const show = picked !== null;
          return (
            <Press
              key={i}
              style={[
                s.option,
                show && isCorrect && { backgroundColor: C.greenSoft },
                show && picked === i && !isCorrect && { backgroundColor: C.redSoft },
              ]}
              onPress={() => pick(i)}
            >
              <Text
                style={[
                  s.optionText,
                  show && isCorrect && { color: C.green, fontFamily: F.bold },
                  show && picked === i && !isCorrect && { color: C.red },
                ]}
              >
                {opt}
              </Text>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20 },
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 36 },
    bigTitle: { color: C.text, fontSize: 22, letterSpacing: -0.31, fontFamily: F.bold, marginTop: 14 },
    dimText: { color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 8, marginBottom: 22 },
    exitBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
    exitText: { color: C.accent, fontSize: 17, fontFamily: F.semi },
    timerTrack: { height: 4, backgroundColor: C.card2, borderRadius: 2, marginTop: 6, overflow: 'hidden' },
    timerFill: { height: 4, width: '100%', borderRadius: 2, backgroundColor: C.accent },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 },
    meta: { color: C.dim, fontSize: 13 },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    streakText: { color: C.accent, fontSize: 13, fontFamily: F.bold },
    qCard: { marginTop: 16, alignItems: 'center', paddingVertical: 26 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qWord: { color: C.text, fontSize: 28, letterSpacing: -0.39, fontFamily: F.bold, textAlign: 'center' },
    speakBtn: {
      backgroundColor: C.card2,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qIpa: { color: C.dim, fontSize: 15, marginTop: 6 },
    option: { backgroundColor: C.card, borderRadius: R.md, paddingVertical: 15, paddingHorizontal: 16 },
    optionText: { color: C.text, fontSize: 16, letterSpacing: -0.1, fontFamily: F.semi, textAlign: 'center' },
  });
