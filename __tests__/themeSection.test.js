// Параметри → «Тема» (v1.3, W5): сегменти «Авто / Світла / Темна» і п'ять
// плиток палітр. Без Pro плитка з короною відкриває пейвол «themes» з прев'ю
// саме цієї палітри, з Pro — застосовується одразу. Без Pro видно «Крейду»,
// але обрана палітра лишається й повертається з Pro.
// Далі — те саме в App: тема з палітри, тло кореня, покупка й відновлення з
// пейволу «themes» застосовують палітру, яку людина дивилась.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import App from '../App';
import SettingsScreen from '../src/SettingsScreen';
import PaywallScreen from '../src/PaywallScreen';
import { makeT } from '../src/i18n';
import { THEMES, ThemeProvider } from '../src/theme';
import { track } from '../src/analytics';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';

jest.mock('../src/analytics', () => ({ ...jest.requireActual('../src/analytics'), track: jest.fn() }));
// PALETTES_ENABLED перемикається в тесті (getter читається під час виклику)
jest.mock('../src/flags', () => {
  const actual = jest.requireActual('../src/flags');
  const flags = { ...actual };
  Object.defineProperty(flags, 'PALETTES_ENABLED', { get: () => (global.__palettesOff ? false : actual.PALETTES_ENABLED) });
  return flags;
});
jest.mock('expo-haptics', () => ({ ...jest.requireActual('expo-haptics'), selectionAsync: jest.fn(async () => {}) }));
jest.mock('expo-system-ui', () => ({ setBackgroundColorAsync: jest.fn(async () => {}), getBackgroundColorAsync: jest.fn(async () => null) }));
const SystemUI = require('expo-system-ui');

jest.setTimeout(20000);

const uk = makeT('uk');
const en = makeT('en');

async function render(props = {}, theme = THEMES.light) {
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={theme}>
        <SettingsScreen
          targetLang="en"
          nativeLang="uk"
          themeKey={theme.key}
          themeMode="system"
          wordsCount={0}
          wodEnabled
          wodHour={10}
          sub={{ pro: false }}
          uiLang="uk"
          t={uk}
          {...props}
        />
      </ThemeProvider>
    );
  });
  return tree;
}

const strings = (tree) =>
  tree.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter(Boolean);
const host = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && n.props.onPress)[0];
const tap = (tree, id) => act(async () => byId(tree, id).props.onPress());
const checked = (tree, id) => !!byId(tree, id).props.accessibilityState?.checked;
const events = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p);

beforeEach(() => {
  track.mockClear();
  Haptics.selectionAsync.mockClear();
});

describe('appearance: Auto, Light, Dark', () => {
  test('three segments, the current one is selected', async () => {
    const tree = await render({ themeMode: 'light' });
    expect(strings(tree)).toEqual(expect.arrayContaining([uk('themeLabel'), uk('themeAuto'), uk('themeLight'), uk('themeDark')]));
    expect(['system', 'light', 'dark'].map((m) => checked(tree, 'theme-mode-' + m))).toEqual([false, true, false]);
    await act(async () => tree.unmount());
  });

  test('a tap switches the mode, with a tick and a theme_set event', async () => {
    const onSetTheme = jest.fn();
    const tree = await render({ onSetTheme, settings: { palette: 'chalk' } });
    expect(checked(tree, 'theme-mode-system')).toBe(true);
    await tap(tree, 'theme-mode-dark');
    expect(onSetTheme).toHaveBeenCalledWith('dark');
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(events('theme_set')).toEqual([{ palette: 'chalk', mode: 'dark' }]);
    // той самий режим ще раз — нічого
    onSetTheme.mockClear();
    await tap(tree, 'theme-mode-system');
    expect(onSetTheme).not.toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('an old theme key from before v1.1 shows as the mode it meant', async () => {
    let tree = await render({ themeMode: 'charcoal' });
    expect(checked(tree, 'theme-mode-dark')).toBe(true);
    await act(async () => tree.unmount());
    tree = await render({ themeMode: 'sand' });
    expect(checked(tree, 'theme-mode-light')).toBe(true);
    await act(async () => tree.unmount());
  });
});

describe('palettes', () => {
  const KEYS = ['chalk', 'ocean', 'berry', 'graphite', 'cocoa'];

  test('five tiles with their names; without Pro four of them wear a crown and Chalk is on', async () => {
    const tree = await render({ settings: {} });
    const all = strings(tree);
    expect(all).toEqual(expect.arrayContaining([uk('paletteLabel'), 'Крейда', 'Океан', 'Ягода', 'Графіт', 'Какао']));
    expect(KEYS.map((k) => !!host(tree, 'palette-crown-' + k))).toEqual([false, true, true, true, true]);
    expect(KEYS.map((k) => checked(tree, 'palette-' + k))).toEqual([true, false, false, false, false]);
    expect(all).toContain(uk('paletteProHint'));
    // VoiceOver чує, що палітра — з Pro
    expect(byId(tree, 'palette-berry').props.accessibilityLabel).toBe('Ягода, палітра Pro');
    expect(byId(tree, 'palette-chalk').props.accessibilityLabel).toBe('Крейда');
    await act(async () => tree.unmount());
  });

  test('without Pro a crowned tile opens the themes paywall with that palette, and nothing is saved', async () => {
    const openPaywall = jest.fn();
    const saveSetting = jest.fn();
    const tree = await render({ settings: { palette: 'chalk' }, openPaywall, saveSetting });
    await tap(tree, 'palette-berry');
    expect(openPaywall).toHaveBeenCalledWith('themes', { palette: 'berry' });
    expect(saveSetting).not.toHaveBeenCalled();
    expect(events('theme_preview')).toEqual([{ palette: 'berry', source: 'settings' }]);
    // Крейда — безкоштовна: та, що вже обрана, нічого не робить
    await tap(tree, 'palette-chalk');
    expect(saveSetting).not.toHaveBeenCalled();
    expect(openPaywall).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());
  });

  test('with Pro a tile applies the palette at once, with a tick', async () => {
    const openPaywall = jest.fn();
    const saveSetting = jest.fn();
    const tree = await render({ settings: { palette: 'chalk', theme: 'dark' }, themeMode: 'dark', openPaywall, saveSetting, sub: { pro: true } });
    expect(tree.root.findAll((n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('palette-crown-'))).toHaveLength(0);
    expect(strings(tree)).toContain(uk('paletteHint'));
    await tap(tree, 'palette-cocoa');
    expect(saveSetting).toHaveBeenCalledWith({ palette: 'cocoa' });
    expect(openPaywall).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).toHaveBeenCalled();
    expect(events('theme_set')).toEqual([{ palette: 'cocoa', mode: 'dark' }]);
    await act(async () => tree.unmount());
  });

  test('the saved palette is on with Pro; without Pro Chalk is on and the palette waits for Pro', async () => {
    let tree = await render({ settings: { palette: 'berry' }, sub: { pro: true } });
    expect(checked(tree, 'palette-berry')).toBe(true);
    expect(checked(tree, 'palette-chalk')).toBe(false);
    await act(async () => tree.unmount());

    const saveSetting = jest.fn();
    tree = await render({ settings: { palette: 'berry' }, saveSetting });
    expect(checked(tree, 'palette-chalk')).toBe(true);
    expect(checked(tree, 'palette-berry')).toBe(false);
    expect(strings(tree)).toContain('Ягода повернеться разом із Pro. Поки що застосунок у «Крейді».');
    // хто свідомо обирає Крейду — забуває палітру Pro
    await tap(tree, 'palette-chalk');
    expect(saveSetting).toHaveBeenCalledWith({ palette: 'chalk' });
    await act(async () => tree.unmount());
  });

  test('a tile shows both looks of its palette: light on the left, dark on the right', async () => {
    const tree = await render({ settings: {} });
    const tile = byId(tree, 'palette-ocean');
    const fills = tile.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor).map((n) => StyleSheet.flatten(n.props.style).backgroundColor);
    const L = THEMES['ocean-light'].C;
    const D = THEMES['ocean-dark'].C;
    expect(fills).toEqual(expect.arrayContaining([L.bg, D.bg, L.accent, D.accent]));
    await act(async () => tree.unmount());
  });

  test('the same in dark mode and in English', async () => {
    const tree = await render({ settings: {}, uiLang: 'en', t: en }, THEMES.dark);
    expect(strings(tree)).toEqual(expect.arrayContaining(['Palette', 'Chalk', 'Ocean', 'Berry', 'Graphite', 'Cocoa', en('paletteProHint')]));
    await act(async () => tree.unmount());
  });

  test('with PALETTES_ENABLED = false only the appearance is left', async () => {
    global.__palettesOff = true;
    try {
      const tree = await render({ settings: { palette: 'berry' }, sub: { pro: true } });
      expect(byId(tree, 'theme-mode-dark')).toBeTruthy();
      expect(byId(tree, 'palette-ocean')).toBeUndefined();
      expect(strings(tree)).not.toContain(uk('paletteLabel'));
      await act(async () => tree.unmount());
    } finally {
      global.__palettesOff = false;
    }
  });
});

// ---------- У застосунку (магазин — імітація розробки) ----------
describe('in the app', () => {
  const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
  const mounted = [];
  afterEach(async () => {
    while (mounted.length) {
      const tree = mounted.pop();
      await act(async () => tree.unmount());
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    global.nativeModules.managed.delete('ExpoSystemUI');
  });

  beforeEach(async () => {
    await AsyncStorage.clear();
    SystemUI.setBackgroundColorAsync.mockClear();
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
  });

  async function returning(settings = {}, { pro = false } = {}) {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', ...settings }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
    if (pro) await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'lifetime', lifetime: true }));
  }

  async function run(fn) {
    let out;
    await act(async () => {
      out = await fn();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    return out;
  }

  async function renderApp() {
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    mounted.push(tree);
    for (let i = 0; i < 5; i++) await run(async () => {});
    return tree;
  }

  const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
  const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
  // ключ теми, яку App дає всьому застосунку (Параметри отримують його ж)
  async function themeKey(tree) {
    if (!one(tree, SettingsScreen)) await openTab(tree, 'settings');
    return one(tree, SettingsScreen).props.themeKey;
  }
  const stored = async () => JSON.parse(await AsyncStorage.getItem('ll_settings_v1'));

  test('Pro sees the palette in the chosen mode; without Pro it is Chalk, and the choice is kept', async () => {
    await returning({ theme: 'dark', palette: 'ocean' }, { pro: true });
    let tree = await renderApp();
    expect(await themeKey(tree)).toBe('ocean-dark');
    await act(async () => tree.unmount());
    mounted.pop();

    await AsyncStorage.removeItem('ll_sub_v1');
    tree = await renderApp();
    expect(await themeKey(tree)).toBe('dark');
    expect((await stored()).palette).toBe('ocean');
  });

  test('until the store answers, a saved palette stays on — no flash of Chalk for Pro on every launch', async () => {
    await returning({ theme: 'light', palette: 'ocean' });
    // імітований магазин «думає», доки тест його не відпустить
    let release;
    const gate = new Promise((r) => (release = r));
    // getItem у заглушці AsyncStorage — уже jest.fn: підміняємо й повертаємо
    // саме його реалізацію (spyOn повернув би той самий мок)
    const real = AsyncStorage.getItem.getMockImplementation();
    AsyncStorage.getItem.mockImplementation(async (k, cb) => {
      if (k === 'll_sub_v1') {
        await gate;
        return null;
      }
      return real(k, cb);
    });
    try {
      const tree = await renderApp();
      expect(await themeKey(tree)).toBe('ocean-light');
      // магазин відповів: Pro немає — «Крейда», а вибір лишився
      await run(async () => release());
      expect(await themeKey(tree)).toBe('light');
      expect((await stored()).palette).toBe('ocean');
    } finally {
      AsyncStorage.getItem.mockImplementation(real);
    }
  });

  test('the root view takes the theme’s background, and an old build without the native part is left alone', async () => {
    await returning({ theme: 'light', palette: 'berry' }, { pro: true });
    await renderApp();
    expect(SystemUI.setBackgroundColorAsync).toHaveBeenLastCalledWith(THEMES['berry-light'].C.bg);

    // нативної частини немає: тихо нічого, без червоного екрана
    global.nativeModules.managed.add('ExpoSystemUI');
    SystemUI.setBackgroundColorAsync.mockClear();
    await renderApp();
    expect(SystemUI.setBackgroundColorAsync).not.toHaveBeenCalled();
  });

  test('a crowned tile → the themes paywall → another palette → buy: the app wears the one last looked at', async () => {
    await returning({ theme: 'light' });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => tree.root.findAll((n) => n.props.testID === 'palette-berry' && n.props.onPress)[0].props.onPress());
    const paywall = one(tree, PaywallScreen);
    expect(paywall.props).toMatchObject({ reason: 'themes', palette: 'berry' });
    expect(await themeKey(tree)).toBe('light');

    await run(() => one(tree, PaywallScreen).props.onPalette('cocoa'));
    expect(events('theme_preview')).toEqual([
      { palette: 'berry', source: 'settings' },
      { palette: 'cocoa', source: 'paywall' },
    ]);
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    expect(one(tree, PaywallScreen)).toBeNull();
    expect(await themeKey(tree)).toBe('cocoa-light');
    expect((await stored()).palette).toBe('cocoa');
    expect(events('theme_set')).toEqual([{ palette: 'cocoa', mode: 'light' }]);
  });

  test('closing the themes paywall applies nothing, and a later purchase elsewhere does not either', async () => {
    await returning({ theme: 'light' });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.openPaywall('themes', { palette: 'ocean' }));
    await run(() => one(tree, PaywallScreen).props.onClose());
    await run(() => one(tree, SettingsScreen).props.onOpenPaywall());
    expect(one(tree, PaywallScreen).props.reason).toBe('info');
    await run(() => one(tree, PaywallScreen).props.onPurchase('year'));
    expect(await themeKey(tree)).toBe('light');
    expect((await stored()).palette).not.toBe('ocean');
    expect(events('theme_set')).toEqual([]);
  });

  test('restoring Pro from the themes paywall applies the palette too', async () => {
    await returning({ theme: 'dark' });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.openPaywall('themes', { palette: 'graphite' }));
    // Pro, куплений на іншому iPhone: «Відновити покупки» його знайде
    await AsyncStorage.setItem('ll_sub_v1', JSON.stringify({ planId: 'lifetime', lifetime: true }));
    const next = await run(() => one(tree, PaywallScreen).props.onRestore());
    expect(next.pro).toBe(true);
    expect(await themeKey(tree)).toBe('graphite-dark');
  });

  test('the paywall preview gets today’s word of the day', async () => {
    await returning({ theme: 'light' });
    await AsyncStorage.setItem(
      'll_wod_v1',
      JSON.stringify({
        lang: 'es',
        native: 'en',
        fetchedAt: Date.now(),
        words: [{ date: localDayKey(), word: 'la taza', ipa: '/la ˈtaθa/', translation: 'the cup' }],
      })
    );
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.openPaywall('themes', { palette: 'ocean' }));
    expect(one(tree, PaywallScreen).props.previewWord).toMatchObject({ word: 'la taza', translation: 'the cup' });
    expect(one(tree, PaywallScreen).props.palette).toBe('ocean');
  });
});
