// Дві тихі підказки на вкладці навчання: налаштувати слово дня під себе і
// винести його на головний екран. Обидві — картки, а не діалоги: людина
// прибирає їх одним дотиком, і вони більше не повертаються (прапорці в
// налаштуваннях вирішує App).
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Rect } from 'react-native-svg';
import { IcClose, IcSliders } from './icons';
import { FadeIn, Press } from './ui';
import { layoutNext } from './motion';
import { F, R, type, useTheme } from './theme';

function useStyles() {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return { C, SHADOW, s };
}

// Хрестик: окрема ціль для VoiceOver, не злита з карткою
function Hide({ onPress, t, s, C }) {
  function hide() {
    Haptics.selectionAsync();
    layoutNext(); // решта вкладки плавно під'їжджає (без руху при reduced motion)
    onPress?.();
  }
  return (
    <Pressable style={s.hide} onPress={hide} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('tipHide')}>
      <IcClose size={16} color={C.faint} />
    </Pressable>
  );
}

// «Налаштуй слово дня під себе» — для тих, у кого профілю ще немає
// (оновились зі старої версії або пропустили питання в онбордингу).
export function ProfileTip({ onOpen, onHide, t }) {
  const { C, s } = useStyles();
  const title = t('pfTipTitle');
  return (
    <FadeIn dy={6} style={s.tip}>
      <Press style={s.tipMain} onPress={onOpen} accessibilityLabel={title} accessibilityHint={t('pfTipText')} scaleTo={0.98}>
        <View style={s.tipIcon}>
          <IcSliders size={20} color={C.accent} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.tipTitle}>{title}</Text>
          <Text style={s.tipText}>{t('pfTipText')}</Text>
        </View>
      </Press>
      <Hide onPress={onHide} t={t} s={s} C={C} />
    </FadeIn>
  );
}

// Значок віджета: широкий віджет над двома іконками, як на головному екрані.
// Штрих і сітка — як у наборі src/icons.js.
function WidgetGlyph({ size = 20, color }) {
  const st = { fill: 'none', stroke: color, strokeWidth: 1.75, strokeLinejoin: 'round' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Rect x="3.5" y="3.5" width="17" height="8" rx="2.5" {...st} />
      <Rect x="3.5" y="14" width="7" height="6.5" rx="2" {...st} />
      <Rect x="13.5" y="14" width="7" height="6.5" rx="2" {...st} />
    </Svg>
  );
}

// «Слово дня на головному екрані»: три коротких кроки. Без вигаданих
// цифр на кшталт «на 60% частіше» — своїх даних у нас ще немає. Замість
// мініатюри віджета (на 64 pt її текст не читався) — значок, як у сусідньої
// підказки про профіль.
export function WidgetTip({ onHide, t }) {
  const { C, SHADOW, s } = useStyles();
  const steps = [t('widgetTipStep1'), t('widgetTipStep2'), t('widgetTipStep3')];
  return (
    <FadeIn dy={6} style={[s.widget, SHADOW]}>
      <View style={s.widgetHead}>
        <View style={[s.tipIcon, s.widgetIcon]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <WidgetGlyph size={20} color={C.accent} />
        </View>
        <Text style={s.widgetTitle} accessibilityRole="header">
          {t('widgetTipTitle')}
        </Text>
        <Hide onPress={onHide} t={t} s={s} C={C} />
      </View>
      <View style={s.steps}>
        {steps.map((text, i) => (
          <View key={i} style={s.step}>
            <View style={s.stepNum}>
              <Text style={s.stepNumText}>{i + 1}</Text>
            </View>
            <Text style={s.stepText}>{text}</Text>
          </View>
        ))}
      </View>
    </FadeIn>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    // м'який акцентний фон, як у підказки про вхід у Словнику
    tip: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.accentSoft, borderRadius: R.lg, marginBottom: 12 },
    tipMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingLeft: 13 },
    tipIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tipTitle: { color: C.text, ...type(15, F.bold) },
    tipText: { color: C.dim, ...type(13, F.reg), marginTop: 2 },
    hide: { width: 44, minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },

    widget: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, paddingRight: 0, marginBottom: 12 },
    widgetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    // картка біла — значок на мʼякому акценті (у підказки про профіль навпаки)
    widgetIcon: { backgroundColor: C.accentSoft },
    widgetTitle: { flex: 1, color: C.text, ...type(16, F.bold) },
    steps: { marginTop: 12, gap: 9, paddingRight: 14 },
    step: { flexDirection: 'row', alignItems: 'center', gap: 11 },
    stepNum: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumText: { color: C.accent, ...type(13, F.extra, { noLead: true }) },
    stepText: { flex: 1, color: C.text, ...type(14, F.semi) },
  });
