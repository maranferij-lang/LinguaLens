import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
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
import { LANGS, initAudio } from './src/speech';
import { makeT, uiLang } from './src/i18n';
import { initAnalytics, analyticsAvailable, resetAnalytics, setAnalyticsEnabled, setProps, track } from './src/analytics';
import { ensureSession, eraseServerData, renewSession } from './src/auth';
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
  requestPermission,
  cancelAll,
  subscribeToNotificationTaps,
  scheduleTrialReminder,
  canRemind,
  hasPermission,
  DEFAULT_HOUR,
} from './src/wordOfDay';
import { subscribeToWidgetTaps, updateWordWidget, widgetsAvailable } from './src/widgets';
import { IcBook, IcCards, IcGear, IcScan, IcUser } from './src/icons';
import { MascotBob } from './src/Mascot';
import { Material, MaterialEdge } from './src/Chrome';
import { planOfProduct, trackPaywallImpression, usePro } from './src/purchases';

import { FadeIn } from './src/ui';
import { F, THEMES, ThemeProvider, resolveThemeKey, type } from './src/theme';
import { SPRING } from './src/motion';
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

// Старі й альтернативні коди мов, які віддають iOS/Android.
const LANG_ALIAS = { nb: 'no', nn: 'no', iw: 'he', in: 'id' };

// Мова інтерфейсу й перекладів за замовчуванням — перша з бажаних мов
// телефону, яку ми підтримуємо. Вчити — англійську; англомовним — іспанську.
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
    theme: 'system',
    wodEnabled: true,
    wodHour: DEFAULT_HOUR,
    // Профіль локальний: ім'я й аватар живуть на телефоні й не синхронізуються
    // навіть в акаунті Apple — на сервер іде лише словник. Імʼя питає й
    // онбординг («Як до тебе звертатися?») — воно те саме, що в профілі.
    profileName: '',
    avatar: 'wave',
    // Згода надсилати кадр на сервер і AI-сервісу (App Review 5.1.2(i)).
    // Питає сканер перед першим знімком — див. ConsentSheet.
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
  // Чернетка недопройденого онбордингу з минулого запуску (див.
  // loadOnboardingDraft): знайомство продовжується з того ж кроку.
  const onbDraft = useRef(null);

  // Підписка: RevenueCat (або імітація в розробці без ключа). id пристрою —
  // це appUserID, тож сервер бачить ту саму покупку.
  const pro = usePro(deviceId);
  const sub = pro.state;

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
      setScenes(sc);
      onbDraft.current = ob ? null : draft;
      setOnboarded(ob);
      setReady(true);

      // Мережа — у фоні: перший екран не чекає на сервер.
      const session = await ensureSession();
      if (!session) return;
      setDeviceId(session.userId);
      refreshMe();
      // Не merged, а найсвіжіші: поки сервер відповідав, людина могла вже
      // пройти онбординг, і слова мають бути під її профіль.
      syncWordOfDay(wodArgs(settingsRef.current)).then((c) => c && setWod(c));
    })();
  }, []);

  // Тап по сповіщенню «слово дня» відкриває вкладку навчання, де воно чекає.
  useEffect(
    () =>
      subscribeToNotificationTaps((data) => {
        if (data.type === 'word-of-day') setTab('cards');
        if (data.type === 'trial-end') setTab('settings');
      }),
    []
  );

  // Тап по віджету «Слово дня» — туди ж, у навчання. Віджет міг просити
  // «відкрий по нові слова», поки застосунок спав у фоні зі старим кешем, —
  // тоді й підтягуємо свіжі. Холодний старт (сесії ще немає) це робить сам.
  const widgetTap = useRef(null);
  widgetTap.current = () => {
    setTab('cards');
    if (!deviceId) return;
    syncWordOfDay(wodArgs(settings)).then((c) => c && setWod(c));
  };
  useEffect(() => subscribeToWidgetTaps(() => widgetTap.current()), []);

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

  const themeKey = resolveThemeKey(settings.theme, systemScheme);
  const theme = THEMES[themeKey];
  const C = theme.C;
  const t = useMemo(() => makeT(settings.nativeLang), [settings.nativeLang]);
  const s = useMemo(() => makeStyles(C), [C]);

  // ---------- ДОСЯГНЕННЯ ----------
  const activeDays = useMemo(() => {
    const set = new Set([
      ...Object.keys(activity),
      ...words.map((w) => localDayKey(new Date(w.addedAt || 0))),
    ]);
    set.delete(localDayKey(new Date(0)));
    return set;
  }, [activity, words]);

  const streak = useMemo(() => {
    let n = 0;
    const d = new Date();
    if (!activeDays.has(localDayKey(d))) d.setDate(d.getDate() - 1);
    while (activeDays.has(localDayKey(d))) {
      n++;
      d.setDate(d.getDate() - 1);
    }
    return n;
  }, [activeDays]);

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

  // Поки відкритий аркуш скану, вітання чекає: під Modal воно відіграло б
  // невидимим і зникло. Покажемо (і дамо відгук), щойно аркуш закриється.
  // Пейвол і редактор профілю теж його притримують: тост ліг би поверх
  // хрестика, а закрити пейвол мусить бути легко завжди.
  const shownAch = scanSheetOpen || paywall || profileEdit ? null : toastAch;
  useEffect(() => {
    if (shownAch) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [shownAch]);

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
    // Сцена може перескочити через десяте одразу кількома словами.
    if (before < 10 && next.length >= 10) maybeAskForReview();
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
    // Вчити мову, яка й так рідна, безглуздо: обрали її з іншого боку —
    // міняємо мови місцями, а не лишаємо «English → English».
    if (patch.targetLang && patch.targetLang === settings.nativeLang) {
      patch = { ...patch, nativeLang: settings.targetLang };
    } else if (patch.nativeLang && patch.nativeLang === settings.targetLang) {
      // Обмін робить колишню рідну мовою навчання — це така сама нова мова,
      // як обрана у списку «вчу», і безкоштовний ліміт діє так само.
      const deny = canUseLanguage({ pro: sub.pro, words, nextLang: settings.nativeLang });
      if (deny) {
        openPaywall(deny);
        return;
      }
      patch = { ...patch, targetLang: settings.nativeLang };
    }
    const next = { ...settings, ...patch };
    commitSettings(next);
    // мови змінились — перезавантажуємо слово дня
    if (patch.targetLang || patch.nativeLang) {
      syncWordOfDay(wodArgs(next, true)).then((c) => c && setWod(c));
    }
  }

  // Нові налаштування: на екран, у ref для асинхронних дій і в сховище.
  function commitSettings(next) {
    settingsRef.current = next;
    setSettings(next);
    persistSettings(next);
  }

  // Усе, що треба syncWordOfDay: мови, сповіщення, профіль, «Знаю» і
  // перекладач для теми в заголовку сповіщення.
  function wodArgs(st, force = false) {
    return {
      lang: st.targetLang,
      native: st.nativeLang,
      enabled: st.wodEnabled,
      hour: st.wodHour,
      profile: st.profile,
      known: st.knownWords,
      t: makeT(st.nativeLang),
      force,
    };
  }

  // Безкоштовно — одна мова навчання. Ліміт описаний у MONETIZATION.md і
  // показаний у пейволі, тож має реально діяти, а не лише рекламуватись.
  function setTargetLang(code) {
    const deny = canUseLanguage({ pro: sub.pro, words, nextLang: code });
    if (deny) {
      openPaywall(deny);
      return;
    }
    saveSetting({ targetLang: code });
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
      const granted = await askPush('settings');
      if (!granted) return; // користувач відмовив — лишаємо вимкненим
    }
    const next = { ...settingsRef.current, wodEnabled: value };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }

  function setWodHour(h) {
    const next = { ...settings, wodHour: h };
    commitSettings(next);
    syncWordOfDay(wodArgs(next)).then((c) => c && setWod(c));
  }

  // ---------- СЛОВО ДНЯ ----------
  // Кеш годиться лише для тієї пари мов, з якою його брали. Після зміни мови
  // старий кеш живе, доки не прийде новий (а офлайн — і довше), і картка
  // показувала б слово іншої мови.
  const todayWord = useMemo(
    () => (wod && wod.lang === settings.targetLang && wod.native === settings.nativeLang ? todayFrom(wod) : null),
    [wod, settings.targetLang, settings.nativeLang]
  );
  const wodSaved = useMemo(
    () => !!todayWord && words.some((w) => w.word?.toLowerCase() === todayWord.word?.toLowerCase()),
    [todayWord, words]
  );
  // Тема слова дня для рядка-кепсу («СЛОВО ДНЯ · ФІНАНСИ»); '' — загальне
  const wodTopic = useMemo(() => topicName(t, todayWord?.topic), [t, todayWord]);
  // Прийшло інше слово — пояснення про офлайн уже неактуальне
  useEffect(() => setWodNote(''), [todayWord?.date, todayWord?.word]);

  // Віджет іде за тим самим кешем: кожен новий кеш (старт, зміна мов,
  // сповіщень чи години, онбординг, стирання даних) і зміна мови
  // інтерфейсу переписують його таймлайн. До завантаження даних — ні:
  // інакше віджет на мить показав би «відкрий застосунок».
  useEffect(() => {
    if (ready) updateWordWidget(wod, { t, targetLang: settings.targetLang, nativeLang: settings.nativeLang });
  }, [ready, wod, t, settings.targetLang, settings.nativeLang]);

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
    track('wod_known', { streak: next.knowStreak, level: cur.profile?.level ?? null });
    setWodNote('');
    setWodKnowing(true);
    const c = await syncWordOfDay(wodArgs(next, true));
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
  const levelUp = levelUpOffer(settings.profile, settings.knowStreak);
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
    paywallRef.current = null;
    setPaywall(null);
    refreshMe(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (state?.trial && state.until) {
      const until = state.until;
      askPush('trial').then(() => scheduleTrialReminder(until, t('trialEndTitle'), t('trialEndBody')));
    }
  }

  async function purchasePlan(planId) {
    const source = paywallRef.current;
    track('purchase_start', { plan: planId, source });
    const res = await pro.purchase(planId);
    if (res.ok) {
      track('purchase_success', { plan: planId, trial: !!res.state?.trial, source, ui: 'custom' });
      proActivated(res.state);
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
  async function showRcPaywall(source, { view = true, step = 0 } = {}) {
    if (pro.config.ui !== 'revenuecat' || rcPaywallOpen.current) return false;
    if (view) track('paywall_view', { source, ui: 'revenuecat', offering: pro.offeringId });
    rcPaywallOpen.current = true;
    let res;
    try {
      res = await pro.presentPaywall();
    } finally {
      rcPaywallOpen.current = false;
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
    return true;
  }

  // Єдина точка входу в пейвол застосунку: стіни (скани, сцена, мови),
  // «Перейти на Pro» і мʼякий пейвол після першого скану. Спершу — пейвол
  // RevenueCat, якщо пропозиція його просить; ні — наш PaywallScreen.
  // onlyIfNone — не перебивати пейвол, що вже відкритий (мʼякий пейвол).
  async function openPaywall(reason, { onlyIfNone = false } = {}) {
    if (rcPaywallOpen.current || (onlyIfNone && paywallRef.current)) return;
    if (await showRcPaywall(reason)) return;
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
    const at = Number.isInteger(step) ? step : source === 'onboarding' ? onbPaywallStep.current : 0;
    if (source) track('paywall_close', { source, step: at, ui: 'custom' });
    paywallRef.current = null;
    setPaywall(null);
  }

  // ---------- ПЕЙВОЛ ОНБОРДИНГУ ----------
  // Крок 12: лише в перший запуск, без Pro, коли магазин відповів тарифами
  // і metadata поточної пропозиції не каже onboarding_paywall: "skip".
  // Показуємо поверх вкладки навчання: закрили — людина вже там, де чекає
  // слово дня під її профіль (крок 13).
  const onbPaywallStep = useRef(0);
  function openOnboardingPaywall() {
    if (sub.pro || pro.mode === 'unavailable' || !pro.plans.length || pro.config.onboardingPaywall === 'skip') return;
    commitSettings({ ...settingsRef.current, onbPaywallShown: true });
    onbPaywallStep.current = 0;
    track('paywall_view', { source: 'onboarding', ui: pro.config.ui, offering: pro.offeringId });
    // з paywall_ui: "revenuecat" третій екран — шаблон, він порахує себе сам
    if (pro.config.ui === 'custom') trackPaywallImpression('custom_onboarding');
    paywallRef.current = 'onboarding';
    setPaywall('onboarding');
  }

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
    await cancelAll();
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

  function switchTab(key) {
    if (key !== tab) Haptics.selectionAsync();
    setTab(key);
  }

  function finishOnboarding(result) {
    const replay = onbReplay.current;
    onbReplay.current = false;
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
    if (!replay) openOnboardingPaywall();
  }

  function replayOnboarding() {
    onbReplay.current = true;
    setOnboarded(false);
  }

  // Перший скан в онбордингу («Спробуй зараз»): справжній сканер — зі
  // згодою на AI і дозволом камери, як завжди, — але без пейволів посеред
  // знайомства: безкоштовний скан уже витрачено (скажімо, до перевстановлення
  // — сервер памʼятає запис) чи сервер відмовив за оплатою — просто
  // вертаємось в онбординг, а пропозицію Pro людина побачить наприкінці.
  // level — рівень, який людина щойно обрала.
  function renderFirstScan({ onSaved, onClose, level }) {
    return (
      <ScannerScreen
        firstScan
        onExit={onClose}
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
          onClose();
          return false;
        }}
        onScanned={(res) => res?.usage && updateUsage(res.usage)}
        onLimitReached={async (data, code) => {
          if (data?.used != null && code !== 'SCENE_PRO') updateUsage({ scans: data.used, limit: data.limit });
          track('scan_denied', { reason: code === 'SCENE_PRO' ? 'scene' : 'scans', server: true, source: 'onboarding' });
          onClose();
          return false;
        }}
        onSessionLost={renewIdentity}
        onResultVisible={setScanSheetOpen}
        aiConsent={!!settings.aiConsent}
        onAiConsent={() => saveSetting({ aiConsent: true })}
        level={level ?? settings.profile?.level}
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

  // Підказка про віджет: є лише в iOS-збірці; з третього слова і не разом із
  // профільною — дві картки поспіль зсунули б самі картки для повторення за
  // край екрана. Показ рахуємо раз за запуск, щойно людина її побачила.
  const widgetTip = !profileTip && !settings.widgetTipShown && words.length >= 3 && widgetsAvailable();
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
      ui_lang: uiLang(settings.nativeLang),
      target_lang: settings.targetLang,
      native_lang: settings.nativeLang,
      level: settings.profile?.level ?? null,
      goals: settings.profile?.goals || [],
      field: settings.profile?.field || null,
      pro: !!sub.pro,
    });
  }, [ready, settings.nativeLang, settings.targetLang, settings.profile, sub.pro, settings.analytics]);

  const dueCount = useMemo(() => dueWords(words).length, [words, tab]);
  const profile = { name: settings.profileName, avatar: settings.avatar || 'wave' };

  // Шрифт не завантажився — не застрягаємо на заставці, а йдемо далі із
  // системним шрифтом.
  const appReady = ready && (fontsLoaded || !!fontError);
  useEffect(() => {
    if (appReady) SplashScreen.hideAsync().catch(() => {});
  }, [appReady]);

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
            onDone={finishOnboarding}
            profile={settings.profile}
            heardFrom={settings.heardFrom}
            name={settings.profileName}
            struggles={settings.struggles}
            targetLang={settings.targetLang}
            wodHour={settings.wodHour}
            replay={onbReplay.current}
            // «Спробуй зараз» — лише вперше, з порожнім словником і коли
            // безкоштовний скан ще не витрачено
            canWow={!onbReplay.current && words.length === 0 && scansLeft({ pro: sub.pro, usage }) > 0}
            renderScanner={renderFirstScan}
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
                aiConsent={!!settings.aiConsent}
                onAiConsent={() => saveSetting({ aiConsent: true })}
                scansLeft={scansLeft({ pro: sub.pro, usage })}
                t={t}
              />
            ) : null}

            {tab === 'dict' ? (
              <FadeIn style={{ flex: 1 }} dy={10}>
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
                  t={t}
                />
              </FadeIn>
            ) : null}

            {tab === 'cards' ? (
              <FadeIn style={{ flex: 1 }} dy={10}>
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
                      maybeAskForReview();
                    }
                  }}
                  onOpenPro={() => openPaywall('info')}
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
                />
              </FadeIn>
            ) : null}

            {tab === 'profile' ? (
              <FadeIn style={{ flex: 1 }} dy={10}>
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
                  t={t}
                />
              </FadeIn>
            ) : null}

            {tab === 'settings' ? (
              <FadeIn style={{ flex: 1 }} dy={10}>
                <SettingsScreen
                  targetLang={settings.targetLang}
                  onSetLang={setTargetLang}
                  nativeLang={settings.nativeLang}
                  onSetNative={(code) => saveSetting({ nativeLang: code })}
                  themeKey={themeKey}
                  themeMode={settings.theme}
                  onSetTheme={(m) => saveSetting({ theme: m })}
                  wordsCount={words.length}
                  scenesCount={scenes.length}
                  onClearAll={clearAll}
                  onEraseEverything={eraseEverything}
                  onReplayOnb={replayOnboarding}
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
                  t={t}
                />
              </FadeIn>
            ) : null}
          </View>
        </SafeAreaView>

        {/* Таб-бар — напівпрозорий матеріал, контент проїжджає під ним */}
        <Material style={[s.tabbar, { paddingBottom: insets.bottom + 5 }]}>
          <MaterialEdge />
          {TABS.map((tb) => (
            <TabButton
              key={tb.key}
              tb={tb}
              active={tab === tb.key}
              badge={tb.key === 'cards' ? dueCount : 0}
              onPress={() => switchTab(tb.key)}
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
          <View
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
          </View>
        ) : null}

        {/* Пейвол поверх усього. Modal тут не потрібен: власний шар дає
            повний контроль над анімацією і не конфліктує з таб-баром.
            VoiceOver — як і з редактором: модальний шар, «назад» закриває. */}
        {paywall ? (
          <View
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
                lang={settings.nativeLang}
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
                onClose={() => closePaywall()}
                onPurchase={purchasePlan}
                onRestore={restorePurchases}
                onOpen={() => !pro.plans.length && pro.reloadPlans()}
                lang={settings.nativeLang}
                t={t}
              />
            )}
          </View>
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

        <ShareSheet visible={!!share} payload={share} onClose={() => setShare(null)} t={t} />
      </View>
    </ThemeProvider>
  );
}

// Кнопка таб-бара.
// Перемикання вкладок — дія, яку роблять десятки разів на день, тож рух тут
// мінімальний і швидкий: «пігулка» проявляється, іконка ледь підростає.
// Жодного перельоту — інакше на кожен тап екран підстрибує.
function TabButton({ tb, active, badge, onPress, C, s, t }) {
  const a = useRef(new Animated.Value(active ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.spring(a, { toValue: active ? 1 : 0, ...SPRING.snappy }).start();
  }, [active]);

  const scale = Animated.multiply(
    a.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }),
    press
  );

  return (
    <Pressable
      style={s.tabBtn}
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={t(tb.label)}
      accessibilityState={{ selected: active }}
      // відгук на натиск, а не на відпускання
      onPressIn={() => Animated.spring(press, { toValue: 0.92, ...SPRING.snappy }).start()}
      onPressOut={() => Animated.spring(press, { toValue: 1, ...SPRING.ui }).start()}
    >
      <Animated.View style={[s.tabIconWrap, { transform: [{ scale }] }]}>
        <Animated.View
          style={[
            s.tabPill,
            {
              backgroundColor: C.accentSoft,
              opacity: a,
              // пігулка не виникає з нуля — стартує з 0.85
              transform: [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }],
            },
          ]}
        />
        {/* Іконка явно над пігулкою: пігулка має transform, а з ним на
            деяких рушіях (веб) вона малювалась би поверх іконки. */}
        <View style={{ zIndex: 1 }}>
          <tb.Icon size={24} color={active ? C.accent : C.faint} />
        </View>
        {badge > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text
        // великий системний шрифт не має обрізати підписи вкладок: кегль
        // обмежений, а довге «Einstellungen» на XXL ще й трохи стискається
        maxFontSizeMultiplier={1.2}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={[
          s.tabLabel,
          active && { color: C.accent },
          { opacity: a.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) },
        ]}
        numberOfLines={1}
      >
        {t(tb.label)}
      </Animated.Text>
    </Pressable>
  );
}

const makeStyles = (C) =>
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
    tabLabel: { color: C.faint, fontSize: 10, letterSpacing: 0.15, fontFamily: F.bold },
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
    badgeText: { color: '#fff', fontSize: 10, letterSpacing: 0.2, fontFamily: F.extra },
  });
