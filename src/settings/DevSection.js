// Параметри → «Діагностика»: адреса сервера, перевірка зв'язку і (лише в
// розробці) «Почати з нуля». Власник — W3 (секція «Розробка»). Підпис
// секції — як у src/settings/WodSection.js.
//
// Звичайний користувач її не бачить і не має бачити: адреса сервера — наша
// кухня, а не його справа. Відкривається сімома дотиками по футеру
// (src/settings/Footer.js) — стан ctx.dev.open.
// Винесено з SettingsScreen.js без зміни поведінки.
import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { checkServer } from '../api';
import { IS_DEV, SERVER_SOURCE, SERVER_URL } from '../config';
import { Glass, Press } from '../ui';

export default function DevSection({ ctx }) {
  const { t, C, s, props, dev } = ctx;
  const { onDevReset } = props;
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState(null);

  async function check() {
    setChecking(true);
    setStatus(null);
    const res = await checkServer();
    setStatus(res);
    setChecking(false);
  }

  if (!dev.open) return null;
  return (
    <>
      <Text style={s.sectionLabel}>Діагностика</Text>
      <Glass>
        {/* Лише в розробці: у релізі це дарувало б новий безкоштовний скан. */}
        {IS_DEV && onDevReset ? (
          <>
            <Press style={s.dangerBtn} onPress={onDevReset} accessibilityRole="button">
              <Text style={s.dangerText}>Почати з нуля: онбординг, дані, новий пристрій</Text>
            </Press>
            <View style={s.sepInner} />
          </>
        ) : null}
        <Text style={s.serverUrl}>
          {SERVER_URL} · {SERVER_SOURCE}
        </Text>
        <Press style={s.checkBtn} onPress={check} disabled={checking}>
          {checking ? <ActivityIndicator color={C.onAccent} size="small" /> : <Text style={s.checkBtnText}>{t('checkConn')}</Text>}
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
  );
}
