import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
// SafeAreaView from react-native is deprecated. Our wrapper uses the context version
// if the package is installed, and falls back to manual insets if not.
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
import { loadSession, logout as doLogout, refreshUser, updateProfile } from './src/auth';
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
  canScan, canSaveWord, scansLeft,
} from './src/subscription';

// The tab order is fixed and not up for discussion:
// the scanner is in the center because it is the app's main action and the most convenient spot for
// the thumb; profile is far left, settings is far right.
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
  // Subscription and daily scan accounting. Until payment processing is connected, the state
  // is local; the data shape is already what it will be with an App Store receipt.
  const [sub, setSub] = useState({ pro: false });
  const [usage, setUsage] = useState({ scans: 0 });
  const [paywall, setPaywall] = useState(null); // null | 'scans' | 'words' | 'langs'

  // ---------- START ----------
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
      // if not onboarded yet and has no account: onboarding first, then sign-in
      if (ob && !session.user) setShowAuth(false);
      setReady(true);

      // quietly refresh the profile and the word of the day in the background
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

  // ---------- ACHIEVEMENTS ----------
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

  // check for new achievements after every data change
  useEffect(() => {
    if (!ready) return;
    const metrics = computeMetrics({ words, activity, stats, streak });
    const evaluated = evaluate(metrics);
    const fresh = newlyUnlocked(evaluated, seenAch);
    if (fresh.length) {
      const ids = [...seenAch, ...fresh.map((a) => a.id)];
      setSeenAch(ids);
      persistSeenAchievements(ids);
      setToastAch(fresh[0]); // show the first one, the rest stay in the profile
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, [words, activity, stats, streak, ready]);

  // ---------- DATA ----------
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

  // Scanner gatekeeper. Called BEFORE the shot: better to say "no" right away
  // than to spend an AI call and show a refusal after it.
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
    // Dictionary ceiling. Checked here, not in the scanner: a word can also come
    // from the "word of the day", and the limit must apply equally.
    const deny = canSaveWord({ pro: sub.pro, wordCount: words.length });
    if (deny) {
      setPaywall(deny);
      return;
    }
    const item = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      ...result,
      addedAt: Date.now(),
      srs: newSrs(),
    };
    updateWords([...words, item]);
    logActivity();
    // The "Night Owl" and "Early Bird" achievements are about habit, not quantity.
    // Marked once, when a word is saved at the characteristic time.
    const h = new Date().getHours();
    if (h >= 23 || h < 5) bumpStatOnce('nightScan');
    else if (h >= 5 && h < 8) bumpStatOnce('morningScan');
  }

  // Sets the flag once; repeated calls change nothing.
  function bumpStatOnce(key) {
    setStats((prev) => {
      if (prev[key]) return prev;
      const next = { ...prev, [key]: 1 };
      persistStats(next);
      return next;
    });
  }

  function deleteWord(id) {
    updateWords(words.filter((w) => w.id !== id));
  }

  function reviewWord(id, known) {
    updateWords(words.map((w) => (w.id === id ? applyReview(w, known) : w)));
    logActivity();
  }

  function clearAll() {
    updateWords([]);
  }

  function bumpStat(key, by = 1) {
    setStats((prev) => {
      const next = { ...prev, [key]: (prev[key] || 0) + by };
      persistStats(next);
      return next;
    });
  }

  function saveSetting(patch) {
    const next = { ...settings, ...patch };
    setSettings(next);
    persistSettings(next);
    // languages changed: reload the word of the day
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
      if (!granted) return; // the user declined: leave it turned off
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

  // ---------- WORD OF THE DAY ----------
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

  // ---------- ACCOUNT ----------
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
    // The StoreKit call will go here. For now we activate locally so that all
    // scenarios can be walked through and the limits checked.
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

  async function handleUpdateUser(patch) {
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
    // Onboarding already asked about notifications: save the answer so we do not
    // ask a second time and so the toggle in settings shows the truth.
    if (result && typeof result.wodEnabled === 'boolean') {
      const next = { ...settings, wodEnabled: result.wodEnabled };
      setSettings(next);
      persistSettings(next);
    }
    if (!user) setShowAuth(true); // after onboarding, offer an account
  }

  function replayOnboarding() {
    setTab('scan');
    setOnboarded(false);
  }

  const dueCount = useMemo(() => dueWords(words).length, [words, tab]);

  // ---------- RENDER ----------
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
                t={t}
              />
            </FadeIn>
          ) : null}

          {tab === 'settings' ? (
            <FadeIn style={{ flex: 1 }} dy={10}>
              <SettingsScreen
                targetLang={settings.targetLang}
                onSetLang={(code) => saveSetting({ targetLang: code })}
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
                onOpenAuth={() => setShowAuth(true)}
                sub={sub}
                onOpenPaywall={() => setPaywall('info')}
                t={t}
              />
            </FadeIn>
          ) : null}
        </View>

        {/* Tab bar is a translucent material, content slides under it */}
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

        {/* Paywall on top of everything. A Modal is not needed here: our own layer gives
            full control over the animation and does not conflict with the tab bar. */}
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

        {/* Pop-up greeting with a new achievement */}
        <AchievementToast achievement={toastAch} onHide={() => setToastAch(null)} t={t} />
      </SafeAreaView>
    </ThemeProvider>
  );
}

// Tab bar button.
// Switching tabs is an action done dozens of times a day, so the motion here is
// minimal and fast: the "pill" fades in, the icon grows slightly.
// No overshoot, otherwise the screen bounces on every tap.
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
      // respond to the press, not to the release
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
              // the pill does not appear from nothing: it starts from 0.85
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
