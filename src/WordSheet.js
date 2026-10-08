// Аркуш слова: велика наліпка, вимова, приклад і дві дії — «Поділитися» та
// «Видалити». Відкривається з колекції наліпок у словнику.
//
// Чому не animationType="slide", як у сканері: системний slide везе вгору
// разом з аркушем і затемнення — воно «їде» з-під низу екрана, як шматок
// картону. Тут затемнення проявляється на місці, а їде лише сам аркуш;
// до того ж аркуш можна потягнути вниз, щоб закрити, як системні аркуші iOS.
//
// Тут же живуть дрібниці, спільні для аркуша й словника: «типографська
// наліпка» для слів без фото, розбір артикля й підтвердження видалення.
// Окремо від DictionaryScreen, бо той імпортує аркуш — інакше вийшло б коло.
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { speak } from './speech';
import { IcSpeaker } from './icons';
import { StickerLarge } from './Sticker';
import { PLATE } from './WordPlate';
import { photoUri } from './photos';
import { useSafeAreaInsets } from './SafeArea';
import { FadeIn, GradBtn, Press } from './ui';
import { DUR, EASE, SPRING, haptic, safeSpring, useReducedMotion } from './motion';
import { F, R, type, useTheme } from './theme';
import { quote } from './share/layout';

// ─── Артиклі ────────────────────────────────────────────────────────────────
// Для мов, де рід не вгадати зі слова, сервер зберігає слово з означеним
// артиклем («die Tasse», «la taza» — див. ARTICLE_EXAMPLES у server/ai.js).
// Без розбору кожна німецька наліпка без фото отримала б літеру «D».
const ARTICLES = {
  de: ['der', 'die', 'das'],
  fr: ['le', 'la', 'les'],
  es: ['el', 'la', 'los', 'las'],
  it: ['il', 'lo', 'la', 'i', 'gli', 'le'],
  pt: ['o', 'a', 'os', 'as'],
  nl: ['de', 'het'],
};
// Французьке й італійське «l'» пишеться разом зі словом: l'eau, l'albero.
const ELIDES = ['fr', 'it'];

// «die Tasse» → { article: 'die ', rest: 'Tasse' }. Пробіл лишається в
// артиклі, щоб `article + rest` завжди давало вихідне слово.
export function splitArticle(word, lang) {
  const w = String(word || '').trim();
  const list = ARTICLES[lang];
  if (!list) return { article: '', rest: w };
  if (ELIDES.includes(lang)) {
    const el = /^(l['’])(\S.*)$/i.exec(w);
    if (el) return { article: el[1], rest: el[2] };
  }
  const m = /^(\S+\s+)(\S.*)$/.exec(w);
  if (m && list.includes(m[1].trim().toLowerCase())) return { article: m[1], rest: m[2] };
  return { article: '', rest: w };
}

// Літера для наліпки без фото: перша літера самого іменника, без артикля.
// Array.from — щоб не розрізати навпіл символ із сурогатної пари.
export function headLetter(word, lang) {
  const first = Array.from(splitArticle(word, lang).rest)[0];
  return first ? first.toUpperCase() : '';
}

// ─── Підтвердження видалення ───────────────────────────────────────────────
// Один діалог і для рядка списку, і для аркуша: однакова дія — однакові слова.
export function confirmDelete(t, word, onConfirm) {
  Alert.alert(t('delWordTitle'), t('delWordMsg', { w: word }), [
    { text: t('cancel'), style: 'cancel' },
    {
      text: t('delete'),
      style: 'destructive',
      onPress: () => {
        haptic('medium');
        onConfirm();
      },
    },
  ]);
}

// ─── Типографська наліпка ──────────────────────────────────────────────────
// Слово без фото (слово дня, предмет без рамки) — не «картинка не
// завантажилась», а наліпка-літера: та сама біла облямівка й тепла тінь, що
// в справжніх наліпок, усередині — велика перша літера в акценті. У сітці
// вона стоїть поруч із фото-наліпками як рівна.
export const LetterTile = memo(function LetterTile({ word, lang, size = 48, style }) {
  const { C } = useTheme();
  // Наліпка-коло займає ~74% свого поля (решта — запас під облямівку й
  // тінь у Sticker.js). Тримаємо ту саму масу, щоб сітка не «стрибала».
  const outer = Math.round(size * 0.74);
  const border = Math.max(2, Math.round(size * 0.04));
  const radius = Math.round(outer * 0.3);
  const inner = outer - border * 2;
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      <View
        style={[
          {
            width: outer,
            height: outer,
            borderRadius: radius,
            padding: border,
            backgroundColor: '#FFFFFF',
            // та сама тепла лінія по краю, що й у Sticker.js: без неї біла
            // облямівка зникає на білій картці
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: PLATE.line,
          },
          // як і в Sticker, тінь — лише на великих: у рядку на 48 її не видно
          size >= 72 && {
            shadowColor: PLATE.shadow,
            shadowOpacity: 0.2,
            shadowRadius: size * 0.03,
            shadowOffset: { width: 0, height: size * 0.025 },
          },
        ]}
      >
        <View
          style={{
            flex: 1,
            borderRadius: radius - border,
            backgroundColor: C.accentSoft,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* Літера — графіка, а не текст для читання: розмір прив'язаний
              до плитки, тож системне збільшення шрифту її не роздуває. */}
          <Text
            allowFontScaling={false}
            style={{ color: C.accent, fontFamily: F.extra, fontSize: Math.round(inner * 0.54), includeFontPadding: false }}
          >
            {headLetter(word, lang)}
          </Text>
        </View>
      </View>
    </View>
  );
});

// ─── Аркуш ─────────────────────────────────────────────────────────────────
// Батько тримає `item` (слово або null). Закриття: аркуш спершу від'їжджає,
// і лише потім onClose() — тоді Modal зникає вже порожнім, без спалаху.
export default function WordSheet({ item, onClose, onDelete, onShare, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  // a: 0 — закрито, 1 — відкрито. drag — палець тягне аркуш вниз.
  const a = useRef(new Animated.Value(0)).current;
  const drag = useRef(new Animated.Value(0)).current;
  const closing = useRef(false);
  // Дія, яку треба виконати, коли Modal остаточно зник (див. afterDismiss)
  const pending = useRef(null);

  // Великий шрифт (Dynamic Type) чи низький екран: вміст не влазить у аркуш, і
  // верх (ручка, наліпка, слово) вилазив би за екран без шансу прочитати.
  // Тоді вміст гортається, а «Поділитися» й «Видалити» стоять унизу. Звичайний
  // аркуш, що влазить, лишається без ScrollView: жест закриття в нього той самий.
  const maxH = height - insets.top - 8;
  const [scrolls, setScrolls] = useState(false);
  const scrollsRef = useRef(false);
  scrollsRef.current = scrolls;
  const scrollY = useRef(0);

  const id = item?.id;
  useEffect(() => {
    if (!id) return;
    closing.current = false;
    setScrolls(false);
    scrollY.current = 0;
    a.setValue(0);
    drag.setValue(0);
    // Крива шторок iOS: різкий старт, м'яке приземлення, без перельоту.
    Animated.timing(a, { toValue: 1, duration: DUR.sheet, easing: EASE.drawer, useNativeDriver: true }).start();
  }, [id]);

  function afterDismiss() {
    const fn = pending.current;
    pending.current = null;
    if (fn) fn();
  }

  function dismiss(after) {
    if (closing.current) return;
    closing.current = true;
    pending.current = after || null;
    // Вихід швидший за вхід — людина вже вирішила піти, не тримаємо її.
    Animated.timing(a, { toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: true }).start(() => {
      onClose();
      // На iOS другий Modal (ShareSheet) не відкриється, поки цей не зник
      // остаточно — тому дія чекає на onDismiss. Android onDismiss не шле,
      // а два модальних вікна поспіль там уживаються, тож запускаємо одразу.
      if (Platform.OS !== 'ios') afterDismiss();
    });
  }

  // PanResponder створюється один раз, тож актуальну dismiss беремо з ref.
  const dismissRef = useRef(dismiss);
  dismissRef.current = dismiss;
  const pan = useRef(
    PanResponder.create({
      // Лише явний рух униз: дотики до прикладу й кнопок лишаються дотиками.
      // Вміст прогорнуто нижче верху: рух униз тоді гортає його назад, а не
      // тягне аркуш.
      onMoveShouldSetPanResponder: (_, g) =>
        g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5 && !(scrollsRef.current && scrollY.current > 1),
      onPanResponderMove: (_, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 110 || g.vy > 0.9) dismissRef.current();
        // Після жесту з моментумом легкий переліт доречний (motion.js)
        else Animated.spring(drag, { toValue: 0, ...safeSpring(SPRING.gesture) }).start();
      },
      onPanResponderTerminate: () => Animated.spring(drag, { toValue: 0, ...SPRING.ui }).start(),
    })
  ).current;

  // «Менше руху»: аркуш не їде сам, а проявляється на місці. Палець
  // тягне його й тоді — рух, яким керує людина, не заважає.
  const sheetMotion = reduced
    ? { opacity: a, transform: [{ translateY: drag }] }
    : {
        transform: [
          { translateY: Animated.add(a.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }), drag) },
        ],
      };

  // Один і той самий Modal і для показу, і для приховування — інакше React
  // перемонтував би його і onDismiss не прийшов би.
  return (
    <Modal
      visible={!!item}
      transparent
      animationType="none"
      onRequestClose={() => dismiss()}
      onDismiss={afterDismiss}
    >
      {item ? (
        <View style={s.root}>
          <Animated.View style={[StyleSheet.absoluteFill, s.backdrop, { opacity: a }]}>
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => dismiss()}
              accessibilityRole="button"
              accessibilityLabel={t('cancel')}
            />
          </Animated.View>

          <Animated.View
            style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) + 20, maxHeight: maxH }, sheetMotion]}
            // аркуш уперся в maxHeight: вміст не влазить — вмикаємо гортання
            onLayout={(e) => {
              if (!scrollsRef.current && e.nativeEvent.layout.height >= maxH - 0.5) setScrolls(true);
            }}
            onAccessibilityEscape={() => dismiss()}
            {...pan.panHandlers}
          >
            <View style={s.handle} />
            <SheetBody
              item={item}
              art={Math.round(Math.min(156, height * 0.2))}
              scrolls={scrolls}
              onScrollY={(y) => (scrollY.current = y)}
              s={s}
              C={C}
              t={t}
              onShare={
                onShare
                  ? () => {
                      haptic('selection');
                      dismiss(() => onShare({ kind: 'word', word: item }));
                    }
                  : null
              }
              onDelete={() => confirmDelete(t, item.word, () => dismiss(() => onDelete(item.id)))}
            />
          </Animated.View>
        </View>
      ) : null}
    </Modal>
  );
}

// Вміст аркуша. Розмір наліпки (art) рахується від висоти екрана: на
// iPhone SE аркуш із прикладом інакше не влазить.
function SheetBody({ item, art, scrolls, onScrollY, s, C, t, onShare, onDelete }) {
  const uri = photoUri(item.photo);
  const lang = item.lang || 'en';
  const top = (
    <>
      <View style={s.art}>
        {uri ? (
          <StickerLarge uri={uri} shape={item.shape} outline={item.outline} box={item.box} size={art} pop />
        ) : (
          <FadeIn>
            <LetterTile word={item.word} lang={lang} size={art} style={{ transform: [{ rotate: '-2deg' }] }} />
          </FadeIn>
        )}
      </View>

      <FadeIn dy={14}>
        <View style={s.wordRow}>
          <Text style={s.word} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
            {item.word}
          </Text>
          <Press style={s.speakBtn} onPress={() => speak(item.word, lang)} accessibilityLabel={t('listen')}>
            <IcSpeaker size={20} color={C.accent} />
          </Press>
        </View>
        {item.ipa ? <Text style={s.ipa}>{item.ipa}</Text> : null}
        {item.translation ? <Text style={s.translation}>{item.translation}</Text> : null}
      </FadeIn>

      {item.example ? (
        <FadeIn delay={45}>
          <Press style={s.exampleBox} onPress={() => speak(item.example, lang)} accessibilityHint={t('listen')}>
            <View style={s.exampleSpeaker}>
              <IcSpeaker size={15} color={C.dim} />
            </View>
            <Text style={s.example}>{quote(item.example, lang)}</Text>
            {item.exampleTranslation ? <Text style={s.exampleTr}>{item.exampleTranslation}</Text> : null}
          </Press>
        </FadeIn>
      ) : null}
    </>
  );
  return (
    <>
      {scrolls ? (
        <ScrollView
          style={s.scroll}
          bounces={false}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
        >
          {top}
        </ScrollView>
      ) : (
        top
      )}

      <FadeIn delay={90} style={s.actions}>
        {onShare ? <GradBtn title={t('share')} onPress={onShare} /> : null}
        {/* Видалення — тиха текстова дія: вона потрібна рідко й не має
            змагатися з «Поділитися» за увагу. */}
        <Pressable style={s.deleteBtn} onPress={onDelete} hitSlop={6} accessibilityRole="button">
          <Text style={s.deleteText}>{t('delete')}</Text>
        </Pressable>
      </FadeIn>
    </>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, justifyContent: 'flex-end' },
    backdrop: { backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      paddingHorizontal: 24,
      paddingTop: 10,
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.card3,
      alignSelf: 'center',
      marginBottom: 14,
    },
    // не тягнеться понад вміст, а гортається, лише коли впирається в maxHeight аркуша
    scroll: { flexGrow: 0, flexShrink: 1 },
    art: { alignItems: 'center', marginBottom: 14 },
    wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    word: { color: C.text, ...type(34, F.bold), textAlign: 'center', flexShrink: 1 },
    speakBtn: {
      backgroundColor: C.card2,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // транскрипція — кольоровий піл-бейдж, як на картці результату скану
    ipa: {
      color: C.accent,
      ...type(15, F.ipa, { noLead: true }),
      fontWeight: '700',
      marginTop: 10,
      alignSelf: 'center',
      backgroundColor: C.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: R.pill,
      overflow: 'hidden',
    },
    translation: { color: C.text, ...type(20, F.reg), textAlign: 'center', marginTop: 8, opacity: 0.85 },
    exampleBox: { backgroundColor: C.card2, borderRadius: R.md, padding: 14, marginTop: 20 },
    exampleSpeaker: { position: 'absolute', top: 12, right: 12 },
    example: { color: C.text, ...type(15, F.reg), paddingRight: 22 },
    exampleTr: { color: C.dim, ...type(13, F.reg), marginTop: 6 },
    actions: { marginTop: 22, gap: 4 },
    deleteBtn: { alignSelf: 'center', paddingVertical: 12, paddingHorizontal: 20 },
    // текст помилки й видалення — redInk (чистий red на картці лише 4,0:1)
    deleteText: { color: C.redInk, ...type(15, F.semi, { noLead: true }) },
  });
