// Параметри → «Слово дня»: під кого підбирається слово, сповіщення й година.
// Власник — W2 (віджети й Pro «кілька слів на день»).
//
// Підпис секції однаковий для всіх (src/SettingsScreen.js):
//   ctx — { settings, saveSetting, commitSettings, t, lang, pro, openPaywall,
//           C, s, isDark, themeKey, props, dev };
//   extra — settingsExtra з App.js (свої поля кожен потік додає між своїми
//           маркерами).
// Винесено з SettingsScreen.js без зміни поведінки: як і раніше, секція
// бере значення й обробники з пропсів екрана (ctx.props).
import { Pressable, Switch, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { localeFor } from '../locale';
import { profileSummary } from '../profile';
import { IcChevron } from '../icons';
import { Glass } from '../ui';
import { F } from '../theme';

// Підпис години нагадування — у форматі годинника для мови інтерфейсу:
// де годинник 12-годинний (en-US) — «8 AM», де 24-годинний — «08:00».
export function hourLabel(h, lang) {
  const loc = localeFor(lang);
  const at = new Date(2000, 0, 1, h);
  try {
    // 13:00 у 12-годинному форматі — «1 PM»: числа 13 там немає
    const h12 = !/13/.test(new Date(2000, 0, 1, 13).toLocaleTimeString(loc, { hour: 'numeric' }));
    return h12
      ? at.toLocaleTimeString(loc, { hour: 'numeric', hour12: true })
      : at.toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch (_) {
    return String(h).padStart(2, '0') + ':00';
  }
}

export const HOURS = [8, 10, 12, 18, 20];

export default function WodSection({ ctx }) {
  const { t, lang, C, s, props } = ctx;
  const { profile = null, onEditProfile, wodEnabled, onToggleWod, wodHour, onSetWodHour } = props;
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
      </Glass>
    </>
  );
}
