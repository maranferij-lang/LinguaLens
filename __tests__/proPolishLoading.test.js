// Полірування Pro, другий захід (жовтень 2026): на пейволі, поки їдуть ціни,
// три сірі блоки висоти тарифів замість спінера (екран не підстрибує); у списку
// мов навчання рядок, що відкриє пейвол, має позначку Pro; цифра «29 мов» на
// пейволі не розходиться зі списком мов.
import { ActivityIndicator, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import { FadeIn, Skeleton } from '../src/ui';
import { COMPARISON, PLANS } from '../src/subscription';
import { LANGS, nameFor } from '../src/speech';
import { expandOptions, parseOption } from '../src/langVariants';
import { makeT } from '../src/i18n';
import polishPro from '../src/strings/polish-pro';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const t = makeT('en');
const LOCALES = ['en', 'uk', 'de', 'es', 'ru'];

let mounted = [];
let spies = [];
afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  for (const spy of spies) spy.mockRestore();
  spies = [];
  jest.clearAllMocks();
});

async function mount(el) {
  let tree;
  await act(async () => {
    tree = create(el);
  });
  mounted.push(tree);
  return tree;
}
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id)[0];
const hosts = (tree, fn) => tree.root.findAll((n) => typeof n.type === 'string' && fn(n));
const radios = (tree) => hosts(tree, (n) => n.props.accessibilityRole === 'radio');

// ─── пейвол: заглушка цін ───────────────────────────────────────────────────
describe('Paywall: the plans skeleton', () => {
  const props = { reason: 'scans', onClose: () => {}, onPurchase: async () => ({}), onRestore: async () => ({}), lang: 'en', t };
  const skeleton = (tree) => byId(tree, 'plans-skeleton');

  function screen(height) {
    for (const spy of spies) spy.mockRestore();
    spies = [
      jest
        .spyOn(require('react-native'), 'useWindowDimensions', 'get')
        .mockReturnValue(() => ({ width: height > 700 ? 393 : 375, height, scale: 3, fontScale: 1 })),
    ];
  }

  test('while prices load: three blocks, named and busy for VoiceOver, no spinner, no cards', async () => {
    screen(852);
    const tree = await mount(<PaywallScreen {...props} plans={[]} />);
    const box = skeleton(tree);
    expect(box).toBeDefined();
    expect(box.props.accessible).toBe(true);
    expect(box.props.accessibilityLabel).toBe(t('plansLoading'));
    expect(box.props.accessibilityState).toEqual({ busy: true });
    expect(box.findAllByType(Skeleton)).toHaveLength(3);
    // сам Skeleton від VoiceOver прихований, говорить контейнер
    expect(box.findAllByType(Skeleton)[0].props.height).toBe(77);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    expect(radios(tree)).toHaveLength(0);
  });

  test('the blocks are as tall as the cards; a short screen has the tighter cards', async () => {
    screen(667);
    const tree = await mount(<PaywallScreen {...props} plans={[]} />);
    expect(skeleton(tree).findAllByType(Skeleton).map((b) => b.props.height)).toEqual([71, 71, 71]);
  });

  test('every language names the skeleton, with no long dash', () => {
    for (const lang of LOCALES) {
      const text = polishPro[lang].plansLoading;
      expect(text).toBeTruthy();
      expect(text).not.toMatch(/[—–]/);
      expect(makeT(lang)('plansLoading')).toBe(text);
    }
  });

  test('prices that failed or a build without a store: no skeleton, the old messages stay', async () => {
    const failed = await mount(<PaywallScreen {...props} plans={[]} plansFailed onRetry={() => {}} />);
    expect(skeleton(failed)).toBeUndefined();
    const none = await mount(<PaywallScreen {...props} plans={[]} unavailable />);
    expect(skeleton(none)).toBeUndefined();
    expect(radios(none)).toHaveLength(0);
  });

  test('prices arrive late: the blocks go, the cards fade in one after another with no slide', async () => {
    screen(852);
    const tree = await mount(<PaywallScreen {...props} plans={[]} />);
    expect(skeleton(tree)).toBeDefined();
    await act(async () => tree.update(<PaywallScreen {...props} plans={PLANS} />));
    expect(skeleton(tree)).toBeUndefined();
    const group = hosts(tree, (n) => n.props.accessibilityRole === 'radiogroup')[0];
    expect(radios(tree)).toHaveLength(PLANS.length);
    const fades = group.findAllByType(FadeIn);
    expect(fades).toHaveLength(PLANS.length);
    expect(fades.map((f) => f.props.index)).toEqual(PLANS.map((_, i) => i));
    for (const f of fades) expect(f.props.dy).toBe(0);
  });

  test('prices on the first frame: the cards are just there, as before', async () => {
    screen(852);
    const tree = await mount(<PaywallScreen {...props} plans={PLANS} />);
    expect(skeleton(tree)).toBeUndefined();
    const group = hosts(tree, (n) => n.props.accessibilityRole === 'radiogroup')[0];
    expect(group.findAllByType(FadeIn)).toHaveLength(0);
    expect(radios(tree)).toHaveLength(PLANS.length);
  });

  test('“Try again” while the request runs: the skeleton is back in the plans slot, and it has no spinner of its own', async () => {
    // «Ще раз»: plansFailed скинувся, цін нема. Під час запиту блок помилки в
    // підвалі лишається, а на місці цін заглушка (вона була й до помилки).
    const tree = await mount(<PaywallScreen {...props} plans={[]} plansFailed onRetry={() => {}} />);
    expect(skeleton(tree)).toBeUndefined();
    await act(async () => tree.update(<PaywallScreen {...props} plans={[]} plansFailed={false} onRetry={() => {}} />));
    expect(skeleton(tree)).toBeDefined();
    // єдиний спінер на екрані — на кнопці «Ще раз», не на місці цін
    expect(skeleton(tree).findAllByType(ActivityIndicator)).toHaveLength(0);
  });
});

// ─── Параметри: мови, що відкриють пейвол ───────────────────────────────────
describe('Settings: languages that open the paywall carry a Pro pill', () => {
  const { variant } = parseOption(expandOptions(['en'])[0]);
  const open = async (tree) => {
    const head = tree.root.findAll((n) => n.props.accessibilityLabel?.startsWith(`${t('learnLang')}: English`) && typeof n.props.onPress === 'function')[0];
    await act(async () => head.props.onPress());
  };
  const screen = (props = {}) => (
    <SettingsScreen
      targetLang="en"
      targetVariant={variant}
      nativeLang="uk"
      themeKey="light"
      themeMode="system"
      wordsCount={3}
      wodEnabled
      wodHour={10}
      sub={{ pro: false }}
      uiLang="en"
      t={t}
      {...props}
    />
  );
  const pills = (tree) => tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('setlang-pro-') && typeof n.type === 'string');

  test('a locked row gets the pill and a spoken name; the language in use and the variants of it do not', async () => {
    const isLangLocked = jest.fn((code) => code !== 'en');
    const tree = await mount(screen({ isLangLocked }));
    await open(tree);
    const ids = pills(tree).map((n) => n.props.testID.replace('setlang-pro-', ''));
    expect(ids).toContain('de');
    // англійська (хоч який варіант) — мова, що вже в роботі: без позначки
    expect(ids.filter((id) => parseOption(id).code === 'en')).toEqual([]);
    expect(ids).toHaveLength(expandOptions(LANGS.map((l) => l.code)).filter((k) => parseOption(k).code !== 'en').length);
    const de = byId(tree, 'setlang-de');
    expect(de.props.accessibilityLabel).toBe(t('langA11yPro', { l: nameFor('de') }));
    expect(de.props.accessibilityRole).toBe('radio');
    // рядок без позначки читається за своїм вмістом, як і раніше
    const en = tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('setlang-en') && typeof n.props.onPress === 'function')[0];
    expect(en.props.accessibilityLabel).toBeUndefined();
  });

  test('the tap is unchanged: a locked language still goes to the app (which opens the paywall)', async () => {
    const onSetLang = jest.fn();
    const tree = await mount(screen({ onSetLang, isLangLocked: (code) => code !== 'en' }));
    await open(tree);
    await act(async () => byId(tree, 'setlang-de').props.onPress());
    expect(onSetLang).toHaveBeenCalledTimes(1);
    expect(onSetLang.mock.calls[0][0]).toBe('de');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('without a predicate (Pro, or an app that does not pass one) there are no pills at all', async () => {
    const tree = await mount(screen());
    await open(tree);
    expect(byId(tree, 'setlang-de')).toBeDefined();
    expect(pills(tree)).toHaveLength(0);
    expect(byId(tree, 'setlang-de').props.accessibilityLabel).toBeUndefined();
  });

  test('“my language” never shows the pill: changing it is free', async () => {
    const tree = await mount(screen({ isLangLocked: () => true }));
    const mine = tree.root.findAll((n) => n.props.accessibilityLabel?.startsWith(`${t('myLang')}:`) && typeof n.props.onPress === 'function')[0];
    await act(async () => mine.props.onPress());
    // у списку «моєї» мови рядків із позначкою нема, лише в списку мови навчання (закритому)
    expect(pills(tree)).toHaveLength(0);
  });

  test('the pill sits in the row’s own style: a quiet accent chip, the name keeps the room', async () => {
    const tree = await mount(screen({ isLangLocked: () => true }));
    await open(tree);
    const pill = pills(tree)[0];
    const st = StyleSheet.flatten(pill.props.style);
    expect(st.borderRadius).toBeGreaterThan(0);
    expect(st.backgroundColor).toBeTruthy();
  });
});

// ─── довідники: цифри пейволу не застарівають непомітно ─────────────────────
describe('the paywall promises as many languages as the app has', () => {
  test('the comparison row says how many languages Pro unlocks', () => {
    const row = COMPARISON.find((r) => r.id === 'langs');
    expect(row.pro).toBe(String(LANGS.length));
  });

  test.each(LOCALES)('%s: the words on the paywall say the same number', (lang) => {
    const tt = makeT(lang);
    for (const key of ['pwLangsText', 'pro_langs']) expect(tt(key)).toContain(String(LANGS.length));
  });
});
