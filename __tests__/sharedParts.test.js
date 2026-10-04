// Спільні дрібниці v1.3 (план §5.5): справжня іконка застосунку, табличка
// слова для наліпок і онбордингу, нові іконки й прапорці-вимикачі.
import fs from 'fs';
import path from 'path';
import { Image, StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { Path } from 'react-native-svg';

import { APP_ICON_RADIUS, AppIcon } from '../src/Logo';
import WordPlate, { PLATE } from '../src/WordPlate';
import { textEm } from '../src/share/layout';
import * as icons from '../src/icons';
import * as flags from '../src/flags';
import { THEMES, ThemeProvider } from '../src/theme';

const ROOT = path.join(__dirname, '..');

async function render(el, theme = THEMES.light) {
  let tree;
  await act(async () => {
    tree = create(<ThemeProvider value={theme}>{el}</ThemeProvider>);
  });
  return tree;
}
const texts = (tree) => tree.root.findAllByType(Text).map((n) => [].concat(n.props.children).join(''));

describe('AppIcon', () => {
  test('the real home-screen icon, 192 px, in the iOS squircle', async () => {
    const tree = await render(<AppIcon size={64} />);
    const box = tree.root.findAll((n) => n.props.testID === 'app-icon' && n.props.style)[0];
    const style = StyleSheet.flatten(box.props.style);
    expect(style).toMatchObject({ width: 64, height: 64, borderCurve: 'continuous' });
    expect(style.borderRadius).toBeCloseTo(64 * 0.2237, 3);
    expect(APP_ICON_RADIUS).toBe(0.2237);
    const img = tree.root.findByType(Image);
    expect(StyleSheet.flatten(img.props.style).borderRadius).toBeCloseTo(14.32, 2);
    await act(async () => tree.unmount());
  });

  test('assets/app-icon-192.png is a small 192×192 PNG', () => {
    const buf = fs.readFileSync(path.join(ROOT, 'assets/app-icon-192.png'));
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect([buf.readUInt32BE(16), buf.readUInt32BE(20)]).toEqual([192, 192]);
    expect(buf.length).toBeLessThan(40 * 1024);
  });
});

describe('WordPlate', () => {
  const MUG = { word: 'mug', ipa: 'mʌɡ', translation: 'кружка', lang: 'en' };

  test('language line, word in the accent colour and the translation', async () => {
    const tree = await render(<WordPlate word={MUG} size="md" />);
    expect(texts(tree)).toEqual(['🇬🇧', 'English', 'mug', 'кружка']);
    const word = tree.root.findAllByType(Text).find((n) => n.props.children === 'mug');
    expect(StyleSheet.flatten(word.props.style).color).toBe(PLATE.accent);
    // картинка, а не інтерфейс: Dynamic Type не роздуває табличку
    for (const t of tree.root.findAllByType(Text)) expect(t.props.allowFontScaling).toBe(false);
    expect(tree.root.findByProps({ testID: 'word-plate' }).props.accessibilityLabel).toBe('English, mug, кружка');
    await act(async () => tree.unmount());
  });

  test('the large plate shows /IPA/ by default; the others only when asked', async () => {
    const lg = await render(<WordPlate word={MUG} size="lg" />);
    expect(texts(lg)).toContain('/mʌɡ/');
    const sm = await render(<WordPlate word={MUG} size="sm" />);
    expect(texts(sm)).not.toContain('/mʌɡ/');
    const md = await render(<WordPlate word={MUG} size="md" ipa />);
    expect(texts(md)).toContain('/mʌɡ/');
    for (const tr of [lg, sm, md]) await act(async () => tr.unmount());
  });

  test('a long word gets a smaller size, never below the minimum; tilt rotates the plate', async () => {
    const size = async (w) => {
      const tree = await render(<WordPlate word={{ ...MUG, word: w }} size="lg" tilt={-2} />);
      const t = tree.root.findAllByType(Text).find((n) => n.props.children === w);
      const fontSize = StyleSheet.flatten(t.props.style).fontSize;
      const plate = StyleSheet.flatten(tree.root.findByProps({ testID: 'word-plate' }).props.style);
      await act(async () => tree.unmount());
      return [fontSize, plate.transform];
    };
    const [short, tilt] = await size('mug');
    const [long] = await size('Geschwindigkeitsbegrenzung');
    expect(short).toBe(40);
    expect(long).toBeLessThan(40);
    expect(long).toBeGreaterThanOrEqual(14);
    // довге німецьке слово вміщується цілим (табличка lg: 260 − 2 × 26)
    expect(long * textEm('Geschwindigkeitsbegrenzung')).toBeLessThanOrEqual(208);
    expect(tilt).toEqual([{ rotate: '-2deg' }]);
  });

  test('the same fixed colours in the dark theme — the plate lives on a photo', async () => {
    const light = await render(<WordPlate word={MUG} />);
    const dark = await render(<WordPlate word={MUG} />, THEMES.dark);
    const bg = (tr) => StyleSheet.flatten(tr.root.findByProps({ testID: 'word-plate' }).props.style).backgroundColor;
    expect(bg(light)).toBe('#FFFFFF');
    expect(bg(dark)).toBe('#FFFFFF');
    for (const tr of [light, dark]) await act(async () => tr.unmount());
  });
});

describe('icons', () => {
  const NEW = ['IcBolt', 'IcLock', 'IcSparkle', 'IcWarn', 'IcCopy', 'IcDownload', 'IcMore', 'IcPhoto', 'IcEye', 'IcRoom'];

  test.each(NEW)('%s follows the set: 24 grid, round stroke, no fill', async (name) => {
    const Icon = icons[name];
    expect(typeof Icon).toBe('function');
    const tree = await render(<Icon size={24} color="#123456" />);
    const paths = tree.root.findAllByType(Path);
    expect(paths.length).toBeGreaterThan(0);
    for (const p of paths) expect(p.props).toMatchObject({ fill: 'none', stroke: '#123456', strokeLinecap: 'round' });
    await act(async () => tree.unmount());
  });

  test('the torch icon is crossed out when off', async () => {
    const on = await render(<icons.IcBolt />);
    const off = await render(<icons.IcBolt off />);
    expect(off.root.findAllByType(Path).length).toBe(on.root.findAllByType(Path).length + 1);
    for (const tr of [on, off]) await act(async () => tr.unmount());
  });
});

test('kill switches: everything on, Pro gets 3 or 5 words a day', () => {
  expect(flags).toMatchObject({
    CAM_BLUR: true,
    WIDGET_THUMBS: true,
    WIDGET_REVEAL: true,
    WIDGET_MARKDOWN: true,
    PALETTES_ENABLED: true,
    PRO_WOD_OPTIONS: [3, 5],
  });
});
