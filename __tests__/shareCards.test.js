// Картка досягнення не вдає давнє сьогоднішнім і не суперечить сама собі.
import { StyleSheet } from 'react-native';
import { act, create } from 'react-test-renderer';
import { ShareCard } from '../src/share/ShareCards';
import { CARD_H, CARD_W, PALETTES, dateLabel, templatesFor } from '../src/share/layout';
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

// Картки слова: прозорий шаблон «Без тла» пішов у режим «Наліпка»
// (Stickers.js, stickers.test.js), тож кожна картка знімається цілою 9:16
// з кольором палітри.
describe('word cards', () => {
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

  test.each(templatesFor({ kind: 'word', word }))('%s captures the whole 9:16 card in the palette colour', async (template) => {
    for (const pal of PALETTES) {
      const { tree, captured } = await render(template, pal);
      expect(flat(captured.props.style)).toMatchObject({ width: CARD_W, height: CARD_H, backgroundColor: pal.bg });
      await act(async () => tree.unmount());
    }
  });

  test('the old cutout template renders nothing of its own any more', async () => {
    const { tree, captured } = await render('cutout', PALETTES[0]);
    // лише порожня рамка картки — жодного блоку наліпки з табличкою
    expect(flat(captured.props.style)).toMatchObject({ width: CARD_W, height: CARD_H });
    expect(texts(tree)).not.toContain('mug');
    await act(async () => tree.unmount());
  });

  test('the photo card is called «Object» now: «Sticker» is the transparent mode', () => {
    expect(makeT('en')('shareTplSticker')).toBe('Object');
    expect(makeT('uk')('shareTplSticker')).toBe('Предмет');
    expect(makeT('de')('shareTplSticker')).toBe('Gegenstand');
    expect(makeT('es')('shareTplSticker')).toBe('Objeto');
    expect(makeT('uk')('shareModeSticker')).toBe('Наліпка');
  });
});
