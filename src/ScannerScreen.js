import { forwardRef, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { StatusBar } from 'expo-status-bar';
import { Asset } from 'expo-asset';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { abortScans, recognizeImage, recognizeScene } from './api';
import { track } from './analytics';
import { captureScene, createCutter, cropToObject, dropFile, objectJpeg, scanBackdrop } from './cutout';
import { DEV_SAMPLE, isSimulatorShot } from './devSample';
import { speak } from './speech';
import { IcCheck, IcClose, IcShare, IcSpeaker, IcWarn } from './icons';
import { MascotBob } from './Mascot';
import { StickerLarge } from './Sticker';
import ShareSheet from './share/ShareSheet';
import ConsentSheet from './ConsentSheet';
import { AI_CONSENT_SHEET } from './flags';
import SceneView from './scene/SceneView';
import { fitContain } from './scene/sceneLayout';
import { hasWord, newSceneId } from './scene/scenes';
import { useSafeAreaInsets } from './SafeArea';
import { FadeIn, GradBtn, Press, SecBtn } from './ui';
import { DUR, EASE, SPRING, haptic, layoutNext, useAnnounce, useReducedMotion } from './motion';
import { CAPS, F, R, ipaFont, useTheme } from './theme';
import { CAM, CAM_FONT, CamGlass } from './scanner/CamGlass';
import TopBar from './scanner/TopBar';
import Viewfinder from './scanner/Viewfinder';
import ModeSwitch, { MODES } from './scanner/ModeSwitch';
import Shutter from './scanner/Shutter';
import LastWord from './scanner/LastWord';
import { ZoomControl } from './scanner/ZoomButton';
import { pinchStep } from './scanner/pinch';
import { createZoom, useZoom } from './scanner/zoomStore';
import { SHUTTER, SIDE_OFFSET, scannerLayout } from './scanner/layout';
import { quote } from './share/layout';

// Відмови сервера за оплатою (402): безкоштовний скан витрачено або
// безкоштовна сцена вже використана. Це не помилки, а пейвол — його
// відкриває App.
const PAYWALL_CODES = ['SCAN_LIMIT', 'SCENE_PRO'];

// Поки модель шукає предмети сцени (5–12 с), рядок статусу міняється:
// мовчазне очікування здається довшим, ніж є.
const STATUS_EVERY = 2600;

// Камера піднімається з чорного не миттєво (300–800 мс після кожного
// повернення на вкладку). Чорна запона над нею сходить, щойно прийшов перший
// кадр; якщо подія не прийшла (веб, збій), запона все одно йде за цим
// таймером, і екран не лишається чорним.
const VEIL_MAX_MS = 1200;

// Останній відомий стан дозволу камери. useCameraPermissions щоразу стартує
// з null, а сканер перемонтується на кожному поверненні на вкладку: без кешу
// кілька кадрів стояв би фон теми (білий спалах у світлій темі) перед чорною
// камерою. Кешуємо лише відповідь системи, тож екран-пояснення перед першим
// запитом (App Review 5.1.1(iv)) не змінюється: поки відповіді не було, фон
// теми, як і раніше.
let lastPermission = null;

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
  // App питає, чи сканер у дорозі з одним предметом: доки так, з вкладки не
  // виходимо (скан уже зарахований, а результат зник би разом зі сканером).
  // Екземпляр онбордингу пропа не отримує.
  onBusyChange,
  t,
}) {
  const { C } = useTheme();
  const s = useMemo(() => makeStyles(C), [C]);
  const win = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();

  const cameraRef = useRef(null);
  const [livePermission, requestPermission, getPermission] = useCameraPermissions();
  // Хук щоразу стартує з null: поки системи не спитали, беремо останню відому
  // відповідь (див. lastPermission)
  const permission = livePermission ?? lastPermission;
  useEffect(() => {
    if (livePermission) lastPermission = livePermission;
  }, [livePermission]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [justSaved, setJustSaved] = useState(false);
  const [sharing, setSharing] = useState(null);
  const [askConsent, setAskConsent] = useState(false);
  // Зум — не стан сканера: щипок міняє його до 60 разів на секунду, і весь хром
  // не мусить за ним перемальовуватись (див. src/scanner/zoomStore.js)
  const [zoom] = useState(createZoom);
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
  // Сцена замикання вкладки не просить: її кадр заморожений, а вихід скасовує
  // запит (abortScans); один предмет тримає вкладку, поки йде розпізнавання
  const holdsTab = loading && !sceneMode;
  useEffect(() => {
    onBusyChange?.(holdsTab);
  }, [holdsTab]);
  useEffect(() => () => onBusyChange?.(false), []);
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
  // Файли кешу, які після закриття нікому не потрібні, стираємо, а не
  // лишаємо на тижні:
  //   frozenFile — кадр 9:16 сцени, поки він під сценою; null, якщо на нього
  //     посилається сама збережена сцена (копія в Documents не вдалась);
  //   resultUsed — слово з результату зберігали чи ним ділились: тоді файл
  //     наліпки не чіпаємо (App міг не скопіювати його в Documents, і слово
  //     тримає саме цей шлях);
  //   strays — наліпки закритих результатів, якими ніхто не скористався;
  //   cutterRef — різальник сцени, чиї наліпки предметів лежать у кеші.
  const frozenFile = useRef(null);
  const resultUsed = useRef(false);
  const strays = useRef([]);
  const cutterRef = useRef(null);
  // Свіжий словник для таймерів і демонтажу, що створені один раз
  const savedRef = useRef(savedWords);
  savedRef.current = savedWords;
  // Сканер демонтується посеред запиту (людина пішла на іншу вкладку): усе,
  // що scan() робив би далі, втрачає сенс. Запит скасовуємо (api.abortScans):
  // поки фото ще вантажиться, сервер слот не бере і скан не згорає (коли AI
  // вже думає, скан зарахований у будь-якому разі). Тимчасові файли прибираємо.
  const dead = useRef(false);
  // прозорість чорної запони над камерою (див. «Запона над камерою» нижче)
  const veil = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    dead.current = false;
    return () => {
      dead.current = true;
      abortScans?.();
      veil.stopAnimation();
      clearTimeout(thaw.current);
      firstDone.current.forEach(clearTimeout);
      dropFile(backdropRef.current);
      backdropRef.current = null;
      dropFile(frozenFile.current);
      frozenFile.current = null;
      flushStrays();
      dropSceneCuts();
    };
  }, []);

  // ── Ліхтарик ──
  // Світить, лише поки людина наводить: гасне, щойно відкрився результат чи
  // сцена (камера тоді стоїть), коли застосунок пішов у фон і перед екраном
  // дозволу. Зміна вкладки розмонтовує сканер разом із камерою — і ліхтарем.
  const cameraLive = !result && !scene && !frozen;
  useEffect(() => {
    if (!cameraLive) setTorch(false);
  }, [cameraLive]);
  const granted = !!permission?.granted;
  // Свіжі значення для слухача, що створюється один раз
  const grantedRef = useRef(granted);
  grantedRef.current = granted;
  const getPermissionRef = useRef(getPermission);
  getPermissionRef.current = getPermission;
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setTorch(false);
      // Людина пішла в Параметри, увімкнула камеру й повернулась (iOS не завжди
      // перезапускає застосунок): екран «Відкрити Параметри» мусить це побачити
      else if (!grantedRef.current) getPermissionRef.current?.();
    });
    return () => sub?.remove?.();
  }, []);
  useEffect(() => {
    if (!granted) setTorch(false);
  }, [granted]);

  // ── Запона над камерою ──
  // Чорна запона над CameraView сходить, коли прийшов перший кадр, — камера
  // проявляється, а не вискакує. «Менше руху»: коротше, але теж зникає.
  const [veiled, setVeiled] = useState(true);
  const veilTimer = useRef(null);
  const revealCamera = useCallback(() => {
    clearTimeout(veilTimer.current);
    Animated.timing(veil, { toValue: 0, duration: reduced ? DUR.micro : DUR.panel, easing: EASE.out, useNativeDriver: true }).start(() => setVeiled(false));
  }, [reduced]);
  useEffect(() => {
    if (!granted) return undefined;
    veilTimer.current = setTimeout(revealCamera, VEIL_MAX_MS);
    return () => clearTimeout(veilTimer.current);
  }, [granted]);

  function toggleTorch() {
    const on = !torch;
    setTorch(on);
    haptic('selection');
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

  // VoiceOver: accessibilityLiveRegion працює лише на Android, тож початок
  // розпізнавання й помилку озвучуємо самі. У сцені з трьох рядків статусу
  // читаємо перший і останній: середній за 2,6 с лише перебив би їх.
  useAnnounce(
    !loading ? '' : !sceneMode ? t('scanning') : statusIdx === 1 ? '' : t(statusIdx === 0 ? 'sceneStatus1' : 'sceneStatus3')
  );
  useAnnounce(error);

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

  // База щипка: відстань між пальцями й зум на мить, коли їх стало двоє.
  // pinched — щипок у цьому жесті справді був (щоб він не став свайпом режиму).
  const pinchBase = useRef(null);
  const pinched = useRef(false);
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
      onPanResponderGrant: () => {
        pinched.current = false;
      },
      onPanResponderMove: (e) => {
        const step = pinchStep(pinchBase.current, e.nativeEvent.touches, zoom.get());
        pinchBase.current = step.base;
        if (step.base) pinched.current = true;
        // палець піднято: зум стає там, де зупинились пальці
        else zoom.settle();
        if (step.zoom === null) return;
        zoom.pinch(step.zoom);
      },
      onPanResponderRelease: (_, g) => {
        // жест зуму не перемикає режим, навіть якщо пальці з'їхали вбік
        const wasPinch = pinched.current;
        pinched.current = false;
        pinchBase.current = null;
        zoom.settle();
        if (!wasPinch && Math.abs(g.dx) > 50 && Math.abs(g.dx) > Math.abs(g.dy) * 2) swipeRef.current(g.dx);
      },
      onPanResponderTerminate: () => {
        pinched.current = false;
        pinchBase.current = null;
        zoom.settle();
      },
    })
  ).current;

  function setZoomPreset(v) {
    zoom.set(v);
  }

  function switchMode(next) {
    if (next === mode || busy.current) return;
    if (next === 'scene' && sceneLocked && onScenePro) {
      haptic('selection');
      onScenePro();
      return;
    }
    haptic('selection');
    // кадр і підказка плавно перебудовуються під новий режим
    layoutNext();
    setError('');
    onScanModeChange?.(next);
  }

  // Те саме написання іншою мовою (hotel, radio, taxi) — інше слово: так
  // питає й екран сцени, і App.addWords (scene/scenes.hasWord)
  const alreadySaved = !!result && hasWord(savedWords, { word: result.word, lang: targetLang });
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
    // (див. ConsentSheet). Без згоди кадр навіть не знімаємо. Аркуш вимкнено
    // прапорцем AI_CONSENT_SHEET (src/flags.js) — тоді знімаємо одразу.
    if (AI_CONSENT_SHEET && !aiConsent) {
      setAskConsent(true);
      return;
    }
    // Ліміт перевіряємо до зйомки: інакше витратимо виклик AI і покажемо
    // відмову вже після нього — це виглядає як обман. Сцена коштує один скан
    // і ще одну безкоштовну пробу сцени, тож воротар має знати режим.
    if (onGuardScan && !onGuardScan(mode)) return;
    busy.current = true;
    setError('');
    // Кадр сцени, що ще не встиг зійти (450 мс після її закриття), не має
    // лишитись висіти над камерою нового скану
    clearTimeout(thaw.current);
    clearFrozen();
    dropSceneCuts();
    // на Android події dismiss нема: до нового скану аркуш давно поїхав
    flushStrays();
    let photo = null;
    // Кадр сцени живе довше за запит: з нього ще ріжуться наліпки
    let handedOver = false;
    try {
      setLoading(true);
      haptic('medium');
      // На телефоні кадр лишається в пам'яті (pictureRef) і не пишеться на
      // диск, щоб потім двічі читатись назад. Веб так не вміє — там файл.
      const native = Platform.OS !== 'web';
      photo = await cameraRef.current.takePictureAsync({ quality: 0.7, ...(native ? { pictureRef: true } : null) });
      // Після кожного await: сканер міг демонтуватись (вкладку змінено).
      // Тоді нічого не показуємо, а кадр звільнить finally.
      if (dead.current) return;
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
        if (dead.current) return;
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
        // Сервер уже зарахував скан, тож лічильник App оновлюємо й тоді, коли
        // відповідь прийшла вже без сканера (запит скасовано не встиг)
        if (onScanned) onScanned(res);
        if (dead.current) {
          backdropP.then(dropFile);
          return;
        }
        // Два декодування великого кадру одночасно не йдуть: спершу тло
        // дорендерюється, потім вирізаємо наліпку.
        const backdrop = await backdropP;
        if (dead.current) {
          dropFile(backdrop);
          return;
        }
        // Вирізаємо САМ предмет по рамці від моделі, а не весь кадр.
        // Скріншот екрана з обрізаними краями виглядає випадковим і губить стиль;
        // вирізаний предмет читається як наліпка, яку ти зловив.
        const cut = await cropToObject(source, photo.width, photo.height, res.box, res.outline);
        if (dead.current) {
          dropFile(backdrop);
          dropFile(cut.uri);
          return;
        }
        dropFile(backdropRef.current);
        backdropRef.current = backdrop;
        resultUsed.current = false;
        setResult({ ...res, photo: cut.uri, shape: cut.shape, backdrop });
        setJustSaved(false);
      }
      if (dead.current) return;
      // Перший скан в онбордингу — легкий дотик: бюджет знайомства — три
      // Success (день 7 у вітрині, «Зберегти», обіцянка), і Success тут
      // перебив би «Зберегти» за мить
      haptic(firstScan ? 'light' : 'success');
      track('scan', { mode, ok: true, source: scanSource });
    } catch (e) {
      if (dead.current) {
        // Сканера вже нема: ні плашки, ні віброгуку (скасований запит теж
        // падає, як SCAN_TIMEOUT). Лише справа, що стосується самого App.
        if (e.message === 'SCAN_AUTH' && onSessionLost) onSessionLost();
        return;
      }
      // Кадр сцени плавно відходить до живого прев'ю, а не зникає навмання
      if (sceneMode) thawFrozen(DUR.exit);
      else setFrozen(null);
      // Ліміт вичерпано — це не помилка, а пейвол (сервер навіть не кликав
      // AI). Його вже відкрив App, коли recognize спитав, що робити, тож тут
      // ні плашки, ні віброгуку: це не поломка.
      if (e.paywalled) return;
      // «Не бачу предмета» — найчастіший м'який результат: попередження, а не
      // помилка. Мережа, таймаут і сервер — справжня відмова.
      haptic(e.message === 'SCAN_EMPTY' ? 'warning' : 'error');
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
    if (dead.current) {
      dropFile(shot.image.uri);
      return false;
    }
    setFrozen(shot.image);
    frozenFile.current = shot.image.uri;
    let res;
    try {
      res = await recognize(recognizeScene, shot.base64);
    } catch (e) {
      // сцена не відкриється, а кадр 9:16 лежить у кеші: ніхто на нього не посилається
      if (dead.current) dropFile(shot.image.uri);
      throw e;
    }
    // як і в предметі: скан зараховано на сервері, тож лічильник оновлюємо завжди
    if (onScanned) onScanned(res);
    if (dead.current) {
      dropFile(shot.image.uri);
      return false;
    }
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
    // Шлях змінився — фото вже скопійоване в Documents, і кеш-оригінал піде
    // разом із замороженим кадром. Той самий шлях — сцена тримає саме його.
    if (stored.image === shot.image.uri) frozenFile.current = null;
    const cutter = createCutter({ source, width: photo.width, height: photo.height, crop: shot.crop, objects, eager: true });
    cutter.done.finally(() => typeof photo.release === 'function' && photo.release());
    cutterRef.current = cutter;
    setSceneCutter(cutter);
    setScene(stored);
    return true;
  }

  // Сервер відмовив за оплатою (402: SCAN_LIMIT чи SCENE_PRO). App або
  // відкриває пейвол (false), або — Pro щойно куплено, сервер перепитав
  // RevenueCat і зняв стелю (true) — тоді той самий кадр іде ще раз, і
  // людині не треба знімати вдруге.
  // Відмова пейволу (e.paywalled) — лише коли App справді відкрив пейвол.
  // Якщо повторний запит після покупки теж дістав 402 (вебхук запізнився),
  // це вже звичайна помилка з плашкою, а не мовчазна зупинка.
  async function recognize(fn, base64) {
    try {
      return await fn(base64, targetLang, nativeLang, level);
    } catch (e) {
      // сканера вже нема: пейвол над іншою вкладкою нікому не потрібен
      if (!PAYWALL_CODES.includes(e.message) || !onLimitReached || dead.current) throw e;
      const resend = await onLimitReached(e.data, e.message);
      if (dead.current) throw e;
      if (!resend) {
        e.paywalled = true;
        throw e;
      }
    }
    return fn(base64, targetLang, nativeLang, level);
  }

  // Камера стояла на паузі, поки була відкрита сцена, і запускається не
  // миттєво. Заморожений кадр лишається під сценою, що згасає, і зникає,
  // коли прев'ю вже живе, — замість чорного проблиску.
  function closeScene() {
    setScene(null);
    clearTimeout(thaw.current);
    thaw.current = setTimeout(() => {
      clearFrozen();
      dropSceneCuts();
    }, 450);
  }

  // Наліпки предметів сцени (їх ріже різальник у кеші): сцену закрито, і ті,
  // що не потрапили в словник, нікому не потрібні. Слово, чия копія в
  // Documents не вдалась, тримає саме кеш-файл — його лишаємо. Таймер після
  // закриття (450 мс) дає словнику встигнути оновитись.
  function dropSceneCuts() {
    const cutter = cutterRef.current;
    cutterRef.current = null;
    if (!cutter) return;
    cutter.files().then((uris) => {
      const used = new Set((savedRef.current || []).map((w) => w && w.photo));
      uris.forEach((uri) => used.has(uri) || dropFile(uri));
    });
  }

  // Заморожений кадр іде з екрана, а разом із ним — його файл у кеші, якщо
  // сцена має свою копію в Documents (див. frozenFile).
  function clearFrozen() {
    setFrozen(null);
    dropFile(frozenFile.current);
    frozenFile.current = null;
  }

  // Скан сцени не вдався: заморожений кадр за ms мс відходить до живого
  // прев'ю (зворотний бік того, як він «застигав»), а не зникає за один кадр.
  // Плашку помилки це не затримує. Таймер — той самий thaw, що й у closeScene,
  // тож новий скан його скасує.
  function thawFrozen(ms) {
    Animated.timing(freeze, { toValue: 0, duration: ms, easing: EASE.out, useNativeDriver: true }).start();
    clearTimeout(thaw.current);
    thaw.current = setTimeout(clearFrozen, ms + 30);
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
    resultUsed.current = true;
    // App відмовив (стеля безкоштовного словника) і відкрив пейвол. Під цим
    // Modal його не видно — закриваємо аркуш; слово App збереже сам, якщо
    // людина оформить Pro.
    if (!onSaveWord(resultWord())) {
      closeResult();
      return;
    }
    setJustSaved(true);
    haptic('success');
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
    // аркуш уже їде вниз (Modal тримає знімок), а результату нема
    if (!result) return;
    resultUsed.current = true;
    haptic('selection');
    setSharing({ kind: 'word', word: resultWord(), backdrop: result.backdrop || null });
  }

  function closeResult() {
    // Слово не зберігали й ним не ділились: файл наліпки нікому не потрібен.
    // Стираємо його, коли аркуш уже поїхав (onDismiss), а не зараз: Modal ще
    // ~300 мс малює знімок з наліпкою.
    if (result?.photo && !resultUsed.current && !strays.current.includes(result.photo)) strays.current.push(result.photo);
    dropFile(backdropRef.current);
    backdropRef.current = null;
    setSharing(null);
    setResult(null);
  }

  // Аркуш поїхав униз: знімок більше не малюється, і невикористані наліпки
  // можна стирати
  function dismissResult() {
    snap.current = null;
    flushStrays();
  }

  function flushStrays() {
    strays.current.splice(0).forEach(dropFile);
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
  // аркуш нічого не закриває. Але й мовчати не можна: це читається як завислий
  // екран, тож «Зберегти» коротко відповідає, ніби кажучи «спершу тут».
  // Пружинка 1 → 1,03 → 1 (без перельоту), з «Менше руху» непрозорість на мить
  // темніє. Вібрації немає: випадковий дотик не заслуговує на віддачу.
  const nudgeScale = useRef(new Animated.Value(1)).current;
  const nudgeDip = useRef(new Animated.Value(1)).current;
  function nudgeSave() {
    if (reduced) {
      Animated.sequence([
        Animated.timing(nudgeDip, { toValue: 0.55, duration: DUR.press, easing: EASE.out, useNativeDriver: true }),
        Animated.timing(nudgeDip, { toValue: 1, duration: DUR.micro, easing: EASE.soft, useNativeDriver: true }),
      ]).start();
      return;
    }
    Animated.sequence([
      Animated.spring(nudgeScale, { toValue: 1.03, ...SPRING.snappy }),
      Animated.spring(nudgeScale, { toValue: 1, ...SPRING.ui }),
    ]).start();
  }

  function tapBackdrop() {
    if (firstDone.current.length) return;
    if (unsaved) nudgeSave();
    else closeResult();
  }

  // Наліпка останнього слова: обробник стабільний, щоб memo LastWord не
  // скидалося кожним рендером сканера (статус, підказка, помилка)
  const openLastWord = useCallback(
    (id) => {
      track('scan_last_word');
      onOpenWord?.(id);
    },
    [onOpenWord]
  );

  // Знімок того, що показує аркуш. Modal на iOS їде вниз ще ~300 мс після
  // visible={false}, а result на той час уже null: без знімка слово, наліпка
  // й кнопки зникали б першим кадром, і вниз їхала б порожня оболонка (так
  // само SceneView тримає `shown`). Разом із вмістом заморожуємо й похідні
  // прапорці: інакше «Зберегти» перетворилось би на «Збережено», а «Готово»
  // з'явилось би вже посеред виїзду.
  const snap = useRef(null);
  if (result) snap.current = { result, unsaved, doneBtn, lastScan };
  const view = snap.current;

  // Розкладка рахується для зони під статус-баром і зсувається на bleedTop:
  // відступи від низу (затвор, режими) від цього не змінюються. Мемо, щоб
  // рамка (L.frame) лишалась тим самим обʼєктом, поки екран не повернули чи
  // режим не змінили: тоді Viewfinder (memo) пропускає рендери сканера, які
  // його не стосуються (статус, підказка, помилка).
  const L = useMemo(() => {
    const L0 = scannerLayout({ width: win.width, height: rootH - bleedTop, firstScan, scene: sceneMode });
    return { ...L0, frame: { ...L0.frame, y: L0.frame.y + bleedTop }, hintTop: L0.hintTop + bleedTop };
  }, [win.width, rootH, bleedTop, firstScan, sceneMode]);

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
  // Усередині вузького кадру сцени (SE) довга підказка (de) займає більше
  // рядків — краще так, ніж обрізати її трикрапкою; на iOS текст ще й трохи
  // зменшується, щоб уміститись.
  const hintMax = L.hintInside ? Math.min(300, L.frame.w - 20) : 300;
  const hintLines = L.hintInside ? 5 : 3;
  const cx = win.width / 2;

  return (
    <View style={[s.root, bleedTop ? { marginTop: -bleedTop } : null]} onLayout={(e) => setRootH(e.nativeEvent.layout.height)}>
      {/* Перший скан в онбордингу: камера під статус-баром, а App тримає там
          статус-бар теми (темний текст у світлій) — над камерою свій, світлий.
          Лише поки видно камеру: екран дозволу камери — на тлі теми. У вкладці
          статус-бар веде App (пейвол над камерою має бути темним). */}
      {firstScan && bleedTop ? <StatusBar style="light" /> : null}
      <ZoomCamera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing="back"
        store={zoom}
        enableTorch={torch && cameraLive}
        // Сцена закриває екран повністю: камеру під нею зупиняємо — не гріємо
        // телефон і не світимо індикатором камери, поки людина роздивляється фото
        active={!scene}
        onCameraReady={revealCamera}
        onMountError={() => setError(t('scanErrCamera'))}
      />

      {veiled ? (
        <Animated.View testID="camera-veil" pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: CAM.black, opacity: veil }]} />
      ) : null}

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
            <Text
              style={s.hint}
              maxFontSizeMultiplier={CAM_FONT}
              numberOfLines={hintLines}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
              accessibilityLiveRegion="polite"
            >
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
        closeDisabled={loading}
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
            <LastWord word={lastWord} onPress={openLastWord} paused={resultOpen} disabled={loading} reduced={reduced} t={t} />
          </View>
        ) : null}
        <View style={{ position: 'absolute', left: cx - SHUTTER / 2, top: 0 }}>
          <Shutter state={shutterState} onPress={scan} reduced={reduced} t={t} />
        </View>
        {frozen ? null : (
          <View style={{ position: 'absolute', left: cx + SIDE_OFFSET - 24, top: (SHUTTER - 48) / 2 }}>
            <ZoomControl store={zoom} onChange={setZoomPreset} t={t} />
          </View>
        )}
      </View>

      <Modal visible={!!result} transparent animationType="slide" onRequestClose={backFromResult} onDismiss={dismissResult}>
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
            {view ? (
              <>
                {view.result.photo ? (
                  // На низькому екрані (SE) наліпка менша — місце потрібне слову й прикладу
                  <View style={{ alignItems: 'center', marginBottom: compact ? 0 : 14 }}>
                    <StickerLarge
                      uri={view.result.photo}
                      shape={view.result.shape}
                      outline={view.result.outline}
                      box={view.result.box}
                      size={compact ? 110 : 150}
                      pop
                    />
                  </View>
                ) : null}
                <FadeIn dy={14}>
                  <View style={s.wordRow}>
                    <Text style={s.word}>{view.result.word}</Text>
                    <Press style={s.speakBtn} onPress={() => speak(view.result.word, targetLang)} accessibilityLabel={t('listen')}>
                      <IcSpeaker size={20} color={C.accent} />
                    </Press>
                  </View>
                  {view.result.ipa ? <Text style={s.ipa}>{view.result.ipa}</Text> : null}
                  <Text style={s.translation}>{view.result.translation}</Text>
                </FadeIn>

                {view.result.example ? (
                  <FadeIn delay={45}>
                    <Press
                      style={s.exampleBox}
                      onPress={() => speak(view.result.example, targetLang)}
                      accessibilityHint={t('listen')}
                    >
                      <View style={s.exampleSpeaker}>
                        <IcSpeaker size={15} color={C.dim} />
                      </View>
                      <Text style={s.example}>{quote(view.result.example, targetLang)}</Text>
                      {view.result.exampleTranslation ? <Text style={s.exampleTr}>{view.result.exampleTranslation}</Text> : null}
                    </Press>
                  </FadeIn>
                ) : null}

                {/* «Ще вирази»: колокації, ідіоми й фразові дієслова зі словом —
                    для тих, кому сам іменник уже нічого не дає. Тап — озвучити. */}
                {view.result.extras?.length ? (
                  <FadeIn delay={70} style={s.extras}>
                    <Text style={s.extrasTitle}>{t('moreExpr')}</Text>
                    {view.result.extras.map((x, i) => (
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
          {view ? (
            <FadeIn delay={90} style={s.sheetBtns}>
              <View style={s.btnRow}>
                <View style={{ flex: 1 }}>
                  {view.unsaved ? (
                    <Animated.View style={{ opacity: nudgeDip, transform: [{ scale: nudgeScale }] }}>
                      <GradBtn title={t('save')} onPress={save} />
                    </Animated.View>
                  ) : (
                    // Збережено: бейдж проявляється, а не підміняє кнопку за один кадр
                    <FadeIn dy={0}>
                      <View style={s.savedBadge}>
                        <IcCheck size={20} color={C.green} />
                        <Text style={s.savedBadgeText}>{t('saved')}</Text>
                      </View>
                    </FadeIn>
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
              {view.lastScan ? null : <SecBtn title={t('scanAgain')} onPress={closeResult} />}
              {view.doneBtn ? <SecBtn title={t('finishBtn')} onPress={closeResult} /> : null}
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
      {AI_CONSENT_SHEET ? (
        <ConsentSheet visible={askConsent} onAllow={allowUpload} onClose={() => setAskConsent(false)} t={t} />
      ) : null}
    </View>
  );
}

// ─── Камера із зумом ───────────────────────────────────────────────────────
// Зум читає тут, а не ScannerScreen: щипок перемальовує лише камеру (і кнопку
// «1×»), а не весь хром (див. src/scanner/zoomStore.js).
const ZoomCamera = forwardRef(function ZoomCamera({ store, ...rest }, ref) {
  return <CameraView ref={ref} zoom={useZoom(store)} {...rest} />;
});

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
        style={{
          position: 'absolute',
          left: f.x,
          top: y,
          width: f.w,
          height: f.h,
          overflow: 'hidden',
          transform: motion,
          // без руху кадр не їде, але з'являється й відходить проявленням
          ...(reduced ? { opacity: a } : null),
        }}
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
      ...ipaFont('700'),
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
    // висота — як у «Зберегти» (paddingVertical 16), щоб ряд не стрибав
    savedBadge: {
      borderRadius: R.md,
      paddingVertical: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      backgroundColor: C.greenSoft,
    },
    // текст успіху на greenSoft — greenInk (чистий green там лише 3,8:1); галочка лишається green
    savedBadgeText: { color: C.greenInk, fontSize: 17, fontFamily: F.semi },
  });
