// Частини онбордингу, яких немає в редакторі профілю: персональний план,
// «перший скан» і попередній перегляд сповіщення. Кроки й порядок —
// у OnboardingScreen.js.
//
// Правило для всього тут: лише правда. Ні вигаданих цифр («97 % вивчили
// мову»), ні відгуків, ні оцінок — план показує те, що сервер справді
// робитиме з цими відповідями, а кожна обіцянка спирається на функцію,
// яка в застосунку вже є.
import { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { cefrFor, cleanProfile, levelBand, planTopics, topicCycle } from './profile';
import { flagFor, nameFor } from './speech';
import { localeFor, phoneUiLang } from './locale';
import { LogoMark } from './Logo';
import { Mascot } from './Mascot';
import { IcBell, IcCards, IcChart, IcCheck, IcCompass, IcScan } from './icons';
import { FadeIn } from './ui';
import { stagger } from './motion';
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

      {/* «B2+ — пропускаємо базові слова»: що рівень міняє на ділі */}
      {p ? (
        <FadeIn delay={stagger(i++)} style={[s.card, s.levelCard, SHADOW_SM]}>
          <View style={s.lineIcon}>
            <IcChart size={20} color={C.accent} />
          </View>
          <Text style={s.levelText}>{`${cefrFor(p.level)} — ${t('levelBand' + levelBand(p.level))}`}</Text>
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

// Ілюстрація з Lingo й чашкою для світлої і темної теми: світла — на
// майже білому тлі, темна — та сама сцена на кольорі картки темної теми,
// щоб на першому ж екрані не світився білий квадрат.
export const HERO = {
  light: require('../assets/onb-1.png'),
  dark: require('../assets/onb-1-dark.png'),
};

// ─── «Спробуй зараз» ───────────────────────────────────────────────────────
// Lingo у кутах видошукача — тих самих, що на екрані сканера: людина
// впізнає їх, коли відкриється камера.
export function WowHero() {
  const { C, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={s.wow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Image source={isDark ? HERO.dark : HERO.light} style={s.wowImg} />
      <View style={[s.corner, s.tl]} />
      <View style={[s.corner, s.tr]} />
      <View style={[s.corner, s.bl]} />
      <View style={[s.corner, s.br]} />
    </View>
  );
}

// Після першого збереженого слова — коротке «є!» над наступним кроком.
// Зелений — колір успіху (theme.js), саме тут він і доречний.
export function FirstWord({ word, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const pair = word?.translation ? `${word.word} — ${word.translation}` : word?.word || '';
  return (
    <FadeIn style={s.first} dy={8}>
      <View style={s.firstIcon}>
        <IcCheck size={18} color={C.onAccent} />
      </View>
      <View style={{ flex: 1 }} accessible accessibilityLiveRegion="polite" accessibilityLabel={`${t('obWowDone')}: ${pair}`}>
        <Text style={s.firstTitle}>{t('obWowDone')}</Text>
        {pair ? (
          <Text style={s.firstWord} numberOfLines={1}>
            {pair}
          </Text>
        ) : null}
      </View>
      <Mascot pose="celebrate" size={44} />
    </FadeIn>
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

// Схоже на банер iOS: значок, назва застосунку, година і текст. Заголовок —
// як у справжньому сповіщенні слова дня («Слово дня · Фінанси»), тіло —
// без вигаданого слова: його ще ніхто не обрав. Тіло — у два рядки навіть
// на SE: банер, що обривається трикрапкою, виглядає зламаним.
export function PushPreview({ topic, hour, t }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const title = topic ? t('obPushPreviewTopic', { topic }) : t('obPushPreviewTitle');
  return (
    <View style={[s.push, SHADOW]} accessible accessibilityLabel={t('obPushPreviewA11y', { title, h: hour })}>
      <View style={s.pushIcon}>
        <LogoMark size={26} color={C.onAccent} fg={C.accent} />
      </View>
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
}

const WOW = 220;

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

    wow: { width: WOW, height: WOW, alignSelf: 'center', marginTop: 8, padding: 14 },
    wowImg: { width: WOW - 28, height: WOW - 28, borderRadius: 24 },
    corner: { position: 'absolute', width: 34, height: 34, borderColor: C.accent },
    tl: { top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 12 },
    tr: { top: 0, right: 0, borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 12 },
    bl: { bottom: 0, left: 0, borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 12 },
    br: { bottom: 0, right: 0, borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 12 },

    first: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.greenSoft,
      borderRadius: R.lg,
      paddingVertical: 10,
      paddingLeft: 14,
      paddingRight: 8,
      marginBottom: 18,
    },
    firstIcon: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.green, alignItems: 'center', justifyContent: 'center' },
    firstTitle: { color: C.text, ...type(15, F.extra) },
    firstWord: { color: C.dim, ...type(14, F.semi) },

    push: {
      flexDirection: 'row',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
    },
    pushIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    pushHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pushApp: { color: C.faint, ...CAPS },
    pushTime: { color: C.faint, ...type(13, F.semi, { noLead: true }) },
    pushTitle: { color: C.text, ...type(16, F.extra), marginTop: 2 },
    pushBody: { color: C.dim, ...type(14, F.reg) },
  });
