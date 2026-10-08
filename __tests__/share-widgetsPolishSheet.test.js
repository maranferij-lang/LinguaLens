// Полірування аркуша «Поділитися» (жовтень 2026): рядок стану не стрибає, а
// плавно виштовхує аркуш; «Збережено» не бреше про прозорість картки;
// гортальники не отримують новий contentOffset посеред свайпу; перемикач
// «Наліпка · Картка» має рухому пігулку; цілі дотику 44 pt; сторінки
// картки читаються як картинки; аркуш закривається потягом за ручку.
import { AccessibilityInfo, Animated, Dimensions, LayoutAnimation, ScrollView, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import ShareSheet from '../src/share/ShareSheet';
import { captureView } from '../src/share/capture';
import { storiesAvailable, storiesSupported } from '../src/share/instagram';
import { SHEET_MAX_W } from '../src/share/layout';
import { DUR, SPRING } from '../src/motion';
import { makeT } from '../src/i18n';

jest.mock('../src/share/capture', () => ({
  captureView: jest.fn(),
  releaseShot: jest.fn(),
  shareFile: jest.fn(async () => {}),
}));
jest.mock('../src/analytics', () => ({ track: jest.fn() }));
jest.mock('../src/share/instagram', () => ({
  storiesSupported: jest.fn(() => true),
  storiesAvailable: jest.fn(async () => true),
  shareToStories: jest.fn(async () => true),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Error: 'error' },
}));

const t = makeT('en');
// Ширина вікна в jest — 750: ширина аркуша й поля прев'ю з неї (як у shareSheet.test.js)
const WINDOW = { ...Dimensions.get('window') };
const PAGE_W = Math.min(WINDOW.width, SHEET_MAX_W);
const BOX_W = PAGE_W - 40;
const TALL = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
// iPhone SE: 667 - 20 < 700, тож рядок стану плаває поверх заголовка
const SE = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
const photoWord = { word: 'mug', translation: 'кружка', ipa: 'mʌɡ', lang: 'en', photo: 'file:///docs/stickers/mug.jpg', addedAt: 1 };
const scanned = { kind: 'word', word: photoWord, backdrop: 'file:///cache/backdrop.jpg' };
const week = { kind: 'week', stats: { words: 5, weekWords: 2, streak: 3, reviews: 4, days: [], stickers: [], langs: ['en'] } };

function build() {
  nativeModules.set('InstagramStories', nativeModules.instagramStories());
  nativeModules.set('ExpoClipboard');
  nativeModules.set('ExpoMediaLibraryNext');
  nativeModules.set('ExponentImagePicker');
}

let configureNext;
beforeEach(() => {
  jest.clearAllMocks();
  let n = 0;
  captureView.mockImplementation(async () => 'file:///tmp/shot' + ++n + '.png');
  storiesSupported.mockReturnValue(true);
  storiesAvailable.mockResolvedValue(true);
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  configureNext = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
  build();
});
afterEach(() => {
  jest.restoreAllMocks();
  nativeModules.reset();
  Dimensions.set({ window: WINDOW });
});

async function open(payload, { onClose = () => {}, metrics = TALL } = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <ShareSheet visible payload={payload} onClose={onClose} t={t} />
      </SafeAreaProvider>
    );
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 120));
  });
  return tree;
}

const button = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && n.props.onPress)[0] || null;
const tab = (tree, label) => tree.root.findAll((n) => n.props.accessibilityRole === 'tab' && n.props.accessibilityLabel === label)[0] || null;
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const press = (tree, label) => act(async () => button(tree, label).props.onPress());
const unmount = (tree) => act(async () => tree.unmount());
const flat = (style) => StyleSheet.flatten(style) || {};

// ── рядок стану: розкладка їде плавно ───────────────────────────────────────
describe('the status row eases the sheet instead of making it jump', () => {
  test('Copy: the layout animation is requested once, right before the row appears (DUR.panel)', async () => {
    const tree = await open(scanned);
    expect(configureNext).not.toHaveBeenCalled();
    await press(tree, t('shareCopy'));
    expect(texts(tree)).toContain(t('shareCopied'));
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext.mock.calls[0][0]).toMatchObject({ duration: DUR.panel });
    await unmount(tree);
  });

  test('auto-hide: the row goes away with the faster exit animation, and the timer is the one for its kind', async () => {
    const timers = jest.spyOn(global, 'setTimeout');
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    // «Скопійовано» довше за «Збережено»: це інструкція на два рядки
    const copyTimer = timers.mock.calls.find(([, ms]) => ms === 5500);
    expect(copyTimer).toBeTruthy();
    configureNext.mockClear();
    await act(async () => copyTimer[0]());
    expect(texts(tree)).not.toContain(t('shareCopied'));
    expect(configureNext).toHaveBeenCalledTimes(1);
    expect(configureNext.mock.calls[0][0]).toMatchObject({ duration: DUR.exit });
    // exit швидший за enter
    expect(DUR.exit).toBeLessThan(DUR.panel);
    await unmount(tree);
  });

  test('Save keeps the short 4 s timer; an error never times out', async () => {
    const timers = jest.spyOn(global, 'setTimeout');
    const tree = await open(scanned);
    await press(tree, t('shareSave'));
    expect(timers.mock.calls.some(([, ms]) => ms === 4000)).toBe(true);
    expect(timers.mock.calls.some(([, ms]) => ms === 5500)).toBe(false);
    await unmount(tree);

    const failing = jest.spyOn(global, 'setTimeout');
    failing.mockClear();
    const MediaLibrary = require('expo-media-library');
    MediaLibrary.Asset.create.mockRejectedValueOnce(new Error('disk'));
    const tree2 = await open(scanned);
    failing.mockClear();
    await press(tree2, t('shareSave'));
    expect(texts(tree2)).toContain(t('shareSaveError'));
    expect(failing.mock.calls.some(([, ms]) => ms === 4000 || ms === 5500)).toBe(false);
    await unmount(tree2);
  });

  test('no row on screen: swiping a page (say(null)) asks for no animation, so none is left pending', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    const scroller = tree.root.findAllByType(ScrollView)[0];
    await act(async () => scroller.props.onScroll({ nativeEvent: { contentOffset: { x: PAGE_W } } }));
    expect(configureNext).not.toHaveBeenCalled();
    await unmount(tree);
  });

  test('a visible row that a new action clears gets the exit animation first', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    configureNext.mockClear();
    await press(tree, t('shareSave'));
    // тап прибрав старий рядок (exit), результат додав новий (enter)
    expect(configureNext.mock.calls.map(([c]) => c.duration)).toEqual([DUR.exit, DUR.panel]);
    await unmount(tree);
  });

  test('compact screen: the row floats over the header and nothing is animated', async () => {
    Dimensions.set({ window: { ...WINDOW, width: 375, height: 667 } });
    const tree = await open(scanned, { metrics: SE });
    await press(tree, t('shareCopy'));
    expect(texts(tree)).toContain(t('shareCopied'));
    expect(configureNext).not.toHaveBeenCalled();
    await unmount(tree);
  });

  test('VoiceOver still hears the row', async () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility');
    const tree = await open(scanned);
    await press(tree, t('shareCopy'));
    expect(announce).toHaveBeenCalledWith(t('shareCopied'));
    await unmount(tree);
  });
});

// ── «Збережено»: картка не прозора ──────────────────────────────────────────
describe('the saved toast matches what was saved', () => {
  test('a sticker is saved with a transparent background', async () => {
    const tree = await open(scanned);
    await press(tree, t('shareSave'));
    expect(texts(tree)).toContain(t('shareSaved'));
    expect(t('shareSaved')).toMatch(/transparent/);
    await unmount(tree);
  });

  test('a card is opaque: the toast does not claim transparency', async () => {
    const tree = await open(scanned);
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await press(tree, t('shareSave'));
    expect(texts(tree)).toContain(t('shareSavedCard'));
    expect(texts(tree)).not.toContain(t('shareSaved'));
    await unmount(tree);
  });

  test('the week is a card only', async () => {
    const tree = await open(week);
    await press(tree, t('shareSave'));
    expect(texts(tree)).toContain(t('shareSavedCard'));
    await unmount(tree);
  });

  test.each(['en', 'uk', 'de', 'es', 'ru'])('%s: the card text exists, is shorter and has no transparency or long dash', (lang) => {
    const tl = makeT(lang);
    expect(tl('shareSavedCard')).not.toBe('shareSavedCard');
    expect(tl('shareSavedCard').length).toBeLessThan(tl('shareSaved').length);
    expect(tl('shareSavedCard')).not.toMatch(/—|–/);
  });
});

// ── гортальники: contentOffset не міняється посеред свайпу ──────────────────
describe('paging scroll views keep one contentOffset while the finger moves', () => {
  // Обраний вигляд наліпки живе в модулі до кінця сесії: перед кожним тестом
  // повертаємо перший, щоб тести не залежали від порядку
  beforeEach(async () => {
    const reset = await open({ kind: 'word', word: photoWord });
    await act(async () => reset.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: 0 } } }));
    await unmount(reset);
  });

  test('a style swipe changes the page state but not the contentOffset prop', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    const before = tree.root.findAllByType(ScrollView)[0].props.contentOffset;
    expect(before).toEqual({ x: 0, y: 0 });
    await act(async () => tree.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: BOX_W } } }));
    const after = tree.root.findAllByType(ScrollView)[0].props.contentOffset;
    expect(after).toBe(before);
    await unmount(tree);
  });

  test('a card swipe does the same', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    const before = tree.root.findAllByType(ScrollView)[0].props.contentOffset;
    await act(async () => tree.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: PAGE_W } } }));
    expect(tree.root.findAllByType(ScrollView)[0].props.contentOffset).toBe(before);
    await unmount(tree);
  });

  test('a new sheet starts on the look chosen earlier (offset at mount, and scrollTo as the fallback)', async () => {
    const first = await open({ kind: 'word', word: photoWord });
    await act(async () => first.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: BOX_W } } }));
    await unmount(first);

    const tree = await open({ kind: 'word', word: photoWord });
    const scroller = tree.root.findAllByType(ScrollView)[0];
    expect(scroller.props.contentOffset).toEqual({ x: BOX_W, y: 0 });
    expect(scroller.instance.scrollTo).toHaveBeenCalledWith({ x: BOX_W, animated: false });
    await unmount(tree);
  });

  test('back and forth between Sticker and Card: each new scroller starts on the page already picked', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    await act(async () => tree.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: PAGE_W } } }));
    await act(async () => tab(tree, t('shareModeSticker')).props.onPress());
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    expect(tree.root.findAllByType(ScrollView)[0].props.contentOffset).toEqual({ x: PAGE_W, y: 0 });
    await unmount(tree);
  });
});

// ── перемикач «Наліпка · Картка» ───────────────────────────────────────────
describe('Sticker | Card segment', () => {
  const tablist = (tree) => tree.root.find((n) => n.props.accessibilityRole === 'tablist');
  const thumbs = (tree) => tablist(tree).findAll((n) => n.type === Animated.View);

  test('the thumb appears once the width is known, sits under the first tab and slides to the second', async () => {
    const tree = await open(scanned);
    expect(thumbs(tree)).toHaveLength(0);
    await act(async () => tablist(tree).props.onLayout({ nativeEvent: { layout: { width: 232, height: 36 } } }));
    const [thumb] = thumbs(tree);
    expect(flat(thumb.props.style).width).toBe(113);
    const shift = () => flat(thumbs(tree)[0].props.style).transform[0].translateX.__getValue();
    expect(shift()).toBe(0);
    const spring = jest.spyOn(Animated, 'spring');
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    // пружина SPRING.snappy на нативному драйвері (у jest вона не доходить до кінця)
    expect(spring).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ toValue: 1, stiffness: SPRING.snappy.stiffness, damping: SPRING.snappy.damping, useNativeDriver: true })
    );
    await act(async () => tab(tree, t('shareModeSticker')).props.onPress());
    expect(spring).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
    await unmount(tree);
  });

  test('the thumb never intercepts a tap; the tabs keep their role and state', async () => {
    const tree = await open(scanned);
    await act(async () => tablist(tree).props.onLayout({ nativeEvent: { layout: { width: 232, height: 36 } } }));
    expect(thumbs(tree)[0].props.pointerEvents).toBe('none');
    expect(tab(tree, t('shareModeSticker')).props.accessibilityState).toEqual({ selected: true });
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    expect(tab(tree, t('shareModeCard')).props.accessibilityState).toEqual({ selected: true });
    expect(tab(tree, t('shareModeSticker')).props.accessibilityState).toEqual({ selected: false });
    // активна вкладка більше не несе фону сама: його малює пігулка
    expect(flat(tab(tree, t('shareModeCard')).props.style).backgroundColor).toBeUndefined();
    await unmount(tree);
  });

  test('Reduce Motion: the thumb jumps, no spring', async () => {
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await open(scanned);
    await act(async () => tablist(tree).props.onLayout({ nativeEvent: { layout: { width: 232, height: 36 } } }));
    spring.mockClear();
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    expect(spring).not.toHaveBeenCalled();
    expect(flat(thumbs(tree)[0].props.style).transform[0].translateX.__getValue()).toBe(113);
    await unmount(tree);
  });
});

// ── цілі дотику ────────────────────────────────────────────────────────────
describe('touch targets are 44 pt', () => {
  test('segment tabs get 7 pt of hit slop above and below their 30 pt', async () => {
    const tree = await open(scanned);
    for (const label of [t('shareModeSticker'), t('shareModeCard')]) {
      expect(tab(tree, label).props.hitSlop).toEqual({ top: 7, bottom: 7 });
    }
    await unmount(tree);
  });

  test('every page dot is 44 pt high (VoiceOver frame too) and at least 28 wide, in a row that stays 18 pt', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    for (const label of [t('shareStyleObject'), t('shareStyleWord')]) {
      const dot = flat(button(tree, label).props.style);
      expect(dot).toMatchObject({ height: 44, minWidth: 28, marginVertical: -13 });
      // висота ряду: 44 - 2 × 13 = 18
      expect(dot.height + 2 * dot.marginVertical).toBe(18);
    }
    await unmount(tree);
  });

  test('tapping a dot still turns the page', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    const scroller = tree.root.findAllByType(ScrollView)[0];
    await press(tree, t('shareStyleWord'));
    expect(scroller.instance.scrollTo).toHaveBeenCalledWith({ x: BOX_W, animated: true });
    await unmount(tree);
  });
});

// ── VoiceOver: сторінки картки ─────────────────────────────────────────────
describe('card pages are pictures for VoiceOver', () => {
  const pages = (tree) =>
    tree.root.findAll((n) => n.props.accessibilityRole === 'image' && typeof n.type === 'string' && n.props.accessible === true);

  test('one labelled picture per template; only the visible page is reachable', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    const list = pages(tree);
    expect(list).toHaveLength(3);
    // шаблон і слово з перекладом: голос каже, що це за картка
    expect(list[0].props.accessibilityLabel).toBe(`${t('shareTplSticker')}: mug, кружка`);
    expect(list[1].props.accessibilityLabel).toBe(`${t('shareTplEntry')}: mug, кружка`);
    expect(list.map((n) => n.props.accessibilityElementsHidden)).toEqual([false, true, true]);
    expect(list.map((n) => n.props.importantForAccessibility)).toEqual(['yes', 'no-hide-descendants', 'no-hide-descendants']);

    await act(async () => tree.root.findAllByType(ScrollView)[0].props.onScroll({ nativeEvent: { contentOffset: { x: PAGE_W } } }));
    expect(pages(tree).map((n) => n.props.accessibilityElementsHidden)).toEqual([true, false, true]);
    await unmount(tree);
  });

  test('the week and an achievement have a single card named after the sheet or the achievement', async () => {
    const tree = await open(week);
    const [only] = pages(tree);
    expect(only.props.accessibilityLabel).toBe(t('shareTitleWeek'));
    expect(only.props.accessibilityElementsHidden).toBe(false);
    await unmount(tree);
  });

  test('the dots stay separate buttons: switching the template needs no swipe', async () => {
    const tree = await open({ kind: 'word', word: photoWord });
    await act(async () => tab(tree, t('shareModeCard')).props.onPress());
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60));
    });
    for (const k of ['shareTplSticker', 'shareTplEntry', 'shareTplMinimal']) expect(button(tree, t(k))).not.toBeNull();
    await unmount(tree);
  });
});

// ── Dynamic Type ───────────────────────────────────────────────────────────
describe('Dynamic Type', () => {
  test('the title and “Close” are capped like the rest of the sheet', async () => {
    const tree = await open(scanned);
    const textOf = (s) => tree.root.findAll((n) => n.type === Text && n.props.children === s)[0];
    expect(textOf(t('shareTitleWord')).props.maxFontSizeMultiplier).toBe(1.3);
    expect(textOf(t('shareClose')).props.maxFontSizeMultiplier).toBe(1.3);
    await unmount(tree);
  });
});

// ── потяг за ручку ─────────────────────────────────────────────────────────
// PanResponder рахує зсув із touchHistory, тож відтворюємо її, як це робить RN.
function touch(pageY, prevY, ts, startY = 300) {
  return {
    nativeEvent: { locationX: 100, locationY: pageY, pageX: 100, pageY, timestamp: ts, touches: [{}] },
    touchHistory: {
      numberActiveTouches: 1,
      indexOfSingleActiveTouch: 0,
      mostRecentTimeStamp: ts,
      touchBank: [
        {
          touchActive: true,
          startPageX: 100,
          startPageY: startY,
          startTimeStamp: 0,
          currentPageX: 100,
          currentPageY: pageY,
          currentTimeStamp: ts,
          previousPageX: 100,
          previousPageY: prevY,
          previousTimeStamp: ts - 16,
        },
      ],
    },
  };
}

describe('drag the grabber or the title down to dismiss', () => {
  const header = (tree) => tree.root.find((n) => n.props.testID === 'share-header');

  // Ведемо палець від startY до endY кроками по step пунктів за dt мс
  async function swipe(tree, { to, step = 20, dt = 120 }) {
    const h = () => header(tree).props;
    let y = 300;
    let ts = 100;
    await act(async () => {
      h().onStartShouldSetResponder?.(touch(y, y, ts));
    });
    let granted = false;
    while (y < 300 + to) {
      const next = Math.min(300 + to, y + step);
      ts += dt;
      const ev = touch(next, y, ts);
      await act(async () => {
        if (!granted) {
          // PanResponder оновлює жест у capture-фазі, а питає — в bubble
          h().onMoveShouldSetResponderCapture(ev);
          granted = !!h().onMoveShouldSetResponder(ev);
          if (granted) h().onResponderGrant(ev);
        } else {
          h().onResponderMove(ev);
        }
      });
      y = next;
    }
    ts += dt;
    await act(async () => {
      if (granted) h().onResponderRelease(touch(y, y, ts));
    });
    return granted;
  }

  test('a long slow pull closes the sheet', async () => {
    const onClose = jest.fn();
    const tree = await open(scanned, { onClose });
    expect(await swipe(tree, { to: 160 })).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, DUR.exit + 120));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });

  test('a short slow pull springs back and the sheet stays', async () => {
    const onClose = jest.fn();
    const spring = jest.spyOn(Animated, 'spring');
    const tree = await open(scanned, { onClose });
    expect(await swipe(tree, { to: 50, step: 10, dt: 200 })).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300));
    });
    expect(onClose).not.toHaveBeenCalled();
    expect(spring).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ toValue: 0 }));
    await unmount(tree);
  });

  test('a quick flick closes it even over a short distance', async () => {
    const onClose = jest.fn();
    const tree = await open(scanned, { onClose });
    expect(await swipe(tree, { to: 60, step: 30, dt: 16 })).toBe(true);
    await act(async () => {
      await new Promise((r) => setTimeout(r, DUR.exit + 120));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });

  test('a sideways or upward move is not a drag: the responder is not taken', async () => {
    const tree = await open(scanned);
    const h = header(tree).props;
    const up = touch(280, 300, 200);
    h.onMoveShouldSetResponderCapture(up);
    expect(h.onMoveShouldSetResponder(up)).toBe(false);
    const sideways = touch(304, 300, 300);
    sideways.touchHistory.touchBank[0].currentPageX = 190;
    h.onMoveShouldSetResponderCapture(sideways);
    expect(h.onMoveShouldSetResponder(sideways)).toBe(false);
    await unmount(tree);
  });

  test('the strip is only the grabber and the title: previews and tiles are not under the responder', async () => {
    const tree = await open(scanned);
    const h = header(tree);
    // жест на одному вузлі, і це смуга (не вся панель, не гортальники)
    const owners = tree.root.findAll((n) => typeof n.props.onMoveShouldSetResponder === 'function');
    expect(owners.length).toBeGreaterThan(0);
    expect(owners.every((n) => n.props.testID === 'share-header')).toBe(true);
    // у смузі лише ручка й заголовок: жодної кнопки
    expect(h.findAll((n) => n.props.onPress).length).toBe(0);
    expect(h.findAll((n) => n.props.accessibilityRole === 'header').length).toBeGreaterThan(0);
    await unmount(tree);
  });

  test('closing is still guarded: dragging after the sheet is already closing closes once', async () => {
    const onClose = jest.fn();
    const tree = await open(scanned, { onClose });
    await press(tree, t('shareClose'));
    await swipe(tree, { to: 160 });
    await act(async () => {
      await new Promise((r) => setTimeout(r, DUR.exit + 120));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount(tree);
  });
});
