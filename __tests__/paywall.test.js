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
