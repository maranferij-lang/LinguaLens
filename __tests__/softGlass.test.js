// Дизайн-система «Soft Glass» (редизайн 24.10.2026, DESIGN.md): системний
// шрифт з вагою, токени скла й плям у кожній темі, примітиви ui.js.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';

import { CAPS, F, THEMES, ThemeProvider, display, fw, type } from '../src/theme';
import { GlassBar, GlassSheet, Glass, ScreenBackground, Segmented, GradBtn, SecBtn } from '../src/ui';

const KEYS = Object.keys(THEMES);

describe('typography: system font + weight', () => {
  test('fw maps every F token to the system family with a weight; IPA and unknown names pass through', () => {
    expect(fw(F.light).fontWeight).toBe('300');
    expect(fw(F.reg).fontWeight).toBe('400');
    expect(fw(F.semi).fontWeight).toBe('500');
    expect(fw(F.bold).fontWeight).toBe('600');
    expect(fw(F.extra).fontWeight).toBe('600');
    expect(fw(F.reg).fontFamily).toBe(fw(F.extra).fontFamily);
    expect(fw(F.ipa)).toEqual({ fontFamily: F.ipa });
    expect(fw('Menlo')).toEqual({ fontFamily: 'Menlo' });
  });

  test('type() sets fontWeight from the token; display is light with tight tracking; CAPS is 11pt/500', () => {
    expect(type(16, F.semi)).toMatchObject({ fontSize: 16, fontWeight: '500' });
    expect(display(40)).toMatchObject({ fontSize: 40, fontWeight: '300' });
    expect(display(40).letterSpacing).toBeLessThan(0);
    expect(CAPS).toMatchObject({ fontSize: 11, fontWeight: '500', letterSpacing: 0.7, textTransform: 'uppercase' });
  });
});

describe('tokens', () => {
  test.each(KEYS)('%s has glass, hairline, soft, hero and blob tokens', (key) => {
    const { C } = THEMES[key];
    for (const tk of ['glass', 'glassStrong', 'glassBorder', 'hairline', 'soft', 'accentGlow', 'heroFrom', 'heroTo', 'blob1', 'blob2', 'blob3']) {
      expect([tk, C[tk]]).toEqual([tk, expect.stringMatching(/^rgba\(/)]);
    }
  });
});

describe('primitives render in every theme', () => {
  test.each(['light', 'dark', 'ocean-dark'])('%s', async (key) => {
    let tree;
    await act(async () => {
      tree = create(
        <ThemeProvider value={THEMES[key]}>
          <ScreenBackground testID="bg" />
          <Glass hero testID="g" />
          <GlassBar testID="bar" />
          <GlassSheet testID="sheet" />
          <GradBtn title="A" onPress={() => {}} />
          <SecBtn title="B" onPress={() => {}} />
          <Segmented options={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]} value="a" onChange={() => {}} />
        </ThemeProvider>
      );
    });
    const host = (id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id)[0];
    const bar = host('bar');
    expect(StyleSheet.flatten(bar.props.style).borderRadius).toBe(32);
    expect(StyleSheet.flatten(host('sheet').props.style).borderRadius).toBe(40);
    const tabs = tree.root.findAll((n) => n.props?.accessibilityRole === 'tab' && n.props.accessibilityState);
    expect(tabs.some((n) => n.props.accessibilityState.selected === true)).toBe(true);
    await act(async () => tree.unmount());
  });
});
