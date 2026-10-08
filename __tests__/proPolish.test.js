// Полірування Pro (жовтень 2026): Параметри не мовчать, поки йдуть мережеві
// дії (стирання, відновлення), пейвол не запускає покупку й відновлення разом,
// говорить уголос про збій на iOS і тримає блок помилки під час «Ще раз»;
// редактор профілю стоїть над клавіатурою й має підписи для VoiceOver.
import { AccessibilityInfo, ActivityIndicator, Alert, Animated, KeyboardAvoidingView, LayoutAnimation, Linking, Modal, StyleSheet, Switch, TextInput } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import SettingsScreen from '../src/SettingsScreen';
import PaywallScreen from '../src/PaywallScreen';
import ProfileScreen from '../src/ProfileScreen';
import Footer, { DEV_TAPS, DEV_TAP_GAP } from '../src/settings/Footer';
import TurnChevron from '../src/settings/Chevron';
import { HOURS, hourChoices } from '../src/settings/WodSection';
import { openSupportMail } from '../src/settings/links';
import { optionKey, expandOptions, parseOption } from '../src/langVariants';
import { NAME_MAX } from '../src/profile';
import { accountErrorKey } from '../src/account';
import { GradBtn, Press } from '../src/ui';
import { PLANS } from '../src/subscription';
import { THEMES } from '../src/theme';
import { makeT } from '../src/i18n';
import polishPro from '../src/strings/polish-pro';
import { DUR, EASE, useReducedMotion } from '../src/motion';
import { evaluate } from '../src/achievements';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), SUPPORT_EMAIL: 'help@lingualens.test' }));
jest.mock('../src/achievements', () => {
  const actual = jest.requireActual('../src/achievements');
  return { ...actual, evaluate: jest.fn(actual.evaluate) };
});

const t = makeT('en');
const LOCALES = ['en', 'uk', 'de', 'es', 'ru'];

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  jest.clearAllMocks();
});

async function mount(el) {
  let tree;
  await act(async () => {
    tree = create(el);
  });
  mounted.push(tree);
  return tree;
}
const flat = (n) => StyleSheet.flatten(n.props.style) || {};
const byLabel = (tree, label) => tree.root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function')[0];
const byId = (tree, id) => tree.root.findAll((n) => n.props.testID === id)[0];
const hosts = (tree, fn) => tree.root.findAll((n) => typeof n.type === 'string' && fn(n));
const strings = (tree) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && (typeof n.props?.children === 'string' || Array.isArray(n.props?.children)))
    .flatMap((n) => [n.props.children].flat())
    .filter((c) => typeof c === 'string');
const has = (tree, s) => strings(tree).includes(s);
// найглибший елемент із onPress, у якому є такий текст (посилання без підпису)
const textControl = (tree, text) =>
  tree.root
    .findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length)
    .at(-1);

// ─── рядки фрагмента ────────────────────────────────────────────────────────
describe('polish-pro strings', () => {
  const keys = Object.keys(polishPro.en);

  test.each(LOCALES)('%s: the same keys, the same placeholders, no long dashes', (lang) => {
    expect(Object.keys(polishPro[lang]).sort()).toEqual([...keys].sort());
    for (const k of keys) {
      const vars = (s) => (s.match(/\{\w+(\|[^{}]*)?\}/g) || []).sort().join();
      expect(vars(polishPro[lang][k])).toBe(vars(polishPro.en[k]));
      expect(polishPro[lang][k]).not.toMatch(/[—–]|\s-\s/);
    }
  });

  test('none of them repeats an existing key', () => {
    const base = makeT('en');
    // фрагмент уже злитий у STRINGS: кожен його ключ читається як рядок
    for (const k of keys) expect(typeof base(k)).toBe('string');
    expect(keys).toEqual(expect.arrayContaining(['eraseBusy', 'eraseDone', 'eraseDoneText', 'supportCopied', 'avatarOption', 'purchaseAlreadyOwned', 'diagnostics']));
  });
});

// ─── Параметри ──────────────────────────────────────────────────────────────
function settings(props = {}) {
  return (
    <SettingsScreen
      targetLang="en"
      nativeLang="uk"
      themeKey="light"
      themeMode="system"
      wordsCount={3}
      wodEnabled
      wodHour={10}
      sub={{ pro: false }}
      uiLang="en"
      t={t}
      {...props}
    />
  );
}

describe('Settings: erase all my data', () => {
  let alert;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  const eraseBtn = (tree) => byLabel(tree, t('eraseAll'));
  const confirm = (i = 0) => alert.mock.calls[i][2].find((b) => b.style === 'destructive');

  test('a spinner replaces the label, a second tap is ignored, then a message says it is done', async () => {
    let finish;
    const onEraseEverything = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(settings({ onEraseEverything }));
    expect(eraseBtn(tree).props.accessibilityState).toEqual({ busy: false, disabled: false });

    await act(async () => eraseBtn(tree).props.onPress());
    await act(async () => {
      confirm().onPress();
    });
    expect(onEraseEverything).toHaveBeenCalledTimes(1);
    expect(eraseBtn(tree).props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(eraseBtn(tree).findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(has(tree, t('eraseAll'))).toBe(false);
    // VoiceOver на iOS чує, що йде
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(t('eraseBusy'));
    // і «Очистити словник» теж стоїть, поки йде стирання
    expect(byLabel(tree, t('clearDict')) ?? tree.root.findAll((n) => n.props.disabled === true && n.findAll((c) => c.props.children === t('clearDict')).length)[0]).toBeTruthy();

    // другий дотик не відкриває другого діалогу й не запускає другого стирання
    await act(async () => eraseBtn(tree).props.onPress());
    await act(async () => {
      confirm().onPress();
    });
    expect(alert).toHaveBeenCalledTimes(1);
    expect(onEraseEverything).toHaveBeenCalledTimes(1);

    await act(async () => finish());
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(alert).toHaveBeenLastCalledWith(t('eraseDone'), t('eraseDoneText'));
    expect(eraseBtn(tree).props.accessibilityState).toEqual({ busy: false, disabled: false });
    expect(has(tree, t('eraseAll'))).toBe(true);
  });

  test('a failure re-enables the button, warns with a haptic and keeps the old messages', async () => {
    const onEraseEverything = jest.fn(async () => Promise.reject(Object.assign(new Error('OFFLINE'), { code: 'OFFLINE' })));
    const tree = await mount(settings({ onEraseEverything }));
    await act(async () => eraseBtn(tree).props.onPress());
    await act(async () => confirm().onPress());
    expect(alert).toHaveBeenLastCalledWith(t('eraseFail'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
    expect(Haptics.notificationAsync).not.toHaveBeenCalledWith('success');
    expect(eraseBtn(tree).props.accessibilityState).toEqual({ busy: false, disabled: false });
    // можна спробувати ще раз
    await act(async () => eraseBtn(tree).props.onPress());
    await act(async () => confirm(2).onPress());
    expect(onEraseEverything).toHaveBeenCalledTimes(2);
  });

  test('the screen can go away while the request runs', async () => {
    let finish;
    const onEraseEverything = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(settings({ onEraseEverything }));
    await act(async () => eraseBtn(tree).props.onPress());
    await act(async () => {
      confirm().onPress();
    });
    await act(async () => {
      tree.unmount();
      mounted.splice(mounted.indexOf(tree), 1);
    });
    await expect(act(async () => finish())).resolves.not.toThrow();
    expect(alert).toHaveBeenLastCalledWith(t('eraseDone'), t('eraseDoneText'));
  });
});

describe('Settings: restore purchases', () => {
  let alert;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());
  const row = (tree) => byLabel(tree, t('restore'));

  test('two quick taps restore once; a spinner and the busy state show; the alert has a short title', async () => {
    let finish;
    const onRestore = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(settings({ onRestore }));
    expect(row(tree).props.accessibilityRole).toBe('button');
    await act(async () => {
      row(tree).props.onPress();
      row(tree).props.onPress();
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(row(tree).props.accessibilityState).toEqual({ busy: true, disabled: true });
    expect(row(tree).findAllByType(ActivityIndicator)).toHaveLength(1);
    await act(async () => finish({ pro: false }));
    expect(alert).toHaveBeenCalledTimes(1);
    expect(alert).toHaveBeenCalledWith(t('restoreTitleNone'), t('restoreNothing'));
    expect(row(tree).props.accessibilityState).toEqual({ busy: false, disabled: false });
    expect(row(tree).findAllByType(ActivityIndicator)).toHaveLength(0);
    // і ще раз можна
    await act(async () => {
      row(tree).props.onPress();
    });
    expect(onRestore).toHaveBeenCalledTimes(2);
  });

  test('a rejection does not throw: a failure alert, the row is free again', async () => {
    const onRestore = jest.fn(async () => {
      throw new Error('boom');
    });
    const tree = await mount(settings({ onRestore }));
    await act(async () => row(tree).props.onPress());
    expect(alert).toHaveBeenCalledWith(t('restoreTitleFail'), t('restoreFailed'));
    expect(row(tree).props.accessibilityState.busy).toBe(false);
  });

  test('a found purchase: success haptic and the “All set” alert', async () => {
    const onRestore = jest.fn(async () => ({ pro: true }));
    const tree = await mount(settings({ onRestore }));
    await act(async () => row(tree).props.onPress());
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(alert).toHaveBeenCalledWith(t('restoreTitleOk'), t('restoreDone'));
  });
});

describe('Settings: language picker', () => {
  const head = (tree) => tree.root.findAll((n) => n.props.accessibilityLabel?.startsWith(`${t('learnLang')}: English`) && typeof n.props.onPress === 'function')[0];

  test('the header is a button that says whether it is expanded', async () => {
    const tree = await mount(settings());
    expect(head(tree).props.accessibilityRole).toBe('button');
    expect(head(tree).props.accessibilityHint).toBe(t('learnLangHint'));
    expect(head(tree).props.accessibilityState).toEqual({ expanded: false });
    await act(async () => head(tree).props.onPress());
    expect(head(tree).props.accessibilityState).toEqual({ expanded: true });
  });

  test('tapping the language you already have closes the list and changes nothing', async () => {
    const onSetLang = jest.fn();
    // App всегда передає варіант (англійська США чи Британії)
    const { variant } = parseOption(expandOptions(['en'])[0]);
    const tree = await mount(settings({ onSetLang, targetVariant: variant }));
    await act(async () => head(tree).props.onPress());
    const current = optionKey('en', variant);
    expect(byId(tree, 'setlang-' + current)).toBeDefined();
    await act(async () => byId(tree, 'setlang-' + current).props.onPress());
    expect(onSetLang).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    expect(byId(tree, 'setlang-' + current)).toBeUndefined();
    expect(head(tree).props.accessibilityState).toEqual({ expanded: false });
  });

  test('another language is still chosen as before', async () => {
    const onSetLang = jest.fn();
    const tree = await mount(settings({ onSetLang }));
    await act(async () => head(tree).props.onPress());
    await act(async () => byId(tree, 'setlang-de').props.onPress());
    expect(onSetLang).toHaveBeenCalledTimes(1);
    expect(onSetLang.mock.calls[0][0]).toBe('de');
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });
});

describe('Settings: sign-in error', () => {
  test('the error line makes the card grow smoothly, and a clean start does not animate', async () => {
    const configure = jest.spyOn(LayoutAnimation, 'configureNext').mockImplementation(() => {});
    try {
      const onSignIn = jest.fn(async () => Promise.reject(Object.assign(new Error('x'), { code: 'APPLE_INVALID' })));
      const tree = await mount(settings({ account: { available: true, signedIn: false }, onSignIn }));
      const btn = tree.root.findAll((n) => n.type === 'AppleAuthenticationButton')[0];
      await act(async () => btn.props.onPress());
      expect(has(tree, t(accountErrorKey('APPLE_INVALID')))).toBe(true);
      // fail(null) в початку спроби не анімує; рядок помилки — один раз
      expect(configure).toHaveBeenCalledTimes(1);
    } finally {
      configure.mockRestore();
    }
  });
});

describe('Settings: about rows', () => {
  test('links and buttons say what they are', async () => {
    const tree = await mount(settings({ onReplayOnb: jest.fn() }));
    const role = (text) => textControl(tree, text).props.accessibilityRole;
    expect(role(t('replayOnb'))).toBe('button');
    expect(role(t('restore'))).toBe('button');
    expect(role(t('terms'))).toBe('link');
    expect(role(t('support'))).toBe('link');
  });
});

describe('support mail', () => {
  let alert;
  let open;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    open = jest.spyOn(Linking, 'openURL');
  });
  afterEach(() => {
    alert.mockRestore();
    open.mockRestore();
  });

  test('opens the mail app when there is one', async () => {
    open.mockResolvedValue(true);
    expect(await openSupportMail(t)).toBe(true);
    expect(open).toHaveBeenCalledWith('mailto:help@lingualens.test');
    expect(alert).not.toHaveBeenCalled();
  });

  test('no mail app: the address is copied and the person is told', async () => {
    open.mockRejectedValue(new Error('no handler'));
    const Clipboard = require('expo-clipboard');
    expect(await openSupportMail(t)).toBe(false);
    expect(Clipboard.setStringAsync).toHaveBeenCalledWith('help@lingualens.test');
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
    expect(alert).toHaveBeenCalledWith(t('support'), t('supportCopied', { e: 'help@lingualens.test' }));
    expect(t('supportCopied', { e: 'help@lingualens.test' })).toContain('help@lingualens.test');
  });

  test('even copying failed: at least the address is shown', async () => {
    open.mockRejectedValue(new Error('no handler'));
    const Clipboard = require('expo-clipboard');
    Clipboard.setStringAsync.mockRejectedValueOnce(new Error('denied'));
    await openSupportMail(t);
    expect(alert).toHaveBeenCalledWith(t('support'), 'help@lingualens.test');
  });

  test('the Settings row and the paywall link both use it', async () => {
    open.mockRejectedValue(new Error('no handler'));
    const tree = await mount(settings());
    await act(async () => textControl(tree, t('support')).props.onPress());
    expect(alert).toHaveBeenCalledWith(t('support'), t('supportCopied', { e: 'help@lingualens.test' }));

    alert.mockClear();
    const pw = await mount(
      <PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({ ok: false, error: 'NETWORK' })} onRestore={async () => ({})} lang="en" t={t} />
    );
    await act(async () => textControl(pw, t('startTrial')).props.onPress());
    await act(async () => textControl(pw, t('pwContactSupport')).props.onPress());
    expect(alert).toHaveBeenCalledWith(t('support'), t('supportCopied', { e: 'help@lingualens.test' }));
  });
});

describe('Settings: word of the day', () => {
  test('the switch has a name; it still reports the change', async () => {
    const onToggleWod = jest.fn();
    const tree = await mount(settings({ onToggleWod }));
    const sw = tree.root.findAllByType(Switch).find((n) => n.props.testID === 'wod-enabled');
    expect(sw.props.accessibilityLabel).toBe(t('dailyPush'));
    expect(sw.props.accessibilityHint).toBe(t('dailyPushHint'));
    await act(async () => sw.props.onValueChange(false));
    expect(onToggleWod).toHaveBeenCalledWith(false);
  });

  test('every Switch in Settings has a name', async () => {
    const tree = await mount(
      settings({ analyticsAvailable: true, extra: { widgetsAvailable: true } })
    );
    const unnamed = tree.root.findAllByType(Switch).filter((n) => !n.props.accessibilityLabel);
    expect(unnamed).toHaveLength(0);
  });

  test('the reminder time you really have is shown as a selected chip, in order', async () => {
    expect(hourChoices(10)).toBe(HOURS);
    expect(hourChoices(14)).toEqual([8, 10, 12, 14, 18, 20]);
    expect(hourChoices(9)).toEqual([8, 9, 10, 12, 18, 20]);
    expect(hourChoices(undefined)).toBe(HOURS);

    for (const h of [14, 19, 9]) {
      const tree = await mount(settings({ wodHour: h }));
      const chips = hosts(tree, (n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('wod-hour-'));
      expect(chips).toHaveLength(6);
      expect(chips.filter((c) => c.props.accessibilityState.selected).map((c) => c.props.testID)).toEqual(['wod-hour-' + h]);
    }
    // година зі списку — п'ять чипів, як і раніше
    const tree = await mount(settings({ wodHour: 18 }));
    expect(hosts(tree, (n) => typeof n.props.testID === 'string' && n.props.testID.startsWith('wod-hour-'))).toHaveLength(5);
  });

  test('picking a standard hour replaces the extra chip', async () => {
    const onSetWodHour = jest.fn();
    const tree = await mount(settings({ wodHour: 14, onSetWodHour }));
    await act(async () => byId(tree, 'wod-hour-18').props.onPress());
    expect(onSetWodHour).toHaveBeenCalledWith(18);
    await act(async () => tree.update(settings({ wodHour: 18, onSetWodHour })));
    expect(byId(tree, 'wod-hour-14')).toBeUndefined();
  });
});

describe('Settings: hidden diagnostics', () => {
  const ctx = (setOpen) => ({ t, C: THEMES.light.C, dev: { open: false, setOpen } });

  test(`${DEV_TAPS} quick taps open it; slow ones never do`, async () => {
    const now = jest.spyOn(Date, 'now');
    let clock = 1_000_000;
    now.mockImplementation(() => clock);
    try {
      const setOpen = jest.fn();
      const tree = await mount(<Footer ctx={ctx(setOpen)} />);
      const tap = () => tree.root.findAll((n) => n.props.testID === 'settings-footer' && typeof n.props.onPress === 'function')[0].props.onPress();
      // сім дотиків за хвилину, з паузами довшими за DEV_TAP_GAP
      for (let i = 0; i < DEV_TAPS * 2; i++) {
        clock += DEV_TAP_GAP + 200;
        await act(async () => tap());
      }
      expect(setOpen).not.toHaveBeenCalled();
      // сім поспіль (після паузи: лічильник починається з нуля)
      clock += DEV_TAP_GAP + 200;
      for (let i = 0; i < DEV_TAPS; i++) {
        clock += 150;
        await act(async () => tap());
      }
      expect(setOpen).toHaveBeenCalledTimes(1);
      // лічильник почався з нуля: ще шість дотиків нічого не відкривають
      for (let i = 0; i < DEV_TAPS - 1; i++) {
        clock += 150;
        await act(async () => tap());
      }
      expect(setOpen).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });
});

// ─── Пейвол ─────────────────────────────────────────────────────────────────
function paywall(props = {}) {
  return (
    <PaywallScreen
      reason="scans"
      plans={PLANS}
      onClose={() => {}}
      onPurchase={async () => ({ ok: true })}
      onRestore={async () => ({})}
      lang="en"
      t={t}
      {...props}
    />
  );
}
const cta = (tree) => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('startTrial'))[0];

describe('Paywall: buying and restoring do not run together', () => {
  let alert;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  });
  afterEach(() => alert.mockRestore());

  test('while a purchase is running, Restore does nothing and looks off', async () => {
    let finish;
    const onPurchase = jest.fn(() => new Promise((r) => (finish = r)));
    const onRestore = jest.fn(async () => ({}));
    const tree = await mount(paywall({ onPurchase, onRestore }));
    await act(async () => {
      cta(tree).props.onPress();
    });
    const link = textControl(tree, t('restore'));
    expect(link.props.disabled).toBe(true);
    expect(link.props.accessibilityState).toEqual({ busy: false, disabled: true });
    await act(async () => link.props.onPress());
    expect(onRestore).not.toHaveBeenCalled();
    await act(async () => finish({ cancelled: true }));
    expect(textControl(tree, t('restore')).props.accessibilityState.disabled).toBe(false);
    await act(async () => textControl(tree, t('restore')).props.onPress());
    expect(onRestore).toHaveBeenCalledTimes(1);
  });

  test('while a restore is running, the buy button is off and a tap starts nothing', async () => {
    let finish;
    const onPurchase = jest.fn(async () => ({ ok: true }));
    const onRestore = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(paywall({ onPurchase, onRestore }));
    await act(async () => {
      textControl(tree, t('restore')).props.onPress();
    });
    expect(cta(tree).props.disabled).toBe(true);
    const press = cta(tree).props.onPress;
    await act(async () => {
      press();
    });
    expect(onPurchase).not.toHaveBeenCalled();
    await act(async () => finish({ pro: false }));
    expect(cta(tree).props.disabled).toBeFalsy();
    await act(async () => cta(tree).props.onPress());
    expect(onPurchase).toHaveBeenCalledTimes(1);
  });
});

describe('Paywall: VoiceOver on iOS hears what appears', () => {
  const buyWith = async (res) => {
    const tree = await mount(paywall({ onPurchase: async () => res }));
    await act(async () => cta(tree).props.onPress());
    return tree;
  };

  test('an unclear failure is announced and gives a warning haptic', async () => {
    await buyWith({ ok: false, error: 'NETWORK' });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(t('pwUnclearNote'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  test('“not charged” is announced too, with a warning haptic', async () => {
    await buyWith({ ok: false, error: 'X', uncharged: true });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(t('purchaseFailed'));
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  test('waiting for approval is announced, but it is not a warning', async () => {
    await buyWith({ ok: false, pending: true });
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(t('purchasePending'));
    expect(Haptics.notificationAsync).not.toHaveBeenCalledWith('warning');
  });

  test('“you may already have Pro” points to Restore, with no warning', async () => {
    const tree = await buyWith({ ok: false, owned: true, error: '6' });
    expect(has(tree, t('purchaseAlreadyOwned'))).toBe(true);
    expect(has(tree, t('pwUnclearNote'))).toBe(false);
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(t('purchaseAlreadyOwned'));
    expect(Haptics.notificationAsync).not.toHaveBeenCalledWith('warning');
  });

  test('a cancelled purchase says nothing and buzzes nothing', async () => {
    await buyWith({ ok: false, cancelled: true });
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
    expect(Haptics.notificationAsync).not.toHaveBeenCalled();
  });

  test('no store: the standing explanation is not shouted on open', async () => {
    await mount(paywall({ plans: [], unavailable: true }));
    expect(AccessibilityInfo.announceForAccessibility).not.toHaveBeenCalled();
  });

  test('the same failure twice in a row is announced twice', async () => {
    // відповідь приходить не миттєво, як і в магазину: між натисканням і
    // відповіддю екран встигає перемалюватись
    const slow = () => new Promise((r) => setTimeout(() => r({ ok: false, error: 'NETWORK' }), 5));
    const tree = await mount(paywall({ onPurchase: slow }));
    const buy = async () => {
      await act(async () => {
        cta(tree).props.onPress();
      });
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });
    };
    await buy();
    await buy();
    expect(AccessibilityInfo.announceForAccessibility.mock.calls.filter(([m]) => m === t('pwUnclearNote'))).toHaveLength(2);
  });

  test('prices that failed to load are announced once', async () => {
    await mount(paywall({ plans: [], plansFailed: true }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith(`${t('pricesFailed')}. ${t('pricesFailedHint')}`);
  });
});

describe('Paywall: “Try again” for prices', () => {
  const props = { reason: 'scans', onClose: () => {}, onPurchase: async () => ({}), onRestore: async () => ({}), lang: 'en', t };
  const retry = (tree) => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('pricesRetry'))[0];

  test('the error block stays with a spinner while the request runs, then settles', async () => {
    const onRetry = jest.fn();
    const tree = await mount(<PaywallScreen {...props} plans={[]} plansFailed onRetry={onRetry} />);
    expect(retry(tree).props.loading).toBe(false);
    await act(async () => retry(tree).props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(retry(tree).props.loading).toBe(true);

    // App: запит стартував, plansStatus = 'loading', plansFailed скинувся
    await act(async () => tree.update(<PaywallScreen {...props} plans={[]} plansFailed={false} onRetry={onRetry} />));
    expect(has(tree, t('pricesFailed'))).toBe(true);
    expect(retry(tree).props.loading).toBe(true);
    // ні вимкненої «Перейти на Pro», ні юридичного рядка поки нема
    expect(tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('subscribe'))).toHaveLength(0);

    // запит знову не вдався: кнопка вільна, людина чує про це
    await act(async () => tree.update(<PaywallScreen {...props} plans={[]} plansFailed onRetry={onRetry} />));
    expect(retry(tree).props.loading).toBe(false);
    expect(has(tree, t('pricesFailed'))).toBe(true);
    expect(Haptics.notificationAsync).toHaveBeenCalledWith('warning');
  });

  test('prices arrive: the normal footer returns', async () => {
    const tree = await mount(<PaywallScreen {...props} plans={[]} plansFailed onRetry={() => {}} />);
    await act(async () => retry(tree).props.onPress());
    await act(async () => tree.update(<PaywallScreen {...props} plans={[]} plansFailed={false} onRetry={() => {}} />));
    await act(async () => tree.update(<PaywallScreen {...props} plans={PLANS} plansFailed={false} onRetry={() => {}} />));
    expect(has(tree, t('pricesFailed'))).toBe(false);
    expect(cta(tree)).toBeDefined();
  });

  test('if nothing ever answers, the spinner does not run forever', async () => {
    jest.useFakeTimers();
    try {
      const tree = await mount(<PaywallScreen {...props} plans={[]} plansFailed onRetry={() => {}} />);
      await act(async () => retry(tree).props.onPress());
      expect(retry(tree).props.loading).toBe(true);
      await act(async () => jest.advanceTimersByTime(10_500));
      expect(retry(tree).props.loading).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('Paywall: choosing a plan', () => {
  const radios = (tree) => hosts(tree, (n) => n.props.accessibilityRole === 'radio');
  const radioOf = (tree, id) => tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith(t('plan' + id[0].toUpperCase() + id.slice(1))))[0];

  test('the haptic only fires when the plan changes', async () => {
    const tree = await mount(paywall());
    const year = radioOf(tree, 'year');
    expect(year.props.accessibilityState.checked).toBe(true);
    await act(async () => year.props.onPress());
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    await act(async () => radioOf(tree, 'month').props.onPress());
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
    expect(radioOf(tree, 'month').props.accessibilityState.checked).toBe(true);
    expect(radioOf(tree, 'year').props.accessibilityState.checked).toBe(false);
    await act(async () => radioOf(tree, 'month').props.onPress());
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('the ring and the radio fill are layers: the card never changes its border or size', async () => {
    const tree = await mount(paywall());
    const card = radios(tree)[0];
    expect(flat(card).borderColor).toBe('transparent');
    const layers = (n) => n.findAll((c) => typeof c.type === 'string' && c.props.pointerEvents === 'none');
    // кільце є в кожного тарифу, прозоре в невибраних
    for (const r of radios(tree)) expect(layers(r).length).toBeGreaterThan(0);
    await act(async () => radioOf(tree, 'month').props.onPress());
    expect(flat(radios(tree)[0]).borderColor).toBe('transparent');
  });

  test('plan texts keep their size under a huge system font', async () => {
    const tree = await mount(paywall());
    const price = hosts(tree, (n) => n.props.children === '$59.99')[0];
    expect(price.props.maxFontSizeMultiplier).toBe(1.4);
    const free = hosts(tree, (n) => n.props.children === t('colFree'))[0];
    expect(free.props.adjustsFontSizeToFit).toBe(true);
    expect(free.props.maxFontSizeMultiplier).toBe(1.2);
  });
});

describe('Paywall: touch feedback on the plain buttons', () => {
  test('close, the free exit and the footer links are Press, with the right roles', async () => {
    const onClose = jest.fn();
    const tree = await mount(paywall({ reason: 'intro', onClose }));
    const close = byLabel(tree, t('close'));
    expect(close.type).not.toBe('View');
    expect(typeof close.type).toBe('function');
    await act(async () => close.props.onPress());
    expect(onClose).toHaveBeenCalledTimes(1);

    const free = textControl(tree, t('pwContinueFree', { n: 1 }));
    expect(free.props.accessibilityRole).toBe('button');
    expect(textControl(tree, t('terms')).props.accessibilityRole).toBe('link');
    expect(textControl(tree, t('restore')).props.accessibilityRole).toBe('button');
    expect(close.props.feedback).toBe('dim');
  });
});

// ─── Профіль ────────────────────────────────────────────────────────────────
function profile(props = {}) {
  return <ProfileScreen words={[]} activity={{}} stats={{}} profile={{ name: 'Lena', avatar: 'wave' }} onUpdateProfile={() => {}} t={t} {...props} />;
}
const openEditor = async (tree) => act(async () => byLabel(tree, t('editProfile')).props.onPress());
const input = (tree) => tree.root.findByType(TextInput);

describe('Profile: the name sheet', () => {
  test('stands above the keyboard: the backdrop fills the screen, the sheet sits in a KeyboardAvoidingView', async () => {
    const tree = await mount(profile());
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);
    await openEditor(tree);
    const kav = tree.root.findByType(KeyboardAvoidingView);
    expect(kav.props.behavior).toBe('padding');
    expect(kav.props.pointerEvents).toBe('box-none');
    expect(flat(kav)).toMatchObject({ flex: 1, justifyContent: 'flex-end' });
    const backdrop = tree.root.findByType(Modal).findAll((n) => n.props.accessible === false && typeof n.props.onPress === 'function')[0];
    expect(flat(backdrop)).toMatchObject({ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 });
    // дотик у список аватарів і «Зберегти» не губиться: клавіатура не перехоплює перший
    const scroll = kav.findAll((n) => n.props.keyboardShouldPersistTaps)[0];
    expect(scroll.props.keyboardShouldPersistTaps).toBe('handled');
    // жест виходу VoiceOver
    expect(kav.findAll((n) => typeof n.props.onAccessibilityEscape === 'function' && n.props.accessibilityViewIsModal)).not.toHaveLength(0);
  });

  test('the field has a name, a length limit and name-friendly keyboard settings', async () => {
    const tree = await mount(profile());
    await openEditor(tree);
    expect(input(tree).props).toMatchObject({
      accessibilityLabel: t('yourName'),
      maxLength: NAME_MAX,
      autoCapitalize: 'words',
      autoCorrect: false,
      textContentType: 'givenName',
      returnKeyType: 'done',
      autoFocus: true,
    });
    expect(input(tree).props.value).toBe('Lena');
  });

  test('Lingos are a radio group with numbered names and the chosen one checked', async () => {
    const onUpdateProfile = jest.fn();
    const tree = await mount(profile({ onUpdateProfile, profile: { name: 'Lena', avatar: 'think' } }));
    await openEditor(tree);
    const group = tree.root.findAll((n) => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === t('chooseAvatar'))[0];
    expect(group).toBeTruthy();
    const options = [1, 2, 3, 4].map((i) => byLabel(tree, t('avatarOption', { n: i, total: 4 })));
    expect(options.map((o) => o.props.accessibilityRole)).toEqual(['radio', 'radio', 'radio', 'radio']);
    expect(options.map((o) => o.props.accessibilityState.checked)).toEqual([false, false, true, false]);
    expect(new Set(options.map((o) => o.props.accessibilityLabel)).size).toBe(4);

    // выбор другого — вібрація й оновлення; того самого — нічого
    await act(async () => options[2].props.onPress());
    expect(onUpdateProfile).not.toHaveBeenCalled();
    expect(Haptics.selectionAsync).not.toHaveBeenCalled();
    await act(async () => options[1].props.onPress());
    expect(onUpdateProfile).toHaveBeenCalledWith({ avatar: 'celebrate' });
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('every way out saves the name; an unchanged name saves nothing', async () => {
    const onUpdateProfile = jest.fn();
    const tree = await mount(profile({ onUpdateProfile }));
    const type = async (v) => act(async () => input(tree).props.onChangeText(v));

    // «Готово» на клавіатурі
    await openEditor(tree);
    await type('Marik');
    await act(async () => input(tree).props.onSubmitEditing());
    expect(onUpdateProfile).toHaveBeenLastCalledWith({ name: 'Marik' });
    expect(tree.root.findAllByType(TextInput)).toHaveLength(0);

    // тап повз аркуш
    onUpdateProfile.mockClear();
    await openEditor(tree);
    await type('  Lena Two ');
    const backdrop = tree.root.findByType(Modal).findAll((n) => n.props.accessible === false && typeof n.props.onPress === 'function')[0];
    await act(async () => backdrop.props.onPress());
    expect(onUpdateProfile).toHaveBeenLastCalledWith({ name: 'Lena Two' });

    // «Зберегти»
    onUpdateProfile.mockClear();
    await openEditor(tree);
    await type('Anna');
    await act(async () => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('save'))[0].props.onPress());
    expect(onUpdateProfile).toHaveBeenLastCalledWith({ name: 'Anna' });

    // не змінив: збереження нічого не пише
    onUpdateProfile.mockClear();
    await openEditor(tree);
    await act(async () => input(tree).props.onSubmitEditing());
    expect(onUpdateProfile).not.toHaveBeenCalled();
  });

  test('each reopening starts from the current name, not from an old draft', async () => {
    const tree = await mount(profile({ profile: { name: 'Lena', avatar: 'wave' } }));
    await openEditor(tree);
    await act(async () => input(tree).props.onChangeText('Draft that is never saved'));
    // Android «Назад» / жест VoiceOver теж зберігають, тож закриваємо без зміни тексту
    await act(async () => input(tree).props.onChangeText('Lena'));
    await act(async () => input(tree).props.onSubmitEditing());
    await openEditor(tree);
    expect(input(tree).props.value).toBe('Lena');
  });

  test('typing in the sheet does not recompute the achievements of the whole screen', async () => {
    const tree = await mount(profile());
    const before = evaluate.mock.calls.length;
    await openEditor(tree);
    for (const v of ['M', 'Ma', 'Mar', 'Mari', 'Marik']) await act(async () => input(tree).props.onChangeText(v));
    expect(evaluate.mock.calls.length).toBe(before);
  });
});

describe('Profile: the tabs and the rest', () => {
  test('the two segments are tabs with a selected state', async () => {
    const tree = await mount(profile());
    const tabsOf = () => tree.root.findAll((n) => n.type === Press && n.props.accessibilityRole === 'tab');
    const tabs = tabsOf();
    expect(tabs).toHaveLength(2);
    expect(tabs.map((x) => x.props.accessibilityState.selected)).toEqual([true, false]);
    await act(async () => tabs[1].props.onPress());
    const after = tabsOf();
    expect(after.map((x) => x.props.accessibilityState.selected)).toEqual([false, true]);
    expect(Haptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  test('the name text is not a second button next to the avatar', async () => {
    const tree = await mount(profile());
    const name = tree.root.findAll((n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === 'Lena').length).at(-1);
    expect(name.props.accessible).toBe(false);
    expect(byLabel(tree, t('editProfile')).props.accessibilityRole).toBe('button');
  });

  test('the collection bar is named; the achievement bars next to a number are hidden', async () => {
    const tree = await mount(profile());
    const bars = tree.root.findAll((n) => n.props.accessibilityRole === 'progressbar');
    expect(bars.map((b) => b.props.accessibilityLabel)).toContain(t('collStage', { n: 1 }));
    const tab = tree.root.findAll((n) => n.props.accessibilityRole === 'tab')[1];
    await act(async () => tab.props.onPress());
    // на вкладці досягнень під кожним рядком «0/N» — смужка лише декор
    expect(tree.root.findAll((n) => n.props.accessibilityRole === 'progressbar' && n.props.accessibilityLabel !== t('collStage', { n: 1 }))).toHaveLength(0);
  });
});

describe('Profile: the 7-day bars', () => {
  const week = () => {
    const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const out = {};
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      out[key(d)] = i % 3 === 0 ? 0 : i + 1;
    }
    return out;
  };
  const bars = (tree) => hosts(tree, (n) => flat(n).transformOrigin === 'bottom');

  test('seven bars grow from the bottom; their layout height is final from the first frame', async () => {
    const tree = await mount(profile({ activity: week() }));
    const list = bars(tree);
    expect(list).toHaveLength(7);
    for (const b of list) {
      expect(flat(b).height).toBeGreaterThanOrEqual(10);
      // transform — анімований scaleY, а не зміна height
      expect(flat(b).transform[0]).toHaveProperty('scaleY');
    }
  });

  test('Reduce Motion: no scale, the bars only fade', async () => {
    function Probe() {
      useReducedMotion();
      return null;
    }
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(true));
    try {
      await mount(<Probe />);
      await act(async () => {});
      const tree = await mount(profile({ activity: week() }));
      for (const b of bars(tree)) expect(flat(b).transform).toEqual([{ scaleY: 1 }]);
    } finally {
      AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
      await mount(<Probe />);
      await act(async () => {});
    }
  });
});

// ─── Рух ────────────────────────────────────────────────────────────────────
describe('motion', () => {
  const sleep = (ms) => act(async () => { await new Promise((r) => setTimeout(r, ms)); });
  const value = (n, key) => {
    const v = flat(n)[key];
    return v && typeof v.__getValue === 'function' ? v.__getValue() : v;
  };
  const rotation = (tree) => {
    const host = hosts(tree, (n) => Array.isArray(flat(n).transform) && flat(n).transform[0]?.rotate !== undefined)[0];
    const r = flat(host).transform[0].rotate;
    return typeof r.__getValue === 'function' ? r.__getValue() : r;
  };
  const setReduced = async (on) => {
    function Probe() {
      useReducedMotion();
      return null;
    }
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(on));
    await mount(<Probe />);
    await act(async () => {});
  };

  // Нативний драйвер у jest не рухає значення, тож перевіряємо, ЩО саме запускається
  const timings = () => Animated.timing.mock.calls.map(([, cfg]) => cfg);

  test('the chevron starts closed and turns with the block: DUR.panel open, DUR.exit closed, ease-out, native', async () => {
    const spy = jest.spyOn(Animated, 'timing');
    try {
      const tree = await mount(<TurnChevron open={false} color="#000" />);
      expect(rotation(tree)).toBe('0deg');
      expect(spy).not.toHaveBeenCalled();
      await act(async () => tree.update(<TurnChevron open color="#000" />));
      expect(timings().at(-1)).toMatchObject({ toValue: 1, duration: DUR.panel, easing: EASE.out, useNativeDriver: true });
      await act(async () => tree.update(<TurnChevron open={false} color="#000" />));
      expect(timings().at(-1)).toMatchObject({ toValue: 0, duration: DUR.exit, easing: EASE.out, useNativeDriver: true });
      expect(DUR.exit).toBeLessThan(DUR.panel);
    } finally {
      spy.mockRestore();
    }
  });

  test('a chevron that is born open does not animate', async () => {
    const tree = await mount(<TurnChevron open color="#000" />);
    expect(rotation(tree)).toBe('180deg');
  });

  test('Reduce Motion: the chevron is simply in its new place', async () => {
    await setReduced(true);
    try {
      const tree = await mount(<TurnChevron open={false} color="#000" />);
      await act(async () => tree.update(<TurnChevron open color="#000" />));
      expect(rotation(tree)).toBe('180deg');
    } finally {
      await setReduced(false);
    }
  });

  test('a plan choice fades its ring in and the old one out over DUR.micro / DUR.press; the card border stays transparent', async () => {
    const spy = jest.spyOn(Animated, 'timing');
    try {
      const tree = await mount(paywall());
      const rings = () => hosts(tree, (n) => n.props.pointerEvents === 'none' && flat(n).borderWidth === 2 && flat(n).position === 'absolute');
      expect(rings().length).toBe(PLANS.length);
      // из п'яти кілець видно лише кільце обраного (рік)
      expect(rings().map((r) => value(r, 'opacity')).sort()).toEqual([0, 0, 0, 0, 1]);
      spy.mockClear();
      const month = tree.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.props.onPress === 'function' && n.props.accessibilityLabel?.startsWith(t('planMonth')))[0];
      await act(async () => month.props.onPress());
      const runs = timings().filter((c) => c.easing === EASE.soft);
      expect(runs).toHaveLength(2);
      expect(runs.find((c) => c.toValue === 1)).toMatchObject({ duration: DUR.micro, useNativeDriver: true });
      expect(runs.find((c) => c.toValue === 0)).toMatchObject({ duration: DUR.press, useNativeDriver: true });
      expect(DUR.press).toBeLessThanOrEqual(DUR.micro);
    } finally {
      spy.mockRestore();
    }
  });
});
