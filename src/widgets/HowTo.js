// «Як додати віджет» — три кроки м'якою анімацією по колу (палець
// натискає → «+» → іконка LinguaLens → віджет стає на місце), тексти
// widgetTipStep1..3; з «Менше руху» — статичні кадри. Один компонент для
// онбордингу (W3), Параметрів і підказки на «Навчанні» (W2). Власник — W2.
//
// ЗАГЛУШКА W0 з остаточним API: поки що порожнє місце потрібної висоти.
//
// <WidgetHowTo t={t} compact />   compact — нижчий ряд для підказки й Параметрів
import { View } from 'react-native';

export function WidgetHowTo({ t, compact = false, style }) {
  return <View testID="widget-howto" style={[{ width: '100%', height: compact ? 96 : 140 }, style]} accessible={false} />;
}

export default WidgetHowTo;
