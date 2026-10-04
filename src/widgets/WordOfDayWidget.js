// Віджет «Слово дня» — головний екран (малий, середній, великий) і екран
// блокування (прямокутник, рядок). widgets.md §5.1, §6.
//
// Функція з директивою 'widget' у застосунку НЕ виконується: babel
// (widgets-plugin з babel-preset-expo) ще під час збірки перетворює її на
// рядок, createWidget кладе цей рядок у спільний App Group, а розширення
// віджета виконує його в окремому JavaScriptCore. Звідси жорсткі правила:
//   • лише компоненти й модифікатори @expo/ui/swift-ui — у рушії віджета
//     вони глобальні під своїми іменами, тож імпорт без перейменувань (as …);
//   • жодних хуків, стану, асинхронщини;
//   • нічого з області модуля: кольори й допоміжні функції — всередині;
//   • лише простий синтаксис (без spread, for…of, ?., шаблонних рядків і
//     значень параметрів за замовчуванням): babel замінив би їх хелперами з
//     верхівки модуля, а в рушій віджета вони не потрапляють;
//   • дані — тільки props (їх готує src/widgets/wordTimeline.js) і environment.
// І ще два обмеження рушія, знайдені в коді expo-widgets 57:
//   • Text у віджеті обгорнутий двічі (TextView сам застосовує модифікатори,
//     і UIBaseView — ще раз): padding чи background на Text подвоїлись би.
//     Відступи й підкладки — лише на стеках;
//   • вкладений <Text> губиться — жирне слово в реченні йде як markdown.
// Тест __tests__/widgetLayouts.test.js виконує саме цей рядок так, як його
// виконує розширення.
import { Button, Circle, HStack, Image, Rectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  accessibilityElement,
  accessibilityLabel,
  allowsTightening,
  background,
  buttonStyle,
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
  shapes,
  textCase,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget } from 'expo-widgets';

const WordOfDay = (props, environment) => {
  'widget';
  const family = environment.widgetFamily || 'systemSmall';
  const mode = environment.widgetRenderingMode;
  // Екран блокування (vibrant) і тоновані віджети iOS 18 (accented) система
  // перефарбовує сама: власні кольори там губляться, тож даємо лише ієрархію.
  const tinted = mode === 'vibrant' || mode === 'accented';
  // Без підкладки (StandBy) віджет лежить на чорному — темна палітра.
  const dark = environment.colorScheme === 'dark' || environment.showsContainerBackground === false;
  const pal = props.pal ? (dark ? props.pal.d : props.pal.l) : null;
  const pick = (key, light, night) => (pal && pal[key] ? pal[key] : dark ? night : light);
  const primary = { type: 'hierarchical', style: 'primary' };
  const secondary = { type: 'hierarchical', style: 'secondary' };
  const tertiary = { type: 'hierarchical', style: 'tertiary' };
  // Палітра застосунку (без props — фірмова «Крейда»): тепла крейда /
  // графіт, один фіолетовий акцент.
  const bg = pick('bg', '#FAF8F4', '#151412');
  const ink = tinted ? primary : pick('ink', '#1C1B19', '#F5F2EC');
  const soft = tinted ? primary : pick('soft', '#3E3B36', '#DCD7CF');
  const dim = tinted ? secondary : pick('dim', '#6E6A62', '#A9A49B');
  const faint = tinted ? tertiary : pick('faint', '#8A857C', '#8A857D');
  const accent = tinted ? secondary : pick('accent', '#5B4FD6', '#9B8FFF');
  const accentSoft = tinted ? { type: 'hierarchical', style: 'quaternary' } : pick('accentSoft', '#E4E1FB', '#221E45');
  const sep = tinted ? { type: 'hierarchical', style: 'quaternary' } : pick('sep', '#E8E4DC', '#302D29');

  const home = family.indexOf('system') === 0;
  const small = family === 'systemSmall';
  const medium = family === 'systemMedium';
  const large = family === 'systemLarge';
  // iOS 17+ сам дає поля й підкладку (containerBackground); на iOS 16
  // widgetContentMargins немає — тоді поля й тло малюємо самі, а кнопок у
  // віджеті там немає зовсім: переклад видно одразу.
  const legacy = !environment.widgetContentMargins;
  const hidden = home && !legacy && props.hide === '1' && props.revealed !== '1';
  const hasWord = props.state === 'word' && !!props.word;
  // Порожні props — заглушка WidgetKit (галерея, завантаження) до першого
  // таймлайну від застосунку. Назва бренду не потребує перекладу.
  const message = props.message || 'LinguaLens';
  const link = (props.link || 'lingualens://word-of-day') + ((props.link || '').indexOf('?') < 0 ? '?f=' : '&f=') + family;
  // VoiceOver: блок — один елемент, але кнопка «Показати переклад» лишається
  // окремою ціллю (contain); поки переклад сховано, мітка його не читає.
  const label = hidden ? props.a11yShort || props.a11y || message : props.a11y || message;
  const a11y = [accessibilityElement('contain'), accessibilityLabel(label)];

  // Шрифти: системний округлий — найближчий до Nunito застосунку
  // (власні шрифти в розширення віджета не потрапляють).
  const rounded = (size, weight) => font({ size: size, weight: weight, design: 'rounded' });
  const caps = (color) => [rounded(11, 'heavy'), foregroundStyle(color), textCase('uppercase'), kerning(0.8), lineLimit(1)];

  // ── Екран блокування: один рядок над годинником ──
  if (family === 'accessoryInline') {
    return (
      <Text modifiers={[containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}>
        {hasWord ? props.line || props.word : props.line || message}
      </Text>
    );
  }

  // ── Екран блокування: прямокутник під годинником (переклад видно завжди) ──
  if (family === 'accessoryRectangular') {
    return (
      <VStack
        alignment="leading"
        spacing={0}
        modifiers={[frame({ maxWidth: Infinity, alignment: 'leading' }), containerBackground('clear', 'widget'), widgetURL(link)].concat(a11y)}
      >
        {hasWord ? (
          <Text modifiers={[rounded(19, 'bold'), foregroundStyle(primary), lineLimit(1), minimumScaleFactor(0.6), allowsTightening(true)]}>
            {props.word}
          </Text>
        ) : (
          <Text modifiers={caps(secondary)}>{props.title || 'LinguaLens'}</Text>
        )}
        {hasWord && props.translation ? (
          <Text modifiers={[rounded(15, 'semibold'), foregroundStyle(secondary), lineLimit(1), minimumScaleFactor(0.8)]}>
            {props.translation}
          </Text>
        ) : null}
        {hasWord && props.ipa ? (
          <Text modifiers={[rounded(13, 'regular'), foregroundStyle(secondary), lineLimit(1), minimumScaleFactor(0.8)]}>{props.ipa}</Text>
        ) : null}
        {hasWord ? null : (
          <Text modifiers={[rounded(15, 'semibold'), foregroundStyle(primary), lineLimit(2), minimumScaleFactor(0.8)]}>{message}</Text>
        )}
      </VStack>
    );
  }

  // ── Головний екран ──
  const shell = [frame({ maxWidth: Infinity, maxHeight: Infinity, alignment: 'topLeading' })]
    .concat(legacy ? [padding({ all: 16 }), background(bg)] : [])
    .concat([containerBackground(bg, 'widget'), widgetURL(link)])
    .concat(a11y);

  const caption = <Text modifiers={caps(accent).concat([minimumScaleFactor(0.7)])}>{hasWord ? props.caption : props.title || 'LinguaLens'}</Text>;

  if (!hasWord) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {caption}
        <Spacer />
        <VStack alignment="leading" spacing={6}>
          <Image systemName="sparkles" size={medium || large ? 22 : 20} modifiers={[foregroundStyle(accent)]} />
          <Text modifiers={[rounded(medium || large ? 19 : 16, 'bold'), foregroundStyle(ink), lineLimit(3), minimumScaleFactor(0.8)]}>
            {message}
          </Text>
        </VStack>
      </VStack>
    );
  }

  // «Переклад» — кнопка у віджеті (iOS 17+): її onPress повертає нові props
  // запису, і expo-widgets зливає їх у таймлайн без запуску застосунку.
  // target явний: натискання не зламається, якщо порядок вузлів зміниться.
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

  const wordSize = large ? 40 : medium ? 34 : 28;
  const word = (
    <Text modifiers={[rounded(wordSize, 'bold'), foregroundStyle(ink), lineLimit(1), minimumScaleFactor(0.45), allowsTightening(true)]}>
      {props.word}
    </Text>
  );
  const ipa = props.ipa ? (
    <Text modifiers={[rounded(small ? 12 : 13, 'regular'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>{props.ipa}</Text>
  ) : null;
  const translation = (size) =>
    props.translation ? (
      <Text
        modifiers={[rounded(size, 'semibold'), foregroundStyle(soft), lineLimit(small ? 2 : 1), minimumScaleFactor(0.75), layoutPriority(1)]}
      >
        {props.translation}
      </Text>
    ) : null;
  // Приклад зі словом жирним (markdown, md === '1'); інакше — звичайний текст.
  const example = (size, lines) =>
    props.example ? (
      <Text markdownEnabled={props.md === '1'} modifiers={[rounded(size, 'medium'), foregroundStyle(soft), lineLimit(lines)]}>
        {props.example}
      </Text>
    ) : null;
  const exampleTr = (size) =>
    !hidden && props.exampleTr ? (
      <Text modifiers={[rounded(size, 'regular'), foregroundStyle(dim), lineLimit(1)]}>{props.exampleTr}</Text>
    ) : null;

  // ── Малий: кепс, слово, транскрипція, «Переклад» або переклад ──
  if (small) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        {caption}
        <Spacer />
        {word}
        {ipa}
        <VStack alignment="leading" spacing={0} modifiers={[padding({ top: 6 })]}>
          {hidden ? reveal(false) : translation(15)}
        </VStack>
      </VStack>
    );
  }

  // ── Середній: кепс і кнопка в одному ряду, слово з транскрипцією, приклад ──
  if (medium) {
    return (
      <VStack alignment="leading" spacing={0} modifiers={shell}>
        <HStack alignment="center" spacing={8}>
          {caption}
          <Spacer />
          {hidden ? reveal(true) : null}
        </HStack>
        <Spacer />
        <HStack alignment="firstTextBaseline" spacing={8}>
          {word}
          {ipa}
        </HStack>
        {hidden ? null : translation(17)}
        <VStack alignment="leading" spacing={2} modifiers={[padding({ top: 6 })]}>
          {example(13, hidden ? 2 : 1)}
          {exampleTr(12)}
        </VStack>
      </VStack>
    );
  }

  // ── Великий: слово, речення, слова тижня (Pro — слова сьогодні) ──
  const pro = !!props.slotN;
  const header = (
    <HStack alignment="center" spacing={8}>
      {caption}
      <Spacer />
      {pro ? (
        <HStack alignment="center" spacing={4}>
          {[1, 2, 3, 4, 5]
            .filter((i) => i <= Number(props.slotN))
            .map((i) => (
              <Circle
                key={'dot' + i}
                modifiers={[frame({ width: 6, height: 6 }), foregroundStyle(i <= Number(props.slotI) ? accent : sep)]}
              />
            ))}
          <Text modifiers={[rounded(11, 'heavy'), foregroundStyle(dim), lineLimit(1)]}>{props.slotLabel}</Text>
        </HStack>
      ) : (
        <Text modifiers={caps(faint)}>{props.date}</Text>
      )}
    </HStack>
  );
  const rows = Array.isArray(props.list) ? props.list : [];
  const list = rows.length ? (
    <VStack alignment="leading" spacing={pro ? 2 : 6}>
      <Text modifiers={caps(faint)}>{props.listTitle}</Text>
      {rows.map((r, i) => (
        <HStack
          key={'row' + i}
          alignment="center"
          spacing={10}
          modifiers={
            r.cur === '1'
              ? [padding({ horizontal: 8, vertical: 4 }), background(accentSoft, shapes.roundedRectangle({ cornerRadius: 10 }))]
              : [padding({ horizontal: pro ? 8 : 0, vertical: 4 })]
          }
        >
          {r.time ? <Text modifiers={[rounded(13, 'semibold'), foregroundStyle(dim), lineLimit(1)]}>{r.time}</Text> : null}
          {r.lock === '1' ? <Image systemName="lock.fill" size={11} modifiers={[foregroundStyle(faint)]} /> : null}
          {r.w ? <Text modifiers={[rounded(16, 'bold'), foregroundStyle(ink), lineLimit(1)]}>{r.w}</Text> : null}
          {r.lock === '1' ? (
            <Text modifiers={[rounded(15, 'medium'), foregroundStyle(dim), lineLimit(1)]}>{r.t}</Text>
          ) : hidden && r.t ? (
            <Text modifiers={[rounded(15, 'heavy'), foregroundStyle(faint), kerning(2)]}>•••</Text>
          ) : r.t ? (
            <Text modifiers={[rounded(15, 'medium'), foregroundStyle(dim), lineLimit(1), minimumScaleFactor(0.8)]}>{r.t}</Text>
          ) : null}
          <Spacer />
        </HStack>
      ))}
    </VStack>
  ) : null;
  const sentence =
    props.example ? (
      <VStack alignment="leading" spacing={4}>
        {pro ? null : <Text modifiers={caps(faint)}>{props.sentenceTitle}</Text>}
        {example(15, pro ? 1 : 2)}
        {exampleTr(13)}
      </VStack>
    ) : null;
  // розділювач — волосяна лінія кольору sep (Divider SwiftUI свого кольору не міняє)
  const rule = (
    <VStack spacing={0} modifiers={[padding({ vertical: 10 })]}>
      <Rectangle modifiers={[frame({ height: 1 }), foregroundStyle(sep)]} />
    </VStack>
  );
  return (
    <VStack alignment="leading" spacing={0} modifiers={shell}>
      {header}
      <VStack alignment="leading" spacing={4} modifiers={[padding({ top: 10 })]}>
        {word}
        <HStack alignment="firstTextBaseline" spacing={10}>
          {hidden ? reveal(true) : translation(20)}
          {ipa}
        </HStack>
      </VStack>
      {sentence ? rule : null}
      {sentence}
      {list ? rule : null}
      {list}
      <Spacer />
    </VStack>
  );
};

export default createWidget('WordOfDay', WordOfDay);
