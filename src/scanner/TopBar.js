// Верхній ряд сканера (core.md A6, A10): ліворуч мова скану «🇺🇸 EN ⌄», по
// центру статус, праворуч ліхтарик. Ліхтарик завжди в одному місці. У
// першому скані онбордингу ліворуч хрестик, а мови й статусу немає.
// Прапорець у чипі — варіанта мови (src/langVariants.js): «EN» сам не
// каже, американська це англійська чи британська.
//
// Статус — одне постійне місце для «скільки в мене лишилось»:
//   pro  — значок PRO;
//   free — «1 безкоштовний скан» (скільки лишилось за все життя);
//   chip — сканів більше немає: фіолетовий чип «Pro · скани без обмежень»,
//          тап — пейвол scans (чесно: затвор однаково відкрив би його).
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { IcBolt, IcChevron, IcClose } from '../icons';
import { PCrown } from '../ProIcons';
import { flagFor, nameFor } from '../speech';
import { variantOf } from '../langVariants';
import { F, R } from '../theme';
import { CAM, CAM_FONT, CamGlass } from './CamGlass';
import { BAR_H, SIDE, TOP } from './layout';

const CHIP_H = 36;

export function LangChip({ lang, onPress, disabled, t }) {
  const variant = variantOf(lang);
  const body = (
    <CamGlass style={{ height: CHIP_H, flexDirection: 'row', alignItems: 'center', gap: 4, paddingLeft: 10, paddingRight: 8 }}>
      <Text style={{ fontSize: 15, lineHeight: 19 }} maxFontSizeMultiplier={CAM_FONT} accessible={false}>
        {flagFor(lang, variant)}
      </Text>
      <Text style={{ color: CAM.text, fontSize: 15, fontFamily: F.extra, letterSpacing: 0.6 }} maxFontSizeMultiplier={CAM_FONT}>
        {String(lang || '').toUpperCase()}
      </Text>
      <IcChevron size={15} color={CAM.text} />
    </CamGlass>
  );
  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      // 36 на вигляд, 44 для пальця
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
      style={disabled ? { opacity: 0.45 } : null}
      accessibilityRole="button"
      accessibilityLabel={t('scanLangA11y', { l: nameFor(lang, variant) })}
      accessibilityState={{ disabled: !!disabled }}
    >
      {body}
    </Pressable>
  );
}

export function Status({ status, onPro, t }) {
  if (!status) return null;
  if (status.kind === 'chip') {
    return (
      <Pressable
        onPress={onPro}
        hitSlop={{ top: 4, bottom: 4 }}
        style={{
          height: CHIP_H,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: 13,
          borderRadius: R.pill,
          backgroundColor: CAM.accent,
          flexShrink: 1,
        }}
        accessibilityRole="button"
        accessibilityLabel={t('scanProChip')}
        testID="scan-status-chip"
      >
        <PCrown size={15} color={CAM.onAccent} />
        <Text
          style={{ color: CAM.onAccent, fontSize: 14, fontFamily: F.extra, flexShrink: 1 }}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
          maxFontSizeMultiplier={CAM_FONT}
        >
          {t('scanProChip')}
        </Text>
      </Pressable>
    );
  }
  if (status.kind === 'pro') {
    return (
      <CamGlass
        style={{ height: CHIP_H, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14 }}
        accessible
        accessibilityLabel={t('scanProBadgeA11y')}
        testID="scan-status-pro"
      >
        {/* корона лавандова, підпис кремовий: над світлою стіною лавандовий
            текст на склі не читається */}
        <PCrown size={14} color={CAM.accent} />
        <Text style={{ color: CAM.text, fontSize: 12, fontFamily: F.extra, letterSpacing: 1.2 }} maxFontSizeMultiplier={CAM_FONT}>
          PRO
        </Text>
      </CamGlass>
    );
  }
  const text = t('scanFreeLeft', { n: status.n });
  return (
    <CamGlass
      style={{ height: CHIP_H, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, flexShrink: 1 }}
      accessible
      accessibilityLabel={text}
      testID="scan-status-free"
    >
      {/* кружечок-лінза: один скан — одна «лінза» */}
      <Svg width={11} height={11} viewBox="0 0 12 12">
        <Circle cx={6} cy={6} r={4.3} stroke={CAM.text} strokeWidth={2} fill="none" />
      </Svg>
      <Text
        style={{ color: CAM.text, fontSize: 14, fontFamily: F.bold, flexShrink: 1 }}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        maxFontSizeMultiplier={CAM_FONT}
      >
        {text}
      </Text>
    </CamGlass>
  );
}

// Ліхтарик: вимкнений — скло з перекресленою блискавкою, увімкнений —
// кремове коло з темною: стан видно не лише кольором.
export function TorchButton({ on, onPress, t }) {
  const inner = on ? (
    <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: CAM.cream, alignItems: 'center', justifyContent: 'center' }}>
      <IcBolt size={22} color={CAM.ink} />
    </View>
  ) : (
    <CamGlass style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
      <IcBolt size={22} color={CAM.text} off />
    </CamGlass>
  );
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityLabel={t('scanTorch')}
      accessibilityState={{ checked: !!on }}
      testID="torch"
    >
      {inner}
    </Pressable>
  );
}

export function CloseButton({ onPress, t }) {
  return (
    <Pressable onPress={onPress} hitSlop={6} accessibilityRole="button" accessibilityLabel={t('close')} testID="scan-close">
      <CamGlass style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <IcClose size={20} color={CAM.text} />
      </CamGlass>
    </Pressable>
  );
}

// wide — екран від 390 pt: бокові слоти однакові, і статус стоїть рівно по
// центру. На SE слоти вужчі, щоб довгий чип Pro вліз у ряд.
// offset — на скільки сканер зайшов під статус-бар: ряд лишається під ним.
export default function TopBar({ firstScan, lang, onLang, langDisabled, status, onPro, torch, onTorch, onClose, wide, offset = 0, t }) {
  // 84: чип «🇺🇸 EN ⌄» з прапорцем варіанта
  const slot = wide ? { width: 84 } : null;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', top: TOP + offset, left: SIDE, right: SIDE, height: BAR_H, flexDirection: 'row', alignItems: 'center' }}
    >
      <View style={[{ alignItems: 'flex-start' }, slot]}>
        {firstScan ? onClose ? <CloseButton onPress={onClose} t={t} /> : null : <LangChip lang={lang} onPress={onLang} disabled={langDisabled} t={t} />}
      </View>
      <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 8 }} pointerEvents="box-none">
        {firstScan ? null : <Status status={status} onPro={onPro} t={t} />}
      </View>
      <View style={[{ alignItems: 'flex-end' }, slot]}>
        <TorchButton on={torch} onPress={onTorch} t={t} />
      </View>
    </View>
  );
}
