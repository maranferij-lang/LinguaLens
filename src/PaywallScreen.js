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
//   • Тарифи — одразу під заголовком, на кожній стіні: сума списання —
//     найпомітніша цифра на екрані й видна без прокрутки навіть на SE (App
//     Review 3.1.2). Далі таймлайн пробного періоду, таблиця й переваги.
//   • «Назавжди» — разова покупка: без «на місяць», без «−N%», і юридичний
//     рядок під кнопкою прямо каже, що це не підписка.
//   • Закрити можна завжди, хрестик великий і на своєму місці — у власній
//     смужці згори, поза прокруткою: ціни під ним ніколи не пропливають. Пейвол,
//     з якого важко вийти, псує оцінку в App Store сильніше, ніж дає виторгу.
//   • 'intro' — мʼякий пейвол один раз після першого скану: замість таблиці
//     таймлайн пробного періоду (сьогодні — доступ, день 5 — нагадування,
//     день 7 — списання) і окрема кнопка «Продовжити безкоштовно». Так
//     людина знає, що й коли станеться, ще до натиску (App Review 3.1.2).
//     Без пробного періоду таймлайну немає і «безкоштовно» не обіцяємо —
//     замість нього один рядок «сьогодні — $6.99, далі щомісяця». Таблиці
//     тут немає ніколи, а шапка завжди однакової висоти: тариф під пальцем
//     не зсувається, хоч би який людина обрала.
//     Безкоштовний скан один на все життя, і його вже витрачено (перший
//     скан в онбордингу чи щойно зроблений) — кнопка не обіцяє ще одного ні
//     сьогодні, ні завтра.
//   • Наприкінці онбордингу перед цим екраном ще два (OnboardingPaywall.js):
//     пробний період і таймлайн. Таймлайн і план за замовчуванням — звідси.
import { Children, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { PRO_BENEFITS, COMPARISON, FREE, TRIAL_REMIND_DAYS } from './subscription';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from './config';
import { purchaseNote, restoreNote } from './purchases';
import { formatDate } from './locale';
import { ProIcon, PCrown } from './ProIcons';
import { IcCheck, IcClose } from './icons';
import { MascotBob } from './Mascot';
import { FadeIn, GradBtn, Press } from './ui';
import { CAPS, F, R, type, useTheme } from './theme';

// Нижче за це (iPhone SE, mini, збільшений шрифт дисплея) — без Lingo і з
// тіснішою шапкою: тарифи мають влізти над кнопкою без прокрутки.
export const SHORT_SCREEN = 740;

// Юридичний рядок без пробного періоду — з ціною й періодом обраного тарифу,
// як у trialLegal*. Невідомий період — загальний renewLegal.
const RENEW_LEGAL = { week: 'renewLegalWeek', month: 'renewLegalMonth', quarter: 'renewLegalQuarter', year: 'renewLegalYear' };
// Один рядок замість таймлайну, коли пробного періоду в тарифу немає
const TODAY_LINE = { week: 'pwTodayWeek', month: 'pwTodayMonth', quarter: 'pwTodayQuarter', year: 'pwTodayYear' };
// Короткий заголовок вікна після «Відновити покупки»; пояснення — під ним
const RESTORE_TITLE = {
  restoreDone: 'restoreTitleOk',
  restoreNothing: 'restoreTitleNone',
  restoreFailed: 'restoreTitleFail',
  purchasesUnavailable: 'restoreTitleFail',
};
// Причина стіни → рядок таблиці, що її пояснює (його ставимо першим)
const REASON_ROW = { scans: 'scans', scene: 'scene', langs: 'langs' };
// Більша ціль для дрібних посилань під кнопкою
const LINK_SLOP = { top: 6, bottom: 6, left: 10, right: 10 };

// freeScans — скільки сканів безкоштовно за все життя, стеля з сервера (див.
// freeScans у subscription.js), freeScenes — те саме для сцен.
// unavailable — збірка без магазину: тарифів немає, купити не можна.
// plansFailed — магазин не віддав тарифів (офлайн, збій App Store чи
// RevenueCat): замість вічного індикатора й вимкненої кнопки покупки —
// пояснення, підказка й «Спробувати ще раз» (onRetry) просто в підвалі.
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
  const short = useWindowDimensions().height < SHORT_SCREEN;
  const [picked, setPicked] = useState('year');
  const [busy, setBusy] = useState(false);
  // ключ примітки під кнопкою після покупки (purchaseNote) або null
  const [note, setNote] = useState(null);
  // «Відновити покупки» вже йде: другий тап не запускає другого відновлення
  const [restoring, setRestoring] = useState(false);
  const restoringRef = useRef(false);

  // Ціни могли не завантажитись при старті (офлайн) — перепитуємо магазин.
  useEffect(() => {
    if (onOpen) onOpen();
  }, []);

  // Ціни приходять з App Store (RevenueCat) у валюті людини. Поки вони
  // вантажаться, список порожній — показуємо індикатор, а не вигадані ціни.
  const list = plans || [];
  const plan = list.find((p) => p.id === picked) || defaultPlan(list);
  const intro = reason === 'intro';
  // Магазин не віддав цін — купувати нічого; підвал пояснює й пропонує ще раз
  const failed = !unavailable && !list.length && plansFailed;
  // «Спробуй безкоштовно» і таймлайн — лише коли пробний період є саме в
  // обраного тарифу (Apple дає його не всім: хто вже пробував, платить
  // одразу). Обрав місячний без пробного — заголовок не обіцяє «безкоштовно»
  // над кнопкою, що списує гроші сьогодні (App Review 3.1.2).
  const timeline = intro && plan?.trialDays > 0;
  // «Продовжити безкоштовно»: скільки безкоштовних сканів ЛИШИЛОСЬ (а не
  // скільки їх було на старті); жодного — просто «продовжити». Лічильник
  // невідомий (екран без App) — стеля.
  const freeLeft = Number.isFinite(scansLeft) ? scansLeft : freeScans;

  // Заголовок під причину: кожна стіна має свій аргумент.
  const HEAD = {
    scans: { title: t('pwScansTitle', { n: freeScans }), text: t('pwScansText', { n: freeScans }) },
    scene: { title: t('pwSceneTitle'), text: t('pwSceneText', { n: freeScenes }) },
    langs: { title: t('pwLangsTitle'), text: t('pwLangsText') },
  };
  const plain = { title: t('pwTitle'), text: t('pwText') };
  const trialHead = { title: t('pwIntroTitle'), text: t('pwIntroText') };
  // Мʼякий пейвол: шапка з пробним періодом чи без — залежно від тарифу.
  // Обидві займають місце більшої з них (Stable), тож тарифи під шапкою
  // стоять на місці, поки людина їх перемикає.
  const heads = compact
    ? [{ title: t('pwPlansTitle'), text: '' }]
    : intro
      ? list.some((p) => p.trialDays > 0)
        ? [trialHead, plain]
        : [plain]
      : [HEAD[reason] || plain];
  const headAt = intro && !compact && heads.length > 1 && !timeline ? 1 : 0;

  // Таблиця з рядком цієї стіни першим: на стіні мов перше, що бачить
  // людина, — «Мов одночасно 1 → 29», а не скани.
  const rows = useMemo(() => {
    const first = REASON_ROW[reason];
    return first ? [...COMPARISON].sort((a, b) => (b.id === first) - (a.id === first)) : COMPARISON;
  }, [reason]);

  // Пряма дата, коли спишуться гроші. «Через 7 днів» — розмито;
  // конкретне число прибирає відчуття, що щось приховали.
  function chargeDate(days) {
    return formatDate(Date.now() + days * 86400000, lang);
  }

  async function buy() {
    if (!plan || busy) return;
    setBusy(true);
    setNote(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const res = await onPurchase(plan.id);
    setBusy(false);
    // Скасування в системному вікні — не помилка, мовчимо. «Гроші не
    // списано» — лише коли це точно так (див. purchaseNote).
    setNote(purchaseNote(res));
  }

  async function restore() {
    if (restoringRef.current) return;
    restoringRef.current = true;
    setRestoring(true);
    Haptics.selectionAsync();
    let next = null;
    try {
      next = await onRestore();
    } catch (_) {
      next = { error: 'FAILED' };
    } finally {
      restoringRef.current = false;
      setRestoring(false);
    }
    // Короткий жирний заголовок і пояснення під ним, а не речення в заголовку
    const key = restoreNote(next);
    Alert.alert(t(RESTORE_TITLE[key] || 'restoreTitleFail'), t(key));
    if (next?.pro && !next.error) onClose();
  }

  function open(url) {
    if (url) Linking.openURL(url).catch(() => {});
  }

  function retry() {
    Haptics.selectionAsync();
    if (onRetry) onRetry();
  }

  // Що під назвою тарифу: місячний — «щомісяця, скасуй будь-коли» (ціна й
  // так праворуч), річний — скільки це на місяць і пробний період.
  function subParts(p) {
    if (p.lifetime) return [t('lifetimeOnce')];
    const base = p.id === 'month' ? t('planSubMonth') : p.id === 'week' ? t('planSubWeek') : p.perMonth ? t('perMonth', { p: p.perMonth }) : '';
    return [base, p.trialDays ? t('trialDays', { n: p.trialDays }) : ''].filter(Boolean);
  }

  // Тарифи з ціною з магазину — перші під заголовком на кожній стіні.
  // Для VoiceOver — група перемикачів: «Рік, $34.99, …, вибрано».
  const plansBlock = (
    <FadeIn delay={45} style={{ marginTop: compact ? 20 : short ? 18 : 26 }}>
      {!list.length && !unavailable && !failed ? <ActivityIndicator color={C.accent} style={{ marginVertical: 30 }} /> : null}
      <View style={{ gap: 10 }} accessibilityRole="radiogroup">
        {list.map((p) => {
          const active = plan?.id === p.id;
          const parts = subParts(p);
          const save = p.save ? t('saveN', { n: p.save }) : p.saveKey ? t(p.saveKey) : '';
          const label = [t(p.labelKey), p.price, ...parts, p.best ? t('bestValue') : '', save].filter(Boolean).join(', ');
          return (
            <Press
              key={p.id}
              onPress={() => {
                Haptics.selectionAsync();
                setPicked(p.id);
              }}
              style={[s.plan, active && s.planActive, active && SHADOW]}
              accessibilityRole="radio"
              accessibilityState={{ checked: active }}
              accessibilityLabel={label}
            >
              <View style={[s.radio, active && s.radioOn]}>{active ? <IcCheck size={13} color={C.onAccent} /> : null}</View>

              <View style={{ flex: 1 }}>
                <View style={s.planTop}>
                  <Text style={[s.planName, active && { color: C.text }]}>{t(p.labelKey)}</Text>
                  {p.best ? (
                    <View style={s.bestTag}>
                      <Text style={s.bestTagText}>{t('bestValue')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={s.planPer}>{parts.join(' · ')}</Text>
              </View>

              <View style={{ alignItems: 'flex-end' }}>
                <Text style={[s.planPrice, active && { color: C.accent }]}>{p.price}</Text>
                {save ? <Text style={s.saveText}>{save}</Text> : null}
              </View>
            </Press>
          );
        })}
      </View>
    </FadeIn>
  );

  // Без пробного періоду в мʼякому пейволі — один рядок замість таймлайну
  const todayLine =
    intro && plan && !timeline
      ? plan.lifetime
        ? t('pwTodayLifetime')
        : TODAY_LINE[plan.id]
          ? t(TODAY_LINE[plan.id], { p: plan.price })
          : null
      : null;

  const legal = plan?.lifetime
    ? t('lifetimeLegal')
    : plan?.trialDays
      ? t(plan.legalKey, { p: plan.price, d: chargeDate(plan.trialDays) })
      : plan && RENEW_LEGAL[plan.id]
        ? t(RENEW_LEGAL[plan.id], { p: plan.price })
        : t('renewLegal');

  // Ask to Buy «чекаємо на схвалення» — стан, а не помилка: сірим
  const noteText = unavailable ? t('purchasesUnavailable') : note === 'purchaseUnclear' ? t('pwUnclearNote') : note ? t(note) : '';

  return (
    <View style={s.root}>
      {/* Хрестик — у власній смужці поза прокруткою: ціни під ним не їздять */}
      <View style={s.topBar}>
        <Pressable style={s.close} onPress={onClose} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('close')}>
          <View style={s.closeDot}>
            <IcClose size={20} color={C.dim} />
          </View>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false} bounces={false}>
        <FadeIn style={{ alignItems: 'center' }}>
          {compact || short ? null : <MascotBob pose="celebrate" size={140} />}
          <View style={s.proBadge}>
            <PCrown size={17} color={C.onAccent} />
            <Text style={s.proBadgeText}>PRO</Text>
          </View>
          <Stable index={headAt}>
            {heads.map((h, i) => (
              <View key={i} style={{ alignItems: 'center' }}>
                <Text style={[s.title, short && s.titleShort]} accessibilityRole="header">
                  {h.title}
                </Text>
                {h.text ? <Text style={[s.text, short && s.textShort]}>{h.text}</Text> : null}
              </View>
            ))}
          </Stable>
        </FadeIn>

        {plansBlock}

        {/* Таймлайн пробного періоду: людина щойно побачила, що вміє
            застосунок, і тепер питання не «що дає Pro», а «що буде, якщо
            спробую». Без пробного — один рядок про сьогоднішнє списання. */}
        {timeline ? (
          <FadeIn delay={70}>
            <TrialTimeline days={plan.trialDays} price={plan.price} lang={lang} canRemind={canRemind} t={t} />
          </FadeIn>
        ) : todayLine ? (
          <View style={s.today} accessible>
            <View style={[s.tlDot, s.tlDotNow, { marginTop: 0 }]} />
            <Text style={s.todayText}>{todayLine}</Text>
          </View>
        ) : null}

        {/* Порівняння: не список благ, а нинішня ситуація людини і те, як
            вона зміниться. Без лівої колонки «безкоштовно» права нічого не
            означає. Рядок цієї стіни — першим. */}
        {intro || compact ? null : (
          <FadeIn delay={70} style={s.table}>
            <View style={s.tableHead}>
              <View style={{ flex: 1 }} />
              <Text style={s.colFree} numberOfLines={1}>
                {t('colFree')}
              </Text>
              <View style={s.colProWrap}>
                <Text style={s.colPro}>PRO</Text>
              </View>
            </View>

            {rows.map((row, i) => {
              // стелі — з сервера, а не з довідника
              const free = row.id === 'scans' ? String(freeScans) : row.id === 'scene' ? String(freeScenes) : row.free;
              return (
                <View key={row.id} style={[s.tableRow, i > 0 && s.tableRowLine]}>
                  <Text style={s.rowLabel}>{t('cmp_' + row.id)}</Text>

                  <View style={s.cellFree}>
                    {free === true ? <IcCheck size={16} color={C.faint} /> : <Text style={s.cellFreeText}>{free}</Text>}
                  </View>

                  <View style={s.cellPro}>
                    {row.pro === true ? <IcCheck size={16} color={C.accent} /> : <Text style={s.cellProText}>{row.pro}</Text>}
                  </View>
                </View>
              );
            })}
          </FadeIn>
        )}

        {/* Те, чого немає в таблиці. Лише правда: наліпки й колекція
            безкоштовні для всіх, тож тут їх немає (App Review 3.1.2). У
            мʼякому пейволі таблиці немає — тоді тут і самі переваги Pro. */}
        <FadeIn delay={90} style={s.benefits}>
          {PRO_BENEFITS.filter((b) => !compact && (intro || b.id === 'support')).map((b) => (
            <View key={b.id} style={s.benefitRow}>
              <View style={s.benefitIcon}>
                <ProIcon name={b.icon} size={20} color={C.accent} />
              </View>
              <Text style={s.benefitText}>{t('pro_' + b.id)}</Text>
            </View>
          ))}
        </FadeIn>
      </ScrollView>

      {/* Дія притиснута донизу — під великий палець */}
      <View style={[s.footer, SHADOW_LG]}>
        {failed ? (
          // Ціни не завантажились: що сталося, що зробити і кнопка, а не
          // мовчазна вимкнена «Перейти на Pro»
          <View accessibilityLiveRegion="polite">
            <Text style={s.failedText}>{t('pricesFailed')}</Text>
            <Text style={s.failedHint}>{t('pricesFailedHint')}</Text>
            <GradBtn title={t('pricesRetry')} onPress={retry} style={{ marginTop: 12 }} />
          </View>
        ) : (
          <>
            <GradBtn
              title={plan?.trialDays ? t('startTrial') : plan?.lifetime ? t('buyLifetime') : t('subscribe')}
              onPress={buy}
              loading={busy}
              disabled={!plan || unavailable}
            />
            {/* Без магазину кажемо це одразу, а не після марного тапу */}
            {noteText ? (
              <Text style={[s.note, note === 'purchasePending' && !unavailable && s.notePending]} numberOfLines={2} accessibilityLiveRegion="polite">
                {noteText}
              </Text>
            ) : null}
            {note === 'purchaseUnclear' && SUPPORT_EMAIL ? (
              <Pressable
                style={s.supportHit}
                hitSlop={LINK_SLOP}
                onPress={() => open('mailto:' + SUPPORT_EMAIL)}
                accessibilityRole="link"
              >
                <Text style={s.supportLink}>{t('pwContactSupport')}</Text>
              </Pressable>
            ) : null}
            {/* Умови поруч із кнопкою покупки завжди (App Review 3.1.2) */}
            <Text style={s.legal}>{legal}</Text>
          </>
        )}
        {/* Вихід без покупки — повноцінна кнопка в один рядок, а не сірий
            дрібний текст, який треба шукати. */}
        {intro ? (
          <Pressable style={s.freeBtn} onPress={onClose} accessibilityRole="button">
            <Text style={s.freeBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {freeLeft > 0 ? t('pwContinueFree', { n: freeLeft }) : t('pwContinueFreeNoScans')}
            </Text>
          </Pressable>
        ) : null}
        <View style={s.legalRow}>
          <Pressable
            style={s.linkHit}
            hitSlop={LINK_SLOP}
            onPress={restore}
            disabled={restoring}
            accessibilityRole="button"
            accessibilityState={{ busy: restoring, disabled: restoring }}
          >
            <Text style={s.legalLink}>{restoring ? t('restoreBusy') : t('restore')}</Text>
          </Pressable>
          <Pressable style={s.linkHit} hitSlop={LINK_SLOP} onPress={() => open(TERMS_URL)} accessibilityRole="link">
            <Text style={s.legalLink}>{t('terms')}</Text>
          </Pressable>
          {PRIVACY_URL ? (
            <Pressable style={s.linkHit} hitSlop={LINK_SLOP} onPress={() => open(PRIVACY_URL)} accessibilityRole="link">
              <Text style={s.legalLink}>{t('privacy')}</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

// Кілька варіантів в одній клітинці: висота — найбільшого з них, видно лише
// index-ий. Невидимі стоять поруч праворуч, за обрізаним краєм, і сховані
// від VoiceOver: шапка не міняє висоти, коли міняється її текст.
function Stable({ index, children }) {
  const items = Children.toArray(children);
  if (items.length < 2) return items[0] || null;
  const order = [index, ...items.map((_, i) => i).filter((i) => i !== index)];
  return (
    <View style={{ flexDirection: 'row', alignSelf: 'stretch', overflow: 'hidden' }}>
      {order.map((i) => {
        const on = i === index;
        return (
          <View
            key={i}
            style={[{ width: '100%', flexShrink: 0 }, !on && { opacity: 0 }]}
            pointerEvents={on ? 'auto' : 'none'}
            accessibilityElementsHidden={!on}
            importantForAccessibility={on ? 'auto' : 'no-hide-descendants'}
            aria-hidden={!on}
          >
            {items[i]}
          </View>
        );
      })}
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

// Ширина колонки «безкоштовно»: «БЕЗКОШТОВНО» капсом має влізти в рядок
const FREE_COL = 96;
const PRO_COL = 66;

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    // Смужка під хрестик: тло екрана, ціль 44 pt
    topBar: {
      height: 52,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      paddingHorizontal: 10,
      backgroundColor: C.bg,
    },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    closeDot: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
    },
    scroll: { paddingHorizontal: 22, paddingTop: 0, paddingBottom: 20 },

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
    titleShort: { ...type(26, F.extra), marginTop: 10 },
    text: {
      color: C.dim,
      ...type(15, F.reg),
      textAlign: 'center',
      marginTop: 8,
      maxWidth: 300,
    },
    textShort: { marginTop: 6, maxWidth: 330 },

    table: {
      marginTop: 22,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    tableHead: { flexDirection: 'row', alignItems: 'flex-end', paddingVertical: 10 },
    colFree: { width: FREE_COL, textAlign: 'center', color: C.dim, ...CAPS, letterSpacing: 0.4 },
    colProWrap: {
      width: PRO_COL,
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
    cellFree: { width: FREE_COL, alignItems: 'center' },
    cellFreeText: { color: C.dim, ...type(14, F.semi, { noLead: true }) },
    cellPro: { width: PRO_COL, alignItems: 'center', backgroundColor: C.accentSoft, paddingVertical: 8 },
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
    // dim, а не faint: «7 днів безкоштовно» — частина умов, ≥ 4.5:1
    planPer: { color: C.dim, ...type(13, F.reg, { noLead: true }), marginTop: 3 },
    planPrice: { color: C.text, ...type(18, F.extra, { noLead: true }) },
    saveText: { color: C.green, ...CAPS, marginTop: 3 },

    bestTag: {
      backgroundColor: C.accentSoft,
      borderRadius: R.pill,
      paddingHorizontal: 8,
      paddingVertical: 3,
    },
    bestTagText: { color: C.accent, ...CAPS, fontSize: 10 },

    // Без пробного періоду — один рядок на місці таймлайну
    today: {
      marginTop: 24,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      backgroundColor: C.card,
      borderRadius: R.lg,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    todayText: { flex: 1, color: C.text, ...type(15, F.bold) },

    footer: {
      backgroundColor: C.card,
      paddingHorizontal: 22,
      paddingTop: 16,
      // App уже додає відступ домашнього індикатора — свій лише невеликий
      paddingBottom: 16,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
    },
    // Юридичний рядок — частина розкриття умов (App Review 3.1.2): дрібний,
    // але читабельний — dim, а не faint (у темній темі faint ледь видно).
    legal: {
      color: C.dim,
      ...type(12, F.reg),
      textAlign: 'center',
      marginTop: 8,
    },
    note: { color: C.red, ...type(13, F.semi), textAlign: 'center', marginTop: 8 },
    notePending: { color: C.dim },
    supportHit: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingVertical: 10, marginTop: -6, marginBottom: -10 },
    supportLink: { color: C.accent, ...type(13, F.bold, { noLead: true }) },
    failedText: { color: C.text, ...type(16, F.bold), textAlign: 'center' },
    failedHint: { color: C.dim, ...type(14, F.reg), textAlign: 'center', marginTop: 4 },
    legalRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 16, marginTop: 2 },
    linkHit: { minHeight: 44, paddingVertical: 10, justifyContent: 'center' },
    legalLink: { color: C.dim, ...type(13, F.semi, { noLead: true }) },
    freeBtn: {
      marginTop: 10,
      minHeight: 44,
      borderRadius: R.lg,
      backgroundColor: C.card2,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      paddingVertical: 8,
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
    tlDate: { color: C.dim, ...type(14, F.semi) },
    tlText: { color: C.dim, ...type(14, F.reg), marginTop: 2 },
  });
