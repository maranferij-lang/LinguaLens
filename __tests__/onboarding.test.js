// Онбординг: слайди → цілі → сфера (лише для роботи чи навчання) → рівень →
// звідки дізнались → сповіщення. Кожен крок можна пропустити й до кожного
// повернутись; повтор із Параметрів показує поточні відповіді й не скидає
// профіль, якщо в ньому нічого не змінили.
import { Dimensions, FlatList } from 'react-native';
import { act, create } from 'react-test-renderer';
import OnboardingScreen from '../src/OnboardingScreen';
import { requestPermission } from '../src/wordOfDay';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

jest.mock('../src/wordOfDay', () => ({
  ...jest.requireActual('../src/wordOfDay'),
  requestPermission: jest.fn(async () => true),
}));

const t = makeT('en');

beforeEach(() => requestPermission.mockClear());

async function render(props = {}) {
  const onDone = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<OnboardingScreen t={t} onDone={onDone} targetLang="en" {...props} />);
  });
  return { tree, onDone };
}

const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const has = (tree, s) => texts(tree).includes(s);
// Перший елемент з onPress, що підписаний чи містить цей текст
function control(tree, text) {
  const hit = tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === text || n.props.title === text || n.findAll((c) => c.props.children === text).length)
  );
  if (!hit.length) throw new Error('no control: ' + text);
  return hit.at(-1); // найглибший — сама кнопка, а не картка навколо
}
async function tap(tree, text) {
  await act(async () => {
    await control(tree, text).props.onPress();
  });
}
const nextBtn = (tree) => tree.root.findAll((n) => n.props.title === t('obNext') && typeof n.props.onPress === 'function')[0];
const slider = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable');
const progress = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'progressbar').props.accessibilityValue;
const title = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header').props.children;
async function skipSlides(tree) {
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('pfGoalsTitle'));
}
async function bump(tree, n) {
  for (let i = 0; i < Math.abs(n); i++) {
    const actionName = n > 0 ? 'increment' : 'decrement';
    await act(async () => slider(tree).props.onAccessibilityAction({ nativeEvent: { actionName } }));
  }
}

test('the full path: work → field → level → where from → personalised reminder', async () => {
  const { tree, onDone } = await render();
  // слайди: «Далі» гортає (у jest прокрутки немає — догортаємо самі), на
  // останньому — «Почати»
  await tap(tree, t('obNext'));
  const W = Dimensions.get('window').width;
  await act(async () =>
    tree.root.findByType(FlatList).props.onMomentumScrollEnd({ nativeEvent: { contentOffset: { x: 2 * W, y: 0 } } })
  );
  await tap(tree, t('obStart'));

  expect(title(tree)).toBe(t('pfGoalsTitle'));
  expect(nextBtn(tree).props.disabled).toBe(true); // жодної цілі — далі лише «Пропустити»
  await tap(tree, t('goal_work'));
  expect(control(tree, t('goal_work')).props.accessibilityState).toEqual({ checked: true });
  expect(progress(tree)).toEqual({ min: 1, max: 4, now: 1 });
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('pfFieldTitle'));
  expect(nextBtn(tree).props.disabled).toBe(true);
  await tap(tree, t('field_finance'));
  expect(control(tree, t('field_finance')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('pfLevelTitle'));
  expect(has(tree, 'English')).toBe(true); // мова, яку вчать, — над питанням
  expect(slider(tree).props.accessibilityLabel).toBe('Your level: English');
  expect(progress(tree)).toEqual({ min: 1, max: 4, now: 3 });
  await bump(tree, 3); // 5 → 8
  expect(has(tree, '8/10 · B2+ — we’ll skip the basics and start with harder words')).toBe(true);
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('pfHeardTitle'));
  await tap(tree, 'TikTok');
  await tap(tree, t('obNext'));

  expect(has(tree, 'Every day at 10:00 — a new word from finance. Nothing else.')).toBe(true);
  await tap(tree, t('notifSkip'));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith({
    wodEnabled: false,
    profile: { goals: ['work'], field: 'finance', level: 8, since: localDayKey() },
    heardFrom: 'tiktok',
  });
  expect(requestPermission).not.toHaveBeenCalled();
  await act(async () => tree.unmount());
});

test('no field question for travel, “What do you study?” for study alone', async () => {
  const { tree } = await render();
  await skipSlides(tree);
  await tap(tree, t('goal_travel'));
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('pfLevelTitle'));
  expect(progress(tree)).toEqual({ min: 1, max: 3, now: 2 });

  await tap(tree, t('pfBack'));
  await tap(tree, t('goal_travel')); // зняли
  await tap(tree, t('goal_study'));
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('pfFieldTitleStudy'));
  await act(async () => tree.unmount());
});

test('skipping every question changes nothing: no profile, no answer', async () => {
  const { tree, onDone } = await render();
  await skipSlides(tree);
  // поставили «роботу» й передумали — «Пропустити» вертає як було, без кроку сфери
  await tap(tree, t('goal_work'));
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('pfLevelTitle'));
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('pfHeardTitle'));
  await tap(tree, 'TikTok');
  await tap(tree, t('obSkip'));
  // без профілю — загальний текст про сповіщення
  expect(has(tree, t('notifText'))).toBe(true);
  await tap(tree, t('notifAllow'));
  expect(requestPermission).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith({ wodEnabled: true, profile: null, heardFrom: null });
  await act(async () => tree.unmount());
});

test('goals skipped but the level accepted: general words at that level', async () => {
  const { tree, onDone } = await render();
  await skipSlides(tree);
  await tap(tree, t('obSkip'));
  await tap(tree, t('obNext')); // слайдер не чіпали — середина шкали
  await tap(tree, t('obSkip'));
  await tap(tree, t('notifSkip'));
  expect(onDone.mock.calls[0][0].profile).toEqual({ goals: ['self'], field: null, level: 5, since: localDayKey() });
  await act(async () => tree.unmount());
});

test('Back works from every step, down to the slides', async () => {
  const { tree } = await render();
  await skipSlides(tree);
  await tap(tree, t('goal_work'));
  await tap(tree, t('obNext'));
  await tap(tree, t('field_it'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obSkip'));
  // сповіщення → звідки дізнались → рівень → сфера (вибір лишився) → цілі → слайди
  await tap(tree, t('pfBack'));
  expect(title(tree)).toBe(t('pfHeardTitle'));
  await tap(tree, t('pfBack'));
  expect(title(tree)).toBe(t('pfLevelTitle'));
  await tap(tree, t('pfBack'));
  expect(title(tree)).toBe(t('pfFieldTitle'));
  expect(control(tree, t('field_it')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('pfBack'));
  expect(title(tree)).toBe(t('pfGoalsTitle'));
  await tap(tree, t('pfBack'));
  expect(has(tree, t('ob3t'))).toBe(true); // останній слайд
  expect(has(tree, t('obStart'))).toBe(true);
  await act(async () => tree.unmount());
});

test('a replay from Settings shows the current answers and keeps an unchanged profile as is', async () => {
  const profile = { goals: ['study'], field: 'it', level: 3, since: '2026-09-01' };
  const { tree, onDone } = await render({ profile, heardFrom: 'friend', wodHour: 8 });
  await skipSlides(tree);
  expect(control(tree, t('goal_study')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('pfFieldTitleStudy'));
  expect(control(tree, t('field_it')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('obNext'));
  expect(slider(tree).props.accessibilityValue.now).toBe(3);
  await tap(tree, t('obNext'));
  expect(control(tree, t('heard_friend')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('obNext'));
  // навчання переважає (3 дні з 5) — так і кажемо, о годині людини
  expect(has(tree, 'Every day at 08:00 — a new word for your studies. Nothing else.')).toBe(true);
  await tap(tree, t('notifAllow'));
  expect(onDone.mock.calls[0][0]).toEqual({ wodEnabled: true, profile, heardFrom: 'friend' });
  expect(onDone.mock.calls[0][0].profile).toBe(profile); // since не скинуто
  await act(async () => tree.unmount());
});

test('a replay that changes the level gives a new profile from today', async () => {
  const profile = { goals: ['work'], field: 'law', level: 6, since: '2026-09-01' };
  const { tree, onDone } = await render({ profile });
  await skipSlides(tree);
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  await bump(tree, -2);
  await tap(tree, t('obNext'));
  await tap(tree, t('obSkip'));
  await tap(tree, t('notifSkip'));
  expect(onDone.mock.calls[0][0].profile).toEqual({ goals: ['work'], field: 'law', level: 4, since: localDayKey() });
  await act(async () => tree.unmount());
});
