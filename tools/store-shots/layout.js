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

// Кадр 3: зворот картки (наліпка й переклад) праворуч угорі, лице (слово,
// IPA, «Слухати») — найбільше, ліворуч під ним, а внизу на всю ширину —
// квіз. Прямокутники обрізки — у pt; лице й зворот лише трохи заходять одне
// на одне (переклад на звороті видно), квіз закінчується на BOTTOM.
export const TRIO = { kBack: 2.0, kFront: 4.0, overlap: 10, gap: 60, side: 80, maxQuizW: 1120 };
export function flashcardsTrio({ top, back, front, quiz, W, bottom = BOTTOM }) {
  const bh = back.h * TRIO.kBack;
  const fTop = top + bh - TRIO.overlap;
  const fh = front.h * TRIO.kFront;
  const qTop = fTop + fh + TRIO.gap;
  const kq = Math.min(TRIO.maxQuizW / quiz.w, (bottom - qTop) / quiz.h);
  return {
    back: { k: TRIO.kBack, top, left: W - TRIO.side - back.w * TRIO.kBack },
    front: { k: TRIO.kFront, top: fTop, left: TRIO.side },
    quiz: { k: kq, top: bottom - quiz.h * kq, left: (W - quiz.w * kq) / 2 },
    end: bottom,
  };
}

// Прямокутник w×h з лівим верхнім кутом (left, top), повернутий на deg
// навколо центру (як CSS rotate): межі того, що видно на полотні.
export function rotatedBox({ left, top, w, h, deg }) {
  const a = (deg * Math.PI) / 180;
  const hw = (w * Math.abs(Math.cos(a)) + h * Math.abs(Math.sin(a))) / 2;
  const hh = (w * Math.abs(Math.sin(a)) + h * Math.abs(Math.cos(a))) / 2;
  const cx = left + w / 2, cy = top + h / 2;
  return { x1: cx - hw, y1: cy - hh, x2: cx + hw, y2: cy + hh };
}

// Кадр 8: лівий край нахиленої картки тижня, за якого її правий кут
// лишається в кадрі з полем margin (раніше кут різав правий край).
export function insetLeft({ w, h, rot, W, margin }) {
  const b = rotatedBox({ left: 0, top: 0, w, h, deg: rot });
  return W - margin - b.x2;
}

// Кадр 6: дата на екрані блокування — як її пише iOS цією мовою. Великої
// літери не додаємо: українська й іспанська пишуть день тижня з малої
// («вівторок, 6 жовтня», «martes, 6 de octubre»).
export function lockScreenDate(locale, date) {
  return new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
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
