// Аркуш вибору мови бере затемнення з теми (C.scrim), а не власне
// rgba(0,0,0,0.4): у темних версіях шар густіший, і край аркуша не зливається з тлом.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import LangSheet from '../src/LangSheet';
import { THEMES, ThemeProvider } from '../src/theme';
import { makeT } from '../src/i18n';

const t = makeT('en');

async function render(themeKey) {
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={THEMES[themeKey]}>
        <LangSheet visible current="de" native="en" onPick={() => {}} onClose={() => {}} t={t} />
      </ThemeProvider>
    );
  });
  return tree;
}
const withColor = (tree, color) =>
  tree.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.backgroundColor === color);

describe('language sheet backdrop', () => {
  test.each(['light', 'dark', 'ocean-dark', 'berry-dark'])('%s: the backdrop colour is the theme scrim', async (key) => {
    const { C } = THEMES[key];
    const tree = await render(key);
    // одне вікно затемнення на весь екран, кольором C.scrim
    const hit = withColor(tree, C.scrim).filter((n) => StyleSheet.flatten(n.props.style).position === 'absolute');
    expect(hit.length).toBeGreaterThan(0);
    expect(C.scrim).toMatch(/^rgba\(0,0,0,/);
    tree.unmount();
  });

  test('dark themes dim more than light ones', () => {
    const a = (k) => Number(/,([0-9.]+)\)$/.exec(THEMES[k].C.scrim)[1]);
    expect(a('dark')).toBeGreaterThan(a('light'));
  });

  test('the old literal is gone from the sheet', async () => {
    const tree = await render('dark');
    expect(withColor(tree, 'rgba(0,0,0,0.4)')).toHaveLength(0);
    tree.unmount();
  });
});
