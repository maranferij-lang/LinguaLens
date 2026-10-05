// Онбординг 4.0 (onboarding.md, план §6 W3; правки власника 5.10.2026): три
// дії замість довгого переліку питань, смужка прогресу з трьох сегментів.
//
//   Дія 1 «Ти»: вітання (Лінго махає) → яку мову вчиш (згори — моя рідна,
//     знизу — та, яку вчу) → імʼя (Лінго визирає з-за кнопки й
//     знайомиться) → цілі → сфера (лише для роботи чи навчання) → рівень →
//     що заважає → звідки дізнались. Кроки-питання — без підзаголовків, з
//     Лінго поруч із заголовком.
//   Дія 2 «Як це працює»: що таке слово дня (картка-приклад) → коли
//     надсилати слово дня (лише якщо ще не питали; телефон у рамці зі
//     сповіщенням) → план (спершу «складаємо…» — справжній запит слова дня
//     під профіль, потім план зі словом на сьогодні) → живий вогник серії →
//     віджети (лише в iOS-збірці з віджетами).
//   Дія 3 «Спробуй»: демо-анімація скану (предмет, потім уся сцена) →
//     «Спробувати» (спершу згода на AI, потім справжній сканер) → свято з
//     наліпкою людини → обіцянка «натисни й тримай». Далі App показує
//     пейвол онбордингу (або ні — так каже metadata RevenueCat
//     onboarding_paywall).
//
// Короткий варіант ('short', прапорець PostHog onboarding-flow) — без імені
// й «що заважає». Варіант береться один раз на старті й не міняється до
// кінця: інакше людина посеред шляху опинилась би в іншому експерименті.
//
// Повтор із Параметрів («Пройти знайомство ще раз»): мова (лише без слів) →
// імʼя → цілі → сфера → рівень → що заважає → слово дня → сповіщення (лише
// якщо не питали) → план → серія → віджети → демо без скану, «Готово». Без
// «звідки дізнались», обіцянки й пейвола; відповіді — поточні з Параметрів.
//
// Перший запуск нічого не підставляє з налаштувань (вони могли лишитись від
// перерваного запуску): відповіді порожні, мову навчання не обрано. Чернетка
// (storage.js, формат v3) відновлює крок і відповіді лише впродовж 15 хвилин.
//
// Кожне питання можна пропустити, до кожного кроку — повернутись. Питання з
// одним варіантом (мова, сфера, «звідки») переходять далі самі за AUTO_MS;
// з VoiceOver — ні, там є «Далі». Новий крок заїжджає справа, попередній —
// зліва; з «Менше руху» — лише зміна прозорості.
//
// Імʼя не виходить за межі телефона: у результаті воно йде лише в App
// (settings.profileName), у статистику — тільки «вказав / пропустив».
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { FadeIn, GradBtn } from './ui';
import { DEFAULT_HOUR, permissionStatus, requestPermission } from './wordOfDay';
import { AppIcon } from './Logo';
import { MascotBob, MascotLive } from './Mascot';
import {
  DEFAULT_LEVEL,
  FIELDS,
  GOALS,
  HEARD,
  cefrFor,
  clampLevel,
  cleanName,
  cleanStruggles,
  needsField,
  planTopics,
  primaryTopic,
  profileFromAnswers,
  studyOnly,
  topicName,
} from './profile';
import {
  BODY_PAD,
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
import {
  HourChips,
  LingoBubble,
  NameLingo,
  PUSH_HOURS,
  PlanBody,
  PlanBuilding,
  PledgeCard,
  PushPreview,
  TodayCard,
  WelcomeHero,
  WodExample,
  hourLabel,
  lockClock,
  phoneVisible,
} from './OnboardingParts';
import HoldToCommit from './HoldToCommit';
import LangSheet, { LangList } from './LangSheet';
import StreakShowcase from './StreakShowcase';
import ScanDemo from './ScanDemo';
import Celebrate, { CELEBRATE_NEXT_MS } from './Celebrate';
import ConsentSheet from './ConsentSheet';
import { WidgetPreview } from './widgets/WidgetPreview';
import { WidgetHowTo } from './widgets/HowTo';
import { demoExample, demoPair, demoScene } from './demoWords';
import { langLabel } from './langPick';
import { draftFresh } from './storage';
import { flagFor, nameFor, LANGS } from './speech';
import { phoneUiLang } from './locale';
import { flag, track } from './analytics';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import { EASE, useReducedMotion, useScreenReader } from './motion';
import { F, R, type, useTheme } from './theme';

// Версія воронки в статистиці: події v4 (новий крок «слово дня», сповіщення
// перед планом) не змішуються з v3 — порядок кроків у воронці інший
export const ONB_VERSION = 4;
// Скільки чекати на прапорець варіанта (див. analytics.flag): довше —
// людина вже тисне «Почати», і ми не тримаємо її.
export const FLAG_WAIT_MS = 1500;
// Пауза після обіцянки: «Домовились!» і «До завтра» мають встигнути прозвучати.
export const COMMIT_PAUSE_MS = 1100;
// Вибір з одного варіанта: галочка — і далі за цей час
export const AUTO_MS = 280;
// «Складаємо твій план…»: не коротше (щоб рядки встигли зʼявитись) і не
// довше (слово дня, що не встигло, не тримає людину)
export const BUILD_MIN_MS = 1200;
export const BUILD_MAX_MS = 2500;

// До якої дії належить крок: 0 — «Ти», 1 — «Як це працює», 2 — «Спробуй».
// План — у другій дії: він тепер після слова дня й сповіщень.
export const ACT = {
  lang: 0,
  name: 0,
  goals: 0,
  field: 0,
  level: 0,
  struggles: 0,
  heard: 0,
  wod: 1,
  push: 1,
  plan: 1,
  streak: 1,
  widgets: 1,
  demo: 2,
  celebrate: 2,
  commit: 2,
};

// Кроки в порядку показу. variant — 'control' | 'short'; replay — повтор із
// Параметрів; push — про сповіщення ще не питали; widgets — у цій збірці є
// віджети; hasWords — у словнику вже є слова (тоді в повторі мову не
// питаємо: безкоштовна мова вже зайнята); scanned — у цьому онбордингу
// збережено перше слово (тоді є свято). «Що таке слово дня» є завжди —
// і без кроку сповіщень: план далі говорить про слово дня.
export function onboardingFlow({
  variant = 'control',
  goals = [],
  replay = false,
  push = false,
  widgets = false,
  hasWords = false,
  scanned = false,
} = {}) {
  const field = needsField(goals) ? ['field'] : [];
  const full = variant !== 'short';
  const tail2 = ['wod', ...(push ? ['push'] : []), 'plan', 'streak', ...(widgets ? ['widgets'] : [])];
  if (replay) return [...(hasWords ? [] : ['lang']), 'name', 'goals', ...field, 'level', 'struggles', ...tail2, 'demo'];
  return [
    'welcome',
    'lang',
    ...(full ? ['name'] : []),
    'goals',
    ...field,
    'level',
    ...(full ? ['struggles'] : []),
    'heard',
    ...tail2,
    'demo',
    ...(scanned ? ['celebrate'] : []),
    'commit',
  ];
}

// Смужка з трьох сегментів: кожен — частка пройдених кроків своєї дії.
export function actProgress(flow, step) {
  const at = step === 'pushDenied' ? 'push' : step;
  const steps = flow.filter((k) => k !== 'welcome');
  const act = ACT[at];
  return [0, 1, 2].map((a) => {
    if (act === undefined) return 0;
    if (a < act) return 1;
    if (a > act) return 0;
    const mine = steps.filter((k) => ACT[k] === a);
    const i = mine.indexOf(at);
    return mine.length ? (i + 1) / mine.length : 0;
  });
}

const LANG_CODES = LANGS.map((l) => l.code);
const okLang = (c) => (LANG_CODES.includes(c) ? c : null);

// Чернетка з минулого запуску (storage.js, формат v3) → крок і відповіді.
// Старша за 15 хвилин, чужого формату чи зіпсована — null: тоді людина
// починає з вітання з порожніми відповідями. Свято не відновлюємо (наліпки
// вже немає в памʼяті) — одразу обіцянка.
//
// Формат чернетки той самий, що в онбордингу 3.0, а порядок кроків — ні:
// тоді план і серія йшли ДО сповіщень. Чернетка на плані чи серії без
// відповіді про сповіщення (push не true/false) — це людина, якій ще не
// показали ні «слово дня», ні вибір години: вона продовжує зі «слова дня»,
// інакше пройшла б повз сповіщення. Чернетка на кроці сповіщень (і
// pushDenied) — з того ж кроку, далі план.
const BEFORE_PUSH_V3 = ['plan', 'streak'];
export function restoreDraft(d, now = Date.now()) {
  if (!draftFresh(d, now) || typeof d.phase !== 'string') return null;
  const variant = d.variant === 'short' ? 'short' : 'control';
  const goals = Array.isArray(d.goals) ? GOALS.filter((g) => d.goals.includes(g)) : [];
  const all = onboardingFlow({ variant, goals, push: true, widgets: true, scanned: true });
  const step = d.phase === 'pushDenied' ? 'push' : d.phase;
  if (step === 'welcome' || !all.includes(step)) return null;
  const hour = PUSH_HOURS.some((h) => h.hour === d.hour) ? d.hour : null;
  const rewind = BEFORE_PUSH_V3.includes(d.phase) && typeof d.push !== 'boolean';
  return {
    phase: d.phase === 'celebrate' ? 'commit' : rewind ? 'wod' : d.phase,
    variant,
    target: okLang(d.target),
    native: okLang(d.native),
    name: cleanName(d.name),
    goals,
    field: FIELDS.includes(d.field) ? d.field : null,
    level: typeof d.level === 'number' && Number.isFinite(d.level) ? clampLevel(d.level) : null,
    struggles: cleanStruggles(d.struggles),
    heard: HEARD.includes(d.heard) ? d.heard : null,
    push: typeof d.push === 'boolean' ? d.push : undefined,
    hour,
    scanned: !!d.scanned,
  };
}

// Теми плану одним рядком: «робота, подорожі». Назви тем посеред рядка — з
// малої (крім німецької, де іменники завжди з великої).
// «Теми: фінанси, подорожі» — без «загальне», коли є названі теми: людина
// вибирала саме їх, загальні слова — лише тло плану.
function topicsLine(p, t, ui) {
  const all = planTopics(p).map((x) => x.topic);
  const named = all.filter((k) => k !== 'general');
  const names = (named.length ? named : all).map((k) => t('topic_' + k));
  const low = ui === 'de' ? names : names.map((n) => n.toLocaleLowerCase(ui));
  return low.join(', ');
}

// Кроки-питання: на них є «Пропустити»
const QUESTIONS = ['name', 'goals', 'field', 'level', 'struggles', 'heard'];
// Лінго поруч із заголовком кроків-питань — поза під крок. На кроці імені
// він інший: визирає знизу з-за кнопки (NameLingo).
export const LINGO_POSE = { goals: 'encourage', field: 'think', level: 'think', struggles: 'encourage', heard: 'wave' };
// Межі для кроків, що заповнюють екран: сцена демо й видима частина
// телефона на кроці сповіщень (pt)
const DEMO_MIN_H = 170;
const DEMO_MAX_H = 470;

// Кнопка, що двічі мʼяко «дихає» обідком — коли демо дійшло до фіналу
function BreathingBtn({ on, children }) {
  const { C } = useTheme();
  const reduced = useReducedMotion();
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!on || reduced) return undefined;
    const once = Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: 700, easing: EASE.soft, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0, duration: 700, easing: EASE.soft, useNativeDriver: true }),
    ]);
    const run = Animated.sequence([once, once]);
    run.start();
    return () => run.stop();
  }, [on, reduced]);
  return (
    <View>
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: -7,
          right: -7,
          top: -7,
          bottom: -7,
          borderRadius: R.lg + 7,
          backgroundColor: C.accent,
          opacity: v.interpolate({ inputRange: [0, 1], outputRange: [0, 0.18] }),
        }}
      />
      {children}
    </View>
  );
}

// Пропси від App:
//   t, uiLang — мова інтерфейсу; onDone(result) — фінал;
//   profile, heardFrom, name, struggles — поточні відповіді (лише в повторі;
//     перший запуск їх не підставляє);
//   targetLang, nativeLang — мови з налаштувань; phoneNative — мова телефона
//     (defaultLanguages): з неї стартує «Перекладати на»;
//   onLanguages({ targetLang, nativeLang }) — мови обрано: App одразу
//     зберігає їх, тож план, слово дня й перший скан ідуть цією парою;
//   prepareWod(profile) → Promise<слово на сьогодні | null> — App зберігає
//     профіль і тягне слово дня під нього (стан «складаємо…» плану);
//   todayWord — слово дня з кешу (повтор, віджети);
//   wodHour — нинішня година сповіщень;
//   canWow — можна зробити перший скан (перший запуск, словник порожній,
//     безкоштовний скан є); scanUsed — безкоштовний скан уже витрачено;
//   renderScanner({ onSaved, onExit, level }) — справжній сканер першого
//     скану (збирає App; onExit(reason) — 'closed' | 'camera_denied' | 'limit');
//   aiConsent / onAiConsent — згода на AI (питаємо до камери);
//   widgets — у збірці є віджети (widgetsAvailable); hasWords — є слова;
//   dev — { forcePush, forceWidgets } для «Онбординг як новий» у розробці;
//   paywall — 'show' | 'skip' | 'none' (для статистики onboarding_complete);
//   draft / onDraft — чернетка з минулого запуску і запис нової.
// onDone({ profile, heardFrom, name?, struggles?, wodEnabled?, wodHour?,
//   scanned, firstWord?, flow, targetLang, nativeLang }).
export default function OnboardingScreen({
  t,
  uiLang,
  onDone,
  profile = null,
  heardFrom = null,
  name = '',
  struggles = [],
  targetLang = 'en',
  nativeLang = null,
  phoneNative = null,
  onLanguages = null,
  prepareWod = null,
  todayWord = null,
  wodHour = DEFAULT_HOUR,
  replay = false,
  canWow = false,
  scanUsed = false,
  renderScanner = null,
  aiConsent = false,
  onAiConsent = null,
  widgets = false,
  hasWords = false,
  dev = null,
  paywall = 'none',
  draft = null,
  onDraft = null,
}) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const ui = uiLang || phoneUiLang();
  const win = useWindowDimensions();
  // Відступи безпечної зони — щоб демо вмістилось з кнопками; без
  // провайдера (тести, старі збірки) — типові для iPhone з вирізом
  const insets = useContext(SafeAreaInsetsContext) || { top: 47, bottom: 34 };
  const reader = useScreenReader();
  const startedAt = useRef(Date.now());
  // Чернетка — лише для першого знайомства: повтор починається з того, що
  // вже збережено в налаштуваннях.
  const [saved] = useState(() => (replay ? null : restoreDraft(draft)));

  // Відповіді до онбордингу — до них повертає «Пропустити». Перший запуск
  // не бере нічого з налаштувань: там може лежати перерваний запуск.
  const initial = useRef(
    replay
      ? {
          name: cleanName(name),
          goals: profile?.goals || [],
          field: profile?.field || null,
          level: profile ? profile.level : null,
          struggles: cleanStruggles(struggles),
          heard: heardFrom || null,
        }
      : { name: '', goals: [], field: null, level: null, struggles: [], heard: null }
  ).current;

  // «Пропустити» й далі вертає до відповідей до онбордингу, а не до чернетки
  const answers = saved || initial;
  const [nameDraft, setNameDraft] = useState(answers.name);
  const [goals, setGoals] = useState(answers.goals);
  const [field, setField] = useState(answers.field);
  // null — рівень не обрано (крок пропущено); слайдер тоді стоїть посередині
  const [level, setLevel] = useState(answers.level);
  const [pains, setPains] = useState(answers.struggles);
  const [heard, setHeard] = useState(answers.heard);
  // Мови: у першому запуску мову навчання ще не обрано; мова перекладу —
  // мова телефона (її можна змінити згори на кроці мови)
  const [target, setTarget] = useState(() => (replay ? targetLang : saved?.target || null));
  const [native, setNative] = useState(() => (replay ? nativeLang : saved?.native || phoneNative || nativeLang || 'en'));
  const curTarget = target || targetLang;
  const curNative = native || nativeLang || 'en';
  const [hour, setHour] = useState(() => saved?.hour ?? (PUSH_HOURS.some((h) => h.hour === wodHour) ? wodHour : DEFAULT_HOUR));

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

  // ── Сповіщення: питаємо, лише якщо ще не питали (у розробці — завжди) ───
  const [pushAsk, setPushAsk] = useState(!!dev?.forcePush);
  // Відповідь системи на запит. Ref, а не стан: фінал може настати в тому ж
  // тіку, що й відповідь.
  const pushGranted = useRef(saved ? saved.push : undefined);
  // Крок сповіщень уже був до перезапуску (у чернетці є відповідь) — годину
  // з нього людина бачила й обрала, тож вона йде у фінал
  const pushShown = useRef(typeof saved?.push === 'boolean' || saved?.phase === 'pushDenied');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (dev?.forcePush) return undefined;
    let alive = true;
    permissionStatus()
      .then((st) => alive && setPushAsk(st === 'undetermined'))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const showWidgets = !!widgets || !!dev?.forceWidgets;

  // ── Перший скан ─────────────────────────────────────────────────────────
  const [firstWord, setFirstWord] = useState(null);
  const firstWordRef = useRef(null);
  // Слово першого скану збережене до перезапуску (чернетка): наліпки вже
  // немає в памʼяті, але скан був — для фіналу, статистики й першої крапки
  const scannedBefore = useRef(!!saved?.scanned).current;
  const scannedNow = () => scannedBefore || !!firstWordRef.current;
  const [scannerOpen, setScannerOpen] = useState(false);
  const [consentOpen, setConsentOpen] = useState(false);
  // Сервер відмовив за лімітом (скан на цьому iPhone уже був)
  const [scanBlocked, setScanBlocked] = useState(false);
  const canScan = !replay && canWow && !scanBlocked && typeof renderScanner === 'function';
  const [demoFinal, setDemoFinal] = useState(false);
  const demoLoops = useRef(0);

  const [phase, setPhase] = useState(() => {
    if (replay) return hasWords ? 'name' : 'lang';
    if (!saved) return 'welcome';
    return saved.phase;
  });
  const [direction, setDirection] = useState(null);
  // Скільки ще місця віддати сцені демо чи телефону, щоб вони заповнили
  // екран до кнопки (StepFrame onRoom): оцінка висоти заголовка не знає,
  // у скільки рядків він ляже, а вимір — знає
  const [slack, setSlack] = useState({ key: null, px: 0 });
  // Крок з одним варіантом, на який повернулись уже з відповіддю (чернетка;
  // повтор без слів, що стартує з уже обраної мови)
  const [had, setHad] = useState(() => answered(phase));
  const [nativeOpen, setNativeOpen] = useState(false);
  const pause = useRef(null);
  const auto = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(pause.current);
      clearTimeout(auto.current);
    },
    []
  );

  const flowName = variant === 'short' ? 'short' : 'control';
  function flowWith(over = {}) {
    return onboardingFlow({
      variant: over.variant || flowName,
      goals: over.goals || goals,
      replay,
      push: pushAsk,
      widgets: showWidgets,
      hasWords,
      scanned: over.scanned ?? !!firstWordRef.current,
    });
  }
  const flow = flowWith();
  const at = phase === 'pushDenied' ? 'push' : phase;
  const steps = flow.filter((k) => k !== 'welcome');

  // ── Статистика: кожен показаний крок (у повторі — ні: це не воронка) ────
  const welcomeSent = useRef(!!saved);
  function trackStep(step, v, f = flow) {
    if (step === 'welcome') {
      if (welcomeSent.current) return;
      welcomeSent.current = true;
    }
    const k = step === 'pushDenied' ? 'push' : step;
    const counted = f.filter((x) => x !== 'welcome');
    track('onboarding_step', {
      step: step === 'pushDenied' ? 'push_denied' : step,
      index: counted.indexOf(k) + 1,
      total: counted.length,
      flow: v,
      ver: ONB_VERSION,
    });
  }
  useEffect(() => {
    if (replay || !variant) return;
    trackStep(phase, variant);
  }, [phase, variant]);

  function event(name, props) {
    if (!replay) track(name, { ...props, flow: flowName, ver: ONB_VERSION });
  }
  const eventRef = useRef(event);
  eventRef.current = event;

  // Чернетка на кожному кроці (див. restoreDraft): iOS може вбити
  // застосунок посеред знайомства — зокрема коли в Параметрах міняють
  // доступ до камери, — і людина не має відповідати на все вдруге.
  useEffect(() => {
    if (replay || !onDraft || !variant || phase === 'welcome') return;
    onDraft({
      phase,
      variant: flowName,
      target,
      native,
      name: nameDraft,
      goals,
      field,
      level,
      struggles: pains,
      heard,
      push: pushGranted.current,
      hour,
      scanned: scannedNow(),
    });
  }, [phase, variant]);

  // ── Перехід між кроками ─────────────────────────────────────────────────
  const leave = useRef(null);
  function go(next, dir = 'forward') {
    clearTimeout(auto.current);
    leave.current?.();
    leave.current = null;
    setDirection(dir);
    setHad(answered(next));
    setPhase(next);
  }

  // Чи була вже відповідь, коли людина зайшла на крок з одним варіантом
  // (повернулась назад): тоді «Далі» є одразу — не треба тапати те саме.
  function answered(step) {
    if (step === 'lang') return !!target;
    if (step === 'field') return !!field;
    if (step === 'heard') return !!heard;
    return false;
  }

  // Далі за потоком; останній крок — фінал. Таймери й слухачі кличуть
  // найсвіжішу версію через ref: їхнє замикання бачило б старі відповіді.
  const forwardRef = useRef(null);
  forwardRef.current = (from, over) => forward(from, over);
  // Наступний — за повним порядком кроків: тоді й крок із чернетки, якого в
  // потоці вже немає (про сповіщення система вже знає), веде далі, а не
  // одразу у фінал.
  function forward(from = phase, over) {
    const f = flowWith(over);
    const all = onboardingFlow({
      variant: over?.variant || flowName,
      goals: over?.goals || goals,
      replay,
      push: true,
      widgets: true,
      hasWords,
      scanned: true,
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

  // Вибір з одного варіанта — галочка, і далі сам за AUTO_MS; відповідь у
  // статистику — тоді ж, одна (передумав за цей час — рахується останній
  // вибір). З VoiceOver — без автопереходу: далі кнопкою «Далі».
  function autoNext(from, answer) {
    if (reader) return;
    clearTimeout(auto.current);
    auto.current = setTimeout(() => {
      if (answer !== undefined) eventRef.current('onboarding_answer', { step: from, value: answer });
      forwardRef.current(from);
    }, AUTO_MS);
  }

  function back() {
    Haptics.selectionAsync();
    event('onboarding_back', { step: phase });
    if (phase === 'pushDenied') {
      go('push', 'back');
      return;
    }
    const i = flow.indexOf(phase);
    if (i > 0) go(flow[i - 1], 'back');
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
      profile: profileFromAnswers({ goals, field, level }, replay ? profile : null),
      heardFrom: heard,
      scanned: scannedNow(),
      flow: variant === 'replay' ? 'replay' : flowName,
      targetLang: curTarget,
      nativeLang: curNative,
    };
    // Імʼя й «що заважає» — лише якщо ці кроки були в потоці
    if (flow.includes('name')) out.name = cleanName(nameDraft);
    if (flow.includes('struggles')) out.struggles = cleanStruggles(pains);
    if (typeof pushGranted.current === 'boolean') out.wodEnabled = pushGranted.current;
    // Годину зберігаємо, щойно людина її бачила, — і після «ні»
    if (pushShown.current) out.wodHour = hour;
    // Перше слово — для пейвола онбордингу з наліпкою людини
    if (firstWordRef.current) out.firstWord = firstWordRef.current;
    return out;
  }

  function finish() {
    leave.current?.();
    leave.current = null;
    const r = result();
    if (!replay) {
      track('onboarding_complete', {
        flow: flowName,
        ver: ONB_VERSION,
        seconds: Math.round((Date.now() - startedAt.current) / 1000),
        scanned: r.scanned,
        push: typeof pushGranted.current === 'boolean' ? pushGranted.current : null,
        paywall,
      });
    }
    onDone(r);
  }

  // ── Мова ────────────────────────────────────────────────────────────────
  function pickTarget(code) {
    setTarget(code);
    onLanguages?.({ targetLang: code, nativeLang: curNative });
    event('onboarding_answer', { step: 'lang', value: code, native: curNative });
    autoNext('lang');
  }

  function pickNative(code) {
    setNativeOpen(false);
    if (code === curNative) return;
    setNative(code);
    onLanguages?.({ targetLang: target || undefined, nativeLang: code });
    event('onboarding_answer', { step: 'native_change', value: code });
  }

  // ── План ────────────────────────────────────────────────────────────────
  // Стан «складаємо…» триває, поки App тягне слово дня під щойно складений
  // профіль, але не менше BUILD_MIN_MS і не довше BUILD_MAX_MS. Те саме вже
  // складене (повернулись назад і нічого не міняли) вдруге не складаємо.
  const profileNow = profileFromAnswers({ goals, field, level }, replay ? profile : null);
  const planKey = JSON.stringify([curTarget, curNative, goals, field, level]);
  const [today, setToday] = useState(replay ? todayWord : null);
  const [build, setBuild] = useState({ key: null, busy: false, wod: false });
  useEffect(() => {
    if (phase !== 'plan' || replay || build.key === planKey) return undefined;
    let alive = true;
    const t0 = Date.now();
    setBuild({ key: planKey, busy: true, wod: false });
    setToday(null);
    const wod = Promise.resolve(prepareWod ? prepareWod(profileNow) : null).catch(() => null);
    const cap = new Promise((r) => setTimeout(() => r(null), BUILD_MAX_MS));
    Promise.race([wod, cap]).then((w) => {
      if (!alive) return;
      if (w) setToday(w);
      setBuild((b) => ({ ...b, wod: !!w }));
      const rest = Math.max(0, BUILD_MIN_MS - (Date.now() - t0));
      setTimeout(() => alive && setBuild((b) => ({ ...b, busy: false })), rest);
    });
    return () => {
      alive = false;
      // пішли з плану посеред складання — повернувшись, складемо знову
      setBuild((b) => (b.key === planKey && b.busy ? { key: null, busy: false, wod: false } : b));
    };
  }, [phase, planKey]);
  const building = phase === 'plan' && !replay && (build.key !== planKey || build.busy);
  const wodWord = today || todayWord;

  // ── Серія ───────────────────────────────────────────────────────────────
  const streakPlay = useRef({ max: 0, touched: false });
  useEffect(() => {
    if (phase !== 'streak') return;
    streakPlay.current = { max: 0, touched: false };
    leave.current = () => event('onb_streak_play', { ...streakPlay.current });
  }, [phase]);

  // ── Демо ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'demo') return;
    demoLoops.current = 0;
    setDemoFinal(false);
    event('onb_demo', { action: 'view', can_scan: canScan });
  }, [phase]);

  function demoEvent(action) {
    event('onb_demo', { action, loops: demoLoops.current, can_scan: canScan });
  }

  function tryScan() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    demoEvent('try');
    // Згода на AI — до камери, а не посеред моменту «натиснув і чекаю»
    if (!aiConsent) {
      setConsentOpen(true);
      return;
    }
    setScannerOpen(true);
  }

  function allowAi() {
    setConsentOpen(false);
    onAiConsent?.();
    setScannerOpen(true);
  }

  function consentLater() {
    setConsentOpen(false);
    demoEvent('consent_later');
  }

  // Вихід зі сканера: збережене слово — свято; хрестик — назад на демо;
  // відмова в камері — далі, до обіцянки; ліміт — демо без «Спробувати».
  function scanExit(reason, word) {
    const why = word ? 'saved' : ['closed', 'camera_denied', 'limit', 'error'].includes(reason) ? reason : 'closed';
    event('onb_scan', { result: why });
    setScannerOpen(false);
    if (why === 'saved') {
      firstWordRef.current = word;
      setFirstWord(word);
      go('celebrate');
      return;
    }
    if (why === 'camera_denied') {
      forwardRef.current('demo', { scanned: false });
      return;
    }
    if (why === 'limit') setScanBlocked(true);
  }

  // ── Свято: «Далі» — не одразу ───────────────────────────────────────────
  const [celebrateReady, setCelebrateReady] = useState(false);
  useEffect(() => {
    if (phase !== 'celebrate') return undefined;
    setCelebrateReady(false);
    const id = setTimeout(() => setCelebrateReady(true), CELEBRATE_NEXT_MS);
    return () => clearTimeout(id);
  }, [phase]);

  // ── Сповіщення ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase === 'push') pushShown.current = true;
  }, [phase]);

  // Системний запит — лише з кнопки «Далі» на нашому екрані (App Review
  // 5.1.1(iv): кнопку перед запитом не можна підписувати «Дозволити»).
  async function askPush() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    event('onboarding_answer', { step: 'push_hour', value: hour });
    setBusy(true);
    const granted = await requestPermission();
    setBusy(false);
    pushGranted.current = granted;
    track('push_permission', { granted, source: replay ? 'replay' : 'onboarding' });
    if (granted) forward('push');
    else go('pushDenied');
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

  // ── Віджети ─────────────────────────────────────────────────────────────
  const [howto, setHowto] = useState(0);

  // ── Обіцянка ────────────────────────────────────────────────────────────
  const [committed, setCommitted] = useState(false);
  function onCommit(info) {
    setCommitted(true);
    event('onb_commit', { mode: info?.mode || 'hold', releases: info?.releases || 0 });
    clearTimeout(pause.current);
    pause.current = setTimeout(() => forwardRef.current('commit'), COMMIT_PAUSE_MS);
  }

  // ── Демо й телефон заповнюють екран до кнопки ───────────────────────────
  // StepFrame каже, скільки місця лишилось під вмістом (room); зайве — і
  // нестачу — віддаємо сцені чи телефону, доки під ними не стане рівно
  // нижній відступ. Межі (мінімум і максимум) тримає той, хто рахує висоту.
  function fitRoom(room) {
    if (phase !== 'demo' && phase !== 'push') return;
    const d = room - BODY_PAD;
    if (Math.abs(d) <= 2) return;
    setSlack((sl) => {
      const px = Math.max(-600, Math.min(600, (sl.key === phase ? sl.px : 0) + d));
      return sl.key === phase && sl.px === px ? sl : { key: phase, px };
    });
  }
  const slackPx = slack.key === phase ? slack.px : 0;

  // ═══ Рендер ═════════════════════════════════════════════════════════════
  if (phase === 'welcome') {
    const heroSize = Math.round(Math.max(170, Math.min(270, win.height * 0.3)));
    return (
      <View style={s.root}>
        <View style={s.brand}>
          <AppIcon size={30} />
          <Text style={s.brandName}>LinguaLens</Text>
        </View>
        <View style={s.hero}>
          <WelcomeHero size={heroSize} />
          <FadeIn delay={160} style={{ alignItems: 'center' }}>
            <LingoBubble text={t('ob3Hello')} style={{ alignSelf: 'center', marginTop: 4 }} />
            <Text style={s.heroTitle} accessibilityRole="header">
              {t('ob3HookTitle')}
            </Text>
            <Text style={s.heroText}>{t('ob3HookText')}</Text>
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
      onSaved: (w) => (w ? scanExit('saved', w) : scanExit('closed')),
      onExit: (reason) => scanExit(reason),
      level: profileNow?.level,
    });
  }

  const index = steps.indexOf(at);
  const last = flow.indexOf(at) === flow.length - 1;
  const nextTitle = last ? t('obFinish') : t('obNext');
  const backOk = flow.indexOf(at) > 0 && phase !== 'celebrate' && !(phase === 'commit' && committed);
  const frame = {
    stepKey: phase,
    direction,
    progress: { acts: actProgress(flow, at), step: index + 1, total: steps.length },
    onBack: backOk ? back : null,
    right: QUESTIONS.includes(phase) ? <SkipButton onPress={skip} t={t} /> : <SkipButton hidden t={t} />,
    header: null,
    mascot: null,
    peek: null,
    onRoom: fitRoom,
    t,
  };
  const shownName = cleanName(nameDraft);
  const langAcc = t('langAcc_' + curTarget);
  // Реакція Lingo на мову — на першому кроці після неї. На кроці імені її
  // каже сам Лінго знизу; на цілях (короткий варіант) — бульбашка без
  // мініатюри над заголовком, а Лінго поруч із заголовком радіє.
  const afterLang = flow[flow.indexOf('lang') + 1];
  const cheerText = target && flow.includes('lang') && phase === afterLang ? t('obLangCheer', { lang: langLabel(curTarget, t, ui, { capital: true }) }) : '';
  const cheer = cheerText ? <LingoBubble pose={null} text={cheerText} /> : null;
  // Лінго поруч із заголовком: невеликий, підскакує на кожен вибір
  const lingoSize = win.height < 720 ? 64 : 76;
  const hopKey = { goals: goals.join(), field, level, struggles: pains.join(), heard }[phase];
  if (LINGO_POSE[phase]) {
    frame.mascot = <MascotLive pose={cheerText ? 'celebrate' : LINGO_POSE[phase]} size={lingoSize} hop={hopKey} testID="step-lingo" />;
  }

  let body = null;
  let footer = null;
  let title = '';
  let text = null;

  if (phase === 'lang') {
    title = t('obLangTitle');
    // Дві секції: згори — моя рідна мова (мова перекладу, з телефона), знизу —
    // мова, яку я вчу (Популярні, пошук, усі мови)
    body = (
      <View>
        <Text style={s.section}>{t('obNativeLabel')}</Text>
        <Pressable
          style={({ pressed }) => [s.nativeCard, pressed && { backgroundColor: C.card2 }]}
          onPress={() => {
            Haptics.selectionAsync();
            setNativeOpen(true);
          }}
          accessibilityRole="button"
          accessibilityLabel={t('obNativeA11y', { lang: nameFor(curNative) })}
          testID="native-card"
        >
          <View style={s.nativeRow}>
            <Text style={s.nativeFlag}>{flagFor(curNative)}</Text>
            <Text style={s.nativeName} numberOfLines={1}>
              {nameFor(curNative)}
            </Text>
          </View>
          <Text style={s.nativeChange}>{t('obNativeChange')} ›</Text>
        </Pressable>
        <Text style={[s.section, { marginTop: 22 }]}>{t('obLangLearnLabel')}</Text>
        <LangList value={target} off={curNative} offNote={t('obLangIsNative')} popularFor={curNative} onPick={pickTarget} t={t} ui={ui} />
      </View>
    );
    // Без VoiceOver вибір веде далі сам; кнопка — лише коли мову вже обрано
    // (повернулись назад) чи з VoiceOver
    footer = reader || had ? <GradBtn title={nextTitle} onPress={() => next()} disabled={!target} /> : null;
  } else if (phase === 'name') {
    title = t('obNameTitle');
    // Лінго визирає знизу, з-за кнопки: махає, а щойно є імʼя — знайомиться
    frame.peek = (room) => <NameLingo name={shownName} cheer={cheerText} room={room} t={t} />;
    body = (
      <NameField value={nameDraft} onChange={setNameDraft} onSubmit={() => shownName && next('given')} label={t('obNameTitle')} t={t} />
    );
    footer = <GradBtn title={nextTitle} onPress={() => next('given')} disabled={!shownName} />;
  } else if (phase === 'goals') {
    frame.header = cheer;
    title = shownName ? t('pfGoalsTitleLangName', { name: shownName, lang: langAcc }) : t('pfGoalsTitleLang', { lang: langAcc });
    body = <GoalOptions value={goals} onChange={setGoals} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(goals)} disabled={!goals.length} />;
  } else if (phase === 'field') {
    title = studyOnly(goals) ? t('pfFieldTitleStudy') : t('pfFieldTitle');
    body = (
      <FieldOptions
        value={field}
        onChange={(v) => {
          setField(v);
          autoNext('field', v);
        }}
        t={t}
      />
    );
    footer = reader || had ? <GradBtn title={nextTitle} onPress={() => next(field)} disabled={!field} /> : null;
  } else if (phase === 'level') {
    title = t('pfLevelTitle');
    frame.header = <LangPill code={curTarget} t={t} />;
    body = <LevelBody value={level ?? DEFAULT_LEVEL} onChange={setLevel} lang={curTarget} t={t} />;
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
    body = <StruggleOptions value={pains} onChange={setPains} t={t} />;
    footer = <GradBtn title={nextTitle} onPress={() => next(pains)} disabled={!pains.length} />;
  } else if (phase === 'heard') {
    title = t('pfHeardTitle');
    body = (
      <HeardOptions
        value={heard}
        onChange={(v) => {
          setHeard(v);
          autoNext('heard', v);
        }}
        t={t}
      />
    );
    footer = reader || had ? <GradBtn title={nextTitle} onPress={() => next(heard)} disabled={!heard} /> : null;
  } else if (phase === 'wod') {
    // Що таке слово дня: Лінго тримає картку-приклад мовою навчання
    title = t('obWodTitle');
    text = t('obWodText');
    const wodLingo = win.height >= 900 ? 180 : win.height >= 720 ? 156 : 132;
    body = (
      <View>
        <View style={s.wodLingo}>
          <MascotLive pose="encourage" size={wodLingo} enter="hop" testID="wod-lingo" />
        </View>
        <WodExample sample={demoExample(curTarget, curNative)} t={t} />
      </View>
    );
    footer = <GradBtn title={nextTitle} onPress={() => next()} />;
  } else if (phase === 'plan') {
    if (building) {
      const cefr = profileNow ? cefrFor(profileNow.level) : null;
      const rows = [
        {
          key: 'lang',
          flag: flagFor(curTarget),
          text: cefr ? t('obBuildLang', { lang: nameFor(curTarget), cefr }) : nameFor(curTarget),
          done: true,
        },
        { key: 'topics', text: t('obBuildTopics', { topics: topicsLine(profileNow, t, ui) }), done: true },
        { key: 'wod', text: build.wod ? t('obBuildWodDone') : t('obBuildWod'), done: build.wod },
      ];
      title = '';
      body = <PlanBuilding title={t('obBuildTitle')} rows={rows} />;
      footer = (
        <View style={{ opacity: 0 }} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <GradBtn title={nextTitle} onPress={() => {}} />
        </View>
      );
    } else {
      title = shownName ? t('obPlanTitleName', { name: shownName }) : t('obPlanTitle');
      body = (
        <View>
          <TodayCard word={wodWord} topic={topicName(t, wodWord?.topic)} lang={curTarget} t={t} />
          <PlanBody profile={profileNow} struggles={flow.includes('struggles') ? pains : []} lang={curTarget} t={t} />
        </View>
      );
      footer = (
        <FadeIn dy={6}>
          <GradBtn title={nextTitle} onPress={() => next()} />
        </FadeIn>
      );
    }
  } else if (phase === 'streak') {
    title = t('obStreakTitle');
    text = t('obStreakText');
    body = <StreakShowcase t={t} onPlay={(p) => (streakPlay.current = p)} />;
    footer = <GradBtn title={nextTitle} onPress={() => next()} />;
  } else if (phase === 'push') {
    const key = primaryTopic(profileNow);
    title = t('obPushTitle');
    text = t('obPushText');
    // Телефон — на всю ширину, що лишилась від полів, але не більший за
    // справжній; видно стільки, скільки дозволяє екран (телефон «визирає»
    // знизу), і ніколи менше, ніж годинник зі сповіщенням.
    const phoneW = Math.round(Math.max(232, Math.min(296, win.width * 0.66)));
    const phoneH = phoneVisible(phoneW) + 40 + slackPx;
    body = (
      <View>
        <HourChips
          value={hour}
          onChange={(h) => {
            Haptics.selectionAsync();
            setHour(h);
          }}
          t={t}
        />
        <PushPreview
          topic={topicName(t, key)}
          hour={hourLabel(hour)}
          clock={lockClock(hour)}
          sample={demoExample(curTarget, curNative)}
          width={phoneW}
          height={phoneH}
          t={t}
        />
      </View>
    );
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
  } else if (phase === 'widgets') {
    title = t('onbWidgetTitle');
    text = t('onbWidgetText');
    body = (
      <View>
        <WidgetPreview
          wod={wodWord}
          sample={demoPair(curTarget, curNative)}
          streakN={1}
          t={t}
          lang={ui}
          targetLang={curTarget}
          onReveal={() => event('onb_widget_step', { action: 'preview_reveal' })}
        />
        <Text style={s.tryHint}>{t('onbWidgetTry')}</Text>
        <WidgetHowTo key={howto} t={t} compact style={{ marginTop: 14 }} />
      </View>
    );
    footer = (
      <View style={{ gap: 4 }}>
        <GradBtn
          title={nextTitle}
          onPress={() => {
            event('onb_widget_step', { action: 'next' });
            next();
          }}
        />
        <Pressable
          style={s.later}
          onPress={() => {
            Haptics.selectionAsync();
            event('onb_widget_step', { action: 'howto' });
            setHowto((n) => n + 1);
          }}
          accessibilityRole="button"
        >
          <Text style={s.laterText}>{t('onbWidgetAgain')}</Text>
        </Pressable>
      </View>
    );
  } else if (phase === 'demo') {
    title = t('obDemoTitle');
    // Сцена — скільки дозволяє екран: заголовок, підпис і кнопки мають
    // уміститись без прокрутки навіть на SE. Перша оцінка — на заголовок у
    // два рядки; далі StepFrame міряє, і сцена добирає чи віддає місце.
    const sceneW = win.width - 48;
    const guess = win.height - insets.top - insets.bottom - 52 - 14 - 68 - 22 - 76 - (canScan || replay ? 148 : 176);
    const sceneH = Math.max(DEMO_MIN_H, Math.min(DEMO_MAX_H, guess + slackPx));
    body = (
      <ScanDemo
        pair={demoPair(curTarget, curNative)}
        scene={demoScene(curTarget, curNative)}
        t={t}
        width={sceneW}
        height={sceneH}
        onFinal={() => {
          demoLoops.current += 1;
          setDemoFinal(true);
        }}
        onAction={(a) => {
          if (a === 'replay') setDemoFinal(false);
          demoEvent(a);
        }}
      />
    );
    if (replay) {
      footer = (
        <GradBtn
          title={t('obFinish')}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            finish();
          }}
        />
      );
    } else if (canScan) {
      footer = (
        <View style={{ gap: 4 }}>
          <BreathingBtn on={demoFinal}>
            <GradBtn title={t('obDemoTry')} onPress={tryScan} />
          </BreathingBtn>
          <Pressable
            style={s.later}
            onPress={() => {
              event('onboarding_skip', { step: 'demo' });
              demoEvent('later');
              next();
            }}
            accessibilityRole="button"
          >
            <Text style={s.laterText}>{t('obWowLater')}</Text>
          </Pressable>
        </View>
      );
    } else {
      footer = (
        <View style={{ gap: 10 }}>
          {scanUsed || scanBlocked ? <Text style={s.usedText}>{t('obDemoUsed')}</Text> : null}
          <GradBtn
            title={nextTitle}
            onPress={() => {
              demoEvent('continue');
              next();
            }}
          />
        </View>
      );
    }
  } else if (phase === 'celebrate') {
    title = '';
    body = <Celebrate word={firstWord} t={t} />;
    footer = (
      <View style={{ opacity: celebrateReady ? 1 : 0 }} pointerEvents={celebrateReady ? 'auto' : 'none'}>
        {celebrateReady ? (
          <FadeIn dy={8}>
            <GradBtn title={nextTitle} onPress={() => next()} />
          </FadeIn>
        ) : (
          <GradBtn title={nextTitle} onPress={() => {}} />
        )}
      </View>
    );
  } else if (phase === 'commit') {
    title = t('obCommitTitle');
    // Лінго підбадьорює, поки людина тримає кільце, і радіє «Домовились!»;
    // головне тут — кільце, тож Лінго лише поруч із заголовком
    frame.mascot = (
      <MascotLive pose={committed ? 'celebrate' : 'encourage'} size={lingoSize + 8} hop={committed} testID="commit-lingo" />
    );
    body = (
      <View>
        <PledgeCard
          text={shownName ? t('obCommitName', { name: shownName, lang: langAcc }) : t('obCommitText', { lang: langAcc })}
          lit={!!firstWord || scannedBefore}
          t={t}
        />
        <View style={{ marginTop: 34, alignItems: 'center' }}>
          <HoldToCommit
            onCommit={onCommit}
            label={t('obCommitA11y')}
            holdHint={t('obCommitHold')}
            keepHint={t('obCommitKeep')}
            againHint={t('obCommitAgain')}
            tapHint={t('obCommitTap')}
            longerHint={t('holdLonger')}
            doneText={t('obCommitDone')}
            doneSub={t('obCommitDoneSub')}
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
      {phase === 'lang' ? (
        <LangSheet
          visible={nativeOpen}
          mode="native"
          current={curNative}
          other={target}
          phone={phoneNative}
          onPick={pickNative}
          onClose={() => setNativeOpen(false)}
          ui={ui}
          t={t}
        />
      ) : null}
      {phase === 'demo' ? <ConsentSheet visible={consentOpen} onAllow={allowAi} onClose={consentLater} t={t} /> : null}
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    brand: { flexDirection: 'row', alignItems: 'center', gap: 9, paddingHorizontal: 20, paddingTop: 14 },
    brandName: { color: C.text, ...type(17, F.extra, { noLead: true }) },
    hero: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 },
    heroTitle: { color: C.text, ...type(28, F.extra), textAlign: 'center', maxWidth: 340, marginTop: 6 },
    heroText: { color: C.dim, ...type(16, F.reg), textAlign: 'center', marginTop: 10, maxWidth: 330 },
    heroFooter: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },
    later: { alignItems: 'center', justifyContent: 'center', minHeight: 48 },
    laterText: { color: C.dim, ...type(16, F.bold, { noLead: true }) },
    usedText: { color: C.dim, ...type(14, F.semi), textAlign: 'center', paddingHorizontal: 6 },
    tryHint: { color: C.accent, ...type(14, F.bold), textAlign: 'center', marginTop: 12 },
    // Підпис секції на кроці мови: «Моя рідна мова» / «Мова, яку я вчу» —
    // рівня вище за «Популярні» й «Усі мови» всередині списку
    section: { color: C.text, ...type(17, F.extra), marginBottom: 10, marginLeft: 2 },
    nativeCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 16,
      paddingVertical: 12,
      minHeight: 56,
    },
    nativeRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
    nativeFlag: { fontSize: 22 },
    wodLingo: { alignItems: 'center', marginTop: -6, marginBottom: -20, zIndex: 0 },
    nativeName: { flexShrink: 1, color: C.text, ...type(17, F.bold, { noLead: true }) },
    nativeChange: { color: C.accent, ...type(15, F.bold, { noLead: true }), marginLeft: 10 },
  });
