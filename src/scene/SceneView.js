// Екран сцени: фото кімнати чи столу, де кожен знайдений предмет «піднятий»
// наліпкою і підписаний своїм словом.
//
// Це головне, чим людина ділиться, тож фото тут — герой: чорне тло, фото
// цілком (9:16, як Stories), мінімум хрому. Панелі зверху й знизу лежать
// на м'яких затемненнях, а не на смугах, щоб не різати кадр.
//
// Нативний Modal поверх сканера (або словника, коли сцену відкрили з
// історії). ShareSheet і картка слова живуть усередині нього: iOS не
// покаже другий нативний Modal поверх уже відкритого.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { createCutter } from '../cutout';
import { IcClose, IcShare, IcSpeaker } from '../icons';
import { DUR, EASE, SPRING, useReducedMotion } from '../motion';
import { useSafeAreaInsets } from '../SafeArea';
import ShareSheet from '../share/ShareSheet';
import { speak } from '../speech';
import { StickerLarge } from '../Sticker';
import { F, R, type, useTheme } from '../theme';
import { Press } from '../ui';
import { LiftedObjects, Leaders, SceneChip, sceneShapes } from './SceneArt';
import { anchorOf, chipSize, fitContain, layoutChips, rectOf } from './sceneLayout';
import { hasWord, sceneImageUri } from './scenes';
import { PLATE } from '../WordPlate';
import { quote } from '../share/layout';

const TOP_BAR = 52;
const BTN_H = 54;
// Підписи на екрані — білі плашки з темним словом: читаються на будь-якому
// фото і не сперечаються з ним кольором.
// Це та сама «табличка», що й у наліпок (src/WordPlate.js): живе на фото,
// тож від палітри не залежить. check — галочка «вже в словнику».
const CHIP_COLORS = { bg: PLATE.face, word: PLATE.ink, sub: PLATE.dim, check: PLATE.ok };
const STAGGER = 60;

const AnimatedPath = Animated.createAnimatedComponent(Path);

export default function SceneView({ scene, cutter, savedWords = [], onSaveWords, onUpdateScene, onClose, t }) {
  // Поки Modal згасає, показуємо ту саму сцену, а не порожнечу.
  const [shown, setShown] = useState(scene);
  useEffect(() => {
    if (scene) setShown(scene);
  }, [scene]);
  // «Назад» на Android і жест виходу VoiceOver: спершу закривається картка
  // «поділитись», потім картка слова, і лише потім уся сцена (див. back).
  const backRef = useRef(null);

  return (
    <Modal visible={!!scene} animationType="fade" statusBarTranslucent onRequestClose={() => backRef.current?.()}>
      {shown ? (
        <SceneBody
          key={shown.id}
          scene={shown}
          active={!!scene}
          backRef={backRef}
          cutter={scene ? cutter : null}
          savedWords={savedWords}
          onSaveWords={onSaveWords}
          onUpdateScene={onUpdateScene}
          onClose={onClose}
          t={t}
        />
      ) : null}
    </Modal>
  );
}

function SceneBody({ scene, active, backRef, cutter, savedWords, onSaveWords, onUpdateScene, onClose, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { width: W, height: H } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const [selected, setSelected] = useState(null);
  const [sharing, setSharing] = useState(null);
  const [hidden, setHidden] = useState(() => new Set(scene.hidden || []));
  const [justSaved, setJustSaved] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  // Фото сцени з історії могло зникнути (iOS почистив кеш, коли копія в
  // Documents не вдалася). Тоді лишаємо самі слова: білі силуети без фото
  // виглядали б як поломка, а ділитися нема чим.
  const [broken, setBroken] = useState(false);

  const uri = sceneImageUri(scene);
  // Наліпки для збереження: зі свіжого кадру їх уже ріже сканер, для сцени
  // з історії — ріжемо зі збереженого фото, лише коли слово справді
  // зберігають.
  const cut = useMemo(
    () =>
      cutter ||
      createCutter({
        source: uri,
        width: scene.width,
        height: scene.height,
        crop: { x: 0, y: 0, width: scene.width, height: scene.height },
        objects: scene.objects,
      }),
    [cutter, uri]
  );

  // ─── Геометрія ───
  const bottomH = insets.bottom + 14 + BTN_H + 14;
  const geo = useMemo(() => {
    const frame = fitContain(scene.width || 1080, scene.height || 1920, W, H);
    const bounds = {
      x1: Math.max(frame.x, 0) + 10,
      y1: Math.max(frame.y, insets.top + TOP_BAR) + 8,
      x2: Math.min(frame.x + frame.w, W) - 10,
      y2: Math.min(frame.y + frame.h, H - bottomH) - 8,
    };
    // Розкладаємо всі предмети, і приховані теж: тоді приховування одного
    // підпису не пересуває решту.
    const items = scene.objects.map((o) => {
      const size = chipSize(o.word, o.translation);
      return { key: o.key, rect: rectOf(o.box, frame), anchor: anchorOf(o, frame), w: size.w, h: size.h, size };
    });
    const chips = layoutChips(items, bounds);
    return { frame, items, chips };
  }, [scene, W, H, insets.top, bottomH]);
  const shapes = useMemo(
    () => sceneShapes(scene.objects.filter((o) => !hidden.has(o.key)), geo.frame),
    [geo.frame, scene.objects, hidden]
  );

  const visible = scene.objects.filter((o) => !hidden.has(o.key));
  const isSaved = (o) => justSaved.has(o.key) || hasWord(savedWords, wordOf(o));
  const unsaved = visible.filter((o) => !isSaved(o));

  function wordOf(o) {
    return { word: o.word, lang: scene.lang };
  }

  // ─── Поява ───
  // Контури «прокреслюються» по предметах, решта фото пригасає, предмети
  // піднімаються наліпками, і лише тоді по черзі вискакують підписи.
  // «Менше руху» — усе просто проявляється разом.
  const dimA = useRef(new Animated.Value(0)).current;
  const drawA = useRef(new Animated.Value(reduced ? 1 : 0)).current;
  const liftA = useRef(new Animated.Value(0)).current;
  const chipA = useRef(scene.objects.map(() => new Animated.Value(0))).current;
  const [drawn, setDrawn] = useState(reduced);

  useEffect(() => {
    const fade = (v, delay = 0, duration = DUR.panel) =>
      Animated.timing(v, { toValue: 1, duration, delay, easing: EASE.out, useNativeDriver: true });
    if (reduced) {
      Animated.parallel([fade(dimA), fade(liftA), ...chipA.map((v) => fade(v))]).start();
      return;
    }
    // Порядок підписів — як у розкладці: від більших предметів до менших
    const order = geo.items.map((it, i) => ({ i, a: (it.rect.x2 - it.rect.x1) * (it.rect.y2 - it.rect.y1) })).sort((p, q) => q.a - p.a);
    Animated.parallel([
      Animated.timing(drawA, { toValue: 1, duration: 520, easing: EASE.inOut, useNativeDriver: false }),
      fade(dimA, 80, 420),
      fade(liftA, 380, 300),
      ...order.map(({ i }, k) => Animated.spring(chipA[i], { toValue: 1, delay: 560 + k * STAGGER, ...SPRING.ui })),
    ]).start(() => setDrawn(true));
  }, []);

  // ─── Дії ───
  // Картка слова закривається сама: від'їжджає й лише тоді знімається (див.
  // WordCard.close). Тож і «назад», і жест виходу VoiceOver ідуть через неї.
  const closeCard = useRef(null);
  function back() {
    if (sharing) setSharing(null);
    else if (selected) (closeCard.current || (() => setSelected(null)))();
    else onClose?.();
  }
  backRef.current = active ? back : null;

  function select(key) {
    Haptics.selectionAsync().catch(() => {});
    setSelected(key);
  }

  function toggleHidden(key, show) {
    const next = new Set(hidden);
    if (show) next.delete(key);
    else next.add(key);
    setHidden(next);
    onUpdateScene?.(scene.id, { hidden: [...next] });
  }

  // Зберігає список предметів. Словник безкоштовний без меж, тож App може
  // зберегти менше лише тоді, коли якесь слово встигло з'явитись у словнику
  // (синхронізація з іншого iPhone між показом і тапом): воно вже там, і
  // позначаємо збереженими всі, а не перші N.
  async function save(objs) {
    if (busyRef.current || !objs.length || !onSaveWords) return;
    busyRef.current = true;
    setBusy(true);
    try {
      // Одне слово двічі (дві книжки в кадрі) зберігаємо один раз
      const uniq = objs.filter((o, i) => objs.findIndex((x) => x.word.toLowerCase() === o.word.toLowerCase()) === i);
      const list = await Promise.all(
        uniq.map(async (o) => {
          const st = await cut.get(o.key);
          return {
            word: o.word,
            ipa: o.ipa,
            translation: o.translation,
            example: o.example,
            exampleTranslation: o.exampleTranslation,
            lang: scene.lang,
            nativeLang: scene.nativeLang,
            photo: st.uri,
            shape: st.shape,
            sceneId: scene.id,
          };
        })
      );
      onSaveWords(list);
      setJustSaved((prev) => {
        const next = new Set(prev);
        uniq.forEach((o) => next.add(o.key));
        return next;
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  function share() {
    if (!visible.length || broken) return;
    Haptics.selectionAsync().catch(() => {});
    // backdrop — фото сцени (уже 9:16, 1080×1920) тлом для «Stories з цим
    // фото»: наліпка-набір слів лягає поверх тієї самої кімнати
    setSharing({ kind: 'scene', scene: { ...scene, objects: visible }, backdrop: sceneImageUri(scene) || null });
  }

  const { frame, items, chips } = geo;
  const dash = (len) => drawA.interpolate({ inputRange: [0, 1], outputRange: [len, 0] });
  const leaderLines = chips
    .filter((c, i) => c.leader && !hidden.has(items[i].key))
    .map((c) => ({ key: c.key, from: c.leader.from, to: c.leader.to }));
  const current = selected ? scene.objects.find((o) => o.key === selected) : null;
  const allSaved = visible.length > 0 && !unsaved.length;
  // Щось уже в словнику — кнопка каже «Зберегти нові (1)», а не «всі»:
  // інакше «Зберегти всі (1)» під «7 слів у кадрі» збиває з пантелику
  const saveLabel = t(unsaved.length < visible.length ? 'sceneSaveNew' : 'sceneSaveAll', { n: unsaved.length });

  return (
    <View style={s.root} accessibilityViewIsModal onAccessibilityEscape={back}>
      {active ? <StatusBar style="light" /> : null}

      {/* Фото + пригашення + підняті предмети */}
      <Image
        source={{ uri }}
        style={[s.abs, { left: frame.x, top: frame.y, width: frame.w, height: frame.h }]}
        resizeMode="cover"
        accessible={false}
        onError={() => setBroken(true)}
      />
      <Animated.View pointerEvents="none" style={[s.abs, s.dim, { left: frame.x, top: frame.y, width: frame.w, height: frame.h, opacity: dimA }]} />
      {broken ? null : (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: liftA }]}>
          <LiftedObjects uri={uri} frame={frame} width={W} height={H} shapes={shapes} />
        </Animated.View>
      )}
      {!drawn && !broken ? (
        <Svg width={W} height={H} style={s.abs} pointerEvents="none">
          {shapes.map((sh) => (
            <AnimatedPath
              key={sh.key}
              d={sh.d}
              fill="none"
              stroke="#FFFFFF"
              strokeWidth={2}
              strokeLinecap="round"
              strokeDasharray={[sh.len, sh.len]}
              strokeDashoffset={dash(sh.len)}
            />
          ))}
        </Svg>
      ) : null}

      {/* Тап по самому предмету теж відкриває слово. Менші — зверху,
          щоб чашку на столі можна було влучити. Для VoiceOver ціль — підпис. */}
      {items
        .map((it, i) => ({ it, i }))
        .sort((p, q) => (q.it.rect.x2 - q.it.rect.x1) * (q.it.rect.y2 - q.it.rect.y1) - (p.it.rect.x2 - p.it.rect.x1) * (p.it.rect.y2 - p.it.rect.y1))
        .map(({ it }) => (
          <Pressable
            key={'hit' + it.key}
            accessible={false}
            onPress={() => select(it.key)}
            style={[s.abs, { left: it.rect.x1, top: it.rect.y1, width: it.rect.x2 - it.rect.x1, height: it.rect.y2 - it.rect.y1 }]}
          />
        ))}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: liftA }]}>
        <Leaders width={W} height={H} lines={leaderLines} dotR={3} ring={1.5} halo={8} />
      </Animated.View>

      {chips.map((c, i) => {
        const o = scene.objects[i];
        const off = hidden.has(o.key);
        const a = chipA[i];
        return (
          <Animated.View
            key={c.key}
            style={[
              s.abs,
              {
                left: c.x,
                top: c.y,
                opacity: off ? Animated.multiply(a, 0.42) : a,
                transform: reduced ? [] : [{ scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
              },
            ]}
          >
            <Pressable
              onPress={() => select(o.key)}
              accessibilityRole="button"
              accessibilityLabel={o.translation ? `${o.word}, ${o.translation}` : o.word}
              accessibilityState={{ selected: selected === o.key }}
              // галочку на плашці VoiceOver читає словами: «У словнику»
              accessibilityValue={isSaved(o) ? { text: t('saved') } : undefined}
              accessibilityHint={off ? t('sceneHiddenHint') : undefined}
              hitSlop={4}
            >
              <SceneChip word={o.word} translation={o.translation} size={items[i].size} colors={CHIP_COLORS} saved={isSaved(o)} />
            </Pressable>
          </Animated.View>
        );
      })}

      {/* Верхня панель: закрити й заголовок */}
      <View style={[s.top, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
        <Scrim width={W} height={insets.top + TOP_BAR + 30} from="top" />
        <Pressable
          onPress={onClose}
          style={s.iconBtn}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={t('close')}
        >
          <IcClose size={20} color="#FFFFFF" />
        </Pressable>
        <Text style={s.title} numberOfLines={1} accessibilityRole="header" maxFontSizeMultiplier={1.3}>
          {t('sceneTitle', { n: visible.length })}
        </Text>
        <View style={s.iconSpacer} />
      </View>

      {/* Нижня панель: зберегти все й поділитися */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 14 }]} pointerEvents="box-none">
        <Scrim width={W} height={bottomH + 40} from="bottom" />
        <View style={{ flex: 1 }}>
          {allSaved ? (
            <View style={s.savedAll} accessible accessibilityRole="button" accessibilityState={{ disabled: true }}>
              <Text style={s.savedAllText}>{t('sceneAllDone')}</Text>
            </View>
          ) : (
            // busy, а не disabled: кнопка, що працює, лишається в повному кольорі
            // (disabled її притьмарив би до 45 %, ніби вимкнену)
            <Press onPress={() => save(unsaved)} disabled={!unsaved.length} busy={busy} accessibilityLabel={saveLabel}>
              <View style={s.primary}>
                {busy && !current ? (
                  <ActivityIndicator color={C.onAccent} />
                ) : (
                  <Text style={s.primaryText} numberOfLines={1}>
                    {saveLabel}
                  </Text>
                )}
              </View>
            </Press>
          )}
        </View>
        <Press onPress={share} disabled={!visible.length || broken} style={s.shareBtn} accessibilityLabel={t('share')}>
          <IcShare size={22} color="#FFFFFF" />
        </Press>
      </View>

      {current ? (
        <WordCard
          key={current.key}
          o={current}
          lang={scene.lang}
          cut={cut}
          saved={isSaved(current)}
          busy={busy}
          shownOnCard={!hidden.has(current.key)}
          onToggle={(show) => toggleHidden(current.key, show)}
          onSave={() => save([current])}
          onClose={() => setSelected(null)}
          closeRef={closeCard}
          insets={insets}
          reduced={reduced}
          s={s}
          C={C}
          t={t}
        />
      ) : null}

      <ShareSheet visible={!!sharing} payload={sharing} onClose={() => setSharing(null)} t={t} />
    </View>
  );
}

// М'яке затемнення під панеллю: текст читається на світлому фото, а
// межі панелі не видно.
function Scrim({ width, height, from }) {
  // React 19 повертає id зі спецсимволами — у url(#…) вони ламають посилання
  const id = 'scrim' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  return (
    <Svg
      width={width}
      height={height}
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0 }, from === 'top' ? { top: 0 } : { bottom: 0 }]}
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1={from === 'top' ? '0' : '1'} x2="0" y2={from === 'top' ? '1' : '0'}>
          <Stop offset="0" stopColor="#000" stopOpacity={0.55} />
          <Stop offset="0.55" stopColor="#000" stopOpacity={0.22} />
          <Stop offset="1" stopColor="#000" stopOpacity={0} />
        </LinearGradient>
      </Defs>
      <Rect width={width} height={height} fill={`url(#${id})`} />
    </Svg>
  );
}

// ─── Картка слова ──────────────────────────────────────────────────────────
// Не окремий Modal (iOS не покаже його поверх сцени), а аркуш усередині.
function WordCard({ o, lang, cut, saved, busy, shownOnCard, onToggle, onSave, onClose, closeRef, insets, reduced, s, C, t }) {
  const a = useRef(new Animated.Value(0)).current;
  const [sticker, setSticker] = useState(null);
  const { height: H } = useWindowDimensions();

  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: DUR.sheet, easing: EASE.drawer, useNativeDriver: true }).start();
    let alive = true;
    cut.get(o.key).then((st) => alive && st?.uri && setSticker(st));
    return () => {
      alive = false;
    };
  }, []);

  // Вихід швидший за вхід (DUR.exit проти DUR.sheet), без ease-in; картка
  // знімається, лише коли доїхала. Повторні тапи по тлу за час виходу ігноруємо.
  const closing = useRef(false);
  const close = useCallback(() => {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(a, { toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: true }).start(() => onClose());
  }, [onClose]);
  useEffect(() => {
    if (closeRef) closeRef.current = close;
    return () => {
      if (closeRef) closeRef.current = null;
    };
  }, [close]);

  const motion = reduced
    ? { opacity: a }
    : { transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [420, 0] }) }] };

  return (
    <View style={StyleSheet.absoluteFill} accessibilityViewIsModal onAccessibilityEscape={close}>
      <Animated.View style={[StyleSheet.absoluteFill, s.cardBackdrop, { opacity: a }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('close')} />
      </Animated.View>
      {/* На великому шрифті (Dynamic Type) вміст не влазить у картку: гортається
          лише він, а «Зберегти» стоїть унизу, як в аркуші сканера. */}
      <Animated.View style={[s.card, { paddingBottom: Math.max(insets.bottom, 12) + 16, maxHeight: H - insets.top - 8 }, motion]}>
        <View style={s.handle} />
        <ScrollView style={s.cardScroll} contentContainerStyle={s.cardBody} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={s.cardHead}>
            <View style={s.cardArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {sticker ? <StickerLarge uri={sticker.uri} shape={sticker.shape} size={72} halo={false} pop /> : null}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.cardWord} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
                {o.word}
              </Text>
              {o.ipa ? <Text style={s.ipa}>{o.ipa}</Text> : null}
            </View>
            <Press style={s.speakBtn} onPress={() => speak(o.word, lang)} accessibilityLabel={t('listen')}>
              <IcSpeaker size={20} color={C.accent} />
            </Press>
          </View>
          {o.translation ? <Text style={s.cardTr}>{o.translation}</Text> : null}

          {o.example ? (
            <Press style={s.exampleBox} onPress={() => speak(o.example, lang)} accessibilityHint={t('listen')}>
              <View style={s.exampleSpeaker}>
                <IcSpeaker size={15} color={C.dim} />
              </View>
              <Text style={s.example}>{quote(o.example, lang)}</Text>
              {o.exampleTranslation ? <Text style={s.exampleTr}>{o.exampleTranslation}</Text> : null}
            </Press>
          ) : null}

          <View style={s.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={s.toggleLabel}>{t('sceneShowOnCard')}</Text>
              <Text style={s.toggleHint}>{t('sceneShowOnCardHint')}</Text>
            </View>
            <Switch
              value={shownOnCard}
              onValueChange={onToggle}
              trackColor={{ true: C.accent, false: C.card3 }}
              thumbColor="#FFFFFF"
              ios_backgroundColor={C.card3}
              accessibilityLabel={t('sceneShowOnCard')}
            />
          </View>
        </ScrollView>

        {saved ? (
          <View style={s.savedBadge}>
            <Text style={s.savedBadgeText}>{t('saved')}</Text>
          </View>
        ) : (
          // busy, а не disabled: кнопка, що зберігає, не блякне
          <Press onPress={onSave} busy={busy} accessibilityLabel={t('save')}>
            <View style={s.primary}>
              {busy ? <ActivityIndicator color={C.onAccent} /> : <Text style={s.primaryText}>{t('save')}</Text>}
            </View>
          </Press>
        )}
      </Animated.View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    abs: { position: 'absolute' },
    dim: { backgroundColor: 'rgba(0,0,0,0.24)' },

    top: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingBottom: 8,
      gap: 8,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconSpacer: { width: 40 },
    title: { flex: 1, color: '#FFFFFF', textAlign: 'center', ...type(17, F.extra, { noLead: true }) },

    bottom: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 14,
      gap: 10,
    },
    primary: {
      height: BTN_H,
      borderRadius: R.lg,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    primaryText: { color: C.onAccent, ...type(17, F.extra, { noLead: true }) },
    shareBtn: {
      width: BTN_H,
      height: BTN_H,
      borderRadius: R.lg,
      backgroundColor: 'rgba(255,255,255,0.16)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedAll: {
      height: BTN_H,
      borderRadius: R.lg,
      backgroundColor: 'rgba(255,255,255,0.12)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedAllText: { color: '#FFFFFF', ...type(16, F.bold, { noLead: true }) },

    cardBackdrop: { backgroundColor: 'rgba(0,0,0,0.38)' },
    card: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      paddingHorizontal: 22,
      paddingTop: 10,
      gap: 12,
    },
    handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: C.card3, alignSelf: 'center', marginBottom: 4 },
    // не тягнеться понад вміст, а гортається, лише коли впирається в maxHeight картки
    cardScroll: { flexGrow: 0, flexShrink: 1 },
    cardBody: { gap: 12 },
    cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    cardArt: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
    cardWord: { color: C.text, ...type(28, F.bold) },
    ipa: {
      color: C.accent,
      ...type(14, F.ipa, { noLead: true }),
      fontWeight: '700',
      marginTop: 6,
      alignSelf: 'flex-start',
      backgroundColor: C.accentSoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: R.pill,
      overflow: 'hidden',
    },
    speakBtn: {
      backgroundColor: C.card2,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardTr: { color: C.text, ...type(19, F.semi), opacity: 0.85 },
    exampleBox: { backgroundColor: C.card2, borderRadius: R.md, padding: 14 },
    exampleSpeaker: { position: 'absolute', top: 12, right: 12 },
    example: { color: C.text, ...type(15, F.reg), paddingRight: 22 },
    exampleTr: { color: C.dim, ...type(13, F.reg), marginTop: 6 },
    toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 2 },
    toggleLabel: { color: C.text, ...type(15, F.semi) },
    toggleHint: { color: C.dim, ...type(13, F.reg) },
    savedBadge: { height: BTN_H, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center', backgroundColor: C.greenSoft },
    // текст успіху на greenSoft — greenInk (чистий green там лише 3,8:1)
    savedBadgeText: { color: C.greenInk, ...type(17, F.semi, { noLead: true }) },
  });
