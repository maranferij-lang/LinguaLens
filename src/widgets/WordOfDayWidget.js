// Віджет «Слово дня» — головний екран і екран блокування iOS.
//
// Функція з директивою 'widget' у застосунку НЕ виконується: babel
// (widgets-plugin з babel-preset-expo) ще під час збірки перетворює її на
// рядок, createWidget кладе цей рядок у спільний App Group, а розширення
// віджета виконує його в окремому JavaScriptCore. Звідси жорсткі правила:
//   • лише компоненти й модифікатори @expo/ui/swift-ui — у рушії віджета
//     вони глобальні під своїми іменами, тож імпорт без перейменувань (as …);
//   • жодних хуків, стану, асинхронщини;
//   • нічого з області модуля: кольори й допоміжні функції — всередині;
//   • лише простий синтаксис (без spread, for…of, ?.): babel замінює їх
//     хелперами з верхівки модуля, а в рушій віджета вони не потрапляють;
//   • дані — тільки props (їх готує src/widgets/index.js) і environment.
// Тест __tests__/widget.test.js виконує саме цей рядок в ізоляції.
import { HStack, Image, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  allowsTightening,
  background,
  containerBackground,
  font,
  foregroundStyle,
  frame,
  kerning,
  layoutPriority,
  lineLimit,
  minimumScaleFactor,
  padding,
  textCase,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const WordOfDay = (props, environment) => {
  'widget';
  const family = environment.widgetFamily;
  const mode = environment.widgetRenderingMode;
  // Екран блокування (vibrant) і тоновані віджети iOS 18 (accented) система
  // перефарбовує сама: власні кольори там губляться, тож даємо лише ієрархію.
  const tinted = mode === 'vibrant' || mode === 'accented';
  // Без підкладки (StandBy) віджет лежить на чорному — темна палітра.
  const dark = environment.colorScheme === 'dark' || environment.showsContainerBackground === false;
  const primary = { type: 'hierarchical', style: 'primary' };
  const secondary = { type: 'hierarchical', style: 'secondary' };
  // Палітра застосунку: тепла крейда / графіт, один фіолетовий акцент.
  const bg = dark ? '#151412' : '#FAF8F4';
  const ink = tinted ? primary : dark ? '#F5F1EA' : '#1F1B16';
  const soft = tinted ? primary : dark ? '#D9D3C9' : '#3A352E';
  const dim = tinted ? secondary : dark ? '#A9A49B' : '#66625A';
  const accent = tinted ? secondary : dark ? '#9B8FFF' : '#5B4FD6';
  const link = 'lingualens://word-of-day';
  const hasWord = props.state === 'word' && !!props.word;
  // Порожні props — заглушка WidgetKit (галерея, завантаження) до першого
  // таймлайну від застосунку. Назва бренду не потребує перекладу.
  const message = props.message || 'LinguaLens';
  const a11y = [accessibilityElement('ignore'), accessibilityLabel(props.a11y || message)];

  // Шрифти: системний округлий — найближчий до Nunito застосунку
  // (власні шрифти в розширення віджета не потрапляють).
  const rounded = (size, weight) => font({ size: size, weight: weight, design: 'rounded' });

  // ── Екран блокування: один рядок над годинником ──
  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}>
        {props.line || message}
      </Text>
    );
  }

  // ── Екран блокування: прямокутник під годинником ──
  if (family === 'accessoryRectangular') {
    return (
      <VStack
        alignment="leading"
        spacing={1}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(link)].concat(
          a11y
        )}
      >
        {hasWord ? (
          <Text modifiers={[rounded(19, 'bold'), foregroundStyle(primary), lineLimit(1), minimumScaleFactor(0.6), allowsTightening(true)]}>
            {props.word}
          </Text>
        ) : (
          <Text modifiers={[rounded(12, 'semibold'), foregroundStyle(secondary), textCase('uppercase'), lineLimit(1)]}>
            {props.title}
          </Text>
        )}
        {hasWord ? (
          props.translation ? (
            <Text modifiers={[rounded(15, 'medium'), foregroundStyle(secondary), lineLimit(2), minimumScaleFactor(0.8)]}>
              {props.translation}
            </Text>
          ) : null
        ) : (
          <Text modifiers={[rounded(15, 'semibold'), foregroundStyle(primary), lineLimit(2), minimumScaleFactor(0.8)]}>
            {message}
          </Text>
        )}
      </VStack>
    );
  }

  // ── Головний екран: маленький і середній ──
  const medium = family === 'systemMedium';
  // iOS 17+ сам дає поля й підкладку (containerBackground); на iOS 16
  // widgetContentMargins немає — тоді поля й тло малюємо самі.
  const legacy = !environment.widgetContentMargins;
  const shell = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]
    .concat(legacy ? [padding({ all: 16 }), background(bg)] : [])
    .concat([containerBackground(bg, 'widget'), widgetURL(link)])
    .concat(a11y);

  const caption = (
    <Text
      modifiers={[
        rounded(11, 'heavy'),
        foregroundStyle(accent),
        textCase('uppercase'),
        kerning(0.8),
        lineLimit(1),
        minimumScaleFactor(0.7),
      ]}
    >
      {hasWord ? props.caption : props.title}
    </Text>
  );

  if (!hasWord) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {caption}
        <Spacer />
        <Image systemName="sparkles" size={medium ? 22 : 20} modifiers={[foregroundStyle(accent)]} />
        <Text
          modifiers={[
            rounded(medium ? 19 : 16, 'bold'),
            foregroundStyle(ink),
            lineLimit(3),
            minimumScaleFactor(0.8),
            padding({ top: 6 }),
          ]}
        >
          {message}
        </Text>
      </VStack>
    );
  }

  const word = (
    <Text
      modifiers={[
        rounded(medium ? 34 : 28, 'bold'),
        foregroundStyle(ink),
        lineLimit(1),
        minimumScaleFactor(0.45),
        allowsTightening(true),
      ]}
    >
      {props.word}
    </Text>
  );
  const ipa = props.ipa ? (
    <Text modifiers={[rounded(medium ? 13 : 12, 'regular'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>
      {props.ipa}
    </Text>
  ) : null;
  const translation = props.translation ? (
    <Text
      modifiers={[
        rounded(medium ? 17 : 15, 'semibold'),
        foregroundStyle(soft),
        lineLimit(medium ? 1 : 2),
        minimumScaleFactor(0.8),
        // у середньому поруч транскрипція — стискатись першою має вона
        layoutPriority(1),
        padding({ top: medium ? 0 : 4 }),
      ]}
    >
      {props.translation}
    </Text>
  ) : null;

  if (!medium) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {caption}
        <Spacer />
        {word}
        {ipa}
        {translation}
      </VStack>
    );
  }

  // Середній: переклад і транскрипція в один рядок, нижче — приклад.
  return (
    <VStack alignment="leading" spacing={0} modifiers={shell}>
      {caption}
      <Spacer />
      {word}
      <HStack alignment="firstTextBaseline" spacing={8} modifiers={[padding({ top: 2 })]}>
        {translation}
        {ipa}
      </HStack>
      {props.example ? (
        <Text modifiers={[rounded(13, 'medium'), foregroundStyle(dim), lineLimit(2), padding({ top: 8 })]}>{props.example}</Text>
      ) : null}
    </VStack>
  );
};

export default createWidget('WordOfDay', WordOfDay);
