// Шви App.js для паралельних потоків v1.3 (план §5.2, §5.6, §5.7): маркери
// <v13:Wn> у трьох місцях, нові ключі налаштувань із типовими значеннями і
// те, що секції Параметрів отримують від App.
import fs from 'fs';
import path from 'path';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import SettingsScreen from '../src/SettingsScreen';

jest.setTimeout(20000);

const SRC = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
const STREAMS = ['W1', 'W2', 'W3', 'W4', 'W5'];

describe('markers', () => {
  test('each stream has its markers in exactly three places, in order', () => {
    for (const w of STREAMS) {
      const open = [...SRC.matchAll(new RegExp(`^\\s*// <v13:${w}>$`, 'gm'))].map((m) => m.index);
      const close = [...SRC.matchAll(new RegExp(`^\\s*// </v13:${w}>$`, 'gm'))].map((m) => m.index);
      expect([w, open.length, close.length]).toEqual([w, 3, 3]);
      for (let i = 0; i < 3; i++) expect(open[i]).toBeLessThan(close[i]);
    }
  });

  test('imports, the body before the first return, and settingsExtra', () => {
    const app = SRC.indexOf('export default function App()');
    const firstReturn = SRC.indexOf('  if (!appReady) {', app);
    const extra = SRC.indexOf('const settingsExtra = {');
    const extraEnd = SRC.indexOf('\n  };', extra);
    for (const w of STREAMS) {
      const at = [...SRC.matchAll(new RegExp(`// <v13:${w}>`, 'g'))].map((m) => m.index);
      expect(at[0]).toBeLessThan(app); // імпорти
      expect(at[1]).toBeGreaterThan(app); // тіло App()…
      expect(at[1]).toBeLessThan(extra); // …перед settingsExtra
      expect(at[2]).toBeGreaterThan(extra); // поля settingsExtra
      expect(at[2]).toBeLessThan(extraEnd);
    }
    expect(extraEnd).toBeLessThan(firstReturn);
  });

  test('streams never share a line: W(n) closes before W(n+1) opens', () => {
    const order = [...SRC.matchAll(/\/\/ <(\/?)v13:(W\d)>/g)].map((m) => (m[1] ? '/' : '') + m[2]);
    const block = STREAMS.flatMap((w) => [w, '/' + w]);
    expect(order).toEqual([...block, ...block, ...block]);
  });
});

describe('settings', () => {
  const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

  beforeEach(async () => {
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
  });

  async function settingsScreen(stored) {
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify(stored));
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    for (let i = 0; i < 5; i++) await act(async () => new Promise((r) => setTimeout(r, 20)));
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
    return { tree, screen: () => tree.root.findByType(SettingsScreen) };
  }

  test('new keys default as planned; an old install keeps what it stored', async () => {
    const { tree, screen } = await settingsScreen({ nativeLang: 'en', targetLang: 'es', streakRemind: false });
    expect(screen().props.settings).toMatchObject({
      palette: 'chalk',
      wodPerDay: 1,
      wodHours: null,
      widgetHideTranslation: true,
      streakRemind: false,
      streakSeen: { celebrated: null, best: 0 },
      unlockSeen: { cards: false, quiz: false },
    });
    await act(async () => tree.unmount());
  });

  test('sections get App’s settings functions, the paywall and settingsExtra', async () => {
    const { tree, screen } = await settingsScreen({ nativeLang: 'en', targetLang: 'es' });
    const props = screen().props;
    // поля додають потоки v1.3 (W2: слова на день, віджети)
    expect(props.extra).toEqual(expect.any(Object));
    expect(typeof props.openPaywall).toBe('function');
    await act(async () => props.saveSetting({ widgetHideTranslation: false }));
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1'))).toMatchObject({ widgetHideTranslation: false });
    await act(async () => screen().props.commitSettings({ ...screen().props.settings, wodPerDay: 3 }));
    expect(screen().props.settings.wodPerDay).toBe(3);
    await act(async () => tree.unmount());
  });
});
