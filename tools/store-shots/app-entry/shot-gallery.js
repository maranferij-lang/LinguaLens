// Лише для скріншотів App Store (копіюється в тимчасову копію версії поруч
// з index.js, у збірку застосунку не потрапляє; імпорти — від кореня тієї
// копії). Один елемент застосунку рівно так, як його малює застосунок,
// за window.__SHOT__ = { what, lang, variants, … } (variants — варіанти мов,
// як settings.variants: від них прапорець на картці й наліпці):
//   what: 'card'    — картка 9:16 (ShareCard / SceneCard), яку знімає
//                     «Зберегти зображення»: { template, pal, payload,
//                     locale } (locale — дати картки, типово localeFor(lang));
//   what: 'sticker' — наліпка без тла (StickerArt, «Поділитися» → наліпка):
//                     { kind: 'object' | 'word' | 'scene' | 'badge', payload };
//   what: 'widget'  — живий перегляд віджетів (WidgetPreview з кроку
//                     онбордингу «Віджети»): { wod, sample, streakN, targetLang,
//                     width, reveal }.
import { View } from 'react-native';
import { useFonts } from '@expo-google-fonts/nunito/useFonts';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { ShareCard } from './src/share/ShareCards';
import { StickerArt } from './src/share/Stickers';
import { paletteByKey } from './src/share/layout';
import { WidgetPreview } from './src/widgets/WidgetPreview';
import { makeT } from './src/i18n';
import { localeFor } from './src/locale';
// export.mjs кладе поруч прокладку: setChosenVariants з src/langVariants.js
// або, у версії без варіантів мов, функцію, що нічого не робить
import { setChosenVariants } from './shot-variants';

export default function ShotGallery() {
  const [ok] = useFonts({ Nunito_500Medium, Nunito_600SemiBold, Nunito_700Bold, Nunito_800ExtraBold });
  const shot = (typeof window !== 'undefined' && window.__SHOT__) || null;
  if (!ok || !shot) return null;
  // як App на кожному рендері: прапорці (flagFor) бачать вибір людини
  setChosenVariants(shot.variants);
  const t = makeT(shot.lang);
  if (shot.what === 'sticker') {
    return (
      <View nativeID="card" style={{ alignSelf: 'flex-start' }}>
        <StickerArt payload={shot.payload} kind={shot.kind} t={t} />
      </View>
    );
  }
  if (shot.what === 'widget') {
    return (
      <View nativeID="card" style={{ width: shot.width || 360, padding: 0 }}>
        <WidgetPreview wod={shot.wod} sample={shot.sample} streakN={shot.streakN} t={t} lang={shot.lang} targetLang={shot.targetLang} />
      </View>
    );
  }
  return (
    <View nativeID="card" style={{ alignSelf: 'flex-start' }}>
      <ShareCard payload={shot.payload} template={shot.template} pal={paletteByKey(shot.pal)} t={t} locale={shot.locale || localeFor(shot.lang)} />
    </View>
  );
}
