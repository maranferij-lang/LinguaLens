// Кроки профілю: імʼя → цілі → сфера (лише для роботи чи навчання) →
// рівень → що заважає → звідки дізнались. Ті самі екрани живуть в
// онбордингу і в редакторі з Параметрів — тут лише їхній вигляд; хто веде
// по кроках і що зберігає, вирішує OnboardingScreen чи ProfileEditor.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import LevelSlider from './LevelSlider';
import { FIELDS, GOALS, HEARD, HEARD_BRANDS, NAME_MAX, STRUGGLES, clampLevel, levelName, needsField } from './profile';
import { flagFor, nameFor } from './speech';
import {
  IcBook,
  IcBriefcase,
  IcCap,
  IcCards,
  IcCheck,
  IcChevron,
  IcClock,
  IcClose,
  IcCompass,
  IcHeart,
  IcHome,
  IcPlane,
} from './icons';
import { FadeIn, Press } from './ui';
import { DUR, EASE, useReducedMotion, useScreenReader } from './motion';
import { F, R, type, useTheme } from './theme';

// Порядок кроків для цих цілей. Сфера — лише тим, хто вчить для роботи чи
// навчання; «звідки дізнались» — лише в онбордингу.
export function profileSteps(goals, { heard = false } = {}) {
  return ['goals', ...(needsField(goals) ? ['field'] : []), 'level', ...(heard ? ['heard'] : [])];
}

const GOAL_ICONS = { work: IcBriefcase, study: IcCap, travel: IcPlane, relocation: IcHome, self: IcHeart };
// Що заважає: забуваю (картки), бракує часу (годинник), нудно (підручник),
// не знаю, з чого почати (компас).
const STRUGGLE_ICONS = { forget: IcCards, time: IcClock, boring: IcBook, start: IcCompass };

// ─── Рамка кроку ───────────────────────────────────────────────────────────
// Згори: «Назад», смужка прогресу, праворуч «Пропустити» чи хрестик.
// Посередині — заголовок і вміст (скролиться, якщо екран малий або шрифт
// великий). Знизу — головна кнопка під великий палець.
//
// Смужку VoiceOver не читає: «Крок 3 з 9» він чує в самому заголовку, а
// на новому кроці фокус переходить на заголовок — інакше незряча людина
// лишилась би на кнопці «Далі» й не знала б, що екран змінився.
//
// Кожен крок відкривається згори: прокрутка в кожного кроку своя (key),
// інакше після довгого переліку сфер наступний крок відкривався б уже
// прокрученим, з обрізаним заголовком. Вміст не вміщається — смужка
// прокрутки один раз мигає, а над кнопкою лежить згасання: видно, що
// внизу є ще.
//
// progress — { step, total } (одна смужка, редактор профілю) або { acts:
// [f0, f1, f2] } — три сегменти онбордингу («Ти» / «Як це працює» /
// «Спробуй»), кожен заповнений часткою кроків своєї дії. direction —
// 'forward' | 'back': новий крок заїжджає справа чи зліва (онбординг);
// без нього — мʼяко зʼявляється знизу, як і раніше.
//
// mascot — Lingo праворуч від заголовка (кроки-питання онбордингу): декор,
// заголовок лишається заголовком для VoiceOver. peek(room) — те, що
// визирає з-за кнопки знизу (Lingo на кроці імені): StepFrame кладе його
// над кнопкою й передає, скільки вільного місця під вмістом (pt; null —
// ще не виміряно), щоб він ніколи не налазив на поле чи текст. onRoom(room)
// — те саме число щоразу, як воно змінилось: крок, що хоче заповнити екран
// (демо, телефон зі сповіщенням), підганяє під нього свою висоту.
export function StepFrame({ stepKey, progress, onBack, right, header, title, text, children, footer, direction, mascot, peek, onRoom, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const titleRef = useRef(null);
  const scrollRef = useRef(null);
  const reader = useScreenReader();
  useEffect(() => {
    if (!reader || !titleRef.current) return;
    try {
      AccessibilityInfo.sendAccessibilityEvent?.(titleRef.current, 'focus');
    } catch (_) {}
  }, [stepKey, reader]);

  // Висота вікна прокрутки, вмісту й де зараз палець — свої для кожного кроку
  const dims = useRef({});
  const [fit, setFit] = useState({ key: null, over: false, more: false });
  function measure(patch) {
    if (dims.current.key !== stepKey) dims.current = { key: stepKey, view: 0, content: 0, y: 0 };
    Object.assign(dims.current, patch);
    const { view, content, y } = dims.current;
    const over = view > 0 && content > view + 1;
    const more = over && y + view < content - 4;
    const room = view > 0 && content > 0 ? Math.round(view - content + BODY_PAD) : null;
    setFit((f) => (f.key === stepKey && f.over === over && f.more === more && f.room === room ? f : { key: stepKey, over, more, room }));
  }
  const over = fit.key === stepKey && fit.over;
  const more = fit.key === stepKey && fit.more;
  // Вільне місце під вмістом (разом із нижнім відступом прокрутки) — для peek
  const room = fit.key === stepKey && fit.room != null ? fit.room : null;
  const roomCb = useRef(onRoom);
  roomCb.current = onRoom;
  useEffect(() => {
    if (room != null) roomCb.current?.(room);
  }, [room]);
  const flashed = useRef(null);
  useEffect(() => {
    if (!over || flashed.current === stepKey) return;
    flashed.current = stepKey;
    try {
      scrollRef.current?.flashScrollIndicators?.();
    } catch (_) {}
  }, [over, stepKey]);
  const label = progress?.total ? `${t('obStepOf', { n: progress.step, m: progress.total })}. ${title}` : undefined;
  const dx = direction === 'back' ? -SLIDE : direction === 'forward' ? SLIDE : 0;
  return (
    <View style={s.frame}>
      <View style={s.bar}>
        {onBack ? (
          <Pressable
            style={s.barBtn}
            onPress={onBack}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('pfBack')}
          >
            <View style={{ transform: [{ rotate: '90deg' }] }}>
              <IcChevron size={22} color={C.dim} />
            </View>
          </Pressable>
        ) : (
          <View style={s.barBtn} />
        )}
        {progress?.acts ? (
          <ActsProgress acts={progress.acts} s={s} />
        ) : progress ? (
          <Progress {...progress} s={s} />
        ) : (
          <View style={{ flex: 1 }} />
        )}
        <View style={s.barRight}>{right}</View>
      </View>

      <ScrollView
        key={stepKey}
        ref={scrollRef}
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={over}
        keyboardShouldPersistTaps="handled"
        onLayout={(e) => measure({ view: e.nativeEvent.layout.height })}
        onContentSizeChange={(w, h) => measure({ content: h })}
        onScroll={(e) => measure({ y: e.nativeEvent.contentOffset.y })}
        scrollEventThrottle={32}
      >
        {/* key — новий крок мʼяко зʼявляється, а не підміняється миттєво */}
        <FadeIn key={stepKey} dy={10} dx={dx}>
          {header}
          {title && mascot ? (
            <View style={s.titleRow}>
              <Text ref={titleRef} style={[s.title, { flex: 1 }]} accessibilityRole="header" accessibilityLabel={label}>
                {title}
              </Text>
              {mascot}
            </View>
          ) : title ? (
            <Text ref={titleRef} style={s.title} accessibilityRole="header" accessibilityLabel={label}>
              {title}
            </Text>
          ) : null}
          {text ? <Text style={s.text}>{text}</Text> : null}
          <View style={{ marginTop: title ? 22 : 0 }}>{children}</View>
        </FadeIn>
      </ScrollView>

      <View style={s.footer}>
        {peek ? (
          <View pointerEvents="box-none" style={s.peek}>
            {peek(room)}
          </View>
        ) : null}
        {more ? <FooterFade color={C.bg} /> : null}
        {footer}
      </View>
    </View>
  );
}

// На скільки новий крок заїжджає збоку (онбординг: уперед — справа)
const SLIDE = 24;
// Нижній відступ прокрутки (s.body) — порожнє місце, яке peek може зайняти
export const BODY_PAD = 24;

// Згасання над кнопкою: вміст іде під неї, а не обрізається рівною лінією
const FADE = 16;
function FooterFade({ color }) {
  return (
    <View
      testID="step-fade"
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, top: -FADE, height: FADE }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={FADE}>
        <Defs>
          <LinearGradient id="stepFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={FADE} fill="url(#stepFade)" />
      </Svg>
    </View>
  );
}

// Тонка смужка: скільки кроків пройдено. Наступний крок мʼяко доливає її
// (рамка лишається тим самим компонентом, тож значення не стартує з нуля).
// «Менше руху» — просто стає на місце. Для VoiceOver її немає (див. вище).
function Progress({ step, total, s }) {
  const value = total > 0 ? Math.min(1, step / total) : 0;
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(value)).current;
  useEffect(() => {
    if (reduced) {
      a.setValue(value);
      return;
    }
    Animated.timing(a, { toValue: value, duration: DUR.panel, easing: EASE.out, useNativeDriver: true }).start();
  }, [value, reduced]);
  return (
    <View
      style={s.progress}
      testID="onb-progress"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Animated.View style={[s.progressFill, { transform: [{ scaleX: a }], transformOrigin: 'left' }]} />
    </View>
  );
}

// Три дії онбордингу — три сегменти. Сегмент доливається, коли людина
// йде вперед, і так само мʼяко спадає, коли повертається. Порожні — тим
// самим кольором доріжки: видно, скільки розділів ще попереду.
function ActsProgress({ acts, s }) {
  return (
    <View style={s.acts} testID="onb-progress" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {acts.map((f, i) => (
        <Segment key={i} value={f} s={s} testID={'onb-act-' + i} />
      ))}
    </View>
  );
}

function Segment({ value, s, testID }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(v)).current;
  useEffect(() => {
    if (reduced) {
      a.setValue(v);
      return;
    }
    Animated.timing(a, { toValue: v, duration: DUR.panel, easing: EASE.out, useNativeDriver: true }).start();
  }, [v, reduced]);
  return (
    <View style={s.segment} testID={testID}>
      <Animated.View style={[s.progressFill, { transform: [{ scaleX: a }], transformOrigin: 'left' }]} />
    </View>
  );
}

// «Пропустити» праворуч у рамці. hidden — крок не питання, пропускати
// нічого: кнопки немає ні для пальця, ні для VoiceOver, але місце вона
// тримає — інакше смужка прогресу стрибала б завширшки між кроками.
export function SkipButton({ onPress, t, hidden = false }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (hidden) {
    return (
      <View style={[s.skip, { opacity: 0 }]} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={s.skipText}>{t('obSkip')}</Text>
      </View>
    );
  }
  return (
    <Pressable style={s.skip} onPress={onPress} hitSlop={8} accessibilityRole="button">
      <Text style={s.skipText}>{t('obSkip')}</Text>
    </Pressable>
  );
}

// Хрестик праворуч у рамці (редактор у Параметрах)
export function CloseButton({ onPress, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <Pressable style={s.close} onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('close')}>
      <IcClose size={18} color={C.dim} />
    </Pressable>
  );
}

// Мова, яку вчать, — над питанням про рівень: «🇬🇧 English». Ендонім із
// прапорцем, як у Параметрах: відмінювати 29 назв мов у реченні не треба.
// onPress — мову можна змінити просто тут (перше знайомство): тоді це
// кнопка «змінити ›». Без нього (повтор, редактор у Параметрах) — підпис.
export function LangPill({ code, onPress, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (!onPress) {
    return (
      <View style={s.langPill}>
        <Text style={s.langFlag}>{flagFor(code)}</Text>
        <Text style={s.langName}>{nameFor(code)}</Text>
      </View>
    );
  }
  return (
    <Press
      style={[s.langPill, s.langBtn]}
      onPress={() => {
        Haptics.selectionAsync();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={t('obLangA11y', { lang: nameFor(code) })}
    >
      <Text style={s.langFlag}>{flagFor(code)}</Text>
      <Text style={s.langName}>{nameFor(code)}</Text>
      <Text style={s.langChange}>{t('obLangChange')}</Text>
      <View style={{ transform: [{ rotate: '-90deg' }] }}>
        <IcChevron size={14} color={C.accent} />
      </View>
    </Press>
  );
}

// ─── Кілька з переліку: цілі й «що заважає» ────────────────────────────────
// Порядок відповіді — як у переліку, а не як тапали: від нього залежить
// підпис кешу слова дня, і однаковий вибір має давати однаковий масив.
function CheckList({ items, icons, value, onChange, label, s, C }) {
  function toggle(k) {
    Haptics.selectionAsync();
    onChange(value.includes(k) ? value.filter((x) => x !== k) : items.filter((x) => x === k || value.includes(x)));
  }
  return (
    <View style={{ gap: 8 }}>
      {items.map((k) => {
        const on = value.includes(k);
        const Icon = icons[k];
        return (
          <Press
            key={k}
            style={[s.option, on && s.optionOn]}
            onPress={() => toggle(k)}
            scaleTo={0.98}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={label(k)}
          >
            <View style={[s.optIcon, on && s.optIconOn]}>
              <Icon size={22} color={on ? C.onAccent : C.accent} />
            </View>
            <Text style={[s.optText, on && { color: C.text }]}>{label(k)}</Text>
            <View style={[s.check, on && s.checkOn]}>{on ? <IcCheck size={14} color={C.onAccent} /> : null}</View>
          </Press>
        );
      })}
    </View>
  );
}

// Цілі: кілька з пʼяти
export function GoalOptions({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <CheckList items={GOALS} icons={GOAL_ICONS} value={value} onChange={onChange} label={(k) => t('goal_' + k)} s={s} C={C} />;
}

// Що заважає вчити мову: кілька з чотирьох (або нічого)
export function StruggleOptions({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <CheckList items={STRUGGLES} icons={STRUGGLE_ICONS} value={value} onChange={onChange} label={(k) => t('struggle_' + k)} s={s} C={C} />
  );
}

// ─── Імʼя ──────────────────────────────────────────────────────────────────
// Одне поле. Імʼя живе лише на телефоні — тому й автозаповнення з картки
// контакту доречне: воно нікуди не йде. «Готово» на клавіатурі — те саме,
// що «Далі».
export function NameField({ value, onChange, onSubmit, label, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      placeholder={t('yourName')}
      placeholderTextColor={C.faint}
      accessibilityLabel={label}
      maxLength={NAME_MAX}
      autoFocus
      autoCapitalize="words"
      autoCorrect={false}
      autoComplete="given-name"
      textContentType="givenName"
      returnKeyType="next"
      onSubmitEditing={onSubmit}
      selectionColor={C.accent}
    />
  );
}

// ─── Чипи з одним вибором: сфера й «звідки дізнались» ──────────────────────
function Chips({ items, value, onChange, label, columns, s }) {
  return (
    <View style={s.chips} accessibilityRole="radiogroup">
      {items.map((k) => {
        const on = value === k;
        return (
          <Press
            key={k}
            style={[s.chip, columns && s.chipHalf, on && s.chipOn]}
            onPress={() => {
              Haptics.selectionAsync();
              onChange(k);
            }}
            scaleTo={0.97}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={label(k)}
          >
            <Text style={[s.chipText, on && s.chipTextOn]} numberOfLines={2}>
              {label(k)}
            </Text>
          </Press>
        );
      })}
    </View>
  );
}

export function FieldOptions({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <Chips items={FIELDS} value={value} onChange={onChange} label={(k) => t('field_' + k)} columns s={s} />;
}

export function HeardOptions({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return <Chips items={HEARD} value={value} onChange={onChange} label={(k) => HEARD_BRANDS[k] || t('heard_' + k)} s={s} />;
}

// ─── Рівень: слайдер і назва рівня ─────────────────────────────────────────
// lang — мова, яку вчать: VoiceOver чує її в назві слайдера («Твій рівень:
// English»), а не лише в пігулці над заголовком, яку легко проминути.
export function LevelBody({ value, onChange, lang, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const label = lang ? t('pfLevelLabel', { lang: nameFor(lang) }) : t('pfLevelTitle');
  const level = clampLevel(value);
  return (
    <View>
      <LevelSlider value={level} onChange={onChange} label={label} t={t} desc={false} />
      {/* Під доріжкою — проста назва рівня великим («Середній») і під нею
          дрібніше, що це означає («Можу підтримати розмову»): людина
          впізнає себе без пояснень, які слова ми пропустимо (онбординг
          4.0). VoiceOver оголосить назву, щойно рівень зміниться. */}
      <View style={s.result} testID="level-name">
        <Text style={s.levelName} accessibilityLiveRegion="polite">
          {levelName(level, t)}
        </Text>
        <Text style={s.levelDesc}>{t('lvl' + level)}</Text>
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    frame: { flex: 1, backgroundColor: C.bg },
    bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, height: 52, gap: 8 },
    barBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    barRight: { minWidth: 44, alignItems: 'flex-end', justifyContent: 'center' },
    progress: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.card3, overflow: 'hidden', marginHorizontal: 6 },
    progressFill: { height: 4, width: '100%', borderRadius: 2, backgroundColor: C.accent },
    acts: { flex: 1, flexDirection: 'row', gap: 6, marginHorizontal: 6 },
    segment: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.card3, overflow: 'hidden' },
    skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    // dim, а не faint: «Пропустити» — єдиний вихід з непотрібного питання,
    // і він мусить читатися (≥ 4.5:1 в обох темах)
    skipText: { color: C.dim, ...type(15, F.semi, { noLead: true }) },
    close: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },

    body: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: BODY_PAD },
    title: { color: C.text, ...type(28, F.extra) },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    // над кнопкою, низом — за нею: те, що визирає, ховає ноги за кнопкою
    peek: { position: 'absolute', left: 0, right: 0, bottom: '100%' },
    text: { color: C.dim, ...type(15, F.reg), marginTop: 8 },
    footer: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24 },

    langPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 7,
      backgroundColor: C.card,
      borderRadius: R.pill,
      paddingHorizontal: 12,
      paddingVertical: 6,
      marginBottom: 14,
    },
    // кнопка: ціль не менша за 44 pt, «змінити» — акцентом, як посилання
    langBtn: { minHeight: 44, paddingLeft: 14, paddingRight: 10, gap: 6 },
    langFlag: { fontSize: 16 },
    langName: { color: C.text, ...type(14, F.bold, { noLead: true }) },
    langChange: { color: C.accent, ...type(13, F.semi, { noLead: true }), marginLeft: 2 },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: C.card,
      borderRadius: R.lg,
      // щільніше, щоб на SE всі пʼять цілей влазили без прокрутки; рядок
      // однаково вищий за 44 pt
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionOn: { borderColor: C.accent },
    optIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optIconOn: { backgroundColor: C.accent },
    optText: { flex: 1, color: C.text, ...type(17, F.bold) },
    check: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: C.card3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkOn: { backgroundColor: C.accent, borderColor: C.accent },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    chip: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: R.md,
      backgroundColor: C.card,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    // дві колонки: 12 сфер — шість рівних рядів, а не рвана хмара
    chipHalf: { flexBasis: '47%', flexGrow: 1 },
    chipOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
    chipText: { color: C.text, ...type(16, F.semi), textAlign: 'center' },
    chipTextOn: { color: C.accent, fontFamily: F.extra },

    result: { marginTop: 14, alignItems: 'center', minHeight: 72 },
    levelName: { color: C.text, ...type(26, F.extra), textAlign: 'center' },
    levelDesc: { color: C.dim, ...type(15, F.semi), textAlign: 'center', marginTop: 2 },

    input: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      borderWidth: 2,
      borderColor: C.accent,
      paddingHorizontal: 18,
      paddingVertical: 16,
      color: C.text,
      ...type(20, F.bold, { noLead: true }),
      // власна рамка поля вже показує фокус — системний контур не потрібен
      outlineWidth: 0,
    },
  });
