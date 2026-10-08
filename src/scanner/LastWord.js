// Наліпка останнього слова ліворуч від затвора (core.md A9): нагадує, що
// скани стають колекцією, і веде в Словник — тап відкриває аркуш саме
// цього слова (App → openWord). Є фото — вирізаний предмет, немає (слово
// дня) — літера на білому колі.
//
// Нове слово зберігають під аркушем результату (чи сцени), який закриває
// затворний ряд: якщо наліпка стрибне саме тоді, її ніхто не побачить. Тож
// поки `paused` (аркуш відкритий), нове слово ховаємо, а коли аркуш поїхав
// вниз, наліпка з'являється: з прозорості 0 до 1 і з масштабу 0,7 до 1 без
// перельоту (це не жест, а поява). Так само з'являється найперше слово, яке
// наліпка ще ніколи не показувала. З «Менше руху» — лише прозорість.
import { memo, useEffect, useRef } from 'react';
import { Animated, Pressable, Text } from 'react-native';
import { photoUri } from '../photos';
import { Sticker } from '../Sticker';
import { DUR, EASE, SPRING } from '../motion';
import { F } from '../theme';
import { CAM, CAM_FONT } from './CamGlass';

const SIZE = 50;
// Системний slide аркуша триває близько 300 мс і лише потім відкриває ряд
// затвора: наліпка з'являється вже на видноті
export const ENTER_DELAY = DUR.sheet + 40;

function LastWord({ word, onPress, paused = false, disabled = false, reduced = false, t }) {
  const id = word?.id;
  const scale = useRef(new Animated.Value(1)).current;
  const fade = useRef(new Animated.Value(paused ? 0 : 1)).current;
  // id, який людина вже бачила. Наліпка зʼявилась під відкритим аркушем: слово
  // щойно збережене, і побачене воно ще не було.
  const seen = useRef(paused ? null : id);
  const hidden = useRef(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);

  useEffect(() => {
    clearTimeout(timer.current);
    if (!id || id === seen.current) return;
    if (paused) {
      hidden.current = true;
      fade.setValue(0);
      return;
    }
    const play = () => {
      seen.current = id;
      hidden.current = false;
      fade.setValue(0);
      scale.setValue(reduced ? 1 : 0.7);
      const grow = reduced ? [] : [Animated.spring(scale, { toValue: 1, ...SPRING.ui })];
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: DUR.micro, easing: EASE.out, useNativeDriver: true }),
        ...grow,
      ]).start();
    };
    // Слово, що ховалось під аркушем, чекає, поки той поїде; слово, що
    // змінилось на очах (синхронізація), з'являється одразу.
    if (hidden.current) timer.current = setTimeout(play, ENTER_DELAY);
    else play();
  }, [id, paused]);

  if (!word) return null;
  const uri = photoUri(word.photo);
  return (
    <Animated.View style={{ opacity: fade, transform: [{ scale }] }}>
      <Pressable
        onPress={() => onPress?.(word.id)}
        disabled={disabled}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={t('scanLastWordA11y', { w: word.word })}
        accessibilityState={{ disabled: !!disabled }}
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
          opacity: disabled ? 0.45 : 1,
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

// memo: щипок по кадру перемальовує весь сканер на кожен дотик, а наліпка —
// це SVG, який від зуму не міняється
export default memo(LastWord);
