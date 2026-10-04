// Параметри кажуть правду: підказка «моєї мови» — про те, що реально
// перекладено, а помилка стирання — про справжню причину.
import { Alert } from 'react-native';
import { act, create } from 'react-test-renderer';
import SettingsScreen from '../src/SettingsScreen';
import { makeT } from '../src/i18n';

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(
      <SettingsScreen
        targetLang="en"
        nativeLang="uk"
        themeKey="light"
        themeMode="system"
        wordsCount={0}
        wodEnabled={false}
        wodHour={10}
        sub={{ pro: false }}
        t={makeT(props.nativeLang || 'uk')}
        {...props}
      />
    );
  });
  return tree;
}

const hintOf = (tree, t) => tree.root.findAll((n) => n.props.label === t('myLang') && 'hint' in n.props)[0].props.hint;

test('the app-language promise only for languages the UI really speaks', async () => {
  let tree = await render({ nativeLang: 'uk' });
  expect(hintOf(tree, makeT('uk'))).toBe(makeT('uk')('myLangHint'));
  await act(async () => tree.unmount());

  tree = await render({ nativeLang: 'fr' });
  expect(hintOf(tree, makeT('fr'))).toBe(makeT('en')('myLangHintNoUi'));
  await act(async () => tree.unmount());
});

describe('erase all my data', () => {
  let alert;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  async function eraseWith(error) {
    const t = makeT('en');
    const tree = await render({ nativeLang: 'en', onEraseEverything: jest.fn(async () => Promise.reject(error)) });
    const label = tree.root.findAll((n) => n.props.children === t('eraseAll'))[0];
    let btn = label;
    while (typeof btn.props.onPress !== 'function') btn = btn.parent;
    await act(async () => btn.props.onPress());
    const confirm = alert.mock.calls[0][2].find((b) => b.style === 'destructive');
    await act(async () => confirm.onPress());
    await act(async () => tree.unmount());
    return alert.mock.calls[1][0];
  }

  test('“check your connection” only when there is no connection', async () => {
    const t = makeT('en');
    expect(await eraseWith(Object.assign(new Error('OFFLINE'), { code: 'OFFLINE' }))).toBe(t('eraseFail'));
  });

  test('a server error says so', async () => {
    const t = makeT('en');
    expect(await eraseWith(Object.assign(new Error('HTTP_500'), { code: 'HTTP_500', status: 500 }))).toBe(t('eraseServerFail'));
  });
});

// «Анонімна статистика»: перемикач є, лише коли збірка має ключ PostHog,
// і VoiceOver читає його назву.
describe('anonymous statistics switch', () => {
  const t = makeT('en');
  const statSwitch = (tree) => tree.root.findAll((n) => n.props.accessibilityLabel === t('analyticsTitle') && 'onValueChange' in n.props)[0];

  test('shown with a key, reflects the setting and reports a change', async () => {
    const onToggleAnalytics = jest.fn();
    const tree = await render({ nativeLang: 'en', analyticsAvailable: true, analyticsOn: true, onToggleAnalytics });
    const sw = statSwitch(tree);
    expect(sw.props.value).toBe(true);
    await act(async () => sw.props.onValueChange(false));
    expect(onToggleAnalytics).toHaveBeenCalledWith(false);
    expect(tree.root.findAll((n) => n.props.children === t('analyticsHint')).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('absent in a build without analytics', async () => {
    const tree = await render({ nativeLang: 'en' });
    expect(statSwitch(tree)).toBeUndefined();
    await act(async () => tree.unmount());
  });
});

// Pro «назавжди»: без дати продовження й без «керувати підпискою»
test('lifetime Pro: «Pro forever», purchases and support, no renewal date', async () => {
  const t = makeT('en');
  const onManageSub = jest.fn();
  const tree = await render({ nativeLang: 'en', sub: { pro: true, lifetime: true, until: null }, onManageSub });
  const strings = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
  expect(strings).toContain(t('proLifetime'));
  expect(strings).not.toContain(t('restore'));
  const hint = tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.includes(t('managePurchases')));
  expect(hint.length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});
