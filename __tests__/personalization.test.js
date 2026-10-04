// Персоналізація в зв'язці App + екрани: редактор «Слово дня під тебе»,
// «Знаю» з пропозицією підняти рівень, разові підказки на вкладці навчання,
// відповіді онбордингу на сервер. Сервер — заглушка, що поводиться як
// справжній POST /word-of-day: слова теми з профілю, без «Знаю».
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import App from '../App';
import FlashcardsScreen from '../src/FlashcardsScreen';
import OnboardingScreen from '../src/OnboardingScreen';
import ProfileEditor from '../src/ProfileEditor';
import ScannerScreen from '../src/ScannerScreen';
import SettingsScreen from '../src/SettingsScreen';
import WordOfDayCard from '../src/WordOfDayCard';
import { ProfileTip, WidgetTip } from '../src/LearnTips';
import { ACHIEVEMENTS } from '../src/achievements';
import { localDayKey } from '../src/storage';
import { makeT } from '../src/i18n';

// Рендер усього застосунку на холодному кеші CI займає секунди (див. App.test.js)
jest.setTimeout(20000);

const t = makeT('en');
const TODAY = localDayKey();
const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
const ALL_ACH = ACHIEVEMENTS.map((a) => a.id);
const POOL = ['liquidity', 'accrual', 'ledger', 'equity', 'audit', 'yield', 'hedge', 'margin'];
const day = (i) => {
  const d = new Date();
  d.setDate(d.getDate() + i);
  return localDayKey(d);
};

const reply = (code, body) => ({ ok: code < 300, status: code, json: async () => body });
let calls = [];
let wodOnline = true;
function server() {
  calls = [];
  wodOnline = true;
  let devices = 0;
  global.fetch = jest.fn(async (url, init = {}) => {
    const u = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ path: u.pathname, method, body });
    if (method === 'POST' && u.pathname === '/auth/device') {
      devices++;
      return reply(200, { token: 't' + devices, user: { id: 'u' + devices, createdAt: 1 } });
    }
    if (u.pathname === '/me' && method === 'DELETE') return reply(200, { ok: true });
    if (u.pathname === '/me') return reply(200, { user: { id: 'u' + devices }, pro: { active: false }, usage: { day: TODAY, scans: 0, limit: 5 } });
    if (u.pathname === '/me/profile') return reply(200, { ok: true });
    if (u.pathname === '/word-of-day' && method === 'POST' && wodOnline) {
      const known = new Set(body.known || []);
      const pool = POOL.filter((w) => !known.has(w));
      const topic = body.profile?.field || 'general';
      const words = Array.from({ length: body.days }, (_, i) => ({
        date: day(i),
        word: pool[i % pool.length],
        ipa: '',
        translation: 'tr',
        example: '',
        example_translation: '',
        source: pool[i % pool.length],
        topic,
      }));
      return reply(200, { words });
    }
    throw new TypeError('Network request failed');
  });
}
const wodPosts = () => calls.filter((c) => c.path === '/word-of-day' && c.method === 'POST');
const profilePosts = () => calls.filter((c) => c.path === '/me/profile');

beforeEach(async () => {
  await AsyncStorage.clear();
  server();
});

async function returning({ settings = {}, words = [], wod = null } = {}) {
  await AsyncStorage.setItem('ll_onboarded_v1', '1');
  await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', ...settings }));
  await AsyncStorage.setItem('ll_words_v1', JSON.stringify(words));
  await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ALL_ACH));
  if (wod) await AsyncStorage.setItem('ll_wod_v1', JSON.stringify(wod));
}

async function settle(n = 5) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

let mounted = null;
afterEach(async () => {
  if (mounted) await act(async () => mounted.unmount());
  mounted = null;
});

async function renderApp() {
  await act(async () => {
    mounted = create(
      <SafeAreaProvider initialMetrics={metrics}>
        <App />
      </SafeAreaProvider>
    );
  });
  await settle();
  return mounted;
}

async function run(fn) {
  let out;
  await act(async () => {
    out = await fn();
  });
  await settle(2);
  return out;
}

const stored = async (key) => JSON.parse(await AsyncStorage.getItem(key));
const one = (tree, type) => tree.root.findAllByType(type)[0] || null;
const openTab = (tree, key) => run(() => tree.root.findAll((n) => n.props.tb?.key === key)[0].props.onPress());
const strings = (node) =>
  node
    .findAll((n) => typeof n.props?.children === 'string' || Array.isArray(n.props?.children))
    .flatMap((n) => [n.props.children].flat())
    .filter((c) => typeof c === 'string');
// Кнопка всередині вузла: за підписом, назвою (GradBtn) чи текстом
function control(node, text) {
  const hit = node.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === text || n.props.title === text || n.findAll((c) => c.props.children === text).length)
  );
  if (!hit.length) throw new Error('no control: ' + text);
  return hit.at(-1);
}
const tap = (node, text) => run(() => control(node, text).props.onPress());

const PROFILE = { goals: ['work'], field: 'finance', level: 6, since: '2026-09-01' };

describe('“Tailored to you” in Settings', () => {
  test('the editor saves the profile from today, fetches new words and tells the server', async () => {
    await returning();
    const tree = await renderApp();
    expect(wodPosts()).toHaveLength(1);
    expect(wodPosts()[0].body.profile).toBeUndefined(); // без профілю — загальні слова

    await openTab(tree, 'settings');
    const settings = () => one(tree, SettingsScreen);
    expect(strings(settings())).toEqual(expect.arrayContaining([t('pfRowTitle'), t('pfNotSet')]));
    await tap(settings(), t('pfRowTitle'));

    const editor = () => one(tree, ProfileEditor);
    expect(editor()).not.toBeNull();
    await tap(editor(), t('goal_work'));
    await tap(editor(), t('obNext'));
    await tap(editor(), t('field_finance'));
    await tap(editor(), t('obNext'));
    const slider = () => editor().find((n) => typeof n.type === 'string' && n.props.accessibilityRole === 'adjustable');
    expect(slider().props.accessibilityLabel).toBe('Your level: Español');
    for (let i = 0; i < 3; i++) {
      await run(() => slider().props.onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    }
    await tap(editor(), t('save'));
    expect(editor()).toBeNull();

    const profile = { goals: ['work'], field: 'finance', level: 8, since: TODAY };
    expect((await stored('ll_settings_v1')).profile).toEqual(profile);
    expect(wodPosts()).toHaveLength(2);
    expect(wodPosts()[1].body).toMatchObject({ days: 14, lang: 'es', native: 'en', profile });
    expect(profilePosts().map((c) => c.body)).toEqual([{ goals: ['work'], field: 'finance', level: 8 }]);
    expect((await stored('ll_wod_v1')).words[0].topic).toBe('finance');
    expect(strings(settings())).toContain('Finance · B2+');

    // віджет — за новим кешем, з темою
    const { createWidget } = require('expo-widgets');
    const timeline = createWidget.mock.results.at(-1).value.updateTimeline.mock.calls.at(-1)[0];
    expect(timeline[0].props).toMatchObject({ word: 'liquidity', caption: 'Español · Finance' });
  });

  test('saving the same answers changes nothing: no new words, the topic queue keeps its start', async () => {
    await returning({ settings: { profile: PROFILE } });
    const tree = await renderApp();
    const before = wodPosts().length;
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEditProfile());
    const editor = () => one(tree, ProfileEditor);
    await tap(editor(), t('obNext'));
    await tap(editor(), t('obNext'));
    await tap(editor(), t('save'));
    expect(editor()).toBeNull();
    expect(wodPosts()).toHaveLength(before);
    expect((await stored('ll_settings_v1')).profile.since).toBe('2026-09-01');
  });

  test('the editor closes with the cross and keeps the old profile', async () => {
    await returning({ settings: { profile: PROFILE } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEditProfile());
    await tap(one(tree, ProfileEditor), t('goal_travel'));
    await tap(one(tree, ProfileEditor), t('close'));
    expect(one(tree, ProfileEditor)).toBeNull();
    expect((await stored('ll_settings_v1')).profile).toEqual(PROFILE);
  });

  test('for VoiceOver the editor is a modal layer that the escape gesture closes', async () => {
    await returning({ settings: { profile: PROFILE } });
    const tree = await renderApp();
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEditProfile());
    const layer = one(tree, ProfileEditor).parent;
    expect(layer.props.accessibilityViewIsModal).toBe(true);
    await run(() => layer.props.onAccessibilityEscape());
    expect(one(tree, ProfileEditor)).toBeNull();
    expect((await stored('ll_settings_v1')).profile).toEqual(PROFILE);
  });
});

describe('“I know it” on the word of the day', () => {
  async function learnTab() {
    await returning({ settings: { profile: PROFILE } });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    return tree;
  }
  const cards = (tree) => one(tree, FlashcardsScreen);

  test('replaces today’s word at once and offers a higher level after three in a row', async () => {
    const tree = await learnTab();
    expect(cards(tree).props.wordOfDay.source).toBe('liquidity');
    expect(cards(tree).props.wodTopic).toBe('Finance');
    expect(strings(one(tree, WordOfDayCard))).toContain('WORD OF THE DAY · Finance');

    await run(() => cards(tree).props.onKnowWod());
    expect(wodPosts().at(-1).body.known).toEqual(['liquidity']);
    expect(cards(tree).props.wordOfDay.source).toBe('accrual');
    expect(cards(tree).props.levelUp).toBeNull();

    await run(() => cards(tree).props.onKnowWod());
    await run(() => cards(tree).props.onKnowWod());
    expect(wodPosts().at(-1).body.known).toEqual(['liquidity', 'accrual', 'ledger']);
    expect(cards(tree).props.wordOfDay.source).toBe('equity');
    expect(cards(tree).props.levelUp).toBe(7);
    // картка називає рівень за CEFR, а не числом зі слайдера
    expect(strings(one(tree, WordOfDayCard))).toContain(t('wodLevelUp', { n: 'B2' }));
    // рівень сам не піднімається
    expect((await stored('ll_settings_v1')).profile.level).toBe(6);

    await run(() => cards(tree).props.onLevelUp());
    const st = await stored('ll_settings_v1');
    expect(st.profile).toEqual({ ...PROFILE, level: 7, since: TODAY });
    expect(st.knownWords).toEqual(['liquidity', 'accrual', 'ledger']);
    expect(wodPosts().at(-1).body.profile.level).toBe(7);
    expect(cards(tree).props.levelUp).toBeNull();
    expect(profilePosts().at(-1).body).toEqual({ goals: ['work'], field: 'finance', level: 7 });
  });

  test('saving a word breaks the streak; “Keep it” starts the count again', async () => {
    const tree = await learnTab();
    await run(() => cards(tree).props.onKnowWod());
    await run(() => cards(tree).props.onKnowWod());
    await run(() => cards(tree).props.onSaveWod());
    await run(() => cards(tree).props.onKnowWod());
    expect(cards(tree).props.levelUp).toBeNull();

    await run(() => cards(tree).props.onKnowWod());
    await run(() => cards(tree).props.onKnowWod());
    expect(cards(tree).props.levelUp).toBe(7);
    await run(() => cards(tree).props.onKeepLevel());
    expect(cards(tree).props.levelUp).toBeNull();
    expect((await stored('ll_settings_v1')).profile.level).toBe(6);
  });

  test('offline: the word is remembered and the card says a new one comes with the connection', async () => {
    const tree = await learnTab();
    wodOnline = false;
    await run(() => cards(tree).props.onKnowWod());
    expect(cards(tree).props.wodNote).toBe(t('wodKnowOffline'));
    expect(strings(one(tree, WordOfDayCard))).toContain(t('wodKnowOffline'));
    expect((await stored('ll_settings_v1')).knownWords).toEqual(['liquidity']);

    // звʼязок повернувся: «Знаю» на тому ж слові — і воно нарешті змінюється
    wodOnline = true;
    await run(() => cards(tree).props.onKnowWod());
    expect(cards(tree).props.wordOfDay.source).toBe('accrual');
    expect(cards(tree).props.wodNote).toBe('');
  });
});

describe('the card itself', () => {
  const word = { date: TODAY, word: 'liquidity', translation: 'ліквідність', example: 'Cash gives liquidity.', example_translation: 'Гроші — ліквідність.', source: 'liquidity', topic: 'finance' };
  async function card(props) {
    await act(async () => {
      mounted = create(<WordOfDayCard word={word} lang="en" saved={false} onSave={() => {}} t={t} {...props} />);
    });
    return mounted;
  }
  const expand = (tree) =>
    act(async () =>
      tree.root
        .find((n) => typeof n.type === 'string' && n.props.accessibilityState?.expanded !== undefined)
        .props.onAccessibilityAction({ nativeEvent: { actionName: 'activate' } })
    );

  test('the topic sits in the caps line; general words have none', async () => {
    let tree = await card({ topic: 'Finance' });
    expect(strings(tree.root)).toContain('WORD OF THE DAY · Finance');
    await act(async () => tree.unmount());
    tree = await card({ topic: '' });
    expect(strings(tree.root)).toContain('WORD OF THE DAY');
    expect(strings(tree.root).some((s) => s.includes(' · '))).toBe(false);
  });

  test('“I know it” is a separate, labelled button that is ignored while a new word loads', async () => {
    const onKnow = jest.fn();
    let tree = await card({ onKnow });
    await expand(tree);
    const know = control(tree.root, t('wodKnowA11y'));
    expect(know.props.accessibilityRole).toBe('button');
    await act(async () => know.props.onPress());
    expect(onKnow).toHaveBeenCalledTimes(1);
    await act(async () => tree.unmount());

    tree = await card({ onKnow, knowing: true });
    await expand(tree);
    const busy = control(tree.root, t('wodKnowA11y'));
    expect(busy.props.accessibilityState).toEqual({ busy: true });
    await act(async () => busy.props.onPress());
    expect(onKnow).toHaveBeenCalledTimes(1);
  });

  test('the level offer is just an offer: two buttons, nothing happens by itself', async () => {
    const onLevelUp = jest.fn();
    const onKeepLevel = jest.fn();
    const tree = await card({ onKnow: () => {}, levelUp: 9, onLevelUp, onKeepLevel });
    expect(strings(tree.root)).toEqual(expect.arrayContaining([t('wodLevelUp', { n: 'C1' }), t('wodLevelUpYes', { n: 'C1' }), t('wodLevelUpNo')]));
    expect(onLevelUp).not.toHaveBeenCalled();
    await act(async () => control(tree.root, t('wodLevelUpYes', { n: 'C1' })).props.onPress());
    expect(onLevelUp).toHaveBeenCalledTimes(1);
    await act(async () => control(tree.root, t('wodLevelUpNo')).props.onPress());
    expect(onKeepLevel).toHaveBeenCalledTimes(1);
  });
});

describe('tips on the Learn tab', () => {
  const w = (i) => ({ id: 'w' + i, word: 'w' + i, translation: 't', lang: 'es', addedAt: 1, srs: { box: 0, due: 0 } });

  test('no profile yet: one quiet card that opens the editor and can be hidden for good', async () => {
    await returning();
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, ProfileTip)).not.toBeNull();
    await run(() => control(one(tree, ProfileTip), t('pfTipTitle')).props.onPress());
    expect(one(tree, ProfileEditor)).not.toBeNull();
    await tap(one(tree, ProfileEditor), t('close'));

    await run(() => control(one(tree, ProfileTip), t('tipHide')).props.onPress());
    expect(one(tree, ProfileTip)).toBeNull();
    expect((await stored('ll_settings_v1')).profileTipOff).toBe(true);
  });

  test('a saved profile hides the profile tip', async () => {
    await returning({ settings: { profile: PROFILE } });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, ProfileTip)).toBeNull();
  });

  test('the widget tip comes with the third saved word, once ever', async () => {
    await returning({ settings: { profile: PROFILE }, words: [w(1), w(2)] });
    let tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, WidgetTip)).toBeNull();

    await openTab(tree, 'scan');
    await run(() => one(tree, ScannerScreen).props.onSaveWord({ word: 'la taza', translation: 'mug', lang: 'es' }));
    await openTab(tree, 'cards');
    const tip = one(tree, WidgetTip);
    expect(tip).not.toBeNull();
    // три справжні кроки, без вигаданих цифр
    expect(strings(tip)).toEqual(expect.arrayContaining([t('widgetTipTitle'), t('widgetTipStep1'), t('widgetTipStep2'), t('widgetTipStep3')]));
    expect(strings(tip).some((s) => /\d+\s?%/.test(s))).toBe(false);

    await run(() => control(tip, t('tipHide')).props.onPress());
    expect(one(tree, WidgetTip)).toBeNull();
    expect((await stored('ll_settings_v1')).widgetTipShown).toBe(true);
    await act(async () => tree.unmount());
    mounted = null;

    tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, WidgetTip)).toBeNull();
  });

  test('the widget tip waits while the profile tip is on screen', async () => {
    await returning({ words: [w(1), w(2), w(3)] });
    const tree = await renderApp();
    await openTab(tree, 'cards');
    expect(one(tree, ProfileTip)).not.toBeNull();
    expect(one(tree, WidgetTip)).toBeNull();
    await run(() => control(one(tree, ProfileTip), t('tipHide')).props.onPress());
    expect(one(tree, WidgetTip)).not.toBeNull();
  });
});

describe('onboarding answers', () => {
  test('are saved, sent to the server once with “heard from”, and shape the words', async () => {
    const tree = await renderApp(); // свіже встановлення — онбординг
    const profile = { goals: ['study'], field: 'it', level: 4, since: TODAY };
    await run(() => one(tree, OnboardingScreen).props.onDone({ wodEnabled: false, profile, heardFrom: 'tiktok' }));
    await settle();
    const st = await stored('ll_settings_v1');
    expect(st).toMatchObject({ profile, heardFrom: 'tiktok', wodEnabled: false });
    expect(profilePosts().map((c) => c.body)).toEqual([{ goals: ['study'], field: 'it', level: 4, heardFrom: 'tiktok' }]);
    expect(wodPosts().at(-1).body.profile).toEqual(profile);

    // повтор із Параметрів показує ці відповіді; «пропустити все» нічого не міняє
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onReplayOnb());
    const onb = one(tree, OnboardingScreen);
    expect(onb.props).toMatchObject({ profile, heardFrom: 'tiktok', targetLang: st.targetLang });
    const posts = wodPosts().length;
    await run(() => onb.props.onDone({ wodEnabled: false, profile, heardFrom: 'tiktok' }));
    expect(wodPosts()).toHaveLength(posts);
    expect(profilePosts()).toHaveLength(1);
  });

  test('“erase my data” forgets “I know it” and does not resend the answers to the new device record', async () => {
    await returning({ settings: { profile: PROFILE, heardFrom: 'friend', knownWords: ['liquidity'], knowStreak: 2 } });
    const tree = await renderApp();
    expect(profilePosts()).toHaveLength(1);
    await openTab(tree, 'settings');
    await run(() => one(tree, SettingsScreen).props.onEraseEverything());
    await settle();
    expect(calls.filter((c) => c.path === '/auth/device')).toHaveLength(2); // новий запис пристрою
    const st = await stored('ll_settings_v1');
    expect(st).toMatchObject({ knownWords: [], knowStreak: 0, profile: PROFILE, profileSyncedFor: '*' });
    expect(profilePosts()).toHaveLength(1);
  });
});
