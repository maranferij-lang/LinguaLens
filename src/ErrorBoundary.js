// Межа помилок.
//
// Без неї будь-яке падіння в рендері дає порожній білий екран: ані користувач,
// ані ми не бачимо причини. Тут ловимо виняток, показуємо людський текст і
// даємо вийти з глухого кута. У режимі розробки додатково друкуємо стек —
// саме він потрібен, щоб знайти справжню поломку.
import { Component } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MascotBob } from './Mascot';
import { GradBtn } from './ui';
import { makeT } from './i18n';
import { phoneUiLang } from './locale';
import { F, R, THEMES, type } from './theme';

// Межа стоїть над App і не бачить його стану, але мова інтерфейсу однаково
// не з налаштувань, а з телефону — та сама, що й на решті екранів.
function deviceT() {
  return makeT(phoneUiLang());
}

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // У продакшені сюди можна підключити збір помилок. Поки просто в консоль —
    // у Metro це видно одразу.
    console.error('LinguaLens crash:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // Тему не беремо з контексту: він міг упасти разом із деревом.
    const C = THEMES.light.C;
    const s = makeStyles(C);
    const t = deviceT();
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

    return (
      <View style={s.root}>
        <MascotBob pose="encourage" size={150} />
        <Text style={s.title}>{t('crashTitle')}</Text>
        <Text style={s.text}>{t('crashText')}</Text>

        {isDev ? (
          <ScrollView style={s.devBox} contentContainerStyle={{ padding: 12 }}>
            <Text style={s.devText}>{String(error?.stack || error?.message || error)}</Text>
          </ScrollView>
        ) : null}

        <GradBtn title={t('crashRetry')} onPress={this.reset} style={s.btn} />
      </View>
    );
  }
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: {
      flex: 1,
      backgroundColor: C.bg,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 32,
    },
    title: { color: C.text, ...type(26, F.extra), marginTop: 10 },
    text: { color: C.dim, ...type(15, F.reg), textAlign: 'center', marginTop: 8 },
    devBox: {
      alignSelf: 'stretch',
      maxHeight: 220,
      marginTop: 20,
      backgroundColor: C.card2,
      borderRadius: R.md,
    },
    devText: { color: C.text, fontSize: 11, fontFamily: 'Menlo' },
    btn: { alignSelf: 'stretch', marginTop: 24 },
  });
