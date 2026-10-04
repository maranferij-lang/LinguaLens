// Пейвол.
//
// Правила, за якими він побудований:
//   • Заголовок говорить про людину, не про тариф. Причина відмови приходить
//     ззовні (безкоштовний скан витрачено / скан кімнати / мови), і текст під
//     неї підлаштовується — людина бачить відповідь саме на ту стіну, в яку
//     щойно вперлась. Словник безкоштовний без меж, тож стіни «словник» немає.
//   • Тарифи — ті, що прийшли з поточної пропозиції RevenueCat (зазвичай
//     місяць, рік і «назавжди»). Річний обраний за замовчуванням і має
//     пробний тиждень. Ніяких передвибраних дорогих варіантів — це нечесно
//     і повертається відписками.
//   • «Назавжди» — разова покупка: без «на місяць», без «−N%», і юридичний
//     рядок під кнопкою прямо каже, що це не підписка.
//   • Закрити можна завжди, хрестик великий і на своєму місці. Пейвол, з
//     якого важко вийти, псує оцінку в App Store сильніше, ніж дає виторгу.
//   • 'intro' — мʼякий пейвол один раз після першого скану: замість таблиці
//     таймлайн пробного періоду (сьогодні — доступ, день 5 — нагадування,
//     день 7 — списання) і окрема кнопка «Продовжити безкоштовно». Так
//     людина знає, що й коли станеться, ще до натиску (App Review 3.1.2).
//     Без пробного періоду таймлайну немає і «безкоштовно» не обіцяємо.
//     Безкоштовний скан один на все життя, і його вже витрачено (перший
//     скан в онбордингу чи щойно зроблений) — кнопка не обіцяє ще одного ні
//     сьогодні, ні завтра, а каже, що лишається: словник і картки.
//   • Наприкінці онбордингу перед цим екраном ще два (OnboardingPaywall.js):
//     пробний період і таймлайн. Таймлайн і план за замовчуванням — звідси.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PRO_BENEFITS, COMPARISON, FREE, TRIAL_REMIND_DAYS } from './subscription';
import { PRIVACY_URL, TERMS_URL } from './config';
import { purchaseNote, restoreNote } from './purchases';
import { formatDate } from './locale';
import { ProIcon, PCrown } from './ProIcons';
import { IcCheck, IcClose } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { CAPS, F, R, type, useTheme } from './theme';

// freeScans — скільки сканів безкоштовно за все життя, стеля з сервера (див.
// freeScans у subscription.js), freeScenes — те саме для сцен.
// unavailable — збірка без магазину: тарифів немає, купити не можна.
// plansFailed — магазин не віддав тарифів (офлайн, збій App Store чи
// RevenueCat): замість вічного індикатора — коротке пояснення й «Спробувати
// ще раз» (onRetry). Кнопка покупки без тарифу так і лишається вимкненою.
// canRemind — чи зможемо нагадати про кінець пробного періоду (сповіщення
// дозволені або ще можна спитати): лише тоді таймлайн це обіцяє.
// scansLeft — скільки безкоштовних сканів ще лишилось (0 — більше не буде).
// compact — третій екран пейволу онбордингу: Lingo, переваги й пробний
// період людина щойно бачила на двох попередніх, тут — лише тарифи й
// таймлайн обраного.
export default function PaywallScreen({
  reason,
  plans,
  compact = false,
  freeScans = FREE.scans,
  freeScenes = FREE.scenes,
  scansLeft,
  unavailable,
  plansFailed = false,
  onRetry,
  canRemind = true,
  onClose,
  onPurchase,
  onRestore,
  onOpen,
  lang,
  t,
}) {
  const { C, SHADOW, SHADOW_LG } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [picked, setPicked] = useState('year');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');

  // Ціни могли не завантажитись при старті (офлайн) — перепитуємо магазин.
  useEffect(() => {
    if (onOpen) onOpen();
  }, []);

  // Ціни приходять з App Store (RevenueCat) у валюті людини. Поки вони
  // вантажаться, список порожній — показуємо індикатор, а не вигадані ціни.
  const list = plans || [];
  const plan = list.find((p) => p.id === picked) || defaultPlan(list);
  const intro = reason === 'intro';
  // «Спробуй безкоштовно» і таймлайн — лише коли пробний період є саме в
  // обраного тарифу (Apple дає його не всім: хто вже пробував, платить
  // одразу). Обрав місячний без пробного — заголовок не обіцяє «безкоштовно»
  // над кнопкою, що списує гроші сьогодні (App Review 3.1.2).
  const timeline = intro && plan?.trialDays > 0;
  // «Продовжити безкоштовно»: скільки безкоштовних сканів ЛИШИЛОСЬ (а не
  // скільки їх було на старті); жодного — що лишається без сканів. Лічильник
  // невідомий (екран без App) — стеля.
  const freeLeft = Number.isFinite(scansLeft) ? scansLeft : freeScans;

  // Заголовок під причину: кожна стіна має свій аргумент.
  const HEAD = {
    scans: { title: t('pwScansTitle', { n: freeScans }), text: t('pwScansText', { n: freeScans }) },
    scene: { title: t('pwSceneTitle'), text: t('pwSceneText', { n: freeScenes }) },
    langs: { title: t('pwLangsTitle'), text: t('pwLangsText') },
    intro: timeline ? { title: t('pwIntroTitle'), text: t('pwIntroText') } : null,
  };
  const head = compact ? { title: t('pwPlansTitle'), text: '' } : HEAD[reason] || { title: t('pwTitle'), text: t('pwText') };

  // Пряма дата, коли спишуться гроші. «Через 7 днів» — розмито;
  // конкретне число прибирає відчуття, що щось приховали.
  function chargeDate(days) {
    return formatDate(Date.now() + days * 86400000, lang);
  }

  async function buy() {
    if (!plan) return;
    setBusy(true);
    setNote('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await onPurchase(plan.id);
    setBusy(false);
    // Скасування в системному вікні — не помилка, мовчимо. «Гроші не
    // списано» — лише коли це точно так (див. purchaseNote).
    const key = purchaseNote(res);
    if (key) setNote(t(key));
  }

  async function restore() {
    Haptics.selectionAsync();
    const next = await onRestore();
    Alert.alert(t(restoreNote(next)));
    if (next?.pro && !next.error) onClose();
  }

  function open(url) {
    if (url) Linking.openURL(url).catch(() => {});
  }

  function retry() {
    Haptics.selectionAsync();
    if (onRetry) onRetry();
  }

  // Тарифи з ціною з магазину. У мʼякому пейволі ('intro') вони перші під
  // заголовком: сума списання — найпомітніша цифра на екрані й видна без
  // прокрутки (App Review 3.1.2), а таймлайн і переваги — під нею.
  const plansBlock = (
    <FadeIn delay={intro ? 45 : 90} style={{ gap: 10, marginTop: compact ? 20 : 26 }}>
      {!list.length && !unavailable ? (
        plansFailed ? (
          <View style={s.failed}>
            <Text style={s.failedText}>{t('pricesFailed')}</Text>
            <SecBtn title={t('pricesRetry')} onPress={retry} />
          </View>
        ) : (
          <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} />
        )
      ) : null}
      {list.map((p) => {
        const active = plan?.id === p.id;
        return (
          <Press
            key={p.id}
            onPress={() => {
              Haptics.selectionAsync();
              setPicked(p.id);
            }}
            style={[s.plan, active && s.planActive, active && SHADOW]}
          >
            <View style={[s.radio, active && s.radioOn]}>
              {active ? <IcCheck size={13} color={C.onAccent} /> : null}
            </View>

            <View style={{ flex: 1 }}>
              <View style={s.planTop}>
                <Text style={[s.planName, active && { color: C.text }]}>{t(p.labelKey)}</Text>
                {p.best ? (
                  <View style={s.bestTag}>
                    <Text style={s.bestTagText}>{t('bestValue')}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={s.planPer}>
                {p.lifetime
                  ? t('lifetimeOnce')
                  : p.trialDays
                    ? t('trialDays', { n: p.trialDays })
                    : t('perMonth', { p: p.perMonth })}
              </Text>
            </View>

            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[s.planPrice, active && { color: C.accent }]}>{p.price}</Text>
              {p.save ? (
                <Text style={s.saveText}>{t('saveN', { n: p.save })}</Text>
              ) : p.saveKey ? (
                <Text style={s.saveText}>{t(p.saveKey)}</Text>
              ) : null}
            </View>
          </Press>
        );
      })}
    </FadeIn>
  );

  return (
    <View style={s.root}>
      <Pressable style={s.close} onPress={onClose} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}>
        <IcClose size={22} color={C.faint} />
      </Pressable>

      <ScrollView
        contentContainerStyle={s.scroll}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <FadeIn style={{ alignItems: 'center' }}>
          {compact ? null : <MascotBob pose="celebrate" size={140} />}
          <View style={s.proBadge}>
            <PCrown size={17} color={C.onAccent} />
            <Text style={s.proBadgeText}>PRO</Text>
          </View>
          <Text style={s.title} accessibilityRole="header">
            {head.title}
          </Text>
          {head.text ? <Text style={s.text}>{head.text}</Text> : null}
        </FadeIn>

        {intro ? plansBlock : null}

        {/* Після першого скану — таймлайн пробного періоду замість таблиці:
            людина щойно побачила, що вміє застосунок, і тепер питання не
            «що дає Pro», а «що буде, якщо спробую». */}
        {timeline ? (
          <FadeIn delay={70}>
            <TrialTimeline days={plan.trialDays} price={plan.price} lang={lang} canRemind={canRemind} t={t} />
          </FadeIn>
        ) : null}

        {/* Порівняння. Це головне на екрані: людина має побачити не список
            благ, а свою нинішню ситуацію і те, як вона зміниться. Без лівої
            колонки «зараз» права колонка нічого не означає. */}
        {timeline || compact ? null : (
          <FadeIn delay={45} style={s.table}>
            <View style={s.tableHead}>
              <View style={{ flex: 1 }} />
              <Text style={s.colFree}>{t('colFree')}</Text>
              <View style={s.colProWrap}>
                <Text style={s.colPro}>PRO</Text>
              </View>
            </View>

            {COMPARISON.map((row, i) => {
              // стелі — з сервера, а не з довідника
              const free = row.id === 'scans' ? String(freeScans) : row.id === 'scene' ? String(freeScenes) : row.free;
              return (
                <View key={row.id} style={[s.tableRow, i > 0 && s.tableRowLine]}>
                  <Text style={s.rowLabel}>{t('cmp_' + row.id)}</Text>

                  <View style={s.cellFree}>
                    {free === true ? (
                      <IcCheck size={16} color={C.faint} />
                    ) : (
                      <Text style={s.cellFreeText}>{free}</Text>
                    )}
                  </View>

                  <View style={s.cellPro}>
                    {row.pro === true ? (
                      <IcCheck size={16} color={C.accent} />
                    ) : (
                      <Text style={s.cellProText}>{row.pro}</Text>
                    )}
                  </View>
                </View>
              );
            })}
          </FadeIn>
        )}

        {/* Те, чого немає в таблиці. Лише правда: наліпки й колекція
            безкоштовні для всіх, тож тут їх немає (App Review 3.1.2). З
            таймлайном таблиці немає — тоді тут і самі переваги Pro. */}
        <FadeIn delay={70} style={s.benefits}>
          {PRO_BENEFITS.filter((b) => !compact && (timeline || b.id === 'support')).map((b) => (
            <View key={b.id} style={s.benefitRow}>
              <View style={s.benefitIcon}>
                <ProIcon name={b.icon} size={20} color={C.accent} />
              </View>
              <Text style={s.benefitText}>{t('pro_' + b.id)}</Text>
            </View>
          ))}
        </FadeIn>

        {intro ? null : plansBlock}
      </ScrollView>

      {/* Дія притиснута донизу — під великий палець */}
      <View style={[s.footer, SHADOW_LG]}>
        <GradBtn
          title={plan?.trialDays ? t('startTrial') : plan?.lifetime ? t('buyLifetime') : t('subscribe')}
          onPress={buy}
          disabled={busy || !plan || unavailable}
        />
        {/* Без магазину кажемо це одразу, а не після марного тапу */}
        {unavailable || note ? <Text style={s.note}>{unavailable ? t('purchasesUnavailable') : note}</Text> : null}
        <Text style={s.legal}>
          {plan?.lifetime
            ? t('lifetimeLegal')
            : plan?.trialDays
              ? t(plan.legalKey, { p: plan.price, d: chargeDate(plan.trialDays) })
              : t('renewLegal')}
        </Text>
        {/* Вихід без покупки — повноцінна кнопка з тим, що лишається
            безкоштовним, а не сірий дрібний текст, який треба шукати. */}
        {intro ? (
          <Pressable style={s.freeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.freeBtnText}>
              {freeLeft > 0 ? t('pwContinueFree', { n: freeLeft }) : t('pwContinueFreeNoScans')}
            </Text>
          </Pressable>
        ) : null}
        <View style={s.legalRow}>
          <Pressable hitSlop={8} onPress={restore}>
            <Text style={s.legalLink}>{t('restore')}</Text>
          </Pressable>
          <Text style={s.legalDot}>·</Text>
          <Pressable hitSlop={8} onPress={() => open(TERMS_URL)}>
            <Text style={s.legalLink}>{t('terms')}</Text>
          </Pressable>
          {PRIVACY_URL ? (
            <>
              <Text style={s.legalDot}>·</Text>
              <Pressable hitSlop={8} onPress={() => open(PRIVACY_URL)}>
                <Text style={s.legalLink}>{t('privacy')}</Text>
              </Pressable>
            </>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// План, обраний за замовчуванням: річний (у нього пробний тиждень), інакше
// позначений «найвигідніше», інакше перший. Ніяких передвибраних дорожчих.
export function defaultPlan(list) {
  const all = list || [];
  return all.find((p) => p.id === 'year') || all.find((p) => p.best) || all[0] || null;
}

// Таймлайн пробного періоду: сьогодні → нагадування за 2 дні до кінця →
// списання. Дні рахуються від сьогодні, дати — конкретні числа: «8 жовтня»
// чесніше за «через тиждень». Нагадування — лише якщо зможемо його
// надіслати (див. canRemind) і якщо до нього лишається хоч день. День
// нагадування — той самий, що ставить scheduleTrialReminder (wordOfDay.js).
export function TrialTimeline({ days, price, lang, canRemind, t }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const date = (n) => formatDate(Date.now() + n * 86400000, lang);
  const rows = [
    { key: 'today', label: t('tlToday'), text: t('tlTodayText') },
    ...(canRemind && days > TRIAL_REMIND_DAYS
      ? [
          {
            key: 'remind',
            label: t('tlDay', { n: days - TRIAL_REMIND_DAYS }),
            date: date(days - TRIAL_REMIND_DAYS),
            text: t('tlRemindText'),
          },
        ]
      : []),
    { key: 'charge', label: t('tlDay', { n: days }), date: date(days), text: t('tlChargeText', { p: price }) },
  ];
  return (
    <View style={s.timeline}>
      {rows.map((r, i) => (
        <View key={r.key} style={s.tlRow} accessible>
          <View style={s.tlRail}>
            <View style={[s.tlDot, i === 0 && s.tlDotNow]} />
            {i < rows.length - 1 ? <View style={s.tlLine} /> : null}
          </View>
          <View style={s.tlBody}>
            <Text style={s.tlLabel}>
              {r.label}
              {r.date ? <Text style={s.tlDate}>{'  ·  ' + r.date}</Text> : null}
            </Text>
            <Text style={s.tlText}>{r.text}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    close: {
      position: 'absolute',
      top: 14,
      right: 18,
      zIndex: 10,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { paddingHorizontal: 22, paddingTop: 26, paddingBottom: 20 },

    proBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: C.accent,
      borderRadius: R.pill,
      paddingHorizontal: 13,
      paddingVertical: 6,
      marginTop: 4,
    },
    proBadgeText: { color: C.onAccent, ...CAPS, letterSpacing: 1.6 },

    title: { color: C.text, ...type(28, F.extra), textAlign: 'center', marginTop: 14 },
    text: {
      color: C.dim,
      ...type(15, F.reg),
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 300,
    },

    table: {
      marginTop: 26,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    tableHead: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 10 },
    colFree: { width: 66, textAlign: 'center', color: C.faint, ...CAPS },
    colProWrap: {
      width: 66,
      alignItems: 'center',
      backgroundColor: C.accentSoft,
      borderTopLeftRadius: 10,
      borderTopRightRadius: 10,
      paddingVertical: 5,
    },
    colPro: { color: C.accent, ...CAPS, letterSpacing: 1.4 },
    tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 13 },
    tableRowLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep },
    rowLabel: { flex: 1, color: C.text, ...type(14, F.semi, { noLead: true }) },
    cellFree: { width: 66, alignItems: 'center' },
    cellFreeText: { color: C.dim, ...type(14, F.semi, { noLead: true }) },
    cellPro: { width: 66, alignItems: 'center', backgroundColor: C.accentSoft, paddingVertical: 8 },
    cellProText: { color: C.accent, ...type(15, F.extra, { noLead: true }) },

    benefits: { marginTop: 20, gap: 12 },
    benefitRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
    benefitIcon: {
      width: 38,
      height: 38,
      borderRadius: 12,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitText: { flex: 1, color: C.text, ...type(15, F.semi) },

    plan: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 15,
      borderWidth: 2,
      borderColor: 'transparent',
    },
    planActive: { borderColor: C.accent },
    radio: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: C.card3,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { backgroundColor: C.accent, borderColor: C.accent },
    planTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    planName: { color: C.dim, ...type(16, F.bold, { noLead: true }) },
    planPer: { color: C.faint, ...type(13, F.reg, { noLead: true }), marginTop: 3 },
    planPrice: { color: C.text, ...type(18, F.extra, { noLead: true }) },
    saveText: { color: C.green, ...CAPS, marginTop: 3 },

    bestTag: {
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    bestTagText: { color: C.accent, ...CAPS, fontSize: 10 },

    footer: {
      backgroundColor: C.card,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 30,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
    },
    // Юридичний рядок — частина розкриття умов (App Review 3.1.2): дрібний,
    // але читабельний — dim, а не faint (у темній темі faint ледь видно).
    legal: {
      color: C.dim,
      ...type(12, F.reg),
      textAlign: 'center',
      marginTop: 10,
    },
    note: { color: C.red, ...type(13, F.semi), textAlign: 'center', marginTop: 10 },
    failed: { gap: 14, marginVertical: 18 },
    failedText: { color: C.dim, ...type(15, F.semi), textAlign: 'center' },
    legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
    legalLink: { color: C.dim, ...type(12, F.semi, { noLead: true }) },
    legalDot: { color: C.faint },
    freeBtn: {
      marginTop: 10,
      minHeight: 46,
      borderRadius: R.lg,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    freeBtnText: { color: C.text, ...type(15, F.bold), textAlign: 'center' },

    timeline: {
      marginTop: 24,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 6,
    },
    tlRow: { flexDirection: 'row', gap: 14 },
    tlRail: { width: 16, alignItems: 'center' },
    tlDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 3, borderColor: C.accent, backgroundColor: C.card, marginTop: 3 },
    tlDotNow: { backgroundColor: C.accent },
    tlLine: { flex: 1, width: 2, borderRadius: 1, backgroundColor: C.accentSoft, marginVertical: 4 },
    tlBody: { flex: 1, paddingBottom: 16 },
    tlLabel: { color: C.text, ...type(16, F.extra) },
    tlDate: { color: C.faint, ...type(14, F.semi) },
    tlText: { color: C.dim, ...type(14, F.reg), marginTop: 2 },
  });
