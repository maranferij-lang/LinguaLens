// Малювання сцени: предмети, «підняті» над фото, і підписи до них.
// Спільне для екрана сцени (SceneView) і картки «поділитись» (SceneCards).
//
// Вигляд «піднятої наліпки» — той самий, що в словнику (Sticker.js), але
// на місці, просто на фото: решта кадру трохи пригашена, а предмет —
// на повну яскравість, обрізаний по своєму силуету, з білою облямівкою
// вирубки й м'якою тінню. Фото людини не псуємо рамками й заливками: усе
// виглядає як акуратно наклеєні наліпки, а не як розмітка нейромережі.
import { useId } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, FeGaussianBlur, Filter, G, Image as SvgImage, Line, Path } from 'react-native-svg';
import { inflate, smoothPath } from '../stickerGeometry';
import { F } from '../theme';
import { contourPoints, perimeter, rectOf } from './sceneLayout';

// Товщина білої облямівки й тіні — частки ширини фото, щоб на екрані й
// на картці 360×640 предмет виглядав однаково.
const BORDER = 0.0085;
const SHADOW_BLUR = 0.011;
const SHADOW_DROP = 0.006;

// Контури предметів сцени в пікселях: шлях вирубки, його довжина (для
// анімації) і площа рамки. Великі — першими: малюємо знизу догори, тож
// чашка на книжці лягає поверх книжки, а не навпаки.
export function sceneShapes(objects, frame) {
  const pad = frame.w * 0.004;
  return objects
    .map((o) => {
      const pts = inflate(contourPoints(o, frame), pad);
      const r = rectOf(o.box, frame);
      return { key: o.key, d: smoothPath(pts), len: perimeter(pts), area: (r.x2 - r.x1) * (r.y2 - r.y1) };
    })
    .sort((a, b) => b.area - a.area);
}

export function borderWidth(frame) {
  return Math.max(2, frame.w * BORDER);
}

// Предмети на повну яскравість поверх пригашеного фото. Саме фото й
// пригашення малює господар: на екрані вони анімуються окремо.
export function LiftedObjects({ uri, frame, width, height, shapes, shadow = true }) {
  // React 19 повертає id зі спецсимволами — у url(#…) вони ламають посилання
  const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const border = borderWidth(frame);
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      <Defs>
        {shapes.map((s) => (
          <ClipPath key={s.key} id={`c${id}${s.key}`}>
            <Path d={s.d} />
          </ClipPath>
        ))}
        {shadow ? (
          <Filter id={`b${id}`} x="-20%" y="-20%" width="140%" height="140%">
            <FeGaussianBlur stdDeviation={frame.w * SHADOW_BLUR} />
          </Filter>
        ) : null}
      </Defs>
      {shapes.map((s) => (
        <G key={s.key}>
          {shadow ? (
            <G transform={`translate(0 ${frame.w * SHADOW_DROP})`} opacity={0.42}>
              <Path d={s.d} fill="#000" stroke="#000" strokeWidth={border * 2} strokeLinejoin="round" filter={`url(#b${id})`} />
            </G>
          ) : null}
          <Path d={s.d} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={border * 2} strokeLinejoin="round" />
          <SvgImage
            href={{ uri }}
            x={frame.x}
            y={frame.y}
            width={frame.w}
            height={frame.h}
            preserveAspectRatio="none"
            clipPath={`url(#c${id}${s.key})`}
          />
        </G>
      ))}
    </Svg>
  );
}

// Тонкі лінії від предмета до відсунутого підпису й крапка на предметі.
// halo — м'яке світле коло під крапкою, щоб вона читалась і на білій
// стіні, і на темній шафі. under — тінь-підкладка під лінією й кільцем:
// світле на світлому без неї зникає, лишається сама кольорова крапка.
export function Leaders({ width, height, lines, color = '#FFFFFF', dot = '#FFFFFF', dotR = 3, ring = 0, halo = 0, stroke = 1, under = false }) {
  if (!lines.length) return null;
  return (
    <Svg width={width} height={height} style={{ position: 'absolute', left: 0, top: 0 }} pointerEvents="none">
      {lines.map(({ key, from, to }) => {
        // лінія починається від краю крапки, а не з-під неї
        const dx = to.x - from.x;
        const dy = to.y - from.y;
        const len = Math.hypot(dx, dy) || 1;
        const start = dotR + ring + 1.5;
        const line = len > start + 2;
        return (
          <G key={key}>
            {under && line ? (
              <Line
                x1={from.x + (dx / len) * start}
                y1={from.y + (dy / len) * start}
                x2={to.x}
                y2={to.y}
                stroke="#000000"
                strokeWidth={stroke + 2}
                strokeOpacity={0.35}
                strokeLinecap="round"
              />
            ) : null}
            {line ? (
              <Line
                x1={from.x + (dx / len) * start}
                y1={from.y + (dy / len) * start}
                x2={to.x}
                y2={to.y}
                stroke={color}
                strokeWidth={stroke}
                strokeOpacity={0.9}
                strokeLinecap="round"
              />
            ) : null}
            {halo ? <Circle cx={from.x} cy={from.y} r={halo} fill="#FFFFFF" fillOpacity={0.24} /> : null}
            {under ? <Circle cx={from.x} cy={from.y} r={dotR + ring + 1} fill="#000000" fillOpacity={0.3} /> : null}
            {ring ? <Circle cx={from.x} cy={from.y} r={dotR + ring} fill="#FFFFFF" /> : null}
            <Circle cx={from.x} cy={from.y} r={dotR} fill={dot} />
          </G>
        );
      })}
    </Svg>
  );
}

// Плашка «слово / переклад». Розміри вже пораховані (chipSize), тож вона
// не міряє себе сама й не залежить від системного розміру шрифту — це
// частина зображення, як підпис на фото в журналі.
// saved — слово вже в словнику: плашка трохи пригашена, у куті — галочка
// (на екрані сцени; картка «поділитись» цього не показує).
export function SceneChip({ word, translation, size, colors, radius = 12, padX = 11, saved = false, style }) {
  return (
    <View
      style={[
        {
          width: size.w,
          height: size.h,
          borderRadius: radius,
          backgroundColor: colors.bg,
          paddingHorizontal: padX,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 3 },
          elevation: 4,
        },
        saved && { opacity: SAVED_OPACITY },
        style,
      ]}
    >
      <Text
        allowFontScaling={false}
        numberOfLines={1}
        style={{ color: colors.word, fontFamily: F.extra, fontSize: size.wordSize, lineHeight: size.lineW, letterSpacing: -0.15 }}
      >
        {word}
      </Text>
      {translation ? (
        <Text
          allowFontScaling={false}
          numberOfLines={1}
          style={{ color: colors.sub, fontFamily: F.semi, fontSize: size.subSize, lineHeight: size.lineS }}
        >
          {translation}
        </Text>
      ) : null}
      {saved ? <SavedMark color={colors.check || colors.word} /> : null}
    </View>
  );
}

// Пригашення збереженої плашки: читається, але видно, що з нею вже все
const SAVED_OPACITY = 0.72;

// Галочка «вже в словнику»: кружечок на правому верхньому куті плашки
function SavedMark({ color }) {
  return (
    <View
      style={{
        position: 'absolute',
        top: -6,
        right: -6,
        width: 18,
        height: 18,
        borderRadius: 9,
        backgroundColor: color,
        borderWidth: 1.5,
        borderColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Svg width={10} height={10} viewBox="0 0 24 24">
        <Path d="M4.5 12.5 9.5 17.5 19.5 6.5" fill="none" stroke="#FFFFFF" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
