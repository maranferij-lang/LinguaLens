// Картка «Слово дня» — розгортається дотиком, озвучується, зберігається у словник.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcCheck, IcChevron, IcSpeaker } from './icons';
import { Mascot } from './Mascot';
import { FadeIn, Press } from './ui';
import { layoutNext } from './motion';
import { F, R, useTheme } from './theme';

export default function WordOfDayCard({ word, lang, saved, onSave, onSignIn, t }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);

  // гість ще не має акаунта — показуємо запрошення, а не порожнечу
  if (!word) {
    if (!onSignIn) return null;
    return (
      <FadeIn>
        <Press onPress={onSignIn} style={{ marginBottom: 12 }}>
          <View style={[s.card, SHADOW]}>
            <View style={s.head}>
              <View style={s.badge}>
                <Text style={s.badgeText}>{t('wordOfDay')}</Text>
              </View>
            </View>
            <View style={s.row}>
              <View style={{ flex: 1 }}>
                <Text style={s.lockedTitle}>{t('wodLockedTitle')}</Text>
                <Text style={s.lockedText}>{t('wodLockedText')}</Text>
                <View style={s.lockedBtn}>
                  <Text style={s.lockedBtnText}>{t('signIn')}</Text>
                </View>
              </View>
              <Mascot pose="encourage" size={70} />
            </View>
          </View>
        </Press>
      </FadeIn>
    );
  }

  function toggle() {
    Haptics.selectionAsync();
    layoutNext();
    setOpen(!open);
  }

  return (
    <FadeIn>
      <Press onPress={toggle} style={{ marginBottom: 12 }}>
        <View style={[s.card, SHADOW]}>
          <View style={s.head}>
            <View style={s.badge}>
              <Text style={s.badgeText}>{t('wordOfDay')}</Text>
            </View>
            <View style={{ flex: 1 }} />
            <View style={open ? { transform: [{ rotate: '180deg' }] } : null}>
              <IcChevron color={C.faint} size={18} />
            </View>
          </View>

          <View style={s.row}>
            <View style={{ flex: 1 }}>
              <Text style={s.word}>{word.word}</Text>
              {word.ipa ? <Text style={s.ipa}>{word.ipa}</Text> : null}
              <Text style={s.translation}>{word.translation}</Text>
            </View>
            <Mascot pose="think" size={62} />
          </View>

          {open ? (
            <View style={s.details}>
              {word.example ? (
                <Press onPress={() => speak(word.example, lang)} style={s.exampleBox}>
                  <View style={s.exampleSpeaker}>
                    <IcSpeaker size={14} color={C.dim} />
                  </View>
                  <Text style={s.example}>“{word.example}”</Text>
                  <Text style={s.exampleTr}>{word.example_translation}</Text>
                </Press>
              ) : null}

              <View style={s.actions}>
                <Press style={s.actionBtn} onPress={() => speak(word.word, lang)}>
                  <IcSpeaker size={17} color={C.accent} />
                  <Text style={s.actionText}>{t('listen')}</Text>
                </Press>

                {saved ? (
                  <View style={[s.actionBtn, { backgroundColor: C.greenSoft }]}>
                    <IcCheck size={15} color={C.green} />
                    <Text style={[s.actionText, { color: C.green }]}>{t('saved')}</Text>
                  </View>
                ) : (
                  <Press style={[s.actionBtn, s.saveBtn]} onPress={onSave}>
                    <Text style={[s.actionText, { color: C.onAccent }]}>{t('saveWord')}</Text>
                  </Press>
                )}
              </View>
            </View>
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
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    badgeText: { color: C.accent, fontSize: 11, fontFamily: F.extra, letterSpacing: 0.5 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    word: { color: C.text, fontSize: 26, fontFamily: F.extra },
    ipa: { color: C.dim, fontSize: 14, fontFamily: F.reg, marginTop: 2 },
    translation: { color: C.text, opacity: 0.8, fontSize: 16, fontFamily: F.semi, marginTop: 4 },
    details: { marginTop: 14 },
    exampleBox: { backgroundColor: C.card2, borderRadius: R.md, padding: 13, paddingRight: 30 },
    exampleSpeaker: { position: 'absolute', top: 10, right: 10 },
    example: { color: C.text, fontSize: 15, lineHeight: 21, fontFamily: F.reg },
    exampleTr: { color: C.dim, fontSize: 13, marginTop: 5, lineHeight: 18, fontFamily: F.reg },
    actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.card2,
      borderRadius: R.md,
      paddingVertical: 12,
    },
    saveBtn: { backgroundColor: C.accent },
    actionText: { color: C.text, fontSize: 15, fontFamily: F.bold },
    lockedTitle: { color: C.text, fontSize: 18, letterSpacing: -0.11, fontFamily: F.bold, marginTop: 2 },
    lockedText: { color: C.dim, fontSize: 13, lineHeight: 19, marginTop: 4, fontFamily: F.reg },
    lockedBtn: {
      alignSelf: 'flex-start',
      backgroundColor: C.accent,
      borderRadius: R.pill,
      paddingHorizontal: 18,
      paddingVertical: 9,
      marginTop: 12,
    },
    lockedBtnText: { color: C.onAccent, fontSize: 14, fontFamily: F.bold },
  });
