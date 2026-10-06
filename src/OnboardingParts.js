// Частини онбордингу, яких немає в редакторі профілю: вітання, Lingo на
// кроці імені, картка-приклад «Що таке слово дня», план зі словом на
// сьогодні й станом «складаємо…», години й телефон зі сповіщенням,
// обіцянка. Кроки й порядок — у OnboardingScreen.js.
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
import { Mascot, MascotBob, MascotLive } from './Mascot';
import { MiniKey, MiniMug, MiniPlant, TagLabel } from './DemoDesk';
import { IcBell, IcCards, IcChart, IcCheck, IcCompass, IcScan, IcSpeaker } from './icons';
import { FadeIn } from './ui';
import { fontSizeForWord, textEm } from './share/layout';
import { EASE, spring, stagger, useReducedMotion } from './motion';
import { CAPS, F, R, track, type, useTheme } from './theme';

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

// Година на екрані блокування — як її пише сам iPhone: «19:00» з 24-годинним
// телефоном, «7:00» з 12-годинним (екран блокування AM/PM не пише).
export function lockClock(hour) {
  const label = hourLabel(hour);
  const bare = label.replace(/\s*(?:[AaPp]\.?\s?[Mm]\.?)\s*$/u, '').replace(/^\s*(?:[AaPp]\.?\s?[Mm]\.?)\s*/u, '');
  return bare.trim() || label;
}

// Дата на екрані блокування: «Понеділок, 5 жовтня» мовою телефона
function lockDate(now = new Date()) {
  try {
    const d = now.toLocaleDateString(localeFor(phoneUiLang()), { weekday: 'long', day: 'numeric', month: 'long' });
    return d.charAt(0).toLocaleUpperCase() + d.slice(1);
  } catch (_) {
    return '';
  }
}

// ─── Телефон зі сповіщенням (онбординг 4.0) ────────────────────────────────
// Не обрізаний банер, а сам телефон: тонка рамка, заокруглені кути, Dynamic
// Island, на екрані блокування — дата й великий годинник на обрану годину,
// під ним сповіщення слова дня, як його покаже iOS: значок, «LinguaLens» і
// година, заголовок («Слово дня · Подорожі») і приклад слова з перекладом
// («mug — чашка»).
// Справжнього слова ще немає (план складемо після цього кроку), тож
// приклад — чашка з демо мовою навчання (demoExample).
//
// Телефон «визирає» знизу: height — скільки його видно; нижня частина
// ховається за краєм під мʼяким згасанням у колір тла. Годинник і
// сповіщення в межах видимого завжди цілі: менше, ніж до низу сповіщення
// (його міряємо — заголовок з темою буває у два рядки), не стискаємо; до
// виміру — phoneVisible(width). wallpaper={false} — лише сам банер.
export const PHONE_RATIO = 2.08;
export function phoneVisible(width) {
  return Math.round(width * 0.98);
}

function PushBanner({ title, body, hour, t, u = 1, style, onLayout }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <View style={[s.push, { borderRadius: 18 * u, padding: 10 * u, gap: 9 * u }, style]} onLayout={onLayout}>
      <AppIcon size={Math.round(30 * u)} />
      <View style={{ flex: 1 }}>
        <View style={s.pushHead}>
          <Text style={s.pushApp} numberOfLines={1}>
            LinguaLens
          </Text>
          <Text style={s.pushTime}>{hour}</Text>
        </View>
        <Text style={s.pushTitle} numberOfLines={2}>
          {title}
        </Text>
        <Text style={s.pushBody} numberOfLines={2}>
          {body}
        </Text>
      </View>
    </View>
  );
}

export function PushPreview({ topic, hour, clock, sample, t, width = 270, height = null, wallpaper = true }) {
  const { C, SHADOW, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const title = topic ? t('obPushPreviewTopic', { topic }) : t('obPushPreviewTitle');
  // Тіло — саме слово з перекладом: воно коротке й не обірветься навіть на
  // вузькому телефоні (власник: жодних обрізаних текстів). Пара — через
  // « · », як у справжньому сповіщенні слова дня (тире власник заборонив)
  const body = sample ? `${sample.word} · ${sample.translation}` : '';
  const a11y = t('obPushPreviewA11y', { title, h: hour });
  // низ сповіщення на екрані телефона (з рамкою) і ще трохи шпалер під ним
  // (під згасанням): до виміру — 0
  const [need, setNeed] = useState(0);
  if (!wallpaper) {
    return (
      <View accessible accessibilityLabel={a11y}>
        <PushBanner title={title} body={body} hour={hour} t={t} style={SHADOW} />
      </View>
    );
  }
  const u = width / 270;
  const bezel = Math.max(5, Math.round(7 * u));
  const full = Math.round(width * PHONE_RATIO);
  const shown = Math.min(full, Math.max(need || phoneVisible(width), height || full));
  const R_OUT = Math.round(46 * u);
  const R_IN = R_OUT - bezel;
  const ink = '#FFFFFF';
  return (
    <View
      style={{ height: shown, overflow: 'hidden', alignItems: 'center', marginTop: 18 }}
      accessible
      accessibilityLabel={a11y}
      testID="push-phone"
    >
      <View
        style={[
          {
            width,
            height: full,
            borderRadius: R_OUT,
            padding: bezel,
            backgroundColor: '#000000',
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.1)',
          },
          SHADOW,
        ]}
      >
        <View style={{ flex: 1, borderRadius: R_IN, overflow: 'hidden' }} testID="push-wallpaper">
          <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
            <Defs>
              <LinearGradient id="obWall" x1="0" y1="0" x2="0.6" y2="1">
                <Stop offset="0" stopColor={C.accent} stopOpacity={isDark ? 0.62 : 0.95} />
                <Stop offset="1" stopColor={C.green} stopOpacity={isDark ? 0.42 : 0.8} />
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="100%" height="100%" fill={isDark ? '#000000' : C.accent} />
            <Rect x="0" y="0" width="100%" height="100%" fill="url(#obWall)" />
          </Svg>
          {/* Dynamic Island */}
          <View style={{ alignSelf: 'center', marginTop: 9 * u, width: 86 * u, height: 25 * u, borderRadius: 13 * u, backgroundColor: '#000000' }} />
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ alignItems: 'center' }}>
            <Text style={[s.lockDate, { color: ink, fontSize: 14 * u, lineHeight: 18 * u, marginTop: 12 * u }]} numberOfLines={1}>
              {lockDate()}
            </Text>
            <Text
              style={[s.lockClock, { color: ink, fontSize: 66 * u, lineHeight: 74 * u }]}
              numberOfLines={1}
              testID="push-clock"
            >
              {clock || hour}
            </Text>
          </View>
          <PushBanner
            title={title}
            body={body}
            hour={hour}
            t={t}
            u={u}
            style={{ marginHorizontal: 10 * u, marginTop: 14 * u }}
            onLayout={(e) => {
              const { y, height: h } = e.nativeEvent.layout;
              const n = Math.ceil(bezel + y + h + FADE_H + 6);
              setNeed((v) => (Math.abs(v - n) > 1 ? n : v));
            }}
          />
        </View>
      </View>
      {shown < full ? <PhoneFade color={C.bg} /> : null}
    </View>
  );
}

// Згасання знизу: телефон іде за край, а не обрізаний рівною лінією. Лягає
// лише на шпалери під сповіщенням (див. need у PushPreview).
const FADE_H = 34;
function PhoneFade({ color }) {
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: FADE_H }}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height={FADE_H}>
        <Defs>
          <LinearGradient id="phoneFade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0} />
            <Stop offset="1" stopColor={color} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height={FADE_H} fill="url(#phoneFade)" />
      </Svg>
    </View>
  );
}

// ─── Що таке слово дня (онбординг 4.0) ─────────────────────────────────────
// Картка-приклад слова дня мовою, яку людина вчить: слово й вимова, переклад
// її мовою, приклад і його переклад. Справжнього слова ще немає (план
// складемо далі), тож це чашка з демо (demoExample) — без мережі. Тап по
// динаміку — вимова, як на справжній картці. Зʼявляється мʼякою пружиною.
export function WodExample({ sample, t, delay = 220 }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const reduced = useReducedMotion();
  const a = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduced) {
      Animated.timing(a, { toValue: 1, duration: 200, delay, easing: EASE.soft, useNativeDriver: true }).start();
      return;
    }
    Animated.spring(a, { toValue: 1, delay, ...spring(0.42, 0.78) }).start();
  }, []);
  const style = {
    opacity: a.interpolate({ inputRange: [0, 0.6, 1.2], outputRange: [0, 1, 1] }),
    transform: reduced
      ? []
      : [
          { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) },
          { scale: a.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }) },
        ],
  };
  const sub = [sample.ipa, sample.translation].filter(Boolean).join(' · ');
  return (
    <Animated.View style={[s.wodCard, SHADOW, style]} testID="wod-example">
      <View style={s.capsRow}>
        <Text style={[s.caps, { color: C.accent, flex: 1 }]} numberOfLines={1}>
          {t('obPushPreviewTitle')}
        </Text>
        <View style={s.planLang}>
          <Text style={s.planFlag}>{flagFor(sample.lang)}</Text>
          <Text style={s.planLangName} numberOfLines={1}>
            {nameFor(sample.lang)}
          </Text>
        </View>
      </View>
      <View style={s.todayRow}>
        <Text style={s.wodWord} numberOfLines={2}>
          {sample.word}
        </Text>
        <Pressable
          onPress={() => speak(sample.word, sample.lang)}
          hitSlop={10}
          style={({ pressed }) => [s.todaySpeak, pressed && { opacity: 0.6 }]}
          accessibilityRole="button"
          accessibilityLabel={`${t('listen')}: ${sample.word}`}
        >
          <IcSpeaker size={20} color={C.accent} />
        </Pressable>
      </View>
      {sub ? <Text style={s.todaySub}>{sub}</Text> : null}
      {sample.example ? (
        <View style={s.wodExample}>
          <Text style={s.wodExText}>{sample.example}</Text>
          {sample.exampleTranslation ? <Text style={s.wodExTr}>{sample.exampleTranslation}</Text> : null}
        </View>
      ) : null}
    </Animated.View>
  );
}

// ─── Lingo на кроці імені ──────────────────────────────────────────────────
// Визирає з-за кнопки «Далі» й махає; поки поле порожнє — каже cheer (реакцію
// на щойно обрану мову, якщо є). Людина ввела імʼя — через NAME_PAUSE_MS
// після останньої літери (не на кожну літеру) радіє: поза celebrate,
// підскок і «Приємно познайомитися, Олено!». Стерла — знову махає.
// room — скільки вільного місця над кнопкою (StepFrame peek, null — ще не
// виміряно): тісно (SE з клавіатурою) — менший, зовсім тісно — ховається:
// поле й кнопка важливіші. Бульбашка так само: нижче, а то й зовсім без неї
// (bubbleLift).
export const NAME_PAUSE_MS = 400;
// Яка частина Lingo ховається за кнопкою (ноги) і відступ над кнопкою
const PEEK_HIDDEN = 0.2;
const FOOTER_GAP = 8;
const PEEK_MAX = 128;

export function nameLingoSize(room) {
  if (room == null) return 96;
  const size = Math.min(PEEK_MAX, Math.floor((room - 6 + FOOTER_GAP) / (1 - PEEK_HIDDEN)));
  return size >= 58 ? size : 0;
}

// Бульбашка стоїть поруч із Lingo, низом на рівні його грудей (BUBBLE_LIFT
// від розміру над кнопкою), — і тому вища за нього: на SE з клавіатурою
// Lingo ще влазить, а бульбашка на тій висоті налізла б на поле. Тоді вона
// сідає нижче, аж до кнопки (над нею лишається 6 pt, як і над Lingo); не
// влазить і там — null: ховаємо, поле й кнопка важливіші. h — виміряна
// висота бульбашки (0 — ще не виміряно: стоїть як задумано).
const BUBBLE_LIFT = 0.42;
export function bubbleLift(size, room, h) {
  const lift = size * BUBBLE_LIFT;
  if (room == null || !h) return lift;
  const fit = room - 6 - h;
  return fit < 0 ? null : Math.min(lift, fit);
}

export function NameLingo({ name, cheer = '', room, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [bubbleH, setBubbleH] = useState(0);
  const [greet, setGreet] = useState(name);
  useEffect(() => {
    if (!name) {
      setGreet('');
      return undefined;
    }
    const id = setTimeout(() => setGreet(name), NAME_PAUSE_MS);
    return () => clearTimeout(id);
  }, [name]);
  const size = nameLingoSize(room);
  if (!size) return null;
  const text = greet ? t('obNameNice', { name: greet }) : cheer;
  const lift = bubbleLift(size, room, bubbleH);
  const hidden = lift === null;
  return (
    <View style={s.peekRow} pointerEvents="none" testID="name-lingo">
      {text ? (
        <View
          style={{ flexShrink: 1, marginBottom: hidden ? 0 : lift, opacity: hidden ? 0 : 1 }}
          onLayout={(e) => {
            const h = Math.ceil(e.nativeEvent.layout.height);
            setBubbleH((v) => (Math.abs(v - h) > 1 ? h : v));
          }}
          accessibilityElementsHidden={hidden}
          importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
          testID="name-bubble"
        >
          <FadeIn key={text} dy={6} style={[s.peekBubble, SHADOW_SM]}>
            <Text style={s.peekText} numberOfLines={3} accessibilityLiveRegion="polite">
              {text}
            </Text>
            <View style={s.peekTail} />
          </FadeIn>
        </View>
      ) : null}
      <View style={{ marginBottom: -(size * PEEK_HIDDEN + FOOTER_GAP) }}>
        <MascotLive pose={greet ? 'celebrate' : 'wave'} size={size} enter="peek" waves={2} hop={greet} testID="name-lingo-mascot" />
      </View>
    </View>
  );
}

// ─── Вітання ───────────────────────────────────────────────────────────────
// Великий Lingo на мʼякому колі: зʼявляється підскоком, тричі махає лапкою
// (похитування навколо нижньої точки) і далі спокійно дихає. Довкола три
// предмети з табличками різними мовами ледь плавають (±6 pt, 3,2 с,
// розфазовано). «Менше руху» — усе стоїть.
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
      <MascotLive pose="wave" size={Math.round(size * 0.98)} enter="hop" waves={3} testID="welcome-lingo" />
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

// Розміри вітання від екрана (width — ширина, height — висота без вирізу
// й смужки): Lingo, «Привіт! Я Лінго.» і заголовок під ним. Привітання —
// найбільший текст екрана: 32 на високих iPhone, 28 на SE; заголовок — на
// щабель менший (24 / 22), тож видно, що головне. Кегль привітання ще й не
// ширший за рядок: довше «Hallo! Ich bin Lingo.» на вузькому телефоні
// зменшується (не менше 24), а не переноситься. Lingo більший, ніж був із
// підзаголовком: місце, що лишилось, — йому (з табличками — не ширше за
// екран). titleWidth — ширина заголовка з рівними рядками (balancedWidth).
// Великий системний шрифт (fontScale) збільшує і привітання, і заголовок
// не більш як на WELCOME_FONT_MAX: екран не прокручується, а привітання
// лишається більшим за заголовок. Рівні рядки рахуємо для того кегля,
// який людина справді побачить, інакше вже на «xLarge» вузька рамка
// скидала б останнє слово («мов», «languages») окремим третім рядком.
export const WELCOME_PAD = 24;
export const WELCOME_FONT_MAX = 1.3;
const HELLO_PAD = 20;
const TITLE_MAX = 360;

export function welcomeSizes({ width, height, fontScale = 1 }, { hello, title }) {
  const tall = height >= 740;
  const max = tall ? 32 : 28;
  const titleSize = tall ? 24 : 22;
  const k = Math.min(fontScale || 1, WELCOME_FONT_MAX);
  return {
    hero: Math.round(Math.max(170, Math.min(330, height * 0.38, width - 112))),
    hello: fontSizeForWord(hello, { max, min: 24, width: width - 2 * (WELCOME_PAD + HELLO_PAD), tracking: track(max) / max }),
    title: titleSize,
    titleWidth: balancedWidth(title, titleSize * k, Math.min(TITLE_MAX, width - 2 * WELCOME_PAD)),
  };
}

// Рядки заголовка за оцінкою ширини (textEm — трохи більша за справжню):
// слова по черзі, доки рядок не ширший за width.
export function wrapLines(text, size, width) {
  const em = (s) => textEm(s, track(size) / size) * size;
  const lines = [];
  for (const word of String(text || '').split(/\s+/).filter(Boolean)) {
    const last = lines[lines.length - 1];
    if (last && em(last + ' ' + word) <= width) lines[lines.length - 1] = last + ' ' + word;
    else lines.push(word);
  }
  return lines;
}

// Найвужча ширина, за якої рядків стільки ж, скільки й на всю ширину, —
// тоді вони рівні: «Я стану твоїм / провідником у світ мов», а не «Я стану
// твоїм провідником у / світ мов». Влазить в один рядок — уся ширина.
// 6 % запасу: кирилицю (м, т, г) textEm трохи недооцінює, і без нього
// «мов» падало б у третій рядок.
export function balancedWidth(text, size, width) {
  const n = wrapLines(text, size, width).length;
  if (n <= 1) return width;
  let lo = 0;
  let hi = width;
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (wrapLines(text, size, mid).length > n) lo = mid;
    else hi = mid;
  }
  return Math.min(width, Math.ceil(hi * 1.06));
}

// «Привіт! Я Лінго.» під великим Lingo: бульбашка з хвостиком угору, до
// нього, — це каже він. Для VoiceOver — заголовок, перший на екрані (сам
// Lingo — ілюстрація, його не читають). Кегль і так заголовковий, тож
// великий системний шрифт збільшує його не більш як на 30 %
// (WELCOME_FONT_MAX): тоді рядок переноситься, але екран не розлазиться.
export function HelloBubble({ text, size }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <FadeIn delay={160} style={[s.hello, SHADOW_SM]} testID="hello-bubble">
      <View style={s.helloTail} testID="hello-tail" />
      <Text style={[s.helloText, type(size, F.extra)]} maxFontSizeMultiplier={WELCOME_FONT_MAX} accessibilityRole="header">
        {text}
      </Text>
    </FadeIn>
  );
}

// Бульбашка Lingo над заголовком: «Англійська — чудовий вибір!».
// pose={null} — без мініатюри: Lingo вже стоїть поруч із заголовком
// (кроки-питання), другий був би зайвий.
export function LingoBubble({ text, pose = 'wave', style }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  return (
    <FadeIn delay={120} style={[s.bubble, SHADOW_SM, !pose && { paddingLeft: 14, paddingVertical: 8 }, style]} testID="lingo-bubble">
      {pose ? <Mascot pose={pose} size={30} /> : null}
      <Text style={s.bubbleText} numberOfLines={2}>
        {text}
      </Text>
    </FadeIn>
  );
}

// ─── Обіцянка: текст і перша ціль ──────────────────────────────────────────
// «Я, Марік, вчитиму англійську щодня — по слову за раз» і під ним «Перша
// ціль — 7 днів поспіль» із сімома крапками; перша світиться вогником, якщо
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
            <View key={i} testID={i === 0 && lit ? 'goal-lit' : undefined} style={[s.goalDot, i === 0 && lit && { backgroundColor: C.flame }]} />
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

    lockDate: { fontFamily: F.bold, textAlign: 'center' },
    lockClock: { fontFamily: F.extra, textAlign: 'center', letterSpacing: -1 },
    push: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
    },
    pushHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    pushApp: { flexShrink: 1, color: C.dim, ...type(13, F.bold, { noLead: true }) },
    pushTime: { color: C.dim, ...type(12, F.semi, { noLead: true }) },
    pushTitle: { color: C.text, ...type(14, F.extra), marginTop: 2 },
    pushBody: { color: C.text, ...type(14, F.reg) },

    wodCard: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      borderWidth: 2,
      borderColor: C.accentSoft,
      paddingHorizontal: 18,
      paddingTop: 14,
      paddingBottom: 16,
    },
    wodWord: { flexShrink: 1, color: C.text, ...type(30, F.extra) },
    wodExample: { marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep },
    wodExText: { color: C.text, ...type(15, F.semi) },
    wodExTr: { color: C.dim, ...type(14, F.reg), marginTop: 2 },

    peekRow: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 6, paddingLeft: 24, paddingRight: 34 },
    peekBubble: {
      flexShrink: 1,
      backgroundColor: C.card,
      borderRadius: R.md,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    peekText: { color: C.text, ...type(14, F.extra) },
    // хвостик бульбашки — до Lingo праворуч
    peekTail: {
      position: 'absolute',
      right: -5,
      bottom: 14,
      width: 12,
      height: 12,
      backgroundColor: C.card,
      transform: [{ rotate: '45deg' }],
      borderRadius: 2,
    },

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

    hello: {
      alignSelf: 'center',
      maxWidth: '100%',
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: HELLO_PAD,
      paddingTop: 12,
      paddingBottom: 13,
    },
    helloText: { color: C.text, textAlign: 'center' },
    // хвостик — угору, до Lingo
    helloTail: {
      position: 'absolute',
      top: -7,
      left: '50%',
      marginLeft: -9,
      width: 18,
      height: 18,
      borderRadius: 3,
      backgroundColor: C.card,
      transform: [{ rotate: '45deg' }],
    },

    pledge: { backgroundColor: C.card, borderRadius: R.lg, paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14 },
    pledgeText: { color: C.text, ...type(22, F.extra), textAlign: 'center' },
    goal: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 12, flexWrap: 'wrap' },
    goalText: { color: C.dim, ...type(13, F.bold, { noLead: true }) },
    goalDots: { flexDirection: 'row', gap: 4 },
    goalDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.card3 },
  });
