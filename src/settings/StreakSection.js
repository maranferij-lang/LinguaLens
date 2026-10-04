// Параметри → «Серія»: перемикач «Нагадувати про серію» (core.md C.4.5).
// Власник — W1. Одне сповіщення о 20:00, і лише тоді, коли серія від двох
// днів, а сьогодні ще нічого не повторено (src/streakNotify.js). За
// замовчуванням увімкнено — так само, як «Слово дня»; дозвіл на сповіщення
// той самий, тож без нього перемикач перепитує систему, а відмова лишає
// його вимкненим.
//
// Підпис секції однаковий для всіх (src/SettingsScreen.js): ({ ctx, extra }).
// Секція самодостатня: читає й пише налаштування через ctx, від App нічого
// окремого (extra) не бере. Саме нагадування планує App, коли застосунок
// іде у фон, — і читає там цей самий прапорець.
import { useRef } from 'react';
import { Switch, Text, View } from 'react-native';
import { Glass } from '../ui';
import { track } from '../analytics';
import { hasPermission, requestPermission } from '../wordOfDay';
import { RISK_HOUR, cancelStreakRisk } from '../streakNotify';
import { hourLabel } from './WodSection';

// Увімкнути чи вимкнути нагадування. Увімкнення без дозволу спершу питає
// систему; відмова — нічого не змінюємо (→ false). save(patch) — зберегти.
export async function setStreakRemind(on, save) {
  if (on && !(await hasPermission())) {
    const granted = await requestPermission();
    track('push_permission', { granted, source: 'streak' });
    if (!granted) return false;
  }
  save({ streakRemind: !!on });
  track('streak_reminder', { action: on ? 'on' : 'off' });
  // Вимкнули — уже заплановане на сьогодні теж знімаємо
  if (!on) cancelStreakRisk();
  return true;
}

export default function StreakSection({ ctx }) {
  const { t, lang, C, s, settings = {} } = ctx;
  const on = settings.streakRemind !== false;
  // Після системного запиту дозволу зберігаємо через найсвіжіший ctx: поки
  // людина читала діалог, App міг перемалюватись.
  const latest = useRef(ctx);
  latest.current = ctx;
  const toggle = (v) => setStreakRemind(v, (patch) => latest.current.saveSetting?.(patch));
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
