// Аркуш «Поділитися»: прев'ю карток, вибір вигляду й кольору, одна кнопка.
//
// Це НЕ <Modal>. На iOS два нативні Modal не відкриваються одночасно, а
// аркуш результату скану й аркуш слова вже Modal. Тому ShareSheet — звичайний
// шар поверх усього (absoluteFill + високий zIndex), який рендерить сам
// господар: усередині свого Modal або в корені App.
//
// Прев'ю — справжня картка 360×640, зменшена transform-ом на обгортці.
// Знімається саме незменшена картка, тож PNG чіткий, а на екрані видно
// рівно те, що полетить у Stories.
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  BackHandler,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { IcStories } from '../icons';
import { DUR, EASE, useReducedMotion } from '../motion';
import { useSafeAreaInsets } from '../SafeArea';
import { CAPS, F, R, type, useTheme } from '../theme';
import { FadeIn, Press } from '../ui';
import { captureCard, shareCard } from './capture';
import { shareToStories, storiesAvailable, storiesSupported } from './instagram';
import { ShareCard } from './ShareCards';
import {
  CARD_H,
  CARD_W,
  PALETTES,
  SHEET_MAX_W,
  exportPixels,
  paletteByKey,
  previewScale,
  safeLocale,
  templatesFor,
} from './layout';

const TITLES = { word: 'shareTitleWord', achievement: 'shareTitleAch', week: 'shareTitleWeek' };
const TEMPLATE_NAMES = {
  sticker: 'shareTplSticker',
  entry: 'shareTplEntry',
  minimal: 'shareTplMinimal',
  cutout: 'shareTplCutout',
};
const PREVIEW_RADIUS = 18;
// Коди помилок, яким потрібен свій текст; решта — загальне «не вдалося».
const ERRORS = { SHARE_UNAVAILABLE: 'shareUnavailable', STORIES_FAILED: 'shareStoriesError' };

// Обраний колір живе до кінця сесії: хто раз обрав «Графіт», не мусить
// перемикати його на кожній наступній картці.
let lastPalette = PALETTES[0].key;

function tick() {
  Haptics.selectionAsync().catch(() => {});
}

export default function ShareSheet({ visible, payload, onClose, t }) {
  if (!visible || !templatesFor(payload).length) return null;
  return <Sheet payload={payload} onClose={onClose} t={t} />;
}

function Sheet({ payload, onClose, t }) {
  const { C, T, SHADOW } = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const templates = templatesFor(payload);
  const multi = templates.length > 1;
  const [page, setPage] = useState(0);
  const [paletteKey, setPaletteKey] = useState(lastPalette);
  // null | 'share' | 'stories' — яка з кнопок зараз крутить індикатор
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  // Кнопка Instagram — лише коли він справді відкриється (див. instagram.js).
  // Місце під неї резервуємо одразу, якщо збірка це вміє: інакше прев'ю
  // зменшилося б уже на очах, щойно прийде відповідь.
  const [stories, setStories] = useState(false);
  const storiesRoom = storiesSupported();

  const a = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  const pageRef = useRef(0);
  const scroller = useRef(null);
  const cards = useRef([]);
  // Окремо від стану busy: два швидкі тапи встигають прийти до перерендеру,
  // і тоді відкрилося б два системні меню поспіль.
  const busyRef = useRef(false);

  const pal = paletteByKey(paletteKey);
  const locale = safeLocale(t('shareLocale'));
  const pageW = Math.min(width, SHEET_MAX_W);
  const scale = previewScale({ width, height, top: insets.top, bottom: insets.bottom, multi, stories: storiesRoom });
  const title = t(TITLES[payload.kind]);

  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: DUR.sheet, easing: EASE.drawer, useNativeDriver: true }).start();
  }, []);

  useEffect(() => {
    let alive = true;
    storiesAvailable().then((ok) => alive && setStories(ok));
    return () => {
      alive = false;
    };
  }, []);

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

  // Сторінку рахуємо під час скролу, а не на onMomentumScrollEnd: так «клац»
  // відчувається саме тоді, коли картка переходить середину, як у колесі
  // вибору iOS. До того ж onMomentumScrollEnd не приходить на вебі.
  function onScroll(e) {
    const i = Math.round(e.nativeEvent.contentOffset.x / pageW);
    if (i === pageRef.current || i < 0 || i >= templates.length) return;
    pageRef.current = i;
    setPage(i);
    setError(null);
    tick();
  }

  function goTo(i) {
    scroller.current?.scrollTo({ x: i * pageW, animated: !reduced });
  }

  function pickPalette(key) {
    if (key === paletteKey) return;
    tick();
    lastPalette = key;
    setPaletteKey(key);
    setError(null);
  }

  // Спільна обгортка обох кнопок: одна дія за раз, відгук, текст помилки.
  async function run(kind, action) {
    if (busyRef.current || closing.current) return;
    busyRef.current = true;
    setBusy(kind);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await action();
    } catch (e) {
      setError(t(ERRORS[e?.code] || 'shareError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const tpl = templates[page];

  function share() {
    return run('share', () =>
      shareCard(cards.current[page], {
        dialogTitle: title,
        fileName: `lingualens-${tpl}.png`,
        size: exportPixels(tpl),
        cancelled: () => closing.current,
      })
    );
  }

  // Картки йдуть у Stories тлом на весь екран. «Без тла» — рухомою наліпкою
  // на тлі кольору палітри: так само, як у прев'ю.
  function shareStories() {
    return run('stories', async () => {
      const uri = await captureCard(cards.current[page], { size: exportPixels(tpl) });
      if (closing.current) return;
      const ok = await shareToStories(
        tpl === 'cutout' ? { stickerImage: uri, topColor: pal.bg, bottomColor: pal.bg } : { backgroundImage: uri }
      );
      if (!ok) throw Object.assign(new Error('Instagram did not open'), { code: 'STORIES_FAILED' });
    });
  }

  const lift = reduced ? 0 : 48;
  const previewW = CARD_W * scale;
  const previewH = CARD_H * scale;

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
            paddingBottom: insets.bottom + 10,
            opacity: a,
            transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [lift, 0] }) }],
          },
        ]}
      >
        <Text style={[T.headline, s.center]}>{title}</Text>
        {multi ? <Text style={[T.footnote, s.center, { marginTop: 2 }]}>{t('shareSwipeHint')}</Text> : null}

        <ScrollView
          ref={scroller}
          horizontal
          pagingEnabled
          scrollEnabled={multi}
          showsHorizontalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flexGrow: 0, marginTop: 10 }}
        >
          {templates.map((tpl, i) => (
            <View key={tpl} style={{ width: pageW, alignItems: 'center', paddingVertical: 12 }}>
              {/* Тінь і скруглення — лише в прев'ю; сам PNG прямокутний,
                  кути Stories скругляє Instagram. */}
              <View style={[{ width: previewW, height: previewH, borderRadius: PREVIEW_RADIUS, backgroundColor: pal.bg }, SHADOW]}>
                <View style={{ flex: 1, borderRadius: PREVIEW_RADIUS, overflow: 'hidden' }}>
                  <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale }], transformOrigin: 'top left' }}>
                    <ShareCard
                      payload={payload}
                      template={tpl}
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

        <FadeIn delay={60} style={{ paddingHorizontal: 20 }}>
          {multi ? (
            <View style={s.dots}>
              {templates.map((tpl, i) => (
                <Pressable
                  key={tpl}
                  onPress={() => goTo(i)}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel={t(TEMPLATE_NAMES[tpl])}
                  accessibilityState={{ selected: i === page }}
                >
                  <View
                    style={[s.dot, i === page ? { width: 18, backgroundColor: C.accent } : { backgroundColor: C.card3 }]}
                  />
                </Pressable>
              ))}
              <Text style={[CAPS, { color: C.dim, marginLeft: 6 }]}>{t(TEMPLATE_NAMES[templates[page]])}</Text>
            </View>
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

          <Press
            onPress={share}
            style={{ marginTop: 18 }}
            // під час знімка напис змінює індикатор — VoiceOver читає це
            accessibilityLabel={t('shareCta')}
            accessibilityState={{ busy: busy === 'share' }}
          >
            <View style={[s.cta, { backgroundColor: C.accent }, SHADOW]}>
              {busy === 'share' ? (
                <ActivityIndicator color={C.onAccent} />
              ) : (
                <Text style={{ color: C.onAccent, ...type(17, F.extra, { noLead: true }) }}>{t('shareCta')}</Text>
              )}
            </View>
          </Press>

          {stories ? (
            <Press
              onPress={shareStories}
              style={{ marginTop: 10 }}
              accessibilityLabel={t('shareStories')}
              accessibilityState={{ busy: busy === 'stories' }}
            >
              <View style={[s.stories, { backgroundColor: C.card2 }]}>
                {busy === 'stories' ? (
                  <ActivityIndicator color={C.text} />
                ) : (
                  <>
                    <IcStories size={20} color={C.text} />
                    {/* висота кнопки фіксована: довгий напис стискається, а не переноситься */}
                    <Text
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      style={{ color: C.text, flexShrink: 1, ...type(16, F.bold, { noLead: true }) }}
                    >
                      {t('shareStories')}
                    </Text>
                  </>
                )}
              </View>
            </Press>
          ) : null}

          {error ? <Text style={[T.footnote, s.center, { color: C.red, marginTop: 10 }]}>{error}</Text> : null}

          <Press onPress={close} style={{ marginTop: 4 }}>
            <Text style={[s.close, { color: C.dim }]}>{t('shareClose')}</Text>
          </Press>
        </FadeIn>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  // elevation поруч із zIndex: на Android порядок шарів рахується за нею
  root: { zIndex: 1000, elevation: 1000, justifyContent: 'flex-end', alignItems: 'center' },
  backdrop: { backgroundColor: 'rgba(12,10,8,0.6)' },
  panel: {
    borderTopLeftRadius: R.xl,
    borderTopRightRadius: R.xl,
    paddingTop: 18,
  },
  center: { textAlign: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  swatches: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 14 },
  swatchRing: { width: 42, height: 42, borderRadius: 21, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swatchDot: { width: 8, height: 8, borderRadius: 4 },
  cta: { height: 55, borderRadius: R.lg, alignItems: 'center', justifyContent: 'center' },
  // висота + відступ = STORIES_ROW у layout.js (запас під неї в previewScale)
  stories: {
    height: 50,
    borderRadius: R.lg,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  close: { ...type(16, F.bold, { noLead: true }), textAlign: 'center', paddingVertical: 12 },
});
