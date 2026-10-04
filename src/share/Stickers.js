// Наліпки без тла — головне, чим діляться у v1.3 (відгук власника №8).
//
// Наліпка — PNG, у якому прозоре все, крім предмета, таблички й ярлика
// LinguaLens. У Stories її кладуть на своє фото й тягають пальцями, у
// WhatsApp вставлене зображення стає стікером, в iMessage — теж.
//
// Чотири види (share.md §3, макет share-stickers-uk.png):
//   object — вирізаний предмет і табличка «мова / слово / переклад»;
//   word   — лише табличка, більша, з транскрипцією (слово без фото, або
//            тло «фото скану», де предмет уже є);
//   scene  — набір фішок «слово / переклад» сцени, до шести, «і ще N»;
//   badge  — медаль досягнення з табличкою назви й Lingo збоку.
//
// Прозорість вирішує одне: у кореня знімка немає тла (і жоден нащадок не
// заливає його на весь розмір). Корінь — STICKER_W завширшки з полем
// STICKER_PAD: знімок обрізає все, що виходить за межі кореня, а тіні й
// нахилені кути мусять уміститися. Висота — за вмістом, не менша за
// STICKER_MIN_H; аркуш міряє її (onLayout) і знімає рівно стільки.
// Кольори фіксовані, а не з теми: наліпка живе на чужих фото й однакова у
// світлій і темній темі. Dynamic Type її не чіпає (allowFontScaling={false}).
import { Text, View } from 'react-native';
import { AchIcon } from '../AchIcons';
import { LogoMark } from '../Logo';
import { Mascot } from '../Mascot';
import { flagFor } from '../speech';
import { StickerLarge } from '../Sticker';
import { silhouette } from '../stickerGeometry';
import { F } from '../theme';
import WordPlate, { PLATE, PLATE_STYLE } from '../WordPlate';
import {
  PALETTES,
  SCENE_CHIP,
  SCENE_HEAD_H,
  SCENE_MORE_H,
  STICKER_MIN_H,
  STICKER_PAD,
  STICKER_W,
  fontSizeForWord,
  sceneSetLayout,
  tierColor,
} from './layout';
import { resolvePhoto } from './ShareCards';

const T = (p) => <Text allowFontScaling={false} {...p} />;
const WHITE = '#FFFFFF';

// М'яка тепла тінь під вирізаними елементами — як у таблички
const LIFT = {
  shadowColor: PLATE.shadow,
  shadowOpacity: 0.22,
  shadowRadius: 5,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

// Ярлик бренду: фіолетова пігулка з білою облямівкою, знак і назва.
// Окрема маленька «наліпочка» в куті: пост рекламує застосунок, але тихо.
export function BrandTag({ rotate = 8, style }) {
  return (
    <View
      testID="sticker-brand"
      style={[
        LIFT,
        {
          position: 'absolute',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: PLATE.accent,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: WHITE,
          paddingLeft: 5,
          paddingRight: 10,
          paddingVertical: 4,
          transform: [{ rotate: `${rotate}deg` }],
        },
        style,
      ]}
    >
      <LogoMark size={16} color={WHITE} fg={PLATE.accent} />
      <T style={{ color: WHITE, fontFamily: F.extra, fontSize: 11, lineHeight: 14 }}>LinguaLens</T>
    </View>
  );
}

// Корінь знімка. collapsable={false}: на Android «порожній» з погляду
// лейауту View інакше розчиниться в батьківському, і знімати не буде що.
// Ні backgroundColor, ні overflow: прозорий і нічого не різать сам.
function Root({ cardRef, onLayout, minHeight, padded = true, children, kind }) {
  return (
    <View
      ref={cardRef}
      collapsable={false}
      onLayout={onLayout}
      testID={'sticker-' + kind}
      // justifyContent: вміст нижчий за найменшу висоту стає по центру, а не
      // лишає порожню смугу внизу PNG
      style={{ width: STICKER_W, minHeight, padding: padded ? STICKER_PAD : 0, alignItems: 'center', justifyContent: 'center' }}
    >
      {children}
    </View>
  );
}

// ─── object: предмет і слово ───────────────────────────────────────────────
// Наліпка 272 pt (контур і тінь як у словнику) і табличка з нахилом +2.5°,
// що наїжджає на низ предмета. Ярлик прив'язаний до верхнього правого кута
// самої наліпки: де б вона не стала в корені, він поруч із предметом.
const OBJECT = 272;
// Поле навколо силуету всередині вирізаної наліпки (Sticker.js: облямівка,
// розмиття й зсув тіні — MARGIN = 0.05 + 0.03 × 2 + 0.025).
const CUT_MARGIN = 0.135;

// Де стати ярлику: біля правого верхнього краю самого предмета, а не
// порожнього кута квадрата (силует чашки займає лише його середину).
// Без силуету (круглий кроп) — у куті квадрата.
export function brandSpot(word, size = OBJECT) {
  const pts = silhouette({ shape: word?.shape, outline: word?.outline, box: word?.box }, 1);
  if (!pts) return { top: 14, right: 0 };
  const at = (v) => ((v + CUT_MARGIN) / (1 + CUT_MARGIN * 2)) * size;
  const maxX = at(Math.max(...pts.map((p) => p[0])));
  const minY = at(Math.min(...pts.map((p) => p[1])));
  return {
    top: Math.round(Math.max(0, Math.min(size * 0.45, minY - 24))),
    right: Math.round(Math.max(-6, Math.min(size - 120, size - maxX - 34))),
  };
}

function ObjectSticker({ word }) {
  const uri = resolvePhoto(word.photo);
  return (
    <>
      <View>
        <StickerLarge uri={uri} shape={word.shape} outline={word.outline} box={word.box} size={OBJECT} halo={false} />
        <BrandTag rotate={8} style={brandSpot(word)} />
      </View>
      <WordPlate word={word} size="md" tilt={2.5} style={{ marginTop: -46 }} />
    </>
  );
}

// ─── word: лише слово ──────────────────────────────────────────────────────
// Велика табличка з нахилом −2°. Ярлик прив'язаний до її правого верхнього
// кута: і коротке «mug», і довга «die Geschirrspülmaschine» отримують
// його на тому самому місці відносно таблички.
function WordSticker({ word }) {
  return (
    <View style={{ flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingTop: 10 }}>
      <View>
        <WordPlate word={word} size="lg" tilt={-2} />
        <BrandTag rotate={7} style={{ top: -15, right: -8 }} />
      </View>
    </View>
  );
}

// ─── scene: набір слів ─────────────────────────────────────────────────────
// Шапка-пігулка (знак, назва, прапорець, «10 слів») і фішки по дві в ряд з
// легким нахилом, як купка наліпок. Координати — з sceneSetLayout.
function SceneSet({ scene, t }) {
  const L = sceneSetLayout(scene.objects);
  const c = SCENE_CHIP;
  return (
    <>
      <View style={{ position: 'absolute', left: 0, right: 0, top: STICKER_PAD + 6, height: SCENE_HEAD_H, alignItems: 'center' }}>
        <View
          testID="sticker-brand"
          style={[
            LIFT,
            {
              height: SCENE_HEAD_H,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: PLATE.accent,
              borderRadius: 999,
              borderWidth: 2.5,
              borderColor: WHITE,
              paddingLeft: 9,
              paddingRight: 13,
              transform: [{ rotate: '-3deg' }],
            },
          ]}
        >
          <LogoMark size={18} color={WHITE} fg={PLATE.accent} />
          <T numberOfLines={1} style={{ color: WHITE, fontFamily: F.extra, fontSize: 13, lineHeight: 17, flexShrink: 1 }}>
            {'LinguaLens · '}
            {scene.lang ? flagFor(scene.lang) + ' ' : ''}
            {t('sceneCardWords', { n: scene.objects.length })}
          </T>
        </View>
      </View>
      {L.chips.map((ch) => (
        <View
          key={ch.key}
          style={[
            PLATE_STYLE,
            {
              position: 'absolute',
              left: ch.x,
              top: ch.y,
              width: ch.w,
              height: ch.h,
              borderRadius: 14,
              paddingHorizontal: c.padX - 2,
              alignItems: 'center',
              justifyContent: 'center',
              transform: [{ rotate: `${ch.rotate}deg` }],
            },
          ]}
        >
          <T
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.8}
            style={{ color: PLATE.accent, fontFamily: F.extra, fontSize: ch.wordSize, lineHeight: c.lineW, letterSpacing: -ch.wordSize * 0.015 }}
          >
            {ch.word}
          </T>
          {ch.translation ? (
            <T
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.8}
              style={{ color: PLATE.ink, fontFamily: F.semi, fontSize: ch.subSize, lineHeight: c.lineS }}
            >
              {ch.translation}
            </T>
          ) : null}
        </View>
      ))}
      {L.more > 0 ? (
        <View style={{ position: 'absolute', left: 0, right: 0, top: L.moreY, alignItems: 'center' }}>
          <View
            style={[
              PLATE_STYLE,
              { height: SCENE_MORE_H, borderRadius: 999, paddingHorizontal: 12, justifyContent: 'center', transform: [{ rotate: '-2deg' }] },
            ]}
          >
            <T style={{ color: PLATE.dim, fontFamily: F.extra, fontSize: 13, lineHeight: 17 }}>{t('sceneCardMore', { n: L.more })}</T>
          </View>
        </View>
      ) : null}
    </>
  );
}

// ─── badge: медаль ─────────────────────────────────────────────────────────
// Білий вируб 200 pt з тінню → акцентний диск з обідком кольору рівня →
// іконка досягнення білим. Табличка «Нове досягнення / Моє досягнення» і
// назва; Lingo визирає збоку, ярлик — у лівому верхньому куті.
const MEDAL = 200;
const DISC = 178;

function BadgeSticker({ payload, t }) {
  const { achievement, fresh } = payload;
  const title = t('ach_' + achievement.id);
  const size = fontSizeForWord(title, { max: 24, min: 18, width: 230 });
  return (
    <>
      <View
        style={{
          marginTop: 8,
          width: MEDAL,
          height: MEDAL,
          borderRadius: MEDAL / 2,
          backgroundColor: WHITE,
          borderWidth: 1,
          borderColor: PLATE.line,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: PLATE.shadow,
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 5,
        }}
      >
        <View
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            backgroundColor: PLATE.accent,
            borderWidth: 6,
            borderColor: tierColor(PALETTES[0], achievement.tier),
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <AchIcon id={achievement.id} size={104} color={WHITE} />
        </View>
      </View>
      <View
        style={[
          PLATE_STYLE,
          {
            marginTop: -26,
            maxWidth: STICKER_W - STICKER_PAD * 2 - 8,
            borderRadius: 18,
            paddingHorizontal: 18,
            paddingTop: 7,
            paddingBottom: 9,
            alignItems: 'center',
            transform: [{ rotate: '-2deg' }],
          },
        ]}
      >
        <T
          numberOfLines={1}
          style={{ color: PLATE.dim, fontFamily: F.extra, fontSize: 9.5, lineHeight: 13, letterSpacing: 1.2, textTransform: 'uppercase' }}
        >
          {fresh ? t('shareUnlocked') : t('shareMyAch')}
        </T>
        <T
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.8}
          style={{ color: PLATE.ink, fontFamily: F.extra, fontSize: size, lineHeight: Math.round(size * 1.24), textAlign: 'center' }}
        >
          {title}
        </T>
      </View>
      <Mascot pose="celebrate" size={78} style={{ position: 'absolute', right: 20, top: 140 }} />
      <BrandTag rotate={-8} style={{ top: 14, left: 22 }} />
    </>
  );
}

// Підпис для VoiceOver: що саме на наліпці.
export function stickerLabel(payload, t) {
  if (payload?.kind === 'word' && payload.word) {
    return [payload.word.word, payload.word.translation].filter(Boolean).join(' — ');
  }
  if (payload?.kind === 'scene' && payload.scene) return t('sceneCardWords', { n: payload.scene.objects?.length || 0 });
  if (payload?.kind === 'achievement' && payload.achievement) return t('ach_' + payload.achievement.id);
  return '';
}

// Одна наліпка в натуральному розмірі. cardRef — на корінь (його знімає
// capture.js), onLayout — справжня висота кореня для розміру PNG.
export function StickerArt({ payload, kind, t, cardRef, onLayout }) {
  const common = { cardRef, onLayout, kind };
  if (kind === 'object' && payload.word && resolvePhoto(payload.word.photo)) {
    return (
      <Root {...common} minHeight={STICKER_MIN_H.object}>
        <ObjectSticker word={payload.word} />
      </Root>
    );
  }
  if ((kind === 'word' || kind === 'object') && payload.word) {
    return (
      <Root {...common} kind="word" minHeight={STICKER_MIN_H.word}>
        <WordSticker word={payload.word} />
      </Root>
    );
  }
  if (kind === 'scene' && payload.scene) {
    return (
      <Root {...common} minHeight={sceneSetLayout(payload.scene.objects).height} padded={false}>
        <SceneSet scene={payload.scene} t={t} />
      </Root>
    );
  }
  if (kind === 'badge' && payload.achievement) {
    return (
      <Root {...common} minHeight={STICKER_MIN_H.badge}>
        <BadgeSticker payload={payload} t={t} />
      </Root>
    );
  }
  return null;
}
