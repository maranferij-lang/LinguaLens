// Історія сцен: фото лежить у Documents під відносним шляхом, список
// тримає не більше 40 сцен, а старі й видалені йдуть разом із файлами.
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MAX_SCENES,
  SCENES_KEY,
  addScene,
  clearScenes,
  hasWord,
  loadScenes,
  persistScenes,
  removeScene,
  sceneImageUri,
  updateScene,
} from '../src/scene/scenes';
import { clearLocalData } from '../src/storage';

// Файлова система в пам'яті: лише те, чим користуються scenes.js і photos.js.
jest.mock('expo-file-system', () => {
  const files = new Set();
  const dirs = new Set();
  const uriOf = (parts) => parts.map((p) => (typeof p === 'string' ? p : p.uri)).join('/');
  class File {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return files.has(this.uri);
    }
    copySync(dest) {
      if (!files.has(this.uri)) throw new Error('No such file: ' + this.uri);
      files.add(dest.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    delete() {
      for (const f of [...files]) if (f.startsWith(this.uri + '/')) files.delete(f);
      dirs.delete(this.uri);
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __files: files };
});

const files = require('expo-file-system').__files;

const scene = (id, extra = {}) => ({
  id,
  image: `file:///cache/${id}.jpg`,
  width: 1080,
  height: 1920,
  lang: 'en',
  nativeLang: 'uk',
  createdAt: 1000,
  objects: [{ key: 'o0', word: 'mug', translation: 'кружка', box: [1, 2, 3, 4], outline: null }],
  hidden: [],
  ...extra,
});

// Тимчасовий файл, який щойно записав ImageManipulator
function shot(id) {
  files.add(`file:///cache/${id}.jpg`);
  return scene(id);
}

beforeEach(async () => {
  files.clear();
  await AsyncStorage.clear();
});

test('a new scene is copied into Documents and stored under a relative path, newest first', () => {
  let { list, scene: stored } = addScene([], shot('a'));
  expect(stored.image).toBe('scenes/a.jpg');
  expect(files.has('file:///doc/scenes/a.jpg')).toBe(true);
  ({ list } = addScene(list, shot('b')));
  expect(list.map((s) => s.id)).toEqual(['b', 'a']);
  // повна адреса збирається в момент показу
  expect(sceneImageUri(list[1])).toBe('file:///doc/scenes/a.jpg');
});

test('beyond the cap the oldest scenes go away together with their photos', () => {
  let list = [];
  for (let i = 0; i < MAX_SCENES + 2; i++) list = addScene(list, shot('s' + i)).list;
  expect(list).toHaveLength(MAX_SCENES);
  expect(list[0].id).toBe('s' + (MAX_SCENES + 1));
  expect(list[list.length - 1].id).toBe('s2');
  expect(files.has('file:///doc/scenes/s0.jpg')).toBe(false);
  expect(files.has('file:///doc/scenes/s1.jpg')).toBe(false);
  expect(files.has('file:///doc/scenes/s2.jpg')).toBe(true);
});

test('adding the same scene again replaces it instead of duplicating', () => {
  let { list } = addScene([], shot('a'));
  ({ list } = addScene(list, shot('a')));
  expect(list).toHaveLength(1);
});

test('if the copy fails the scene keeps its temporary photo rather than none', () => {
  const { scene: stored } = addScene([], scene('lost')); // файлу в кеші немає
  expect(stored.image).toBe('file:///cache/lost.jpg');
  expect(sceneImageUri(stored)).toBe('file:///cache/lost.jpg');
});

test('deleting a scene removes its photo; other scenes stay', () => {
  let { list } = addScene([], shot('a'));
  ({ list } = addScene(list, shot('b')));
  list = removeScene(list, 'a');
  expect(list.map((s) => s.id)).toEqual(['b']);
  expect(files.has('file:///doc/scenes/a.jpg')).toBe(false);
  expect(files.has('file:///doc/scenes/b.jpg')).toBe(true);
  expect(removeScene(list, 'nope')).toEqual(list);
});

test('hidden labels are a patch on one scene', () => {
  const list = [scene('a'), scene('b')];
  const next = updateScene(list, 'b', { hidden: ['o0'] });
  expect(next[1].hidden).toEqual(['o0']);
  expect(next[0]).toBe(list[0]);
});

test('the list survives a restart; broken entries and broken JSON are dropped', async () => {
  await persistScenes([scene('a'), { id: 'x' }, null, scene('b')]);
  expect((await loadScenes()).map((s) => s.id)).toEqual(['a', 'b']);
  await AsyncStorage.setItem(SCENES_KEY, '{oops');
  expect(await loadScenes()).toEqual([]);
  await AsyncStorage.setItem(SCENES_KEY, JSON.stringify({ not: 'a list' }));
  expect(await loadScenes()).toEqual([]);
});

test('clearing removes the list and every file in the folder, orphans included', async () => {
  const { list } = addScene([], shot('a'));
  await persistScenes(list);
  files.add('file:///doc/scenes/orphan.jpg');
  files.add('file:///doc/stickers/keep.jpg');
  await clearScenes();
  expect(await AsyncStorage.getItem(SCENES_KEY)).toBeNull();
  expect([...files].filter((f) => f.includes('/scenes/'))).toEqual([]);
  expect(files.has('file:///doc/stickers/keep.jpg')).toBe(true);
});

test('erasing local data clears scenes too', async () => {
  const { list } = addScene([], shot('a'));
  await persistScenes(list);
  await AsyncStorage.setItem('ll_words_v1', '[]');
  await clearLocalData();
  expect(await AsyncStorage.getItem(SCENES_KEY)).toBeNull();
  expect(files.has('file:///doc/scenes/a.jpg')).toBe(false);
});

test('photo URIs that are already complete are used as they are', () => {
  expect(sceneImageUri({ image: 'data:image/jpeg;base64,AAA' })).toBe('data:image/jpeg;base64,AAA');
  expect(sceneImageUri({ image: 'blob:http://localhost/x' })).toBe('blob:http://localhost/x');
  expect(sceneImageUri({})).toBeNull();
  expect(sceneImageUri(null)).toBeNull();
});

test('a word counts as saved when the spelling and the language match', () => {
  const words = [{ word: 'Mug', lang: 'en' }, { word: 'la taza', lang: 'es' }, { word: 'chair' }];
  expect(hasWord(words, { word: ' mug ', lang: 'en' })).toBe(true);
  expect(hasWord(words, { word: 'mug', lang: 'de' })).toBe(false);
  expect(hasWord(words, { word: 'chair', lang: 'en' })).toBe(true); // старе слово без lang — англійське
  expect(hasWord(words, { word: 'cup', lang: 'en' })).toBe(false);
  expect(hasWord(undefined, { word: 'mug' })).toBe(false);
});
