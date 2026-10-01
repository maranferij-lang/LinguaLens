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
