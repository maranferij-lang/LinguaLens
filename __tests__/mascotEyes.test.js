// Очі Лінго суцільні. Фон із PNG поз колись вирізали разом із верхньою
// половиною білків, і на темному колі вітання (accentSoft) крізь очі
// просвічувало тло: «порожні» очі на першому екрані, поруч з іконкою, де
// білки білі. Білки закрито кольором #F2EFFF (як на іконці), а тут стежимо,
// щоб усередині кожного ока не було жодного прозорого пікселя.
import path from 'path';

const { decode } = require('../tools/png.js');

// Еліпси очей у пікселях PNG 512×512: центр і півосі. think — одне око:
// друге за лупою, воно й так ціле.
const EYES = {
  wave: [
    [201.5, 140.5, 25.5, 26.5],
    [310.5, 140.5, 25.5, 26.5],
  ],
  celebrate: [
    [201.5, 141.5, 25.5, 26.5],
    [310.5, 141.5, 25.5, 26.5],
  ],
  encourage: [
    [204.5, 142.5, 25.5, 26.5],
    [308.5, 141.5, 25.5, 26.5],
  ],
  think: [[305.5, 142.5, 26.5, 26.5]],
};

test.each(Object.keys(EYES))('lingo-%s: no see-through pixel inside the eyes', (pose) => {
  const img = decode(path.join(__dirname, '..', 'assets', `lingo-${pose}.png`));
  expect([img.width, img.height, img.channels]).toEqual([512, 512, 4]);
  const holes = [];
  for (const [cx, cy, rx, ry] of EYES[pose]) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        // центр пікселя всередині еліпса з запасом у піксель від краю
        const d = ((x + 0.5 - cx) / (rx - 1)) ** 2 + ((y + 0.5 - cy) / (ry - 1)) ** 2;
        if (d > 1) continue;
        const a = img.data[(y * img.width + x) * 4 + 3];
        if (a < 255) holes.push(`${x},${y}:${a}`);
      }
    }
  }
  expect(holes).toEqual([]);
});
