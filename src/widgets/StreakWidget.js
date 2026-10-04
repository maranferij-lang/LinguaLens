// Віджет «Серія» — малий, середній і екран блокування (коло, прямокутник,
// рядок). widgets.md §5.3 з поправками плану: вогник — SF Symbol, що росте
// за стадією (flameStage), без картинок і Lingo.
//
//   стадія 0 — контур «flame» (серії немає чи згасла);
//   1–2 — «flame.fill» бурштином, щодня більший;
//   3–4 — бурштиново-помаранчевий градієнт, іскри й тепле тло (тиждень+);
//   день без дії — вогник тьмяніє, з 18:00 — таймер до півночі.
//
// Правила розмітки — як у src/widgets/WordOfDayWidget.js (простий
// синтаксис, нічого з області модуля, жодних padding чи background на
// Text). Дані — src/widgets/streakTimeline.js.
import { Circle, Gauge, HStack, Image, Label, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  background,
  containerBackground,
  contentTransition,
  font,
  foregroundStyle,
  frame,
  gaugeStyle,
  lineLimit,
  minimumScaleFactor,
  monospacedDigit,
  opacity,
  padding,
  shapes,
  strokeBorder,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const Streak = (props, environment) => {
  'widget';
  const family = environment.widgetFamily || 'systemSmall';
  const mode = environment.widgetRenderingMode;
  const tinted = mode === 'vibrant' || mode === 'accented';
  const dark = environment.colorScheme === 'dark' || environment.showsContainerBackground === false;
  const pal = props.pal ? (dark ? props.pal.d : props.pal.l) : null;
  const pick = (key, light, night) => (pal && pal[key] ? pal[key] : dark ? night : light);
  const primary = { type: 'hierarchical', style: 'primary' };
  const secondary = { type: 'hierarchical', style: 'secondary' };
  const tertiary = { type: 'hierarchical', style: 'tertiary' };
  const quaternary = { type: 'hierarchical', style: 'quaternary' };
  const bg = pick('bg', '#FAF8F4', '#151412');
  const ink = tinted ? primary : pick('ink', '#1C1B19', '#F5F2EC');
  const dim = tinted ? secondary : pick('dim', '#6E6A62', '#A9A49B');
  const faint = tinted ? tertiary : pick('faint', '#8A857C', '#8A857D');
  const chip = tinted ? quaternary : pick('chip', '#F1EEE8', '#2A2825');
  const warmRaw = pick('warm', '#E0A02E', '#F0B84A');
  const warm = tinted ? primary : warmRaw;
  const warmSoft = tinted ? quaternary : pick('warmSoft', '#FBF1DF', '#372C15');
  const warmInk = tinted ? secondary : pick('warmInk', '#886424', '#F0B84A');

  const n = props.n || '0';
  const stage = Number(props.stage) || 0;
  const state = props.state || 'none';
  const done = state === 'done';
  // день ще без дії: вогник тьмяніє (як pending у застосунку — 45 %)
  const waiting = state === 'pending' || state === 'late';
  const timed = !!props.until;
  const lit = stage >= 3 && !tinted;
  const link = (props.link || 'lingualens://streak') + ((props.link || '').indexOf('?') < 0 ? '?f=' : '&f=') + family;
  const a11y = [accessibilityElement('combine'), accessibilityLabel(props.a11y || 'LinguaLens')];
  const rounded = (size, weight) => font({ size: size, weight: weight, design: 'rounded' });

  // Вогник: розмір за стадією, на 3+ — градієнт від бурштину до помаранчу.
  const flameStyle = tinted
    ? primary
    : stage === 0
    ? faint
    : lit
    ? { type: 'linearGradient', colors: ['#FFC24B', warmRaw, '#F0602A'], startPoint: { x: 0.5, y: 0 }, endPoint: { x: 0.5, y: 1 } }
    : warmRaw;
  const flame = (size) => (
    <ZStack alignment="topTrailing" modifiers={[frame({ width: Math.round(size * 1.25), height: Math.round(size * 1.2) })]}>
      <Image
        systemName={stage === 0 ? 'flame' : 'flame.fill'}
        size={size}
        modifiers={[foregroundStyle(flameStyle), opacity(waiting ? 0.45 : 1), frame({ maxWidth: Infinity, maxHeight: Infinity })]}
      />
      {lit && !waiting ? <Image systemName="sparkles" size={Math.max(9, Math.round(size * 0.32))} modifiers={[foregroundStyle(warmRaw)]} /> : null}
    </ZStack>
  );
  // Число серії: «перекручується», коли застосунок оновлює серію.
  const number = (size) => (
    <Text modifiers={[rounded(size, 'heavy'), foregroundStyle(n === '0' ? faint : ink), monospacedDigit(), contentTransition('numericText'), lineLimit(1)]}>
      {n}
    </Text>
  );
  // Таймер до півночі — тікає сам, без нових записів таймлайну.
  const lower = environment.date || new Date();
  const upper = props.until ? new Date(Number(props.until)) : null;
  const timer =
    timed && upper && upper > lower ? (
      <HStack spacing={4} modifiers={[padding({ horizontal: 8, vertical: 3 }), background(warmSoft, shapes.capsule())]}>
        <Image systemName="clock" size={11} modifiers={[foregroundStyle(warmInk)]} />
        <Text
          timerInterval={{ lower: lower, upper: upper }}
          countsDown={true}
          modifiers={[rounded(12, 'heavy'), foregroundStyle(warmInk), monospacedDigit(), lineLimit(1)]}
        />
      </HStack>
    ) : null;
  const phraseColor = timed ? warmInk : dim;

  // ── Екран блокування ──
  if (family === 'accessoryInline') {
    return (
      <Label
        title={props.inline || n}
        systemImage={stage === 0 ? 'flame' : 'flame.fill'}
        modifiers={[containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}
      />
    );
  }
  if (family === 'accessoryCircular') {
    // Кільце — прогрес до наступної віхи; Gauge без підписів (у віджеті вони
    // губляться), вогник і число — поверх.
    return (
      <ZStack modifiers={[containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}>
        <Gauge value={Number(props.goal) || 0} modifiers={[gaugeStyle('circular')]} />
        <VStack spacing={0}>
          <Image systemName={stage === 0 ? 'flame' : 'flame.fill'} size={12} modifiers={[foregroundStyle(primary)]} />
          <Text modifiers={[rounded(18, 'heavy'), foregroundStyle(primary), monospacedDigit(), lineLimit(1), minimumScaleFactor(0.6)]}>{n}</Text>
        </VStack>
      </ZStack>
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <HStack
        alignment="center"
        spacing={8}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}
      >
        <Image systemName={stage === 0 ? 'flame' : 'flame.fill'} size={30} modifiers={[foregroundStyle(primary)]} />
        <VStack alignment="leading" spacing={0}>
          <Text modifiers={[rounded(17, 'bold'), foregroundStyle(primary), lineLimit(1), minimumScaleFactor(0.7)]}>{props.inline || n}</Text>
          <Text modifiers={[rounded(13, 'medium'), foregroundStyle(secondary), lineLimit(2), minimumScaleFactor(0.85)]}>{props.short || ''}</Text>
        </VStack>
      </HStack>
    );
  }

  // ── Головний екран ──
  const legacy = !environment.widgetContentMargins;
  // з тижня — тепле тло: від крейди до бурштинової імли
  const fill = lit && done ? { type: 'linearGradient', colors: [pick('warmSoft', '#FBF1DF', '#372C15'), bg], startPoint: { x: 1, y: 0 }, endPoint: { x: 0, y: 1 } } : bg;
  const shell = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]
    .concat(legacy ? [padding({ all: 16 }), background(fill)] : [])
    .concat([containerBackground(fill, 'widget'), widgetURL(link)])
    .concat(a11y);

  if (family === 'systemSmall') {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        <HStack alignment="top" spacing={0}>
          {number(46)}
          <Spacer />
          {flame([22, 22, 28, 34, 40][stage] || 22)}
        </HStack>
        <Text modifiers={[rounded(15, 'bold'), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.7)]}>{props.unit || ''}</Text>
        <Spacer />
        <VStack alignment="leading" spacing={5}>
          {timer}
          <Text modifiers={[rounded(13, 'semibold'), foregroundStyle(phraseColor), lineLimit(3), minimumScaleFactor(0.85)]}>
            {done ? props.line || '' : props.short || props.line || ''}
          </Text>
        </VStack>
      </VStack>
    );
  }

  // ── Середній: вогник і число, тиждень кружечками, фраза ──
  const week = Array.isArray(props.week) ? props.week : [];
  const day = (d, i) => {
    const today = d.s === 'today' || d.s === 'pending';
    const on = d.s === 'done' || d.s === 'today';
    const dot = on ? (
      <ZStack modifiers={[frame({ width: 24, height: 24 })]}>
        <Circle modifiers={[foregroundStyle(warm)]} />
        <Image systemName="flame.fill" size={11} modifiers={[foregroundStyle(tinted ? { type: 'hierarchical', style: 'quinary' } : '#FFFFFF')]} />
      </ZStack>
    ) : d.s === 'pending' ? (
      <ZStack
        modifiers={[frame({ width: 24, height: 24 }), strokeBorder({ content: warm, style: { lineWidth: 2, dash: [3, 3] }, shape: 'circle' })]}
      />
    ) : (
      <Circle modifiers={[frame({ width: 24, height: 24 }), foregroundStyle(chip), opacity(d.s === 'future' ? 0.55 : 1)]} />
    );
    return (
      <VStack key={'d' + i} spacing={3} modifiers={[frame({ maxWidth: Infinity })]}>
        {dot}
        <Text modifiers={[rounded(10, today ? 'heavy' : 'semibold'), foregroundStyle(today ? ink : faint), lineLimit(1), minimumScaleFactor(0.7)]}>
          {d.d || ' '}
        </Text>
      </VStack>
    );
  };
  return (
    <VStack alignment="leading" spacing={0} modifiers={shell}>
      <HStack alignment="center" spacing={8}>
        {flame(26)}
        <HStack alignment="firstTextBaseline" spacing={6}>
          {number(34)}
          <Text modifiers={[rounded(15, 'bold'), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.7)]}>{props.unit || ''}</Text>
        </HStack>
        <Spacer />
        {timer}
      </HStack>
      <Spacer />
      <HStack alignment="top" spacing={2}>
        {week.map(day)}
      </HStack>
      <Spacer />
      <Text modifiers={[rounded(13, 'semibold'), foregroundStyle(phraseColor), lineLimit(2), minimumScaleFactor(0.85)]}>{props.line || ''}</Text>
    </VStack>
  );
};

export default createWidget('Streak', Streak);
