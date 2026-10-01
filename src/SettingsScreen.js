// Налаштування: акаунт, мови, слово дня, тема, сервер, дані.
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { checkServer } from './api';
import { PRIVACY_URL, SERVER_SOURCE, SERVER_URL, SUPPORT_EMAIL, TERMS_URL } from './config';
import { formatDate } from './locale';
import { restoreNote } from './purchases';
import { version as APP_VERSION } from '../package.json';
import { LANGS, flagFor, nameFor } from './speech';
import { IcCheck, IcChevron } from './icons';
import { LogoRow } from './Logo';
import { PCrown } from './ProIcons';
import { Mascot } from './Mascot';
import { FadeIn, Glass, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext } from './motion';
import { F, R, THEME_DEFS, type, useTheme } from './theme';

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

export default function SettingsScreen({
  targetLang,
  onSetLang,
  nativeLang,
  onSetNative,
  themeKey,
  themeMode,
  onSetTheme,
  wordsCount,
  onClearAll,
  onEraseEverything,
  onReplayOnb,
  wodEnabled,
  onToggleWod,
  wodHour,
  onSetWodHour,
  sub,
  onOpenPaywall,
  onManageSub,
  onRestore,
  t,
}) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [checking, setChecking] = useState(false);
  const [devOpen, setDevOpen] = useState(false);
  const tapCount = useRef(0);
  const [status, setStatus] = useState(null);

  async function check() {
    setChecking(true);
    setStatus(null);
    const res = await checkServer();
    setStatus(res);
    setChecking(false);
  }

  function confirmClear() {
    Alert.alert(t('clearTitle'), t('clearMsg', { n: wordsCount }), [
      { text: t('cancel'), style: 'cancel' },
      { text: t('clear'), style: 'destructive', onPress: onClearAll },
    ]);
  }

  // Стерти все — незворотне, тож два кроки: діалог і лише потім запит.
  // Сервер має бути досяжний: інакше людина думала б, що її дані стерто.
  function confirmErase() {
    Alert.alert(t('eraseTitle'), t('eraseMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('eraseConfirm'),
        style: 'destructive',
        onPress: async () => {
          try {
            await onEraseEverything();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          } catch (_) {
            Alert.alert(t('eraseFail'));
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

  const HOURS = [8, 10, 12, 18, 20];

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={{ paddingBottom: UNDER_TAB + 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={s.title}>{t('setTitle')}</Text>

      <FadeIn>
        {/* Pro — перший блок. Не тому, що ми жадібні, а тому що це єдине
            місце, де людина може дізнатись про межі й керувати підпискою. */}
        {sub?.pro ? (
          <Press style={s.proCard} onPress={onManageSub}>
            <View style={s.proIconWrap}>
              <PCrown size={22} color={C.onAccent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.proTitle}>{sub.trial ? t('proTrial') : t('proActive')}</Text>
              <Text style={s.proHint}>
                {sub.until ? t('proUntil', { d: formatDate(sub.until, nativeLang, { day: 'numeric', month: 'long', year: 'numeric' }) }) + ' · ' : ''}
                {t('managePro')}
              </Text>
            </View>
            <IcChevron color={C.faint} />
          </Press>
        ) : (
          <Press style={s.proCardOff} onPress={onOpenPaywall}>
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
          hint={t('myLangHint')}
          value={nativeLang}
          onChange={onSetNative}
          C={C}
          s={s}
        />

        {/* Слово дня */}
        <Text style={s.sectionLabel}>{t('wordOfDay')}</Text>
        <Glass>
          <View style={s.switchRow}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={s.switchTitle}>{t('dailyPush')}</Text>
              <Text style={s.dimText}>{t('dailyPushHint')}</Text>
            </View>
            <Switch
              value={wodEnabled}
              onValueChange={onToggleWod}
              trackColor={{ false: C.card3, true: C.accent }}
              thumbColor="#fff"
            />
          </View>

          {wodEnabled ? (
            <>
              <View style={s.sepInner} />
              <Text style={s.dimText}>{t('pushTime')}</Text>
              <View style={s.hourRow}>
                {HOURS.map((h) => {
                  const active = wodHour === h;
                  return (
                    <Pressable
                      key={h}
                      style={[s.hourChip, active && s.hourChipActive]}
                      onPress={() => {
                        Haptics.selectionAsync();
                        onSetWodHour(h);
                      }}
                    >
                      <Text style={[s.hourText, active && { color: C.onAccent, fontFamily: F.extra }]}>
                        {String(h).padStart(2, '0')}:00
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}
        </Glass>

        {/* Тема */}
        <Text style={s.sectionLabel}>{t('themeLabel')}</Text>
        {/* Три варіанти замість галереї з восьми. Менше вибору — менше рішень
            для юзера, і кожна тема доведена до ладу, а не «ще один відтінок». */}
        <View style={s.themeRow}>
          {[{ key: 'system', name: t('themeAuto') }, ...THEME_DEFS].map((th) => {
            const active = themeMode === th.key;
            const isAuto = th.key === 'system';
            return (
              <Pressable
                key={th.key}
                style={s.themeCell}
                onPress={() => {
                  Haptics.selectionAsync();
                  onSetTheme(th.key);
                }}
              >
                <View
                  style={[
                    s.swatch,
                    { backgroundColor: isAuto ? '#FAF8F4' : th.swatch },
                    active && { borderColor: C.accent, borderWidth: 2.5 },
                  ]}
                >
                  {/* «Авто» — половина плитки темна: світло й темрява разом */}
                  {isAuto ? <View style={s.swatchHalf} /> : null}
                  <View
                    style={[
                      s.swatchDot,
                      { backgroundColor: isAuto ? '#5B4FD6' : th.accent },
                    ]}
                  />
                </View>
                <Text
                  style={[s.themeName, active && { color: C.text, fontFamily: F.bold }]}
                  numberOfLines={1}
                >
                  {isAuto ? th.name : t(th.key === 'dark' ? 'themeDark' : 'themeLight')}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
          <View style={s.sep} />
          <Pressable style={s.linkRow} onPress={restore}>
            <Text style={[s.linkText, { flex: 1 }]}>{t('restore')}</Text>
            <View style={{ transform: [{ rotate: '-90deg' }] }}>
              <IcChevron color={C.faint} />
            </View>
          </Pressable>
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
          <Text style={s.dimText}>{t('inDict', { n: wordsCount })}</Text>
          <Press
            style={[s.dangerBtn, !wordsCount && { opacity: 0.4 }]}
            onPress={confirmClear}
            disabled={!wordsCount}
          >
            <Text style={s.dangerText}>{t('clearDict')}</Text>
          </Press>
          <View style={s.sepInner} />
          <Text style={s.dimText}>{t('eraseHint')}</Text>
          <Press style={s.dangerBtn} onPress={confirmErase}>
            <Text style={[s.dangerText, { color: C.faint }]}>{t('eraseAll')}</Text>
          </Press>
        </Glass>

        {/* Технічна панель. Звичайний користувач її не бачить і не має бачити:
            адреса сервера — наша кухня, а не його справа. Відкривається сімома
            дотиками по логотипу — класичний прихований жест для діагностики. */}
        {devOpen ? (
          <>
            <Text style={s.sectionLabel}>Діагностика</Text>
            <Glass>
              <Text style={s.serverUrl}>
                {SERVER_URL} · {SERVER_SOURCE}
              </Text>
              <Press style={s.checkBtn} onPress={check} disabled={checking}>
                {checking ? (
                  <ActivityIndicator color={C.onAccent} size="small" />
                ) : (
                  <Text style={s.checkBtnText}>{t('checkConn')}</Text>
                )}
              </Press>
              {status ? (
                status.ok ? (
                  <Text style={s.okText}>{t('srvOnline', { p: status.provider })}</Text>
                ) : (
                  <Text style={s.badText}>{t('srvOffline')}</Text>
                )
              ) : null}
            </Glass>
          </>
        ) : null}

        <Pressable
          style={{ alignItems: 'center', marginTop: 26, gap: 6 }}
          onPress={() => {
            const n = tapCount.current + 1;
            tapCount.current = n;
            if (n >= 7) {
              tapCount.current = 0;
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setDevOpen((v) => !v);
            }
          }}
        >
          <LogoRow size={26} />
          <Text style={s.footer}>{t('footer')}</Text>
          <Text style={s.version}>v{APP_VERSION}</Text>
        </Pressable>
      </FadeIn>
    </ScrollView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20 },
    title: { color: C.text, fontSize: 32, fontFamily: F.extra },
    sectionLabel: {
      color: C.faint,
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
    switchTitle: { color: C.text, fontSize: 16, letterSpacing: -0.1, fontFamily: F.bold, marginBottom: 3 },
    hourRow: { flexDirection: 'row', gap: 7, marginTop: 10, flexWrap: 'wrap' },
    hourChip: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: R.pill,
      backgroundColor: C.card2,
    },
    hourChipActive: { backgroundColor: C.accent },
    hourText: { color: C.dim, fontSize: 13, fontFamily: F.bold },

    themeRow: { flexDirection: 'row', gap: 10 },
    themeCell: { flex: 1, alignItems: 'center', gap: 8 },
    // Тонка рамка завжди: світла плитка (і світла половина «Авто») інакше
    // зливається з крейдяним тлом, і плитка виглядає обрізаною.
    swatch: {
      width: '100%',
      aspectRatio: 1.35,
      borderRadius: R.lg,
      borderWidth: 1,
      borderColor: C.sep,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    swatchDot: { width: 26, height: 26, borderRadius: 13 },
    // права половина «авто»-свотча темна — світло/темрява в одній плитці
    swatchHalf: {
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '50%',
      backgroundColor: '#151412',
    },
    themeName: { color: C.dim, ...type(13, F.semi, { noLead: true }), textAlign: 'center' },

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
    dangerText: { color: C.red, fontSize: 16, letterSpacing: -0.1, fontFamily: F.semi },
    version: { color: C.faint, fontSize: 11, fontFamily: F.reg, marginTop: 2 },
    footer: { color: C.faint, fontSize: 12, textAlign: 'center', fontFamily: F.semi },
  });
