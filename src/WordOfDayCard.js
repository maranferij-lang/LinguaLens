// Картка «Слово дня» — озвучується, зберігається у словник. Дії («Слухати»,
// «Знаю», «Зберегти») видно завжди: для безкоштовного рівня слово дня —
// головна щоденна цінність, і ховати «Зберегти» за дотиком не можна. Дотик
// розгортає лише приклад.
//
// Тема в рядку-кепсі («СЛОВО ДНЯ · ФІНАНСИ») каже, що слово підібране під
// людину; загальні слова теми не мають. «Знаю» прибирає слово й одразу
// просить у сервера інше; після кількох «Знаю» поспіль картка сама
// пропонує підняти рівень — лише пропонує, рішення за людиною.
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { speak } from './speech';
import { IcCheck, IcChevron, IcSpeaker } from './icons';
import { Mascot } from './Mascot';
import { FadeIn, Press } from './ui';
import { layoutNext } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// topic — назва теми ('' — загальні слова); onKnow — «Знаю» (App шукає нове
// слово); knowing — нове слово ще в дорозі; knowNote — пояснення, якщо нове
// не прийшло (офлайн); levelUp — до якого рівня запропонувати піднятись
// (null — не пропонуємо), onLevelUp / onKeepLevel — відповіді на пропозицію.
export default function WordOfDayCard({
  word,
  lang,
  saved,
  onSave,
  t,
  topic = '',
  onKnow,
  knowing = false,
  knowNote = '',
  levelUp = null,
  onLevelUp,
  onKeepLevel,
}) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [open, setOpen] = useState(false);

  // Слова ще немає: перший запуск офлайн або сервер не відповів. Порожня
  // картка-заглушка лише заважала б — з'явиться, щойно прийде слово.
  if (!word) return null;

  // Розгортати є що, лише коли є приклад
  const canOpen = !!word.example;

  function toggle() {
    if (!canOpen) return;
    Haptics.selectionAsync();
    layoutNext();
    setOpen(!open);
  }

  function know() {
    if (knowing) return;
    Haptics.selectionAsync();
    onKnow();
  }

  // Сам рядок — звичайними словами («Слово дня»), бейдж показує його капсом.
  // VoiceOver отримує підпис словами: капс він читав би по літерах.
  const title = t('wordOfDay');
  const caps = topic ? `${title.toLocaleUpperCase()} · ${topic}` : title.toLocaleUpperCase();
  const capsLabel = topic ? `${title}, ${topic}` : title;

  return (
    <FadeIn>
      {/* Уся картка — ціль для пальця, але не для VoiceOver: інакше «Слухати»
          й «Зберегти» злились би з нею в один елемент. Розгортає рядок зі словом. */}
      <Press onPress={toggle} style={{ marginBottom: 12 }} accessible={false}>
        <View style={[s.card, SHADOW]}>
          <View style={s.head}>
            <View style={s.badge}>
              <Text style={s.badgeText} numberOfLines={1} accessibilityLabel={capsLabel}>
                {caps}
              </Text>
            </View>
            <View style={{ flex: 1 }} />
            {canOpen ? (
              <View style={open ? { transform: [{ rotate: '180deg' }] } : null}>
                <IcChevron color={C.faint} size={18} />
              </View>
            ) : null}
          </View>

          {/* key — нове слово після «Знаю» мʼяко проявляється, а не підміняється */}
          <FadeIn key={word.date + word.word} dy={6}>
            <View
              style={s.row}
              accessible
              accessibilityRole={canOpen ? 'button' : undefined}
              accessibilityState={canOpen ? { expanded: open } : undefined}
              accessibilityActions={canOpen ? [{ name: 'activate' }] : undefined}
              onAccessibilityAction={canOpen ? toggle : undefined}
            >
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
              </View>
            ) : null}
          </FadeIn>

          {/* Три дії в ряд і завжди на виду: «Слухати» — іконкою, щоб «Знаю»
              й «Зберегти» мали місце для слів навіть німецькою. */}
          <View style={s.actions}>
            <Press style={s.listenBtn} onPress={() => speak(word.word, lang)} accessibilityLabel={t('listen')}>
              <IcSpeaker size={19} color={C.accent} />
            </Press>

            {onKnow ? (
              <Press
                style={s.actionBtn}
                onPress={know}
                accessibilityLabel={t('wodKnowA11y')}
                accessibilityState={{ busy: knowing }}
              >
                {knowing ? (
                  <ActivityIndicator size="small" color={C.dim} />
                ) : (
                  <Text style={s.actionText} numberOfLines={1}>
                    {t('wodKnow')}
                  </Text>
                )}
              </Press>
            ) : null}

            {saved ? (
              <View style={[s.actionBtn, { backgroundColor: C.greenSoft }]}>
                <IcCheck size={15} color={C.green} />
                <Text style={[s.actionText, { color: C.green }]} numberOfLines={1}>
                  {t('saved')}
                </Text>
              </View>
            ) : (
              <Press style={[s.actionBtn, s.saveBtn]} onPress={onSave}>
                <Text style={[s.actionText, { color: C.onAccent }]} numberOfLines={1}>
                  {t('saveWord')}
                </Text>
              </Press>
            )}
          </View>

          {/* Нове слово не прийшло (офлайн): кажемо, що «Знаю» запамʼятали */}
          {knowNote ? (
            <Text style={s.note} accessibilityLiveRegion="polite">
              {knowNote}
            </Text>
          ) : null}

          {levelUp ? (
            <FadeIn dy={6} style={s.offer}>
              <Text style={s.offerText}>{t('wodLevelUp', { n: levelUp })}</Text>
              <View style={s.offerBtns}>
                <Press style={[s.offerBtn, s.offerYes]} onPress={onLevelUp}>
                  <Text style={[s.offerBtnText, { color: C.onAccent }]} numberOfLines={1}>
                    {t('wodLevelUpYes', { n: levelUp })}
                  </Text>
                </Press>
                <Press style={s.offerBtn} onPress={onKeepLevel}>
                  <Text style={s.offerBtnText} numberOfLines={1}>
                    {t('wodLevelUpNo')}
                  </Text>
                </Press>
              </View>
            </FadeIn>
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
      flexShrink: 1,
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    // Кепс задає стиль: тема приходить звичайним словом («Фінанси»)
    badgeText: { color: C.accent, ...CAPS, letterSpacing: 0.5 },
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
    listenBtn: {
      width: 48,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.accentSoft,
      borderRadius: R.md,
    },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      backgroundColor: C.card2,
      borderRadius: R.md,
      paddingVertical: 12,
      paddingHorizontal: 8,
      minHeight: 46,
    },
    saveBtn: { backgroundColor: C.accent },
    actionText: { color: C.text, fontSize: 15, fontFamily: F.bold },
    note: { color: C.dim, ...type(13, F.semi), marginTop: 10, textAlign: 'center' },

    offer: { marginTop: 12, backgroundColor: C.accentSoft, borderRadius: R.md, padding: 14 },
    offerText: { color: C.text, ...type(15, F.semi) },
    offerBtns: { flexDirection: 'row', gap: 10, marginTop: 12 },
    offerBtn: {
      flex: 1,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: R.sm,
      backgroundColor: C.card,
      paddingHorizontal: 8,
    },
    offerYes: { backgroundColor: C.accent },
    offerBtnText: { color: C.text, ...type(14, F.bold, { noLead: true }) },
  });
