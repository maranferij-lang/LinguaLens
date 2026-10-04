// Футер Параметрів: справжня іконка застосунку, назва, слоган і версія
// (core.md D, макет core-footer.png). Власник — W0. Підпис секції — як у
// src/settings/WodSection.js.
//
// Слоган не повторює назву — вона написана рядком вище. Сім дотиків по
// футеру, як і раніше, відкривають (і ховають) діагностику — класичний
// прихований жест (ctx.dev, src/settings/DevSection.js).
import { useRef } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { AppIcon } from '../Logo';
import { version as APP_VERSION } from '../../package.json';
import { F, type } from '../theme';

export const DEV_TAPS = 7;

export default function Footer({ ctx }) {
  const { t, C, dev } = ctx;
  const taps = useRef(0);

  function tap() {
    const n = taps.current + 1;
    taps.current = n;
    if (n >= DEV_TAPS) {
      taps.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      dev.setOpen((v) => !v);
    }
  }

  return (
    <Pressable
      testID="settings-footer"
      style={styles.root}
      onPress={tap}
      // для VoiceOver футер — просто текст: прихований жест не кнопка
      accessible
      accessibilityRole="text"
      accessibilityLabel={`LinguaLens. ${t('footer')}. ${t('versionLabel', { v: APP_VERSION })}`}
    >
      <AppIcon size={64} />
      <Text style={[styles.name, { color: C.text }]} maxFontSizeMultiplier={1.4}>
        LinguaLens
      </Text>
      <Text style={[styles.slogan, { color: C.dim }]} maxFontSizeMultiplier={1.4}>
        {t('footer')}
      </Text>
      <Text style={[styles.version, { color: C.dim }]} maxFontSizeMultiplier={1.4}>
        {t('versionLabel', { v: APP_VERSION })}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: 'center', marginTop: 30, paddingVertical: 6 },
  name: { ...type(19, F.extra, { noLead: true }), marginTop: 12 },
  slogan: { ...type(13, F.semi, { noLead: true }), marginTop: 5, textAlign: 'center' },
  version: { ...type(12, F.reg, { noLead: true }), marginTop: 4 },
});
