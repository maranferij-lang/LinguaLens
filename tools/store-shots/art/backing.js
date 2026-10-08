// Біла підкладка наліпок намальованого арту.
//
// Застосунок ріже наліпку по контуру від AI (16–32 точки): що всередині
// вирубки, але не сам предмет (стіна в ручці чашки, стіл під дном, плитка
// між носиком і чайником), те й лишається на наліпці. На справжньому фото
// це вирішує вибір кадру (README, «Справжні фото»: однотонне світле тло). На
// намальованих замінниках build-art робить те саме: у межах вирубки тло
// «фото» стає білим, як облямівка, тож наліпка читається як вирубка, а не як
// фото з клаптями тла. Сам предмет і те, що стоїть перед ним (миска перед
// яблуком), лишаються як є.
//
// Шляхи — ті самі, якими ріже застосунок, у px фото:
//   objectCut  наліпка з квадратного фото предмета (Sticker.js, stickerPath):
//              словник, картки, «Поділитися»;
//   sceneCut   предмет, піднятий на фото сцени (SceneArt.sceneShapes);
//   heroCut    наліпка кадру 1 з фото сцени: квадрат кропу сканера
//              (cutout.stickerCrop і shapeInCrop) і stickerPath у ньому.
// GROW — скільки білого ще за краєм вирубки (згладжування країв). Біла
// облямівка наліпки ширша, тож на пригашеному фото сцени його не видно.
//
// Звичайний ESM-модуль без браузера: його читають і build-art.mjs, і jest
// (__tests__/storeShotsBacking.test.js, звіряє шляхи з самим застосунком).
import { inflate, smoothPath, stickerPath } from '../../../src/stickerGeometry.js';
import { HIDDEN_ON_CARD } from '../layout.js';

// Запас контуру предмета сцени: SceneArt.sceneShapes, pad = frame.w × 0.004.
export const SCENE_PAD = 0.004;
export const GROW = 3;

// Наліпка з квадратного фото предмета size×size (shape — [x, y] 0–1).
export function objectCut(shape, size) {
  return { d: stickerPath({ shape }, size).d, x: 0, y: 0 };
}

// Предмет сцени W×H (outline — [y, x] 0–1000), як його піднімає екран сцени
// й картка «Поділитися».
export function sceneCut(outline, W, H) {
  const pts = outline.map(([y, x]) => [(x / 1000) * W, (y / 1000) * H]);
  return { d: smoothPath(inflate(pts, W * SCENE_PAD)), x: 0, y: 0 };
}

// Квадрат під наліпку на кадрі W×H для рамки box (0–1000, [y1, x1, y2, x2]):
// рамка з полем 6 %, доведена до квадрата по довшій стороні й притиснута до
// країв кадру, як cutout.stickerCrop (без округлення до цілих px).
export function stickerCropOf(box, W, H, pad = 0.06) {
  const [y1, x1, y2, x2] = box;
  const l = (x1 / 1000 - pad) * W, t = (y1 / 1000 - pad) * H;
  const w = ((x2 - x1) / 1000 + pad * 2) * W, h = ((y2 - y1) / 1000 + pad * 2) * H;
  const S = Math.min(Math.max(w, h), Math.min(W, H));
  return {
    L: Math.max(0, Math.min(W - S, l + w / 2 - S / 2)),
    T: Math.max(0, Math.min(H - S, t + h / 2 - S / 2)),
    S,
  };
}

// Силует (outline на весь кадр) у координатах квадрата кропу, 0–1.
export function shapeInCropOf(outline, W, H, { L, T, S }) {
  return outline.map(([y, x]) => [((x / 1000) * W - L) / S, ((y / 1000) * H - T) / S]);
}

// Наліпка кадру 1, вирізана з фото сцени (compose.mjs, sceneSticker).
export function heroCut({ box, outline }, W, H) {
  const crop = stickerCropOf(box, W, H);
  return { d: stickerPath({ shape: shapeInCropOf(outline, W, H, crop) }, crop.S).d, x: crop.L, y: crop.T };
}

// Предмети кухні, яким фото підкладає біле. Вимкнені на картці сцени кадру
// 8 (HIDDEN_ON_CARD у layout.js) там лишаються на фото, не підняті, і біле
// довкола них було б видно, тож їм — чесне фото.
export const backedKeys = (keys, hidden = HIDDEN_ON_CARD) => keys.filter((k) => !hidden.includes(k));
