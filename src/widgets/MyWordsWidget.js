// Віджет «Мої слова» — збережені слова людини по черзі, спершу ті, що час
// повторити (widgets.md §5.2): малий, середній, великий і екран блокування.
//
// Правила розмітки — ті самі, що в src/widgets/WordOfDayWidget.js: лише
// @expo/ui/swift-ui, нічого з області модуля, простий синтаксис, жодних
// padding чи background на Text (у віджеті вони подвоюються). Дані готує
// src/widgets/wordsTimeline.js.
//
// Картинка — мініатюра предмета, який людина зняла сама (thumbs.js). Під
// нею завжди лежить плитка з літерою: файл зник (оновлення, стирання) —
// видно плитку, а розмітка не зсувається.
import { Button, HStack, Image, Link, ProgressView, Rectangle, Spacer, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  allowsTightening,
  aspectRatio,
  background,
  buttonStyle,
  clipShape,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  invalidatableContent,
  kerning,
  layoutPriority,
  lineLimit,
  minimumScaleFactor,
  padding,
  progressViewStyle,
  resizable,
  shapes,
  textCase,
  tint,
  widgetAccentedRenderingMode,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const MyWords = (props, environment) => {
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
  const soft = tinted ? primary : pick('soft', '#3E3B36', '#DCD7CF');
  const dim = tinted ? secondary : pick('dim', '#6E6A62', '#A9A49B');
  const faint = tinted ? tertiary : pick('faint', '#8A857C', '#8A857D');
  const accent = tinted ? secondary : pick('accent', '#5B4FD6', '#9B8FFF');
  const accentSoft = tinted ? quaternary : pick('accentSoft', '#E4E1FB', '#221E45');
  const onAccent = tinted ? primary : pick('onAccent', '#FFFFFF', '#100C2E');
  const sep = tinted ? quaternary : pick('sep', '#E8E4DC', '#302D29');
  const warmSoft = tinted ? quaternary : pick('warmSoft', '#FBF1DF', '#372C15');
  const warmInk = tinted ? secondary : pick('warmInk', '#886424', '#F0B84A');
  const green = tinted ? secondary : pick('green', '#0E8C82', '#3ED8CB');

  const home = family.indexOf('system') === 0;
  const small = family === 'systemSmall';
  const medium = family === 'systemMedium';
  const large = family === 'systemLarge';
  const legacy = !environment.widgetContentMargins;
  const hidden = home && !legacy && props.hide === '1' && props.revealed !== '1';
  const hasWord = props.state === 'word' && !!props.word;
  const message = props.message || 'LinguaLens';
  const withFamily = (url) => url + (url.indexOf('?') < 0 ? '?f=' : '&f=') + family;
  const link = withFamily(props.link || 'lingualens://word-of-day');
  const label = hidden ? props.a11yShort || props.a11y || message : props.a11y || message;
  const a11y = [accessibilityElement('contain'), accessibilityLabel(label)];
  const rounded = (size, weight) => font({ size: size, weight: weight, design: 'rounded' });
  const caps = (color) => [rounded(11, 'heavy'), foregroundStyle(color), textCase('uppercase'), kerning(0.8), lineLimit(1)];
  const src = (photo) => (photo ? (photo.indexOf('://') > 0 ? photo : (props.dir || '') + photo) : '');

  // Плитка з літерою, а поверх — фото (якщо файл прочитався).
  const tile = (size, photo, letter) => {
    const r = Math.round(size * 0.24);
    const uri = src(photo);
    return (
      <ZStack modifiers={[frame({ width: size, height: size })]}>
        <ZStack modifiers={[frame({ width: size, height: size }), background(accentSoft, shapes.roundedRectangle({ cornerRadius: r }))]}>
          <Text modifiers={[rounded(Math.round(size * 0.46), 'heavy'), foregroundStyle(accent)]}>{letter || ' '}</Text>
        </ZStack>
        {uri ? (
          <Image
            uiImage={uri}
            modifiers={[
              resizable(),
              aspectRatio({ contentMode: 'fill' }),
              frame({ width: size, height: size }),
              clipShape('roundedRectangle', r),
              widgetAccentedRenderingMode('desaturated'),
            ]}
          />
        ) : null}
      </ZStack>
    );
  };

  // ── Екран блокування ──
  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}>
        {hasWord ? props.line || props.word : props.line || message}
      </Text>
    );
  }
  if (family === 'accessoryRectangular') {
    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}
      >
        <Text modifiers={caps(secondary)}>{props.caption || 'LinguaLens'}</Text>
        <Text modifiers={[rounded(19, 'bold'), foregroundStyle(primary), lineLimit(1), minimumScaleFactor(0.6), allowsTightening(true)]}>
          {hasWord ? props.word : message}
        </Text>
        {hasWord && props.translation ? (
          <Text modifiers={[rounded(15, 'semibold'), foregroundStyle(secondary), lineLimit(1), minimumScaleFactor(0.8)]}>
            {props.translation}
          </Text>
        ) : null}
      </VStack>
    );
  }

  // ── Головний екран ──
  const shell = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]
    .concat(legacy ? [padding({ all: 16 }), background(bg)] : [])
    .concat([containerBackground(bg, 'widget'), widgetURL(link)])
    .concat(a11y);
  const caption = <Text modifiers={caps(accent).concat([minimumScaleFactor(0.7)])}>{props.caption || 'LinguaLens'}</Text>;

  if (!hasWord) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {caption}
        <Spacer />
        <VStack alignment="leading" spacing={4}>
          <Image systemName="sparkles" size={20} modifiers={[foregroundStyle(accent)]} />
          <Text modifiers={[rounded(small ? 16 : 18, 'bold'), foregroundStyle(ink), lineLimit(3), minimumScaleFactor(0.8)]}>{message}</Text>
          {props.hint ? (
            <Text modifiers={[rounded(13, 'medium'), foregroundStyle(dim), lineLimit(2), minimumScaleFactor(0.85)]}>{props.hint}</Text>
          ) : null}
        </VStack>
      </VStack>
    );
  }

  const reveal = (long) => (
    <Button
      target="reveal"
      onPress={() => ({ revealed: '1' })}
      modifiers={[buttonStyle('plain'), accessibilityLabel(props.revealLong || 'Show translation')]}
    >
      <HStack spacing={5} modifiers={[padding({ horizontal: 10, vertical: 5 }), background(accentSoft, shapes.capsule()), invalidatableContent()]}>
        <Image systemName="eye" size={12} modifiers={[foregroundStyle(accent)]} />
        <Text modifiers={[rounded(13, 'bold'), foregroundStyle(accent), lineLimit(1), minimumScaleFactor(0.8)]}>
          {long ? props.revealLong : props.revealShort}
        </Text>
      </HStack>
    </Button>
  );
  // «⏱ 12» / «⏱ 12 на повторення» — скільки слів уже чекає
  const due = (long) =>
    props.due ? (
      <HStack spacing={4} modifiers={[padding({ horizontal: 8, vertical: 3 }), background(warmSoft, shapes.capsule())]}>
        <Image systemName="clock" size={11} modifiers={[foregroundStyle(warmInk)]} />
        <Text modifiers={[rounded(12, 'heavy'), foregroundStyle(warmInk), lineLimit(1)]}>{long ? props.dueLabel : props.due}</Text>
      </HStack>
    ) : null;
  const word = (size) => (
    <Text modifiers={[rounded(size, 'bold'), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.45), allowsTightening(true)]}>
      {props.word}
    </Text>
  );
  const ipa = props.ipa ? (
    <Text modifiers={[rounded(small ? 12 : 13, 'regular'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>{props.ipa}</Text>
  ) : null;
  const translation = (size) =>
    props.translation ? (
      <Text modifiers={[rounded(size, 'semibold'), foregroundStyle(soft), lineLimit(small ? 2 : 1), minimumScaleFactor(0.75), layoutPriority(1)]}>
        {props.translation}
      </Text>
    ) : null;
  const example = (size, lines) =>
    props.example ? (
      <Text markdownEnabled={props.md === '1'} modifiers={[rounded(size, 'medium'), foregroundStyle(dim), lineLimit(lines)]}>
        {props.example}
      </Text>
    ) : null;

  // ── Малий: кепс, мініатюра (чи літера) у куті, слово, транскрипція,
  // «Переклад». Плитка лежить поверх кута, а не в ряду з кепсом: так слову
  // й кнопці лишається висота навіть на SE.
  if (small) {
    return (
      <ZStack alignment="topTrailing" modifiers={shell}>
        <VStack alignment="leading" spacing={0} modifiers={[frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]}>
          <HStack spacing={0} modifiers={[padding({ trailing: 50 })]}>
            {caption}
          </HStack>
          <Spacer />
          {word(28)}
          {ipa}
          <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 6 })]}>
            {hidden ? reveal(false) : translation(15)}
          </VStack>
        </VStack>
        {tile(44, props.photo, props.letter)}
      </ZStack>
    );
  }

  // ── Середній: фото чи літера ліворуч, слово праворуч ──
  if (medium) {
    return (
      <HStack alignment="center" spacing={14} modifiers={shell}>
        {tile(104, props.photo, props.letter)}
        <VStack alignment="leading" spacing={0}>
          <HStack alignment="center" spacing={6}>
            {caption}
            <Spacer />
            {due(false)}
          </HStack>
          <Spacer />
          {word(30)}
          {ipa}
          <VStack alignment="leading" spacing={2} modifiers={[padding({ top: 6 })]}>
            {hidden ? reveal(true) : translation(16)}
            {hidden ? null : example(12, 1)}
          </VStack>
        </VStack>
      </HStack>
    );
  }

  // ── Великий: слово, приклад, три наступні (кожне — своє посилання) ──
  const next = Array.isArray(props.next) ? props.next : [];
  const rule = (
    <VStack spacing={0} modifiers={[padding({ vertical: 10 })]}>
      <Rectangle modifiers={[frame({ height: 1 }), foregroundStyle(sep)]} />
    </VStack>
  );
  return (
    <VStack alignment="leading" spacing={0} modifiers={shell}>
      <HStack alignment="center" spacing={8}>
        {caption}
        <Spacer />
        {due(true)}
      </HStack>
      <HStack alignment="center" spacing={14} modifiers={[padding({ top: 10 })]}>
        {tile(68, props.photo, props.letter)}
        <VStack alignment="leading" spacing={2}>
          {word(32)}
          {ipa}
          <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 4 })]}>
            {hidden ? reveal(true) : translation(18)}
          </VStack>
        </VStack>
      </HStack>
      <VStack alignment="leading" spacing={2} modifiers={[padding({ top: 10 })]}>
        {example(14, hidden || !props.exampleTr ? 2 : 1)}
        {!hidden && props.exampleTr ? (
          <Text modifiers={[rounded(12, 'regular'), foregroundStyle(faint), lineLimit(1)]}>{props.exampleTr}</Text>
        ) : null}
      </VStack>
      {next.length ? rule : null}
      {next.length ? <Text modifiers={caps(faint)}>{props.nextTitle}</Text> : null}
      {next.map((n, i) => (
        <Link key={'next' + i} destination={withFamily('lingualens://word/' + encodeURIComponent(n.id) + '?from=widget&w=words')}>
          <HStack alignment="center" spacing={10} modifiers={[padding({ top: 5 })]}>
            {tile(24, n.photo, n.letter)}
            <Text modifiers={[rounded(16, 'bold'), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.8)]}>{n.w}</Text>
            {hidden ? (
              <Text modifiers={[rounded(15, 'heavy'), foregroundStyle(faint), kerning(2)]}>•••</Text>
            ) : (
              <Text modifiers={[rounded(14, 'medium'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>{n.t || ' '}</Text>
            )}
            <Spacer />
            <Image systemName="chevron.right" size={11} modifiers={[foregroundStyle(faint)]} />
          </HStack>
        </Link>
      ))}
      <Spacer />
      <HStack alignment="bottom" spacing={12}>
        {props.learnedLabel ? (
          <VStack alignment="leading" spacing={5}>
            <Text modifiers={[rounded(12, 'bold'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>{props.learnedLabel}</Text>
            <ProgressView value={Number(props.learned) || 0} modifiers={[progressViewStyle('linear'), tint(green)]} />
          </VStack>
        ) : (
          <Spacer />
        )}
        {props.reviewLink ? (
          <Link destination={withFamily(props.reviewLink)}>
            <HStack modifiers={[padding({ horizontal: 16, vertical: 8 }), background(tinted ? quaternary : accent, shapes.capsule())]}>
              <Text modifiers={[rounded(14, 'heavy'), foregroundStyle(onAccent), lineLimit(1)]}>{props.reviewLabel}</Text>
            </HStack>
          </Link>
        ) : null}
      </HStack>
    </VStack>
  );
};

export default createWidget('MyWords', MyWords);
