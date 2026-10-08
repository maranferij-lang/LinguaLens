// Параметри → «Розробка» (онбординг 3.0, onboarding.md §10.3, макет
// onboarding-dev-uk.png). Власник — W3. Підпис секції — як у
// src/settings/WodSection.js.
//
// Лише в dev-збірці (IS_DEV: Expo Go, development build) і одразу, без
// семи дотиків:
//   • «Почати з нуля» — питає підтвердження й стирає все на телефоні, разом
//     із Keychain (токен і carry), фото, віджетами, сповіщеннями й id
//     PostHog, і перезапускає JS: наступний старт — як після встановлення,
//     з новим безкоштовним сканом (App.devReset);
//   • «Онбординг як новий (без стирання)» — повний перший запуск поверх
//     наявних даних (extra.devOnboarding);
//   • «Онбординг на кожному старті» — перемикач для зйомки екранів
//     (extra.devOnbAlways / extra.onDevOnbAlways);
//   • адреса сервера й перевірка зв'язку (колишня «Діагностика»).
// Тексти — лише українською: цієї секції немає в релізі.
//
// У релізі «Розробки» немає зовсім. Сім дотиків по футеру (ctx.dev.open), як
// і раніше, відкривають там лише «Діагностику» — адресу сервера й перевірку
// зв'язку, без жодної кнопки, що щось стирає.
import { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { checkServer } from '../api';
import { IS_DEV, SERVER_SOURCE, SERVER_URL } from '../config';
import { Glass, Press } from '../ui';
import { F, R, type } from '../theme';

export const RESET_TITLE = 'Почати з нуля?';
export const RESET_TEXT =
  'Слова, фото, налаштування, вхід Apple і лічильник сканів на цьому телефоні буде стерто. Сервер дасть новий запис і новий безкоштовний скан.';

function Server({ ctx }) {
  const { t, C, s } = ctx;
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(null);

  async function check() {
    setChecking(true);
    setStatus(null);
    const res = await checkServer();
    setStatus(res);
    setChecking(false);
  }

  return (
    <>
      <Text style={s.serverUrl}>
        {SERVER_URL} · {SERVER_SOURCE}
      </Text>
      <Press style={s.checkBtn} onPress={check} disabled={checking}>
        {checking ? <ActivityIndicator color={C.onAccent} size="small" /> : <Text style={s.checkBtnText}>{t('checkConn')}</Text>}
      </Press>
      {status ? (
        status.ok ? (
          <Text style={s.okText}>{t('srvOnline', { p: status.provider })}</Text>
        ) : (
          <Text style={s.badText}>{t('srvOffline')}</Text>
        )
      ) : null}
    </>
  );
}

export default function DevSection({ ctx, extra = {} }) {
  const { t, C, s, props, dev } = ctx;
  const { onDevReset } = props;
  const d = useMemo(() => makeStyles(C), [C]);

  if (!IS_DEV) {
    if (!dev.open) return null;
    return (
      <>
        <Text style={s.sectionLabel}>{t('diagnostics')}</Text>
        <Glass>
          <Server ctx={ctx} />
        </Glass>
      </>
    );
  }

  function confirmReset() {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(RESET_TITLE, RESET_TEXT, [
      { text: 'Скасувати', style: 'cancel' },
      { text: 'Стерти', style: 'destructive', onPress: () => onDevReset?.() },
    ]);
  }

  return (
    <>
      <Text style={[s.sectionLabel, { color: C.red }]} testID="dev-section">
        Розробка · лише __DEV__
      </Text>
      <Glass flat style={d.card}>
        {onDevReset ? (
          <>
            <Pressable onPress={confirmReset} style={({ pressed }) => [d.row, pressed && { opacity: 0.6 }]} accessibilityRole="button" testID="dev-reset">
              <Text style={[d.title, { color: C.red }]}>Почати з нуля</Text>
              <Text style={s.dimText}>Стирає все на цьому телефоні й ідентичність, перезапускає застосунок. Далі все як після встановлення.</Text>
            </Pressable>
            <View style={s.sepInner} />
          </>
        ) : null}
        {extra.devOnboarding ? (
          <>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                extra.devOnboarding();
              }}
              style={({ pressed }) => [d.row, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
              testID="dev-onboarding"
            >
              <Text style={[d.title, { color: C.text }]}>Онбординг як новий (без стирання)</Text>
              <Text style={s.dimText}>Повний перший запуск: мова, план, серія, віджети, демо, обіцянка, пейвол. Слова лишаються.</Text>
            </Pressable>
            <View style={s.sepInner} />
          </>
        ) : null}
        {extra.onDevOnbAlways ? (
          <>
            <View style={s.switchRow}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.switchTitle}>Онбординг на кожному старті</Text>
                <Text style={s.dimText}>Для зйомки екранів. Зберігається до вимкнення.</Text>
              </View>
              <Switch
                value={!!extra.devOnbAlways}
                onValueChange={(v) => {
                  Haptics.selectionAsync();
                  extra.onDevOnbAlways(v);
                }}
                trackColor={{ true: C.accent }}
                accessibilityLabel="Онбординг на кожному старті"
                testID="dev-onb-always"
              />
            </View>
            <View style={s.sepInner} />
          </>
        ) : null}
        <Server ctx={ctx} />
      </Glass>
    </>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    card: {
      borderWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: C.red,
      borderRadius: R.xl,
    },
    row: { minHeight: 44, justifyContent: 'center' },
    title: { ...type(16, F.bold), marginBottom: 3 },
  });
