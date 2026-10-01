// Картки «поділитись» для сцени — фото з людського життя, де предмети
// підписані своїми словами. Заради цього сцену й знімають, тож правила ті
// самі, що в ShareCards.js, і ще одне понад них: фото людини не псуємо.
// Жодних рамок-прямокутників, кислотних кольорів і логотипа на півкадру —
// предмети підписані так, як підписав би їх дизайнер журналу.
//
// Три вигляди:
//   • «Наліпки» — предмети підняті наліпками, решта фото ледь пригашена,
//     підписи на білих плашках (як на екрані сцени);
//   • «Підписи» — фото без змін, лише крапка на предметі, тонка лінія й
//     білий підпис збоку: редакційна анотація;
//   • «Рамка» — фото вставкою на кольоровому тлі з номерами на предметах і
//     чистим нумерованим списком під ним.
// Сцена вже знята в 9:16, тож на перших двох вона йде на весь кадр.
import { useId } from 'react';
import { Image, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { LogoMark } from '../Logo';
import { nameFor } from '../speech';
import { inflate, smoothPath } from '../stickerGeometry';
import { F, type } from '../theme';
import { LiftedObjects, Leaders, SceneChip, sceneShapes } from '../scene/SceneArt';
import { anchorOf, chipSize, contourPoints, layoutChips, rectOf } from '../scene/sceneLayout';
import { sceneImageUri } from '../scene/scenes';
import { CARD_H, CARD_W, CONTENT_W, PAD_BOTTOM, PAD_TOP, PAD_X, dateLabel, textEm } from './layout';

// Кольори підписів на фото для кожної палітри картки. Плашка світла або
// графітова, акцент палітри — лише в перекладі й крапці: так фото лишається
// головним, а палітра все одно впізнавана. Пари «текст/плашка» тримають
// WCAG AA — це перевіряє тест.
export const SCENE_INK = {
  violet: { chip: '#FFFFFF', word: '#1F1B16', sub: '#5B4FD6', dot: '#5B4FD6' },
  chalk: { chip: '#FAF8F4', word: '#1F1B16', sub: '#66625A', dot: '#1F1B16' },
  graphite: { chip: '#151412', word: '#F5F1EA', sub: '#A9A49B', dot: '#151412' },
  sunset: { chip: '#FFFFFF', word: '#1F1B16', sub: '#C0432F', dot: '#C0432F' },
};
const inkFor = (pal) => SCENE_INK[pal.key] || SCENE_INK.violet;

// Скільки рядків списку на «Рамці», решта — «+N»
export const FRAME_ROWS = 6;
const ROW_H = 27;

function Txt(props) {
  return <Text allowFontScaling={false} {...props} />;
}

const caps = (color, size = 10) => ({
  color,
  fontFamily: F.extra,
  fontSize: size,
  lineHeight: Math.round(size * 1.35),
  letterSpacing: size * 0.14,
  textTransform: 'uppercase',
});

// Фото, що накриває прямокутник w×h цілком (cover), по центру.
function coverFrame(imgW, imgH, w, h) {
  const k = Math.max(w / imgW, h / imgH);
  return { x: (w - imgW * k) / 2, y: (h - imgH * k) / 2, w: imgW * k, h: imgH * k };
}

// Вставка на «Рамці» нижча за саме фото 9:16, тож показує лише його смугу.
// Обираємо ту смугу, де вміщається найбільше предметів (з полем, щоб
// крапка не лягла на край), а з рівних — ту, що тримає їх по центру.
// points — центри предметів у частках фото (0–1).
export function insetFrame(imgW, imgH, w, h, points) {
  const f = coverFrame(imgW, imgH, w, h);
  const slackX = f.w - w;
  const slackY = f.h - h;
  if (!points.length || (slackX < 1 && slackY < 1)) return f;
  const horizontal = slackX >= slackY;
  const slack = horizontal ? slackX : slackY;
  const size = horizontal ? w : h;
  const full = horizontal ? f.w : f.h;
  const coord = points.map((p) => (horizontal ? p.x : p.y) * full);
  const mean = coord.reduce((sum, c) => sum + c, 0) / coord.length;
  const margin = size * 0.08;
  let best = null;
  for (let off = 0; off <= slack; off += 2) {
    const inside = coord.filter((c) => c - off >= margin && c - off <= size - margin).length;
    const centring = Math.abs(mean - off - size / 2);
    if (!best || inside > best.inside || (inside === best.inside && centring < best.centring)) best = { off, inside, centring };
  }
  return horizontal ? { ...f, x: -best.off, y: f.y } : { ...f, x: f.x, y: -best.off };
}

// «ENGLISH · 7 WORDS» — мова й кількість, тихим капсом.
function metaLine(scene, count, t) {
  return [scene.lang ? nameFor(scene.lang) : null, t('sceneCardWords', { n: count })].filter(Boolean).join(' · ');
}

// Знак і назва. На фото — білі, на тлі палітри — її кольори.
function Brand({ color, fg, tagline }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <LogoMark size={22} color={color} fg={fg} />
      <View>
        <Txt style={{ color, ...type(13, F.extra, { noLead: true }), lineHeight: 16 }}>LinguaLens</Txt>
        {tagline ? <Txt style={{ color: tagline.color, fontFamily: F.reg, fontSize: 10, lineHeight: 13 }}>{tagline.text}</Txt> : null}
      </View>
    </View>
  );
}

// Низ фото-карток: м'яке затемнення, щоб білий бренд читався на світлій
// підлозі, і рядок «бренд — мова й кількість слів».
function PhotoFooter({ meta }) {
  const h = 150;
  // аркуш показує кілька карток разом — кожній свій id градієнта
  const id = 'scrim' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <>
      <Svg width={CARD_W} height={h} style={{ position: 'absolute', left: 0, bottom: 0 }}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="1" x2="0" y2="0">
            <Stop offset="0" stopColor="#000" stopOpacity={0.5} />
            <Stop offset="0.6" stopColor="#000" stopOpacity={0.16} />
            <Stop offset="1" stopColor="#000" stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect width={CARD_W} height={h} fill={`url(#${id})`} />
      </Svg>
      <View
        style={{
          position: 'absolute',
          left: PAD_X - 8,
          right: PAD_X - 8,
          bottom: PAD_BOTTOM - 14,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <Brand color="#FFFFFF" fg="#1F1B16" />
        <Txt numberOfLines={1} style={[caps('rgba(255,255,255,0.86)'), { flexShrink: 1 }]}>
          {meta}
        </Txt>
      </View>
    </>
  );
}

// Безпечна зона підписів на фото-картках: згори Instagram малює аватар,
// знизу — наш бренд і поле відповіді.
const PHOTO_BOUNDS = { x1: 14, y1: PAD_TOP - 8, x2: CARD_W - 14, y2: CARD_H - PAD_BOTTOM - 40 };

// ─── «Наліпки» ─────────────────────────────────────────────────────────────
function StickersCard({ scene, uri, frame, pal, t }) {
  const ink = inkFor(pal);
  const items = scene.objects.map((o) => {
    const size = chipSize(o.word, o.translation, { size: 14, sub: 11, maxW: 150, padX: 10, padY: 5 });
    return { key: o.key, rect: rectOf(o.box, frame), anchor: anchorOf(o, frame), w: size.w, h: size.h, size };
  });
  const chips = layoutChips(items, PHOTO_BOUNDS);
  const lines = chips.filter((c) => c.leader).map((c) => ({ key: c.key, from: c.leader.from, to: c.leader.to }));
  return (
    <>
      <Image source={{ uri }} style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }} />
      <View style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H, backgroundColor: 'rgba(0,0,0,0.22)' }} />
      <LiftedObjects uri={uri} frame={frame} width={CARD_W} height={CARD_H} shapes={sceneShapes(scene.objects, frame)} />
      <PhotoFooter meta={metaLine(scene, scene.objects.length, t)} />
      <Leaders width={CARD_W} height={CARD_H} lines={lines} dot={ink.chip} dotR={2.6} ring={1.2} halo={7} />
      {chips.map((c, i) => (
        <SceneChip
          key={c.key}
          word={scene.objects[i].word}
          translation={scene.objects[i].translation}
          size={items[i].size}
          colors={{ bg: ink.chip, word: ink.word, sub: ink.sub }}
          radius={11}
          padX={10}
          style={{ position: 'absolute', left: c.x, top: c.y }}
        />
      ))}
    </>
  );
}

// ─── «Підписи» ─────────────────────────────────────────────────────────────
// Текст без плашки, тож розмір — лише сам текст; тінь під літерами тримає
// білий підпис і на світлій стіні.
const LABEL_SHADOW = { textShadowColor: 'rgba(0,0,0,0.6)', textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } };

function LabelsCard({ scene, uri, frame, pal, t }) {
  const ink = inkFor(pal);
  const items = scene.objects.map((o) => {
    const size = chipSize(o.word, o.translation, { size: 15, sub: 12, maxW: 140, padX: 2, padY: 1 });
    return { key: o.key, rect: rectOf(o.box, frame), anchor: anchorOf(o, frame), w: size.w, h: size.h, size };
  });
  const labels = layoutChips(items, PHOTO_BOUNDS, { mode: 'callout' });
  const lines = labels.map((c) => ({ key: c.key, from: c.leader.from, to: c.leader.to }));
  return (
    <>
      <Image source={{ uri }} style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }} />
      <PhotoFooter meta={metaLine(scene, scene.objects.length, t)} />
      <Leaders width={CARD_W} height={CARD_H} lines={lines} dot={ink.dot} dotR={3.4} ring={2} halo={10} />
      {labels.map((c, i) => {
        const o = scene.objects[i];
        const { size } = items[i];
        return (
          <View key={c.key} style={{ position: 'absolute', left: c.x, top: c.y, width: c.w, height: c.h, justifyContent: 'center' }}>
            <Txt
              numberOfLines={1}
              style={[{ color: '#FFFFFF', fontFamily: F.extra, fontSize: size.wordSize, lineHeight: size.lineW, textAlign: c.align, letterSpacing: -0.15 }, LABEL_SHADOW]}
            >
              {o.word}
            </Txt>
            {o.translation ? (
              <Txt
                numberOfLines={1}
                style={[{ color: 'rgba(255,255,255,0.88)', fontFamily: F.semi, fontSize: size.subSize, lineHeight: size.lineS, textAlign: c.align }, LABEL_SHADOW]}
              >
                {o.translation}
              </Txt>
            ) : null}
          </View>
        );
      })}
    </>
  );
}

// ─── «Рамка» ───────────────────────────────────────────────────────────────
// Кегль списку — один на всі рядки, щоб номери й тире стояли рівно; довге
// німецьке слово зменшує весь список, а не стирчить окремо.
export function listFontSize(objects, width = CONTENT_W - 26) {
  const widest = Math.max(0, ...objects.map((o) => textEm(o.word) + (o.translation ? textEm(' — ' + o.translation, 0) * 0.95 : 0)));
  if (!widest) return 17;
  return Math.max(12, Math.min(17, Math.floor((width * 0.96) / widest)));
}

function FrameCard({ scene, uri, pal, t, locale }) {
  const objects = scene.objects;
  const rows = objects.slice(0, FRAME_ROWS);
  const more = objects.length - rows.length;
  const listH = rows.length * ROW_H + (more > 0 ? 22 : 0);
  // Фото забирає все, що лишилось від списку, заголовка й підпису
  const photoH = Math.max(220, Math.min(400, CARD_H - PAD_TOP - PAD_BOTTOM - 16 - 18 - 22 - listH - 36 - 20));
  // Смугу фото підбираємо під пронумеровані предмети: номер на фото без
  // рядка в списку (чи навпаки) лише плутав би.
  const anchors = rows.map((o) => anchorOf(o, { x: 0, y: 0, w: 1, h: 1 }));
  const inset = insetFrame(scene.width || 1080, scene.height || 1920, CONTENT_W, photoH, anchors);
  const size = listFontSize(rows);
  // На фото — лише ті пронумеровані предмети, чия крапка вміщається у
  // вставку: обрізаний край чужого контуру читався б як випадкова лінія.
  const marks = rows
    .map((o, i) => ({ o, a: anchorOf(o, inset), n: i + 1 }))
    .filter(({ a }) => a.x >= 10 && a.x <= CONTENT_W - 10 && a.y >= 10 && a.y <= photoH - 10);
  return (
    <View style={{ flex: 1, paddingHorizontal: PAD_X, paddingTop: PAD_TOP, paddingBottom: PAD_BOTTOM }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <Txt numberOfLines={1} style={[caps(pal.muted, 11), { flexShrink: 1 }]}>
          {metaLine(scene, objects.length, t)}
        </Txt>
        <Txt style={caps(pal.muted, 11)}>{dateLabel(scene.createdAt || Date.now(), locale)}</Txt>
      </View>

      <View style={{ height: photoH, marginTop: 18, borderRadius: 20, overflow: 'hidden', backgroundColor: pal.line }}>
        <Image source={{ uri }} style={{ position: 'absolute', left: inset.x, top: inset.y, width: inset.w, height: inset.h }} />
        <Svg width={CONTENT_W} height={photoH} style={{ position: 'absolute', left: 0, top: 0 }}>
          {marks.map(({ o }) => (
            <Path
              key={o.key}
              d={smoothPath(inflate(contourPoints(o, inset), 1.5))}
              fill="none"
              stroke="#FFFFFF"
              strokeOpacity={0.92}
              strokeWidth={1.5}
              strokeLinejoin="round"
            />
          ))}
        </Svg>
        {marks.map(({ o, a, n }) => (
          <View
            key={o.key}
            style={{
              position: 'absolute',
              left: a.x - 10,
              top: a.y - 10,
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: '#FFFFFF',
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
            }}
          >
            <Txt style={{ color: '#1F1B16', fontFamily: F.extra, fontSize: 11, lineHeight: 14 }}>{n}</Txt>
          </View>
        ))}
      </View>

      <View style={{ marginTop: 22 }}>
        {rows.map((o, i) => (
          <View key={o.key} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center' }}>
            <Txt style={{ width: 26, color: pal.accent, fontFamily: F.extra, fontSize: 13, lineHeight: 18 }}>{i + 1}</Txt>
            <Txt numberOfLines={1} style={{ flex: 1, color: pal.text, fontFamily: F.extra, fontSize: size, lineHeight: Math.round(size * 1.3), letterSpacing: -0.1 }}>
              {o.word}
              {o.translation ? <Txt style={{ color: pal.muted, fontFamily: F.reg }}>{' — ' + o.translation}</Txt> : null}
            </Txt>
          </View>
        ))}
        {more > 0 ? (
          <Txt style={{ marginLeft: 26, color: pal.muted, fontFamily: F.semi, fontSize: 14, lineHeight: 22 }}>
            {t('sceneCardMore', { n: more })}
          </Txt>
        ) : null}
      </View>

      <View style={{ flex: 1 }} />
      <Brand color={pal.text} fg={pal.bg} tagline={{ text: t('shareTagline'), color: pal.muted }} />
    </View>
  );
}

// Одна картка сцени в повному розмірі 360×640. cardRef — на кореневий
// View, саме його знімає capture.js. Приховані предмети сюди вже не
// потрапляють: SceneView віддає лише видимі.
export function SceneCard({ payload, template, pal, t, locale, cardRef }) {
  const scene = payload.scene;
  const uri = sceneImageUri(scene);
  const frame = coverFrame(scene.width || 1080, scene.height || 1920, CARD_W, CARD_H);
  const props = { scene, uri, frame, pal, t, locale };
  const photo = template !== 'sceneFrame';
  return (
    // collapsable={false}: на Android «порожній» з погляду лейауту View
    // інакше розчиниться в батьківському, і знімати не буде що.
    <View
      ref={cardRef}
      collapsable={false}
      style={{ width: CARD_W, height: CARD_H, overflow: 'hidden', backgroundColor: photo ? '#000' : pal.bg }}
    >
      {template === 'sceneStickers' ? <StickersCard {...props} /> : null}
      {template === 'sceneLabels' ? <LabelsCard {...props} /> : null}
      {template === 'sceneFrame' ? <FrameCard {...props} /> : null}
    </View>
  );
}
