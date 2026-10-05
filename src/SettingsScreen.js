// Налаштування: акаунт, Pro, мови, слово дня, тема, про застосунок, дані.
//
// v1.3: секції, які міняють паралельні потоки, винесено в src/settings/*
// (WodSection, StreakSection, WidgetsSection, ThemeSection, DevSection,
// Footer) — цей файл після цього ніхто, крім інтеграції, не править.
// Підпис кожної секції: ({ ctx, extra }), де
//   ctx = { settings, saveSetting, commitSettings, t, lang, pro, openPaywall,
//           C, s, isDark, themeKey, props, dev }
//     settings / saveSetting / commitSettings — налаштування App і його
//       функції (порожній об'єкт і no-op, якщо App їх не передав);
//     openPaywall(reason, opts) — пейвол App з причиною;
//     s — стилі цього екрана (sectionLabel, switchRow, dimText…);
//     props — усі пропси SettingsScreen (наявні секції беруть звідти те,
//       що брали до винесення: wodEnabled, onToggleWod, themeMode…);
//     dev — { open, setOpen }: діагностику відкривають сім дотиків по футеру;
//   extra = settingsExtra з App.js — нові поля кожен потік додає між своїми
//     маркерами <v13:Wn> там.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import { accountErrorKey, syncErrorKey } from './account';
import { PRIVACY_URL, SUPPORT_EMAIL, TERMS_URL } from './config';
import { formatDate } from './locale';
import { restoreNote } from './purchases';
import { LANGS, flagFor, nameFor } from './speech';
import { IcCheck, IcChevron, IcCloud } from './icons';
import { PCrown } from './ProIcons';
import { Mascot } from './Mascot';
import { FadeIn, Glass, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext } from './motion';
import { F, R, type, useTheme } from './theme';
import WodSection from './settings/WodSection';
import StreakSection from './settings/StreakSection';
import WidgetsSection from './settings/WidgetsSection';
import ThemeSection from './settings/ThemeSection';
import DevSection from './settings/DevSection';
import Footer from './settings/Footer';

// Підпис години — тепер у WodSection; звідси — для наявних імпортів.
export { hourLabel } from './settings/WodSection';

const NOOP = () => {};
const NO_SETTINGS = {};

// Тогл-лист вибору мови: розгортається на ~4 рядки, далі скрол
function LangPicker({ label, hint, value, onChange, C, s }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    layoutNext();
    setOpen(!open);
  }
  function select(code) {
    Haptics.selectionAsync();
    onChange(code);
    layoutNext();
    setOpen(false);
  }

  return (
    <>
      <Text style={s.sectionLabel}>{label}</Text>
      <Glass style={{ padding: 0, overflow: 'hidden' }}>
        <Pressable style={s.pickerHead} onPress={toggle}>
          <Text style={{ fontSize: 22 }}>{flagFor(value)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.pickerValue}>{nameFor(value)}</Text>
            <Text style={s.pickerHint}>{hint}</Text>
          </View>
          <View style={open ? { transform: [{ rotate: '180deg' }] } : null}>
            <IcChevron color={C.dim} />
          </View>
        </Pressable>

        {open ? (
          <ScrollView style={s.list} nestedScrollEnabled showsVerticalScrollIndicator>
            {LANGS.map((l) => {
              const active = value === l.code;
              return (
                <Pressable
                  key={l.code}
                  style={[s.listRow, active && s.listRowActive]}
                  onPress={() => select(l.code)}
                >
                  <Text style={{ fontSize: 18 }}>{l.flag}</Text>
                  <Text style={[s.listName, active && { color: C.text, fontFamily: F.bold }]}>
                    {l.name}
                  </Text>
                  {active ? <IcCheck color={C.accent} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}
      </Glass>
    </>
  );
}

// Мова інтерфейсу — не вибір усередині застосунку, а мова телефону (див.
// src/locale.js). Змінити її лише для LinguaLens iOS дозволяє в Параметри →
// LinguaLens → Мова — туди рядок і веде. Власного перемикача не робимо:
// інакше системні запити (камера, сповіщення) говорили б однією мовою, а
// екрани довкола них — іншою. На вебі Параметрів немає — лише підпис.
function UiLangRow({ lang, t, C, s }) {
  const canOpen = Platform.OS !== 'web';
  function open() {
    Haptics.selectionAsync();
    Linking.openSettings().catch(() => {});
  }
  return (
    <>
      <Text style={s.sectionLabel}>{t('uiLangTitle')}</Text>
      <Glass style={{ padding: 0, overflow: 'hidden' }}>
        <Pressable
          style={s.pickerHead}
          onPress={canOpen ? open : undefined}
          disabled={!canOpen}
          accessibilityRole={canOpen ? 'button' : 'text'}
          accessibilityLabel={`${t('uiLangTitle')}: ${nameFor(lang)}`}
          accessibilityHint={t('uiLangHint')}
        >
          <Text style={{ fontSize: 22 }}>{flagFor(lang)}</Text>
          <View style={{ flex: 1 }}>
            <Text style={s.pickerValue}>{nameFor(lang)}</Text>
            <Text style={s.pickerHint}>{t('uiLangHint')}</Text>
          </View>
          {canOpen ? (
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <IcChevron color={C.faint} />
            </View>
          ) : null}
        </Pressable>
      </Glass>
    </>
  );
}

// «Синхронізовано 5 хвилин тому». Хвилини й години — відносно, давніше —
// датою: «3 дні тому» для резервної копії менш корисне, ніж конкретний день.
export function syncedLabel(at, now, t, lang) {
  if (!at) return t('syncedNever');
  const min = Math.floor(Math.max(0, now - at) / 60000);
  if (min < 1) return t('syncedJustNow');
  if (min < 60) return t('syncedMinutes', { n: min });
  if (min < 24 * 60) return t('syncedHours', { n: Math.floor(min / 60) });
  return t('syncedOn', { d: formatDate(at, lang) });
}

// Акаунт Apple. Без входу — що він дає і офіційна кнопка Apple (HIG вимагає
// саме її: системний вигляд, локалізований текст, доступність з коробки).
// Після входу — коли востаннє синхронізовано, «Синхронізувати зараз» і вихід.
function AccountCard({ account, sync, pro, onSignIn, onSignOut, onSyncNow, lang, t, C, isDark, s }) {
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(Date.now);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );

  // «N хвилин тому» має старіти, поки екран відкритий.
  useEffect(() => {
    if (!account.signedIn) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, [account.signedIn, sync?.at]);

  // Помилку кажемо одним рядком під кнопкою, без діалогу. VoiceOver
  // оголошує її сам: рядок з'являється не там, де зараз фокус.
  function fail(key) {
    const msg = key ? t(key) : null;
    setError(msg);
    if (msg) AccessibilityInfo.announceForAccessibility?.(msg);
  }

  async function signIn() {
    if (busy) return;
    fail(null);
    setBusy(true);
    try {
      const res = await onSignIn();
      if (res) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      if (alive.current) fail(accountErrorKey(e?.code));
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  async function signOut(force) {
    setLeaving(true);
    try {
      await onSignOut({ force });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      // Дещо ще не синхронізовано: питаємо вдруге, бо вихід очищає телефон
      // і ці зміни пропали б. Причину називаємо справжню: сервер недоступний
      // чи словник уже на стелі акаунта (тоді мережа ні до чого).
      if (e?.code === 'UNSYNCED') {
        Alert.alert(t('signOutUnsyncedTitle'), t(e.reason === 'DICT_FULL' ? 'signOutUnsyncedFullMsg' : 'signOutUnsyncedMsg'), [
          { text: t('cancel'), style: 'cancel' },
          { text: t('signOutAnyway'), style: 'destructive', onPress: () => signOut(true) },
        ]);
      }
    } finally {
      if (alive.current) setLeaving(false);
    }
  }

  function confirmSignOut() {
    // Pro прив'язаний до акаунта: на цьому телефоні після виходу його не
    // буде, доки людина не ввійде знову. Кажемо про це, щоб не лякати.
    Alert.alert(t('signOutTitle'), t(pro ? 'signOutMsgPro' : 'signOutMsg'), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('signOut'), style: 'destructive', onPress: () => signOut(false) },
    ]);
  }

  if (!account.signedIn) {
    return (
      <>
        <Text style={s.sectionLabel}>{t('accountLabel')}</Text>
        <Glass>
          <View style={s.acctHead}>
            <View style={s.acctIcon}>
              <IcCloud size={22} color={C.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.switchTitle}>{t('accountTitle')}</Text>
              <Text style={s.dimText}>{t('accountText')}</Text>
            </View>
          </View>
          {busy ? (
            // Та сама висота, що в кнопки: картка не підстрибує.
            <View style={[s.appleBtn, s.appleBusy]} accessible accessibilityLabel={t('accountSigningIn')}>
              <ActivityIndicator color={C.dim} />
            </View>
          ) : (
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={
                isDark ? AppleAuthentication.AppleAuthenticationButtonStyle.WHITE : AppleAuthentication.AppleAuthenticationButtonStyle.BLACK
              }
              cornerRadius={R.lg}
              style={s.appleBtn}
              onPress={signIn}
            />
          )}
          {error ? <Text style={s.acctError}>{error}</Text> : null}
        </Glass>
      </>
    );
  }

  const syncing = sync?.status === 'syncing';
  const syncError = sync?.status === 'error' ? syncErrorKey(sync.error) : null;
  return (
    <>
      <Text style={s.sectionLabel}>{t('accountLabel')}</Text>
      <Glass>
        <View style={s.acctHead}>
          <View style={s.acctIcon}>
            <IcCloud size={22} color={C.accent} done />
          </View>
          {/* Фонова синхронізація, що не вдалась, — не аварія: наступна
              спроба буде сама. Тому рядок тихий, а не червоний. */}
          <View style={{ flex: 1 }} accessible>
            <Text style={s.switchTitle}>{t('accountSignedIn')}</Text>
            <Text style={s.dimText}>{syncing ? t('syncing') : syncedLabel(sync?.at, now, t, lang)}</Text>
            {syncError && !syncing ? <Text style={s.syncNote}>{t(syncError)}</Text> : null}
          </View>
        </View>
        {/* Під час синхронізації кнопка не тьмяніє (спінер має бути видно),
            а просто нічого не робить. */}
        <Press
          style={s.syncBtn}
          onPress={syncing ? undefined : onSyncNow}
          disabled={leaving}
          accessibilityLabel={t('syncNow')}
          accessibilityState={{ busy: syncing, disabled: syncing || leaving }}
        >
          {syncing ? <ActivityIndicator color={C.accent} size="small" /> : <Text style={s.syncBtnText}>{t('syncNow')}</Text>}
        </Press>
        <View style={s.sepInner} />
        <Press
          style={s.signOutBtn}
          onPress={confirmSignOut}
          disabled={leaving}
          accessibilityLabel={t('signOut')}
          accessibilityState={{ busy: leaving, disabled: leaving }}
        >
          {leaving ? <ActivityIndicator color={C.red} size="small" /> : <Text style={s.dangerText}>{t('signOut')}</Text>}
        </Press>
      </Glass>
    </>
  );
}

export default function SettingsScreen(props) {
  const {
    targetLang,
    onSetLang,
    nativeLang,
    onSetNative,
    // Мова, якою зараз говорить інтерфейс (мова телефону): для рядка «Мова
    // інтерфейсу» і для дат.
    uiLang = 'en',
    themeKey,
    themeMode,
    onSetTheme,
    wordsCount,
    scenesCount = 0,
    onClearAll,
    onEraseEverything,
    onReplayOnb,
    onDevReset,
    wodEnabled,
    onToggleWod,
    wodHour,
    onSetWodHour,
    sub,
    onOpenPaywall,
    onManageSub,
    onRestore,
    account,
    sync,
    onSignIn,
    onSignOut,
    onSyncNow,
    profile = null,
    onEditProfile,
    // «Анонімна статистика» (src/analytics.js): рядок є, лише коли збірка
    // взагалі має ключ PostHog — інакше перемикати нічого.
    analyticsAvailable = false,
    analyticsOn = true,
    onToggleAnalytics,
    // v1.3 — для секцій src/settings/* (див. шапку файлу)
    settings = NO_SETTINGS,
    saveSetting = NOOP,
    commitSettings = NOOP,
    openPaywall,
    extra = NO_SETTINGS,
    t,
  } = props;
  const { C, T, isDark } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  // Без кнопки Apple (веб, Android) про акаунт мовчимо; хто вже увійшов —
  // бачить свій стан будь-де.
  const showAccount = !!(account?.signedIn || account?.available);
  const synced = !!account?.signedIn;

  // Діагностику відкривають сім дотиків по футеру (Footer → DevSection)
  const [devOpen, setDevOpen] = useState(false);

  // Спільне для всіх секцій src/settings/* (див. шапку файлу). Без
  // openPaywall від App пейвол відкриває наявний onOpenPaywall (причина info).
  const ctx = {
    settings,
    saveSetting,
    commitSettings,
    t,
    lang: uiLang,
    pro: !!sub?.pro,
    openPaywall: openPaywall || ((_reason) => onOpenPaywall?.()),
    C,
    s,
    isDark,
    themeKey,
    props,
    dev: { open: devOpen, setOpen: setDevOpen },
  };

  // В акаунті видалення розійдеться на всі iPhone — кажемо про це прямо.
  function confirmClear() {
    // Сцени йдуть разом зі словами — кажемо про це, лише коли вони є
    const msg = synced ? (scenesCount ? 'clearMsgSyncedScenes' : 'clearMsgSynced') : scenesCount ? 'clearMsgScenes' : 'clearMsg';
    Alert.alert(t('clearTitle'), t(msg, { n: wordsCount }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clear'), style: 'destructive', onPress: onClearAll },
    ]);
  }

  // Стерти все — незворотне, тож два кроки: діалог і лише потім запит.
  // Сервер має бути досяжний: інакше людина думала б, що її дані стерто.
  function confirmErase() {
    Alert.alert(t('eraseTitle'), t(synced ? 'eraseMsgAccount' : 'eraseMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('eraseConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await onEraseEverything();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (e) {
            // «Немає зв'язку» — лише коли його справді немає; інакше сервер
            // відповів помилкою, і порада перевірити інтернет збивала б з пантелику.
            const offline = e?.code === 'OFFLINE' || e?.code === 'TIMEOUT';
            Alert.alert(offline ? t('eraseFail') : t('eraseServerFail'));
          }
        },
      },
    ]);
  }

  async function restore() {
    Haptics.selectionAsync();
    const next = await onRestore();
    Alert.alert(t(restoreNote(next)));
  }

  function openUrl(url) {
    if (url) Linking.openURL(url).catch(() => {});
  }

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: UNDER_TAB + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[T.largeTitle, s.title]} accessibilityRole="header">
        {t('setTitle')}
      </Text>

      <FadeIn>
        {/* Акаунт — найперше: від нього залежить, чи переживуть слова втрату
            телефона. Вхід необов'язковий, тож це одна спокійна картка. */}
        {showAccount ? (
          <AccountCard
            account={account}
            sync={sync}
            pro={!!sub?.pro}
            onSignIn={onSignIn}
            onSignOut={onSignOut}
            onSyncNow={onSyncNow}
            lang={uiLang}
            t={t}
            C={C}
            isDark={isDark}
            s={s}
          />
        ) : null}

        {/* Pro — одразу далі. Не тому, що ми жадібні, а тому що це єдине
            місце, де людина може дізнатись про межі й керувати підпискою.
            Тап відкриває Customer Center від RevenueCat (скасування,
            повернення коштів, відновлення); «назавжди» нічого не продовжує,
            тож там — «Покупки й підтримка», а не «Керувати підпискою». */}
        {sub?.pro ? (
          <Press style={[s.proCard, showAccount && s.afterAccount]} onPress={onManageSub}>
            <View style={s.proIconWrap}>
              <PCrown size={22} color={C.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.proTitle}>{sub.lifetime ? t('proLifetime') : sub.trial ? t('proTrial') : t('proActive')}</Text>
              <Text style={s.proHint}>
                {!sub.lifetime && sub.until
                  ? t('proUntil', { d: formatDate(sub.until, uiLang, { day: 'numeric', month: 'long', year: 'numeric' }) }) + ' · '
                  : ''}
                {sub.lifetime ? t('managePurchases') : t('managePro')}
              </Text>
            </View>
            <IcChevron color={C.faint} />
          </Press>
        ) : (
          <Press style={[s.proCardOff, showAccount && s.afterAccount]} onPress={onOpenPaywall}>
            <View style={s.proIconWrap}>
              <PCrown size={22} color={C.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.proTitle}>{t('getPro')}</Text>
              <Text style={s.proHint}>{t('getProHint')}</Text>
            </View>
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <IcChevron color={C.faint} />
            </View>
          </Press>
        )}

        {/* Мови */}
        <LangPicker
          label={t('learnLang')}
          hint={t('learnLangHint')}
          value={targetLang}
          onChange={onSetLang}
          C={C}
          s={s}
        />
        <LangPicker
          label={t('myLang')}
          // «Моя мова» — лише мова перекладів: інтерфейс від неї не залежить
          hint={t('myLangHint')}
          value={nativeLang}
          onChange={onSetNative}
          C={C}
          s={s}
        />
        <UiLangRow lang={uiLang} t={t} C={C} s={s} />

        {/* Слово дня (W2), серія (W1), віджети (W2), тема (W5) — секції-файли
            src/settings/*: кожен потік править лише свій файл. */}
        <WodSection ctx={ctx} extra={extra} />
        <StreakSection ctx={ctx} extra={extra} />
        <WidgetsSection ctx={ctx} extra={extra} />
        <ThemeSection ctx={ctx} extra={extra} />

        {/* Про застосунок */}
        <Text style={s.sectionLabel}>{t('about')}</Text>
        <Glass style={{ padding: 0, overflow: 'hidden' }}>
          <Pressable style={s.linkRow} onPress={onReplayOnb}>
            <Mascot pose="wave" size={34} />
            <Text style={[s.linkText, { flex: 1 }]}>{t('replayOnb')}</Text>
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <IcChevron color={C.faint} />
            </View>
          </Pressable>
          {/* Відновлення — для тих, у кого Pro ще немає (новий телефон,
              перевстановлення). З Pro воно є в Customer Center. */}
          {sub?.pro ? null : (
            <>
              <View style={s.sep} />
              <Pressable style={s.linkRow} onPress={restore}>
                <Text style={[s.linkText, { flex: 1 }]}>{t('restore')}</Text>
                <View style={{ transform: [{ rotate: '-90deg' }] }}>
                  <IcChevron color={C.faint} />
                </View>
              </Pressable>
            </>
          )}
          {PRIVACY_URL ? (
            <>
              <View style={s.sep} />
              <Pressable style={s.linkRow} onPress={() => openUrl(PRIVACY_URL)}>
                <Text style={[s.linkText, { flex: 1 }]}>{t('privacy')}</Text>
                <View style={{ transform: [{ rotate: '-90deg' }] }}>
                  <IcChevron color={C.faint} />
                </View>
              </Pressable>
            </>
          ) : null}
          <View style={s.sep} />
          <Pressable style={s.linkRow} onPress={() => openUrl(TERMS_URL)}>
            <Text style={[s.linkText, { flex: 1 }]}>{t('terms')}</Text>
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <IcChevron color={C.faint} />
            </View>
          </Pressable>
          {SUPPORT_EMAIL ? (
            <>
              <View style={s.sep} />
              <Pressable style={s.linkRow} onPress={() => openUrl('mailto:' + SUPPORT_EMAIL)}>
                <Text style={[s.linkText, { flex: 1 }]}>{t('support')}</Text>
                <View style={{ transform: [{ rotate: '-90deg' }] }}>
                  <IcChevron color={C.faint} />
                </View>
              </Pressable>
            </>
          ) : null}
        </Glass>

        {/* Дані */}
        <Text style={s.sectionLabel}>{t('data')}</Text>
        <Glass>
          {/* Статистика — першою в «Даних»: це теж про те, що йде з телефона.
              Увімкнена за замовчуванням, вимикається одним дотиком. */}
          {analyticsAvailable ? (
            <>
              <View style={s.switchRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={s.switchTitle}>{t('analyticsTitle')}</Text>
                  <Text style={s.dimText}>{t('analyticsHint')}</Text>
                </View>
                <Switch
                  value={analyticsOn}
                  onValueChange={onToggleAnalytics}
                  accessibilityLabel={t('analyticsTitle')}
                  trackColor={{ false: C.card3, true: C.accent }}
                  thumbColor="#fff"
                />
              </View>
              <View style={s.sepInner} />
            </>
          ) : null}
          <Text style={s.dimText}>{t('inDict', { n: wordsCount })}</Text>
          <Press
            style={[s.dangerBtn, !wordsCount && { opacity: 0.4 }]}
            onPress={confirmClear}
            disabled={!wordsCount}
          >
            <Text style={s.dangerText}>{t('clearDict')}</Text>
          </Press>
          <View style={s.sepInner} />
          <Text style={s.dimText}>{t(synced ? 'eraseHintAccount' : 'eraseHint')}</Text>
          <Press style={s.dangerBtn} onPress={confirmErase}>
            <Text style={[s.dangerText, { color: C.dim }]}>{t('eraseAll')}</Text>
          </Press>
        </Glass>

        {/* Діагностика (сім дотиків по футеру; у розробці — «Почати з нуля»)
            і футер з іконкою застосунку */}
        <DevSection ctx={ctx} extra={extra} />
        <Footer ctx={ctx} extra={extra} />
      </FadeIn>
    </ScrollView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20 },
    // кегль і накреслення — T.largeTitle, як на інших вкладках
    title: { marginBottom: 2 },
    sectionLabel: {
      color: C.dim,
      fontSize: 12,
      fontFamily: F.extra,
      textTransform: 'uppercase',
      letterSpacing: 1,
      marginBottom: 8,
      marginTop: 20,
      marginLeft: 4,
    },
    dimText: { color: C.dim, fontSize: 13, lineHeight: 19, fontFamily: F.reg },

    proCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: C.accentSoft,
      borderRadius: R.lg,
      padding: 15,
      marginBottom: 6,
    },
    proCardOff: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 13,
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 15,
      marginBottom: 6,
    },
    proIconWrap: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    afterAccount: { marginTop: 14 },
    proTitle: { color: C.text, ...type(16, F.bold, { noLead: true }) },
    proHint: { color: C.dim, ...type(13, F.reg, { noLead: true }), marginTop: 2 },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: C.sep, marginLeft: 14 },
    sepInner: { height: StyleSheet.hairlineWidth, backgroundColor: C.sep, marginVertical: 14 },
    linkRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14 },
    linkText: { color: C.text, fontSize: 16, fontFamily: F.semi },

    pickerHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
    pickerValue: { color: C.text, fontSize: 16, letterSpacing: -0.1, fontFamily: F.bold },
    pickerHint: { color: C.dim, fontSize: 12, marginTop: 2, fontFamily: F.reg },
    list: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.sep,
      paddingVertical: 6,
      maxHeight: 196,
    },
    listRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
    listRowActive: { backgroundColor: C.accentSoft },
    listName: { color: C.text, fontSize: 15, flex: 1, opacity: 0.85, fontFamily: F.semi },

    switchRow: { flexDirection: 'row', alignItems: 'center' },
    profileRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
    switchTitle: { color: C.text, fontSize: 16, letterSpacing: -0.1, fontFamily: F.bold, marginBottom: 3 },
    // П'ять годин в один ряд навіть на SE: кожна — рівна частка ширини,
    // 44 pt заввишки (мінімум Apple для пальця)
    hourRow: { flexDirection: 'row', gap: 6, marginTop: 10 },
    hourChip: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: R.pill,
      backgroundColor: C.card2,
    },
    hourChipActive: { backgroundColor: C.accent },
    hourText: { color: C.dim, fontSize: 13, fontFamily: F.bold },

    serverUrl: {
      color: C.dim,
      fontSize: 13,
      fontFamily: F.semi,
      marginTop: 12,
      backgroundColor: C.input,
      borderRadius: R.sm,
      paddingHorizontal: 12,
      paddingVertical: 10,
      overflow: 'hidden',
    },
    checkBtn: { backgroundColor: C.accent, borderRadius: R.md, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
    checkBtnText: { color: C.onAccent, fontSize: 15, fontFamily: F.bold },
    okText: { color: C.green, fontSize: 13, marginTop: 10, fontFamily: F.bold },
    badText: { color: C.red, fontSize: 13, marginTop: 10, lineHeight: 19, fontFamily: F.semi },

    dangerBtn: { marginTop: 10, paddingVertical: 10, alignItems: 'center' },

    acctHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 13 },
    acctIcon: {
      width: 40,
      height: 40,
      borderRadius: 13,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Офіційна кнопка Apple: на всю ширину, 50 pt — у межах HIG (від 30 pt).
    // Колір і радіус задаються її власними пропсами, не стилем.
    appleBtn: { width: '100%', height: 50, marginTop: 16 },
    appleBusy: { alignItems: 'center', justifyContent: 'center' },
    acctError: { color: C.red, ...type(13, F.semi), marginTop: 10 },
    syncNote: { color: C.dim, ...type(13, F.bold), marginTop: 3 },
    syncBtn: {
      backgroundColor: C.card2,
      borderRadius: R.md,
      minHeight: 46,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 14,
    },
    syncBtnText: { color: C.text, ...type(15, F.bold, { noLead: true }) },
    signOutBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    dangerText: { color: C.red, fontSize: 16, letterSpacing: -0.1, fontFamily: F.semi },
  });
