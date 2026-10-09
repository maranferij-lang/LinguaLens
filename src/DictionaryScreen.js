import { useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { flagFor, speak } from './speech';
import { IcSearch, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { Sticker } from './Sticker';
import { FadeIn, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext } from './motion';
import { F, R, type, useTheme } from './theme';

export default function DictionaryScreen({ words, onDelete, onScan, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C, SHADOW_SM), [C]);

  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [langFilter, setLangFilter] = useState(null);

  const langsPresent = [...new Set(words.map((w) => w.lang || 'en'))];

  const q = query.trim().toLowerCase();
  const filtered = words
    .filter((w) => !langFilter || (w.lang || 'en') === langFilter)
    .filter(
      (w) =>
        !q ||
        w.word.toLowerCase().includes(q) ||
        (w.translation || '').toLowerCase().includes(q)
    )
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

  function toggle(id) {
    layoutNext();
    setOpenId(openId === id ? null : id);
  }

  function confirmDelete(item) {
    Alert.alert(t('delWordTitle'), t('delWordMsg', { w: item.word }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('delete'), style: 'destructive', onPress: () => onDelete(item.id) },
    ]);
  }

  if (!words.length) {
    return (
      <View style={s.empty}>
        <FadeIn style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <MascotBob pose="think" size={190} />
          <Text style={s.emptyTitle}>{t('dictEmptyTitle')}</Text>
          <Text style={s.emptyText}>{t('dictEmptyText')}</Text>
          {/* An empty state with no way out is a dead end. We give an action right here. */}
          {onScan ? (
            <GradBtn
              title={t('scanFirstWord')}
              onPress={onScan}
              style={{ alignSelf: 'stretch', marginTop: 22 }}
            />
          ) : null}
        </FadeIn>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <Text style={s.title}>{t('dictTitle')}</Text>
      <Text style={s.subtitle}>{t('dictSub', { n: words.length })}</Text>
      <View style={s.searchWrap}>
        <IcSearch size={19} color={C.faint} />
        <TextInput
          style={s.search}
          placeholder={t('search')}
          placeholderTextColor={C.faint}
          value={query}
          onChangeText={setQuery}
        />
      </View>
      {langsPresent.length > 1 ? (
        <View style={s.filterRow}>
          <Pressable
            style={[s.filterChip, !langFilter && s.filterChipActive]}
            onPress={() => setLangFilter(null)}
          >
            <Text style={[s.filterText, !langFilter && { color: C.text }]}>{t('all')}</Text>
          </Pressable>
          {langsPresent.map((l) => (
            <Pressable
              key={l}
              style={[s.filterChip, langFilter === l && s.filterChipActive]}
              onPress={() => setLangFilter(langFilter === l ? null : l)}
            >
              <Text style={s.filterText}>{flagFor(l)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: UNDER_TAB + 8 }}
        renderItem={({ item }) => {
          const open = openId === item.id;
          return (
            <Pressable style={s.card} onPress={() => toggle(item.id)}>
              <View style={s.rowTop}>
                <Sticker uri={item.photo} outline={item.outline} box={item.box} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={s.word}>
                    {item.word} <Text style={{ fontSize: 13 }}>{flagFor(item.lang || 'en')}</Text>
                  </Text>
                  <Text style={s.translation}>{item.translation}</Text>
                </View>
                <Press style={s.speakBtn} onPress={() => speak(item.word, item.lang)}>
                  <IcSpeaker size={18} color={C.accent} />
                </Press>
              </View>
              {open ? (
                <View style={s.details}>
                  {item.ipa ? <Text style={s.ipa}>{item.ipa}</Text> : null}
                  {item.example ? (
                    <Pressable
                      onPress={() => speak(item.example, item.lang)}
                      style={{ paddingRight: 24 }}
                    >
                      <View style={s.exampleSpeaker}>
                        <IcSpeaker size={14} color={C.dim} />
                      </View>
                      <Text style={s.example}>“{item.example}”</Text>
                      <Text style={s.exampleTr}>{item.exampleTranslation}</Text>
                    </Pressable>
                  ) : null}
                  <Pressable style={s.deleteBtn} onPress={() => confirmDelete(item)}>
                    <Text style={s.deleteText}>{t('delete')}</Text>
                  </Pressable>
                </View>
              ) : null}
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const makeStyles = (C, SHADOW_SM) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20, paddingBottom: 0 },
    title: { color: C.text, fontSize: 34, letterSpacing: -0.75, fontFamily: F.bold },
    subtitle: { color: C.dim, fontSize: 13, marginTop: 3, marginBottom: 14 },
    // Search field: a sunken surface instead of a border, since a border on chalk
    // adds a line that is not needed there.
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.input,
      borderRadius: R.md,
      paddingHorizontal: 15,
      marginBottom: 12,
    },
    search: {
      flex: 1,
      paddingVertical: 13,
      color: C.text,
      ...type(16, F.reg, { noLead: true }),
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: R.pill,
      backgroundColor: C.card,
    },
    filterChipActive: { backgroundColor: C.accentSoft },
    filterText: { color: C.dim, fontSize: 13, fontFamily: F.semi },
    // A dictionary row is a floating card, not a row with a divider:
    // on a chalk background a divider line adds dirt, a shadow does not.
    card: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
      marginBottom: 9,
      ...SHADOW_SM,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    word: { color: C.text, fontSize: 17, letterSpacing: -0.1, fontFamily: F.semi },
    translation: { color: C.dim, fontSize: 14, marginTop: 2 },
    speakBtn: {
      backgroundColor: C.card2,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    details: {
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.sep,
      paddingTop: 12,
      gap: 8,
    },
    ipa: { color: C.dim, fontSize: 15 },
    example: { color: C.text, fontSize: 14, lineHeight: 20 },
    exampleTr: { color: C.dim, fontSize: 13, marginTop: 4, lineHeight: 18 },
    exampleSpeaker: { position: 'absolute', top: 2, right: 0 },
    deleteBtn: { alignSelf: 'flex-start', marginTop: 4 },
    deleteText: { color: C.red, fontSize: 14, fontFamily: F.semi },
    empty: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
    emptyImg: { width: 160, height: 160, borderRadius: R.lg, marginBottom: 6, opacity: 0.9 },
    emptyTitle: { color: C.text, fontSize: 20, letterSpacing: -0.12, fontFamily: F.bold, marginTop: 12 },
    emptyText: { color: C.dim, fontSize: 14, textAlign: 'center', marginTop: 8, lineHeight: 21 },
  });
