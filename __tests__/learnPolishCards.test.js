// «Навчання», полірування жовтня 2026: порція повторення (srs), захист від
// подвійного дотику на картці, ховання невидимої сторони від VoiceOver і
// озвучка перекладу, хаптика відповідей, хаб, що не відстає від годинника.
import { AccessibilityInfo, AppState } from 'react-native';
import * as Haptics from 'expo-haptics';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import FlashcardsScreen, { TAP_GUARD_MS } from '../src/FlashcardsScreen';
import { SESSION_SIZE, dueSession, dueWords, newSrs } from '../src/srs';
import { makeT } from '../src/i18n';

const t = makeT('en');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const word = (i, due = 0, extra) => ({
  id: 'c' + i,
  word: 'word' + i,
  translation: 'tr' + i,
  lang: 'en',
  nativeLang: 'uk',
  addedAt: 1,
  srs: { box: 1, due },
  ...extra,
});
const deck = (n, due = 0) => Array.from({ length: n }, (_, i) => word(i, due));

// ── srs: порція повторення ────────────────────────────────────────────────
describe('dueSession', () => {
  const NOW = 1_000_000_000;

  test('takes the most overdue words first and no more than SESSION_SIZE', () => {
    expect(SESSION_SIZE).toBe(30);
    // слово i прострочене на i хвилин: найбільший номер — найпростроченіше
    const words = Array.from({ length: 45 }, (_, i) => word(i, NOW - (i + 1) * MIN));
    const picked = dueSession(words, NOW);
    expect(picked).toHaveLength(30);
    expect(picked.map((w) => w.id)).toEqual(Array.from({ length: 30 }, (_, k) => 'c' + (44 - k)));
  });

  test('the full due list is unchanged: dueWords still counts everything', () => {
    const words = Array.from({ length: 45 }, (_, i) => word(i, NOW - MIN));
    expect(dueWords(words, NOW)).toHaveLength(45);
    expect(dueSession(words, NOW)).toHaveLength(30);
  });

  test('words not due yet are left out; a custom limit works; the input is not reordered', () => {
    const words = [word(0, NOW + DAY), word(1, NOW - 5 * MIN), word(2, NOW - 9 * MIN), word(3, NOW)];
    const before = words.map((w) => w.id);
    expect(dueSession(words, NOW).map((w) => w.id)).toEqual(['c2', 'c1', 'c3']);
    expect(dueSession(words, NOW, 1).map((w) => w.id)).toEqual(['c2']);
    expect(words.map((w) => w.id)).toEqual(before);
    expect(dueSession([], NOW)).toEqual([]);
  });

  test('words with a broken date count as due and come first', () => {
    const words = [word(0, NOW - MIN), { id: 'broken', word: 'x', srs: { box: 0, due: NaN } }, { id: 'old', word: 'y' }];
    expect(dueSession(words, NOW).map((w) => w.id).slice(0, 2).sort()).toEqual(['broken', 'old']);
  });

  test('a fresh word is due at once', () => {
    expect(dueSession([{ id: 'n', word: 'n', srs: newSrs(NOW) }], NOW)).toHaveLength(1);
  });
});

// ── екран ─────────────────────────────────────────────────────────────────
const mounted = [];
afterEach(async () => {
  while (mounted.length) await act(async () => mounted.pop().unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <FlashcardsScreen words={[]} onReview={() => {}} t={t} targetLang="en" {...props} />
      </SafeAreaProvider>
    );
  });
  mounted.push(tree);
  return tree;
}

const run = (fn) => act(async () => fn());
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const hasText = (n, text) => n.type === 'Text' && [].concat(n.props.children).flat(Infinity).join('') === text;
const texts = (tree) => tree.root.findAll((n) => n.type === 'Text').map((n) => [].concat(n.props.children).flat(Infinity).join(''));
const button = (tree, text) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => hasText(c, text)).length > 0)[0];
const card = (tree, id) =>
  tree.root.findAll((n) => n.props.testID === id && n.props.accessibilityRole === 'button' && typeof n.props.onPress === 'function')[0];
const host = (tree, id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id)[0];
// сторона картки: нативний вигляд, що тримає підпис
const face = (tree, text) =>
  tree.root.findAll((n) => typeof n.type === 'string' && 'importantForAccessibility' in n.props && n.findAll((c) => hasText(c, text)).length > 0).at(-1);

async function startSession(tree) {
  await run(() => card(tree, 'hub-cards').props.onPress());
}

describe('double tap on the card', () => {
  test('the answer buttons ignore touches right after the flip, then work', async () => {
    jest.useFakeTimers();
    const onReview = jest.fn();
    const tree = await render({ words: deck(3), onReview });
    await startSession(tree);

    // «Показати відповідь» — перший дотик
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('auto');
    await run(() => button(tree, t('showAnswer')).props.onPress());
    // тепер на тому самому місці «Ще вчу» / «Знаю»: другий дотик подвійного тапу
    // не має їх зачепити, поки перекладу ще не видно
    expect(button(tree, t('know'))).toBeTruthy();
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('none');
    expect(onReview).not.toHaveBeenCalled();
    await advance(TAP_GUARD_MS - 10);
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('none');
    await advance(20);
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('auto');

    // і навпаки: після «Знаю» нова картка не відповідає на другий дотик
    await run(() => button(tree, t('know')).props.onPress());
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('none');
    await advance(TAP_GUARD_MS + 10);
    expect(host(tree, 'fc-answers').props.pointerEvents).toBe('auto');
  });

  test('the back of the card does not catch the second tap either', async () => {
    jest.useFakeTimers();
    const tree = await render({ words: deck(1) });
    await startSession(tree);
    const back = () => face(tree, 'tr0');
    expect(back().props.pointerEvents).toBe('none');
    await run(() => button(tree, t('showAnswer')).props.onPress());
    expect(back().props.pointerEvents).toBe('none'); // щит
    await advance(TAP_GUARD_MS + 10);
    expect(back().props.pointerEvents).toBe('auto');
  });

  test('the shield does not outlive the screen: leaving the session clears its timer', async () => {
    jest.useFakeTimers();
    const set = jest.spyOn(global, 'setTimeout');
    const clear = jest.spyOn(global, 'clearTimeout');
    const tree = await render({ words: deck(1) });
    await startSession(tree);
    await run(() => button(tree, t('showAnswer')).props.onPress());
    // таймер щита поставлено...
    const guards = set.mock.results.filter((_, i) => set.mock.calls[i][1] === TAP_GUARD_MS).map((r) => r.value);
    expect(guards.length).toBeGreaterThan(0);
    // ...і знято при виході, поки він не спрацював
    clear.mockClear();
    await act(async () => tree.unmount());
    mounted.pop();
    const cleared = clear.mock.calls.map((c) => c[0]);
    expect(cleared).toContain(guards.at(-1));
  });
});

describe('VoiceOver and the two faces', () => {
  test('only the visible face is in the accessibility tree', async () => {
    const tree = await render({ words: deck(1) });
    await startSession(tree);
    const front = () => face(tree, t('tapFlip'));
    const back = () => face(tree, 'tr0');
    expect(front().props.accessibilityElementsHidden).toBe(false);
    expect(front().props.importantForAccessibility).toBe('auto');
    expect(back().props.accessibilityElementsHidden).toBe(true);
    expect(back().props.importantForAccessibility).toBe('no-hide-descendants');

    await run(() => button(tree, t('showAnswer')).props.onPress());
    expect(front().props.accessibilityElementsHidden).toBe(true);
    expect(front().props.importantForAccessibility).toBe('no-hide-descendants');
    expect(back().props.accessibilityElementsHidden).toBe(false);
    expect(back().props.importantForAccessibility).toBe('auto');
  });

  test('flipping reads the translation aloud, whichever way the card was flipped', async () => {
    const spy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    const tree = await render({ words: deck(1) });
    await startSession(tree);
    spy.mockClear();
    await run(() => button(tree, t('showAnswer')).props.onPress());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('tr0');
    // назад на лице — нічого не читаємо
    spy.mockClear();
    const backPress = tree.root.findAll((n) => typeof n.props.onAccessibilityAction === 'function' && n.findAll((c) => hasText(c, 'tr0')).length)[0];
    await run(() => backPress.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(spy).not.toHaveBeenCalled();
    // повторний переворот знову читає
    await run(() => button(tree, t('showAnswer')).props.onPress());
    expect(spy).toHaveBeenCalledWith('tr0');
  });
});

describe('haptics of the answers', () => {
  async function play(answers) {
    const impact = jest.spyOn(Haptics, 'impactAsync');
    const notify = jest.spyOn(Haptics, 'notificationAsync');
    const select = jest.spyOn(Haptics, 'selectionAsync');
    const tree = await render({ words: deck(answers.length) });
    await startSession(tree);
    const calls = [];
    for (const known of answers) {
      await run(() => button(tree, t('showAnswer')).props.onPress());
      impact.mockClear();
      notify.mockClear();
      select.mockClear();
      await run(() => button(tree, known ? t('know') : t('stillLearning')).props.onPress());
      calls.push({ impact: impact.mock.calls.map((c) => c[0]), notify: notify.mock.calls.map((c) => c[0]), select: select.mock.calls.length });
    }
    return calls;
  }

  test('“Still learning” is a light tick, never the heavy thump', async () => {
    const calls = await play([false, true, true]);
    expect(calls[0].impact).toEqual([]);
    expect(calls[0].select).toBe(1);
    expect(calls[1].impact).toEqual([Haptics.ImpactFeedbackStyle.Light]);
    for (const c of calls) expect(c.impact).not.toContain(Haptics.ImpactFeedbackStyle.Heavy);
  });

  test('finishing a good session (60% or more) is a success', async () => {
    const calls = await play([true, false, true]); // 2 з 3 = 67 %
    expect(calls[0].notify).toEqual([]);
    expect(calls[1].notify).toEqual([]);
    expect(calls[2].notify).toEqual([Haptics.NotificationFeedbackType.Success]);
    expect(calls[2].impact).toEqual([]);
  });

  test('finishing a poor session stays quiet: no celebration for 1 of 3', async () => {
    const calls = await play([false, true, false]);
    for (const c of calls) expect(c.notify).toEqual([]);
    expect(calls[2].impact).toEqual([]);
  });
});

describe('a due backlog', () => {
  test('one session takes 30 words, the most overdue ones, in any order', async () => {
    const NOW = Date.now();
    const words = Array.from({ length: 40 }, (_, i) => word(i, NOW - (i + 1) * MIN));
    const onReview = jest.fn();
    const tree = await render({ words, onReview });
    await startSession(tree);
    expect(texts(tree)).toContain('1 / 30');
    for (let i = 0; i < 30; i++) {
      await run(() => button(tree, t('showAnswer')).props.onPress());
      await run(() => button(tree, t('know')).props.onPress());
    }
    const ids = onReview.mock.calls.map((c) => c[0]);
    expect(new Set(ids).size).toBe(30);
    // найпростроченіші — слова з найбільшими номерами
    for (let i = 10; i < 40; i++) expect(ids).toContain('c' + i);
    // сесія скінчилась, хаб досі каже, що лишилось 10
    expect(texts(tree)).toContain(t('done'));
  });

  test('the evening “review 1 card” rescue serves the most overdue word, not the oldest saved', async () => {
    const NOW = Date.now();
    // збережені першими, але прострочені найменше
    const words = [word(0, NOW - 1 * MIN), word(1, NOW - 2 * MIN), word(2, NOW - 3 * DAY)];
    const onReview = jest.fn();
    const tree = await render({ words, onReview, streak: { n: 4, doneToday: false, phase: 'evening' } });
    await run(() => button(tree, t('streakRiskCta')).props.onPress());
    expect(texts(tree)).toContain('1 / 1');
    await run(() => button(tree, t('showAnswer')).props.onPress());
    await run(() => button(tree, t('know')).props.onPress());
    expect(onReview).toHaveBeenCalledTimes(1);
    expect(onReview.mock.calls[0][0]).toBe('c2');
  });
});

describe('the hub follows the clock', () => {
  test('a word that comes due while the hub is open flips the hint from practice to a count', async () => {
    jest.useFakeTimers();
    const now = Date.now();
    const words = [word(0, now + 10 * MIN)];
    const tree = await render({ words });
    expect(texts(tree).some((x) => x.startsWith('Practice now'))).toBe(true);
    expect(texts(tree)).not.toContain(t('dueToday', { n: 1 }));
    await advance(10 * MIN + 400);
    expect(texts(tree)).toContain(t('dueToday', { n: 1 }));
    expect(texts(tree).some((x) => x.startsWith('Practice now'))).toBe(false);
  });

  test('coming back from the background refreshes the count at once', async () => {
    jest.useFakeTimers();
    const listeners = [];
    jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'change') listeners.push(fn);
      return { remove() {} };
    });
    const now = Date.now();
    const tree = await render({ words: [word(0, now + 6 * 60 * MIN)] });
    expect(texts(tree)).not.toContain(t('dueToday', { n: 1 }));
    // час пішов, пока застосунок спав: таймер не спрацював, годинник зсунувся
    jest.setSystemTime(now + 7 * 60 * MIN);
    await run(() => listeners.forEach((fn) => fn('active')));
    expect(texts(tree)).toContain(t('dueToday', { n: 1 }));
    // 'background' нічого не змінює
    await run(() => listeners.forEach((fn) => fn('background')));
    expect(texts(tree)).toContain(t('dueToday', { n: 1 }));
  });

  test('no timer is left running when the hub goes away', async () => {
    jest.useFakeTimers();
    async function leftOver(due) {
      const tree = await render({ words: [word(0, due)] });
      const running = jest.getTimerCount();
      await act(async () => tree.unmount());
      mounted.pop();
      return [running, jest.getTimerCount()];
    }
    const [noWait, noWaitAfter] = await leftOver(0);
    jest.clearAllTimers();
    const [waiting, waitingAfter] = await leftOver(Date.now() + 3 * DAY);
    // слово, що дозріє через три дні, ставить один таймер, а вихід його знімає
    expect(waiting).toBe(noWait + 1);
    expect(waitingAfter).toBe(noWaitAfter);
  });
});
