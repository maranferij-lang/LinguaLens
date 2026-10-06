// Демо онбордингу «скан → наліпка → слово → сцена» (onboarding.md §6,
// онбординг 4.0): чиста функція demoAt(ms) на межах етапів, монотонність
// обведення й польоту, слово для всіх 29 мов, і сама анімація: один цикл не
// довший за ~11 с і стоп на фіналі, тап — одразу фінал, «Ще раз» — ще цикл,
// дотики лише в першому циклі, «Менше руху» — два статичні кадри (предмет
// і сцена).
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import ScanDemo, { sceneScale } from '../src/ScanDemo';
import { BEATS, DEMO_LOOP_MS, DEMO_LOOPS, STATIC_FRAMES, TRACKS, arcPoint, demoAt, rangeOf, trackAt } from '../src/demoTimeline';
import { DEMO_WORDS, demoPair, demoScene } from '../src/demoWords';
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
  // Власник: демо — не довше ~11 с; предмет, потім уся сцена
  test('one loop of at most ~11 s, five beats: object, cut out, into the list, the scene, the final', () => {
    expect(DEMO_LOOP_MS).toBeLessThanOrEqual(11000);
    expect(DEMO_LOOP_MS * DEMO_LOOPS).toBeLessThanOrEqual(11000);
    expect(DEMO_LOOPS).toBe(1);
    expect(BEATS).toEqual([0, 1800, 4800, 6500, 9500]);
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
    expect(demoAt(5800)).toMatchObject({ lit: 0 });
    expect(demoAt(6050)).toMatchObject({ lit: 1, mode: 0 });
    // сцена: перемикач їде на «Сцену», кути охоплюють увесь стіл, спалах,
    // і підписи спливають по черзі
    expect(demoAt(6500)).toMatchObject({ beat: 3, mode: 0, modeX: 0, corners: 1, wide: 0, tag0: 0 });
    expect(demoAt(7050)).toMatchObject({ mode: 1, modeX: 1 });
    expect(demoAt(7200)).toMatchObject({ corners: 0, wide: 1 });
    expect(demoAt(7340)).toMatchObject({ flash: 0.6 });
    expect(demoAt(7550)).toMatchObject({ tag0: 0, tag1: 0 });
    expect(demoAt(8060)).toMatchObject({ tag0: 1, tag2: 0.85 });
    expect(demoAt(8700)).toMatchObject({ tag0: 1, tag1: 1, tag2: 1, tag3: 1 });
    expect(demoAt(9500)).toMatchObject({ beat: 4, final: 0 });
    // фінал — уся сцена з підписами й «Ще раз», без перемикача
    expect(demoAt(DEMO_LOOP_MS)).toMatchObject({ beat: 4, final: 1, lit: 1, count: 1, deskMug: 1, wide: 1, corners: 0, mode: 0, tag3: 1, sticker: 0 });
    // за межами — як на краях
    expect(demoAt(-5)).toEqual(demoAt(0));
    expect(demoAt(99999)).toEqual(demoAt(DEMO_LOOP_MS));
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
      tree = create(
        <ScanDemo pair={demoPair('es', 'uk')} scene={demoScene('es', 'uk')} t={props.t || t} width={342} height={420} onFinal={onFinal} onAction={onAction} {...props} />
      );
    });
    await act(async () => {});
    return { tree, onFinal, onAction };
  }
  const caption = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'demo-caption').props.children;
  const scene = (tree) => tree.root.findAll((n) => n.props.testID === 'scan-demo' && typeof n.props.onPress === 'function')[0];
  const plate = (tree) => tree.root.find((n) => typeof n.type === 'string' && n.props.testID === 'demo-plate');

  test('the scene: four labelled things in the language you learn, translated into yours', async () => {
    const { tree } = await render();
    for (const [key, word, tr] of [
      ['mug', 'la taza', 'чашка'],
      ['laptop', 'el portátil', 'ноутбук'],
      ['plant', 'la planta', 'рослина'],
      ['notebook', 'el cuaderno', 'блокнот'],
    ]) {
      const tag = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'demo-tag-' + key)[0];
      const words = tag.findAll((n) => typeof n.type === 'string' && typeof n.props.children === 'string').map((n) => n.props.children);
      expect([key, words]).toEqual([key, [word, tr]]);
    }
    expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'demo-mode')).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  test('the plate speaks the chosen pair; VoiceOver hears one sentence with it', async () => {
    const { tree } = await render({ t: uk });
    expect(plate(tree).props.accessibilityLabel).toBe('Español, la taza, чашка');
    expect(scene(tree).props.accessibilityLabel).toBe(uk('obDemoA11y', { word: 'la taza', tr: 'чашка' }));
    expect(scene(tree).props.accessibilityRole).toBe('image');
    await act(async () => tree.unmount());
  });

  test('one loop, then it stops on the final frame; captions follow the beats, the scene among them', async () => {
    const { tree, onFinal } = await render();
    expect(caption(tree)).toBe(t('obDemoBeat1'));
    await advance(1900);
    expect(caption(tree)).toBe(t('obDemoBeat2'));
    await advance(3000);
    expect(caption(tree)).toBe(t('obDemoBeat3'));
    await advance(1800);
    expect(caption(tree)).toBe(t('obDemoBeat4'));
    expect(t('obDemoBeat4')).toBe('Or a whole scene, every word at once');
    expect(uk('obDemoBeat4')).toBe('Або цілу сцену з усіма словами одразу');
    await advance(3000);
    expect(caption(tree)).toBe(t('obDemoFinal'));
    expect(onFinal).not.toHaveBeenCalled();
    await advance(DEMO_LOOP_MS - 9700 + 50);
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

  test('reduce motion: two still frames side by side — the object and the whole scene — each with its beat, no haptics', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const { tree } = await render({ width: 327, height: 230 });
    expect(STATIC_FRAMES.map((f) => f.beat)).toEqual([1, 3]);
    for (const b of [1, 3]) expect(tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'demo-frame-' + b)).toHaveLength(1);
    const texts = tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
    for (const k of ['obDemoBeat2', 'obDemoBeat4']) expect(texts).toContain(t(k));
    // наліпка з табличкою і кадр сцени — з підписами предметів
    expect(demoAt(STATIC_FRAMES[0].at)).toMatchObject({ beat: 1, plate: 1, sticker: 1 });
    expect(demoAt(STATIC_FRAMES[1].at)).toMatchObject({ beat: 3, tag0: 1, tag3: 1, wide: 1 });
    expect(texts).toContain('la planta');
    // на SE кожен кадр — не дрібніший за ~150 pt завширшки
    const frame = tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'demo-frame-1')[0];
    expect(frame.props.style.width).toBeGreaterThanOrEqual(150);
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
