import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { recognizeImage } from './api';
import { speak } from './speech';
import { IcClose, IcShare, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { StickerLarge } from './Sticker';
import ShareSheet from './share/ShareSheet';
import ConsentSheet from './ConsentSheet';
import { UNDER_TAB } from './Chrome';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { EASE } from './motion';
import { F, R, useTheme } from './theme';

// Пресети зуму. Точної кратності тут не буде: iOS рахує зум як
// maxZoom^value, а maxZoom залежить від моделі телефону. Тому показуємо лише
// мітки пресетів, без «1.4×», яке нічого не означає.
const ZOOM_PRESETS = [
  { label: '1×', value: 0 },
  { label: '2×', value: 0.12 },
];
const MAX_ZOOM = 0.6;

// Наліпка зберігається 600 px: на картці «поділитись» (1080×1920) вона
// займає близько половини ширини і має лишатись чіткою.
const STICKER_PX = 600;

// Рендерить ланцюжок ImageManipulator і зберігає файл. Нативні об'єкти
// звільняємо завжди — повнорозмірний кадр у пам'яті займає десятки МБ.
async function renderAndSave(context, saveOptions) {
  let image = null;
  try {
    image = await context.renderAsync();
    return await image.saveAsync(saveOptions);
  } finally {
    image?.release();
    context.release();
  }
}

export default function ScannerScreen({
  targetLang,
  nativeLang,
  onSaveWord,
  savedWords,
  onGuardScan,
  onScanned,
  onLimitReached,
  onSessionLost,
  onResultVisible,
  aiConsent,
  onAiConsent,
  onShare,
  scansLeft,
  t,
}) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);

  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [askConsent, setAskConsent] = useState(false);
  const [zoom, setZoom] = useState(0);

  // Промінь розгортки: рівномірний хід згори вниз. Тут linear доречний —
  // він читається як робота приладу, а не як «оживлення» інтерфейсу.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) { sweep.stopAnimation(); sweep.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 1100, easing: EASE.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [loading]);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (loading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 700, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulse.stopAnimation();
      pulse.setValue(0);
    }
  }, [loading]);

  const zoomRef = useRef(0);
  const pinchBase = useRef(null);
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderMove: (e) => {
        const tch = e.nativeEvent.touches;
        if (tch.length !== 2) return;
        const d = Math.hypot(tch[0].pageX - tch[1].pageX, tch[0].pageY - tch[1].pageY);
        if (!pinchBase.current) {
          pinchBase.current = { d, z: zoomRef.current };
          return;
        }
        let z = pinchBase.current.z + (d / pinchBase.current.d - 1) * 0.35;
        z = Math.max(0, Math.min(MAX_ZOOM, z));
        zoomRef.current = z;
        setZoom(z);
      },
      onPanResponderRelease: () => (pinchBase.current = null),
      onPanResponderTerminate: () => (pinchBase.current = null),
    })
  ).current;

  function setZoomPreset(v) {
    zoomRef.current = v;
    setZoom(v);
    Haptics.selectionAsync();
  }

  const alreadySaved =
    result && savedWords.some((w) => w.word.toLowerCase() === result.word.toLowerCase());

  // Аркуш результату — нативний Modal, і все, що App малює в корені (тост
  // досягнення, пейвол), iOS ховає під ним. Кажемо App, коли аркуш відкритий,
  // — і що він закрився, зокрема коли сканер зникає разом із ним.
  const resultOpen = !!result;
  useEffect(() => {
    if (!resultOpen || !onResultVisible) return;
    onResultVisible(true);
    return () => onResultVisible(false);
  }, [resultOpen]);

  // Стан `loading` оновлюється лише з наступним рендером — два тапи в одному
  // кадрі обидва проходили б перевірку, і другий знімок падав на нативному
  // боці. Ref спрацьовує миттєво.
  const busy = useRef(false);

  async function scan() {
    if (!cameraRef.current || busy.current) return;
    // Перший знімок: спершу кажемо, куди піде фото, і питаємо дозволу
    // (див. ConsentSheet). Без згоди кадр навіть не знімаємо.
    if (!aiConsent) {
      setAskConsent(true);
      return;
    }
    // Ліміт перевіряємо до зйомки: інакше витратимо виклик AI і покажемо
    // відмову вже після нього — це виглядає як обман.
    if (onGuardScan && !onGuardScan()) return;
    busy.current = true;
    setError('');
    let photo = null;
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // На телефоні кадр лишається в пам'яті (pictureRef) і не пишеться на
      // диск, щоб потім двічі читатись назад. Веб так не вміє — там файл.
      const native = Platform.OS !== 'web';
      photo = await cameraRef.current.takePictureAsync({ quality: 0.7, ...(native ? { pictureRef: true } : null) });
      const source = native ? photo : photo.uri;
      const small = await renderAndSave(
        ImageManipulator.manipulate(source).resize({ width: Math.min(1024, photo.width) }),
        { compress: 0.6, format: SaveFormat.JPEG, base64: true }
      );
      const res = await recognize(small.base64);
      if (onScanned) onScanned(res);
      // Вирізаємо САМ предмет по рамці від моделі, а не весь кадр.
      // Скріншот екрана з обрізаними краями виглядає випадковим і губить стиль;
      // вирізаний предмет читається як наліпка, яку ти зловив.
      const cut = await cropToObject(source, photo.width, photo.height, res.box, res.outline);
      setResult({ ...res, photo: cut.uri, shape: cut.shape });
      setJustSaved(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Ліміт вичерпано — це не помилка, а пейвол (сервер навіть не кликав
      // AI). Його вже відкрив App, коли recognize спитав, що робити.
      if (e.message === 'SCAN_LIMIT' && onLimitReached) return;
      // Сервер не впізнав пристрій — тихо беремо нову ідентичність.
      if (e.message === 'SCAN_AUTH' && onSessionLost) onSessionLost();
      // Коди з api.js перетворюємо на людські фрази. Кожна каже, ЩО робити,
      // а не просто констатує поломку.
      const MAP = {
        SCAN_TIMEOUT: 'scanErrSlow',
        SCAN_OFFLINE: 'scanErrOffline',
        SCAN_RATE: 'scanErrRate',
        SCAN_AUTH: 'scanErrAuth',
        SCAN_SERVER: 'scanErrServer',
        SCAN_EMPTY: 'scanErrEmpty',
      };
      setError(t(MAP[e.message] || 'scanErrServer'));
    } finally {
      if (photo && typeof photo.release === 'function') photo.release();
      busy.current = false;
      setLoading(false);
    }
  }

  // Сервер відмовив за лімітом (402). App або відкриває пейвол (false), або —
  // Pro щойно куплено, сервер перепитав RevenueCat і зняв стелю (true) —
  // тоді той самий кадр іде ще раз, і людині не треба знімати вдруге.
  async function recognize(base64) {
    try {
      return await recognizeImage(base64, targetLang, nativeLang);
    } catch (e) {
      if (e.message !== 'SCAN_LIMIT' || !onLimitReached || !(await onLimitReached(e.data))) throw e;
    }
    return recognizeImage(base64, targetLang, nativeLang);
  }

  function allowUpload() {
    setAskConsent(false);
    if (onAiConsent) onAiConsent();
  }

  // Ріже кадр по рамці 0–1000 (y1,x1,y2,x2) і повертає квадратну мініатюру.
  // Квадрат — щоб предмет однаково добре сидів і в словнику, і на картці.
  //
  // Разом із кадром перераховуємо силует у координати САМЕ ЦЬОГО квадрата
  // (0–1). Рахувати це пізніше, в наліпці, не можна: кадр не квадратний
  // (3:4), а квадрат ще й притискається до країв фото — без знання W, H і
  // зсуву силует їде вбік від предмета.
  async function cropToObject(source, W, H, box, outline) {
    try {
      if (!box) {
        const c = await renderAndSave(ImageManipulator.manipulate(source).resize({ width: STICKER_PX }), {
          compress: 0.7,
          format: SaveFormat.JPEG,
        });
        return { uri: c.uri, shape: null };
      }
      const [y1, x1, y2, x2] = box;
      // Трохи повітря навколо предмета, щоб маска не зрізала контур.
      const pad = 0.06;
      let left = (x1 / 1000 - pad) * W;
      let top = (y1 / 1000 - pad) * H;
      let w = ((x2 - x1) / 1000 + pad * 2) * W;
      let h = ((y2 - y1) / 1000 + pad * 2) * H;
      // Доводимо до квадрата по довшій стороні, тримаючи центр предмета.
      const side = Math.min(Math.max(w, h), Math.min(W, H));
      const cx = left + w / 2;
      const cy = top + h / 2;
      left = Math.max(0, Math.min(W - side, cx - side / 2));
      top = Math.max(0, Math.min(H - side, cy - side / 2));

      // Цілі пікселі з округленням ВНИЗ: originX + width ніколи не вийде за W
      // (на Android вихід навіть на 1 px — виняток і скан без наліпки).
      const S = Math.floor(side);
      const L = Math.floor(left);
      const T = Math.floor(top);
      const c = await renderAndSave(
        ImageManipulator.manipulate(source)
          .crop({ originX: L, originY: T, width: S, height: S })
          .resize({ width: Math.min(STICKER_PX, S) }),
        { compress: 0.8, format: SaveFormat.JPEG }
      );
      const shape = Array.isArray(outline)
        ? outline.map(([y, x]) => [
            Math.round((((x / 1000) * W - L) / S) * 1000) / 1000,
            Math.round((((y / 1000) * H - T) / S) * 1000) / 1000,
          ])
        : null;
      return { uri: c.uri, shape };
    } catch (_) {
      return { uri: null, shape: null };
    }
  }

  // Слово з результату скану в тому вигляді, в якому його зберігає словник.
  // usage — службове поле відповіді сервера, у словник воно не йде.
  function resultWord() {
    const { usage, ...word } = result;
    return { ...word, lang: targetLang, nativeLang };
  }

  function save() {
    if (!result || alreadySaved) return;
    // App відмовив (стеля безкоштовного словника) і відкрив пейвол. Під цим
    // Modal його не видно — закриваємо аркуш; слово App збереже сам, якщо
    // людина оформить Pro.
    if (!onSaveWord(resultWord())) {
      closeResult();
      return;
    }
    setJustSaved(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  function share() {
    Haptics.selectionAsync();
    setSharing({ kind: 'word', word: resultWord() });
  }

  function closeResult() {
    setSharing(null);
    setResult(null);
  }

  if (!permission) return <View style={s.center} />;

  if (!permission.granted) {
    // Після першої відмови iOS більше не показує системний діалог: запит
    // одразу повертає «ні», і кнопка виглядала б мертвою. Тоді ведемо в
    // Параметри — це єдиний спосіб увімкнути камеру.
    const denied = !permission.canAskAgain;
    return (
      <View style={s.center}>
        <FadeIn>
          <View style={{ alignItems: 'center' }}>
            <MascotBob pose="wave" size={150} />
          </View>
          <Text style={s.permTitle}>{t('permTitle')}</Text>
          <Text style={s.permText}>{denied ? t('permDeniedText') : t('permText')}</Text>
          <GradBtn
            title={denied ? t('openSettings') : t('allowCam')}
            onPress={denied ? () => Linking.openSettings() : requestPermission}
          />
        </FadeIn>
      </View>
    );
  }

  const frameOpacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 0.3] });

  return (
    <View style={s.root}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoom}
        onMountError={() => setError(t('scanErrCamera'))}
      />

      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {/* Видошукач: чотири кути + промінь, що проходить кадр під час розпізнавання.
          Маскот тут не зʼявляється — стрибаючий персонаж посеред камери
          перекриває саме той предмет, який людина наводить. */}
      <Animated.View pointerEvents="none" style={[s.frameWrap, { opacity: frameOpacity }]}>
        <View style={[s.corner, s.tl, loading && s.cornerActive]} />
        <View style={[s.corner, s.tr, loading && s.cornerActive]} />
        <View style={[s.corner, s.bl, loading && s.cornerActive]} />
        <View style={[s.corner, s.br, loading && s.cornerActive]} />

        {loading ? (
          <Animated.View
            style={[
              s.scanBeam,
              {
                transform: [
                  { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [4, FRAME - 4] }) },
                ],
                opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
              },
            ]}
          />
        ) : null}
      </Animated.View>

      <View pointerEvents="none" style={s.hintWrap}>
        <Text style={s.hint}>{loading ? t('scanning') : t('hint')}</Text>
        {/* Скільки сканів лишилось. Показуємо лише коли реально мало —
            постійний лічильник над камерою тисне і псує враження. */}
        {Number.isFinite(scansLeft) && scansLeft <= 3 ? (
          <Text style={s.scansLeft}>{t('scansLeftN', { n: scansLeft })}</Text>
        ) : null}
      </View>

      {/* Зум */}
      <View style={s.zoomRow}>
        {ZOOM_PRESETS.map((p) => {
          const active = Math.abs(zoom - p.value) < 0.015;
          return (
            <Pressable
              key={p.label}
              style={[s.zoomChip, active && s.zoomChipActive]}
              onPress={() => setZoomPreset(p.value)}
            >
              <Text style={[s.zoomChipText, active && s.zoomChipTextActive]}>{p.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Затвор як в Apple Camera: біле кільце + біле коло */}
      <View style={s.shutterWrap}>
        <Press onPress={scan} disabled={loading} testID="shutter">
          <View style={s.shutterRing}>
            <View style={s.shutter}>
              {loading ? <ActivityIndicator color="#000" /> : null}
            </View>
          </View>
        </Press>
      </View>

      {error ? (
        <FadeIn style={s.errorWrap}>
          <Text style={s.errorText}>{error}</Text>
          <Pressable onPress={() => setError('')} style={s.errorClose}>
            <IcClose color="rgba(235,235,245,0.6)" />
          </Pressable>
        </FadeIn>
      ) : null}

      <Modal visible={!!result} transparent animationType="slide" onRequestClose={closeResult}>
        <Pressable style={s.modalBackdrop} onPress={closeResult} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          {result ? (
            <>
              {result.photo ? (
                <View style={{ alignItems: 'center', marginBottom: 14 }}>
                  <StickerLarge uri={result.photo} shape={result.shape} outline={result.outline} box={result.box} size={150} pop />
                </View>
              ) : null}
              <FadeIn dy={14}>
                <View style={s.wordRow}>
                  <Text style={s.word}>{result.word}</Text>
                  <Press style={s.speakBtn} onPress={() => speak(result.word, targetLang)}>
                    <IcSpeaker size={20} color={C.accent} />
                  </Press>
                </View>
                {result.ipa ? <Text style={s.ipa}>{result.ipa}</Text> : null}
                <Text style={s.translation}>{result.translation}</Text>
              </FadeIn>

              {result.example ? (
                <FadeIn delay={45}>
                  <Press style={s.exampleBox} onPress={() => speak(result.example, targetLang)}>
                    <View style={s.exampleSpeaker}>
                      <IcSpeaker size={15} color={C.dim} />
                    </View>
                    <Text style={s.example}>“{result.example}”</Text>
                    <Text style={s.exampleTr}>{result.exampleTranslation}</Text>
                  </Press>
                </FadeIn>
              ) : null}

              <FadeIn delay={90} style={s.sheetBtns}>
                <View style={s.btnRow}>
                  <View style={{ flex: 1 }}>
                    {alreadySaved || justSaved ? (
                      <View style={s.savedBadge}>
                        <Text style={s.savedBadgeText}>{t('saved')}</Text>
                      </View>
                    ) : (
                      <GradBtn title={t('save')} onPress={save} />
                    )}
                  </View>
                  <Press style={s.shareBtn} onPress={share} accessibilityLabel={t('share')}>
                    <IcShare size={22} color={C.accent} />
                  </Press>
                </View>
                <SecBtn title={t('scanAgain')} onPress={closeResult} />
              </FadeIn>
            </>
          ) : null}
        </View>
        {/* Картка «поділитись» живе всередині цього ж Modal: iOS не покаже
            другий нативний Modal поверх уже відкритого. */}
        <ShareSheet visible={!!sharing} payload={sharing} onClose={() => setSharing(null)} t={t} />
      </Modal>

      {/* Після «Дозволити» людина сама тисне затвор ще раз: поки вона
          читала, камера могла дивитись уже не туди. */}
      <ConsentSheet visible={askConsent} onAllow={allowUpload} onClose={() => setAskConsent(false)} t={t} />
    </View>
  );
}

const FRAME = 240;
const SHUTTER_BOTTOM = UNDER_TAB + 12;

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
    permTitle: { color: C.text, fontSize: 22, letterSpacing: -0.31, fontFamily: F.bold, marginTop: 14, marginBottom: 8, textAlign: 'center' },
    permText: { color: C.dim, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 21, fontFamily: F.reg },

    frameWrap: { position: 'absolute', top: '27%', alignSelf: 'center', width: FRAME, height: FRAME },
    corner: { position: 'absolute', width: 26, height: 26, borderColor: 'rgba(255,255,255,0.95)' },
    tl: { top: 0, left: 0, borderTopWidth: 2, borderLeftWidth: 2, borderTopLeftRadius: 6 },
    tr: { top: 0, right: 0, borderTopWidth: 2, borderRightWidth: 2, borderTopRightRadius: 6 },
    bl: { bottom: 0, left: 0, borderBottomWidth: 2, borderLeftWidth: 2, borderBottomLeftRadius: 6 },
    br: { bottom: 0, right: 0, borderBottomWidth: 2, borderRightWidth: 2, borderBottomRightRadius: 6 },

    // під час скану кути наливаються акцентом — видно, що прилад працює
    cornerActive: { borderColor: '#9B8FFF' },
    scansLeft: {
      color: '#fff',
      opacity: 0.8,
      fontSize: 12,
      fontFamily: F.semi,
      marginTop: 8,
      backgroundColor: 'rgba(0,0,0,0.35)',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: R.pill,
      overflow: 'hidden',
    },
    scanBeam: {
      position: 'absolute',
      left: 10,
      right: 10,
      height: 2,
      borderRadius: 2,
      backgroundColor: '#9B8FFF',
      shadowColor: '#9B8FFF',
      shadowOpacity: 0.9,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 0 },
    },
    hintWrap: { position: 'absolute', top: '18%', width: '100%', alignItems: 'center' },
    hint: {
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: R.pill,
      fontSize: 13,
      fontFamily: F.semi,
      overflow: 'hidden',
    },

    zoomRow: {
      position: 'absolute',
      bottom: SHUTTER_BOTTOM + 78 + 16,
      alignSelf: 'center',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      backgroundColor: 'rgba(0,0,0,0.5)',
      borderRadius: R.pill,
      padding: 4,
    },
    zoomChip: { width: 40, height: 32, borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
    zoomChipActive: { backgroundColor: 'rgba(255,255,255,0.22)' },
    zoomChipText: { color: 'rgba(255,255,255,0.65)', fontSize: 13, fontFamily: F.semi },
    zoomChipTextActive: { color: '#FFD60A' },

    // Таб-бар лежить поверх камери, тож затвор стоїть над ним, а не під ним.
    shutterWrap: { position: 'absolute', bottom: SHUTTER_BOTTOM, width: '100%', alignItems: 'center' },
    shutterRing: {
      width: 78,
      height: 78,
      borderRadius: 39,
      borderWidth: 4,
      borderColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },
    shutter: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: '#fff',
      alignItems: 'center',
      justifyContent: 'center',
    },

    errorWrap: {
      position: 'absolute',
      bottom: SHUTTER_BOTTOM + 78 + 16 + 40 + 14,
      alignSelf: 'center',
      backgroundColor: 'rgba(28,28,30,0.97)',
      borderRadius: R.md,
      padding: 16,
      paddingRight: 38,
      maxWidth: '86%',
      alignItems: 'center',
    },
    errorText: { color: '#fff', fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: F.reg },
    errorClose: { position: 'absolute', top: 8, right: 10, padding: 4 },

    modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      padding: 24,
      paddingBottom: 42,
    },
    sheetHandle: {
      width: 36,
      height: 5,
      borderRadius: 3,
      backgroundColor: C.card3,
      alignSelf: 'center',
      marginBottom: 18,
    },
    wordRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
    word: { color: C.text, fontSize: 34, letterSpacing: -0.75, fontFamily: F.bold, textAlign: 'center' },
    speakBtn: {
      backgroundColor: C.card2,
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // транскрипція як кольоровий піл-бейдж (стиль Airy)
    ipa: {
      color: C.accent,
      fontSize: 15,
      fontFamily: F.bold,
      marginTop: 10,
      alignSelf: 'center',
      backgroundColor: C.accentSoft,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: R.pill,
      overflow: 'hidden',
    },
    translation: { color: C.text, fontSize: 20, letterSpacing: -0.12, textAlign: 'center', marginTop: 8, opacity: 0.85, fontFamily: F.semi },
    exampleBox: { backgroundColor: C.card2, borderRadius: R.md, padding: 14, marginTop: 20 },
    exampleSpeaker: { position: 'absolute', top: 10, right: 10 },
    example: { color: C.text, fontSize: 15, lineHeight: 22, paddingRight: 20, fontFamily: F.reg },
    exampleTr: { color: C.dim, fontSize: 13, marginTop: 6, lineHeight: 19, fontFamily: F.reg },
    sheetBtns: { marginTop: 22, gap: 10 },
    btnRow: { flexDirection: 'row', gap: 10, alignItems: 'stretch' },
    shareBtn: {
      width: 56,
      borderRadius: R.lg,
      backgroundColor: C.accentSoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    savedBadge: { borderRadius: R.md, paddingVertical: 15, alignItems: 'center', backgroundColor: C.greenSoft },
    savedBadgeText: { color: C.green, fontSize: 17, fontFamily: F.semi },
  });
