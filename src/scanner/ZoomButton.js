// Зум праворуч від затвора (core.md A9): кругла кнопка «1×» / «2×», а не
// пігулка на кадрі — вона більше не лежить на предметі. Тап перемикає між
// пресетами, підпис — найближчий пресет; щипок по кадру працює, як і раніше.
//
// Точної кратності тут не буде: iOS рахує зум як maxZoom^value, а maxZoom
// залежить від моделі телефону. Тому лише мітки пресетів, без «1.4×».
import { Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { track } from '../analytics';
import { F } from '../theme';
import { CAM, CAM_FONT, CamGlass } from './CamGlass';

export const ZOOM_PRESETS = [
  { label: '1×', value: 0 },
  { label: '2×', value: 0.12 },
];

export function nearestPreset(zoom) {
  return ZOOM_PRESETS.reduce((best, p) => (Math.abs(p.value - zoom) < Math.abs(best.value - zoom) ? p : best), ZOOM_PRESETS[0]);
}

export default function ZoomButton({ zoom, onChange, t }) {
  const cur = nearestPreset(zoom);
  function next() {
    const i = ZOOM_PRESETS.indexOf(cur);
    const to = ZOOM_PRESETS[(i + 1) % ZOOM_PRESETS.length];
    Haptics.selectionAsync();
    track('scan_zoom', { preset: to.label });
    onChange(to.value);
  }
  return (
    <Pressable onPress={next} hitSlop={4} accessibilityRole="button" accessibilityLabel={t('scanZoomA11y', { z: cur.label })} testID="zoom">
      <CamGlass style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: CAM.text, fontSize: 15, fontFamily: F.extra }} maxFontSizeMultiplier={CAM_FONT}>
          {cur.label}
        </Text>
      </CamGlass>
    </Pressable>
  );
}
