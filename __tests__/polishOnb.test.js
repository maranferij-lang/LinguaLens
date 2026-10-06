// Полірування онбордингу й пейволу: мову, яку вчать, обирають на окремому
// кроці (онбординг 3.0); тарифи з ціною — першими на кожному пейволі, хрестик над
// прокруткою; ціни, що не завантажились, пояснюють себе; підвал коротший, а
// посилання в ньому — справжні цілі; покупка й відновлення показують, що
// йдуть; «Тримай довше» замість мовчазного кільця.
import { Alert, ActivityIndicator, AccessibilityInfo, Linking, ScrollView, StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import * as Haptics from 'expo-haptics';
import OnboardingScreen from '../src/OnboardingScreen';
import OnboardingPaywall from '../src/OnboardingPaywall';
import PaywallScreen, { TrialTimeline } from '../src/PaywallScreen';
import { langOptions } from '../src/LangSheet';
import HoldToCommit, { HOLD_MS, NUDGE_MS } from '../src/HoldToCommit';
import { PlanBody, PushPreview, hourLabel } from '../src/OnboardingParts';
import { GoalOptions, LevelBody, SkipButton, StepFrame } from '../src/ProfileSteps';
import { GradBtn } from '../src/ui';
import { LANGS } from '../src/speech';
import { PLANS, SIMULATED_PLANS } from '../src/subscription';
import { THEMES, ThemeProvider } from '../src/theme';
import { STRINGS, makeT } from '../src/i18n';
import { textEm } from '../src/share/layout';

jest.mock('../src/wordOfDay', () => ({
  ...jest.requireActual('../src/wordOfDay'),
  requestPermission: jest.fn(async () => false),
  permissionStatus: jest.fn(async () => 'undetermined'),
}));
jest.mock('../src/analytics', () => ({
  flag: jest.fn(async () => 'control'),
  track: jest.fn(),
}));
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));
// адреса підтримки задана — «Написати в підтримку» має бути посиланням
jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), SUPPORT_EMAIL: 'help@lingualens.test' }));

const t = makeT('en');
const uk = makeT('uk');
const LOCALES = ['en', 'uk', 'de', 'es', 'ru'];

const mounted = [];
afterEach(async () => {
  while (mounted.length) {
    const tree = mounted.pop();
    await act(async () => tree.unmount());
  }
  require('expo-localization').__setLocales(['en-US'], { silent: true });
});

async function mount(el, opts) {
  let tree;
  await act(async () => {
    tree = create(el, opts);
  });
  mounted.push(tree);
  return tree;
}
const dark = (el) => <ThemeProvider value={THEMES.dark}>{el}</ThemeProvider>;
// Те, що людина бачить і чує: невидимий варіант шапки схований від VoiceOver
function shown(n) {
  for (let p = n; p; p = p.parent) if (p.props?.accessibilityElementsHidden) return false;
  return true;
}
const strings = (tree) =>
  tree.root
    .findAll((n) => typeof n.type === 'string' && (typeof n.props?.children === 'string' || Array.isArray(n.props?.children)) && shown(n))
    .flatMap((n) => [n.props.children].flat())
    .filter((c) => typeof c === 'string');
const has = (tree, s) => strings(tree).includes(s);
const hosts = (tree, fn) => tree.root.findAll((n) => typeof n.type === 'string' && fn(n));
function control(tree, text) {
  const hit = tree.root.findAll(
    (n) =>
      typeof n.props.onPress === 'function' &&
      (n.props.accessibilityLabel === text || n.props.title === text || n.findAll((c) => c.props.children === text).length)
  );
  if (!hit.length) throw new Error('no control: ' + text);
  return hit.at(-1);
}
async function tap(tree, text) {
  await act(async () => {
    await control(tree, text).props.onPress();
  });
}
const style = (n) => StyleSheet.flatten(n.props.style) || {};

// ─── onb-01: мова, яку вчать, — окремий перший крок (онбординг 3.0) ────────
// На кроці рівня мова лишилась підписом-пігулкою: обирають її раніше, на
// кроці «Яку мову вчиш?» (докладно — onboarding.test.js).
describe('the language you learn', () => {
  async function toLevel(props = {}) {
    jest.useFakeTimers();
    const onDone = jest.fn();
    const onLanguages = jest.fn();
    const tree = await mount(
      <OnboardingScreen t={t} uiLang="en" onDone={onDone} targetLang="es" nativeLang="en" phoneNative="en" onLanguages={onLanguages} {...props} />
    );
    await tap(tree, t('obStart'));
    await act(async () => control(tree, 'Español, Spanish').props.onPress());
    await act(async () => jest.advanceTimersByTime(300));
    await tap(tree, t('obSkip')); // імʼя
    await tap(tree, t('obSkip')); // звідки
    await tap(tree, t('goal_travel'));
    await tap(tree, t('obNext'));
    jest.useRealTimers();
    return { tree, onDone, onLanguages };
  }
  const pill = (tree) => hosts(tree, (n) => n.props.accessibilityRole === 'button' && /^Language you’re learning:/.test(n.props.accessibilityLabel || ''))[0];

  test('picked on its own step and saved through onLanguages; on the level step it is a plain label', async () => {
    const { tree, onLanguages } = await toLevel();
    expect(onLanguages).toHaveBeenCalledWith({ targetLang: 'es', nativeLang: 'en' });
    expect(has(tree, t('pfLevelTitle'))).toBe(true);
    expect(pill(tree)).toBeUndefined();
    expect(has(tree, 'Español')).toBe(true);
    expect(has(tree, t('obLangChange'))).toBe(false);
  });

  test('a replay with words skips the language step and keeps the label', async () => {
    const replay = await mount(
      <OnboardingScreen t={t} onDone={() => {}} replay hasWords targetLang="es" profile={{ goals: ['travel'], level: 5 }} />
    );
    expect(has(replay, t('obNameTitle'))).toBe(true);
    await tap(replay, t('obNext')); // імʼя (повтор показує поточне)
    await tap(replay, t('obNext')); // цілі
    expect(pill(replay)).toBeUndefined();
    expect(has(replay, 'Español')).toBe(true);
  });

  test('the sheet order: current first, the language of translations hidden', () => {
    const list = langOptions('fr', 'uk').map((l) => l.code);
    expect(list[0]).toBe('fr');
    expect(list).not.toContain('uk');
    expect(list).toHaveLength(LANGS.length - 1);
    expect(new Set(list).size).toBe(list.length);
  });

  test('the plan card names the language with its flag', async () => {
    const tree = await mount(<PlanBody profile={{ goals: ['travel'], level: 5 }} struggles={[]} lang="de" t={t} />);
    expect(has(tree, 'Deutsch')).toBe(true);
    expect(has(tree, '🇩🇪')).toBe(true);
  });
});

// ─── onb-02, onb-03, onb-14: тарифи першими, хрестик над прокруткою ──────────
describe('paywall layout', () => {
  const open = (props) =>
    mount(
      <PaywallScreen plans={PLANS} onClose={() => {}} onPurchase={async () => ({ ok: true })} onRestore={async () => ({})} lang="en" t={t} {...props} />
    );

  test('every reason: the preselected Year with its price comes before any table row or benefit', async () => {
    for (const reason of ['intro', 'scans', 'scene', 'langs', 'info']) {
      const tree = await open({ reason });
      const all = strings(tree);
      const price = all.indexOf('$59.99');
      expect(price).toBeGreaterThan(-1);
      for (const s of [t('cmp_wod'), t('pro_support'), t('tlToday')]) if (all.includes(s)) expect(price).toBeLessThan(all.indexOf(s));
      const year = hosts(tree, (n) => n.props.accessibilityRole === 'radio' && n.props.accessibilityState?.checked)[0];
      expect(year.props.accessibilityLabel).toMatch(/^Year, \$59\.99/);
    }
  });

  test('on a short screen (SE) Lingo makes room for the plans; on a tall one it stays', async () => {
    const mascots = (tree) => tree.root.findAll((n) => n.type?.name === 'MascotBob');
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions', 'get').mockReturnValue(() => ({ width: 375, height: 667, scale: 2, fontScale: 1 }));
    try {
      expect(mascots(await open({ reason: 'scans' }))).toHaveLength(0);
      dims.mockReturnValue(() => ({ width: 440, height: 956, scale: 3, fontScale: 1 }));
      expect(mascots(await open({ reason: 'scans' }))).toHaveLength(1);
    } finally {
      dims.mockRestore();
    }
  });

  test('the close button sits in its own bar above the scroll view, with a 44 pt target', async () => {
    for (const el of [
      <PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="en" t={t} />,
      <OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} onClose={() => {}} onStep={() => {}} />,
    ]) {
      const tree = await mount(el);
      const x = hosts(tree, (n) => n.props.accessibilityLabel === t('close'))[0];
      expect(x).toBeTruthy();
      for (let p = x.parent; p; p = p.parent) expect(p.type).not.toBe(ScrollView);
      expect(style(x).width).toBeGreaterThanOrEqual(44);
      expect(style(x).height).toBeGreaterThanOrEqual(44);
    }
  });

  test('the table reads “Free vs Pro” and leads with the row of this wall', async () => {
    for (const [reason, first] of [
      ['langs', 'cmp_langs'],
      ['scene', 'cmp_scene'],
      ['scans', 'cmp_scans'],
    ]) {
      const tree = await open({ reason });
      const rows = strings(tree).filter((s) => s.startsWith('Scans in total') || s.startsWith('Scenes in total') || s.startsWith('Languages at once') || s === t('cmp_wod'));
      expect(rows[0]).toBe(t(first));
    }
    const tree = await open({ reason: 'langs', t: uk, lang: 'uk' });
    expect(has(tree, 'Безкоштовно')).toBe(true);
    expect(strings(tree).filter((s) => ['Мов одночасно', 'Сканів загалом', 'Сцен загалом'].includes(s))[0]).toBe('Мов одночасно');
    expect(STRINGS.en.colFree).toBe('Free');
    expect(STRINGS.de.colFree).toBe('Gratis');
  });
});

// ─── onb-04: ціни не завантажились ─────────────────────────────────────────
describe('prices that did not load', () => {
  test('the footer explains, hints and offers a purple “Try again”; prices back — the CTA and the legal line return', async () => {
    const onRetry = jest.fn();
    const props = { reason: 'scans', onClose: () => {}, onPurchase: async () => ({}), onRestore: async () => ({}), lang: 'en', t, onRetry };
    const tree = await mount(<PaywallScreen {...props} plans={[]} plansFailed />);
    expect(has(tree, t('pricesFailed'))).toBe(true);
    expect(has(tree, t('pricesFailedHint'))).toBe(true);
    const retry = tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('pricesRetry'));
    expect(retry).toHaveLength(1);
    expect(tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('subscribe'))).toHaveLength(0);
    expect(strings(tree).some((s) => /renews automatically/.test(s))).toBe(false);
    // і в скролі більше нема окремого блоку з помилкою
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(0);
    await act(async () => retry[0].props.onPress());
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => tree.update(<PaywallScreen {...props} plans={PLANS} plansFailed={false} />));
    expect(has(tree, t('pricesFailed'))).toBe(false);
    expect(tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('startTrial'))).toHaveLength(1);
    expect(strings(tree).some((s) => s.startsWith('Free until'))).toBe(true);
  });

  test.each(LOCALES)('%s: the hint exists', (lang) => {
    expect(STRINGS[lang].pricesFailedHint).toBeTruthy();
  });
});

// ─── onb-05: пейвол онбордингу на SE і без нагадувань ──────────────────────
describe('onboarding paywall screens', () => {
  test('no reminder possible: a check instead of the bell', async () => {
    const tree = await mount(<OnboardingPaywall plans={SIMULATED_PLANS} canRemind={false} lang="en" t={t} onClose={() => {}} onStep={() => {}} />);
    await tap(tree, t('obNext'));
    expect(hosts(tree, (n) => n.props.testID === 'opw-check')).toHaveLength(1);
    expect(hosts(tree, (n) => n.props.testID === 'opw-bell')).toHaveLength(0);
  });

  test('on SE: a smaller Lingo and bell', async () => {
    const dims = jest.spyOn(require('react-native'), 'useWindowDimensions', 'get').mockReturnValue(() => ({ width: 375, height: 667, scale: 2, fontScale: 1 }));
    try {
      const tree = await mount(<OnboardingPaywall plans={SIMULATED_PLANS} lang="en" t={t} onClose={() => {}} onStep={() => {}} />);
      expect(tree.root.findAll((n) => n.type?.name === 'MascotBob')[0].props.size).toBe(100);
      await tap(tree, t('obNext'));
      expect(style(hosts(tree, (n) => n.props.testID === 'opw-bell')[0]).width).toBe(76);
      // тісніший таймлайн — під ним ще влазить «скасувати будь-коли»
      expect(tree.root.findByType(TrialTimeline).props.dense).toBe(true);
    } finally {
      dims.mockRestore();
    }
  });
});

// ─── onb-06, onb-15: підвал ────────────────────────────────────────────────
describe('paywall footer', () => {
  const open = (props) =>
    mount(<PaywallScreen reason="intro" plans={PLANS} onClose={() => {}} onRestore={async () => ({})} lang="en" t={t} {...props} />);

  test('Restore, Terms and Privacy are 44 pt targets with extra slop', async () => {
    const tree = await open({ onPurchase: async () => ({ ok: true }) });
    for (const label of [t('restore'), t('terms')]) {
      const link = control(tree, label);
      expect(StyleSheet.flatten(link.props.style).minHeight).toBeGreaterThanOrEqual(44);
      expect(link.props.hitSlop).toEqual({ top: 6, bottom: 6, left: 10, right: 10 });
    }
  });

  test('the free exit is one line in every language', async () => {
    for (const lang of LOCALES) {
      const tl = makeT(lang);
      const tree = await open({ onPurchase: async () => ({}), t: tl, lang, scansLeft: 0 });
      const free = hosts(tree, (n) => n.props.children === tl('pwContinueFreeNoScans'))[0];
      expect(free.props.numberOfLines).toBe(1);
    }
    expect(STRINGS.uk.pwContinueFreeNoScans).toBe('Продовжити безкоштовно');
    expect(STRINGS.de.pwContinueFreeNoScans).toBe('Kostenlos weiter');
    expect(STRINGS.es.pwContinueFreeNoScans).toBe('Seguir gratis');
    expect(STRINGS.ru.pwContinueFreeNoScans).toBe('Продолжить бесплатно');
  });

  // Російська довша за українську, а вузькі місця на SE перевірені саме
  // українською: заголовок кроку сповіщень (у три рядки сповзав телефон),
  // підрядок тарифу (у два рядки «Навсегда» ховалося під кнопку) й підвал
  // пейволу. Тут ширина в em — не більша за українську з запасом 10 %.
  test('ru: the tight SE lines are no wider than the Ukrainian ones', () => {
    const tight = ['obPushTitle', 'obPushText', 'obStreakTitle', 'ob3HookTitle', 'planSubWeek', 'planSubMonth', 'privacy', 'pwContinueFreeNoScans', 'startTrial'];
    const wide = tight.filter((k) => textEm(STRINGS.ru[k]) > textEm(STRINGS.uk[k]) * 1.1).map((k) => `${k}: ${STRINGS.ru[k]}`);
    expect(wide).toEqual([]);
  });

  test('a failed purchase: a two-line note above the legal line, which stays', async () => {
    const tree = await open({ onPurchase: async () => ({ ok: false, uncharged: true, error: 'X' }) });
    await tap(tree, t('startTrial'));
    const note = hosts(tree, (n) => n.props.children === t('purchaseFailed'))[0];
    expect(note.props.numberOfLines).toBe(2);
    expect(style(note).color).toBe(THEMES.light.C.red);
    const all = strings(tree);
    expect(all.indexOf(t('purchaseFailed'))).toBeLessThan(all.findIndex((s) => s.startsWith('Free until')));
  });

  test('Ask to Buy “waiting” is grey status, not a red error', async () => {
    const tree = await open({ onPurchase: async () => ({ ok: false, pending: true }) });
    await tap(tree, t('startTrial'));
    const note = hosts(tree, (n) => n.props.children === t('purchasePending'))[0];
    expect(style(note).color).toBe(THEMES.light.C.dim);
  });

  test('“unclear” offers a real way to contact support', async () => {
    const spy = jest.spyOn(Linking, 'openURL').mockImplementation(async () => {});
    const tree = await open({ onPurchase: async () => ({ ok: false, error: 'NETWORK' }) });
    await tap(tree, t('startTrial'));
    expect(has(tree, t('pwUnclearNote'))).toBe(true);
    await tap(tree, t('pwContactSupport'));
    expect(spy).toHaveBeenCalledWith('mailto:help@lingualens.test');
    spy.mockRestore();
  });
});

// ─── onb-07: кроки відкриваються згори, перелік щільніший ──────────────────
describe('question steps', () => {
  test('each step gets its own scroll view, so it opens at the top', async () => {
    const frame = (key) => (
      <StepFrame stepKey={key} title="T" footer={null} t={t}>
        {null}
      </StepFrame>
    );
    const tree = await mount(frame('field'));
    const first = tree.root.findByType(ScrollView).instance;
    await act(async () => tree.update(frame('level')));
    expect(tree.root.findByType(ScrollView).instance).not.toBe(first);
  });

  test('content taller than the screen: a fade over the footer and one flash of the scroll bar', async () => {
    const flash = jest.fn();
    const tree = await mount(
      <StepFrame stepKey="goals" title="T" footer={null} t={t}>
        {null}
      </StepFrame>,
      { createNodeMock: () => ({ flashScrollIndicators: flash }) }
    );
    const sv = () => tree.root.findByType(ScrollView);
    const fade = () => hosts(tree, (n) => n.props.testID === 'step-fade');
    expect(fade()).toHaveLength(0);
    await act(async () => {
      sv().props.onLayout({ nativeEvent: { layout: { height: 400 } } });
      sv().props.onContentSizeChange(375, 520);
    });
    expect(fade()).toHaveLength(1);
    expect(sv().props.showsVerticalScrollIndicator).toBe(true);
    // доїхали до кінця — згасання вже нічого не ховає
    await act(async () => sv().props.onScroll({ nativeEvent: { contentOffset: { y: 120 } } }));
    expect(fade()).toHaveLength(0);
  });

  test('goal rows are denser but still at least 44 pt', async () => {
    const tree = await mount(<GoalOptions value={[]} onChange={() => {}} t={t} />);
    const row = hosts(tree, (n) => n.props.accessibilityRole === 'checkbox')[0];
    const st = style(row);
    expect(st.paddingVertical).toBe(9);
    // 40 (значок) + 2 × 9 + рамка
    expect(40 + st.paddingVertical * 2).toBeGreaterThanOrEqual(44);
  });

  test.each(LOCALES)('%s: the hospitality chip and topic are short and identical', (lang) => {
    expect(STRINGS[lang].field_hospitality).toBe(STRINGS[lang].topic_hospitality);
    expect(STRINGS[lang].field_hospitality.length).toBeLessThanOrEqual(14);
  });
});

// ─── onb-08: контраст і обраний тариф ──────────────────────────────────────
describe('readable secondary text and the selected plan', () => {
  // WCAG: відносна яскравість і контраст
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);

  test.each(['light', 'dark'])('%s: Skip, plan sublines, the charge date and the X use a 4.5:1 colour', async (theme) => {
    const { C } = THEMES[theme];
    for (const bg of [C.bg, C.card]) expect(ratio(C.dim, bg)).toBeGreaterThanOrEqual(4.5);
    const wrap = (el) => <ThemeProvider value={THEMES[theme]}>{el}</ThemeProvider>;
    const skip = await mount(wrap(<SkipButton onPress={() => {}} t={t} />));
    expect(style(hosts(skip, (n) => n.props.children === t('obSkip'))[0]).color).toBe(C.dim);
    const pw = await mount(wrap(<PaywallScreen reason="intro" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="en" t={t} />));
    expect(style(hosts(pw, (n) => n.props.children === '$4.99 per month · 7 days free')[0]).color).toBe(C.dim);
    const date = hosts(pw, (n) => typeof n.props.children === 'string' && n.props.children.startsWith('  ·  '))[0];
    expect(style(date).color).toBe(C.dim);
  });

  test('plans are a radio group; VoiceOver hears the selected one in full', async () => {
    const tree = await mount(<PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="uk" t={uk} />);
    expect(hosts(tree, (n) => n.props.accessibilityRole === 'radiogroup')).toHaveLength(1);
    const radios = hosts(tree, (n) => n.props.accessibilityRole === 'radio');
    const year = radios.find((r) => r.props.accessibilityState?.checked);
    expect(year.props.accessibilityLabel).toBe('Рік, $59.99, $4.99 на місяць, 7 днів безкоштовно, найвигідніше, −50%');
    expect(radios.filter((r) => r.props.accessibilityState?.checked)).toHaveLength(1);
  });
});

// ─── onb-09: покупка й відновлення показують, що йдуть ─────────────────────
describe('progress during purchase and restore', () => {
  test('GradBtn loading: a full-colour spinner instead of the label, no second press, busy for VoiceOver', async () => {
    const onPress = jest.fn();
    const tree = await mount(<GradBtn title="Buy" onPress={onPress} loading />);
    expect(tree.root.findAllByType(ActivityIndicator)).toHaveLength(1);
    expect(strings(tree)).not.toContain('Buy');
    const btn = hosts(tree, (n) => n.props.accessibilityLabel === 'Buy')[0];
    expect(btn.props.accessibilityState).toMatchObject({ busy: true, disabled: true });
    expect(style(btn).opacity).not.toBe(0.45);
  });

  test('the buy button spins until StoreKit answers', async () => {
    let finish;
    const onPurchase = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(<PaywallScreen reason="intro" plans={PLANS} onClose={() => {}} onPurchase={onPurchase} onRestore={async () => ({})} lang="en" t={t} />);
    const cta = () => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('startTrial'))[0];
    // App Store ще не відповів — не чекаємо на обіцянку, лише на перерендер
    await act(async () => {
      cta().props.onPress();
    });
    expect(cta().props.loading).toBe(true);
    // поки крутиться, другий натиск не запускає другої покупки
    await act(async () => {
      cta().props.onPress();
    });
    expect(onPurchase).toHaveBeenCalledTimes(1);
    await act(async () => finish({ cancelled: true }));
    expect(cta().props.loading).toBe(false);
  });

  test('two taps before the next frame still start one purchase; a thrown error ends the spinner', async () => {
    let finish;
    const onPurchase = jest.fn(() => new Promise((r, reject) => (finish = reject)));
    const tree = await mount(<PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={onPurchase} onRestore={async () => ({})} lang="en" t={t} />);
    const cta = () => tree.root.findAll((n) => n.type === GradBtn && n.props.title === t('startTrial'))[0];
    const press = cta().props.onPress;
    await act(async () => {
      press();
      press();
    });
    expect(onPurchase).toHaveBeenCalledTimes(1);
    await act(async () => finish(new Error('boom')));
    expect(cta().props.loading).toBe(false);
    expect(has(tree, t('pwUnclearNote'))).toBe(true);
  });

  test('a double tap on Restore runs one restore; the alert has a short title and the explanation', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    let finish;
    const onRestore = jest.fn(() => new Promise((r) => (finish = r)));
    const tree = await mount(<PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={onRestore} lang="en" t={t} />);
    const link = control(tree, t('restore'));
    await act(async () => {
      link.props.onPress();
      link.props.onPress();
    });
    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(has(tree, t('restoreBusy'))).toBe(true);
    await act(async () => finish({ pro: false }));
    expect(alert).toHaveBeenCalledWith(t('restoreTitleNone'), t('restoreNothing'));
    expect(has(tree, t('restore'))).toBe(true);
    alert.mockRestore();
  });

  test.each(LOCALES)('%s: restore titles are short', (lang) => {
    for (const k of ['restoreTitleOk', 'restoreTitleNone', 'restoreTitleFail']) expect(STRINGS[lang][k].length).toBeLessThan(35);
  });
});

// ─── onb-10: перший скан — подарунок ───────────────────────────────────────
// Онбординг 3.0: «Спробуй зараз» більше немає — про безкоштовний скан каже
// перший екран пейволу, вже з наліпкою людини (onboarding.md §5.13)
test('the first paywall screen says the free scan is already in the word list, in every language', () => {
  expect(STRINGS.uk.opwFirstWordText).toMatch(/^Твій безкоштовний скан уже в словнику\./);
  expect(STRINGS.en.opwFirstWordText).toMatch(/^Your free scan is already in your word list\./);
  expect(STRINGS.ru.opwFirstWordText).toMatch(/^Твой бесплатный скан уже в словаре\./);
  for (const lang of ['de', 'es']) expect(STRINGS[lang].opwFirstWordText).toEqual(expect.any(String));
  for (const lang of LOCALES) expect(STRINGS[lang]).not.toHaveProperty('obWowText');
});

// ─── onb-11: вітання в темній темі ─────────────────────────────────────────
// Онбординг 3.0: замість картинки — справжня іконка, Lingo на мʼякому колі
// й три предмети з табличками різними мовами; усе з теми, тож темна тема не
// світить білим квадратом.
describe('the welcome screen', () => {
  test('the app icon, Lingo and the three stickers — the same in dark mode', async () => {
    for (const el of [<OnboardingScreen t={t} onDone={() => {}} />, dark(<OnboardingScreen t={t} onDone={() => {}} />)]) {
      const tree = await mount(el);
      expect(hosts(tree, (n) => n.props.testID === 'app-icon')).toHaveLength(1);
      expect(hosts(tree, (n) => n.props.testID === 'welcome-hero')).toHaveLength(1);
      expect(has(tree, t('ob3HookTitle'))).toBe(true);
      expect(has(tree, t('ob3Hello'))).toBe(true);
      // наліпки — ілюстрація: VoiceOver їх не читає, але на екрані вони є
      for (const w of ['mug', 'planta', 'Schlüssel']) expect(hosts(tree, (n) => n.props.children === w).length).toBeGreaterThan(0);
    }
  });
});

// ─── onb-12: після відмови від сповіщень — далі, а не в Параметри ───────────
test('declined notifications: the big button moves on, Settings is a quiet second option', async () => {
  jest.useFakeTimers();
  const spy = jest.spyOn(Linking, 'openSettings').mockImplementation(async () => {});
  const tree = await mount(<OnboardingScreen t={t} uiLang="en" onDone={() => {}} nativeLang="uk" phoneNative="uk" />);
  await tap(tree, t('obStart'));
  await act(async () => control(tree, 'English').props.onPress());
  await act(async () => jest.advanceTimersByTime(300));
  for (let i = 0; i < 5; i++) await tap(tree, t('obSkip'));
  await tap(tree, t('obNext')); // що таке слово дня
  await tap(tree, t('obNext')); // сповіщення → «ні»
  expect(has(tree, 'Okay, no reminders')).toBe(true);
  const buttons = tree.root.findAll((n) => n.type === GradBtn);
  expect(buttons.map((b) => b.props.title)).toEqual([t('obNext')]);
  await tap(tree, t('openSettings'));
  expect(spy).toHaveBeenCalledTimes(1);
  // далі — план (онбординг 4.0: сповіщення перед планом)
  await act(async () => buttons[0].props.onPress());
  expect(has(tree, t('obBuildTitle'))).toBe(true);
  spy.mockRestore();
  jest.useRealTimers();
});

// ─── onb-13: тарифи на місці, підписи без повторів ─────────────────────────
describe('plans stay put and sublines say something new', () => {
  test('intro: both heads share one cell, so switching Month → Year → Lifetime never moves the rows; no table', async () => {
    const tree = await mount(<PaywallScreen reason="intro" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="en" t={t} />);
    const cells = () => hosts(tree, (n) => n.props['aria-hidden'] !== undefined && typeof n.props.style !== 'function');
    expect(cells()).toHaveLength(2);
    for (const name of [t('planMonth'), t('planYear'), t('planLifetime')]) {
      await tap(tree, name);
      expect(cells()).toHaveLength(2);
      expect(cells().filter((c) => c.props['aria-hidden'] === false)).toHaveLength(1);
      expect(has(tree, t('colFree'))).toBe(false);
    }
  });

  test('sublines: Month says how it renews, Year what it costs a month and the trial; no price twice', async () => {
    const tree = await mount(<PaywallScreen reason="scans" plans={PLANS} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="uk" t={uk} />);
    expect(has(tree, 'Щомісяця, скасуй будь-коли')).toBe(true);
    expect(has(tree, '$4.99 на місяць · 7 днів безкоштовно')).toBe(true);
    expect(has(tree, '$9.99 на місяць')).toBe(false);
    await tap(tree, 'Місяць');
    expect(has(tree, '$9.99 на місяць, поновлюється автоматично. Скасувати можна будь-коли в налаштуваннях Apple ID.')).toBe(true);
  });

  test('Year without a trial: “per month” only; its legal line names the price and the period', async () => {
    const plans = PLANS.map((p) => ({ ...p, trialDays: 0 }));
    const tree = await mount(<PaywallScreen reason="info" plans={plans} onClose={() => {}} onPurchase={async () => ({})} onRestore={async () => ({})} lang="en" t={t} />);
    expect(has(tree, '$4.99 per month')).toBe(true);
    expect(has(tree, '$59.99 a year, renews automatically. Cancel anytime in your Apple ID settings.')).toBe(true);
  });

  test.each(LOCALES)('%s: renewal lines mirror the trial ones', (lang) => {
    for (const k of ['Week', 'Month', 'Quarter', 'Year']) expect(STRINGS[lang]['renewLegal' + k]).toContain('{p}');
  });
});

// ─── onb-16: рівень і план без повторів ────────────────────────────────────
describe('level and plan cards say each thing once', () => {
  // Онбординг 4.0: під слайдером — назва рівня й фраза, без «пропускаємо…»
  test('under the slider the level name and its phrase, once each', async () => {
    const tree = await mount(<LevelBody value={5} onChange={() => {}} lang="es" t={uk} />);
    expect(has(tree, 'Середній')).toBe(true);
    expect(strings(tree).filter((s) => s === uk('lvl5'))).toHaveLength(1);
    expect(strings(tree).some((s) => s.includes('5/10'))).toBe(false);
  });

  test('a single topic: the name once and one subline instead of the legend', async () => {
    const tree = await mount(<PlanBody profile={null} struggles={[]} t={uk} />);
    expect(hosts(tree, (n) => n.props.children === 'Загальне')).toHaveLength(1);
    expect(has(tree, uk('obPlanSingleSub'))).toBe(true);
  });

  // План стоїть за два екрани до віджетів: він обіцяє лише те, що людина
  // вже бачила (слово дня, година, хвилина на день), а не «віджет на
  // головному екрані», про який ще не чула (власник, 6.10.2026)
  test.each(LOCALES)('%s: no plan line promises the widgets shown only later; “no time” is the word of the day at your hour', async (lang) => {
    const tl = makeT(lang);
    const tree = await mount(<PlanBody profile={{ goals: ['travel'], level: 5 }} struggles={['forget', 'time', 'boring', 'start']} t={tl} />);
    const shown = strings(tree).join('\n');
    expect(shown).toContain(tl('plan_time'));
    expect(shown).not.toMatch(/widget|віджет|виджет/i);
    for (const k of ['plan_forget', 'plan_time', 'plan_boring', 'plan_start']) expect([k, tl(k)]).not.toEqual([k, expect.stringMatching(/widget|віджет|виджет/i)]);
    expect(tl('plan_time').toLocaleLowerCase(lang)).toContain(tl('wordOfDay').toLocaleLowerCase(lang));
  });

  test('uk copy of the “no time” line is exact', () => {
    expect(uk('plan_time')).toBe('Хвилина на день: одне слово дня в зручну тобі годину');
    expect(t('plan_time')).toBe('A minute a day: one word of the day at an hour that suits you');
  });
});

// ─── onb-17: сповіщення в два рядки, година як на телефоні ─────────────────
describe('the notification preview', () => {
  test('the hour follows the phone: 10:00 AM in English, 10:00 in Ukrainian', () => {
    require('expo-localization').__setLocales(['en-US'], { silent: true });
    expect(hourLabel(10)).toMatch(/^10:00\sAM$/u);
    require('expo-localization').__setLocales(['uk-UA'], { silent: true });
    expect(hourLabel(10)).toBe('10:00');
    // 24-годинний формат без AM/PM; нуль попереду — як вирішить ICU платформи
    expect(hourLabel(8)).toMatch(/^0?8:00$/);
  });

  // Онбординг 4.0: тіло сповіщення — приклад слова з перекладом. Воно
  // коротке, тож у два рядки на SE влазить завжди; заголовок з темою теж
  // може лягти у два — жодних обірваних «…» (власник)
  test('the banner shows that hour and the example word, never cut', async () => {
    const sample = { word: 'die Tasse', translation: 'чашка', example: 'In dieser Tasse ist heißer Kaffee.' };
    const tree = await mount(<PushPreview topic="Gastronomie" hour="10:00 AM" sample={sample} t={t} />);
    expect(has(tree, '10:00 AM')).toBe(true);
    const body = hosts(tree, (n) => n.props.children === 'die Tasse · чашка')[0];
    expect(body.props.numberOfLines).toBe(2);
    const title = hosts(tree, (n) => n.props.children === 'Word of the day · Gastronomie')[0];
    expect(title.props.numberOfLines).toBe(2);
  });
});

// ─── onb-18: «Тримай довше» ────────────────────────────────────────────────
describe('hold to commit: a tap is not ignored', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    AccessibilityInfo.isReduceMotionEnabled.mockImplementation(() => Promise.resolve(false));
    AccessibilityInfo.isScreenReaderEnabled.mockImplementation(() => Promise.resolve(false));
  });
  afterEach(() => jest.useRealTimers());
  const LABELS = { label: 'Promise', holdHint: 'Press and hold', tapHint: 'Tap to promise', longerHint: 'Hold a little longer', doneText: 'Deal!' };
  const button = (tree) => tree.root.find((n) => n.props.testID === 'hold-to-commit' && 'onPressIn' in n.props);
  const hint = (tree) => hosts(tree, (n) => n.props.accessibilityLiveRegion === 'polite')[0];
  const advance = (ms) => act(async () => jest.advanceTimersByTime(ms));
  async function quickTap(tree) {
    await act(async () => button(tree).props.onPressIn());
    await advance(100);
    await act(async () => button(tree).props.onPressOut());
  }

  test('a short press says “hold longer” in the accent colour with a light tap; the third attempt is a plain tap', async () => {
    const onCommit = jest.fn();
    const tree = await mount(<HoldToCommit onCommit={onCommit} {...LABELS} />);
    await act(async () => {});
    await quickTap(tree);
    expect(hint(tree).props.children).toBe('Hold a little longer');
    expect(style(hint(tree)).color).toBe(THEMES.light.C.accent);
    expect(Haptics.impactAsync).toHaveBeenLastCalledWith('light');
    await advance(NUDGE_MS + 10);
    expect(hint(tree).props.children).toBe('Press and hold');
    expect(button(tree).props.onPress).toBeUndefined();

    await quickTap(tree);
    expect(onCommit).not.toHaveBeenCalled();
    await advance(NUDGE_MS + 10);
    // дві спроби — кільце стало звичайною кнопкою
    expect(hint(tree).props.children).toBe('Tap to promise');
    await act(async () => button(tree).props.onPress());
    expect(onCommit).toHaveBeenCalledTimes(1);
  });

  test('a real attempt released past a third of the ring is not a tap', async () => {
    const tree = await mount(<HoldToCommit onCommit={() => {}} {...LABELS} />);
    await act(async () => {});
    await act(async () => button(tree).props.onPressIn());
    await advance(HOLD_MS * 0.5);
    await act(async () => button(tree).props.onPressOut());
    expect(hint(tree).props.children).toBe('Press and hold');
  });
});
