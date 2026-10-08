import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, DevSettings, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { IS_DEV } from './src/config';
// SafeAreaView з react-native застарів. Наша обгортка бере контекстну версію,
// якщо пакет встановлений, і падає на ручні відступи, якщо ні.
import { SafeAreaView, useSafeAreaInsets } from './src/SafeArea';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import * as SplashScreen from 'expo-splash-screen';
import { getLocales } from 'expo-localization';
// Шрифти поштучно: імпорт із кореня пакета тягне в бандл усі 18 файлів
// Nunito (~2 МБ), а ми використовуємо чотири накреслення.
import { useFonts } from '@expo-google-fonts/nunito/useFonts';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';

import ScannerScreen from './src/ScannerScreen';
import DictionaryScreen from './src/DictionaryScreen';
import FlashcardsScreen from './src/FlashcardsScreen';
import ProfileScreen from './src/ProfileScreen';
import SettingsScreen from './src/SettingsScreen';
import OnboardingScreen from './src/OnboardingScreen';
import AchievementToast from './src/AchievementToast';
import PaywallScreen from './src/PaywallScreen';
import OnboardingPaywall from './src/OnboardingPaywall';
import ProfileEditor from './src/ProfileEditor';
import ShareSheet from './src/share/ShareSheet';
import { weekStats } from './src/share/layout';
import {
  clearLocalData,
  clearOnboardingDraft,
  loadActivity,
  loadOnboarded,
  loadOnboardingDraft,
  loadSeenAchievements,
  loadSettings,
  loadStats,
  loadWords,
  loadWod,
  localDayKey,
  mergeSettings,
  persistActivity,
  persistOnboarded,
  persistOnboardingDraft,
  persistSeenAchievements,
  persistSettings,
  persistStats,
} from './src/storage';
import { applyPractice, applyReview, dueWords, newSrs } from './src/srs';
import { activeDaySet, streakInfo } from './src/streak';
import { LANGS, initAudio } from './src/speech';
import { isVariant, pickVariant, setChosenVariants } from './src/langVariants';
import { makeT } from './src/i18n';
import { useUiLang } from './src/locale';
import { initAnalytics, analyticsAvailable, resetAnalytics, setAnalyticsEnabled, setProps, track } from './src/analytics';
import { ensureSession, eraseServerData, forgetIdentityForDev, renewSession } from './src/auth';
import { clearPersonalData, signInWithApple, signOut as leaveAccount, useAccount } from './src/account';
import { useSync, useWordStore } from './src/useSync';
import { touch } from './src/sync';
import { deletePhoto, persistPhoto } from './src/photos';
import { addScene, clearScenes, hasWord, loadScenes, persistScenes, removeScene, updateScene } from './src/scene/scenes';
import { apiMe, apiProfile, deviceForgotten } from './src/api';
import {
  addKnown,
  cleanName,
  cleanProfile,
  cleanStruggles,
  cefrFor,
  levelUpOffer,
  profileReport,
  sameProfile,
  topicName,
} from './src/profile';
import { computeMetrics, evaluate, newlyUnlocked } from './src/achievements';
import { maybeAskForReview } from './src/review';
import {
  syncWordOfDay,
  todayFrom,
  samePair,
  settingsPair,
  requestPermission,
  cancelAll,
  cancelWordOfDay,
  subscribeToNotificationTaps,
  scheduleTrialReminder,
  cancelTrialReminder,
  canRemind,
  hasPermission,
  DEFAULT_HOUR,
} from './src/wordOfDay';
import { subscribeToWidgetTaps, widgetsAvailable } from './src/widgets';
import { IcBook, IcCards, IcGear, IcScan, IcUser } from './src/icons';
import { MascotBob } from './src/Mascot';
import { Material, MaterialEdge } from './src/Chrome';
import { planOfProduct, trackPaywallImpression, usePro } from './src/purchases';

import { FadeIn } from './src/ui';
import { F, THEMES, ThemeProvider, type } from './src/theme';
import { DUR, EASE, SPRING, haptic, travel, safeSpring, useReducedMotion } from './src/motion';
import { askNotifications } from './src/notifPermission';
import {
  canScan,
  canScene,
  canUseLanguage,
  freeScans,
  freeScenes,
  loadUsage,
  saveUsage,
  scansLeft,
} from './src/subscription';

// ── v1.3: імпорти потоків. Кожен потік пише лише між своїми маркерами
// (план §5.6), тож гілки зливаються без конфліктів. ──
// <v13:W1>
import { AppState } from 'react-native';
import LangSheet from './src/LangSheet';
import StreakCelebration from './src/streak/StreakCelebration';
import { isQuizReady } from './src/QuizScreen';
import { bestStreak, phase as dayPhase } from './src/streak';
import { cancelStreakRisk, streakRiskAt, syncStreakRisk } from './src/streakNotify';
// </v13:W1>
// <v13:W2>
import { useWidgets } from './src/widgets/useWidgets';
import { resetWidgets } from './src/widgets';
import { loadFastClock } from './src/widgets/clock';
import { slotHours, wodPerDay as wodPerDayOf } from './src/wordOfDay';
import { useWodSlots } from './src/WordOfDayCard';
// </v13:W2>
// <v13:W3>
// Онбординг 3.0 і «Розробка»: скидання наліпок у «Почати з нуля» (віджети
// скидає resetWidgets з імпортів W2), перемикач «Онбординг на кожному старті».
import { Directory, Paths } from 'expo-file-system';
import { loadDevOnbAlways, persistDevOnbAlways } from './src/storage';
// </v13:W3>
// <v13:W4>
// </v13:W4>
// <v13:W5>
import { requireOptionalNativeModule } from 'expo';
import { PRO_PALETTES, resolveTheme } from './src/theme';

// Тло кореневого вікна (expo-system-ui) — у колір теми: його видно під
// аркушами під час переходів, під клавіатурою й на «гумовому» скролі, і з
// чужою палітрою там блимала б «Крейда» з app.json. Лише коли нативна частина
// є: require модуля без неї (стара збірка) — червоний екран ще до try/catch.
function setRootBackground(color) {
  if (!requireOptionalNativeModule('ExpoSystemUI')) return;
  try {
    require('expo-system-ui')
      .setBackgroundColorAsync(color)
      .catch(() => {});
  } catch (_) {}
}
// </v13:W5>

// Порядок вкладок зафіксований і не обговорюється:
// сканер — по центру, бо це головна дія застосунку і найзручніша точка для
// великого пальця; профіль — крайній лівий, налаштування — крайні праві.
const TABS = [
  { key: 'profile', Icon: IcUser, label: 'tabProfile' },
  { key: 'dict', Icon: IcBook, label: 'tabDict' },
  { key: 'scan', Icon: IcScan, label: 'tabScan' },
  { key: 'cards', Icon: IcCards, label: 'tabLearn' },
  { key: 'settings', Icon: IcGear, label: 'tabSettings' },
];

// Системний сплеш тримаємо, поки не прочитані дані й шрифти, — інакше
// людина бачила б два завантажувальні екрани поспіль.
SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ duration: 250, fade: true });

// Скільки після онбордингу чекаємо тарифи, що ще вантажаться, щоб показати
// пейвол онбордингу (див. openOnboardingPaywall): довше — людина вже гортає
// застосунок, і пейвол, що вискочив зненацька, дратував би.
const ONB_PAYWALL_WAIT_MS = 8000;

// Захисний таймер заставки: якщо читання даних чи шрифтів зависло, через стільки
// ховаємо її самі — екран завантаження з Лінго краще за застиглий кадр заставки.
const SPLASH_WATCHDOG_MS = 8000;

// Мережевий старт без id пристрою повторюємо при поверненні в застосунок, але
// не частіше (сервер дає 20 нових пристроїв на годину з однієї адреси).
const BOOT_RETRY_MS = 20000;

// Скільки найдовше чекаємо першу відповідь магазину про Pro, перш ніж просити
// слова дня: хто обрав 3 чи 5 слів на день, інакше спершу отримав би одне.
const PRO_WAIT_MS = 1500;

// Прохання про оцінку не перебиває: чекаємо, поки черга оверлеїв вільна, ще
// стільки мс, і забуваємо, якщо вона не звільнилась за REVIEW_TTL_MS.
const REVIEW_DELAY_MS = 800;
const REVIEW_TTL_MS = 2 * 60 * 1000;

// Найдовше, що вкладки тримаються замкненими на розпізнаванні (SCAN_TIMEOUT у
// api.js — 25 с): якщо сканер колись не скаже, що закінчив, не застрягаємо.
const SCAN_LOCK_MAX_MS = 30000;

// Старі й альтернативні коди мов, які віддають iOS/Android.
const LANG_ALIAS = { nb: 'no', nn: 'no', iw: 'he', in: 'id' };

// Обрані варіанти мов зі сховища: об'єкт, а не те, що могло там зіпсуватись.
function variantMap(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

// Мова перекладів («моя мова») за замовчуванням — перша з бажаних мов
// телефону, яку ми підтримуємо. Вчити — англійську; англомовним — іспанську.
// Мова інтерфейсу звідси не береться: вона завжди мовою телефону (useUiLang).
function defaultLanguages() {
  let nativeLang = 'en';
  try {
    for (const l of getLocales()) {
      const raw = (l.languageCode || (l.languageTag || '').split('-')[0] || '').toLowerCase();
      const code = LANG_ALIAS[raw] || raw;
      if (LANGS.some((x) => x.code === code)) {
        nativeLang = code;
        break;
      }
    }
  } catch (_) {}
  return { nativeLang, targetLang: nativeLang === 'en' ? 'es' : 'en' };
}

function defaultSettings() {
  return {
    ...defaultLanguages(),
    // Обрані варіанти мов навчання: { en: 'gb', es: 'latam' } (базовий код →
    // id, src/langVariants.js). Немає — варіант за замовчуванням: англійська
    // США, іспанська латиноамериканська в Америках і іспанська Іспанії деінде.
    // Слова й далі зберігаються з базовим кодом, тож зміна варіанта нічого
    // не ділить.
    variants: {},
    theme: 'system',
    wodEnabled: true,
    wodHour: DEFAULT_HOUR,
    // Профіль локальний: ім'я й аватар живуть на телефоні й не синхронізуються
    // навіть в акаунті Apple — на сервер іде лише словник. Імʼя питає й
    // онбординг («Як до тебе звертатися?») — воно те саме, що в профілі.
    profileName: '',
    avatar: 'wave',
    // Згода надсилати кадр на сервер і AI-сервісу (App Review 5.1.2(i)).
    // Питає сканер перед першим знімком — див. ConsentSheet. Поки аркуш
    // вимкнено (AI_CONSENT_SHEET у src/flags.js), сканер на неї не зважає.
    aiConsent: false,
    // Режим сканера: один предмет або вся сцена. Запам'ятовуємо, як Камера
    // iOS: хто знімає кімнати, не мусить щоразу перемикати.
    scanMode: 'object',
    // Профіль навчання (src/profile.js): цілі, сфера, рівень. null — слово
    // дня загальне, як до персоналізації.
    profile: null,
    // Англійські поняття, позначені «Знаю» на слові дня (до 500 найновіших),
    // і скільки «Знаю» поспіль — після трьох пропонуємо вищий рівень.
    knownWords: [],
    knowStreak: 0,
    // Звідки дізнались (онбординг). Разом із профілем іде на сервер;
    // profileSyncedFor — для якого id вже відправлено ('*' — не слати, доки
    // відповіді не зміняться: так після «Стерти мої дані» їх не відновлюємо).
    heardFrom: null,
    profileSyncedFor: null,
    // Що заважало вчити мову (онбординг): ключі з STRUGGLES. Лише на
    // телефоні — з них план онбордингу вибирає, про які функції розповісти.
    struggles: [],
    // Разові підказки: мʼякий пейвол після першого скану, віджет, профіль.
    // onbPaywallShown — пейвол наприкінці онбордингу вже показали: тоді
    // мʼякий після першого скану не потрібен (він лише запасний).
    introPaywallShown: false,
    onbPaywallShown: false,
    widgetTipShown: false,
    profileTipOff: false,
    // «Анонімна статистика» (src/analytics.js): за замовчуванням увімкнена,
    // вимикається в налаштуваннях. Не скидається стиранням даних — це вибір
    // людини, як мова чи тема.
    analytics: true,
    // ── v1.3 (план §5.2). Старі налаштування не мігруємо: відсутній ключ —
    // це значення звідси (mergeSettings). ──
    // Палітра Pro: 'chalk' (фірмова «Крейда») | 'ocean' | 'berry' |
    // 'graphite' | 'cocoa'. Світла / темна / авто — як і раніше, у theme.
    palette: 'chalk',
    // Скільки слів дня на день: 1, а в Pro — 3 або 5 (src/flags.js).
    wodPerDay: 1,
    // Години слів дня по слотах; null — один слот о wodHour.
    wodHours: null,
    // Віджет ховає переклад до дотику (на екрані блокування видно завжди).
    widgetHideTranslation: true,
    // Нагадування о 20:00, якщо серія під загрозою.
    streakRemind: true,
    // Свято серії: celebrated — день ('YYYY-MM-DD'), коли вже святкували
    // (і онбординг, щоб не святкувати двічі); best — рекорд серії.
    streakSeen: { celebrated: null, best: 0 },
    // «Відкрито!» на картках і квізі — показано один раз.
    unlockSeen: { cards: false, quiz: false },
  };
}

export default function App() {
  const systemScheme = useColorScheme();
  const insets = useSafeAreaInsets();
  const [fontsLoaded, fontError] = useFonts({
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  // id анонімної ідентичності пристрою (див. src/auth.js). null — сервер
  // ще не відповів; застосунок працює й без нього, крім сканування.
  const [deviceId, setDeviceId] = useState(null);

  const [tab, setTab] = useState('scan');
  // Слова — у сховищі з синхронним ref (див. useWordStore): зміни з сервера
  // зливаються з тим, що є саме зараз, і кожна зміна сама себе зберігає.
  const [words, setWords, wordsRef] = useWordStore();
  const [settings, setSettings] = useState(defaultSettings);
  // Найсвіжіші налаштування для довгих асинхронних дій («Знаю» чекає на
  // сервер): замикання бачило б ті, що були на момент тапу.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  // Обрані варіанти мов — для прапорців і озвучки на всіх екранах
  // (flagFor / speak у src/speech.js): до рендеру дітей, тож вони вже
  // бачать новий вибір.
  setChosenVariants(settings.variants);
  const targetVariant = pickVariant(settings.targetLang, settings.variants);
  const [activity, setActivity] = useState({});
  const [stats, setStats] = useState({});
  const [seenAch, setSeenAch] = useState([]);
  const [wod, setWod] = useState(null);
  // Історія сцен (див. src/scene/scenes.js), найновіші першими
  const [scenes, setScenes] = useState([]);
  const scenesRef = useRef(scenes);
  scenesRef.current = scenes;
  const [toastAch, setToastAch] = useState(null);
  // Відкритий аркуш результату скану — це нативний Modal, і все з кореня App
  // (тост, пейвол) iOS малює ПІД ним.
  const [scanSheetOpen, setScanSheetOpen] = useState(false);
  // Облік сканів за все життя запису (безкоштовно — один). Джерело правди —
  // сервер; тут лише кеш, щоб показати пейвол ще ДО зйомки і не гнати кадр,
  // який сервер однаково відхилить.
  const [usage, setUsage] = useState({ scans: 0 });
  const [paywall, setPaywall] = useState(null); // null | 'scans' | 'scene' | 'langs' | 'info' | 'intro'
  // Відкритий пейвол для асинхронних дій (покупка, відновлення, статистика)
  const paywallRef = useRef(null);
  paywallRef.current = paywall;
  // Чи зможемо нагадати про кінець пробного періоду (див. PaywallScreen)
  const [remindOk, setRemindOk] = useState(true);
  // Редактор «Слово дня під тебе» — власний шар, як пейвол
  const [profileEdit, setProfileEdit] = useState(false);
  // «Знаю»: нове слово в дорозі; пояснення, якщо воно не прийшло
  const [wodKnowing, setWodKnowing] = useState(false);
  const [wodNote, setWodNote] = useState('');
  const [share, setShare] = useState(null); // payload для картки «поділитись»
  // Онбординг відкрили повторно з налаштувань (див. finishOnboarding).
  const onbReplay = useRef(false);
  // Онбординг уже завершено: другий finishOnboarding (подвійний тап «Готово» чи
  // «Пропустити» ще до того, як екран зник) не міняє вкладку й не відкриває
  // пейвол вдруге. Знімається, коли онбординг показують знову.
  const onbFinished = useRef(false);
  // Чернетка недопройденого онбордингу з минулого запуску (див.
  // loadOnboardingDraft): знайомство продовжується з того ж кроку.
  const onbDraft = useRef(null);

  // Підписка: RevenueCat (або імітація в розробці без ключа). id пристрою —
  // це appUserID, тож сервер бачить ту саму покупку.
  const pro = usePro(deviceId);
  const sub = pro.state;
  // Стан Pro відомий, щойно usePro вперше замінив початковий { pro: false }
  // (RevenueCat чи імітація відповіли). Без магазину Pro не буває зовсім.
  const firstSub = useRef(sub);
  const subKnown = sub !== firstSub.current || pro.mode === 'unavailable';

  // Необов'язковий вхід через Apple і синхронізація словника між iPhone
  // (src/account.js, src/sync.js). Гостьовий режим працює й без цього.
  const account = useAccount(deviceId);
  const sync = useSync({
    userId: deviceId,
    enabled: ready && account.signedIn,
    words: [words, setWords, wordsRef],
    activity: [activity, setActivity],
    stats: [stats, setStats],
    seen: [seenAch, setSeenAch],
    onSignedOut: account.forget,
    onForgotten: renewIdentity,
  });
  // Акаунт, у який щойно перейшли з Pro на руках: щойно RevenueCat увійде
  // в нього, відновлюємо покупки — підписка переїде за людиною.
  const restoreFor = useRef(null);
  // Стартова вкладка (див. ефект нижче): чи вже вирішено, чи людина сама
  // перемикала вкладки, і лічильник сканів, збережений на старті
  const startTab = useRef({ decided: false, moved: false, usage: null });

  // ---------- СТАРТ ----------
  useEffect(() => {
    initAudio();
    (async () => {
      const [w, st, a, ob, stt, seen, wodCache, u, sc, draft] = await Promise.all([
        loadWords(),
        loadSettings(),
        loadActivity(),
        loadOnboarded(),
        loadStats(),
        loadSeenAchievements(),
        loadWod(),
        loadUsage(),
        loadScenes(),
        loadOnboardingDraft(),
      ]);
      // Збережене перебиває типове лише там, де справді щось збережено:
      // на свіжому встановленні мови вирішує defaultLanguages().
      const merged = mergeSettings(defaultSettings(), st);
      merged.profile = cleanProfile(merged.profile);
      merged.knownWords = addKnown(merged.knownWords, '');
      merged.struggles = cleanStruggles(merged.struggles);
      // Мʼякий пейвол — «після першого скану». Хто вже сканував до цієї
      // версії, свій перший скан давно зробив: йому не показуємо.
      if (st.introPaywallShown === undefined && ob && (w.length || sc.length)) {
        merged.introPaywallShown = true;
        persistSettings(merged);
      }
      setWords(w, { persist: false });
      settingsRef.current = merged;
      setSettings(merged);
      // Статистика — до першої події, але після того, як прочитали вибір
      // людини: вимкнула — клієнта PostHog не буде зовсім.
      initAnalytics({ enabled: merged.analytics !== false });
      setActivity(a);
      setStats(stt);
      setSeenAch(seen);
      setWod(wodCache);
      setUsage(u);
      startTab.current.usage = u;
      setScenes(sc);
      // Розробка: «Онбординг на кожному старті» — ніби онбординг ще не
      // пройдено, нічого не стираючи (для зйомки екранів)
      const devAlways = IS_DEV && ob && (await loadDevOnbAlways());
      if (devAlways) onbDevForce.current = true;
      onbDraft.current = ob ? null : draft;
      setOnboarded(ob && !devAlways);
      setReady(true);

      // Мережа — у фоні: перший екран не чекає на сервер.
      await bootNetwork();
    })();
  }, []);

  // Мережева половина старту: ідентичність, /me, слово дня. Один політ за раз:
  // старт і повернення в застосунок не мають іти одночасно. Не вдалась (перший
  // запуск у літаку, погане покриття) — id лишається порожнім, і наступну
  // спробу робить повернення в застосунок (див. retryBoot), а не лише
  // холодний старт: інакше без слова дня й сповіщень минув би весь сеанс.
  const netBoot = useRef({ busy: false, at: 0 });
  // Відповідь магазину про Pro (subKnown) для тих, хто на неї чекає
  const subKnownRef = useRef(false);
  const subWaiters = useRef([]);
  async function bootNetwork() {
    const r = netBoot.current;
    if (r.busy) return;
    r.busy = true;
    r.at = Date.now();
    try {
      const session = await ensureSession();
      if (!session) return;
      // id, що встиг прийти звідкись ще (/me, вхід через Apple), не затираємо
      setDeviceId((id) => id || session.userId);
      refreshMe();
      // Слова дня на 3 чи 5 на день (Pro) без відповіді магазину вийшли б
      // однією на день, а Pro-ефект нижче одразу перепитав би сервер ще раз:
      // коротко чекаємо на магазин, лише тих, кому це важливо.
      if (wodPerDayOf(settingsRef.current, true) > 1) await proKnown(PRO_WAIT_MS);
      // Не merged, а найсвіжіші: поки сервер відповідав, людина могла вже
      // пройти онбординг, і слова мають бути під її профіль.
      syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
    } finally {
      r.busy = false;
    }
  }
  function proKnown(ms) {
    if (subKnownRef.current) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      const timer = setTimeout(done, ms);
      subWaiters.current.push(done);
    });
  }
  subKnownRef.current = subKnown;
  useEffect(() => {
    if (subKnown) subWaiters.current.splice(0).forEach((done) => done());
  }, [subKnown]);

  // Стартова вкладка — сканер, але безкоштовний скан уже витрачено, а Pro
  // немає: камера однаково відкрила б лише пейвол, а все, що лишилось
  // безкоштовним (слово дня, картки, квіз), — у навчанні. Вирішуємо один раз,
  // коли відомі і лічильник сканів, і стан Pro (Pro може прийти пізніше за
  // лічильник — тоді чекаємо на нього). Лічильник — той, що був збережений
  // на старті: відповідь сервера за секунду вже не перекидає людину з
  // камери, на яку вона дивиться. Людина вже сама перемкнула вкладку (чи її
  // відкрило сповіщення) — нічого не чіпаємо.
  useEffect(() => {
    const st = startTab.current;
    if (st.decided || !ready || !subKnown) return;
    st.decided = true;
    if (!onboarded || st.moved || tab !== 'scan') return;
    if (!sub.pro && scansLeft({ pro: false, usage: st.usage }) === 0) setTab('cards');
  }, [ready, subKnown]);

  // Тап по сповіщенню «слово дня» відкриває вкладку навчання, де воно чекає;
  // у Pro — саме на тому слові дня (слоті), про яке було сповіщення.
  // «Не дай вогнику згаснути» о 20:00 — теж «Навчання»: одна картка рятує
  // серію (core.md C.4.5).
  const notifTap = useRef(null);
  notifTap.current = (data) => {
    if (data.type === 'word-of-day') {
      startTab.current.moved = true;
      setTab('cards');
      focusWodSlot(data.date, data.slot);
    }
    if (data.type === 'streak') {
      startTab.current.moved = true;
      setTab('cards');
      track('streak_reminder', { action: 'opened' });
    }
    if (data.type === 'trial-end') setTab('settings');
  };
  useEffect(() => subscribeToNotificationTaps((data) => notifTap.current(data)), []);

  // Тап по віджету (src/widgets/links.js): слово дня (зі слотом) —
  // «Навчання»; слово зі словника — його аркуш; «Повторити» — картки;
  // серія — Профіль. Віджет міг просити «відкрий по нові слова», поки
  // застосунок спав у фоні зі старим кешем, — тоді й підтягуємо свіжі.
  // Холодний старт (сесії ще немає) це робить сам.
  const widgetTap = useRef(null);
  widgetTap.current = (link) => {
    track('widget_open', { kind: link.kind || null, family: link.family || null, route: link.route });
    startTab.current.moved = true;
    if (link.route === 'word') {
      openWord(link.id);
      return;
    }
    if (link.route === 'streak') {
      setTab('profile');
      return;
    }
    setTab('cards');
    if (link.route !== 'word-of-day') return;
    focusWodSlot(link.date, link.slot);
    if (!deviceId) return;
    syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
  };
  useEffect(() => subscribeToWidgetTaps((link) => widgetTap.current(link)), []);

  // Серверний лічильник сканів і статус пристрою. 401 UNAUTHORIZED — сервер
  // нас забув (стерли дані, змінили секрет): тихо беремо нову ідентичність.
  // Решта помилок (офлайн, 403 APP_TOKEN) ідентичності не стосується.
  // Повертає відповідь /me або null.
  async function refreshMe(refresh = false) {
    const startedAt = Date.now();
    try {
      const me = await apiMe(refresh);
      if (me?.usage) updateUsage(me.usage);
      // user.apple — чи цей id увійшов через Apple. Після перевстановлення
      // (Keychain зберіг токен акаунта) вхід і синхронізація повертаються самі.
      account.noteMe(me, startedAt);
      // Після перевстановлення офлайн id ще не відомий (див. ensureSession) —
      // беремо його звідси, щоб покупка прив'язалась до нашого id.
      if (me?.user?.id) setDeviceId((id) => id || me.user.id);
      return me;
    } catch (e) {
      if (deviceForgotten(e)) renewIdentity();
      return null;
    }
  }

  // Нова ідентичність має свій лічильник — підтягуємо його одразу, інакше
  // старе локальне «1 з 1» блокувало б скани до наступного запуску.
  // Якщо телефон був в акаунті Apple, сервер того акаунта вже не знає (його
  // стерли з іншого iPhone): далі телефон — гість, а слова лишаються на ньому.
  async function renewIdentity() {
    const s = await renewSession();
    if (!s) return;
    sync.stop();
    account.forget();
    setDeviceId(s.userId);
    try {
      const me = await apiMe();
      if (me?.usage) updateUsage(me.usage);
    } catch (_) {}
  }

  // scans/limit — скани за все життя запису і безкоштовна стеля з сервера
  // (null — Pro); scenes/sceneLimit — так само для сцен. Дня тут немає:
  // лічильник не обнуляється. Відповідь без якогось поля (старий сервер)
  // не стирає вже відоме.
  function updateUsage(next) {
    setUsage((prev) => {
      const keep = (k) => (next[k] !== undefined ? next[k] : prev[k]);
      const u = { scans: next.scans || 0, limit: keep('limit') };
      if (keep('scenes') !== undefined) u.scenes = keep('scenes');
      if (keep('sceneLimit') !== undefined) u.sceneLimit = keep('sceneLimit');
      saveUsage(u);
      return u;
    });
  }

  // Сервер відмовив за оплатою (402). code — 'SCAN_LIMIT' (безкоштовні
  // скани: used/limit — скани за все життя) або 'SCENE_PRO' (безкоштовні
  // сцени: used/limit — теж за все життя). Повертає true, якщо той самий кадр
  // можна надіслати ще раз. Pro уже куплено, а сервер ще не знає (вебхук не
  // дійшов) — просимо його перепитати RevenueCat; стелі вже немає — пейвол
  // не потрібен.
  async function scanLimitReached(data, code = 'SCAN_LIMIT') {
    const scene = code === 'SCENE_PRO';
    if (data?.used != null) {
      if (scene) setUsage((prev) => persistUsage({ ...prev, scenes: data.used, sceneLimit: data.limit }));
      else updateUsage({ scans: data.used, limit: data.limit });
    }
    if (sub.pro) {
      const me = await refreshMe(true);
      if (me?.usage && (scene ? me.usage.sceneLimit === null : me.usage.limit === null)) return true;
    }
    const reason = scene ? 'scene' : 'scans';
    track('scan_denied', { reason, server: true });
    openPaywall(reason);
    return false;
  }

  function persistUsage(u) {
    saveUsage(u);
    return u;
  }

  // Тема: вигляд (settings.theme) + палітра (settings.palette). Без Pro —
  // «Крейда», але обрана палітра лишається в налаштуваннях і повертається з
  // Pro. Поки магазин ще не відповів (subKnown), палітру не відкочуємо:
  // інакше людина з Pro на кожному старті бачила б мить «Крейди».
  const themeKey = resolveTheme({ mode: settings.theme, palette: settings.palette, scheme: systemScheme, pro: sub.pro || !subKnown });
  const theme = THEMES[themeKey];
  const C = theme.C;
  // Інтерфейс — завжди мовою телефону, а не «моєю мовою»: та лише для
  // перекладів, і вибір її в налаштуваннях не перемикає екрани. Онбординг
  // уже з першого кадру говорить мовою телефону (див. src/locale.js).
  const ui = useUiLang();
  const t = useMemo(() => makeT(ui), [ui]);
  // Для довгих асинхронних дій (синхронізація слова дня зі старту) — щоб
  // заголовки сповіщень були мовою, актуальною на момент планування.
  const tRef = useRef(t);
  tRef.current = t;
  const s = useMemo(() => makeStyles(C, theme.isDark), [C, theme.isDark]);

  // ---------- ДОСЯГНЕННЯ ----------
  // Серія — з src/streak.js, як і в Профілі, «Навчанні» й віджеті: одне
  // число на весь застосунок. streakNow — уся інформація (doneToday,
  // todayKey, lastActiveKey), streak — саме число.
  const activeDays = useMemo(() => activeDaySet(activity, words), [activity, words]);
  // Ключ дня — залежність усього, що читає «сьогодні» (серія, слово дня):
  // застосунок, що спав у фоні, прокидається вже наступного дня, а ні слова,
  // ні активність при цьому не змінились, і мемо віддавало б учорашнє. App
  // перемальовується на 'active' і о 00:00:01 (streakClock), тож ключ міняється
  // сам, без окремого слухача.
  const dayKey = localDayKey();
  const streakNow = useMemo(() => streakInfo({ activeDays }), [activeDays, dayKey]);
  const streak = streakNow.n;

  // перевіряємо нові досягнення після кожної зміни даних
  useEffect(() => {
    if (!ready) return;
    const metrics = computeMetrics({ words, activity, stats, streak });
    const evaluated = evaluate(metrics);
    const fresh = newlyUnlocked(evaluated, seenAch);
    if (fresh.length) {
      const ids = [...seenAch, ...fresh.map((a) => a.id)];
      setSeenAch(ids);
      persistSeenAchievements(ids);
      setToastAch(fresh[0]); // показуємо перше, решта лишаться в профілі
    }
  }, [words, activity, stats, streak, ready]);

  // Коли тост показати — вирішує черга оверлеїв (регіон W1 перед рендером):
  // він чекає, поки закриються аркуш скану, пейвол, сесія карток тощо.

  // ---------- ДАНІ ----------
  // Активність дня — з неї серія і графік тижня: збережені слова, кожна
  // картка й кожна відповідь квізу. Безкоштовний скан один на все життя,
  // тож серію людина тримає навчанням, а не скануванням.
  // n — скільки дій за раз: сім слів зі сцени — це сім збережень, інакше
  // картка «Мій тиждень» рахувала б їх як одне й з'їдала б повторення.
  // Нуль не пишемо: день із нулем теж потрапив би в серію.
  function logActivity(n = 1) {
    if (!(n > 0)) return;
    const k = localDayKey();
    setActivity((prev) => {
      const next = { ...prev, [k]: (prev[k] || 0) + n };
      persistActivity(next);
      return next;
    });
  }

  // Воротар сканера. Викликається ДО зйомки: краще сказати «ні» одразу,
  // ніж витратити виклик AI і показати відмову після нього. Порядок — як на
  // сервері: спершу безкоштовні скани (сцена теж займає скан), потім
  // безкоштовна проба сцени.
  function guardScan(mode = 'object') {
    const deny = canScan({ pro: sub.pro, usage }) || (mode === 'scene' ? canScene({ pro: sub.pro, usage }) : null);
    if (deny) {
      track('scan_denied', { reason: deny, mode });
      openPaywall(deny);
      return false;
    }
    return true;
  }

  // Словник безкоштовний без меж (v1.2): слово зберігається завжди.
  // Повертає true — так сканер і слово дня знають, що збереження відбулось.
  function addWord(result, source = 'scan') {
    insertWords([result], source);
    return true;
  }

  // Слова зі сцени разом. Ті, що вже є в словнику, пропускаємо. Повертає,
  // скільки збережено. Словник беремо з ref: сцена зберігає з довгого
  // замикання, а синхронізація могла тим часом додати слова з іншого iPhone.
  function addWords(list) {
    const have = wordsRef.current;
    const fresh = [];
    for (const w of list) if (!hasWord(have, w) && !hasWord(fresh, w)) fresh.push(w);
    if (fresh.length) insertWords(fresh, 'scene');
    return fresh.length;
  }

  function insertWords(list, source = 'scan') {
    const now = Date.now();
    const before = wordsRef.current.length;
    const items = list.map((result) => ({
      id: now.toString(36) + Math.random().toString(36).slice(2, 7),
      ...result,
      // кадр зі сканера лежить у кеші — переносимо в Documents (див. photos.js)
      photo: persistPhoto(result.photo),
      addedAt: now,
      // кожна зміна слова ставить свій час — за ним синхронізація вирішує,
      // чия версія новіша (див. sync.js)
      updatedAt: now,
      srs: newSrs(),
    }));
    const next = setWords((prev) => [...prev, ...items]);
    logActivity(items.length);
    // Лише лічильники й звідки слово — самі слова в статистику не йдуть
    track('word_saved', { count: items.length, total: next.length, source });
    // «Нічна сова» і «Ранній птах» — досягнення не про кількість, а про звичку.
    // Позначаємо одноразово, коли слово збережено в характерний час.
    const h = new Date().getHours();
    if (h >= 23 || h < 5) bumpStatOnce('nightScan');
    else if (h >= 5 && h < 8) bumpStatOnce('morningScan');
    // Десяте слово — момент, коли застосунок уже приніс користь: саме тоді
    // доречно спитати про оцінку (не частіше, ніж дозволяє review.js).
    // Сцена може перескочити через десяте одразу кількома словами. Не одразу:
    // це «Зберегти» в аркуші результату, і системне вікно лягло б на
    // анімацію наліпки та закриття аркуша (див. askReviewLater).
    if (before < 10 && next.length >= 10) askReviewLater();
  }

  // Просимо оцінку не посеред дії, а коли людина вже дійшла кінця: черга
  // оверлеїв вільна (аркуш скану закрито, пейвол, свято й тост не показані)
  // ще REVIEW_DELAY_MS. Стан, а не таймер у обробнику: умови міняються самі.
  const [reviewSince, setReviewSince] = useState(0);
  function askReviewLater() {
    setReviewSince(Date.now());
  }

  // Ставить прапорець один раз — повторні виклики нічого не міняють.
  function bumpStatOnce(key) {
    setStats((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: 1 };
      persistStats(next);
      return next;
    });
  }

  // ---------- СЦЕНИ ----------
  // Свіжа сцена зі сканера: в історію (фото — у Documents) і в лічильник
  // досягнень. Повертає збережений запис — його й показує сканер.
  // Сканер кличе це наприкінці довгого запиту зі свого замикання, тож
  // список беремо з ref — найсвіжіший, а не той, що був у момент тапу.
  function sceneScanned(scene) {
    const { list, scene: stored } = addScene(scenesRef.current, scene);
    scenesRef.current = list;
    setScenes(list);
    persistScenes(list);
    bumpStat('scenes');
    return stored;
  }

  function changeScene(id, patch) {
    setScenes((prev) => {
      const next = updateScene(prev, id, patch);
      persistScenes(next);
      return next;
    });
  }

  function deleteScene(id) {
    setScenes((prev) => {
      const next = removeScene(prev, id);
      persistScenes(next);
      return next;
    });
  }

  // В акаунті видалення лишає надгробок — інакше слово повернулося б з
  // іншого iPhone при наступній синхронізації.
  function deleteWord(id) {
    const gone = wordsRef.current.find((w) => w.id === id);
    if (!gone) return;
    deletePhoto(gone.photo);
    sync.noteDeleted([gone]);
    setWords((prev) => prev.filter((w) => w.id !== id));
  }

  // practice — сесія зі слів, яким ще не час: «знаю» там не відсуває
  // наступне повторення, інакше зубріння ламало б розклад (див. srs.js).
  function reviewWord(id, known, practice) {
    const apply = practice ? applyPractice : applyReview;
    setWords((prev) => prev.map((w) => (w.id === id ? touch(apply(w, known)) : w)));
    logActivity();
  }

  // «Очистити словник» прибирає й сцени: діалог про це попереджає (див.
  // SettingsScreen), а фото сцен без слів лише займали б пам'ять телефону.
  function clearAll() {
    const all = wordsRef.current;
    all.forEach((w) => deletePhoto(w.photo));
    sync.noteDeleted(all);
    setWords([]);
    setScenes([]);
    clearScenes();
  }

  function bumpStat(key, by = 1) {
    setStats((prev) => {
      const next = { ...prev, [key]: (prev[key] || 0) + by };
      persistStats(next);
      return next;
    });
  }

  function saveSetting(patch) {
    // Найсвіжіші налаштування, а не з останнього рендера: дві зміни в одному
    // такті (ефект і обробник) інакше затирали б одна одну застарілим об'єктом.
    const cur = settingsRef.current;
    // Вчити мову, яка й так рідна, безглуздо: обрали її з іншого боку —
    // міняємо мови місцями, а не лишаємо «English → English».
    if (patch.targetLang && patch.targetLang === cur.nativeLang) {
      patch = { ...patch, nativeLang: cur.targetLang };
    } else if (patch.nativeLang && patch.nativeLang === cur.targetLang) {
      // Обмін робить колишню рідну мовою навчання — це така сама нова мова,
      // як обрана у списку «вчу», і безкоштовний ліміт діє так само.
      const deny = canUseLanguage({ pro: sub.pro, words, nextLang: cur.nativeLang });
      if (deny) {
        openPaywall(deny);
        return;
      }
      patch = { ...patch, targetLang: cur.nativeLang };
    }
    const next = { ...cur, ...patch };
    commitSettings(next);
    // мови (чи варіант мови) змінились — перезавантажуємо слово дня
    if (patch.targetLang || patch.nativeLang || patch.variants) {
      syncWordOfDay(wodArgs(next, true)).then((c) => c && setWod(c));
    }
  }

  // Нові налаштування: на екран, у ref для асинхронних дій і в сховище.
  function commitSettings(next) {
    settingsRef.current = next;
    setChosenVariants(next.variants);
    setSettings(next);
    persistSettings(next);
  }

  // Усе, що треба syncWordOfDay: мови, сповіщення, профіль, «Знаю» і
  // перекладач для теми в заголовку сповіщення — мовою інтерфейсу, як і
  // все, що пише застосунок (переклад самого слова — «моєю мовою» з сервера).
  // hours — години слотів: одна без Pro, 3 або 5 у Pro (src/wordOfDay.js).
  // Pro — з ref: старт і сповіщення кличуть це із замикань першого кадру.
  function wodArgs(st, force = false) {
    return {
      // мови з варіантами: обраний для мови навчання, для «моєї» — з регіону
      ...settingsPair(st),
      enabled: st.wodEnabled,
      hour: st.wodHour,
      hours: slotHours(st, proRef.current),
      profile: st.profile,
      known: st.knownWords,
      t: tRef.current,
      force,
    };
  }

  // Безкоштовно — одна мова навчання. Ліміт описаний у MONETIZATION.md і
  // показаний у пейволі, тож має реально діяти, а не лише рекламуватись.
  // variant — варіант мови (англійська США чи Британії…): це та сама мова,
  // тож інший варіант своєї мови ліміт не чіпає.
  function setTargetLang(code, variant) {
    const deny = canUseLanguage({ pro: sub.pro, words, nextLang: code });
    if (deny) {
      openPaywall(deny);
      return;
    }
    const patch = { targetLang: code };
    if (isVariant(code, variant)) patch.variants = { ...variantMap(settings.variants), [code]: variant };
    saveSetting(patch);
  }

  // Системний запит дозволу на сповіщення + статистика відповіді. Уже
  // дозволено — нічого не питаємо й не рахуємо: запиту не було.
  async function askPush(source) {
    if (await hasPermission()) return true;
    const granted = await requestPermission();
    track('push_permission', { granted, source });
    return granted;
  }

  async function toggleWod(value) {
    if (value) {
      // iOS після відмови вікна вже не покаже: тоді людині пояснюють і ведуть у
      // Параметри (src/notifPermission.js), а не лишають перемикач «мертвим»
      const granted = await askNotifications({ t: tRef.current, source: 'settings' });
      if (!granted) return; // користувач відмовив — лишаємо вимкненим
    }
    const next = { ...settingsRef.current, wodEnabled: value };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }

  function setWodHour(h) {
    const next = { ...settingsRef.current, wodHour: h };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }

  // ---------- СЛОВО ДНЯ ----------
  // Кеш годиться лише для тієї пари мов (і тих варіантів), з якою його брали.
  // Після зміни мови чи варіанта старий кеш живе, доки не прийде новий (а
  // офлайн — і довше), і картка показувала б слово іншої мови або
  // американське слово під британським прапорцем.
  const wodFits = samePair(wod, settingsPair(settings));
  const todayWord = useMemo(() => (wodFits ? todayFrom(wod) : null), [wod, wodFits, dayKey]);
  // «Вже збережено» — те саме слово тією самою мовою: «taxi» в англійській не
  // робить німецьке чи іспанське «taxi» збереженим (hasWord, як у сцен).
  const wodSaved = useMemo(
    () => !!todayWord && hasWord(words, { word: todayWord.word, lang: wod?.lang }),
    [todayWord, words, wod]
  );
  // Тема слова дня для рядка-кепсу («СЛОВО ДНЯ · ФІНАНСИ»); '' — загальне
  const wodTopic = useMemo(() => topicName(t, todayWord?.topic), [t, todayWord]);
  // Прийшло інше слово — пояснення про офлайн уже неактуальне
  useEffect(() => setWodNote(''), [todayWord?.date, todayWord?.word]);

  // Мова телефону змінилась на ходу (Android і веб; iOS для цього
  // перезапускає застосунок, і старт сам усе переплановує): заплановані
  // сповіщення мають тему в заголовку («Фінанси · liquidity») старою мовою —
  // переплановуємо. Кеш слів той самий, тож сервер зазвичай не питаємо.
  const uiSeen = useRef(ui);
  useEffect(() => {
    if (uiSeen.current === ui) return;
    uiSeen.current = ui;
    if (ready) syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
  }, [ui, ready]);

  // Новий день: кеш на 14 днів і сповіщення поповнюються не лише на холодному
  // старті (iOS тримає застосунок у пам'яті днями, і хто рідко «вмирає», тихо
  // скочувався б до порожнього кешу). Раз на день: ключ дня міняється, коли
  // застосунок прокинувся чи минула північ; мережі це коштує, лише коли
  // needsRefresh так вирішить. Перший кадр не рахується: старт робить своє.
  const syncedDay = useRef(dayKey);
  useEffect(() => {
    if (syncedDay.current === dayKey) return;
    syncedDay.current = dayKey;
    if (ready && deviceId) syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
  }, [dayKey]);

  function saveWordOfDay() {
    if (!todayWord || wodSaved) return;
    // Мови — ті, з якими слово прийшло від сервера, а не поточні з налаштувань.
    addWord(
      {
        word: todayWord.word,
        ipa: todayWord.ipa || '',
        translation: todayWord.translation || '',
        example: todayWord.example || '',
        exampleTranslation: todayWord.example_translation || '',
        lang: wod.lang,
        nativeLang: wod.native,
      },
      'wod'
    );
    bumpStat('wordOfDaySeen');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Збережене слово — не «легке»: серія «Знаю» поспіль переривається
    if (settingsRef.current.knowStreak) commitSettings({ ...settingsRef.current, knowStreak: 0 });
  }

  // ---------- СЛОВО ДНЯ ПІД ЛЮДИНУ ----------
  // «Знаю»: поняття — у список знайомих, і одразу нове слово з сервера
  // (сервер знайомих не дає). Офлайн нового не буде — кажемо, що «Знаю»
  // запамʼятали: підпис кешу вже інший, тож свіжі слова прийдуть із першим
  // же звʼязком.
  async function knowWordOfDay() {
    if (!todayWord || wodKnowing) return;
    const known = String(todayWord.source || todayWord.word || '').trim();
    if (!known) return;
    const cur = settingsRef.current;
    const next = { ...cur, knownWords: addKnown(cur.knownWords, known), knowStreak: (cur.knowStreak || 0) + 1 };
    commitSettings(next);
    // «Знаю» — справжня навчальна дія: серія її рахує (core.md C.1)
    logActivity(1);
    track('wod_known', { streak: next.knowStreak, level: cur.profile?.level ?? null });
    setWodNote('');
    setWodKnowing(true);
    // knownSlot: у Pro вже відкриті сьогодні слова 2…5 лишаються тими самими
    const c = await syncWordOfDay({ ...wodArgs(next, true), knownSlot: 0 });
    setWodKnowing(false);
    if (c) setWod(c);
    const fresh = c ? todayFrom(c) : null;
    const same = !fresh || String(fresh.source || fresh.word || '').trim().toLowerCase() === known.toLowerCase();
    if (same) setWodNote(t('wodKnowOffline'));
  }

  // Новий профіль (редактор, «підняти рівень»): черга тем починається з
  // сьогодні, слова — одразу нові, сповіщення й віджет — за ними, сервер
  // дізнається відповіді (див. ефект нижче).
  function applyProfile(profile) {
    const clean = cleanProfile({ ...profile, since: localDayKey() });
    if (!clean) return;
    const next = { ...settingsRef.current, profile: clean, knowStreak: 0, profileSyncedFor: null };
    commitSettings(next);
    setWodNote('');
    syncWordOfDay(wodArgs(next, true)).then((c) => c && setWod(c));
  }

  // Пропозиція після трьох «Знаю» поспіль — лише пропозиція: рівень
  // піднімається тільки з цієї кнопки, а «Лишити як є» починає лік заново.
  // Картка називає рівень за CEFR («Підняти до B2+»), а 1 і 2 на шкалі —
  // обидва A1: людині з A1 «Підняти до A1» нічого б не сказало, тож з
  // першого пропонуємо одразу A2.
  const offer = levelUpOffer(settings.profile, settings.knowStreak);
  const levelUp = offer && cefrFor(offer) === cefrFor(offer - 1) ? offer + 1 : offer;
  function acceptLevelUp() {
    if (levelUp) applyProfile({ ...settings.profile, level: levelUp });
  }
  function keepLevel() {
    commitSettings({ ...settingsRef.current, knowStreak: 0 });
  }
  // «Налаштуй слово дня під себе» — тим, у кого профілю немає, доки не сховають
  const profileTip = !settings.profile && !settings.profileTipOff;

  // Відповіді профілю — на сервер (POST /me/profile), щоб власник бачив, хто
  // ці люди й звідки прийшли. Без мережі — спробуємо з наступним запуском;
  // з іншим id (вхід через Apple) — відправимо ще раз, уже для акаунта.
  const report = useMemo(
    () => JSON.stringify(profileReport(settings.profile, settings.heardFrom)),
    [settings.profile, settings.heardFrom]
  );
  useEffect(() => {
    const done = settings.profileSyncedFor;
    if (!ready || !deviceId || done === '*' || done === deviceId || report === '{}') return;
    let alive = true;
    apiProfile(JSON.parse(report))
      .then(() => {
        const cur = settingsRef.current;
        if (!alive || JSON.stringify(profileReport(cur.profile, cur.heardFrom)) !== report) return;
        commitSettings({ ...cur, profileSyncedFor: deviceId });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, deviceId, report, settings.profileSyncedFor]);

  // ---------- ПІДПИСКА ----------
  // Pro щойно з'явився (наша покупка чи пейвол RevenueCat): пейвол геть,
  // сервер перепитує RevenueCat (знімає ліміт сканів), відгук. Пробний
  // період: нагадаємо за 2 дні до списання самі, а не покладаємось лише на
  // Apple (див. коментар у subscription.js). Таймлайн у пейволі це пообіцяв —
  // тож якщо про сповіщення ще не питали, питаємо зараз.
  function proActivated(state) {
    // ефект нижче не повторює те, що тут уже зроблено
    proHandled.current = true;
    paywallRef.current = null;
    setPaywall(null);
    refreshMe(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (state?.trial && state.until) {
      const until = state.until;
      askPush('trial').then(() => scheduleTrialReminder(until, t('trialEndTitle'), t('trialEndBody')));
    }
  }

  // Стан підписки змінюється й не через наш пейвол: «Попросити купити»
  // схвалили батьки, Customer Center відновив покупку, Pro приїхав на новий
  // телефон після logIn, пробний скасували в налаштуваннях Apple ID.
  //  - Pro щойно з'явився, а proActivated про це не знає: закриваємо
  //    пейвол, що міг лишитись відкритим, і просимо сервер перепитати
  //    RevenueCat (інакше ліміт сканів знімуть лише за наступним сканом);
  //  - нагадування про кінець пробного: пробний скасовано (willRenew false),
  //    він уже став платною підпискою чи Pro зник — прибираємо, бо «підписка
  //    почнеться за 2 дні» було б неправдою про списання; пробний триває й
  //    поновиться — ставимо (замінює таке саме), але без запиту дозволу: про
  //    нього питає лише proActivated одразу після покупки.
  // Поки магазин не відповів (subKnown), нічого не чіпаємо: стартовий
  // { pro: false } — не відповідь, і нагадування діючого пробного не мусить
  // гинути, доки RevenueCat не прокинувся.
  const proPrev = useRef(null);
  const proHandled = useRef(false);
  useEffect(() => {
    if (!subKnown) return;
    const was = proPrev.current;
    proPrev.current = sub.pro;
    if (!sub.pro) {
      proHandled.current = false;
      cancelTrialReminder();
      return;
    }
    const served = proHandled.current;
    proHandled.current = true;
    // перший відомий стан — це не «з'явився»: так Pro-користувач не отримував
    // би запит до сервера на кожному запуску
    if (was === false && !served) {
      paywallRef.current = null;
      setPaywall(null);
      refreshMe(true);
    }
    if (!sub.trial || sub.willRenew === false) cancelTrialReminder();
    else if (sub.until) scheduleTrialReminder(sub.until, t('trialEndTitle'), t('trialEndBody'));
  }, [subKnown, sub.pro, sub.trial, sub.willRenew, sub.until]);

  async function purchasePlan(planId) {
    const source = paywallRef.current;
    track('purchase_start', { plan: planId, source });
    const res = await pro.purchase(planId);
    if (res.ok) {
      track('purchase_success', { plan: planId, trial: !!res.state?.trial, source, ui: 'custom' });
      proActivated(res.state);
      // з пейволу «themes» — застосунок одразу в палітрі, яку людина дивилась
      applyThemePick();
    } else {
      // коди RevenueCat/StoreKit — числа-рядки, без тексту помилки
      track('purchase_fail', { plan: planId, cancelled: !!res.cancelled, pending: !!res.pending, error: res.error || null, source });
    }
    return res;
  }

  async function restorePurchases() {
    const next = await pro.restore();
    track('restore', { ok: !next?.error, pro: !!next?.pro, error: next?.error || null });
    if (next?.pro) {
      // Pro повернувся — пейвол більше не потрібен. Закриваємо його самі,
      // до того як PaywallScreen покличе onClose: інакше статистика
      // порахувала б відновлення як «закрили без покупки».
      proHandled.current = true;
      paywallRef.current = null;
      setPaywall(null);
      refreshMe(true);
    }
    return next;
  }

  // Пейвол, зібраний у дашборді RevenueCat (metadata поточної пропозиції
  // paywall_ui: "revenuecat"), для джерела source ('scans', 'scene', 'info',
  // 'onboarding'…). → true — його показано (купили, відновили чи просто
  // закрили); false — він вимкнений, недоступний чи впав, і треба показати
  // наш PaywallScreen. Покупка в ньому — те саме, що наша: Pro одразу,
  // сервер перепитує RevenueCat, нагадування про кінець пробного періоду.
  // view — рахувати показ (пейвол онбордингу вже порахував свій на першому
  // екрані); step — номер екрана для paywall_close.
  const rcPaywallOpen = useRef(false);
  // Той самий прапорець станом: черга оверлеїв (overlayFree) має
  // перерахуватись, коли нативний пейвол відкрився чи закрився, а ref
  // рендеру не викликає.
  const [rcOpen, setRcOpen] = useState(false);
  async function showRcPaywall(source, { view = true, step = 0 } = {}) {
    if (pro.config.ui !== 'revenuecat' || rcPaywallOpen.current) return false;
    if (view) track('paywall_view', { source, ui: 'revenuecat', offering: pro.offeringId });
    rcPaywallOpen.current = true;
    setRcOpen(true);
    let res;
    try {
      res = await pro.presentPaywall();
    } finally {
      rcPaywallOpen.current = false;
      setRcOpen(false);
    }
    if (res.fallback) return false;
    if (res.purchased || res.restored) {
      const plan = planOfProduct(res.state?.productId);
      if (res.purchased) track('purchase_success', { plan, trial: !!res.state?.trial, source, ui: 'revenuecat' });
      else track('restore', { ok: true, pro: !!res.state?.pro, error: null });
      if (res.state?.pro) proActivated(res.state);
    } else {
      track('paywall_close', { source, step, ui: 'revenuecat' });
    }
    // Вибір «3 чи 5 слів» живе до кінця свого пейвола: Pro не з'явився —
    // забуваємо, інакше пізніша покупка будь-де ввімкнула б його сама
    if (!res.state?.pro) pendingPerDay.current = 0;
    return true;
  }

  // Єдина точка входу в пейвол застосунку: стіни (скани, сцена, мови),
  // «Перейти на Pro» і мʼякий пейвол після першого скану. Спершу — пейвол
  // RevenueCat, якщо пропозиція його просить; ні — наш PaywallScreen.
  // onlyIfNone — не перебивати пейвол, що вже відкритий (мʼякий пейвол).
  // palette — для 'themes': яку палітру показати в прев'ю (тап по плитці в
  // Параметрах); куплено — застосунок бере ту, яку людина дивилась останньою.
  async function openPaywall(reason, { onlyIfNone = false, palette = null } = {}) {
    if (rcPaywallOpen.current || (onlyIfNone && paywallRef.current)) return;
    themePick.current = reason === 'themes' ? palette || PRO_PALETTES[0] : null;
    if (reason !== 'wod_per_day') pendingPerDay.current = 0;
    setPaywallPalette(themePick.current);
    if (await showRcPaywall(reason)) {
      // шаблон RevenueCat про палітри не знає: купили чи відновили там —
      // беремо ту, на яку людина натиснула
      await settleThemePick();
      return;
    }
    track('paywall_view', { source: reason, ui: 'custom', offering: pro.offeringId });
    trackPaywallImpression('custom_' + reason);
    paywallRef.current = reason;
    setPaywall(reason);
  }

  // ---------- МʼЯКИЙ ПЕЙВОЛ ПІСЛЯ ПЕРШОГО СКАНУ ----------
  // Запасний варіант пейволу онбордингу: лише якщо той ще ні разу не
  // показали (metadata пропозиції сказала «skip» чи магазин тоді не
  // відповів). Один раз за все життя застосунку: людина щойно побачила, що
  // він уміє, — найчесніший момент запропонувати пробний період. Не одразу,
  // а коли аркуш результату закрився: під нативним Modal пейвол було б не
  // видно, і слово людина має встигнути зберегти. З Pro — ніколи. У збірці
  // без магазину (пробний період нема де оформити) — теж ні, і прапорець не
  // ставимо: пропозиція дочекається збірки, де її можна прийняти.
  const introArmed = useRef(false);
  function scanned(res) {
    if (res?.usage) updateUsage(res.usage);
    const st = settingsRef.current;
    if (!st.introPaywallShown && !st.onbPaywallShown && !sub.pro && pro.mode !== 'unavailable') introArmed.current = true;
  }
  const sheetWas = useRef(false);
  useEffect(() => {
    const was = sheetWas.current;
    sheetWas.current = scanSheetOpen;
    if (!was || scanSheetOpen || !introArmed.current) return;
    introArmed.current = false;
    commitSettings({ ...settingsRef.current, introPaywallShown: true });
    if (!sub.pro) openPaywall('intro', { onlyIfNone: true });
  }, [scanSheetOpen]);

  // Таймлайн пейволу обіцяє нагадування, лише якщо його можна надіслати
  useEffect(() => {
    if (paywall) canRemind().then(setRemindOk);
  }, [paywall]);

  // Пейвол закрили без покупки (хрестик, «Продовжити безкоштовно», жест
  // «назад» VoiceOver). Після відновлення його закриває сам PaywallScreen —
  // тоді paywallRef уже порожній, і це не рахується як відмова. step — на
  // якому екрані пейволу онбордингу закрили (у решти пейволів екран один).
  function closePaywall(step) {
    const source = paywallRef.current;
    // Пейвол уже закрито зсередини (відновлення покупок: restorePurchases
    // знімає його ДО того, як PaywallScreen покличе onClose). Це не відмова, а
    // завершення: вибір «3 чи 5 слів» ще має дожити до ефекту [sub.pro], який
    // спрацює лише після перемальовки, — той самий мікротік-ланцюг його б
    // стер. Справжні закриття (хрестик, «Продовжити безкоштовно», «назад»)
    // завжди мають source і чистять усе, як і раніше.
    if (!source) {
      setPaywall(null);
      return;
    }
    const at = Number.isInteger(step) ? step : source === 'onboarding' ? onbPaywallStep.current : 0;
    if (source) track('paywall_close', { source, step: at, ui: 'custom' });
    paywallRef.current = null;
    themePick.current = null;
    // відмовились від «3 чи 5 слів» — пізніша покупка не вмикає їх сама
    pendingPerDay.current = 0;
    setPaywall(null);
  }

  // ---------- ПЕЙВОЛ ОНБОРДИНГУ ----------
  // Крок 12: лише в перший запуск, без Pro, коли магазин відповів тарифами
  // і metadata поточної пропозиції не каже onboarding_paywall: "skip".
  // Показуємо поверх вкладки навчання: закрили — людина вже там, де чекає
  // слово дня під її профіль (крок 13).
  const onbPaywallStep = useRef(0);
  // firstWord — слово, збережене першим сканом в онбордингу: на першому
  // екрані пейвола замість Lingo — наліпка людини (onboarding.md §5.13).
  // onboarding_paywall: "skip" — одразу застосунок, а пейвол людина побачить
  // на наступній спробі скану (стіна scans).
  //
  // Тарифи ще вантажаться, коли онбординг скінчився (повільна мережа на
  // першому запуску): пейвол не губимо, а чекаємо їх до ONB_PAYWALL_WAIT_MS.
  // Магазин відмовив (plansStatus 'failed', зазвичай офлайн) — не чекаємо:
  // людина побачить пейвол на стіні скану, де він сам перепитає тарифи.
  const onbPaywallWait = useRef(null);
  function openOnboardingPaywall({ firstWord = null } = {}) {
    if (sub.pro || pro.mode === 'unavailable' || pro.config.onboardingPaywall === 'skip') return;
    if (!pro.plans.length) {
      if (pro.plansStatus === 'loading') onbPaywallWait.current = { firstWord, until: Date.now() + ONB_PAYWALL_WAIT_MS };
      return;
    }
    setOnbFirstWord(firstWord || null);
    commitSettings({ ...settingsRef.current, onbPaywallShown: true });
    onbPaywallStep.current = 0;
    track('paywall_view', { source: 'onboarding', ui: pro.config.ui, offering: pro.offeringId });
    // з paywall_ui: "revenuecat" третій екран — шаблон, він порахує себе сам
    if (pro.config.ui === 'custom') trackPaywallImpression('custom_onboarding');
    paywallRef.current = 'onboarding';
    setPaywall('onboarding');
  }

  useEffect(() => {
    const wait = onbPaywallWait.current;
    if (!wait || (pro.plansStatus === 'loading' && !pro.plans.length)) return;
    onbPaywallWait.current = null;
    // не перебиваємо пейвол, що вже відкритий, і повторний онбординг
    if (Date.now() <= wait.until && onboarded && !paywallRef.current) openOnboardingPaywall(wait);
  }, [pro.plans.length, pro.plansStatus]);

  // Третій екран пейволу онбордингу — пейвол RevenueCat (paywall_ui:
  // "revenuecat"). Показали — наш шар більше не потрібен; ні — лишаємо свій.
  async function onboardingRcPaywall() {
    const shown = await showRcPaywall('onboarding', { view: false, step: 2 });
    if (shown && paywallRef.current === 'onboarding') {
      paywallRef.current = null;
      setPaywall(null);
    }
    return shown;
  }

  // Перемикач «Анонімна статистика»
  function toggleAnalytics(on) {
    commitSettings({ ...settingsRef.current, analytics: !!on });
    setAnalyticsEnabled(!!on);
  }

  // «Стерти мої дані»: запис на сервері + усе на телефоні. Кидає помилку,
  // якщо сервер недоступний, — екран налаштувань покаже її людині.
  // В акаунті Apple сервер стирає й сам акаунт зі словником та відкликає вхід.
  async function eraseEverything() {
    const session = await eraseServerData();
    sync.stop();
    wordsRef.current.forEach((w) => deletePhoto(w.photo));
    await clearLocalData();
    await clearPersonalData();
    // Не cancelAll: він знімав би й нагадування про кінець пробного періоду
    // (підписка стиранням даних не скасовується, і обіцянка пейволу «нагадаємо
    // за 2 дні» лишається в силі). Знімаємо слова дня (їхній план був під
    // стертий профіль; новий поставить syncWordOfDay нижче, якщо є мережа) і
    // нагадування про серію.
    await cancelWordOfDay();
    await cancelStreakRisk();
    // Статистика й так анонімна, але після стирання телефон — нова людина:
    // новий випадковий id PostHog, старі властивості не тягнуться за ним.
    resetAnalytics();
    // «Знаю» — теж про людину. Профіль лишається (як мова й тема), але на
    // новий запис сервера його не шлемо, доки людина сама його не змінить.
    commitSettings({ ...settingsRef.current, knownWords: [], knowStreak: 0, profileSyncedFor: '*' });
    // сховище вже порожнє — лише екран
    setWords([], { persist: false });
    setScenes([]);
    setActivity({});
    setStats({});
    setSeenAch([]);
    setWod(null);
    // віджети — у порожній стан, мініатюри й лік розкриттів — геть
    resetWidgets(tRef.current);
    // Новий запис на сервері несе лічильники стертого (carry, див.
    // auth.eraseServerData): стирання нового безкоштовного скану не дає.
    // Тож лічильник на екрані не обнуляємо, лише зберігаємо знову
    // (clearLocalData його стер), і одразу перепитуємо /me: сервер, що вже
    // забув пристрій, carry не дає — тоді там справді нуль.
    setUsage((u) => persistUsage(u));
    account.forget();
    if (session) {
      setDeviceId(session.userId);
      refreshMe();
      // Кеш слів дня стерто разом зі сповіщеннями: без нового запиту картка
      // «Навчання» порожня, а пуші мовчать аж до холодного старту. «Знаю» вже
      // порожнє, тож новий запис сервера отримує чистий план.
      syncWordOfDay(wodArgs(settingsRef.current, true)).then((c) => c && setWod(c));
    }
  }

  // ---------- АКАУНТ APPLE ----------
  // → { userId, switched } або null (людина закрила вікно Apple). Помилки —
  // з кодом, їх показує екран налаштувань. switched — цей Apple ID уже мав
  // акаунт з іншого iPhone: телефон переходить у нього, і його гостьові
  // слова зіллються з тамтешніми (синхронізація запускається сама, щойно
  // зміниться id). RevenueCat іде за id сам (usePro).
  async function signIn() {
    const hadPro = sub.pro;
    let res;
    try {
      res = await signInWithApple();
    } catch (e) {
      if (e?.code === 'SESSION') renewIdentity();
      throw e;
    }
    if (!res) return null;
    if (res.switched && hadPro) restoreFor.current = res.userId;
    account.linked(res.userId);
    setDeviceId(res.userId);
    refreshMe();
    return res;
  }

  // Pro куплено на анонімний id цього телефона, а тепер телефон в акаунті:
  // «відновити покупки» переносить підписку на акаунт, і вона діятиме на
  // всіх iPhone людини. Чекаємо нового id в usePro — інакше restore()
  // відновив би на старий.
  useEffect(() => {
    if (!deviceId || restoreFor.current !== deviceId) return;
    restoreFor.current = null;
    pro.restore().finally(() => refreshMe(true));
  }, [deviceId]);

  // Вихід: слова лишаються в акаунті, телефон стає чистим гостем. Спершу
  // пробуємо віддати несинхронізоване; не вийшло — кидаємо UNSYNCED, і
  // екран перепитає людину (force — «однаково вийти»). reason — чому не
  // вийшло: словник на стелі акаунта (DICT_FULL) — не те саме, що немає мережі.
  async function signOut({ force = false } = {}) {
    if (!force && sync.pending()) {
      const ok = await sync.syncNow();
      if (!ok || sync.pending()) throw Object.assign(new Error('UNSYNCED'), { code: 'UNSYNCED', reason: sync.lastError() });
    }
    sync.stop();
    wordsRef.current.forEach((w) => deletePhoto(w.photo));
    setWords([], { persist: false }); // сховище чистить leaveAccount нижче
    // сцени не синхронізуються, але це теж особисте: телефон стає чистим
    setScenes([]);
    setActivity({});
    setStats({});
    setSeenAch([]);
    setToastAch(null);
    account.forget();
    const session = await leaveAccount();
    setDeviceId(session ? session.userId : null);
    // лічильники сканів сервер переніс у нову ідентичність — /me їх покаже
    // (інакше вихід і новий вхід щоразу дарували б ще один безкоштовний скан).
    // Без мережі session немає, а старий токен чекає в Keychain: його понесе
    // наступна спроба (auth.startOver), а не чиста ідентичність.
    if (session) refreshMe();
  }

  // Розпізнавання об'єкта в дорозі: сервер уже зарахував скан, і якщо людина
  // зачепить вкладку (таб-бар одразу під затвором), сканер зникне разом із
  // результатом, а єдиний безкоштовний скан згорить. Тож доки сканер каже
  // «зайнятий» (onBusyChange), з нього не виходимо. Прапорець скидається сам:
  // сканер при демонтажі, зміна вкладки, стеля SCAN_LOCK_MAX_MS.
  const [scanBusy, setScanBusy] = useState(false);
  const scanLock = useRef({ on: false, at: 0 });
  function onScanBusy(on) {
    scanLock.current = { on: !!on, at: Date.now() };
    setScanBusy(!!on);
  }
  useEffect(() => {
    if (tab === 'scan') return;
    scanLock.current = { on: false, at: 0 };
    setScanBusy(false);
  }, [tab]);

  function switchTab(key) {
    const lock = scanLock.current;
    if (lock.on && tab === 'scan' && key !== 'scan' && Date.now() - lock.at < SCAN_LOCK_MAX_MS) {
      haptic('warning');
      return;
    }
    if (key !== tab) Haptics.selectionAsync();
    startTab.current.moved = true;
    setTab(key);
  }

  function finishOnboarding(result) {
    if (onbFinished.current) return;
    onbFinished.current = true;
    const replay = onbReplay.current;
    onbReplay.current = false;
    onbDevForce.current = false;
    setOnboarded(true);
    persistOnboarded();
    // Відповіді вже йдуть у налаштування — чернетка більше не потрібна
    onbDraft.current = null;
    clearOnboardingDraft();
    // Перший запуск — на вкладку навчання: там уже слово дня під щойно
    // складений профіль. Повтор — туди, звідки прийшли, у Параметри.
    setTab(replay ? 'settings' : 'cards');
    const cur = settingsRef.current;
    let next = cur;
    // Онбординг уже спитав про сповіщення — зберігаємо відповідь, щоб не
    // питати вдруге і щоб перемикач у налаштуваннях показував правду.
    // Під час повтору зважаємо лише на явне «так»: «Пропустити» там означає
    // «передивився слайди», а не «вимкни сповіщення, які я колись увімкнув».
    if (result && typeof result.wodEnabled === 'boolean' && (!replay || result.wodEnabled)) {
      next = { ...next, wodEnabled: result.wodEnabled };
    }
    // Година сповіщень з кроку «Обери, коли надсилати тобі слово дня» — і
    // після «ні»: увімкне сповіщення пізніше — прийдуть о цій годині
    if (Number.isInteger(result?.wodHour) && result.wodHour !== cur.wodHour) {
      next = { ...next, wodHour: result.wodHour };
    }
    // Перше слово зберегли в онбордингу — там уже було свято «Серія
    // почалась»: сьогоднішнє свято першої дії вдруге не показуємо (план S12)
    if (!replay && result?.scanned) {
      next = { ...next, streakSeen: { ...(cur.streakSeen || {}), celebrated: localDayKey() } };
    }
    // Профіль змінився — нова черга тем із сьогодні й нові слова одразу.
    // Ті самі відповіді (повтор, де все пропустили) нічого не скидають.
    const profileChanged = !!result && result.profile !== undefined && !sameProfile(result.profile, cur.profile);
    if (profileChanged) {
      next = { ...next, profile: cleanProfile(result.profile), knowStreak: 0, profileSyncedFor: null };
    }
    if (result?.heardFrom && result.heardFrom !== cur.heardFrom) {
      next = { ...next, heardFrom: result.heardFrom, profileSyncedFor: null };
    }
    // Імʼя й «що заважає» — лише на телефоні: на сервер не йдуть (див.
    // profileReport), у статистику — тільки «вказав / пропустив».
    if (typeof result?.name === 'string') {
      const name = cleanName(result.name);
      if (name !== (cur.profileName || '')) next = { ...next, profileName: name };
    }
    if (Array.isArray(result?.struggles)) {
      const pains = cleanStruggles(result.struggles);
      if (pains.join() !== cleanStruggles(cur.struggles).join()) next = { ...next, struggles: pains };
    }
    if (next !== cur) {
      commitSettings(next);
      syncWordOfDay(wodArgs(next, profileChanged)).then((c) => c && setWod(c));
    }
    if (!replay) openOnboardingPaywall({ firstWord: result?.firstWord });
  }

  function replayOnboarding() {
    onbFinished.current = false;
    onbReplay.current = true;
    onbDevForce.current = false;
    setOnboarded(false);
  }

  // Лише в розробці: стерти все на телефоні й ідентичність і перезапустити
  // JS — наступний старт такий самий, як після чистого встановлення
  // (повний онбординг, новий запис на сервері, новий безкоштовний скан).
  // Сервер не чіпаємо. Стирає й те, що переживає «Стерти мої дані»: фото
  // наліпок, сцени, віджети, сповіщення, вхід Apple, Keychain (токен і
  // carry), id PostHog. У релізі не робить нічого.
  async function devReset() {
    if (!IS_DEV) return;
    sync.stop();
    await cancelAll().catch(() => {});
    try {
      await resetWidgets(t);
    } catch (_) {}
    wordsRef.current.forEach((w) => deletePhoto(w.photo));
    try {
      const dir = new Directory(Paths.document, 'stickers');
      if (dir.exists) dir.delete();
    } catch (_) {}
    await clearScenes().catch(() => {});
    await clearPersonalData().catch(() => {});
    await forgetIdentityForDev().catch(() => {});
    resetAnalytics();
    await AsyncStorage.clear().catch(() => {});
    DevSettings.reload();
  }

  // Перший скан в онбордингу («Спробуй зараз»): справжній сканер — зі
  // згодою на AI і дозволом камери, як завжди, — але без пейволів посеред
  // знайомства: безкоштовний скан уже витрачено (скажімо, до перевстановлення
  // — сервер памʼятає запис) чи сервер відмовив за оплатою — просто
  // вертаємось в онбординг, а пропозицію Pro людина побачить наприкінці.
  // level — рівень, який людина щойно обрала. onExit(reason): 'closed'
  // (хрестик), 'camera_denied' (відмова в камері) — від сканера; 'limit'
  // (скан уже витрачено чи сервер відмовив за оплатою) — звідси.
  function renderFirstScan({ onSaved, onExit, level }) {
    const exit = (reason) => onExit(typeof reason === 'string' ? reason : 'closed');
    return (
      <ScannerScreen
        firstScan
        onExit={exit}
        onFirstSaved={onSaved}
        scanSource="onboarding"
        targetLang={settings.targetLang}
        nativeLang={settings.nativeLang}
        savedWords={words}
        onSaveWord={(w) => addWord(w, 'onboarding')}
        onSaveWords={addWords}
        onGuardScan={() => {
          if (!canScan({ pro: sub.pro, usage })) return true;
          track('scan_denied', { reason: 'scans', mode: 'object', source: 'onboarding' });
          exit('limit');
          return false;
        }}
        onScanned={(res) => res?.usage && updateUsage(res.usage)}
        onLimitReached={async (data, code) => {
          if (data?.used != null && code !== 'SCENE_PRO') updateUsage({ scans: data.used, limit: data.limit });
          track('scan_denied', { reason: code === 'SCENE_PRO' ? 'scene' : 'scans', server: true, source: 'onboarding' });
          exit('limit');
          return false;
        }}
        onSessionLost={renewIdentity}
        onResultVisible={setScanSheetOpen}
        aiConsent={!!settings.aiConsent}
        onAiConsent={() => saveSetting({ aiConsent: true })}
        level={level ?? settings.profile?.level}
        // камера до самого верху, як у вкладці; світлий статус-бар над нею
        // ставить сам сканер (поки видно камеру)
        bleedTop={insets.top}
        t={t}
      />
    );
  }

  function shareWeek() {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = localDayKey(d);
      days.push({ key, dow: d.getDay(), value: activity[key] || 0 });
    }
    setShare({ kind: 'week', stats: weekStats({ days, words, streak }) });
  }

  // fresh — щойно розблоковане (тап по тосту): тоді на картці «нове
  // досягнення» й сьогоднішня дата. З профілю діляться давнім — без дати.
  function shareAchievement(achievement, fresh = false) {
    setShare({ kind: 'achievement', achievement, fresh, stats: { words: words.length, streak } });
  }

  // Підказка про віджет: є лише в iOS-збірці; одразу після онбордингу (вкладка
  // «Навчання» є лише після нього), поки людина її не закрила, і не разом із
  // профільною — дві картки поспіль зсунули б самі картки для повторення за
  // край екрана. Показ рахуємо раз за запуск, щойно людина її побачила.
  const widgetTip = !profileTip && !settings.widgetTipShown && widgetsAvailable();
  const widgetTipSeen = useRef(false);
  useEffect(() => {
    if (tab !== 'cards' || !widgetTip || widgetTipSeen.current) return;
    widgetTipSeen.current = true;
    track('widget_tip', { action: 'shown' });
  }, [tab, widgetTip]);

  // Властивості людини для статистики: мови, рівень, цілі, Pro. Лише коди —
  // жодних імен, слів чи id. Перемикач статистики теж у залежностях:
  // увімкнули знову — властивості доїдуть одразу.
  useEffect(() => {
    if (!ready) return;
    setProps({
      ui_lang: ui,
      target_lang: settings.targetLang,
      // варіант мови навчання ('us', 'gb', 'es', 'latam'); у мов без
      // варіантів — null. Мова лишається базовим кодом, як і в словах.
      target_variant: isVariant(settings.targetLang, targetVariant) ? targetVariant : null,
      native_lang: settings.nativeLang,
      level: settings.profile?.level ?? null,
      goals: settings.profile?.goals || [],
      field: settings.profile?.field || null,
      pro: !!sub.pro,
    });
  }, [ready, ui, settings.nativeLang, settings.targetLang, targetVariant, settings.profile, sub.pro, settings.analytics]);

  const profile = { name: settings.profileName, avatar: settings.avatar || 'wave' };

  // Шрифт не завантажився — не застрягаємо на заставці, а йдемо далі із
  // системним шрифтом.
  const appReady = ready && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);
  // Зависло читання даних чи шрифтів: заставка не має висіти вічно — показуємо
  // екран завантаження з Лінго (він під нею вже намальований).
  useEffect(() => {
    if (appReady) return;
    const timer = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), SPLASH_WATCHDOG_MS);
    return () => clearTimeout(timer);
  }, [appReady]);

  // ---------- ВІДКРИТИ СЛОВО ----------
  // Слово в словнику за id — з наліпки останнього слова в сканері й з
  // віджетів (lingualens://word/<id>). Вкладка «Слова» відкриває його аркуш
  // один раз; видаленого слова вже немає — лишається просто вкладка.
  const [openWordId, setOpenWordId] = useState(null);
  function openWord(id) {
    startTab.current.moved = true;
    setTab('dict');
    setOpenWordId(id ? String(id) : null);
  }

  // ---------- v1.3: ПОТОКИ ----------
  // Нові хуки, стан і функції кожен потік пише лише між своїми маркерами
  // (план §5.6): між вставками різних гілок лишаються незмінені рядки, і
  // git зливає їх без конфліктів. Усе тут — до першого return.
  // <v13:W1>
  // ---------- СЕРІЯ 2.0 ----------
  // Годинник серії: фраза, чип і вечірній банер міняються о 18:00 і 22:00, а
  // день — опівночі. Перераховуємо на цих межах і щойно застосунок
  // повернувся з фону (таймери там стоять); саму серію — завжди «на зараз».
  const [streakClock, setStreakClock] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(true);
  useEffect(() => {
    const now = new Date();
    const next = [18, 22, 24]
      .map((h) => new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, 0, 1).getTime())
      .find((ms) => ms > now.getTime());
    const timer = setTimeout(() => setStreakClock(Date.now()), Math.max(1000, next - now.getTime()));
    return () => clearTimeout(timer);
  }, [streakClock]);
  const streakLive = useMemo(() => {
    const now = new Date();
    return { ...streakInfo({ activeDays, now }), phase: dayPhase(now) };
  }, [activeDays, streakClock]);
  const streakRef = useRef(streakLive);
  streakRef.current = streakLive;
  // Скільки карток чекає. «Готова» залежить від часу, а не лише від слів: без
  // годинника значок «Навчання» ранком після ночі у фоні лишався б нулем.
  const dueCount = useMemo(() => dueWords(words).length, [words, tab, streakClock]);

  // Фон: нагадування о 20:00, якщо серія під загрозою — сьогодні, а з дією
  // дня — завтра (src/streakNotify.js); повернення — свіжий годинник.
  // Ліхтарик сканера гасне сам (ScannerScreen).
  // Остання дата, на яку нагадування вже порахували: згортання застосунку
  // перепланує те саме сповіщення на ту саму годину, і «scheduled» без цього
  // рахував би перемикання між застосунками, а не нагадування.
  const riskTracked = useRef(0);
  // Старт був без мережі й id пристрою досі немає: повернулись у застосунок —
  // пробуємо мережевий старт ще раз (не частіше за BOOT_RETRY_MS).
  const retryBoot = useRef(() => {});
  retryBoot.current = () => {
    if (deviceId || !ready || Date.now() - netBoot.current.at < BOOT_RETRY_MS) return;
    bootNetwork();
  };
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      setAppActive(state === 'active');
      if (state === 'active') {
        setStreakClock(Date.now());
        retryBoot.current();
      }
      if (state !== 'background') return;
      const cur = streakRef.current;
      const at = streakRiskAt(new Date(), cur.doneToday)?.getTime() || 0;
      syncStreakRisk({ n: cur.n, doneToday: cur.doneToday, enabled: settingsRef.current.streakRemind !== false, t: tRef.current })
        .then((ok) => {
          if (!ok || riskTracked.current === at) return;
          riskTracked.current = at;
          track('streak_reminder', { action: 'scheduled' });
        })
        .catch(() => {});
    });
    return () => sub?.remove?.();
  }, []);
  // Дія дня є — сьогоднішнє вечірнє нагадування вже ні до чого (решту
  // сповіщень не чіпаємо); завтрашнє поставить фон (syncStreakRisk)
  useEffect(() => {
    if (ready && streakLive.doneToday) cancelStreakRisk();
  }, [ready, streakLive.doneToday, streakLive.todayKey]);

  // Перемикач «Нагадувати про серію» — у src/settings/StreakSection.js (сам
  // пише streakRemind і знімає заплановане); тут його лише читаємо.

  // Свято першої дії дня (core.md C.3): щойно дія перевела «сьогодні ще ні»
  // в «сьогодні так», а сьогодні ще не святкували. Позначку пишемо одразу,
  // щоб не показати двічі. Не на старті (день почався раніше — на іншому
  // iPhone чи до оновлення) і не посеред онбордингу (там своє свято): тоді
  // лише тиха позначка. Рекорд серії (best) теж тут.
  const [celebration, setCelebration] = useState(null);
  const streakStarted = useRef(false);
  useEffect(() => {
    if (!ready) return;
    const first = !streakStarted.current;
    streakStarted.current = true;
    const cur = settingsRef.current;
    const seen = cur.streakSeen || {};
    const best = Math.max(seen.best || 0, bestStreak(activeDays));
    const fresh = streakLive.doneToday && seen.celebrated !== streakLive.todayKey;
    if (!fresh && best === (seen.best || 0)) return;
    commitSettings({ ...cur, streakSeen: { ...seen, best, ...(fresh ? { celebrated: streakLive.todayKey } : null) } });
    if (fresh && !first && onboarded) setCelebration({ from: Math.max(0, streakLive.n - 1), to: streakLive.n });
  }, [ready, streakLive]);
  // Свято вже вирішене, але ефект вище ще не встиг його поставити (той самий
  // кадр): «Навчання» має знати це одразу, щоб «Відкрито!» не відіграло під ним.
  const celebrating =
    !!celebration ||
    (ready && onboarded && streakStarted.current && streakLive.doneToday && settings.streakSeen?.celebrated !== streakLive.todayKey);

  // ---------- ЧЕРГА ОВЕРЛЕЇВ (план §5.13) ----------
  // Тост досягнення й свято серії показуються лише тоді, коли нічого не
  // заважає: немає онбордингу, пейвола (і нашого, і RevenueCat), аркуша скану
  // чи сцени (нативний Modal сховав би їх під собою), сесії карток чи квізу,
  // аркуша «Поділитися», редактора профілю, вибору мови, і застосунок на
  // екрані. Інакше вони чекають. Свято — першим; тост streak_N тієї ж віхи
  // не потрібен: його медаль є в самому святі.
  const [learnSession, setLearnSession] = useState(false);
  const [langSheet, setLangSheet] = useState(false);
  const overlayFree =
    onboarded && !paywall && !rcOpen && !scanSheetOpen && !learnSession && !share && !profileEdit && !langSheet && appActive;
  useEffect(() => {
    if (celebration && toastAch?.id === 'streak_' + celebration.to) setToastAch(null);
  }, [celebration, toastAch]);
  const shownAch = overlayFree && !celebration ? toastAch : null;
  useEffect(() => {
    if (shownAch) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [shownAch]);
  // Оцінка (askReviewLater): коли черга оверлеїв вільна, ні свята, ні тоста, і
  // так REVIEW_DELAY_MS. Не дочекались за REVIEW_TTL_MS (людина пішла, повернулась
  // наступного дня) — забуваємо: вікно «оціни» при відкритті застосунку не вчасне.
  useEffect(() => {
    if (!reviewSince || !overlayFree || celebration || toastAch) return;
    const timer = setTimeout(() => {
      setReviewSince(0);
      if (Date.now() - reviewSince < REVIEW_TTL_MS) maybeAskForReview();
    }, REVIEW_DELAY_MS);
    return () => clearTimeout(timer);
  }, [reviewSince, overlayFree, celebration, toastAch]);

  // ---------- «НАВЧАННЯ» ДО ПЕРШОГО СЛОВА ----------
  // «Відкрито!» — один раз на картки й один на квіз (settings.unlockSeen).
  // Хто оновився зі старої версії вже зі словами, давно все відкрив: їм
  // позначаємо тихо. Збережене до цього запуску читаємо ще до будь-якого
  // запису, а до відповіді «Навчання» нічого не святкує.
  const unlockRaw = useRef(null);
  const [unlockKnown, setUnlockKnown] = useState(false);
  useEffect(() => {
    unlockRaw.current = loadSettings()
      .then((raw) => !raw || raw.unlockSeen === undefined)
      .catch(() => false);
  }, []);
  useEffect(() => {
    if (!ready || !unlockRaw.current) return;
    const pending = unlockRaw.current;
    unlockRaw.current = null;
    pending.then((missing) => {
      const have = wordsRef.current;
      if (missing && have.length) {
        commitSettings({ ...settingsRef.current, unlockSeen: { cards: true, quiz: isQuizReady(have) } });
      }
      setUnlockKnown(true);
    });
  }, [ready]);
  function markUnlockSeen(card) {
    const cur = settingsRef.current;
    const was = cur.unlockSeen || {};
    if (was[card]) return;
    commitSettings({ ...cur, unlockSeen: { ...was, [card]: true } });
  }

  // Чип серії → Профіль, «Прогрес», картка серії на виду
  const [profileFocus, setProfileFocus] = useState(false);
  function openStreak() {
    setProfileFocus(true);
    switchTab('profile');
  }

  // Наліпка останнього слова біля затвора — найсвіжіше за addedAt
  const lastWord = useMemo(
    () => words.reduce((best, w) => (!best || (w.addedAt || 0) >= (best.addedAt || 0) ? w : best), null),
    [words]
  );
  // </v13:W1>
  // <v13:W2>
  // ---------- ВІДЖЕТИ ----------
  // Pro — з ref: wodArgs кличуть і замикання першого кадру (старт, тапи).
  const proRef = useRef(false);
  proRef.current = !!sub.pro;
  // Три віджети (слово дня, мої слова, серія): таймлайни, тема, мініатюри.
  const widgetsOn = useWidgets({ ready, t, ui, settings, wod, words, activity, pro: sub.pro, themeKey });
  // «Прискорений час» віджетів (лише розробка) — як лишили минулого разу
  useEffect(() => {
    loadFastClock();
  }, []);

  // ---------- PRO: КІЛЬКА СЛІВ НА ДЕНЬ ----------
  // Скільки слів на день і о котрій (без Pro — одне, о wodHour).
  const wodN = wodPerDayOf(settings, sub.pro);
  const wodHours = slotHours(settings, sub.pro);
  // Вибір 3 чи 5 без Pro веде на пейвол; купили — вибір застосовується.
  const pendingPerDay = useRef(0);
  function setWodPerDay(n) {
    const count = [1, 3, 5].includes(n) ? n : 1;
    if (count > 1 && !sub.pro) {
      pendingPerDay.current = count;
      track('wod_per_day', { n: count, source: 'paywall' });
      openPaywall('wod_per_day');
      return;
    }
    pendingPerDay.current = 0;
    track('wod_per_day', { n: count, source: 'settings' });
    const cur = settingsRef.current;
    // години слотів — свіжі стартові від години першого слова
    const next = { ...cur, wodPerDay: count, wodHours: count > 1 ? slotHours({ ...cur, wodPerDay: count, wodHours: null }, true) : null };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }
  // Година слова i (0 — перше, воно ж wodHour для сповіщень без Pro).
  function setWodSlotHour(i, h) {
    const cur = settingsRef.current;
    const hours = slotHours(cur, proRef.current).slice();
    if (!Number.isInteger(h) || i < 0 || i >= hours.length) return;
    hours[i] = h;
    const next = { ...cur, wodHour: hours[0], wodHours: hours.length > 1 ? hours : cur.wodHours };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }
  // Pro прийшов (покупка) чи скінчився — інша кількість слів на день: кеш
  // перепитає сервер сам (needsRefresh), сповіщення переплануються.
  const proWas = useRef(!!sub.pro);
  useEffect(() => {
    if (proWas.current === !!sub.pro) return;
    proWas.current = !!sub.pro;
    if (sub.pro && pendingPerDay.current) {
      setWodPerDay(pendingPerDay.current);
      return;
    }
    if (ready && deviceId && wodPerDayOf(settingsRef.current, true) > 1) {
      syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
    }
  }, [sub.pro]);
  // Pro є, а сервер дав менше слів, ніж просили (покупка ще не дійшла до
  // нього): кеш перепитає сам за RETRY_PER_DAY_MS (needsRefresh), але лише
  // коли його синхронізують. Повернення застосунку на екран — такий момент;
  // інакше людина з Pro чекала б на 3 чи 5 слів до холодного старту.
  const wodNow = useRef(wod);
  wodNow.current = wod;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const c = wodNow.current;
      if (state !== 'active' || !proRef.current || !c || (c.perDay || 1) >= (c.asked || 1)) return;
      syncWordOfDay(wodArgs(settingsRef.current)).then((x) => x && setWod(x));
    });
    return () => sub?.remove?.();
  }, []);

  // Слово дня, яке відкрити на картці (тап по сповіщенню чи віджету зі
  // слотом). Лише сьогоднішнє: вчорашнє сповіщення відкриває поточне слово.
  const [wodFocus, setWodFocus] = useState(null);
  function focusWodSlot(date, slot) {
    if (date && date !== localDayKey()) return;
    setWodFocus(slot != null && Number.isInteger(Number(slot)) ? { slot: Number(slot), at: Date.now() } : null);
  }
  // Pro: усі вже відкриті слова дня для картки в «Навчанні» (крапки,
  // гортання, «Наступне слово о 19:00»). Слот 0 — те саме слово, що й
  // todayWord; решту картка зберігає й «знає» через ці дві дії.
  function saveWodSlot(w) {
    if (!w || !w.slot) return saveWordOfDay();
    if (!wod || hasWord(wordsRef.current, { word: w.word, lang: wod.lang })) return;
    addWord(
      {
        word: w.word,
        ipa: w.ipa || '',
        translation: w.translation || '',
        example: w.example || '',
        exampleTranslation: w.example_translation || '',
        lang: wod.lang,
        nativeLang: wod.native,
      },
      'wod'
    );
    bumpStat('wordOfDaySeen');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }
  async function knowWodSlot(w) {
    if (!w || !w.slot) return knowWordOfDay();
    const known = String(w.source || w.word || '').trim();
    if (!known) return;
    // так само, як «Знаю» на першому слові: лік «Знаю» поспіль (пропозиція
    // підняти рівень) і день серії — це теж дія
    const cur = settingsRef.current;
    const next = { ...cur, knownWords: addKnown(cur.knownWords, known), knowStreak: (cur.knowStreak || 0) + 1 };
    commitSettings(next);
    logActivity(1);
    track('wod_known', { streak: next.knowStreak, level: cur.profile?.level ?? null, slot: w.slot });
    // міняється лише це слово: уже відкриті сьогодні (і слот 0, який людина
    // могла зберегти) лишаються — див. keepOpenToday
    const c = await syncWordOfDay({ ...wodArgs(next, true), knownSlot: w.slot });
    if (c) setWod(c);
  }
  // Картка на «Навчанні» бере їх сама (спільне сховище в WordOfDayCard.js):
  // екран між ними про слоти не знає. Без Pro — null, картка як і була.
  useWodSlots({
    wod: wodFits ? wod : null,
    hours: wodHours,
    words,
    ui,
    focus: wodFocus,
    onSave: saveWodSlot,
    onKnow: knowWodSlot,
  });
  // </v13:W2>
  // <v13:W3>
  // ---------- ОНБОРДИНГ 3.0 ----------
  // Мови з кроку «Яку мову вчиш?» — одразу в налаштування: план, слово дня
  // й перший скан ідуть уже обраною парою. Слів на цьому кроці ще немає, тож
  // ліміт мов не діє; а якщо слова є (онбординг у розробці поверх даних),
  // безкоштовна мова вже зайнята — іншу дав би лише пейвол, тому лишаємо її.
  function onbLanguages({ targetLang, nativeLang, targetVariant } = {}) {
    const cur = settingsRef.current;
    const ok = (c) => LANGS.some((l) => l.code === c);
    const next = { ...cur };
    if (ok(nativeLang)) next.nativeLang = nativeLang;
    if (ok(targetLang) && !(wordsRef.current.length && canUseLanguage({ pro: sub.pro, words: wordsRef.current, nextLang: targetLang }))) {
      next.targetLang = targetLang;
      // варіант (англійська США чи Британії…) — разом із мовою
      if (isVariant(targetLang, targetVariant)) next.variants = { ...variantMap(cur.variants), [targetLang]: targetVariant };
    }
    if (next.targetLang === next.nativeLang) return;
    // явний вибір варіанта зберігаємо, навіть якщо він і так за замовчуванням:
    // інакше зміна регіону телефона мовчки змінила б обраний людиною варіант
    const sameVariant = variantMap(next.variants)[next.targetLang] === variantMap(cur.variants)[next.targetLang];
    if (next.targetLang === cur.targetLang && next.nativeLang === cur.nativeLang && sameVariant) return;
    commitSettings(next);
    // Повтор не складає план (prepareWod) — слово дня, віджет і сповіщення
    // беремо новою мовою одразу, як і зміна мови в налаштуваннях. Перший
    // запуск зробить це на кроці плану.
    if (onbReplay.current) syncWordOfDay(wodArgs(next, true)).then((c) => c && setWod(c));
  }

  // План онбордингу: зберегти щойно складений профіль і взяти слово дня під
  // нього — справжнє, те саме, що чекатиме в «Навчанні» (onboarding.md §5.5).
  // → слово на сьогодні або null (офлайн, сервер не встиг, інша пара мов).
  async function prepareWod(p) {
    const next = { ...settingsRef.current, profile: cleanProfile(p), knowStreak: 0, profileSyncedFor: null };
    commitSettings(next);
    const c = await syncWordOfDay(wodArgs(next, true)).catch(() => null);
    if (c) setWod(c);
    return samePair(c, settingsPair(next)) ? todayFrom(c) : null;
  }

  // Розробка: онбординг як для нового (без стирання) — з кроками сповіщень і
  // віджетів навіть там, де їх зазвичай немає (дозвіл уже вирішено, Expo Go).
  const onbDevForce = useRef(false);
  const [onbFirstWord, setOnbFirstWord] = useState(null);
  function devOnboarding() {
    if (!IS_DEV) return;
    clearOnboardingDraft();
    onbDraft.current = null;
    onbReplay.current = false;
    onbDevForce.current = true;
    onbFinished.current = false;
    setOnboarded(false);
  }
  const [devOnbAlways, setDevOnbAlwaysState] = useState(false);
  useEffect(() => {
    if (IS_DEV) loadDevOnbAlways().then(setDevOnbAlwaysState);
  }, []);
  function setDevOnbAlways(on) {
    if (!IS_DEV) return;
    setDevOnbAlwaysState(!!on);
    persistDevOnbAlways(!!on);
  }
  // Що буде після обіцянки — для статистики онбордингу
  const onbPaywallMode =
    sub.pro || pro.mode === 'unavailable' || !pro.plans.length ? 'none' : pro.config.onboardingPaywall === 'skip' ? 'skip' : 'show';
  // </v13:W3>
  // <v13:W4>
  // </v13:W4>
  // <v13:W5>
  // Корінь — у колір тла теми (див. setRootBackground)
  const rootBg = theme.C.bg;
  useEffect(() => {
    setRootBackground(rootBg);
  }, [rootBg]);

  // Пейвол «themes»: палітра, яку людина зараз дивиться (плитка в
  // Параметрах, далі кружечки в самому пейволі). Купила чи відновила Pro —
  // застосунок одразу в ній; закрила — забуваємо (closePaywall).
  const themePick = useRef(null);
  const [paywallPalette, setPaywallPalette] = useState(null);
  function previewPalette(key) {
    themePick.current = key;
    track('theme_preview', { palette: key, source: 'paywall' });
  }
  function applyThemePick() {
    const key = themePick.current;
    themePick.current = null;
    const st = settingsRef.current;
    if (!key || key === st.palette) return;
    commitSettings({ ...st, palette: key });
    track('theme_set', { palette: key, mode: st.theme || 'system' });
  }
  // Після пейволу RevenueCat: чи є тепер Pro, знає лише магазин
  async function settleThemePick() {
    if (!themePick.current) return;
    const st = await pro.refresh();
    if (st?.pro) applyThemePick();
    else themePick.current = null;
  }
  // «Відновити покупки» з пейволу «themes» — так само, як покупка
  async function restoreFromPaywall() {
    const next = await restorePurchases();
    if (next?.pro && !next.error) applyThemePick();
    return next;
  }
  // </v13:W5>

  // Додаткове для секцій Параметрів (src/settings/*: ({ ctx, extra })) —
  // кожен потік додає свої поля між своїми маркерами.
  const settingsExtra = {
    // <v13:W1>
    // </v13:W1>
    // <v13:W2>
    // «Слово дня»: Pro — 3 або 5 слів на день о своїх годинах; «Віджети».
    wodPerDay: wodN,
    wodHours,
    onSetWodPerDay: setWodPerDay,
    onSetWodSlotHour: setWodSlotHour,
    widgetsAvailable: widgetsOn,
    // </v13:W2>
    // <v13:W3>
    devOnboarding,
    devOnbAlways,
    onDevOnbAlways: setDevOnbAlways,
    // </v13:W3>
    // <v13:W4>
    // </v13:W4>
    // <v13:W5>
    // </v13:W5>
  };

  // ---------- РЕНДЕР ----------
  if (!appReady) {
    return (
      <View style={s.loader}>
        <MascotBob pose="wave" size={150} />
        <Text style={s.loaderName}>LinguaLens</Text>
        <ActivityIndicator color={C.accent} size="small" style={{ marginTop: 14 }} />
      </View>
    );
  }

  if (!onboarded) {
    return (
      <ThemeProvider value={theme}>
        <SafeAreaView style={s.safe}>
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />
          <OnboardingScreen
            t={t}
            uiLang={ui}
            onDone={finishOnboarding}
            // Перший запуск нічого не підставляє з налаштувань (там може
            // лежати перерваний запуск); повтор показує поточні відповіді
            profile={onbReplay.current ? settings.profile : null}
            heardFrom={onbReplay.current ? settings.heardFrom : null}
            name={onbReplay.current ? settings.profileName : ''}
            struggles={onbReplay.current ? settings.struggles : []}
            targetLang={settings.targetLang}
            targetVariant={targetVariant}
            nativeLang={settings.nativeLang}
            // «Моя рідна мова» (мова перекладу) стартує з мови телефона
            phoneNative={defaultLanguages().nativeLang}
            onLanguages={onbLanguages}
            prepareWod={prepareWod}
            todayWord={todayWord}
            wodHour={settings.wodHour}
            replay={onbReplay.current}
            // «Спробувати» — лише вперше, з порожнім словником і коли
            // безкоштовний скан ще не витрачено
            canWow={!onbReplay.current && words.length === 0 && scansLeft({ pro: sub.pro, usage }) > 0}
            scanUsed={!sub.pro && scansLeft({ pro: sub.pro, usage }) === 0}
            renderScanner={renderFirstScan}
            aiConsent={!!settings.aiConsent}
            onAiConsent={() => saveSetting({ aiConsent: true })}
            widgets={widgetsAvailable()}
            hasWords={words.length > 0}
            dev={onbDevForce.current ? { forcePush: true, forceWidgets: true } : null}
            paywall={onbPaywallMode}
            draft={onbReplay.current ? null : onbDraft.current}
            onDraft={persistOnboardingDraft}
          />
        </SafeAreaView>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <View style={s.safe}>
        {/* Світлий текст над камерою; над пейволом і редактором — тло застосунку */}
        <StatusBar style={theme.isDark || (tab === 'scan' && !paywall && !profileEdit) ? 'light' : 'dark'} />
        {/* Безпечна зона лише згори: таб-бар сам доходить до низу екрана й
            ховає під собою смугу домашнього індикатора, як у системних
            застосунках. Контент закінчується над індикатором. */}
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'left', 'right']}>
          <View style={{ flex: 1, marginBottom: insets.bottom }}>
            {tab === 'scan' ? (
              <ScannerScreen
                targetLang={settings.targetLang}
                nativeLang={settings.nativeLang}
                savedWords={words}
                onSaveWord={addWord}
                onSaveWords={addWords}
                onGuardScan={guardScan}
                onScanned={scanned}
                level={settings.profile?.level}
                // безкоштовну пробу сцени використано — біля «Сцени» значок
                // PRO, а вибір сцени відкриває пейвол
                sceneLocked={!!canScene({ pro: sub.pro, usage })}
                onScenePro={() => {
                  track('scan_denied', { reason: 'scene', mode: 'scene' });
                  openPaywall('scene');
                }}
                onSceneScanned={sceneScanned}
                onUpdateScene={changeScene}
                scanMode={settings.scanMode}
                onScanModeChange={(m) => saveSetting({ scanMode: m })}
                onLimitReached={scanLimitReached}
                onSessionLost={renewIdentity}
                onResultVisible={setScanSheetOpen}
                // розпізнавання об'єкта в дорозі: вкладку не міняємо (switchTab)
                onBusyChange={onScanBusy}
                aiConsent={!!settings.aiConsent}
                onAiConsent={() => saveSetting({ aiConsent: true })}
                scansLeft={scansLeft({ pro: sub.pro, usage })}
                // безкоштовний скан використано: чип «Pro · скани без обмежень»
                onOpenPro={() => openPaywall('scans')}
                // чип мови скану — той самий вибір мови, що в онбордингу
                onChangeLang={() => setLangSheet(true)}
                // наліпка останнього слова → його аркуш у словнику
                lastWord={lastWord}
                onOpenWord={openWord}
                // камера — до самого верху, під світлий статус-бар
                bleedTop={insets.top}
                t={t}
              />
            ) : null}

            {tab === 'dict' ? (
              <FadeIn style={{ flex: 1 }} dy={0}>
                <DictionaryScreen
                  words={words}
                  onDelete={deleteWord}
                  onScan={() => switchTab('scan')}
                  onShare={setShare}
                  // Від десяти слів є що втрачати — тоді й пропонуємо вхід.
                  nudge={account.loaded && account.available && !account.signedIn && !account.nudgeOff && words.length >= 10}
                  onNudge={() => switchTab('settings')}
                  onDismissNudge={account.dismissNudge}
                  scenes={scenes}
                  onSaveWords={addWords}
                  onUpdateScene={changeScene}
                  onDeleteScene={deleteScene}
                  onSceneVisible={setScanSheetOpen}
                  // openWord(id): аркуш цього слова — один раз
                  openWordId={openWordId}
                  onOpenWordDone={() => setOpenWordId(null)}
                  t={t}
                />
              </FadeIn>
            ) : null}

            {tab === 'cards' ? (
              <FadeIn style={{ flex: 1 }} dy={0}>
                <FlashcardsScreen
                  words={words}
                  onReview={reviewWord}
                  t={t}
                  wordOfDay={todayWord}
                  wodSaved={wodSaved}
                  onSaveWod={saveWordOfDay}
                  targetLang={settings.targetLang}
                  onQuizDone={(perfect, correct) => {
                    bumpStat('quizzes');
                    // Правильні відповіді — теж повторення дня (помилки вже
                    // записав reviewWord): серію тримає навчання, а не скан.
                    logActivity(correct || 0);
                    if (perfect) {
                      bumpStat('perfectQuiz');
                      askReviewLater();
                    }
                  }}
                  onOpenPro={() => openPaywall('info')}
                  // порожнє навчання: «Сканувати» веде на сканер
                  onGoScan={() => switchTab('scan')}
                  isPro={sub.pro}
                  wodTopic={wodTopic}
                  onKnowWod={knowWordOfDay}
                  wodKnowing={wodKnowing}
                  wodNote={wodNote}
                  levelUp={levelUp}
                  onLevelUp={acceptLevelUp}
                  onKeepLevel={keepLevel}
                  // профілю немає (оновились зі старої версії чи пропустили
                  // питання) — одна тиха картка, яку можна прибрати
                  profileTip={profileTip}
                  onOpenProfile={() => setProfileEdit(true)}
                  onHideProfileTip={() => commitSettings({ ...settingsRef.current, profileTipOff: true })}
                  // віджет є лише в iOS-збірці; підказка — з третього слова
                  // і не разом із профільною: дві картки поспіль зсунули б
                  // самі картки для повторення за край екрана
                  widgetTip={widgetTip}
                  onHideWidgetTip={() => {
                    track('widget_tip', { action: 'hide' });
                    commitSettings({ ...settingsRef.current, widgetTipShown: true });
                  }}
                  // до першого слова: «Сканувати» лише зі сканом у запасі
                  scansLeft={scansLeft({ pro: sub.pro, usage })}
                  onOpenPaywall={openPaywall}
                  unlockSeen={unlockKnown ? settings.unlockSeen || {} : null}
                  onUnlockSeen={markUnlockSeen}
                  // свято серії чи будь-який шар згори (пейвол онбордингу
                  // після першого слова, RevenueCat, аркуші): «Відкрито!»
                  // чекає, інакше відіграло б і позначилось показаним під ним
                  holdMoments={celebrating || !overlayFree}
                  onSessionChange={setLearnSession}
                  // серія: чип у шапці й вечірній банер
                  streak={streakLive}
                  onOpenStreak={openStreak}
                  lang={ui}
                />
              </FadeIn>
            ) : null}

            {tab === 'profile' ? (
              <FadeIn style={{ flex: 1 }} dy={0}>
                <ProfileScreen
                  words={words}
                  activity={activity}
                  stats={stats}
                  profile={profile}
                  onUpdateProfile={(patch) =>
                    saveSetting({
                      ...(patch.name !== undefined ? { profileName: patch.name } : null),
                      ...(patch.avatar ? { avatar: patch.avatar } : null),
                    })
                  }
                  onShareWeek={shareWeek}
                  onShareAchievement={(a) => shareAchievement(a)}
                  best={settings.streakSeen?.best || 0}
                  focusStreak={profileFocus}
                  onFocusDone={() => setProfileFocus(false)}
                  t={t}
                />
              </FadeIn>
            ) : null}

            {tab === 'settings' ? (
              <FadeIn style={{ flex: 1 }} dy={0}>
                <SettingsScreen
                  targetLang={settings.targetLang}
                  targetVariant={targetVariant}
                  onSetLang={setTargetLang}
                  nativeLang={settings.nativeLang}
                  onSetNative={(code) => saveSetting({ nativeLang: code })}
                  uiLang={ui}
                  themeKey={themeKey}
                  themeMode={settings.theme}
                  onSetTheme={(m) => saveSetting({ theme: m })}
                  wordsCount={words.length}
                  scenesCount={scenes.length}
                  onClearAll={clearAll}
                  onEraseEverything={eraseEverything}
                  onReplayOnb={replayOnboarding}
                  onDevReset={IS_DEV ? devReset : undefined}
                  wodEnabled={settings.wodEnabled}
                  onToggleWod={toggleWod}
                  wodHour={settings.wodHour}
                  onSetWodHour={setWodHour}
                  sub={sub}
                  onOpenPaywall={() => openPaywall('info')}
                  onManageSub={pro.manage}
                  onRestore={restorePurchases}
                  account={{ available: account.available, signedIn: account.signedIn }}
                  sync={{ status: sync.status, at: sync.at, error: sync.error }}
                  onSignIn={signIn}
                  onSignOut={signOut}
                  onSyncNow={sync.syncNow}
                  profile={settings.profile}
                  onEditProfile={() => setProfileEdit(true)}
                  analyticsAvailable={analyticsAvailable()}
                  analyticsOn={settings.analytics !== false}
                  onToggleAnalytics={toggleAnalytics}
                  // секції src/settings/* (ctx і extra)
                  settings={settings}
                  saveSetting={saveSetting}
                  commitSettings={commitSettings}
                  openPaywall={openPaywall}
                  extra={settingsExtra}
                  t={t}
                />
              </FadeIn>
            ) : null}
          </View>
        </SafeAreaView>

        {/* Таб-бар — напівпрозорий матеріал, контент проїжджає під ним. Над
            камерою — темний, як хром Камери iOS: світлий над яскравою сценою
            губив підписи вкладок. */}
        <Material camera={tab === 'scan'} style={[s.tabbar, { paddingBottom: insets.bottom + 5 }]}>
          <MaterialEdge camera={tab === 'scan'} />
          {TABS.map((tb) => (
            <TabButton
              key={tb.key}
              tb={tb}
              active={tab === tb.key}
              badge={tb.key === 'cards' ? dueCount : 0}
              locked={scanBusy && tb.key !== 'scan'}
              onPress={() => switchTab(tb.key)}
              onCamera={tab === 'scan'}
              C={C}
              s={s}
              t={t}
            />
          ))}
        </Material>

        {/* Редактор «Слово дня під тебе» — так само власним шаром, а не
            Modal: з вкладки навчання над ним ще може відкритись пейвол.
            Для VoiceOver шар — модальний: вкладки під ним не читаються, а
            жест «назад» (двома пальцями «Z») закриває редактор. */}
        {profileEdit ? (
          <OverlayLayer
            style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: C.bg }]}
            accessibilityViewIsModal
            onAccessibilityEscape={() => setProfileEdit(false)}
          >
            <ProfileEditor
              profile={settings.profile}
              targetLang={settings.targetLang}
              onSave={(p) => {
                setProfileEdit(false);
                applyProfile(p);
              }}
              onClose={() => setProfileEdit(false)}
              t={t}
            />
          </OverlayLayer>
        ) : null}

        {/* Пейвол поверх усього. Modal тут не потрібен: власний шар дає
            повний контроль над анімацією і не конфліктує з таб-баром.
            VoiceOver — як і з редактором: модальний шар, «назад» закриває. */}
        {paywall ? (
          <OverlayLayer
            style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: C.bg }]}
            accessibilityViewIsModal
            onAccessibilityEscape={() => closePaywall()}
          >
            {paywall === 'onboarding' ? (
              <OnboardingPaywall
                plans={pro.plans}
                freeScans={freeScans(usage)}
                scansLeft={scansLeft({ pro: sub.pro, usage })}
                unavailable={pro.mode === 'unavailable'}
                plansFailed={pro.plansStatus === 'failed'}
                onRetry={pro.reloadPlans}
                canRemind={remindOk}
                ui={pro.config.ui}
                onPresentRc={onboardingRcPaywall}
                onStep={(i, step) => {
                  onbPaywallStep.current = i;
                  track('paywall_step', { i, step, source: 'onboarding' });
                }}
                onClose={closePaywall}
                onPurchase={purchasePlan}
                onRestore={restorePurchases}
                onOpen={() => !pro.plans.length && pro.reloadPlans()}
                firstWord={onbFirstWord}
                lang={ui}
                t={t}
              />
            ) : (
              <PaywallScreen
                reason={paywall}
                plans={pro.plans}
                freeScans={freeScans(usage)}
                freeScenes={freeScenes(usage)}
                scansLeft={scansLeft({ pro: sub.pro, usage })}
                unavailable={pro.mode === 'unavailable'}
                plansFailed={pro.plansStatus === 'failed'}
                onRetry={pro.reloadPlans}
                canRemind={remindOk}
                palette={paywallPalette}
                onPalette={previewPalette}
                previewWord={todayWord}
                onClose={() => closePaywall()}
                onPurchase={purchasePlan}
                onRestore={restoreFromPaywall}
                onOpen={() => !pro.plans.length && pro.reloadPlans()}
                lang={ui}
                t={t}
              />
            )}
          </OverlayLayer>
        ) : null}

        {/* Спливаюче вітання з новим досягненням; тап — поділитись ним */}
        <View style={[StyleSheet.absoluteFill, { top: insets.top }]} pointerEvents="box-none">
          <AchievementToast
            achievement={shownAch}
            onHide={() => setToastAch(null)}
            onPress={(a) => shareAchievement(a, true)}
            t={t}
          />
        </View>
        {/* Свято першої дії дня — над усім, коли черга вільна */}
        <StreakCelebration
          data={overlayFree ? celebration : null}
          activeDays={activeDays}
          onDone={() => setCelebration(null)}
          onShare={(a) => shareAchievement(a, true)}
          t={t}
        />

        {/* Чип мови скану: вибір мови навчання (безкоштовно — одна мова) */}
        <LangSheet
          visible={langSheet}
          current={settings.targetLang}
          variant={targetVariant}
          native={settings.nativeLang}
          onPick={(code, variant) => {
            setLangSheet(false);
            // обраний рядок варіанта зберігаємо, навіть коли він збігається з
            // варіантом за замовчуванням (див. onbLanguages)
            if (code !== settings.targetLang || (variant && variant !== variantMap(settings.variants)[code])) setTargetLang(code, variant);
          }}
          onClose={() => setLangSheet(false)}
          t={t}
        />

        <ShareSheet visible={!!share} payload={share} onClose={() => setShare(null)} t={t} />
      </View>
    </ThemeProvider>
  );
}

// Оверлей поверх вкладок (пейвол, редактор профілю): проявляється й підіймається
// на 16 пт за DUR.sheet, крива шторки. Лише поява: закриття лишається миттєвим і
// синхронним, бо пейвол знімають покупка, відновлення й жест «назад»
// VoiceOver, і всі вони покладаються на те, що шару одразу немає. Тло — на самому
// анімованому шарі: інакше суцільний колір ставав би миттєво, а анімувався б
// лише вміст, і виходив би спалах. «Менше руху» лишає тільки проявляння.
function OverlayLayer({ style, children, ...rest }) {
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(a, {
      toValue: 1,
      duration: reduced ? DUR.micro : DUR.sheet,
      easing: reduced ? EASE.soft : EASE.drawer,
      useNativeDriver: true,
    }).start();
    return () => a.stopAnimation();
  }, []);
  const rise = travel(16);
  return (
    <Animated.View
      style={[style, { opacity: a, transform: rise ? [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [rise, 0] }) }] : [] }]}
      {...rest}
    >
      {children}
    </Animated.View>
  );
}

// Кнопка таб-бара.
// Перемикання вкладок — дія, яку роблять десятки разів на день, тож рух тут
// мінімальний і швидкий: «пігулка» проявляється, іконка ледь підростає.
// Жодного перельоту — інакше на кожен тап екран підстрибує.
// Неактивні — кольору dim (≥4.5:1), без додаткової прозорості; над камерою
// (onCamera) — білі, неактивні на 70 %, як у Камері iOS.
// «Менше руху»: без масштабу (іконка, натиск, пігулка), лишається проявляння
// пігулки й колір.
// locked — скан у дорозі, вкладку не перемкнути (switchTab): VoiceOver чує
// «недоступно», а тап дає лише попередження.
function TabButton({ tb, active, badge, locked = false, onPress, onCamera, C, s, t }) {
  const reduced = useReducedMotion();
  const color = onCamera ? (active ? '#FFFFFF' : 'rgba(255,255,255,0.7)') : active ? C.accent : C.dim;
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(a, { toValue: active ? 1 : 0, ...safeSpring(SPRING.snappy) }).start();
  }, [active]);

  // Вузли анімації будуємо раз, а не на кожен рендер App (п'ять кнопок, а App
  // перемальовується з кожною карткою): нові вузли щоразу означали б відчіплення
  // старих і створення нових на нативному боці
  const scale = useMemo(
    () => (reduced ? 1 : Animated.multiply(a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }), press)),
    [a, press, reduced]
  );
  // пігулка не виникає з нуля — стартує з 0.85
  const pillScale = useMemo(() => (reduced ? 1 : a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] })), [a, reduced]);

  return (
    <Pressable
      style={s.tabBtn}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={t(tb.label)}
      // скільки карток чекає, VoiceOver читає після назви вкладки
      accessibilityValue={badge > 0 ? { text: t('dueToday', { n: badge }) } : undefined}
      accessibilityState={locked ? { selected: active, disabled: true } : { selected: active }}
      // відгук на натиск, а не на відпускання
      onPressIn={() => {
        if (!reduced) Animated.spring(press, { toValue: 0.92, ...SPRING.snappy }).start();
      }}
      onPressOut={() => {
        if (!reduced) Animated.spring(press, { toValue: 1, ...SPRING.ui }).start();
      }}
    >
      <Animated.View style={[s.tabIconWrap, { transform: [{ scale }] }]}>
        <Animated.View
          style={[
            s.tabPill,
            {
              backgroundColor: onCamera ? 'rgba(255,255,255,0.18)' : C.accentSoft,
              opacity: a,
              transform: [{ scale: pillScale }],
            },
          ]}
        />
        {/* Іконка явно над пігулкою: пігулка має transform, а з ним на
            деяких рушіях (веб) вона малювалась би поверх іконки. */}
        <View style={{ zIndex: 1 }}>
          <tb.Icon size={24} color={color} />
        </View>
        {badge > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        // великий системний шрифт не має обрізати підписи вкладок: кегль
        // обмежений, а довге «Einstellungen» на XXL ще й трохи стискається
        maxFontSizeMultiplier={1.2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[s.tabLabel, { color }]}
        numberOfLines={1}
      >
        {t(tb.label)}
      </Text>
    </Pressable>
  );
}

const makeStyles = (C, isDark) =>
  StyleSheet.create({
    safe: { flex: 1, backgroundColor: C.bg },
    loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
    loaderName: { color: C.text, ...type(22, F.extra), marginTop: 6 },
    tabbar: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      paddingTop: 7,
      overflow: 'hidden',
    },
    tabBtn: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
    tabIconWrap: { paddingHorizontal: 14, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
    tabPill: { ...StyleSheet.absoluteFill, borderRadius: 999 },
    tabLabel: { color: C.dim, fontSize: 10, letterSpacing: 0.15, fontFamily: F.bold },
    badge: {
      position: 'absolute',
      top: -4,
      right: 2,
      zIndex: 2,
      backgroundColor: C.red,
      borderRadius: 9,
      minWidth: 18,
      height: 18,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 4,
    },
    // Біле на світлому червоному, тло теми на «живому» червоному темних тем:
    // біле там давало 2.5:1, тло теми (майже чорне) дає понад 7:1
    badgeText: { color: isDark ? C.bg : '#fff', fontSize: 10, letterSpacing: 0.2, fontFamily: F.extra },
  });
