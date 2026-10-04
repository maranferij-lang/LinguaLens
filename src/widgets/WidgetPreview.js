// Живий попередній перегляд віджетів для кроку онбордингу «Віджети»
// (widgets.md §12, макет widgets-onboarding-step.png): RN-репліка
// середнього «Слова дня» і малих «Серії» та «Моїх слів», де «Показати
// переклад» працює просто тут. Власник — W2.
//
// ЗАГЛУШКА W0 з остаточним API: поки що порожня плитка того самого розміру,
// щоб онбординг (W3) верстав крок без чекання на віджети.
//
// <WidgetPreview
//   wod={todayWord | null}                 — слово дня людини (todayFrom(wod))
//   sample={{ word, ipa, translation }}    — приклад для «Моїх слів» (DEMO_WORDS)
//   streakN={1}                            — число для малої «Серії»
//   t={t} lang={lang}                      — мова інтерфейсу
//   onReveal={() => {}}                    — людина торкнулась «Показати переклад»
// />
import { View } from 'react-native';
import { R, useTheme } from '../theme';

export function WidgetPreview({ wod = null, sample = null, streakN = 1, t, lang, onReveal, style }) {
  const { C } = useTheme();
  return (
    <View
      testID="widget-preview"
      style={[{ width: '100%', aspectRatio: 1, borderRadius: R.xl, backgroundColor: C.card2 }, style]}
      accessible={false}
    />
  );
}

export default WidgetPreview;
