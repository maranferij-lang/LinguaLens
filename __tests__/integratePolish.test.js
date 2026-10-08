// Шви між потоками полірування (жовтень 2026), які жоден окремий потік не
// міг перевірити сам:
//   • бюджет вібрацій: «успіх» від haptic('success') гасить другий поспіль «успіх»
//     свята серії;
//   • аркуші беруть затемнення з теми (C.scrim), а не власний rgba;
//   • App дає Параметрам isLangLocked, тож мови за Pro отримують позначку, і
//     той самий предикат — аркушу мови в сканері (LangSheet);
//   • тост досягнення теж у бюджеті: після збереженого слова другого «успіху»
//     не додає;
//   • стеля системного шрифту на основній кнопці пейволу.
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import App from '../App';
import AchievementToast from '../src/AchievementToast';
import ConsentSheet from '../src/ConsentSheet';
import LangSheet from '../src/LangSheet';
import PaywallScreen from '../src/PaywallScreen';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import StreakCelebration from '../src/streak/StreakCelebration';
import { GradBtn, SecBtn } from '../src/ui';
import { PLANS } from '../src/subscription';
import { haptic, recentSuccess, resetHapticBudget } from '../src/motion';
import { THEMES, ThemeProvider } from '../src/theme';
import { makeT } from '../src/i18n';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.setTimeout(20000);

const t = makeT('en');
const ROOT = path.join(__dirname, '..');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

afterEach(() => {
  jest.restoreAllMocks();
  jest.clearAllMocks();
  resetHapticBudget();
});

// ─── бюджет вібрацій ────────────────────────────────────────────────────────
describe('haptic budget', () => {
  test('a success buzz is remembered for a moment, other kinds are not', () => {
    expect(recentSuccess()).toBe(false);
    haptic('light');
    haptic('selection');
    haptic('warning');
    expect(recentSuccess()).toBe(false);
    haptic('success');
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1 + 1); // warning + success
    expect(recentSuccess()).toBe(true);
  });

  test('the window closes after about a second', () => {
    const now = jest.spyOn(Date, 'now');
    now.mockReturnValue(1_000_000);
    haptic('success');
    expect(recentSuccess(1_000_000 + 1000)).toBe(true);
    expect(recentSuccess(1_000_000 + 1300)).toBe(false);
  });

  test('resetHapticBudget forgets the last success (tests stay independent)', () => {
    haptic('success');
    expect(recentSuccess()).toBe(true);
    resetHapticBudget();
    expect(recentSuccess()).toBe(false);
  });

  test('an unknown kind buzzes nothing and leaves the budget alone', () => {
    haptic('boom');
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
    expect(recentSuccess()).toBe(false);
  });
});

describe('streak celebration and the haptic budget', () => {
  async function celebrate() {
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <StreakCelebration data={{ from: 1, to: 2 }} activeDays={[]} t={t} />
        </SafeAreaProvider>
      );
    });
    return tree;
  }
  const successes = () => Haptics.notificationAsync.mock.calls.filter(([k]) => k === 'success').length;

  test('on its own it still gives its Success', async () => {
    const tree = await celebrate();
    expect(successes()).toBe(1);
    await act(async () => tree.unmount());
  });

  test('right after a saved word it adds no second Success', async () => {
    haptic('success'); // слово дня щойно збережено
    const before = successes();
    const tree = await celebrate();
    expect(successes()).toBe(before);
    await act(async () => tree.unmount());
  });
});

// ─── затемнення аркушів ─────────────────────────────────────────────────────
describe('sheet backdrops use the theme scrim', () => {
  test.each(['light', 'dark', 'ocean-dark', 'berry-dark'])('ConsentSheet on %s', async (key) => {
    let tree;
    await act(async () => {
      tree = create(
        <ThemeProvider value={THEMES[key]}>
          <ConsentSheet visible onAllow={() => {}} onClose={() => {}} t={t} />
        </ThemeProvider>
      );
    });
    const hit = tree.root.findAll(
      (n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor === THEMES[key].C.scrim
    );
    expect(hit.length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  // WordSheet і ProfileScreen важкі для окремого рендеру; пильнуємо джерело
  test.each(['src/ConsentSheet.js', 'src/WordSheet.js', 'src/ProfileScreen.js', 'src/LangSheet.js'])('%s: backdrop is C.scrim, not a literal', (file) => {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    const line = src.split('\n').find((l) => /^\s*backdrop:/.test(l));
    expect(line).toBeDefined();
    expect(line).toMatch(/backgroundColor: C\.scrim/);
    expect(line).not.toMatch(/rgba\(/);
  });
});

// ─── мови за Pro в Параметрах ───────────────────────────────────────────────
describe('App feeds Settings the locked-language predicate', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
  });

  async function renderWith(words, { tab = 'settings' } = {}) {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify([]));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    if (tab) {
      await act(async () => {
        tree.root.findAll((n) => n.props.tb?.key === tab)[0].props.onPress();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    }
    return tree;
  }
  const SPANISH_WORD = { id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } };

  test('free with words in Spanish: other languages are locked, Spanish is not', async () => {
    const tree = await renderWith([SPANISH_WORD]);
    const { isLangLocked } = tree.root.findAllByType(SettingsScreen)[0].props;
    expect(typeof isLangLocked).toBe('function');
    expect(isLangLocked('de')).toBe(true);
    expect(isLangLocked('es')).toBe(false);
    await act(async () => tree.unmount());
  });

  test('free with no words yet: nothing is locked', async () => {
    const tree = await renderWith([]);
    const { isLangLocked } = tree.root.findAllByType(SettingsScreen)[0].props;
    expect(isLangLocked('de')).toBe(false);
    await act(async () => tree.unmount());
  });

  // Чип мови в сканері відкриває LangSheet: той самий предикат, тож мови за
  // Pro позначені пілюлею й там, а не лише в Параметрах
  test('the scanner language sheet gets the same predicate', async () => {
    const tree = await renderWith([SPANISH_WORD], { tab: null });
    const { isLocked } = tree.root.findAllByType(LangSheet)[0].props;
    expect(typeof isLocked).toBe('function');
    expect(isLocked('de')).toBe(true);
    expect(isLocked('es')).toBe(false);
    await act(async () => tree.unmount());
  });

  // Тост досягнення приходить тієї ж миті, що й збережене слово (перше слово
  // = first_word): слово вже дало свій «успіх», тост другого не додає
  test('the achievement toast right after a saved word adds no second Success', async () => {
    const tree = await renderWith([], { tab: null });
    const successes = () => Haptics.notificationAsync.mock.calls.filter(([k]) => k === 'success').length;
    const scanner = () => tree.root.findAllByType(ScannerScreen)[0];
    const run = async (fn) => {
      await act(async () => fn());
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });
    };
    expect(successes()).toBe(0);
    // як ScannerScreen.save(): слово в App, одразу за ним «успіх» кнопки «Зберегти»
    await run(() => {
      scanner().props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' });
      haptic('success');
    });
    expect(successes()).toBe(1);
    // перша дія дня: свято серії, за ним тост; жоден не вібрує вдруге
    const celebration = tree.root.findAllByType(StreakCelebration)[0];
    if (celebration.props.data) await run(() => celebration.props.onDone());
    expect(tree.root.findAllByType(AchievementToast)[0].props.achievement).toMatchObject({ id: 'first_word' });
    expect(successes()).toBe(1);
    await act(async () => tree.unmount());
  });
});

// ─── стеля шрифту на кнопках ────────────────────────────────────────────────
describe('button font ceiling', () => {
  const textOf = (tree, title) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === title)[0];

  test('GradBtn and SecBtn have no ceiling unless asked', async () => {
    let tree;
    await act(async () => {
      tree = create(
        <>
          <GradBtn title="Go" onPress={() => {}} />
          <SecBtn title="Later" onPress={() => {}} />
        </>
      );
    });
    expect(textOf(tree, 'Go').props.maxFontSizeMultiplier).toBeUndefined();
    expect(textOf(tree, 'Later').props.maxFontSizeMultiplier).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('maxFontScale reaches the label', async () => {
    let tree;
    await act(async () => {
      tree = create(
        <>
          <GradBtn title="Go" onPress={() => {}} maxFontScale={1.4} />
          <SecBtn title="Later" onPress={() => {}} maxFontScale={1.3} />
        </>
      );
    });
    expect(textOf(tree, 'Go').props.maxFontSizeMultiplier).toBe(1.4);
    expect(textOf(tree, 'Later').props.maxFontSizeMultiplier).toBe(1.3);
    await act(async () => tree.unmount());
  });

  test('the main paywall button keeps the 1.4 ceiling', async () => {
    let tree;
    await act(async () => {
      tree = create(
        <PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({ ok: true })} onRestore={async () => ({})} lang="en" t={t} />
      );
    });
    const cta = tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('startTrial'))[0];
    expect(cta.props.maxFontScale).toBe(1.4);
    await act(async () => tree.unmount());
  });
});
