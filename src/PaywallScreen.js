// Paywall.
//
// The rules it is built on:
//   • The title speaks about the person, not the plan. The reason for the refusal comes
//     from outside (scans / dictionary / languages), and the text adapts to it:
//     the person sees an answer to exactly the wall they just hit.
//   • The weekly plan is present but not highlighted. It is needed as an anchor:
//     next to $4.99/week, the yearly one at $34.99 reads as the obvious choice.
//   • Yearly is selected by default and has a trial week. No
//     pre-selected expensive options: that is dishonest and comes back as cancellations.
//   • It can always be closed, the close button is big and in its usual place. A paywall that is
//     hard to leave hurts the App Store rating more than it brings in revenue.
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PLANS, PRO_BENEFITS, COMPARISON, FREE } from './subscription';
import { ProIcon, PCrown } from './ProIcons';
import { IcCheck, IcClose } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, GradBtn, Press } from './ui';
import { CAPS, F, R, type, useTheme } from './theme';

export default function PaywallScreen({ reason, onClose, onPurchase, t }) {
  const { C, SHADOW, SHADOW_LG } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [picked, setPicked] = useState('year');
  const [busy, setBusy] = useState(false);

  // A title for the reason: every wall has its own argument.
  const HEAD = {
    scans: { title: t('pwScansTitle'), text: t('pwScansText', { n: FREE.scansPerDay }) },
    words: { title: t('pwWordsTitle'), text: t('pwWordsText', { n: FREE.maxWords }) },
    langs: { title: t('pwLangsTitle'), text: t('pwLangsText') },
  };
  const head = HEAD[reason] || { title: t('pwTitle'), text: t('pwText') };

  const plan = PLANS.find((p) => p.id === picked);

  // A direct date when the money will be charged. "In 7 days" is blurry;
  // a specific number removes the feeling that something was hidden.
  function chargeDate(days) {
    const d = new Date(Date.now() + days * 86400000);
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
  }

  async function buy() {
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await onPurchase(picked);
    setBusy(false);
  }

  return (
    <View style={s.root}>
      <Pressable style={s.close} onPress={onClose} hitSlop={12}>
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

        {/* Comparison. This is the main thing on the screen: the person should see not a list
            of benefits, but their current situation and how it will change. Without the left
            "now" column, the right column means nothing. */}
        <FadeIn delay={45} style={s.table}>
          <View style={s.tableHead}>
            <View style={{ flex: 1 }} />
            <Text style={s.colFree}>{t('colFree')}</Text>
            <View style={s.colProWrap}>
              <Text style={s.colPro}>PRO</Text>
            </View>
          </View>

          {COMPARISON.map((row, i) => (
            <View key={row.id} style={[s.tableRow, i > 0 && s.tableRowLine]}>
              <Text style={s.rowLabel}>{t('cmp_' + row.id)}</Text>

              <View style={s.cellFree}>
                {row.free === true ? (
                  <IcCheck size={16} color={C.faint} />
                ) : (
                  <Text style={s.cellFreeText}>{row.free}</Text>
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
          ))}
        </FadeIn>

        {/* What does not exist at all without Pro */}
        <FadeIn delay={70} style={s.benefits}>
          {PRO_BENEFITS.filter((b) => b.id === 'photos' || b.id === 'support').map((b) => (
            <View key={b.id} style={s.benefitRow}>
              <View style={s.benefitIcon}>
                <ProIcon name={b.icon} size={20} color={C.accent} />
              </View>
              <Text style={s.benefitText}>{t('pro_' + b.id)}</Text>
            </View>
          ))}
        </FadeIn>

        {/* Plans */}
        <FadeIn delay={90} style={{ gap: 10, marginTop: 26 }}>
          {PLANS.map((p) => {
            const active = picked === p.id;
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
                  {p.saveKey ? <Text style={s.saveText}>{t(p.saveKey)}</Text> : null}
                </View>
              </Press>
            );
          })}
        </FadeIn>
      </ScrollView>

      {/* The action is pressed to the bottom, under the thumb */}
      <View style={[s.footer, SHADOW_LG]}>
        <GradBtn
          title={plan?.trialDays ? t('startTrial') : t('subscribe')}
          onPress={buy}
          disabled={busy}
        />
        <Text style={s.legal}>
          {plan?.trialDays
            ? t('trialLegal', { p: plan.price, d: chargeDate(plan.trialDays) })
            : t('renewLegal')}
        </Text>
        <View style={s.legalRow}>
          <Pressable hitSlop={8}>
            <Text style={s.legalLink}>{t('restore')}</Text>
          </Pressable>
          <Text style={s.legalDot}>·</Text>
          <Pressable hitSlop={8}>
            <Text style={s.legalLink}>{t('terms')}</Text>
          </Pressable>
        </View>
      </View>
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
    legalStrong: { color: C.dim, ...type(12, F.semi), textAlign: 'center', marginTop: 4 },
    legalRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 6 },
    legalLink: { color: C.dim, ...type(12, F.semi, { noLead: true }) },
    legalDot: { color: C.faint },
  });
