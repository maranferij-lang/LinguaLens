// Пейвол наприкінці онбордингу — кілька екранів, по одній думці на кожному:
//   а) «Спробуй Pro 7 днів безкоштовно» і три переваги (скани без меж,
//      ціла кімната, 29 мов);
//   б) «Нагадаємо за 2 дні до кінця» і таймлайн: сьогодні — повний доступ,
//      за 2 дні до кінця — нагадування, день N — перше списання з ціною;
//   в) наш PaywallScreen у режимі 'intro' (тарифи, ціна з магазину, умови,
//      відновлення, «Продовжити безкоштовно») — або пейвол RevenueCat, якщо
//      так каже metadata пропозиції (paywall_ui: "revenuecat").
// Пробного періоду в тарифі за замовчуванням немає — (а) і (б) були б
// неправдою: одразу (в), без таймлайну. Хрестик — на кожному екрані.
//
// App Review 3.1.2: ціни на (а) і (б) немає взагалі, на (в) найпомітніша
// цифра — сума списання в рядку тарифу; тривалість пробного періоду, що
// буде після нього й як скасувати, видно до натиску.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import PaywallScreen, { TrialTimeline, defaultPlan } from './PaywallScreen';
import { PRO_BENEFITS } from './subscription';
import { ProIcon, PCrown } from './ProIcons';
import { IcBell, IcClose } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, GradBtn } from './ui';
import { stagger } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

// Номер екрана для статистики (paywall_step / paywall_close) — завжди той
// самий для того самого екрана, навіть коли (а) і (б) пропущено.
export const PAYWALL_STEP_INDEX = { trial: 0, reminder: 1, plans: 2 };

// Екрани для цих тарифів: з пробним періодом — три, без нього — лише тарифи.
export function paywallSteps(plans) {
  return defaultPlan(plans)?.trialDays > 0 ? ['trial', 'reminder', 'plans'] : ['plans'];
}

// На (а) — лише те, за чим людина прийшла: скани, кімната, мови.
const TRIAL_BENEFITS = PRO_BENEFITS.filter((b) => ['scans', 'scene', 'langs'].includes(b.id));

// ui — 'custom' | 'revenuecat'; onPresentRc() → Promise<boolean>: true —
// пейвол RevenueCat показано (далі все робить App), false — його немає чи він
// упав, показуємо свій. onStep(i, name) — екран показано; onClose(i) — закрили.
// Решта пропсів — ті самі, що в PaywallScreen.
export default function OnboardingPaywall({
  plans,
  unavailable,
  canRemind = true,
  freeScans,
  scansLeft,
  ui = 'custom',
  onPresentRc,
  onStep,
  onClose,
  onPurchase,
  onRestore,
  onOpen,
  lang,
  t,
}) {
  const { C, SHADOW_LG } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // Набір екранів фіксуємо на старті: тарифи, що дозавантажились посеред
  // показу, не мають перекидати людину назад на (а).
  const [steps] = useState(() => paywallSteps(plans));
  const [i, setI] = useState(0);
  const step = steps[i];
  const plan = defaultPlan(plans);
  // Пейвол RevenueCat замість (в): 'idle' → 'pending' (показуємо) → 'failed'
  const [rc, setRc] = useState(ui === 'revenuecat' && onPresentRc ? 'idle' : 'off');

  useEffect(() => {
    if (onStep) onStep(PAYWALL_STEP_INDEX[step], step);
  }, [step]);

  useEffect(() => {
    if (step !== 'plans' || rc !== 'idle') return;
    setRc('pending');
    Promise.resolve(onPresentRc())
      .then((shown) => !shown && setRc('failed'))
      .catch(() => setRc('failed'));
  }, [step, rc]);

  const close = () => onClose(PAYWALL_STEP_INDEX[step]);
  const advance = () => setI((n) => Math.min(steps.length - 1, n + 1));

  if (step === 'plans') {
    if (rc === 'idle' || rc === 'pending') {
      // Поки зверху нативний пейвол RevenueCat — під ним тихе тло
      return (
        <View style={[s.root, s.center]}>
          <ActivityIndicator color={C.accent} />
        </View>
      );
    }
    return (
      <PaywallScreen
        reason="intro"
        compact
        plans={plans}
        freeScans={freeScans}
        scansLeft={scansLeft}
        unavailable={unavailable}
        canRemind={canRemind}
        onClose={close}
        onPurchase={onPurchase}
        onRestore={onRestore}
        onOpen={onOpen}
        lang={lang}
        t={t}
      />
    );
  }

  const trial = step === 'trial';
  return (
    <View style={s.root}>
      <Pressable style={s.close} onPress={close} hitSlop={12} accessibilityRole="button" accessibilityLabel={t('close')}>
        <IcClose size={22} color={C.faint} />
      </Pressable>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        {/* key — новий екран мʼяко зʼявляється, а не підміняється миттєво */}
        <FadeIn key={step} style={{ alignItems: 'center' }}>
          {trial ? (
            <>
              <MascotBob pose="celebrate" size={150} />
              <View style={s.proBadge}>
                <PCrown size={17} color={C.onAccent} />
                <Text style={s.proBadgeText}>PRO</Text>
              </View>
            </>
          ) : (
            <View style={s.bell}>
              <IcBell size={46} color={C.accent} />
            </View>
          )}
          <Text style={s.title} accessibilityRole="header">
            {trial
              ? t('opwTrialTitle', { n: plan.trialDays })
              : canRemind
                ? t('opwRemindTitle')
                : t('opwNoRemindTitle')}
          </Text>
          <Text style={s.text}>
            {trial ? t('pwIntroText') : canRemind ? t('opwRemindText') : t('opwNoRemindText')}
          </Text>
        </FadeIn>

        {trial ? (
          <View style={s.benefits}>
            {TRIAL_BENEFITS.map((b, n) => (
              <FadeIn key={b.id} delay={stagger(n + 1)} style={s.benefitRow}>
                <View style={s.benefitIcon}>
                  <ProIcon name={b.icon} size={22} color={C.accent} />
                </View>
                <Text style={s.benefitText}>{t('pro_' + b.id)}</Text>
              </FadeIn>
            ))}
          </View>
        ) : (
          <FadeIn key="tl" delay={stagger(1)}>
            <TrialTimeline days={plan.trialDays} price={plan.price} lang={lang} canRemind={canRemind} t={t} />
            <Text style={s.cancel}>{t('opwCancel')}</Text>
          </FadeIn>
        )}
      </ScrollView>

      <View style={[s.footer, SHADOW_LG]}>
        <GradBtn title={t('obNext')} onPress={advance} />
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    center: { alignItems: 'center', justifyContent: 'center' },
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
    scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 24, paddingTop: 48, paddingBottom: 24 },
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
    bell: {
      width: 104,
      height: 104,
      borderRadius: 52,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
    },
    title: { color: C.text, ...type(28, F.extra), textAlign: 'center', marginTop: 14 },
    text: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8, maxWidth: 320 },
    benefits: { marginTop: 28, gap: 14, alignSelf: 'stretch' },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingVertical: 12,
      paddingHorizontal: 14,
    },
    benefitIcon: {
      width: 42,
      height: 42,
      borderRadius: 13,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    benefitText: { flex: 1, color: C.text, ...type(16, F.bold) },
    cancel: { color: C.dim, ...type(13, F.semi), textAlign: 'center', marginTop: 14 },
    footer: {
      backgroundColor: C.card,
      paddingHorizontal: 22,
      paddingTop: 16,
      paddingBottom: 30,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
    },
  });
