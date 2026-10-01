// Лінійні іконки LinguaLens — один-в-один із набором Icon у Figma.
//
// Правила набору: сітка 24, товщина штриха 1.75, круглі кінці й стики,
// жодних заливок. Геометрія спрощена до впізнаваного мінімуму — на 24px
// зайва деталь перетворюється на пляму. Колір задається зверху.
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { C } from './theme';

const DIM = C.dim;

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
export function IcScan({ size = 24, color = DIM }) {
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

export function IcBook({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H18a2 2 0 0 1 2 2v11H6a2 2 0 0 0-2 2z" {...S(color)} />
      <Path d="M4 18.5A2.5 2.5 0 0 0 6.5 21H20" {...S(color)} />
      <Path d="M8.5 8h7" {...S(color)} />
    </Svg>
  );
}

// Флешкартки: дві картки стосом, задня трохи повернута.
export function IcCards({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Rect x="3" y="7.5" width="13" height="13" rx="3" {...S(color)} />
      <Path d="M7.5 4.2 17.8 3a2.5 2.5 0 0 1 2.7 2.2l1.1 9.4" {...S(color)} />
    </Svg>
  );
}

export function IcUser({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="8" r="3.8" {...S(color)} />
      <Path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" {...S(color)} />
    </Svg>
  );
}

// Налаштування — повзунки, не шестерня: на 24px шестерня читається як сонце.
export function IcSliders({ size = 24, color = DIM }) {
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

export function IcSpeaker({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M11 4.5 6.5 8.5H3.5v7h3l4.5 4z" {...S(color)} />
      <Path d="M15 9.2a4 4 0 0 1 0 5.6M17.9 6.3a8 8 0 0 1 0 11.4" {...S(color)} />
    </Svg>
  );
}

export function IcCheck({ size = 20, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" {...S(color, 2)} />
    </Svg>
  );
}

export function IcChevron({ size = 20, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M6 9.5 12 15.5 18 9.5" {...S(color, 2)} />
    </Svg>
  );
}

export function IcClose({ size = 20, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M6 6 18 18M18 6 6 18" {...S(color, 2)} />
    </Svg>
  );
}

// «Поділитись» у мові iOS: стрілка вгору з коробки. Користувач iPhone
// впізнає її миттєво — свій варіант тут лише заважав би.
export function IcShare({ size = 20, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M12 3.5v11M8 7.5l4-4 4 4" {...S(color)} />
      <Path d="M8.5 10.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6.5a2 2 0 0 0-2-2h-1.5" {...S(color)} />
    </Svg>
  );
}

export function IcSearch({ size = 20, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Circle cx="10.8" cy="10.8" r="6.8" {...S(color)} />
      <Path d="M15.8 15.8 21 21" {...S(color, 2)} />
    </Svg>
  );
}

export function IcPlus({ size = 22, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M12 5v14M5 12h14" {...S(color, 2)} />
    </Svg>
  );
}

// Око з перекресленням — показати/сховати пароль.
export function IcEye({ size = 20, color = DIM, off = false }) {
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
export function IcFlame({ size = 24, color = DIM }) {
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
export function IcMedal({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Circle cx="12" cy="14.5" r="6" {...S(color)} />
      <Path d="M8.5 9.2 6 3h12l-2.5 6.2" {...S(color)} />
    </Svg>
  );
}

// Статистика: три стовпчики різної висоти.
export function IcChart({ size = 24, color = DIM }) {
  return (
    <Svg {...box(size)}>
      <Path d="M4 20.5V13M12 20.5V5M20 20.5v-10" {...S(color, 2.4)} />
    </Svg>
  );
}

export function IcBell({ size = 24, color = DIM }) {
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
export function IcCloud({ size = 24, color = DIM, done = false }) {
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
