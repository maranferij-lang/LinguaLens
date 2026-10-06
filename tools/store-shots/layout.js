// Чиста геометрія кадрів App Store: скільки місця займає вміст і де він
// закінчується. Звичайний ESM-модуль без залежностей, як copy.js: його
// читають і компонувальник (compose.mjs), і jest
// (__tests__/storeShotsLayout.test.js). Усе в px кадру 1320×2868, якщо не
// сказано «pt» (логічні точки екрана 440×956).

// Спільний нижній край вмісту. Кадри 2 і 4 (повні екрани) закінчуються
// тут, тож 3, 5 і 7 добирають до нього розміри й проміжки, а не лишають
// порожню смугу внизу (у рядку кадрів її видно одразу).
export const BOTTOM = 2700;

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

// Кадр 3: лице картки обрізаємо симетрично довкола слова, IPA й кнопки
// «Слухати» (pt), щоб не було порожньої нижньої третини.
export function faceCrop({ word, ipa, speak }, pad) {
  const top = Math.min(word.y, ipa.y);
  const bottom = speak ? speak.y + speak.h : ipa.y + ipa.h + 70;
  return { y0: top - pad, y1: bottom + pad };
}

// Кадр 3: зворот (згори), лице й ряд кнопок одне під одним. Вільне місце
// до BOTTOM ділимо між двома проміжками (у межах, щоб картки не злипались
// і не роз'їжджались).
export function flashcardsLayout({ top, backH, frontH, btnH, bottom = BOTTOM }) {
  const free = bottom - top - backH - frontH - btnH;
  const g1 = clamp(free * 0.55, 100, 200);
  const g2 = clamp(free - g1, 70, 150);
  const fTop = top + backH + g1;
  const bTop = fTop + frontH + g2;
  return { fTop, bTop, end: bTop + btnH };
}

// Кадр 5: друга картка (слово дня) під першою. Масштаб — найбільший, за
// якого вона не ширша за maxW і разом із проміжком gap вміщається до BOTTOM.
export function cardBelow({ above, w, h, maxW, gap = 80, bottom = BOTTOM }) {
  const k = Math.min(maxW / w, (bottom - above - gap) / h);
  const top = Math.max(above + gap, bottom - h * k);
  return { k, top, end: top + h * k };
}

// Кадр 7: дві картки (профіль і ряд досягнень) одна під одною в одному
// масштабі k (≤ kMax), разом із проміжком — від top до BOTTOM. h1, h2 у pt.
export function stackTwo({ top, h1, h2, kMax, gap = 80, bottom = BOTTOM }) {
  const k = Math.min(kMax, (bottom - top - gap) / (h1 + h2));
  return { k, top2: bottom - h2 * k, end: bottom };
}

// Кадр 8: предмети кухні, вимкнені на картці сцени («Показувати на картці»
// у застосунку): дошка й рушник лежать під карткою тижня, і їхні фішки
// різало б навпіл.
export const HIDDEN_ON_CARD = ['board', 'towel'];
export const cardScene = (scene) => ({ ...scene, objects: scene.objects.filter((o) => !HIDDEN_ON_CARD.includes(o.key)) });

// Іконка застосунку на головному екрані кадру 6. Типово assets/icon.png
// знятої версії; ICON=… — інша (тест іконки в App Store, PPO): ім'я файла з
// assets/ тієї ж версії (icon-eye.png, assets/icon-eye.png) або шлях до PNG.
// exists і join — з node:fs і node:path (тут їх немає, щоб модуль лишався
// чистим). Повертає шлях до файла.
export function resolveIcon(want, { staticDir, root, cwd, exists, join, isAbsolute }) {
  if (!want) return join(staticDir, 'icon.png');
  const base = want.split(/[\\/]/).pop();
  const candidates = [join(staticDir, base), isAbsolute(want) ? want : join(cwd, want), join(root, want)];
  const hit = candidates.find((p) => exists(p));
  if (!hit) throw new Error(`ICON=${want}: немає ні assets/${base} у знятій версії, ні такого файла`);
  return hit;
}
