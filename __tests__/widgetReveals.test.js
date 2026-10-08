// «Переклад» тапом у віджеті: перенесення відкритого перекладу, коли
// застосунок переписує таймлайн (carryReveals), і лік розкриттів для
// статистики (harvestReveals); скидання всіх віджетів; реєстрація трьох
// віджетів на першому запуску й те, як App їх годує (useWidgets).
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { carryReveals, harvestReveals } from '../src/widgets/reveals';
import { makeT } from '../src/i18n';
import { localDayKey } from '../src/storage';

const widgets = require('expo-widgets');
const uk = makeT('uk');
const entry = (key, revealed = '', extra = {}) => ({ date: new Date(2026, 9, 8), props: { key, revealed, word: key, ...extra } });

describe('carryReveals', () => {
  test('a reveal moves to the new entry with the same key, and only there', () => {
    const old = [entry('wod|2026-10-08|0', '1'), entry('wod|2026-10-09|0', '')];
    const next = [entry('wod|2026-10-08|0', '', { caption: 'нове' }), entry('wod|2026-10-09|0'), entry('wod|2026-10-10|0')];
    const out = carryReveals(old, next);
    expect(out.map((e) => e.props.revealed)).toEqual(['1', '', '']);
    expect(out[0].props.caption).toBe('нове');
    // нові записи — нові об'єкти, вхід не змінено
    expect(next[0].props.revealed).toBe('');
  });

  test('another word (another key) stays hidden; nothing to carry — the same array', () => {
    const next = [entry('words|id2|1700000000000')];
    expect(carryReveals([entry('words|id1|1700000000000', '1')], next)[0].props.revealed).toBe('');
    expect(carryReveals([], next)).toBe(next);
    expect(carryReveals(null, next)).toBe(next);
    expect(carryReveals([null, { props: null }, entry('', '1')], next)).toBe(next);
  });
});

describe('harvestReveals', () => {
  beforeEach(() => AsyncStorage.clear());

  test('counts every revealed entry once, per widget, and remembers no more than 200 keys', async () => {
    const tl = {
      wod: [entry('wod|a|0', '1'), entry('wod|b|0', '1'), entry('wod|c|0', '')],
      words: [entry('words|x|1', '1')],
    };
    expect(await harvestReveals(tl)).toEqual({ wod: 2, words: 1 });
    expect(await harvestReveals(tl)).toEqual({ wod: 0, words: 0 });
    tl.wod.push(entry('wod|d|0', '1'));
    expect(await harvestReveals(tl)).toEqual({ wod: 1, words: 0 });

    const many = { words: Array.from({ length: 260 }, (_, i) => entry('words|k' + i + '|1', '1')) };
    expect((await harvestReveals(many)).words).toBe(260);
    const seen = JSON.parse(await AsyncStorage.getItem('ll_widget_reveals_v1'));
    expect(seen).toHaveLength(200);
    expect(seen.at(-1)).toBe('words|k259|1');
  });

  test('broken storage is not an error', async () => {
    await AsyncStorage.setItem('ll_widget_reveals_v1', '{oops');
    expect(await harvestReveals({ wod: [entry('wod|a|0', '1')] })).toEqual({ wod: 1 });
  });
});

// ---------- App: три віджети на першому запуску й далі ----------
jest.setTimeout(20000);
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

describe('App feeds the widgets (useWidgets)', () => {
  const App = require('../App').default;
  const SettingsScreen = require('../src/SettingsScreen').default;
  let mounted = null;

  beforeEach(async () => {
    await AsyncStorage.clear();
    require('expo-localization').__setLocales(['uk-UA'], { silent: true });
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'uk', targetLang: 'en' }));
  });
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
  });

  async function renderApp(wait = 5) {
    await act(async () => {
      mounted = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    for (let i = 0; i < wait; i++) await act(() => new Promise((r) => setTimeout(r, 20)));
    return mounted;
  }
  const sleep = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

  test('with no data at all, all three register on the first launch (no “No layout found”)', async () => {
    await renderApp();
    await sleep(2100); // «Мої слова» — із затримкою
    expect(Object.keys(widgets.__widgets).sort()).toEqual(['MyWords', 'Streak', 'WordOfDay']);
    expect(widgets.__timeline('WordOfDay')[0].props.state).toBe('empty');
    expect(widgets.__timeline('MyWords')[0].props.state).toBe('empty');
    expect(widgets.__timeline('Streak')[0].props.state).toBe('none');
  });

  test('the streak widget gets the flame in the palette’s colours; word widgets keep the lean palette', async () => {
    const { THEMES } = require('../src/theme');
    const { FLAME_KEYS, PAL_KEYS } = require('../src/widgets/palette');
    await renderApp();
    await sleep(2100);
    const pal = widgets.__timeline('Streak')[0].props.pal;
    expect(pal.l).toMatchObject({ flame: THEMES.light.C.flame, flameTip: THEMES.light.C.flameTip, flameSoft: THEMES.light.C.flameSoft });
    expect(pal.d).toMatchObject({ flame: THEMES.dark.C.flame, flameTip: THEMES.dark.C.flameTip, onFlame: THEMES.dark.C.onFlame });
    // «Слово дня» й «Мої слова» — без ключів вогника: їхній таймлайн обмежений за розміром
    for (const kind of ['WordOfDay', 'MyWords']) {
      const p = widgets.__timeline(kind)[0].props.pal;
      expect(Object.keys(p.l).sort()).toEqual([...PAL_KEYS].sort());
      for (const k of FLAME_KEYS) expect(p.l[k]).toBeUndefined();
    }
  });

  test('a saved word reaches “My words” and the streak; the hide switch reaches the widgets', async () => {
    const now = Date.now();
    await AsyncStorage.setItem(
      'll_words_v1',
      JSON.stringify([{ id: 'a', word: 'mug', translation: 'чашка', lang: 'en', addedAt: now, srs: { box: 0, due: now } }])
    );
    const writes = () => widgets.__widgets.MyWords?.updateTimeline.mock.calls.length ?? 0;
    const start = writes();
    const tree = await renderApp();
    // «Мої слова» — не одразу: затримка, щоб картки не переписували віджет на кожен тап
    expect(writes()).toBe(start);
    await sleep(2100);
    expect(writes()).toBe(start + 1);
    expect(widgets.__timeline('MyWords')[0].props).toMatchObject({ word: 'mug', hide: '1' });
    expect(widgets.__timeline('Streak')[0].props).toMatchObject({ state: 'done', n: '1' });
    const before = widgets.__widgets.MyWords.updateTimeline.mock.calls.length;
    // Параметри → «Віджети» → переклад видно одразу
    // типово переклад у віджетах прихований
    expect((await require('../src/storage').loadSettings()).widgetHideTranslation).not.toBe(false);
    // Параметри: перемикач «ховати переклад» (WidgetsSection) — через commitSettings
    await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
    const screen = tree.root.findByType(SettingsScreen);
    await act(async () => screen.props.commitSettings({ ...screen.props.settings, widgetHideTranslation: false }));
    await sleep(2100);
    expect(widgets.__widgets.MyWords.updateTimeline.mock.calls.length).toBeGreaterThan(before);
    expect(widgets.__timeline('MyWords')[0].props.hide).toBe('');
    expect(widgets.__timeline('WordOfDay')[0].props.hide).toBe('');
  });
});

// Справжні модулі без isolateModules: лінивий require віджета в async-коді
// isolateModules однаково потрапив би в основний реєстр. Тож заглушку
// expo-widgets не скидаємо (__reset) — віджети створюються раз на файл.
describe('the public API', () => {
  const w = require('../src/widgets');
  beforeEach(() => AsyncStorage.clear());

  test('resetWidgets: all three to their empty state, thumbnails and the reveal count forgotten', async () => {
    await AsyncStorage.setItem('ll_widget_reveals_v1', JSON.stringify(['wod|a|0']));
    expect(await w.resetWidgets(uk)).toBe(true);
    expect(widgets.__timeline('WordOfDay')[0].props).toMatchObject({ state: 'empty', message: uk('widgetEmpty') });
    expect(widgets.__timeline('MyWords')[0].props).toMatchObject({ state: 'empty', message: uk('widgetWordsEmpty') });
    expect(widgets.__timeline('Streak')[0].props).toMatchObject({ state: 'none', n: '0' });
    expect(await AsyncStorage.getItem('ll_widget_reveals_v1')).toBeNull();
    // без перекладача — мовою телефона
    expect(await w.resetWidgets()).toBe(true);
  });

  test('collectReveals reads both timelines; a failing getTimeline counts as nothing', async () => {
    await w.updateWordWidget(null, { t: uk, targetLang: 'en', nativeLang: 'uk' });
    await w.updateMyWordsWidget([], { t: uk, targetLang: 'en' });
    widgets.__interact('WordOfDay', 0, { revealed: '1' });
    expect(await w.collectReveals()).toEqual({ wod: 1, words: 0 });
    // уже пораховано
    expect(await w.collectReveals()).toEqual({ wod: 0, words: 0 });
    await AsyncStorage.clear();
    widgets.__widgets.WordOfDay.getTimeline.mockRejectedValueOnce(new Error('no app group'));
    expect(await w.collectReveals()).toEqual({ wod: 0, words: 0 });
  });

  test('a reveal survives the app rewriting the timeline', async () => {
    const word = { date: localDayKey(), slot: 0, word: 'mug', ipa: 'mʌɡ', translation: 'чашка', example: 'A mug of tea.' };
    const cache = { lang: 'en', native: 'uk', words: [word], fetchedAt: Date.now() };
    const opts = { t: uk, ui: 'uk', targetLang: 'en', nativeLang: 'uk', hide: true };
    await w.updateWordWidget(cache, opts);
    widgets.__interact('WordOfDay', 0, { revealed: '1' });
    // нова тема — новий таймлайн, але переклад лишається відкритим
    await w.updateWordWidget(cache, { ...opts, pal: w.widgetPalette('dark') });
    expect(widgets.__timeline('WordOfDay')[0].props).toMatchObject({ word: 'mug', hide: '1', revealed: '1' });
    // а завтрашнє слово — знову сховане
    expect(widgets.__timeline('WordOfDay').at(-1).props.revealed).toBe('');
  });
});
