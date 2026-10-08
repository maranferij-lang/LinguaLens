// Полірування онбордингу, рух (аудит 8.10.2026): предмети на вітанні плавають
// без зупинок, картка-приклад слова дня не пружинить. Правила руху: src/motion.js.
import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { act, create } from 'react-test-renderer';
import { WelcomeHero, WodExample } from '../src/OnboardingParts';
import { demoExample } from '../src/demoWords';
import { SPRING } from '../src/motion';
import { makeT } from '../src/i18n';

const t = makeT('en');

beforeEach(() => {
  jest.useFakeTimers();
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});

const mounted = [];
const spies = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  while (spies.length) spies.pop().mockRestore();
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

// Стежимо за будовою анімацій: що з чого складено (sequence), що крутиться
// в циклі (loop), які затримки (delay) і півцикли (timing на 1600 мс)
function watchAnimated() {
  const lists = new Map();
  const delays = new Map();
  const halves = new Set();
  const loopOf = new Map();
  const wrap = (name, fn) => {
    const real = Animated[name];
    const spy = jest.spyOn(Animated, name).mockImplementation((...args) => {
      const out = real(...args);
      fn(out, args);
      return out;
    });
    spies.push(spy);
  };
  wrap('sequence', (out, [list]) => lists.set(out, list));
  wrap('delay', (out, [ms]) => delays.set(out, ms));
  wrap('timing', (out, [, cfg]) => cfg.duration === 1600 && halves.add(out));
  wrap('loop', (out, [anim]) => loopOf.set(out, anim));
  return { lists, delays, halves, loopOf };
}

describe('welcome: the floating objects', () => {
  test('the phase shift runs once before the loop, not inside it (no stop at the bottom every cycle)', async () => {
    const w = watchAnimated();
    await mount(<WelcomeHero size={200} />);
    // цикли предметів: sequence з двох півциклів по 1600 мс (інші цикли — дихання Лінго)
    const body = (loop) => w.loopOf.get(loop);
    const isFloaterBody = (a) => {
      const list = w.lists.get(a);
      return !!list && list.length === 2 && list.every((x) => w.halves.has(x));
    };
    const floaterLoops = [...w.loopOf.keys()].filter((l) => isFloaterBody(body(l)));
    expect(floaterLoops).toHaveLength(3);
    // у циклі немає жодної затримки
    for (const l of floaterLoops) expect(w.lists.get(body(l)).some((x) => w.delays.has(x))).toBe(false);
    // зсув фази стоїть перед циклом: sequence [delay, loop] для кожного з трьох
    const phases = [...w.lists.values()]
      .filter((list) => list.length === 2 && w.delays.has(list[0]) && floaterLoops.includes(list[1]))
      .map((list) => w.delays.get(list[0]));
    expect(phases.sort((a, b) => a - b)).toEqual([0, 520, 1040]);
  });

  test('every object has the same period: two half-cycles of 1600 ms', async () => {
    const w = watchAnimated();
    await mount(<WelcomeHero size={200} />);
    // 3 предмети × 2 півцикли = 6 timing по 1600 мс, і жодного з іншою тривалістю в циклі предмета
    expect(w.halves.size).toBe(6);
  });
});

describe('word of the day: the example card', () => {
  const sample = demoExample('de', 'uk');

  test('appears with a critically damped spring (nothing was dragged, so no overshoot)', async () => {
    const spring = jest.spyOn(Animated, 'spring');
    spies.push(spring);
    await mount(<WodExample sample={sample} t={t} />);
    expect(spring).toHaveBeenCalledTimes(1);
    const cfg = spring.mock.calls[0][1];
    expect(cfg).toMatchObject({
      toValue: 1,
      delay: 220,
      stiffness: SPRING.ui.stiffness,
      damping: SPRING.ui.damping,
      mass: SPRING.ui.mass,
      useNativeDriver: true,
    });
    // коефіцієнт демпфування ≥ 1: значення не перевищить 1
    expect(cfg.damping / (2 * Math.sqrt(cfg.stiffness * cfg.mass))).toBeGreaterThanOrEqual(0.999);
  });

  test('Reduce Motion: no spring, only a short fade', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    // перший монтаж лише прогріває кеш «Менше руху»
    await mount(<WodExample sample={sample} t={t} />);
    const spring = jest.spyOn(Animated, 'spring');
    const timing = jest.spyOn(Animated, 'timing');
    spies.push(spring, timing);
    await mount(<WodExample sample={sample} t={t} />);
    expect(spring).not.toHaveBeenCalled();
    expect(timing).toHaveBeenCalledTimes(1);
    expect(timing.mock.calls[0][1]).toMatchObject({ toValue: 1, useNativeDriver: true });
  });
});
