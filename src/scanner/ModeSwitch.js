// Перемикач «Предмет / Сцена» (core.md A5): сегментна пігулка, як
// «Прогрес / Досягнення» в Профілі, а не жовтий капс Камери iOS (VoiceOver
// ще й читав капс по літерах). Доріжка — скло, активний сегмент — кремовий
// з темним текстом; він їде під підписи, а не стрибає. Обидва сегменти
// однакової ширини (за довшим підписом), тож бігунок не міняє розміру.
//
// Сцена без Pro — корона в лавандовому кружечку, і VoiceOver каже «функція
// Pro»; вибір її відкриває пейвол (ScannerScreen → onScenePro). Поки кадр у
// роботі, режим не міняється — і це видно (сегменти напівпрозорі).
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, Text, View } from 'react-native';
import { PCrown } from '../ProIcons';
import { SPRING } from '../motion';
import { F } from '../theme';
import { CAM, CAM_FONT, CamGlass } from './CamGlass';
import { MODE_H } from './layout';

export const MODES = ['object', 'scene'];
const PADX = 18;
const INNER = MODE_H - 8;

export default function ModeSwitch({ mode, onChange, disabled, locked, reduced, bottom, t }) {
  const [textW, setTextW] = useState({});
  const labels = { object: t('modeObject'), scene: t('modeScene') };
  const pro = (m) => locked && m === 'scene';
  const measured = MODES.every((m) => textW[m]);
  const segW = measured ? Math.ceil(Math.max(...MODES.map((m) => textW[m]))) + PADX * 2 : null;
  const idx = Math.max(0, MODES.indexOf(mode));

  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!segW) return;
    const to = idx * segW;
    if (reduced) x.setValue(to);
    else Animated.spring(x, { toValue: to, ...SPRING.snappy }).start();
  }, [idx, segW, reduced]);
  // перший вимір — бігунок одразу на місці, без проїзду від нуля
  const placed = useRef(false);
  useEffect(() => {
    if (segW && !placed.current) {
      placed.current = true;
      x.setValue(idx * segW);
    }
  }, [segW]);

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom, height: MODE_H, alignItems: 'center' }}
    >
      <CamGlass
        style={{ height: MODE_H, padding: 4, flexDirection: 'row', opacity: measured ? 1 : 0 }}
        accessibilityRole="tablist"
      >
        {segW ? (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: 4,
              left: 4,
              width: segW,
              height: INNER,
              borderRadius: INNER / 2,
              backgroundColor: CAM.cream,
              transform: [{ translateX: x }],
            }}
          />
        ) : null}
        {MODES.map((m) => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(m)}
              disabled={disabled}
              hitSlop={{ top: 4, bottom: 4 }}
              style={{
                width: segW || undefined,
                paddingHorizontal: segW ? 0 : PADX,
                height: INNER,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: disabled ? 0.5 : 1,
              }}
              accessibilityRole="tab"
              accessibilityLabel={pro(m) ? t('modeScenePro') : labels[m]}
              accessibilityState={{ selected: active, disabled: !!disabled }}
            >
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                onLayout={(e) => {
                  const w = e.nativeEvent.layout.width;
                  setTextW((prev) => (prev[m] === w ? prev : { ...prev, [m]: w }));
                }}
              >
                <Text
                  style={{ color: active ? CAM.ink : CAM.text, fontSize: 15, fontFamily: F.bold }}
                  maxFontSizeMultiplier={CAM_FONT}
                  numberOfLines={1}
                >
                  {labels[m]}
                </Text>
                {pro(m) ? (
                  <View
                    testID="mode-scene-pro"
                    style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: CAM.accent, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <PCrown size={13} color={CAM.onAccent} />
                  </View>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </CamGlass>
    </View>
  );
}
