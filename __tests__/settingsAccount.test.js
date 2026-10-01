// Картка акаунта в Параметрах: без входу — офіційна кнопка Apple (і лише там,
// де вхід можливий), після входу — стан синхронізації, «Синхронізувати зараз»
// і вихід із підтвердженням. Помилки — одним рядком, скасування — тиша.
import { ActivityIndicator, Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import SettingsScreen, { syncedLabel } from '../src/SettingsScreen';
import { makeT } from '../src/i18n';
import { R, THEMES, ThemeProvider } from '../src/theme';

const t = makeT('en');

async function render(props, theme = THEMES.light) {
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={theme}>
        <SettingsScreen
          targetLang="es"
          nativeLang="en"
          themeKey={theme.key}
          themeMode="system"
          wordsCount={3}
          wodEnabled={false}
          wodHour={10}
          sub={{ pro: false }}
          account={{ available: true, signedIn: false }}
          sync={{ status: 'idle', at: 0, error: null }}
          onSignIn={jest.fn(async () => null)}
          onSignOut={jest.fn(async () => {})}
          onSyncNow={jest.fn()}
          t={t}
          {...props}
        />
      </ThemeProvider>
    );
  });
  return tree;
}

const appleButton = (tree) => tree.root.findAll((n) => n.type === 'AppleAuthenticationButton')[0] || null;
const hasText = (tree, s) => tree.root.findAll((n) => n.props.children === s).length > 0;
function press(tree, label) {
  let n = tree.root.findAll((x) => x.props.children === label || x.props.accessibilityLabel === label)[0];
  while (typeof n.props.onPress !== 'function') n = n.parent;
  return act(async () => n.props.onPress());
}

let alert;
beforeEach(() => {
  alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
});
afterEach(() => alert.mockRestore());

test('signed out: the value in one sentence and the official Apple button', async () => {
  const tree = await render();
  expect(hasText(tree, t('accountLabel'))).toBe(true);
  expect(hasText(tree, t('accountText'))).toBe(true);
  const btn = appleButton(tree);
  expect(btn.props).toMatchObject({ buttonType: 0, buttonStyle: 2, cornerRadius: R.lg }); // SIGN_IN, BLACK
  expect(btn.props.style).toMatchObject({ width: '100%', height: 50 });
  await act(async () => tree.unmount());
});

test('the dark theme gets the white Apple button', async () => {
  const tree = await render({}, THEMES.dark);
  expect(appleButton(tree).props.buttonStyle).toBe(0); // WHITE
  await act(async () => tree.unmount());
});

test('no Apple sign-in on this device (web, Android): no account card at all', async () => {
  const tree = await render({ account: { available: false, signedIn: false } });
  expect(appleButton(tree)).toBeNull();
  expect(hasText(tree, t('accountLabel'))).toBe(false);
  await act(async () => tree.unmount());
});

test('a failed sign-in shows one calm line; a cancelled one shows nothing', async () => {
  const onSignIn = jest.fn(async () => Promise.reject(Object.assign(new Error('x'), { code: 'APPLE_INVALID' })));
  const tree = await render({ onSignIn });
  await act(async () => appleButton(tree).props.onPress());
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(hasText(tree, t('accountErrInvalid'))).toBe(true);
  expect(alert).not.toHaveBeenCalled();

  onSignIn.mockImplementationOnce(async () => null); // вікно Apple закрили
  await act(async () => appleButton(tree).props.onPress());
  expect(hasText(tree, t('accountErrInvalid'))).toBe(false);
  await act(async () => tree.unmount());
});

test('while signing in the button gives way to a spinner of the same size', async () => {
  let finish;
  const onSignIn = jest.fn(() => new Promise((r) => (finish = r)));
  const tree = await render({ onSignIn });
  await act(async () => {
    appleButton(tree).props.onPress();
  });
  expect(appleButton(tree)).toBeNull();
  expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('accountSigningIn')).length).toBeGreaterThan(0);
  await act(async () => finish(null));
  expect(appleButton(tree)).not.toBeNull();
  await act(async () => tree.unmount());
});

describe('signed in', () => {
  const at = Date.now() - 5 * 60000;

  test('shows the account, when it last synced, and syncs on demand', async () => {
    const onSyncNow = jest.fn();
    const tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'idle', at, error: null }, onSyncNow });
    expect(appleButton(tree)).toBeNull();
    expect(hasText(tree, t('accountSignedIn'))).toBe(true);
    expect(hasText(tree, t('syncedMinutes', { n: 5 }))).toBe(true);
    await press(tree, t('syncNow'));
    expect(onSyncNow).toHaveBeenCalled();
    await act(async () => tree.unmount());
  });

  test('a running sync shows a spinner; a failed one says why in one line', async () => {
    let tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'syncing', at, error: null } });
    expect(hasText(tree, t('syncing'))).toBe(true);
    const btn = tree.root.findAll((n) => n.props.accessibilityLabel === t('syncNow') && n.props.accessibilityState)[0];
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(tree.root.findAllByType(ActivityIndicator).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());

    tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'error', at, error: 'OFFLINE' } });
    expect(hasText(tree, t('syncErrOffline'))).toBe(true);
    await act(async () => tree.unmount());
  });

  test('stays visible even where Apple sign-in is unavailable', async () => {
    const tree = await render({ account: { available: false, signedIn: true }, sync: { status: 'idle', at, error: null } });
    expect(hasText(tree, t('accountSignedIn'))).toBe(true);
    await act(async () => tree.unmount());
  });

  test('sign out asks first, and asks again if something has not synced', async () => {
    const onSignOut = jest
      .fn()
      .mockImplementationOnce(async () => Promise.reject(Object.assign(new Error('UNSYNCED'), { code: 'UNSYNCED' })))
      .mockImplementationOnce(async () => {});
    const tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'idle', at, error: null }, onSignOut });
    await press(tree, t('signOut'));
    expect(alert.mock.calls[0].slice(0, 2)).toEqual([t('signOutTitle'), t('signOutMsg')]);
    expect(onSignOut).not.toHaveBeenCalled();

    await act(async () => alert.mock.calls[0][2].find((b) => b.style === 'destructive').onPress());
    expect(onSignOut).toHaveBeenLastCalledWith({ force: false });
    expect(alert.mock.calls[1].slice(0, 2)).toEqual([t('signOutUnsyncedTitle'), t('signOutUnsyncedMsg')]);

    await act(async () => alert.mock.calls[1][2].find((b) => b.style === 'destructive').onPress());
    expect(onSignOut).toHaveBeenLastCalledWith({ force: true });
    await act(async () => tree.unmount());
  });

  test('with Pro, the sign-out question says Pro stays with the account too', async () => {
    const tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'idle', at, error: null }, sub: { pro: true } });
    await press(tree, t('signOut'));
    expect(alert.mock.calls[0][1]).toBe(t('signOutMsgPro'));
    await act(async () => tree.unmount());
  });

  test('deleting all words and erasing say it reaches every iPhone', async () => {
    const tree = await render({ account: { available: true, signedIn: true }, sync: { status: 'idle', at, error: null } });
    expect(hasText(tree, t('eraseHintAccount'))).toBe(true);
    await press(tree, t('clearDict'));
    expect(alert.mock.calls[0][1]).toBe(t('clearMsgSynced', { n: 3 }));
    await press(tree, t('eraseAll'));
    expect(alert.mock.calls[1][1]).toBe(t('eraseMsgAccount'));
    await act(async () => tree.unmount());
  });
});

test('relative “last synced” label', () => {
  const now = new Date(2026, 9, 8, 12).getTime();
  const uk = makeT('uk');
  expect(syncedLabel(0, now, t, 'en')).toBe('Not synced yet');
  expect(syncedLabel(now - 20000, now, t, 'en')).toBe('Synced just now');
  expect(syncedLabel(now - 60000, now, t, 'en')).toBe('Synced 1 minute ago');
  expect(syncedLabel(now - 3 * 3600000, now, uk, 'uk')).toBe('Синхронізовано 3 години тому');
  expect(syncedLabel(now - 21 * 60000, now, uk, 'uk')).toBe('Синхронізовано 21 хвилину тому');
  expect(syncedLabel(now - 3 * 86400000, now, t, 'en')).toBe('Synced on October 5');
  // годинник перевели назад — не «через 5 хвилин», а «щойно»
  expect(syncedLabel(now + 300000, now, t, 'en')).toBe('Synced just now');
});
