// Параметри → «Віджети» (widgets.md §12): «Ховати переклад до дотику» і
// «Як додати віджет» з тією самою анімацією, що в онбордингу. У збірці для
// розробки — ще «Прискорений час», щоб за кілька хвилин побачити ротацію
// слів, фази серії й слоти Pro. Секції немає там, де віджетів немає
// (Expo Go, Android). Власник — W2.
//
// Підпис секції — як у src/settings/WodSection.js: ({ ctx, extra }).
// extra.widgetsAvailable — з App (useWidgets).
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { IS_DEV } from '../config';
import { IcChevron } from '../icons';
import { Glass } from '../ui';
import { layoutNext } from '../motion';
import { setFastClock, useWidgetClock } from '../widgets/clock';
import { WidgetHowTo } from '../widgets/HowTo';

export default function WidgetsSection({ ctx, extra = {} }) {
  const { t, C, s, settings, commitSettings } = ctx;
  const st = useMemo(() => makeStyles(C), [C]);
  const [howOpen, setHowOpen] = useState(false);
  const clock = useWidgetClock();
  if (!extra.widgetsAvailable) return null;
  // за замовчуванням переклад схований (рішення власника)
  const hide = settings?.widgetHideTranslation !== false;

  function toggleHide(on) {
    commitSettings({ ...settings, widgetHideTranslation: !!on });
  }

  function toggleHow() {
    Haptics.selectionAsync();
    layoutNext();
    setHowOpen(!howOpen);
  }

  return (
    <>
      <Text style={s.sectionLabel}>{t('settingsWidgets')}</Text>
      <Glass>
        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.switchTitle}>{t('settingsHideTr')}</Text>
            <Text style={s.dimText}>{t('settingsHideTrHint')}</Text>
          </View>
          <Switch
            value={hide}
            onValueChange={toggleHide}
            trackColor={{ false: C.card3, true: C.accent }}
            thumbColor="#fff"
            accessibilityLabel={t('settingsHideTr')}
            testID="widget-hide-tr"
          />
        </View>
        <View style={s.sepInner} />
        <Pressable
          style={st.howRow}
          onPress={toggleHow}
          accessibilityRole="button"
          accessibilityState={{ expanded: howOpen }}
          testID="widget-howto-row"
        >
          <Text style={[s.switchTitle, { flex: 1, marginBottom: 0 }]}>{t('settingsHowWidget')}</Text>
          <View style={{ transform: [{ rotate: howOpen ? '180deg' : '0deg' }] }}>
            <IcChevron color={C.faint} />
          </View>
        </Pressable>
        {howOpen ? <WidgetHowTo t={t} compact style={st.how} /> : null}
        {IS_DEV ? (
          <>
            <View style={s.sepInner} />
            <View style={s.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.switchTitle}>{t('widgetFastClock')}</Text>
                <Text style={s.dimText}>{t('widgetFastClockHint')}</Text>
              </View>
              <Switch
                value={clock.fast}
                onValueChange={setFastClock}
                trackColor={{ false: C.card3, true: C.accent }}
                thumbColor="#fff"
                accessibilityLabel={t('widgetFastClock')}
                testID="widget-fast-clock"
              />
            </View>
          </>
        ) : null}
      </Glass>
    </>
  );
}

const makeStyles = () =>
  StyleSheet.create({
    howRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    how: { marginTop: 10, marginBottom: 4 },
  });
