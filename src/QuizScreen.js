// Квіз: вгадай переклад із 4 варіантів, таймер 10с, серія правильних
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcClose, IcFlame, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, Glass, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { EASE, SPRING, isReducedMotion } from './motion';
import { F, R, type, useTheme } from './theme';

const Q_TIME = 10000;
const Q_COUNT = 10;
const OPTIONS = 4;
// Квіз має сенс лише тоді, коли є з чого вибирати: правильна відповідь
// і три РІЗНІ хибні. Інакше варіантів буде 2–3 і вгадати можна навмання.
export const QUIZ_MIN = OPTIONS;

function shuffle(arr, rand = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Переклади порівнюємо без регістру й зайвих пробілів: «Чашка» і «чашка »
// для людини — той самий варіант, і два такі поруч виглядали б як баг.
const norm = (s) => (typeof s === 'string' ? s.trim().toLowerCase() : '');

// Мова невідома (старі записи) — не штрафуємо, вважаємо сумісною.
const sameLang = (a, b) => !a || !b || a === b;

function withTranslation(words) {
  return words.filter((w) => norm(w.translation));
}

export function isQuizReady(words) {
  return new Set(withTranslation(words).map((w) => norm(w.translation))).size >= QUIZ_MIN;
}

// Питання квізу: { word, options: [4 різні переклади], answer: індекс правильного }.
// Чиста функція — rand передається ззовні, щоб тести були детермінованими.
export function buildQuestions(words, { count = Q_COUNT, rand = Math.random } = {}) {
  const pool = shuffle(withTranslation(words), rand);

  // Те саме слово, збережене двічі, не питаємо двічі за один квіз.
  const asked = new Set();
  const questions = pool.filter((w) => {
    const key = (w.lang || '') + '|' + norm(w.word);
    if (asked.has(key)) return false;
    asked.add(key);
    return true;
  });

  return questions.slice(0, count).map((w) => {
    // Відволікачі — спершу з тієї самої пари мов. Переклад, записаний іншою
    // рідною мовою (людина колись її змінила), видно здалеку — варіант, який
    // відкидаєш не думаючи, не варіант. Слово з тієї ж мови навчання —
    // з тієї ж «колоди», тож і плутати його чесніше. Решта — лише як запас.
    const score = (x) => (sameLang(x.nativeLang, w.nativeLang) ? 2 : 0) + (sameLang(x.lang, w.lang) ? 1 : 0);
    // Свіже перемішування для КОЖНОГО питання, а тоді стабільне сортування:
    // випадковість лишається всередині рівних груп. З одним спільним порядком
    // усі питання отримували б тих самих трьох «сусідів».
    const ranked = shuffle(pool.filter((x) => x !== w), rand).sort((a, b) => score(b) - score(a));

    const used = new Set([norm(w.translation)]);
    const wrong = [];
    for (const x of ranked) {
      if (wrong.length === OPTIONS - 1) break;
      const k = norm(x.translation);
      if (used.has(k)) continue;
      used.add(k);
      wrong.push(x.translation.trim());
    }

    const options = shuffle([w.translation.trim(), ...wrong], rand);
    return { word: w, options, answer: options.indexOf(w.translation.trim()) };
  });
}

// Хрестик виходу із сесії (квіз і флешкартки).
// Підтвердження не питаємо: кожна відповідь зберігається в момент натиску,
// тож вихід посередині нічого не губить. Pressable, а не Press: Press не
// передає accessibility-пропси, а VoiceOver має прочитати «Закрити, кнопка».
const APressable = Animated.createAnimatedComponent(Pressable);

export function SessionClose({ onPress, label }) {
  const { C } = useTheme();
  const scale = useRef(new Animated.Value(1)).current;
  // при «менше руху» стиснення прибираємо — лишається хаптика
  const press = (to, cfg) => !isReducedMotion() && Animated.spring(scale, { toValue: to, ...cfg }).start();

  return (
    <APressable
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      onPressIn={() => press(0.9, SPRING.snappy)}
      onPressOut={() => press(1, SPRING.ui)}
      // 36 pt візуально, але палець влучає в 56 — мінімум Apple 44
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: C.card2,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ scale }],
      }}
    >
      <IcClose size={18} color={C.dim} />
    </APressable>
  );
}

// onQuizDone(perfect, correct) — квіз пройдено до кінця: чи без жодної
// помилки і скільки правильних відповідей. Помилки вже пішли в onMiss
// кожна окремо, тож App дописує в активність дня лише правильні — так
// серія триває й у того, хто того дня лише повторював.
export default function QuizScreen({ words, t, onExit, onQuizDone, onMiss }) {
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
  // Пауза між відповіддю й наступним питанням. Тримаємо в ref, щоб скасувати
  // при виході: інакше після хрестика квіз «добігав» би й зараховувався.
  const advance = useRef(null);
  // Стан `picked` оновлюється лише з наступним рендером, тож два швидкі тапи
  // обидва проходили перевірку й зараховували відповідь двічі. Ref — миттєвий.
  const answered = useRef(false);

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
    answered.current = false;
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => pick(-1), Q_TIME);
    return () => clearTimeout(timeout.current);
  }, [idx, finished]);

  useEffect(
    () => () => {
      clearTimeout(advance.current);
      timer.stopAnimation();
    },
    []
  );

  function pick(i) {
    if (picked !== null || answered.current) return;
    answered.current = true;
    clearTimeout(timeout.current);
    timer.stopAnimation();
    setPicked(i);
    const correct = i === q.answer;
    if (correct) {
      setScore((v) => v + 1);
      setStreak((v) => v + 1);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      setStreak(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Помилка (чи час вийшов) — чесний сигнал, що слово забувається:
      // повертаємо його на повторення одразу, а не після квізу — вихід
      // хрестиком посередині теж нічого не губить. Правильна відповідь
      // розклад не чіпає: вгадати з чотирьох — не те саме, що згадати.
      onMiss?.(q.word.id);
    }
    advance.current = setTimeout(() => {
      setPicked(null);
      if (idx + 1 >= questions.length) {
        const finalScore = score + (correct ? 1 : 0);
        setFinished(true);
        if (onQuizDone) onQuizDone(finalScore === questions.length, finalScore);
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
          {score < questions.length ? <Text style={s.note}>{t('quizMissNote')}</Text> : null}
          <GradBtn title={t('quizAgain')} onPress={restart} style={{ alignSelf: 'stretch', marginTop: 22 }} />
          <Press style={s.exitBtn} onPress={onExit}>
            <Text style={s.exitText}>{t('next')}</Text>
          </Press>
        </FadeIn>
      </View>
    );
  }

  return (
    // ScrollView — запас на великий шрифт (Dynamic Type) і довгі переклади:
    // на звичайному екрані все влазить і нічого не прокручується.
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      <View style={s.top}>
        <SessionClose onPress={onExit} label={t('close')} />
        <View style={s.timerTrack}>
          <Animated.View
            style={[s.timerFill, { transform: [{ scaleX: timer }], transformOrigin: 'left' }]}
          />
        </View>
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
          <Press style={s.speakBtn} onPress={() => speak(q.word.word, q.word.lang)} accessibilityLabel={t('listen')}>
            <IcSpeaker size={18} color={C.accent} />
          </Press>
        </View>
        {q.word.ipa ? <Text style={s.qIpa}>{q.word.ipa}</Text> : null}
      </Glass>

      <View style={{ gap: 10, marginTop: 18 }}>
        {q.options.map((opt, i) => {
          const isCorrect = i === q.answer;
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
    </ScrollView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    // таб-бар лежить поверх контенту — останній варіант має бути над ним
    content: { padding: 20, paddingBottom: UNDER_TAB + 8 },
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
    bigTitle: { color: C.text, ...type(22, F.bold), marginTop: 14 },
    dimText: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8 },
    note: { color: C.faint, ...type(13, F.reg), textAlign: 'center', marginTop: 6 },
    exitBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
    exitText: { color: C.accent, ...type(17, F.semi, { noLead: true }) },
    top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    timerTrack: { flex: 1, height: 6, backgroundColor: C.card2, borderRadius: 3, overflow: 'hidden' },
    timerFill: { height: 6, width: '100%', borderRadius: 3, backgroundColor: C.accent },
    metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
    // табличні цифри — «9 / 10» і «10 / 10» не стрибають по ширині
    meta: { color: C.dim, ...type(13, F.semi), fontVariant: ['tabular-nums'] },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    streakText: { color: C.accent, ...type(13, F.bold) },
    qCard: { marginTop: 14, alignItems: 'center', paddingVertical: 26 },
    qRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    qWord: { color: C.text, ...type(28, F.bold), textAlign: 'center', flexShrink: 1 },
    speakBtn: {
      backgroundColor: C.card2,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    qIpa: { color: C.dim, ...type(15, F.reg), marginTop: 6 },
    option: { backgroundColor: C.card, borderRadius: R.md, paddingVertical: 15, paddingHorizontal: 16 },
    optionText: { color: C.text, ...type(16, F.semi), textAlign: 'center' },
  });
