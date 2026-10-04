// Дві тихі підказки на вкладці навчання: налаштувати слово дня під себе і
// винести його на головний екран. Обидві — картки, а не діалоги: людина
// прибирає їх одним дотиком, і вони більше не повертаються (прапорці в
// налаштуваннях вирішує App).
import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
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

// «Слово дня на головному екрані»: три коротких кроки. Без вигаданих
// цифр на кшталт «на 60% частіше» — своїх даних у нас ще немає.
export function WidgetTip({ word, onHide, t }) {
  const { C, SHADOW, s } = useStyles();
  const steps = [t('widgetTipStep1'), t('widgetTipStep2'), t('widgetTipStep3')];
  return (
    <FadeIn dy={6} style={[s.widget, SHADOW]}>
      <View style={s.widgetHead}>
        {/* Мініатюра віджета зі справжнім словом дня — видно, що саме зʼявиться */}
        <View style={s.mini} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <Text style={s.miniCaps} numberOfLines={1}>
            {t('wordOfDay')}
          </Text>
          <Text style={s.miniWord} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
            {word?.word || 'LinguaLens'}
          </Text>
          {word?.translation ? (
            <Text style={s.miniTr} numberOfLines={1}>
              {word.translation}
            </Text>
          ) : null}
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

    widget: { backgroundColor: C.card, borderRadius: R.lg, padding: 14, marginBottom: 12 },
    widgetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    mini: {
      width: 64,
      height: 64,
      borderRadius: 15,
      backgroundColor: C.bg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: C.sep,
      padding: 7,
      justifyContent: 'flex-end',
    },
    miniCaps: { position: 'absolute', top: 7, left: 7, right: 7, color: C.accent, fontSize: 6, fontFamily: F.extra, letterSpacing: 0.3 },
    miniWord: { color: C.text, fontSize: 12, fontFamily: F.extra },
    miniTr: { color: C.dim, fontSize: 8, fontFamily: F.semi },
    widgetTitle: { flex: 1, color: C.text, ...type(16, F.bold) },
    steps: { marginTop: 12, gap: 9 },
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
