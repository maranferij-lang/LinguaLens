// Лінійні іконки LinguaLens — один-в-один із набором Icon у Figma.
//
// Правила набору: сітка 24, товщина штриха 1.75, круглі кінці й стики,
// жодних заливок. Геометрія спрощена до впізнаваного мінімуму — на 24px
// зайва деталь перетворюється на пляму. Колір задається зверху; без нього
// іконка бере dim поточної теми (а не світлої, як було зі статичним імпортом).
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useTheme } from './theme';

// Колір іконки: заданий зверху або dim теми, що зараз у провайдері
const useInk = (color) => {
  const { C } = useTheme();
  return color ?? C.dim;
};

// Спільні атрибути штриха. Товщина не масштабується разом із розміром:
// на 18px тонший штрих виглядав би вицвілим, на 30px — товстіший грубим.
const S = (color, w = 1.75) => ({
  fill: 'none',
  stroke: color,
  strokeWidth: w,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

const box = (size) => ({ width: size, height: size, viewBox: '0 0 24 24' });

// ─── Навігація ──────────────────────────────────────────────────────────────

// Сканер: кути видошукача + об'єктив. Рамка з чотирьох кутів, а не суцільна,
// бо суцільна на екрані камери перекриває предмет.
export function IcScan({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path
        d="M3 8.5V6a3 3 0 0 1 3-3h2.5M15.5 3H18a3 3 0 0 1 3 3v2.5M21 15.5V18a3 3 0 0 1-3 3h-2.5M8.5 21H6a3 3 0 0 1-3-3v-2.5"
        {...S(color)}
      />
      <Circle cx="12" cy="12" r="3.2" {...S(color)} />
    </Svg>
  );
}

export function IcBook({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v11H6a2 2 0 0 0-2 2z" {...S(color)} />
      <Path d="M4 18.5A2.5 2.5 0 0 0 6.5 21H20" {...S(color)} />
      <Path d="M8.5 8h7" {...S(color)} />
    </Svg>
  );
}

// Флешкартки: дві картки стосом, задня трохи повернута.
export function IcCards({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="7.5" width="13" height="13" rx="3" {...S(color)} />
      <Path d="M7.5 4.2 17.8 3a2.5 2.5 0 0 1 2.7 2.2l1.1 9.4" {...S(color)} />
    </Svg>
  );
}

export function IcUser({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="8" r="3.8" {...S(color)} />
      <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...S(color)} />
    </Svg>
  );
}

// Налаштування — повзунки, не шестерня: на 24px шестерня читається як сонце.
export function IcSliders({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M3.5 8h4M12.5 8h8M3.5 16h8M16.5 16h4" {...S(color)} />
      <Circle cx="10" cy="8" r="2.6" {...S(color)} />
      <Circle cx="14" cy="16" r="2.6" {...S(color)} />
    </Svg>
  );
}
export const IcGear = IcSliders; // старе ім'я, щоб не ламати імпорти

// ─── Дії ────────────────────────────────────────────────────────────────────

export function IcSpeaker({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M11 4.5 6.5 8.5H3.5v7h3l4.5 4z" {...S(color)} />
      <Path d="M15 9.2a4 4 0 0 1 0 5.6M17.9 6.3a8 8 0 0 1 0 11.4" {...S(color)} />
    </Svg>
  );
}

export function IcCheck({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" {...S(color, 2)} />
    </Svg>
  );
}

export function IcChevron({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M6 9.5 12 15.5 18 9.5" {...S(color, 2)} />
    </Svg>
  );
}

export function IcClose({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M6 6 18 18M18 6 6 18" {...S(color, 2)} />
    </Svg>
  );
}

// «Поділитись» у мові iOS: стрілка вгору з коробки. Користувач iPhone
// впізнає її миттєво — свій варіант тут лише заважав би.
export function IcShare({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M12 3.5v11M8 7.5l4-4 4 4" {...S(color)} />
      <Path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" {...S(color)} />
    </Svg>
  );
}

// Instagram Stories: камера-«квадратик» з об'єктивом і спалахом. Свій
// лінійний гліф за правилами набору, а не логотип Meta: впізнається
// силуетом, а підпис на кнопці каже решту.
export function IcStories({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="3.5" y="3.5" width="17" height="17" rx="5" {...S(color)} />
      <Circle cx="12" cy="12" r="4" {...S(color)} />
      <Circle cx="16.9" cy="7.1" r="0.6" {...S(color, 1.5)} />
    </Svg>
  );
}

export function IcSearch({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Circle cx="10.8" cy="10.8" r="6.8" {...S(color)} />
      <Path d="M15.8 15.8 21 21" {...S(color, 2)} />
    </Svg>
  );
}

export function IcPlus({ size = 22, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M12 5v14M5 12h14" {...S(color, 2)} />
    </Svg>
  );
}

// Око з перекресленням — показати/сховати пароль.
export function IcEye({ size = 20, color: ink, off = false }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" {...S(color)} />
      <Circle cx="12" cy="12" r="3.1" {...S(color)} />
      {off ? <Path d="M4 20 20 4" {...S(color)} /> : null}
    </Svg>
  );
}

// ─── Статуси ────────────────────────────────────────────────────────────────

// Полум'я серії: гострий язик із внутрішнім завитком.
export function IcFlame({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path
        d="M12 2.5s5.5 4.6 5.5 9.4a5.5 5.5 0 0 1-11 0c0-1.7.8-3.2 1.8-4.4.3 1.3 1.1 2.2 2 2.2 1.6 0 1.4-4.2 1.7-7.2z"
        {...S(color)}
      />
    </Svg>
  );
}

// Досягнення: медаль-коло зі стрічкою.
export function IcMedal({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="14.5" r="6" {...S(color)} />
      <Path d="M8.5 9.2 6 3h12l-2.5 6.2" {...S(color)} />
    </Svg>
  );
}

// Статистика: три стовпчики різної висоти.
export function IcChart({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M4 20.5V13M12 20.5V5M20 20.5v-10" {...S(color, 2.4)} />
    </Svg>
  );
}

export function IcBell({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M6.2 10a5.8 5.8 0 0 1 11.6 0c0 4 1.2 5.6 1.9 6.3H4.3c.7-.7 1.9-2.3 1.9-6.3z" {...S(color)} />
      <Path d="M10 19.5a2.2 2.2 0 0 0 4 0" {...S(color)} />
    </Svg>
  );
}

// Резервна копія словника: хмара зі стрілкою вгору («збережи»), а коли
// вхід виконано — з галочкою («збережено»). Хмара, а не замок чи щит:
// це про копію слів, а не про безпеку.
export function IcCloud({ size = 24, color: ink, done = false }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M7.2 19h10a4.3 4.3 0 0 0 .5-8.57 5.75 5.75 0 0 0-11.1-1.1A4.9 4.9 0 0 0 7.2 19z" {...S(color)} />
      {done ? (
        <Path d="M9.2 14.1l2 2 3.8-4.1" {...S(color)} />
      ) : (
        <Path d="M12 16.2v-5.4M9.6 13.1 12 10.7l2.4 2.4" {...S(color)} />
      )}
    </Svg>
  );
}

// ─── Цілі навчання (онбординг, src/ProfileSteps.js) ────────────────────────

// Робота: портфель із ручкою й лінією замка.
export function IcBriefcase({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="7" width="18" height="13" rx="3" {...S(color)} />
      <Path d="M8.5 7V5.5A1.5 1.5 0 0 1 10 4h4a1.5 1.5 0 0 1 1.5 1.5V7M3 12.5h18" {...S(color)} />
    </Svg>
  );
}

// Навчання: академічна шапка — ромб і стрічка-китиця.
export function IcCap({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M2.5 9 12 4.5 21.5 9 12 13.5z" {...S(color)} />
      <Path d="M6.5 11v4.5c0 1.5 2.5 3 5.5 3s5.5-1.5 5.5-3V11M21.5 9v5" {...S(color)} />
    </Svg>
  );
}

// Подорожі: літак збоку, ніс праворуч угору.
export function IcPlane({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path
        d="M10.2 13.8 4 12.2l-1-2 6.6.5 4.9-5.4a1.9 1.9 0 0 1 2.7 2.7l-5.4 4.9.5 6.6-2 -1z"
        {...S(color)}
      />
    </Svg>
  );
}

// Переїзд: дім, у якого відчинені двері.
export function IcHome({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M3.5 10.5 12 3.5l8.5 7" {...S(color)} />
      <Path d="M5.5 9v9.5a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V9" {...S(color)} />
      <Path d="M10 20.5v-5a2 2 0 0 1 4 0v5" {...S(color)} />
    </Svg>
  );
}

// Для себе: серце — без «прогресу» й «цілей», просто для задоволення.
export function IcHeart({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path
        d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"
        {...S(color)}
      />
    </Svg>
  );
}

// ─── Що заважає (онбординг, src/ProfileSteps.js) ───────────────────────────

// Бракує часу: циферблат зі стрілками на «за п'ять хвилин».
export function IcClock({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="12" r="8.5" {...S(color)} />
      <Path d="M12 7.5V12l3 2" {...S(color)} />
    </Svg>
  );
}

// Не знаю, з чого почати: компас — коло зі стрілкою-ромбом.
export function IcCompass({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="12" r="8.5" {...S(color)} />
      <Path d="m15.2 8.8-1.9 4.5-4.5 1.9 1.9-4.5z" {...S(color)} />
    </Svg>
  );
}

// ─── v1.3: сканер, наліпки, «Навчання» ─────────────────────────────────────
// IcEye (вище) уже є — «Показати переклад» бере його.

// Ліхтарик: блискавка, як у Камері iOS. off — перекреслена (ліхтарик
// вимкнено), щоб стан читався не лише кольором.
export function IcBolt({ size = 22, color: ink, off = false }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M13.2 2.8 5.4 13.2h6.2l-1 8 8-10.4h-6.2z" {...S(color)} />
      {off ? <Path d="M4 4 20 20" {...S(color)} /> : null}
    </Svg>
  );
}

// Замок: закрита картка чи квіз, Pro-палітра.
export function IcLock({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="4.5" y="10.5" width="15" height="10" rx="3" {...S(color)} />
      <Path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2" {...S(color)} />
    </Svg>
  );
}

// Іскра: «Відкрито!», нове. Велика зірка й мала поруч.
export function IcSparkle({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M10.5 3.5c.6 4 2.5 5.9 6.5 6.5-4 .6-5.9 2.5-6.5 6.5-.6-4-2.5-5.9-6.5-6.5 4-.6 5.9-2.5 6.5-6.5z" {...S(color)} />
      <Path d="M18.5 15c.3 1.6 1 2.2 2.5 2.5-1.5.3-2.2 1-2.5 2.5-.3-1.5-1-2.2-2.5-2.5 1.5-.3 2.2-.9 2.5-2.5z" {...S(color, 1.5)} />
    </Svg>
  );
}

// Попередження: трикутник зі знаком оклику (помилка скану, серія під загрозою).
export function IcWarn({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M10.3 4.4a2 2 0 0 1 3.4 0l7.5 13a2 2 0 0 1-1.7 3H4.5a2 2 0 0 1-1.7-3z" {...S(color)} />
      <Path d="M12 9.5v4.2" {...S(color)} />
      <Path d="M12 17.1h.01" {...S(color, 2.4)} />
    </Svg>
  );
}

// Копіювати: два аркуші стосом.
export function IcCopy({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="8.5" y="8.5" width="12" height="12" rx="3" {...S(color)} />
      <Path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5" {...S(color)} />
    </Svg>
  );
}

// Зберегти у «Фото»: стрілка вниз у лоток.
export function IcDownload({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M12 3.5v11M7.5 10l4.5 4.5 4.5-4.5" {...S(color)} />
      <Path d="M4.5 15.5V18A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5v-2.5" {...S(color)} />
    </Svg>
  );
}

// Ще: три крапки. Крапки — штрихи нульової довжини з круглими кінцями,
// тож правило «без заливок» тримається.
export function IcMore({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Path d="M5.5 12h.01M12 12h.01M18.5 12h.01" {...S(color, 2.8)} />
    </Svg>
  );
}

// Фото з галереї: рамка, сонце й пагорби.
export function IcPhoto({ size = 20, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="3.5" y="4.5" width="17" height="15" rx="3" {...S(color)} />
      <Circle cx="9" cy="9.8" r="1.8" {...S(color)} />
      <Path d="M3.8 16.6 8.6 12.4l3.4 3 4.1-3.9 4.1 4" {...S(color)} />
    </Svg>
  );
}

// Сцена на затворі: кілька предметів кімнати (як PRoom у пейволі, але без
// кутів видошукача — рамкою тут є сам затвор).
export function IcRoom({ size = 24, color: ink }) {
  const color = useInk(ink);
  return (
    <Svg {...box(size)}>
      <Rect x="4" y="4.5" width="7" height="7" rx="2" {...S(color)} />
      <Circle cx="16.5" cy="8" r="3.5" {...S(color)} />
      <Path d="M4 19.5h16M9 19.5l3-4.6 3 4.6" {...S(color)} />
    </Svg>
  );
}
