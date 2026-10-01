// Релізна збірка без ключа RevenueCat: купити нічого не можна, тож і
// вигаданих USD-цін із «7 днів безкоштовно» людина бачити не має.
import { act, create } from 'react-test-renderer';
import { MODE, usePro } from '../src/purchases';

jest.mock('../src/config', () => ({ ...jest.requireActual('../src/config'), REVENUECAT_IOS_KEY: '', IS_DEV: false }));

let hook;
function Harness() {
  hook = usePro('u1');
  return null;
}

test('no plans, and restore says purchases are unavailable', async () => {
  expect(MODE).toBe('unavailable');
  let tree;
  await act(async () => {
    tree = create(<Harness />);
  });
  expect(hook.plans).toEqual([]);
  let res;
  await act(async () => {
    res = await hook.restore();
  });
  expect(res).toEqual({ error: 'UNAVAILABLE' });
  await act(async () => tree.unmount());
});
