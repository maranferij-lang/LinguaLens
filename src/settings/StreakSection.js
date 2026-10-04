// Параметри → «Серія»: перемикач «Нагадувати про серію» (core.md C.4.5).
// Власник — W1. Одне сповіщення о 20:00, і лише тоді, коли серія від двох
// днів, а сьогодні ще нічого не повторено (src/streakNotify.js). За
// замовчуванням увімкнено — так само, як «Слово дня»; дозвіл на сповіщення
// той самий, тож без нього перемикач перепитує систему (extra від App).
//
// Підпис секції однаковий для всіх (src/SettingsScreen.js): ({ ctx, extra }).
//   extra.onToggleStreakRemind(on) — App: дозвіл, збереження, сповіщення.
import { Switch, Text, View } from 'react-native';
import { Glass } from '../ui';
import { hourLabel } from './WodSection';
import { RISK_HOUR } from '../streakNotify';

export default function StreakSection({ ctx, extra = {} }) {
  const { t, lang, C, s, settings = {}, saveSetting } = ctx;
  const on = settings.streakRemind !== false;
  // Без App (тести, старі екрани) — просто зберегти вибір
  const toggle = extra.onToggleStreakRemind || ((v) => saveSetting?.({ streakRemind: !!v }));
  return (
    <>
      <Text style={s.sectionLabel}>{t('streakSectionTitle')}</Text>
      <Glass>
        <View style={s.switchRow}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={s.switchTitle}>{t('streakRemind')}</Text>
            <Text style={s.dimText}>{t('streakRemindHint', { h: hourLabel(RISK_HOUR, lang) })}</Text>
          </View>
          <Switch
            value={on}
            onValueChange={toggle}
            trackColor={{ false: C.card3, true: C.accent }}
            thumbColor="#fff"
            accessibilityLabel={t('streakRemind')}
            testID="streak-remind"
          />
        </View>
      </Glass>
    </>
  );
}
