// Демо онбордингу «скан → наліпка → слово → серія» (onboarding.md §6):
// чиста функція demoAt(ms) на межах етапів, монотонність обведення й
// польоту, слово для всіх 29 мов, і сама анімація: два цикли й стоп на
// фіналі, тап — одразу фінал, «Ще раз» — ще цикл, дотики лише в першому
// циклі, «Менше руху» — три статичні кадри.
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import ScanDemo, { sceneScale } from '../src/ScanDemo';
import { BEATS, DEMO_LOOP_MS, DEMO_LOOPS, STATIC_FRAMES, TRACKS, arcPoint, demoAt, rangeOf, trackAt } from '../src/demoTimeline';
import { DEMO_WORDS, demoPair } from '../src/demoWords';
import { LANGS } from '../src/speech';
import { makeT } from '../src/i18n';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Soft: 'soft', Rigid: 'rigid' },
  NotificationFeedbackType: { Success: 'success' },
}));

const t = makeT('en');
const uk = makeT('uk');

describe('the timeline', () => {
  test('8.5 s a loop, two loops, four beats', () => {
    expect(DEMO_LOOP_MS).toBe(8500);
    expect(DEMO_LOOPS).toBe(2);
    expect(BEATS).toEqual([0, 1800, 4800, 7000]);
  });

  test('every beat boundary', () => {
    expect(demoAt(0)).toMatchObject({ beat: 0, flash: 0, outline: 0, sticker: 0, deskMug: 1, corners: 1, shutter: 1, count: 0, lit: 0, final: 0 });
    expect(demoAt(1200)).toMatchObject({ beat: 0, flash: 0, press: 0 });
    expect(demoAt(1240)).toMatchObject({ flash: 0.72, press: 1 });
    expect(demoAt(1440)).toMatchObject({ flash: 0, press: 0 });
    expect(demoAt(1800)).toMatchObject({ beat: 1, outline: 0, sweep: 0 });
    expect(demoAt(2700)).toMatchObject({ outline: 1, sweep: 1 });
    expect(demoAt(3000)).toMatchObject({ beat: 1, peel: 0, sticker: 1, deskMug: 0, outline: 0, shutter: 0 });
    expect(demoAt(3600)).toMatchObject({ peel: 1, dim: 0.45 });
    expect(demoAt(3800)).toMatchObject({ plate: 0 });
    expect(demoAt(4100)).toMatchObject({ plate: 1 });
    expect(demoAt(4800)).toMatchObject({ beat: 2, fly: 0 });
    expect(demoAt(5600)).toMatchObject({ fly: 1, count: 1, sticker: 0 });
    expect(demoAt(5800)).toMatchObject({ lit: 0, flame: 0 });
    expect(demoAt(6050)).toMatchObject({ lit: 1, flame: 1 });
    expect(demoAt(7000)).toMatchObject({ beat: 3, final: 0, flame: 0 });
    expect(demoAt(8500)).toMatchObject({ beat: 3, final: 1, lit: 1, count: 1, deskMug: 1, corners: 1, sticker: 0 });
    // за межами — як на краях
    expect(demoAt(-5)).toEqual(demoAt(0));
    expect(demoAt(99999)).toEqual(demoAt(8500));
  });

  test('the outline only grows while it is drawn; the flight only moves forward', () => {
    let prev = -1;
    for (let ms = 1800; ms <= 2990; ms += 10) {
      const v = trackAt('outline', ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    prev = -1;
    for (let ms = 4800; ms <= DEMO_LOOP_MS; ms += 10) {
      const v = trackAt('fly', ms);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    // дуга польоту: від чашки до чипа «Мої слова» в лівому верхньому куті
    expect(arcPoint(0)).toEqual({ x: 0, y: 0 });
    expect(arcPoint(1).x).toBeLessThan(-100);
    expect(arcPoint(1).y).toBeLessThan(-200);
  });

  test('every track fits Animated.interpolate: inside the loop and never going back in time', () => {
    for (const k of Object.keys(TRACKS)) {
      const { inputRange } = rangeOf(k);
      expect(inputRange[0]).toBe(0);
      expect(inputRange.at(-1)).toBe(DEMO_LOOP_MS);
      for (let i = 1; i < inputRange.length; i++) expect(inputRange[i]).toBeGreaterThanOrEqual(inputRange[i - 1]);
    }
  });
});

describe('the demo word', () => {
  test('a mug in all 29 languages, never empty', () => {
    expect(Object.keys(DEMO_WORDS).sort()).toEqual(LANGS.map((l) => l.code).sort());
    for (const w of Object.values(DEMO_WORDS)) expect(w.word.trim().length).toBeGreaterThan(0);
  });

  test('the word in the language you learn, the translation in yours, IPA only from the learnt language', () => {
    expect(demoPair('en', 'uk')).toEqual({ word: 'mug', ipa: '/mʌɡ/', translation: 'чашка', lang: 'en' });
    expect(demoPair('es', 'en')).toEqual({ word: 'la taza', ipa: '/la ˈta.θa/', translation: 'mug', lang: 'es' });
    expect(demoPair('uk', 'en')).toEqual({ word: 'чашка', ipa: '', translation: 'mug', lang: 'uk' });
    expect(demoPair('ja', 'de')).toMatchObject({ word: 'マグカップ', translation: 'die Tasse' });
  });
});

describe('the animation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  });
  afterEach(() => jest.useRealTimers());

  const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
  async function render(props = {}) {
    const onFinal = jest.fn();
    const onAction = jest.fn();
    let tree;
    await act(async () => {
      tree = create(<ScanDemo pair={demoPair('es', 'uk')} t={props.t || t} width={342} height={420} onFinal={onFinal} onAction={onAction} {...props} />);
    });
    await act(async () => {});
    return { tree, onFinal, onAction };
  }
  const caption = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'demo-caption').props.children;
  const scene = (tree) => tree.root.findAll((n) => n.props.testID === 'scan-demo' && typeof n.props.onPress === 'function')[0];
  const plate = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'demo-plate');

  test('the plate speaks the chosen pair; VoiceOver hears one sentence with it', async () => {
    const { tree } = await render({ t: uk });
    expect(plate(tree).props.accessibilityLabel).toBe('Español, la taza, чашка');
    expect(scene(tree).props.accessibilityLabel).toBe(uk('obDemoA11y', { word: 'la taza', tr: 'чашка' }));
    expect(scene(tree).props.accessibilityRole).toBe('image');
    await act(async () => tree.unmount());
  });

  test('two loops, then it stops on the final frame; captions follow the beats', async () => {
    const { tree, onFinal } = await render();
    expect(caption(tree)).toBe(t('obDemoBeat1'));
    await advance(1900);
    expect(caption(tree)).toBe(t('obDemoBeat2'));
    await advance(3000);
    expect(caption(tree)).toBe(t('obDemoBeat3'));
    await advance(2200);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    expect(onFinal).not.toHaveBeenCalled();
    await advance(DEMO_LOOP_MS - 7100 + 50);
    // другий цикл
    expect(caption(tree)).toBe(t('obDemoBeat1'));
    await advance(DEMO_LOOP_MS);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    // і більше нічого не рухається
    await advance(DEMO_LOOP_MS * 2);
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    // дотики — лише в першому циклі
    expect(Haptics.impactAsync.mock.calls.map(([s]) => s)).toEqual(['soft', 'light']);
    await act(async () => tree.unmount());
  });

  test('a tap on the scene skips straight to the final frame; “Replay” plays one more loop', async () => {
    const { tree, onFinal, onAction } = await render();
    await advance(1000);
    await act(async () => scene(tree).props.onPress());
    expect(onAction).toHaveBeenCalledWith('skip_anim');
    expect(onFinal).toHaveBeenCalledTimes(1);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    const replay = tree.root.findAll((n) => n.props.testID === 'demo-replay' && typeof n.props.onPress === 'function')[0];
    await act(async () => replay.props.onPress());
    expect(onAction).toHaveBeenCalledWith('replay');
    expect(caption(tree)).toBe(t('obDemoBeat1'));
    await advance(DEMO_LOOP_MS + 50);
    expect(onFinal).toHaveBeenCalledTimes(2);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    await act(async () => tree.unmount());
  });

  test('reduce motion: three still frames side by side, each with its beat, no haptics', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const { tree } = await render();
    expect(STATIC_FRAMES).toHaveLength(3);
    for (let i = 0; i < 3; i++) expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'demo-frame-' + i)).toHaveLength(1);
    const texts = tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
    for (const k of ['obDemoBeat1', 'obDemoBeat2', 'obDemoBeat3']) expect(texts).toContain(t(k));
    await advance(DEMO_LOOP_MS * 3);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('the scene shrinks to fit a small phone, never grows past its size', () => {
    expect(sceneScale(327, 300)).toBeCloseTo(300 / 420);
    expect(sceneScale(800, 900)).toBe(1);
    expect(sceneScale(200, 900)).toBeCloseTo(200 / 342);
  });
});
