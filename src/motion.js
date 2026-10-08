// Система руху LinguaLens — єдине джерело правди для всіх анімацій.
//
// Два джерела правил:
//   • Emil Kowalski, design engineering — кастомні криві (вбудовані заслабкі),
//     тривалості під 300 мс, вихід швидший за вхід, ніколи ease-in на UI,
//     ніколи не з'являтись зі scale(0), стагер 30–80 мс.
//   • Apple, «Designing Fluid Interfaces» — пружина задається парою
//     (response, damping), за замовчуванням критично задемпфована;
//     переліт дозволений ЛИШЕ після жесту з моментумом.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AccessibilityInfo, Easing, LayoutAnimation, Platform } from 'react-native';

// ─── Криві ────────────────────────────────────────────────────────────────
// Стандартні криві надто мляві — це посилені варіанти.
// ease-in на UI не використовуємо ніколи: він гальмує саме тієї миті,
// коли користувач найуважніше дивиться на екран.
// Єдиний виняток — inOut: крива повільно стартує й повільно гальмує, тож
// годиться лише для симетричних циклів (дихання маскота, хитання, смужка
// світла) і руху елемента, що вже стоїть на екрані, з одного спокою в інший
// (переворот картки). Поява, зникнення й відгук на дотик — завжди out/drawer.
export const EASE = {
  out: Easing.bezier(0.23, 1, 0.32, 1), // поява/зникнення — миттєвий старт
  inOut: Easing.bezier(0.77, 0, 0.175, 1), // цикли й рух по екрану, не поява
  drawer: Easing.bezier(0.32, 0.72, 0, 1), // шторки й аркуші (крива з iOS)
  soft: Easing.bezier(0.4, 0, 0.2, 1), // колір і непрозорість
  linear: Easing.linear, // лише таймери й прогрес-бари
};

// ─── Тривалості ───────────────────────────────────────────────────────────
// Усе, чого користувач торкається, тримаємо під 300 мс:
// 180 мс відчувається помітно швидшим за 400 мс при тій самій роботі.
export const DUR = {
  press: 120, // відгук на натиск
  micro: 160, // дрібні зміни стану
  popover: 190, // підказки, дропдауни
  panel: 240, // панелі, розгортання
  sheet: 280, // аркуші, модалки
  exit: 170, // вихід завжди швидший за вхід
};

// ─── Пружини ──────────────────────────────────────────────────────────────
// Apple свідомо відмовився від трійки маса/жорсткість/демпфування на користь
// двох зрозумілих величин:
//   response — за скільки секунд значення доходить до цілі (менше = різкіше)
//   damping  — 1.0 без перельоту; <1 пружинить
// Переводимо у фізику React Native: m = 1, k = (2π/T)², c = 2ζ·(2π/T)
export function spring(response = 0.35, damping = 1, extra) {
  const w = (2 * Math.PI) / response;
  return {
    stiffness: Math.round(w * w),
    damping: Math.round(2 * damping * w * 10) / 10,
    mass: 1,
    useNativeDriver: true,
    ...extra,
  };
}

export const SPRING = {
  // За замовчуванням — БЕЗ перельоту. Елемент, який просто з'явився,
  // не має підстрибувати: у реальному світі його ніхто не кидав.
  ui: spring(0.35, 1),
  snappy: spring(0.24, 1), // натиски, перемикачі
  calm: spring(0.45, 1), // великі поверхні

  // Переліт лише там, де перед цим був жест із моментумом.
  gesture: spring(0.35, 0.82),
  drawer: spring(0.3, 0.8),
};

// ─── Стагер ───────────────────────────────────────────────────────────────
// 30–80 мс між сусідніми елементами. Більше — інтерфейс здається повільним.
// Обрізаємо на шостому, щоб довгий список не «доповзав».
export const STAGGER_STEP = 55;
export function stagger(index, step = STAGGER_STEP) {
  return Math.min(index, 6) * step;
}

// ─── Reduced motion ───────────────────────────────────────────────────────
// «Менше руху» не означає «без відгуку»: лишаємо зміни непрозорості й кольору,
// прибираємо переміщення, масштаб і переліт.
//
// Кеш оновлює підписка на рівні модуля, а не хук: FadeIn, Press, layoutNext
// і travel читають його без хука, і зміна налаштування мусить дійти до них,
// навіть коли жоден екран із useReducedMotion зараз не змонтований.
let reducedCache = false;
const reducedListeners = new Set();

function setReducedCache(v) {
  const next = !!v;
  if (next === reducedCache) return;
  reducedCache = next;
  reducedListeners.forEach((fn) => fn(next));
}

// Свіже значення з системи (кожен хук питає його при монтуванні: тест чи
// користувач міг змінити налаштування, поки хука не було)
function readReduced() {
  try {
    return Promise.resolve(AccessibilityInfo.isReduceMotionEnabled?.())
      .then((v) => {
        if (v != null) setReducedCache(v);
      })
      .catch(() => {});
  } catch (_) {
    return Promise.resolve();
  }
}

readReduced();
try {
  AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReducedCache);
} catch (_) {}

export function isReducedMotion() {
  return reducedCache;
}

const subscribeReduced = (fn) => {
  reducedListeners.add(fn);
  return () => reducedListeners.delete(fn);
};

// Для компонентів, яких багато (Press, Skeleton): бере кеш і підписується на
// його зміну, а в системи не питає. Один Set-слухач замість виклику в нативний
// код при кожному монтуванні.
export function useReducedMotionCached() {
  return useSyncExternalStore(subscribeReduced, isReducedMotion);
}

// Те саме, але при монтуванні ще раз питає систему: екран, якому важливо
// мати свіже значення (його могли змінити, поки застосунок спав).
export function useReducedMotion() {
  const reduced = useReducedMotionCached();
  useEffect(() => {
    readReduced();
  }, []);
  return reduced;
}

// Чи увімкнений VoiceOver. Жести, яких незрячій людині не зробити (тримати
// палець 1,2 с на кільці), з ним стають звичайним дотиком.
export function useScreenReader() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled?.()
      .then((v) => alive && setOn(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', (v) => setOn(!!v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);
  return on;
}

// Оголошення для VoiceOver. accessibilityLiveRegion на iOS не працює (лише
// Android і веб), тож помилка покупки, помилка скану чи розблоковане
// досягнення без цього мовчать. Android тримається на liveRegion: там
// оголошення було б подвійним. Без VoiceOver iOS просто відкидає виклик.
export function announce(text) {
  if (Platform.OS !== 'ios' || text == null || text === '') return;
  try {
    AccessibilityInfo.announceForAccessibility?.(String(text));
  } catch (_) {}
}

// Оголошує text щоразу, коли він змінюється й не порожній (помилка, статус).
// Не для рядків, що мінялись би під пальцем (підказка слайдера): вони шумлять.
export function useAnnounce(text) {
  useEffect(() => {
    announce(text);
  }, [text]);
}

// ─── Haptics ──────────────────────────────────────────────────────────────
// Легко й за ділом: selection — зміна вибору, light — дотик до кнопки,
// medium — вагоме підтвердження, success/warning/error — результат дії.
// Не на кожен тап по списку. Без expo-haptics, на вебі й у збірці без модуля
// (Expo Go, jest-заглушка) виклик нічого не робить і не падає.
const HAPTICS = {
  selection: (H) => H.selectionAsync?.(),
  light: (H) => H.impactAsync?.(H.ImpactFeedbackStyle?.Light ?? 'light'),
  medium: (H) => H.impactAsync?.(H.ImpactFeedbackStyle?.Medium ?? 'medium'),
  success: (H) => H.notificationAsync?.(H.NotificationFeedbackType?.Success ?? 'success'),
  warning: (H) => H.notificationAsync?.(H.NotificationFeedbackType?.Warning ?? 'warning'),
  error: (H) => H.notificationAsync?.(H.NotificationFeedbackType?.Error ?? 'error'),
};

export function haptic(kind) {
  const run = HAPTICS[kind];
  if (!run || Platform.OS === 'web') return;
  try {
    // require, а не import: збірка без модуля не має падати на старті
    Promise.resolve(run(require('expo-haptics'))).catch(() => {});
  } catch (_) {}
}

// Пружина, що поважає системне налаштування: при reduced motion
// віддаємо коротке загасання без перельоту.
export function safeSpring(preset = SPRING.ui) {
  return reducedCache ? { ...preset, damping: Math.max(preset.damping, 2 * Math.sqrt(preset.stiffness)) } : preset;
}

// Наскільки взагалі рухати елемент по осі: при reduced motion — нікуди.
export function travel(px) {
  return reducedCache ? 0 : px;
}

// ─── Розгортання блоків ───────────────────────────────────────────────────
// Пресет easeInEaseOut тягне за собою ease-in, який на UI заборонений:
// він гальмує саме на старті. Беремо чистий easeOut і власну тривалість.
export function layoutNext(duration = DUR.panel) {
  if (reducedCache) return; // при reduced motion блок просто змінює розмір
  LayoutAnimation.configureNext({
    duration,
    create: { type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
    update: { type: LayoutAnimation.Types.easeOut },
    delete: { duration: DUR.exit, type: LayoutAnimation.Types.easeOut, property: LayoutAnimation.Properties.opacity },
  });
}
