// Аркуш «Поділитися»: спершу наліпка без тла, картка 9:16 — другим режимом.
//
// Це НЕ <Modal>. На iOS два нативні Modal не відкриваються одночасно, а
// аркуш результату скану й аркуш слова вже Modal. Тому ShareSheet — звичайний
// шар поверх усього (absoluteFill + високий zIndex), який рендерить сам
// господар: усередині свого Modal або в корені App.
//
// Згори вниз (share.md §5.2, макет share-sheet-uk.png): заголовок,
// перемикач «Наліпка · Картка» (тиждень — лише картка), прев'ю, головна
// кнопка, плитки [Stories] [Копіювати] [Зберегти] [Ще], рядок стану,
// «Закрити». Що саме на головній кнопці й які є плитки, вирішують
// primaryAction / tilesFor (layout.js) за тим, що вміє ця збірка: Instagram,
// буфер, «Фото», вибір фото. Плитки, якої тут немає, немає зовсім.
//
// Прев'ю — справжні наліпка (300 pt) чи картка (360×640), зменшені
// transform-ом на обгортці. Знімається незменшений корінь, тож PNG чіткий,
// а на екрані видно рівно те, що полетить. Один знімок живе, поки не
// змінився вигляд: «Копіювати», а потім «Зберегти» знімають лише раз.
import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  BackHandler,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Pattern, Rect, Stop } from 'react-native-svg';
import { track } from '../analytics';
import { IcCheck, IcCopy, IcDownload, IcMore, IcShare, IcStories, IcWarn } from '../icons';
import { DUR, EASE, useReducedMotion } from '../motion';
import { useSafeAreaInsets } from '../SafeArea';
import { CAPS, F, R, type, useTheme } from '../theme';
import { FadeIn, Press } from '../ui';
import { copyImage, dropFile, pickBackground, saveImage, storiesWith } from './actions';
import { captureView, releaseShot, shareFile } from './capture';
import { storiesAvailable, storiesSupported } from './instagram';
import { canCopy, canPick, canSave } from './native';
import { ShareCard } from './ShareCards';
import { StickerArt, stickerLabel } from './Stickers';
import {
  CARD_H,
  CARD_W,
  PALETTES,
  SHEET_MAX_W,
  SHEET_ROWS,
  STICKER_HINT_H,
  STICKER_MIN_H,
  STICKER_W,
  STORIES_GRADIENT,
  cardChrome,
  exportPixels,
  isCompact,
  paletteByKey,
  previewScale,
  primaryAction,
  safeLocale,
  sceneSetLayout,
  stickerFit,
  stickerPixels,
  stickerPreviewH,
  stickerStylesFor,
  templatesFor,
  tilesFor,
} from './layout';

const TITLES = { word: 'shareTitleWord', achievement: 'shareTitleAch', week: 'shareTitleWeek', scene: 'shareTitleScene' };
const TEMPLATE_NAMES = {
  sticker: 'shareTplSticker',
  entry: 'shareTplEntry',
  minimal: 'shareTplMinimal',
  sceneStickers: 'shareTplSceneStickers',
  sceneLabels: 'shareTplSceneLabels',
  sceneFrame: 'shareTplSceneFrame',
};
const STYLE_NAMES = { object: 'shareStyleObject', word: 'shareStyleWord' };
const PREVIEW_RADIUS = 18;
const STICKER_RADIUS = 22;
const CHECKER = 10;
// Коди помилок, яким потрібен свій текст; решта — загальне «не вдалося».
const ERRORS = {
  SHARE_UNAVAILABLE: 'shareUnavailable',
  STORIES_FAILED: 'shareStoriesError',
  COPY_FAILED: 'shareCopyError',
  SAVE_FAILED: 'shareSaveError',
  SAVE_DENIED: 'shareSaveDenied',
};
// Скільки живе рядок «Скопійовано…» / «Збережено…»
const OK_MS = 4000;
// Позначка «людина передумала» (закрила вибір фото, пішла з аркуша):
// без помилки, без статистики, без хаптики.
const CANCELLED = Symbol('cancelled');

// Обрані колір картки й вигляд наліпки живуть до кінця сесії: хто раз обрав
// «Графіт» чи «Лише слово», не мусить перемикати їх щоразу.
let lastPalette = PALETTES[0].key;
let lastStyle = null;

function tick() {
  Haptics.selectionAsync().catch(() => {});
}

export default function ShareSheet({ visible, payload, onClose, t }) {
  if (!visible || !(templatesFor(payload).length || stickerStylesFor(payload).length)) return null;
  return <Sheet payload={payload} onClose={onClose} t={t} />;
}

function Sheet({ payload, onClose, t }) {
  const { C, SHADOW, SHADOW_SM, isDark } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const templates = templatesFor(payload);
  const styles = stickerStylesFor(payload);
  // Тиждень — лише картка, тож перемикача немає
  const segment = styles.length > 0 && templates.length > 0;
  const [mode, setMode] = useState(styles.length ? 'sticker' : 'card');
  const [stylePage, setStylePage] = useState(() => Math.max(0, styles.indexOf(lastStyle)));
  const [page, setPage] = useState(0);
  const [paletteKey, setPaletteKey] = useState(lastPalette);
  // Справжня висота кожної наліпки (onLayout кореня) — під розмір PNG
  const [stickerH, setStickerH] = useState({});
  // ціль дії, що зараз крутить індикатор
  const [busy, setBusy] = useState(null);
  // рядок стану: { ok, text, settings? }
  const [status, setStatus] = useState(null);
  // Можливості збірки — раз на відкриття: модулі під час роботи не з'являються
  const [caps] = useState(() => ({ copy: canCopy(), save: canSave(), pick: canPick() }));
  // Instagram: null — ще питаємо (кнопки поки не малюємо, щоб головна не
  // перескочила з «Копіювати» на «Stories» на очах), далі true/false.
  const [stories, setStories] = useState(() => (storiesSupported() ? null : false));

  const a = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const alive = useRef(true);
  const pageRef = useRef(0);
  const stylePageRef = useRef(stylePage);
  const scroller = useRef(null);
  const styleScroller = useRef(null);
  const cards = useRef([]);
  const stickers = useRef({});
  // Один знімок на вигляд: { key, uri }. Новий ключ — старий файл геть.
  const shot = useRef(null);
  const statusTimer = useRef(null);
  // Окремо від стану busy: два швидкі тапи встигають прийти до перерендеру,
  // і тоді дія виконалася б двічі.
  const busyRef = useRef(false);

  const pal = paletteByKey(paletteKey);
  const locale = safeLocale(t('shareLocale'));
  const pageW = Math.min(width, SHEET_MAX_W);
  const boxW = pageW - 40;
  const title = t(TITLES[payload.kind]);
  const kind = styles[stylePage] || styles[0];
  const tpl = templates[page];
  const backdrop = typeof payload.backdrop === 'string' && payload.backdrop ? payload.backdrop : null;
  const linkRoom = storiesSupported() && !!backdrop && caps.pick;
  const previewH = stickerPreviewH({ height, top: insets.top, bottom: insets.bottom, styles: styles.length, link: linkRoom });
  // Невисокий екран: рядок стану — поверх заголовка, а не під плитками
  const compact = isCompact({ height, top: insets.top, bottom: insets.bottom });
  const scale = previewScale({
    width,
    height,
    top: insets.top,
    bottom: insets.bottom,
    chrome: cardChrome({ multi: templates.length > 1, segment, toast: !compact }),
    min: 0.3,
  });

  const primary = primaryAction({ mode, stories: !!stories, backdrop: !!backdrop, pick: caps.pick, copy: caps.copy });
  const tiles = tilesFor({ mode, primary, stories: !!stories, copy: caps.copy, save: caps.save });

  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: DUR.sheet, easing: EASE.drawer, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    if (stories !== null) return undefined;
    let on = true;
    storiesAvailable().then((ok) => on && setStories(!!ok));
    return () => {
      on = false;
    };
  }, []);

  // Перемкнули режим — новий ScrollView стає на ту сторінку, що була обрана
  // (contentOffset працює не скрізь, зокрема не на вебі)
  useEffect(() => {
    if (mode === 'sticker' && stylePage) styleScroller.current?.scrollTo({ x: stylePage * boxW, animated: false });
    if (mode === 'card' && page) scroller.current?.scrollTo({ x: page * pageW, animated: false });
  }, [mode]);

  // Аркуш пішов — тимчасовий PNG більше нікому не потрібен
  useEffect(
    () => () => {
      alive.current = false;
      clearTimeout(statusTimer.current);
      if (shot.current) releaseShot(shot.current.uri);
      shot.current = null;
    },
    []
  );

  // Вихід швидший за вхід: людина вже вирішила піти.
  function close() {
    if (closing.current) return;
    closing.current = true;
    Animated.timing(a, { toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: true }).start(() =>
      onClose?.()
    );
  }

  // Android: системна «назад» закриває аркуш, а не застосунок під ним.
  // Усередині Modal її раніше перехопить сам Modal — там це й правильно.
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  function say(next) {
    clearTimeout(statusTimer.current);
    setStatus(next);
    if (next?.text) AccessibilityInfo.announceForAccessibility?.(next.text);
    // Успіх тихне сам; помилка висить до наступної дії
    if (next?.ok) statusTimer.current = setTimeout(() => alive.current && setStatus(null), OK_MS);
  }

  function pickMode(m) {
    if (m === mode || busyRef.current) return;
    tick();
    setMode(m);
    say(null);
  }

  // Сторінку рахуємо під час скролу, а не на onMomentumScrollEnd: так «клац»
  // відчувається саме тоді, коли картка переходить середину, як у колесі
  // вибору iOS. До того ж onMomentumScrollEnd не приходить на вебі.
  function onScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
    if (i === pageRef.current || i < 0 || i >= templates.length) return;
    pageRef.current = i;
    setPage(i);
    say(null);
    tick();
  }

  function onStyleScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / boxW);
    if (i === stylePageRef.current || i < 0 || i >= styles.length) return;
    stylePageRef.current = i;
    lastStyle = styles[i];
    setStylePage(i);
    say(null);
    tick();
  }

  function goTo(i) {
    scroller.current?.scrollTo({ x: i * pageW, animated: !reduced });
  }

  function goToStyle(i) {
    styleScroller.current?.scrollTo({ x: i * boxW, animated: !reduced });
  }

  function pickPalette(key) {
    if (key === paletteKey) return;
    tick();
    lastPalette = key;
    setPaletteKey(key);
    say(null);
  }

  // Знімок того, що зараз у прев'ю. Той самий вигляд — той самий файл.
  async function snap() {
    const key = mode === 'sticker' ? `sticker|${kind}` : `card|${tpl}|${paletteKey}`;
    if (shot.current?.key === key) return shot.current.uri;
    const view = mode === 'sticker' ? stickers.current[kind] : cards.current[page];
    const size = mode === 'sticker' ? stickerPixels(stickerH[kind] || minHeight(kind)) : exportPixels(tpl);
    const uri = await captureView(view, { size });
    if (!alive.current) {
      releaseShot(uri);
      return null;
    }
    if (shot.current) releaseShot(shot.current.uri);
    shot.current = { key, uri };
    return uri;
  }

  function minHeight(k) {
    if (k === 'scene') return sceneSetLayout(payload.scene?.objects).height;
    return STICKER_MIN_H[k] || STICKER_MIN_H.word;
  }

  // Що робить кожна ціль. CANCELLED — людина передумала: тихо виходимо.
  const ACTIONS = {
    async stories_photo() {
      const uri = await snap();
      if (!uri || closing.current) return CANCELLED;
      await storiesWith({ background: backdrop, sticker: uri });
    },
    async stories_gallery() {
      const bg = await pickBackground();
      if (!bg) return CANCELLED;
      try {
        const uri = await snap();
        if (!uri || closing.current) return CANCELLED;
        await storiesWith({ background: bg.uri, sticker: uri });
      } finally {
        // Instagram уже забрав байти з буфера — тимчасове тло геть
        dropFile(bg.uri);
      }
    },
    async stories_plain() {
      const uri = await snap();
      if (!uri || closing.current) return CANCELLED;
      await storiesWith({ sticker: uri });
    },
    async stories_card() {
      const uri = await snap();
      if (!uri || closing.current) return CANCELLED;
      await storiesWith({ background: uri });
    },
    async copy() {
      const uri = await snap();
      if (!uri || closing.current) return CANCELLED;
      await copyImage(uri);
    },
    async save() {
      const uri = await snap();
      if (!uri || closing.current) return CANCELLED;
      await saveImage(uri);
    },
    async system() {
      const uri = await snap();
      // Меню не відкриваємо над екраном, з якого вже пішли
      if (!uri || closing.current) return CANCELLED;
      await shareFile(uri, { dialogTitle: title, fileName: `lingualens-${mode === 'sticker' ? kind : tpl}.png` });
    },
  };

  // Спільна обгортка всіх кнопок: одна дія за раз, відгук, текст помилки.
  async function run(target) {
    if (busyRef.current || closing.current) return;
    busyRef.current = true;
    setBusy(target);
    say(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      const result = await ACTIONS[target]();
      if (result === CANCELLED || closing.current) return;
      // Статистика: що, яким видом і куди. Чи людина справді надіслала
      // з системного меню чи Instagram, iOS не каже — рахуємо відкрите.
      track('share', {
        kind: payload.kind,
        format: mode,
        ...(mode === 'sticker' ? { style: kind } : { template: tpl }),
        target,
      });
      if (target === 'copy' || target === 'save') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        say({ ok: true, text: t(target === 'copy' ? 'shareCopied' : 'shareSaved') });
      }
    } catch (e) {
      if (!alive.current) return;
      say({ ok: false, text: t(ERRORS[e?.code] || 'shareError'), settings: e?.code === 'SAVE_DENIED' });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      busyRef.current = false;
      if (alive.current) setBusy(null);
    }
  }

  const lift = reduced ? 0 : 48;
  const previewW = CARD_W * scale;
  const cardPreviewH = CARD_H * scale;
  const fit = (k) => stickerFit(boxW, previewH, stickerH[k] || minHeight(k));
  const okInk = C.greenInk;

  const PRIMARY = {
    stories_photo: { label: 'shareStoriesThisPhoto', Icon: IcStories },
    stories_gallery: { label: 'shareStoriesMyPhoto', Icon: IcStories },
    stories_card: { label: 'shareStories', Icon: IcStories },
    copy: { label: 'shareCopyCta', Icon: IcCopy },
    system: { label: 'shareCta', Icon: IcShare },
  }[primary];
  const TILES = {
    stories_plain: { label: 'shareStoriesPlain', Icon: IcStories },
    copy: { label: 'shareCopy', Icon: IcCopy },
    save: { label: 'shareSave', Icon: IcDownload },
    system: { label: 'shareMore', Icon: IcMore },
  };

  return (
    <View
      style={[StyleSheet.absoluteFill, s.root]}
      // VoiceOver: фокус не виходить за аркуш, жест «Z» двома пальцями закриває
      accessibilityViewIsModal
      onAccessibilityEscape={close}
    >
      <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: a }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityRole="button" accessibilityLabel={t('shareClose')} />
      </Animated.View>

      <Animated.View
        style={[
          s.panel,
          {
            width: pageW,
            backgroundColor: C.sheet,
            paddingBottom: insets.bottom + SHEET_ROWS.bottom,
            opacity: a,
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) }],
          },
        ]}
      >
        <View style={[s.grabber, { backgroundColor: C.card3 }]} />
        <Text style={[s.title, { color: C.text }]} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>

        {segment ? (
          <View style={s.segmentRow}>
            <View style={[s.segment, { backgroundColor: isDark ? C.bg : C.card2 }]} accessibilityRole="tablist">
              {['sticker', 'card'].map((m) => {
                const on = m === mode;
                const label = t(m === 'sticker' ? 'shareModeSticker' : 'shareModeCard');
                return (
                  <Pressable
                    key={m}
                    onPress={() => pickMode(m)}
                    accessibilityRole="tab"
                    accessibilityLabel={label}
                    accessibilityState={{ selected: on }}
                    style={[s.segBtn, on && [{ backgroundColor: isDark ? C.card3 : C.card }, SHADOW_SM]]}
                  >
                    <Text
                      numberOfLines={1}
                      maxFontSizeMultiplier={1.3}
                      style={{ color: on ? C.text : C.dim, ...type(15, on ? F.extra : F.bold, { noLead: true }) }}
                    >
                      {label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ) : null}

        {status && compact ? (
          // невисокий екран: поверх заголовка й перемикача, без зсуву аркуша
          <View
            style={[
              s.statusTop,
              { backgroundColor: C.sheet, height: SHEET_ROWS.top + SHEET_ROWS.title + (segment ? SHEET_ROWS.segment : 12) },
            ]}
          >
            <Status status={status} okInk={okInk} t={t} C={C} top onDismiss={() => say(null)} />
          </View>
        ) : null}

        {mode === 'sticker' ? (
          <FadeIn key="sticker" dy={0} style={{ marginTop: 12, paddingHorizontal: 20 }}>
            <View
              style={[s.stickerBox, { height: previewH }]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('shareStickerLabel', { w: stickerLabel(payload, t) })}
            >
              <Checker w={boxW} h={previewH} a={isDark ? C.card : C.bg} b={C.card2} />
              <ScrollView
                ref={styleScroller}
                horizontal
                pagingEnabled
                scrollEnabled={styles.length > 1}
                showsHorizontalScrollIndicator={false}
                onScroll={onStyleScroll}
                scrollEventThrottle={16}
                contentOffset={{ x: stylePage * boxW, y: 0 }}
                style={StyleSheet.absoluteFill}
              >
                {styles.map((k) => {
                  const f = fit(k);
                  const h = stickerH[k] || minHeight(k);
                  return (
                    <View key={k} style={{ width: boxW, height: previewH - STICKER_HINT_H, alignItems: 'center', justifyContent: 'center' }}>
                      <View style={{ width: STICKER_W * f, height: h * f }}>
                        <View style={{ width: STICKER_W, transform: [{ scale: f }], transformOrigin: 'top left' }}>
                          <StickerArt
                            payload={payload}
                            kind={k}
                            t={t}
                            cardRef={(r) => {
                              stickers.current[k] = r;
                            }}
                            onLayout={(e) => {
                              const v = Math.ceil(e.nativeEvent.layout.height);
                              setStickerH((prev) => (prev[k] === v ? prev : { ...prev, [k]: v }));
                            }}
                          />
                        </View>
                      </View>
                    </View>
                  );
                })}
              </ScrollView>
              <View style={s.hint} pointerEvents="none">
                <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.hintText, { color: C.dim }]}>
                  {t('shareStickerHint')}
                </Text>
              </View>
            </View>
            {styles.length > 1 ? (
              <Dots
                items={styles}
                current={stylePage}
                onPick={goToStyle}
                label={(k) => t(STYLE_NAMES[k])}
                C={C}
              />
            ) : null}
          </FadeIn>
        ) : (
          <FadeIn key="card" dy={0}>
            <ScrollView
              ref={scroller}
              horizontal
              pagingEnabled
              scrollEnabled={templates.length > 1}
              showsHorizontalScrollIndicator={false}
              onScroll={onScroll}
              scrollEventThrottle={16}
              contentOffset={{ x: page * pageW, y: 0 }}
              style={{ flexGrow: 0, marginTop: 12 }}
            >
              {templates.map((tp, i) => (
                <View key={tp} style={{ width: pageW, alignItems: 'center' }}>
                  {/* Тінь і скруглення — лише в прев'ю; сам PNG прямокутний,
                      кути Stories скругляє Instagram. */}
                  <View style={[{ width: previewW, height: cardPreviewH, borderRadius: PREVIEW_RADIUS, backgroundColor: pal.bg }, SHADOW]}>
                    <View style={{ flex: 1, borderRadius: PREVIEW_RADIUS, overflow: 'hidden' }}>
                      <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale }], transformOrigin: 'top left' }}>
                        <ShareCard
                          payload={payload}
                          template={tp}
                          pal={pal}
                          t={t}
                          locale={locale}
                          cardRef={(r) => {
                            cards.current[i] = r;
                          }}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              ))}
            </ScrollView>
            <View style={{ paddingHorizontal: 20 }}>
              {templates.length > 1 ? (
                <Dots items={templates} current={page} onPick={goTo} label={(tp) => t(TEMPLATE_NAMES[tp])} C={C} />
              ) : null}
              <View style={s.swatches}>
                {PALETTES.map((p) => {
                  const on = p.key === paletteKey;
                  return (
                    <Pressable
                      key={p.key}
                      onPress={() => pickPalette(p.key)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={t(p.label)}
                      accessibilityState={{ selected: on }}
                      style={[s.swatchRing, { borderColor: on ? C.accent : 'transparent' }]}
                    >
                      {/* крапка кольору тексту — одразу видно, як читатиметься */}
                      <View style={[s.swatch, { backgroundColor: p.bg, borderColor: C.sep }]}>
                        <View style={[s.swatchDot, { backgroundColor: p.text }]} />
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          </FadeIn>
        )}

        <View style={{ paddingHorizontal: 20 }}>
          {stories === null ? (
            // Instagram ще відповідає: місце під кнопки тримаємо, щоб аркуш не стрибав
            <View style={{ height: SHEET_ROWS.cta + SHEET_ROWS.tiles }} />
          ) : (
            <FadeIn delay={40}>
              <Press
                onPress={() => run(primary)}
                style={{ marginTop: SHEET_ROWS.cta - 54 }}
                accessibilityLabel={t(PRIMARY.label)}
                accessibilityState={{ busy: busy === primary }}
              >
                <View style={[s.cta, { backgroundColor: C.accent }, SHADOW]}>
                  {busy === primary ? (
                    <ActivityIndicator color={C.onAccent} />
                  ) : (
                    <>
                      <PRIMARY.Icon size={21} color={C.onAccent} />
                      {/* висота кнопки фіксована: довгий напис стискається, а не переноситься */}
                      <Text
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        maxFontSizeMultiplier={1.3}
                        style={{ color: C.onAccent, flexShrink: 1, ...type(17, F.extra, { noLead: true }) }}
                      >
                        {t(PRIMARY.label)}
                      </Text>
                    </>
                  )}
                </View>
              </Press>

              {primary === 'stories_photo' && caps.pick ? (
                <Press
                  onPress={() => run('stories_gallery')}
                  scaleTo={0.98}
                  accessibilityLabel={t('shareStoriesPickOther')}
                  accessibilityState={{ busy: busy === 'stories_gallery' }}
                >
                  <View style={s.link}>
                    {busy === 'stories_gallery' ? (
                      <ActivityIndicator color={C.accent} />
                    ) : (
                      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={{ color: C.accent, ...type(15, F.bold, { noLead: true }) }}>
                        {t('shareStoriesPickOther')}
                      </Text>
                    )}
                  </View>
                </Press>
              ) : null}

              {tiles.length ? (
                <View style={s.tiles}>
                  {tiles.map((k) => {
                    const { label, Icon } = TILES[k];
                    const on = busy === k;
                    const gradient = k === 'stories_plain';
                    return (
                      <Press
                        key={k}
                        onPress={() => run(k)}
                        style={s.tileCol}
                        scaleTo={0.94}
                        accessibilityLabel={t(label)}
                        accessibilityState={{ busy: on }}
                      >
                        <View style={[s.tile, { backgroundColor: gradient ? STORIES_GRADIENT[1] : C.card2 }]}>
                          {gradient ? <StoriesGradient /> : null}
                          {/* обгортка тримає іконку над градієнтом і на вебі, де
                              absolute-шар інакше малюється поверх сусіда */}
                          <View>
                            {on ? (
                              <ActivityIndicator color={gradient ? '#FFFFFF' : C.text} />
                            ) : (
                              <Icon size={23} color={gradient ? '#FFFFFF' : C.text} />
                            )}
                          </View>
                        </View>
                        <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[s.tileLabel, { color: C.text }]}>
                          {t(label)}
                        </Text>
                      </Press>
                    );
                  })}
                </View>
              ) : null}
            </FadeIn>
          )}

          {status && !compact ? <Status status={status} okInk={okInk} t={t} C={C} /> : null}

          <Press onPress={close} style={{ marginTop: 2 }}>
            <Text style={[s.close, { color: C.dim }]}>{t('shareClose')}</Text>
          </Press>
        </View>
      </Animated.View>
    </View>
  );
}

// Рядок стану: «Скопійовано…» / «Збережено…» зеленим, помилка червоним; для
// відмови в доступі до «Фото» — ще й «Відкрити Параметри». Поверх заголовка
// (top) його можна прибрати дотиком, щоб дістатися до перемикача.
function Status({ status, okInk, t, C, top = false, onDismiss }) {
  const body = (
    <View accessibilityLiveRegion="polite" style={s.statusRow}>
      <View style={{ marginTop: 1 }}>
        {status.ok ? <IcCheck size={18} color={okInk} /> : <IcWarn size={18} color={C.red} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text maxFontSizeMultiplier={1.2} style={[s.statusText, { color: status.ok ? okInk : C.text }]}>
          {status.text}
        </Text>
        {status.settings ? (
          <Pressable
            onPress={() => Linking.openSettings().catch(() => {})}
            accessibilityRole="button"
            accessibilityLabel={t('shareOpenSettings')}
            hitSlop={8}
          >
            <Text maxFontSizeMultiplier={1.2} style={[s.statusLink, { color: C.accent }]}>
              {t('shareOpenSettings')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
  return (
    <FadeIn dy={top ? -6 : 6} style={[s.status, top && s.statusFloat, { backgroundColor: status.ok ? C.greenSoft : C.redSoft }]}>
      {top && !status.settings ? (
        <Pressable onPress={onDismiss} accessible={false}>
          {body}
        </Pressable>
      ) : (
        body
      )}
    </FadeIn>
  );
}

// Крапки сторінок і назва поточного вигляду капсом
function Dots({ items, current, onPick, label, C }) {
  return (
    <View style={s.dots}>
      {items.map((it, i) => (
        <Pressable
          key={it}
          onPress={() => onPick(i)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={label(it)}
          accessibilityState={{ selected: i === current }}
        >
          <View style={[s.dot, i === current ? { width: 18, backgroundColor: C.accent } : { backgroundColor: C.card3 }]} />
        </Pressable>
      ))}
      <Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={[CAPS, { color: C.dim, marginLeft: 6, flexShrink: 1 }]}>
        {label(items[current])}
      </Text>
    </View>
  );
}

// М'яка шахівниця — загальновідомий знак «тут прозоро». Токени теми, тож у
// темній темі вона темна; сама наліпка однакова в обох темах.
function Checker({ w, h, a, b }) {
  return (
    <Svg width={w} height={h} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <Pattern id="checker" width={CHECKER * 2} height={CHECKER * 2} patternUnits="userSpaceOnUse">
          <Rect width={CHECKER * 2} height={CHECKER * 2} fill={a} />
          <Rect width={CHECKER} height={CHECKER} fill={b} />
          <Rect x={CHECKER} y={CHECKER} width={CHECKER} height={CHECKER} fill={b} />
        </Pattern>
      </Defs>
      <Rect width={w} height={h} fill="url(#checker)" />
    </Svg>
  );
}

// Плитка «Stories»: фірмовий градієнт (STORIES_GRADIENT), як і тло, яке отримає Instagram
function StoriesGradient() {
  return (
    <Svg width="100%" height="100%" style={StyleSheet.absoluteFill} pointerEvents="none">
      <Defs>
        <LinearGradient id="storiesTile" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={STORIES_GRADIENT[0]} />
          <Stop offset="1" stopColor={STORIES_GRADIENT[1]} />
        </LinearGradient>
      </Defs>
      <Rect width="100%" height="100%" fill="url(#storiesTile)" />
    </Svg>
  );
}

const s = StyleSheet.create({
  // elevation поруч із zIndex: на Android порядок шарів рахується за нею
  root: { zIndex: 1000, elevation: 1000, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: 'rgba(12,10,8,0.6)' },
  panel: {
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingTop: 8,
  },
  // ручка + відступ до заголовка = SHEET_ROWS.top
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginBottom: 7 },
  title: { ...type(19, F.extra, { noLead: true }), lineHeight: SHEET_ROWS.title, textAlign: 'center', paddingHorizontal: 20 },
  segmentRow: { marginTop: SHEET_ROWS.segment - 36, alignItems: 'center' },
  segment: { flexDirection: 'row', height: 36, borderRadius: 12, padding: 3, minWidth: 220 },
  segBtn: { flex: 1, minWidth: 104, paddingHorizontal: 16, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  stickerBox: { borderRadius: STICKER_RADIUS, overflow: 'hidden' },
  hint: { position: 'absolute', left: 12, right: 12, bottom: 0, height: STICKER_HINT_H, justifyContent: 'flex-start' },
  hintText: { ...type(13, F.semi, { noLead: true }), lineHeight: 18, textAlign: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, height: SHEET_ROWS.style - 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  swatches: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: SHEET_ROWS.swatches - 44 },
  swatchRing: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  cta: {
    height: 54,
    borderRadius: R.lg,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  link: { height: SHEET_ROWS.link, alignItems: 'center', justifyContent: 'center' },
  // 12 + плитка 54 + 4 + підпис 16 = SHEET_ROWS.tiles
  tiles: { flexDirection: 'row', justifyContent: 'center', marginTop: 12 },
  tileCol: { flex: 1, maxWidth: 92, alignItems: 'center' },
  tile: { width: 54, height: 54, borderRadius: 18, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  tileLabel: { ...type(12.5, F.semi, { noLead: true }), lineHeight: 16, marginTop: 4, textAlign: 'center' },
  status: { marginTop: 8, borderRadius: R.md, paddingHorizontal: 12, paddingVertical: 9 },
  // поверх ручки, заголовка й перемикача (SHEET_ROWS.top + title + segment)
  statusTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingHorizontal: 16,
    paddingTop: 6,
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    justifyContent: 'center',
    zIndex: 2,
  },
  statusFloat: { marginTop: 0, paddingVertical: 8 },
  statusRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  statusText: { ...type(13.5, F.semi, { noLead: true }), lineHeight: 18 },
  statusLink: { ...type(13.5, F.extra, { noLead: true }), lineHeight: 18, marginTop: 4 },
  close: { ...type(16, F.bold, { noLead: true }), textAlign: 'center', lineHeight: 20, paddingVertical: 12 },
});
