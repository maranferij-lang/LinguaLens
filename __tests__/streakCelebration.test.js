// Свято першої дії дня (core.md C.3, C.7) і черга оверлеїв (план §5.13):
//   • раз на день, не на старті й не посеред онбордингу;
//   • чекає, поки закриються аркуш скану, пейвол і сесія карток;
//   • звичайний день закривається сам за 2,6 с, віхи — кнопкою;
//   • тост streak_N тієї ж віхи не дублюється;
//   • «Менше руху» й VoiceOver.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
import ScannerScreen from '../src/ScannerScreen';
import StreakCelebration, { CELEBRATE_MS, isMilestone, streakAchievement } from '../src/streak/StreakCelebration';
import { ACHIEVEMENTS } from '../src/achievements';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { StatusBar } from 'expo-status-bar';
import { THEMES, ThemeProvider } from '../src/theme';

// StatusBar з React Native, змонтований під фейковими таймерами, лишає свій
// setImmediate фейковим, і наступний тест із реальними таймерами зависає. Тут
// він — заглушка, що лише запамʼятовує стиль (свято ставить свій статус-бар).
jest.mock('expo-status-bar', () => ({ StatusBar: jest.fn(() => null) }));

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const texts = (node) => node.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

// ─── сам шар ──────────────────────────────────────────────────────────────
describe('the celebration layer', () => {
  async function show(data, props = {}) {
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={data} activeDays={[]} t={t} {...props} />
        </SafeAreaProvider>
      );
    });
    return tree;
  }
  const button = (tree, label) => tree.root.findAll((n) => n.props.title === label && typeof n.props.onPress === 'function')[0];

  test('an ordinary day: the owner’s words, the number, and it closes by itself after 2.6 s', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const tree = await show({ from: 1, to: 2 }, { onDone });
    expect(texts(tree.root)).toEqual(expect.arrayContaining(['2 days in a row. Keep it up!', '2', '5 more days to a week, then your flame catches fire']));
    expect(button(tree, t('streakContinue'))).toBeUndefined();
    // вогник учорашньої форми переходить у сьогоднішню
    const flames = tree.root.findAll((n) => typeof n.type !== 'string' && n.props.n !== undefined && /^celebration-flame/.test(n.props.testID || ''));
    expect(flames.map((f) => [f.props.testID, f.props.n])).toEqual([
      ['celebration-flame-from', 1],
      ['celebration-flame', 2],
    ]);
    await act(async () => jest.advanceTimersByTime(CELEBRATE_MS - 100));
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => jest.advanceTimersByTime(800));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('over the camera’s light status bar it sets the app’s own while it is on screen', async () => {
    const styleNow = () => StatusBar.mock.calls[StatusBar.mock.calls.length - 1][0].style;
    StatusBar.mockClear();
    let tree = await show({ from: 3, to: 4 });
    // світла тема — темний текст на кремовому тлі свята
    expect(styleNow()).toBe('dark');
    await act(async () => tree.unmount());
    StatusBar.mockClear();
    await act(async () => {
      tree = create(
        <ThemeProvider value={THEMES.dark}>
          <SafeAreaProvider initialMetrics={metrics}>
            <StreakCelebration data={{ from: 3, to: 4 }} activeDays={[]} t={t} />
          </SafeAreaProvider>
        </ThemeProvider>
      );
    });
    expect(styleNow()).toBe('light');
    await act(async () => tree.unmount());
    // нічого не святкуємо — і статус-бар не чіпаємо
    StatusBar.mockClear();
    tree = await show(null);
    expect(StatusBar).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('if the queue gets busy after it appeared (a paywall in the same frame), it steps aside and comes back', async () => {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const data = { from: 3, to: 4 };
    const el = (d) => (
      <SafeAreaProvider initialMetrics={metrics}>
        <StreakCelebration data={d} activeDays={[]} onDone={onDone} t={t} />
      </SafeAreaProvider>
    );
    const layer = (tree) => tree.root.findAll((n) => n.props.testID === 'streak-celebration');
    let tree;
    await act(async () => {
      tree = create(el(data));
    });
    expect(layer(tree).length).toBeGreaterThan(0);
    // черга зайнята: свята не видно, і воно не «закінчилось» без людини
    await act(async () => tree.update(el(null)));
    expect(layer(tree)).toHaveLength(0);
    await act(async () => jest.advanceTimersByTime(CELEBRATE_MS * 2));
    expect(onDone).not.toHaveBeenCalled();
    // черга вільна — те саме свято знову, і звичайний день знову закривається сам
    await act(async () => tree.update(el(data)));
    expect(layer(tree).length).toBeGreaterThan(0);
    expect(texts(tree.root)).toContain('4');
    await act(async () => jest.advanceTimersByTime(CELEBRATE_MS + 400));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('a tap anywhere closes an ordinary day', async () => {
    const onDone = jest.fn();
    const tree = await show({ from: 3, to: 4 }, { onDone });
    const backdrop = tree.root.findAll((n) => n.props.testID === 'streak-celebration-backdrop' && typeof n.props.onPress === 'function')[0];
    await act(async () => backdrop.props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
    });
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('day seven lights the flame: it waits for “Continue”, shows the medal and shares it', async () => {
    jest.useFakeTimers();
    expect(isMilestone(7)).toBe(true);
    expect(streakAchievement(7).id).toBe('streak_7');
    expect(streakAchievement(60)).toBeNull();
    const onDone = jest.fn();
    const onShare = jest.fn();
    const tree = await show({ from: 6, to: 7 }, { onDone, onShare });
    expect(texts(tree.root)).toEqual(expect.arrayContaining([t('streakWeek'), t('streakAchChip', { a: t('ach_streak_7') })]));
    await act(async () => jest.advanceTimersByTime(10000));
    expect(onDone).not.toHaveBeenCalled();
    const share = tree.root.findAll((n) => n.props.accessibilityLabel === t('share') && typeof n.props.onPress === 'function')[0];
    await act(async () => share.props.onPress());
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ id: 'streak_7' }));
    await act(async () => jest.advanceTimersByTime(500));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  // Від восьмого дня фраза дня і є рядком «до віхи» (streakMessage): на
  // екрані вона була двічі поспіль, заголовком і підписом
  test('from the eighth day the headline is not repeated as the subtitle', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const line = t('streakToNext', { m: 14, k: 4 });
    const tree = await show({ from: 9, to: 10 });
    // лише хостові вузли: композитний Text і його хост несуть той самий рядок
    const shown = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === line).length;
    const said = announce.mock.calls.at(-1)?.[0];
    // розмонтовуємо до перевірок: інакше невдала перевірка лишає пружини
    await act(async () => tree.unmount());
    expect(shown).toBe(1);
    expect(said).toBe(line);
    // а коли фрази різні, обидві лишаються: і на екрані, і для VoiceOver
    const week = await show({ from: 6, to: 7 });
    const next = t('streakToNext', { m: 14, k: 7 });
    const weekTexts = texts(week.root);
    const weekSaid = announce.mock.calls.at(-1)?.[0];
    await act(async () => week.unmount());
    expect(weekTexts).toEqual(expect.arrayContaining([t('streakWeek'), next]));
    expect(weekSaid).toBe(`${t('streakWeek')}. ${next}`);
  });

  test('a milestone without a medal (60 days) still waits, with no share button', async () => {
    const tree = await show({ from: 59, to: 60 });
    expect(button(tree, t('streakContinue'))).toBeTruthy();
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('share') && typeof n.props.onPress === 'function')).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  test('with VoiceOver nothing closes by itself, and “Continue” is always there', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onDone = jest.fn();
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={null} activeDays={[]} onDone={onDone} t={t} />
        </SafeAreaProvider>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    jest.useFakeTimers();
    await act(async () =>
      tree.update(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={{ from: 1, to: 2 }} activeDays={[]} onDone={onDone} t={t} />
        </SafeAreaProvider>
      )
    );
    await act(async () => jest.advanceTimersByTime(CELEBRATE_MS * 3));
    expect(onDone).not.toHaveBeenCalled();
    await act(async () => button(tree, t('streakContinue')).props.onPress());
    await act(async () => jest.advanceTimersByTime(500));
    expect(onDone).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  async function springs(reduced) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={null} activeDays={[]} t={t} />
        </SafeAreaProvider>
      );
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    const spring = jest.spyOn(Animated, 'spring');
    await act(async () =>
      tree.update(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={{ from: 6, to: 7 }} activeDays={[]} t={t} />
        </SafeAreaProvider>
      )
    );
    const n = spring.mock.calls.length;
    await act(async () => tree.unmount());
    return n;
  }

  test('with motion the flame grows and the dot pops…', async () => {
    expect(await springs(false)).toBeGreaterThan(0);
  });

  test('…“Reduce Motion” only fades it in', async () => {
    expect(await springs(true)).toBe(0);
  });
});

// ─── App: коли свято показується ──────────────────────────────────────────
describe('App', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
  });

  async function settle(n = 4) {
    for (let i = 0; i < n; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
  }
  const ago = (n) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return localDayKey(d);
  };
  const word = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't' + i, lang: 'es', addedAt: Date.now() - 90 * 86400000, srs: { box: 0, due: 0 } });

  async function app({ activity = {}, seen = ALL_ACH, onboarded = true, settings = {} } = {}) {
    if (onboarded) await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', aiConsent: true, ...settings }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(seen));
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify([word(1), word(2)]));
    await AsyncStorage.setItem('ll_activity_v1', JSON.stringify(activity));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await settle(5);
    return tree;
  }
  const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
  const data = (tree) => one(tree, StreakCelebration).props.data;
  const run = async (fn) => {
    await act(async () => {
      await fn();
    });
    await settle();
  };
  const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
  const stored = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  test('the first action of the day — once; the day is recorded at once', async () => {
    const tree = await app({ activity: { [ago(1)]: 2 } });
    await openTab(tree, 'cards');
    expect(data(tree)).toBeNull();
    await run(() => one(tree, FlashcardsScreen).props.onReview('w1', true));
    expect(data(tree)).toEqual({ from: 1, to: 2 });
    expect((await stored()).streakSeen).toMatchObject({ celebrated: localDayKey(), best: 2 });
    await run(() => one(tree, StreakCelebration).props.onDone());
    await run(() => one(tree, FlashcardsScreen).props.onReview('w2', true));
    expect(data(tree)).toBeNull();
    await act(async () => tree.unmount());
  });

  test('not at startup: a day begun before (another iPhone, an update) is only recorded', async () => {
    const tree = await app({ activity: { [ago(1)]: 2, [localDayKey()]: 1 } });
    expect(data(tree)).toBeNull();
    expect((await stored()).streakSeen.celebrated).toBe(localDayKey());
    await act(async () => tree.unmount());
  });

  test('waits for the learning session, then shows', async () => {
    const tree = await app({ activity: { [ago(1)]: 2 } });
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onSessionChange(true));
    await run(() => one(tree, FlashcardsScreen).props.onReview('w1', true));
    expect(data(tree)).toBeNull();
    await run(() => one(tree, FlashcardsScreen).props.onSessionChange(false));
    expect(data(tree)).toEqual({ from: 1, to: 2 });
    await act(async () => tree.unmount());
  });

  test('waits for the scan sheet and for any paywall', async () => {
    const tree = await app({ activity: { [ago(1)]: 2 } });
    const scanner = () => one(tree, ScannerScreen);
    await run(() => scanner().props.onResultVisible(true));
    await run(() => scanner().props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
    expect(data(tree)).toBeNull();
    await run(() => scanner().props.onOpenPro());
    await run(() => scanner().props.onResultVisible(false));
    expect(one(tree, PaywallScreen)).toBeTruthy();
    expect(data(tree)).toBeNull();
    await run(() => one(tree, PaywallScreen).props.onClose());
    expect(data(tree)).toEqual({ from: 1, to: 2 });
    await act(async () => tree.unmount());
  });

  test('day seven: the celebration carries the medal, so the streak_7 toast is dropped', async () => {
    const activity = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [ago(i), 1]));
    const tree = await app({ activity, seen: ALL_ACH.filter((id) => id !== 'streak_7') });
    await openTab(tree, 'cards');
    await run(() => one(tree, FlashcardsScreen).props.onReview('w1', true));
    expect(data(tree)).toEqual({ from: 6, to: 7 });
    expect(one(tree, AchievementToast).props.achievement).toBeNull();
    await run(() => one(tree, StreakCelebration).props.onDone());
    expect(one(tree, AchievementToast).props.achievement).toBeNull();
    // медаль уже «показана» — профіль її має, тост не повториться
    expect(JSON.parse(await AsyncStorage.getItem('ll_seen_ach_v1'))).toContain('streak_7');
    await act(async () => tree.unmount());
  });

  test('not in the middle of onboarding: its own celebration covers that day', async () => {
    const tree = await app({ onboarded: false });
    const onb = one(tree, OnboardingScreen);
    const scanner = onb.props.renderScanner({ onSaved() {}, onClose() {} });
    await run(() => scanner.props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
    expect((await stored()).streakSeen.celebrated).toBe(localDayKey());
    await run(() => one(tree, OnboardingScreen).props.onDone({}));
    expect(data(tree)).toBeNull();
    await act(async () => tree.unmount());
  });
});
