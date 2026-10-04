// Онбординг 2.0: вітання → імʼя → цілі → сфера (лише для роботи чи
// навчання) → рівень → що заважає → план → перший скан → сповіщення →
// звідки дізнались → обіцянка. Варіант 'short' (прапорець onboarding-flow)
// — без імені, «що заважає» й обіцянки. Повтор із Параметрів показує
// поточні відповіді й не скидає профіль, якщо в ньому нічого не змінили.
// Імʼя не йде ні в статистику, ні нікуди ще — лише в результат для App.
import { AppState, Linking, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import OnboardingScreen, { COMMIT_PAUSE_MS, onboardingFlow } from '../src/OnboardingScreen';
import { permissionStatus, requestPermission } from '../src/wordOfDay';
import { flag, track } from '../src/analytics';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

jest.mock('../src/wordOfDay', () => ({
  ...jest.requireActual('../src/wordOfDay'),
  requestPermission: jest.fn(async () => true),
  permissionStatus: jest.fn(async () => 'undetermined'),
}));
jest.mock('../src/analytics', () => ({
  flag: jest.fn(async () => 'control'),
  track: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const t = makeT('en');
const TODAY = localDayKey();

beforeEach(() => {
  jest.clearAllMocks();
  requestPermission.mockImplementation(async () => true);
  permissionStatus.mockImplementation(async () => 'undetermined');
  flag.mockImplementation(async () => 'control');
});

// Дерево розмонтовуємо й тоді, коли перевірка впала: Lingo гойдається
// нескінченно, і jest інакше не завершився б.
const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
});

async function render(props = {}) {
  const onDone = jest.fn();
  let tree;
  await act(async () => {
    tree = create(<OnboardingScreen t={t} onDone={onDone} targetLang="en" {...props} />);
  });
  mounted.push(tree);
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
const hasControl = (tree, text) => {
  try {
    control(tree, text);
    return true;
  } catch (_) {
    return false;
  }
};
async function tap(tree, text) {
  await act(async () => {
    await control(tree, text).props.onPress();
  });
}
const nextBtn = (tree, title = t('obNext')) =>
  tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const slider = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable');
const header = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header');
const title = (tree) => header(tree).props.children;
const nameInput = (tree) => tree.root.find((n) => typeof n.props.onChangeText === 'function' && n.props.maxLength === 30);
const ring = (tree) => tree.root.findAll((n) => n.props.testID === 'hold-to-commit' && n.props.onAccessibilityAction)[0];
const events = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

async function start(tree) {
  await tap(tree, t('obStart'));
}
async function typeName(tree, value) {
  await act(async () => nameInput(tree).props.onChangeText(value));
}
async function bump(tree, n) {
  for (let i = 0; i < Math.abs(n); i++) {
    const actionName = n > 0 ? 'increment' : 'decrement';
    await act(async () => slider(tree).props.onAccessibilityAction({ nativeEvent: { actionName } }));
  }
}
// Обіцянка дією VoiceOver (жест тримання — у holdToCommit.test.js); далі
// пауза «Домовились!» і фінал.
async function promise(tree) {
  await act(async () => ring(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  await act(async () => {
    await new Promise((r) => setTimeout(r, COMMIT_PAUSE_MS + 50));
  });
}

describe('flow order', () => {
  test('control: every step; field only for work or study; first scan and push only when possible', () => {
    expect(onboardingFlow({ goals: [] })).toEqual(['welcome', 'name', 'goals', 'level', 'struggles', 'plan', 'heard', 'commit']);
    expect(onboardingFlow({ goals: ['work'], wow: true, push: true })).toEqual([
      'welcome',
      'name',
      'goals',
      'field',
      'level',
      'struggles',
      'plan',
      'wow',
      'push',
      'heard',
      'commit',
    ]);
    expect(onboardingFlow({ goals: ['travel'] })).not.toContain('field');
    expect(onboardingFlow({ goals: ['study'] })).toContain('field');
  });

  test('short: no name, no struggles, no commitment', () => {
    expect(onboardingFlow({ variant: 'short', goals: ['study'], wow: true, push: true })).toEqual([
      'welcome',
      'goals',
      'field',
      'level',
      'plan',
      'wow',
      'push',
      'heard',
    ]);
  });

  test('replay: name → goals → field → level → struggles → plan, push only if never asked', () => {
    expect(onboardingFlow({ replay: true, goals: ['work'], wow: true })).toEqual(['name', 'goals', 'field', 'level', 'struggles', 'plan']);
    expect(onboardingFlow({ replay: true, goals: [], push: true })).toEqual(['name', 'goals', 'level', 'struggles', 'plan', 'push']);
  });
});

test('the full path: name → work in finance → B2+ → struggles → honest plan → push → heard → promise', async () => {
  const { tree, onDone } = await render();
  expect(has(tree, t('obHookTitle'))).toBe(true);
  // на вітанні немає ні «Назад», ні смужки
  expect(hasControl(tree, t('pfBack'))).toBe(false);
  expect(tree.root.findAll((n) => n.props.testID === 'onb-progress')).toHaveLength(0);
  await start(tree);

  expect(title(tree)).toBe(t('obNameTitle'));
  // «Крок 1 з 8» VoiceOver чує в заголовку; смужку він не бачить
  expect(header(tree).props.accessibilityLabel).toBe('Step 1 of 8. ' + t('obNameTitle'));
  const bar = tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'onb-progress');
  expect(bar.props).toMatchObject({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' });
  expect(nextBtn(tree).props.disabled).toBe(true);
  await typeName(tree, '   Олена  ');
  expect(nextBtn(tree).props.disabled).toBe(false);
  await tap(tree, t('obNext'));
  expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light'); // легкий відгук на «Далі»

  expect(title(tree)).toBe(t('pfGoalsTitle'));
  await tap(tree, t('goal_work'));
  expect(Haptics.selectionAsync).toHaveBeenCalled(); // тік на виборі
  // сфера з'явилась у потоці — кроків стало 9
  expect(header(tree).props.accessibilityLabel).toBe('Step 2 of 9. ' + t('pfGoalsTitle'));
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('pfFieldTitle'));
  await tap(tree, t('field_finance'));
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('pfLevelTitle'));
  await bump(tree, 3); // 5 → 8
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('obStrugglesTitle'));
  expect(nextBtn(tree).props.disabled).toBe(true);
  await tap(tree, t('struggle_time'));
  await tap(tree, t('struggle_forget'));
  expect(control(tree, t('struggle_forget')).props.accessibilityState).toEqual({ checked: true });
  await tap(tree, t('obNext'));

  // План: справжній цикл тем (4/2/1), рівень і по рядку на кожну труднощ
  expect(title(tree)).toBe('Олена, here’s your plan');
  for (const s of ['Finance', '4 days of 7', 'Work', '2 days', 'General', '1 day', 'B2+']) expect(has(tree, s)).toBe(true);
  expect(has(tree, 'B2+ — ' + t('levelBand4'))).toBe(true);
  expect(has(tree, t('plan_forget'))).toBe(true);
  expect(has(tree, t('plan_time'))).toBe(true);
  expect(has(tree, t('plan_boring'))).toBe(false);
  // на плані нема що пропускати
  expect(hasControl(tree, t('obSkip'))).toBe(false);
  await tap(tree, t('obNext'));

  // Сповіщення: пояснення й попередній перегляд, єдина кнопка — «Далі»
  expect(title(tree)).toBe(t('obPushTitle'));
  expect(has(tree, 'Every day at 10:00 — a new word from finance. Nothing else.')).toBe(true);
  expect(has(tree, 'Word of the day · Finance')).toBe(true);
  expect(texts(tree).some((s) => /allow/i.test(s))).toBe(false); // App Review 5.1.1(iv)
  expect(requestPermission).not.toHaveBeenCalled();
  await tap(tree, t('obNext'));
  expect(requestPermission).toHaveBeenCalledTimes(1);

  expect(title(tree)).toBe(t('pfHeardTitle'));
  await tap(tree, 'TikTok');
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('obCommitTitle'));
  expect(has(tree, 'I, Олена, will learn English every day — one word at a time')).toBe(true);
  expect(onDone).not.toHaveBeenCalled();
  await promise(tree);

  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith({
    profile: { goals: ['work'], field: 'finance', level: 8, since: TODAY },
    heardFrom: 'tiktok',
    name: 'Олена',
    struggles: ['forget', 'time'],
    wodEnabled: true,
    scanned: false,
    flow: 'control',
  });

  // Статистика: кожен крок з варіантом, відповіді — коди, імені ніде немає
  expect(events('onboarding_step').map((e) => e.step)).toEqual([
    'welcome',
    'name',
    'goals',
    'field',
    'level',
    'struggles',
    'plan',
    'push',
    'heard',
    'commit',
  ]);
  expect(events('onboarding_step').every((e) => e.flow === 'control' && e.index >= 1 && e.total >= e.index)).toBe(true);
  expect(events('onboarding_answer')).toEqual([
    { step: 'name', value: 'given', flow: 'control' },
    { step: 'goals', value: ['work'], flow: 'control' },
    { step: 'field', value: 'finance', flow: 'control' },
    { step: 'level', value: 8, flow: 'control' },
    { step: 'struggles', value: ['forget', 'time'], flow: 'control' },
    { step: 'heard', value: 'tiktok', flow: 'control' },
  ]);
  expect(events('push_permission')).toEqual([{ granted: true, source: 'onboarding' }]);
  expect(events('onboarding_complete')).toEqual([{ flow: 'control', seconds: expect.any(Number), scanned: false, push: true }]);
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/Олена/);
});

test('the name is trimmed and capped at 30 characters', async () => {
  permissionStatus.mockImplementation(async () => 'granted');
  const { tree, onDone } = await render();
  await start(tree);
  expect(nameInput(tree).props).toMatchObject({ maxLength: 30, autoComplete: 'given-name', textContentType: 'givenName' });
  await typeName(tree, '  ' + 'Я'.repeat(40));
  await act(async () => nameInput(tree).props.onSubmitEditing()); // «Далі» на клавіатурі
  expect(title(tree)).toBe(t('pfGoalsTitle'));
  for (let i = 0; i < 3; i++) await tap(tree, t('obSkip')); // цілі, рівень, труднощі
  await tap(tree, t('obNext')); // план
  await tap(tree, t('obSkip')); // звідки
  await promise(tree);
  expect(onDone.mock.calls[0][0].name).toBe('Я'.repeat(30));
});

test('short variant from the flag: straight to goals, no commitment, flow sent on every event', async () => {
  flag.mockImplementation(async () => 'short');
  permissionStatus.mockImplementation(async () => 'granted'); // уже дозволено — кроку немає
  const { tree, onDone } = await render();
  await start(tree);
  expect(flag).toHaveBeenCalledWith('onboarding-flow', 'control', 1500);
  expect(title(tree)).toBe(t('pfGoalsTitle'));
  expect(header(tree).props.accessibilityLabel).toBe('Step 1 of 4. ' + t('pfGoalsTitle'));
  await tap(tree, t('goal_travel'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext')); // рівень за замовчуванням
  expect(title(tree)).toBe(t('obPlanTitle'));
  // без кроку «що заважає» — три головні можливості
  for (const k of ['boring', 'forget', 'time']) expect(has(tree, t('plan_' + k))).toBe(true);
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('pfHeardTitle'));
  // останній крок — «Готово», а не «Далі»
  await tap(tree, t('heard_friend'));
  await tap(tree, t('obFinish'));
  const res = onDone.mock.calls[0][0];
  expect(res).toEqual({
    profile: { goals: ['travel'], field: null, level: 5, since: TODAY },
    heardFrom: 'friend',
    scanned: false,
    flow: 'short',
  });
  expect(res).not.toHaveProperty('name');
  expect(res).not.toHaveProperty('wodEnabled');
  expect(events('onboarding_step').map((e) => [e.step, e.flow])).toEqual([
    ['welcome', 'short'],
    ['goals', 'short'],
    ['level', 'short'],
    ['plan', 'short'],
    ['heard', 'short'],
  ]);
  expect(events('onboarding_complete')[0]).toMatchObject({ flow: 'short', push: null });
  expect(flag).toHaveBeenCalledTimes(1);
});

test('the variant is asked once and “Start” waits for it', async () => {
  let resolve;
  flag.mockImplementation(() => new Promise((r) => (resolve = r)));
  const { tree } = await render();
  let started;
  await act(async () => {
    started = control(tree, t('obStart')).props.onPress();
  });
  expect(has(tree, t('obHookTitle'))).toBe(true); // ще чекаємо
  await act(async () => {
    resolve('short');
    await started;
  });
  expect(title(tree)).toBe(t('pfGoalsTitle'));
  expect(flag).toHaveBeenCalledTimes(1);
  // вітання пораховане рівно раз, уже з варіантом
  expect(events('onboarding_step').map((e) => [e.step, e.flow])).toEqual([
    ['welcome', 'short'],
    ['goals', 'short'],
  ]);
});

test('skipping every question changes nothing: no name, no profile, default plan lines', async () => {
  const { tree, onDone } = await render();
  await start(tree);
  await tap(tree, t('obSkip')); // імʼя
  // поставили «роботу» й передумали — «Пропустити» вертає як було, без кроку сфери
  await tap(tree, t('goal_work'));
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('pfLevelTitle'));
  await tap(tree, t('obSkip'));
  await tap(tree, t('struggle_boring'));
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('obPlanTitle')); // без імені
  expect(has(tree, 'General')).toBe(true);
  expect(has(tree, t('obPlanDaily'))).toBe(true); // одна тема — щодня
  for (const k of ['boring', 'forget', 'time']) expect(has(tree, t('plan_' + k))).toBe(true);
  await tap(tree, t('obNext'));
  // без профілю — загальний текст про сповіщення
  expect(has(tree, t('notifText'))).toBe(true);
  expect(has(tree, t('obPushPreviewTitle'))).toBe(true);
  requestPermission.mockImplementation(async () => false);
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext')); // після відмови — далі
  await tap(tree, t('obSkip')); // звідки
  expect(has(tree, 'I will learn English every day — one word at a time')).toBe(true);
  await promise(tree);
  expect(onDone.mock.calls[0][0]).toEqual({
    profile: null,
    heardFrom: null,
    name: '',
    struggles: [],
    wodEnabled: false,
    scanned: false,
    flow: 'control',
  });
  expect(events('onboarding_skip').map((e) => e.step)).toEqual(['name', 'goals', 'level', 'struggles', 'heard']);
  expect(events('onboarding_answer')[0]).toEqual({ step: 'name', value: 'skipped', flow: 'control' });
});

test('goals skipped but the level accepted: general words at that level', async () => {
  permissionStatus.mockImplementation(async () => 'granted');
  flag.mockImplementation(async () => 'short');
  const { tree, onDone } = await render();
  await start(tree);
  await tap(tree, t('obSkip'));
  await tap(tree, t('obNext')); // слайдер не чіпали — середина шкали
  await tap(tree, t('obNext'));
  await tap(tree, t('obSkip'));
  expect(onDone.mock.calls[0][0].profile).toEqual({ goals: ['self'], field: null, level: 5, since: TODAY });
});

test('Back works from every step, down to the welcome screen', async () => {
  const { tree } = await render();
  await start(tree);
  await typeName(tree, 'Ann');
  await tap(tree, t('obNext'));
  await tap(tree, t('goal_work'));
  await tap(tree, t('obNext'));
  await tap(tree, t('field_it'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obSkip'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obSkip'));
  expect(title(tree)).toBe(t('obCommitTitle'));
  // обіцянка → звідки → сповіщення → план → труднощі → рівень → сфера → цілі → імʼя → вітання
  for (const key of ['pfHeardTitle', 'obPushTitle', 'obPlanTitleName', 'obStrugglesTitle', 'pfLevelTitle', 'pfFieldTitle', 'pfGoalsTitle', 'obNameTitle']) {
    await tap(tree, t('pfBack'));
    expect(title(tree)).toBe(key === 'obPlanTitleName' ? 'Ann, here’s your plan' : t(key));
    // відповіді лишаються на місці
    if (key === 'pfFieldTitle') expect(control(tree, t('field_it')).props.accessibilityState).toEqual({ checked: true });
  }
  expect(nameInput(tree).props.value).toBe('Ann');
  await tap(tree, t('pfBack'));
  expect(has(tree, t('obHookTitle'))).toBe(true);
  expect(events('onboarding_back').map((e) => e.step)).toEqual([
    'commit',
    'heard',
    'push',
    'plan',
    'struggles',
    'level',
    'field',
    'goals',
    'name',
  ]);
});

describe('first scan (“Try it now”)', () => {
  const Scanner = () => <Text>camera</Text>;
  function scannerProps() {
    const calls = [];
    const renderScanner = jest.fn((p) => {
      calls.push(p);
      return <Scanner />;
    });
    return { renderScanner, last: () => calls.at(-1) };
  }
  async function toWow(tree) {
    await start(tree);
    await tap(tree, t('obSkip'));
    await tap(tree, t('goal_work'));
    await tap(tree, t('obNext'));
    await tap(tree, t('field_law'));
    await tap(tree, t('obNext'));
    await bump(tree, 3);
    await tap(tree, t('obNext'));
    await tap(tree, t('obSkip'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obWowTitle'));
  }

  test('opens the real scanner at the chosen level; a saved word is celebrated on the next step', async () => {
    const sc = scannerProps();
    const { tree, onDone } = await render({ canWow: true, renderScanner: sc.renderScanner });
    await toWow(tree);
    await tap(tree, t('obWowOpen'));
    expect(has(tree, 'camera')).toBe(true);
    expect(sc.last().level).toBe(8);
    await act(async () => sc.last().onSaved({ word: 'contract', translation: 'договір' }));
    expect(title(tree)).toBe(t('obPushTitle'));
    expect(has(tree, t('obWowDone'))).toBe(true);
    expect(has(tree, 'contract — договір')).toBe(true);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    // на наступному кроці вітання вже немає
    await tap(tree, t('obNext'));
    expect(has(tree, t('obWowDone'))).toBe(false);
    await tap(tree, t('obSkip'));
    await promise(tree);
    expect(onDone.mock.calls[0][0].scanned).toBe(true);
    expect(events('onboarding_complete')[0].scanned).toBe(true);
  });

  test('closing the scanner without a word just moves on', async () => {
    const sc = scannerProps();
    const { tree } = await render({ canWow: true, renderScanner: sc.renderScanner });
    await toWow(tree);
    await tap(tree, t('obWowOpen'));
    await act(async () => sc.last().onClose());
    expect(title(tree)).toBe(t('obPushTitle'));
    expect(has(tree, t('obWowDone'))).toBe(false);
    // назад — знову «Спробуй зараз»
    await tap(tree, t('pfBack'));
    expect(title(tree)).toBe(t('obWowTitle'));
  });

  test('“Later” skips it', async () => {
    const sc = scannerProps();
    const { tree } = await render({ canWow: true, renderScanner: sc.renderScanner });
    await toWow(tree);
    await tap(tree, t('obWowLater'));
    expect(title(tree)).toBe(t('obPushTitle'));
    expect(sc.renderScanner).not.toHaveBeenCalled();
    expect(events('onboarding_skip').at(-1)).toEqual({ step: 'wow', flow: 'control' });
  });

  test('no step when a scan is not possible (words already saved, no scan left)', async () => {
    const sc = scannerProps();
    const { tree } = await render({ canWow: false, renderScanner: sc.renderScanner });
    await start(tree);
    for (let i = 0; i < 4; i++) await tap(tree, t('obSkip'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushTitle'));
  });
});

describe('notifications', () => {
  test('denied: a follow-up with Settings, then on', async () => {
    requestPermission.mockImplementation(async () => false);
    const { tree, onDone } = await render();
    await start(tree);
    for (let i = 0; i < 4; i++) await tap(tree, t('obSkip'));
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushDeniedTitle'));
    expect(events('push_permission')).toEqual([{ granted: false, source: 'onboarding' }]);
    await tap(tree, t('openSettings'));
    expect(Linking.openSettings).toHaveBeenCalledTimes(1);
    // назад з цього екрана — до пояснення
    await tap(tree, t('pfBack'));
    expect(title(tree)).toBe(t('obPushTitle'));
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('pfHeardTitle'));
    await tap(tree, t('obSkip'));
    await promise(tree);
    expect(onDone.mock.calls[0][0].wodEnabled).toBe(false);
  });

  test('turned on in Settings while away: back in the app, the follow-up moves on by itself', async () => {
    const handlers = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((type, fn) => {
      handlers.push(fn);
      return { remove() {} };
    });
    requestPermission.mockImplementation(async () => false);
    const { tree, onDone } = await render();
    await start(tree);
    for (let i = 0; i < 4; i++) await tap(tree, t('obSkip'));
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushDeniedTitle'));
    permissionStatus.mockImplementation(async () => 'granted');
    await act(async () => {
      handlers.at(-1)('active');
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(title(tree)).toBe(t('pfHeardTitle'));
    await tap(tree, t('obSkip'));
    await promise(tree);
    expect(onDone.mock.calls[0][0].wodEnabled).toBe(true);
    spy.mockRestore();
  });

  test('already decided (granted or denied): no push step and no answer about it', async () => {
    for (const status of ['granted', 'denied', 'unavailable']) {
      permissionStatus.mockImplementation(async () => status);
      const { tree, onDone } = await render();
      await start(tree);
      for (let i = 0; i < 4; i++) await tap(tree, t('obSkip'));
      await tap(tree, t('obNext'));
      expect(title(tree)).toBe(t('pfHeardTitle'));
      await tap(tree, t('obSkip'));
      await promise(tree);
      expect(onDone.mock.calls[0][0]).not.toHaveProperty('wodEnabled');
    }
    expect(requestPermission).not.toHaveBeenCalled();
  });
});

describe('replay from Settings', () => {
  const profile = { goals: ['study'], field: 'it', level: 3, since: '2026-09-01' };

  test('shows the current answers, keeps an unchanged profile as is, and has no scan, push or promise', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const sc = jest.fn();
    const { tree, onDone } = await render({
      replay: true,
      profile,
      heardFrom: 'friend',
      name: 'Марко',
      struggles: ['boring'],
      canWow: true,
      renderScanner: sc,
    });
    // одразу імʼя, без вітання; назад з першого кроку нікуди
    expect(title(tree)).toBe(t('obNameTitle'));
    expect(nameInput(tree).props.value).toBe('Марко');
    expect(hasControl(tree, t('pfBack'))).toBe(false);
    await tap(tree, t('obNext'));
    expect(control(tree, t('goal_study')).props.accessibilityState).toEqual({ checked: true });
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('pfFieldTitleStudy'));
    expect(control(tree, t('field_it')).props.accessibilityState).toEqual({ checked: true });
    await tap(tree, t('obNext'));
    expect(slider(tree).props.accessibilityValue.now).toBe(3);
    await tap(tree, t('obNext'));
    expect(control(tree, t('struggle_boring')).props.accessibilityState).toEqual({ checked: true });
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe('Марко, here’s your plan');
    // навчання переважає (3 дні з 5): так і кажемо
    expect(has(tree, 'Academic')).toBe(true);
    expect(has(tree, '3 days of 5')).toBe(true);
    await tap(tree, t('obFinish'));
    const res = onDone.mock.calls[0][0];
    expect(res).toEqual({ profile, heardFrom: 'friend', name: 'Марко', struggles: ['boring'], scanned: false, flow: 'replay' });
    expect(res.profile).toBe(profile); // since не скинуто
    expect(sc).not.toHaveBeenCalled();
    // повтор — не воронка: подій онбордингу немає
    expect(track.mock.calls.filter(([e]) => e.startsWith('onboarding_'))).toEqual([]);
    expect(flag).not.toHaveBeenCalled();
  });

  test('a replay that changes the level gives a new profile from today; push only if never asked', async () => {
    const work = { goals: ['work'], field: 'law', level: 6, since: '2026-09-01' };
    const { tree, onDone } = await render({ replay: true, profile: work });
    await tap(tree, t('obSkip'));
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    await bump(tree, -2);
    await tap(tree, t('obNext'));
    await tap(tree, t('obSkip'));
    await tap(tree, t('obNext')); // план → сповіщення (про них ще не питали)
    expect(title(tree)).toBe(t('obPushTitle'));
    await tap(tree, t('obNext'));
    expect(events('push_permission')).toEqual([{ granted: true, source: 'replay' }]);
    expect(onDone.mock.calls[0][0]).toMatchObject({
      profile: { goals: ['work'], field: 'law', level: 4, since: TODAY },
      wodEnabled: true,
    });
  });
});
