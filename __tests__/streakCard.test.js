// Серія 2.0 на екранах (core.md C.4): картка в Профілі, чип на «Навчанні»,
// вечірній банер «серія під загрозою», «3 год 13 хв».
/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import ProfileScreen from '../src/ProfileScreen';
import StreakCard, { cardLine } from '../src/streak/StreakCard';
import StreakChip, { atRisk } from '../src/streak/StreakChip';
import RiskBanner, { msToMidnight } from '../src/streak/RiskBanner';
import { flameForm, streakInfo } from '../src/streak';
import { formatLeft } from '../src/locale';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';
import { ACHIEVEMENTS } from '../src/achievements';

jest.setTimeout(20000);

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const uk = makeT('uk');
const at = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min);
// активні дні: від from до to включно (числа жовтня 2026)
const days = (from, to) => {
  const out = [];
  for (let d = from; d <= to; d++) out.push(localDayKey(at(2026, 10, d)));
  return out;
};

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function render(el) {
  let tree;
  await act(async () => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{el}</SafeAreaProvider>);
  });
  await settle();
  return tree;
}

const texts = (node) => node.findAll((n) => n.type === 'Text' && typeof n.props.children === 'string').map((n) => n.props.children);
const ids = (node, id) => node.findAll((n) => n.props.testID === id && n.type === 'View');
const flame = (node, id) => node.findAll((n) => n.props.testID === id && typeof n.type !== 'string')[0];

describe('formatLeft', () => {
  test('hours and minutes in the interface language; minutes round up', () => {
    const ms = (h, m, s = 0) => ((h * 60 + m) * 60 + s) * 1000;
    expect(formatLeft(ms(3, 13), 'uk')).toBe('3 год 13 хв');
    expect(formatLeft(ms(3, 12, 30), 'en')).toBe('3 h 13 min');
    expect(formatLeft(ms(2, 0), 'de')).toBe('2 Std.');
    expect(formatLeft(ms(0, 13), 'es')).toBe('13 min');
    expect(formatLeft(30 * 1000, 'uk')).toBe('1 хв');
    expect(formatLeft(0, 'uk')).toBe('1 хв');
  });

  test('time to midnight', () => {
    expect(msToMidnight(at(2026, 10, 4, 20, 47))).toBe((3 * 60 + 13) * 60 * 1000);
    // ніч зміни часу (25.10.2026, Київ): до півночі рахуємо за годинником
    expect(msToMidnight(at(2026, 10, 25, 23, 0))).toBe(60 * 60 * 1000);
  });
});

describe('the Profile card', () => {
  test('day five, done today: the flame of day five, the week in dots, the way to a week', async () => {
    const now = at(2026, 10, 9, 15);
    const tree = await render(<StreakCard activeDays={days(5, 9)} now={now} weekStart={2} t={t} />);
    const all = texts(tree.root);
    expect(all).toContain('5 days in a row');
    expect(all).toContain('2 more days to a week — then your flame catches fire');
    expect(all).toContain('5 of 7');
    expect(all).toContain(t('streakGoalWeek'));
    expect(flame(tree.root, 'streak-card-flame').props).toMatchObject({ n: 5, pending: false });
    // тиждень з понеділка 5.10: пн–чт зроблено, пт — сьогодні, сб–нд попереду
    expect(ids(tree.root, 'week-done')).toHaveLength(4);
    expect(ids(tree.root, 'week-today')).toHaveLength(1);
    expect(ids(tree.root, 'week-future')).toHaveLength(2);
    await act(async () => tree.unmount());
  });

  test('not yet today in the evening: a pale flame and a gentle nudge, not a reproach', async () => {
    const tree = await render(<StreakCard activeDays={days(6, 8)} now={at(2026, 10, 9, 19)} weekStart={2} t={uk} />);
    const all = texts(tree.root);
    expect(all).toContain('3 дні поспіль');
    expect(all).toContain('Не дай вогнику згаснути');
    expect(flame(tree.root, 'streak-card-flame').props).toMatchObject({ n: 3, pending: true });
    expect(ids(tree.root, 'week-pending')).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  test('zero: a start, not a failure; the record when it was longer', async () => {
    let tree = await render(<StreakCard activeDays={[]} now={at(2026, 10, 9)} t={uk} />);
    expect(texts(tree.root)).toEqual(expect.arrayContaining(['Почни серію сьогодні', 'Збережи слово — і запали перший вогник']));
    expect(flameForm(0).stage).toBe('ember');
    await act(async () => tree.unmount());

    tree = await render(<StreakCard activeDays={days(1, 2)} best={12} now={at(2026, 10, 9)} t={uk} />);
    expect(texts(tree.root)).toEqual(expect.arrayContaining(['Серія згасла. Почни нову сьогодні', 'Рекорд — 12 днів']));
    await act(async () => tree.unmount());
  });

  test('the week day itself: “A whole week” instead of a countdown', () => {
    const info = { ...streakInfo({ activeDays: days(3, 9), now: at(2026, 10, 9) }), phase: 'day' };
    expect(info.n).toBe(7);
    expect(cardLine(info, t)).toBe(t('streakWeek'));
  });

  test('Profile: from the streak chip — Progress tab, the card scrolled into view', async () => {
    const onFocusDone = jest.fn();
    const tree = await render(
      <ProfileScreen words={[]} activity={{}} stats={{}} profile={{ name: '', avatar: 'wave' }} onUpdateProfile={() => {}} focusStreak onFocusDone={onFocusDone} t={t} />
    );
    expect(onFocusDone).toHaveBeenCalledTimes(1);
    expect(texts(tree.root)).toContain(t('streakStartTitle'));
    await act(async () => tree.unmount());
  });

  test('Profile scrolls only as far as needed: a tall phone stays put, a small one lifts the card from under the tab bar', async () => {
    const { ScrollView } = require('react-native');
    const profile = (focusStreak) => (
      <ProfileScreen words={[]} activity={{}} stats={{}} profile={{ name: '', avatar: 'wave' }} onUpdateProfile={() => {}} focusStreak={focusStreak} t={t} />
    );
    const lay = async (tree, viewport, card) => {
      const scroll = tree.root.findByType(ScrollView);
      scroll.instance.scrollTo.mockClear?.();
      const wrap = tree.root.findAll((n) => n.type === 'View' && typeof n.props.onLayout === 'function' && n.findAll((x) => x.props.testID === 'streak-card-flame').length)[0];
      await act(async () => wrap.props.onLayout({ nativeEvent: { layout: card } }));
      await act(async () => scroll.props.onLayout({ nativeEvent: { layout: { height: viewport } } }));
      return scroll.instance.scrollTo;
    };
    // Pro Max: картку видно всю — екран не крутиться, заголовок на місці
    let tree = await render(profile(true));
    expect(await lay(tree, 870, { y: 380, height: 330 })).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
    // SE: низ картки під таб-баром — рівно настільки, щоб вона вийшла
    tree = await render(profile(true));
    const scrollTo = await lay(tree, 600, { y: 380, height: 330 });
    expect(scrollTo).toHaveBeenCalledTimes(1);
    expect(scrollTo.mock.calls[0][0].y).toBe(380 + 330 + 78 + 12 - 600);
    await act(async () => tree.unmount());
    // без прохання з чипа — ніякої прокрутки
    tree = await render(profile(false));
    expect(await lay(tree, 600, { y: 380, height: 330 })).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });
});

describe('the chip on Learn', () => {
  test('flame and number; pale when today is not done yet', async () => {
    const tree = await render(<StreakChip info={{ n: 4, doneToday: false, phase: 'day' }} onPress={() => {}} t={t} />);
    expect(texts(tree.root)).toContain('4');
    expect(flame(tree.root, 'streak-chip-flame').props).toMatchObject({ n: 4, pending: true });
    expect(ids(tree.root, 'streak-chip-dot')).toHaveLength(0);
    const chip = tree.root.findAll((n) => n.props.testID === 'streak-chip' && typeof n.props.onPress === 'function')[0];
    expect(chip.props.accessibilityLabel).toBe('Streak: 4 days. Not yet today — one word');
    await act(async () => tree.unmount());
  });

  test('in the evening, at risk: amber dashed border and a red dot', async () => {
    expect(atRisk({ n: 4, doneToday: false, phase: 'evening' })).toBe(true);
    expect(atRisk({ n: 4, doneToday: true, phase: 'late' })).toBe(false);
    expect(atRisk({ n: 0, doneToday: false, phase: 'late' })).toBe(false);
    expect(atRisk({ n: 4, doneToday: false, phase: 'day' })).toBe(false);
    const tree = await render(<StreakChip info={{ n: 4, doneToday: false, phase: 'late' }} onPress={() => {}} t={t} />);
    expect(ids(tree.root, 'streak-chip-dot')).toHaveLength(1);
    await act(async () => tree.unmount());
  });
});

describe('the evening banner on Learn', () => {
  const hub = (props) => <FlashcardsScreen words={[]} onReview={() => {}} t={uk} targetLang="es" lang="uk" onSaveWod={() => {}} wodSaved={false} {...props} />;
  const w = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't' + i, lang: 'es', addedAt: 1, srs: { box: 0, due: 0 } });

  test('from 18:00 with a streak and nothing today: title, time to midnight, “Review 1 card”', async () => {
    jest.useFakeTimers({ now: at(2026, 10, 4, 20, 47), advanceTimers: true });
    const onReview = jest.fn();
    const tree = await render(hub({ words: [w(1), w(2), w(3)], onReview, streak: { n: 5, doneToday: false, phase: 'evening' } }));
    expect(ids(tree.root, 'risk-banner')).toHaveLength(1);
    const all = texts(tree.root);
    expect(all).toContain('Серія 5 днів згасне опівночі');
    expect(all).toContain('Ще 3 год 13 хв. Повтори одне слово — і вогник житиме.');
    // одна картка, як і обіцяє кнопка
    const cta = tree.root.findAll((n) => n.props.title === 'Повторити 1 картку' && typeof n.props.onPress === 'function')[0];
    await act(async () => cta.props.onPress());
    await settle();
    const progress = tree.root.findAll((n) => n.type === 'Text' && Array.isArray(n.props.children)).map((n) => n.props.children.join(''));
    expect(progress).toContain('1 / 1');
    await act(async () => tree.unmount());
  });

  test('no words yet: the banner saves the word of the day instead', async () => {
    const onSaveWod = jest.fn();
    const tree = await render(
      hub({ onSaveWod, wordOfDay: { date: '2026-10-04', word: 'la manzana', translation: 'apple' }, streak: { n: 2, doneToday: false, phase: 'late' } })
    );
    const ctas = tree.root.findAll((n) => n.props.title === uk('learnSaveWod') && typeof n.props.onPress === 'function');
    await act(async () => ctas[0].props.onPress());
    expect(onSaveWod).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('no banner by day, after today’s action, or without a streak', async () => {
    for (const streak of [
      { n: 5, doneToday: false, phase: 'day' },
      { n: 5, doneToday: true, phase: 'evening' },
      { n: 0, doneToday: false, phase: 'late' },
    ]) {
      const tree = await render(hub({ streak }));
      expect(ids(tree.root, 'risk-banner')).toHaveLength(0);
      await act(async () => tree.unmount());
    }
  });

  test('banner text never ties the streak to scanning', () => {
    for (const lang of ['en', 'uk', 'de', 'es']) {
      const tl = makeT(lang);
      for (const k of ['streakRiskTitle', 'streakRiskBody', 'streakRiskCta', 'streakNotifBody']) expect(tl(k, { n: 3, t: '1' })).not.toMatch(/scan|скан|escane/i);
    }
  });

  test('the time left reads cleanly in every language: no “Min..” after an abbreviation', () => {
    for (const lang of ['en', 'uk', 'de', 'es']) {
      const tl = makeT(lang);
      for (const ms of [60000, 2 * 3600000, (3 * 60 + 13) * 60000]) {
        const body = tl('streakRiskBody', { t: formatLeft(ms, lang) });
        expect(body).not.toMatch(/\.\./);
        expect(body).toContain(formatLeft(ms, lang));
      }
    }
  });
});

describe('App', () => {
  const longAgo = () => Date.now() - 60 * 86400000;
  async function app() {
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

  test('Learn shows the streak chip; a tap opens Profile on the streak card', async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: longAgo(), srs: { box: 0, due: 0 } }]));
    const y = new Date();
    y.setDate(y.getDate() - 1);
    await AsyncStorage.setItem('ll_activity_v1', JSON.stringify({ [localDayKey(y)]: 2 }));
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const tree = await app();
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'cards')[0].props.onPress());
    await settle();
    expect(tree.root.findByType(FlashcardsScreen).props.streak).toMatchObject({ n: 1, doneToday: false });
    const chip = tree.root.findAll((n) => n.props.testID === 'streak-chip' && typeof n.props.onPress === 'function')[0];
    await act(async () => chip.props.onPress());
    await settle();
    expect(tree.root.findAllByType(ProfileScreen)).toHaveLength(1);
    expect(texts(tree.root)).toContain('1 day in a row');
    await act(async () => tree.unmount());
  });
});
