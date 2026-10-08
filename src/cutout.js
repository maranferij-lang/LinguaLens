// Вирізання з кадру: наліпка одного предмета і кадр сцени 9:16.
//
// Спільне для обох режимів сканера. Уся геометрія (куди різати, як
// перерахувати рамку й силует) — чисті функції, їх перевіряє jest без
// камери; ImageManipulator торкаються лише кілька асинхронних обгорток.
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

// Наліпка зберігається 600 px: на картці «поділитись» (1080×1920) вона
// займає близько половини ширини і має лишатись чіткою.
export const STICKER_PX = 600;

// Трохи повітря навколо предмета, щоб маска не зрізала контур. Той самий
// запас знає stickerGeometry.silhouette для старих слів без shape.
const PAD = 0.06;

// Рендерить ланцюжок ImageManipulator і зберігає файл. Нативні об'єкти
// звільняємо завжди — повнорозмірний кадр у пам'яті займає десятки МБ.
// release викликаємо через `?.()`: заглушка чи старіша збірка без нього не
// має перетворювати вдалий рендер на помилку (так само робить widgets/thumbs.js).
export async function renderAndSave(context, saveOptions) {
  let image = null;
  try {
    image = await context.renderAsync();
    return await image.saveAsync(saveOptions);
  } finally {
    image?.release?.();
    context.release?.();
  }
}

// Кадр для розпізнавання одного предмета: 1024 px по ширині вистачає
// моделі, а запит лишається легким.
export async function objectJpeg(source, W) {
  const small = await renderAndSave(ImageManipulator.manipulate(source).resize({ width: Math.min(1024, W) }), {
    compress: 0.6,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return small.base64;
}

// ─── Наліпка предмета ──────────────────────────────────────────────────────

// Квадрат під наліпку в пікселях кадру W×H для рамки 0–1000 (y1,x1,y2,x2).
// Квадрат — щоб предмет однаково добре сидів і в словнику, і на картці.
// Цілі пікселі з округленням ВНИЗ: originX + width ніколи не вийде за W
// (на Android вихід навіть на 1 px — виняток і скан без наліпки).
// Криву рамку (не чотири числа, перевернута, квадрат менший за MIN_SIDE px)
// не ріжемо: повертаємо null, а cropToObject бере шлях без рамки.
export const MIN_SIDE = 8;
export function stickerCrop(W, H, box) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null;
  const [y1, x1, y2, x2] = box;
  if (!(y2 >= y1 && x2 >= x1)) return null;
  const left = (x1 / 1000 - PAD) * W;
  const top = (y1 / 1000 - PAD) * H;
  const w = ((x2 - x1) / 1000 + PAD * 2) * W;
  const h = ((y2 - y1) / 1000 + PAD * 2) * H;
  // Доводимо до квадрата по довшій стороні, тримаючи центр предмета.
  const side = Math.min(Math.max(w, h), Math.min(W, H));
  if (!(side >= MIN_SIDE)) return null;
  const cx = left + w / 2;
  const cy = top + h / 2;
  return {
    L: Math.floor(Math.max(0, Math.min(W - side, cx - side / 2))),
    T: Math.floor(Math.max(0, Math.min(H - side, cy - side / 2))),
    S: Math.floor(side),
  };
}

// Силует (0–1000 на весь кадр, [y, x]) у координатах САМЕ ЦЬОГО квадрата
// (0–1, [x, y]). Рахувати це пізніше, в наліпці, не можна: кадр не
// квадратний, а квадрат ще й притискається до країв фото — без знання W, H
// і зсуву силует їде вбік від предмета.
export function shapeInCrop(outline, W, H, { L, T, S }) {
  if (!Array.isArray(outline)) return null;
  const r = (v) => Math.round(v * 1000) / 1000;
  return outline.map(([y, x]) => [r(((x / 1000) * W - L) / S), r(((y / 1000) * H - T) / S)]);
}

// Ріже кадр по рамці й повертає квадратну мініатюру з силуетом.
// source — PictureRef камери (на телефоні) або URI файлу.
export async function cropToObject(source, W, H, box, outline) {
  try {
    const crop = box ? stickerCrop(W, H, box) : null;
    if (!crop) {
      const c = await renderAndSave(ImageManipulator.manipulate(source).resize({ width: STICKER_PX }), {
        compress: 0.7,
        format: SaveFormat.JPEG,
      });
      return { uri: c.uri, shape: null };
    }
    const c = await renderAndSave(
      ImageManipulator.manipulate(source)
        .crop({ originX: crop.L, originY: crop.T, width: crop.S, height: crop.S })
        .resize({ width: Math.min(STICKER_PX, crop.S) }),
      { compress: 0.8, format: SaveFormat.JPEG }
    );
    return { uri: c.uri, shape: shapeInCrop(outline, W, H, crop) };
  } catch (_) {
    return { uri: null, shape: null };
  }
}

// ─── Кадр сцени ────────────────────────────────────────────────────────────
// Сцену знімаємо рівно в 9:16: це формат Stories, тож картка «поділитись»
// бере фото на весь екран без жодного обрізання, а рамки від моделі
// лягають на нього один в один.
export const SCENE_RATIO = 9 / 16;
// Моделі — 720×1280: предмети на столі ще читаються, а запит лишається
// легким для мобільного інтернету. Для показу й карток — 1080×1920.
export const SCENE_SEND_W = 720;
export const SCENE_SHOW_W = 1080;

// Центральний прямокутник 9:16 у кадрі W×H, цілі пікселі всередині кадру.
export function sceneCrop(W, H) {
  if (W / H > SCENE_RATIO) {
    const width = Math.min(W, Math.round(H * SCENE_RATIO));
    return { x: Math.floor((W - width) / 2), y: 0, width, height: H };
  }
  const height = Math.min(H, Math.round(W / SCENE_RATIO));
  return { x: 0, y: Math.floor((H - height) / 2), width: W, height };
}

const clamp1000 = (v) => Math.max(0, Math.min(1000, v));
const toFrameX = (x, crop, W) => clamp1000(((crop.x + (x / 1000) * crop.width) / W) * 1000);
const toFrameY = (y, crop, H) => clamp1000(((crop.y + (y / 1000) * crop.height) / H) * 1000);

// Рамка 0–1000 відносно кадру 9:16 → 0–1000 відносно повного кадру, з
// якого той вирізаний. Наліпку ріжемо з повного кадру: там більше пікселів,
// і предмет біля краю 9:16 не обрізається разом із ним.
export function boxToFrame(box, crop, W, H) {
  const [y1, x1, y2, x2] = box;
  return [toFrameY(y1, crop, H), toFrameX(x1, crop, W), toFrameY(y2, crop, H), toFrameX(x2, crop, W)];
}

export function outlineToFrame(outline, crop, W, H) {
  if (!Array.isArray(outline)) return null;
  return outline.map(([y, x]) => [toFrameY(y, crop, H), toFrameX(x, crop, W)]);
}

// Обидва зображення сцени з одного кадру: легке для моделі (base64) і
// чітке для екрана й карток (файл у кеші, далі його копіює scenes.js).
export async function captureScene(source, W, H) {
  const crop = sceneCrop(W, H);
  const cut = () =>
    ImageManipulator.manipulate(source).crop({ originX: crop.x, originY: crop.y, width: crop.width, height: crop.height });
  // Спершу картинка для екрана: її показуємо замороженим кадром, поки
  // модель думає, тож вона потрібна якомога раніше.
  const showW = Math.min(SCENE_SHOW_W, crop.width);
  const shown = await renderAndSave(cut().resize({ width: showW }), { compress: 0.82, format: SaveFormat.JPEG });
  const sent = await renderAndSave(cut().resize({ width: Math.min(SCENE_SEND_W, crop.width) }), {
    compress: 0.6,
    format: SaveFormat.JPEG,
    base64: true,
  });
  return {
    crop,
    image: { uri: shown.uri, width: shown.width || showW, height: shown.height || Math.round(showW / SCENE_RATIO) },
    base64: sent.base64,
  };
}

// Кадр 9:16 з того самого знімка — тло для «Stories з цим фото» (share.md
// §7). Лише кеш: у словник він не йде, а сканер стирає файл, щойно аркуш
// результату закрився (dropFile). Рендериться, поки модель думає над
// предметом (≈150 мс проти 1–3 с запиту).
export async function scanBackdrop(source, W, H) {
  const c = sceneCrop(W, H);
  const r = await renderAndSave(
    ImageManipulator.manipulate(source)
      .crop({ originX: c.x, originY: c.y, width: c.width, height: c.height })
      .resize({ width: Math.min(SCENE_SHOW_W, c.width) }),
    { compress: 0.82, format: SaveFormat.JPEG }
  );
  return r.uri;
}

// Стирає тимчасовий файл із кешу. Його вже могло не бути (система чистить
// кеш сама) — тоді нічого не робимо й нічого не кидаємо.
export function dropFile(uri) {
  if (!uri) return;
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (_) {}
}

// Наліпки предметів сцени. Результат показуємо одразу, а наліпки потрібні
// лише для збереження слова й картки одного слова — тож ріжемо їх у фоні.
//   eager — одразу всі по черзі (повний кадр із камери: його треба
//           звільнити якомога раніше, done каже коли);
//   інакше — лише на вимогу (сцена з історії: ріжемо зі збереженого 9:16).
// Завжди по одному, і для eager, і для запитів на вимогу: кожне вирізання
// декодує великий кадр, і вісім паралельних («Зберегти всі» одразу після
// появи сцени) на старому iPhone забили б пам'ять. Слово, чия наліпка ще
// стоїть у черзі, тап ставить попереду: людина чекає саме на нього. get()
// для одного ключа завжди повертає той самий проміс.
export function createCutter({ source, width, height, crop, objects, eager = false }) {
  const cache = new Map();
  const jobs = new Map();
  const queue = [];
  let running = false;

  const pump = () => {
    if (running) return;
    const job = queue.shift();
    if (!job) return;
    running = true;
    const { o, resolve } = job;
    // через then: крива рамка кине виняток уже всередині ланцюжка, а не
    // зависне з running = true і не заблокує чергу
    Promise.resolve()
      .then(() => cropToObject(source, width, height, boxToFrame(o.box, crop, width, height), outlineToFrame(o.outline, crop, width, height)))
      .catch(() => ({ uri: null, shape: null }))
      .then((res) => {
        running = false;
        resolve(res);
        pump();
      });
  };

  const cut = (o, urgent = false) => {
    const have = cache.get(o.key);
    if (have) {
      const job = jobs.get(o.key);
      const at = urgent && job ? queue.indexOf(job) : -1;
      if (at > 0) {
        queue.splice(at, 1);
        queue.unshift(job);
      }
      return have;
    }
    let resolve;
    const promise = new Promise((r) => (resolve = r));
    const job = { o, resolve };
    cache.set(o.key, promise);
    jobs.set(o.key, job);
    if (urgent) queue.unshift(job);
    else queue.push(job);
    pump();
    return promise;
  };

  const done = eager ? Promise.all(objects.map((o) => cut(o))).then(() => undefined) : Promise.resolve();
  return {
    done,
    // Файли всіх наліпок, які різальник уже зробив або ще робить (чекає кінця
    // черги): сканер стирає з них ті, що не потрапили в словник. Невдале
    // вирізання файлу не дає.
    files() {
      return Promise.all([...cache.values()]).then((all) => all.map((r) => r && r.uri).filter(Boolean));
    },
    get(key) {
      const o = objects.find((x) => x.key === key);
      return o ? cut(o, true) : Promise.resolve({ uri: null, shape: null });
    },
  };
}
