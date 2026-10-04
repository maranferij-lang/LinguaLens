// Параметри → «Розробка» (onboarding.md §10.3). У dev-збірці — одразу, без
// семи дотиків: «Почати з нуля» (з підтвердженням), «Онбординг як новий
// (без стирання)», перемикач «Онбординг на кожному старті», адреса сервера.
// Реліз (секції немає зовсім) — devRelease.test.js.
import { Alert, Switch, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import SettingsScreen from '../src/SettingsScreen';
import { RESET_TITLE } from '../src/settings/DevSection';
import { makeT } from '../src/i18n';

const uk = makeT('uk');

async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <SettingsScreen targetLang="en" nativeLang="uk" themeKey="light" themeMode="system" wordsCount={0} wodEnabled wodHour={10} sub={{ pro: false }} uiLang="uk" t={uk} {...props} />
    );
  });
  return tree;
}
const strings = (tree) =>
  tree.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string').join(''))
    .filter(Boolean);
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.props.onPress === 'function')[0];
const footer = (tree) => byId(tree, 'settings-footer');

describe('development build', () => {
  test('visible straight away with all three controls and the server row', async () => {
    const extra = { devOnboarding: jest.fn(), devOnbAlways: false, onDevOnbAlways: jest.fn() };
    const tree = await render({ onDevReset: jest.fn(), extra });
    const all = strings(tree);
    expect(all).toEqual(
      expect.arrayContaining(['Розробка · лише __DEV__', 'Почати з нуля', 'Онбординг як новий (без стирання)', 'Онбординг на кожному старті', uk('checkConn')])
    );
    // секція — над футером
    expect(all.indexOf('Почати з нуля')).toBeLessThan(all.indexOf('LinguaLens'));
    await act(async () => tree.unmount());
  });

  test('“Start from scratch” asks first; only “Erase” erases', async () => {
    const onDevReset = jest.fn();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const tree = await render({ onDevReset });
    await act(async () => byId(tree, 'dev-reset').props.onPress());
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, , buttons] = alert.mock.calls[0];
    expect(title).toBe(RESET_TITLE);
    expect(buttons.map((b) => b.text)).toEqual(['Скасувати', 'Стерти']);
    expect(buttons[0].style).toBe('cancel');
    expect(onDevReset).not.toHaveBeenCalled();
    await act(async () => buttons[1].onPress());
    expect(onDevReset).toHaveBeenCalledTimes(1);
    alert.mockRestore();
    await act(async () => tree.unmount());
  });

  test('“Onboarding as new” and the every-launch switch call App', async () => {
    const extra = { devOnboarding: jest.fn(), devOnbAlways: false, onDevOnbAlways: jest.fn() };
    const tree = await render({ onDevReset: jest.fn(), extra });
    await act(async () => byId(tree, 'dev-onboarding').props.onPress());
    expect(extra.devOnboarding).toHaveBeenCalledTimes(1);
    const sw = tree.root.findAllByType(Switch).find((s) => s.props.testID === 'dev-onb-always');
    expect(sw.props.value).toBe(false);
    await act(async () => sw.props.onValueChange(true));
    expect(extra.onDevOnbAlways).toHaveBeenCalledWith(true);
    await act(async () => tree.unmount());
  });
});
