// Наліпка останнього слова ліворуч від затвора (core.md A9): нагадує, що
// скани стають колекцією, і веде в Словник — тап відкриває аркуш саме
// цього слова (App → openWord). Є фото — вирізаний предмет, немає (слово
// дня) — літера на білому колі. Щойно збережено нове слово, наліпка
// «підстрибує» (1 → 1,12 → 1); з «Менше руху» — просто міняється.
import { useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { photoUri } from '../photos';
import { Sticker } from '../Sticker';
import { SPRING } from '../motion';
import { F } from '../theme';
import { CAM, CAM_FONT } from './CamGlass';

const SIZE = 50;

export default function LastWord({ word, onPress, reduced = false, t }) {
  const scale = useRef(new Animated.Value(1)).current;
  const seen = useRef(word?.id);
  useEffect(() => {
    const was = seen.current;
    seen.current = word?.id;
    if (!word || !was || was === word.id || reduced) return;
    Animated.sequence([
      Animated.spring(scale, { toValue: 1.12, ...SPRING.snappy }),
      Animated.spring(scale, { toValue: 1, ...SPRING.ui }),
    ]).start();
  }, [word?.id]);

  if (!word) return null;
  const uri = photoUri(word.photo);
  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress?.(word.id)}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={t('scanLastWordA11y', { w: word.word })}
        testID="last-word"
        style={{
          width: SIZE,
          height: SIZE,
          borderRadius: SIZE / 2,
          backgroundColor: '#FFFFFF',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
        }}
      >
        {uri ? (
          <Sticker uri={uri} shape={word.shape} outline={word.outline} box={word.box} size={40} />
        ) : (
          <Text style={{ color: CAM.violet, fontSize: 21, fontFamily: F.extra }} maxFontSizeMultiplier={CAM_FONT}>
            {String(word.word || '?').trim().charAt(0).toUpperCase()}
          </Text>
        )}
      </Pressable>
    </Animated.View>
  );
}
