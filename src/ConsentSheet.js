// Згода на відправку кадру — один раз, перед першим сканом.
//
// App Review 5.1.2(i): перш ніж фото піде на наш сервер і далі стороннім
// AI-сервісам, людина має прямо дізнатися, куди воно йде й навіщо, і
// дозволити. Питаємо на першому тапі затвора, а не в онбордингу: онбординг
// можна пропустити, а затвор — ні.
//
// З 5.10.2026 аркуш вимкнено прапорцем AI_CONSENT_SHEET (src/flags.js):
// сканер і демо онбордингу його не показують. Код і рядки aiConsent* лишаються,
// щоб повернути аркуш одним рядком, якщо App Review вимагатиме згоди.
//
// Це окремий нативний Modal. Двох Modal одночасно тут не буває: аркуш
// з'являється ДО зйомки, коли аркуш результату скану закритий.
import { useMemo } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { PRIVACY_URL } from './config';
import { Mascot } from './Mascot';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { openLink } from './settings/links';
import { F, R, type, useTheme } from './theme';

export default function ConsentSheet({ visible, onAllow, onClose, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Тап повз аркуш — те саме, що «Не зараз». VoiceOver тло пропускає:
          для нього є сама кнопка й жест виходу. */}
      <Pressable style={s.backdrop} onPress={onClose} accessible={false} />
      <View style={s.sheet} onAccessibilityEscape={onClose}>
        <View style={s.handle} />
        <FadeIn dy={14} style={{ alignItems: 'center' }}>
          <Mascot pose="encourage" size={96} />
          <Text style={s.title}>{t('aiConsentTitle')}</Text>
          <Text style={s.text}>{t('aiConsentText')}</Text>
          {PRIVACY_URL ? (
            <Press hitSlop={10} feedback="dim" accessibilityRole="link" onPress={() => openLink(PRIVACY_URL)}>
              <Text style={s.link}>{t('privacy')}</Text>
            </Press>
          ) : null}
        </FadeIn>
        <FadeIn delay={60} style={s.btns}>
          <GradBtn title={t('aiConsentAllow')} onPress={onAllow} />
          <SecBtn title={t('aiConsentLater')} onPress={onClose} />
        </FadeIn>
      </View>
    </Modal>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    // затемнення з теми: у темних версіях густіше (C.scrim)
    backdrop: { flex: 1, backgroundColor: C.scrim },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      padding: 24,
      paddingBottom: 42,
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.card3,
      alignSelf: 'center',
      marginBottom: 14,
    },
    title: { color: C.text, ...type(24, F.extra), textAlign: 'center', marginTop: 10 },
    text: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 10, maxWidth: 330 },
    link: { color: C.accent, ...type(15, F.bold, { noLead: true }), marginTop: 14 },
    btns: { marginTop: 24, gap: 10 },
  });
