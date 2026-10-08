// Квіз: вгадай переклад із 4 варіантів, таймер 10с, серія правильних
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcCheck, IcClock, IcClose, IcFlame, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { Bar, FadeIn, Glass, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { DUR, EASE, SPRING, announce, isReducedMotion, useScreenReader } from './motion';
import { F, R, type, useTheme } from './theme';

const Q_TIME = 10000;
const Q_COUNT = 10;
// Пауза між відповіддю й наступним питанням. Час вийшов — так само: людина
// встигає прочитати «Час вийшов» і побачити правильну відповідь.
export const Q_PAUSE = 900;
// Хибна відповідь: людині треба прочитати правильний переклад — це те, чого
// квіз вчить, — тож пауза довша. Час вийшов лишається коротким: варіанти
// людина вже роздивлялась усі десять секунд.
export const Q_PAUSE_MISS = 1400;
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

// Скільки бракує до квізу — для рисочок «1 / 4» на закритій картці квізу
// («Навчання» до першого слова, core.md B.1). Та сама логіка, що й
// isQuizReady: рахуються РІЗНІ переклади, тож «чашка» двома мовами — одне.
// have не більше за need: зайві слова рисочок не додають.
export function quizProgress(words) {
  const have = new Set(withTranslation(words).map((w) => norm(w.translation))).size;
  return { have: Math.min(have, QUIZ_MIN), need: QUIZ_MIN };
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
  // З VoiceOver відліку немає: десяти секунд не вистачає, щоб почути чотири
  // варіанти й двічі торкнутись (WCAG 2.2.1), а пауза після відповіді лишається.
  const reader = useScreenReader();

  const timer = useRef(new Animated.Value(1)).current;
  const timeout = useRef(null);
  // Пауза між відповіддю й наступним питанням. Тримаємо в ref, щоб скасувати
  // при виході: інакше після хрестика квіз «добігав» би й зараховувався.
  const advance = useRef(null);
  // Стан `picked` оновлюється лише з наступним рендером, тож два швидкі тапи
  // обидва проходили перевірку й зараховували відповідь двічі. Ref — миттєвий.
  const answered = useRef(false);

  const q = questions[idx];

  // Таймер викликає найсвіжіший pick: відлік можуть перезапустити з іншого
  // рендеру (застосунок повернувся на передній план), і застаріле замикання
  // знало б не той стан.
  const pickRef = useRef(null);
  const readerRef = useRef(false);
  readerRef.current = reader;

  // Відлік питання: повна смужка й 10 с. Викликається на початку питання, коли
  // застосунок повертається на передній план і коли вимкнули VoiceOver.
  // Таймер — єдиний випадок, де linear доречний: він показує рівний плин часу.
  // Масштабуємо по X замість width, щоб не перераховувати лейаут щокадру.
  function runClock() {
    clearTimeout(timeout.current);
    timer.stopAnimation();
    timer.setValue(1);
    if (readerRef.current) return;
    Animated.timing(timer, {
      toValue: 0,
      duration: Q_TIME,
      easing: EASE.linear,
      useNativeDriver: true,
    }).start();
    timeout.current = setTimeout(() => pickRef.current?.(-1), Q_TIME);
  }

  useEffect(() => {
    if (finished || !q) return;
    answered.current = false;
    runClock();
    return () => clearTimeout(timeout.current);
  }, [idx, finished]);

  // VoiceOver увімкнули чи вимкнули посеред питання
  const prevReader = useRef(reader);
  useEffect(() => {
    if (prevReader.current === reader) return;
    prevReader.current = reader;
    if (!finished && q && !answered.current) runClock();
  }, [reader]);

  // Дзвінок, Face ID, перемикання застосунків, шторка: JS-таймери iOS на фоні
  // не йдуть, а прострочені спрацьовують при поверненні — питання, якого
  // людина не бачила, рахувалося б «час вийшов», а слово з 4-ї коробки
  // скидалось би в нульову. Тож на фоні відлік стоїть, а при поверненні
  // питання починається з повних 10 с (чесніше, ніж лишок).
  useEffect(() => {
    if (finished) return undefined;
    const sub = AppState.addEventListener('change', (state) => {
      if (answered.current) return;
      if (state === 'active') runClock();
      else {
        clearTimeout(timeout.current);
        timer.stopAnimation();
      }
    });
    return () => sub?.remove?.();
  }, [finished]);

  useEffect(
    () => () => {
      clearTimeout(advance.current);
      timer.stopAnimation();
    },
    []
  );

  // Питань немає (слова зникли після синхронізації) — повертаємось у хаб
  useEffect(() => {
    if (!q && !finished) onExit?.();
  }, [q, finished]);

  function pick(i) {
    if (!q || picked !== null || answered.current) return;
    answered.current = true;
    clearTimeout(timeout.current);
    timer.stopAnimation();
    setPicked(i);
    const correct = i === q.answer;
    // Колір і галочка — для очей; VoiceOver чує те саме словами
    const right = q.options[q.answer];
    announce(correct ? t('quizCorrectA11y') : t(i === -1 ? 'quizTimeUpA11y' : 'quizWrongA11y', { a: right }));
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
    }, correct || i === -1 ? Q_PAUSE : Q_PAUSE_MISS);
  }
  pickRef.current = pick;

  function restart() {
    // слова могли змінитись між раундами (синхронізація): без питань грати нема
    const next = buildQuestions(words);
    if (!next.length) {
      onExit?.();
      return;
    }
    setQuestions(next);
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
          {/* «Готово», а не «Далі»: кнопка лише вертає в хаб */}
          <Press style={s.exitBtn} onPress={onExit}>
            <Text style={s.exitText}>{t('finishBtn')}</Text>
          </Press>
        </FadeIn>
      </View>
    );
  }

  if (!q) return null;

  return (
    // ScrollView — запас на великий шрифт (Dynamic Type) і довгі переклади:
    // на звичайному екрані все влазить і нічого не прокручується.
    <ScrollView
      style={s.root}
      contentContainerStyle={s.content}
      alwaysBounceVertical={false}
      showsVerticalScrollIndicator={false}
    >
      {/* Верхній рядок — як у флешкартках: хрестик, прогрес сесії, «1 / 10» */}
      <View style={s.top}>
        <SessionClose onPress={onExit} label={t('close')} />
        <View style={{ flex: 1 }}>
          {/* «3 / 10» стоїть поруч текстом: смужку VoiceOver не читає вдруге */}
          <Bar progress={idx / questions.length} color={C.accent} bg={C.card2} height={6} decorative />
        </View>
        <Text style={s.meta}>{t('quizQ', { i: idx + 1, n: questions.length })}</Text>
      </View>

      <View style={s.metaRow}>
        {streak > 1 ? (
          <View style={s.streakRow}>
            <IcFlame size={15} color={C.accent} />
            <Text style={s.streakText}>{t('quizStreak', { n: streak })}</Text>
          </View>
        ) : null}
      </View>

      {/* key — нове питання мʼяко проявляється, а не підмінюється різким
          стрибком (без руху під «Менше руху»: лише непрозорість) */}
      <FadeIn key={idx} dy={8}>
        <Glass style={s.qCard}>
          <View style={s.qRow}>
            <Text style={s.qWord}>{q.word.word}</Text>
            <Press style={s.speakBtn} onPress={() => speak(q.word.word, q.word.lang)} accessibilityLabel={t('listen')}>
              <IcSpeaker size={18} color={C.accent} />
            </Press>
          </View>
          {q.word.ipa ? <Text style={s.qIpa}>{q.word.ipa}</Text> : null}
        </Glass>

        {/* Таймер — не прогрес: тонка бурштинова смужка під питанням, що
            тане до нуля. Час вийшов — так і кажемо, перш ніж іти далі. З
            VoiceOver відліку немає, тож і смужки теж. */}
        <View style={s.timerSlot}>
          {picked === -1 ? (
            <View style={s.timeUp}>
              <IcClock size={15} color={C.warm} />
              <Text style={s.timeUpText} accessibilityLiveRegion="polite">
                {t('quizTimeUp')}
              </Text>
            </View>
          ) : reader ? null : (
            <View style={s.timerTrack} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <Animated.View style={[s.timerFill, { transform: [{ scaleX: timer }], transformOrigin: 'left' }]} />
            </View>
          )}
        </View>

        <View style={{ gap: 10, marginTop: 4 }}>
          {q.options.map((opt, i) => {
            const isCorrect = i === q.answer;
            const show = picked !== null;
            const wrongPick = show && picked === i && !isCorrect;
            return (
              <Press
                key={i}
                style={[
                  s.option,
                  show && isCorrect && { backgroundColor: C.greenSoft },
                  wrongPick && { backgroundColor: C.redSoft },
                ]}
                onPress={() => pick(i)}
                accessibilityState={{ selected: picked === i }}
              >
                <Text
                  style={[
                    s.optionText,
                    show && isCorrect && { color: C.greenInk, fontFamily: F.bold },
                    wrongPick && { color: C.redInk },
                  ]}
                >
                  {opt}
                </Text>
                {/* Галочка й хрестик: правильне й хибне видно не лише за кольором */}
                {show && isCorrect ? <OptionMark ok color={C.greenInk} /> : null}
                {wrongPick ? <OptionMark color={C.redInk} /> : null}
              </Press>
            );
          })}
        </View>
      </FadeIn>
    </ScrollView>
  );
}

// Позначка відповіді праворуч у варіанті. Абсолютна, тож рядок не стрибає;
// з'являється за непрозорістю (без руху, тож і «Менше руху» її не чіпає).
// VoiceOver її ховаємо: те саме він чує з оголошення відповіді.
function OptionMark({ ok = false, color }) {
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: DUR.micro, easing: EASE.out, useNativeDriver: true }).start();
    return () => a.stopAnimation();
  }, []);
  const Icon = ok ? IcCheck : IcClose;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{ position: 'absolute', right: 10, top: 0, bottom: 0, justifyContent: 'center', opacity: a }}
    >
      <Icon size={18} color={color} />
    </Animated.View>
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
    note: { color: C.dim, ...type(13, F.reg), textAlign: 'center', marginTop: 6 },
    exitBtn: { marginTop: 12, paddingVertical: 12, alignItems: 'center', alignSelf: 'stretch' },
    exitText: { color: C.accent, ...type(17, F.semi, { noLead: true }) },
    top: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    // табличні цифри — «9 / 10» і «10 / 10» не стрибають по ширині
    meta: { color: C.dim, ...type(13, F.semi), fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
    // рядок серії тримає висоту й без серії — картка питання не стрибає
    metaRow: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', marginTop: 10, minHeight: 18 },
    streakRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    streakText: { color: C.accent, ...type(13, F.bold) },
    qCard: { marginTop: 6, alignItems: 'center', paddingVertical: 26 },
    // місце під таймер і «Час вийшов» — однакової висоти
    timerSlot: { height: 34, justifyContent: 'center', paddingHorizontal: 18 },
    timerTrack: { height: 4, backgroundColor: C.warmSoft, borderRadius: 2, overflow: 'hidden' },
    timerFill: { height: 4, width: '100%', borderRadius: 2, backgroundColor: C.warm },
    // текст — кольору тексту на мʼякому бурштині: сам бурштин на крейді не читається
    timeUp: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      alignSelf: 'center',
      backgroundColor: C.warmSoft,
      borderRadius: R.pill,
      paddingHorizontal: 12,
      paddingVertical: 5,
    },
    timeUpText: { color: C.text, ...type(14, F.bold, { noLead: true }) },
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
    qIpa: { color: C.dim, ...type(15, F.ipa), fontWeight: '500', marginTop: 6 },
    option: { backgroundColor: C.card, borderRadius: R.md, paddingVertical: 15, paddingHorizontal: 16 },
    // боковий відступ — місце під позначку відповіді, щоб довгий переклад під
    // неї не заходив і не перезавертався, коли вона з'являється
    optionText: { color: C.text, ...type(16, F.semi), textAlign: 'center', paddingHorizontal: 20 },
  });
