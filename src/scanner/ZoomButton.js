// Зум праворуч від затвора (core.md A9): кругла кнопка «1×» / «2×», а не
// пігулка на кадрі — вона більше не лежить на предметі. Тап перемикає між
// пресетами; щипок по кадру працює, як і раніше.
//
// Точної кратності тут не буде: iOS рахує зум як maxZoom^value, а maxZoom
// залежить від моделі телефону. Тому лише мітки пресетів, без «1.4×». Після
// щипка зум не збігається ні з одним пресетом, і підпис «2×» збрехав би
// (там може бути й 5×): тоді замість числа лупа, а тап повертає «1×».
import { Pressable, Text } from 'react-native';
import { track } from '../analytics';
import { IcSearch } from '../icons';
import { haptic } from '../motion';
import { F } from '../theme';
import { CAM, CAM_FONT, CamGlass } from './CamGlass';
import { useZoom } from './zoomStore';

export const ZOOM_PRESETS = [
  { label: '1×', value: 0 },
  { label: '2×', value: 0.12 },
];

export function nearestPreset(zoom) {
  return ZOOM_PRESETS.reduce((best, p) => (Math.abs(p.value - zoom) < Math.abs(best.value - zoom) ? p : best), ZOOM_PRESETS[0]);
}

// Пресет, на якому зум стоїть насправді; після щипка — null
const SNAP = 0.01;
export function exactPreset(zoom) {
  return ZOOM_PRESETS.find((p) => Math.abs(p.value - zoom) < SNAP) || null;
}

export default function ZoomButton({ zoom, onChange, t }) {
  const cur = exactPreset(zoom);
  function next() {
    // пресет → наступний пресет; після щипка → «1×»
    const to = cur ? ZOOM_PRESETS[(ZOOM_PRESETS.indexOf(cur) + 1) % ZOOM_PRESETS.length] : ZOOM_PRESETS[0];
    haptic('selection');
    track('scan_zoom', { preset: to.label });
    onChange(to.value);
  }
  return (
    <Pressable
      onPress={next}
      hitSlop={4}
      accessibilityRole="button"
      accessibilityLabel={cur ? t('scanZoomA11y', { z: cur.label }) : t('scanZoomResetA11y')}
      testID="zoom"
    >
      <CamGlass style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
        {cur ? (
          <Text style={{ color: CAM.text, fontSize: 15, fontFamily: F.extra }} maxFontSizeMultiplier={CAM_FONT}>
            {cur.label}
          </Text>
        ) : (
          <IcSearch size={22} color={CAM.text} />
        )}
      </CamGlass>
    </Pressable>
  );
}

// Кнопка, що сама стежить за зумом зі сховища (zoomStore.js): щипок
// перемальовує лише її й камеру, а не весь сканер.
export function ZoomControl({ store, onChange, t }) {
  return <ZoomButton zoom={useZoom(store)} onChange={onChange} t={t} />;
}
