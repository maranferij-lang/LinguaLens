// Картки «поділитись» для сцени — фото з людського життя, де предмети
// підписані своїми словами. Заради цього сцену й знімають, тож правила ті
// самі, що в ShareCards.js, і ще одне понад них: фото людини не псуємо.
// Жодних рамок-прямокутників, кислотних кольорів і логотипа на півкадру —
// предмети підписані так, як підписав би їх дизайнер журналу.
//
// Три вигляди:
//   • «Наліпки» — предмети підняті наліпками, решта фото ледь пригашена,
//     підписи на білих плашках (як на екрані сцени);
//   • «Підписи» — крапка на предметі, тонка лінія й підпис збоку на
//     темній напівпрозорій плашці: редакційна анотація;
//   • «Рамка» — фото вставкою на кольоровому тлі з номерами на предметах і
//     чистим списком під ним: номер у рядку — лише в тих, кого видно у
//     вставці.
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

// Крапка лишається на предметі, але не в тих самих зонах: інакше килим на
// підлозі ставить свою крапку посеред «LinguaLens» унизу. Предмет, що
// виходить за зону, отримує крапку на своєму ж краю всередині неї; той, що
// весь сховався під брендом чи аватаром, на фото не підписуємо (у підсумку
// «N слів» він лишається).
export function photoAnchor(o, frame) {
  const a = anchorOf(o, frame);
  const top = PHOTO_BOUNDS.y1 + 6;
  const bottom = PHOTO_BOUNDS.y2 - 6;
  if (a.y >= top && a.y <= bottom) return a;
  const r = rectOf(o.box, frame);
  const y = Math.min(bottom, Math.max(top, a.y));
  return y >= r.y1 && y <= r.y2 ? { x: a.x, y } : null;
}

// Предмети, яким є де стати на фото, разом із їхньою крапкою
function onPhoto(scene, frame) {
  return scene.objects.map((o) => ({ o, anchor: photoAnchor(o, frame) })).filter((p) => p.anchor);
}

// ─── «Наліпки» ─────────────────────────────────────────────────────────────
function StickersCard({ scene, uri, frame, pal, t }) {
  const ink = inkFor(pal);
  const shown = onPhoto(scene, frame);
  const items = shown.map(({ o, anchor }) => {
    const size = chipSize(o.word, o.translation, { size: 14, sub: 11, maxW: 150, padX: 10, padY: 5 });
    return { key: o.key, rect: rectOf(o.box, frame), anchor, w: size.w, h: size.h, size };
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
          word={shown[i].o.word}
          translation={shown[i].o.translation}
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
// Білий текст на фото тримає лише гарантована підкладка: на білій чи
// бежевій стіні тінь під літерами розпливається сірим туманом, і підпис
// зникає. Тож кожен підпис стоїть на темній напівпрозорій плашці — як
// титр у журналі: фото крізь неї видно, а слово читається на будь-якій
// стіні (≥ 4.5:1 навіть на чисто білій — це перевіряє тест).
export const LABEL_INK = { plate: 'rgba(20,18,16,0.72)', word: '#FFFFFF', sub: 'rgba(255,255,255,0.86)', edge: 'rgba(255,255,255,0.14)' };
// Плашку міряє chipSize з тими самими полями, тож розкладка знає справжній
// розмір підпису й не ставить плашки одна на одну.
const LABEL_PAD = { x: 7, y: 3 };

function LabelsCard({ scene, uri, frame, pal, t }) {
  const ink = inkFor(pal);
  const shown = onPhoto(scene, frame);
  const items = shown.map(({ o, anchor }) => {
    const size = chipSize(o.word, o.translation, { size: 15, sub: 12, maxW: 150, padX: LABEL_PAD.x, padY: LABEL_PAD.y });
    return { key: o.key, rect: rectOf(o.box, frame), anchor, w: size.w, h: size.h, size };
  });
  const labels = layoutChips(items, PHOTO_BOUNDS, { mode: 'callout' });
  const lines = labels.map((c) => ({ key: c.key, from: c.leader.from, to: c.leader.to }));
  return (
    <>
      <Image source={{ uri }} style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }} />
      {/* ледь пригашуємо фото, як на «Наліпках»: білі лінії й крапки
          лишаються видимими й там, де плашки немає */}
      <View style={{ position: 'absolute', left: 0, top: 0, width: CARD_W, height: CARD_H, backgroundColor: 'rgba(0,0,0,0.12)' }} />
      <PhotoFooter meta={metaLine(scene, scene.objects.length, t)} />
      <Leaders width={CARD_W} height={CARD_H} lines={lines} dot={ink.dot} dotR={3.4} ring={2} halo={10} under />
      {labels.map((c, i) => {
        const { o } = shown[i];
        const { size } = items[i];
        return (
          <View
            key={c.key}
            style={{
              position: 'absolute',
              left: c.x,
              top: c.y,
              width: c.w,
              height: c.h,
              justifyContent: 'center',
              paddingHorizontal: LABEL_PAD.x,
              borderRadius: 8,
              backgroundColor: LABEL_INK.plate,
              borderWidth: 0.5,
              borderColor: LABEL_INK.edge,
              shadowColor: '#000',
              shadowOpacity: 0.18,
              shadowRadius: 8,
              shadowOffset: { width: 0, height: 2 },
            }}
          >
            <Txt
              numberOfLines={1}
              style={{ color: LABEL_INK.word, fontFamily: F.extra, fontSize: size.wordSize, lineHeight: size.lineW, textAlign: c.align, letterSpacing: -0.15 }}
            >
              {o.word}
            </Txt>
            {o.translation ? (
              <Txt
                numberOfLines={1}
                style={{ color: LABEL_INK.sub, fontFamily: F.semi, fontSize: size.subSize, lineHeight: size.lineS, textAlign: c.align }}
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

const boxArea = ([y1, x1, y2, x2]) => Math.max(0, y2 - y1) * Math.max(0, x2 - x1);

// Розкладка «Рамки»: висота фото, його смуга, рядки списку й номери на
// фото. Номери в списку — рівно ті, що стоять крапками на фото: номер без
// крапки (чи навпаки) лише плутав би. А смуга вміщає далеко не все: у кадрі
// від стелі до підлоги лампу під стелею й килим на підлозі одна вставка не
// покаже. Тож видимі на фото йдуть у список першими й нумеруються 1…k,
// решта — тихою крапкою без номера.
export function frameLayout(scene) {
  const objects = scene.objects;
  const count = Math.min(objects.length, FRAME_ROWS);
  const more = objects.length - count;
  const listH = count * ROW_H + (more > 0 ? 22 : 0);
  // Фото забирає все, що лишилось від списку, заголовка й підпису
  const photoH = Math.max(220, Math.min(400, CARD_H - PAD_TOP - PAD_BOTTOM - 16 - 18 - 22 - listH - 36 - 20));
  // Смугу підбираємо під усі предмети сцени — ту, де їх видно найбільше
  const anchors = objects.map((o) => anchorOf(o, { x: 0, y: 0, w: 1, h: 1 }));
  const inset = insetFrame(scene.width || 1080, scene.height || 1920, CONTENT_W, photoH, anchors);
  // На фото — лише ті предмети, чия крапка вміщається у вставку: обрізаний
  // край чужого контуру читався б як випадкова лінія.
  const placed = objects.map((o) => {
    const a = anchorOf(o, inset);
    return { o, a, shown: a.x >= 10 && a.x <= CONTENT_W - 10 && a.y >= 10 && a.y <= photoH - 10 };
  });
  // Дві крапки одна на одній не прочитати. Крапка великого предмета часто
  // падає на дрібний поверх нього (диван — на подушку), тож місце лишається
  // за дрібним, а великий іде в список без номера.
  const taken = [];
  for (const p of [...placed].sort((m, k) => boxArea(m.o.box) - boxArea(k.o.box))) {
    if (!p.shown) continue;
    if (taken.some((q) => Math.hypot(q.a.x - p.a.x, q.a.y - p.a.y) < 22)) p.shown = false;
    else taken.push(p);
  }
  const rows = [...placed.filter((p) => p.shown), ...placed.filter((p) => !p.shown)]
    .slice(0, FRAME_ROWS)
    .map((p, i) => ({ ...p, n: p.shown ? i + 1 : null }));
  return { photoH, inset, rows, marks: rows.filter((r) => r.n), more };
}

function FrameCard({ scene, uri, pal, t, locale }) {
  const objects = scene.objects;
  const { photoH, inset, rows, marks, more } = frameLayout(scene);
  const size = listFontSize(rows.map((r) => r.o));
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
        {rows.map(({ o, n }) => (
          <View key={o.key} style={{ height: ROW_H, flexDirection: 'row', alignItems: 'center' }}>
            {n ? (
              <Txt style={{ width: 26, color: pal.accent, fontFamily: F.extra, fontSize: 13, lineHeight: 18 }}>{n}</Txt>
            ) : (
              // окремої крапки на фото в нього немає — тиха крапка замість номера
              <View style={{ width: 26 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, marginLeft: 2, backgroundColor: pal.muted, opacity: 0.7 }} />
              </View>
            )}
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
