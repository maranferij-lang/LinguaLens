// Іконки без явного кольору беруть dim теми, що зараз у провайдері, а не
// світлої теми зі статичного імпорту. Із явним кольором — як і раніше.
import { act, create } from 'react-test-renderer';
import * as icons from '../src/icons';
import { THEMES, ThemeProvider } from '../src/theme';

const NAMES = Object.keys(icons).filter((k) => /^Ic[A-Z]/.test(k));

async function render(el, theme) {
  let tree;
  await act(async () => {
    tree = create(theme ? <ThemeProvider value={THEMES[theme]}>{el}</ThemeProvider> : el);
  });
  return tree;
}
// усі кольори штриха в дереві іконки
const strokes = (tree) => [...new Set(tree.root.findAll((n) => n.props && typeof n.props.stroke === 'string').map((n) => n.props.stroke))];

test('the whole set is covered (35 components + the IcGear alias)', () => {
  expect(NAMES.length).toBe(36);
  expect(icons.IcGear).toBe(icons.IcSliders);
});

describe.each(NAMES)('%s', (name) => {
  const Ic = icons[name];

  test('without a colour it follows the theme: dim of light, dark and a palette', async () => {
    for (const key of ['light', 'dark', 'ocean-dark', 'cocoa-light']) {
      expect([key, strokes(await render(<Ic />, key))]).toEqual([key, [THEMES[key].C.dim]]);
    }
  });

  test('an explicit colour wins; undefined and null fall back to the theme', async () => {
    expect(strokes(await render(<Ic color="#123456" />, 'dark'))).toEqual(['#123456']);
    expect(strokes(await render(<Ic color={undefined} />, 'dark'))).toEqual([THEMES.dark.C.dim]);
    expect(strokes(await render(<Ic color={null} />, 'dark'))).toEqual([THEMES.dark.C.dim]);
  });
});

test('outside any provider the light theme is used, as before', async () => {
  expect(strokes(await render(<icons.IcCheck />))).toEqual([THEMES.light.C.dim]);
});

test('size and the extra props keep working', async () => {
  const tree = await render(<icons.IcEye size={30} off color="#abcdef" />, 'light');
  const svg = tree.root.findAll((n) => n.props && n.props.width === 30 && n.props.height === 30)[0];
  expect(svg).toBeTruthy();
  const on = strokes(await render(<icons.IcEye size={30} color="#abcdef" />, 'light'));
  expect(strokes(tree)).toEqual(on);
});
