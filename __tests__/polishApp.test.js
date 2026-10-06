// Полірування застосунку: те, що людина бачить на кожній вкладці.
//   • аркуш результату скану: «Зберегти» завжди видно, слово не губиться
//     випадково (тло, «назад», «Сканувати ще» після останнього скану),
//     а збережене після останнього скану закриває «Готово»;
//   • мова в онбордингу: після слова «Спробуй зараз» безкоштовно — лише підпис;
//   • камера після безкоштовного скану чесна: «використано» і чип Pro;
//   • без сканів застосунок відкривається на навчанні;
//   • слово дня, порожнє навчання, картки, квіз, словник, профіль, параметри;
//   • контраст токенів і таб-бар над камерою.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Dimensions, FlatList, Modal, ScrollView } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import ScannerScreen from '../src/ScannerScreen';
import ConsentSheet from '../src/ConsentSheet';
import SceneView from '../src/scene/SceneView';
import DictionaryScreen from '../src/DictionaryScreen';
import FlashcardsScreen, { noOrphan } from '../src/FlashcardsScreen';
import QuizScreen from '../src/QuizScreen';
import WordOfDayCard from '../src/WordOfDayCard';
import { WidgetTip } from '../src/LearnTips';
import ProfileScreen from '../src/ProfileScreen';
import SettingsScreen, { hourLabel } from '../src/SettingsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import PaywallScreen from '../src/PaywallScreen';
import { StickerLarge } from '../src/Sticker';
import { STRINGS, makeT } from '../src/i18n';
import { THEMES } from '../src/theme';
import { dayLetter, weekdayLabels } from '../src/share/layout';
import { recognizeImage } from '../src/api';
import { flagFor } from '../src/speech';
import { localDayKey } from '../src/storage';

jest.setTimeout(20000);

// Камера: кадр 3:4 одразу, без справжнього пристрою
jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = React.forwardRef((props, ref) => {
    React.useImperativeHandle(ref, () => ({
      takePictureAsync: async () => ({ uri: 'file:///shot.jpg', width: 1200, height: 1600, release() {} }),
    }));
    return React.createElement(View, null);
  });
  return { CameraView, useCameraPermissions: () => [{ granted: true, canAskAgain: true }, jest.fn()] };
});

jest.mock('expo-image-manipulator', () => {
  const manipulate = () => {
    const c = {
      resize: () => c,
      crop: () => c,
      renderAsync: async () => ({ saveAsync: async () => ({ uri: 'file:///out.jpg', width: 600, height: 600, base64: 'b64' }), release() {} }),
      release() {},
    };
    return c;
  };
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }));

jest.mock('../src/api', () => ({
  ...jest.requireActual('../src/api'),
  recognizeImage: jest.fn(),
}));

const RESULT = { word: 'la taza', ipa: '', translation: 'mug', example: '', exampleTranslation: '', box: null, outline: null, usage: null };
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const t = makeT('en');
const uk = makeT('uk');

beforeEach(async () => {
  await AsyncStorage.clear();
  require('expo-localization').__setLocales(['en-US'], { silent: true });
  recognizeImage.mockReset();
  recognizeImage.mockImplementation(async () => RESULT);
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

async function settle(n = 4) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

async function render(element) {
  let tree;
  await act(async () => {
    tree = create(<SafeAreaProvider initialMetrics={metrics}>{element}</SafeAreaProvider>);
  });
  await settle();
  return tree;
}

async function press(fn) {
  await act(async () => {
    await fn();
  });
  await settle();
}

// Текст нативних Text (без дублів від обгорток); «“{приклад}”» — одним рядком
const textOf = (children) =>
  typeof children === 'string' || typeof children === 'number'
    ? String(children)
    : Array.isArray(children) && children.every((c) => typeof c === 'string' || typeof c === 'number')
      ? children.join('')
      : null;
const texts = (node) =>
  node.findAll((n) => n.type === 'Text' && textOf(n.props.children) !== null).map((n) => textOf(n.props.children));
// Рядки з дерева елементів, ще не відрендереного (шапка списку, липка панель)
const elementTexts = (el) => {
  if (el == null || typeof el === 'boolean') return [];
  if (typeof el === 'string' || typeof el === 'number') return [String(el)];
  if (Array.isArray(el)) return el.flatMap(elementTexts);
  const own = el.props?.placeholder ? [el.props.placeholder] : [];
  const opts = (el.props?.options || []).map((o) => o.label);
  return [...own, ...opts, ...elementTexts(el.props?.children)];
};
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const byTitle = (node, title) => node.findAll((n) => n.props.title === title && typeof n.props.onPress === 'function')[0];
const byLabel = (node, label) =>
  node.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const shutter = (tree) => tree.root.findAll((n) => n.props.testID === 'shutter' && typeof n.props.onPress === 'function')[0];
const resultSheet = (tree) =>
  tree.root.findAllByType(Modal).find((m) => m.parent?.type !== ConsentSheet && m.parent?.type !== SceneView);
const backdrop = (tree) =>
  resultSheet(tree).findAll((n) => n.props.accessible === false && typeof n.props.onPress === 'function')[0];

const scanner = (props = {}) => (
  <ScannerScreen targetLang="es" nativeLang="en" savedWords={[]} onSaveWord={() => true} aiConsent t={t} {...props} />
);

// ─── app-01: аркуш результату ──────────────────────────────────────────────
describe('scan result sheet', () => {
  test('Save and Share sit in a fixed footer, outside the scrolling part', async () => {
    const tree = await render(scanner({ scansLeft: Infinity }));
    await press(() => shutter(tree).props.onPress());
    const sheet = resultSheet(tree);
    expect(sheet.props.visible).toBe(true);
    const scroll = sheet.findByType(ScrollView);
    expect(texts(scroll)).toContain('la taza');
    expect(byTitle(scroll, t('save'))).toBeUndefined();
    expect(byTitle(sheet, t('save'))).toBeTruthy();
    expect(byLabel(sheet, t('share'))).toBeTruthy();
    await act(async () => tree.unmount());
  });

  test('a stray tap on the dim backdrop does not throw away an unsaved word', async () => {
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ scansLeft: Infinity, onSaveWord }));
    await press(() => shutter(tree).props.onPress());
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    // збережене — тло закриває, як і раніше
    await press(() => byTitle(resultSheet(tree), t('save')).props.onPress());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => tree.unmount());
  });

  test('Pro and scans left: “Scan again” is an explicit discard', async () => {
    for (const scansLeft of [Infinity, 2]) {
      const onSaveWord = jest.fn(() => true);
      const tree = await render(scanner({ scansLeft, onSaveWord }));
      await press(() => shutter(tree).props.onPress());
      await press(() => byTitle(resultSheet(tree), t('scanAgain')).props.onPress());
      expect(resultSheet(tree).props.visible).toBe(false);
      expect(onSaveWord).not.toHaveBeenCalled();
      await act(async () => tree.unmount());
    }
  });

  test('the free scan just used: no “Scan again”, and back saves the word before closing', async () => {
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ scansLeft: 0, onSaveWord }));
    await press(() => shutter(tree).props.onPress());
    const sheet = resultSheet(tree);
    expect(byTitle(sheet, t('scanAgain'))).toBeUndefined();
    expect(byTitle(sheet, t('save'))).toBeTruthy();
    expect(byLabel(sheet, t('share'))).toBeTruthy();
    // Android «назад» / жест виходу VoiceOver
    await press(() => resultSheet(tree).props.onRequestClose());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(onSaveWord.mock.calls[0][0]).toMatchObject({ word: 'la taza', lang: 'es', nativeLang: 'en' });
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => tree.unmount());
  });

  test('the VoiceOver escape gesture takes the same path', async () => {
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ scansLeft: 0, onSaveWord }));
    await press(() => shutter(tree).props.onPress());
    const layer = resultSheet(tree).find((n) => typeof n.props.onAccessibilityEscape === 'function');
    await press(() => layer.props.onAccessibilityEscape());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => tree.unmount());
  });

  test('the free scan just used: once the word is saved, “Done” closes the sheet', async () => {
    // На SE з «Ще виразами» аркуш займає весь екран, і тло — лише смужка під
    // статус-баром: закрити його має кнопка в нерухомому низу.
    const onSaveWord = jest.fn(() => true);
    const tree = await render(scanner({ scansLeft: 0, onSaveWord }));
    await press(() => shutter(tree).props.onPress());
    expect(byTitle(resultSheet(tree), t('finishBtn'))).toBeUndefined();
    await press(() => byTitle(resultSheet(tree), t('save')).props.onPress());
    const sheet = resultSheet(tree);
    expect(sheet.props.visible).toBe(true);
    expect(byTitle(sheet, t('scanAgain'))).toBeUndefined();
    expect(byTitle(sheet.findByType(ScrollView), t('finishBtn'))).toBeUndefined();
    await press(() => byTitle(sheet, t('finishBtn')).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('the free scan just used on a word already in the dictionary: “Done” from the start', async () => {
    const saved = [{ id: 'a', word: 'La taza', translation: 'mug', lang: 'es' }];
    const tree = await render(scanner({ scansLeft: 0, savedWords: saved }));
    await press(() => shutter(tree).props.onPress());
    expect(byTitle(resultSheet(tree), t('save'))).toBeUndefined();
    await press(() => byTitle(resultSheet(tree), t('finishBtn')).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    await act(async () => tree.unmount());
  });

  test('Pro after saving: still “Scan again”, no extra “Done”', async () => {
    const tree = await render(scanner({ scansLeft: Infinity }));
    await press(() => shutter(tree).props.onPress());
    await press(() => byTitle(resultSheet(tree), t('save')).props.onPress());
    expect(byTitle(resultSheet(tree), t('scanAgain'))).toBeTruthy();
    expect(byTitle(resultSheet(tree), t('finishBtn'))).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('onboarding first scan: only Save and Share, and back still ends in the saved word', async () => {
    const { FIRST_SAVED_MS, FIRST_SHEET_MS } = require('../src/ScannerScreen');
    const onFirstSaved = jest.fn();
    const onSaveWord = jest.fn(() => true);
    const onGuardScan = jest.fn(() => true);
    const tree = await render(scanner({ firstScan: true, onExit: jest.fn(), onFirstSaved, onSaveWord, onGuardScan, scansLeft: 1 }));
    await press(() => shutter(tree).props.onPress());
    const sheet = resultSheet(tree);
    expect(byTitle(sheet, t('scanAgain'))).toBeUndefined();
    // тло не закриває незбережене слово — пастки «пустий онбординг» немає
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    await press(() => resultSheet(tree).props.onRequestClose());
    expect(onSaveWord).toHaveBeenCalledTimes(1);
    // аркуш їде вниз сам — «Готово» тут не з'являється
    expect(byTitle(resultSheet(tree), t('finishBtn'))).toBeUndefined();
    await act(async () => {
      await new Promise((r) => setTimeout(r, FIRST_SAVED_MS + FIRST_SHEET_MS + 60));
    });
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(onFirstSaved).toHaveBeenCalledTimes(1);
    expect(onFirstSaved.mock.calls[0][0]).toMatchObject({ word: 'la taza' });
    // і жодного зайвого скану: затвор тиснули один раз
    expect(onGuardScan).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('on a small phone the sticker is smaller and the word sits close under it', async () => {
    const was = Dimensions.get('window');
    act(() => Dimensions.set({ window: { width: 375, height: 667, scale: 2, fontScale: 1 }, screen: { width: 375, height: 667, scale: 2, fontScale: 1 } }));
    try {
      recognizeImage.mockImplementation(async () => ({ ...RESULT, box: [100, 100, 900, 900] }));
      const tree = await render(scanner({ scansLeft: Infinity }));
      await press(() => shutter(tree).props.onPress());
      const sticker = resultSheet(tree).findByType(StickerLarge);
      expect(sticker.props.size).toBe(110);
      expect(sticker.parent.props.style).toMatchObject({ marginBottom: 0 });
      await act(async () => tree.unmount());
    } finally {
      act(() => Dimensions.set({ window: was, screen: was }));
    }
  });
});

// ─── app-02: камера після безкоштовного скану ──────────────────────────────
describe('the camera after the free scan', () => {
  test('“Free scan used” and a Pro chip, never “0 … left”', async () => {
    for (const [tl, lang] of [
      [t, 'en'],
      [uk, 'uk'],
    ]) {
      const onOpenPro = jest.fn();
      const tree = await render(scanner({ scansLeft: 0, onOpenPro, t: tl }));
      const all = texts(tree.root);
      expect(all).toContain(tl('scanUsedUp'));
      expect(all).not.toContain(tl('hint'));
      expect(all.some((s) => /\b0\b/.test(s))).toBe(false);
      expect(all).not.toContain(tl('scanFreeLeft', { n: 0 }));
      const chip = byLabel(tree.root, tl('scanProChip'));
      expect(chip.props.accessibilityRole).toBe('button');
      await press(() => chip.props.onPress());
      expect(onOpenPro).toHaveBeenCalledTimes(1);
      expect(STRINGS[lang].scanUsedUp).not.toMatch(/\d/);
      await act(async () => tree.unmount());
    }
    expect(uk('scanUsedUp')).toBe('Безкоштовний скан використано');
  });

  test('the chip waits while the result sheet covers the camera', async () => {
    const tree = await render(scanner({ scansLeft: 0, onOpenPro: jest.fn() }));
    expect(byLabel(tree.root, t('scanProChip'))).toBeTruthy();
    // останній скан (у тесті затвор не питає App) — аркуш поверх камери
    await press(() => shutter(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(true);
    expect(byLabel(tree.root, t('scanProChip'))).toBeUndefined();
    await press(() => byTitle(resultSheet(tree), t('save')).props.onPress());
    await press(() => backdrop(tree).props.onPress());
    expect(resultSheet(tree).props.visible).toBe(false);
    expect(byLabel(tree.root, t('scanProChip'))).toBeTruthy();
    await act(async () => tree.unmount());
  });

  // v1.3: лічильник — не другий рядок підказки, а статус угорі (core.md A10)
  test('a scan left: the counter is the status pill over the camera, not the hint; Pro has neither', async () => {
    let tree = await render(scanner({ scansLeft: 1, onOpenPro: jest.fn() }));
    let pill = tree.root.findAll((n) => n.type === 'Text' && n.props.children === t('hint'))[0];
    while (pill.type !== 'View') pill = pill.parent;
    expect(texts(pill)).toEqual([t('hint')]);
    expect(texts(tree.root)).toContain(t('scanFreeLeft', { n: 1 }));
    expect(byLabel(tree.root, t('scanProChip'))).toBeUndefined();
    await act(async () => tree.unmount());

    tree = await render(scanner({ scansLeft: Infinity, onOpenPro: jest.fn() }));
    expect(texts(tree.root).some((s) => /free scans?/.test(s))).toBe(false);
    expect(byLabel(tree.root, t('scanProChip'))).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('App: the chip opens the scans paywall; the shutter still does too; the free tier is one scan', async () => {
    await returning();
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ scans: 1, limit: 1 }));
    const tree = await renderApp();
    await openTab(tree, 'scan');
    const sc = one(tree, ScannerScreen);
    expect(sc.props.scansLeft).toBe(0);
    await press(() => sc.props.onOpenPro());
    expect(one(tree, PaywallScreen).props.reason).toBe('scans');
    expect(one(tree, PaywallScreen).props.freeScans).toBe(1);
    await press(() => one(tree, PaywallScreen).props.onClose());
    expect(one(tree, PaywallScreen)).toBeNull();
    // затвор — так само пейвол, кадр не знімається
    let allowed;
    await press(() => (allowed = one(tree, ScannerScreen).props.onGuardScan('object')));
    expect(allowed).toBe(false);
    expect(one(tree, PaywallScreen).props.reason).toBe('scans');
    await act(async () => tree.unmount());
  });
});

// ─── App: спільні помічники ────────────────────────────────────────────────
async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  await settle(5);
  return tree;
}

async function returning({ settings = { nativeLang: 'en', targetLang: 'es' }, words = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(settings));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(require('../src/achievements').ACHIEVEMENTS.map((a) => a.id)));
  if (wod) await AsyncStorage.setItem('ll_wod_v1', JSON.stringify(wod));
}
const openTab = (tree, key) => press(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));

// Стан Pro з імітації (src/purchases.js) приходить пізніше за лічильник
function slowPro(state, ms = 300) {
  const real = AsyncStorage.getItem.getMockImplementation();
  AsyncStorage.getItem.mockImplementation(async (key) => {
    if (key === 'll_sub_v1') {
      await new Promise((r) => setTimeout(r, ms));
      return state ? JSON.stringify(state) : null;
    }
    return real(key);
  });
  return () => AsyncStorage.getItem.mockImplementation(real);
}

// ─── app-03: стартова вкладка ──────────────────────────────────────────────
describe('where the app opens', () => {
  test('a free user without scans opens on Learn', async () => {
    await returning();
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ scans: 1, limit: 1 }));
    const tree = await renderApp();
    expect(one(tree, FlashcardsScreen)).toBeTruthy();
    expect(one(tree, ScannerScreen)).toBeNull();
    // порядок вкладок той самий
    expect(tree.root.findAll((n) => n.props.tb?.key).map((n) => n.props.tb.key)).toEqual(['profile', 'dict', 'scan', 'cards', 'settings']);
    await act(async () => tree.unmount());
  });

  test('a free user with a scan left opens on Scan', async () => {
    await returning();
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ scans: 0, limit: 1 }));
    const tree = await renderApp();
    expect(one(tree, ScannerScreen)).toBeTruthy();
    await act(async () => tree.unmount());
  });

  test('Pro opens on Scan even when Pro is known only after the counter', async () => {
    await returning();
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ scans: 1, limit: 1 }));
    const restore = slowPro({ planId: 'lifetime', lifetime: true });
    try {
      const tree = await renderApp();
      expect(one(tree, ScannerScreen)).toBeTruthy(); // Pro ще не відомий — нічого не чіпаємо
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });
      await settle();
      expect(one(tree, ScannerScreen)).toBeTruthy();
      expect(one(tree, ScannerScreen).props.scansLeft).toBe(Infinity);
      await act(async () => tree.unmount());
    } finally {
      restore();
    }
  });

  test('if the person already switched tabs, the app does not move them', async () => {
    await returning();
    await AsyncStorage.setItem('ll_usage_v1', JSON.stringify({ scans: 1, limit: 1 }));
    const restore = slowPro(null);
    try {
      const tree = await renderApp();
      await openTab(tree, 'dict');
      await act(async () => {
        await new Promise((r) => setTimeout(r, 400));
      });
      await settle();
      expect(one(tree, DictionaryScreen)).toBeTruthy();
      expect(one(tree, FlashcardsScreen)).toBeNull();
      await act(async () => tree.unmount());
    } finally {
      restore();
    }
  });
});

// ─── app-04: мова навчання з онбордингу ────────────────────────────────────
// Онбординг 3.0: мову питає окремий крок «Яку мову вчиш?» (onLanguages), а
// не пігулка на кроці рівня.
describe('onboarding gets the language setter', () => {
  test('first run: the languages are saved at once, the translation language starts from the phone', async () => {
    const tree = await renderApp();
    const onb = one(tree, OnboardingScreen);
    expect(onb.props.phoneNative).toBe('en');
    expect(typeof onb.props.onLanguages).toBe('function');
    await press(() => onb.props.onLanguages({ targetLang: 'de', nativeLang: 'en' }));
    expect((await stored('ll_settings_v1')).targetLang).toBe('de');
    expect(one(tree, OnboardingScreen).props.targetLang).toBe('de');
    // мова перекладу міняється окремо, не чіпаючи мови навчання
    await press(() => one(tree, OnboardingScreen).props.onLanguages({ nativeLang: 'pl' }));
    expect(await stored('ll_settings_v1')).toMatchObject({ targetLang: 'de', nativeLang: 'pl' });
    expect(one(tree, PaywallScreen)).toBeNull();
    await act(async () => tree.unmount());
  });

  test('a word already saved on a free plan keeps its language: no paywall mid-onboarding', async () => {
    const tree = await renderApp();
    const onb = one(tree, OnboardingScreen);
    // перший скан онбордингу зберігає слово мовою, яку вже обрали
    const first = onb.props.renderScanner({ onSaved: jest.fn(), onExit: jest.fn(), level: 5 });
    await press(() => first.props.onSaveWord({ ...RESULT, lang: onb.props.targetLang, nativeLang: 'en' }));
    expect(await stored('ll_words_v1')).toHaveLength(1);
    await press(() => one(tree, OnboardingScreen).props.onLanguages({ targetLang: 'de', nativeLang: 'en' }));
    expect(one(tree, OnboardingScreen).props.targetLang).toBe(onb.props.targetLang);
    expect((await stored('ll_settings_v1'))?.targetLang).not.toBe('de');
    expect(one(tree, PaywallScreen)).toBeNull();
    await act(async () => tree.unmount());
  });

  test('Pro: the language still changes with a word saved', async () => {
    await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'year', until: Date.now() + 30 * 86400000 }));
    await AsyncStorage.setItem('ll_words_v1', JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', nativeLang: 'en' }]));
    const tree = await renderApp();
    await press(() => one(tree, OnboardingScreen).props.onLanguages({ targetLang: 'de', nativeLang: 'en' }));
    expect((await stored('ll_settings_v1')).targetLang).toBe('de');
    expect(one(tree, PaywallScreen)).toBeNull();
    await act(async () => tree.unmount());
  });
});

// ─── app-05: слово дня ─────────────────────────────────────────────────────
describe('word of the day card', () => {
  const word = { date: '2026-10-04', word: 'la manzana', translation: 'apple', example: 'Una manzana roja.', example_translation: 'A red apple.' };

  test('Listen, I know it and Save are there without a tap; only the example waits behind the chevron', async () => {
    const onSave = jest.fn();
    const tree = await render(<WordOfDayCard word={word} lang="es" saved={false} onSave={onSave} onKnow={() => {}} t={t} />);
    expect(byLabel(tree.root, t('listen'))).toBeTruthy();
    expect(byLabel(tree.root, t('wodKnowA11y'))).toBeTruthy();
    expect(texts(tree.root)).toContain(t('saveWord'));
    expect(texts(tree.root)).not.toContain('“Una manzana roja.”');
    const row = tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityState?.expanded !== undefined);
    await press(() => row.props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } }));
    expect(texts(tree.root).join(' ')).toContain('Una manzana roja.');
    await act(async () => tree.unmount());
  });

  test('without an example there is nothing to expand', async () => {
    const tree = await render(<WordOfDayCard word={{ ...word, example: '' }} lang="es" saved={false} onSave={() => {}} t={t} />);
    expect(tree.root.findAll((n) => n.props.accessibilityState?.expanded !== undefined)).toHaveLength(0);
    expect(texts(tree.root)).toContain(t('saveWord'));
    await act(async () => tree.unmount());
  });

  test('the caps line looks the same, but VoiceOver hears words', async () => {
    expect([STRINGS.uk.wordOfDay, STRINGS.en.wordOfDay, STRINGS.de.wordOfDay, STRINGS.es.wordOfDay]).toEqual([
      'Слово дня',
      'Word of the day',
      'Wort des Tages',
      'Palabra del día',
    ]);
    const tree = await render(<WordOfDayCard word={word} lang="es" saved={false} onSave={() => {}} topic="Travel" t={uk} />);
    const badge = tree.root.find((n) => typeof n.props.children === 'string' && n.props.children.startsWith('СЛОВО ДНЯ'));
    expect(badge.props.children).toBe('СЛОВО ДНЯ · Travel');
    expect(badge.props.accessibilityLabel).toBe('Слово дня, Travel');
    await act(async () => tree.unmount());
  });
});

// ─── app-07: пропозиція підняти рівень називає рівень за CEFR ──────────────
describe('the level-up offer names a CEFR level, not a slider step', () => {
  const word = { date: '2026-10-04', word: 'la manzana', translation: 'apple', example: '' };

  test.each([
    ['uk', 8, 'Схоже, це для тебе легко. Підняти рівень до B2+?', 'Підняти до B2+'],
    ['en', 8, 'Looks like these are easy for you. Raise your level to B2+?', 'Raise to B2+'],
    ['de', 5, 'Das scheint dir leicht zu fallen. Niveau auf B1 anheben?', 'Auf B1 anheben'],
    ['es', 10, 'Parece que te resultan fáciles. ¿Subir tu nivel a C2?', 'Subir a C2'],
  ])('%s', async (lang, levelUp, text, yes) => {
    const tl = makeT(lang);
    const tree = await render(
      <WordOfDayCard word={word} lang="es" saved={false} onSave={() => {}} levelUp={levelUp} onLevelUp={() => {}} onKeepLevel={() => {}} t={tl} />
    );
    const all = texts(tree.root);
    expect(all).toContain(text);
    expect(all).toContain(yes);
    await act(async () => tree.unmount());
  });

  test('App: the offer applies the level it names; from 1 (A1) it offers A2, not A1 again', async () => {
    for (const [from, to, name] of [
      [7, 8, 'B2+'],
      [1, 3, 'A2'],
    ]) {
      await AsyncStorage.clear();
      await returning({
        settings: { nativeLang: 'en', targetLang: 'es', profile: { goals: ['travel'], level: from }, knowStreak: 3 },
        wod: { lang: 'es', native: 'en', words: [{ date: localDayKey(), word: 'la manzana', translation: 'apple' }] },
      });
      const tree = await renderApp();
      await openTab(tree, 'cards');
      const card = one(tree, WordOfDayCard);
      expect(card.props.levelUp).toBe(to);
      expect(texts(card)).toContain(t('wodLevelUpYes', { n: name }));
      await press(() => card.props.onLevelUp());
      expect((await stored('ll_settings_v1')).profile.level).toBe(to);
      await act(async () => tree.unmount());
    }
  });
});

// ─── app-06: словник ───────────────────────────────────────────────────────
describe('dictionary on a small phone', () => {
  const words = (langs) =>
    Array.from({ length: 14 }, (_, i) => ({ id: 'w' + i, word: 'w' + i, translation: 't' + i, lang: langs[i % langs.length], addedAt: i }));

  test('title, count and scenes scroll away; the switch and search stick', async () => {
    const tree = await render(<DictionaryScreen words={words(['es'])} onDelete={() => {}} t={t} />);
    const list = tree.root.findByType(FlatList);
    // шапка — ListHeaderComponent (0), панель — перший елемент даних (1)
    expect(list.props.stickyHeaderIndices).toEqual([1]);
    const header = elementTexts(list.props.ListHeaderComponent);
    expect(header).toEqual(expect.arrayContaining([t('dictTitle'), t('dictCount', { n: 14 })]));
    expect(header).not.toContain(t('viewList'));
    expect(list.props.data[0].id).toBe('__bar');
    const bar = elementTexts(list.props.renderItem({ item: list.props.data[0], index: 0 }));
    expect(bar).toEqual(expect.arrayContaining([t('viewList'), t('viewCollection'), t('search')]));
    expect(bar).not.toContain(t('dictTitle'));
    expect(list.props.data).toHaveLength(15);
    await act(async () => tree.unmount());
  });

  test('one language — no flag on every row; two — flags', async () => {
    const flagged = (tr) => texts(tr.root).filter((x) => x.includes(flagFor('es')) || x.includes(flagFor('de')));
    let tree = await render(<DictionaryScreen words={words(['es'])} onDelete={() => {}} t={t} />);
    expect(flagged(tree)).toHaveLength(0);
    await act(async () => tree.unmount());
    tree = await render(<DictionaryScreen words={words(['es', 'de'])} onDelete={() => {}} t={t} />);
    // два прапорці — у фільтрі мов, решта — біля слів
    expect(flagged(tree).length).toBeGreaterThan(2);
    await act(async () => tree.unmount());
  });

  test('the collection is the same list, three stickers a row', async () => {
    const tree = await render(<DictionaryScreen words={words(['es'])} onDelete={() => {}} t={t} />);
    const seg = tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && typeof n.props.onPress === 'function');
    await press(() => seg[1].props.onPress());
    const list = tree.root.findByType(FlatList);
    expect(list.props.data).toHaveLength(1 + 5); // панель + 5 рядків по три (14 слів)
    expect(list.props.data[5]).toHaveLength(2);
    await press(() => seg[0].props.onPress());
    await act(async () => tree.unmount());
  });
});

// ─── app-07: «рівень» має одне значення ────────────────────────────────────
describe('profile hero speaks of the collection, not a level', () => {
  const ws = (n) => Array.from({ length: n }, (_, i) => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang: 'en', addedAt: Date.now() - i * 1000 }));

  test.each(['uk', 'en', 'de', 'es', 'ru'])('%s', async (lang) => {
    const tl = makeT(lang);
    const tree = await render(
      <ProfileScreen words={ws(14)} activity={{}} stats={{}} profile={{ name: 'Lena', avatar: 'wave' }} onUpdateProfile={() => {}} t={tl} />
    );
    const all = texts(tree.root);
    expect(all).toContain(tl('collStage', { n: 3 }));
    expect(all).toContain(tl('collWords', { c: 14, n: 27 }));
    expect(all).not.toContain(tl('level', { n: 3 }));
    await act(async () => tree.unmount());
  });

  test('the Ukrainian total agrees with its number', () => {
    expect(uk('collWords', { c: 14, n: 27 })).toBe('14 із 27 слів');
    expect(uk('collWords', { c: 0, n: 3 })).toBe('0 із 3 слів');
    expect(uk('collWords', { c: 15, n: 21 })).toBe('15 із 21 слова');
    expect(uk('collStage', { n: 3 })).toBe('Колекція · етап 3');
  });

  test('the Russian total agrees with its number too', () => {
    const ru = makeT('ru');
    expect(ru('collWords', { c: 14, n: 27 })).toBe('14 из 27 слов');
    expect(ru('collWords', { c: 15, n: 21 })).toBe('15 из 21 слова');
    expect(ru('collWords', { c: 2, n: 3 })).toBe('2 из 3 слов');
  });
});

// ─── app-08 / app-09: хаб навчання ─────────────────────────────────────────
describe('Learn hub', () => {
  const later = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't' + i, lang: 'es', addedAt: 1, srs: { box: 3, due: Date.now() + 2 * 86400000 } });
  const hub = (props) => (
    <FlashcardsScreen words={[]} onReview={() => {}} t={t} targetLang="es" onSaveWod={() => {}} wodSaved={false} {...props} />
  );
  const order = (tree, labels) => {
    const all = texts(tree.root);
    return labels.map((l) => all.indexOf(l));
  };

  test('review cards come right after the word of the day, the tips below them', async () => {
    const tree = await render(
      hub({ words: [later(1), later(2), later(3)], profileTip: true, widgetTip: true, onOpenProfile: () => {}, onHideProfileTip: () => {}, onHideWidgetTip: () => {} })
    );
    const [cards, quiz, profileTip, widgetTip] = order(tree, [t('flashcards'), t('quiz'), t('pfTipTitle'), t('widgetTipTitle')]);
    expect(cards).toBeGreaterThan(-1);
    expect(cards).toBeLessThan(quiz);
    expect(quiz).toBeLessThan(profileTip);
    expect(profileTip).toBeLessThan(widgetTip);
    await act(async () => tree.unmount());
  });

  test('nothing due: the card invites practice, the last two words held together', async () => {
    const tree = await render(hub({ words: [later(1)] }));
    const hint = texts(tree.root).find((s) => s.startsWith('Practice now'));
    expect(hint).toBe(noOrphan(t('fcPracticeNow', { t: 'in 2 days' })));
    expect(hint.endsWith('2 days')).toBe(true);
    expect(noOrphan(uk('fcPracticeNow', { t: 'через 2 дні' }))).toMatch(/2 дні$/);
    await act(async () => tree.unmount());
  });

  test('the widget tip has an icon, not an unreadable miniature', async () => {
    const tree = await render(<WidgetTip word={{ word: 'la manzana', translation: 'apple' }} onHide={() => {}} t={t} />);
    expect(texts(tree.root)).not.toContain('la manzana');
    expect(texts(tree.root)).toContain(t('widgetTipTitle'));
    await act(async () => tree.unmount());
  });

  // v1.3 (core.md B): «Як отримати перше слово» — обидва шляхи поруч:
  // зберегти слово дня і сканувати
  test('empty Learn: save the word of the day, or go and scan', async () => {
    const onSaveWod = jest.fn();
    const onGoScan = jest.fn();
    const wod = { date: '2026-10-04', word: 'la manzana', translation: 'apple' };
    let tree = await render(hub({ wordOfDay: wod, onSaveWod, onGoScan }));
    await press(() => byTitle(tree.root, t('learnSaveWod')).props.onPress());
    expect(onSaveWod).toHaveBeenCalledTimes(1);
    await press(() => byTitle(tree.root, t('learnGoScan')).props.onPress());
    await act(async () => tree.unmount());

    for (const props of [{ wordOfDay: null }, { wordOfDay: wod, wodSaved: true }]) {
      tree = await render(hub({ ...props, onSaveWod, onGoScan }));
      expect(byTitle(tree.root, t('learnSaveWod'))).toBeUndefined();
      await press(() => byTitle(tree.root, t('learnGoScan')).props.onPress());
      await act(async () => tree.unmount());
    }
    expect(onGoScan).toHaveBeenCalledTimes(3);
  });

  // v1.3: великого Lingo з «Поки нема чого повторювати» більше немає — на
  // його місці закриті картки й блок «Як отримати», тож на SE кнопки
  // «Як отримати» стоять одразу під ними
  test('on a small phone the empty state has no big Lingo: locked cards, then how to get a word', async () => {
    const MascotBob = require('../src/Mascot').MascotBob;
    const tree = await render(hub({ wordOfDay: null, onGoScan: () => {} }));
    expect(tree.root.findAllByType(MascotBob)).toHaveLength(0);
    const all = texts(tree.root);
    expect(STRINGS.en).not.toHaveProperty('cardsEmptyTitle');
    expect(all.indexOf(t('flashcards'))).toBeLessThan(all.indexOf(t('learnHowTitle')));
    expect(all.indexOf(t('quiz'))).toBeLessThan(all.indexOf(t('learnHowTitle')));
    await act(async () => tree.unmount());
  });

  test('App: saving the word of the day from the empty state gives one card due', async () => {
    await returning({ wod: { lang: 'es', native: 'en', words: [{ date: localDayKey(), word: 'la manzana', translation: 'apple' }] } });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await press(() => byTitle(tree.root, t('learnSaveWod')).props.onPress());
    expect(texts(tree.root)).toContain(t('dueToday', { n: 1 }));
    await act(async () => tree.unmount());
  });

  test('App: “Scan” on the empty Learn tab opens the scanner', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'cards');
    await press(() => byTitle(tree.root, t('learnGoScan')).props.onPress());
    expect(one(tree, ScannerScreen)).toBeTruthy();
    await act(async () => tree.unmount());
  });
});

// ─── app-10: контраст токенів ──────────────────────────────────────────────
describe('readable secondary text', () => {
  const lum = (hex) => {
    const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255);
    const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => {
    const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };

  test.each(['light', 'dark'])('%s: dim ≥ 4.5:1 and faint ≥ 3:1 on bg, cards and inputs', (key) => {
    const C = THEMES[key].C;
    for (const bg of [C.bg, C.card, C.card2]) {
      expect(ratio(C.dim, bg)).toBeGreaterThanOrEqual(4.5);
      expect(ratio(C.faint, bg)).toBeGreaterThanOrEqual(3);
    }
  });

  test('tab titles share one style', () => {
    for (const key of ['light', 'dark']) expect(THEMES[key].T.largeTitle).toMatchObject({ fontSize: 34, fontFamily: 'Nunito_700Bold' });
  });
});

// ─── app-11: таб-бар ───────────────────────────────────────────────────────
describe('tab bar', () => {
  const labelColor = (tree, key) => {
    const btn = tree.root.findAll((n) => n.props.tb?.key === key)[0];
    const label = btn.findAll((n) => n.props.children === t(btn.props.tb.label) && n.props.numberOfLines === 1)[0];
    return [].concat(label.props.style).reduce((acc, st) => ({ ...acc, ...(st || {}) }), {}).color;
  };

  test('inactive tabs are dim on the app’s tabs, white over the camera', async () => {
    await returning();
    const tree = await renderApp();
    // на камері: неактивні — білі на 70 %, активна — біла
    expect(labelColor(tree, 'dict')).toBe('rgba(255,255,255,0.7)');
    expect(labelColor(tree, 'scan')).toBe('#FFFFFF');
    await openTab(tree, 'settings');
    expect(labelColor(tree, 'dict')).toBe(THEMES.light.C.dim);
    expect(labelColor(tree, 'settings')).toBe(THEMES.light.C.accent);
    await act(async () => tree.unmount());
  });
});

// ─── app-13 / app-14: картки й квіз ────────────────────────────────────────
describe('flashcards and quiz', () => {
  const deck = ['headphones', 'mug', 'lamp', 'chair', 'desk'].map((w, i) => ({
    id: 'q' + i,
    word: w,
    translation: ['навушники', 'кружка', 'лампа', 'стілець', 'стіл'][i],
    lang: 'en',
    nativeLang: 'uk',
    addedAt: 1,
    srs: { box: 0, due: 0 },
  }));

  // Найзовнішня ціль для пальця з цим текстом (Press → Pressable)
  const tap = (tree, text) => press(() => tree.root.findAll((n) => typeof n.props.onPress === 'function' && texts(n).includes(text))[0].props.onPress());

  test('the back of the card shows the word above its meaning; the session ends with “Done”', async () => {
    const tree = await render(<FlashcardsScreen words={deck.slice(0, 1)} onReview={() => {}} t={uk} targetLang="en" />);
    await tap(tree, uk('flashcards'));
    const all = texts(tree.root);
    // лице й зворот: на звороті слово стоїть над перекладом
    expect(all.filter((x) => x === 'headphones')).toHaveLength(2);
    expect(all.lastIndexOf('headphones')).toBeLessThan(all.indexOf('навушники'));
    const back = tree.root.findAll((n) => n.type === 'Text' && n.props.children === 'headphones').at(-1);
    expect([].concat(back.props.style).reduce((a, x) => ({ ...a, ...(x || {}) }), {})).toMatchObject({ fontSize: 17, color: THEMES.light.C.dim });
    await tap(tree, uk('showAnswer'));
    await tap(tree, uk('know'));
    expect(byTitle(tree.root, uk('finishBtn'))).toBeTruthy();
    expect(byTitle(tree.root, uk('next'))).toBeUndefined();
    expect(uk('finishBtn')).toBe('Готово');
    await act(async () => tree.unmount());
  });

  test('quiz: “1 / 10” sits in the top row, and a timeout says so before moving on', async () => {
    jest.useFakeTimers();
    try {
      let tree;
      await act(async () => {
        tree = create(<QuizScreen words={deck} t={uk} onExit={() => {}} onMiss={() => {}} />);
      });
      const counter = tree.root.findAll((n) => n.props.children === uk('quizQ', { i: 1, n: deck.length }))[0];
      const top = counter.parent;
      expect(top.findAll((n) => n.props.accessibilityLabel === uk('close')).length).toBeGreaterThan(0);
      expect(texts(tree.root)).not.toContain(uk('quizTimeUp'));
      await act(async () => {
        jest.advanceTimersByTime(10000);
      });
      expect(texts(tree.root)).toContain(uk('quizTimeUp'));
      await act(async () => {
        jest.advanceTimersByTime(1000);
      });
      expect(texts(tree.root)).not.toContain(uk('quizTimeUp'));
      expect(texts(tree.root)).toContain(uk('quizQ', { i: 2, n: deck.length }));
      await act(async () => tree.unmount());
    } finally {
      jest.useRealTimers();
    }
  });
});

// ─── app-15 / app-16: параметри й підписи ──────────────────────────────────
describe('settings: word of the day reminder', () => {
  const settings = (props) => (
    <SettingsScreen
      targetLang="en"
      nativeLang="uk"
      themeKey="light"
      themeMode="system"
      wordsCount={0}
      wodEnabled
      wodHour={10}
      sub={{ pro: false }}
      {...props}
    />
  );

  test('the toggle says what it does, and the hours follow the clock of the interface language', async () => {
    expect([STRINGS.uk.dailyPush, STRINGS.en.dailyPush, STRINGS.de.dailyPush, STRINGS.es.dailyPush]).toEqual([
      'Щоденне нагадування',
      'Daily reminder',
      'Tägliche Erinnerung',
      'Recordatorio diario',
    ]);
    expect(STRINGS.uk.dailyPushHint).toBe('Сповіщення зі словом дня о вибраній годині');
    expect(STRINGS.en.pfRowTitle).toBe('Personalize word of the day');
    const norm = (s) => s.replace(/\s/g, ' ');
    expect([8, 10, 12, 18, 20].map((h) => norm(hourLabel(h, 'en')))).toEqual(['8 AM', '10 AM', '12 PM', '6 PM', '8 PM']);
    expect([8, 20].map((h) => hourLabel(h, 'uk'))).toEqual(['08:00', '20:00']);
    expect(hourLabel(8, 'de')).toBe('08:00');

    for (const [lang, first] of [
      ['uk', '08:00'],
      ['en', '8 AM'],
    ]) {
      let tree;
      await act(async () => {
        tree = create(settings({ uiLang: lang, t: makeT(lang) }));
      });
      const chips = tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityState?.selected !== undefined && typeof n.props.onPress === 'function');
      expect(chips).toHaveLength(5);
      expect(norm(texts(chips[0])[0])).toBe(first);
      expect(texts(tree.root)).toContain(makeT(lang)('dailyPush'));
      await act(async () => tree.unmount());
    }
  });

  test('hour chips share one row and are 44 pt tall', async () => {
    let tree;
    await act(async () => {
      tree = create(settings({ uiLang: 'en', t }));
    });
    const chip = tree.root.findAll((n) => n.props.accessibilityState?.selected !== undefined && typeof n.props.onPress === 'function')[0];
    const st = [].concat(chip.props.style).reduce((acc, x) => ({ ...acc, ...(x || {}) }), {});
    expect(st).toMatchObject({ flex: 1, minHeight: 44 });
    const row = [].concat(chip.parent.props.style).reduce((acc, x) => ({ ...acc, ...(x || {}) }), {});
    expect(row.flexWrap).toBeUndefined();
    await act(async () => tree.unmount());
  });

  test('the offline scan error says what to do', () => {
    expect(STRINGS.uk.scanErrOffline).toBe('Немає інтернету. Перевір зʼєднання і спробуй ще раз.');
    for (const lang of ['en', 'de', 'es', 'ru']) expect(STRINGS[lang].scanErrOffline.split('. ').length).toBe(2);
  });
});

// ─── app-17: дні тижня ─────────────────────────────────────────────────────
describe('weekday labels', () => {
  test.each(['uk', 'en', 'de', 'es', 'ru'])('%s: seven distinct labels from Sunday', (lang) => {
    const labels = weekdayLabels(STRINGS[lang].dowShort);
    expect(labels).toHaveLength(7);
    expect(new Set(labels).size).toBe(7);
  });

  test('Sunday first, as Date#getDay; old one-letter strings still work', () => {
    expect(weekdayLabels(STRINGS.uk.dowShort)).toEqual(['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']);
    expect(dayLetter(1, STRINGS.en.dowShort)).toBe('Mo');
    expect(dayLetter(1, 'НПВСЧПС')).toBe('П');
  });

  test('the profile chart uses them', async () => {
    const tree = await render(
      <ProfileScreen words={[]} activity={{}} stats={{}} profile={{ name: '', avatar: 'wave' }} onUpdateProfile={() => {}} t={uk} />
    );
    const all = texts(tree.root);
    for (const d of ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']) expect(all).toContain(d);
    await act(async () => tree.unmount());
  });
});

// ─── app-18: профіль ───────────────────────────────────────────────────────
describe('profile', () => {
  const profileScreen = (props) => (
    <ProfileScreen words={[]} activity={{}} stats={{}} profile={{ name: '', avatar: 'wave' }} onUpdateProfile={() => {}} t={uk} {...props} />
  );

  test('a title like the other tabs; day one is a start, not a failure', async () => {
    const tree = await render(profileScreen());
    const all = texts(tree.root);
    expect(all[0]).toBe(uk('tabProfile'));
    expect(all).toContain('Почни серію сьогодні');
    expect(all).not.toContain(uk('streakN', { n: 0 }));
    await act(async () => tree.unmount());
  });

  test('a pencil on the avatar; the hint text only until a name is set', async () => {
    let tree = await render(profileScreen());
    const avatar = byLabel(tree.root, uk('editProfile'));
    expect(avatar.props.accessibilityRole).toBe('button');
    expect(texts(tree.root)).toContain(uk('profileHint'));
    await act(async () => tree.unmount());
    tree = await render(profileScreen({ profile: { name: 'Марік', avatar: 'wave' } }));
    expect(byLabel(tree.root, uk('editProfile'))).toBeTruthy();
    expect(texts(tree.root)).not.toContain(uk('profileHint'));
    await act(async () => tree.unmount());
  });

  test('unlocked achievements show a share glyph and say what a tap does', async () => {
    const onShareAchievement = jest.fn();
    const ws = [{ id: 'a', word: 'mug', translation: 'кружка', lang: 'en', addedAt: Date.now() }];
    const tree = await render(profileScreen({ words: ws, onShareAchievement }));
    const tab = tree.root.findAll((n) => typeof n.props.onPress === 'function' && texts(n).some((s) => s.startsWith(uk('achievements'))))[0];
    await press(() => tab.props.onPress());
    const tiles = tree.root.findAll((n) => n.props.accessibilityHint === uk('share') && typeof n.props.onPress === 'function');
    expect(tiles.length).toBeGreaterThan(0);
    expect(texts(tiles[0])).toContain(uk('ach_first_word'));
    await press(() => tiles[0].props.onPress());
    expect(onShareAchievement).toHaveBeenCalledWith(expect.objectContaining({ id: 'first_word' }));
    await act(async () => tree.unmount());
  });
});
