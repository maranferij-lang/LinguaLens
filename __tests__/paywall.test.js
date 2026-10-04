// Пейвол каже правду: період у юридичному рядку — той, що в обраного тарифу;
// без магазину немає вигаданих цін; безкоштовна стеля — та, що на сервері.
import { act, create } from 'react-test-renderer';
import PaywallScreen from '../src/PaywallScreen';
import { PLANS } from '../src/subscription';
import { makeT } from '../src/i18n';

const t = makeT('en');
const texts = (tree) =>
  tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

async function render(props) {
  let tree;
  await act(async () => {
    tree = create(
      <PaywallScreen
        reason="info"
        plans={[]}
        onClose={() => {}}
        onPurchase={async () => ({ ok: true })}
        onRestore={async () => ({})}
        lang="en"
        t={t}
        {...props}
      />
    );
  });
  return tree;
}

test('a trial on a monthly plan renews monthly, not yearly', async () => {
  const month = { ...PLANS.find((p) => p.id === 'month'), price: '€6,99', trialDays: 3 };
  const tree = await render({ plans: [month] });
  const legal = texts(tree).find((s) => s.startsWith('Free until'));
  expect(legal).toMatch(/then €6,99 a month unless/);
  await act(async () => tree.unmount());
});

test('without a store: no prices, the reason up front, buying disabled', async () => {
  const tree = await render({ plans: [], unavailable: true });
  const all = texts(tree);
  expect(all).toContain(t('purchasesUnavailable'));
  expect(all).toContain(t('restore'));
  expect(all).not.toContain(t('startTrial'));
  const buy = tree.root.findAll((n) => n.props.title === t('subscribe'))[0];
  expect(buy.props.disabled).toBe(true);
  await act(async () => tree.unmount());
});

test('the scans paywall states the server’s free limit', async () => {
  const tree = await render({ reason: 'scans', freeScans: 3, plans: PLANS });
  const all = texts(tree);
  expect(all).toContain(t('pwScansText', { n: 3 }));
  expect(all).toContain('3'); // клітинка «зараз» у таблиці
  await act(async () => tree.unmount());
});

// Мʼякий пейвол після першого скану: таймлайн пробного періоду замість
// таблиці й окрема кнопка «Продовжити безкоштовно». «Безкоштовно» —
// лише над тарифом, у якого справді є пробний період (App Review 3.1.2).
describe('intro after the first scan', () => {
  // Дерево розмонтовуємо й тоді, коли перевірка впала: інакше маскот
  // гойдався б далі, і jest не завершився б.
  let mounted = null;
  afterEach(async () => {
    if (mounted) await act(async () => mounted.unmount());
    mounted = null;
  });
  const open = async (props) => (mounted = await render(props));
  // Рядки таймлайну — «День 7» і дата в одному Text, тож беремо й рядки з масивів
  const strings = (tree) =>
    tree.root
      .findAll((n) => typeof n.props?.children === 'string' || Array.isArray(n.props?.children))
      .flatMap((n) => [n.props.children].flat())
      .filter((c) => typeof c === 'string');

  const press = (tree, text) =>
    act(async () => {
      const hit = tree.root.findAll(
        (n) => typeof n.props.onPress === 'function' && n.findAll((c) => c.props.children === text).length
      );
      await hit.at(-1).props.onPress();
    });

  test('trial timeline with the store price, no comparison table, a real way out', async () => {
    const onClose = jest.fn();
    const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 1, onClose });
    const all = strings(tree);
    expect(all).toEqual(
      expect.arrayContaining([
        t('pwIntroTitle'),
        t('tlToday'),
        t('tlTodayText'),
        t('tlDay', { n: 5 }),
        t('tlRemindText'),
        t('tlDay', { n: 7 }),
        t('tlChargeText', { p: '$34.99' }),
        'Continue for free — 1 scan a day',
        t('terms'),
        t('restore'),
      ])
    );
    expect(all).not.toContain(t('colFree'));
    expect(tree.root.findAll((n) => n.props.title === t('startTrial')).length).toBeGreaterThan(0);
    await press(tree, 'Continue for free — 1 scan a day');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(tree.root.findAll((n) => n.props.accessibilityLabel === t('close') && n.props.onPress).length).toBeGreaterThan(0);
  });

  test('the free option counts scans with the right plural', async () => {
    const uk = makeT('uk');
    for (const [n, text] of [
      [1, 'Продовжити безкоштовно — 1 скан щодня'],
      [3, 'Продовжити безкоштовно — 3 скани щодня'],
      [5, 'Продовжити безкоштовно — 5 сканів щодня'],
    ]) {
      const tree = await open({ reason: 'intro', plans: PLANS, freeScans: n, t: uk });
      expect(strings(tree)).toContain(text);
      await act(async () => tree.unmount());
      mounted = null;
    }
  });

  test('no reminder is promised when notifications cannot be sent', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS, canRemind: false });
    const all = strings(tree);
    expect(all).toContain(t('tlDay', { n: 7 }));
    expect(all).not.toContain(t('tlRemindText'));
  });

  test('a plan without a trial: no “free” title and no timeline over a button that charges today', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS, freeScans: 5 });
    await press(tree, t('planMonth'));
    const all = strings(tree);
    expect(all).not.toContain(t('pwIntroTitle'));
    expect(all).not.toContain(t('tlToday'));
    expect(all).toContain(t('pwTitle'));
    expect(all).toContain(t('colFree'));
    expect(all).toContain('Continue for free — 5 scans a day');
    expect(tree.root.findAll((n) => n.props.title === t('subscribe')).length).toBeGreaterThan(0);
  });

  test('no trial in the offering at all: the regular paywall plus the free option', async () => {
    const tree = await open({ reason: 'intro', plans: PLANS.map(({ trialDays, ...p }) => p) });
    const all = strings(tree);
    expect(all).toContain(t('pwTitle'));
    expect(all).not.toContain(t('tlToday'));
    expect(all.some((s) => s.startsWith('Continue for free'))).toBe(true);
  });
});
