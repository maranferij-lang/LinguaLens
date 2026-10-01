// TEMP visual QA harness (deleted after review)
import { registerRootComponent } from 'expo';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFonts, Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { SafeAreaProvider } from '../SafeArea';
import { makeT } from '../i18n';
import { ShareCard } from './ShareCards';
import ShareSheet from './ShareSheet';
import { PALETTES, CARD_W, CARD_H, safeLocale } from './layout';

const IMG = 'http://localhost:8098/';
const params = new URLSearchParams(window.location.search);
const LANG = params.get('lang') || 'uk';
const MODE = params.get('mode') || 'grid';
const NOPHOTO = params.get('nophoto') === '1';

const EXTRA = {
  en: { shareTagline: 'Words from the world around you', shareLang: 'Language', shareDate: 'Date', shareUnlocked: 'Achievement unlocked', shareStatWords: 'words collected', shareStatStreak: 'day streak', shareStatNew: 'new words', shareStatReviews: 'reviews', shareWeekLabel: 'My week', shareLocale: 'en-GB', shareTitleWord: 'Share this word', shareTitleAch: 'Share your achievement', shareTitleWeek: 'Share your week', shareSwipeHint: 'Swipe to pick a style', shareCta: 'Share', shareClose: 'Close', shareTplSticker: 'Sticker', shareTplEntry: 'Dictionary', shareTplMinimal: 'Minimal' },
  uk: { shareTagline: 'Слова зі світу навколо тебе', shareLang: 'Мова', shareDate: 'Дата', shareUnlocked: 'Нове досягнення', shareStatWords: 'зібрані слова', shareStatStreak: 'серія днів', shareStatNew: 'нові слова', shareStatReviews: 'повторення', shareWeekLabel: 'Мій тиждень', shareLocale: 'uk-UA', shareTitleWord: 'Поділись словом', shareTitleAch: 'Поділись досягненням', shareTitleWeek: 'Поділись своїм тижнем', shareSwipeHint: 'Гортай, щоб обрати вигляд', shareCta: 'Поділитися', shareClose: 'Закрити', shareTplSticker: 'Наліпка', shareTplEntry: 'Словник', shareTplMinimal: 'Мінімал' },
};
const base = makeT(LANG);
const t = (k, v) => (EXTRA[LANG] && EXTRA[LANG][k]) || base(k, v);

const mugShape = [[0.25,0.36],[0.3,0.33],[0.45,0.33],[0.62,0.33],[0.66,0.37],[0.68,0.42],[0.76,0.42],[0.81,0.5],[0.8,0.62],[0.72,0.7],[0.66,0.71],[0.65,0.8],[0.6,0.84],[0.45,0.84],[0.3,0.84],[0.25,0.8],[0.24,0.6]];
const word = {
  word: params.get('w') || 'mug',
  ipa: 'mʌɡ',
  translation: 'горнятко',
  example: 'I drink tea from my favourite mug every morning.',
  exampleTranslation: 'Я щоранку пʼю чай зі свого улюбленого горнятка.',
  lang: 'en',
  photo: NOPHOTO ? null : IMG + 'mug.jpg',
  shape: mugShape,
  addedAt: new Date(2026, 9, 1).getTime(),
};
const days = [];
for (let i = 6; i >= 0; i--) {
  const d = new Date(2026, 9, 1);
  d.setDate(d.getDate() - i);
  const key = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  days.push({ key, dow: d.getDay(), value: [3, 0, 5, 1, 0, 7, 4][6 - i] });
}
const stickerN = Number(params.get('n') ?? 5);
const stickers = Array.from({ length: stickerN }, (_, i) => ({ word: 'w' + i, photo: IMG + ['mug.jpg', 'onb2.jpg', 'onb3.jpg'][i % 3] + '?' + i, shape: i % 3 === 0 ? mugShape : undefined }));
const payloads = {
  word: { kind: 'word', word },
  achievement: { kind: 'achievement', achievement: { id: params.get('ach') || 'words_10', tier: Number(params.get('tier') || 1), goal: 10 }, stats: { words: 12, streak: 4 } },
  week: { kind: 'week', stats: { words: 48, weekWords: 20, streak: 6, reviews: 134, days, stickers, langs: ['en', 'de', 'es'] } },
};
const ITEMS = [
  ['word', 'sticker'],
  ['word', 'entry'],
  ['word', 'minimal'],
  ['achievement', 'achievement'],
  ['week', 'week'],
];

function Grid() {
  const scale = Number(params.get('scale') || 0.5);
  const only = params.get('only');
  const pals = params.get('pal') ? PALETTES.filter((p) => p.key === params.get('pal')) : PALETTES;
  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 12, backgroundColor: '#ddd' }}>
      {pals.map((pal) => (
        <View key={pal.key} style={{ flexDirection: 'row', gap: 12 }}>
          {ITEMS.filter(([, tpl]) => !only || only === tpl).map(([kind, tpl]) => (
            <View key={tpl} style={{ width: CARD_W * scale, height: CARD_H * scale, overflow: 'hidden' }}>
              <View style={{ width: CARD_W, height: CARD_H, transform: [{ scale }], transformOrigin: 'top left' }}>
                <ShareCard payload={payloads[kind]} template={tpl} pal={pal} t={t} locale={safeLocale(t('shareLocale'))} />
              </View>
            </View>
          ))}
        </View>
      ))}
    </ScrollView>
  );
}

function Sheet() {
  const [open, setOpen] = useState(true);
  return (
    <View style={{ flex: 1, backgroundColor: '#FAF8F4' }}>
      <Text onPress={() => setOpen(true)} style={{ padding: 80 }}>open</Text>
      <ShareSheet visible={open} payload={payloads[params.get('kind') || 'word']} onClose={() => setOpen(false)} t={t} />
    </View>
  );
}

function Root() {
  const [ok] = useFonts({ Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  if (!ok) return null;
  return <SafeAreaProvider>{MODE === 'sheet' ? <Sheet /> : <Grid />}</SafeAreaProvider>;
}

registerRootComponent(Root);
