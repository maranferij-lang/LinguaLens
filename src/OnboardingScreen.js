// Онбординг: 3 свайп-екрани → для чого вчиш → чим займаєшся (лише для
// роботи чи навчання) → рівень → звідки дізнались → дозвіл на сповіщення.
//
// Кожен крок можна пропустити й до кожного повернутись. «Пропустити» лишає
// відповідь такою, якою вона була до кроку: у новачка — порожньою, у повторі
// з Параметрів — попередньою (повтор показує поточні відповіді). Профіль
// складає profileFromAnswers: пропущено все — профіль не міняється.
import { useMemo, useRef, useState } from 'react';
import { Dimensions, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { FadeIn, GradBtn } from './ui';
import { MascotBob } from './Mascot';
import { DEFAULT_HOUR, requestPermission } from './wordOfDay';
import { LogoRow } from './Logo';
import { DEFAULT_LEVEL, primaryTopic, profileFromAnswers, studyOnly } from './profile';
import { FieldOptions, GoalOptions, HeardOptions, LangPill, LevelBody, SkipButton, StepFrame, profileSteps } from './ProfileSteps';
import { IcChevron } from './icons';
import { F, useTheme } from './theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  { img: require('../assets/onb-1.png'), title: 'ob1t', desc: 'ob1d' },
  { img: require('../assets/onb-2.png'), title: 'ob2t', desc: 'ob2d' },
  { img: require('../assets/onb-3.png'), title: 'ob3t', desc: 'ob3d' },
];

// profile, heardFrom — поточні відповіді (повтор з Параметрів показує їх);
// targetLang — мова, яку вчать (її назва над питанням про рівень);
// wodHour — о котрій приходитиме слово дня (у тексті запиту на сповіщення).
// onDone({ wodEnabled, profile, heardFrom }).
export default function OnboardingScreen({ t, onDone, profile = null, heardFrom = null, targetLang = 'en', wodHour = DEFAULT_HOUR }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [page, setPage] = useState(0);
  const [phase, setPhase] = useState('slides');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  // Відповіді до онбордингу — до них повертає «Пропустити».
  const initial = useRef({
    goals: profile?.goals || [],
    field: profile?.field || null,
    level: profile ? profile.level : null,
    heard: heardFrom || null,
  }).current;

  const [goals, setGoals] = useState(initial.goals);
  const [field, setField] = useState(initial.field);
  // null — рівень не обрано (крок пропущено); слайдер тоді стоїть посередині
  const [level, setLevel] = useState(initial.level);
  const [heard, setHeard] = useState(initial.heard);

  const steps = profileSteps(goals, { heard: true });
  const flow = [...steps, 'push'];

  function go(next) {
    setPhase(next);
  }

  function forward() {
    const i = flow.indexOf(phase);
    go(flow[Math.min(flow.length - 1, i + 1)]);
  }

  function back() {
    const i = flow.indexOf(phase);
    if (i <= 0) {
      // з першого питання — назад до останнього слайда
      setPage(SLIDES.length - 1);
      go('slides');
      return;
    }
    go(flow[i - 1]);
  }

  // «Пропустити»: відповідь цього кроку — як була до онбордингу
  function skip() {
    if (phase === 'goals') setGoals(initial.goals);
    if (phase === 'field') setField(initial.field);
    if (phase === 'level') setLevel(initial.level);
    if (phase === 'heard') setHeard(initial.heard);
    // без цілей роботи чи навчання кроку сфери немає — рахуємо від нового списку
    const nextGoals = phase === 'goals' ? initial.goals : goals;
    const nextFlow = [...profileSteps(nextGoals, { heard: true }), 'push'];
    const i = nextFlow.indexOf(phase);
    go(nextFlow[Math.min(nextFlow.length - 1, i + 1)]);
  }

  // «Далі» на рівні — згода з тим, що на слайдері, навіть якщо його не чіпали
  function acceptLevel() {
    setLevel(level ?? DEFAULT_LEVEL);
    forward();
  }

  function nextSlide() {
    if (page + 1 < SLIDES.length) {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      go('goals');
    }
  }

  function result(wodEnabled) {
    return {
      wodEnabled,
      profile: profileFromAnswers({ goals, field, level }, profile),
      heardFrom: heard,
    };
  }

  async function allowPush() {
    setBusy(true);
    const granted = await requestPermission();
    setBusy(false);
    onDone(result(granted));
  }

  // ── Крок дозволу на сповіщення ───────────────────────────────────────────
  // Дозвіл питаємо в кінці онбордингу, коли людина вже знає, за що платить
  // увагою. Системний діалог одразу на старті майже завжди отримує «ні».
  // Текст — під її відповіді: «Щодня о 10:00 — нове слово з фінансів».
  if (phase === 'push') {
    const topic = primaryTopic(profileFromAnswers({ goals, field, level }, profile));
    const hour = String(wodHour).padStart(2, '0') + ':00';
    return (
      <View style={[s.root, s.pushRoot]}>
        <Pressable
          style={s.pushBack}
          onPress={back}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('pfBack')}
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <IcChevron size={22} color={C.dim} />
          </View>
        </Pressable>
        <FadeIn style={{ alignItems: 'center' }}>
          <MascotBob pose="encourage" size={190} />
          <Text style={s.pushTitle}>{t('notifTitle')}</Text>
          <Text style={s.desc}>{topic ? t('notifTextTopic', { h: hour, topic: t('topicIn_' + topic) }) : t('notifText')}</Text>
        </FadeIn>
        <View style={{ alignSelf: 'stretch', marginTop: 32, gap: 6 }}>
          <GradBtn title={t('notifAllow')} onPress={allowPush} disabled={busy} />
          <Pressable style={s.later} onPress={() => onDone(result(false))} accessibilityRole="button">
            <Text style={s.laterText}>{t('notifSkip')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // ── Кроки профілю ────────────────────────────────────────────────────────
  if (phase !== 'slides') {
    const progress = { step: steps.indexOf(phase) + 1, total: steps.length };
    const frame = {
      stepKey: phase,
      progress,
      onBack: back,
      right: <SkipButton onPress={skip} t={t} />,
      t,
    };
    if (phase === 'goals') {
      return (
        <StepFrame
          {...frame}
          title={t('pfGoalsTitle')}
          text={t('pfGoalsText')}
          footer={<GradBtn title={t('obNext')} onPress={forward} disabled={!goals.length} />}
        >
          <GoalOptions value={goals} onChange={setGoals} t={t} />
        </StepFrame>
      );
    }
    if (phase === 'field') {
      return (
        <StepFrame
          {...frame}
          title={studyOnly(goals) ? t('pfFieldTitleStudy') : t('pfFieldTitle')}
          text={t('pfFieldText')}
          footer={<GradBtn title={t('obNext')} onPress={forward} disabled={!field} />}
        >
          <FieldOptions value={field} onChange={setField} t={t} />
        </StepFrame>
      );
    }
    if (phase === 'level') {
      return (
        <StepFrame
          {...frame}
          header={<LangPill code={targetLang} />}
          title={t('pfLevelTitle')}
          text={t('pfLevelText')}
          footer={<GradBtn title={t('obNext')} onPress={acceptLevel} />}
        >
          <LevelBody value={level ?? DEFAULT_LEVEL} onChange={setLevel} lang={targetLang} t={t} />
        </StepFrame>
      );
    }
    return (
      <StepFrame
        {...frame}
        title={t('pfHeardTitle')}
        text={t('pfHeardText')}
        footer={<GradBtn title={t('obNext')} onPress={forward} disabled={!heard} />}
      >
        <HeardOptions value={heard} onChange={setHeard} t={t} />
      </StepFrame>
    );
  }

  return (
    <View style={s.root}>
      <LogoRow size={28} style={{ position: 'absolute', top: 18, left: 20, zIndex: 10 }} />
      {/* Пропустити слайди, а не знайомство: питання про цілі й рівень
          однаково варто показати — кожне з них теж можна пропустити. */}
      <Pressable style={s.skip} onPress={() => go('goals')} accessibilityRole="button">
        <Text style={s.skipText}>{t('obSkip')}</Text>
      </Pressable>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        initialScrollIndex={page}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={{ width: W, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <FadeIn style={{ alignItems: 'center' }}>
              <Image source={item.img} style={s.img} />
              <Text style={s.title}>{t(item.title)}</Text>
              <Text style={s.desc}>{t(item.desc)}</Text>
            </FadeIn>
          </View>
        )}
      />

      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotActive]} />
        ))}
      </View>

      <View style={{ padding: 24, paddingBottom: 40 }}>
        <GradBtn title={page + 1 < SLIDES.length ? t('obNext') : t('obStart')} onPress={nextSlide} />
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    skip: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 8 },
    skipText: { color: C.faint, fontSize: 14, fontFamily: F.semi },
    img: { width: 250, height: 250, borderRadius: 32, marginBottom: 28 },
    title: { color: C.text, fontSize: 26, letterSpacing: -0.36, fontFamily: F.bold, textAlign: 'center' },
    desc: { color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 23, maxWidth: 300, fontFamily: F.reg },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.card3 },
    dotActive: { backgroundColor: C.accent, width: 22 },
    pushRoot: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
    pushBack: { position: 'absolute', top: 8, left: 12, width: 44, height: 44, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    pushTitle: { color: C.text, fontSize: 26, letterSpacing: -0.36, fontFamily: F.extra, textAlign: 'center', marginTop: 12 },
    later: { alignItems: 'center', paddingVertical: 14 },
    laterText: { color: C.faint, fontSize: 16, fontFamily: F.semi },
  });
