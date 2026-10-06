// «Табличка» слова — біла плашка, як вирізана ножицями наліпка: рядок мови
// з прапорцем, слово акцентом, /IPA/ і переклад (share.md §3, макет
// share-stickers-uk.png). Одна на всіх: наліпки «Поділитися» (W4), демо
// скану й свято першого слова в онбордингу (W3).
//
// <WordPlate word={{ word, ipa, translation, lang }} size="md" tilt={2.5} />
//   size — 'sm' (фішка в демо), 'md' (під вирізаним предметом), 'lg' (лише
//   слово, без фото);
//   ipa — показувати транскрипцію (типово лише в 'lg');
//   tilt — нахил у градусах, як у наклеєної руками наліпки.
// Кольори фіксовані, а не з теми: табличка живе на фото й у PNG, а не на
// тлі застосунку, тож однакова у світлій, темній і будь-якій палітрі.
// Dynamic Type її не чіпає (allowFontScaling={false}) — це картинка, а не
// інтерфейс, як і картки «Поділитися».
import { Text, View } from 'react-native';
import { flagFor, nameFor } from './speech';
import { fontSizeForWord, ipaLabel } from './share/layout';
import { F, ipaFont } from './theme';

export const PLATE = {
  face: '#FFFFFF',
  line: 'rgba(59,47,34,0.14)',
  shadow: '#3B2F22',
  accent: '#5B4FD6',
  ink: '#1C1B19',
  dim: '#6E6A62',
  // галочка «уже в словнику» на табличці (чипи сцени): колір успіху Крейди
  ok: '#0E8C82',
};

// Тепла тінь і волосяна лінія — щоб біле не губилося на білому фото.
export const PLATE_STYLE = {
  backgroundColor: PLATE.face,
  borderWidth: 1,
  borderColor: PLATE.line,
  shadowColor: PLATE.shadow,
  shadowOpacity: 0.22,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 4,
};

// Розміри за видом. maxW — найширша табличка (наліпка 300 pt мінус поля);
// word — кегль слова в межах [max, min] за довжиною (fontSizeForWord): мінімум
// низький, щоб і «Geschwindigkeitsbegrenzung» влізло цілим, а не з «…».
const SIZES = {
  sm: { radius: 14, padX: 12, padTop: 6, padBottom: 7, lang: 8, flag: 9, word: [22, 11], tr: 13, ipa: 11, maxW: 170 },
  md: { radius: 20, padX: 20, padTop: 8, padBottom: 10, lang: 9.5, flag: 11, word: [30, 13], tr: 17, ipa: 13, maxW: 236 },
  lg: { radius: 26, padX: 26, padTop: 12, padBottom: 16, lang: 9.5, flag: 11, word: [40, 14], tr: 19, ipa: 15, maxW: 260 },
};

const T = (p) => <Text allowFontScaling={false} {...p} />;

export function LangLine({ code, size = 9.5, flag = 11, color = PLATE.dim }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
      <T style={{ fontSize: flag, lineHeight: flag + 3 }}>{flagFor(code)}</T>
      <T
        numberOfLines={1}
        style={{ color, fontFamily: F.extra, fontSize: size, lineHeight: size + 3.5, letterSpacing: 1.2, textTransform: 'uppercase' }}
      >
        {nameFor(code)}
      </T>
    </View>
  );
}

export default function WordPlate({ word, size = 'md', tilt = 0, ipa = size === 'lg', style, testID = 'word-plate' }) {
  const m = SIZES[size] || SIZES.md;
  const text = String(word?.word || '');
  const tr = String(word?.translation || '');
  const inner = m.maxW - m.padX * 2;
  const fs = fontSizeForWord(text, { max: m.word[0], min: m.word[1], width: inner });
  // Довгий переклад — на два рядки й трохи менший, а не обрізаний посеред слова
  const long = tr.length > 24;
  const trSize = long ? Math.round(m.tr * 0.85) : m.tr;
  const ipaText = ipa ? ipaLabel(word?.ipa) : '';
  return (
    <View
      testID={testID}
      style={[
        PLATE_STYLE,
        {
          maxWidth: m.maxW,
          borderRadius: m.radius,
          paddingHorizontal: m.padX,
          paddingTop: m.padTop,
          paddingBottom: m.padBottom,
          alignItems: 'center',
        },
        tilt ? { transform: [{ rotate: `${tilt}deg` }] } : null,
        style,
      ]}
      accessible
      accessibilityLabel={[nameFor(word?.lang), text, tr].filter(Boolean).join(', ')}
    >
      {word?.lang ? <LangLine code={word.lang} size={m.lang} flag={m.flag} /> : null}
      <T
        numberOfLines={1}
        // запас на випадок, коли оцінка ширини гліфів промахнулась (iOS)
        adjustsFontSizeToFit
        minimumFontScale={0.8}
        style={{ color: PLATE.accent, fontFamily: F.extra, fontSize: fs, lineHeight: Math.round(fs * 1.2), letterSpacing: -fs * 0.02, marginTop: 1 }}
      >
        {text}
      </T>
      {ipaText ? (
        <T numberOfLines={1} style={{ color: PLATE.dim, ...ipaFont('600'), fontSize: m.ipa, lineHeight: Math.round(m.ipa * 1.27) }}>
          {ipaText}
        </T>
      ) : null}
      {tr ? (
        <T
          numberOfLines={2}
          style={{
            color: PLATE.ink,
            fontFamily: size === 'lg' ? F.bold : F.semi,
            fontSize: trSize,
            lineHeight: Math.round(trSize * 1.26),
            textAlign: 'center',
            marginTop: size === 'lg' ? 4 : 0,
          }}
        >
          {tr}
        </T>
      ) : null}
    </View>
  );
}
