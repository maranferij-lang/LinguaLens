// Досягнення: кожне має свою іконку й назву, а нові «сценічні» рахуються зі
// статистики сцен, а не зі збережених слів.
import { ACHIEVEMENTS, computeMetrics, evaluate, newlyUnlocked } from '../src/achievements';
import { ACH_ICONS } from '../src/AchIcons';

const byId = (list, id) => list.find((a) => a.id === id);

test('every achievement has its own icon and nothing else does', () => {
  expect(Object.keys(ACH_ICONS).sort()).toEqual(ACHIEVEMENTS.map((a) => a.id).sort());
  expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
});

test('scene achievements follow the number of successful scenes', () => {
  const at = (scenes) => evaluate(computeMetrics({ stats: { scenes } }));
  expect(byId(at(0), 'scene_first').unlocked).toBe(false);
  expect(byId(at(1), 'scene_first').unlocked).toBe(true);
  expect(byId(at(1), 'scenes_10')).toMatchObject({ unlocked: false, progress: 0.1, value: 1 });
  expect(byId(at(10), 'scenes_10').unlocked).toBe(true);
  expect(byId(at(25), 'scenes_10').progress).toBe(1);
});

test('saving words from a scene does not count as a scene by itself', () => {
  const words = [{ word: 'mug', sceneId: 'a', photo: 'x' }];
  expect(computeMetrics({ words }).scenes).toBe(0);
});

test('the first scene is celebrated once', () => {
  const evaluated = evaluate(computeMetrics({ stats: { scenes: 1 } }));
  expect(newlyUnlocked(evaluated, []).map((a) => a.id)).toContain('scene_first');
  expect(newlyUnlocked(evaluated, ['scene_first']).map((a) => a.id)).not.toContain('scene_first');
});
