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

// PNG бренду з майстрів assets/brand/*.svg (tools/export-brand.mjs). Іконку з
// альфа-каналом App Store відхиляє ще на завантаженні збірки, а з прозорим
// кутом сплеш чи адаптивна іконка Android показують дірку — тому перевіряємо
// самі файли, а не лише те, що вони є.
describe('brand PNGs', () => {
  const { decode } = require('../tools/png');
  const file = (f) => path.join(ROOT, 'assets', f);
  // IHDR і список чанків без розпакування
  const header = (f) => {
    const buf = fs.readFileSync(file(f));
    const chunks = [];
    for (let off = 8; off < buf.length; off += 12 + buf.readUInt32BE(off)) chunks.push(buf.toString('latin1', off + 4, off + 8));
    return { size: [buf.readUInt32BE(16), buf.readUInt32BE(20)], depth: buf[24], color: buf[25], chunks };
  };
  const alpha = (img, x, y) => img.data[(y * img.width + x) * 4 + 3];

  test.each(['icon.png', 'icon-eye.png'])('%s — 1024 × 1024 RGB without alpha, as the App Store wants', (f) => {
    const h = header(f);
    expect(h.size).toEqual([1024, 1024]);
    // тип кольору 2 — RGB; 6 (RGBA) і прозорість через tRNS заборонені
    expect([h.depth, h.color]).toEqual([8, 2]);
    expect(h.chunks).not.toContain('tRNS');
  });

  test('the main icon and the alternate icon are different pictures', () => {
    expect(fs.readFileSync(file('icon.png')).equals(fs.readFileSync(file('icon-eye.png')))).toBe(false);
  });

  test.each([
    ['splash-icon.png', 1024],
    ['favicon.png', 48],
  ])('%s is the rounded icon on transparency', (f, size) => {
    const img = decode(file(f));
    expect([img.width, img.height, img.channels]).toEqual([size, size, 4]);
    for (const [x, y] of [[0, 0], [size - 1, 0], [0, size - 1], [size - 1, size - 1]]) expect(alpha(img, x, y)).toBe(0);
    expect(alpha(img, size / 2, size / 2)).toBe(255);
    // край посередині сторони — уже іконка, не прозорість
    expect(alpha(img, size / 2, 0)).toBe(255);
  });

  test('adaptive icon: an opaque background and Lingo on transparency, the head inside the 66 dp safe zone', () => {
    const bg = decode(file('android-icon-background.png'));
    expect([bg.width, bg.height, bg.channels]).toEqual([512, 512, 3]);
    const fg = decode(file('android-icon-foreground.png'));
    expect([fg.width, fg.height, fg.channels]).toEqual([512, 512, 4]);
    expect(alpha(fg, 0, 0)).toBe(0);
    expect(alpha(fg, 256, 256)).toBe(255);
    // шар 108 dp; маска лаунчера будь-якої форми не ріже коло 66 dp. Над
    // центром — лише голова з очима, і вся вона в цьому колі (плечі внизу
    // свідомо йдуть до краю: маска їх обрізає, як в іконці iOS).
    let far = 0;
    for (let y = 0; y < 256; y++) {
      for (let x = 0; x < 512; x++) {
        if (alpha(fg, x, y) > 8) far = Math.max(far, (Math.hypot(x + 0.5 - 256, y + 0.5 - 256) / 512) * 108);
      }
    }
    expect(far).toBeGreaterThan(20);
    expect(far).toBeLessThan(33);
    // плечі доходять до нижнього краю — паралакс не відкриє зрізу
    expect(alpha(fg, 256, 511)).toBe(255);
  });

  test('app.json uses the brand files; the adaptive background colour is the icon background', () => {
    const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8')).expo;
    expect(app.icon).toBe('./assets/icon.png');
    expect(app.web.favicon).toBe('./assets/favicon.png');
    const splash = app.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.image).toBe('./assets/splash-icon.png');
    const ai = app.android.adaptiveIcon;
    expect(ai).toMatchObject({
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    });
    // колір — середній у видимих 72 dp шару тла (±6 на канал)
    const bg = decode(file('android-icon-background.png'));
    const sum = [0, 0, 0];
    let n = 0;
    for (let y = 85; y < 427; y++) {
      for (let x = 85; x < 427; x++) {
        for (let c = 0; c < 3; c++) sum[c] += bg.data[(y * 512 + x) * 3 + c];
        n++;
      }
    }
    const want = sum.map((v) => v / n);
    const got = [1, 3, 5].map((i) => parseInt(ai.backgroundColor.slice(i, i + 2), 16));
    got.forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThan(6));
  });

  test('themed (monochrome) icon: one colour, eyes and mouth see-through, pupils solid', () => {
    const img = decode(file('android-icon-monochrome.png'));
    expect([img.width, img.height, img.channels]).toEqual([512, 512, 4]);
    // viewBox -288 -284 1600 1600 → 512 px: x = (X + 288) × 0,32
    const at = (X, Y) => alpha(img, Math.round((X + 288) * 0.32), Math.round((Y + 284) * 0.32));
    expect(at(512, 300)).toBe(255); // голова
    expect(at(336, 428)).toBe(255); // зіниця
    expect(at(234, 422)).toBe(0); // очне яблуко, поза зіницею
    expect(at(790, 422)).toBe(0);
    expect(at(512, 720)).toBe(0); // рот
    expect(at(512, 1000)).toBe(0); // під підборіддям — порожньо (без плечей)
    const colours = new Set();
    for (let i = 0; i < img.width * img.height; i++) {
      if (img.data[i * 4 + 3] > 0) colours.add(img.data.subarray(i * 4, i * 4 + 3).join());
    }
    expect([...colours]).toEqual(['0,0,0']);
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
