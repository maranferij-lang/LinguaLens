// Частини онбордингу, яких немає в редакторі профілю: вітання, план зі
// словом на сьогодні й станом «складаємо…», години й попередній перегляд
// сповіщення, обіцянка. Кроки й порядок — у OnboardingScreen.js.
//
// Правило для всього тут: лише правда. Ні вигаданих цифр («97 % вивчили
// мову»), ні відгуків, ні оцінок — план показує те, що сервер справді
// робитиме з цими відповідями, а кожна обіцянка спирається на функцію,
// яка в застосунку вже є.
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { cefrFor, cleanProfile, levelName, planTopics, topicCycle } from './profile';
import { flagFor, nameFor, speak } from './speech';
import { localeFor, phoneUiLang } from './locale';
import { AppIcon } from './Logo';
import { Mascot, MascotBob } from './Mascot';
import { MiniKey, MiniMug, MiniPlant, TagLabel } from './DemoDesk';
import { IcBell, IcCards, IcChart, IcCheck, IcCompass, IcScan, IcSpeaker } from './icons';
import { FadeIn } from './ui';
import { EASE, stagger, useReducedMotion } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// Якщо людина нічого не обрала на кроці «що заважає» (чи у варіанті без
// нього) — три головні речі, заради яких застосунок існує.
const DEFAULT_LINES = ['boring', 'forget', 'time'];
const LINE_ICONS = { forget: IcCards, time: IcBell, boring: IcScan, start: IcCompass };

// Насиченість теми в смужці днів: головна — повним акцентом, далі блідіше.
// Один акцент на весь інтерфейс (див. theme.js) — тож відтінки, а не кольори.
const SHADES = [1, 0.5, 0.28, 0.16];
const shade = (rank) => SHADES[Math.min(rank, SHADES.length - 1)];

// ─── План ──────────────────────────────────────────────────────────────────
// «Слово дня для тебе»: головна тема й рівень CEFR, справжній цикл тем на
// найближчі дні (для роботи у фінансах — 4 дні з 7 фінанси, 2 — робота,
// 1 — загальне) і що це означає для рівня. Під ним — по рядку на кожну
// названу труднощ і функцію, що на неї відповідає. lang — мова, яку
// вчать: прапорець і ендонім у шапці картки (її могли щойно змінити).
//
// Одна тема (усе пропущено чи «для себе») — без легенди: «Загальне ·
// щодня» лише повторило б заголовок, тож замість неї один рядок.
export function PlanBody({ profile, struggles, lang, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const p = cleanProfile(profile);
  const cycle = topicCycle(p);
  const topics = planTopics(p);
  const rank = Object.fromEntries(topics.map((x, i) => [x.topic, i]));
  const single = topics.length === 1;
  const lines = struggles && struggles.length ? struggles : DEFAULT_LINES;
  let i = 0;

  return (
    <View style={{ gap: 12 }}>
      <FadeIn delay={stagger(i++)} style={[s.card, SHADOW_SM]}>
        <View style={s.capsRow}>
          <Text style={[s.caps, { flex: 1 }]}>{t('obPlanWod')}</Text>
          {lang ? (
            <View style={s.planLang}>
              <Text style={s.planFlag}>{flagFor(lang)}</Text>
              <Text style={s.planLangName} numberOfLines={1}>
                {nameFor(lang)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={s.headRow}>
          <Text style={s.headTopic} numberOfLines={2}>
            {t('topic_' + topics[0].topic)}
          </Text>
          {p ? (
            <View style={s.cefr}>
              <Text style={s.cefrText}>{cefrFor(p.level)}</Text>
            </View>
          ) : null}
        </View>

        {/* Наступні дні по темах — той самий порядок, що видасть сервер.
            Для VoiceOver смужка нічого не додає до рядків під нею. */}
        {single ? null : (
          <View style={s.strip} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {cycle.map((k, d) => (
              <View key={d} style={[s.cell, { opacity: shade(rank[k]) }]} />
            ))}
          </View>
        )}

        {single ? (
          <Text style={s.singleSub}>{t('obPlanSingleSub')}</Text>
        ) : (
          <View style={{ marginTop: 12, gap: 8 }}>
            {topics.map((x, r) => {
              const name = t('topic_' + x.topic);
              const days = r === 0 ? t('obPlanDaysOf', { n: x.days, m: cycle.length }) : t('obPlanDays', { n: x.days });
              return (
                <View key={x.topic} style={s.legendRow} accessible accessibilityLabel={`${name}, ${days}`}>
                  <View style={[s.dot, { opacity: shade(r) }]} />
                  <Text style={s.legendName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={s.legendDays}>{days}</Text>
                </View>
              );
            })}
          </View>
        )}
      </FadeIn>

      {/* «Рівень: B1 · Середній» — без обіцянок, які саме слова зникнуть */}
      {p ? (
        <FadeIn delay={stagger(i++)} style={[s.card, s.levelCard, SHADOW_SM]}>
          <View style={s.lineIcon}>
            <IcChart size={20} color={C.accent} />
          </View>
          <Text style={s.levelText}>{t('obPlanLevel', { cefr: cefrFor(p.level), name: levelName(p.level, t) })}</Text>
        </FadeIn>
      ) : null}

      <FadeIn delay={stagger(i++)}>
        <Text style={[s.caps, { marginTop: 8, marginLeft: 4 }]}>{t('obPlanHelp')}</Text>
      </FadeIn>
      {lines.map((k) => {
        const Icon = LINE_ICONS[k];
        return (
          <FadeIn key={k} delay={stagger(i++)} style={s.line}>
            <View style={s.lineIcon}>
              <Icon size={20} color={C.accent} />
            </View>
            <Text style={s.lineText}>{t('plan_' + k)}</Text>
          </FadeIn>
        );
      })}
    </View>
  );
}

// ─── Слово на сьогодні (план) ──────────────────────────────────────────────
// Справжнє слово дня під щойно складений профіль: те саме, що чекатиме на
// вкладці «Навчання» й у сповіщенні. Тап по динаміку — вимова.
export function TodayCard({ word, topic, lang, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  if (!word?.word) return null;
  const caps = topic ? `${t('obPlanToday')} · ${topic}` : t('obPlanToday');
  const sub = [word.ipa, word.translation].filter(Boolean).join(' · ');
  return (
    <FadeIn style={[s.today, SHADOW_SM]} testID="plan-today">
      <Text style={[s.caps, { color: C.accent }]} numberOfLines={1}>
        {caps}
      </Text>
      <View style={s.todayRow}>
        <Text style={s.todayWord} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7}>
          {word.word}
        </Text>
        <Pressable
          onPress={() => speak(word.word, lang)}
          hitSlop={10}
          style={({ pressed }) => [s.todaySpeak, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('listen')}: ${word.word}`}
        >
          <IcSpeaker size={20} color={C.accent} />
        </Pressable>
      </View>
      {sub ? <Text style={s.todaySub}>{sub}</Text> : null}
    </FadeIn>
  );
}

// ─── «Складаємо твій план…» ────────────────────────────────────────────────
// Lingo думає, а рядки — це відповіді людини, по черзі, з галочками.
// Останній — «Підбираємо слово дня…» — чекає на справжній запит слова дня
// під щойно складений профіль: крутилка, а коли прийшло — галочка.
// rows — [{ key, flag?, text, done }].
export const BUILD_STAGGER = 220;

export function PlanBuilding({ title, rows }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.build} testID="plan-building">
      <MascotBob pose="think" size={150} />
      <Text style={s.buildTitle} accessibilityRole="header" accessibilityLiveRegion="polite">
        {title}
      </Text>
      <View style={{ alignSelf: 'stretch', gap: 10, marginTop: 22 }}>
        {rows.map((r, i) => (
          <FadeIn key={r.key} delay={i * BUILD_STAGGER} style={[s.buildRow, SHADOW_SM]}>
            <View style={[s.buildMark, r.done && { backgroundColor: C.green }]}>
              {r.done ? <IcCheck size={14} color={C.onAccent} /> : <ActivityIndicator size="small" color={C.accent} />}
            </View>
            {r.flag ? <Text style={s.buildFlag}>{r.flag}</Text> : null}
            <Text style={s.buildText} numberOfLines={2}>
              {r.text}
            </Text>
          </FadeIn>
        ))}
      </View>
    </View>
  );
}

// ─── Як виглядатиме сповіщення ─────────────────────────────────────────────
// Година слова дня так, як її покаже сам iPhone: «10:00» українською,
// «10:00 AM» з англійським телефоном. Формат — за мовою телефону (тією ж,
// що й інтерфейс), а не «моєю мовою» з налаштувань.
export function hourLabel(hour) {
  try {
    return new Date(2000, 0, 1, hour).toLocaleTimeString(localeFor(phoneUiLang()), { hour: 'numeric', minute: '2-digit' });
  } catch (_) {
    return String(hour).padStart(2, '0') + ':00';
  }
}

// Години на вибір: зранку, удень, увечері
export const PUSH_HOURS = [
  { hour: 10, key: 'obPushMorning' },
  { hour: 14, key: 'obPushDay' },
  { hour: 19, key: 'obPushEvening' },
];

export function HourChips({ value, onChange, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.hours} accessibilityRole="radiogroup">
      {PUSH_HOURS.map(({ hour, key }) => {
        const on = value === hour;
        const time = hourLabel(hour);
        return (
          <Pressable
            key={hour}
            onPress={() => onChange(hour)}
            style={({ pressed }) => [s.hourChip, on && s.hourOn, pressed && !on && { backgroundColor: C.card2 }]}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${t(key)}, ${time}`}
            testID={'push-hour-' + hour}
          >
            <Text style={[s.hourPart, on && { color: C.accent }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {t(key)}
            </Text>
            <Text style={[s.hourTime, on && { color: C.accent }]} numberOfLines={1}>
              {time}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Схоже на банер iOS на екрані блокування: «шпалери» з великим часом, на
// них — значок, назва застосунку, година і текст. Заголовок — як у
// справжньому сповіщенні слова дня («Слово дня · Фінанси»), тіло — без
// вигаданого слова: його ще ніхто не обрав. Тіло — у два рядки навіть на
// SE: банер, що обривається трикрапкою, виглядає зламаним. wallpaper={false}
// — лише сам банер.
export function PushPreview({ topic, hour, t, wallpaper = true }) {
  const { C, SHADOW, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const title = topic ? t('obPushPreviewTopic', { topic }) : t('obPushPreviewTitle');
  const banner = (
    <View style={[s.push, !wallpaper && SHADOW]} accessible accessibilityLabel={t('obPushPreviewA11y', { title, h: hour })}>
      <AppIcon size={38} />
      <View style={{ flex: 1 }}>
        <View style={s.pushHead}>
          <Text style={s.pushApp}>LinguaLens</Text>
          <Text style={s.pushTime}>{hour}</Text>
        </View>
        <Text style={s.pushTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={s.pushBody} numberOfLines={2}>
          {t('obPushPreviewBody')}
        </Text>
      </View>
    </View>
  );
  if (!wallpaper) return banner;
  return (
    <View style={[s.wall, SHADOW]} testID="push-wallpaper">
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <LinearGradient id="obWall" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={C.accent} stopOpacity={isDark ? 0.55 : 0.62} />
            <Stop offset="1" stopColor={C.warm} stopOpacity={isDark ? 0.4 : 0.5} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill={C.card} />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#obWall)" />
      </Svg>
      <Text style={[s.wallTime, { color: isDark ? C.text : C.onAccent }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {hour}
      </Text>
      {banner}
    </View>
  );
}

// ─── Вітання ───────────────────────────────────────────────────────────────
// Lingo махає на мʼякому колі, довкола три предмети з табличками різними
// мовами ледь плавають (±6 pt, 3,2 с, розфазовано). «Менше руху» — стоять.
const FLOATERS = [
  { key: 'mug', code: 'en', word: 'mug', at: { left: '4%', top: '8%' }, tilt: -8, phase: 0 },
  { key: 'plant', code: 'es', word: 'planta', at: { right: '2%', top: '2%' }, tilt: 7, phase: 1 },
  { key: 'key', code: 'de', word: 'Schlüssel', at: { right: '0%', bottom: '10%' }, tilt: -6, phase: 2 },
];

function Floater({ f, reduced, children }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) return undefined;
    const half = { duration: 1600, easing: EASE.inOut, useNativeDriver: true };
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(f.phase * 520),
        Animated.timing(v, { toValue: 1, ...half }),
        Animated.timing(v, { toValue: 0, ...half }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [reduced]);
  return (
    <Animated.View
      style={[
        { position: 'absolute', alignItems: 'center' },
        f.at,
        { transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [6, -6] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

export function WelcomeHero({ size = 230 }) {
  const { C } = useTheme();
  const reduced = useReducedMotion();
  const box = size + 96;
  return (
    <View
      style={{ width: box, height: box * 0.86, alignItems: 'center', justifyContent: 'center' }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="welcome-hero"
    >
      <View style={{ position: 'absolute', width: size * 0.92, height: size * 0.92, borderRadius: size, backgroundColor: C.accentSoft }} />
      <MascotBob pose="wave" size={size * 0.86} />
      {FLOATERS.map((f) => (
        <Floater key={f.key} f={f} reduced={reduced}>
          {f.key === 'mug' ? <MiniMug size={54} sticker={false} /> : f.key === 'plant' ? <MiniPlant size={46} /> : <MiniKey size={52} />}
          <View style={{ marginTop: f.key === 'key' ? 2 : -4 }}>
            <TagLabel code={f.code} word={f.word} tilt={f.tilt} />
          </View>
        </Floater>
      ))}
    </View>
  );
}

// Бульбашка Lingo над заголовком: «Привіт! Я Lingo.», «Англійська —
// чудовий вибір!».
export function LingoBubble({ text, pose = 'wave', style }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <FadeIn delay={120} style={[s.bubble, SHADOW_SM, style]} testID="lingo-bubble">
      <Mascot pose={pose} size={30} />
      <Text style={s.bubbleText} numberOfLines={2}>
        {text}
      </Text>
    </FadeIn>
  );
}

// ─── Обіцянка: текст і перша ціль ──────────────────────────────────────────
// «Я, Марік, вчитиму англійську щодня — по слову за раз» і під ним «Перша
// ціль — 7 днів поспіль» із сімома крапками; перша світиться бурштином, якщо
// слово вже збережено (lit) — день перший зараховано.
export function PledgeCard({ text, lit, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.pledge, SHADOW_SM]} testID="pledge">
      <Text style={s.pledgeText}>{text}</Text>
      <View style={s.goal} accessible accessibilityLabel={t('obCommitGoal')}>
        <Text style={s.goalText}>{t('obCommitGoal')}</Text>
        <View style={s.goalDots}>
          {Array.from({ length: 7 }, (_, i) => (
            <View key={i} testID={i === 0 && lit ? 'goal-lit' : undefined} style={[s.goalDot, i === 0 && lit && { backgroundColor: C.warm }]} />
          ))}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: R.lg, padding: 18 },
    caps: { color: C.faint, ...CAPS },
    capsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    planLang: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    planFlag: { fontSize: 14 },
    planLangName: { color: C.dim, ...type(13, F.bold, { noLead: true }), flexShrink: 1 },
    headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
    singleSub: { color: C.dim, ...type(15, F.semi), marginTop: 6 },
    headTopic: { flexShrink: 1, color: C.text, ...type(24, F.extra) },
    cefr: { backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 10, paddingVertical: 4 },
    cefrText: { color: C.onAccent, ...type(14, F.extra, { noLead: true }) },
    strip: { flexDirection: 'row', gap: 4, marginTop: 14 },
    cell: { flex: 1, height: 10, borderRadius: 4, backgroundColor: C.accent },
    legendRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    dot: { width: 10, height: 10, borderRadius: 3, backgroundColor: C.accent },
    legendName: { flex: 1, color: C.text, ...type(15, F.semi) },
    legendDays: { color: C.dim, ...type(14, F.semi) },

    levelCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    levelText: { flex: 1, color: C.text, ...type(15, F.semi) },

    line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
    lineIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    lineText: { flex: 1, color: C.text, ...type(15, F.semi) },

    today: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      borderWidth: 2,
      borderColor: C.accentSoft,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 16,
      marginBottom: 12,
    },
    todayRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
    todayWord: { flexShrink: 1, color: C.text, ...type(28, F.extra) },
    todaySpeak: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.accentSoft, alignItems: 'center', justifyContent: 'center' },
    todaySub: { color: C.dim, ...type(14, F.semi), marginTop: 2 },

    build: { alignItems: 'center', paddingTop: 12 },
    buildTitle: { color: C.text, ...type(24, F.extra), textAlign: 'center', marginTop: 10 },
    buildRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.card,
      borderRadius: R.md,
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    buildMark: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: C.card2 },
    buildFlag: { fontSize: 16 },
    buildText: { flex: 1, color: C.text, ...type(15, F.bold) },

    hours: { flexDirection: 'row', gap: 8 },
    hourChip: {
      flex: 1,
      minHeight: 58,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.card,
      borderRadius: R.md,
      borderWidth: 2,
      borderColor: 'transparent',
      paddingHorizontal: 6,
      paddingVertical: 8,
    },
    hourOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
    hourPart: { color: C.dim, ...type(13, F.bold, { noLead: true }) },
    hourTime: { color: C.text, ...type(17, F.extra, { noLead: true }), marginTop: 3 },

    wall: { borderRadius: R.xl, overflow: 'hidden', paddingHorizontal: 12, paddingTop: 16, paddingBottom: 14, marginTop: 18 },
    wallTime: { ...type(46, F.extra, { noLead: true }), textAlign: 'center', marginBottom: 14 },
    push: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
    },
    pushHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pushApp: { color: C.faint, ...CAPS },
    pushTime: { color: C.faint, ...type(13, F.semi, { noLead: true }) },
    pushTitle: { color: C.text, ...type(16, F.extra), marginTop: 2 },
    pushBody: { color: C.dim, ...type(14, F.reg) },

    bubble: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 8,
      backgroundColor: C.card,
      borderRadius: R.pill,
      paddingLeft: 8,
      paddingRight: 14,
      paddingVertical: 5,
      marginBottom: 14,
      maxWidth: '100%',
    },
    bubbleText: { flexShrink: 1, color: C.text, ...type(14, F.extra) },

    pledge: { backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
    pledgeText: { color: C.text, ...type(22, F.extra), textAlign: 'center' },
    goal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    goalText: { color: C.dim, ...type(13, F.bold, { noLead: true }) },
    goalDots: { flexDirection: 'row', gap: 4 },
    goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.card3 },
  });
