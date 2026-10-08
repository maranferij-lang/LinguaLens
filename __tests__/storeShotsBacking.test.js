// Біла підкладка наліпок намальованого арту скріншотів App Store
// (tools/store-shots/art/backing.js): build-art робить тло «фото» білим
// рівно в межах вирубки, якою ріже сам застосунок, тож у ручці чашки немає
// стіни, а під дном стола. Тут перевіряємо, що це та сама вирубка (наліпка
// словника, предмет сцени, наліпка кадру 1), що біле не вилазить з-під
// облямівки на пригашене фото сцени і що справжнє фото власника ріжеться
// як є.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pathToFileURL } from 'url';

import { backedKeys, GROW, heroCut, objectCut, sceneCut, shapeInCropOf, stickerCropOf } from '../tools/store-shots/art/backing';
import { HIDDEN_ON_CARD } from '../tools/store-shots/layout';
import { shapeInCrop, stickerCrop } from '../src/cutout';
import { borderWidth, sceneShapes } from '../src/scene/SceneArt';
import { stickerPath } from '../src/stickerGeometry';

jest.mock('expo-image-manipulator', () => ({ ImageManipulator: {}, SaveFormat: {} }));
jest.mock('expo-file-system', () => ({ File: function File() {} }));

// контур, як його пише build-art: [y, x] 0–1000 на кадрі 1080×1920
const W = 1080, H = 1920;
const outline = Array.from({ length: 28 }, (_, i) => {
  const a = (i / 28) * Math.PI * 2;
  return [Math.round(500 + Math.sin(a) * 120), Math.round(480 + Math.cos(a) * 200)];
});
const box = [380, 280, 620, 680];

describe('store shots: white backing under sticker cuts', () => {
  test('a collection sticker: the same cut as Sticker.js on the square photo', () => {
    const shape = [[0.2, 0.3], [0.5, 0.15], [0.8, 0.3], [0.85, 0.7], [0.5, 0.9], [0.15, 0.7]];
    expect(objectCut(shape, 800)).toEqual({ d: stickerPath({ shape }, 800).d, x: 0, y: 0 });
  });

  test('a scene object: the same cut as the scene screen and the scene card lift', () => {
    const [app] = sceneShapes([{ key: 'mug', box, outline }], { x: 0, y: 0, w: W, h: H });
    expect(sceneCut(outline, W, H).d).toBe(app.d);
  });

  test('the frame 1 sticker: the scanner’s crop square and shape, as cutout.js', () => {
    const app = stickerCrop(W, H, box);
    const crop = stickerCropOf(box, W, H);
    // застосунок округлює до цілих px униз
    expect(Math.abs(crop.L - app.L)).toBeLessThan(1);
    expect(Math.abs(crop.T - app.T)).toBeLessThan(1);
    expect(Math.abs(crop.S - app.S)).toBeLessThan(1);
    const ours = shapeInCropOf(outline, W, H, app);
    shapeInCrop(outline, W, H, app).forEach(([x, y], i) => {
      expect(ours[i][0]).toBeCloseTo(x, 2);
      expect(ours[i][1]).toBeCloseTo(y, 2);
    });
    const cut = heroCut({ box, outline }, W, H);
    expect([cut.x, cut.y]).toEqual([crop.L, crop.T]);
    expect(cut.d).toBe(stickerPath({ shape: shapeInCropOf(outline, W, H, crop) }, crop.S).d);
  });

  test('the white reaches past the cut edge but stays under the white border', () => {
    expect(GROW).toBeGreaterThan(0);
    // предмет сцени: облямівка на фото 1080 px завширшки
    expect(GROW).toBeLessThan(borderWidth({ w: W }));
  });

  test('kitchen objects that stay unlifted on the scene card keep the honest photo', () => {
    const keys = ['window', 'plant', 'pan', 'jar', 'board', 'kettle', 'apple', 'mug', 'towel'];
    const got = backedKeys(keys);
    expect(got).toEqual(expect.arrayContaining(['kettle', 'mug']));
    for (const k of HIDDEN_ON_CARD) expect(got).not.toContain(k);
    expect(got).toHaveLength(keys.length - HIDDEN_ON_CARD.length);
  });

  test('the owner’s real hero photo replaces the backed copy: frame 1 cuts it as is', () => {
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'll-backing-'));
    const photos = fs.mkdtempSync(path.join(os.tmpdir(), 'll-photos-'));
    const art = path.join(work, 'art');
    fs.mkdirSync(art);
    fs.writeFileSync(path.join(art, 'hero-sticker.jpg'), 'painted');
    fs.writeFileSync(path.join(art, 'shapes.json'), JSON.stringify({ objects: {}, hero: { width: W, height: H, objects: { mug: { box, outline } } } }));
    // найменший JPEG, з якого jpegSize бере розмір: SOI і SOF0 1080×1920
    fs.writeFileSync(path.join(photos, 'hero.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x07, 0x80, 0x04, 0x38, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9]));
    fs.writeFileSync(path.join(photos, 'shapes.json'), JSON.stringify({ hero: { objects: { mug: { box, outline } } } }));
    const url = pathToFileURL(path.join(__dirname, '../tools/store-shots/photos.mjs')).href;
    execFileSync(process.execPath, ['--input-type=module', '--no-warnings', '-e', `import { applyPhotos } from ${JSON.stringify(url)}; applyPhotos(${JSON.stringify(photos)});`], {
      encoding: 'utf8',
      env: { ...process.env, WORK: work, OUT: work },
    });
    expect(fs.existsSync(path.join(art, 'hero.jpg'))).toBe(true);
    expect(fs.existsSync(path.join(art, 'hero-sticker.jpg'))).toBe(false);
  });
});
