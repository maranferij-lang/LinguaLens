// Кроки профілю: імʼя → цілі → сфера (лише для роботи чи навчання) →
// рівень → що заважає → звідки дізнались. Ті самі екрани живуть в
// онбордингу і в редакторі з Параметрів — тут лише їхній вигляд; хто веде
// по кроках і що зберігає, вирішує OnboardingScreen чи ProfileEditor.
import { useEffect, useMemo, useRef } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import LevelSlider from './LevelSlider';
import { FIELDS, GOALS, HEARD, HEARD_BRANDS, NAME_MAX, STRUGGLES, levelResult, needsField } from './profile';
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
export function StepFrame({ stepKey, progress, onBack, right, header, title, text, children, footer, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const titleRef = useRef(null);
  const reader = useScreenReader();
  useEffect(() => {
    if (!reader || !titleRef.current) return;
    try {
      AccessibilityInfo.sendAccessibilityEvent?.(titleRef.current, 'focus');
    } catch (_) {}
  }, [stepKey, reader]);
  const label = progress ? `${t('obStepOf', { n: progress.step, m: progress.total })}. ${title}` : undefined;
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
        {progress ? <Progress {...progress} s={s} /> : <View style={{ flex: 1 }} />}
        <View style={s.barRight}>{right}</View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* key — новий крок мʼяко зʼявляється, а не підміняється миттєво */}
        <FadeIn key={stepKey} dy={10}>
          {header}
          <Text ref={titleRef} style={s.title} accessibilityRole="header" accessibilityLabel={label}>
            {title}
          </Text>
          {text ? <Text style={s.text}>{text}</Text> : null}
          <View style={{ marginTop: 22 }}>{children}</View>
        </FadeIn>
      </ScrollView>

      <View style={s.footer}>{footer}</View>
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
export function LangPill({ code }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.langPill}>
      <Text style={s.langFlag}>{flagFor(code)}</Text>
      <Text style={s.langName}>{nameFor(code)}</Text>
    </View>
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
    <View style={{ gap: 10 }}>
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

// ─── Рівень: слайдер і що з нього випливає ─────────────────────────────────
// lang — мова, яку вчать: VoiceOver чує її в назві слайдера («Твій рівень:
// English»), а не лише в пігулці над заголовком, яку легко проминути.
export function LevelBody({ value, onChange, lang, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const label = lang ? t('pfLevelLabel', { lang: nameFor(lang) }) : t('pfLevelTitle');
  return (
    <View>
      <LevelSlider value={value} onChange={onChange} label={label} t={t} />
      {/* «8/10 · B2+ — пропускаємо базові слова…»: людина одразу бачить,
          що її відповідь щось міняє. VoiceOver оголосить сам рядок. */}
      <View style={s.result}>
        <Text style={s.resultText} accessibilityLiveRegion="polite">
          {levelResult(value, t)}
        </Text>
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
    skip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
    skipText: { color: C.faint, ...type(15, F.semi, { noLead: true }) },
    close: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 4,
    },

    body: { paddingHorizontal: 24, paddingTop: 14, paddingBottom: 24 },
    title: { color: C.text, ...type(28, F.extra) },
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
    langFlag: { fontSize: 16 },
    langName: { color: C.text, ...type(14, F.bold, { noLead: true }) },

    option: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    optionOn: { borderColor: C.accent },
    optIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
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

    result: {
      marginTop: 18,
      backgroundColor: C.card,
      borderRadius: R.md,
      paddingHorizontal: 16,
      paddingVertical: 13,
    },
    resultText: { color: C.dim, ...type(14, F.semi), textAlign: 'center' },

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
