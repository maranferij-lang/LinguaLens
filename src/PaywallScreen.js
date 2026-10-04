// Пейвол.
//
// Правила, за якими він побудований:
//   • Заголовок говорить про людину, не про тариф. Причина відмови приходить
//     ззовні (скани / словник / мови), і текст під неї підлаштовується —
//     людина бачить відповідь саме на ту стіну, в яку щойно вперлась.
//   • Тижневий тариф присутній, але не виділений. Він потрібен як якір:
//     поруч із $4.99/тиждень річний за $34.99 читається як очевидний вибір.
//   • Річний обраний за замовчуванням і має пробний тиждень. Ніяких
//     передвибраних дорогих варіантів — це нечесно і повертається відписками.
//   • Закрити можна завжди, хрестик великий і на своєму місці. Пейвол, з
//     якого важко вийти, псує оцінку в App Store сильніше, ніж дає виторгу.
//   • 'intro' — мʼякий пейвол один раз після першого скану: замість таблиці
//     таймлайн пробного періоду (сьогодні — доступ, день 5 — нагадування,
//     день 7 — списання) і окрема кнопка «Продовжити безкоштовно». Так
//     людина знає, що й коли станеться, ще до натиску (App Review 3.1.2).
//     Без пробного періоду таймлайну немає і «безкоштовно» не обіцяємо.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PRO_BENEFITS, COMPARISON, FREE } from './subscription';
import { PRIVACY_URL, TERMS_URL } from './config';
import { purchaseNote, restoreNote } from './purchases';
import { formatDate } from './locale';
import { ProIcon, PCrown } from './ProIcons';
import { IcCheck, IcClose } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, GradBtn, Press } from './ui';
import { CAPS, F, R, type, useTheme } from './theme';

// freeScans — денна стеля з сервера (див. freeScansPerDay у subscription.js).
// unavailable — збірка без магазину: тарифів немає, купити не можна.
// canRemind — чи зможемо нагадати про кінець пробного періоду (сповіщення
// дозволені або ще можна спитати): лише тоді таймлайн це обіцяє.
export default function PaywallScreen({
  reason,
  plans,
  freeScans = FREE.scansPerDay,
  unavailable,
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
  const plan = list.find((p) => p.id === picked) || list.find((p) => p.best) || list[0];
  const intro = reason === 'intro';
  // «Спробуй безкоштовно» і таймлайн — лише коли пробний період є саме в
  // обраного тарифу (Apple дає його не всім: хто вже пробував, платить
  // одразу). Обрав місячний без пробного — заголовок не обіцяє «безкоштовно»
  // над кнопкою, що списує гроші сьогодні (App Review 3.1.2).
  const timeline = intro && plan?.trialDays > 0;

  // Заголовок під причину: кожна стіна має свій аргумент.
  const HEAD = {
    scans: { title: t('pwScansTitle'), text: t('pwScansText', { n: freeScans }) },
    words: { title: t('pwWordsTitle'), text: t('pwWordsText', { n: FREE.maxWords }) },
    langs: { title: t('pwLangsTitle'), text: t('pwLangsText') },
    intro: timeline ? { title: t('pwIntroTitle'), text: t('pwIntroText') } : null,
  };
  const head = HEAD[reason] || { title: t('pwTitle'), text: t('pwText') };

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
          <MascotBob pose="celebrate" size={140} />
          <View style={s.proBadge}>
            <PCrown size={17} color={C.onAccent} />
            <Text style={s.proBadgeText}>PRO</Text>
          </View>
          <Text style={s.title}>{head.title}</Text>
          <Text style={s.text}>{head.text}</Text>
        </FadeIn>

        {/* Після першого скану — таймлайн пробного періоду замість таблиці:
            людина щойно побачила, що вміє застосунок, і тепер питання не
            «що дає Pro», а «що буде, якщо спробую». */}
        {timeline ? (
          <FadeIn delay={45}>
            <TrialTimeline
              days={plan.trialDays}
              price={plan.price}
              date={(n) => chargeDate(n)}
              canRemind={canRemind}
              t={t}
              s={s}
            />
          </FadeIn>
        ) : null}

        {/* Порівняння. Це головне на екрані: людина має побачити не список
            благ, а свою нинішню ситуацію і те, як вона зміниться. Без лівої
            колонки «зараз» права колонка нічого не означає. */}
        {timeline ? null : (
          <FadeIn delay={45} style={s.table}>
            <View style={s.tableHead}>
              <View style={{ flex: 1 }} />
              <Text style={s.colFree}>{t('colFree')}</Text>
              <View style={s.colProWrap}>
                <Text style={s.colPro}>PRO</Text>
              </View>
            </View>

            {COMPARISON.map((row, i) => {
              const free = row.id === 'scans' ? String(freeScans) : row.free;
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
            безкоштовні для всіх, тож тут їх немає (App Review 3.1.2). */}
        <FadeIn delay={70} style={s.benefits}>
          {PRO_BENEFITS.filter((b) => b.id === 'support').map((b) => (
            <View key={b.id} style={s.benefitRow}>
              <View style={s.benefitIcon}>
                <ProIcon name={b.icon} size={20} color={C.accent} />
              </View>
              <Text style={s.benefitText}>{t('pro_' + b.id)}</Text>
            </View>
          ))}
        </FadeIn>

        {/* Тарифи */}
        <FadeIn delay={90} style={{ gap: 10, marginTop: 26 }}>
          {!list.length && !unavailable ? <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} /> : null}
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
                    {p.trialDays ? t('trialDays', { n: p.trialDays }) : t('perMonth', { p: p.perMonth })}
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
      </ScrollView>

      {/* Дія притиснута донизу — під великий палець */}
      <View style={[s.footer, SHADOW_LG]}>
        <GradBtn
          title={plan?.trialDays ? t('startTrial') : t('subscribe')}
          onPress={buy}
          disabled={busy || !plan || unavailable}
        />
        {/* Без магазину кажемо це одразу, а не після марного тапу */}
        {unavailable || note ? <Text style={s.note}>{unavailable ? t('purchasesUnavailable') : note}</Text> : null}
        <Text style={s.legal}>
          {plan?.trialDays
            ? t(plan.legalKey, { p: plan.price, d: chargeDate(plan.trialDays) })
            : t('renewLegal')}
        </Text>
        {/* Вихід без покупки — повноцінна кнопка з тим, що лишається
            безкоштовним, а не сірий дрібний текст, який треба шукати. */}
        {intro ? (
          <Pressable style={s.freeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.freeBtnText}>{t('pwContinueFree', { n: freeScans })}</Text>
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

// Таймлайн пробного періоду: сьогодні → нагадування за 2 дні до кінця →
// списання. Дні рахуються від сьогодні, дати — конкретні числа: «8 жовтня»
// чесніше за «через тиждень». Нагадування — лише якщо зможемо його
// надіслати (див. canRemind) і якщо до нього лишається хоч день.
function TrialTimeline({ days, price, date, canRemind, t, s }) {
  const rows = [
    { key: 'today', label: t('tlToday'), text: t('tlTodayText') },
    ...(canRemind && days >= 3
      ? [{ key: 'remind', label: t('tlDay', { n: days - 2 }), date: date(days - 2), text: t('tlRemindText') }]
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
    legal: {
      color: C.faint,
      ...type(11, F.reg),
      textAlign: 'center',
      marginTop: 10,
    },
    note: { color: C.red, ...type(13, F.semi), textAlign: 'center', marginTop: 10 },
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
