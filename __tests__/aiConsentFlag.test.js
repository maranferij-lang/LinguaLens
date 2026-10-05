// Аркуш згоди на AI (ConsentSheet) — за прапорцем AI_CONSENT_SHEET у
// src/flags.js. Рішення власника 5.10.2026: аркуш вимкнено, і «Спробувати» на
// демо онбордингу відкриває камеру одразу. Увімкнений прапорець повертає все
// як було: аркуш до камери, «Не зараз» лишає демо, «Дозволити» зберігає згоду
// й відкриває сканер. Сканер і App з прапорцем — у scanner.test.js.
// Демо відкриваємо з чернетки: так тест не залежить від порядку кроків.
import { AccessibilityInfo, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import OnboardingScreen from '../src/OnboardingScreen';
import ConsentSheet from '../src/ConsentSheet';
import { DRAFT_VERSION, localDayKey } from '../src/storage';
import { track } from '../src/analytics';
import { makeT } from '../src/i18n';

// getter читається під час дотику, тож кожен тест вмикає аркуш сам
jest.mock('../src/flags', () => {
  const flags = { ...jest.requireActual('../src/flags') };
  Object.defineProperty(flags, 'AI_CONSENT_SHEET', { get: () => global.__aiConsentSheet === true });
  return flags;
});
jest.mock('../src/wordOfDay', () => ({
  ...jest.requireActual('../src/wordOfDay'),
  requestPermission: jest.fn(async () => true),
  permissionStatus: jest.fn(async () => 'granted'),
}));
jest.mock('../src/analytics', () => ({
  flag: jest.fn(async () => 'control'),
  track: jest.fn(),
}));

const t = makeT('en');
const WORD = { date: localDayKey(), word: 'ledger', ipa: '/ˈledʒə/', translation: 'гросбух', topic: 'finance' };

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  global.__aiConsentSheet = false;
  AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
  AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
});

// Демо рухається нескінченно: розмонтовуємо й тоді, коли перевірка впала
const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  jest.useRealTimers();
});

const renderScanner = jest.fn(() => <Text>camera</Text>);

async function toDemo(props = {}) {
  let tree;
  await act(async () => {
    tree = create(
      <OnboardingScreen
        t={t}
        uiLang="en"
        onDone={jest.fn()}
        targetLang="en"
        nativeLang="uk"
        phoneNative="uk"
        prepareWod={jest.fn(async () => WORD)}
        canWow
        renderScanner={renderScanner}
        draft={{ v: DRAFT_VERSION, at: Date.now() - 60 * 1000, phase: 'demo', variant: 'control', target: 'en', native: 'uk' }}
        {...props}
      />
    );
  });
  await act(async () => {});
  mounted.push(tree);
  return tree;
}

const texts = (tree) => tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);
const sheets = (tree) => tree.root.findAllByType(ConsentSheet);
const events = (name) => track.mock.calls.filter(([e]) => e === name).map(([, p]) => p.action);
async function tryIt(tree) {
  const hit = tree.root.findAll(
    (n) => typeof n.props.onPress === 'function' && (n.props.title === t('obDemoTry') || n.props.accessibilityLabel === t('obDemoTry'))
  );
  await act(async () => {
    await hit.at(-1).props.onPress();
  });
}

test('the sheet is off by the owner’s decision (5.10.2026)', () => {
  expect(jest.requireActual('../src/flags').AI_CONSENT_SHEET).toBe(false);
});

test('sheet off: “Try it” opens the camera at once, without asking or saving consent', async () => {
  const onAiConsent = jest.fn();
  const tree = await toDemo({ aiConsent: false, onAiConsent });
  expect(texts(tree)).toContain(t('obDemoTitle'));
  expect(sheets(tree)).toHaveLength(0);
  await tryIt(tree);
  expect(renderScanner).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('camera');
  expect(onAiConsent).not.toHaveBeenCalled();
  expect(events('onb_demo')).toEqual(['view', 'try']);
});

test('sheet on: “Try it” without consent opens the AI consent over the demo; “Not now” stays', async () => {
  global.__aiConsentSheet = true;
  const onAiConsent = jest.fn();
  const tree = await toDemo({ aiConsent: false, onAiConsent });
  const consent = () => sheets(tree)[0];
  expect(consent().props.visible).toBe(false);
  await tryIt(tree);
  expect(consent().props.visible).toBe(true);
  await act(async () => consent().props.onClose());
  expect(consent().props.visible).toBe(false);
  expect(texts(tree)).toContain(t('obDemoTitle'));
  expect(renderScanner).not.toHaveBeenCalled();
  expect(events('onb_demo')).toEqual(['view', 'try', 'consent_later']);
  // «Дозволити» → згода й справжній сканер
  await tryIt(tree);
  await act(async () => consent().props.onAllow());
  expect(onAiConsent).toHaveBeenCalledTimes(1);
  expect(texts(tree)).toContain('camera');
});

test('sheet on, consent already given: “Try it” goes straight to the camera', async () => {
  global.__aiConsentSheet = true;
  const tree = await toDemo({ aiConsent: true });
  await tryIt(tree);
  expect(sheets(tree)).toHaveLength(0);
  expect(texts(tree)).toContain('camera');
});
