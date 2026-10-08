// Квіз, полірування жовтня 2026: відлік не йде у фоні й без таймера з
// VoiceOver, відповідь чути словами й видно не лише кольором, пауза після
// помилки довша, нове питання проявляється, restart не падає без слів.
import { AccessibilityInfo, AppState } from 'react-native';
import { act, create } from 'react-test-renderer';
import QuizScreen, { Q_PAUSE, Q_PAUSE_MISS } from '../src/QuizScreen';
import { IcCheck, IcClose } from '../src/icons';
import { FadeIn } from '../src/ui';
import { THEMES } from '../src/theme';
import { makeT } from '../src/i18n';

jest.mock('../src/speech', () => ({ speak: jest.fn() }));

const t = makeT('en');
const C = THEMES.light.C;
const DECK = [
  { id: 'q1', word: 'cup', translation: 'чашка', lang: 'en', nativeLang: 'uk' },
  { id: 'q2', word: 'table', translation: 'стіл', lang: 'en', nativeLang: 'uk' },
  { id: 'q3', word: 'chair', translation: 'стілець', lang: 'en', nativeLang: 'uk' },
  { id: 'q4', word: 'lamp', translation: 'лампа', lang: 'en', nativeLang: 'uk' },
];

const mounted = [];
afterEach(async () => {
  while (mounted.length) await act(async () => mounted.pop().unmount());
  jest.useRealTimers();
  jest.restoreAllMocks();
});

let announce;
let appListeners;
beforeEach(() => {
  announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
  announce.mockClear(); // в jest-заглушці це вже jest.fn: історія викликів переживає restoreAllMocks
  appListeners = [];
  jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'change') appListeners.push(fn);
    return { remove() {} };
  });
  jest.useFakeTimers();
});

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(<QuizScreen words={DECK} t={t} onExit={() => {}} onMiss={() => {}} {...props} />);
  });
  mounted.push(tree);
  return tree;
}

const run = (fn) => act(async () => fn());
const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const flatText = (n) => [].concat(n.props.children).flat(Infinity).join('');
const texts = (tree) => tree.root.findAll((n) => n.type === 'Text').map(flatText);
const shown = (tree) => DECK.find((w) => texts(tree).includes(w.word));
const option = (tree, text) =>
  tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.type === 'Text' && flatText(c) === text).length > 0)[0];
const flat = (style) => Object.assign({}, ...[].concat(style).flat(Infinity).filter(Boolean));
const wrongOf = (q) => DECK.find((w) => w !== q).translation;

describe('answer feedback', () => {
  test('a right answer is announced, ticked and marked selected', async () => {
    const tree = await render();
    const q = shown(tree);
    await run(() => option(tree, q.translation).props.onPress());
    expect(announce).toHaveBeenCalledWith(t('quizCorrectA11y'));
    expect(option(tree, q.translation).props.accessibilityState).toMatchObject({ selected: true });
    expect(option(tree, wrongOf(q)).props.accessibilityState).toMatchObject({ selected: false });
    // галочка біля правильного, хрестика (окрім кнопки виходу) нема
    expect(tree.root.findAllByType(IcCheck)).toHaveLength(1);
    expect(tree.root.findAllByType(IcClose)).toHaveLength(1);
  });

  test('a wrong answer says what the right one was; the mark and the colour agree', async () => {
    const tree = await render();
    const q = shown(tree);
    const bad = wrongOf(q);
    await run(() => option(tree, bad).props.onPress());
    expect(announce).toHaveBeenCalledWith(t('quizWrongA11y', { a: q.translation }));
    expect(announce.mock.calls[0][0]).toContain(q.translation);
    // галочка на правильному, хрестик на вибраному (і хрестик виходу)
    expect(tree.root.findAllByType(IcCheck)).toHaveLength(1);
    expect(tree.root.findAllByType(IcClose)).toHaveLength(2);
    // текст результатів — чорнило теми, не заливка: контраст
    const text = (str) => tree.root.findAll((n) => n.type === 'Text' && flatText(n) === str)[0];
    expect(flat(text(q.translation).props.style).color).toBe(C.greenInk);
    expect(flat(text(bad).props.style).color).toBe(C.redInk);
  });

  test('time running out says so and names the answer', async () => {
    const tree = await render();
    const q = shown(tree);
    await advance(10000);
    expect(announce).toHaveBeenCalledWith(t('quizTimeUpA11y', { a: q.translation }));
    expect(texts(tree)).toContain(t('quizTimeUp'));
  });

  test('the strings exist in every language, without long dashes', () => {
    for (const lang of ['en', 'uk', 'de', 'es', 'ru']) {
      const l = makeT(lang);
      for (const key of ['achShareHint', 'quizCorrectA11y', 'quizWrongA11y', 'quizTimeUpA11y']) {
        const text = l(key, { a: 'X' });
        expect(text).not.toBe(key);
        expect(text).not.toMatch(/[—–]/);
        expect(text).not.toMatch(/\{\w+\}/);
      }
      expect(l('quizWrongA11y', { a: 'X' })).toContain('X');
      expect(l('quizTimeUpA11y', { a: 'X' })).toContain('X');
    }
  });
});

describe('pauses', () => {
  const question = (tree) => texts(tree).find((x) => /^\d+ \/ \d+$/.test(x));

  test('the pause after a miss is longer than after a hit', () => {
    expect(Q_PAUSE).toBe(900);
    expect(Q_PAUSE_MISS).toBeGreaterThan(Q_PAUSE);
  });

  test('after a right answer the next question comes in 900 ms', async () => {
    const tree = await render();
    const q = shown(tree);
    expect(question(tree)).toBe('1 / 4');
    await run(() => option(tree, q.translation).props.onPress());
    await advance(Q_PAUSE - 10);
    expect(question(tree)).toBe('1 / 4');
    await advance(20);
    expect(question(tree)).toBe('2 / 4');
  });

  test('after a wrong answer it waits for Q_PAUSE_MISS, so the right translation can be read', async () => {
    const tree = await render();
    const q = shown(tree);
    await run(() => option(tree, wrongOf(q)).props.onPress());
    await advance(Q_PAUSE + 100);
    expect(question(tree)).toBe('1 / 4');
    await advance(Q_PAUSE_MISS - Q_PAUSE - 100 + 20);
    expect(question(tree)).toBe('2 / 4');
  });

  test('after time-up the quiz keeps its short pause: the options were in view for ten seconds', async () => {
    const tree = await render();
    await advance(10000);
    await advance(Q_PAUSE + 20);
    expect(question(tree)).toBe('2 / 4');
  });

  test('every new question fades in (the block is keyed by the question)', async () => {
    const tree = await render();
    const key = () => tree.root.findByType(FadeIn)._fiber.key;
    expect(key()).toBe('0');
    await run(() => option(tree, shown(tree).translation).props.onPress());
    await advance(Q_PAUSE + 20);
    expect(key()).toBe('1');
  });
});

describe('leaving the app mid-question', () => {
  test('the clock stops in the background and a returning player gets the full ten seconds', async () => {
    const onMiss = jest.fn();
    const tree = await render({ onMiss });
    await advance(6000);
    // згорнули (телефон, Face ID, шторка): JS-таймери не йдуть, а прострочені
    // спрацювали б при поверненні — тут їх знято
    await run(() => appListeners.forEach((fn) => fn('inactive')));
    await advance(60000);
    expect(texts(tree)).not.toContain(t('quizTimeUp'));
    expect(onMiss).not.toHaveBeenCalled();
    await run(() => appListeners.forEach((fn) => fn('active')));
    await advance(9000);
    expect(texts(tree)).not.toContain(t('quizTimeUp'));
    expect(onMiss).not.toHaveBeenCalled();
    await advance(1100);
    expect(texts(tree)).toContain(t('quizTimeUp'));
    expect(onMiss).toHaveBeenCalledTimes(1);
  });

  test('an answered question is not restarted by returning to the app', async () => {
    const onMiss = jest.fn();
    const tree = await render({ onMiss });
    const q = shown(tree);
    await run(() => option(tree, q.translation).props.onPress());
    await run(() => appListeners.forEach((fn) => fn('background')));
    await run(() => appListeners.forEach((fn) => fn('active')));
    // 10 с тому, що початок питання скинуто б, — але питання вже відповіли,
    // і перейшли далі; помилки немає
    await advance(Q_PAUSE + 20);
    expect(onMiss).not.toHaveBeenCalled();
  });
});

describe('VoiceOver', () => {
  test('no countdown: ten seconds are not enough to hear four options and double-tap', async () => {
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(true);
    const onMiss = jest.fn();
    const tree = await render({ onMiss });
    await advance(1);
    await advance(30000);
    expect(onMiss).not.toHaveBeenCalled();
    expect(texts(tree)).not.toContain(t('quizTimeUp'));
    // відповідь працює як завжди
    const q = shown(tree);
    await run(() => option(tree, q.translation).props.onPress());
    expect(announce).toHaveBeenCalledWith(t('quizCorrectA11y'));
    await advance(Q_PAUSE + 20);
    expect(texts(tree).find((x) => /^\d+ \/ \d+$/.test(x))).toBe('2 / 4');
  });

  test('turning VoiceOver on in the middle of a question stops the clock', async () => {
    let listener;
    jest.spyOn(AccessibilityInfo, 'addEventListener').mockImplementation((type, fn) => {
      if (type === 'screenReaderChanged') listener = fn;
      return { remove() {} };
    });
    const onMiss = jest.fn();
    await render({ onMiss });
    await advance(4000);
    await run(() => listener(true));
    await advance(30000);
    expect(onMiss).not.toHaveBeenCalled();
    // вимкнули: питання починається знову з повного відліку
    await run(() => listener(false));
    await advance(9900);
    expect(onMiss).not.toHaveBeenCalled();
    await advance(200);
    expect(onMiss).toHaveBeenCalledTimes(1);
  });
});

describe('no questions', () => {
  test('“Play again” with the words gone leaves the quiz instead of crashing', async () => {
    const onExit = jest.fn();
    const onQuizDone = jest.fn();
    const tree = await render({ onExit, onQuizDone });
    for (let i = 0; i < 4; i++) {
      await run(() => option(tree, shown(tree).translation).props.onPress());
      await advance(Q_PAUSE + 20);
    }
    expect(texts(tree)).toContain(t('quizDone'));
    // синхронізація забрала слова між раундами
    await act(async () => tree.update(<QuizScreen words={[]} t={t} onExit={onExit} onQuizDone={onQuizDone} onMiss={() => {}} />));
    const again = tree.root.findAll((n) => n.props.title === t('quizAgain') && typeof n.props.onPress === 'function')[0];
    await run(() => again.props.onPress());
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('a quiz that opens without questions hands control back and stays silent', async () => {
    const onExit = jest.fn();
    const onMiss = jest.fn();
    const tree = await render({ words: [], onExit, onMiss });
    expect(onExit).toHaveBeenCalled();
    expect(tree.toJSON()).toBeNull();
    await advance(15000);
    expect(onMiss).not.toHaveBeenCalled();
  });
});
