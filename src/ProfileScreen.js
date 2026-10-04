// Профіль: аватар-Lingo, рівень, стрік, статистика, графік, досягнення.
import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { localDayKey } from './storage';
import { cleanName } from './profile';
import { flagFor, nameFor } from './speech';
import { evaluate, computeMetrics, levelFromWords, unlockedCount } from './achievements';
import { IcCheck, IcFlame, IcShare } from './icons';
import { Mascot, MascotBob } from './Mascot';
import { AchIcon } from './AchIcons';
import { Bar, FadeIn, Glass, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext } from './motion';
import { F, R, useTheme } from './theme';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const AVATARS = ['wave', 'celebrate', 'think', 'encourage'];

function computeStreak(activeDays) {
  let streak = 0;
  const d = new Date();
  if (!activeDays.has(localDayKey(d))) d.setDate(d.getDate() - 1);
  while (activeDays.has(localDayKey(d))) {
    streak++;
    d.setDate(d.getDate() - 1);
  }
  return streak;
}

export default function ProfileScreen({ words, activity, stats, profile, onUpdateProfile, onShareWeek, onShareAchievement, t }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [tab, setTab] = useState('stats'); // stats | achievements
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.name || '');

  const activeDays = new Set([
    ...Object.keys(activity),
    ...words.map((w) => localDayKey(new Date(w.addedAt || 0))),
  ]);
  activeDays.delete(localDayKey(new Date(0)));

  const streak = computeStreak(activeDays);
  const weekWords = words.filter((w) => Date.now() - (w.addedAt || 0) < WEEK).length;
  const reviews = words.reduce((sum, w) => sum + (w.srs?.reps || 0), 0);

  const metrics = computeMetrics({ words, activity, stats, streak });
  const achievements = evaluate(metrics);
  const unlocked = unlockedCount(achievements);
  const lvl = levelFromWords(words.length);

  // графік 7 днів
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    days.push({ key, dow: d.getDay(), value: activity[key] || 0 });
  }
  const maxVal = Math.max(1, ...days.map((d) => d.value));
  const DAY_LETTERS = (t('dowLetters') || 'SMTWTFS').split(''); // неділя → субота

  const byLang = {};
  for (const w of words) {
    const l = w.lang || 'en';
    byLang[l] = (byLang[l] || 0) + 1;
  }
  const langRows = Object.entries(byLang).sort((a, b) => b[1] - a[1]);

  function switchTab(next) {
    if (next === tab) return;
    Haptics.selectionAsync();
    layoutNext();
    setTab(next);
  }

  function pickAvatar(pose) {
    Haptics.selectionAsync();
    onUpdateProfile({ avatar: pose });
  }

  // Профіль живе на телефоні (у v1 немає акаунтів) — редагувати можна завжди.
  function openEditor() {
    setDraftName(profile.name || '');
    setEditing(true);
  }

  function saveName() {
    setEditing(false);
    const n = cleanName(draftName);
    if (n !== (profile.name || '')) onUpdateProfile({ name: n });
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: UNDER_TAB + 24 }}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
    >
      {/* Шапка профілю */}
      <FadeIn>
        <View style={[s.hero, SHADOW]}>
          <Pressable onPress={openEditor} style={s.avatarWrap}>
            <MascotBob pose={profile.avatar || 'wave'} size={92} />
          </Pressable>
          <Pressable onPress={openEditor}>
            <Text style={s.name}>{profile.name || t('profileNoName')}</Text>
          </Pressable>
          <Text style={s.email}>{t('profileHint')}</Text>

          <View style={s.levelRow}>
            <Text style={s.levelText}>{t('level', { n: lvl.level })}</Text>
            <Text style={s.levelNext}>
              {lvl.current}/{lvl.nextNeed}
            </Text>
          </View>
          <Bar progress={lvl.progress} color={C.accent} bg={C.card2} />
        </View>
      </FadeIn>

      {/* Перемикач Статистика / Досягнення */}
      <FadeIn delay={40}>
        <View style={s.segment}>
          {[
            { k: 'stats', label: t('tabStats') },
            { k: 'achievements', label: `${t('achievements')} ${unlocked}/${achievements.length}` },
          ].map((x) => {
            const active = tab === x.k;
            return (
              <Pressable
                key={x.k}
                style={[s.segmentBtn, active && s.segmentBtnActive]}
                onPress={() => switchTab(x.k)}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{x.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </FadeIn>

      {tab === 'stats' ? (
        <>
          <FadeIn delay={80}>
            <Glass style={s.streakCard}>
              <View style={[s.flameWrap, streak ? { backgroundColor: C.accentSoft } : null]}>
                <IcFlame size={28} color={streak ? C.accent : C.faint} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.streakNum}>{t('streakN', { n: streak })}</Text>
                <Text style={s.streakHint}>{streak ? t('streakGo') : t('streakStart')}</Text>
              </View>
            </Glass>
          </FadeIn>

          <FadeIn delay={120} style={s.rowCards}>
            <Glass style={s.miniCard}>
              <Text style={s.miniNum}>{words.length}</Text>
              <Text style={s.miniLabel}>{t('wordsTotal')}</Text>
            </Glass>
            <Glass style={s.miniCard}>
              <Text style={s.miniNum}>{weekWords}</Text>
              <Text style={s.miniLabel}>{t('wordsWeek')}</Text>
            </Glass>
            <Glass style={s.miniCard}>
              <Text style={s.miniNum}>{reviews}</Text>
              <Text style={s.miniLabel}>{t('reviewsN')}</Text>
            </Glass>
          </FadeIn>

          <Text style={s.sectionLabel}>{t('activity7')}</Text>
          <FadeIn delay={160}>
            <Glass>
              <View style={s.chart}>
                {days.map((d) => (
                  <View key={d.key} style={s.barCol}>
                    <Text style={s.barVal}>{d.value || ''}</Text>
                    <View
                      style={[
                        s.bar,
                        d.value
                          ? { height: 10 + (d.value / maxVal) * 78, backgroundColor: C.accent }
                          : { height: 10, backgroundColor: C.card2 },
                      ]}
                    />
                    <Text style={s.barLabel}>{DAY_LETTERS[d.dow]}</Text>
                  </View>
                ))}
              </View>
              {/* Підсумок тижня як картка для сторіс — головний привід
                  поділитись, коли тиждень вдався. */}
              {onShareWeek && words.length ? (
                <Press style={s.shareWeek} onPress={onShareWeek}>
                  <IcShare size={17} color={C.accent} />
                  <Text style={s.shareWeekText}>{t('shareWeek')}</Text>
                </Press>
              ) : null}
            </Glass>
          </FadeIn>

          {langRows.length ? (
            <>
              <Text style={s.sectionLabel}>{t('byLangs')}</Text>
              <FadeIn delay={200}>
                <Glass style={{ paddingVertical: 4, paddingHorizontal: 0 }}>
                  {langRows.map(([code, count], i) => (
                    <View key={code}>
                      {i > 0 ? <View style={s.sepLine} /> : null}
                      <View style={s.langRow}>
                        <Text style={{ fontSize: 17 }}>{flagFor(code)}</Text>
                        <Text style={s.langName}>{nameFor(code)}</Text>
                        <Text style={s.langCount}>{count}</Text>
                      </View>
                    </View>
                  ))}
                </Glass>
              </FadeIn>
            </>
          ) : null}
        </>
      ) : (
        <FadeIn delay={80}>
          <View style={s.achGrid}>
            {achievements.map((a) => (
              <Pressable
                key={a.id}
                disabled={!a.unlocked || !onShareAchievement}
                onPress={() => onShareAchievement(a)}
                style={[s.achCard, a.unlocked ? s.achUnlocked : s.achLocked]}
              >
                <View style={!a.unlocked && { opacity: 0.32 }}>
                  <AchIcon id={a.id} size={34} color={a.unlocked ? C.accent : C.faint} />
                </View>
                <Text style={[s.achTitle, !a.unlocked && { color: C.dim }]} numberOfLines={2}>
                  {t('ach_' + a.id)}
                </Text>
                {a.unlocked ? (
                  <View style={s.achDone}>
                    <IcCheck size={13} color={C.green} />
                    <Text style={s.achDoneText}>{t('unlocked')}</Text>
                  </View>
                ) : (
                  <>
                    <Bar progress={a.progress} color={C.accent} bg={C.card2} height={5} />
                    <Text style={s.achProgress}>
                      {Math.min(a.value, a.goal)}/{a.goal}
                    </Text>
                  </>
                )}
              </Pressable>
            ))}
          </View>
        </FadeIn>
      )}

      {/* Редагування профілю */}
      <Modal visible={editing} transparent animationType="fade" onRequestClose={() => setEditing(false)}>
        <Pressable style={s.backdrop} onPress={saveName} />
        <View style={s.sheetWrap}>
          <View style={[s.sheet, SHADOW]}>
            <Text style={s.sheetTitle}>{t('editProfile')}</Text>

            <Text style={s.label}>{t('yourName')}</Text>
            <TextInput
              style={s.input}
              value={draftName}
              onChangeText={setDraftName}
              placeholder={t('namePlaceholder')}
              placeholderTextColor={C.faint}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={saveName}
            />

            <Text style={s.label}>{t('chooseAvatar')}</Text>
            <View style={s.avatarRow}>
              {AVATARS.map((p) => {
                const active = (profile.avatar || 'wave') === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => pickAvatar(p)}
                    style={[s.avatarOption, active && s.avatarActive]}
                  >
                    <Mascot pose={p} size={54} />
                  </Pressable>
                );
              })}
            </View>

            <GradBtn title={t('save')} onPress={saveName} style={{ marginTop: 16 }} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    shareWeek: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 14,
      paddingVertical: 11,
      borderRadius: R.md,
      backgroundColor: C.accentSoft,
    },
    shareWeekText: { color: C.accent, fontSize: 15, fontFamily: F.bold },
    root: { flex: 1, backgroundColor: C.bg, padding: 20 },
    hero: {
      backgroundColor: C.card,
      borderRadius: R.xl,
      padding: 20,
      alignItems: 'center',
      marginBottom: 14,
    },
    avatarWrap: { marginBottom: 2 },
    name: { color: C.text, fontSize: 22, letterSpacing: -0.31, fontFamily: F.extra, textAlign: 'center' },
    email: { color: C.dim, fontSize: 13, fontFamily: F.reg, marginTop: 2, marginBottom: 16 },
    levelRow: { flexDirection: 'row', justifyContent: 'space-between', alignSelf: 'stretch', marginBottom: 6 },
    levelText: { color: C.text, fontSize: 14, fontFamily: F.bold },
    levelNext: { color: C.dim, fontSize: 13, fontFamily: F.semi },

    segment: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: R.md, padding: 3, marginBottom: 14 },
    segmentBtn: { flex: 1, paddingVertical: 9, borderRadius: R.md - 3, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: C.card },
    segmentText: { color: C.dim, fontSize: 14, fontFamily: F.semi },
    segmentTextActive: { color: C.text, fontFamily: F.extra },

    streakCard: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 },
    flameWrap: {
      width: 50,
      height: 50,
      borderRadius: 14,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    streakNum: { color: C.text, fontSize: 19, letterSpacing: -0.11, fontFamily: F.bold },
    streakHint: { color: C.dim, fontSize: 13, marginTop: 2, fontFamily: F.reg },
    rowCards: { flexDirection: 'row', gap: 10 },
    miniCard: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: R.lg },
    miniNum: { color: C.text, fontSize: 24, fontFamily: F.extra },
    miniLabel: { color: C.dim, fontSize: 11, marginTop: 3, fontFamily: F.reg },
    sectionLabel: {
      color: C.faint,
      fontSize: 12,
      fontFamily: F.extra,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 18,
      marginLeft: 4,
    },
    chart: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
    barCol: { alignItems: 'center', flex: 1, gap: 4 },
    bar: { width: 16, borderRadius: 5 },
    barVal: { color: C.dim, fontSize: 10, letterSpacing: 0.2, height: 14, fontFamily: F.semi },
    barLabel: { color: C.faint, fontSize: 11, fontFamily: F.semi },
    sepLine: { height: StyleSheet.hairlineWidth, backgroundColor: C.sep, marginLeft: 48 },
    langRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
    langName: { color: C.text, fontSize: 16, flex: 1, fontFamily: F.semi },
    langCount: { color: C.dim, fontSize: 16, fontFamily: F.bold },

    achGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
    achCard: {
      width: '48%',
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
      minHeight: 132,
      justifyContent: 'space-between',
    },
    achUnlocked: {},
    achLocked: { opacity: 0.9 },
    achIcon: { fontSize: 30 },
    achTitle: { color: C.text, fontSize: 13, fontFamily: F.bold, marginTop: 8, marginBottom: 8, lineHeight: 17 },
    achDone: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    achDoneText: { color: C.green, fontSize: 12, fontFamily: F.bold },
    achProgress: { color: C.faint, fontSize: 11, fontFamily: F.semi, marginTop: 5 },

    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)' },
    sheetWrap: { position: 'absolute', bottom: 0, left: 0, right: 0 },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      padding: 22,
      paddingBottom: 38,
    },
    sheetTitle: { color: C.text, fontSize: 20, fontFamily: F.extra, marginBottom: 10 },
    label: {
      color: C.faint,
      fontSize: 11,
      fontFamily: F.extra,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginTop: 12,
      marginBottom: 6,
    },
    input: {
      backgroundColor: C.input,
      borderRadius: R.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: C.text,
      fontSize: 16, letterSpacing: -0.1,
      fontFamily: F.semi,
    },
    avatarRow: { flexDirection: 'row', gap: 10 },
    avatarOption: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: R.md,
      backgroundColor: C.card2,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    avatarActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  });
