// Onboarding: 3 swipe screens on the first launch
import { useMemo, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { FadeIn, GradBtn } from './ui';
import { MascotBob } from './Mascot';
import { requestPermission } from './wordOfDay';
import { LogoRow } from './Logo';
import { F, useTheme } from './theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  { img: require('../assets/onb-1.png'), title: 'ob1t', desc: 'ob1d' },
  { img: require('../assets/onb-2.png'), title: 'ob2t', desc: 'ob2d' },
  { img: require('../assets/onb-3.png'), title: 'ob3t', desc: 'ob3d' },
];

export default function OnboardingScreen({ t, onDone }) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const [page, setPage] = useState(0);
  const [askPush, setAskPush] = useState(false);
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  function next() {
    if (page + 1 < SLIDES.length) {
      listRef.current?.scrollToIndex({ index: page + 1, animated: true });
    } else {
      // We ask for the permission at the end of onboarding, when the person already knows what they are paying
      // attention for. A system dialog right at the start almost always gets a "no".
      setAskPush(true);
    }
  }

  async function allowPush() {
    setBusy(true);
    const granted = await requestPermission();
    setBusy(false);
    onDone({ wodEnabled: granted });
  }

  // ── Notification permission step ─────────────────────────────────────────
  if (askPush) {
    return (
      <View style={[s.root, s.pushRoot]}>
        <FadeIn style={{ alignItems: 'center' }}>
          <MascotBob pose="encourage" size={190} />
          <Text style={s.pushTitle}>{t('notifTitle')}</Text>
          <Text style={s.desc}>{t('notifText')}</Text>
        </FadeIn>
        <View style={{ alignSelf: 'stretch', marginTop: 32, gap: 6 }}>
          <GradBtn title={t('notifAllow')} onPress={allowPush} disabled={busy} />
          <Pressable style={s.later} onPress={() => onDone({ wodEnabled: false })}>
            <Text style={s.laterText}>{t('notifSkip')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <LogoRow size={28} style={{ position: 'absolute', top: 18, left: 20, zIndex: 10 }} />
      <Pressable style={s.skip} onPress={() => onDone({ wodEnabled: false })}>
        <Text style={s.skipText}>{t('obSkip')}</Text>
      </Pressable>

      <FlatList
        ref={listRef}
        data={SLIDES}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / W))}
        renderItem={({ item }) => (
          <View style={{ width: W, alignItems: 'center', justifyContent: 'center', padding: 32 }}>
            <FadeIn style={{ alignItems: 'center' }}>
              <Image source={item.img} style={s.img} />
              <Text style={s.title}>{t(item.title)}</Text>
              <Text style={s.desc}>{t(item.desc)}</Text>
            </FadeIn>
          </View>
        )}
      />

      <View style={s.dots}>
        {SLIDES.map((_, i) => (
          <View key={i} style={[s.dot, i === page && s.dotActive]} />
        ))}
      </View>

      <View style={{ padding: 24, paddingBottom: 40 }}>
        <GradBtn title={page + 1 < SLIDES.length ? t('obNext') : t('obStart')} onPress={next} />
      </View>
    </View>
  );
}

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    skip: { position: 'absolute', top: 16, right: 20, zIndex: 10, padding: 8 },
    skipText: { color: C.faint, fontSize: 14, fontFamily: F.semi },
    img: { width: 250, height: 250, borderRadius: 32, marginBottom: 28 },
    title: { color: C.text, fontSize: 26, letterSpacing: -0.36, fontFamily: F.bold, textAlign: 'center' },
    desc: { color: C.dim, fontSize: 15, textAlign: 'center', marginTop: 10, lineHeight: 23, maxWidth: 300 },
    dots: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: C.card3 },
    dotActive: { backgroundColor: C.accent, width: 22 },
    pushRoot: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
    pushTitle: { color: C.text, fontSize: 26, letterSpacing: -0.36, fontFamily: F.extra, textAlign: 'center', marginTop: 12 },
    later: { alignItems: 'center', paddingVertical: 14 },
    laterText: { color: C.faint, fontSize: 16, fontFamily: F.semi },
  });
