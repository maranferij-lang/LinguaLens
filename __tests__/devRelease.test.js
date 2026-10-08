// Реліз (IS_DEV === false): секції «Розробка» немає зовсім, «Почати з нуля»
// нічого не робить і його нема звідки викликати, «Онбординг на кожному
// старті», збережений колись у розробці, не діє. Сім дотиків по футеру, як і
// раніше, відкривають лише діагностику без жодної кнопки, що щось стирає.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import SettingsScreen from '../src/SettingsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import { makeT } from '../src/i18n';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), IS_DEV: false }));

jest.setTimeout(20000);

const uk = makeT('uk');
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

const strings = (tree) =>
  tree.root
    .findAllByType(Text)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string').join(''))
    .filter(Boolean);
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

test('Settings: no «Розробка»; seven taps open only the read-only diagnostics', async () => {
  let tree;
  await act(async () => {
    tree = create(
      <SettingsScreen
        targetLang="en"
        nativeLang="uk"
        themeKey="light"
        themeMode="system"
        wordsCount={0}
        wodEnabled
        wodHour={10}
        sub={{ pro: false }}
        uiLang="uk"
        t={uk}
        onDevReset={jest.fn()}
        extra={{ devOnboarding: jest.fn(), devOnbAlways: false, onDevOnbAlways: jest.fn() }}
      />
    );
  });
  expect(strings(tree)).not.toContain('Розробка · лише __DEV__');
  expect(strings(tree)).not.toContain('Діагностика');
  const footer = tree.root.findAll((n) => n.props.testID === 'settings-footer' && typeof n.props.onPress === 'function')[0];
  for (let i = 0; i < 7; i++) await act(async () => footer.props.onPress());
  const all = strings(tree);
  expect(all).toContain('Діагностика');
  expect(all).toContain(uk('checkConn'));
  for (const s of ['Почати з нуля', 'Онбординг як новий (без стирання)', 'Онбординг на кожному старті']) expect(all).not.toContain(s);
  await act(async () => tree.unmount());
});

test('App: no reset to call, “onboarding as new” does nothing, a stored every-launch switch is ignored', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_dev_onb_always', '1');
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  await settle();
  // онбординг на старті не показали — це реліз
  expect(one(tree, OnboardingScreen)).toBeNull();
  await act(async () => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
  await settle();
  const settings = one(tree, SettingsScreen);
  expect(settings.props.onDevReset).toBeUndefined();
  await act(async () => settings.props.extra.devOnboarding());
  await act(async () => settings.props.extra.onDevOnbAlways(false));
  await settle();
  expect(one(tree, OnboardingScreen)).toBeNull();
  expect(await AsyncStorage.getItem('ll_dev_onb_always')).toBe('1');
  await act(async () => tree.unmount());
});
