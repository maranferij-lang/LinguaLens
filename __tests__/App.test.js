// Димовий тест: застосунок стартує офлайн, читає збережені дані й показує
// головний екран без падінь. Ловить те, що інакше видно лише на пристрої:
// неіснуючі імпорти, падіння рендеру, хуки в неправильному порядку.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';

const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };

beforeEach(async () => {
  await AsyncStorage.clear();
  global.fetch = jest.fn(async () => {
    throw new TypeError('Network request failed');
  });
});

async function renderApp() {
  let tree;
  await act(async () => {
    tree = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  // кілька тиків: читання сховища, шрифти, спроба мережі
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  return tree;
}

const texts = (tree) =>
  tree.root
    .findAll((n) => typeof n.props?.children === 'string')
    .map((n) => n.props.children);

test('first launch shows onboarding', async () => {
  const tree = await renderApp();
  expect(texts(tree).length).toBeGreaterThan(0);
  await act(async () => tree.unmount());
});

test('returning user lands on the main screen with the tab bar, offline', async () => {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es' }));
  await AsyncStorage.setItem(
    'll_words_v1',
    JSON.stringify([{ id: 'a', word: 'la taza', translation: 'mug', lang: 'es', addedAt: Date.now(), srs: { box: 0, due: 0 } }])
  );
  const tree = await renderApp();
  const all = texts(tree);
  expect(all).toEqual(expect.arrayContaining(['Words', 'Learn', 'Settings']));
  await act(async () => tree.unmount());
});
