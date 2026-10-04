// Сцена демо онбордингу «камера над столом» (onboarding.md §6): стіна зі
// світлом із вікна, розмиті ноутбук і рослина, стіл, нотатник і червона
// чашка. Намальовано кодом (react-native-svg) у координатах 342×420 —
// ScanDemo масштабує її під екран і рухає шари поверх.
//
// Це арт, а не інтерфейс: кольори фіксовані (план §5.14 — сцена демо
// серед дозволених файлів), однакові у світлій і темній темі, як фото з
// камери. Фон малюється один раз (memo); у русі — лише окремі шари: чашка
// на столі, наліпка-чашка, кути видошукача, віньєтка.
//
// Тут же — дрібний арт для вітання (чашка, рослина, ключ з табличками
// різними мовами) і мініатюра чашки для чипа «Мої слова».
import { memo } from 'react';
import { Text, View } from 'react-native';
import Svg, {
  Circle,
  ClipPath,
  Defs,
  Ellipse,
  FeGaussianBlur,
  Filter,
  G,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { PLATE } from './WordPlate';
import { flagFor } from './speech';
import { F } from './theme';

export const SCENE_W = 342;
export const SCENE_H = 420;

// Силует чашки — для обведення, білої облямівки наліпки й мініатюри
export const MUG_SIL = 'M119 196 L223 196 L221 222 C258 220 260 284 215 282 L214 296 Q213 310 199 310 L143 310 Q129 310 128 296 Z';
// Тіло чашки (без вушка) — у його межах біжить світлова смуга
export const MUG_BODY = { x: 125, y: 199, w: 92, h: 106 };
// Кути видошукача — та сама рамка, що в справжньому сканері
export const FRAME = { x1: 96, y1: 150, x2: 246, y2: 326 };

const MUG_RED = ['#B8392A', '#E5583F', '#D84A35', '#A93224'];

function MugDefs({ id }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="0">
      <Stop offset="0" stopColor={MUG_RED[0]} />
      <Stop offset="0.35" stopColor={MUG_RED[1]} />
      <Stop offset="0.75" stopColor={MUG_RED[2]} />
      <Stop offset="1" stopColor={MUG_RED[3]} />
    </LinearGradient>
  );
}

// Сама чашка (у координатах сцени). steam — пара над кавою.
function MugArt({ id, steam = true }) {
  return (
    <G>
      <Path d="M216 228 C246 226 248 276 214 274" fill="none" stroke="#B83A2B" strokeWidth={13} strokeLinecap="round" />
      <Path d="M216 228 C242 228 243 272 214 270" fill="none" stroke="#E0604A" strokeWidth={7} strokeLinecap="round" />
      <Path d="M123 200 L219 200 L215 294 Q214 306 202 306 L140 306 Q128 306 127 294 Z" fill={`url(#${id})`} />
      <Ellipse cx={171} cy={201} rx={48} ry={9} fill="#9C2F22" />
      <Ellipse cx={171} cy={202} rx={43} ry={6.5} fill="#4A2A1C" />
      <Ellipse cx={164} cy={201} rx={16} ry={2.4} fill="#7B4A33" opacity={0.7} />
      <Path d="M138 214 Q136 260 141 292" stroke="#FFFFFF" strokeWidth={6} strokeLinecap="round" opacity={0.28} fill="none" />
      {steam ? (
        <Path
          d="M150 168 c-5 8 5 11 0 19 M166 160 c-5 8 5 11 0 19 M182 168 c-5 8 5 11 0 19"
          stroke="#FFFFFF"
          strokeWidth={3.2}
          strokeLinecap="round"
          fill="none"
          opacity={0.55}
        />
      ) : null}
    </G>
  );
}

// ─── Фон сцени ─────────────────────────────────────────────────────────────
function DeskBackground({ w = SCENE_W, h = SCENE_H }) {
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <LinearGradient id="ddWall" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#EFE6D7" />
          <Stop offset="1" stopColor="#D8C9B3" />
        </LinearGradient>
        <RadialGradient id="ddSun" cx="0.2" cy="0.15" r="0.7">
          <Stop offset="0" stopColor="#FFF6E2" stopOpacity={0.9} />
          <Stop offset="1" stopColor="#FFF6E2" stopOpacity={0} />
        </RadialGradient>
        <LinearGradient id="ddDesk" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#C79062" />
          <Stop offset="1" stopColor="#93603D" />
        </LinearGradient>
        <LinearGradient id="ddScreen" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#3D5A78" />
          <Stop offset="1" stopColor="#1B2532" />
        </LinearGradient>
        <Filter id="ddBlur3" x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation={3.2} />
        </Filter>
        <Filter id="ddBlur2" x="-20%" y="-20%" width="140%" height="140%">
          <FeGaussianBlur stdDeviation={1.6} />
        </Filter>
      </Defs>
      <Rect width={SCENE_W} height={SCENE_H} fill="url(#ddWall)" />
      <Rect width={SCENE_W} height={SCENE_H} fill="url(#ddSun)" />
      {/* ноутбук і рослина — далеко, не в фокусі */}
      <G filter="url(#ddBlur3)">
        <Rect x={-30} y={120} width={160} height={112} rx={8} fill="#1D1F24" />
        <Rect x={-24} y={126} width={148} height={100} rx={5} fill="url(#ddScreen)" />
        <Rect x={-12} y={140} width={70} height={8} rx={4} fill="#CFD8E3" opacity={0.7} />
        <Rect x={-12} y={156} width={96} height={5} rx={2.5} fill="#CFD8E3" opacity={0.4} />
        <Rect x={40} y={180} width={62} height={36} rx={6} fill="#D49A55" />
        <Path d="M-40 232 L150 232 L162 244 L-40 244 Z" fill="#CFD2D6" />
        <G transform="translate(276 120)">
          <Path d="M30 120 C10 80 -4 40 6 6 C26 34 34 76 30 120Z" fill="#4E8A52" />
          <Path d="M34 120 C40 72 58 34 78 18 C78 58 56 94 34 120Z" fill="#3E7646" />
          <Path d="M28 120 C20 90 30 60 44 40 C50 70 42 98 28 120Z" fill="#6AA764" />
          <Path d="M2 112 L62 112 L56 172 L8 172 Z" fill="#C46F48" />
          <Rect x={-2} y={106} width={68} height={12} rx={3} fill="#A95A38" />
        </G>
      </G>
      <Rect x={0} y={292} width={SCENE_W} height={SCENE_H - 292} fill="url(#ddDesk)" />
      <Rect x={0} y={292} width={SCENE_W} height={3} fill="#E2B286" opacity={0.6} />
      {/* нотатник на столі */}
      <G filter="url(#ddBlur2)" opacity={0.55}>
        <Rect x={20} y={318} width={120} height={76} rx={6} fill="#F3EEE4" transform="rotate(-8 80 356)" />
        <Rect x={34} y={330} width={70} height={5} rx={2} fill="#BDB3A3" transform="rotate(-8 80 356)" />
        <Rect x={34} y={344} width={84} height={5} rx={2} fill="#BDB3A3" transform="rotate(-8 80 356)" />
      </G>
      {/* тінь чашки */}
      <Ellipse cx={171} cy={306} rx={58} ry={9} fill="#3A2214" opacity={0.45} filter="url(#ddBlur2)" />
    </Svg>
  );
}
export const DemoDesk = memo(DeskBackground);

// ─── Чашка на столі ────────────────────────────────────────────────────────
function DeskMugArt({ w = SCENE_W, h = SCENE_H }) {
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <MugDefs id="ddMug" />
      </Defs>
      <MugArt id="ddMug" />
    </Svg>
  );
}
export const DeskMug = memo(DeskMugArt);

// ─── Наліпка-чашка ─────────────────────────────────────────────────────────
// Та сама чашка, «вирізана» по силуету з білою облямівкою, як наліпки в
// словнику. Два шари: back — тінь, біла облямівка й тло в силуеті (вони
// проступають, коли наліпка «відклеюється»), front — сама чашка без пари
// (її ножиці не вирізають). На старті відклеювання front точно збігається з
// чашкою на столі, тож підміни не видно.
function MugStickerArt({ w = SCENE_W, h = SCENE_H, part = 'front' }) {
  if (part === 'front') {
    return (
      <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
        <Defs>
          <MugDefs id="ddMugS" />
        </Defs>
        <MugArt id="ddMugS" steam={false} />
      </Svg>
    );
  }
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <Filter id="ddShadow" x="-30%" y="-30%" width="160%" height="160%">
          <FeGaussianBlur stdDeviation={9} />
        </Filter>
      </Defs>
      {/* тінь «піднятої» наліпки — у самому малюнку: тінь шару iOS
          перераховувалась би на кожному кадрі польоту */}
      <Path d={MUG_SIL} fill="#2A1A10" stroke="#2A1A10" strokeWidth={16} strokeLinejoin="round" opacity={0.4} transform="translate(0 10)" filter="url(#ddShadow)" />
      <Path d={MUG_SIL} fill="#FFFFFF" stroke="#E9DCC6" strokeWidth={17.5} strokeLinejoin="round" opacity={0.5} />
      <Path d={MUG_SIL} fill="#E6D9C5" stroke="#FFFFFF" strokeWidth={15} strokeLinejoin="round" />
    </Svg>
  );
}
export const MugSticker = memo(MugStickerArt);

// ─── Обведення силуету (для ScanDemo: dashoffset рухає JS) ──────────────────
export function MugOutline({ w = SCENE_W, h = SCENE_H, AnimatedPath, dash, offset }) {
  const P = AnimatedPath || Path;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <P
        d={MUG_SIL}
        fill="none"
        stroke="#FFFFFF"
        strokeWidth={3.2}
        strokeLinejoin="round"
        strokeLinecap="round"
        strokeDasharray={dash}
        strokeDashoffset={offset}
        opacity={0.95}
      />
    </Svg>
  );
}

// ─── Віньєтка поверх кадру ─────────────────────────────────────────────────
function VignetteArt({ w = SCENE_W, h = SCENE_H }) {
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Defs>
        <RadialGradient id="ddVig" cx="0.5" cy="0.5" r="0.75">
          <Stop offset="0.55" stopColor="#000000" stopOpacity={0} />
          <Stop offset="1" stopColor="#000000" stopOpacity={0.42} />
        </RadialGradient>
      </Defs>
      <Rect width={SCENE_W} height={SCENE_H} fill="url(#ddVig)" />
    </Svg>
  );
}
export const Vignette = memo(VignetteArt);

// ─── Кути видошукача ───────────────────────────────────────────────────────
function CornersArt({ w = SCENE_W, h = SCENE_H }) {
  const { x1, y1, x2, y2 } = FRAME;
  const L = 26;
  const d =
    `M${x1} ${y1 + L} V${y1 + 10} Q${x1} ${y1} ${x1 + 10} ${y1} H${x1 + L} ` +
    `M${x2 - L} ${y1} H${x2 - 10} Q${x2} ${y1} ${x2} ${y1 + 10} V${y1 + L} ` +
    `M${x2} ${y2 - L} V${y2 - 10} Q${x2} ${y2} ${x2 - 10} ${y2} H${x2 - L} ` +
    `M${x1 + L} ${y2} H${x1 + 10} Q${x1} ${y2} ${x1} ${y2 - 10} V${y2 - L}`;
  return (
    <Svg width={w} height={h} viewBox={`0 0 ${SCENE_W} ${SCENE_H}`}>
      <Path d={d} stroke="#FFFFFF" strokeWidth={3.5} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
export const Corners = memo(CornersArt);

// ─── Мініатюри ─────────────────────────────────────────────────────────────
// Чашка-наліпка завбільшки з чип чи предмет на вітанні
export function MiniMug({ size = 22, sticker = true }) {
  return (
    <Svg width={size} height={size} viewBox="102 146 166 170">
      <Defs>
        <MugDefs id="ddMugM" />
        <ClipPath id="ddSilM">
          <Path d={MUG_SIL} />
        </ClipPath>
      </Defs>
      {sticker ? (
        <>
          <Path d={MUG_SIL} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={16} strokeLinejoin="round" />
          <G clipPath="url(#ddSilM)">
            <Rect x={100} y={150} width={170} height={170} fill="#E9DCC6" />
            <MugArt id="ddMugM" steam={false} />
          </G>
        </>
      ) : (
        <MugArt id="ddMugM" />
      )}
    </Svg>
  );
}

export function MiniPlant({ size = 56 }) {
  return (
    <Svg width={size} height={size * 1.15} viewBox="0 0 60 69">
      <Path d="M30 40 C18 30 14 16 20 4 C30 16 33 28 30 40Z" fill="#4E8A52" />
      <Path d="M31 40 C36 26 46 18 57 15 C55 30 44 38 31 40Z" fill="#3E7646" />
      <Path d="M29 41 C22 34 10 31 3 33 C9 42 19 45 29 41Z" fill="#6AA764" />
      <Path d="M15 41 L45 41 L41 64 Q40 68 36 68 L24 68 Q20 68 19 64 Z" fill="#C46F48" />
      <Rect x={12} y={37} width={36} height={8} rx={3} fill="#A95A38" />
      <Path d="M22 48 L24 63" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" opacity={0.25} />
    </Svg>
  );
}

export function MiniKey({ size = 56 }) {
  return (
    <Svg width={size} height={size * 0.6} viewBox="0 0 70 42">
      <Circle cx={15} cy={21} r={11} stroke="#D9A43A" strokeWidth={7} fill="none" />
      <Circle cx={15} cy={21} r={11} stroke="#F4CC6A" strokeWidth={2} fill="none" opacity={0.7} />
      <Rect x={24} y={18} width={42} height={6} rx={3} fill="#E3AF45" />
      <Rect x={50} y={22} width={5} height={10} rx={1.5} fill="#E3AF45" />
      <Rect x={59} y={22} width={5} height={7} rx={1.5} fill="#E3AF45" />
      <Rect x={26} y={19} width={30} height={1.6} rx={0.8} fill="#FFF1C2" opacity={0.7} />
    </Svg>
  );
}

// Табличка-ярлик на вітанні: прапорець і слово акцентом, біле тло, як у
// наліпок. Тексти — самі слова (mug, planta, Schlüssel), не переклад.
export function TagLabel({ code, word, tilt = 0 }) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        backgroundColor: PLATE.face,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: PLATE.line,
        paddingHorizontal: 9,
        paddingVertical: 3,
        shadowColor: PLATE.shadow,
        shadowOpacity: 0.18,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 3,
        transform: [{ rotate: `${tilt}deg` }],
      }}
    >
      <Text allowFontScaling={false} style={{ fontSize: 11, lineHeight: 14 }}>
        {flagFor(code)}
      </Text>
      <Text allowFontScaling={false} style={{ color: PLATE.accent, fontFamily: F.extra, fontSize: 13, lineHeight: 17 }}>
        {word}
      </Text>
    </View>
  );
}
