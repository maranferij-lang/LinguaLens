// Фото-наліпки збережених слів.
//
// ImageManipulator кладе вирізаний предмет у кеш, який iOS може очистити
// будь-коли. Гірше того: абсолютний шлях до контейнера застосунку
// (…/Application/<UUID>/…) змінюється після кожного оновлення з App Store.
// Тож якщо зберегти в слові повний URI з кешу, після першого ж апдейту всі
// наліпки в словнику зникнуть.
//
// Тому збережене слово тримає ВІДНОСНИЙ шлях усередині Documents
// ('stickers/abc.jpg'), а повний URI збирається в момент показу.
import { Directory, File, Paths } from 'expo-file-system';

const DIR = 'stickers';

let base = null;
function documentBase() {
  if (base === null) {
    const uri = Paths.document.uri;
    base = uri.endsWith('/') ? uri : uri + '/';
  }
  return base;
}

// Тимчасовий файл → постійна копія в Documents. Повертає відносний шлях.
// Якщо скопіювати не вдалося, лишаємо тимчасовий URI: краще наліпка, що
// колись зникне, ніж жодної.
export function persistPhoto(tempUri) {
  if (!tempUri) return null;
  try {
    const dir = new Directory(Paths.document, DIR);
    dir.create({ idempotent: true });
    const name = Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + '.jpg';
    // copySync: з SDK 56 copy() асинхронний, а шлях ми повертаємо одразу
    new File(tempUri).copySync(new File(dir, name));
    return DIR + '/' + name;
  } catch (_) {
    return tempUri;
  }
}

// Збережене значення → URI для <Image>. Старі записи з повним шляхом
// повертаються як є.
export function photoUri(stored) {
  if (!stored) return null;
  if (stored.includes('://')) return stored;
  return documentBase() + stored;
}

// Прибирає файл разом зі словом, щоб Documents не розросталися.
export function deletePhoto(stored) {
  if (!stored || stored.includes('://')) return;
  try {
    const f = new File(Paths.document, ...stored.split('/'));
    if (f.exists) f.delete();
  } catch (_) {}
}
