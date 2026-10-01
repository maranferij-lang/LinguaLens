// Де стоять підписи на фото сцени. Чиста геометрія без React — її
// перевіряє jest на сотнях випадкових сцен.
//
// Правила, заради яких це окремий модуль:
//   • підписи не налазять один на одного й не виходять за безпечну зону
//     (верхня й нижня панелі, поля Stories);
//   • підпис стоїть просто над предметом або під ним — так його читають без
//     стрілок; лише коли місця поруч немає, він відходить убік, і тоді
//     тонка лінія з крапкою показує, чий він;
//   • великі предмети розкладаються першими: їм найважче знайти місце, а
//     дрібним вистачить і щілини;
//   • підпис не ховає сусідні предмети — особливо дрібні: стіл перекрити
//     трохи можна, чашку на ньому — ні.
// Усе детерміновано: та сама сцена завжди дає ту саму розкладку, тож прев'ю
// картки й PNG збігаються, а повторне відкриття сцени нічого не пересуває.
import { textEm } from '../share/layout';

// ─── Розміри ───────────────────────────────────────────────────────────────

// Зображення, вписане в сцену цілком (contain), по центру.
export function fitContain(imgW, imgH, stageW, stageH) {
  const k = Math.min(stageW / imgW, stageH / imgH);
  const w = imgW * k;
  const h = imgH * k;
  return { x: (stageW - w) / 2, y: (stageH - h) / 2, w, h };
}

// Рамка 0–1000 (y1,x1,y2,x2) → прямокутник у пікселях сцени.
export function rectOf(box, frame) {
  const [y1, x1, y2, x2] = box;
  return {
    x1: frame.x + (x1 / 1000) * frame.w,
    y1: frame.y + (y1 / 1000) * frame.h,
    x2: frame.x + (x2 / 1000) * frame.w,
    y2: frame.y + (y2 / 1000) * frame.h,
  };
}

// Чи лежить точка всередині многокутника (промінь праворуч, парність).
function insidePoly(x, y, pts) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

// Відстань від точки до найближчого краю многокутника.
function edgeDistance(x, y, pts) {
  let best = Infinity;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [ax, ay] = pts[j];
    const [bx, by] = pts[i];
    const dx = bx - ax;
    const dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    const k = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
    best = Math.min(best, Math.hypot(x - (ax + k * dx), y - (ay + k * dy)));
  }
  return best;
}

// Точка, куди дивиться підпис: «найглибша» точка силуету — та, що
// найдалі від його країв. Центр рамки чи середнє точок у лампи, рослини
// чи стільця з ніжками висить у повітрі між деталями, а крапка мусить
// лежати на самій речі. Без силуету — центр рамки.
// Шукаємо сіткою 12×12 і двічі уточнюємо довкола найкращої: детерміновано
// і з запасом швидко для 40 точок.
export function anchorOf({ box, outline }, frame) {
  const pts = Array.isArray(outline)
    ? outline
        .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
        .map(([y, x]) => [frame.x + (x / 1000) * frame.w, frame.y + (y / 1000) * frame.h])
    : [];
  if (pts.length < 3) {
    const r = rectOf(box, frame);
    return { x: (r.x1 + r.x2) / 2, y: (r.y1 + r.y2) / 2 };
  }
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x1 = Math.min(...xs);
  const y1 = Math.min(...ys);
  let step = Math.max(Math.max(...xs) - x1, Math.max(...ys) - y1) / 12;
  let best = null;
  const probe = (x, y) => {
    if (!insidePoly(x, y, pts)) return;
    const d = edgeDistance(x, y, pts);
    if (!best || d > best.d + 1e-9) best = { x, y, d };
  };
  for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) probe(x1 + i * step, y1 + j * step);
  if (!best) {
    // вироджений силует (усі точки на одній лінії) — середнє точок
    return { x: xs.reduce((a, b) => a + b, 0) / xs.length, y: ys.reduce((a, b) => a + b, 0) / ys.length };
  }
  for (let round = 0; round < 2; round++) {
    const { x: cx, y: cy } = best;
    step /= 3;
    for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) probe(cx + i * step, cy + j * step);
  }
  return { x: best.x, y: best.y };
}

// Розмір плашки «слово / переклад». Шрифт не міряємо на екрані: ширини
// гліфів Nunito відомі (textEm), і розкладка лишається чистою функцією.
// Довге слово спершу дрібнішає до min, і лише потім плашка впирається в
// maxW (далі текст скоротить сам Text). Переклад міряємо тими самими
// ширинами без знижки: SemiBold на кирилиці майже такий широкий, як
// ExtraBold, і «кімнатна рослина» інакше обрізалась би трикрапкою.
export function chipSize(word, translation, { size = 15, sub = 12, min = 11, maxW = 172, padX = 11, padY = 6 } = {}) {
  const wordEm = textEm(word, -0.01);
  const subEm = translation ? textEm(translation, 0) : 0;
  const room = maxW - padX * 2;
  const wordSize = wordEm > 0 ? Math.max(min, Math.min(size, Math.floor(room / wordEm))) : size;
  const subSize = subEm > 0 ? Math.max(min - 1, Math.min(sub, Math.floor(room / subEm))) : sub;
  const textW = Math.max(wordEm * wordSize, subEm * subSize);
  const w = Math.min(maxW, Math.ceil(textW * 1.04 + padX * 2 + 2));
  const lineW = Math.round(wordSize * 1.25);
  const lineS = translation ? Math.round(subSize * 1.3) : 0;
  return { w, h: padY * 2 + lineW + lineS, wordSize, subSize, lineW, lineS };
}

// ─── Геометрія прямокутників ───────────────────────────────────────────────

const area = (r) => Math.max(0, r.x2 - r.x1) * Math.max(0, r.y2 - r.y1);

function overlap(a, b) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
  const h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
  return w > 0 && h > 0 ? w * h : 0;
}

// Відстань між прямокутниками (0 — торкаються або перетинаються).
export function rectGap(a, b) {
  const dx = Math.max(a.x1 - b.x2, b.x1 - a.x2, 0);
  const dy = Math.max(a.y1 - b.y2, b.y1 - a.y2, 0);
  return Math.hypot(dx, dy);
}

const near = (r, p, m) => p.x > r.x1 - m && p.x < r.x2 + m && p.y > r.y1 - m && p.y < r.y2 + m;

// Найближча до точки p точка на прямокутнику r.
function nearestOn(r, p) {
  return { x: Math.max(r.x1, Math.min(r.x2, p.x)), y: Math.max(r.y1, Math.min(r.y2, p.y)) };
}

// Чи перетинає відрізок прямокутник (Ліанг–Барскі).
function segmentHits(p, q, r) {
  let t0 = 0;
  let t1 = 1;
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const edges = [
    [-dx, p.x - r.x1],
    [dx, r.x2 - p.x],
    [-dy, p.y - r.y1],
    [dy, r.y2 - p.y],
  ];
  for (const [pp, qq] of edges) {
    if (pp === 0) {
      if (qq < 0) return false;
    } else {
      const t = qq / pp;
      if (pp < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

// ─── Розкладка ─────────────────────────────────────────────────────────────

// Підпис вважається «своїм» без лінії, поки між ним і предметом не більше
// за зазор плюс кілька пікселів: так читається «просто над чашкою».
const TOUCH = 8;
const GRID_STEP = 8;

// items:  [{ key, rect: {x1,y1,x2,y2}, anchor: {x,y}, w, h }]
// bounds: безпечна зона для підписів {x1,y1,x2,y2}
// mode:   'chip'    — плашка над/під предметом, лінія лише якщо відсунули;
//         'callout' — редакційний підпис збоку від крапки, лінія завжди.
// Повертає масив у порядку items: { key, x, y, w, h, leader, align }, де
// leader = { from: точка на предметі, to: край підпису } або null.
export function layoutChips(items, bounds, { mode = 'chip', gap = 6, spacing = 6 } = {}) {
  const list = Array.isArray(items) ? items : [];
  const order = list
    .map((it, i) => ({ it, i, a: area(it.rect) }))
    .sort((p, q) => q.a - p.a || p.i - q.i);
  const placed = []; // прямокутники вже поставлених підписів
  const leaders = []; // їхні лінії (для callout)
  const out = new Array(list.length);

  const fit = (x, y, w, h) => {
    const cx = Math.max(bounds.x1, Math.min(bounds.x2 - w, x));
    const cy = Math.max(bounds.y1, Math.min(bounds.y2 - h, y));
    return { x1: cx, y1: cy, x2: cx + w, y2: cy + h };
  };
  const collides = (r) =>
    placed.some((p) => r.x1 - spacing < p.x2 && r.x2 + spacing > p.x1 && r.y1 - spacing < p.y2 && r.y2 + spacing > p.y1);
  // Найдешевше, що може дати сітка: дорожче за будь-яке «рідне» місце поруч
  const gridFloor = mode === 'callout' ? 40 : 12;

  for (const { it } of order) {
    const { rect, anchor, w, h } = it;
    const own = area(rect) || 1;
    const others = list.filter((o) => o !== it).map((o) => ({ r: o.rect, a: area(o.rect) || 1 }));

    // Скільки цей підпис ховає з чужих предметів — частка САМЕ ТОГО
    // предмета, тож дрібний сусід важить більше за великий стіл.
    const coverOthers = (r) => others.reduce((s, o) => s + overlap(r, o.r) / o.a, 0);

    // Ціна місця r (менше — краще) або null, якщо туди не можна.
    // pref — штраф «рідного» місця; null — точка сітки.
    const score = (r, pref) => {
      if (collides(r)) return null;
      if (mode === 'callout') {
        // Підпис не сідає на жодну крапку і не перекреслює чужу лінією
        if (list.some((o) => near(r, o.anchor, 10))) return null;
        const end = nearestOn(r, anchor);
        const dist = Math.hypot(end.x - anchor.x, end.y - anchor.y);
        let cost = (pref ?? gridFloor + dist * 0.6) + coverOthers(r) * 60 + (overlap(r, rect) / own) * 20;
        if (placed.some((p) => segmentHits(anchor, end, p))) cost += 40;
        if (leaders.some((l) => segmentHits(l.from, l.to, r))) cost += 40;
        return cost;
      }
      const d = rectGap(r, rect);
      const base = pref !== null && d <= gap + TOUCH ? pref : gridFloor + d * 0.6;
      return base + coverOthers(r) * 120 + (overlap(r, rect) / own) * 40;
    };

    const preferred = [];
    const add = (x, y, pref) => preferred.push({ r: fit(x, y, w, h), pref });

    if (mode === 'callout') {
      // Підпис відходить від крапки в один із восьми боків; ближче й
      // угору-вбік — краще: так читають журнальні підписи до фото.
      const dirs = [
        [0.7, -1, 0], [-0.7, -1, 0], [1, -0.25, 2], [-1, -0.25, 2],
        [0, -1, 3], [0.7, 1, 4], [-0.7, 1, 4], [0, 1, 6],
      ];
      for (const d of [20, 32, 48, 68, 92]) {
        for (const [ux, uy, pref] of dirs) {
          const x = ux > 0 ? anchor.x + d * ux : ux < 0 ? anchor.x + d * ux - w : anchor.x - w / 2;
          const y = uy < -0.5 ? anchor.y - d * 0.8 - h : uy > 0.5 ? anchor.y + d * 0.8 : anchor.y + d * uy - h / 2;
          add(x, y, pref + d * 0.35);
        }
      }
    } else {
      const cx = (rect.x1 + rect.x2) / 2;
      const cy = (rect.y1 + rect.y2) / 2;
      add(cx - w / 2, rect.y1 - gap - h, 0); // просто над предметом
      add(cx - w / 2, rect.y2 + gap, 4); // просто під ним
      add(rect.x2 + gap, cy - h / 2, 10); // праворуч
      add(rect.x1 - gap - w, cy - h / 2, 10); // ліворуч
      // Великий предмет може понести підпис на собі, біля свого краю
      if (rect.y2 - rect.y1 > h * 2.4) {
        add(cx - w / 2, rect.y1 + gap, 14);
        add(cx - w / 2, rect.y2 - gap - h, 18);
      }
    }

    let best = null;
    const consider = (r, pref) => {
      const cost = score(r, pref);
      if (cost !== null && (!best || cost < best.cost - 1e-9)) best = { r, cost };
    };
    for (const c of preferred) consider(c.r, c.pref);

    // Запасний варіант — сітка по всій зоні: місце знайдеться завжди,
    // поки підписів не більше, ніж може вміститися. Обходимо її, лише коли
    // жодне «рідне» місце не годиться, — так розкладка лишається миттєвою.
    if (!best || best.cost > gridFloor) {
      for (let y = bounds.y1; y <= bounds.y2 - h; y += GRID_STEP) {
        for (let x = bounds.x1; x <= bounds.x2 - w; x += GRID_STEP) {
          const r = { x1: x, y1: y, x2: x + w, y2: y + h };
          // відстань — нижня межа ціни: далі за поточного лідера не рахуємо
          const end = nearestOn(r, anchor);
          const reach = mode === 'callout' ? Math.hypot(end.x - anchor.x, end.y - anchor.y) : rectGap(r, rect);
          if (best && gridFloor + reach * 0.6 >= best.cost) continue;
          consider(r, null);
        }
      }
    }
    // Зона повністю зайнята — ставимо в бажане місце: краще підпис поверх
    // іншого, ніж слово, що мовчки зникло з фото.
    const r = best ? best.r : preferred[0].r;
    placed.push(r);

    let leader = null;
    if (mode === 'callout' || rectGap(r, rect) > gap + TOUCH) {
      leader = { from: { x: anchor.x, y: anchor.y }, to: nearestOn(r, anchor) };
      leaders.push(leader);
    }
    // Вирівнювання тексту — до крапки: зліва від неї текст притиснутий
    // праворуч, справа — ліворуч, над і під — по центру.
    const align = r.x2 <= anchor.x ? 'right' : r.x1 >= anchor.x ? 'left' : 'center';
    const i = list.indexOf(it);
    out[i] = { key: it.key, x: r.x1, y: r.y1, w, h, leader, align };
  }
  return out;
}

// ─── Контур предмета ───────────────────────────────────────────────────────

// Силует предмета в пікселях сцени ([x, y]). Без силуету (або з битим)
// — «сквіркл», вписаний у рамку: м'якший за прямокутник і ближчий до
// форми більшості речей, тож вирубка не виглядає як виділення мишкою.
export function contourPoints({ box, outline }, frame) {
  const pts = Array.isArray(outline)
    ? outline.filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    : [];
  if (pts.length >= 6) {
    return pts.map(([y, x]) => [frame.x + (x / 1000) * frame.w, frame.y + (y / 1000) * frame.h]);
  }
  const r = rectOf(box, frame);
  const cx = (r.x1 + r.x2) / 2;
  const cy = (r.y1 + r.y2) / 2;
  const rx = ((r.x2 - r.x1) / 2) * 0.96;
  const ry = ((r.y2 - r.y1) / 2) * 0.96;
  const n = 24;
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    return [cx + rx * Math.sign(c) * Math.sqrt(Math.abs(c)), cy + ry * Math.sign(s) * Math.sqrt(Math.abs(s))];
  });
}

// Довжина замкненої ламаної — для анімації «контур малюється»
// (strokeDasharray). Згладжена крива трохи довша, звідси запас.
export function perimeter(points) {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    len += Math.hypot(x2 - x1, y2 - y1);
  }
  return Math.ceil(len * 1.06);
}
