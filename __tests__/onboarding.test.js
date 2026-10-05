// Онбординг 3.0 (onboarding.md §4–§13): три дії — «Ти» (мова, імʼя, цілі,
// сфера, рівень, що заважає, звідки, план зі словом на сьогодні) → «Як це
// працює» (серія, година сповіщень, віджети) → «Спробуй» (демо, згода на AI,
// справжній скан, свято, обіцянка). Короткий варіант — без імені й «що
// заважає». Повтор із Параметрів — без «звідки», обіцянки й скану.
// Чернетка живе 15 хвилин; перший запуск нічого не підставляє з налаштувань.
import { AccessibilityInfo, AppState, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import OnboardingScreen, {
  ACT,
  AUTO_MS,
  BUILD_MAX_MS,
  BUILD_MIN_MS,
  COMMIT_PAUSE_MS,
  actProgress,
  onboardingFlow,
  restoreDraft,
} from '../src/OnboardingScreen';
import { CELEBRATE_NEXT_MS } from '../src/Celebrate';
import { permissionStatus, requestPermission } from '../src/wordOfDay';
import { flag, track } from '../src/analytics';
import { DRAFT_TTL_MS, localDayKey } from '../src/storage';
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
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const t = makeT('en');
const TODAY = localDayKey();
const WORD = { date: TODAY, word: 'ledger', ipa: '/ˈledʒə/', translation: 'гросбух', topic: 'finance' };
const MUG = { id: 'w1', word: 'mug', translation: 'чашка', lang: 'en', photo: 'stickers/a.jpg' };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  requestPermission.mockImplementation(async () => true);
  permissionStatus.mockImplementation(async () => 'undetermined');
  flag.mockImplementation(async () => 'control');
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});

// Дерево розмонтовуємо й тоді, коли перевірка впала: Lingo й демо рухаються
// нескінченно, і jest інакше не завершився б.
const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  jest.useRealTimers();
});

async function render(props = {}) {
  const onDone = jest.fn();
  const onLanguages = jest.fn();
  const prepareWod = jest.fn(async () => WORD);
  let tree;
  await act(async () => {
    tree = create(
      <OnboardingScreen
        t={t}
        uiLang="en"
        onDone={onDone}
        targetLang="en"
        nativeLang="uk"
        phoneNative="uk"
        onLanguages={onLanguages}
        prepareWod={prepareWod}
        {...props}
      />
    );
  });
  await act(async () => {});
  mounted.push(tree);
  return { tree, onDone, onLanguages, prepareWod };
}

const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const has = (tree, s) => texts(tree).includes(s);
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function');
const hostId = (tree, id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
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
async function press(node) {
  await act(async () => {
    await node.props.onPress();
  });
}
const nextBtn = (tree, title = t('obNext')) =>
  tree.root.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const slider = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable' && n.props.testID !== 'showcase-days');
const header = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header')[0];
const title = (tree) => header(tree)?.props.children;
const nameInput = (tree) => tree.root.find((n) => typeof n.props.onChangeText === 'function' && n.props.maxLength === 30);
const ring = (tree) => tree.root.findAll((n) => n.props.testID === 'hold-to-commit' && n.props.onAccessibilityAction)[0];
const events = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

async function start(tree) {
  await tap(tree, t('obStart'));
}
async function pickLang(tree, code = 'en') {
  await press(byId(tree, 'lang-' + code).at(-1));
  await advance(AUTO_MS);
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
// «Складаємо твій план…» → план
async function built() {
  await advance(BUILD_MIN_MS + 10);
}
// Обіцянка дією VoiceOver (жест тримання — у holdToCommit.test.js); далі
// пауза «Домовились!» і фінал.
async function promise(tree) {
  await act(async () => ring(tree).props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
  await advance(COMMIT_PAUSE_MS + 10);
}
// Від вітання до плану з мінімумом відповідей (control)
async function toPlan(tree, { lang = 'en' } = {}) {
  await start(tree);
  await pickLang(tree, lang);
  await typeName(tree, 'Олена');
  await tap(tree, t('obNext'));
  await tap(tree, t('goal_travel'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext')); // рівень
  await tap(tree, t('struggle_time'));
  await tap(tree, t('obNext'));
  await tap(tree, 'TikTok');
  await advance(AUTO_MS);
}

// ─── 1. Порядок кроків ─────────────────────────────────────────────────────
describe('flow order', () => {
  test('control: welcome, language, the questions, heard, plan; then streak, push, widgets; then demo, celebration, promise', () => {
    expect(onboardingFlow({ goals: [] })).toEqual([
      'welcome',
      'lang',
      'name',
      'goals',
      'level',
      'struggles',
      'heard',
      'plan',
      'streak',
      'demo',
      'commit',
    ]);
    expect(onboardingFlow({ goals: ['work'], push: true, widgets: true, scanned: true })).toEqual([
      'welcome',
      'lang',
      'name',
      'goals',
      'field',
      'level',
      'struggles',
      'heard',
      'plan',
      'streak',
      'push',
      'widgets',
      'demo',
      'celebrate',
      'commit',
    ]);
    expect(onboardingFlow({ goals: ['travel'] })).not.toContain('field');
    expect(onboardingFlow({ goals: ['study'] })).toContain('field');
    // push — лише коли ще не питали; віджети — лише зі збіркою з віджетами
    expect(onboardingFlow({ push: false })).not.toContain('push');
    expect(onboardingFlow({ widgets: false })).not.toContain('widgets');
    // свято — лише після збереженого слова
    expect(onboardingFlow({ scanned: false })).not.toContain('celebrate');
  });

  test('short: no name and no struggles; the promise stays', () => {
    expect(onboardingFlow({ variant: 'short', goals: ['study'], push: true })).toEqual([
      'welcome',
      'lang',
      'goals',
      'field',
      'level',
      'heard',
      'plan',
      'streak',
      'push',
      'demo',
      'commit',
    ]);
  });

  test('replay: language only without words; no heard, no celebration, no promise; ends on the demo', () => {
    expect(onboardingFlow({ replay: true, goals: ['work'], push: true, widgets: true })).toEqual([
      'lang',
      'name',
      'goals',
      'field',
      'level',
      'struggles',
      'plan',
      'streak',
      'push',
      'widgets',
      'demo',
    ]);
    const withWords = onboardingFlow({ replay: true, hasWords: true, scanned: true });
    expect(withWords[0]).toBe('name');
    for (const k of ['lang', 'heard', 'commit', 'celebrate', 'welcome']) expect(withWords).not.toContain(k);
  });

  test('three acts: each segment fills with its own steps', () => {
    const f = onboardingFlow({ goals: [], push: true, widgets: true });
    expect(ACT.lang).toBe(0);
    expect(ACT.streak).toBe(1);
    expect(ACT.demo).toBe(2);
    expect(actProgress(f, 'lang')).toEqual([1 / 7, 0, 0]);
    expect(actProgress(f, 'plan')).toEqual([1, 0, 0]);
    expect(actProgress(f, 'streak')).toEqual([1, 1 / 3, 0]);
    expect(actProgress(f, 'pushDenied')).toEqual([1, 2 / 3, 0]);
    expect(actProgress(f, 'demo')).toEqual([1, 1, 1 / 2]);
    expect(actProgress(f, 'commit')).toEqual([1, 1, 1]);
  });
});

// ─── Повний шлях ───────────────────────────────────────────────────────────
test('the full path: language → name → work in finance → B2+ → struggles → heard → plan with today’s word → streak → push → demo → promise', async () => {
  const { tree, onDone, onLanguages, prepareWod } = await render({ widgets: false });
  // вітання: справжня іконка, Lingo й нові тексти; ні «Назад», ні смужки
  expect(has(tree, t('ob3HookTitle'))).toBe(true);
  expect(has(tree, t('ob3Hello'))).toBe(true);
  expect(hostId(tree, 'app-icon')).toHaveLength(1);
  expect(hasControl(tree, t('pfBack'))).toBe(false);
  expect(tree.root.findAll((n) => n.props.testID === 'onb-progress')).toHaveLength(0);
  await start(tree);

  // Мова — перший крок; нічого не обрано наперед; «Далі» немає — вибір веде далі сам
  expect(title(tree)).toBe(t('obLangTitle'));
  expect(header(tree).props.accessibilityLabel).toBe('Step 1 of 11. ' + t('obLangTitle'));
  expect(hostId(tree, 'onb-progress')).toHaveLength(1);
  expect(hostId(tree, 'onb-act-0')).toHaveLength(1);
  expect(nextBtn(tree)).toBeUndefined();
  expect(tree.root.findAll((n) => n.props.testID?.startsWith?.('lang-') && n.props.accessibilityState?.checked)).toHaveLength(0);
  await press(byId(tree, 'lang-en').at(-1));
  // мови йдуть в App одразу, ще до переходу
  expect(onLanguages).toHaveBeenCalledWith({ targetLang: 'en', nativeLang: 'uk' });
  expect(title(tree)).toBe(t('obLangTitle'));
  await advance(AUTO_MS);

  // Реакція Lingo на мову — над імʼям
  expect(title(tree)).toBe(t('obNameTitle'));
  expect(has(tree, 'English — great choice!')).toBe(true);
  expect(nextBtn(tree).props.disabled).toBe(true);
  await typeName(tree, '   Олена  ');
  await tap(tree, t('obNext'));
  expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');

  // Цілі — з імʼям і мовою в заголовку
  expect(title(tree)).toBe('Олена, why are you learning English?');
  await tap(tree, t('goal_work'));
  await tap(tree, t('obNext'));

  // Сфера: тап — галочка — і далі сам
  expect(title(tree)).toBe(t('pfFieldTitle'));
  expect(nextBtn(tree)).toBeUndefined();
  await tap(tree, t('field_finance'));
  await advance(AUTO_MS);

  // Рівень: мова — підписом над питанням
  expect(title(tree)).toBe(t('pfLevelTitle'));
  expect(has(tree, 'English')).toBe(true);
  await bump(tree, 3); // 5 → 8
  await tap(tree, t('obNext'));

  expect(title(tree)).toBe(t('obStrugglesTitle'));
  await tap(tree, t('struggle_time'));
  await tap(tree, t('struggle_forget'));
  await tap(tree, t('obNext'));

  // «Звідки» — один тап
  expect(title(tree)).toBe(t('pfHeardTitle'));
  await tap(tree, 'TikTok');
  await advance(AUTO_MS);

  // План: спершу «складаємо…» (справжній запит слова дня під профіль)…
  expect(has(tree, t('obBuildTitle'))).toBe(true);
  expect(prepareWod).toHaveBeenCalledWith({ goals: ['work'], field: 'finance', level: 8, since: TODAY });
  expect(has(tree, 'English · level B2+')).toBe(true);
  // …і план зі словом на сьогодні
  await built();
  expect(title(tree)).toBe('Олена, here’s your plan');
  expect(has(tree, 'ledger')).toBe(true);
  expect(has(tree, '/ˈledʒə/ · гросбух')).toBe(true);
  expect(has(tree, 'Your word for today · Finance')).toBe(true);
  expect(has(tree, t('plan_forget'))).toBe(true);
  await tap(tree, t('obNext'));

  // Дія 2: серія
  expect(title(tree)).toBe(t('obStreakTitle'));
  expect(actProgress(onboardingFlow({ goals: ['work'], push: true }), 'streak')[1]).toBe(1 / 2);
  await tap(tree, t('obNext'));

  // Сповіщення: година й прев’ю; єдина кнопка — «Далі»
  expect(title(tree)).toBe(t('obPushTitle'));
  expect(has(tree, 'Word of the day · Finance')).toBe(true);
  expect(texts(tree).some((s) => /allow/i.test(s))).toBe(false); // App Review 5.1.1(iv)
  await tap(tree, t('obNext'));
  expect(requestPermission).toHaveBeenCalledTimes(1);

  // Дія 3: демо (віджетів у цій збірці немає)
  expect(title(tree)).toBe(t('obDemoTitle'));
  expect(hostId(tree, 'scan-demo').length + byId(tree, 'scan-demo').length).toBeGreaterThan(0);
  await tap(tree, t('obNext')); // скану немає (canWow=false) — «Далі»

  expect(title(tree)).toBe(t('obCommitTitle'));
  expect(has(tree, 'I, Олена, will learn English every day — one word at a time')).toBe(true);
  expect(has(tree, t('obCommitGoal'))).toBe(true);
  expect(onDone).not.toHaveBeenCalled();
  await promise(tree);

  expect(onDone).toHaveBeenCalledTimes(1);
  expect(onDone).toHaveBeenCalledWith({
    profile: { goals: ['work'], field: 'finance', level: 8, since: TODAY },
    heardFrom: 'tiktok',
    name: 'Олена',
    struggles: ['forget', 'time'],
    wodEnabled: true,
    wodHour: 10,
    scanned: false,
    flow: 'control',
    targetLang: 'en',
    nativeLang: 'uk',
  });

  // Статистика v3: кожен крок, відповіді — коди, імені ніде немає
  expect(events('onboarding_step').map((e) => e.step)).toEqual([
    'welcome',
    'lang',
    'name',
    'goals',
    'field',
    'level',
    'struggles',
    'heard',
    'plan',
    'streak',
    'push',
    'demo',
    'commit',
  ]);
  expect(events('onboarding_step').every((e) => e.ver === 3 && e.flow === 'control')).toBe(true);
  expect(events('onboarding_answer')).toEqual([
    { step: 'lang', value: 'en', native: 'uk', flow: 'control', ver: 3 },
    { step: 'name', value: 'given', flow: 'control', ver: 3 },
    { step: 'goals', value: ['work'], flow: 'control', ver: 3 },
    { step: 'field', value: 'finance', flow: 'control', ver: 3 },
    { step: 'level', value: 8, flow: 'control', ver: 3 },
    { step: 'struggles', value: ['forget', 'time'], flow: 'control', ver: 3 },
    { step: 'heard', value: 'tiktok', flow: 'control', ver: 3 },
    { step: 'push_hour', value: 10, flow: 'control', ver: 3 },
  ]);
  expect(events('onb_streak_play')).toEqual([{ max: 0, touched: false, flow: 'control', ver: 3 }]);
  expect(events('onb_commit')).toEqual([{ mode: 'tap', releases: 0, flow: 'control', ver: 3 }]);
  expect(events('onboarding_complete')).toEqual([
    { flow: 'control', ver: 3, seconds: expect.any(Number), scanned: false, push: true, paywall: 'none' },
  ]);
  expect(JSON.stringify(track.mock.calls)).not.toMatch(/Олена/);
});

// ─── 2. Мова ───────────────────────────────────────────────────────────────
describe('which language you learn', () => {
  test('popular first, the translation language greyed out and not tappable, the rest alphabetical', async () => {
    const { tree } = await render();
    await start(tree);
    expect(has(tree, t('obLangPopular'))).toBe(true);
    expect(has(tree, t('obLangAll'))).toBe(true);
    // мова перекладу (українська) — вимкнена, з підписом
    const uk = tree.root.findAll((n) => n.props.testID === 'lang-uk' && n.props.accessibilityState)[0];
    expect(uk.props.accessibilityState).toEqual({ checked: false, disabled: true });
    expect(uk.props.onPress).toBeUndefined();
    expect(has(tree, t('obLangIsNative'))).toBe(true);
  });

  test('search ignores case and diacritics; nothing found says so and keeps the full list', async () => {
    const { tree } = await render();
    await start(tree);
    const input = () => tree.root.find((n) => n.props.testID === 'lang-search' && typeof n.props.onChangeText === 'function');
    await act(async () => input().props.onChangeText('espanol'));
    expect(byId(tree, 'lang-es').length).toBeGreaterThan(0);
    expect(byId(tree, 'lang-de')).toHaveLength(0);
    await act(async () => input().props.onChangeText('qqq'));
    expect(has(tree, t('obLangNone'))).toBe(true);
    expect(byId(tree, 'lang-de').length).toBeGreaterThan(0);
  });

  test('“Translate into” starts from the phone; changing it saves at once and frees the old one', async () => {
    const { tree, onLanguages } = await render({ phoneNative: 'uk' });
    await start(tree);
    expect(has(tree, t('obNativeLabel'))).toBe(true);
    expect(has(tree, 'Українська')).toBe(true);
    await press(byId(tree, 'native-card')[0]);
    // аркуш: мова телефона з підписом «з телефона»
    expect(has(tree, t('obNativeTitle'))).toBe(true);
    expect(has(tree, t('obNativePhone'))).toBe(true);
    const plRows = byId(tree, 'lang-pl');
    await press(plRows.at(-1));
    expect(onLanguages).toHaveBeenLastCalledWith({ targetLang: undefined, nativeLang: 'pl' });
    expect(events('onboarding_answer')).toContainEqual({ step: 'native_change', value: 'pl', flow: 'control', ver: 3 });
    // українська тепер вибирається; польська — ні
    const uk = tree.root.findAll((n) => n.props.testID === 'lang-uk' && n.props.accessibilityState)[0];
    expect(uk.props.accessibilityState.disabled).toBe(false);
    await pickLang(tree, 'uk');
    expect(onLanguages).toHaveBeenLastCalledWith({ targetLang: 'uk', nativeLang: 'pl' });
  });

  test('VoiceOver: no automatic step, a “Next” button instead', async () => {
    AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(true));
    const { tree, onLanguages } = await render();
    await start(tree);
    expect(nextBtn(tree).props.disabled).toBe(true);
    await press(byId(tree, 'lang-de').at(-1));
    expect(onLanguages).toHaveBeenCalledWith({ targetLang: 'de', nativeLang: 'uk' });
    await advance(AUTO_MS * 3);
    expect(title(tree)).toBe(t('obLangTitle'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obNameTitle'));
  });

  test('coming back to it, the choice is ticked and “Next” is there', async () => {
    const { tree } = await render();
    await start(tree);
    await pickLang(tree, 'de');
    await tap(tree, t('pfBack'));
    expect(title(tree)).toBe(t('obLangTitle'));
    const de = tree.root.findAll((n) => n.props.testID === 'lang-de' && n.props.accessibilityState)[0];
    expect(de.props.accessibilityState.checked).toBe(true);
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obNameTitle'));
  });
});

// ─── 3. Реакція Lingo ──────────────────────────────────────────────────────
test('short variant: Lingo cheers on the goals step, which names the language', async () => {
  flag.mockImplementation(async () => 'short');
  const { tree } = await render();
  await start(tree);
  await pickLang(tree, 'es');
  expect(title(tree)).toBe('Why are you learning Spanish?');
  expect(has(tree, 'Spanish — great choice!')).toBe(true);
  expect(events('onboarding_step').every((e) => e.flow === 'short')).toBe(true);
});

// ─── 4. Пропустити й назад ─────────────────────────────────────────────────
test('skipping every question changes nothing: no name, no profile; Back walks back to the language', async () => {
  const { tree, onDone, prepareWod } = await render();
  await start(tree);
  await pickLang(tree);
  for (const step of ['obNameTitle', 'goals', 'pfLevelTitle', 'obStrugglesTitle', 'pfHeardTitle']) {
    void step;
    await tap(tree, t('obSkip'));
  }
  expect(has(tree, t('obBuildTitle'))).toBe(true);
  expect(prepareWod).toHaveBeenCalledWith(null);
  await built();
  // назад: план → звідки → що заважає → рівень → цілі → імʼя → мова
  for (const k of ['pfHeardTitle', 'obStrugglesTitle', 'pfLevelTitle', 'pfGoalsTitleLang', 'obNameTitle', 'obLangTitle']) {
    await tap(tree, t('pfBack'));
    expect(title(tree)).toBe(k === 'pfGoalsTitleLang' ? t(k, { lang: 'English' }) : t(k));
  }
  expect(onDone).not.toHaveBeenCalled();
});

// ─── 5. План ───────────────────────────────────────────────────────────────
describe('the plan', () => {
  test('“putting it together” lasts at least 1.2 s even when the word is instant', async () => {
    const { tree } = await render();
    await toPlan(tree);
    expect(has(tree, t('obBuildTitle'))).toBe(true);
    await advance(BUILD_MIN_MS - 100);
    expect(has(tree, t('obBuildTitle'))).toBe(true);
    await advance(200);
    expect(has(tree, t('obBuildTitle'))).toBe(false);
    expect(hostId(tree, 'plan-today')).toHaveLength(1);
  });

  test('“topics” row: the chosen topics, without “general”', async () => {
    const { tree } = await render();
    await toPlan(tree);
    expect(has(tree, t('obBuildTopics', { topics: t('topic_travel').toLocaleLowerCase('en') }))).toBe(true);
    expect(texts(tree).some((x) => x.includes(t('topic_general').toLocaleLowerCase('en')))).toBe(false);
  });

  test('a word that does not come within 2.5 s: the plan without the card', async () => {
    const { tree } = await render({ prepareWod: jest.fn(() => new Promise(() => {})) });
    await toPlan(tree);
    await advance(BUILD_MAX_MS - 100);
    expect(has(tree, t('obBuildTitle'))).toBe(true);
    await advance(200);
    await advance(10);
    expect(has(tree, t('obBuildTitle'))).toBe(false);
    expect(hostId(tree, 'plan-today')).toHaveLength(0);
    expect(has(tree, 'Олена, here’s your plan')).toBe(true);
  });

  test('no word (offline): the plan without the card', async () => {
    const { tree } = await render({ prepareWod: jest.fn(async () => null) });
    await toPlan(tree);
    await built();
    expect(hostId(tree, 'plan-today')).toHaveLength(0);
  });

  test('replay: no “putting it together”, the cached word straight away', async () => {
    const prepareWod = jest.fn();
    const { tree } = await render({
      replay: true,
      hasWords: true,
      todayWord: WORD,
      prepareWod,
      profile: { goals: ['travel'], field: null, level: 5, since: '2026-01-01' },
      name: 'Олена',
    });
    // імʼя → цілі → рівень → що заважає → план
    for (let i = 0; i < 4; i++) await tap(tree, t('obNext'));
    expect(title(tree)).toBe('Олена, here’s your plan');
    expect(has(tree, 'ledger')).toBe(true);
    expect(prepareWod).not.toHaveBeenCalled();
  });
});

// ─── 6. Серія ──────────────────────────────────────────────────────────────
describe('the streak showcase', () => {
  async function toStreak(tree) {
    await toPlan(tree);
    await built();
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obStreakTitle'));
  }
  const line = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'showcase-line').props.children;
  const day = (tree, d) => byId(tree, 'showcase-day-' + d).at(-1);

  test('an ember at first; day 3 is a habit, day 7 lights up with one Success; “Next” is always there', async () => {
    const { tree } = await render();
    await toStreak(tree);
    expect(line(tree)).toBe(t('streakEmber'));
    expect(nextBtn(tree).props.disabled).toBeFalsy();
    await press(day(tree, 3));
    expect(line(tree)).toBe(t('streakHabit', { n: 3 }));
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light'); // нова стадія вогника
    await press(day(tree, 7));
    expect(line(tree)).toBe(t('streakWeek'));
    await press(day(tree, 1));
    await press(day(tree, 7));
    expect(Haptics.notificationAsync.mock.calls.filter(([x]) => x === 'success')).toHaveLength(1);
    // VoiceOver: ряд днів — adjustable
    const row = tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'showcase-days');
    expect(row.props.accessibilityRole).toBe('adjustable');
    await act(async () => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    expect(line(tree)).toBe(t('streakHabit', { n: 6 }));
    await tap(tree, t('obNext'));
    expect(events('onb_streak_play')).toEqual([{ max: 7, touched: true, flow: 'control', ver: 3 }]);
  });

  test('1.5 s idle on an ember: the hint appears', async () => {
    const { tree } = await render();
    await toStreak(tree);
    const hint = () => tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === t('obStreakHint')).at(-1);
    expect(hint().props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 0 })]));
    await advance(1600);
    expect(hint().props.style).toEqual(expect.arrayContaining([expect.objectContaining({ opacity: 1 })]));
  });
});

// ─── 7. Сповіщення ─────────────────────────────────────────────────────────
describe('notifications', () => {
  async function toPush(tree) {
    await toPlan(tree);
    await built();
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushTitle'));
  }

  test('10:00 by default; 19:00 picked is kept even after a “no”', async () => {
    requestPermission.mockImplementation(async () => false);
    const { tree, onDone } = await render();
    await toPush(tree);
    expect(byId(tree, 'push-hour-10').at(-1).props.accessibilityState).toEqual({ checked: true });
    await press(byId(tree, 'push-hour-19').at(-1));
    expect(byId(tree, 'push-hour-19').at(-1).props.accessibilityState).toEqual({ checked: true });
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushDeniedTitle'));
    expect(control(tree, t('openSettings'))).toBeTruthy();
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext')); // демо
    await promise(tree);
    expect(onDone.mock.calls[0][0]).toMatchObject({ wodEnabled: false, wodHour: 19 });
    expect(events('onboarding_answer')).toContainEqual({ step: 'push_hour', value: 19, flow: 'control', ver: 3 });
  });

  test('turned on in Settings while away: back in the app, the follow-up moves on by itself', async () => {
    requestPermission.mockImplementation(async () => false);
    const listeners = [];
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_, fn) => {
      listeners.push(fn);
      return { remove() {} };
    });
    const { tree } = await render();
    await toPush(tree);
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushDeniedTitle'));
    permissionStatus.mockImplementation(async () => 'granted');
    await act(async () => listeners.forEach((fn) => fn('active')));
    await act(async () => {});
    expect(title(tree)).toBe(t('obDemoTitle'));
    spy.mockRestore();
  });

  test('already decided: no push step and no hour in the result', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree, onDone } = await render();
    await toPlan(tree);
    await built();
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    await tap(tree, t('obNext'));
    await promise(tree);
    expect(onDone.mock.calls[0][0].wodHour).toBeUndefined();
    expect(onDone.mock.calls[0][0].wodEnabled).toBeUndefined();
  });

  test('the dev “as new” run shows the push step even when iOS has decided, and the widgets step without widgets', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree } = await render({ dev: { forcePush: true, forceWidgets: true } });
    await toPlan(tree);
    await built();
    await tap(tree, t('obNext'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushTitle'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('onbWidgetTitle'));
  });
});

// ─── Віджети ───────────────────────────────────────────────────────────────
test('widgets step: the live preview with today’s word and the demo pair, “show me again” replays the how-to', async () => {
  permissionStatus.mockImplementation(async () => 'granted');
  const { tree } = await render({ widgets: true });
  await toPlan(tree);
  await built();
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('onbWidgetTitle'));
  const preview = tree.root.findAll((n) => n.props.testID === undefined && n.props.sample && n.props.streakN !== undefined)[0];
  expect(preview.props).toMatchObject({ wod: WORD, streakN: 1, sample: { word: 'mug', translation: 'чашка', lang: 'en' } });
  expect(has(tree, t('onbWidgetTry'))).toBe(true);
  await tap(tree, t('onbWidgetAgain'));
  await act(async () => preview.props.onReveal());
  await tap(tree, t('obNext'));
  expect(title(tree)).toBe(t('obDemoTitle'));
  expect(events('onb_widget_step').map((e) => e.action)).toEqual(['howto', 'preview_reveal', 'next']);
});

// ─── 8–9. Демо й перший скан ───────────────────────────────────────────────
describe('demo and the first scan', () => {
  let scanner;
  const renderScanner = jest.fn((p) => {
    scanner = p;
    return <Text>camera</Text>;
  });
  beforeEach(() => {
    scanner = null;
    permissionStatus.mockImplementation(async () => 'granted');
  });
  async function toDemo(props) {
    const r = await render({ canWow: true, renderScanner, ...props });
    await toPlan(r.tree);
    await built();
    await tap(r.tree, t('obNext'));
    await tap(r.tree, t('obNext'));
    expect(title(r.tree)).toBe(t('obDemoTitle'));
    return r;
  }
  const consent = (tree) => tree.root.findAll((n) => n.props.onAllow && n.props.visible !== undefined)[0];

  test('“Try it” without consent opens the AI consent over the demo; “Not now” stays', async () => {
    const onAiConsent = jest.fn();
    const { tree } = await toDemo({ aiConsent: false, onAiConsent });
    expect(consent(tree).props.visible).toBe(false);
    await tap(tree, t('obDemoTry'));
    expect(consent(tree).props.visible).toBe(true);
    await act(async () => consent(tree).props.onClose());
    expect(consent(tree).props.visible).toBe(false);
    expect(title(tree)).toBe(t('obDemoTitle'));
    expect(renderScanner).not.toHaveBeenCalled();
    expect(events('onb_demo').map((e) => e.action)).toEqual(['view', 'try', 'consent_later']);
    // «Дозволити» → згода й справжній сканер
    await tap(tree, t('obDemoTry'));
    await act(async () => consent(tree).props.onAllow());
    expect(onAiConsent).toHaveBeenCalledTimes(1);
    expect(has(tree, 'camera')).toBe(true);
  });

  test('saved → the celebration with that word, “Next” after 0.9 s, no Back; then the promise with day one lit', async () => {
    const { tree, onDone } = await toDemo({ aiConsent: true });
    await tap(tree, t('obDemoTry'));
    expect(scanner.level).toBe(5);
    await act(async () => scanner.onSaved(MUG));
    expect(hostId(tree, 'celebrate')).toHaveLength(1);
    expect(texts(tree)).toEqual(expect.arrayContaining([t('obCelebrateTitle'), t('obCelebrateStreak'), 'mug', 'чашка']));
    expect(hasControl(tree, t('pfBack'))).toBe(false);
    const btn = () => nextBtn(tree);
    expect(
      tree.root.findAll((n) => typeof n.type === 'string' && n.props.pointerEvents === 'none' && n.findAll((c) => c.props.title === t('obNext')).length)
    ).toHaveLength(1);
    await advance(CELEBRATE_NEXT_MS + 10);
    expect(btn()).toBeTruthy();
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obCommitTitle'));
    expect(hostId(tree, 'goal-lit')).toHaveLength(1);
    await promise(tree);
    expect(onDone.mock.calls[0][0]).toMatchObject({ scanned: true, firstWord: MUG });
    expect(events('onb_scan')).toEqual([{ result: 'saved', flow: 'control', ver: 3 }]);
    // Success тут не наш: «Зберегти» вже дав його в сканері; обіцянка — свій
    expect(Haptics.notificationAsync.mock.calls.filter(([x]) => x === 'success')).toHaveLength(1);
  });

  test('closed → back on the demo with “Try it”', async () => {
    const { tree } = await toDemo({ aiConsent: true });
    await tap(tree, t('obDemoTry'));
    await act(async () => scanner.onExit('closed'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    expect(hasControl(tree, t('obDemoTry'))).toBe(true);
  });

  test('camera denied → straight to the promise', async () => {
    const { tree } = await toDemo({ aiConsent: true });
    await tap(tree, t('obDemoTry'));
    await act(async () => scanner.onExit('camera_denied'));
    expect(title(tree)).toBe(t('obCommitTitle'));
    expect(hostId(tree, 'goal-lit')).toHaveLength(0);
  });

  test('limit → the demo without “Try it”, saying why, and “Next”', async () => {
    const { tree } = await toDemo({ aiConsent: true });
    await tap(tree, t('obDemoTry'));
    await act(async () => scanner.onExit('limit'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    expect(hasControl(tree, t('obDemoTry'))).toBe(false);
    expect(has(tree, t('obDemoUsed'))).toBe(true);
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obCommitTitle'));
  });

  test('“Later” goes to the promise', async () => {
    const { tree } = await toDemo({ aiConsent: true });
    await tap(tree, t('obWowLater'));
    expect(title(tree)).toBe(t('obCommitTitle'));
    expect(events('onboarding_skip')).toContainEqual({ step: 'demo', flow: 'control', ver: 3 });
  });

  test('the free scan already used on this iPhone: the reason and “Next”', async () => {
    const { tree } = await toDemo({ canWow: false, scanUsed: true });
    expect(hasControl(tree, t('obDemoTry'))).toBe(false);
    expect(has(tree, t('obDemoUsed'))).toBe(true);
  });

  // Повтор без слів відкривається на мові, яка вже обрана: без «Далі» це був
  // глухий кут (ні «Пропустити», ні «Назад», ні хрестика)
  test('replay without words: the language is already ticked, so “Next” is there at once', async () => {
    const { tree, onLanguages } = await render({ replay: true, hasWords: false, targetLang: 'en' });
    expect(title(tree)).toBe(t('obLangTitle'));
    expect(byId(tree, 'lang-en').at(-1).props.accessibilityState).toMatchObject({ checked: true });
    expect(nextBtn(tree)).toBeDefined();
    expect(nextBtn(tree).props.disabled).toBe(false);
    await press(nextBtn(tree));
    expect(title(tree)).toBe(t('obNameTitle'));
    expect(onLanguages).not.toHaveBeenCalled();
  });

  test('replay: the demo ends it with “Done”', async () => {
    const { tree, onDone } = await render({ replay: true, hasWords: true, todayWord: WORD });
    // імʼя → цілі → рівень → що заважає → план → серія → демо
    for (let i = 0; i < 6; i++) await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    expect(hasControl(tree, t('obDemoTry'))).toBe(false);
    await tap(tree, t('obFinish'));
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(onDone.mock.calls[0][0].flow).toBe('replay');
    expect(track).not.toHaveBeenCalledWith('onboarding_complete', expect.anything());
  });
});

// ─── 10. Чернетка ──────────────────────────────────────────────────────────
describe('draft v3', () => {
  const now = Date.now();
  const DRAFT = {
    v: 3,
    at: now - 60 * 1000,
    phase: 'goals',
    variant: 'control',
    target: 'de',
    native: 'uk',
    name: 'Олена',
    goals: ['travel'],
    level: 4,
  };

  test('saved on every step with the languages and the hour', async () => {
    const onDraft = jest.fn();
    const { tree } = await render({ onDraft });
    await start(tree);
    await pickLang(tree, 'de');
    expect(onDraft).toHaveBeenLastCalledWith(expect.objectContaining({ phase: 'name', target: 'de', native: 'uk', hour: 10 }));
  });

  test('within 15 minutes the same step with the same answers; the language stays picked', async () => {
    const { tree } = await render({ draft: DRAFT });
    expect(title(tree)).toBe('Олена, why are you learning German?');
    expect(control(tree, t('goal_travel')).props.accessibilityState).toEqual({ checked: true });
  });

  test('older than 15 minutes, another format or broken: the welcome screen with empty answers', async () => {
    expect(DRAFT_TTL_MS).toBe(15 * 60 * 1000);
    expect(restoreDraft({ ...DRAFT, at: now - DRAFT_TTL_MS - 1000 }, now)).toBeNull();
    expect(restoreDraft({ ...DRAFT, v: 2 }, now)).toBeNull();
    expect(restoreDraft({ ...DRAFT, v: undefined }, now)).toBeNull();
    expect(restoreDraft({ ...DRAFT, phase: 'wow' }, now)).toBeNull();
    expect(restoreDraft(null, now)).toBeNull();
    const { tree } = await render({ draft: { ...DRAFT, at: now - 16 * 60 * 1000 } });
    expect(has(tree, t('ob3HookTitle'))).toBe(true);
    await start(tree);
    expect(tree.root.findAll((n) => n.props.testID?.startsWith?.('lang-') && n.props.accessibilityState?.checked)).toHaveLength(0);
  });

  test('the celebration is restored as the promise (the sticker is gone from memory)', () => {
    expect(restoreDraft({ ...DRAFT, phase: 'celebrate', scanned: true }, now)).toMatchObject({ phase: 'commit', scanned: true });
  });

  // Застосунок вбили вже після кроку сповіщень: обрана година й «так» не
  // губляться — інакше сповіщення прийшли б о 10:00, а не о 19:00
  test('restored after the push step: the chosen hour still reaches onDone', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree, onDone } = await render({ draft: { ...DRAFT, phase: 'demo', push: true, hour: 19 } });
    expect(title(tree)).toBe(t('obDemoTitle'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obCommitTitle'));
    await promise(tree);
    expect(onDone.mock.calls[0][0]).toMatchObject({ wodEnabled: true, wodHour: 19 });
  });

  // Слово першого скану вже в словнику, хоч наліпки й немає в памʼяті:
  // перша крапка цілі світиться, і статистика каже «сканував»
  test('restored after a saved scan: the first goal dot is lit and the result says scanned', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree, onDone } = await render({ draft: { ...DRAFT, phase: 'celebrate', push: false, hour: 10, scanned: true } });
    expect(title(tree)).toBe(t('obCommitTitle'));
    expect(hostId(tree, 'goal-lit')).toHaveLength(1);
    await promise(tree);
    expect(onDone.mock.calls[0][0]).toMatchObject({ scanned: true, wodEnabled: false, wodHour: 10 });
    expect(events('onboarding_complete')[0]).toMatchObject({ scanned: true });
  });

  test('a replay neither reads nor writes a draft', async () => {
    const onDraft = jest.fn();
    const { tree } = await render({ replay: true, hasWords: true, draft: DRAFT, onDraft });
    expect(title(tree)).toBe(t('obNameTitle'));
    await tap(tree, t('obSkip'));
    expect(onDraft).not.toHaveBeenCalled();
  });
});

// ─── 11. Перший запуск не підставляє збереженого ───────────────────────────
test('a first run ignores the profile and name left in settings by an earlier run', async () => {
  const { tree, onDone } = await render({
    name: 'Стара',
    profile: { goals: ['work'], field: 'it', level: 9, since: '2026-01-01' },
    heardFrom: 'youtube',
    struggles: ['time'],
  });
  await start(tree);
  await pickLang(tree);
  expect(nameInput(tree).props.value).toBe('');
  await tap(tree, t('obSkip'));
  expect(control(tree, t('goal_work')).props.accessibilityState).toEqual({ checked: false });
  await tap(tree, t('obSkip'));
  await tap(tree, t('obSkip'));
  await tap(tree, t('obSkip'));
  expect(control(tree, 'YouTube').props.accessibilityState).toEqual({ checked: false });
  await tap(tree, t('obSkip'));
  await built();
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext'));
  await tap(tree, t('obNext')); // push
  await tap(tree, t('obNext')); // demo
  await promise(tree);
  expect(onDone.mock.calls[0][0]).toMatchObject({ profile: null, heardFrom: null, name: '', struggles: [] });
});
