// Полірування онбордингу (аудит 8.10.2026): замок кроку проти подвійного
// дотику, VoiceOver на «складаємо план» і «Домовились», «Назад на демо» без
// повторних дотиків, стани натиску, підказка кільця в режимі дотику, пейвол
// без стрибка й без перестрибнутого екрана.
import React from 'react';
import { AccessibilityInfo, Animated, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import OnboardingScreen, { AUTO_MS, BUILD_MIN_MS } from '../src/OnboardingScreen';
import OnboardingPaywall from '../src/OnboardingPaywall';
import HoldToCommit, { HOLD_MS, NUDGE_MS } from '../src/HoldToCommit';
import { HourChips, PlanBuilding } from '../src/OnboardingParts';
import { GoalOptions, LOCK_MS, NameField, SkipButton, StepFrame } from '../src/ProfileSteps';
import ScanDemo, { BeatCaption } from '../src/ScanDemo';
import { DUR, EASE, SPRING } from '../src/motion';
import { GradBtn, Press } from '../src/ui';
import { SIMULATED_PLANS } from '../src/subscription';
import { permissionStatus, requestPermission } from '../src/wordOfDay';
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
const NOW = Date.now();
const WORD = { date: '2026-10-08', word: 'ledger', ipa: '/ˈledʒə/', translation: 'гросбух', topic: 'finance' };
// чернетка на «слові дня»: до сповіщень, плану й демо — два кроки поспіль «Далі»
const DRAFT = { v: 3, ver: 5, at: NOW - 60 * 1000, phase: 'wod', variant: 'control', target: 'de', native: 'uk', name: 'Олена', goals: ['travel'], level: 4 };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  requestPermission.mockImplementation(async () => true);
  permissionStatus.mockImplementation(async () => 'undetermined');
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  jest.useRealTimers();
});

async function mount(el, opts) {
  let tree;
  await act(async () => {
    tree = create(el, opts);
  });
  await act(async () => {});
  mounted.push(tree);
  return tree;
}
async function render(props = {}, opts) {
  const onDone = jest.fn();
  const tree = await mount(
    <OnboardingScreen
      t={t}
      uiLang="en"
      onDone={onDone}
      targetLang="en"
      nativeLang="uk"
      phoneNative="uk"
      onLanguages={() => {}}
      prepareWod={async () => WORD}
      {...props}
    />,
    opts
  );
  return { tree, onDone };
}

const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const hostId = (tree, id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const has = (tree, s) => texts(tree).includes(s);
const title = (tree) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header')[0]?.props.children;
function control(tree, text) {
  const hit = tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === text || n.props.title === text || n.findAll((c) => c.props.children === text).length)
  );
  if (!hit.length) throw new Error('no control: ' + text);
  return hit.at(-1);
}
async function tap(tree, text) {
  await act(async () => {
    await control(tree, text).props.onPress();
  });
}
const flat = (n) => StyleSheet.flatten(n.props.style) || {};
// Animated(View): тут у style лежать самі Animated.Value (на нативному View — вже числа)
const animatedViews = (root) => root.findAll((n) => typeof n.type !== 'string' && n.type?.displayName === 'Animated(View)');
const valueOf = (v) => (v && typeof v.__getValue === 'function' ? v.__getValue() : v);

// ─── Замок кроку ───────────────────────────────────────────────────────────
describe('step lock: a second tap never lands on the next step’s live button', () => {
  const onNext = jest.fn();
  const frame = (over = {}) => (
    <StepFrame
      stepKey="a"
      progress={{ step: 1, total: 3 }}
      onBack={() => {}}
      right={<SkipButton onPress={() => {}} t={t} />}
      title="Title"
      footer={<GradBtn title="Next" onPress={onNext} />}
      t={t}
      {...over}
    >
      <Text>body</Text>
    </StepFrame>
  );
  const shields = (tree) => ['step-lock-bar', 'step-lock-footer', 'step-lock-all'].filter((id) => hostId(tree, id).length);

  test('the first frame is not locked; a new step puts a shield over the bar and the footer for LOCK_MS', async () => {
    expect(LOCK_MS).toBe(DUR.panel + 30);
    const tree = await mount(frame());
    expect(shields(tree)).toEqual([]);
    await act(async () => tree.update(frame({ stepKey: 'b' })));
    expect(shields(tree)).toEqual(['step-lock-bar', 'step-lock-footer']);
    await advance(LOCK_MS - 1);
    expect(shields(tree)).toEqual(['step-lock-bar', 'step-lock-footer']);
    await advance(1);
    expect(shields(tree)).toEqual([]);
  });

  test('the shield is a real view over the footer (catches touches), the last child, not a pointerEvents prop', async () => {
    const tree = await mount(frame());
    await act(async () => tree.update(frame({ stepKey: 'b' })));
    const shield = hostId(tree, 'step-lock-footer')[0];
    expect(shield.props.pointerEvents).toBeUndefined();
    expect(flat(shield)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
    // футер — найглибший вузол, що містить і щит, і «Далі»; щит — його останній child
    const footer = tree.root.findAll(
      (n) => typeof n.type === 'string' && n.findAll((c) => c === shield).length && n.findAll((c) => c.props.title === 'Next').length
    ).at(-1);
    expect(footer.children.at(-1).findAll((c) => c === shield)).toHaveLength(1);
    expect(footer.children.at(-1)).not.toBe(footer.children[0]);
    // і ніщо не позначене pointerEvents="none" замість щита
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.pointerEvents === 'none' && n.findAll((c) => c.props.title === 'Next').length)).toHaveLength(0);
  });

  test('step after step: the timer restarts, the lock ends LOCK_MS after the last change', async () => {
    const tree = await mount(frame());
    await act(async () => tree.update(frame({ stepKey: 'b' })));
    await advance(LOCK_MS - 50);
    await act(async () => tree.update(frame({ stepKey: 'c' })));
    await advance(LOCK_MS - 1);
    expect(shields(tree)).toHaveLength(2);
    await advance(1);
    expect(shields(tree)).toEqual([]);
  });

  test('a rerender within the same step does not lock', async () => {
    const tree = await mount(frame());
    await act(async () => tree.update(frame({ title: 'Other title' })));
    expect(shields(tree)).toEqual([]);
  });

  test('lockMount (the frame appears where “Start” or the camera X was just pressed): one shield over everything, only for the first step', async () => {
    const tree = await mount(frame({ lockMount: true }));
    expect(shields(tree)).toEqual(['step-lock-all']);
    await advance(LOCK_MS);
    expect(shields(tree)).toEqual([]);
    await act(async () => tree.update(frame({ stepKey: 'b', lockMount: true })));
    expect(shields(tree)).toEqual(['step-lock-bar', 'step-lock-footer']);
  });

  test('direction “fade”: no shift at all, only the fade', async () => {
    const tree = await mount(frame({ direction: 'fade' }));
    const fade = tree.root.findAll((n) => n.props.dx !== undefined && n.props.dy !== undefined)[0];
    expect(fade.props).toMatchObject({ dx: 0, dy: 0 });
    await act(async () => tree.update(frame({ direction: 'forward' })));
    const fwd = tree.root.findAll((n) => n.props.dx !== undefined && n.props.dy !== undefined)[0];
    expect(fwd.props.dx).not.toBe(0);
  });
});

describe('step lock in the onboarding flow', () => {
  test('“Next” on word of the day: the push step is on screen with its footer under a shield, then the shield goes', async () => {
    const { tree } = await render({ draft: DRAFT });
    expect(title(tree)).toBe(t('obWodTitle'));
    // чернетка відкрилась без замка: перший кадр не мертвий
    expect(hostId(tree, 'step-lock-footer')).toHaveLength(0);
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obPushTitle'));
    expect(hostId(tree, 'step-lock-footer')).toHaveLength(1);
    expect(hostId(tree, 'step-lock-bar')).toHaveLength(1);
    expect(requestPermission).not.toHaveBeenCalled();
    await advance(LOCK_MS);
    expect(hostId(tree, 'step-lock-footer')).toHaveLength(0);
    // після появи кнопка працює: системний запит — лише тепер
    await tap(tree, t('obNext'));
    expect(requestPermission).toHaveBeenCalledTimes(1);
  });

  test('“Start” on the welcome screen: the language list is covered for the first moments', async () => {
    const { tree } = await render();
    await tap(tree, t('obStart'));
    expect(title(tree)).toBe(t('obLangTitle'));
    expect(hostId(tree, 'step-lock-all')).toHaveLength(1);
    await advance(LOCK_MS);
    expect(hostId(tree, 'step-lock-all')).toHaveLength(0);
  });

  test('autoNext still works through the lock: a language picked, then the name step after AUTO_MS', async () => {
    const { tree } = await render();
    await tap(tree, t('obStart'));
    await advance(LOCK_MS);
    await act(async () => tree.root.findAll((n) => n.props.testID === 'lang-de' && typeof n.props.onPress === 'function').at(-1).props.onPress());
    await advance(AUTO_MS);
    expect(title(tree)).toBe(t('obNameTitle'));
  });
});

describe('paywall: “Next” cannot skip the reminder screen', () => {
  const handlers = () => ({ onClose: jest.fn(), onStep: jest.fn(), onPurchase: jest.fn(async () => ({ ok: true })), onRestore: jest.fn(async () => ({})), onOpen: jest.fn() });

  test('the footer is shielded for LOCK_MS after a screen change and the page fades in as a whole', async () => {
    const h = handlers();
    const tree = await mount(<OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} {...h} />);
    expect(hostId(tree, 'opw-lock')).toHaveLength(0);
    // уся поверхня зʼявляється прозорістю
    const enter = hostId(tree, 'opw-enter')[0];
    expect(flat(enter).flex).toBe(1);
    await tap(tree, t('obNext'));
    expect(h.onStep).toHaveBeenLastCalledWith(1, 'reminder');
    expect(hostId(tree, 'opw-lock')).toHaveLength(1);
    const shield = hostId(tree, 'opw-lock')[0];
    expect(shield.props.pointerEvents).toBeUndefined();
    const footer = tree.root.findAll((n) => typeof n.type === 'string' && n.findAll((c) => c === shield).length && n.findAll((c) => c.props.title === t('obNext')).length).at(-1);
    expect(footer.children.at(-1).findAll((c) => c === shield)).toHaveLength(1);
    await advance(LOCK_MS);
    expect(hostId(tree, 'opw-lock')).toHaveLength(0);
    await tap(tree, t('obNext'));
    expect(h.onStep).toHaveBeenLastCalledWith(2, 'plans');
  });

  test('the close cross has a pressed state', async () => {
    const tree = await mount(<OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} {...handlers()} />);
    const close = tree.root.findAll((n) => n.type === Press && n.props.accessibilityLabel === t('close'));
    expect(close).toHaveLength(1);
    expect(close[0].props.feedback).toBe('dim');
  });

  test('plans that vanish mid-way (a failed reload) do not crash the trial and reminder screens', async () => {
    const h = handlers();
    const tree = await mount(<OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} {...h} />);
    await act(async () => tree.update(<OnboardingPaywall plans={[]} lang="en" t={t} {...h} />));
    expect(has(tree, 'Try Pro free for 7 days')).toBe(true);
    await advance(LOCK_MS);
    await tap(tree, t('obNext'));
    expect(has(tree, t('opwRemindTitle'))).toBe(true);
  });
});

// ─── VoiceOver ─────────────────────────────────────────────────────────────
describe('VoiceOver on the plan and on the promise', () => {
  let announce;
  beforeEach(() => {
    AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(true));
    announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    AccessibilityInfo.sendAccessibilityEvent.mockClear();
  });
  afterEach(() => announce.mockRestore());

  const focused = () => AccessibilityInfo.sendAccessibilityEvent.mock.calls.filter(([, e]) => e === 'focus').map(([el]) => el?.props?.children);

  test('“Putting your plan together” is announced; when the plan is ready the focus moves to its title', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree } = await render({ draft: { ...DRAFT, phase: 'wod' } }, { createNodeMock: (el) => el });
    await tap(tree, t('obNext'));
    expect(has(tree, t('obBuildTitle'))).toBe(true);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith(t('obBuildTitle'));
    // поки складається, заголовка немає — фокусу нікуди йти
    expect(focused().filter(Boolean).at(-1)).toBe(t('obWodTitle').length ? focused().filter(Boolean).at(-1) : undefined);
    const before = focused().filter(Boolean).length;
    await advance(BUILD_MIN_MS + 10);
    expect(title(tree)).not.toBe('');
    const after = focused().filter(Boolean);
    expect(after.length).toBe(before + 1);
    expect(after.at(-1)).toBe(title(tree));
    // і вдруге нічого не оголошується
    expect(announce).toHaveBeenCalledTimes(1);
  });

  test('without VoiceOver nothing is announced', async () => {
    AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree } = await render({ draft: { ...DRAFT, phase: 'wod' } });
    await tap(tree, t('obNext'));
    expect(announce).not.toHaveBeenCalled();
  });

  test('the promise by a tap: “Deal!” and the sub line are announced as one sentence', async () => {
    const onCommit = jest.fn();
    const tree = await mount(<HoldToCommit onCommit={onCommit} label="Promise" holdHint="Hold" tapHint="Tap" doneText="Deal!" doneSub="See you tomorrow" />);
    const btn = tree.root.find((n) => n.props.testID === 'hold-to-commit' && 'onPressIn' in n.props);
    await act(async () => btn.props.onPress());
    expect(onCommit).toHaveBeenCalledWith({ mode: 'tap', releases: 0 });
    expect(announce).toHaveBeenCalledWith('Deal!. See you tomorrow');
  });
});

// ─── Камера: хрестик повертає на демо ─────────────────────────────────────
describe('closing the camera returns to a calmer demo', () => {
  let scanner;
  const renderScanner = (p) => {
    scanner = p;
    return <Text>camera</Text>;
  };
  async function toDemo() {
    permissionStatus.mockImplementation(async () => 'granted');
    const r = await render({ draft: { ...DRAFT, phase: 'demo', push: true, hour: 10 }, canWow: true, renderScanner, aiConsent: true });
    expect(title(r.tree)).toBe(t('obDemoTitle'));
    return r;
  }
  const demo = (tree) => tree.root.findByType(ScanDemo);
  const breathing = (tree) => tree.root.findAll((n) => typeof n.type === 'function' && n.type.name === 'BreathingBtn')[0];

  test('the first run buzzes; after the camera X the demo plays without buzzes, the halo waits for the final, only a fade', async () => {
    const { tree } = await toDemo();
    expect(demo(tree).props.haptics).toBe(true);
    expect(breathing(tree).props.on).toBe(false);
    // дограли до фіналу: «Спробувати» дихає
    await advance(11000);
    expect(breathing(tree).props.on).toBe(true);
    expect(demo(tree).props.haptics).toBe(false);

    await tap(tree, t('obDemoTry'));
    expect(scanner).toBeTruthy();
    Haptics.impactAsync.mockClear();
    await act(async () => scanner.onExit('closed'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    expect(demo(tree).props.haptics).toBe(false);
    expect(breathing(tree).props.on).toBe(false);
    expect(tree.root.findByType(StepFrame).props.direction).toBe('fade');
    // демо знову йде, але дотиків (Soft, Light) уже немає
    await advance(11000);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    // і на новому фіналі кнопка знову дихає
    expect(breathing(tree).props.on).toBe(true);
  });

  test('closing before the first run is over keeps its buzzes (nothing has been seen yet)', async () => {
    const { tree } = await toDemo();
    await tap(tree, t('obDemoTry'));
    await act(async () => scanner.onExit('closed'));
    expect(demo(tree).props.haptics).toBe(true);
  });

  test('the shield covers the remounted frame (a double tap on the X cannot press “Back”)', async () => {
    const { tree } = await toDemo();
    await tap(tree, t('obDemoTry'));
    await act(async () => scanner.onExit('closed'));
    expect(hostId(tree, 'step-lock-all')).toHaveLength(1);
    await advance(LOCK_MS);
    expect(hostId(tree, 'step-lock-all')).toHaveLength(0);
  });
});

describe('the halo does not freeze at a partial opacity', () => {
  test('“Replay” in the middle of a breath fades the halo out instead of leaving it', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree } = await render({ draft: { ...DRAFT, phase: 'demo', push: true, hour: 10 }, canWow: true, renderScanner: () => <Text>camera</Text>, aiConsent: true });
    await advance(11000);
    await advance(400);
    const timing = jest.spyOn(Animated, 'timing');
    // «Ще раз»: фінал скинуто, дихання зупинене посеред вдиху
    const replay = tree.root.findAll((n) => n.props.accessibilityLabel === t('obDemoReplay') && typeof n.props.onPress === 'function');
    expect(replay.length).toBeGreaterThan(0);
    await act(async () => replay.at(-1).props.onPress());
    // обідок не лишився напівпрозорим: його гасить DUR.exit по EASE.out, нативно
    const fades = timing.mock.calls.map(([, c]) => c).filter((c) => c.toValue === 0 && c.duration === DUR.exit);
    expect(fades).toHaveLength(1);
    expect(fades[0]).toMatchObject({ easing: EASE.out, useNativeDriver: true });
    timing.mockRestore();
  });
});

describe('finish is idempotent', () => {
  test('a double tap on “Done” (replay) hands the result over once', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const { tree, onDone } = await render({ replay: true, hasWords: true, todayWord: WORD });
    for (let i = 0; i < 7; i++) await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obDemoTitle'));
    const done = control(tree, t('obFinish'));
    await act(async () => {
      done.props.onPress();
      done.props.onPress();
    });
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});

// ─── Натиск, поля, чипи ────────────────────────────────────────────────────
describe('pressed states and small fixes', () => {
  test('Back, Skip and the close cross dim on press (Press, feedback “dim”), the targets keep their roles and labels', async () => {
    const tree = await mount(
      <StepFrame stepKey="a" progress={{ step: 1, total: 3 }} onBack={() => {}} right={<SkipButton onPress={() => {}} t={t} />} title="T" t={t}>
        <Text>x</Text>
      </StepFrame>
    );
    const back = tree.root.findAll((n) => n.type === Press && n.props.accessibilityLabel === t('pfBack'));
    expect(back).toHaveLength(1);
    expect(back[0].props).toMatchObject({ feedback: 'dim', accessibilityRole: 'button' });
    const skip = tree.root.findAll((n) => n.type === Press && n.findAll((c) => c.props.children === t('obSkip')).length);
    expect(skip).toHaveLength(1);
    expect(skip[0].props).toMatchObject({ feedback: 'dim', accessibilityRole: 'button' });
  });

  test('the name field: Return says “done”, is off while empty and does not blur when pressed', async () => {
    const tree = await mount(<NameField value="" onChange={() => {}} onSubmit={() => {}} label="Name" t={t} />);
    const input = tree.root.find((n) => typeof n.props.onChangeText === 'function' && n.props.maxLength === 30);
    expect(input.props).toMatchObject({ returnKeyType: 'done', enablesReturnKeyAutomatically: true, submitBehavior: 'submit' });
  });

  test('hour chips shrink the time instead of cutting it (“10:0…” at larger text)', async () => {
    const tree = await mount(<HourChips value={10} onChange={() => {}} t={t} />);
    const times = tree.root.findAll((n) => typeof n.type === 'string' && n.props.numberOfLines === 1 && /\d:\d\d/.test(String(n.props.children)));
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (const x of times) expect(x.props).toMatchObject({ adjustsFontSizeToFit: true, minimumFontScale: 0.6 });
  });

  test('the push step button shows loading (full colour, busy) instead of dimming', async () => {
    let finish;
    requestPermission.mockImplementation(() => new Promise((r) => (finish = r)));
    const { tree } = await render({ draft: { ...DRAFT, phase: 'wod' } });
    await tap(tree, t('obNext'));
    await advance(LOCK_MS);
    const btn = () => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('obNext'))[0];
    expect(btn().props.loading).toBe(false);
    await act(async () => {
      btn().props.onPress();
    });
    expect(btn().props.loading).toBe(true);
    expect(btn().props.disabled).toBeFalsy();
    await act(async () => finish(true));
  });
});

describe('the selection check pops only for a choice made on the screen', () => {
  const pops = (tree) => tree.root.findAll((n) => typeof n.type === 'function' && n.type.name === 'CheckPop');

  test('answers the step opened with stand still; a new choice animates', async () => {
    let value = ['travel'];
    const onChange = (v) => (value = v);
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await mount(<GoalOptions value={value} onChange={onChange} t={t} />);
    const opacity = (p) => valueOf(flat(animatedViews(p)[0]).opacity);
    expect(pops(tree)).toHaveLength(1);
    expect(opacity(pops(tree)[0])).toBe(1);
    expect(spring).not.toHaveBeenCalled();
    await act(async () => tree.update(<GoalOptions value={['travel', 'work']} onChange={onChange} t={t} />));
    expect(pops(tree)).toHaveLength(2);
    // порядок — як у переліку цілей: «робота» (щойно обрана) раніше за «подорожі»
    expect(pops(tree).map(opacity)).toEqual([0, 1]);
    // пружина без перельоту: SPRING.snappy
    expect(spring).toHaveBeenCalledTimes(1);
    expect(spring.mock.calls[0][1]).toMatchObject({ toValue: 1, stiffness: SPRING.snappy.stiffness, damping: SPRING.snappy.damping, useNativeDriver: true });
    spring.mockRestore();
  });
});

describe('the plan screen’s ready moment', () => {
  const rows = (wodDone) => [
    { key: 'lang', text: 'German', done: true },
    { key: 'wod', text: 'word', done: wodDone },
  ];

  test('a row that becomes ready pops its check; rows that appeared ready do not', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await mount(<PlanBuilding title="Building" rows={rows(false)} />);
    const marks = () => tree.root.findAll((n) => typeof n.type === 'function' && n.type.name === 'BuildMark');
    expect(marks()).toHaveLength(2);
    expect(spring).not.toHaveBeenCalled();
    await act(async () => tree.update(<PlanBuilding title="Building" rows={rows(true)} />));
    const opacity = (m) => valueOf(flat(animatedViews(m).at(-1)).opacity);
    // готовий від початку: прозорість 1; щойно готовий: починає з 0 і пружить до 1
    expect(opacity(marks()[0])).toBe(1);
    expect(opacity(marks()[1])).toBe(0);
    expect(spring).toHaveBeenCalledTimes(1);
    expect(spring.mock.calls[0][1]).toMatchObject({ toValue: 1, stiffness: SPRING.snappy.stiffness, useNativeDriver: true });
    spring.mockRestore();
  });

  test('a title that appears after the step (the plan after building) fades in; a title present from the start does not', async () => {
    const frame = (title) => (
      <StepFrame stepKey="plan" progress={{ step: 1, total: 3 }} title={title} t={t}>
        <Text>body</Text>
      </StepFrame>
    );
    // найглибший Animated.View, що тримає заголовок (зовнішній — поява кроку)
    const fade = (tree) => animatedViews(tree.root).filter((n) => n.findAll((c) => typeof c.type === 'string' && c.props.accessibilityRole === 'header').length).at(-1);
    const tree = await mount(frame(''));
    const timing = jest.spyOn(Animated, 'timing');
    await act(async () => tree.update(frame('Here is your plan')));
    // до першого кадру заголовок на нулі, далі — лише прозорість, DUR.micro, EASE.soft
    expect(valueOf(flat(fade(tree)).opacity)).toBe(0);
    const fades = timing.mock.calls.map(([, c]) => c).filter((c) => c.toValue === 1 && c.duration === DUR.micro);
    expect(fades).toHaveLength(1);
    expect(fades[0]).toMatchObject({ easing: EASE.soft, useNativeDriver: true });
    timing.mockRestore();
    // з заголовком від початку: без прояви
    const tree2 = await mount(frame('Title from the start'));
    expect(valueOf(flat(fade(tree2)).opacity)).toBe(1);
  });
});

// ─── Кільце: після двох спроб це кнопка ───────────────────────────────────
describe('hold to commit: the second short press hands over to taps at once', () => {
  const LABELS = { label: 'Promise', holdHint: 'Press and hold', tapHint: 'Tap to promise', longerHint: 'Hold a little longer', doneText: 'Deal!' };
  const button = (tree) => tree.root.find((n) => n.props.testID === 'hold-to-commit' && 'onPressIn' in n.props);
  const hint = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'commit-hint').props.children;
  async function quickTap(tree) {
    await act(async () => button(tree).props.onPressIn());
    await advance(100);
    await act(async () => button(tree).props.onPressOut());
  }

  test('first short: “hold longer” for NUDGE_MS; second: the tap hint right away (no 1.5 s of a wrong hint), the ring squeezes on press-in', async () => {
    const onCommit = jest.fn();
    const tree = await mount(<HoldToCommit onCommit={onCommit} {...LABELS} />);
    await quickTap(tree);
    expect(hint(tree)).toBe('Hold a little longer');
    await advance(NUDGE_MS + 10);
    expect(hint(tree)).toBe('Press and hold');
    await quickTap(tree);
    expect(hint(tree)).toBe('Tap to promise');
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    expect(onCommit).not.toHaveBeenCalled();

    // тап-режим: press-in дає відгук (SPRING.snappy), тап (release) обіцяє
    const spring = jest.spyOn(Animated, 'spring');
    await act(async () => button(tree).props.onPressIn());
    expect(spring).toHaveBeenCalledTimes(1);
    expect(spring.mock.calls[0][1]).toMatchObject({ toValue: 0.97, stiffness: SPRING.snappy.stiffness, useNativeDriver: true });
    await act(async () => button(tree).props.onPressOut());
    expect(spring.mock.calls[1][1]).toMatchObject({ toValue: 1 });
    await act(async () => button(tree).props.onPress());
    expect(onCommit).toHaveBeenCalledWith({ mode: 'tap', releases: 2 });
    spring.mockRestore();
  });

  test('two quick taps in a row (the first nudge still on screen): the second drops it and shows the tap hint', async () => {
    const tree = await mount(<HoldToCommit onCommit={() => {}} {...LABELS} />);
    await quickTap(tree);
    expect(hint(tree)).toBe('Hold a little longer');
    await quickTap(tree);
    expect(hint(tree)).toBe('Tap to promise');
    // и таймер першої підказки пізніше нічого не повертає
    await advance(NUDGE_MS + 10);
    expect(hint(tree)).toBe('Tap to promise');
  });

  test('Reduce Motion: a tap on the ring squeezes nothing', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await mount(<HoldToCommit onCommit={() => {}} {...LABELS} />);
    await act(async () => button(tree).props.onPressIn());
    expect(spring).not.toHaveBeenCalled();
    expect(HOLD_MS).toBe(1500);
    spring.mockRestore();
  });
});

describe('demo caption', () => {
  test('a new caption text is dimmed before the first frame (layout effect), then fades in', async () => {
    const layout = jest.spyOn(React, 'useLayoutEffect');
    const set = jest.spyOn(Animated.Value.prototype, 'setValue');
    const timing = jest.spyOn(Animated, 'timing');
    const tree = await mount(<BeatCaption beat={0} t={t} />);
    const animated = () => tree.root.findAll((n) => typeof n.type !== 'string' && n.props.testID === 'demo-caption' && n.type?.displayName === 'Animated(Text)')[0];
    const op = () => valueOf(flat(animated()).opacity);
    // перший підпис — одразу повний, без прояви
    expect(layout.mock.calls.some(([fn]) => /setValue\(0\)/.test(String(fn)))).toBe(true);
    expect(op()).toBe(1);
    expect(timing).not.toHaveBeenCalled();
    set.mockClear();
    await act(async () => tree.update(<BeatCaption beat={1} t={t} />));
    // новий текст у тому ж коміті, що й 0: layout-ефект, а не passive
    expect(tree.root.findAll((n) => n.props.testID === 'demo-caption' && typeof n.type === 'string')[0].props.children).toBe(t('obDemoBeat2'));
    expect(set).toHaveBeenCalledWith(0);
    expect(op()).toBe(0);
    const fades = timing.mock.calls.map(([, c]) => c).filter((c) => c.toValue === 1 && c.duration === DUR.micro);
    expect(fades).toHaveLength(1);
    expect(fades[0]).toMatchObject({ easing: EASE.soft, useNativeDriver: true });
    layout.mockRestore();
    set.mockRestore();
    timing.mockRestore();
  });
});
