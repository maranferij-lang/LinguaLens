// Аркуш «Яку мову вчиш?» на кроці рівня в онбордингу.
//
// Мову за замовчуванням ми вгадуємо з телефону (англійська — тим, у кого
// телефон не англійською, решті — іспанська). Вгадали не те — людина
// міняє її просто тут, а не шукає потім у Параметрах, пообіцявши вчити
// «не ту» мову.
//
// Поточна мова — першою й з галочкою, далі решта в порядку LANGS. Мови,
// якою людина говорить (nativeLang, мова перекладів), тут немає: вчити її
// з перекладом на неї ж нема сенсу. Ендоніми з прапорцями, як у Параметрах.
// Вибір одразу закриває аркуш.
import { useMemo } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LANGS } from './speech';
import { IcCheck, IcClose } from './icons';
import { F, R, type, useTheme } from './theme';

// Порядок рядків: поточна згори, мова перекладів прихована.
export function langOptions(current, native) {
  const rest = LANGS.filter((l) => l.code !== current && l.code !== native);
  const top = LANGS.find((l) => l.code === current);
  return top ? [top, ...rest] : rest;
}

export default function LangSheet({ visible, current, native, onPick, onClose, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const list = langOptions(current, native);

  function pick(code) {
    Haptics.selectionAsync();
    onPick(code);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Тап повз аркуш — закрити. VoiceOver тло пропускає: для нього є
          хрестик і жест виходу. */}
      <Pressable style={s.backdrop} onPress={onClose} accessible={false} />
      <View style={s.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={s.handle} />
        <View style={s.head}>
          <View style={{ flex: 1 }}>
            <Text style={s.title} accessibilityRole="header">
              {t('obLangSheetTitle')}
            </Text>
            <Text style={s.text}>{t('learnLangHint')}</Text>
          </View>
          <Pressable style={s.close} onPress={onClose} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('close')}>
            <View style={s.closeDot}>
              <IcClose size={16} color={C.dim} />
            </View>
          </Pressable>
        </View>
        <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 8 }} accessibilityRole="radiogroup">
          {list.map((l) => {
            const on = l.code === current;
            return (
              <Pressable
                key={l.code}
                style={({ pressed }) => [s.row, on && s.rowOn, pressed && { backgroundColor: C.card2 }]}
                onPress={() => pick(l.code)}
                accessibilityRole="radio"
                accessibilityState={{ checked: on }}
                accessibilityLabel={l.name}
              >
                <Text style={s.flag}>{l.flag}</Text>
                <Text style={[s.name, on && { color: C.accent }]} numberOfLines={1}>
                  {l.name}
                </Text>
                {on ? <IcCheck size={18} color={C.accent} /> : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      maxHeight: '78%',
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      paddingTop: 10,
      paddingHorizontal: 16,
      // смужка домашнього індикатора
      paddingBottom: 30,
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.card3,
      alignSelf: 'center',
      marginBottom: 10,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, marginBottom: 8 },
    title: { color: C.text, ...type(22, F.extra) },
    text: { color: C.dim, ...type(14, F.reg), marginTop: 2 },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -6 },
    closeDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
    list: { flexGrow: 0 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 48,
      paddingHorizontal: 12,
      borderRadius: R.md,
    },
    rowOn: { backgroundColor: C.accentSoft },
    flag: { fontSize: 22 },
    name: { flex: 1, color: C.text, ...type(16, F.bold, { noLead: true }) },
  });
