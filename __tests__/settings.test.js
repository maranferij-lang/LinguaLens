// Параметри кажуть правду: «моя мова» — лише про переклади, мова інтерфейсу
// — та, що в телефоні, а помилка стирання — про справжню причину.
import { Alert, Linking } from 'react-native';
import { act, create } from 'react-test-renderer';
import SettingsScreen from '../src/SettingsScreen';
import { STRINGS, makeT } from '../src/i18n';
import { formatDate } from '../src/locale';

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
        uiLang="uk"
        t={makeT(props.uiLang || 'uk')}
        {...props}
      />
    );
  });
  return tree;
}

const hintOf = (tree, t) => tree.root.findAll((n) => n.props.label === t('myLang') && 'hint' in n.props)[0].props.hint;

const strings = (tree) => tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);

// «Моя мова» більше не обіцяє інтерфейс: вона лише для перекладів. Мова
// інтерфейсу — окремий рядок із мовою телефону; тап веде в Параметри iOS,
// де мову можна змінити саме для LinguaLens.
describe('languages', () => {
  const uk = makeT('uk');
  const uiRow = (tree, label) =>
    tree.root.findAll((n) => n.props.accessibilityRole === 'button' && n.props.accessibilityLabel === label)[0];

  test('“my language” is about translations only, whatever it is', async () => {
    for (const nativeLang of ['uk', 'fr', 'pl']) {
      const tree = await render({ nativeLang, uiLang: 'uk' });
      expect(hintOf(tree, uk)).toBe(uk('myLangHint'));
      await act(async () => tree.unmount());
    }
    // колишня підказка «застосунок лишається англійським» більше не потрібна
    for (const dict of Object.values(STRINGS)) expect(dict.myLangHintNoUi).toBeUndefined();
  });

  test('the interface row names the phone language and opens the app’s page in Settings', async () => {
    const open = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    try {
      const tree = await render({ nativeLang: 'pl', uiLang: 'uk' });
      expect(strings(tree)).toEqual(expect.arrayContaining([uk('uiLangTitle'), 'Українська', uk('uiLangHint')]));
      const row = uiRow(tree, `${uk('uiLangTitle')}: Українська`);
      expect(row.props.accessibilityHint).toBe(uk('uiLangHint'));
      await act(async () => row.props.onPress());
      expect(open).toHaveBeenCalledTimes(1);
      await act(async () => tree.unmount());
    } finally {
      open.mockRestore();
    }
  });

  test('a phone language without a UI translation shows English — the language the app speaks', async () => {
    const en = makeT('en');
    const tree = await render({ nativeLang: 'fr', uiLang: 'en', t: en });
    expect(uiRow(tree, `${en('uiLangTitle')}: English`)).toBeDefined();
    await act(async () => tree.unmount());
  });

  test('the Pro renewal date is in the interface language, not in “my language”', async () => {
    // дата в майбутньому: минулу рядок не показує (див. тест нижче)
    const until = Date.now() + 40 * 86400000;
    const opts = { day: 'numeric', month: 'long', year: 'numeric' };
    const tree = await render({ nativeLang: 'de', uiLang: 'uk', sub: { pro: true, until } });
    const hint = tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.includes(uk('managePro')))[0];
    expect(hint.props.children[0]).toBe(uk('proUntil', { d: formatDate(until, 'uk', opts) }) + ' · ');
    expect(formatDate(until, 'uk', opts)).not.toBe(formatDate(until, 'de', opts));
    await act(async () => tree.unmount());
  });
});

describe('erase all my data', () => {
  let alert;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  async function eraseWith(error) {
    const t = makeT('en');
    const tree = await render({ uiLang: 'en', onEraseEverything: jest.fn(async () => Promise.reject(error)) });
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
    const tree = await render({ uiLang: 'en', analyticsAvailable: true, analyticsOn: true, onToggleAnalytics });
    const sw = statSwitch(tree);
    expect(sw.props.value).toBe(true);
    await act(async () => sw.props.onValueChange(false));
    expect(onToggleAnalytics).toHaveBeenCalledWith(false);
    expect(tree.root.findAll((n) => n.props.children === t('analyticsHint')).length).toBeGreaterThan(0);
    await act(async () => tree.unmount());
  });

  test('absent in a build without analytics', async () => {
    const tree = await render({ uiLang: 'en' });
    expect(statSwitch(tree)).toBeUndefined();
    await act(async () => tree.unmount());
  });
});

// Пільговий період Apple (картка не пройшла): Pro ще діє, а дата закінчення
// вже минула — «до {минулої дати}» було б неправдою, тож рядок без дати
test('Pro whose end date has already passed (billing grace) shows no “until” date', async () => {
  const t = makeT('en');
  const past = Date.now() - 2 * 86400000;
  const tree = await render({ uiLang: 'en', sub: { pro: true, until: past, willRenew: true } });
  const hint = tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.includes(t('managePro')))[0];
  expect(hint.props.children[0]).toBe('');
  const strings = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
  expect(strings.some((x) => x.startsWith(t('proUntil', { d: '' })))).toBe(false);
  expect(strings).toContain(t('proActive'));
  await act(async () => tree.unmount());
});

// Pro «назавжди»: без дати продовження й без «керувати підпискою»
test('lifetime Pro: «Pro forever», purchases and support, no renewal date', async () => {
  const t = makeT('en');
  const onManageSub = jest.fn();
  const tree = await render({ uiLang: 'en', sub: { pro: true, lifetime: true, until: null }, onManageSub });
  const strings = tree.root.findAll((n) => typeof n.props.children === 'string').map((n) => n.props.children);
  expect(strings).toContain(t('proLifetime'));
  expect(strings).not.toContain(t('restore'));
  const hint = tree.root.findAll((n) => Array.isArray(n.props.children) && n.props.children.includes(t('managePurchases')));
  expect(hint.length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});
