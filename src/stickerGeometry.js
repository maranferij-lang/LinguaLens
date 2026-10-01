// Геометрія наліпки: силует предмета → гладкий контур «вирубки».
//
// Модель віддає 16–32 точки по краю предмета. Якщо з'єднати їх прямими,
// виходить гранчаста фігура, яка читається як «обвели мишкою». Справжня
// наліпка має плавний край, тож:
//   1) точки переводимо в пікселі наліпки;
//   2) трохи відсуваємо назовні — біла облямівка не повинна заходити на сам
//      предмет, а модель зазвичай ставить точки впритул або трохи всередині;
//   3) згладжуємо сплайном Катмулла–Рома і пишемо як кубічні криві Безьє.
// Тут лише чиста математика — без React, щоб її можна було тестувати.

// Силует у пікселях квадрата size×size або null, якщо форми немає.
// `shape` — точки [x, y] 0–1 у координатах вирізаного квадрата (рахує сканер).
// `outline` + `box` — старий формат (0–1000 на весь кадр) для слів,
// збережених раніше: перерахунок наближений, розмірів кадру тут уже немає.
export function silhouette({ shape, outline, box }, size) {
  if (Array.isArray(shape) && shape.length >= 6) {
    return clean(shape.map(([x, y]) => [x * size, y * size]), size);
  }
  if (!Array.isArray(outline) || !Array.isArray(box)) return null;
  const [y1, x1, y2, x2] = box;
  // рамка з тим самим запасом, що й у кропі сканера
  const pad = 0.06;
  const bw = (x2 - x1) / 1000 + pad * 2;
  const bh = (y2 - y1) / 1000 + pad * 2;
  const side = Math.max(bw, bh);
  const ox = x1 / 1000 - pad + bw / 2 - side / 2;
  const oy = y1 / 1000 - pad + bh / 2 - side / 2;
  return clean(
    outline.map(([y, x]) => [((x / 1000 - ox) / side) * size, ((y / 1000 - oy) / side) * size]),
    size
  );
}

// Відкидає галюцинації (точки далеко за межами) і дублікати поруч.
function clean(points, size) {
  const out = [];
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < -size * 0.5 || x > size * 1.5 || y < -size * 0.5 || y > size * 1.5) continue;
    const prev = out[out.length - 1];
    if (prev && Math.hypot(prev[0] - x, prev[1] - y) < size * 0.004) continue;
    out.push([x, y]);
  }
  if (out.length > 2) {
    const [fx, fy] = out[0];
    const [lx, ly] = out[out.length - 1];
    if (Math.hypot(fx - lx, fy - ly) < size * 0.004) out.pop();
  }
  return out.length >= 6 ? out : null;
}

export function centroid(points) {
  let cx = 0;
  let cy = 0;
  for (const [x, y] of points) {
    cx += x;
    cy += y;
  }
  return [cx / points.length, cy / points.length];
}

// Відсуває кожну точку від центру на `amount` пікселів. Не масштабування:
// воно розтягувало б довгі предмети (олівець) непропорційно — тут запас
// однаковий з усіх боків.
export function inflate(points, amount) {
  const [cx, cy] = centroid(points);
  return points.map(([x, y]) => {
    const dx = x - cx;
    const dy = y - cy;
    const len = Math.hypot(dx, dy) || 1;
    return [x + (dx / len) * amount, y + (dy / len) * amount];
  });
}

// Замкнений сплайн Катмулла–Рома через усі точки → шлях SVG із кривих Безьє.
export function smoothPath(points) {
  const n = points.length;
  const p = (i) => points[(i + n) % n];
  const f = (v) => Math.round(v * 10) / 10;
  let d = `M${f(p(0)[0])} ${f(p(0)[1])}`;
  for (let i = 0; i < n; i++) {
    const [x0, y0] = p(i - 1);
    const [x1, y1] = p(i);
    const [x2, y2] = p(i + 1);
    const [x3, y3] = p(i + 2);
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C${f(c1x)} ${f(c1y)} ${f(c2x)} ${f(c2y)} ${f(x2)} ${f(y2)}`;
  }
  return d + ' Z';
}

// Коло — запасний контур, коли модель не дала силуету. Те саме оформлення
// (біла облямівка, тінь), тож колекція виглядає однорідно.
export function circlePoints(size, inset = 0.08, count = 24) {
  const r = size * (0.5 - inset);
  const c = size / 2;
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [c + Math.cos(a) * r, c + Math.sin(a) * r];
  });
}

// Усе разом: гладкий шлях вирубки для наліпки розміру `size`.
export function stickerPath(input, size) {
  const pts = silhouette(input, size);
  if (!pts) return { d: smoothPath(circlePoints(size)), shaped: false };
  return { d: smoothPath(inflate(pts, size * 0.015)), shaped: true };
}
