// Параметри v1.3: секції винесено в src/settings/* (WodSection,
// StreakSection, WidgetsSection, ThemeSection, DevSection, Footer), щоб
// паралельні потоки не правили один SettingsScreen.js. Екран лишився тим
// самим: секції в тому ж порядку, діагностика — за сімома дотиками, а
// футер тепер показує справжню іконку застосунку й слоган без повтору назви.
import { Alert, Text } from 'react-native';
import { act, create } from 'react-test-renderer';

import SettingsScreen from '../src/SettingsScreen';
import { makeT } from '../src/i18n';
import { version as APP_VERSION } from '../package.json';

// Заглушки W1/W2 — шпигуни: бачимо, з чим екран їх кличе
jest.mock('../src/settings/StreakSection', () => jest.fn(() => null));
jest.mock('../src/settings/WidgetsSection', () => jest.fn(() => null));
const StreakSection = require('../src/settings/StreakSection');
const WidgetsSection = require('../src/settings/WidgetsSection');

const uk = makeT('uk');

async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SettingsScreen
        targetLang="en"
        nativeLang="uk"
        themeKey="light"
        themeMode="system"
        wordsCount={0}
        wodEnabled
        wodHour={10}
        sub={{ pro: false }}
        uiLang="uk"
        t={uk}
        {...props}
      />
    );
  });
  return tree;
}

const strings = (tree) =>
  tree.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter(Boolean);
const footer = (tree) => tree.root.findAll((n) => n.props.testID === 'settings-footer' && typeof n.props.onPress === 'function')[0];

beforeEach(() => {
  StreakSection.mockClear();
  WidgetsSection.mockClear();
});

test('sections render in the same order as before the split', async () => {
  const tree = await render();
  const all = strings(tree);
  const order = ['learnLang', 'myLang', 'uiLangTitle', 'wordOfDay', 'pushTime', 'themeLabel', 'about', 'data'].map((k) => uk(k));
  const at = order.map((s) => all.indexOf(s));
  expect(at.every((i) => i >= 0)).toBe(true);
  expect([...at].sort((a, b) => a - b)).toEqual(at);
  // футер — останній
  expect(all.indexOf(uk('footer'))).toBeGreaterThan(at[at.length - 1]);
  await act(async () => tree.unmount());
});

test('every section gets the shared ctx and the App’s extra', async () => {
  const settings = { wodPerDay: 1, palette: 'chalk' };
  const saveSetting = jest.fn();
  const commitSettings = jest.fn();
  const openPaywall = jest.fn();
  const extra = { marker: 1 };
  const tree = await render({ settings, saveSetting, commitSettings, openPaywall, extra, sub: { pro: true } });
  for (const Section of [StreakSection, WidgetsSection]) {
    expect(Section).toHaveBeenCalled();
    const { ctx, extra: got } = Section.mock.calls.at(-1)[0];
    expect(got).toBe(extra);
    expect(ctx).toMatchObject({ settings, saveSetting, commitSettings, openPaywall, t: uk, lang: 'uk', pro: true, isDark: false, themeKey: 'light' });
    expect(ctx.C.accent).toEqual(expect.any(String));
    expect(ctx.s.sectionLabel).toBeDefined();
    expect(ctx.props.wodHour).toBe(10);
    expect(ctx.dev).toEqual({ open: false, setOpen: expect.any(Function) });
  }
  await act(async () => tree.unmount());
});

test('without App’s settings the sections still get safe defaults; the paywall falls back to “info”', async () => {
  const onOpenPaywall = jest.fn();
  const tree = await render({ onOpenPaywall });
  const { ctx, extra } = StreakSection.mock.calls.at(-1)[0];
  expect(ctx.settings).toEqual({});
  expect(extra).toEqual({});
  expect(() => ctx.saveSetting({})).not.toThrow();
  ctx.openPaywall('themes');
  expect(onOpenPaywall).toHaveBeenCalledTimes(1);
  await act(async () => tree.unmount());
});

describe('footer', () => {
  test('the real app icon, the name once, the slogan and “Version {v}”', async () => {
    const tree = await render();
    expect(tree.root.findAll((n) => n.props.testID === 'app-icon').length).toBeGreaterThan(0);
    const all = strings(tree);
    expect(all).toContain('LinguaLens');
    expect(all).toContain(uk('footer'));
    expect(uk('footer')).not.toMatch(/LinguaLens/);
    expect(all).toContain(`Версія ${APP_VERSION}`);
    // старий рядок «v1.0.0» і знак LogoMark пішли
    expect(all).not.toContain(`v${APP_VERSION}`);
    expect(all.filter((s) => s === 'LinguaLens')).toHaveLength(1);
    await act(async () => tree.unmount());
  });

  // Онбординг 3.0 (W3): у розробці секція «Розробка» видна одразу, без семи
  // дотиків, і «Почати з нуля» питає підтвердження; у релізі сім дотиків, як
  // і раніше, відкривають лише діагностику (devSection.test.js).
  test('in development the «Розробка» section is there from the start; seven taps leave it be', async () => {
    const onDevReset = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render({ onDevReset });
    const tap = async (n) => {
      for (let i = 0; i < n; i++) await act(async () => footer(tree).props.onPress());
    };
    expect(strings(tree)).toContain('Розробка · лише __DEV__');
    expect(strings(tree)).toContain(uk('checkConn'));
    const reset = tree.root.findAll((n) => n.props.testID === 'dev-reset' && typeof n.props.onPress === 'function')[0];
    await act(async () => reset.props.onPress());
    expect(onDevReset).not.toHaveBeenCalled();
    const [, , buttons] = alert.mock.calls[0];
    await act(async () => buttons.find((b) => b.style === 'destructive').onPress());
    expect(onDevReset).toHaveBeenCalledTimes(1);
    await tap(7);
    expect(strings(tree)).toContain('Розробка · лише __DEV__');
    alert.mockRestore();
    await act(async () => tree.unmount());
  });
});

test('word of the day: same switch and hours as before', async () => {
  const onSetWodHour = jest.fn();
  const tree = await render({ onSetWodHour, uiLang: 'uk' });
  expect(strings(tree)).toEqual(expect.arrayContaining([uk('dailyPush'), '08:00', '20:00']));
  const chip = tree.root.findAll((n) => n.props.children === '18:00')[0];
  let btn = chip;
  while (typeof btn.props.onPress !== 'function') btn = btn.parent;
  await act(async () => btn.props.onPress());
  expect(onSetWodHour).toHaveBeenCalledWith(18);
  await act(async () => tree.unmount());
});
