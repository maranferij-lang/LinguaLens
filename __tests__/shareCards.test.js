// Картка досягнення не вдає давнє сьогоднішнім і не суперечить сама собі.
import { act, create } from 'react-test-renderer';
import { ShareCard } from '../src/share/ShareCards';
import { PALETTES, dateLabel } from '../src/share/layout';
import { makeT } from '../src/i18n';

const t = makeT('en');
const locale = 'en-GB';
const texts = (tree) =>
  tree.root.findAll((n) => typeof n.props?.children === 'string').map((n) => n.props.children);

async function card(payload) {
  let tree;
  await act(async () => {
    tree = create(<ShareCard payload={payload} template="achievement" pal={PALETTES[0]} t={t} locale={locale} />);
  });
  return tree;
}

const monthStreak = { id: 'streak_30', tier: 3, goal: 30, metric: 'streak' };

test('shared later from the profile: neutral header, no date, the streak it was earned for', async () => {
  const tree = await card({ kind: 'achievement', achievement: monthStreak, stats: { words: 1, streak: 2 } });
  const all = texts(tree);
  expect(all).toContain(t('shareMyAch'));
  expect(all).not.toContain(t('shareUnlocked'));
  expect(all).not.toContain(dateLabel(Date.now(), locale));
  expect(all).toEqual(expect.arrayContaining(['30', 'day streak', '1', 'word collected']));
  expect(all).not.toContain('2');
  await act(async () => tree.unmount());
});

test('fresh from the toast: “unlocked” and today’s date', async () => {
  const first = { id: 'first_word', tier: 1, goal: 1, metric: 'words' };
  const tree = await card({ kind: 'achievement', achievement: first, fresh: true, stats: { words: 1, streak: 3 } });
  const all = texts(tree);
  expect(all).toContain(t('shareUnlocked'));
  expect(all).toContain(dateLabel(Date.now(), locale));
  // не серійне досягнення — серія справжня, сьогоднішня
  expect(all).toEqual(expect.arrayContaining(['3', 'day streak']));
  await act(async () => tree.unmount());
});
