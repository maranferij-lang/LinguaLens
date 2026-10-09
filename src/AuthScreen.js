// Sign-in / sign-up screen. Lingo greets, the form smoothly switches modes.
import { useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { login, register, authErrorText } from './auth';
import { IcEye } from './icons';
import { MascotBob } from './Mascot';
import { LogoRow } from './Logo';
import { FadeIn, GradBtn, Press } from './ui';
import { EASE, layoutNext, useReducedMotion } from './motion';
import { F, R, useTheme } from './theme';

export default function AuthScreen({ t, onDone }) {
  const { C, SHADOW } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const [mode, setMode] = useState('login'); // login | register
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showPass, setShowPass] = useState(false);

  const shake = useRef(new Animated.Value(0)).current;
  const reduced = useReducedMotion();

  function switchMode(next) {
    Haptics.selectionAsync();
    layoutNext();
    setError('');
    setMode(next);
  }

  // Sign-in error: a short shake of the form. Each next step is weaker,
  // so the motion fades out like a real object instead of jerking in even pulses.
  // With "reduce motion" only the haptics remain: shaking causes nausea.
  function shakeForm() {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    if (reduced) return;
    Animated.sequence(
      [1, -0.7, 0.4, -0.15, 0].map((v) =>
        Animated.timing(shake, { toValue: v, duration: 55, easing: EASE.inOut, useNativeDriver: true })
      )
    ).start();
  }

  async function submit() {
    if (busy) return;
    setError('');
    const em = email.trim();
    if (!em || !password) {
      setError(t('errFillAll'));
      shakeForm();
      return;
    }
    setBusy(true);
    try {
      const user =
        mode === 'register' ? await register(em, password, name) : await login(em, password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onDone(user);
    } catch (e) {
      setError(authErrorText(e, t));
      shakeForm();
    } finally {
      setBusy(false);
    }
  }

  const translateX = shake.interpolate({ inputRange: [-1, 1], outputRange: [-9, 9] });

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: C.bg }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <FadeIn style={{ alignItems: 'center' }}>
          <MascotBob pose="wave" size={140} />
          <LogoRow size={30} style={{ marginTop: 4 }} />
          <Text style={s.tagline}>{t('authTagline')}</Text>
        </FadeIn>

        <Animated.View style={{ transform: [{ translateX }] }}>
          <FadeIn delay={45}>
            {/* Sign in / Sign up toggle */}
            <View style={s.segment}>
              {['login', 'register'].map((m) => {
                const active = mode === m;
                return (
                  <Pressable
                    key={m}
                    style={[s.segmentBtn, active && s.segmentBtnActive]}
                    onPress={() => switchMode(m)}
                  >
                    <Text style={[s.segmentText, active && s.segmentTextActive]}>
                      {t(m === 'login' ? 'signIn' : 'signUp')}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[s.card, SHADOW]}>
              {mode === 'register' ? (
                <>
                  <Text style={s.label}>{t('yourName')}</Text>
                  <TextInput
                    style={s.input}
                    value={name}
                    onChangeText={setName}
                    placeholder={t('namePlaceholder')}
                    placeholderTextColor={C.faint}
                    autoCapitalize="words"
                    returnKeyType="next"
                  />
                </>
              ) : null}

              <Text style={s.label}>Email</Text>
              <TextInput
                style={s.input}
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor={C.faint}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                returnKeyType="next"
              />

              <Text style={s.label}>{t('password')}</Text>
              <View style={s.passWrap}>
                <TextInput
                  style={[s.input, { flex: 1, paddingRight: 46 }]}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••"
                  placeholderTextColor={C.faint}
                  secureTextEntry={!showPass}
                  autoCapitalize="none"
                  autoCorrect={false}
                  textContentType={mode === 'register' ? 'newPassword' : 'password'}
                  returnKeyType="go"
                  onSubmitEditing={submit}
                />
                <Pressable
                  style={s.eyeBtn}
                  hitSlop={8}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setShowPass((v) => !v);
                  }}
                >
                  <IcEye size={20} color={C.faint} off={showPass} />
                </Pressable>
              </View>

              {mode === 'register' ? <Text style={s.hint}>{t('passwordHint')}</Text> : null}

              {error ? <Text style={s.error}>{error}</Text> : null}

              <View style={{ marginTop: 16 }}>
                {busy ? (
                  <View style={s.busyBtn}>
                    <ActivityIndicator color={C.onAccent} />
                  </View>
                ) : (
                  <GradBtn title={t(mode === 'login' ? 'signIn' : 'createAccount')} onPress={submit} />
                )}
              </View>
            </View>

            <Press style={s.skipBtn} onPress={() => onDone(null)}>
              <Text style={s.skipText}>{t('continueGuest')}</Text>
            </Press>
          </FadeIn>
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    scroll: { padding: 24, paddingTop: 40, paddingBottom: 40, justifyContent: 'center', flexGrow: 1 },
    tagline: {
      color: C.dim,
      fontSize: 15,
      fontFamily: F.reg,
      textAlign: 'center',
      marginTop: 6,
      marginBottom: 22,
      lineHeight: 21,
    },
    segment: {
      flexDirection: 'row',
      backgroundColor: C.card2,
      borderRadius: R.md,
      padding: 3,
      marginBottom: 14,
    },
    segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: R.md - 3, alignItems: 'center' },
    segmentBtnActive: { backgroundColor: C.card },
    segmentText: { color: C.dim, fontSize: 15, fontFamily: F.semi },
    segmentTextActive: { color: C.text, fontFamily: F.extra },
    card: { backgroundColor: C.card, borderRadius: R.xl, padding: 18 },
    label: {
      color: C.faint,
      fontSize: 11,
      fontFamily: F.extra,
      letterSpacing: 1,
      textTransform: 'uppercase',
      marginBottom: 6,
      marginTop: 10,
    },
    input: {
      backgroundColor: C.input,
      borderRadius: R.md,
      paddingHorizontal: 14,
      paddingVertical: 13,
      color: C.text,
      fontSize: 16, letterSpacing: -0.1,
      fontFamily: F.semi,
    },
    passWrap: { flexDirection: 'row', alignItems: 'center' },
    eyeBtn: { position: 'absolute', right: 6, padding: 10 },
    hint: { color: C.faint, fontSize: 12, fontFamily: F.reg, marginTop: 8 },
    error: {
      color: C.red,
      fontSize: 13,
      fontFamily: F.semi,
      marginTop: 12,
      lineHeight: 18,
    },
    busyBtn: {
      backgroundColor: C.accent,
      borderRadius: R.lg,
      paddingVertical: 16,
      alignItems: 'center',
    },
    skipBtn: { marginTop: 18, paddingVertical: 12, alignItems: 'center' },
    skipText: { color: C.dim, fontSize: 15, fontFamily: F.semi },
  });
