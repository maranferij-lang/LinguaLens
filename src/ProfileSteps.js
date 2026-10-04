// Кроки профілю: цілі → сфера (лише для роботи чи навчання) → рівень →
// звідки дізнались. Ті самі екрани живуть в онбордингу і в редакторі з
// Параметрів — тут лише їхній вигляд; хто веде по кроках і що зберігає,
// вирішує OnboardingScreen чи ProfileEditor.
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import LevelSlider from './LevelSlider';
import { FIELDS, GOALS, HEARD, HEARD_BRANDS, levelResult, needsField } from './profile';
import { flagFor, nameFor } from './speech';
import { IcBriefcase, IcCap, IcCheck, IcChevron, IcClose, IcHeart, IcHome, IcPlane } from './icons';
import { FadeIn, Press } from './ui';
import { F, R, type, useTheme } from './theme';

// Порядок кроків для цих цілей. Сфера — лише тим, хто вчить для роботи чи
// навчання; «звідки дізнались» — лише в онбордингу.
export function profileSteps(goals, { heard = false } = {}) {
  return ['goals', ...(needsField(goals) ? ['field'] : []), 'level', ...(heard ? ['heard'] : [])];
}

const GOAL_ICONS = { work: IcBriefcase, study: IcCap, travel: IcPlane, relocation: IcHome, self: IcHeart };

// ─── Рамка кроку ───────────────────────────────────────────────────────────
// Згори: «Назад», смужка прогресу, праворуч «Пропустити» чи хрестик.
// Посередині — заголовок і вміст (скролиться, якщо екран малий або шрифт
// великий). Знизу — головна кнопка під великий палець.
export function StepFrame({ stepKey, progress, onBack, right, header, title, text, children, footer, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
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
          <Text style={s.title} accessibilityRole="header">
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

// Смужка з сегментів: скільки кроків пройдено. VoiceOver чує «2 з 4».
function Progress({ step, total, s }) {
  return (
    <View style={s.progress} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 1, max: total, now: step }}>
      {Array.from({ length: total }, (_, i) => (
        <View key={i} style={[s.seg, i < step && s.segOn]} />
      ))}
    </View>
  );
}

// «Пропустити» праворуч у рамці
export function SkipButton({ onPress, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
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

// ─── Цілі: кілька з п'яти ──────────────────────────────────────────────────
export function GoalOptions({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  function toggle(g) {
    Haptics.selectionAsync();
    onChange(value.includes(g) ? value.filter((x) => x !== g) : GOALS.filter((x) => x === g || value.includes(x)));
  }
  return (
    <View style={{ gap: 10 }}>
      {GOALS.map((g) => {
        const on = value.includes(g);
        const Icon = GOAL_ICONS[g];
        return (
          <Press
            key={g}
            style={[s.option, on && s.optionOn]}
            onPress={() => toggle(g)}
            scaleTo={0.98}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={t('goal_' + g)}
          >
            <View style={[s.optIcon, on && s.optIconOn]}>
              <Icon size={22} color={on ? C.onAccent : C.accent} />
            </View>
            <Text style={[s.optText, on && { color: C.text }]}>{t('goal_' + g)}</Text>
            <View style={[s.check, on && s.checkOn]}>{on ? <IcCheck size={14} color={C.onAccent} /> : null}</View>
          </Press>
        );
      })}
    </View>
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
    progress: { flex: 1, flexDirection: 'row', gap: 6, paddingHorizontal: 6 },
    seg: { flex: 1, height: 4, borderRadius: 2, backgroundColor: C.card3 },
    segOn: { backgroundColor: C.accent },
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
  });
