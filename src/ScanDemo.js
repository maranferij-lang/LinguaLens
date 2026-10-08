// Демо онбордингу «скан → наліпка → слово → сцена» (onboarding.md §6,
// макети onboarding-demo-keyframes-*.png; онбординг 4.0 — біт «сцена»). Не
// відео, а наш же інтерфейс,
// намальований кодом: слово й переклад — мовами, які людина щойно обрала
// (DEMO_WORDS), тож анімація говорить будь-якою з 29 × 28 пар без жодної
// нової картинки, темніє з темною темою навколо й поважає «Менше руху».
//
// Як рухається: одне майстер-значення t (0 → 10,8 с, лінійно, native
// driver), усі шари — interpolate від нього за доріжками src/demoTimeline.js
// (там же — demoAt для статичних кадрів і тестів). Лише обведення силуету
// (strokeDashoffset — властивість SVG) їде окремим JS-драйвером 900 мс.
// Один цикл — і стоп на фіналі; тап по сцені під час руху — одразу фінал;
// «Ще раз» — ще один цикл. Дотики (Soft — «відклеїлось», Light — знімок
// сцени) — лише в першому циклі.
//
// Біт «сцена» (онбординг 4.0): перемикач «Предмет / Сцена» внизу кадру
// їде на «Сцену», кути видошукача охоплюють увесь стіл, спалах — і над
// чашкою, ноутбуком, рослиною й блокнотом по черзі спливають їхні слова
// (scene — demoScene: мовою навчання й перекладом, як і табличка).
//
// «Менше руху» — два статичні кадри поруч (предмет і вся сцена), кожен з
// підписом свого етапу, без дотиків. VoiceOver чує сцену одним елементом
// (obDemoA11y).
//
// Кольори сцени фіксовані (план §5.14: ScanDemo — серед дозволених) —
// це «кадр камери», а не інтерфейс.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import WordPlate, { PLATE } from './WordPlate';
import Flame from './streak/Flame';
import {
  Corners,
  DeskMug,
  DemoDesk,
  FRAME,
  MUG_BODY,
  MUG_SIL,
  MiniMug,
  MugSticker,
  SCENE_H,
  SCENE_SPOTS,
  SCENE_W,
  Vignette,
  WIDE_FRAME,
} from './DemoDesk';
import {
  BEATS,
  DEMO_LOOPS,
  DEMO_LOOP_MS,
  FLY_POINTS,
  FLY_SCALE,
  FLY_STEPS,
  HAPTICS,
  MUG_LEN,
  MUG_ORIGIN,
  STATIC_FRAMES,
  demoAt,
  rangeOf,
} from './demoTimeline';
import { IcBook } from './icons';
import { DUR, EASE, useReducedMotion } from './motion';
import { F, R, THEMES, ThemeProvider, themeKeyOf, type, useTheme } from './theme';

const APath = Animated.createAnimatedComponent(Path);
const ORIGIN = `${MUG_ORIGIN.x}px ${MUG_ORIGIN.y}px`;
const BEAT_KEYS = ['obDemoBeat1', 'obDemoBeat2', 'obDemoBeat3', 'obDemoBeat4', 'obDemoFinal'];
// Етапи з крапками (фінал крапки не має — він підсумок)
const DOTS = BEAT_KEYS.length - 1;
// Перемикач «Предмет / Сцена»: ширина сегмента й висота (координати сцени)
const SEG = 98;
const MODE_H = 38;
const T = (p) => <Text allowFontScaling={false} {...p} />;
// Вогник серії на «кадрі камери» — фірмовий, у темному вигляді палітри,
// яку видно (сцена завжди темна, а повтор із Параметрів буває з
// Pro-палітрою): обвідка й число запаленого чипа — кольору вогника, і сам
// вогник у чипі малюється темним виглядом, а не світлим темним вогником на
// темному чипі.
function cameraTheme(palette) {
  return THEMES[themeKeyOf(palette, true)] || THEMES.dark;
}

// Масштаб сцени під доступне місце (сцена — 342×420, як у макеті)
export function sceneScale(width, height) {
  const w = width > 0 ? width / SCENE_W : 1;
  const h = height > 0 ? height / SCENE_H : 1;
  return Math.max(0.3, Math.min(1, w, h));
}

// Шари сцени. tv — майстер-значення (мс), ov — обведення 0…1; tags —
// підписи сцени (demoScene); k — масштаб сцени на екрані (для підписів).
function SceneLayers({ tv, ov, pair, tags = [], t, onReplay, final, k = 1 }) {
  const cam = cameraTheme(useTheme().palette);
  const lit = cam.C.flame;
  const at = (track) => tv.interpolate(rangeOf(track));
  const v = useMemo(() => {
    const peel = at('peel');
    const fly = at('fly');
    const breath = at('breath');
    const press = at('press');
    const count = at('count');
    const bump = at('bump');
    const plate = at('plate');
    const modeX = at('modeX');
    return {
      peel,
      fly,
      deskMug: at('deskMug'),
      sticker: at('sticker'),
      dim: at('dim'),
      trail: at('trail'),
      flash: at('flash'),
      scanning: at('scanning'),
      shutter: at('shutter'),
      sweepOn: at('sweepOn'),
      sweepX: at('sweep').interpolate({ inputRange: [0, 1], outputRange: [-70, MUG_BODY.w + 10] }),
      corners: Animated.multiply(at('corners'), breath.interpolate({ inputRange: [0, 1], outputRange: [0.95, 0.65] })),
      cornersScale: breath.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }),
      press: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.88] }),
      pressDim: press,
      count0: count.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      count1: count,
      bump,
      bumpScale: bump.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }),
      lit0: at('lit').interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      lit1: at('lit'),
      wide: at('wide'),
      mode: at('mode'),
      modeX: modeX.interpolate({ inputRange: [0, 1], outputRange: [0, SEG] }),
      modeObj: modeX.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
      modeScene: modeX,
      tags: [0, 1, 2, 3].map((i) => {
        const a = at('tag' + i);
        return {
          opacity: a.interpolate({ inputRange: [0, 0.5, 1.06], outputRange: [0, 1, 1] }),
          scale: a.interpolate({ inputRange: [0, 1, 1.06], outputRange: [0.6, 1, 1.06] }),
        };
      }),
      final: at('final'),
      plate,
      plateY: plate.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
      plateScale: plate.interpolate({ inputRange: [0, 1], outputRange: [0.96, 1] }),
      peelY: peel.interpolate({ inputRange: [0, 1.04], outputRange: [0, -34 * 1.04] }),
      peelRot: peel.interpolate({ inputRange: [0, 1.04], outputRange: ['0deg', `${-6 * 1.04}deg`] }),
      peelScale: peel.interpolate({ inputRange: [0, 1.04], outputRange: [1, 1 + 0.12 * 1.04] }),
      peelBorder: peel.interpolate({ inputRange: [0, 0.3, 1.04], outputRange: [0, 1, 1] }),
      flyX: fly.interpolate({ inputRange: FLY_STEPS, outputRange: FLY_POINTS.map((p) => p.x) }),
      flyY: fly.interpolate({ inputRange: FLY_STEPS, outputRange: FLY_POINTS.map((p) => p.y) }),
      flyScale: fly.interpolate({ inputRange: [0, 1], outputRange: [1, FLY_SCALE] }),
      flyRot: fly.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-8deg'] }),
    };
  }, [tv]);
  const dashOffset = useMemo(() => ov.interpolate({ inputRange: [0, 1], outputRange: [MUG_LEN, 0] }), [ov]);

  const fill = StyleSheet.absoluteFill;
  return (
    <View style={{ width: SCENE_W, height: SCENE_H }} pointerEvents="box-none">
      <DemoDesk />
      <Animated.View style={[fill, { opacity: v.deskMug }]} pointerEvents="none">
        <DeskMug />
      </Animated.View>

      {/* Світлова смуга — лише в межах тіла чашки */}
      <Animated.View
        pointerEvents="none"
        style={[styles.sweepBox, { opacity: v.sweepOn }]}
      >
        <Animated.View style={[styles.band, { transform: [{ translateX: v.sweepX }, { skewX: '-12deg' }] }]}>
          <Svg width={60} height={MUG_BODY.h + 40}>
            <Defs>
              <LinearGradient id="sdBand" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.55} />
                <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width={60} height={MUG_BODY.h + 40} fill="url(#sdBand)" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* Біла лінія обводить силует */}
      <View style={fill} pointerEvents="none">
        <Svg width={SCENE_W} height={SCENE_H}>
          <APath
            d={MUG_SIL}
            fill="none"
            stroke="#FFFFFF"
            strokeWidth={3.2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeDasharray={`${MUG_LEN} ${MUG_LEN}`}
            strokeDashoffset={dashOffset}
            opacity={0.95}
          />
        </Svg>
      </View>

      <Animated.View style={[fill, styles.dim, { opacity: v.dim }]} pointerEvents="none" />
      <View style={fill} pointerEvents="none">
        <Vignette />
      </View>

      {/* Пунктирний слід польоту */}
      <Animated.View style={[fill, { opacity: v.trail }]} pointerEvents="none">
        <Svg width={SCENE_W} height={SCENE_H}>
          <Path d="M175 225 C150 120 100 60 48 30" stroke="#FFFFFF" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" fill="none" opacity={0.8} />
        </Svg>
      </Animated.View>

      {/* Наліпка: відклеюється, отримує табличку й летить у «Мої слова» */}
      <Animated.View
        pointerEvents="none"
        style={[
          fill,
          {
            opacity: v.sticker,
            transformOrigin: ORIGIN,
            transform: [{ translateX: v.flyX }, { translateY: v.flyY }, { rotate: v.flyRot }, { scale: v.flyScale }],
          },
        ]}
      >
        <Animated.View
          style={[fill, { transformOrigin: ORIGIN, transform: [{ translateY: v.peelY }, { rotate: v.peelRot }, { scale: v.peelScale }] }]}
        >
          <Animated.View style={[fill, { opacity: v.peelBorder }]}>
            <MugSticker part="back" />
          </Animated.View>
          <View style={fill}>
            <MugSticker part="front" />
          </View>
          <Animated.View
            style={[styles.plateWrap, { opacity: v.plate, transform: [{ translateY: v.plateY }, { scale: v.plateScale }] }]}
          >
            <WordPlate word={pair} size="md" ipa tilt={4} testID="demo-plate" />
          </Animated.View>
        </Animated.View>
      </Animated.View>

      {/* Кути видошукача й затвор — як у справжньому сканері */}
      <Animated.View style={[fill, { opacity: v.corners, transform: [{ scale: v.cornersScale }] }]} pointerEvents="none">
        <Corners />
      </Animated.View>
      <Animated.View style={[styles.shutter, { opacity: v.shutter, transform: [{ scale: v.press }] }]} pointerEvents="none">
        <View style={styles.shutterCore} />
        <Animated.View style={[styles.shutterCore, styles.shutterPressed, { opacity: v.pressDim }]} />
      </Animated.View>
      <Animated.View style={[styles.scanPill, { opacity: v.scanning }]} pointerEvents="none">
        <View style={styles.chip}>
          <T style={styles.chipText}>{t('scanning')}</T>
        </View>
      </Animated.View>

      {/* Режим «Сцена»: кути довкола всього столу й підписи над предметами */}
      <Animated.View style={[fill, { opacity: v.wide }]} pointerEvents="none">
        <Corners frame={WIDE_FRAME} />
      </Animated.View>
      {tags.slice(0, 4).map((tg, i) => (
        <SceneTag key={tg.key} tag={tg} v={v.tags[i]} k={k} />
      ))}
      <Animated.View style={[styles.modeWrap, { opacity: v.mode }]} pointerEvents="none" testID="demo-mode">
        <View style={styles.modeTrack}>
          <Animated.View style={[styles.modeThumb, { transform: [{ translateX: v.modeX }] }]} />
          {[
            ['modeObject', v.modeObj],
            ['modeScene', v.modeScene],
          ].map(([k, on]) => (
            <View key={k} style={styles.modeSeg}>
              <T style={styles.modeText} numberOfLines={1}>
                {t(k)}
              </T>
              <Animated.View style={[StyleSheet.absoluteFill, styles.modeSegIn, { opacity: on }]}>
                <T style={[styles.modeText, { color: PLATE.ink }]} numberOfLines={1}>
                  {t(k)}
                </T>
              </Animated.View>
            </View>
          ))}
        </View>
      </Animated.View>

      <Animated.View style={[styles.flash, { opacity: v.flash }]} pointerEvents="none" />

      {/* Чипи: «Мої слова · N» і вогник серії */}
      <Animated.View style={[styles.chipTL, { transform: [{ scale: v.bumpScale }] }]} pointerEvents="none">
        {/* Невидимий найширший чип задає ширину: накладені поверх не
            переносять «· 1» на другий рядок */}
        <View style={[styles.chip, styles.chipRow, { opacity: 0 }]}>
          <MiniMug size={18} />
          <T style={styles.chipText}>{`${t('obDemoWords')} · 1`}</T>
          <T style={styles.chipText}>+1</T>
        </View>
        <Animated.View style={[styles.chip, styles.chipRow, styles.chipOver, { opacity: v.count0 }]}>
          <IcBook size={15} color="#FFFFFF" />
          <T style={styles.chipText}>{`${t('obDemoWords')} · 0`}</T>
        </Animated.View>
        <Animated.View style={[styles.chip, styles.chipRow, styles.chipOver, { opacity: v.count1 }]}>
          <MiniMug size={18} />
          <T style={styles.chipText}>{`${t('obDemoWords')} · 1`}</T>
        </Animated.View>
        <Animated.View style={[styles.chip, styles.chipRow, styles.chipOver, styles.chipAccent, { opacity: v.bump }]}>
          <MiniMug size={18} />
          <T style={styles.chipText}>{`${t('obDemoWords')} · 1`}</T>
          <T style={[styles.chipText, { color: '#FFE28A' }]}>+1</T>
        </Animated.View>
      </Animated.View>
      <ThemeProvider value={cam}>
        <View style={styles.chipTR} pointerEvents="none">
          <Animated.View style={[styles.chip, styles.chipRow, { opacity: v.lit0 }]}>
            <View style={styles.chipFlame}>
              <Flame n={0} size={13} breathe={false} />
            </View>
            <T style={styles.chipText}>0</T>
          </Animated.View>
          <Animated.View style={[styles.chip, styles.chipRow, styles.chipOverR, styles.chipLit, { borderColor: lit, opacity: v.lit1 }]}>
            <View style={styles.chipFlame}>
              <Flame n={1} size={13} breathe={false} />
            </View>
            <T style={[styles.chipText, { color: lit }]}>1</T>
          </Animated.View>
        </View>
      </ThemeProvider>

      {/* «Ще раз» на фіналі */}
      <Animated.View style={[styles.replay, { opacity: v.final }]} pointerEvents={final ? 'box-none' : 'none'}>
        <Pressable
          onPress={onReplay}
          disabled={!final}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('obDemoReplay')}
          style={({ pressed }) => [styles.chip, styles.chipRow, pressed && { opacity: 0.7 }]}
          testID="demo-replay"
        >
          <Svg width={14} height={14} viewBox="0 0 24 24">
            <Path d="M4 12a8 8 0 1 0 2.6-5.9" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" />
            <Path d="M4 4v5h5" stroke="#FFFFFF" strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </Svg>
          <T style={styles.chipText}>{t('obDemoReplay')}</T>
        </Pressable>
      </Animated.View>
    </View>
  );
}

// Підпис предмета в режимі «Сцена»: біла табличка (як чипи справжньої
// сцени, src/scene/SceneView.js) зі словом і перекладом, а під нею — крапка
// на самому предметі. Спливає з легким перельотом. Сцена на малому екрані
// дрібна (SE: 0,4–0,55), тож табличка в координатах сцени більшає — на
// екрані слово не дрібніше за ~10 pt.
export function tagScale(k) {
  return Math.min(1.8, Math.max(1, 0.75 / (k || 1)));
}
function SceneTag({ tag, v, k }) {
  const spot = SCENE_SPOTS[tag.key];
  if (!spot) return null;
  const z = tagScale(k);
  const place =
    spot.side === 'left'
      ? { left: 10, alignItems: 'flex-start' }
      : spot.side === 'right'
        ? { right: 10, alignItems: 'flex-end' }
        : { left: 0, right: 0, alignItems: 'center' };
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.tagDot, { left: spot.x - 5, top: spot.y - 5, opacity: v.opacity }]} />
      <Animated.View
        pointerEvents="none"
        style={[{ position: 'absolute', bottom: SCENE_H - spot.bottom }, place, { opacity: v.opacity, transform: [{ scale: v.scale }] }]}
        testID={'demo-tag-' + tag.key}
      >
        <View style={[styles.tag, { paddingHorizontal: 9 * z, paddingTop: 4 * z, paddingBottom: 5 * z, borderRadius: 10 * z }]}>
          <T style={[styles.tagWord, { fontSize: 14 * z, lineHeight: 18 * z }]} numberOfLines={1}>
            {tag.word}
          </T>
          {tag.translation ? (
            <T style={[styles.tagTr, { fontSize: 11 * z, lineHeight: 14 * z }]} numberOfLines={1}>
              {tag.translation}
            </T>
          ) : null}
        </View>
      </Animated.View>
    </>
  );
}

// Сцена 342×420, масштабована до k (зовнішня рамка — вже під масштаб)
function Stage({ k, children, style, radius = R.xl }) {
  const w = SCENE_W * k;
  const h = SCENE_H * k;
  return (
    <View style={[{ width: w, height: h, borderRadius: radius * Math.min(1, k + 0.15), overflow: 'hidden', backgroundColor: '#D8C9B3' }, style]}>
      <View
        style={{
          position: 'absolute',
          left: (w - SCENE_W) / 2,
          top: (h - SCENE_H) / 2,
          width: SCENE_W,
          height: SCENE_H,
          transform: [{ scale: k }],
        }}
      >
        {children}
      </View>
    </View>
  );
}

// Підпис етапу з трьома крапками; зміна етапу — коротке перетікання.
export function BeatCaption({ beat, t, style }) {
  const { C } = useTheme();
  const a = useRef(new Animated.Value(1)).current;
  const reduced = useReducedMotion();
  const first = useRef(true);
  // Layout-ефект, а не passive: новий текст уже в цьому коміті, і значення 0
  // має стояти до першого кадру з ним, інакше кадр-два він видно повним, а
  // тоді блимає від нуля
  useLayoutEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (reduced) return;
    a.setValue(0);
    Animated.timing(a, { toValue: 1, duration: DUR.micro, easing: EASE.soft, useNativeDriver: true }).start();
  }, [beat]);
  const dot = Math.min(beat, DOTS - 1);
  return (
    <View style={[{ alignItems: 'center' }, style]}>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: DOTS }, (_, i) => i).map((i) => (
          <View key={i} style={[styles.dot, { backgroundColor: i === dot ? C.accent : C.card3 }, i === dot && styles.dotOn]} />
        ))}
      </View>
      <Animated.Text style={[styles.caption, { color: C.text, opacity: a }]} accessibilityLiveRegion="none" testID="demo-caption">
        {t(BEAT_KEYS[beat] || BEAT_KEYS[0])}
      </Animated.Text>
    </View>
  );
}

// pair — { word, ipa, translation, lang } (demoPair); scene — підписи
// режиму «Сцена» ([{ key, word, translation }], demoScene); width/height — скільки
// місця під сцену; onBeat(beat) — новий етап (підпис під сценою малює
// батько, якщо хоче, або BeatCaption тут же — caption); onFinal() — анімація
// зупинилась на фіналі (сама після двох циклів чи тапом); onAction(дія) —
// 'skip_anim' | 'replay' для статистики.
export default function ScanDemo({ pair, scene = [], t, width, height, caption = true, onFinal, onAction, haptics = true }) {
  const reduced = useReducedMotion();
  const k = sceneScale(width, height);
  const tv = useRef(new Animated.Value(0)).current;
  const ov = useRef(new Animated.Value(0)).current;
  const [beat, setBeat] = useState(0);
  const [final, setFinal] = useState(false);
  const timers = useRef([]);
  const loops = useRef(0);
  const anim = useRef(null);
  const alive = useRef(true);

  function clear() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    anim.current?.stop?.();
    ov.stopAnimation();
  }

  function finish() {
    clear();
    tv.setValue(DEMO_LOOP_MS);
    ov.setValue(0);
    setBeat(BEATS.length - 1);
    setFinal(true);
    onFinal?.();
  }

  function cycle(n, { buzz = haptics } = {}) {
    clear();
    tv.setValue(0);
    ov.setValue(0);
    setBeat(0);
    setFinal(false);
    const later = (ms, fn) => timers.current.push(setTimeout(() => alive.current && fn(), ms));
    BEATS.slice(1).forEach((at, i) => later(at, () => setBeat(i + 1)));
    // Обведення — окремий JS-драйвер (strokeDashoffset native не вміє)
    later(BEATS[1], () =>
      Animated.timing(ov, { toValue: 1, duration: 900, easing: EASE.out, useNativeDriver: false }).start()
    );
    later(3000, () => ov.setValue(0));
    if (buzz && n === 0) {
      for (const h of HAPTICS) later(h.at, () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle[h.style]));
    }
    anim.current = Animated.timing(tv, { toValue: DEMO_LOOP_MS, duration: DEMO_LOOP_MS, easing: EASE.linear, useNativeDriver: true });
    anim.current.start();
    // Кінець циклу — за таймером, як і етапи: підписи, дотики й стоп ідуть
    // одним годинником, а не колбеком анімації
    later(DEMO_LOOP_MS, () => {
      loops.current += 1;
      if (loops.current < DEMO_LOOPS) cycle(loops.current, { buzz });
      else finish();
    });
  }

  useEffect(() => {
    alive.current = true;
    if (!reduced) cycle(0);
    return () => {
      alive.current = false;
      clear();
    };
  }, [reduced]);

  function skip() {
    if (final) return;
    onAction?.('skip_anim');
    finish();
  }

  function replay() {
    onAction?.('replay');
    loops.current = DEMO_LOOPS - 1;
    cycle(1, { buzz: false });
  }

  const label = t('obDemoA11y', { word: pair.word, tr: pair.translation });

  if (reduced) {
    // Два кадри поруч: предмет і вся сцена. Підпису етапу під сценою тут
    // немає — його місце (CAPTION_H) віддаємо кадрам, під кожним — до трьох
    // рядків свого підпису.
    const kk = Math.max(
      0.2,
      Math.min(k * 1.2, ((width || SCENE_W) - STATIC_GAP) / 2 / SCENE_W, ((height || SCENE_H) + CAPTION_H - STATIC_CAP_H) / SCENE_H)
    );
    return (
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        testID="scan-demo"
        style={[styles.staticGrid, { width: SCENE_W * kk * 2 + STATIC_GAP }]}
      >
        {STATIC_FRAMES.map(({ at, beat: b }) => (
          <StaticFrame key={at} ms={at} k={kk} pair={pair} scene={scene} t={t} beat={b} />
        ))}
      </View>
    );
  }

  return (
    <View style={{ alignItems: 'center' }}>
      <Pressable
        onPress={skip}
        accessible
        accessibilityRole="image"
        accessibilityLabel={label}
        accessibilityHint={final ? undefined : t('obDemoSkipHint')}
        testID="scan-demo"
      >
        <Stage k={k}>
          <SceneLayers tv={tv} ov={ov} pair={pair} tags={scene} t={t} onReplay={replay} final={final} k={k} />
        </Stage>
      </Pressable>
      {caption ? <BeatCaption beat={beat} t={t} style={{ marginTop: 14 }} /> : null}
    </View>
  );
}

// Статичний кадр для «Менше руху»: ті самі шари, значення — demoAt(ms)
const STATIC_GAP = 10;
// Скільки займає підпис етапу під анімованою сценою (крапки й два рядки) і
// підпис під статичним кадром (три рядки)
const CAPTION_H = 72;
const STATIC_CAP_H = 60;
function StaticFrame({ ms, k, pair, scene, t, beat }) {
  const tv = useRef(new Animated.Value(ms)).current;
  const ov = useRef(new Animated.Value(demoAt(ms).outline)).current;
  const { C } = useTheme();
  return (
    <View style={{ alignItems: 'center', width: SCENE_W * k }} testID={'demo-frame-' + beat}>
      <Stage k={k} radius={R.lg}>
        <SceneLayers tv={tv} ov={ov} pair={pair} tags={scene} t={t} onReplay={() => {}} final={false} k={k} />
      </Stage>
      <Text style={[styles.staticCap, { color: C.dim }]} numberOfLines={3}>
        {t(BEAT_KEYS[beat])}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { backgroundColor: '#0B0A09' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF' },
  sweepBox: {
    position: 'absolute',
    left: MUG_BODY.x,
    top: MUG_BODY.y,
    width: MUG_BODY.w,
    height: MUG_BODY.h,
    overflow: 'hidden',
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  band: { position: 'absolute', top: -20, left: 0, width: 60 },
  plateWrap: { position: 'absolute', left: 0, right: 0, top: 268, alignItems: 'center' },
  shutter: {
    position: 'absolute',
    left: SCENE_W / 2 - 33,
    bottom: 22,
    width: 66,
    height: 66,
    borderRadius: 33,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterCore: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#FFFFFF' },
  shutterPressed: { position: 'absolute', backgroundColor: '#D9D4CC' },
  scanPill: { position: 'absolute', left: 0, right: 0, top: FRAME.y2 - 52, alignItems: 'center' },
  chip: {
    backgroundColor: 'rgba(20,18,16,0.55)',
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  chipRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chipOver: { position: 'absolute', left: 0, top: 0 },
  chipAccent: { backgroundColor: 'rgba(91,79,214,0.94)' },
  chipOverR: { position: 'absolute', right: 0, top: 0 },
  // Запалена серія: тло те саме, що в чипа «0» — тіло вогника першого дня
  // на тлі його ж кольору зливалось; горить сам вогник, обвідка й число
  chipLit: { borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5 },
  chipText: { color: '#FFFFFF', fontFamily: F.extra, fontSize: 13, lineHeight: 17 },
  chipFlame: { width: 13, height: 16, alignItems: 'center', justifyContent: 'center' },
  chipTL: { position: 'absolute', left: 12, top: 12 },
  chipTR: { position: 'absolute', right: 12, top: 12, alignItems: 'flex-end' },
  tag: {
    backgroundColor: PLATE.face,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: PLATE.line,
    paddingHorizontal: 9,
    paddingTop: 4,
    paddingBottom: 5,
    maxWidth: 168,
    shadowColor: PLATE.shadow,
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tagWord: { color: PLATE.ink, fontFamily: F.extra, fontSize: 14, lineHeight: 18 },
  tagTr: { color: PLATE.dim, fontFamily: F.semi, fontSize: 11, lineHeight: 14 },
  tagDot: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: 'rgba(91,79,214,0.9)',
  },
  modeWrap: { position: 'absolute', left: 0, right: 0, bottom: 26, alignItems: 'center' },
  modeTrack: { flexDirection: 'row', padding: 4, borderRadius: 999, backgroundColor: 'rgba(21,20,18,0.62)' },
  modeThumb: { position: 'absolute', left: 4, top: 4, width: SEG, height: MODE_H, borderRadius: MODE_H / 2, backgroundColor: '#F5F2EC' },
  modeSeg: { width: SEG, height: MODE_H, alignItems: 'center', justifyContent: 'center' },
  modeSegIn: { alignItems: 'center', justifyContent: 'center' },
  modeText: { color: '#F5F2EC', fontFamily: F.bold, fontSize: 15, lineHeight: 19 },
  replay: { position: 'absolute', right: 12, bottom: 12 },
  dots: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotOn: { width: 18 },
  caption: { ...type(16, F.extra), textAlign: 'center', paddingHorizontal: 12, minHeight: 44 },
  staticGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignSelf: 'center', columnGap: STATIC_GAP, rowGap: 6 },
  staticCap: { ...type(12, F.bold), textAlign: 'center', marginTop: 8 },
});
