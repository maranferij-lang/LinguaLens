import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
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
import { Asset } from 'expo-asset';
import * as Haptics from 'expo-haptics';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { recognizeImage, recognizeScene } from './api';
import { track } from './analytics';
import { captureScene, createCutter, cropToObject, dropFile, objectJpeg, scanBackdrop } from './cutout';
import { DEV_SAMPLE, isSimulatorShot } from './devSample';
import { speak } from './speech';
import { IcClose, IcShare, IcSpeaker, IcWarn } from './icons';
import { MascotBob } from './Mascot';
import { StickerLarge } from './Sticker';
import ShareSheet from './share/ShareSheet';
import ConsentSheet from './ConsentSheet';
import SceneView from './scene/SceneView';
import { fitContain } from './scene/sceneLayout';
import { newSceneId } from './scene/scenes';
import { useSafeAreaInsets } from './SafeArea';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { EASE, layoutNext, useReducedMotion } from './motion';
import { CAPS, F, R, useTheme } from './theme';
import { CAM, CAM_FONT, CamGlass } from './scanner/CamGlass';
import TopBar from './scanner/TopBar';
import Viewfinder from './scanner/Viewfinder';
import ModeSwitch, { MODES } from './scanner/ModeSwitch';
import Shutter from './scanner/Shutter';
import LastWord from './scanner/LastWord';
import ZoomButton from './scanner/ZoomButton';
import { SHUTTER, SIDE_OFFSET, scannerLayout } from './scanner/layout';

// Зум щипком: найбільше значення (iOS рахує зум як maxZoom^value).
const MAX_ZOOM = 0.6;

// Відмови сервера за оплатою (402): безкоштовний скан витрачено або
// безкоштовна сцена вже використана. Це не помилки, а пейвол — його
// відкриває App.
const PAYWALL_CODES = ['SCAN_LIMIT', 'SCENE_PRO'];

// Поки модель шукає предмети сцени (5–12 с), рядок статусу міняється:
// мовчазне очікування здається довшим, ніж є.
const STATUS_EVERY = 2600;

// Сканер у стилі застосунку (core.md A): темний «хром» з одного рецепта
// скла, затвор-лінза, кадр із кутами R28, пігулка режимів, верхній ряд
// (мова скану, статус, ліхтарик) і ряд затвора (останнє слово, зум).
// Розкладка — src/scanner/layout.js, частини хрому — src/scanner/*.
//
// Контракт для онбордингу й наліпок (план §5.8):
//   onExit(reason) — 'closed' (хрестик першого скану) | 'camera_denied'
//     (камеру заборонено: хрестик чи «Далі»); 'limit' дає App зі своїх
//     onGuardScan / onLimitReached — сканер сам його не шле, щоб онбординг не
//     отримав вихід двічі. Збереження слова — onFirstSaved(word), як і раніше;
//   firstScan — хрестик ліворуч угорі, без режимів, статусу, наліпки й
//     таб-бару, підказка scanFirstHint, той самий видошукач;
//   тестове фото — у розробці кадр симулятора (рівно 200×200) підміняється
//     src/devSample.js;
//   кадр 9:16 (result.backdrop) — тло для «Stories з цим фото»: іде лише в
//     «Поділитися», у словник — ні, файл стирається при закритті результату.
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
  // скільки безкоштовних сканів лишилось (Infinity — Pro). Нуль — камера
  // чесно каже, що скан використано, і пропонує Pro (onOpenPro)
  scansLeft,
  onOpenPro,
  // мова скану: чип «EN ⌄» угорі ліворуч відкриває вибір мови (App)
  onChangeLang,
  // найсвіжіше збережене слово — наліпка біля затвора; тап — onOpenWord(id)
  lastWord = null,
  onOpenWord,
  // рівень людини 1–10 з профілю (undefined — профілю немає): від нього
  // сервер робить приклад простішим чи багатшим і додає «Ще вирази»
  level,
  // Сцена — функція Pro, і безкоштовну пробу вже використано: на перемикачі
  // режиму біля «Сцени» корона, а вибір сцени відкриває пейвол
  // (onScenePro) замість режиму, який однаково не спрацює.
  sceneLocked = false,
  onScenePro,
  // звідки скан — для статистики: 'app' або 'onboarding' (перший скан у
  // онбордингу)
  scanSource = 'app',
  // Перший скан в онбордингу («Спробувати»): лише один предмет, без
  // перемикача режимів і лічильника сканів, з хрестиком, що вертає в
  // онбординг (onExit('closed')). Щойно слово збережено — аркуш закривається,
  // і онбординг іде далі вже зі словом (onFirstSaved(слово)).
  firstScan = false,
  onExit,
  onFirstSaved,
  // На скільки сканер заходить під статус-бар (App дає безпечну зону згори):
  // камера тоді йде до самого верху екрана, як у макеті, а світлий текст
  // статус-бару лежить на ній, а не на тлі застосунку. Хром камери
  // лишається там само — нижче статус-бару. 0 — сканер лише в своїй зоні.
  bleedTop = 0,
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
  const [torch, setTorch] = useState(false);
  // Висота самого сканера (екран мінус безпечна зона й таб-бар): від неї
  // рахуються кадр, ряд затвора й заморожений кадр сцени.
  const [rootH, setRootH] = useState(win.height - insets.top - insets.bottom + bleedTop);

  // Сцена: заморожений кадр, поки модель думає, і готовий результат.
  const [frozen, setFrozen] = useState(null);
  const [scene, setScene] = useState(null);
  // Перший скан — завжди один предмет: сцена довша (5–12 с) і в
  // безкоштовному рівні разова; вау-момент має бути швидким.
  // Сцена закрита для людини (безкоштовну пробу використано чи Pro
  // скінчився), а збережений режим — досі сцена: тоді сканер стоїть на
  // предметі, інакше кожен тап затвора відкривав би пейвол замість скану,
  // що ще лишився. Збережений вибір не чіпаємо — з Pro сцена повернеться
  // сама; обрати її знову — той самий пейвол через onScenePro. Поки кадр
  // сцени ще в роботі чи вже на екрані, режим не міняється: лічильник
  // сцен оновлюється саме тоді.
  const sceneShut = scanMode === 'scene' && sceneLocked && !scene && !frozen;
  const mode = firstScan || sceneShut ? 'object' : MODES.includes(scanMode) ? scanMode : 'object';
  const sceneMode = mode === 'scene';
  const [sceneCutter, setSceneCutter] = useState(null);
  const [statusIdx, setStatusIdx] = useState(0);
  // Таймер, що прибирає заморожений кадр після закриття сцени (див. closeScene)
  const thaw = useRef(null);
  // Перший скан: «Збережено» видно мить, потім аркуш їде вниз і онбординг
  // продовжується
  const firstDone = useRef([]);
  // Кадр 9:16 останнього скану (тло для Stories) — лише до закриття
  // результату; при демонтажі сканера файл теж стираємо.
  const backdropRef = useRef(null);
  useEffect(
    () => () => {
      clearTimeout(thaw.current);
      firstDone.current.forEach(clearTimeout);
      dropFile(backdropRef.current);
      backdropRef.current = null;
    },
    []
  );

  // ── Ліхтарик ──
  // Світить, лише поки людина наводить: гасне, щойно відкрився результат чи
  // сцена (камера тоді стоїть), коли застосунок пішов у фон і перед екраном
  // дозволу. Зміна вкладки розмонтовує сканер разом із камерою — і ліхтарем.
  const cameraLive = !result && !scene && !frozen;
  useEffect(() => {
    if (!cameraLive) setTorch(false);
  }, [cameraLive]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setTorch(false);
    });
    return () => sub?.remove?.();
  }, []);
  const granted = !!permission?.granted;
  useEffect(() => {
    if (!granted) setTorch(false);
  }, [granted]);

  function toggleTorch() {
    const on = !torch;
    setTorch(on);
    Haptics.selectionAsync();
    track('scan_torch', { on });
  }

  // Відблиск, що проходить замороженим кадром сцени, поки модель думає.
  // Рівномірний хід: linear тут читається як робота приладу. «Менше руху» —
  // без нього.
  const sweep = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!loading || !frozen || reduced) {
      sweep.stopAnimation();
      sweep.setValue(0);
      return undefined;
    }
    const loop = Animated.loop(Animated.timing(sweep, { toValue: 1, duration: 1700, easing: EASE.linear, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [loading, !!frozen, reduced]);

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
  // Свайп одним пальцем по кадру перемикає режим, як у Камері iOS.
  // Свіжі значення беремо з ref: PanResponder створюється один раз.
  const swipeRef = useRef(null);
  swipeRef.current = (dx) => {
    if (firstScan) return;
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
  }

  function switchMode(next) {
    if (next === mode || busy.current) return;
    if (next === 'scene' && sceneLocked && onScenePro) {
      Haptics.selectionAsync();
      onScenePro();
      return;
    }
    Haptics.selectionAsync();
    // кадр і підказка плавно перебудовуються під новий режим
    layoutNext();
    setError('');
    onScanModeChange?.(next);
  }

  const alreadySaved =
    result && savedWords.some((w) => w.word.toLowerCase() === result.word.toLowerCase());
  const unsaved = !!result && !alreadySaved && !justSaved;
  // Безкоштовний скан щойно витрачено (чи це перший скан онбордингу): слово
  // в аркуші — єдине, що людина з нього має. «Сканувати ще» тоді немає, а
  // «назад» спершу зберігає слово, щоб його не можна було випадково втратити.
  const lastScan = firstScan || scansLeft === 0;
  // Слово вже у словнику, а «Сканувати ще» немає — аркуш закриває «Готово».
  // Тло на SE з довгим результатом — смужка під статус-баром, і без кнопки
  // людина лишилась би під аркушем. Перший скан онбордингу їде вниз сам.
  const doneBtn = lastScan && !!result && !unsaved && !(firstScan && onFirstSaved && justSaved);

  // Аркуш результату й сцена — нативні Modal, і все, що App малює в корені
  // (тост досягнення, пейвол), iOS ховає під ними. Кажемо App, коли такий
  // шар відкритий, — і що він закрився, зокрема коли сканер зникає разом із ним.
  const resultOpen = !!result || !!scene;
  useEffect(() => {
    if (!resultOpen || !onResultVisible) return;
    onResultVisible(true);
    return () => onResultVisible(false);
  }, [resultOpen]);

  // Симулятор iOS: замість згенерованого квадрата — тестове фото (лише в
  // розробці). Не вийшло завантажити — лишається кадр симулятора.
  async function devSample() {
    try {
      const a = Asset.fromModule(DEV_SAMPLE);
      await a.downloadAsync();
      if (!a.localUri) return null;
      return { uri: a.localUri, width: a.width || 1080, height: a.height || 1440 };
    } catch (_) {
      return null;
    }
  }

  async function scan() {
    if (!cameraRef.current || busy.current) return;
    // Перший знімок: спершу кажемо, куди піде фото, і питаємо дозволу
    // (див. ConsentSheet). Без згоди кадр навіть не знімаємо.
    if (!aiConsent) {
      setAskConsent(true);
      return;
    }
    // Ліміт перевіряємо до зйомки: інакше витратимо виклик AI і покажемо
    // відмову вже після нього — це виглядає як обман. Сцена коштує один скан
    // і ще одну безкоштовну пробу сцени, тож воротар має знати режим.
    if (onGuardScan && !onGuardScan(mode)) return;
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
      let source = native ? photo : photo.uri;
      if (DEV_SAMPLE && isSimulatorShot(photo, Platform.OS)) {
        const sample = await devSample();
        if (sample) {
          if (typeof photo.release === 'function') photo.release();
          photo = { uri: sample.uri, width: sample.width, height: sample.height };
          source = sample.uri;
        }
      }
      if (sceneMode) {
        handedOver = await scanScene(source, photo);
      } else {
        const jpeg = await objectJpeg(source, photo.width);
        // Тло 9:16 для «Stories з цим фото» рендериться, поки модель думає;
        // його помилка скан не ламає — просто не буде цієї кнопки.
        const backdropP = scanBackdrop(source, photo.width, photo.height).catch(() => null);
        let res;
        try {
          res = await recognize(recognizeImage, jpeg);
        } catch (e) {
          backdropP.then(dropFile);
          throw e;
        }
        if (onScanned) onScanned(res);
        // Два декодування великого кадру одночасно не йдуть: спершу тло
        // дорендерюється, потім вирізаємо наліпку.
        const backdrop = await backdropP;
        // Вирізаємо САМ предмет по рамці від моделі, а не весь кадр.
        // Скріншот екрана з обрізаними краями виглядає випадковим і губить стиль;
        // вирізаний предмет читається як наліпка, яку ти зловив.
        const cut = await cropToObject(source, photo.width, photo.height, res.box, res.outline);
        dropFile(backdropRef.current);
        backdropRef.current = backdrop;
        setResult({ ...res, photo: cut.uri, shape: cut.shape, backdrop });
        setJustSaved(false);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      track('scan', { mode, ok: true, source: scanSource });
    } catch (e) {
      setFrozen(null);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      // Ліміт вичерпано — це не помилка, а пейвол (сервер навіть не кликав
      // AI). Його вже відкрив App, коли recognize спитав, що робити.
      if (PAYWALL_CODES.includes(e.message) && onLimitReached) return;
      // Код помилки — з api.js (SCAN_TIMEOUT, SCAN_EMPTY…), а не текст
      track('scan', { mode, ok: false, source: scanSource, error: /^[A-Z_]+$/.test(e?.message || '') ? e.message : 'OTHER' });
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

  // Сервер відмовив за оплатою (402: SCAN_LIMIT чи SCENE_PRO). App або
  // відкриває пейвол (false), або — Pro щойно куплено, сервер перепитав
  // RevenueCat і зняв стелю (true) — тоді той самий кадр іде ще раз, і
  // людині не треба знімати вдруге.
  async function recognize(fn, base64) {
    try {
      return await fn(base64, targetLang, nativeLang, level);
    } catch (e) {
      if (!PAYWALL_CODES.includes(e.message) || !onLimitReached || !(await onLimitReached(e.data, e.message))) throw e;
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
  // скану, backdrop — тимчасове тло для Stories: у словник вони не йдуть.
  function resultWord() {
    const { usage, extras, backdrop, ...word } = result;
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
    if (firstScan && onFirstSaved && !firstDone.current.length) {
      const word = resultWord();
      firstDone.current.push(
        setTimeout(() => {
          closeResult();
          firstDone.current.push(setTimeout(() => onFirstSaved(word), FIRST_SHEET_MS));
        }, FIRST_SAVED_MS)
      );
    }
  }

  // Картка «поділитись» отримує й кадр 9:16 цього скану — тло для «Stories з
  // цим фото» (share.md §7). null — тло не вдалося, кнопки просто не буде.
  function share() {
    Haptics.selectionAsync();
    setSharing({ kind: 'word', word: resultWord(), backdrop: result.backdrop || null });
  }

  function closeResult() {
    dropFile(backdropRef.current);
    backdropRef.current = null;
    setSharing(null);
    setResult(null);
  }

  // «Назад» на Android і жест виходу VoiceOver: спершу закривається картка
  // «поділитись», а не весь результат. Останній скан — слово зберігається
  // перед закриттям (у першому скані це той самий шлях, що й «Зберегти»:
  // «Збережено», аркуш їде вниз, онбординг іде далі вже зі словом).
  function backFromResult() {
    if (sharing) {
      setSharing(null);
      return;
    }
    // аркуш першого скану вже їде вниз сам
    if (firstDone.current.length) return;
    if (lastScan && unsaved) {
      save();
      if (firstScan && onFirstSaved) return;
    }
    closeResult();
  }

  // Тло — лише для пальця: поки слово не збережене, випадковий дотик повз
  // аркуш нічого не закриває.
  function tapBackdrop() {
    if (!unsaved && !firstDone.current.length) closeResult();
  }

  function openLastWord(id) {
    track('scan_last_word');
    onOpenWord?.(id);
  }

  if (!permission) return <View style={s.center} />;

  if (!permission.granted) {
    // Після першої відмови iOS більше не показує системний діалог: запит
    // одразу повертає «ні», і кнопка виглядала б мертвою. Тоді ведемо в
    // Параметри — це єдиний спосіб увімкнути камеру.
    const denied = !permission.canAskAgain;
    // Поки системного запиту ще не було, наш екран — лише пояснення перед
    // ним (App Review 5.1.1(iv)): єдина кнопка — нейтральне «Далі», без
    // «Дозволити» і без хрестика, яким запит можна відкласти. Хрестик —
    // лише після відмови.
    // Перший скан в онбордингу після відмови в Параметри не веде: зміна
    // доступу до камери там змушує iOS вбити застосунок, і людина
    // повернулась би на початок знайомства. Головна кнопка просто веде
    // онбординг далі (onExit('camera_denied')), а камеру можна увімкнути потім.
    const later = denied && firstScan && !!onExit;
    const leave = () => onExit('camera_denied');
    return (
      <View style={s.center}>
        {later ? (
          <Pressable
            style={[s.permExit, { top: 12 }]}
            onPress={leave}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={t('close')}
          >
            <IcClose size={20} color={C.dim} />
          </Pressable>
        ) : null}
        <FadeIn>
          <View style={{ alignItems: 'center' }}>
            <MascotBob pose="wave" size={150} />
          </View>
          <Text style={s.permTitle}>{t('permTitle')}</Text>
          <Text style={s.permText}>{later ? t('permDeniedLater') : denied ? t('permDeniedText') : t('permText')}</Text>
          <GradBtn
            title={denied && !later ? t('openSettings') : t('obNext')}
            onPress={later ? leave : denied ? () => Linking.openSettings() : requestPermission}
          />
        </FadeIn>
      </View>
    );
  }

  // iPhone SE і подібні: аркуш результату компактніший
  const compact = win.height < 700;
  // Розкладка рахується для зони під статус-баром і зсувається на bleedTop:
  // відступи від низу (затвор, режими) від цього не змінюються.
  const L0 = scannerLayout({ width: win.width, height: rootH - bleedTop, firstScan, scene: sceneMode });
  const L = { ...L0, frame: { ...L0.frame, y: L0.frame.y + bleedTop }, hintTop: L0.hintTop + bleedTop };
  // Безкоштовні скани. Нуль — не «0 лишилось» поруч із затвором, який
  // відкриє лише пейвол, а чесне «використано», корона на затворі й чип Pro
  // угорі (поки аркуш результату закриває камеру, чип ні до чого).
  const usedUp = !firstScan && scansLeft === 0;
  const status =
    firstScan || scansLeft === undefined || scansLeft === null
      ? null
      : !Number.isFinite(scansLeft)
        ? { kind: 'pro' }
        : scansLeft > 0
          ? { kind: 'free', n: scansLeft }
          : onOpenPro && !loading && !result
            ? { kind: 'chip' }
            : null;
  const sceneStatus = [t('sceneStatus1'), t('sceneStatus2'), t('sceneStatus3')];
  const idleHint = usedUp ? t('scanUsedUp') : firstScan ? t('scanFirstHint') : sceneMode ? t('sceneHint') : t('hint');
  const hintText = loading ? (sceneMode ? sceneStatus[statusIdx] : t('scanning')) : idleHint;
  const shutterState = loading ? 'busy' : usedUp ? 'pro' : sceneMode ? 'room' : 'lens';
  // Підказка: під кадром предмета; у високому кадрі сцени — усередині, згори
  const hintMax = L.hintInside ? Math.min(300, L.frame.w - 24) : 300;
  const cx = win.width / 2;

  return (
    <View style={[s.root, bleedTop ? { marginTop: -bleedTop } : null]} onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        zoom={zoom}
        enableTorch={torch && cameraLive}
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
          top={insets.top - bleedTop}
          rootH={rootH}
          reduced={reduced}
        />
      ) : (
        // Кадр із «прожектором» довкола. Маскот тут не зʼявляється —
        // стрибаючий персонаж посеред камери перекриває саме той предмет,
        // який людина наводить.
        <Viewfinder frame={L.frame} rootW={win.width} rootH={rootH} loading={loading} reduced={reduced} />
      )}

      {/* Підказка (чи помилка на її місці): погляд іде кадр → підказка → затвор */}
      <View pointerEvents="box-none" style={[s.hintWrap, { top: L.hintTop }]}>
        {error ? (
          <FadeIn dy={6}>
            <CamGlass radius={22} style={[s.errorPill, { maxWidth: Math.min(360, win.width - 32) }]}>
              <IcWarn size={19} color={CAM.warn} />
              <Text style={s.errorText} maxFontSizeMultiplier={CAM_FONT} accessibilityLiveRegion="polite">
                {error}
              </Text>
              <Pressable
                onPress={() => setError('')}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={t('close')}
                style={s.errorClose}
              >
                <IcClose size={17} color={CAM.dim} />
              </Pressable>
            </CamGlass>
          </FadeIn>
        ) : (
          <CamGlass radius={20} style={[s.hintPill, { maxWidth: hintMax }]} pointerEvents="none">
            <Text style={s.hint} maxFontSizeMultiplier={CAM_FONT} numberOfLines={3} accessibilityLiveRegion="polite">
              {hintText}
            </Text>
          </CamGlass>
        )}
      </View>

      <TopBar
        firstScan={firstScan}
        lang={targetLang}
        onLang={
          onChangeLang
            ? () => {
                track('scan_lang_chip');
                onChangeLang();
              }
            : undefined
        }
        langDisabled={loading}
        status={status}
        onPro={onOpenPro}
        torch={torch && cameraLive}
        onTorch={toggleTorch}
        onClose={onExit ? () => onExit('closed') : undefined}
        wide={win.width >= 390}
        offset={bleedTop}
        t={t}
      />

      {firstScan ? null : (
        <ModeSwitch
          mode={mode}
          onChange={switchMode}
          disabled={loading}
          locked={sceneLocked}
          reduced={reduced}
          bottom={L.modeBottom}
          t={t}
        />
      )}

      {/* Ряд затвора: ліворуч наліпка останнього слова, по центру затвор,
          праворуч зум. Без таб-бара (перший скан) — нижче, під великий палець. */}
      <View pointerEvents="box-none" style={[s.shutterRow, { bottom: L.shutterBottom }]}>
        {!firstScan && lastWord && !frozen ? (
          <View style={{ position: 'absolute', left: cx - SIDE_OFFSET - 25, top: (SHUTTER - 50) / 2 }}>
            <LastWord word={lastWord} onPress={openLastWord} reduced={reduced} t={t} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: cx - SHUTTER / 2, top: 0 }}>
          <Shutter state={shutterState} onPress={scan} reduced={reduced} t={t} />
        </View>
        {frozen ? null : (
          <View style={{ position: 'absolute', left: cx + SIDE_OFFSET - 24, top: (SHUTTER - 48) / 2 }}>
            <ZoomButton zoom={zoom} onChange={setZoomPreset} t={t} />
          </View>
        )}
      </View>

      <Modal visible={!!result} transparent animationType="slide" onRequestClose={backFromResult}>
        {/* Тло — лише для пальця; VoiceOver закриває аркуш кнопкою або жестом виходу */}
        <Pressable style={s.modalBackdrop} onPress={tapBackdrop} accessible={false} />
        {/* Від 7/10 під прикладом ще кілька виразів — і на маленькому
            iPhone аркуш може не влізти. Тоді гортається лише вміст, а кнопки
            стоять унизу: «Зберегти» видно завжди, без жодного гортання. */}
        <View
          style={[s.sheet, compact && !insets.bottom && s.sheetCompact, { maxHeight: win.height - insets.top - 8 }]}
          onAccessibilityEscape={backFromResult}
        >
          <View style={s.sheetHandle} />
          <ScrollView style={s.sheetScroll} bounces={false} showsVerticalScrollIndicator={false}>
            {result ? (
              <>
                {result.photo ? (
                  // На низькому екрані (SE) наліпка менша — місце потрібне слову й прикладу
                  <View style={{ alignItems: 'center', marginBottom: compact ? 0 : 14 }}>
                    <StickerLarge
                      uri={result.photo}
                      shape={result.shape}
                      outline={result.outline}
                      box={result.box}
                      size={compact ? 110 : 150}
                      pop
                    />
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
              </>
            ) : null}
          </ScrollView>
          {result ? (
            <FadeIn delay={90} style={s.sheetBtns}>
              <View style={s.btnRow}>
                <View style={{ flex: 1 }}>
                  {unsaved ? (
                    <GradBtn title={t('save')} onPress={save} />
                  ) : (
                    <View style={s.savedBadge}>
                      <Text style={s.savedBadgeText}>{t('saved')}</Text>
                    </View>
                  )}
                </View>
                <Press style={s.shareBtn} onPress={share} accessibilityLabel={t('share')}>
                  <IcShare size={22} color={C.accent} />
                </Press>
              </View>
              {/* «Сканувати ще» — явна відмова від слова. Після останнього
                  безкоштовного скану (і в онбордингу) її немає: затвор однаково
                  відкрив би лише пейвол, а слово пропало б. Щойно слово
                  збережене — на її місці «Готово». */}
              {lastScan ? null : <SecBtn title={t('scanAgain')} onPress={closeResult} />}
              {doneBtn ? <SecBtn title={t('finishBtn')} onPress={closeResult} /> : null}
            </FadeIn>
          ) : null}
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
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: CAM.black, opacity: a }]} />
      <Animated.View
        style={{ position: 'absolute', left: f.x, top: y, width: f.w, height: f.h, overflow: 'hidden', transform: motion }}
      >
        <Image source={{ uri: image.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: CAM.frozenDim }]} />
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
                  <Stop offset="0" stopColor={CAM.glint} stopOpacity={0} />
                  <Stop offset="0.5" stopColor={CAM.glint} stopOpacity={0.3} />
                  <Stop offset="1" stopColor={CAM.glint} stopOpacity={0} />
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

// Перший скан: скільки видно «Збережено» і скільки їде вниз аркуш
export const FIRST_SAVED_MS = 650;
export const FIRST_SHEET_MS = 320;

const makeStyles = (C) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: CAM.black },
    center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 30 },
    permTitle: { color: C.text, fontSize: 22, letterSpacing: -0.31, fontFamily: F.bold, marginTop: 14, marginBottom: 8, textAlign: 'center' },
    permText: { color: C.dim, fontSize: 15, textAlign: 'center', marginBottom: 24, lineHeight: 21, fontFamily: F.reg },
    // хрестик на екрані дозволу — у кольорах застосунку, а не камери
    permExit: {
      position: 'absolute',
      left: 14,
      zIndex: 20,
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: C.card2,
    },

    // ── хром камери: фіксовані кольори темної палітри (src/scanner/CamGlass.js) ──
    hintWrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
    hintPill: { paddingHorizontal: 16, paddingVertical: 9 },
    hint: { color: CAM.text, fontSize: 14, lineHeight: 19, fontFamily: F.semi, textAlign: 'center' },
    errorPill: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingRight: 10, paddingVertical: 11 },
    errorText: { color: CAM.text, fontSize: 14, lineHeight: 19, fontFamily: F.semi, flexShrink: 1 },
    errorClose: { padding: 4, alignSelf: 'flex-start' },
    shutterRow: { position: 'absolute', left: 0, right: 0, height: SHUTTER },

    modalBackdrop: { flex: 1, backgroundColor: CAM.scrim },
    sheet: {
      backgroundColor: C.sheet,
      borderTopLeftRadius: R.xl,
      borderTopRightRadius: R.xl,
      padding: 24,
      paddingBottom: 42,
    },
    // SE без домашнього індикатора: менше порожнього місця під кнопками
    sheetCompact: { paddingTop: 16, paddingBottom: 18 },
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
    extrasTitle: { color: C.dim, ...CAPS, marginBottom: 4 },
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
