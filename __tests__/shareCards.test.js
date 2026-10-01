// Картка досягнення не вдає давнє сьогоднішнім і не суперечить сама собі.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ShareCard } from '../src/share/ShareCards';
import { CARD_H, CARD_W, CUTOUT_H, CUTOUT_W, PALETTES, dateLabel } from '../src/share/layout';
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

// «Без тла»: знімається лише наліпка з табличкою — прозорий блок без тла.
describe('cutout card', () => {
  const word = { word: 'mug', translation: 'кружка', lang: 'en', photo: 'file:///docs/stickers/mug.jpg', addedAt: 1 };
  const flat = (style) => StyleSheet.flatten(style) || {};
  // ref отримує «нативний» вузол — тут сам елемент, щоб глянути на його стиль
  const nodeMock = { createNodeMock: (el) => el };

  async function render(template, pal) {
    let tree;
    let captured = null;
    await act(async () => {
      tree = create(
        <ShareCard payload={{ kind: 'word', word }} template={template} pal={pal} t={t} locale={locale} cardRef={(r) => (captured = r)} />,
        nodeMock
      );
    });
    return { tree, captured };
  }

  test.each(PALETTES.map((p) => [p.key, p]))('%s: the captured view is the sticker block, without a background', async (_, pal) => {
    const { tree, captured } = await render('cutout', pal);
    const style = flat(captured.props.style);
    expect(style).toMatchObject({ width: CUTOUT_W, height: CUTOUT_H });
    expect(style.backgroundColor).toBeUndefined();
    // рамка 9:16 з кольором палітри лишається лише для прев'ю
    const frame = tree.root.findAll((n) => typeof n.type === 'string' && flat(n.props.style).height === CARD_H)[0];
    expect(flat(frame.props.style).backgroundColor).toBe(pal.bg);
    await act(async () => tree.unmount());
  });

  test('the label shows the word and its translation in the tile colours', async () => {
    const pal = PALETTES[1];
    const { tree } = await render('cutout', pal);
    expect(texts(tree)).toEqual(expect.arrayContaining(['mug', 'кружка']));
    const chip = tree.root.findAll((n) => typeof n.type === 'string' && flat(n.props.style).backgroundColor === pal.tile)[0];
    const label = chip.findAll((n) => n.props?.children === 'mug')[0];
    expect(flat(label.props.style).color).toBe(pal.onTile);
    await act(async () => tree.unmount());
  });

  test('other templates still capture the whole 9:16 card', async () => {
    const { tree, captured } = await render('minimal', PALETTES[0]);
    expect(flat(captured.props.style)).toMatchObject({ width: CARD_W, height: CARD_H, backgroundColor: PALETTES[0].bg });
    await act(async () => tree.unmount());
  });
});
