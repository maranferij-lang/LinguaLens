// Історія сцен: кожна вдала сцена лишається на телефоні, щоб нею можна
// було поділитися ще раз або дозберегти слова пізніше.
//
// Фото сцени (1080×1920) копіюємо в Documents/scenes/<id>.jpg і тримаємо
// ВІДНОСНИЙ шлях — з тієї ж причини, що й наліпки (див. src/photos.js):
// кеш iOS чиститься будь-коли, а абсолютний шлях до контейнера змінюється
// після кожного оновлення з App Store. Список — в AsyncStorage, найновіші
// першими, не більше MAX_SCENES: старі сцени тихо йдуть разом із файлами,
// інакше кожна сцена назавжди забирала б пів мегабайта.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { photoUri } from '../photos';

export const SCENES_KEY = 'll_scenes_v1';
export const MAX_SCENES = 40;
const DIR = 'scenes';

// На вебі (прев'ю верстки) файлової системи немає — там лишаємо
// тимчасовий URI як є і не чіпаємо expo-file-system зовсім.
const HAS_FS = Platform.OS !== 'web';

export function newSceneId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export async function loadScenes() {
  try {
    const raw = await AsyncStorage.getItem(SCENES_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((s) => s && s.id && s.image && Array.isArray(s.objects)) : [];
  } catch (_) {
    return [];
  }
}

export async function persistScenes(list) {
  try {
    await AsyncStorage.setItem(SCENES_KEY, JSON.stringify(list));
  } catch (_) {}
}

// Тимчасове фото → Documents/scenes/<id>.jpg. Не вийшло скопіювати —
// лишаємо тимчасовий URI: сцена в історії, що колись втратить фото, краща
// за сцену, якої немає зовсім.
function storeImage(id, tempUri) {
  if (!HAS_FS || !tempUri) return tempUri;
  try {
    const dir = new Directory(Paths.document, DIR);
    dir.create({ idempotent: true });
    const name = id + '.jpg';
    new File(tempUri).copySync(new File(dir, name));
    return DIR + '/' + name;
  } catch (_) {
    return tempUri;
  }
}

function deleteImage(stored) {
  if (!HAS_FS || !stored || stored.includes(':')) return;
  try {
    const f = new File(Paths.document, ...stored.split('/'));
    if (f.exists) f.delete();
  } catch (_) {}
}

// Чи є вже це слово в словнику: те саме написання (без огляду на регістр)
// тією самою мовою. Сцена й App питають однаково, тож «У словнику» на
// екрані сцени й пропущені при збереженні дублікати завжди збігаються.
export function hasWord(words, w) {
  const key = String(w?.word || '').trim().toLowerCase();
  const lang = w?.lang || 'en';
  return (words || []).some((x) => String(x.word || '').trim().toLowerCase() === key && (x.lang || 'en') === lang);
}

// Збережене значення → URI для <Image>. data: і повні URI — як є.
export function sceneImageUri(scene) {
  const stored = scene?.image;
  if (!stored) return null;
  if (stored.includes(':')) return stored;
  try {
    return photoUri(stored);
  } catch (_) {
    return null;
  }
}

// Нова сцена на початок списку. Фото копіюється тут же; сцени понад стелю
// відпадають разом зі своїми файлами. Повертає новий список і збережений
// запис (уже з відносним шляхом). Записати список — persistScenes.
export function addScene(list, scene) {
  const stored = { ...scene, image: storeImage(scene.id, scene.image) };
  const next = [stored, ...(list || []).filter((s) => s.id !== scene.id)];
  for (const gone of next.slice(MAX_SCENES)) deleteImage(gone.image);
  return { list: next.slice(0, MAX_SCENES), scene: stored };
}

export function removeScene(list, id) {
  const gone = (list || []).find((s) => s.id === id);
  if (gone) deleteImage(gone.image);
  return (list || []).filter((s) => s.id !== id);
}

export function updateScene(list, id, patch) {
  return (list || []).map((s) => (s.id === id ? { ...s, ...patch } : s));
}

// «Стерти все» і «Очистити словник»: список і вся тека разом, включно з
// файлами, які могли лишитися від перерваного збереження.
export async function clearScenes() {
  try {
    await AsyncStorage.removeItem(SCENES_KEY);
  } catch (_) {}
  if (!HAS_FS) return;
  try {
    const dir = new Directory(Paths.document, DIR);
    if (dir.exists) dir.delete();
  } catch (_) {}
}
