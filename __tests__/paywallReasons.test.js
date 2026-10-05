// Пейвол v1.3 (W5): причини «themes» і «wod_per_day», таблиця порівняння й
// переваги Pro з прапорців (план §5.12). «themes» показує мініекран у палітрі,
// на яку людина натиснула, і п'ять кружечків, що його перефарбовують; тарифи
// з ціною й надалі перші під заголовком (App Review 3.1.2). У таблиці немає
// ні ліміту колекції, ні захисту серії — у v1.3 їх немає в застосунку.
// Наприкінці — пейвол RevenueCat для «themes»: шаблон палітр не знає, тож
// куплене там застосовує ту, на яку людина натиснула.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import RevenueCatUI from 'react-native-purchases-ui';

import App from '../App';
import PaywallScreen from '../src/PaywallScreen';
import SettingsScreen from '../src/SettingsScreen';
import { PLANS, comparison, proBenefits, topBenefits } from '../src/subscription';
import { THEMES, ThemeProvider } from '../src/theme';
import { STRINGS, makeT } from '../src/i18n';
import { ACHIEVEMENTS } from '../src/achievements';

// Пейвол RevenueCat — лише для блоку «в застосунку» внизу: компонентові
// PaywallScreen магазин байдужий.
jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: 'test_key' }));
jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    PURCHASES_ERROR_CODE: { PURCHASE_CANCELLED_ERROR: '1', PAYMENT_PENDING_ERROR: '20' },
    LOG_LEVEL: { WARN: 'WARN' },
    setLogLevel: jest.fn(async () => {}),
    configure: jest.fn(),
    enableAdServicesAttributionTokenCollection: jest.fn(async () => {}),
    addCustomerInfoUpdateListener: jest.fn(),
    removeCustomerInfoUpdateListener: jest.fn(),
    getCustomerInfo: jest.fn(),
    getOfferings: jest.fn(),
    checkTrialOrIntroductoryPriceEligibility: jest.fn(async () => ({})),
    getAppUserID: jest.fn(async () => '$RCAnonymousID:x'),
    logIn: jest.fn(),
    purchasePackage: jest.fn(),
    restorePurchases: jest.fn(),
    showManageSubscriptions: jest.fn(async () => {}),
    trackCustomPaywallImpression: jest.fn(async () => {}),
  },
}));
const sdk = require('react-native-purchases').default;

jest.setTimeout(20000);

const t = makeT('en');
const uk = makeT('uk');

// Невидиму шапку мʼякого пейволу (Stable) людина не бачить і не чує
function shown(n) {
  for (let p = n; p; p = p.parent) if (p.props?.accessibilityElementsHidden) return false;
  return true;
}
const strings = (tree) =>
  tree.root
    .findAllByType(Text)
    .filter(shown)
    .map((n) => [].concat(n.props.children).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter(Boolean);
const bg = (n) => StyleSheet.flatten(n.props.style)?.backgroundColor;
const host = (tree, id) => tree.root.findAll((n) => n.props.testID === id && typeof n.type === 'string')[0];

let mounted = [];
let spies = [];
afterEach(async () => {
  for (const tree of mounted) await act(async () => tree.unmount());
  mounted = [];
  // розмір екрана — підмінений на весь тест: перерендер бере той самий хук
  for (const spy of spies) spy.mockRestore();
  spies = [];
});

async function render(props = {}, { theme = THEMES.light, height = 852 } = {}) {
  for (const spy of spies) spy.mockRestore();
  spies = [
    jest
      .spyOn(require('react-native'), 'useWindowDimensions', 'get')
      .mockReturnValue(() => ({ width: height > 700 ? 393 : 375, height, scale: 3, fontScale: 1 })),
  ];
  let tree;
  await act(async () => {
    tree = create(
      <ThemeProvider value={theme}>
        <PaywallScreen
          reason="info"
          plans={PLANS}
          onClose={() => {}}
          onPurchase={async () => ({ ok: true })}
          onRestore={async () => ({})}
          lang="en"
          t={t}
          {...props}
        />
      </ThemeProvider>
    );
  });
  mounted.push(tree);
  return tree;
}

describe('the themes paywall', () => {
  const preview = (tree) => host(tree, 'theme-preview');
  const dot = (tree, key) => tree.root.findAll((n) => n.props.testID === 'palette-dot-' + key && n.props.onPress)[0];
  // фон картки слова й кнопки «Зберегти» в прев'ю
  const fills = (tree) => preview(tree).findAll((n) => typeof n.type === 'string' && bg(n)).map(bg);

  test('its own title and text, a preview instead of Lingo, opened on the tapped palette', async () => {
    const tree = await render({ reason: 'themes', palette: 'berry' });
    const all = strings(tree);
    expect(all).toEqual(expect.arrayContaining([t('pwThemesTitle'), t('pwThemesText')]));
    expect(tree.root.findAll((n) => n.type?.name === 'MascotBob')).toHaveLength(0);
    const P = THEMES['berry-light'].C;
    expect(bg(preview(tree))).toBe(P.bg);
    expect(fills(tree)).toEqual(expect.arrayContaining([P.card, P.accent, P.accentSoft, P.card2]));
    expect(preview(tree).props.accessibilityLabel).toBe('How the app looks in Berry');
    expect(dot(tree, 'berry').props.accessibilityState).toEqual({ checked: true });
  });

  test('five dots in the palette accents; a tap repaints the preview and tells the App', async () => {
    const onPalette = jest.fn();
    const tree = await render({ reason: 'themes', palette: 'berry', onPalette });
    for (const k of ['chalk', 'ocean', 'berry', 'graphite', 'cocoa']) {
      expect(dot(tree, k).props.accessibilityLabel).toBe(t('palette_' + k));
      const fill = dot(tree, k).findAll((n) => typeof n.type === 'string' && bg(n) === THEMES[k === 'chalk' ? 'light' : k + '-light'].C.accent);
      expect(fill.length).toBeGreaterThan(0);
    }
    await act(async () => dot(tree, 'ocean').props.onPress());
    expect(onPalette).toHaveBeenCalledWith('ocean');
    expect(bg(preview(tree))).toBe(THEMES['ocean-light'].C.bg);
    expect(dot(tree, 'ocean').props.accessibilityState).toEqual({ checked: true });
    expect(dot(tree, 'berry').props.accessibilityState).toEqual({ checked: false });
    // та сама — нічого
    await act(async () => dot(tree, 'ocean').props.onPress());
    expect(onPalette).toHaveBeenCalledTimes(1);
  });

  test('without a palette it opens on the first Pro palette', async () => {
    const tree = await render({ reason: 'themes' });
    expect(bg(preview(tree))).toBe(THEMES['ocean-light'].C.bg);
  });

  test('in a dark app the preview and the dots are the dark look of each palette', async () => {
    const tree = await render({ reason: 'themes', palette: 'cocoa' }, { theme: THEMES.dark });
    expect(bg(preview(tree))).toBe(THEMES['cocoa-dark'].C.bg);
    const g = dot(tree, 'graphite').findAll((n) => typeof n.type === 'string' && bg(n) === THEMES['graphite-dark'].C.accent);
    expect(g.length).toBeGreaterThan(0);
  });

  test('the person’s word of the day when there is one, a sample otherwise', async () => {
    let tree = await render({ reason: 'themes', previewWord: { word: 'la taza', ipa: '/la ˈtaθa/', translation: 'the cup' } });
    let all = strings(tree);
    expect(all).toEqual(expect.arrayContaining(['la taza', 'the cup']));
    tree = await render({ reason: 'themes', t: uk, lang: 'uk' });
    all = strings(tree);
    expect(all).toEqual(expect.arrayContaining(['boarding pass', 'посадковий талон', 'СЛОВО ДНЯ']));
  });

  test('the plans with prices still come first; the table leads with color themes', async () => {
    const tree = await render({ reason: 'themes' });
    const all = strings(tree);
    const price = all.indexOf('$59.99');
    expect(price).toBeGreaterThan(-1);
    expect(price).toBeLessThan(all.indexOf(t('cmp_themes')));
    const rows = all.filter((s) => [t('cmp_scans'), t('cmp_themes'), t('cmp_wodn'), t('cmp_core')].includes(s));
    expect(rows[0]).toBe(t('cmp_themes'));
    // «—» VoiceOver читає «немає»; у Pro — чотири палітри
    const dash = tree.root.findAll((n) => n.type === 'Text' && n.props.children === '—')[0];
    expect(dash.props.accessibilityLabel).toBe(t('cmpNone'));
    expect(all).toContain('4');
  });

  test('on an SE the preview is compact and the plans still sit above the footer', async () => {
    const tree = await render({ reason: 'themes', palette: 'ocean' }, { height: 667 });
    const all = strings(tree);
    expect(preview(tree)).toBeTruthy();
    // без рядка кнопок: «Знаю» немає, «Зберегти» поруч зі словом
    expect(preview(tree).findAll((n) => n.type === 'Text' && n.props.children === t('wodKnow'))).toHaveLength(0);
    expect(preview(tree).findAll((n) => n.type === 'Text' && n.props.children === t('saveWord')).length).toBeGreaterThan(0);
    expect(all.indexOf('$59.99')).toBeGreaterThan(-1);
    expect(all.indexOf('$59.99')).toBeLessThan(all.indexOf(t('cmp_themes')));
  });

  test('the palette names in the text are the tile names, in every language', () => {
    for (const lang of ['en', 'uk', 'de', 'es']) {
      const s = STRINGS[lang];
      for (const k of ['ocean', 'berry', 'graphite', 'cocoa']) expect([lang, s.pwThemesText.includes(s['palette_' + k])]).toEqual([lang, true]);
    }
  });
});

describe('the words-per-day paywall', () => {
  test('its own title with the biggest Pro option, and the table leads with it', async () => {
    const tree = await render({ reason: 'wod_per_day' });
    const all = strings(tree);
    expect(all).toEqual(expect.arrayContaining(['Up to 5 words a day with Pro', t('pwWodText')]));
    const rows = all.filter((s) => [t('cmp_scans'), t('cmp_themes'), t('cmp_wodn'), t('cmp_core')].includes(s));
    expect(rows[0]).toBe(t('cmp_wodn'));
    expect(all).toContain('up to 5');
    // Lingo — як на інших стінах
    expect(tree.root.findAll((n) => n.type?.name === 'MascotBob')).toHaveLength(1);
  });

  test('Ukrainian reads naturally', async () => {
    const tree = await render({ reason: 'wod_per_day', t: uk, lang: 'uk' });
    const all = strings(tree);
    expect(all).toEqual(
      expect.arrayContaining([
        'До 5 слів на день — у Pro',
        'У сповіщеннях і віджеті, о годинах, які обереш. Перше слово дня лишається безкоштовним.',
        'Слова дня',
        'до 5',
      ])
    );
  });
});

describe('the table and the benefits follow the flags', () => {
  test('by default: scans, scenes, languages, words of the day, themes, the free core — and never a word cap or streak freezes', () => {
    const ids = comparison().map((r) => r.id);
    expect(ids).toEqual(['scans', 'scene', 'langs', 'wodn', 'themes', 'core']);
    for (const gone of ['words', 'freeze', 'srs', 'speech', 'wod']) expect(ids).not.toContain(gone);
    for (const lang of ['en', 'uk', 'de', 'es']) {
      expect(STRINGS[lang].cmp_words).toBeUndefined();
      expect(STRINGS[lang].cmp_freeze).toBeUndefined();
    }
  });

  test('no words-of-the-day options: that row goes and the plain “Word of the day ✓ / ✓” comes back', () => {
    const rows = comparison({ wodOptions: [] });
    expect(rows.map((r) => r.id)).toEqual(['scans', 'scene', 'langs', 'wod', 'themes', 'core']);
    expect(rows.find((r) => r.id === 'wod')).toEqual({ id: 'wod', free: true, pro: true });
    expect(comparison({ wodOptions: [2, 3] }).find((r) => r.id === 'wodn').pro).toBe(3);
  });

  test('palettes off: no themes row and no themes benefit', () => {
    expect(comparison({ palettes: false }).map((r) => r.id)).not.toContain('themes');
    expect(proBenefits({ palettes: false }).map((b) => b.id)).not.toContain('themes');
  });

  test('the headline four: scans, scenes, words of the day, themes — languages step in for what is off', () => {
    expect(topBenefits(proBenefits()).map((b) => b.id)).toEqual(['scans', 'scene', 'wodn', 'themes']);
    expect(topBenefits(proBenefits({ palettes: false })).map((b) => b.id)).toEqual(['scans', 'scene', 'wodn', 'langs']);
    expect(topBenefits(proBenefits({ wodOptions: [], palettes: false })).map((b) => b.id)).toEqual(['scans', 'scene', 'langs']);
    expect(proBenefits().find((b) => b.id === 'wodn').n).toBe(5);
  });

  test('new rows wear a quiet “new” tag; the rest do not', async () => {
    const tree = await render({ reason: 'info' });
    const tags = tree.root.findAll((n) => n.type === 'Text' && n.props.children === t('cmpNew'));
    expect(tags).toHaveLength(2);
    expect(comparison().filter((r) => r.fresh).map((r) => r.id)).toEqual(['wodn', 'themes']);
  });

  test('the soft paywall lists the headline four with their own icons', async () => {
    const tree = await render({ reason: 'intro' });
    const all = strings(tree);
    expect(all).toEqual(expect.arrayContaining([t('pro_scans'), t('pro_scene'), 'Up to 5 words of the day, at times you choose', t('pro_themes')]));
    expect(all).not.toContain(t('pro_support'));
  });

  test('every reason the app opens has its own title', async () => {
    for (const reason of ['scans', 'scene', 'langs', 'themes', 'wod_per_day']) {
      const tree = await render({ reason });
      expect([reason, strings(tree).includes(t('pwTitle'))]).toEqual([reason, false]);
    }
  });
});

// ---------- У застосунку: пейвол RevenueCat для «themes» ----------
describe('the RevenueCat paywall for themes', () => {
  const metrics = { frame: { x: 0, y: 0, width: 393, height: 852 }, insets: { top: 59, left: 0, right: 0, bottom: 34 } };
  const FREE_INFO = { entitlements: { active: {} } };
  const PRO_INFO = {
    entitlements: {
      active: {
        lingualens_pro: { periodType: 'NORMAL', willRenew: true, productIdentifier: 'yearly', expirationDateMillis: Date.now() + 30 * 864e5 },
      },
    },
  };
  const offering = {
    current: {
      identifier: 'default',
      metadata: { paywall_ui: 'revenuecat' },
      availablePackages: [{ packageType: 'ANNUAL', product: { identifier: 'yearly', price: 59.99, priceString: '$59.99', introPrice: null } }],
    },
  };
  let info;
  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem('ll_onboarded_v1', '1');
    await AsyncStorage.setItem('ll_settings_v1', JSON.stringify({ nativeLang: 'en', targetLang: 'es', theme: 'dark' }));
    await AsyncStorage.setItem('ll_seen_ach_v1', JSON.stringify(ACHIEVEMENTS.map((a) => a.id)));
    jest.clearAllMocks();
    info = FREE_INFO;
    sdk.getCustomerInfo.mockImplementation(async () => info);
    sdk.logIn.mockImplementation(async () => ({ customerInfo: info }));
    sdk.getOfferings.mockImplementation(async () => offering);
    global.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
  });

  async function run(fn) {
    await act(async () => {
      await fn();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
  async function renderApp() {
    let tree;
    await act(async () => {
      tree = create(
        <SafeAreaProvider initialMetrics={metrics}>
          <App />
        </SafeAreaProvider>
      );
    });
    mounted.push(tree);
    for (let i = 0; i < 5; i++) await run(async () => {});
    await run(() => tree.root.findAll((n) => n.props.tb?.key === 'settings')[0].props.onPress());
    return tree;
  }
  const settings = (tree) => tree.root.findAllByType(SettingsScreen)[0];

  test('bought in the RevenueCat paywall: the app takes the palette that was tapped', async () => {
    RevenueCatUI.presentPaywall.mockImplementation(async () => {
      info = PRO_INFO;
      return 'PURCHASED';
    });
    const tree = await renderApp();
    await run(() => settings(tree).props.openPaywall('themes', { palette: 'berry' }));
    expect(RevenueCatUI.presentPaywall).toHaveBeenCalledTimes(1);
    expect(tree.root.findAllByType(PaywallScreen)).toHaveLength(0);
    expect(settings(tree).props.themeKey).toBe('berry-dark');
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).palette).toBe('berry');
  });

  test('closed without buying: nothing changes', async () => {
    RevenueCatUI.presentPaywall.mockImplementation(async () => 'CANCELLED');
    const tree = await renderApp();
    await run(() => settings(tree).props.openPaywall('themes', { palette: 'berry' }));
    expect(settings(tree).props.themeKey).toBe('dark');
    expect(JSON.parse(await AsyncStorage.getItem('ll_settings_v1')).palette).not.toBe('berry');
  });
});
