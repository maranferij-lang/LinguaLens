// Онбординг 2.0: біль → «тебе зрозуміли» → персональний план → «вау» →
// обіцянка → пейвол (його показує App — див. OnboardingPaywall.js).
//
// Повний варіант ('control'): вітання → імʼя → цілі → сфера (лише для
// роботи чи навчання) → рівень → що заважає → план → перший скан →
// сповіщення → звідки дізнались → обіцянка. Короткий ('short', прапорець
// PostHog onboarding-flow) — без імені, «що заважає» й обіцянки. Варіант
// береться один раз на старті й не міняється до кінця: інакше людина
// посеред шляху опинилась би в іншому експерименті.
//
// Повтор із Параметрів: імʼя → цілі → сфера → рівень → що заважає → план
// (і сповіщення — лише якщо про них ще не питали). Без скану, обіцянки й
// пейволу: людина прийшла поправити відповіді, а не знайомитись.
//
// Кожне питання можна пропустити, до кожного кроку — повернутись.
// «Пропустити» лишає відповідь такою, якою вона була до кроку: у новачка —
// порожньою, у повторі — попередньою. Профіль складає profileFromAnswers:
// пропущено все — профіль не міняється.
//
// Імʼя не виходить за межі телефона: у результаті воно йде лише в App
// (settings.profileName), у статистику — тільки «вказав / пропустив».
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Image, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { FadeIn, GradBtn } from './ui';
import { DEFAULT_HOUR, permissionStatus, requestPermission } from './wordOfDay';
import { LogoRow } from './Logo';
import { MascotBob } from './Mascot';
import {
  DEFAULT_LEVEL,
  FIELDS,
  GOALS,
  HEARD,
  clampLevel,
  cleanName,
  cleanStruggles,
  needsField,
  primaryTopic,
  profileFromAnswers,
  studyOnly,
  topicName,
} from './profile';
import {
  FieldOptions,
  GoalOptions,
  HeardOptions,
  LangPill,
  LevelBody,
  NameField,
  SkipButton,
  StepFrame,
  StruggleOptions,
} from './ProfileSteps';
import { FirstWord, HERO, PlanBody, PushPreview, WowHero, hourLabel } from './OnboardingParts';
import HoldToCommit from './HoldToCommit';
import LangSheet from './LangSheet';
import { flag, track } from './analytics';
import { F, R, type, useTheme } from './theme';

// Скільки чекати на прапорець варіанта (див. analytics.flag): довше —
// людина вже тисне «Почати», і ми не тримаємо її.
export const FLAG_WAIT_MS = 1500;
// Пауза після обіцянки: «Домовились!» має встигнути прозвучати.
export const COMMIT_PAUSE_MS = 900;

// Кроки в порядку показу. variant — 'control' | 'short'; replay — повтор із
// Параметрів; wow — чи є що показати на «Спробуй зараз» (перший запуск,
// словник порожній, безкоштовний скан ще не витрачено); push — чи про
// сповіщення ще не питали.
export function onboardingFlow({ variant = 'control', goals = [], replay = false, wow = false, push = false } = {}) {
  const field = needsField(goals) ? ['field'] : [];
  if (replay) return ['name', 'goals', ...field, 'level', 'struggles', 'plan', ...(push ? ['push'] : [])];
  const full = variant !== 'short';
  return [
    'welcome',
    ...(full ? ['name'] : []),
    'goals',
    ...field,
    'level',
    ...(full ? ['struggles'] : []),
    'plan',
    ...(wow ? ['wow'] : []),
    ...(push ? ['push'] : []),
    'heard',
    ...(full ? ['commit'] : []),
  ];
}

// Чернетка з минулого запуску (див. loadOnboardingDraft у storage.js) →
// крок, варіант і відповіді. Зіпсована чи не з цього потоку — null:
// тоді просто починаємо спочатку.
export function restoreDraft(d) {
  if (!d || typeof d !== 'object' || typeof d.phase !== 'string') return null;
  const variant = d.variant === 'short' ? 'short' : 'control';
  const goals = Array.isArray(d.goals) ? GOALS.filter((g) => d.goals.includes(g)) : [];
  const all = onboardingFlow({ variant, goals, wow: true, push: true });
  const step = d.phase === 'pushDenied' ? 'push' : d.phase;
  if (step === 'welcome' || !all.includes(step)) return null;
  return {
    phase: d.phase,
    variant,
    name: cleanName(d.name),
    goals,
    field: FIELDS.includes(d.field) ? d.field : null,
    level: typeof d.level === 'number' && Number.isFinite(d.level) ? clampLevel(d.level) : null,
    struggles: cleanStruggles(d.struggles),
    heard: HEARD.includes(d.heard) ? d.heard : null,
    push: typeof d.push === 'boolean' ? d.push : undefined,
  };
}

// profile, heardFrom, name, struggles — поточні відповіді (повтор показує їх);
// targetLang — мова, яку вчать (над питанням про рівень і в обіцянці);
// wodHour — о котрій приходитиме слово дня (у попередньому перегляді);
// canWow — чи можна зробити перший скан; renderScanner({ onSaved, onClose })
// — справжній сканер у режимі першого скану (його збирає App).
// draft — чернетка з минулого запуску: знайомство продовжується з того
// самого кроку; onDraft(чернетка) — на кожному кроці, App її зберігає.
// onSetLang(code) — змінити мову, яку вчать, просто на кроці рівня (мову
// за замовчуванням ми лише вгадали з телефону); App зберігає її, і нова
// targetLang приходить сюди ж — у пігулку, план, обіцянку й перший скан.
// Без onSetLang (і в повторі) пігулка — просто підпис. nativeLang — мова
// перекладів: у переліку мов її немає.
// onDone({ profile, heardFrom, name?, struggles?, wodEnabled?, scanned, flow }).
export default function OnboardingScreen({
  t,
  onDone,
  profile = null,
  heardFrom = null,
  name = '',
  struggles = [],
  targetLang = 'en',
  nativeLang = null,
  onSetLang = null,
  wodHour = DEFAULT_HOUR,
  replay = false,
  canWow = false,
  renderScanner = null,
  draft = null,
  onDraft = null,
}) {
  const { C, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const startedAt = useRef(Date.now());
  // Чернетка — лише для першого знайомства: повтор починається з того, що
  // вже збережено в налаштуваннях.
  const [saved] = useState(() => (replay ? null : restoreDraft(draft)));

  // Відповіді до онбордингу — до них повертає «Пропустити».
  const initial = useRef({
    name: cleanName(name),
    goals: profile?.goals || [],
    field: profile?.field || null,
    level: profile ? profile.level : null,
    struggles: cleanStruggles(struggles),
    heard: heardFrom || null,
  }).current;

  // «Пропустити» й далі вертає до відповідей до онбордингу, а не до чернетки
  const answers = saved || initial;
  const [nameDraft, setNameDraft] = useState(answers.name);
  const [goals, setGoals] = useState(answers.goals);
  const [field, setField] = useState(answers.field);
  // null — рівень не обрано (крок пропущено); слайдер тоді стоїть посередині
  const [level, setLevel] = useState(answers.level);
  const [pains, setPains] = useState(answers.struggles);
  const [heard, setHeard] = useState(answers.heard);

  // ── Варіант (A/B) ───────────────────────────────────────────────────────
  // Прапорець питаємо одразу, поки людина читає вітання; «Почати» дочекається
  // його (не довше FLAG_WAIT_MS від старту), щоб варіант не змінився посеред шляху.
  // Варіант із чернетки не перепитуємо: людина вже посеред свого шляху.
  const [variant, setVariant] = useState(replay ? 'replay' : saved ? saved.variant : null);
  const variantP = useRef(saved ? Promise.resolve(saved.variant) : null);
  useEffect(() => {
    if (replay || saved) return;
    let alive = true;
    variantP.current = flag('onboarding-flow', 'control', FLAG_WAIT_MS)
      .then((v) => (v === 'short' ? 'short' : 'control'))
      .catch(() => 'control');
    variantP.current.then((v) => alive && setVariant(v));
    return () => {
      alive = false;
    };
  }, []);

  // ── Сповіщення: питаємо, лише якщо ще не питали ─────────────────────────
  const [pushAsk, setPushAsk] = useState(false);
  // Відповідь системи на запит. Ref, а не стан: фінал може настати в тому ж
  // тіку, що й відповідь (сповіщення — останній крок повтору).
  const pushGranted = useRef(saved ? saved.push : undefined);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    permissionStatus()
      .then((st) => alive && setPushAsk(st === 'undetermined'))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // З чернетки — той самий крок. «Спробуй зараз», якого вже не буде (слово
  // є чи безкоштовний скан витрачено), — крок перед ним, план.
  const [phase, setPhase] = useState(() => {
    if (replay) return 'name';
    if (!saved) return 'welcome';
    return saved.phase === 'wow' && !(canWow && renderScanner) ? 'plan' : saved.phase;
  });
  const [scannerOpen, setScannerOpen] = useState(false);
  // Аркуш «Яку мову вчиш?» з кроку рівня
  const [langOpen, setLangOpen] = useState(false);
  const canSetLang = !replay && typeof onSetLang === 'function';
  const [firstWord, setFirstWord] = useState(null);
  const firstWordRef = useRef(null);
  // Крок, над яким показуємо «Перше слово вже у словнику» (той, що після скану)
  const [cheerAt, setCheerAt] = useState(null);
  const pause = useRef(null);
  useEffect(() => () => clearTimeout(pause.current), []);

  const flowName = variant === 'short' ? 'short' : 'control';
  function flowWith(over = {}) {
    return onboardingFlow({
      variant: over.variant || flowName,
      goals: over.goals || goals,
      replay,
      wow: over.wow ?? (!!canWow && !!renderScanner),
      push: pushAsk,
    });
  }
  const flow = flowWith();
  const at = phase === 'pushDenied' ? 'push' : phase;
  const steps = flow.filter((k) => k !== 'welcome');

  // ── Статистика: кожен показаний крок (у повторі — ні: це не воронка) ────
  // Вітання рахуємо, щойно відомий варіант; якщо прапорець прийшов лише
  // після «Почати», його надсилає start() — і лише один раз.
  const welcomeSent = useRef(!!saved);
  function trackStep(step, v, f = flow) {
    if (step === 'welcome') {
      if (welcomeSent.current) return;
      welcomeSent.current = true;
    }
    const k = step === 'pushDenied' ? 'push' : step;
    track('onboarding_step', {
      step: step === 'pushDenied' ? 'push_denied' : step,
      index: f.indexOf(k) + 1,
      total: f.length,
      flow: v,
    });
  }
  useEffect(() => {
    if (replay || !variant) return;
    trackStep(phase, variant);
  }, [phase, variant]);

  // Чернетка на кожному кроці (див. restoreDraft): iOS може вбити
  // застосунок посеред знайомства — зокрема коли в Параметрах міняють
  // доступ до камери, — і людина не має відповідати на все вдруге.
  useEffect(() => {
    if (replay || !onDraft || !variant || phase === 'welcome') return;
    onDraft({
      phase,
      variant: flowName,
      name: nameDraft,
      goals,
      field,
      level,
      struggles: pains,
      heard,
      push: pushGranted.current,
    });
  }, [phase, variant]);

  function event(name, props) {
    if (!replay) track(name, { ...props, flow: flowName });
  }

  function go(next) {
    setPhase(next);
  }

  // Далі за потоком; останній крок — фінал. Таймери й слухачі кличуть
  // найсвіжішу версію через ref: їхнє замикання бачило б старі відповіді.
  const forwardRef = useRef(null);
  forwardRef.current = (from) => forward(from);
  // Наступний — за повним порядком кроків: тоді й крок із чернетки, якого в
  // потоці вже немає (про сповіщення система вже знає), веде далі, а не
  // одразу у фінал.
  function forward(from = phase, over) {
    const f = flowWith(over);
    const all = onboardingFlow({
      variant: over?.variant || flowName,
      goals: over?.goals || goals,
      replay,
      wow: true,
      push: true,
    });
    const i = all.indexOf(from === 'pushDenied' ? 'push' : from);
    const nextStep = i < 0 ? null : all.slice(i + 1).find((k) => f.includes(k));
    if (!nextStep) {
      finish();
      return;
    }
    go(nextStep);
  }

  // «Далі» на кроці-питанні: легкий відгук і відповідь у статистику
  function next(answer) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (answer !== undefined) event('onboarding_answer', { step: phase, value: answer });
    forward();
  }

  function back() {
    Haptics.selectionAsync();
    event('onboarding_back', { step: phase });
    if (phase === 'pushDenied') {
      go('push');
      return;
    }
    const i = flow.indexOf(phase);
    if (i > 0) go(flow[i - 1]);
  }

  // «Пропустити»: відповідь цього кроку — як була до онбордингу
  function skip() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    event('onboarding_skip', { step: phase });
    if (phase === 'name') {
      setNameDraft(initial.name);
      event('onboarding_answer', { step: 'name', value: 'skipped' });
    }
    if (phase === 'goals') setGoals(initial.goals);
    if (phase === 'field') setField(initial.field);
    if (phase === 'level') setLevel(initial.level);
    if (phase === 'struggles') setPains(initial.struggles);
    if (phase === 'heard') setHeard(initial.heard);
    // без цілей роботи чи навчання кроку сфери немає — рахуємо від нового списку
    forward(phase, phase === 'goals' ? { goals: initial.goals } : undefined);
  }

  async function start() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const v = (await variantP.current) || 'control';
    const f = flowWith({ variant: v });
    trackStep('welcome', v, f);
    setVariant(v);
    go(f[1]);
  }

  function result() {
    const out = {
      profile: profileFromAnswers({ goals, field, level }, profile),
      heardFrom: heard,
      scanned: !!firstWordRef.current,
      flow: variant || 'control',
    };
    // Імʼя й «що заважає» — лише якщо ці кроки були в потоці
    if (flow.includes('name')) out.name = cleanName(nameDraft);
    if (flow.includes('struggles')) out.struggles = cleanStruggles(pains);
    if (typeof pushGranted.current === 'boolean') out.wodEnabled = pushGranted.current;
    return out;
  }

  function finish() {
    const r = result();
    if (!replay) {
      track('onboarding_complete', {
        flow: flowName,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
        scanned: r.scanned,
        push: typeof pushGranted.current === 'boolean' ? pushGranted.current : null,
      });
    }
    onDone(r);
  }

  // ── Сповіщення ──────────────────────────────────────────────────────────
  // Системний запит — лише з кнопки «Далі» на нашому екрані (App Review
  // 5.1.1(iv): кнопку перед запитом не можна підписувати «Дозволити»).
  async function askPush() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setBusy(true);
    const granted = await requestPermission();
    setBusy(false);
    pushGranted.current = granted;
    track('push_permission', { granted, source: replay ? 'replay' : 'onboarding' });
    if (granted) forward('push');
    else go('pushDenied');
  }

  function pickLang(code) {
    setLangOpen(false);
    if (code !== targetLang) onSetLang(code);
  }

  function openSettings() {
    Haptics.selectionAsync();
    try {
      Promise.resolve(Linking.openSettings()).catch(() => {});
    } catch (_) {}
  }

  // Людина пішла в Параметри й увімкнула сповіщення — повернулась, і ми
  // вже знаємо: не тримаємо її на екрані «а може, все ж увімкнеш».
  useEffect(() => {
    if (phase !== 'pushDenied') return;
    const sub = AppState.addEventListener?.('change', (st) => {
      if (st !== 'active') return;
      permissionStatus().then((p) => {
        if (p !== 'granted') return;
        pushGranted.current = true;
        forwardRef.current('pushDenied');
      });
    });
    return () => sub?.remove?.();
  }, [phase]);

  // ── Перший скан ─────────────────────────────────────────────────────────
  function openScanner() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setScannerOpen(true);
  }

  function scannerDone(word) {
    setScannerOpen(false);
    // Щойно збережене слово вже прибрало «Спробуй зараз» з потоку (словник
    // не порожній) — наступний крок рахуємо так, ніби він ще там.
    const f = flowWith({ wow: true });
    const i = f.indexOf('wow');
    const nextStep = i >= 0 && i < f.length - 1 ? f[i + 1] : null;
    if (word) {
      firstWordRef.current = word;
      setFirstWord(word);
      setCheerAt(nextStep);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    if (nextStep) go(nextStep);
    else finish();
  }

  // ── Обіцянка ────────────────────────────────────────────────────────────
  function committed() {
    clearTimeout(pause.current);
    pause.current = setTimeout(() => forwardRef.current('commit'), COMMIT_PAUSE_MS);
  }

  // ═══ Рендер ═════════════════════════════════════════════════════════════
  if (phase === 'welcome') {
    return (
      <View style={s.root}>
        <LogoRow size={28} style={s.logo} />
        <View style={s.hero}>
          <FadeIn style={{ alignItems: 'center' }}>
            <Image source={isDark ? HERO.dark : HERO.light} style={s.heroImg} accessibilityIgnoresInvertColors />
            <Text style={s.heroTitle} accessibilityRole="header">
              {t('obHookTitle')}
            </Text>
            <Text style={s.heroText}>{t('obHookText')}</Text>
          </FadeIn>
        </View>
        <View style={s.heroFooter}>
          <GradBtn title={t('obStart')} onPress={start} />
        </View>
      </View>
    );
  }

  if (scannerOpen && renderScanner) {
    return renderScanner({
      onSaved: (w) => scannerDone(w || null),
      onClose: () => scannerDone(null),
      level: profileFromAnswers({ goals, field, level }, profile)?.level,
    });
  }

  const index = steps.indexOf(at);
  const last = flow.indexOf(at) === flow.length - 1;
  const nextTitle = last ? t('obFinish') : t('obNext');
  const frame = {
    stepKey: phase,
    progress: { step: index + 1, total: steps.length },
    onBack: flow.indexOf(at) > 0 ? back : null,
    right: QUESTIONS.includes(phase) ? <SkipButton onPress={skip} t={t} /> : <SkipButton hidden t={t} />,
    header: cheerAt === phase && firstWord ? <FirstWord word={firstWord} t={t} /> : null,
    t,
  };
  const profileNow = profileFromAnswers({ goals, field, level }, profile);
  const shownName = cleanName(nameDraft);

  let body = null;
  let footer = null;
  let title = '';
  let text = null;

  if (phase === 'name') {
    title = t('obNameTitle');
    text = t('obNameText');
    body = (
      <NameField
        value={nameDraft}
        onChange={setNameDraft}
        onSubmit={() => shownName && next('given')}
        label={t('obNameTitle')}
        t={t}
      />
    );
    footer = <GradBtn title={nextTitle} onPress={() => next('given')} disabled={!shownName} />;
  } else if (phase === 'goals') {
    title = t('pfGoalsTitle');
    text = t('pfGoalsText');
    body = <GoalOptions value={goals} onChange={setGoals} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(goals)} disabled={!goals.length} />;
  } else if (phase === 'field') {
    title = studyOnly(goals) ? t('pfFieldTitleStudy') : t('pfFieldTitle');
    text = t('pfFieldText');
    body = <FieldOptions value={field} onChange={setField} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(field)} disabled={!field} />;
  } else if (phase === 'level') {
    title = t('pfLevelTitle');
    text = t('pfLevelText');
    frame.header = frame.header || (
      <LangPill code={targetLang} onPress={canSetLang ? () => setLangOpen(true) : undefined} t={t} />
    );
    body = <LevelBody value={level ?? DEFAULT_LEVEL} onChange={setLevel} lang={targetLang} t={t} />;
    // «Далі» — згода з тим, що на слайдері, навіть якщо його не чіпали
    footer = (
      <GradBtn
        title={nextTitle}
        onPress={() => {
          const v = level ?? DEFAULT_LEVEL;
          setLevel(v);
          next(v);
        }}
      />
    );
  } else if (phase === 'struggles') {
    title = t('obStrugglesTitle');
    text = t('obStrugglesText');
    body = <StruggleOptions value={pains} onChange={setPains} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(pains)} disabled={!pains.length} />;
  } else if (phase === 'plan') {
    title = shownName ? t('obPlanTitleName', { name: shownName }) : t('obPlanTitle');
    body = <PlanBody profile={profileNow} struggles={flow.includes('struggles') ? pains : []} lang={targetLang} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next()} />;
  } else if (phase === 'wow') {
    title = t('obWowTitle');
    text = t('obWowText');
    body = <WowHero />;
    footer = (
      <View style={{ gap: 4 }}>
        <GradBtn title={t('obWowOpen')} onPress={openScanner} />
        <Pressable
          style={s.later}
          onPress={() => {
            event('onboarding_skip', { step: 'wow' });
            next();
          }}
          accessibilityRole="button"
        >
          <Text style={s.laterText}>{t('obWowLater')}</Text>
        </Pressable>
      </View>
    );
  } else if (phase === 'push') {
    const topic = topicName(t, primaryTopic(profileNow));
    const key = primaryTopic(profileNow);
    // як покаже сам iPhone: «10:00» чи «10:00 AM» — за мовою телефону
    const hour = hourLabel(wodHour);
    title = t('obPushTitle');
    text = key ? t('notifTextTopic', { h: hour, topic: t('topicIn_' + key) }) : t('notifText');
    body = <PushPreview topic={topic} hour={hour} t={t} />;
    // Єдина кнопка — «Далі»: системне вікно саме спитає «дозволити?»
    footer = <GradBtn title={t('obNext')} onPress={askPush} disabled={busy} />;
  } else if (phase === 'pushDenied') {
    title = t('obPushDeniedTitle');
    text = t('obPushDeniedText');
    body = (
      <View style={{ alignItems: 'center', marginTop: 8 }}>
        <MascotBob pose="think" size={170} />
      </View>
    );
    // Людина щойно сказала «ні» — не виштовхуємо її в Параметри посеред
    // знайомства: головна дія — далі, Параметри — тихий другий варіант.
    footer = (
      <View style={{ gap: 4 }}>
        <GradBtn title={nextTitle} onPress={() => next()} />
        <Pressable style={s.later} onPress={openSettings} accessibilityRole="button">
          <Text style={s.laterText}>{t('openSettings')}</Text>
        </Pressable>
      </View>
    );
  } else if (phase === 'heard') {
    title = t('pfHeardTitle');
    text = t('pfHeardText');
    body = <HeardOptions value={heard} onChange={setHeard} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(heard)} disabled={!heard} />;
  } else if (phase === 'commit') {
    const lang = t('langAcc_' + targetLang);
    title = t('obCommitTitle');
    body = (
      <View style={{ alignItems: 'center' }}>
        <Text style={s.pledge}>{shownName ? t('obCommitName', { name: shownName, lang }) : t('obCommitText', { lang })}</Text>
        <View style={{ marginTop: 30 }}>
          <HoldToCommit
            onCommit={committed}
            label={t('obCommitA11y')}
            holdHint={t('obCommitHold')}
            tapHint={t('obCommitTap')}
            longerHint={t('holdLonger')}
            doneText={t('obCommitDone')}
          />
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StepFrame {...frame} title={title} text={text} footer={footer}>
        {body}
      </StepFrame>
      {canSetLang ? (
        <LangSheet
          visible={langOpen && phase === 'level'}
          current={targetLang}
          native={nativeLang}
          onPick={pickLang}
          onClose={() => setLangOpen(false)}
          t={t}
        />
      ) : null}
    </KeyboardAvoidingView>
  );
}

// Кроки-питання: на них є «Пропустити»
const QUESTIONS = ['name', 'goals', 'field', 'level', 'struggles', 'heard'];

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    logo: { position: 'absolute', top: 18, left: 20, zIndex: 10 },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: 40 },
    heroImg: { width: 264, height: 264, borderRadius: 36, marginBottom: 28 },
    heroTitle: { color: C.text, ...type(28, F.extra), textAlign: 'center', maxWidth: 340 },
    heroText: { color: C.dim, ...type(16, F.reg), textAlign: 'center', marginTop: 12, maxWidth: 320 },
    heroFooter: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
    later: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    laterText: { color: C.dim, ...type(16, F.bold, { noLead: true }) },
    pledge: {
      color: C.text,
      ...type(24, F.extra),
      textAlign: 'center',
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 20,
      paddingVertical: 18,
      overflow: 'hidden',
    },
  });
