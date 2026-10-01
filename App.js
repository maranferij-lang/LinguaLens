import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
// SafeAreaView з react-native застарів. Наша обгортка бере контекстну версію,
// якщо пакет встановлений, і падає на ручні відступи, якщо ні.
import { SafeAreaView } from './src/SafeArea';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import { useFonts, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';

import ScannerScreen from './src/ScannerScreen';
import DictionaryScreen from './src/DictionaryScreen';
import FlashcardsScreen from './src/FlashcardsScreen';
import ProfileScreen from './src/ProfileScreen';
import SettingsScreen from './src/SettingsScreen';
import OnboardingScreen from './src/OnboardingScreen';
import AuthScreen from './src/AuthScreen';
import AchievementToast from './src/AchievementToast';
import PaywallScreen from './src/PaywallScreen';
import { loadActivity, loadOnboarded, loadSeenAchievements, loadSettings, loadStats, loadWords, loadWod, localDayKey, persistActivity, persistOnboarded, persistSeenAchievements, persistSettings, persistStats, persistWords } from './src/storage';
import { applyReview, dueWords, newSrs } from './src/srs';
import { initAudio } from './src/speech';
import { makeT } from './src/i18n';
import { deleteAccount, loadSession, logout as doLogout, refreshUser, updateProfile } from './src/auth';
import { deletePhoto, persistPhoto } from './src/photos';
import { setSessionToken } from './src/api';
import { computeMetrics, evaluate, newlyUnlocked } from './src/achievements';
import { syncWordOfDay, todayFrom, requestPermission, cancelAll, DEFAULT_HOUR } from './src/wordOfDay';
import { IcBook, IcCards, IcGear, IcScan, IcUser } from './src/icons';
import { MascotBob } from './src/Mascot';
import { Material, MaterialEdge } from './src/Chrome';

import { FadeIn } from './src/ui';
import { F, THEMES, ThemeProvider, resolveThemeKey, type } from './src/theme';
import { SPRING } from './src/motion';
import {
  loadSubscription, activatePlan, loadUsage, bumpScan,
  canScan, canSaveWord, canUseLanguage, scansLeft,
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

export default function App() {
  const systemScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    Nunito_500Medium,
    Nunito_600SemiBold,
    Nunito_700Bold,
    Nunito_800ExtraBold,
  });

  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [user, setUser] = useState(null);

  const [tab, setTab] = useState('scan');
  const [words, setWords] = useState([]);
  const [settings, setSettings] = useState({
    targetLang: 'en',
    nativeLang: 'uk',
    theme: 'system',
    wodEnabled: true,
    wodHour: DEFAULT_HOUR,
  });
  const [activity, setActivity] = useState({});
  const [stats, setStats] = useState({});
  const [seenAch, setSeenAch] = useState([]);
  const [wod, setWod] = useState(null);
  const [toastAch, setToastAch] = useState(null);
  // Підписка й денний облік сканів. Поки еквайринг не підключений, стан
  // локальний; форма даних уже така, як буде з чеком App Store.
  const [sub, setSub] = useState({ pro: false });
  const [usage, setUsage] = useState({ scans: 0 });
  const [paywall, setPaywall] = useState(null); // null | 'scans' | 'words' | 'langs'

  // ---------- СТАРТ ----------
  useEffect(() => {
    initAudio();
    (async () => {
      const [w, st, a, ob, stt, seen, session, wodCache] = await Promise.all([
        loadWords(),
        loadSettings(),
        loadActivity(),
        loadOnboarded(),
        loadStats(),
        loadSeenAchievements(),
        loadSession(),
        loadWod(),
      ]);
      setSub(await loadSubscription());
      setUsage(await loadUsage());
      setWords(w);
      const merged = {
        targetLang: 'en',
        nativeLang: 'uk',
        theme: 'system',
        wodEnabled: true,
        wodHour: DEFAULT_HOUR,
        ...st,
      };
      setSettings(merged);
      setActivity(a);
      setStats(stt);
      setSeenAch(seen);
      setWod(wodCache);
      setUser(session.user);
      setOnboarded(ob);
      // якщо ще не онбордився і не має акаунта — спершу онбординг, потім вхід
      if (ob && !session.user) setShowAuth(false);
      setReady(true);

      // тихо оновлюємо профіль і слово дня у фоні
      if (session.token) {
        refreshUser().then((u) => {
          if (u === null) setUser(null);
          else if (u) setUser(u);
        });
        syncWordOfDay({
          lang: merged.targetLang,
          native: merged.nativeLang,
          enabled: merged.wodEnabled,
          hour: merged.wodHour,
        }).then((c) => c && setWod(c));
      }
    })();
  }, []);

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
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [words, activity, stats, streak, ready]);

  // ---------- ДАНІ ----------
  function logActivity() {
    const k = localDayKey();
    setActivity((prev) => {
      const next = { ...prev, [k]: (prev[k] || 0) + 1 };
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

  async function countScan() {
    if (sub.pro) return;
    setUsage(await bumpScan(usage));
  }

  function addWord(result) {
    // Стеля словника. Перевіряємо тут, а не в сканері: слово може прийти
    // ще й зі «слова дня», і ліміт має діяти однаково.
    const deny = canSaveWord({ pro: sub.pro, wordCount: words.length });
    if (deny) {
      setPaywall(deny);
      return;
    }
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...result,
      // кадр зі сканера лежить у кеші — переносимо в Documents (див. photos.js)
      photo: persistPhoto(result.photo),
      addedAt: Date.now(),
      srs: newSrs(),
    };
    updateWords([...words, item]);
    logActivity();
    // «Нічна сова» і «Ранній птах» — досягнення не про кількість, а про звичку.
    // Позначаємо одноразово, коли слово збережено в характерний час.
    const h = new Date().getHours();
    if (h >= 23 || h < 5) bumpStatOnce('nightScan');
    else if (h >= 5 && h < 8) bumpStatOnce('morningScan');
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

  function deleteWord(id) {
    const gone = words.find((w) => w.id === id);
    if (gone) deletePhoto(gone.photo);
    updateWords(words.filter((w) => w.id !== id));
  }

  function reviewWord(id, known) {
    updateWords(words.map((w) => (w.id === id ? applyReview(w, known) : w)));
    logActivity();
  }

  function clearAll() {
    words.forEach((w) => deletePhoto(w.photo));
    updateWords([]);
  }

  function bumpStat(key, by = 1) {
    setStats((prev) => {
      const next = { ...prev, [key]: (prev[key] || 0) + by };
      persistStats(next);
      return next;
    });
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

  function saveSetting(patch) {
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

  async function toggleWod(value) {
    if (value) {
      const granted = await requestPermission();
      if (!granted) return; // користувач відмовив — лишаємо вимкненим
    } else {
      await cancelAll();
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
  const todayWord = useMemo(() => todayFrom(wod), [wod]);
  const wodSaved = useMemo(
    () => !!todayWord && words.some((w) => w.word?.toLowerCase() === todayWord.word?.toLowerCase()),
    [todayWord, words]
  );

  function saveWordOfDay() {
    if (!todayWord || wodSaved) return;
    addWord({
      word: todayWord.word,
      ipa: todayWord.ipa || '',
      translation: todayWord.translation || '',
      example: todayWord.example || '',
      exampleTranslation: todayWord.example_translation || '',
      lang: settings.targetLang,
      nativeLang: settings.nativeLang,
    });
    bumpStat('wordOfDaySeen');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  // ---------- АКАУНТ ----------
  async function handleAuthDone(u) {
    setShowAuth(false);
    if (u) {
      setUser(u);
      const c = await syncWordOfDay({
        lang: settings.targetLang,
        native: settings.nativeLang,
        enabled: settings.wodEnabled,
        hour: settings.wodHour,
        force: true,
      });
      if (c) setWod(c);
    }
  }

  async function purchasePlan(planId) {
    // Тут з'явиться виклик StoreKit. Наразі активуємо локально, щоб можна
    // було проходити всі сценарії й перевіряти ліміти.
    const next = await activatePlan(planId);
    setSub(next);
    setPaywall(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function handleLogout() {
    await doLogout();
    await cancelAll();
    setUser(null);
    setSessionToken('');
  }

  // Видалення акаунта (вимога Apple 5.1.1(v)). Кидає помилку, якщо сервер
  // недоступний — екран налаштувань покаже її людині.
  async function handleDeleteAccount() {
    await deleteAccount();
    await cancelAll();
    setUser(null);
  }

  async function handleUpdateUser(patch) {
    // Гість не має профілю на сервері. Без цієї перевірки «оптимістичне»
    // оновлення створювало б фальшивого юзера лише з іменем, і застосунок
    // вважав би гостя залогіненим.
    if (!user) {
      setShowAuth(true);
      return;
    }
    const u = await updateProfile(patch, user);
    setUser(u);
  }

  function switchTab(key) {
    if (key !== tab) Haptics.selectionAsync();
    setTab(key);
  }

  function finishOnboarding(result) {
    setOnboarded(true);
    persistOnboarded();
    // Онбординг уже спитав про сповіщення — зберігаємо відповідь, щоб не
    // питати вдруге і щоб перемикач у налаштуваннях показував правду.
    if (result && typeof result.wodEnabled === 'boolean') {
      const next = { ...settings, wodEnabled: result.wodEnabled };
      setSettings(next);
      persistSettings(next);
    }
    if (!user) setShowAuth(true); // після онбордингу пропонуємо акаунт
  }

  function replayOnboarding() {
    setTab('scan');
    setOnboarded(false);
  }

  const dueCount = useMemo(() => dueWords(words).length, [words, tab]);

  // ---------- РЕНДЕР ----------
  if (!ready || !fontsLoaded) {
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

  if (showAuth) {
    return (
      <ThemeProvider value={theme}>
        <SafeAreaView style={s.safe}>
          <StatusBar style={theme.isDark ? 'light' : 'dark'} />
          <AuthScreen t={t} onDone={handleAuthDone} />
        </SafeAreaView>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider value={theme}>
      <SafeAreaView style={s.safe}>
        <StatusBar style={theme.isDark || tab === 'scan' ? 'light' : 'dark'} />
        <View style={{ flex: 1 }}>
          {tab === 'scan' ? (
            <ScannerScreen
              targetLang={settings.targetLang}
              nativeLang={settings.nativeLang}
              savedWords={words}
              onSaveWord={addWord}
              onGuardScan={guardScan}
              onCountScan={countScan}
              scansLeft={scansLeft({ pro: sub.pro, usage })}
              t={t}
            />
          ) : null}

          {tab === 'dict' ? (
            <FadeIn style={{ flex: 1 }} dy={10}>
              <DictionaryScreen words={words} onDelete={deleteWord} onScan={() => switchTab('scan')} t={t} />
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
                  if (perfect) bumpStat('perfectQuiz');
                }}
                onSignIn={user ? null : () => setShowAuth(true)}
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
                user={user}
                onUpdateUser={handleUpdateUser}
                onSignIn={() => setShowAuth(true)}
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
                onClearAll={clearAll}
                onReplayOnb={replayOnboarding}
                wodEnabled={settings.wodEnabled}
                onToggleWod={toggleWod}
                wodHour={settings.wodHour}
                onSetWodHour={setWodHour}
                user={user}
                onLogout={handleLogout}
                onDeleteAccount={handleDeleteAccount}
                onOpenAuth={() => setShowAuth(true)}
                sub={sub}
                onOpenPaywall={() => setPaywall('info')}
                t={t}
              />
            </FadeIn>
          ) : null}
        </View>

        {/* Таб-бар — напівпрозорий матеріал, контент проїжджає під ним */}
        <Material style={s.tabbar}>
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
          <View style={StyleSheet.absoluteFill}>
            <PaywallScreen
              reason={paywall}
              onClose={() => setPaywall(null)}
              onPurchase={purchasePlan}
              t={t}
            />
          </View>
        ) : null}

        {/* Спливаюче вітання з новим досягненням */}
        <AchievementToast achievement={toastAch} onHide={() => setToastAch(null)} t={t} />
      </SafeAreaView>
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
        <tb.Icon size={24} color={active ? C.accent : C.faint} />
        {badge > 0 ? (
          <View style={s.badge}>
            <Text style={s.badgeText}>{badge > 99 ? '99+' : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Animated.Text
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
      paddingBottom: 5,
      overflow: 'hidden',
    },
    tabBtn: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
    tabIconWrap: { paddingHorizontal: 14, paddingVertical: 5, alignItems: 'center', justifyContent: 'center' },
    tabPill: { ...StyleSheet.absoluteFillObject, borderRadius: 999 },
    tabLabel: { color: C.faint, fontSize: 9.5, letterSpacing: 0.19, fontFamily: F.bold },
    badge: {
      position: 'absolute',
      top: -4,
      right: 2,
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
