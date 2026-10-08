// Профіль: аватар-Lingo, колекція слів, стрік, статистика, графік, досягнення.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Path } from 'react-native-svg';
import { localDayKey } from './storage';
import { activeDaySet, bestStreak, streakInfo } from './streak';
import StreakCard from './streak/StreakCard';
import { NAME_MAX, cleanName } from './profile';
import { flagFor, nameFor } from './speech';
import { weekdayLabels } from './share/layout';
import { evaluate, computeMetrics, levelFromWords, unlockedCount } from './achievements';
import { IcCheck, IcShare } from './icons';
import { Mascot, MascotBob } from './Mascot';
import { AchIcon } from './AchIcons';
import { Bar, FadeIn, Glass, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { DUR, EASE, layoutNext, useReducedMotionCached } from './motion';
import { F, R, useTheme } from './theme';

const WEEK = 7 * 24 * 60 * 60 * 1000;
const AVATARS = ['wave', 'celebrate', 'think', 'encourage'];

// Олівець на значку аватара: видно, що профіль можна змінити. Штрих — як
// у наборі src/icons.js.
function Pencil({ size = 12, color }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M15.5 4.5 19.5 8.5 8.5 19.5H4.5V15.5zM13 7l4 4"
        fill="none"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// Графік 7 днів. Стовпчики ростуть знизу з невеликим стагером (по ~40 мс),
// коли вкладка «Прогрес» з'являється; висота в розкладці одразу остаточна,
// тож нічого не зсувається, а росте лише transform. Під «Зменшити рух» лишається
// непрозорість: ні масштабу, ні зсуву.
const BARS_DELAY = 200;
const BARS_DUR = 520;
const BAR_SPAN = DUR.sheet / BARS_DUR;

function ActivityBars({ days, maxVal, labels, s, C }) {
  const reduced = useReducedMotionCached();
  const grow = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const anim = Animated.timing(grow, {
      toValue: 1,
      duration: BARS_DUR,
      delay: BARS_DELAY,
      easing: EASE.out,
      useNativeDriver: true,
    });
    anim.start();
    return () => anim.stop();
  }, []);
  // стовпчик i рухається у своєму вікні [від, до] спільного значення
  const step = (1 - BAR_SPAN) / Math.max(1, days.length - 1);
  const win = (i) => [i * step, i * step + BAR_SPAN];
  return (
    <View style={s.chart}>
      {days.map((d, i) => {
        const opacity = grow.interpolate({ inputRange: win(i), outputRange: [0, 1], extrapolate: 'clamp' });
        const scaleY = reduced ? 1 : grow.interpolate({ inputRange: win(i), outputRange: [0.4, 1], extrapolate: 'clamp' });
        return (
          <View key={d.key} style={s.barCol}>
            <Animated.Text style={[s.barVal, { opacity }]}>{d.value || ''}</Animated.Text>
            <Animated.View
              style={[
                s.bar,
                d.value ? { height: 10 + (d.value / maxVal) * 78, backgroundColor: C.accent } : { height: 10, backgroundColor: C.card2 },
                { opacity, transform: [{ scaleY }], transformOrigin: 'bottom' },
              ]}
            />
            <Text style={s.barLabel} numberOfLines={1}>
              {labels[d.dow]}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// Аркуш «Редагувати профіль». Ім'я тут у власному стані: кожен символ
// перемальовує лише аркуш, а не весь екран профілю під ним. Аркуш стоїть над
// клавіатурою (рідний Modal сам її не обходить), а тап повз нього, «Готово» на
// клавіатурі, «Зберегти» і жест виходу VoiceOver однаково зберігають ім'я.
function EditSheet({ visible, profile, onSave, onPickAvatar, t, s, C, SHADOW }) {
  const [draft, setDraft] = useState(profile.name || '');
  const current = profile.avatar || 'wave';
  const save = () => onSave(cleanName(draft));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={save}>
      {/* Тап повз аркуш зберігає. VoiceOver тло пропускає: для нього є кнопка
          «Зберегти» й жест виходу. */}
      <Pressable style={s.backdrop} onPress={save} accessible={false} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav} pointerEvents="box-none">
        <View style={[s.sheet, SHADOW]} accessibilityViewIsModal onAccessibilityEscape={save}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            bounces={false}
            showsVerticalScrollIndicator={false}
            style={s.sheetScroll}
            contentContainerStyle={s.sheetBody}
          >
            <Text style={s.sheetTitle} accessibilityRole="header">
              {t('editProfile')}
            </Text>

            <Text style={s.label}>{t('yourName')}</Text>
            <TextInput
              style={s.input}
              value={draft}
              onChangeText={setDraft}
              placeholder={t('namePlaceholder')}
              placeholderTextColor={C.dim}
              accessibilityLabel={t('yourName')}
              maxLength={NAME_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              textContentType="givenName"
              selectionColor={C.accent}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={save}
            />

            <Text style={s.label}>{t('chooseAvatar')}</Text>
            <View style={s.avatarRow} accessibilityRole="radiogroup" accessibilityLabel={t('chooseAvatar')}>
              {AVATARS.map((p, i) => {
                const active = current === p;
                return (
                  <Press
                    key={p}
                    onPress={() => onPickAvatar(p)}
                    style={[s.avatarOption, active && s.avatarActive]}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: active, selected: active }}
                    accessibilityLabel={t('avatarOption', { n: i + 1, total: AVATARS.length })}
                  >
                    <Mascot pose={p} size={54} />
                  </Press>
                );
              })}
            </View>

            <GradBtn title={t('save')} onPress={save} style={{ marginTop: 16 }} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// best — рекорд серії, який памʼятає App (settings.streakSeen.best);
// focusStreak — щойно відкрили з чипа серії на «Навчанні»: «Прогрес» і
// прокрутка до картки серії (onFocusDone — App скидає прохання).
export default function ProfileScreen({
  words,
  activity,
  stats,
  profile,
  onUpdateProfile,
  onShareWeek,
  onShareAchievement,
  best = 0,
  focusStreak = false,
  onFocusDone,
  t,
}) {
  const { C, T, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [tab, setTab] = useState('stats'); // stats | achievements
  const [editing, setEditing] = useState(false);
  // новий аркуш при кожному відкритті: поле починається з поточного імені
  const [editKey, setEditKey] = useState(0);

  // Серія — з src/streak.js, та сама, що в App і віджеті
  const activeDays = useMemo(() => activeDaySet(activity, words), [activity, words]);
  const streak = streakInfo({ activeDays }).n;
  const record = Math.max(best || 0, bestStreak(activeDays));

  // Із чипа серії: вкладка «Прогрес» і картка серії на виду. Крутимо лише
  // настільки, щоб картка вийшла з-під таб-бару (на SE), — якщо її й так
  // видно всю (Pro Max), екран не стрибає і заголовок лишається на місці.
  const scroll = useRef(null);
  const view = useRef({ h: 0, y: null, ch: 0 });
  const [focus, setFocus] = useState(focusStreak);
  useEffect(() => {
    if (!focusStreak) return;
    setFocus(true);
    if (tab !== 'stats') setTab('stats');
    onFocusDone?.();
  }, [focusStreak]);
  function tryFocus() {
    const v = view.current;
    if (!focus || !scroll.current || !v.h || v.y === null) return;
    setFocus(false);
    const need = v.y + v.ch + UNDER_TAB + 12 - v.h;
    if (need > 0) scroll.current.scrollTo?.({ y: Math.min(need, Math.max(0, v.y - 12)), animated: true });
  }
  function onCardLayout(e) {
    view.current.y = e.nativeEvent.layout.y;
    view.current.ch = e.nativeEvent.layout.height;
    tryFocus();
  }
  const weekWords = useMemo(() => words.filter((w) => Date.now() - (w.addedAt || 0) < WEEK).length, [words]);
  const reviews = useMemo(() => words.reduce((sum, w) => sum + (w.srs?.reps || 0), 0), [words]);

  // Метрики й досягнення рахуються по всьому словнику: не на кожен рендер
  const achievements = useMemo(() => evaluate(computeMetrics({ words, activity, stats, streak })), [words, activity, stats, streak]);
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
  // «Нд Пн Вт…», а не «НПВСЧПС»: однією літерою понеділок і пʼятниця
  // однакові. Від неділі, як Date#getDay.
  const DAY_LABELS = weekdayLabels(t('dowShort'));

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
    // той самий Lingo: нічого не міняється, тож і вібрації нема
    if (pose === (profile.avatar || 'wave')) return;
    Haptics.selectionAsync();
    onUpdateProfile({ avatar: pose });
  }

  // Профіль живе на телефоні (у v1 немає акаунтів) — редагувати можна завжди.
  function openEditor() {
    setEditKey((k) => k + 1);
    setEditing(true);
  }

  function saveName(n) {
    setEditing(false);
    if (n !== (profile.name || '')) onUpdateProfile({ name: n });
  }

  return (
    <ScrollView
      ref={scroll}
      onLayout={(e) => {
        view.current.h = e.nativeEvent.layout.height;
        tryFocus();
      }}
      style={s.root}
      contentContainerStyle={{ paddingBottom: UNDER_TAB + 24 }}
      showsVerticalScrollIndicator={false}
      contentInsetAdjustmentBehavior="never"
    >
      {/* Заголовок — як на інших вкладках */}
      <Text style={[T.largeTitle, s.title]} accessibilityRole="header">
        {t('tabProfile')}
      </Text>

      {/* Шапка профілю */}
      <FadeIn>
        <View style={[s.hero, SHADOW]}>
          {/* Олівець на аватарі каже, що його можна змінити; підказка
              словами — лише поки імені ще немає */}
          <Pressable
            onPress={openEditor}
            style={s.avatarWrap}
            accessibilityRole="button"
            accessibilityLabel={t('editProfile')}
          >
            <MascotBob pose={profile.avatar || 'wave'} size={92} />
            <View style={s.editBadge}>
              <Pencil size={13} color={C.onAccent} />
            </View>
          </Pressable>
          {/* Дублює кнопку-аватар, тож для VoiceOver це просто текст з іменем */}
          <Pressable onPress={openEditor} accessible={false}>
            <Text style={s.name}>{profile.name || t('profileNoName')}</Text>
          </Pressable>
          {profile.name ? null : <Text style={s.email}>{t('profileHint')}</Text>}

          {/* Колекція слів, а не «рівень»: рівнем у застосунку зветься лише
              рівень мови (B2 у налаштуваннях) */}
          <View style={[s.levelRow, profile.name && { marginTop: 14 }]}>
            <Text style={s.levelText}>{t('collStage', { n: lvl.level })}</Text>
            <Text style={s.levelNext}>{t('collWords', { c: lvl.current, n: lvl.nextNeed })}</Text>
          </View>
          <Bar progress={lvl.progress} color={C.accent} bg={C.card2} accessibilityLabel={t('collStage', { n: lvl.level })} />
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
              <Press
                key={x.k}
                style={[s.segmentBtn, active && s.segmentBtnActive]}
                onPress={() => switchTab(x.k)}
                feedback="dim"
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[s.segmentText, active && s.segmentTextActive]}>{x.label}</Text>
              </Press>
            );
          })}
        </View>
      </FadeIn>

      {tab === 'stats' ? (
        <>
          {/* Серія 2.0: вогник росте день у день, тиждень крапками, віха */}
          <View onLayout={onCardLayout}>
            <FadeIn delay={80}>
              <StreakCard activeDays={activeDays} best={record} t={t} />
            </FadeIn>
          </View>

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
              <ActivityBars days={days} maxVal={maxVal} labels={DAY_LABELS} s={s} C={C} />
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
                accessibilityRole={a.unlocked && onShareAchievement ? 'button' : undefined}
                accessibilityHint={a.unlocked && onShareAchievement ? t('share') : undefined}
              >
                {/* Відкрите досягнення можна показати друзям — і це видно */}
                {a.unlocked && onShareAchievement ? (
                  <View style={s.achShare} pointerEvents="none">
                    <IcShare size={15} color={C.accent} />
                  </View>
                ) : null}
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
                    <Bar progress={a.progress} color={C.accent} bg={C.card2} height={5} decorative />
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
      <EditSheet
        key={editKey}
        visible={editing}
        profile={profile}
        onSave={saveName}
        onPickAvatar={pickAvatar}
        t={t}
        s={s}
        C={C}
        SHADOW={SHADOW}
      />
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
    title: { marginBottom: 14 },
    hero: {
      backgroundColor: C.card,
      borderRadius: R.xl,
      padding: 20,
      alignItems: 'center',
      marginBottom: 14,
    },
    avatarWrap: { marginBottom: 2 },
    // значок-олівець у куті аватара
    editBadge: {
      position: 'absolute',
      right: 2,
      bottom: 6,
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: C.accent,
      borderWidth: 2,
      borderColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
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

    rowCards: { flexDirection: 'row', gap: 10 },
    miniCard: { flex: 1, paddingVertical: 14, alignItems: 'center', borderRadius: R.lg },
    miniNum: { color: C.text, fontSize: 24, fontFamily: F.extra },
    miniLabel: { color: C.dim, fontSize: 11, marginTop: 3, fontFamily: F.reg },
    sectionLabel: {
      color: C.dim,
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
    barLabel: { color: C.dim, fontSize: 11, fontFamily: F.semi },
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
    achDoneText: { color: C.greenInk, fontSize: 12, fontFamily: F.bold },
    achProgress: { color: C.dim, fontSize: 11, fontFamily: F.semi, marginTop: 5 },
    achShare: {
      position: 'absolute',
      top: 10,
      right: 10,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },

    // Тло — на весь екран, аркуш — окремо над клавіатурою (KeyboardAvoidingView
    // пропускає дотики повз себе до тла: pointerEvents box-none)
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: C.scrim },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      maxHeight: '92%',
    },
    sheetScroll: { flexGrow: 0 },
    // клавіатура майже завжди відкрита, тож знизу лише невеликий відступ (як у LangSheet)
    sheetBody: { padding: 22, paddingBottom: 30 },
    sheetTitle: { color: C.text, fontSize: 20, fontFamily: F.extra, marginBottom: 10 },
    label: {
      color: C.dim,
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
