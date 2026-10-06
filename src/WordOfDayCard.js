// Картка «Слово дня» — озвучується, зберігається у словник. Дії («Слухати»,
// «Знаю», «Зберегти») видно завжди: для безкоштовного рівня слово дня —
// головна щоденна цінність, і ховати «Зберегти» за дотиком не можна. Дотик
// розгортає лише приклад.
//
// Тема в рядку-кепсі («СЛОВО ДНЯ · ФІНАНСИ») каже, що слово підібране під
// людину; загальні слова теми не мають. «Знаю» прибирає слово й одразу
// просить у сервера інше; після кількох «Знаю» поспіль картка сама
// пропонує підняти рівень — лише пропонує, рішення за людиною.
//
// Pro (v1.3): 3 або 5 слів на день. Тоді картка показує крапки слотів
// («2 з 3»), гортається між уже відкритими словами дня (свайп або дотик до
// крапки), а наступне слово — під замком: «Наступне слово відкриється о
// 19:00». Дії діють на те слово, яке зараз на картці. Без slots картка —
// така, як і була.
//
// Слоти рахує App (useWodSlots) і кладе їх у маленьке спільне сховище
// нижче, а картка бере їх звідти, якщо slots не прийшли пропом: так Pro
// працює, хоч між App і карткою стоїть екран «Навчання» (FlashcardsScreen),
// який про слоти не знає.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcCheck, IcChevron, IcLock, IcSpeaker } from './icons';
import { Mascot } from './Mascot';
import { FadeIn, Press } from './ui';
import { layoutNext, useReducedMotion } from './motion';
import { cefrFor } from './profile';
import { todaySlots } from './wordOfDay';
import { hourLabel } from './widgets/format';
import { CAPS, F, R, ipaFont, type, useTheme } from './theme';
import { quote } from './share/layout';

const same = (a, b) => String(a || '').toLowerCase() === String(b || '').toLowerCase();

// Спільне сховище слотів: пише useWodSlots (App), читає картка. null — одне
// слово на день (без Pro, без кешу на сьогодні, App не змонтовано).
let shared = null;
const listeners = new Set();
function publish(value) {
  if (value === shared) return;
  shared = value;
  listeners.forEach((fn) => fn());
}
function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
const sharedSlots = () => shared;
export function useSharedWodSlots() {
  return useSyncExternalStore(subscribe, sharedSlots, sharedSlots);
}

// Слова дня на сьогодні для картки (Pro). → { n, list, next, focus, onSave,
// onKnow } або null, коли слово одне (тоді картка — як без Pro).
//   wod — кеш слова дня (лише для поточної пари мов, інакше null);
//   hours — години слотів (slotHours); words — словник (чи збережене);
//   focus — { slot, at } зі сповіщення чи віджета; onSave/onKnow(word).
// Наступний слот відкривається сам: таймер до його години, і перевірка,
// щойно застосунок повертається на передній план.
export function useWodSlots({ wod, hours, words, ui, focus = null, onSave, onKnow }) {
  const [tick, setTick] = useState(0);
  const hoursSig = (hours || []).join(',');
  const day = useMemo(() => todaySlots(wod, hours, new Date()), [wod, hoursSig, tick]);
  const nextHour = day.next ? day.next.hour : null;
  useEffect(() => {
    if (nextHour === null) return undefined;
    const at = new Date();
    at.setHours(nextHour, 0, 0, 0);
    const ms = at.getTime() - Date.now();
    if (ms <= 0) return undefined;
    const timer = setTimeout(() => setTick((x) => x + 1), Math.min(ms + 500, 2147483647));
    return () => clearTimeout(timer);
  }, [nextHour, tick]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') setTick((x) => x + 1);
    });
    return () => sub?.remove?.();
  }, []);
  const handlers = useRef({ onSave, onKnow });
  handlers.current = { onSave, onKnow };
  const value = useMemo(() => {
    if (day.n < 2 || !day.open.length) return null;
    return {
      n: day.n,
      list: day.open.map((w) => ({ ...w, saved: (words || []).some((x) => same(x.word, w.word)) })),
      next: day.next ? { hour: day.next.hour, label: hourLabel(day.next.hour, ui) } : null,
      focus,
      onSave: (w) => handlers.current.onSave?.(w),
      onKnow: (w) => handlers.current.onKnow?.(w),
    };
  }, [day, words, ui, focus]);
  // картці — через спільне сховище; App зник — слотів немає
  useEffect(() => publish(value), [value]);
  useEffect(() => () => publish(null), []);
  return value;
}

// topic — назва теми ('' — загальні слова); onKnow — «Знаю» (App шукає нове
// слово); knowing — нове слово ще в дорозі; knowNote — пояснення, якщо нове
// не прийшло (офлайн); levelUp — до якого рівня (1–10) запропонувати
// піднятись (null — не пропонуємо), onLevelUp / onKeepLevel — відповіді на
// пропозицію. Людині рівень називаємо за CEFR («Підняти до B2+»), як у
// Параметрах: число зі слайдера нічого б їй не сказало.
// slots — Pro, кілька слів на день (useWodSlots); null — одне слово; без
// пропа — зі спільного сховища (те саме, що порахував App).
export default function WordOfDayCard({
  word,
  lang,
  saved,
  onSave,
  t,
  topic = '',
  onKnow,
  knowing = false,
  knowNote = '',
  levelUp = null,
  onLevelUp,
  onKeepLevel,
  slots: slotsProp,
}) {
  const fromApp = useSharedWodSlots();
  const slots = slotsProp === undefined ? fromApp : slotsProp;
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const multi = !!slots && slots.n > 1 && Array.isArray(slots.list) && slots.list.length > 0;
  const list = multi ? slots.list : null;
  // Поточне слово на картці: за замовчуванням — найновіше відкрите.
  const [index, setIndex] = useState(multi ? list.length - 1 : 0);
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const pager = useRef(null);
  const lastLen = useRef(multi ? list.length : 0);

  // Відкрився новий слот — показуємо його.
  useEffect(() => {
    if (!multi) return;
    if (list.length !== lastLen.current) {
      lastLen.current = list.length;
      setIndex(list.length - 1);
    } else if (index > list.length - 1) setIndex(list.length - 1);
  }, [multi, list?.length]);

  // Тап по сповіщенню чи віджету зі слотом — саме це слово.
  const focusAt = slots?.focus?.at;
  useEffect(() => {
    if (!multi || !slots.focus) return;
    const i = list.findIndex((w) => w.slot === slots.focus.slot);
    if (i >= 0) setIndex(i);
  }, [focusAt, multi]);

  // Гортання — і пальцем, і крапками: сторінка йде за index.
  useEffect(() => {
    if (!multi || !width) return;
    pager.current?.scrollTo?.({ x: index * width, animated: !reduce });
  }, [index, width, multi]);

  // Слова ще немає: перший запуск офлайн або сервер не відповів. Порожня
  // картка-заглушка лише заважала б — з'явиться, щойно прийде слово.
  if (!word && !multi) return null;

  const cur = multi ? list[Math.min(index, list.length - 1)] : word;
  const curSaved = multi ? !!cur.saved : saved;
  const curKnowing = multi ? busy || (cur.slot === 0 && knowing) : knowing;

  // Розгортати є що, лише коли є приклад
  const canOpen = !!cur.example;

  function toggle() {
    if (!canOpen) return;
    Haptics.selectionAsync();
    layoutNext();
    setOpen(!open);
  }

  async function know() {
    if (curKnowing) return;
    Haptics.selectionAsync();
    if (!multi) {
      onKnow();
      return;
    }
    setBusy(true);
    try {
      await slots.onKnow(cur);
    } finally {
      setBusy(false);
    }
  }

  function save() {
    if (multi) slots.onSave(cur);
    else onSave?.();
  }

  function pick(i) {
    if (i === index) return;
    Haptics.selectionAsync();
    setIndex(i);
  }

  // Сам рядок — звичайними словами («Слово дня»), бейдж показує його капсом.
  // VoiceOver отримує підпис словами: капс він читав би по літерах.
  const title = t('wordOfDay');
  const caps = topic ? `${title.toLocaleUpperCase()} · ${topic}` : title.toLocaleUpperCase();
  const capsLabel = topic ? `${title}, ${topic}` : title;
  const levelName = levelUp ? cefrFor(levelUp) : '';

  const wordBlock = (w, a11yExtra) => (
    <View
      style={s.row}
      accessible
      // у Pro — котре це слово дня; одне слово VoiceOver читає з тексту
      accessibilityLabel={a11yExtra ? [a11yExtra, w.word, w.translation].filter(Boolean).join(', ') : undefined}
      accessibilityRole={canOpen ? 'button' : undefined}
      accessibilityState={canOpen ? { expanded: open } : undefined}
      accessibilityActions={canOpen ? [{ name: 'activate' }] : undefined}
      onAccessibilityAction={canOpen ? toggle : undefined}
    >
      <View style={{ flex: 1 }}>
        <Text style={s.word}>{w.word}</Text>
        {w.ipa ? <Text style={s.ipa}>{w.ipa}</Text> : null}
        <Text style={s.translation}>{w.translation}</Text>
      </View>
      {multi ? null : <Mascot pose="think" size={62} />}
    </View>
  );

  return (
    <FadeIn>
      {/* Уся картка — ціль для пальця, але не для VoiceOver: інакше «Слухати»
          й «Зберегти» злились би з нею в один елемент. Розгортає рядок зі словом. */}
      <Press onPress={toggle} style={{ marginBottom: 12 }} accessible={false}>
        <View style={[s.card, SHADOW]}>
          <View style={s.head}>
            <View style={s.badge}>
              <Text style={s.badgeText} numberOfLines={1} accessibilityLabel={capsLabel}>
                {caps}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {canOpen ? (
              <View style={[{ marginLeft: 8 }, open ? { transform: [{ rotate: '180deg' }] } : null]}>
                <IcChevron color={C.faint} size={18} />
              </View>
            ) : null}
          </View>

          {multi ? (
            <View style={s.pagerRow}>
              <View style={{ flex: 1 }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
                <ScrollView
                  ref={pager}
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  scrollEnabled={list.length > 1}
                  onMomentumScrollEnd={(e) => {
                    if (!width) return;
                    const i = Math.round(e.nativeEvent.contentOffset.x / width);
                    if (i !== index && i >= 0 && i < list.length) {
                      Haptics.selectionAsync();
                      setIndex(i);
                    }
                  }}
                  testID="wod-pager"
                >
                  {list.map((w, i) => (
                    <View key={w.date + '#' + w.slot} style={{ width: width || undefined }}>
                      {wordBlock(w, t('wodSlotOf', { i: i + 1, n: slots.n }))}
                    </View>
                  ))}
                </ScrollView>
              </View>
              <Mascot pose="think" size={62} />
            </View>
          ) : (
            // key — нове слово після «Знаю» мʼяко проявляється, а не підміняється
            <FadeIn key={word.date + word.word} dy={6}>
              {wordBlock(word)}
            </FadeIn>
          )}

          {/* Крапки слотів — під словом, як сторінки в iOS: у заголовку вони
              з'їдали тему («WORT DES TAGES · REIS…» на SE). */}
          {multi ? (
            <View style={s.dots} testID="wod-slots">
              {Array.from({ length: slots.n }, (_, i) => {
                const opened = i < list.length;
                const on = i === index;
                return (
                  <Pressable
                    key={i}
                    disabled={!opened}
                    onPress={() => pick(i)}
                    hitSlop={{ top: 14, bottom: 14, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on, disabled: !opened }}
                    accessibilityLabel={t('wodSlotOf', { i: i + 1, n: slots.n })}
                    style={s.dotHit}
                  >
                    <View style={[s.dot, opened ? (on ? s.dotOn : s.dotOpen) : s.dotLocked]} />
                  </Pressable>
                );
              })}
              <Text style={s.slotText} numberOfLines={1}>
                {t('widgetSlot', { i: index + 1, n: slots.n })}
              </Text>
            </View>
          ) : null}
          {multi && slots.next ? (
            <View style={s.locked} accessible accessibilityLabel={t('wodNextLocked', { t: slots.next.label })}>
              <IcLock size={14} color={C.faint} />
              <Text style={s.lockedText} numberOfLines={2}>
                {t('wodNextLocked', { t: slots.next.label })}
              </Text>
            </View>
          ) : null}

          {open && cur.example ? (
            <View style={s.details}>
              <Press onPress={() => speak(cur.example, lang)} style={s.exampleBox}>
                <View style={s.exampleSpeaker}>
                  <IcSpeaker size={14} color={C.dim} />
                </View>
                <Text style={s.example}>{quote(cur.example, lang)}</Text>
                <Text style={s.exampleTr}>{cur.example_translation}</Text>
              </Press>
            </View>
          ) : null}

          {/* Три дії в ряд і завжди на виду: «Слухати» — іконкою, щоб «Знаю»
              й «Зберегти» мали місце для слів навіть німецькою. */}
          <View style={s.actions}>
            <Press style={s.listenBtn} onPress={() => speak(cur.word, lang)} accessibilityLabel={t('listen')}>
              <IcSpeaker size={19} color={C.accent} />
            </Press>

            {onKnow || multi ? (
              <Press
                style={s.actionBtn}
                onPress={know}
                accessibilityLabel={t('wodKnowA11y')}
                accessibilityState={{ busy: curKnowing }}
              >
                {curKnowing ? (
                  <ActivityIndicator size="small" color={C.dim} />
                ) : (
                  <Text style={s.actionText} numberOfLines={1}>
                    {t('wodKnow')}
                  </Text>
                )}
              </Press>
            ) : null}

            {curSaved ? (
              // «У словнику» з галочкою — найдовший підпис ряду: на SE він
              // ледве влазить у третину, тож тісніший відступ і, на iOS,
              // трохи менший кегль замість «У словни…»
              <View style={[s.actionBtn, s.savedBtn, { backgroundColor: C.greenSoft }]}>
                <IcCheck size={15} color={C.green} />
                <Text
                  style={[s.actionText, { color: C.green, flexShrink: 1 }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.8}
                >
                  {t('saved')}
                </Text>
              </View>
            ) : (
              <Press style={[s.actionBtn, s.saveBtn]} onPress={save}>
                <Text style={[s.actionText, { color: C.onAccent }]} numberOfLines={1}>
                  {t('saveWord')}
                </Text>
              </Press>
            )}
          </View>

          {/* Нове слово не прийшло (офлайн): кажемо, що «Знаю» запамʼятали */}
          {knowNote ? (
            <Text style={s.note} accessibilityLiveRegion="polite">
              {knowNote}
            </Text>
          ) : null}

          {levelUp ? (
            <FadeIn dy={6} style={s.offer}>
              <Text style={s.offerText}>{t('wodLevelUp', { n: levelName })}</Text>
              <View style={s.offerBtns}>
                <Press style={[s.offerBtn, s.offerYes]} onPress={onLevelUp}>
                  <Text style={[s.offerBtnText, { color: C.onAccent }]} numberOfLines={1}>
                    {t('wodLevelUpYes', { n: levelName })}
                  </Text>
                </Press>
                <Press style={s.offerBtn} onPress={onKeepLevel}>
                  <Text style={s.offerBtnText} numberOfLines={1}>
                    {t('wodLevelUpNo')}
                  </Text>
                </Press>
              </View>
            </FadeIn>
          ) : null}
        </View>
      </Press>
    </FadeIn>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: R.xl, padding: 16 },
    head: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    badge: {
      flexShrink: 1,
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    // Кепс задає стиль: тема приходить звичайним словом («Фінанси»)
    badgeText: { color: C.accent, ...CAPS, letterSpacing: 0.5 },
    // крапки слотів: відкриті — акцент (поточна — довша), майбутні — порожні
    dots: { flexDirection: 'row', alignItems: 'center', marginTop: 8, marginLeft: -2.5 },
    dotHit: { height: 24, justifyContent: 'center', paddingHorizontal: 2.5 },
    dot: { height: 7, borderRadius: 3.5 },
    dotOn: { width: 16, backgroundColor: C.accent },
    dotOpen: { width: 7, backgroundColor: C.accent, opacity: 0.4 },
    dotLocked: { width: 7, backgroundColor: C.card3 },
    slotText: { color: C.dim, ...type(12, F.bold, { noLead: true }), marginLeft: 6, fontVariant: ['tabular-nums'] },
    pagerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    word: { color: C.text, fontSize: 26, fontFamily: F.extra },
    ipa: { color: C.dim, fontSize: 14, ...ipaFont('500'), marginTop: 2 },
    translation: { color: C.text, opacity: 0.8, fontSize: 16, fontFamily: F.semi, marginTop: 4 },
    locked: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: R.md,
      backgroundColor: C.card2,
    },
    lockedText: { flex: 1, color: C.dim, ...type(13, F.semi) },
    details: { marginTop: 14 },
    exampleBox: { backgroundColor: C.card2, borderRadius: R.md, padding: 13, paddingRight: 30 },
    exampleSpeaker: { position: 'absolute', top: 10, right: 10 },
    example: { color: C.text, fontSize: 15, lineHeight: 21, fontFamily: F.reg },
    exampleTr: { color: C.dim, fontSize: 13, marginTop: 5, lineHeight: 18, fontFamily: F.reg },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    listenBtn: {
      width: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.accentSoft,
      borderRadius: R.md,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.card2,
      borderRadius: R.md,
      paddingVertical: 12,
      paddingHorizontal: 8,
      minHeight: 46,
    },
    saveBtn: { backgroundColor: C.accent },
    savedBtn: { gap: 4, paddingHorizontal: 6 },
    actionText: { color: C.text, fontSize: 15, fontFamily: F.bold },
    note: { color: C.dim, ...type(13, F.semi), marginTop: 10, textAlign: 'center' },

    offer: { marginTop: 12, backgroundColor: C.accentSoft, borderRadius: R.md, padding: 14 },
    offerText: { color: C.text, ...type(15, F.semi) },
    offerBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
    offerBtn: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: R.sm,
      backgroundColor: C.card,
      paddingHorizontal: 8,
    },
    offerYes: { backgroundColor: C.accent },
    offerBtnText: { color: C.text, ...type(14, F.bold, { noLead: true }) },
  });
