// Вибір мови: список із пошуком (onboarding.md §5.2, макети
// onboarding-act1-uk.png 2–3).
//
// LangList — сам список: поле пошуку, «Популярні» (під мову перекладу) і
// «Усі мови» за абеткою мовою інтерфейсу; із запитом — лише збіги. Рядок:
// прапорець, ендонім, праворуч назва мовою інтерфейсу дрібно; вибраний — на
// акцентному тлі з галочкою. Мова, якою вибирати не можна (мова перекладу
// для мови навчання і навпаки), лишається в списку блідою, з підписом
// чому, і не натискається. Його кладе в себе крок «Яку мову вчиш?» в
// онбордингу й аркуш нижче.
//
// LangSheet — той самий список в аркуші знизу. Пропси старого аркуша
// (visible, current, native, onPick, onClose, t — так його відкриває чип
// мови в сканері) працюють як раніше: обрати мову навчання, мова перекладу
// вибору не дає. Нові — необов’язкові: mode 'native' — вибір мови перекладу
// («Перекладати на»): current тоді — мова перекладу, other — мова навчання
// (її не обрати); phone — мова телефона (підпис «з телефона»); title /
// text — свій заголовок; ui — мова інтерфейсу (сортування й назви).
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { LANGS } from './speech';
import { langLabel, langSections, sortLangs } from './langPick';
import { phoneUiLang } from './locale';
import { IcCheck, IcClose, IcSearch } from './icons';
import { CAPS, F, R, type, useTheme } from './theme';

// Порядок рядків старого аркуша: поточна згори, мова перекладів прихована.
// Лишається для тих, хто будує свій список (і для старих тестів).
export function langOptions(current, native) {
  const rest = LANGS.filter((l) => l.code !== current && l.code !== native);
  const top = LANGS.find((l) => l.code === current);
  return top ? [top, ...rest] : rest;
}

const byCode = Object.fromEntries(LANGS.map((l) => [l.code, l]));

// Один рядок мови. note — підпис праворуч замість назви мовою інтерфейсу
// («з телефона», «твоя мова перекладу»).
function LangRow({ code, ui, t, on, disabled, note, onPress, first, s, C }) {
  const l = byCode[code];
  const local = langLabel(code, t, ui);
  const right = note || (local.toLocaleLowerCase(ui) === l.name.toLocaleLowerCase(ui) ? '' : local);
  return (
    <Pressable
      testID={'lang-' + code}
      style={({ pressed }) => [s.row, !first && s.rowSep, on && s.rowOn, pressed && !disabled && !on && { backgroundColor: C.card2 }, disabled && s.rowOff]}
      onPress={disabled ? undefined : () => onPress(code)}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ checked: on, disabled: !!disabled }}
      accessibilityLabel={[l.name, local !== l.name ? local : null, note].filter(Boolean).join(', ')}
    >
      <Text style={s.flag}>{l.flag}</Text>
      <Text style={[s.name, on && { color: C.accent }]} numberOfLines={1}>
        {l.name}
      </Text>
      {right ? (
        <Text style={[s.local, on && { color: C.accent }]} numberOfLines={1}>
          {right}
        </Text>
      ) : null}
      {on ? (
        <View style={s.check}>
          <IcCheck size={13} color={C.onAccent} />
        </View>
      ) : null}
    </Pressable>
  );
}

function Group({ codes, render, s }) {
  if (!codes.length) return null;
  return <View style={s.group}>{codes.map((c, i) => render(c, i === 0))}</View>;
}

// value — обрана мова (null — ще нічого); off — мова, якої тут обрати не
// можна, offNote — чому; phone — мова телефона (підпис «з телефона»);
// mode 'target' — з «Популярними» під мову перекладу (popularFor), 'native'
// — просто абетка з поточною згори.
export function LangList({ value = null, off = null, offNote = '', phone = null, popularFor = null, mode = 'target', onPick, t, ui, search = true }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const lang = ui || phoneUiLang();
  const [q, setQ] = useState('');

  function pick(code) {
    Haptics.selectionAsync();
    onPick(code);
  }

  const row = (code, first) => (
    <LangRow
      key={code}
      code={code}
      ui={lang}
      t={t}
      first={first}
      on={code === value}
      disabled={code === off}
      note={code === off ? offNote : code === phone ? t('obNativePhone') : ''}
      onPress={pick}
      s={s}
      C={C}
    />
  );

  let body;
  if (mode === 'native' && !q.trim()) {
    // Мова перекладу: поточна (чи мова телефона) згори, далі абетка
    const head = value || phone;
    const all = sortLangs(lang, t).filter((c) => c !== head);
    body = <Group codes={head ? [head, ...all] : all} render={row} s={s} />;
  } else {
    const sec = langSections({ native: popularFor, query: q, t, ui: lang, popular: mode === 'target' });
    if (sec.results) {
      body = sec.results.length ? (
        <Group codes={sec.results} render={row} s={s} />
      ) : (
        <>
          <Text style={s.none} accessibilityLiveRegion="polite">
            {t('obLangNone')}
          </Text>
          <Group codes={sortLangs(lang, t)} render={row} s={s} />
        </>
      );
    } else {
      body = (
        <>
          {sec.popular.length ? <Text style={s.caps}>{t('obLangPopular')}</Text> : null}
          <Group codes={sec.popular} render={row} s={s} />
          <Text style={s.caps}>{t('obLangAll')}</Text>
          <Group codes={sec.all} render={row} s={s} />
        </>
      );
    }
  }

  return (
    <View accessibilityRole="radiogroup">
      {search ? (
        <View style={s.search}>
          <IcSearch size={18} color={C.faint} />
          <TextInput
            testID="lang-search"
            style={s.searchInput}
            value={q}
            onChangeText={setQ}
            placeholder={t('obLangSearch')}
            placeholderTextColor={C.faint}
            accessibilityLabel={t('obLangSearch')}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="never"
            selectionColor={C.accent}
          />
          {q ? (
            <Pressable onPress={() => setQ('')} hitSlop={10} accessibilityRole="button" accessibilityLabel={t('obLangSearchClear')} style={s.clear}>
              <IcClose size={14} color={C.dim} />
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {body}
    </View>
  );
}

export default function LangSheet({ visible, current, native, other, onPick, onClose, t, mode = 'target', phone = null, title, text, ui }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const nativeMode = mode === 'native';
  // Мову навчання вибирають без мови перекладу, і навпаки
  const off = (other !== undefined ? other : nativeMode ? null : native) || null;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Тап повз аркуш — закрити. VoiceOver тло пропускає: для нього є
          хрестик і жест виходу. */}
      <Pressable style={s.backdrop} onPress={onClose} accessible={false} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.kav} pointerEvents="box-none">
        <View style={s.sheet} accessibilityViewIsModal onAccessibilityEscape={onClose}>
          <View style={s.handle} />
          <View style={s.head}>
            <View style={{ flex: 1 }}>
              <Text style={s.title} accessibilityRole="header">
                {title || t(nativeMode ? 'obNativeTitle' : 'obLangSheetTitle')}
              </Text>
              <Text style={s.text}>{text || t(nativeMode ? 'obNativeText' : 'learnLangHint')}</Text>
            </View>
            <Pressable style={s.close} onPress={onClose} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('close')}>
              <View style={s.closeDot}>
                <IcClose size={16} color={C.dim} />
              </View>
            </Pressable>
          </View>
          <ScrollView style={s.list} contentContainerStyle={{ paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            <LangList
              mode={mode}
              value={current}
              off={off}
              offNote={t(nativeMode ? 'obLangIsTarget' : 'obLangIsNative')}
              phone={phone}
              popularFor={native}
              onPick={onPick}
              t={t}
              ui={ui}
            />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    backdrop: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.4)' },
    kav: { flex: 1, justifyContent: 'flex-end' },
    sheet: {
      maxHeight: '86%',
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      paddingTop: 10,
      paddingHorizontal: 16,
      // смужка домашнього індикатора
      paddingBottom: 30,
    },
    handle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.card3,
      alignSelf: 'center',
      marginBottom: 10,
    },
    head: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, marginBottom: 12 },
    title: { color: C.text, ...type(22, F.extra) },
    text: { color: C.dim, ...type(14, F.reg), marginTop: 2 },
    close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginRight: -8, marginTop: -6 },
    closeDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
    list: { flexGrow: 0 },

    search: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: C.card2,
      borderRadius: R.md,
      paddingHorizontal: 14,
      minHeight: 44,
      marginBottom: 6,
    },
    searchInput: {
      flex: 1,
      color: C.text,
      ...type(16, F.semi, { noLead: true }),
      paddingVertical: 10,
      // власне тло поля вже показує, де воно, — системний контур не потрібен
      outlineWidth: 0,
    },
    clear: { width: 24, height: 24, borderRadius: 12, backgroundColor: C.card3, alignItems: 'center', justifyContent: 'center' },
    caps: { color: C.dim, ...CAPS, marginTop: 16, marginBottom: 8, marginLeft: 4 },
    none: { color: C.dim, ...type(15, F.semi), textAlign: 'center', marginTop: 14, marginBottom: 4 },

    group: { backgroundColor: C.card, borderRadius: R.lg, overflow: 'hidden' },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      minHeight: 50,
      paddingHorizontal: 14,
    },
    rowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep },
    rowOn: { backgroundColor: C.accentSoft },
    rowOff: { opacity: 0.45 },
    flag: { fontSize: 22 },
    name: { flexShrink: 1, color: C.text, ...type(17, F.semi, { noLead: true }) },
    local: { flex: 1, textAlign: 'right', color: C.dim, ...type(13, F.semi, { noLead: true }) },
    check: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  });
