// Параметри → «Слово дня»: під кого підбирається слово, сповіщення й година,
// а в Pro — скільки слів на день (1 · 3 · 5) і о котрій кожне.
// Власник — W2 (віджети й Pro «кілька слів на день»).
//
// Підпис секції однаковий для всіх (src/SettingsScreen.js):
//   ctx — { settings, saveSetting, commitSettings, t, lang, pro, openPaywall,
//           C, s, isDark, themeKey, props, dev };
//   extra — settingsExtra з App.js: wodPerDay, wodHours, onSetWodPerDay(n),
//           onSetWodSlotHour(i, h) (без App їх немає — тоді лише одне слово).
// Значення сповіщень і години, як і раніше, — з пропсів екрана (ctx.props).
import { useMemo } from 'react';
import { Pressable, StyleSheet, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { profileSummary } from '../profile';
import { IcChevron } from '../icons';
import { Glass } from '../ui';
import { layoutNext } from '../motion';
import { F, R, type } from '../theme';
import { PRO_WOD_OPTIONS } from '../flags';
import { hourLabel as formatHour } from '../widgets/format';

// Підпис години нагадування — у форматі годинника для мови інтерфейсу:
// де годинник 12-годинний (en-US) — «8 AM», де 24-годинний — «08:00».
export function hourLabel(h, lang) {
  return formatHour(h, lang);
}

export const HOURS = [8, 10, 12, 18, 20];

// Чипи годин для одного слова. Година може бути не зі списку: онбординг
// пропонує 10, 14 і 19, а крокер Pro пише будь-яку з 6..23 (і лишає її, коли
// повертаються до «1»). Без неї жоден чип не світився б, хоч нагадування
// приходить саме тоді. Поточну додаємо за порядком і не зсуваємо мовчки.
export function hourChoices(wodHour) {
  if (!Number.isInteger(wodHour) || HOURS.includes(wodHour)) return HOURS;
  return [...HOURS, wodHour].sort((a, b) => a - b);
}
// Межі годин слів дня: раніше 6:00 сповіщення будило б, пізніше 23:00 — нікуди.
const EARLIEST = 6;
const LATEST = 23;

// Рядок години слова i: «‹ 15:00 ›». Межі — сусідні слова (години строго
// зростають: друге слово не може прийти раніше за перше).
function SlotHour({ i, hours, lang, t, onChange, C, st }) {
  const h = hours[i];
  const min = i === 0 ? EARLIEST : hours[i - 1] + 1;
  const max = i === hours.length - 1 ? LATEST : hours[i + 1] - 1;
  const step = (d) => {
    const next = h + d;
    if (next < min || next > max) return;
    Haptics.selectionAsync();
    onChange(i, next);
  };
  const label = hourLabel(h, lang);
  return (
    <View
      style={st.slotRow}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={t('wodSlotA11y', { n: i + 1, t: label })}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
    >
      <Text style={st.slotName}>{t('wodSlotN', { n: i + 1 })}</Text>
      <View style={st.stepper}>
        <Pressable
          onPress={() => step(-1)}
          disabled={h <= min}
          hitSlop={6}
          style={[st.stepBtn, h <= min && st.stepOff]}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          <View style={{ transform: [{ rotate: '90deg' }] }}>
            <IcChevron size={16} color={C.text} />
          </View>
        </Pressable>
        <Text style={st.slotTime} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {label}
        </Text>
        <Pressable
          onPress={() => step(1)}
          disabled={h >= max}
          hitSlop={6}
          style={[st.stepBtn, h >= max && st.stepOff]}
          importantForAccessibility="no"
          accessibilityElementsHidden
        >
          <View style={{ transform: [{ rotate: '-90deg' }] }}>
            <IcChevron size={16} color={C.text} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

export default function WodSection({ ctx, extra = {} }) {
  const { t, lang, C, s, props, pro } = ctx;
  const { profile = null, onEditProfile, wodEnabled, onToggleWod, wodHour, onSetWodHour } = props;
  const st = useMemo(() => makeStyles(C), [C]);
  // Pro: кілька слів на день — лише коли App дав обробники й опції є
  const options = PRO_WOD_OPTIONS.length && extra.onSetWodPerDay ? [1, ...PRO_WOD_OPTIONS] : null;
  const perDay = options ? extra.wodPerDay || 1 : 1;
  const hours = Array.isArray(extra.wodHours) && extra.wodHours.length ? extra.wodHours : [wodHour];

  // Без Pro 3 і 5 відкривають пейвол «wod_per_day» — це робить App і
  // запам'ятовує вибір: купили — він застосовується сам.
  function choose(n) {
    if (n === perDay) return;
    Haptics.selectionAsync();
    // Рядки годин з'являються й зникають: розгортаємо їх плавно, але лише
    // коли вибір застосується одразу, а не відкриє пейвол.
    if (n === 1 || pro) layoutNext();
    extra.onSetWodPerDay(n);
  }

  // Рядок годин під перемикачем теж з'являється чи зникає: layoutNext до зміни
  function toggleWod(on) {
    layoutNext();
    onToggleWod?.(on);
  }

  return (
    <>
      <Text style={s.sectionLabel}>{t('wordOfDay')}</Text>
      <Glass>
        {/* Під кого підбирається слово: «Фінанси · B2+». Відкриває ті самі
            кроки, що в онбордингу, власним шаром поверх вкладок. */}
        {onEditProfile ? (
          <>
            <Pressable
              style={s.profileRow}
              onPress={onEditProfile}
              accessibilityRole="button"
              accessibilityLabel={`${t('pfRowTitle')}, ${profileSummary(profile, t)}`}
            >
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={s.switchTitle}>{t('pfRowTitle')}</Text>
                <Text style={[s.dimText, profile && { color: C.accent, fontFamily: F.bold }]}>{profileSummary(profile, t)}</Text>
              </View>
              <View style={{ transform: [{ rotate: '-90deg' }] }}>
                <IcChevron color={C.faint} />
              </View>
            </Pressable>
            <View style={s.sepInner} />
          </>
        ) : null}
        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.switchTitle}>{t('dailyPush')}</Text>
            <Text style={s.dimText}>{t('dailyPushHint')}</Text>
          </View>
          <Switch
            value={wodEnabled}
            onValueChange={toggleWod}
            accessibilityLabel={t('dailyPush')}
            accessibilityHint={t('dailyPushHint')}
            testID="wod-enabled"
            trackColor={{ false: C.card3, true: C.accent }}
            thumbColor="#fff"
          />
        </View>

        {/* Одне слово: години-чипи, як і раніше (лише коли сповіщення ввімкнені) */}
        {perDay === 1 && wodEnabled ? (
          <>
            <View style={s.sepInner} />
            <Text style={s.dimText}>{t('pushTime')}</Text>
            <View style={s.hourRow}>
              {hourChoices(wodHour).map((h) => {
                const active = wodHour === h;
                return (
                  <Pressable
                    key={h}
                    testID={'wod-hour-' + h}
                    style={[s.hourChip, active && s.hourChipActive]}
                    onPress={() => {
                      Haptics.selectionAsync();
                      onSetWodHour(h);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text
                      style={[s.hourText, active && { color: C.onAccent, fontFamily: F.extra }]}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}
                      maxFontSizeMultiplier={1.3}
                    >
                      {hourLabel(h, lang)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {/* Pro: скільки слів на день */}
        {options ? (
          <>
            <View style={s.sepInner} />
            <Text style={s.switchTitle}>{t('wodPerDay')}</Text>
            <View style={st.segRow} accessibilityRole="radiogroup" testID="wod-per-day">
              {options.map((n) => {
                const active = perDay === n;
                const locked = n > 1 && !pro;
                return (
                  <Pressable
                    key={n}
                    style={[st.seg, active && st.segActive]}
                    onPress={() => choose(n)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={locked ? `${n}, Pro` : String(n)}
                    testID={'wod-per-day-' + n}
                  >
                    <Text style={[st.segText, active && st.segTextActive]} maxFontSizeMultiplier={1.3}>
                      {n}
                    </Text>
                    {locked ? (
                      <View style={st.proPill}>
                        <Text style={st.proText} maxFontSizeMultiplier={1.2}>
                          Pro
                        </Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <Text style={[s.dimText, st.segHint]}>{pro ? t('wodPerDayHint') : t('wodPerDayPro')}</Text>
            {perDay > 1 ? (
              <View style={st.slots} testID="wod-slot-hours">
                {hours.map((_, i) => (
                  <SlotHour key={i} i={i} hours={hours} lang={lang} t={t} onChange={extra.onSetWodSlotHour} C={C} st={st} />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
      </Glass>
    </>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    // 1 · 3 · 5 — три рівні сегменти, як перемикач у Параметрах iOS
    segRow: { flexDirection: 'row', gap: 6, marginTop: 10, backgroundColor: C.card2, borderRadius: R.pill, padding: 4 },
    seg: {
      flex: 1,
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      borderRadius: R.pill,
    },
    segActive: { backgroundColor: C.card, shadowColor: C.text, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 } },
    segText: { color: C.dim, ...type(16, F.bold, { noLead: true }) },
    segTextActive: { color: C.text, fontFamily: F.extra },
    proPill: { backgroundColor: C.accentSoft, borderRadius: R.pill, paddingHorizontal: 6, paddingVertical: 1 },
    proText: { color: C.accent, ...type(11, F.extra, { noLead: true }) },
    segHint: { marginTop: 8 },
    slots: { marginTop: 10, gap: 2 },
    slotRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
    slotName: { flex: 1, color: C.text, ...type(15, F.semi) },
    stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card2, alignItems: 'center', justifyContent: 'center' },
    stepOff: { opacity: 0.35 },
    slotTime: { minWidth: 70, textAlign: 'center', color: C.accent, ...type(16, F.extra, { noLead: true }), fontVariant: ['tabular-nums'] },
  });
