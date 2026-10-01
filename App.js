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
import ShareSheet from './src/share/ShareSheet';
import { weekStats } from './src/share/layout';
import {
  clearLocalData,
  loadActivity,
  loadOnboarded,
  loadSeenAchievements,
  loadSettings,
  loadStats,
  loadWords,
  loadWod,
  localDayKey,
  mergeSettings,
  persistActivity,
  persistOnboarded,
  persistSeenAchievements,
  persistSettings,
  persistStats,
  persistWords,
} from './src/storage';
import { applyPractice, applyReview, dueWords, newSrs } from './src/srs';
import { LANGS, initAudio } from './src/speech';
import { makeT } from './src/i18n';
import { ensureSession, eraseServerData, renewSession } from './src/auth';
import { deletePhoto, persistPhoto } from './src/photos';
import { addScene, clearScenes, hasWord, loadScenes, persistScenes, removeScene, updateScene } from './src/scene/scenes';
import { apiMe, deviceForgotten } from './src/api';
import { computeMetrics, evaluate, newlyUnlocked } from './src/achievements';
import { maybeAskForReview } from './src/review';
import {
  syncWordOfDay,
  todayFrom,
  requestPermission,
  cancelAll,
  subscribeToNotificationTaps,
  scheduleTrialReminder,
  DEFAULT_HOUR,
} from './src/wordOfDay';
import { IcBook, IcCards, IcGear, IcScan, IcUser } from './src/icons';
import { MascotBob } from './src/Mascot';
import { Material, MaterialEdge } from './src/Chrome';
import { usePro } from './src/purchases';

import { FadeIn } from './src/ui';
import { F, THEMES, ThemeProvider, resolveThemeKey, type } from './src/theme';
import { SPRING } from './src/motion';
import { canSaveWord, canScan, canUseLanguage, freeScansPerDay, loadUsage, saveUsage, scansLeft } from './src/subscription';

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
    // Профіль локальний: у v1 немає акаунтів, ім'я й аватар живуть на телефоні.
    profileName: '',
    avatar: 'wave',
    // Згода надсилати кадр на сервер і AI-сервісу (App Review 5.1.2(i)).
    // Питає сканер перед першим знімком — див. ConsentSheet.
    aiConsent: false,
    // Режим сканера: один предмет або вся сцена. Запам'ятовуємо, як Камера
    // iOS: хто знімає кімнати, не мусить щоразу перемикати.
    scanMode: 'object',
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
  const [words, setWords] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
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
  // Денний облік сканів. Джерело правди — сервер; тут лише кеш, щоб
  // показати пейвол ще ДО зйомки і не гнати кадр, який сервер однаково відхилить.
  const [usage, setUsage] = useState({ scans: 0 });
  const [paywall, setPaywall] = useState(null); // null | 'scans' | 'words' | 'langs' | 'info'
  const [share, setShare] = useState(null); // payload для картки «поділитись»
  // Слова, які не влізли в безкоштовний словник (одне зі сканера або решта
  // сцени). Якщо людина тут же оформить Pro, зберігаємо їх самі — інакше
  // відскановані предмети просто пропали б.
  const pendingWords = useRef(null);
  // Онбординг відкрили повторно з налаштувань (див. finishOnboarding).
  const onbReplay = useRef(false);

  // Підписка: RevenueCat (або імітація в розробці без ключа). id пристрою —
  // це appUserID, тож сервер бачить ту саму покупку.
  const pro = usePro(deviceId);
  const sub = pro.state;

  // ---------- СТАРТ ----------
  useEffect(() => {
    initAudio();
    (async () => {
      const [w, st, a, ob, stt, seen, wodCache, u, sc] = await Promise.all([
        loadWords(),
        loadSettings(),
        loadActivity(),
        loadOnboarded(),
        loadStats(),
        loadSeenAchievements(),
        loadWod(),
        loadUsage(),
        loadScenes(),
      ]);
      // Збережене перебиває типове лише там, де справді щось збережено:
      // на свіжому встановленні мови вирішує defaultLanguages().
      const merged = mergeSettings(defaultSettings(), st);
      setWords(w);
      setSettings(merged);
      setActivity(a);
      setStats(stt);
      setSeenAch(seen);
      setWod(wodCache);
      setUsage(u);
      setScenes(sc);
      setOnboarded(ob);
      setReady(true);

      // Мережа — у фоні: перший екран не чекає на сервер.
      const session = await ensureSession();
      if (!session) return;
      setDeviceId(session.userId);
      refreshMe();
      syncWordOfDay({
        lang: merged.targetLang,
        native: merged.nativeLang,
        enabled: merged.wodEnabled,
        hour: merged.wodHour,
      }).then((c) => c && setWod(c));
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

  // Серверний лічильник сканів і статус пристрою. 401 UNAUTHORIZED — сервер
  // нас забув (стерли дані, змінили секрет): тихо беремо нову ідентичність.
  // Решта помилок (офлайн, 403 APP_TOKEN) ідентичності не стосується.
  // Повертає відповідь /me або null.
  async function refreshMe(refresh = false) {
    try {
      const me = await apiMe(refresh);
      if (me?.usage) updateUsage(me.usage);
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
  // старе локальне «5 з 5» блокувало б скани до наступного запуску.
  async function renewIdentity() {
    const s = await renewSession();
    if (!s) return;
    setDeviceId(s.userId);
    try {
      const me = await apiMe();
      if (me?.usage) updateUsage(me.usage);
    } catch (_) {}
  }

  // limit — денна стеля з сервера (null — Pro). Відповідь без неї (старий
  // сервер) не стирає вже відому.
  function updateUsage(next) {
    setUsage((prev) => {
      const u = { day: next.day, scans: next.scans || 0, limit: next.limit !== undefined ? next.limit : prev.limit };
      saveUsage(u);
      return u;
    });
  }

  // Сервер відмовив за лімітом (402). Повертає true, якщо той самий кадр
  // можна надіслати ще раз. Pro уже куплено, а сервер ще не знає (вебхук не
  // дійшов) — просимо його перепитати RevenueCat; стелі вже немає — пейвол
  // не потрібен.
  async function scanLimitReached(data) {
    if (data?.used != null) updateUsage({ day: localDayKey(), scans: data.used, limit: data.limit });
    if (sub.pro) {
      const me = await refreshMe(true);
      if (me?.usage && me.usage.limit === null) return true;
    }
    setPaywall('scans');
    return false;
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
  const shownAch = scanSheetOpen ? null : toastAch;
  useEffect(() => {
    if (shownAch) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [shownAch]);

  // ---------- ДАНІ ----------
  // n — скільки дій за раз: сім слів зі сцени — це сім збережень, інакше
  // картка «Мій тиждень» рахувала б їх як одне й з'їдала б повторення.
  function logActivity(n = 1) {
    const k = localDayKey();
    setActivity((prev) => {
      const next = { ...prev, [k]: (prev[k] || 0) + n };
      persistActivity(next);
      return next;
    });
  }

  function updateWords(next) {
    setWords(next);
    persistWords(next);
  }

  // Воротар сканера. Викликається ДО зйомки: краще сказати «ні» одразу,
  // ніж витратити виклик AI і показати відмову після нього.
  function guardScan() {
    const deny = canScan({ pro: sub.pro, usage });
    if (deny) {
      setPaywall(deny);
      return false;
    }
    return true;
  }

  // true — слово збережено; false — відмова, відкрито пейвол.
  function addWord(result) {
    // Стеля словника. Перевіряємо тут, а не в сканері: слово може прийти
    // ще й зі «слова дня», і ліміт має діяти однаково.
    const deny = canSaveWord({ pro: sub.pro, wordCount: words.length });
    if (deny) {
      pendingWords.current = [result];
      setPaywall(deny);
      return false;
    }
    insertWords([result]);
    return true;
  }

  // Слова зі сцени разом. Ті, що вже є в словнику, пропускаємо; зберігаємо
  // стільки, скільки вміщає безкоштовний словник, а решту відкладаємо до
  // покупки й відкриваємо пейвол. Повертає, скільки збережено зараз.
  function addWords(list) {
    const fresh = [];
    for (const w of list) if (!hasWord(words, w) && !hasWord(fresh, w)) fresh.push(w);
    let fits = 0;
    while (fits < fresh.length && !canSaveWord({ pro: sub.pro, wordCount: words.length + fits })) fits++;
    if (fits) insertWords(fresh.slice(0, fits));
    if (fits < fresh.length) {
      pendingWords.current = fresh.slice(fits);
      setPaywall(canSaveWord({ pro: sub.pro, wordCount: words.length + fits }));
    }
    return fits;
  }

  function insertWords(list) {
    const now = Date.now();
    const items = list.map((result) => ({
      id: now.toString(36) + Math.random().toString(36).slice(2, 7),
      ...result,
      // кадр зі сканера лежить у кеші — переносимо в Documents (див. photos.js)
      photo: persistPhoto(result.photo),
      addedAt: now,
      srs: newSrs(),
    }));
    const next = [...words, ...items];
    updateWords(next);
    logActivity(items.length);
    // «Нічна сова» і «Ранній птах» — досягнення не про кількість, а про звичку.
    // Позначаємо одноразово, коли слово збережено в характерний час.
    const h = new Date().getHours();
    if (h >= 23 || h < 5) bumpStatOnce('nightScan');
    else if (h >= 5 && h < 8) bumpStatOnce('morningScan');
    // Десяте слово — момент, коли застосунок уже приніс користь: саме тоді
    // доречно спитати про оцінку (не частіше, ніж дозволяє review.js).
    // Сцена може перескочити через десяте одразу кількома словами.
    if (words.length < 10 && next.length >= 10) maybeAskForReview();
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

  function deleteWord(id) {
    const gone = words.find((w) => w.id === id);
    if (gone) deletePhoto(gone.photo);
    updateWords(words.filter((w) => w.id !== id));
  }

  // practice — сесія зі слів, яким ще не час: «знаю» там не відсуває
  // наступне повторення, інакше зубріння ламало б розклад (див. srs.js).
  function reviewWord(id, known, practice) {
    const apply = practice ? applyPractice : applyReview;
    setWords((prev) => {
      const next = prev.map((w) => (w.id === id ? apply(w, known) : w));
      persistWords(next);
      return next;
    });
    logActivity();
  }

  // «Очистити словник» прибирає й сцени: діалог про це попереджає (див.
  // SettingsScreen), а фото сцен без слів лише займали б пам'ять телефону.
  function clearAll() {
    words.forEach((w) => deletePhoto(w.photo));
    updateWords([]);
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
        setPaywall(deny);
        return;
      }
      patch = { ...patch, targetLang: settings.nativeLang };
    }
    const next = { ...settings, ...patch };
    setSettings(next);
    persistSettings(next);
    // мови змінились — перезавантажуємо слово дня
    if (patch.targetLang || patch.nativeLang) {
      syncWordOfDay({
        lang: next.targetLang,
        native: next.nativeLang,
        enabled: next.wodEnabled,
        hour: next.wodHour,
        force: true,
      }).then((c) => c && setWod(c));
    }
  }

  // Безкоштовно — одна мова навчання. Ліміт описаний у MONETIZATION.md і
  // показаний у пейволі, тож має реально діяти, а не лише рекламуватись.
  function setTargetLang(code) {
    const deny = canUseLanguage({ pro: sub.pro, words, nextLang: code });
    if (deny) {
      setPaywall(deny);
      return;
    }
    saveSetting({ targetLang: code });
  }

  async function toggleWod(value) {
    if (value) {
      const granted = await requestPermission();
      if (!granted) return; // користувач відмовив — лишаємо вимкненим
    }
    const next = { ...settings, wodEnabled: value };
    setSettings(next);
    persistSettings(next);
    syncWordOfDay({
      lang: next.targetLang,
      native: next.nativeLang,
      enabled: value,
      hour: next.wodHour,
    }).then((c) => c && setWod(c));
  }

  function setWodHour(h) {
    const next = { ...settings, wodHour: h };
    setSettings(next);
    persistSettings(next);
    syncWordOfDay({
      lang: next.targetLang,
      native: next.nativeLang,
      enabled: next.wodEnabled,
      hour: h,
    }).then((c) => c && setWod(c));
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

  function saveWordOfDay() {
    if (!todayWord || wodSaved) return;
    // Мови — ті, з якими слово прийшло від сервера, а не поточні з налаштувань.
    const saved = addWord({
      word: todayWord.word,
      ipa: todayWord.ipa || '',
      translation: todayWord.translation || '',
      example: todayWord.example || '',
      exampleTranslation: todayWord.example_translation || '',
      lang: wod.lang,
      nativeLang: wod.native,
    });
    // Відмова (стеля словника) — не збережене слово: інакше повторні тапи
    // накручували б досягнення за слово дня.
    if (!saved) return;
    bumpStat('wordOfDaySeen');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ---------- ПІДПИСКА ----------
  async function purchasePlan(planId) {
    const res = await pro.purchase(planId);
    if (res.ok) {
      savePendingWords();
      setPaywall(null);
      refreshMe(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Пробний період: нагадаємо за 2 дні до списання самі, а не покладаємось
      // лише на Apple (див. коментар у subscription.js).
      if (res.state?.trial && res.state.until) {
        scheduleTrialReminder(res.state.until, t('trialEndTitle'), t('trialEndBody'));
      }
    }
    return res;
  }

  async function restorePurchases() {
    const next = await pro.restore();
    if (next?.pro) {
      savePendingWords();
      refreshMe(true);
    }
    return next;
  }

  // Pro оформлено — дописуємо слова, на яких спіткнулись. Ліміт уже не
  // перевіряємо: sub.pro у цьому замиканні ще старий.
  function savePendingWords() {
    const list = pendingWords.current;
    pendingWords.current = null;
    if (list?.length) insertWords(list);
  }

  // Пейвол закрили без покупки — відкладені слова більше не чекають, щоб
  // пізніша покупка з налаштувань не дописала їх поза контекстом.
  function closePaywall() {
    pendingWords.current = null;
    setPaywall(null);
  }

  // «Стерти мої дані»: запис на сервері + усе на телефоні. Кидає помилку,
  // якщо сервер недоступний, — екран налаштувань покаже її людині.
  async function eraseEverything() {
    const session = await eraseServerData();
    words.forEach((w) => deletePhoto(w.photo));
    await clearLocalData();
    await cancelAll();
    setWords([]);
    setScenes([]);
    setActivity({});
    setStats({});
    setSeenAch([]);
    setWod(null);
    // стеля — налаштування сервера, а не дані людини: її лишаємо
    setUsage((u) => ({ scans: 0, limit: u.limit }));
    if (session) setDeviceId(session.userId);
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
    // Онбординг уже спитав про сповіщення — зберігаємо відповідь, щоб не
    // питати вдруге і щоб перемикач у налаштуваннях показував правду.
    // Під час повтору зважаємо лише на явне «так»: «Пропустити» там означає
    // «передивився слайди», а не «вимкни сповіщення, які я колись увімкнув».
    if (result && typeof result.wodEnabled === 'boolean' && (!replay || result.wodEnabled)) {
      const next = { ...settings, wodEnabled: result.wodEnabled };
      setSettings(next);
      persistSettings(next);
      syncWordOfDay({
        lang: next.targetLang,
        native: next.nativeLang,
        enabled: next.wodEnabled,
        hour: next.wodHour,
      }).then((c) => c && setWod(c));
    }
  }

  function replayOnboarding() {
    onbReplay.current = true;
    setTab('scan');
    setOnboarded(false);
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
          <OnboardingScreen t={t} onDone={finishOnboarding} />
        </SafeAreaView>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <View style={s.safe}>
        <StatusBar style={theme.isDark || tab === 'scan' ? 'light' : 'dark'} />
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
                onScanned={(res) => res.usage && updateUsage(res.usage)}
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
                  onQuizDone={(perfect) => {
                    bumpStat('quizzes');
                    if (perfect) {
                      bumpStat('perfectQuiz');
                      maybeAskForReview();
                    }
                  }}
                  onOpenPro={() => setPaywall('info')}
                  isPro={sub.pro}
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
                  onOpenPaywall={() => setPaywall('info')}
                  onManageSub={pro.manage}
                  onRestore={restorePurchases}
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

        {/* Пейвол поверх усього. Modal тут не потрібен: власний шар дає
            повний контроль над анімацією і не конфліктує з таб-баром. */}
        {paywall ? (
          <View style={[StyleSheet.absoluteFill, { paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: C.bg }]}>
            <PaywallScreen
              reason={paywall}
              plans={pro.plans}
              freeScans={freeScansPerDay(usage)}
              unavailable={pro.mode === 'unavailable'}
              onClose={closePaywall}
              onPurchase={purchasePlan}
              onRestore={restorePurchases}
              onOpen={() => !pro.plans.length && pro.reloadPlans()}
              lang={settings.nativeLang}
              t={t}
            />
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
