// Error boundary.
//
// Without it, any crash in rendering gives an empty white screen: neither the user
// nor we can see the cause. Here we catch the exception, show human text and
// let the user out of the dead end. In development mode we also print the stack,
// which is what you need to find the real breakage.
import { Component } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MascotBob } from './Mascot';
import { GradBtn } from './ui';
import { F, R, THEMES, type } from './theme';

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // In production an error-reporting service can be connected here. For now, just to the console:
    // it is visible in Metro right away.
    console.error('LinguaLens crash:', error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // We do not take the theme from the context: it may have crashed along with the tree.
    const C = THEMES.light.C;
    const s = makeStyles(C);
    const isDev = typeof __DEV__ !== 'undefined' && __DEV__;

    return (
      <View style={s.root}>
        <MascotBob pose="encourage" size={150} />
        <Text style={s.title}>Щось пішло не так</Text>
        <Text style={s.text}>
          Застосунок спіткнувся. Твої слова на місці — вони збережені на пристрої.
        </Text>

        {isDev ? (
          <ScrollView style={s.devBox} contentContainerStyle={{ padding: 12 }}>
            <Text style={s.devText}>{String(error?.stack || error?.message || error)}</Text>
          </ScrollView>
        ) : null}

        <GradBtn title="Спробувати знову" onPress={this.reset} style={s.btn} />
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
