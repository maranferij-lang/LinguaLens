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
import { DUR, EASE, useReducedMotion } from '../motion';
import { useSafeAreaInsets } from '../SafeArea';
import { CAPS, F, R, type, useTheme } from '../theme';
import { FadeIn, Press } from '../ui';
import { shareCard } from './capture';
import { ShareCard } from './ShareCards';
import {
  CARD_H,
  CARD_W,
  PALETTES,
  SHEET_MAX_W,
  paletteByKey,
  previewScale,
  safeLocale,
  templatesFor,
} from './layout';

const TITLES = { word: 'shareTitleWord', achievement: 'shareTitleAch', week: 'shareTitleWeek' };
const TEMPLATE_NAMES = { sticker: 'shareTplSticker', entry: 'shareTplEntry', minimal: 'shareTplMinimal' };
const PREVIEW_RADIUS = 18;

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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
  const scale = previewScale({ width, height, top: insets.top, bottom: insets.bottom, multi });
  const title = t(TITLES[payload.kind]);

  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: DUR.sheet, easing: EASE.drawer, useNativeDriver: true }).start();
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

  async function share() {
    if (busyRef.current || closing.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    try {
      await shareCard(cards.current[page], {
        dialogTitle: title,
        fileName: `lingualens-${templates[page]}.png`,
        cancelled: () => closing.current,
      });
    } catch (e) {
      setError(t(e?.code === 'SHARE_UNAVAILABLE' ? 'shareUnavailable' : 'shareError'));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
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

          <Press onPress={share} style={{ marginTop: 18 }}>
            <View style={[s.cta, { backgroundColor: C.accent }, SHADOW]}>
              {busy ? (
                <ActivityIndicator color={C.onAccent} />
              ) : (
                <Text style={{ color: C.onAccent, ...type(17, F.extra, { noLead: true }) }}>{t('shareCta')}</Text>
              )}
            </View>
          </Press>

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
  close: { ...type(16, F.bold, { noLead: true }), textAlign: 'center', paddingVertical: 12 },
});
