// «Навчання»: хаб — флешкартки (3D-фліп) + квіз.
//
// v1.3 (core.md B, C.4): картки й квіз видно завжди. Поки слів немає (L0),
// обидві закриті — замок і пояснення «Збережи хоча б одне слово, щоб
// відкрити», — а нижче блок «Як отримати перше слово» з двома шляхами:
// зберегти слово дня або сканувати. Квіз чекає 4 різних перекладів і
// показує прогрес рисочками (L1). Перше слово відкриває картки з коротким
// «Відкрито!» — рівно один раз (unlockSeen у налаштуваннях). У шапці — чип
// серії, з 18:00 згори — банер «серія під загрозою».
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { dueWords, nextDueText, practiceWords } from './srs';
import { speak } from './speech';
import { track } from './analytics';
import QuizScreen, { SessionClose, quizProgress } from './QuizScreen';
import { IcCards, IcChevron, IcClock, IcLock, IcMedal, IcScan, IcSparkle, IcSpeaker } from './icons';
import { Mascot, MascotBob } from './Mascot';
import { PCrown } from './ProIcons';
import { StickerLarge } from './Sticker';
import { photoUri } from './photos';
import WordOfDayCard from './WordOfDayCard';
import { ProfileTip, WidgetTip } from './LearnTips';
import StreakChip, { atRisk } from './streak/StreakChip';
import RiskBanner from './streak/RiskBanner';
import { Bar, FadeIn, GradBtn, Pill, Press } from './ui';
import { UNDER_TAB } from './Chrome';

import { F, R, type, useTheme } from './theme';
import { DUR, EASE, useReducedMotion } from './motion';

// Скільки видно ярлик «Відкрито!» і скільки світиться підказаний блок
export const UNLOCK_MS = 2000;
export const GLOW_MS = 1200;

// Останні два слова рядка тримаються разом (нерозривний пробіл): підпис
// картки на SE не лишає одне слово сиротою в другому рядку.
export function noOrphan(text) {
  return String(text).replace(/ (\S+)$/, '\u00A0$1');
}

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
  // порожнє навчання: «Сканувати» веде на вкладку сканера
  onGoScan,
  isPro,
  // слово дня під людину: тема, «Знаю» і пропозиція підняти рівень (App)
  wodTopic = '',
  onKnowWod,
  wodKnowing = false,
  wodNote = '',
  levelUp = null,
  onLevelUp,
  onKeepLevel,
  // підказки: налаштувати профіль і додати віджет (умови вирішує App)
  profileTip = false,
  onOpenProfile,
  onHideProfileTip,
  widgetTip = false,
  onHideWidgetTip,
  // «Навчання» до першого слова: скільки безкоштовних сканів (Infinity — Pro;
  // не передано — кнопка «Сканувати» є), пейвол scans, які «Відкрито!» вже
  // показали ({ cards, quiz }; не передано — жодних) і onUnlockSeen(card)
  scansLeft,
  onOpenPaywall,
  unlockSeen = null,
  onUnlockSeen,
  // поверх екрана зараз свято серії чи інший шар (пейвол, аркуш): «Відкрито!»
  // дочекається, поки він закриється, — інакше момент відіграв би під ним
  holdMoments = false,
  // App тримає свято серії й тости, поки йде сесія карток чи квізу
  onSessionChange,
  // серія: { n, doneToday, phase, lastActiveKey } — чип і вечірній банер;
  // onOpenStreak — тап по чипу (Профіль, «Прогрес»); lang — для «3 год 13 хв»
  streak = null,
  onOpenStreak,
  lang = 'en',
}) {
  const { C, T, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();

  const [mode, setMode] = useState('hub');
  const [session, setSession] = useState(null);
  const [flipped, setFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;

  const due = useMemo(() => dueWords(words), [words]);
  // Стан «Навчання» (core.md B.1): 0 — слів немає, 1 — картки є, квізу ще
  // бракує різних перекладів, 2 — відкрито все
  const progress = useMemo(() => quizProgress(words), [words]);
  const quizReady = progress.have >= progress.need;
  const level = !words.length ? 0 : quizReady ? 2 : 1;
  const left = progress.need - progress.have;

  // Сесія карток чи квізу — App притримує свято серії й тости до її кінця
  useEffect(() => {
    onSessionChange?.(mode !== 'hub');
  }, [mode]);
  useEffect(() => () => onSessionChange?.(false), []);

  // «Відкрито!» — один раз: щойно з'явилось перше слово (і 4 різні переклади
  // для квізу), а прапорця в налаштуваннях ще немає. Прапорець пишемо
  // одразу, ярлик живе своїм таймером.
  const [unlocking, setUnlocking] = useState({ cards: false, quiz: false });
  const timers = useRef([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (mode !== 'hub' || !unlockSeen || !onUnlockSeen || holdMoments) return;
    const fresh = [];
    if (words.length && !unlockSeen.cards) fresh.push('cards');
    if (quizReady && !unlockSeen.quiz) fresh.push('quiz');
    if (!fresh.length) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setUnlocking((u) => ({ ...u, ...Object.fromEntries(fresh.map((k) => [k, true])) }));
    for (const card of fresh) {
      track('learn_unlock', { card });
      onUnlockSeen(card);
    }
    timers.current.push(setTimeout(() => setUnlocking({ cards: false, quiz: false }), UNLOCK_MS));
  }, [mode, words.length, quizReady, unlockSeen?.cards, unlockSeen?.quiz, holdMoments]);

  // Тап по закритій картці: вона хитається, «Увага» хаптикою, а шлях до
  // відкриття на мить підсвічується — блок «Як отримати» (L0), «Зберегти» на
  // слові дня чи підказка про квіз (L1).
  const shakeCards = useRef(new Animated.Value(0)).current;
  const shakeQuiz = useRef(new Animated.Value(0)).current;
  const [glow, setGlow] = useState(null);
  const glowTimer = useRef(null);
  // На низькому екрані (SE) блок «Як отримати» буває під таб-баром: тап по
  // закритій картці докручує до нього, щоб підсвічене було видно
  const hubScroll = useRef(null);
  const hubView = useRef({ h: 0, howY: 0, howH: 0, top: 0 });
  useEffect(() => () => clearTimeout(glowTimer.current), []);
  const lockText = (card) =>
    card === 'cards' ? t('learnLockedCards') : level === 0 ? t('learnLockedQuiz', { n: progress.need }) : t('learnQuizLeft', { k: left });

  function lockedTap(card) {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    AccessibilityInfo.announceForAccessibility?.(lockText(card));
    track('learn_locked_tap', { card });
    if (!reduced) {
      const v = card === 'cards' ? shakeCards : shakeQuiz;
      v.setValue(0);
      Animated.sequence(
        [-6, 6, -4, 4, 0].map((x) => Animated.timing(v, { toValue: x, duration: 52, easing: EASE.out, useNativeDriver: true }))
      ).start();
    }
    setGlow(level === 0 ? 'how' : wordOfDay && !wodSaved ? 'wod' : 'tip');
    const v = hubView.current;
    const need = v.howY + v.howH + UNDER_TAB + 16 - v.h;
    if (level === 0 && v.howH && need > v.top) hubScroll.current?.scrollTo?.({ y: need, animated: !reduced });
    clearTimeout(glowTimer.current);
    glowTimer.current = setTimeout(() => setGlow(null), GLOW_MS);
  }

  // Вечір без дії дня: банер із однією дією — одна картка або слово дня
  const risk = atRisk(streak);
  const riskCta = words.length
    ? { label: t('streakRiskCta'), run: startOne }
    : wordOfDay && !wodSaved && onSaveWod
      ? { label: t('learnSaveWod'), run: onSaveWod }
      : null;
  // «Сканувати» — лише коли скан справді буде: кнопка, що замість камери
  // відкриває пейвол, — це сюрприз
  const canScan = isPro || scansLeft === undefined || scansLeft === null || scansLeft > 0;

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

  // «Повторити 1 картку» з вечірнього банера — рівно одна, як і обіцяє
  // кнопка: найнагальніше слово, а як нічого не на часі — тренування.
  function startOne() {
    const fresh = dueWords(words);
    const list = fresh.length ? fresh : practiceWords(words);
    if (list.length) start([list[0]], !fresh.length);
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
    const quizHint = level === 2 ? t('quizHint') : level === 0 ? t('learnLockedQuiz', { n: progress.need }) : t('learnQuizLeft', { k: left });
    return (
      <ScrollView
        ref={hubScroll}
        style={s.hubRoot}
        contentContainerStyle={{ padding: 20, paddingBottom: UNDER_TAB + 14 }}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => (hubView.current.h = e.nativeEvent.layout.height)}
        onScroll={(e) => (hubView.current.top = e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={64}
      >
        <View style={s.hubHead}>
          <Text style={[T.largeTitle, { flexShrink: 1 }]} accessibilityRole="header" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
            {t('learnTitle')}
          </Text>
          <View style={s.headRight}>
            {streak ? <StreakChip info={streak} onPress={onOpenStreak} t={t} /> : null}
            {/* Pro завжди на очах, але не кричить: маленький піл замість
                попапа. Попап, що вилітає сам, бісить і псує оцінку. */}
            {onOpenPro && !isPro ? (
              <Press style={s.proPill} onPress={onOpenPro} accessibilityLabel="Pro">
                <PCrown size={13} color={C.accent} />
                <Text style={s.proPillText}>PRO</Text>
              </Press>
            ) : streak ? null : (
              <Mascot pose="wave" size={64} />
            )}
          </View>
        </View>

        {risk ? (
          <FadeIn dy={8}>
            <RiskBanner n={streak.n} lang={lang} ctaLabel={riskCta?.label} onCta={riskCta?.run} t={t} />
          </FadeIn>
        ) : null}

        {/* L1: «Зберегти» на слові дня — шлях до квізу, на мить підсвічується */}
        <View>
          <WordOfDayCard
            word={wordOfDay}
            lang={targetLang}
            saved={wodSaved}
            onSave={onSaveWod}
            topic={wodTopic}
            onKnow={onKnowWod}
            knowing={wodKnowing}
            knowNote={wodNote}
            levelUp={levelUp}
            onLevelUp={onLevelUp}
            onKeepLevel={onKeepLevel}
            t={t}
          />
          {glow === 'wod' ? <View pointerEvents="none" style={[s.glowRing, s.wodRing]} testID="glow-wod" /> : null}
        </View>

        {/* Щоденне повторення — одразу під словом дня, ще до підказок: на SE
            підказки інакше виштовхували «Картки» за край екрана. Картки й квіз
            видно завжди — закриті теж, щоб було ясно, що вони є і як їх відкрити. */}
        <FadeIn delay={45}>
          <HubCard
            Icon={IcCards}
            title={t('flashcards')}
            // Нічого не на часі — не «наступне через 2 дні» (звучить як «нема
            // чого робити»), а запрошення потренуватись: тап однаково
            // запускає тренування.
            hint={
              level === 0
                ? t('learnLockedCards')
                : due.length
                  ? t('dueToday', { n: due.length })
                  : noOrphan(t('fcPracticeNow', { t: nextDueText(words, t) }))
            }
            locked={level === 0}
            unlocking={unlocking.cards}
            badge={level > 0 && due.length ? due.length : 0}
            onPress={startCards}
            onLocked={() => lockedTap('cards')}
            shake={shakeCards}
            reduced={reduced}
            testID="hub-cards"
            t={t}
          />
        </FadeIn>
        <FadeIn delay={90}>
          <HubCard
            Icon={IcMedal}
            title={t('quiz')}
            hint={quizHint}
            locked={!quizReady}
            unlocking={unlocking.quiz}
            progress={quizReady ? null : progress}
            onPress={() => setMode('quiz')}
            onLocked={() => lockedTap('quiz')}
            shake={shakeQuiz}
            reduced={reduced}
            testID="hub-quiz"
            t={t}
          />
        </FadeIn>

        {level === 0 ? (
          <View
            onLayout={(e) => {
              hubView.current.howY = e.nativeEvent.layout.y;
              hubView.current.howH = e.nativeEvent.layout.height;
            }}
          >
            <FadeIn delay={135}>
              <HowToGetWord
                wordOfDay={wordOfDay}
                wodSaved={wodSaved}
                onSaveWod={onSaveWod}
                canScan={canScan}
                onGoScan={onGoScan}
                onScanPro={onOpenPaywall ? () => onOpenPaywall('scans') : onOpenPro}
                glow={glow === 'how'}
                t={t}
              />
            </FadeIn>
          </View>
        ) : level === 1 ? (
          <FadeIn delay={135}>
            <View style={[s.tip, glow === 'tip' && s.tipGlow]} testID="learn-tip">
              <IcClock size={18} color={C.dim} />
              <Text style={s.tipText}>{t('learnTipDaily', { k: left })}</Text>
            </View>
          </FadeIn>
        ) : null}

        {profileTip ? <ProfileTip onOpen={onOpenProfile} onHide={onHideProfileTip} t={t} /> : null}
        {widgetTip ? <WidgetTip onHide={onHideWidgetTip} t={t} /> : null}
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
          {/* «Готово», а не «Далі»: кнопка лише вертає в хаб, наступного кроку немає */}
          <GradBtn title={t('finishBtn')} onPress={close} style={{ alignSelf: 'stretch', marginTop: 22 }} />
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
          {/* Динамік вкладений у картку, а VoiceOver зливає вкладені кнопки в
              одну — тож «Слухати» тут окрема дія картки (свайп угору/вниз). */}
          <Press
            style={s.cardInner}
            onPress={() => doFlip(true)}
            accessibilityActions={[{ name: 'activate' }, { name: 'listen', label: t('listen') }]}
            onAccessibilityAction={(e) =>
              e.nativeEvent.actionName === 'listen' ? speak(current.word, current.lang) : doFlip(true)
            }
          >
            <Text style={s.cardWord}>{current.word}</Text>
            {current.ipa ? <Text style={s.cardIpa}>{current.ipa}</Text> : null}
            <Press style={s.speakBtn} onPress={() => speak(current.word, current.lang)} accessibilityLabel={t('listen')}>
              <IcSpeaker size={22} color={C.accent} />
            </Press>
            <Text style={s.tapHint}>{t('tapFlip')}</Text>
          </Press>
        </Animated.View>

        <Animated.View style={[s.card, SHADOW, backStyle]} pointerEvents={flipped ? 'auto' : 'none'}>
          {/* На звороті — і саме слово (дрібно, з динаміком) над перекладом:
              оцінюючи себе, людина бачить слово й значення разом. */}
          <Press
            style={s.cardInner}
            onPress={() => doFlip(false)}
            accessibilityActions={[{ name: 'activate' }, { name: 'listen', label: t('listen') }]}
            onAccessibilityAction={(e) =>
              e.nativeEvent.actionName === 'listen' ? speak(current.word, current.lang) : doFlip(false)
            }
          >
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
            <View style={s.backWordRow}>
              <Text style={s.backWord}>{current.word}</Text>
              <Press
                style={s.backSpeak}
                onPress={() => speak(current.word, current.lang)}
                hitSlop={10}
                accessibilityLabel={t('listen')}
              >
                <IcSpeaker size={16} color={C.dim} />
              </Press>
            </View>
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

// ─── Картка хаба: «Картки» чи «Квіз» ─────────────────────────────────────────
// locked — сіра іконка, назва й підказка dim, замок праворуч; тап хитає
// картку й каже, як її відкрити (onLocked). progress — рисочки квізу «1 / 4».
// unlocking — момент «Відкрито!»: замок відлітає, іконка наливається
// кольором, дві іскри й зелений ярлик.
function HubCard({ Icon, title, hint, locked, unlocking, badge = 0, progress, onPress, onLocked, shake, reduced, testID, t }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const fly = useRef(new Animated.Value(locked ? 0 : 1)).current;
  const [flying, setFlying] = useState(false);
  useEffect(() => {
    if (!unlocking) return undefined;
    setFlying(true);
    fly.setValue(0);
    const anim = Animated.timing(fly, { toValue: 1, duration: reduced ? DUR.micro : 320, easing: EASE.out, useNativeDriver: true });
    anim.start(() => setFlying(false));
    return () => anim.stop();
  }, [unlocking]);
  const showLock = locked || flying;
  const lockStyle = flying
    ? {
        opacity: fly.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: reduced
          ? []
          : [
              { translateX: fly.interpolate({ inputRange: [0, 1], outputRange: [0, 8] }) },
              { translateY: fly.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              { rotate: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-24deg'] }) },
            ],
      }
    : null;
  // іконка «наливається» кольором: акцентна плитка проявляється над сірою
  const tint = flying ? fly : locked ? 0 : 1;
  return (
    <Animated.View style={{ transform: [{ translateX: shake }] }}>
      <Pressable
        onPress={locked ? onLocked : onPress}
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${hint}`}
        accessibilityState={{ disabled: !!locked }}
        testID={testID}
        style={({ pressed }) => [{ transform: [{ scale: pressed && !locked && !reduced ? 0.98 : 1 }] }]}
      >
        <View style={[s.hubCard, SHADOW, unlocking && s.hubCardOpen]}>
          <View style={s.hubIconWrap}>
            <View style={[StyleSheet.absoluteFill, s.hubIconLocked]} />
            <Animated.View style={[StyleSheet.absoluteFill, s.hubIconOpen, { opacity: tint }]} />
            <View>
              <Icon size={26} color={locked && !flying ? C.faint : C.accent} />
            </View>
            {unlocking ? (
              <>
                <View style={s.sparkA} pointerEvents="none">
                  <IcSparkle size={14} color={C.accent} />
                </View>
                <View style={s.sparkB} pointerEvents="none">
                  <IcSparkle size={11} color={C.accent} />
                </View>
              </>
            ) : null}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[s.hubCardTitle, locked && { color: C.dim }]}>{title}</Text>
            <Text style={s.hubCardHint}>{hint}</Text>
            {progress ? (
              <View style={s.dashes} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" testID="quiz-progress">
                {Array.from({ length: progress.need }, (_, i) => (
                  <View key={i} testID={i < progress.have ? 'dash-on' : 'dash-off'} style={[s.dash, { backgroundColor: i < progress.have ? C.accent : C.card3 }]} />
                ))}
              </View>
            ) : null}
          </View>
          {showLock ? (
            <Animated.View style={[s.lock, lockStyle]} testID={testID + '-lock'}>
              <IcLock size={16} color={C.dim} />
            </Animated.View>
          ) : (
            <>
              {badge ? (
                <View style={s.dueBadge}>
                  <Text style={s.dueBadgeText}>{badge}</Text>
                </View>
              ) : null}
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <IcChevron color={C.faint} />
              </View>
            </>
          )}
          {unlocking ? (
            <FadeIn dy={4} style={s.unlockedWrap}>
              <View style={s.unlocked} testID="learn-unlocked">
                <Text style={s.unlockedText}>{t('learnUnlocked')}</Text>
              </View>
            </FadeIn>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ─── «Як отримати перше слово» ──────────────────────────────────────────────
// Два шляхи до першого слова: зберегти слово дня (головна кнопка) або
// сканувати. Слова дня немає (офлайн при першому запуску) — кажемо, що воно
// зʼявиться; сканів немає й не Pro — замість «Сканувати» тихий рядок про Pro.
function HowToGetWord({ wordOfDay, wodSaved, onSaveWod, canScan, onGoScan, onScanPro, glow, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.how, glow && s.howGlow]} testID="learn-how">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Mascot pose="wave" size={54} />
        <View style={{ flex: 1 }}>
          <Text style={s.howTitle} accessibilityRole="header">
            {t('learnHowTitle')}
          </Text>
          <Text style={s.howText}>{t('learnHowText')}</Text>
        </View>
      </View>
      {wordOfDay ? null : <Text style={s.howNote}>{t('learnNoWod')}</Text>}
      <View style={s.howBtns}>
        {wordOfDay && !wodSaved && onSaveWod ? <HowBtn primary title={t('learnSaveWod')} onPress={onSaveWod} /> : null}
        {canScan ? (
          onGoScan ? <HowBtn Icon={IcScan} title={t('learnGoScan')} onPress={onGoScan} /> : null
        ) : onScanPro ? (
          <Pressable onPress={onScanPro} style={s.scanPro} accessibilityRole="button" hitSlop={{ top: 6, bottom: 6 }}>
            <PCrown size={14} color={C.accent} />
            <Text style={s.scanProText}>{t('learnScanPro')}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function HowBtn({ title, onPress, primary, Icon }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Press onPress={onPress} style={s.howBtnWrap} scaleTo={0.97}>
      <View style={[s.howBtn, primary ? [{ backgroundColor: C.accent }, SHADOW_SM] : { backgroundColor: C.card2 }]}>
        {Icon ? <Icon size={18} color={C.text} /> : null}
        <Text style={[s.howBtnText, { color: primary ? C.onAccent : C.text }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
          {title}
        </Text>
      </View>
    </Press>
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
    // Висота рядка = висоті заголовка: він стоїть там само, як на інших
    // вкладках, а пігулка PRO чи маскот центруються відносно нього.
    hubHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 37, marginBottom: 18, gap: 10 },
    headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    bigTitle: { color: C.text, ...type(22, F.bold), marginTop: 14, textAlign: 'center' },
    dimText: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8 },
    note: { color: C.dim, ...type(13, F.reg), textAlign: 'center', marginTop: 6 },

    hubCard: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 12,
      // рамка є завжди (прозора), щоб «Відкрито!» не зсував вміст
      borderWidth: 2,
      borderColor: 'transparent',
    },
    hubCardOpen: { borderColor: C.accent },
    hubIconWrap: {
      width: 48,
      height: 48,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    hubIconLocked: { borderRadius: 12, backgroundColor: C.card2 },
    hubIconOpen: { borderRadius: 12, backgroundColor: C.accentSoft },
    sparkA: { position: 'absolute', top: -7, left: -6 },
    sparkB: { position: 'absolute', bottom: -4, left: -8 },
    lock: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
    dashes: { flexDirection: 'row', gap: 6, marginTop: 8 },
    dash: { width: 22, height: 4, borderRadius: 2 },
    unlockedWrap: { position: 'absolute', top: -12, right: 14 },
    // зелений — колір успіху; текст на ньому — як на акценті (білий / темний)
    unlocked: { backgroundColor: C.green, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 3 },
    unlockedText: { color: C.onAccent, ...type(12, F.extra, { noLead: true }) },

    how: { backgroundColor: C.card, borderRadius: R.xl, padding: 16, gap: 14, borderWidth: 2, borderColor: 'transparent', marginBottom: 12 },
    howGlow: { borderColor: C.accent },
    howTitle: { color: C.text, ...type(17, F.extra) },
    howText: { color: C.dim, ...type(14, F.reg), marginTop: 2 },
    howNote: { color: C.dim, ...type(13, F.semi), textAlign: 'center' },
    howBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    howBtnWrap: { flexGrow: 1 },
    howBtn: { minHeight: 46, borderRadius: R.md, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    howBtnText: { ...type(15, F.extra, { noLead: true }), flexShrink: 1 },
    scanPro: { flexGrow: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
    scanProText: { color: C.accent, ...type(15, F.bold, { noLead: true }) },
    tip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.card2, borderRadius: R.lg, paddingHorizontal: 16, paddingVertical: 13, borderWidth: 2, borderColor: 'transparent', marginBottom: 12 },
    tipGlow: { borderColor: C.accent },
    tipText: { color: C.dim, ...type(14, F.reg), flex: 1 },
    glowRing: { position: 'absolute', borderWidth: 2, borderColor: C.accent, borderRadius: R.xl + 3 },
    // WordOfDayCard тримає під собою відступ 12 — кільце обводить саму картку
    wodRing: { top: -3, left: -3, right: -3, bottom: 9 },
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
    tapHint: { color: C.dim, ...type(12, F.reg), position: 'absolute', bottom: 18 },
    backWordRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
    backWord: { color: C.dim, ...type(17, F.semi), textAlign: 'center', flexShrink: 1 },
    backSpeak: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card2 },
    cardTranslation: { color: C.text, ...type(28, F.bold), textAlign: 'center' },
    exampleBox: { marginTop: 24, backgroundColor: C.card2, borderRadius: R.md, padding: 14, alignSelf: 'stretch' },
    example: { color: C.text, ...type(15, F.reg), textAlign: 'center' },
    exampleTr: { color: C.dim, ...type(13, F.reg), marginTop: 6, textAlign: 'center' },
    answerRow: { flexDirection: 'row', gap: 12 },
    answerBtn: { flex: 1, paddingVertical: 16, borderRadius: R.md, alignItems: 'center' },
    answerText: { color: C.text, ...type(17, F.semi, { noLead: true }) },
  });
