// Параметри → «Тема». Власник — W5 (кольорові палітри Pro). Підпис секції —
// як у src/settings/WodSection.js: ({ ctx, extra }).
//
// Два незалежні вибори:
//   • вигляд — «Авто / Світла / Темна» (settings.theme, як і до v1.3; режим і
//     обробник — з пропсів екрана: ctx.props.themeMode, ctx.props.onSetTheme).
//     Безкоштовно для всіх;
//   • палітра — «Крейда» (безкоштовна, фірмова) і чотири палітри Pro
//     (settings.palette). Плитка — половина світлого й половина темного
//     вигляду палітри, смужки й крапка акценту: людина бачить обидва вигляди
//     ще до вибору. Тап без Pro відкриває пейвол «themes» з прев'ю саме цієї
//     палітри; з Pro — застосовує одразу.
// Без Pro видно «Крейду», але збережена палітра не стирається: Pro
// повернеться — повернеться й вона (src/theme.js → resolveTheme), і рядок під
// плитками про це каже. Палітри вимкнено прапорцем (PALETTES_ENABLED) — лишається
// лише вигляд.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { track } from '../analytics';
import { PALETTES_ENABLED } from '../flags';
import { PCrown } from '../ProIcons';
import { Glass } from '../ui';
import { SPRING, useReducedMotion } from '../motion';
import { F, FREE_PALETTE, PALETTES, R, THEMES, isDarkMode, themeKeyOf, type } from '../theme';

const MODES = [
  { key: 'system', label: 'themeAuto' },
  { key: 'light', label: 'themeLight' },
  { key: 'dark', label: 'themeDark' },
];
// Старі ключі тем (до v1.1) — це не «Авто»: людина колись обрала вигляд,
// і світлі з них показуємо «Світлою», темні — «Темною» (як resolveTheme).
const modeOf = (m) => (isDarkMode(m, 'light') ? 'dark' : isDarkMode(m, 'dark') ? 'system' : 'light');

export default function ThemeSection({ ctx }) {
  const { t, C, s, isDark, props, settings, saveSetting, pro, openPaywall } = ctx;
  const { themeMode, onSetTheme } = props;
  const st = useMemo(() => makeStyles(C, isDark), [C, isDark]);
  const mode = modeOf(themeMode);
  // Обрана палітра і та, яку справді видно (без Pro — «Крейда»)
  const chosen = PALETTES.some((p) => p.key === settings.palette) ? settings.palette : FREE_PALETTE;
  const shown = pro ? chosen : FREE_PALETTE;
  const kept = !pro && chosen !== FREE_PALETTE;

  function setMode(m) {
    if (m === mode) return;
    Haptics.selectionAsync();
    onSetTheme?.(m);
    track('theme_set', { palette: shown, mode: m });
  }

  function pickPalette(p) {
    // Без Pro «Крейда» — просто вибір (повертає безкоштовну, якщо була
    // збережена палітра Pro); палітра з короною — пейвол з її прев'ю.
    if (p.pro && !pro) {
      Haptics.selectionAsync();
      track('theme_preview', { palette: p.key, source: 'settings' });
      openPaywall('themes', { palette: p.key });
      return;
    }
    if (p.key === chosen && p.key === shown) return;
    Haptics.selectionAsync();
    saveSetting({ palette: p.key });
    track('theme_set', { palette: p.key, mode });
  }

  return (
    <>
      <Text style={s.sectionLabel}>{t('themeLabel')}</Text>
      <ModeSwitch value={mode} onChange={setMode} t={t} st={st} />

      {PALETTES_ENABLED ? (
        <>
          <Text style={s.sectionLabel}>{t('paletteLabel')}</Text>
          <Glass style={st.card}>
            <View style={st.tiles} accessibilityRole="radiogroup" accessibilityLabel={t('paletteLabel')}>
              {PALETTES.map((p) => {
                const on = p.key === shown;
                const locked = p.pro && !pro;
                const name = t('palette_' + p.key);
                return (
                  <Pressable
                    key={p.key}
                    testID={'palette-' + p.key}
                    style={st.cell}
                    onPress={() => pickPalette(p)}
                    accessibilityRole="radio"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={locked ? t('paletteA11yPro', { p: name }) : name}
                  >
                    <View style={[st.ring, on && st.ringOn]}>
                      <Swatch palette={p} st={st} />
                      {locked ? (
                        <View style={st.crown} testID={'palette-crown-' + p.key}>
                          <PCrown size={11} color={C.onAccent} />
                        </View>
                      ) : null}
                    </View>
                    <Text style={[st.name, on && st.nameOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                      {name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={st.hintRow}>
              {pro ? null : <PCrown size={14} color={C.accent} />}
              <Text style={[s.dimText, { flex: 1 }]}>
                {kept ? t('paletteKept', { p: t('palette_' + chosen) }) : pro ? t('paletteHint') : t('paletteProHint')}
              </Text>
            </View>
          </Glass>
        </>
      ) : null}
    </>
  );
}

// Плитка палітри: ліва половина — світлий вигляд, права — темний; угорі
// дві смужки акценту (світлого й темного), унизу крапка. Кольори — з THEMES
// цієї палітри, а не з теми, що зараз на екрані.
function Swatch({ palette, st }) {
  const L = THEMES[themeKeyOf(palette.key, false)].C;
  const D = THEMES[themeKeyOf(palette.key, true)].C;
  return (
    <View style={[st.swatch, { backgroundColor: L.bg, borderColor: L.sep }]}>
      <View style={[st.half, { backgroundColor: D.bg }]} />
      <View style={st.bars}>
        <View style={[st.bar, { backgroundColor: L.accent }]} />
        <View style={[st.bar, { backgroundColor: D.accent }]} />
      </View>
      <View style={[st.dot, { backgroundColor: L.accent }]} />
    </View>
  );
}

// Перемикач-сегменти «Авто / Світла / Темна». Обраний сегмент — «пігулка»,
// що з'їжджає на місце (з «Менше руху» — одразу, без переїзду).
function ModeSwitch({ value, onChange, t, st }) {
  const [w, setW] = useState(0);
  const index = Math.max(0, MODES.findIndex((m) => m.key === value));
  const x = useRef(new Animated.Value(index)).current;
  const reduced = useReducedMotion();
  const first = useRef(true);
  useEffect(() => {
    if (first.current || reduced) {
      first.current = false;
      x.setValue(index);
      return;
    }
    Animated.spring(x, { toValue: index, ...SPRING.snappy }).start();
  }, [index, reduced]);
  const seg = w ? (w - TRACK_PAD * 2) / MODES.length : 0;

  return (
    <View
      style={st.track}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      accessibilityRole="radiogroup"
      accessibilityLabel={t('themeModeA11y')}
    >
      {seg ? (
        <Animated.View
          pointerEvents="none"
          style={[st.thumb, { width: seg, transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [0, seg] }) }] }]}
        />
      ) : null}
      {MODES.map((m) => {
        const on = m.key === value;
        return (
          <Pressable
            key={m.key}
            testID={'theme-mode-' + m.key}
            style={st.segment}
            onPress={() => onChange(m.key)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
          >
            <Text style={[st.segText, on && st.segTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
              {t(m.label)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const TRACK_PAD = 3;

const makeStyles = (C, dark) =>
  StyleSheet.create({
    // Доріжка сегментів — на тон глибша за тло, обраний сегмент — картка
    // (у темному вигляді — на тон світліша, як у системному перемикачі).
    track: {
      flexDirection: 'row',
      backgroundColor: dark ? C.card : C.card2,
      borderRadius: R.md,
      padding: TRACK_PAD,
      minHeight: 44,
    },
    thumb: {
      position: 'absolute',
      top: TRACK_PAD,
      bottom: TRACK_PAD,
      left: TRACK_PAD,
      borderRadius: R.md - TRACK_PAD,
      backgroundColor: dark ? C.card3 : C.card,
      shadowColor: '#000',
      shadowOpacity: dark ? 0 : 0.08,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: dark ? 0 : 2,
    },
    segment: { flex: 1, minHeight: 38, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    segText: { color: C.dim, ...type(15, F.semi, { noLead: true }) },
    segTextOn: { color: C.text, fontFamily: F.bold },

    card: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14 },
    tiles: { flexDirection: 'row', gap: 4 },
    cell: { flex: 1, alignItems: 'center', gap: 6 },
    // Кільце обраної плитки: акцент теми з проміжком у колір картки.
    // Невидиме кільце є в кожної плитки — вибір не зсуває сітку.
    ring: {
      width: '100%',
      maxWidth: 66,
      padding: 2,
      borderRadius: 19,
      borderWidth: 2.5,
      borderColor: 'transparent',
    },
    ringOn: { borderColor: C.accent },
    swatch: {
      width: '100%',
      aspectRatio: 0.78,
      borderRadius: 13,
      borderWidth: StyleSheet.hairlineWidth,
      overflow: 'hidden',
    },
    half: { position: 'absolute', top: 0, bottom: 0, right: 0, width: '50%' },
    bars: {
      position: 'absolute',
      top: '18%',
      left: '14%',
      right: '14%',
      flexDirection: 'row',
      gap: 3,
    },
    bar: { flex: 1, height: 6, borderRadius: 3 },
    dot: { position: 'absolute', left: '14%', bottom: '14%', width: '36%', aspectRatio: 1, borderRadius: 99 },
    // Корона Pro — у правому нижньому куті, кольором теми застосунку
    crown: {
      position: 'absolute',
      right: 5,
      bottom: 5,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: C.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    name: { color: C.dim, ...type(13, F.semi, { noLead: true }), textAlign: 'center' },
    nameOn: { color: C.text, fontFamily: F.bold },
    hintRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 14, paddingHorizontal: 4 },
  });
