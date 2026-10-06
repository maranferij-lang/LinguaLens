// Онбординг 4.0 — правки власника після першого запуску в симуляторі
// (5.10.2026): новий крок «Що таке слово дня» і сповіщення перед планом,
// старі чернетки в новому порядку, Лінго на кроках-питаннях і на кроці
// імені, дві секції на кроці мови, назви рівнів, телефон у рамці зі
// сповіщенням, сцена в демо, Лінго на обіцянці. Повний шлях — у
// onboarding.test.js; тут — кожна нова поведінка окремо.
import { AccessibilityInfo, Animated, ScrollView, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import OnboardingScreen, { AUTO_MS, LINGO_POSE, restoreDraft, topicsLine } from '../src/OnboardingScreen';
import ProfileEditor from '../src/ProfileEditor';
import { LevelBody, StepFrame } from '../src/ProfileSteps';
import {
  NAME_PAUSE_MS,
  NameLingo,
  PushPreview,
  WELCOME_FONT_MAX,
  WELCOME_PAD,
  balancedWidth,
  lockClock,
  nameLingoSize,
  phoneVisible,
  welcomeSizes,
  wrapLines,
} from '../src/OnboardingParts';
import { textEm } from '../src/share/layout';
import ScanDemo from '../src/ScanDemo';
import { MascotLive } from '../src/Mascot';
import { DEMO_WORDS, SCENE_KEYS, SCENE_WORDS, demoExample, demoScene } from '../src/demoWords';
import { levelName, levelStage } from '../src/profile';
import { LANGS } from '../src/speech';
import { permissionStatus, requestPermission } from '../src/wordOfDay';
import { STRINGS, makeT } from '../src/i18n';

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
const uk = makeT('uk');
const LOCALES = ['en', 'uk', 'de', 'es', 'ru'];

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

async function mount(el) {
  let tree;
  await act(async () => {
    tree = create(el);
  });
  await act(async () => {});
  mounted.push(tree);
  return tree;
}
const render = (props = {}) =>
  mount(<OnboardingScreen t={t} uiLang="en" onDone={jest.fn()} targetLang="en" nativeLang="uk" phoneNative="uk" prepareWod={jest.fn(async () => null)} {...props} />);

const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const has = (tree, s) => texts(tree).includes(s);
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function');
const hostId = (tree, id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);
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
const lingo = (tree, id) => tree.root.findAll((n) => n.type === MascotLive && n.props.testID === id)[0];
const nameInput = (tree) => tree.root.find((n) => typeof n.props.onChangeText === 'function' && n.props.maxLength === 30);

async function toGoals(tree) {
  await tap(tree, t('obStart'));
  await act(async () => byId(tree, 'lang-en').at(-1).props.onPress());
  await advance(AUTO_MS);
  await tap(tree, t('obSkip')); // імʼя
  await tap(tree, t('obSkip')); // звідки
}

// ─── Старі чернетки в новому порядку ───────────────────────────────────────
describe('drafts saved by onboarding 3.0', () => {
  const now = Date.now();
  const base = { v: 3, at: now - 60 * 1000, variant: 'control', target: 'de', native: 'uk', goals: ['travel'], level: 4 };

  test('at the push step: restored right there, and the plan comes next', async () => {
    expect(restoreDraft({ ...base, phase: 'push' }, now)).toMatchObject({ phase: 'push' });
    expect(restoreDraft({ ...base, phase: 'pushDenied', push: false }, now)).toMatchObject({ phase: 'pushDenied', push: false });
    const tree = await render({ draft: { ...base, phase: 'push', hour: 19 } });
    expect(title(tree)).toBe(t('obPushTitle'));
    expect(byId(tree, 'push-hour-19').at(-1).props.accessibilityState).toEqual({ checked: true });
    await tap(tree, t('obNext'));
    expect(has(tree, t('obBuildTitle'))).toBe(true);
  });

  test('at the plan or streak before anyone asked about notifications: back to “what is the word of the day”', () => {
    for (const phase of ['plan', 'streak']) {
      expect(restoreDraft({ ...base, phase }, now)).toMatchObject({ phase: 'wod' });
      // з відповіддю про сповіщення — з того ж кроку (новий порядок)
      expect(restoreDraft({ ...base, phase, push: true, hour: 14 }, now)).toMatchObject({ phase, push: true, hour: 14 });
    }
    // кроки після сповіщень у старому порядку — без змін
    expect(restoreDraft({ ...base, phase: 'widgets', push: true }, now)).toMatchObject({ phase: 'widgets' });
    expect(restoreDraft({ ...base, phase: 'wod' }, now)).toMatchObject({ phase: 'wod' });
  });
});

// Онбординг 5.0 (6.10.2026): «звідки» — одразу після імені (у короткому
// варіанті — після мови), а не останнім питанням. Чернетки 3.0 і 4.0 ще
// мають старий порядок: людина на цілях, сфері, рівні чи «що заважає» без
// відповіді «звідки» цього питання не бачила, а тепер воно позаду.
describe('drafts saved before “heard” moved up (3.0 and 4.0)', () => {
  const now = Date.now();
  const base = { v: 3, at: now - 60 * 1000, variant: 'control', target: 'de', native: 'uk', name: 'Olena', goals: ['work'], field: 'it', level: 4, struggles: ['time'] };
  const QUESTIONS_AFTER = ['goals', 'field', 'level', 'struggles'];

  test('on a question that now comes after “heard”, with no answer to it: back to “heard”, every other answer kept', () => {
    for (const ver of [undefined, 4]) {
      for (const phase of QUESTIONS_AFTER) {
        expect([ver, phase, restoreDraft({ ...base, ver, phase }, now)]).toEqual([
          ver,
          phase,
          expect.objectContaining({ phase: 'heard', heard: null, name: 'Olena', goals: ['work'], field: 'it', level: 4, struggles: ['time'] }),
        ]);
      }
      // відповідь «звідки» вже є (поверталась назад) — з того ж кроку
      expect(restoreDraft({ ...base, ver, phase: 'level', heard: 'youtube' }, now)).toMatchObject({ phase: 'level', heard: 'youtube' });
      // кроки, що й тоді йшли до «звідки» чи після нього, — без змін
      for (const phase of ['lang', 'name', 'heard', 'wod']) expect(restoreDraft({ ...base, ver, phase }, now)).toMatchObject({ phase });
    }
    // короткий варіант: там «звідки» — одразу після мови
    expect(restoreDraft({ ...base, ver: 4, variant: 'short', phase: 'goals' }, now)).toMatchObject({ phase: 'heard', variant: 'short' });
  });

  test('a 5.0 draft is restored where it was: “heard” skipped there is not asked again', () => {
    for (const phase of QUESTIONS_AFTER) expect(restoreDraft({ ...base, ver: 5, phase }, now)).toMatchObject({ phase, heard: null });
  });

  test('restored on “heard”, the person goes on through the questions with their answers already picked', async () => {
    const onDone = jest.fn();
    const tree = await render({ draft: { ...base, ver: 4, phase: 'struggles' }, onDone });
    expect(title(tree)).toBe(t('pfHeardTitle'));
    await tap(tree, 'TikTok');
    await advance(AUTO_MS);
    expect(title(tree)).toBe('Olena, why are you learning German?');
    expect(control(tree, t('goal_work')).props.accessibilityState).toEqual({ checked: true });
  });
});

// Сповіщення вже дозволено чи заборонено (кроку вибору години немає) — у
// чернетці плану й серії push не true/false і в новому порядку. Така
// людина вже бачила «слово дня»: вона продовжує з того ж кроку, а не
// проходить «слово дня» й план удруге.
describe('drafts saved by onboarding 4.0', () => {
  test('at the plan or streak with no push step: restored right there, not rewound to “what is the word of the day”', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const onDraft = jest.fn();
    const start = { v: 3, at: Date.now() - 60 * 1000, variant: 'control', target: 'de', native: 'uk', goals: ['travel'], level: 4, phase: 'wod' };
    const tree = await render({ draft: start, onDraft });
    expect(title(tree)).toBe(t('obWodTitle'));
    await tap(tree, t('obNext'));
    await advance(3000);
    expect(title(tree)).toBe(t('obPlanTitle'));
    // так чернетку зберігає App (storage.persistOnboardingDraft)
    const saved = (phase) => ({ ...onDraft.mock.calls.map(([d]) => d).findLast((d) => d.phase === phase), v: 3, at: Date.now() });
    const plan = saved('plan');
    expect(plan.push).toBeUndefined();
    expect(restoreDraft(plan)).toMatchObject({ phase: 'plan' });
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obStreakTitle'));
    expect(restoreDraft(saved('streak'))).toMatchObject({ phase: 'streak' });

    // і справді з того ж кроку після перезапуску
    const again = await render({ draft: plan });
    await advance(3000);
    expect(title(again)).toBe(t('obPlanTitle'));
  });
});

// ─── Лінго на кроках-питаннях ──────────────────────────────────────────────
describe('Lingo on the question steps', () => {
  test('beside the title with a pose for each step, hopping on every choice, never read by VoiceOver', async () => {
    const tree = await render();
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-en').at(-1).props.onPress());
    await advance(AUTO_MS);
    await tap(tree, t('obSkip')); // імʼя
    expect(title(tree)).toBe(t('pfHeardTitle'));
    expect(lingo(tree, 'step-lingo').props.pose).toBe(LINGO_POSE.heard);
    await tap(tree, t('obSkip'));
    expect(lingo(tree, 'step-lingo').props.pose).toBe(LINGO_POSE.goals);
    const host = hostId(tree, 'step-lingo')[0];
    expect(host.props.accessibilityElementsHidden).toBe(true);
    expect(host.props.importantForAccessibility).toBe('no-hide-descendants');
    // Лінго — у рядку заголовка, праворуч від нього
    const row = tree.root.findAll((n) => typeof n.type === 'string' && n.findAll((c) => c.props.accessibilityRole === 'header').length && n.findAll((c) => c.props.testID === 'step-lingo').length).at(-1);
    expect(StyleSheet.flatten(row.props.style).flexDirection).toBe('row');
    const hop0 = lingo(tree, 'step-lingo').props.hop;
    await tap(tree, t('goal_work'));
    expect(lingo(tree, 'step-lingo').props.hop).not.toBe(hop0);
    await tap(tree, t('obNext'));
    expect(lingo(tree, 'step-lingo').props.pose).toBe(LINGO_POSE.field);
    await tap(tree, t('field_it'));
    await advance(AUTO_MS);
    expect(lingo(tree, 'step-lingo').props.pose).toBe(LINGO_POSE.level);
    await tap(tree, t('obNext'));
    expect(lingo(tree, 'step-lingo').props.pose).toBe(LINGO_POSE.struggles);
    // «що заважає» — останнє питання: далі вже «слово дня»
    await tap(tree, t('struggle_time'));
    await tap(tree, t('obNext'));
    expect(title(tree)).toBe(t('obWodTitle'));
    expect(LINGO_POSE).toEqual({ goals: 'encourage', field: 'think', level: 'think', struggles: 'encourage', heard: 'wave' });
  });

  test('the size fits an SE (64) and grows on a tall phone (76)', async () => {
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions');
    try {
      dims.mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 1 });
      let tree = await render();
      await toGoals(tree);
      expect(lingo(tree, 'step-lingo').props.size).toBe(64);
      dims.mockReturnValue({ width: 440, height: 956, scale: 3, fontScale: 1 });
      tree = await render();
      await toGoals(tree);
      expect(lingo(tree, 'step-lingo').props.size).toBe(76);
    } finally {
      dims.mockRestore();
    }
  });

  test('the short variant cheers for the language in a bubble without a second Lingo, and Lingo celebrates', async () => {
    require('../src/analytics').flag.mockImplementation(async () => 'short');
    const tree = await render();
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-es').at(-1).props.onPress());
    await advance(AUTO_MS);
    expect(has(tree, 'Spanish? Great choice!')).toBe(true);
    expect(lingo(tree, 'step-lingo').props.pose).toBe('celebrate');
    const bubble = tree.root.findAll((n) => n.props.testID === 'lingo-bubble' && typeof n.type !== 'string')[0];
    expect(bubble.findAll((n) => n.props.source !== undefined && typeof n.type === 'string')).toHaveLength(0);
    require('../src/analytics').flag.mockImplementation(async () => 'control');
  });
});

// ─── Крок імені ────────────────────────────────────────────────────────────
describe('the name step', () => {
  test('Lingo peeks from behind the button and waves; after a pause it greets the person by name', async () => {
    const tree = await render();
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-en').at(-1).props.onPress());
    await advance(AUTO_MS);
    expect(title(tree)).toBe(t('obNameTitle'));
    expect(lingo(tree, 'step-lingo')).toBeUndefined();
    const peek = () => lingo(tree, 'name-lingo-mascot');
    expect(peek().props).toMatchObject({ pose: 'wave', enter: 'peek' });
    // поки поле порожнє — реакція на мову
    expect(has(tree, 'English? Great choice!')).toBe(true);
    await act(async () => nameInput(tree).props.onChangeText('Ole'));
    await act(async () => nameInput(tree).props.onChangeText('Olena'));
    await advance(NAME_PAUSE_MS - 50);
    expect(has(tree, 'Nice to meet you, Olena!')).toBe(false);
    expect(has(tree, 'Nice to meet you, Ole!')).toBe(false);
    await advance(60);
    expect(has(tree, 'Nice to meet you, Olena!')).toBe(true);
    expect(peek().props.pose).toBe('celebrate');
    // стерли — знову махає
    await act(async () => nameInput(tree).props.onChangeText(''));
    expect(peek().props.pose).toBe('wave');
    expect(has(tree, 'Nice to meet you, Olena!')).toBe(false);
  });

  test('no privacy subtitle any more; the old string is gone from every language', async () => {
    const tree = await render();
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-en').at(-1).props.onPress());
    await advance(AUTO_MS);
    expect(tree.root.findByType(StepFrame).props.text).toBeFalsy();
    for (const l of LOCALES) {
      for (const k of ['obNameText', 'pfGoalsText', 'pfFieldText', 'pfLevelText', 'obStrugglesText', 'pfHeardText', 'obLangText', 'obPushPreviewBody']) {
        expect([l, k, STRINGS[l][k]]).toEqual([l, k, undefined]);
      }
      for (let i = 1; i <= 5; i++) expect(STRINGS[l]['levelBand' + i]).toBeUndefined();
      expect(STRINGS[l].obNameNice).toContain('{name}');
    }
    expect(uk('obNameNice', { name: 'Олено' })).toBe('Приємно познайомитися, Олено!');
  });

  test('tight room (an SE with the keyboard up): a smaller Lingo, then none — the field and the button win', async () => {
    expect(nameLingoSize(null)).toBe(96);
    expect(nameLingoSize(400)).toBe(128);
    const mid = nameLingoSize(70);
    expect(mid).toBeGreaterThanOrEqual(58);
    expect(mid).toBeLessThan(96);
    expect(nameLingoSize(30)).toBe(0);
    const tree = await mount(<NameLingo name="" cheer="" room={30} t={t} />);
    expect(tree.toJSON()).toBeNull();
  });

  // SE з клавіатурою (поле імені фокусується одразу): бульбашка стоїть
  // вище за Лінго, тож місця, якого досить Лінго, їй може забракнути —
  // вона не налазить на поле, а сідає нижче, біля кнопки; не влазить і
  // там — ховається (і від VoiceOver теж)
  test('the bubble never climbs onto the field: lower when tight, hidden when it does not fit', async () => {
    const bubbleAt = async (room, h = 60) => {
      const tree = await mount(<NameLingo name="Olena" room={room} t={t} />);
      await advance(NAME_PAUSE_MS);
      const box = hostId(tree, 'name-bubble')[0];
      await act(async () => box.props.onLayout({ nativeEvent: { layout: { height: h } } }));
      const b = hostId(tree, 'name-bubble')[0];
      const st = StyleSheet.flatten(b.props.style);
      return { lift: st.marginBottom, shown: st.opacity !== 0 && !b.props.accessibilityElementsHidden };
    };
    // просторо — як задумано: низ бульбашки на рівні грудей Лінго
    const wide = await bubbleAt(400);
    expect(wide.shown).toBe(true);
    expect(wide.lift).toBeCloseTo(128 * 0.42, 0);
    // SE з клавіатурою: Лінго ще влазить, а бульбашка на тій висоті — ні
    const tight = await bubbleAt(100);
    expect(nameLingoSize(100)).toBeGreaterThan(100);
    expect(tight.shown).toBe(true);
    expect(tight.lift + 60).toBeLessThanOrEqual(100 - 6);
    expect(tight.lift).toBeGreaterThan(0);
    // зовсім тісно для бульбашки — її немає, Лінго лишається
    const none = await bubbleAt(62);
    expect(nameLingoSize(62)).toBeGreaterThan(0);
    expect(none.shown).toBe(false);
  });

  test('StepFrame tells the peek how much room is left under the content', async () => {
    const peek = jest.fn(() => null);
    const tree = await mount(
      <StepFrame stepKey="name" title="T" footer={null} peek={peek} t={t}>
        {null}
      </StepFrame>
    );
    expect(peek).toHaveBeenLastCalledWith(null);
    const sv = tree.root.findByType(ScrollView);
    await act(async () => {
      sv.props.onLayout({ nativeEvent: { layout: { height: 300 } } });
      sv.props.onContentSizeChange(375, 200);
    });
    // 300 − 200 + нижній відступ 24
    expect(peek).toHaveBeenLastCalledWith(124);
  });
});

// ─── Крок мови ─────────────────────────────────────────────────────────────
describe('the language step', () => {
  test('two sections: my native language on top, the language I learn below, then Popular', async () => {
    const tree = await render();
    await tap(tree, t('obStart'));
    const all = texts(tree);
    const native = all.indexOf('My native language');
    const learn = all.indexOf('The language I’m learning');
    const popular = all.indexOf(t('obLangPopular'));
    expect(native).toBeGreaterThan(-1);
    expect(learn).toBeGreaterThan(native);
    expect(popular).toBeGreaterThan(learn);
    expect(all.indexOf('Українська')).toBeGreaterThan(native);
    expect(all.indexOf('Українська')).toBeLessThan(learn);
    expect(tree.root.findByType(StepFrame).props.text).toBeFalsy();
    expect(byId(tree, 'native-card')[0].props.accessibilityLabel).toBe('Native language: Українська. Change');
    expect(has(tree, 'your native language')).toBe(true);
  });

  test('the native sheet speaks of the native language; uk copy is exact', async () => {
    const tree = await render({ t: uk, uiLang: 'uk' });
    await tap(tree, uk('obStart'));
    await act(async () => byId(tree, 'native-card')[0].props.onPress());
    expect(has(tree, 'Твоя рідна мова')).toBe(true);
    expect(has(tree, 'Цією мовою будуть переклади й приклади.')).toBe(true);
    expect(uk('obNativeLabel')).toBe('Моя рідна мова');
    expect(uk('obLangLearnLabel')).toBe('Мова, яку я вчу');
    expect(uk('obLangIsNative')).toBe('твоя рідна мова');
    expect(uk('obNativeA11y', { lang: 'Українська' })).toBe('Рідна мова: Українська. Змінити');
  });
});

// ─── Вітання ───────────────────────────────────────────────────────────────
// Правка власника 6.10.2026: підзаголовка немає, «Привіт! Я Лінго.» —
// найбільший текст екрана, у бульбашці Лінго; заголовок під ним менший.
describe('welcome', () => {
  const hostText = (tree, s) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === s)[0];
  const fontSize = (n) => StyleSheet.flatten(n.props.style).fontSize;
  const withDims = async (dims, fn) => {
    const spy = jest.spyOn(require('react-native'), 'useWindowDimensions');
    spy.mockReturnValue({ scale: 2, fontScale: 1, ...dims });
    try {
      await fn();
    } finally {
      spy.mockRestore();
    }
  };

  test('big waving Lingo that hops in, the hello and the title; no subtitle', async () => {
    const tree = await render({ t: uk, uiLang: 'uk' });
    const hero = lingo(tree, 'welcome-lingo');
    expect(hero.props).toMatchObject({ pose: 'wave', enter: 'hop', waves: 3 });
    expect(hero.props.size).toBeGreaterThanOrEqual(160);
    expect(has(tree, 'Привіт! Я Лінго.')).toBe(true);
    expect(has(tree, 'Я стану твоїм провідником у світ мов')).toBe(true);
    expect(has(tree, 'Вчитимемо слова з речей навколо тебе — по одному щодня.')).toBe(false);
    // на екрані — лише назва, привітання, заголовок, кнопка й таблички наліпок
    const shown = new Set(tree.root.findAll((n) => n.type === 'Text' && typeof n.props.children === 'string').map((n) => n.props.children));
    expect([...shown].sort()).toEqual(
      ['LinguaLens', 'Привіт! Я Лінго.', 'Я стану твоїм провідником у світ мов', 'Почати', 'mug', 'planta', 'Schlüssel', '🇬🇧', '🇪🇸', '🇩🇪'].sort()
    );
    for (const l of LOCALES) expect(STRINGS[l]).not.toHaveProperty('ob3HookText');
    expect(STRINGS.en.ob3Hello).toBe('Hi! I’m Lingo.');
  });

  test('the hello is the biggest text on the screen, in Lingo’s bubble with a tail up to him; the title is smaller', async () => {
    for (const [dims, min, max] of [
      [{ width: 375, height: 667 }, 24, 28],
      [{ width: 440, height: 956 }, 28, 32],
    ]) {
      await withDims(dims, async () => {
        const tree = await render();
        const hello = hostText(tree, t('ob3Hello'));
        const title = hostText(tree, t('ob3HookTitle'));
        expect(fontSize(hello)).toBeGreaterThanOrEqual(min);
        expect(fontSize(hello)).toBeLessThanOrEqual(max);
        expect(StyleSheet.flatten(hello.props.style).fontFamily).toBe('Nunito_800ExtraBold');
        expect(fontSize(title)).toBeLessThan(fontSize(hello));
        const others = tree.root.findAll((n) => n.type === 'Text' && n !== hello).map(fontSize);
        expect(Math.max(...others)).toBeLessThan(fontSize(hello));
        const bubble = hostId(tree, 'hello-bubble')[0];
        expect(bubble.findAll((n) => n === hello)).toHaveLength(1);
        expect(hostId(tree, 'hello-tail')).toHaveLength(1);
        // старої бульбашки з мініатюрою Лінго на вітанні вже немає
        expect(hostId(tree, 'lingo-bubble')).toHaveLength(0);
      });
    }
  });

  test('large system text: the hello and the title grow at most by WELCOME_FONT_MAX; the title box is measured for that size', async () => {
    const dims = { width: 393, height: 852 };
    const copy = { hello: t('ob3Hello'), title: t('ob3HookTitle') };
    await withDims({ ...dims, fontScale: 1.12 }, async () => {
      const tree = await render();
      const hello = hostText(tree, t('ob3Hello'));
      const title = hostText(tree, t('ob3HookTitle'));
      expect(hello.props.maxFontSizeMultiplier).toBe(WELCOME_FONT_MAX);
      expect(title.props.maxFontSizeMultiplier).toBe(WELCOME_FONT_MAX);
      const box = StyleSheet.flatten(title.props.style).maxWidth;
      // рамка ширша, ніж для звичайного кегля, і така, як рахує welcomeSizes
      expect(box).toBe(welcomeSizes({ ...dims, fontScale: 1.12 }, copy).titleWidth);
      expect(box).toBeGreaterThan(welcomeSizes(dims, copy).titleWidth);
    });
  });

  test('VoiceOver: the hello, then the title, both read as headers; Lingo and the stickers are hidden', async () => {
    const tree = await render({ t: uk, uiLang: 'uk' });
    const headers = tree.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header').map((n) => n.props.children);
    expect(headers).toEqual(['Привіт! Я Лінго.', 'Я стану твоїм провідником у світ мов']);
    expect(hostId(tree, 'welcome-hero')[0].props.accessibilityElementsHidden).toBe(true);
  });

  test('with reduced motion the hello and the title only fade in, they do not travel', async () => {
    const shift = (tree) => ['hello-bubble', 'welcome-title'].map((id) => StyleSheet.flatten(hostId(tree, id)[0].props.style).transform ?? []);
    try {
      expect(shift(await render())).toEqual([[{ translateY: 12 }], [{ translateY: 12 }]]);
      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
      await render(); // перший рендер лише дізнається про «Менше руху»
      expect(shift(await render())).toEqual([[], []]);
    } finally {
      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
      await render();
    }
  });

  test('sizes: the hello fits one line in every language, from SE to Pro Max; the title breaks into even lines', () => {
    const screens = [
      { width: 320, height: 548 },
      { width: 375, height: 647 },
      { width: 375, height: 728 },
      { width: 393, height: 759 },
      { width: 440, height: 860 },
    ];
    const copy = (l) => ({ hello: STRINGS[l].ob3Hello, title: STRINGS[l].ob3HookTitle });
    expect(welcomeSizes(screens[1], copy('uk'))).toMatchObject({ hero: 246, hello: 28, title: 22 });
    expect(welcomeSizes(screens[4], copy('uk'))).toMatchObject({ hero: 327, hello: 32, title: 24 });
    for (const scr of screens) {
      for (const l of LOCALES) {
        const size = welcomeSizes(scr, copy(l));
        const at = [l, scr.width + 'x' + scr.height];
        expect([...at, size.hello >= 24, size.title < size.hello]).toEqual([...at, true, true]);
        // привітання (з полями екрана й бульбашки) — один рядок, не ширший за екран
        const line = textEm(copy(l).hello, -0.014) * size.hello + 2 * (WELCOME_PAD + 20);
        expect([...at, line <= scr.width]).toEqual([...at, true]);
        // Lingo з наліпками (size + 96) не ширший за екран
        expect([...at, size.hero + 96 <= scr.width - 16]).toEqual([...at, true]);
        // заголовок — два рядки, як і на всю ширину, але рівні: другий не
        // коротший за половину першого (ніякого «світ мов» самотою)
        const full = wrapLines(copy(l).title, size.title, scr.width - 2 * WELCOME_PAD);
        const even = wrapLines(copy(l).title, size.title, size.titleWidth);
        expect([...at, even.length]).toEqual([...at, full.length]);
        expect([...at, even.at(-1).length >= even[0].length / 2]).toEqual([...at, true]);
      }
    }
    // Великий системний шрифт: заголовок росте не більш як на
    // WELCOME_FONT_MAX, рядків стільки ж, скільки на всю ширину рамки,
    // без самотнього останнього слова, і привітання все одно більше
    for (const scr of screens.slice(1)) {
      for (const l of LOCALES) {
        for (const fontScale of [0.88, 1, 1.12, 1.24, 1.3, 1.35, 2]) {
          const size = welcomeSizes({ ...scr, fontScale }, copy(l));
          const k = Math.min(fontScale, WELCOME_FONT_MAX);
          const at = [l, scr.width + 'x' + scr.height, fontScale];
          const full = wrapLines(copy(l).title, size.title * k, Math.min(360, scr.width - 2 * WELCOME_PAD));
          const even = wrapLines(copy(l).title, size.title * k, size.titleWidth);
          expect([...at, even.length]).toEqual([...at, full.length]);
          expect([...at, even.at(-1).length >= even[0].length / 2]).toEqual([...at, true]);
          expect([...at, size.hello * k > size.title * k]).toEqual([...at, true]);
        }
      }
    }
    expect(wrapLines(uk('ob3HookTitle'), 22, welcomeSizes(screens[1], copy('uk')).titleWidth)).toEqual(['Я стану твоїм', 'провідником у світ мов']);
    expect(wrapLines(uk('ob3HookTitle'), 22, 327)).toEqual(['Я стану твоїм провідником у', 'світ мов']);
    // російський заголовок на SE — два рівні рядки, без куцого «в мир языков»
    expect(wrapLines(makeT('ru')('ob3HookTitle'), 22, welcomeSizes(screens[1], copy('ru')).titleWidth)).toEqual(['Я стану твоим гидом', 'в мире языков']);
    // коротке влазить в один рядок — ширина вся
    expect(balancedWidth('Hi', 22, 300)).toBe(300);
  });
});

// ─── Рівень ────────────────────────────────────────────────────────────────
describe('level names', () => {
  test('two levels per name: Beginner … Advanced; uk copy is exact', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(levelStage)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
    expect([1, 3, 5, 7, 9].map((l) => levelName(l, t))).toEqual(['Beginner', 'Elementary', 'Intermediate', 'Confident', 'Advanced']);
    expect([2, 4, 6, 8, 10].map((l) => levelName(l, uk))).toEqual(['Новачок', 'Початківець', 'Середній', 'Впевнений', 'Досвідчений']);
    expect(levelName(99, uk)).toBe('Досвідчений');
    for (const l of LOCALES) for (let i = 1; i <= 5; i++) expect(STRINGS[l]['levelName' + i]).toBeTruthy();
  });

  test('under the slider: the name big, the phrase smaller, nothing about skipping words', async () => {
    const tree = await mount(<LevelBody value={8} onChange={() => {}} lang="es" t={uk} />);
    const box = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'level-name')[0];
    const [name, phrase] = box.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string');
    expect(name.props.children).toBe('Впевнений');
    expect(phrase.props.children).toBe(uk('lvl8'));
    expect(StyleSheet.flatten(name.props.style).fontSize).toBeGreaterThan(StyleSheet.flatten(phrase.props.style).fontSize);
    expect(name.props.accessibilityLiveRegion).toBe('polite');
    // фраза рівня — лише раз (не ще й над доріжкою)
    const hostTexts = tree.root.findAll((n) => typeof n.type === 'string' && n.props.children === uk('lvl8'));
    expect(hostTexts).toHaveLength(1);
    expect(texts(tree).some((x) => /пропускаємо/i.test(x))).toBe(false);
  });

  test('the profile editor has the same steps without subtitles', async () => {
    const tree = await mount(<ProfileEditor profile={{ goals: ['work'], field: 'it', level: 5 }} targetLang="en" onSave={() => {}} onClose={() => {}} t={t} />);
    for (let i = 0; i < 3; i++) {
      expect(tree.root.findByType(StepFrame).props.text).toBeFalsy();
      if (i < 2) await tap(tree, t('obNext'));
    }
  });
});

// ─── Що таке слово дня ─────────────────────────────────────────────────────
describe('what the word of the day is', () => {
  test('an example card in the language you learn, translated into yours, with an example; no network', () => {
    expect(demoExample('de', 'uk')).toEqual({
      word: 'die Tasse',
      ipa: '/diː ˈtasə/',
      translation: 'чашка',
      lang: 'de',
      example: 'In dieser Tasse ist heißer Kaffee.',
      exampleTranslation: 'У цій чашці гаряча кава.',
    });
    // приклад є для кожної з 29 мов
    for (const { code } of LANGS) expect([code, (DEMO_WORDS[code].example || '').trim().length > 5]).toEqual([code, true]);
  });

  test('uk copy is exact', () => {
    expect(uk('obWodTitle')).toBe('Що таке слово дня?');
    expect(uk('obWodText')).toBe('Щодня Лінго підбиратиме тобі одне корисне слово з перекладом, вимовою й прикладом. Під твої цілі й рівень.');
    expect(t('obWodTitle')).toBe('What’s the word of the day?');
  });
});

// ─── Сповіщення ────────────────────────────────────────────────────────────
describe('the push step', () => {
  test('uk copy is exact', () => {
    expect(uk('obPushTitle')).toBe('Обери, коли надсилати тобі слово дня');
    expect(uk('obPushText')).toBe('Змінити можна будь-коли в Параметрах.');
    // заголовки серії й демо — дослівно від власника (жовтень 2026, без тире)
    expect(uk('obStreakTitle')).toBe('Вчи мову кожного дня та рости свій вогник');
    expect(uk('obDemoTitle')).toBe('Скануй предмети навколо й отримай їх переклад за 10 секунд');
  });

  test('the lock screen clock shows the chosen hour, as the iPhone writes it', () => {
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    expect(lockClock(19)).toBe('7:00');
    expect(lockClock(10)).toBe('10:00');
    require('expo-localization').__setLocales(['uk-UA'], { silent: true });
    expect(lockClock(19)).toBe('19:00');
    require('expo-localization').__setLocales(['en-US'], { silent: true });
  });

  test('a phone in a frame: island, clock and the notification with an example word; never cut above the notification', async () => {
    const sample = demoExample('en', 'uk');
    const tree = await mount(<PushPreview topic="Travel" hour="7:00 PM" clock="7:00" sample={sample} width={250} height={100} t={t} />);
    const phone = hostId(tree, 'push-phone')[0];
    // просили 100 — але годинник зі сповіщенням мають бути цілі
    expect(StyleSheet.flatten(phone.props.style).height).toBe(phoneVisible(250));
    expect(has(tree, '7:00')).toBe(true);
    expect(has(tree, 'Word of the day · Travel')).toBe(true);
    expect(has(tree, 'mug · чашка')).toBe(true);
    expect(phone.props.accessibilityLabel).toBe(t('obPushPreviewA11y', { title: 'Word of the day · Travel', h: '7:00 PM' }));
    // заголовок ліг у два рядки — сповіщення нижче: телефон видно до його низу
    const banner = tree.root.findAll((n) => typeof n.type === 'string' && typeof n.props.onLayout === 'function')[0];
    await act(async () => banner.props.onLayout({ nativeEvent: { layout: { x: 9, y: 190, width: 220, height: 96 } } }));
    const bezel = 6; // рамка: 7 × 250 / 270 ≈ 6,5 → 6
    // і згасання внизу лягає лише на шпалери під ним (34 + 6)
    expect(StyleSheet.flatten(hostId(tree, 'push-phone')[0].props.style).height).toBe(bezel + 190 + 96 + 40);
  });

  test('on the step the phone fills the screen down to the button', async () => {
    const tree = await render();
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-en').at(-1).props.onPress());
    await advance(AUTO_MS);
    for (let i = 0; i < 5; i++) await tap(tree, t('obSkip'));
    await tap(tree, t('obNext')); // слово дня
    expect(title(tree)).toBe(t('obPushTitle'));
    const h = () => tree.root.findByType(PushPreview).props.height;
    const before = h();
    const sv = tree.root.findByType(ScrollView);
    await act(async () => {
      sv.props.onLayout({ nativeEvent: { layout: { height: 900 } } });
      sv.props.onContentSizeChange(375, 700);
    });
    // під вмістом (разом із нижнім відступом) ще 200 — їх отримує телефон
    expect(h()).toBe(before + 200);
  });
});

// ─── Демо ──────────────────────────────────────────────────────────────────
describe('the demo', () => {
  test('the scene words exist in all 29 languages and follow the pair', () => {
    expect(Object.keys(SCENE_WORDS).sort()).toEqual(LANGS.map((l) => l.code).sort());
    for (const w of Object.values(SCENE_WORDS)) for (const k of ['laptop', 'plant', 'notebook']) expect(w[k].trim().length).toBeGreaterThan(0);
    expect(demoScene('de', 'uk')).toEqual([
      { key: 'mug', word: 'die Tasse', translation: 'чашка' },
      { key: 'laptop', word: 'der Laptop', translation: 'ноутбук' },
      { key: 'plant', word: 'die Pflanze', translation: 'рослина' },
      { key: 'notebook', word: 'das Notizbuch', translation: 'блокнот' },
    ]);
    expect(demoScene('xx', 'yy').map((x) => x.key)).toEqual(SCENE_KEYS);
  });

  test('the onboarding demo gets the scene, the new title and fills the screen', async () => {
    permissionStatus.mockImplementation(async () => 'granted');
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 440, height: 956, scale: 3, fontScale: 1 });
    const tree = await render({ targetLang: 'es', phoneNative: 'uk' });
    await tap(tree, t('obStart'));
    await act(async () => byId(tree, 'lang-es').at(-1).props.onPress());
    await advance(AUTO_MS);
    for (let i = 0; i < 5; i++) await tap(tree, t('obSkip'));
    await tap(tree, t('obNext')); // слово дня
    await advance(1300);
    await tap(tree, t('obNext')); // план
    await tap(tree, t('obNext')); // серія
    expect(title(tree)).toBe('Scan things around you and get them translated in 10 seconds');
    const demo = () => tree.root.findByType(ScanDemo);
    expect(demo().props.scene).toEqual(demoScene('es', 'uk'));
    expect(hostId(tree, 'demo-tag-plant').length).toBe(1);
    expect(has(tree, 'la planta')).toBe(true);
    const before = demo().props.height;
    const sv = tree.root.findByType(ScrollView);
    await act(async () => {
      sv.props.onLayout({ nativeEvent: { layout: { height: 600 } } });
      sv.props.onContentSizeChange(375, 640);
    });
    // не влазить на 40 — сцена менша на 40
    expect(demo().props.height).toBe(before - 40);
    dims.mockRestore();
  });
});

// ─── Обіцянка ──────────────────────────────────────────────────────────────
test('the promise: Lingo encourages beside the title, the ring stays the main thing', async () => {
  const tree = await render({ draft: { v: 3, at: Date.now() - 1000, phase: 'commit', variant: 'control', push: true, hour: 10 } });
  expect(title(tree)).toBe(t('obCommitTitle'));
  const l = lingo(tree, 'commit-lingo');
  expect(l.props.pose).toBe('encourage');
  expect(l.props.size).toBeLessThan(100);
  expect(hostId(tree, 'hold-to-commit').length).toBeGreaterThan(0);
});

// ─── Живий Лінго ───────────────────────────────────────────────────────────
describe('MascotLive', () => {
  test('hops on a new choice, waves after it appears, breathes after; reduce motion keeps it still', async () => {
    const timing = jest.spyOn(Animated, 'timing');
    const loop = jest.spyOn(Animated, 'loop');
    try {
      const tree = await mount(<MascotLive pose="wave" size={80} hop="a" enter="hop" waves={2} />);
      const waves = timing.mock.calls.length;
      expect(waves).toBeGreaterThanOrEqual(2 * 2);
      await act(async () => tree.update(<MascotLive pose="wave" size={80} hop="b" enter="hop" waves={2} />));
      expect(timing.mock.calls.length).toBe(waves + 1);
      await advance(5000);
      expect(loop).toHaveBeenCalled();

      timing.mockClear();
      loop.mockClear();
      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
      const still = await mount(<MascotLive pose="think" size={80} hop="a" enter="hop" waves={2} />);
      await act(async () => still.update(<MascotLive pose="think" size={80} hop="b" enter="hop" waves={2} />));
      await advance(5000);
      // у тиші: ні підскоку, ні помаху, ні дихання, і Лінго видно повністю
      const img = still.root.findAll((n) => n.props.source !== undefined && n.props.style)[0];
      const st = StyleSheet.flatten(img.props.style);
      expect(st.opacity.__getValue()).toBe(1);
      expect(st.transform[0].translateY.__getValue()).toBe(0);
      expect(st.transform[1].rotate.__getValue()).toBe('0deg');
    } finally {
      timing.mockRestore();
      loop.mockRestore();
      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
    }
  });
});

// Рядок тем на екрані «Збираємо план»: абревіатури не стають «іт»
test('plan topics line keeps acronyms upper-case and lower-cases ordinary topics', () => {
  const p = { goals: ['work'], field: 'it', level: 6 };
  const ukLine = topicsLine(p, uk, 'uk');
  expect(ukLine).toContain(uk('topic_it'));
  expect(ukLine).not.toContain(uk('topic_it').toLocaleLowerCase('uk'));
  const travel = topicsLine({ goals: ['travel'], level: 6 }, uk, 'uk');
  expect(travel).toContain(uk('topic_travel').toLocaleLowerCase('uk'));
  const enLine = topicsLine(p, t, 'en');
  expect(enLine).toContain(t('topic_it').toLocaleLowerCase('en'));
});
