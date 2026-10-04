// «Навчання» до першого слова (core.md B.4): картки й квіз видно завжди,
// закриті — з поясненням і замком; блок «Як отримати перше слово»; квіз
// рахує різні переклади; «Відкрито!» рівно один раз; «Менше руху».
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AccessibilityInfo, Animated } from 'react-native';
import * as Haptics from 'expo-haptics';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import FlashcardsScreen, { GLOW_MS, UNLOCK_MS } from '../src/FlashcardsScreen';
import QuizScreen, { quizProgress } from '../src/QuizScreen';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const uk = makeT('uk');
const WOD = { date: '2026-10-04', word: 'la manzana', translation: 'apple' };
const w = (i, translation = 't' + i) => ({ id: 'w' + i, word: 'w' + i, translation, lang: 'es', addedAt: 1, srs: { box: 0, due: 0 } });

beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});
let haptic;
beforeEach(() => {
  haptic = jest.spyOn(Haptics, 'notificationAsync');
});
afterEach(() => jest.restoreAllMocks());

async function settle(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

const hub = (props) => (
  <SafeAreaProvider initialMetrics={metrics}>
    <FlashcardsScreen words={[]} onReview={() => {}} t={t} targetLang="es" onSaveWod={() => {}} wodSaved={false} onGoScan={() => {}} {...props} />
  </SafeAreaProvider>
);

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(hub(props));
  });
  await settle();
  return tree;
}

async function press(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

const texts = (node) => node.findAll((n) => n.type === 'Text' && typeof n.props.children === 'string').map((n) => n.props.children);
// сама кнопка картки (а не обгортка HubCard, у якої onPress — дія відкритої картки)
const card = (tree, id) =>
  tree.root.findAll((n) => n.props.testID === id && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
const byTitle = (tree, title) => tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const has = (tree, id) => tree.root.findAll((n) => n.props.testID === id).length > 0;
const flat = (style) => Object.assign({}, ...[].concat(style).flat(Infinity).filter(Boolean));

// 1 ───────────────────────────────────────────────────────────────────────
test('no words: both cards are there, locked, and say how to unlock them', async () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
  const onSessionChange = jest.fn();
  const tree = await render({ onSessionChange });
  const all = texts(tree.root);
  expect(all).toEqual(expect.arrayContaining([t('flashcards'), t('learnLockedCards'), t('quiz'), t('learnLockedQuiz', { n: 4 })]));
  expect(uk('learnLockedCards')).toBe('Збережи хоча б одне слово, щоб відкрити');
  expect(has(tree, 'hub-cards-lock')).toBe(true);
  expect(has(tree, 'hub-quiz-lock')).toBe(true);
  // VoiceOver: кнопка, «недоступна», і підпис каже, як відкрити
  expect(card(tree, 'hub-cards').props.accessibilityState).toEqual({ disabled: true });
  expect(card(tree, 'hub-cards').props.accessibilityLabel).toBe(`${t('flashcards')}. ${t('learnLockedCards')}`);

  await press(() => card(tree, 'hub-cards').props.onPress());
  await press(() => card(tree, 'hub-quiz').props.onPress());
  // сесія не почалась — ні карток, ні квізу
  expect(tree.root.findAllByType(QuizScreen)).toHaveLength(0);
  expect(texts(tree.root)).toContain(t('learnHowTitle'));
  expect(onSessionChange).not.toHaveBeenCalledWith(true);
  expect(announce.mock.calls.map((c) => c[0])).toEqual([t('learnLockedCards'), t('learnLockedQuiz', { n: 4 })]);
  expect(haptic).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Warning);
  await act(async () => tree.unmount());
});

test('a tap on a locked card lights up the way to unlock it for a moment', async () => {
  const tree = await render({});
  const how = () => tree.root.findAll((n) => n.props.testID === 'learn-how' && n.type === 'View')[0];
  expect(flat(how().props.style).borderColor).toBe('transparent');
  await press(() => card(tree, 'hub-cards').props.onPress());
  expect(flat(how().props.style).borderColor).not.toBe('transparent');
  await act(async () => {
    await new Promise((r) => setTimeout(r, GLOW_MS + 30));
  });
  expect(flat(how().props.style).borderColor).toBe('transparent');
  await act(async () => tree.unmount());
});

// 2 ───────────────────────────────────────────────────────────────────────
describe('how to get the first word', () => {
  test('the word of the day and a scan, side by side', async () => {
    const onSaveWod = jest.fn();
    const onGoScan = jest.fn();
    const tree = await render({ wordOfDay: WOD, onSaveWod, onGoScan, scansLeft: 1 });
    const how = tree.root.findAll((n) => n.props.testID === 'learn-how' && n.type === 'View')[0];
    expect(texts(how)).toEqual(expect.arrayContaining([t('learnHowTitle'), t('learnHowText'), t('learnSaveWod'), t('learnGoScan')]));
    await press(() => byTitle(tree, t('learnSaveWod')).props.onPress());
    await press(() => byTitle(tree, t('learnGoScan')).props.onPress());
    expect(onSaveWod).toHaveBeenCalledTimes(1);
    expect(onGoScan).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('offline at first launch: no word of the day yet — it says when it comes', async () => {
    const tree = await render({ wordOfDay: null, scansLeft: 1 });
    expect(texts(tree.root)).toContain(t('learnNoWod'));
    expect(byTitle(tree, t('learnSaveWod'))).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('no scans left and no Pro: no “Scan” button that would open a paywall — a Pro line instead', async () => {
    const onOpenPaywall = jest.fn();
    const tree = await render({ wordOfDay: WOD, scansLeft: 0, isPro: false, onOpenPaywall });
    expect(byTitle(tree, t('learnGoScan'))).toBeUndefined();
    const line = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function' && texts(n).includes(t('learnScanPro')))[0];
    await press(() => line.props.onPress());
    expect(onOpenPaywall).toHaveBeenCalledWith('scans');
    await act(async () => tree.unmount());
  });

  test('Pro can always scan', async () => {
    const tree = await render({ wordOfDay: WOD, scansLeft: Infinity, isPro: true });
    expect(byTitle(tree, t('learnGoScan'))).toBeTruthy();
    expect(texts(tree.root)).not.toContain(t('learnScanPro'));
    await act(async () => tree.unmount());
  });
});

// 3 ───────────────────────────────────────────────────────────────────────
describe('“Unlocked!” exactly once', () => {
  test('the first word plays the moment and records it; the next visit is quiet', async () => {
    const onUnlockSeen = jest.fn();
    let tree;
    await act(async () => {
      tree = create(hub({ words: [], unlockSeen: { cards: false, quiz: false }, onUnlockSeen }));
    });
    await settle();
    expect(texts(tree.root)).not.toContain(t('learnUnlocked'));
    // слово дня збережено — слів стало одне
    await act(async () => tree.update(hub({ words: [w(1)], unlockSeen: { cards: false, quiz: false }, onUnlockSeen })));
    await settle();
    expect(texts(tree.root)).toContain(t('learnUnlocked'));
    expect(onUnlockSeen.mock.calls).toEqual([['cards']]);
    expect(haptic).toHaveBeenCalledWith(Haptics.NotificationFeedbackType.Success);
    await act(async () => tree.update(hub({ words: [w(1)], unlockSeen: { cards: true, quiz: false }, onUnlockSeen })));
    await act(async () => {
      await new Promise((r) => setTimeout(r, UNLOCK_MS + 50));
    });
    expect(texts(tree.root)).not.toContain(t('learnUnlocked'));
    expect(onUnlockSeen).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());

    tree = await render({ words: [w(1)], unlockSeen: { cards: true, quiz: false }, onUnlockSeen });
    expect(texts(tree.root)).not.toContain(t('learnUnlocked'));
    expect(onUnlockSeen).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('App: saving the word of the day on an empty Learn tab records cards as unlocked', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(require('../src/achievements').ACHIEVEMENTS.map((a) => a.id)));
    await AsyncStorage.setItem('ll_wod_v1', JSON.stringify({ lang: 'es', native: 'en', words: [{ date: localDayKey(), word: 'la manzana', translation: 'apple' }] }));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await settle(5);
    await press(() => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
    expect(tree.root.findByType(FlashcardsScreen).props.unlockSeen).toEqual({ cards: false, quiz: false });
    await press(() => byTitle(tree, t('learnSaveWod')).props.onPress());
    expect(texts(tree.root)).toContain(t('learnUnlocked'));
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).unlockSeen).toEqual({ cards: true, quiz: false });
    await act(async () => tree.unmount());
  });

  test('App: someone updating from v1.2 with words already has everything — no “Unlocked!”', async () => {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(require('../src/achievements').ACHIEVEMENTS.map((a) => a.id)));
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify([w(1, 'a'), w(2, 'b'), w(3, 'c'), w(4, 'd'), w(5, 'e')]));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    await settle(5);
    await press(() => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
    expect(texts(tree.root)).not.toContain(t('learnUnlocked'));
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).unlockSeen).toEqual({ cards: true, quiz: true });
    await act(async () => tree.unmount());
  });
});

// 4 ───────────────────────────────────────────────────────────────────────
describe('the quiz counts different translations', () => {
  test('quizProgress: two words with the same translation count once; never above the need', () => {
    expect(quizProgress([])).toEqual({ have: 0, need: 4 });
    expect(quizProgress([w(1, 'mug'), w(2, 'Mug '), w(3, 'cup')])).toEqual({ have: 2, need: 4 });
    expect(quizProgress([w(1, 'a'), w(2, 'b'), w(3, 'c'), w(4, 'd'), w(5, 'e')])).toEqual({ have: 4, need: 4 });
    expect(quizProgress([w(1, '')])).toEqual({ have: 0, need: 4 });
  });

  test('1–3 different translations: cards open, the quiz locked with dashes and “k more”', async () => {
    const tree = await render({ words: [w(1, 'mug'), w(2, 'mug'), w(3, 'cup')], wordOfDay: WOD });
    expect(has(tree, 'hub-cards-lock')).toBe(false);
    expect(has(tree, 'hub-quiz-lock')).toBe(true);
    const all = texts(tree.root);
    expect(all).toContain(t('learnQuizLeft', { k: 2 }));
    expect(uk('learnQuizLeft', { k: 2 })).toBe('Ще 2 слова — і квіз відкриється');
    expect(tree.root.findAll((n) => n.props.testID === 'dash-on' && n.type === 'View')).toHaveLength(2);
    expect(tree.root.findAll((n) => n.props.testID === 'dash-off' && n.type === 'View')).toHaveLength(2);
    // тиха підказка про слово дня, а не блок «Як отримати»
    expect(all).toContain(t('learnTipDaily', { k: 2 }));
    expect(all).not.toContain(t('learnHowTitle'));
    // тап по квізу підсвічує «Зберегти» на слові дня
    await press(() => card(tree, 'hub-quiz').props.onPress());
    expect(has(tree, 'glow-wod')).toBe(true);
    expect(tree.root.findAllByType(QuizScreen)).toHaveLength(0);
    await act(async () => tree.unmount());
  });

  // 5 ─────────────────────────────────────────────────────────────────────
  test('4 different translations: the quiz is open and starts a session', async () => {
    const onSessionChange = jest.fn();
    const tree = await render({ words: [w(1, 'a'), w(2, 'b'), w(3, 'c'), w(4, 'd')], onSessionChange });
    expect(has(tree, 'hub-quiz-lock')).toBe(false);
    expect(texts(tree.root)).toContain(t('quizHint'));
    expect(texts(tree.root)).not.toContain(t('learnTipDaily', { k: 0 }));
    await press(() => card(tree, 'hub-quiz').props.onPress());
    expect(tree.root.findAllByType(QuizScreen)).toHaveLength(1);
    expect(onSessionChange).toHaveBeenLastCalledWith(true);
    await act(async () => tree.unmount());
    expect(onSessionChange).toHaveBeenLastCalledWith(false);
  });
});

// 6 ───────────────────────────────────────────────────────────────────────
describe('reduce motion', () => {
  async function shakes(reduced) {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(reduced);
    const tree = await render({});
    const seq = jest.spyOn(Animated, 'sequence');
    await press(() => card(tree, 'hub-cards').props.onPress());
    const n = seq.mock.calls.length;
    await act(async () => tree.unmount());
    return n;
  }

  test('a locked card shakes with motion…', async () => {
    expect(await shakes(false)).toBeGreaterThan(0);
  });

  test('…and only answers with haptics and the highlight when “Reduce Motion” is on', async () => {
    expect(await shakes(true)).toBe(0);
  });
});
