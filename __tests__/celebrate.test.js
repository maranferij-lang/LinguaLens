// Свято першого слова (onboarding.md §5.11): наліпка, яку людина щойно
// зробила, табличка «слово — переклад» (тап — вимова), «Перше слово —
// твоє!», пігулка «Серія почалась: 1 день» з вогником, Lingo, 12 шматочків
// конфеті лише з рухом. VoiceOver одразу чує все одним рядком. «Далі» —
// через 900 мс (перевіряє onboarding.test.js у потоці).
import { AccessibilityInfo } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Speech from 'expo-speech';
import { setChosenVariants } from '../src/langVariants';
import Celebrate, { CELEBRATE_NEXT_MS, CONFETTI } from '../src/Celebrate';
import { makeT } from '../src/i18n';

jest.mock('expo-speech', () => ({ speak: jest.fn(), stop: jest.fn(async () => {}) }));

const t = makeT('en');
const uk = makeT('uk');
const WORD = { id: 'w1', word: 'la taza', translation: 'mug', ipa: '/la ˈta.θa/', lang: 'es', photo: 'stickers/taza.jpg', shape: null, outline: null, box: null };

beforeEach(() => {
  jest.clearAllMocks();
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});

async function render(props = {}) {
  let tree;
  await act(async () => {
    tree = create(<Celebrate word={WORD} t={t} {...props} />);
  });
  await act(async () => {});
  return tree;
}
const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const host = (tree, id) => tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === id);

test('the person’s own sticker, the word with its translation, the title and day one of the streak', async () => {
  const tree = await render();
  expect(tree.root.findAll((n) => n.props.uri && n.props.pop !== undefined)[0].props.uri).toMatch(/stickers\/taza\.jpg$/);
  expect(texts(tree)).toEqual(expect.arrayContaining(['la taza', 'mug', t('obCelebrateTitle'), t('obCelebrateStreak')]));
  expect(host(tree, 'flame').length).toBeGreaterThan(0);
  expect(CELEBRATE_NEXT_MS).toBe(900);
  await act(async () => tree.unmount());
});

test('a tap on the plate says the word in its language, in the chosen variant', async () => {
  const tree = await render();
  const plate = tree.root.findAll((n) => n.props.testID === 'celebrate-plate' && typeof n.props.onPress === 'function')[0];
  // телефон у тестах — регіон США: іспанська за замовчуванням латиноамериканська
  await act(async () => plate.props.onPress());
  expect(Speech.speak).toHaveBeenLastCalledWith('la taza', expect.objectContaining({ language: 'es-MX' }));
  // людина обрала іспанську Іспанії — голос es-ES
  setChosenVariants({ es: 'es' });
  await act(async () => plate.props.onPress());
  expect(Speech.speak).toHaveBeenLastCalledWith('la taza', expect.objectContaining({ language: 'es-ES' }));
  setChosenVariants({});
  await act(async () => tree.unmount());
});

test('VoiceOver hears the title, the word and the streak in one header', async () => {
  const tree = await render({ t: uk });
  const header = tree.root.find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'header');
  expect(header.props.accessibilityLabel).toBe(`${uk('obCelebrateTitle')}. la taza, mug. ${uk('obCelebrateStreak')}`);
  await act(async () => tree.unmount());
});

test('confetti — twelve pieces, only with motion', async () => {
  const tree = await render();
  expect(CONFETTI).toBe(12);
  expect(host(tree, 'confetti')).toHaveLength(1);
  expect(host(tree, 'confetti')[0].children).toHaveLength(CONFETTI);
  await act(async () => tree.unmount());

  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
  const calm = await render();
  expect(host(calm, 'confetti')).toHaveLength(0);
  await act(async () => calm.unmount());
});

test('a word without a photo still celebrates with its plate', async () => {
  const tree = await render({ word: { ...WORD, photo: null } });
  expect(tree.root.findAll((n) => n.props.uri && n.props.pop !== undefined)).toHaveLength(0);
  expect(texts(tree)).toContain('la taza');
  await act(async () => tree.unmount());
});
