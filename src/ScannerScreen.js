import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Linking,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { recognizeImage, recognizeScene } from './api';
import { captureScene, createCutter, cropToObject, objectJpeg } from './cutout';
import { speak } from './speech';
import { IcClose, IcShare, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { StickerLarge } from './Sticker';
import ShareSheet from './share/ShareSheet';
import ConsentSheet from './ConsentSheet';
import SceneView from './scene/SceneView';
import { fitContain } from './scene/sceneLayout';
import { newSceneId } from './scene/scenes';
import { useSafeAreaInsets } from './SafeArea';
import { UNDER_TAB } from './Chrome';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { EASE, SPRING, layoutNext, useReducedMotion } from './motion';
import { CAPS, F, R, useTheme } from './theme';

// Пресети зуму. Точної кратності тут не буде: iOS рахує зум як
// maxZoom^value, а maxZoom залежить від моделі телефону. Тому показуємо лише
// мітки пресетів, без «1.4×», яке нічого не означає.
const ZOOM_PRESETS = [
  { label: '1×', value: 0 },
  { label: '2×', value: 0.12 },
];
const MAX_ZOOM = 0.6;

// Режими сканера — як у Камері iOS: підписи над затвором, свайп по
// видошукачу перемикає. Сцена — уся кімната чи стіл одним кадром.
const MODES = ['object', 'scene'];

// Поки модель шукає предмети сцени (5–12 с), рядок статусу міняється:
// мовчазне очікування здається довшим, ніж є.
const STATUS_EVERY = 2600;

export default function ScannerScreen({
  targetLang,
  nativeLang,
  onSaveWord,
  onSaveWords,
  savedWords,
  onGuardScan,
  onScanned,
  onSceneScanned,
  onUpdateScene,
  onLimitReached,
  onSessionLost,
  onResultVisible,
  aiConsent,
  onAiConsent,
  onShare,
  scanMode = 'object',
  onScanModeChange,
  scansLeft,
  // рівень людини 1–10 з профілю (undefined — профілю немає): від нього
  // сервер робить приклад простішим чи багатшим і додає «Ще вирази»
  level,
  t,
}) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [askConsent, setAskConsent] = useState(false);
  const [zoom, setZoom] = useState(0);
  // Висота самого сканера (екран мінус безпечна зона й таб-бар): від неї
  // рахуються видошукач сцени й заморожений кадр.
  const [rootH, setRootH] = useState(win.height - insets.top - insets.bottom);

  const mode = MODES.includes(scanMode) ? scanMode : 'object';
  const sceneMode = mode === 'scene';
  // Сцена: заморожений кадр, поки модель думає, і готовий результат.
  const [frozen, setFrozen] = useState(null);
  const [scene, setScene] = useState(null);
  const [sceneCutter, setSceneCutter] = useState(null);
  const [statusIdx, setStatusIdx] = useState(0);
  // Таймер, що прибирає заморожений кадр після закриття сцени (див. closeScene)
  const thaw = useRef(null);
  useEffect(() => () => clearTimeout(thaw.current), []);

  // Промінь розгортки: рівномірний хід згори вниз. Тут linear доречний —
  // він читається як робота приладу, а не як «оживлення» інтерфейсу.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading) { sweep.stopAnimation(); sweep.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: frozen ? 1700 : 1100, easing: EASE.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [loading, !!frozen]);

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

  // Рядки статусу сцени: по черзі від самого тапу, останній лишається до кінця.
  useEffect(() => {
    if (!loading || !sceneMode) {
      setStatusIdx(0);
      return;
    }
    const timer = setInterval(() => setStatusIdx((i) => Math.min(i + 1, 2)), STATUS_EVERY);
    return () => clearInterval(timer);
  }, [loading, sceneMode]);

  // Заморожений кадр сцени «відходить» від живого прев'ю до фото 9:16 на
  // чорному — так видно, що знімок зроблено і саме він зараз у роботі.
  const freeze = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!frozen) {
      freeze.setValue(0);
      return;
    }
    Animated.timing(freeze, { toValue: 1, duration: 420, easing: EASE.out, useNativeDriver: true }).start();
  }, [frozen]);

  // Стан `loading` оновлюється лише з наступним рендером — два тапи в одному
  // кадрі обидва проходили б перевірку, і другий знімок падав на нативному
  // боці. Ref спрацьовує миттєво.
  const busy = useRef(false);

  const zoomRef = useRef(0);
  const pinchBase = useRef(null);
  // Свайп одним пальцем по видошукачу перемикає режим, як у Камері iOS.
  // Свіжі значення беремо з ref: PanResponder створюється один раз.
  const swipeRef = useRef(null);
  swipeRef.current = (dx) => {
    const next = MODES[Math.max(0, Math.min(MODES.length - 1, MODES.indexOf(mode) + (dx < 0 ? 1 : -1)))];
    switchMode(next);
  };
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e, g) =>
        e.nativeEvent.touches.length === 2 || (Math.abs(g.dx) > 24 && Math.abs(g.dx) > Math.abs(g.dy) * 2),
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
      onPanResponderRelease: (_, g) => {
        // жест зуму не перемикає режим, навіть якщо пальці з'їхали вбік
        const wasPinch = !!pinchBase.current;
        pinchBase.current = null;
        if (!wasPinch && Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 2) swipeRef.current(g.dx);
      },
      onPanResponderTerminate: () => (pinchBase.current = null),
    })
  ).current;

  function setZoomPreset(v) {
    zoomRef.current = v;
    setZoom(v);
    Haptics.selectionAsync();
  }

  function switchMode(next) {
    if (next === mode || busy.current) return;
    Haptics.selectionAsync();
    // видошукач і підказка плавно перебудовуються під новий режим
    layoutNext();
    setError('');
    onScanModeChange?.(next);
  }

  const alreadySaved =
    result && savedWords.some((w) => w.word.toLowerCase() === result.word.toLowerCase());

  // Аркуш результату й сцена — нативні Modal, і все, що App малює в корені
  // (тост досягнення, пейвол), iOS ховає під ними. Кажемо App, коли такий
  // шар відкритий, — і що він закрився, зокрема коли сканер зникає разом із ним.
  const resultOpen = !!result || !!scene;
  useEffect(() => {
    if (!resultOpen || !onResultVisible) return;
    onResultVisible(true);
    return () => onResultVisible(false);
  }, [resultOpen]);

  async function scan() {
    if (!cameraRef.current || busy.current) return;
    // Перший знімок: спершу кажемо, куди піде фото, і питаємо дозволу
    // (див. ConsentSheet). Без згоди кадр навіть не знімаємо.
    if (!aiConsent) {
      setAskConsent(true);
      return;
    }
    // Ліміт перевіряємо до зйомки: інакше витратимо виклик AI і покажемо
    // відмову вже після нього — це виглядає як обман. Сцена коштує один скан.
    if (onGuardScan && !onGuardScan()) return;
    busy.current = true;
    setError('');
    clearTimeout(thaw.current);
    let photo = null;
    // Кадр сцени живе довше за запит: з нього ще ріжуться наліпки
    let handedOver = false;
    try {
      setLoading(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      // На телефоні кадр лишається в пам'яті (pictureRef) і не пишеться на
      // диск, щоб потім двічі читатись назад. Веб так не вміє — там файл.
      const native = Platform.OS !== 'web';
      photo = await cameraRef.current.takePictureAsync({ quality: 0.7, ...(native ? { pictureRef: true } : null) });
      const source = native ? photo : photo.uri;
      if (sceneMode) {
        handedOver = await scanScene(source, photo);
      } else {
        const res = await recognize(recognizeImage, await objectJpeg(source, photo.width));
        if (onScanned) onScanned(res);
        // Вирізаємо САМ предмет по рамці від моделі, а не весь кадр.
        // Скріншот екрана з обрізаними краями виглядає випадковим і губить стиль;
        // вирізаний предмет читається як наліпка, яку ти зловив.
        const cut = await cropToObject(source, photo.width, photo.height, res.box, res.outline);
        setResult({ ...res, photo: cut.uri, shape: cut.shape });
        setJustSaved(false);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      setFrozen(null);
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
        SCAN_EMPTY: sceneMode ? 'sceneErrEmpty' : 'scanErrEmpty',
      };
      setError(t(MAP[e.message] || 'scanErrServer'));
    } finally {
      if (!handedOver && photo && typeof photo.release === 'function') photo.release();
      busy.current = false;
      setLoading(false);
    }
  }

  // Сцена: кадр 9:16 одразу стає «замороженим» фото, модель шукає на ньому
  // предмети, а наліпки ріжуться з повного кадру вже після показу
  // результату. Повертає true, коли кадр передано різальнику — тоді його
  // звільнить він, а не scan().
  async function scanScene(source, photo) {
    const shot = await captureScene(source, photo.width, photo.height);
    setFrozen(shot.image);
    const res = await recognize(recognizeScene, shot.base64);
    if (onScanned) onScanned(res);
    const objects = res.objects.map((o, i) => ({ key: 'o' + i, ...o }));
    const fresh = {
      id: newSceneId(),
      image: shot.image.uri,
      width: shot.image.width,
      height: shot.image.height,
      lang: targetLang,
      nativeLang,
      createdAt: Date.now(),
      objects,
      hidden: [],
    };
    // App кладе сцену в історію (фото — у Documents) і віддає збережений запис
    const stored = (onSceneScanned && onSceneScanned(fresh)) || fresh;
    const cutter = createCutter({ source, width: photo.width, height: photo.height, crop: shot.crop, objects, eager: true });
    cutter.done.finally(() => typeof photo.release === 'function' && photo.release());
    setSceneCutter(cutter);
    setScene(stored);
    return true;
  }

  // Сервер відмовив за лімітом (402). App або відкриває пейвол (false), або —
  // Pro щойно куплено, сервер перепитав RevenueCat і зняв стелю (true) —
  // тоді той самий кадр іде ще раз, і людині не треба знімати вдруге.
  async function recognize(fn, base64) {
    try {
      return await fn(base64, targetLang, nativeLang, level);
    } catch (e) {
      if (e.message !== 'SCAN_LIMIT' || !onLimitReached || !(await onLimitReached(e.data))) throw e;
    }
    return fn(base64, targetLang, nativeLang, level);
  }

  // Камера стояла на паузі, поки була відкрита сцена, і запускається не
  // миттєво. Заморожений кадр лишається під сценою, що згасає, і зникає,
  // коли прев'ю вже живе, — замість чорного проблиску.
  function closeScene() {
    setScene(null);
    clearTimeout(thaw.current);
    thaw.current = setTimeout(() => setFrozen(null), 450);
  }

  function allowUpload() {
    setAskConsent(false);
    if (onAiConsent) onAiConsent();
  }

  // Слово з результату скану в тому вигляді, в якому його зберігає словник.
  // usage — службове поле відповіді сервера, extras — підказка до цього
  // скану: у словник вони не йдуть.
  function resultWord() {
    const { usage, extras, ...word } = result;
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

  // «Назад» на Android і жест виходу VoiceOver: спершу закривається картка
  // «поділитись», а не весь результат — інакше незбережене слово пропало б
  // разом із витраченим сканом.
  function backFromResult() {
    if (sharing) setSharing(null);
    else closeResult();
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
  const vf = viewfinder(sceneMode, win.width, rootH);
  const status = [t('sceneStatus1'), t('sceneStatus2'), t('sceneStatus3')];
  const hintText = loading ? (sceneMode ? status[statusIdx] : t('scanning')) : sceneMode ? t('sceneHint') : t('hint');

  return (
    <View style={s.root} onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoom}
        // Сцена закриває екран повністю: камеру під нею зупиняємо — не гріємо
        // телефон і не світимо індикатором камери, поки людина роздивляється фото
        active={!scene}
        onMountError={() => setError(t('scanErrCamera'))}
      />

      <View style={StyleSheet.absoluteFill} {...pan.panHandlers} />

      {frozen ? (
        <FrozenFrame
          image={frozen}
          a={freeze}
          sweep={sweep}
          loading={loading}
          win={win}
          top={insets.top}
          rootH={rootH}
          reduced={reduced}
        />
      ) : (
        // Видошукач: чотири кути + промінь, що проходить кадр під час
        // розпізнавання. Маскот тут не зʼявляється — стрибаючий персонаж
        // посеред камери перекриває саме той предмет, який людина наводить.
        <Animated.View
          pointerEvents="none"
          style={[s.frameWrap, { top: vf.top, width: vf.w, height: vf.h, opacity: frameOpacity }]}
        >
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
                    { translateY: sweep.interpolate({ inputRange: [0, 1], outputRange: [4, vf.h - 4] }) },
                  ],
                  opacity: sweep.interpolate({ inputRange: [0, 0.1, 0.9, 1], outputRange: [0, 1, 1, 0] }),
                },
              ]}
            />
          ) : null}
        </Animated.View>
      )}

      <View pointerEvents="none" style={[s.hintWrap, { top: vf.hintTop }]}>
        <Text style={s.hint} accessibilityLiveRegion="polite">
          {hintText}
        </Text>
        {/* Скільки сканів лишилось. Показуємо лише коли реально мало —
            постійний лічильник над камерою тисне і псує враження. */}
        {Number.isFinite(scansLeft) && scansLeft <= 3 && !loading ? (
          <Text style={s.scansLeft}>{t('scansLeftN', { n: scansLeft })}</Text>
        ) : null}
      </View>

      {/* Зум */}
      {frozen ? null : (
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
      )}

      <ModePicker mode={mode} onChange={switchMode} disabled={loading} reduced={reduced} s={s} t={t} />

      {/* Затвор як в Apple Camera: біле кільце + біле коло */}
      <View style={s.shutterWrap}>
        <Press
          onPress={scan}
          disabled={loading}
          testID="shutter"
          accessibilityLabel={sceneMode ? t('sceneShutter') : t('scanShutter')}
        >
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
          <Pressable
            onPress={() => setError('')}
            style={s.errorClose}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <IcClose color="rgba(235,235,245,0.6)" />
          </Pressable>
        </FadeIn>
      ) : null}

      <Modal visible={!!result} transparent animationType="slide" onRequestClose={backFromResult}>
        {/* Тло — лише для пальця; VoiceOver закриває аркуш кнопкою або жестом виходу */}
        <Pressable style={s.modalBackdrop} onPress={closeResult} accessible={false} />
        {/* Від 7/10 під прикладом ще кілька виразів — і на маленькому
            iPhone аркуш може не влізти. Тоді він гортається, а не обрізається. */}
        <View style={[s.sheet, { maxHeight: win.height - insets.top - 8 }]} onAccessibilityEscape={backFromResult}>
          <View style={s.sheetHandle} />
          <ScrollView style={s.sheetScroll} bounces={false} showsVerticalScrollIndicator={false}>
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
                    <Press style={s.speakBtn} onPress={() => speak(result.word, targetLang)} accessibilityLabel={t('listen')}>
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

                {/* «Ще вирази»: колокації, ідіоми й фразові дієслова зі словом —
                    для тих, кому сам іменник уже нічого не дає. Тап — озвучити. */}
                {result.extras?.length ? (
                  <FadeIn delay={70} style={s.extras}>
                    <Text style={s.extrasTitle}>{t('moreExpr')}</Text>
                    {result.extras.map((x, i) => (
                      <Press
                        key={x.phrase}
                        style={[s.extraRow, i > 0 && s.extraLine]}
                        onPress={() => speak(x.phrase, targetLang)}
                        scaleTo={0.98}
                        accessibilityLabel={x.translation ? `${x.phrase}, ${x.translation}` : x.phrase}
                        accessibilityHint={t('listen')}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={s.extraPhrase}>{x.phrase}</Text>
                          {x.translation ? <Text style={s.extraTr}>{x.translation}</Text> : null}
                        </View>
                        <IcSpeaker size={15} color={C.dim} />
                      </Press>
                    ))}
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
          </ScrollView>
        </View>
        {/* Картка «поділитись» живе всередині цього ж Modal: iOS не покаже
            другий нативний Modal поверх уже відкритого. */}
        <ShareSheet visible={!!sharing} payload={sharing} onClose={() => setSharing(null)} t={t} />
      </Modal>

      <SceneView
        scene={scene}
        cutter={sceneCutter}
        savedWords={savedWords}
        onSaveWords={onSaveWords}
        onUpdateScene={onUpdateScene}
        onClose={closeScene}
        t={t}
      />

      {/* Після «Дозволити» людина сама тисне затвор ще раз: поки вона
          читала, камера могла дивитись уже не туди. */}
      <ConsentSheet visible={askConsent} onAllow={allowUpload} onClose={() => setAskConsent(false)} t={t} />
    </View>
  );
}

// ─── Перемикач режимів ─────────────────────────────────────────────────────
// Як у Камері iOS: рядок підписів капсом над затвором, обраний — жовтий і
// стоїть по центру; їде весь рядок, а не підсвічування стрибає між словами.
function ModePicker({ mode, onChange, disabled, reduced, s, t }) {
  const [widths, setWidths] = useState({});
  const labels = { object: t('modeObject'), scene: t('modeScene') };
  const idx = MODES.indexOf(mode);
  const measured = MODES.every((m) => widths[m]);
  const total = measured ? MODES.reduce((sum, m) => sum + widths[m], 0) : 0;
  const before = measured ? MODES.slice(0, idx).reduce((sum, m) => sum + widths[m], 0) : 0;
  const shift = measured ? total / 2 - (before + widths[mode] / 2) : 0;

  const x = useRef(new Animated.Value(shift)).current;
  useEffect(() => {
    if (reduced) x.setValue(shift);
    else Animated.spring(x, { toValue: shift, ...SPRING.snappy }).start();
  }, [shift, reduced]);

  return (
    <View style={s.modeRow} accessibilityRole="tablist" pointerEvents="box-none">
      <Animated.View style={{ flexDirection: 'row', transform: [{ translateX: x }], opacity: measured ? 1 : 0 }}>
        {MODES.map((m) => {
          const active = m === mode;
          return (
            <Pressable
              key={m}
              onPress={() => onChange(m)}
              disabled={disabled}
              hitSlop={{ top: 10, bottom: 10 }}
              // поки кадр у роботі, режим не міняється — і видно, що не міняється
              style={[s.modeBtn, disabled && { opacity: 0.45 }]}
              onLayout={(e) => {
                const w = e.nativeEvent.layout.width;
                setWidths((prev) => (prev[m] === w ? prev : { ...prev, [m]: w }));
              }}
              accessibilityRole="tab"
              accessibilityLabel={labels[m]}
              accessibilityState={{ selected: active, disabled }}
            >
              <Text style={[s.modeText, active && s.modeTextActive]} maxFontSizeMultiplier={1.2}>
                {labels[m]}
              </Text>
            </Pressable>
          );
        })}
      </Animated.View>
    </View>
  );
}

// ─── Заморожений кадр сцени ────────────────────────────────────────────────
// Фото стоїть рівно там, де його покаже екран сцени (вписане в екран), тож
// перехід до результату не стрибає. Спершу воно збігається з прев'ю (як
// «cover» на весь сканер) і плавно стискається до 9:16; поверх — легке
// пригашення і м'який відблиск, що проходить кадром, поки модель думає.
function FrozenFrame({ image, a, sweep, loading, win, top, rootH, reduced }) {
  const f = fitContain(image.width || 1080, image.height || 1920, win.width, win.height);
  const y = f.y - top;
  const cover = Math.max(win.width / f.w, rootH / f.h);
  const shiftY = rootH / 2 - (y + f.h / 2);
  const band = f.w * 0.55;
  const motion = reduced
    ? []
    : [
        { translateY: a.interpolate({ inputRange: [0, 1], outputRange: [shiftY, 0] }) },
        { scale: a.interpolate({ inputRange: [0, 1], outputRange: [cover, 1] }) },
      ];
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: a }]} />
      <Animated.View
        style={{ position: 'absolute', left: f.x, top: y, width: f.w, height: f.h, overflow: 'hidden', transform: motion }}
      >
        <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.28)' }]} />
        {loading && !reduced ? (
          <Animated.View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              width: band,
              transform: [{ translateX: sweep.interpolate({ inputRange: [0, 1], outputRange: [-band, f.w] }) }],
            }}
          >
            <Svg width={band} height={f.h}>
              <Defs>
                <LinearGradient id="sceneSweep" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0" stopColor="#FFFFFF" stopOpacity={0} />
                  <Stop offset="0.5" stopColor="#FFFFFF" stopOpacity={0.3} />
                  <Stop offset="1" stopColor="#FFFFFF" stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Rect width={band} height={f.h} fill="url(#sceneSweep)" />
            </Svg>
          </Animated.View>
        ) : null}
      </Animated.View>
    </View>
  );
}

// Видошукач і підказка над ним. Предмет — квадрат на третині екрана.
// Сцена — високий кадр 9:16 майже на весь сканер: від підказки до
// перемикача режимів, кнопки зуму лягають усередину, як у Камері iOS.
// Підказка сцени довша і може лягти у два рядки — над кадром для неї
// лишаємо місце, щоб пігулка не налазила на верхні кути.
function viewfinder(scene, width, rootH) {
  if (!scene) return { w: FRAME, h: FRAME, top: rootH * 0.27, hintTop: rootH * 0.18 };
  const bottom = rootH - MODE_BOTTOM - MODE_H - 12;
  const h = Math.max(FRAME, Math.min(bottom - 84, ((width - 56) * 16) / 9));
  return { w: Math.round((h * 9) / 16), h, top: bottom - h, hintTop: Math.max(12, bottom - h - 70) };
}

const FRAME = 240;
const SHUTTER_BOTTOM = UNDER_TAB + 12;
// Перемикач режимів — одразу над затвором, зум — над перемикачем.
const MODE_BOTTOM = SHUTTER_BOTTOM + 78 + 10;
const MODE_H = 28;
const ZOOM_BOTTOM = MODE_BOTTOM + MODE_H + 10;

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: '#000' },
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
    permTitle: { color: C.text, fontSize: 22, letterSpacing: -0.31, fontFamily: F.bold, marginTop: 14, marginBottom: 8, textAlign: 'center' },
    permText: { color: C.dim, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 21, fontFamily: F.reg },

    frameWrap: { position: 'absolute', alignSelf: 'center' },
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
    hintWrap: { position: 'absolute', width: '100%', alignItems: 'center' },
    hint: {
      color: '#fff',
      backgroundColor: 'rgba(0,0,0,0.5)',
      paddingHorizontal: 14,
      paddingVertical: 7,
      borderRadius: R.pill,
      fontSize: 13,
      fontFamily: F.semi,
      overflow: 'hidden',
      // довга підказка сцени ламається на два рівні рядки, а не на
      // широку смугу з одним словом у другому рядку
      maxWidth: 300,
      textAlign: 'center',
    },

    zoomRow: {
      position: 'absolute',
      bottom: ZOOM_BOTTOM,
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

    // Режими: капс із розрядкою, як у Камері iOS. Тло не потрібне — тінь
    // під літерами тримає їх читабельними і на білій стіні.
    modeRow: { position: 'absolute', bottom: MODE_BOTTOM, height: MODE_H, left: 0, right: 0, alignItems: 'center', justifyContent: 'center' },
    modeBtn: { paddingHorizontal: 11, height: MODE_H, justifyContent: 'center' },
    modeText: {
      color: 'rgba(255,255,255,0.9)',
      fontSize: 13,
      fontFamily: F.extra,
      letterSpacing: 1.3,
      textTransform: 'uppercase',
      textShadowColor: 'rgba(0,0,0,0.45)',
      textShadowRadius: 4,
      textShadowOffset: { width: 0, height: 1 },
    },
    modeTextActive: { color: '#FFD60A' },

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
      bottom: ZOOM_BOTTOM + 40 + 14,
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
    // не тягнеться понад вміст: аркуш лишається внизу, а гортається лише
    // тоді, коли впирається в maxHeight
    sheetScroll: { flexGrow: 0, flexShrink: 1 },
    extras: { marginTop: 14, backgroundColor: C.card2, borderRadius: R.md, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 },
    extrasTitle: { color: C.faint, ...CAPS, marginBottom: 4 },
    extraRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
    extraLine: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.sep },
    extraPhrase: { color: C.text, fontSize: 15, lineHeight: 20, fontFamily: F.bold },
    extraTr: { color: C.dim, fontSize: 13, lineHeight: 18, marginTop: 1, fontFamily: F.reg },
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
