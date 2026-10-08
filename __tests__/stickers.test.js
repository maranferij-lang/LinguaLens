// Наліпки без тла (share.md §3, §12.1): у кореня знімка немає тла, і жоден
// нащадок не заливає його на весь розмір — інакше PNG вийде з білим чи
// кольоровим прямокутником замість прозорості. На кожній є слово, переклад
// і ярлик LinguaLens; довге слово зменшується, довгий переклад — до 2 рядків.
import { StyleSheet, Text } from 'react-native';
import { act, create } from 'react-test-renderer';
import { StickerArt, brandSpot, stickerLabel } from '../src/share/Stickers';
import { STICKER_MIN_H, STICKER_PAD, STICKER_W, fontSizeForWord, sceneSetLayout } from '../src/share/layout';
import { makeT } from '../src/i18n';

const flat = (style) => StyleSheet.flatten(style) || {};
// ref отримує «нативний» вузол — тут сам елемент, щоб глянути на його стиль
const nodeMock = { createNodeMock: (el) => el };
const textOf = (n) => {
  const c = n.props.children;
  return (Array.isArray(c) ? c : [c]).filter((x) => typeof x === 'string' || typeof x === 'number').join('');
};
const texts = (tree) => tree.root.findAllByType(Text).map(textOf);

const PHOTO = 'file:///docs/stickers/mug.jpg';
const SHAPE = [[0.3, 0.2], [0.7, 0.2], [0.8, 0.5], [0.7, 0.8], [0.3, 0.8], [0.2, 0.5]];
const LANGS = {
  uk: { word: { word: 'mug', translation: 'кружка', ipa: 'mʌɡ', lang: 'en', photo: PHOTO, shape: SHAPE }, scene: [['kettle', 'чайник'], ['lemon', 'лимон'], ['cutting board', 'обробна дошка'], ['jar', 'банка'], ['apple', 'яблуко'], ['mug', 'кружка'], ['towel', 'рушник'], ['plant', 'рослина']] },
  en: { word: { word: 'la taza', translation: 'mug', ipa: 'la ˈta.θa', lang: 'es', photo: PHOTO, shape: SHAPE }, scene: [['la tetera', 'kettle'], ['el limón', 'lemon'], ['la tabla de cortar', 'cutting board']] },
};

function payloadFor(kind, lang) {
  const L = LANGS[lang];
  if (kind === 'object' || kind === 'word') return { kind: 'word', word: L.word };
  if (kind === 'scene') {
    return { kind: 'scene', scene: { lang: L.word.lang, objects: L.scene.map(([word, translation], i) => ({ key: 'k' + i, word, translation })) } };
  }
  return { kind: 'achievement', achievement: { id: 'streak_7', tier: 2 }, fresh: true, stats: {} };
}

async function render(payload, kind, lang = 'uk') {
  let tree;
  let root = null;
  await act(async () => {
    tree = create(<StickerArt payload={payload} kind={kind} t={makeT(lang)} cardRef={(r) => (root = r)} />, nodeMock);
  });
  return { tree, root };
}

// Тло, що залило б увесь корінь: backgroundColor разом із розміром кореня
// або з absoluteFill. Фішки, таблички й ярлик мають тло — але не на весь корінь.
function fullBleed(node) {
  const st = flat(node.props.style);
  if (!st.backgroundColor || st.backgroundColor === 'transparent') return false;
  const fill = st.position === 'absolute' && st.left === 0 && st.right === 0 && st.top === 0 && st.bottom === 0;
  return fill || st.width >= STICKER_W || st.width === '100%';
}

const KINDS = ['object', 'word', 'scene', 'badge'];

describe.each(['uk', 'en'])('%s', (lang) => {
  test.each(KINDS)('%s: a 300 pt root without a background, nothing paints over it', async (kind) => {
    const { tree, root } = await render(payloadFor(kind, lang), kind, lang);
    const st = flat(root.props.style);
    expect(st.width).toBe(STICKER_W);
    expect(st.backgroundColor).toBeUndefined();
    expect(st.overflow).toBeUndefined();
    expect(root.props.collapsable).toBe(false);
    const painted = tree.root.findAll((n) => typeof n.type === 'string' && n !== root && fullBleed(n));
    expect(painted).toEqual([]);
    await act(async () => tree.unmount());
  });

  test.each(KINDS)('%s: the LinguaLens tag is on every sticker', async (kind) => {
    const { tree } = await render(payloadFor(kind, lang), kind, lang);
    const brand = tree.root.findAll((n) => n.props.testID === 'sticker-brand' && typeof n.type === 'string');
    expect(brand.length).toBe(1);
    expect(brand[0].findAllByType(Text).map(textOf).join(' ')).toContain('LinguaLens');
    await act(async () => tree.unmount());
  });
});

test.each(['uk', 'en'])('%s: word and translation are on the word stickers and the scene set', async (lang) => {
  const L = LANGS[lang];
  for (const kind of ['object', 'word']) {
    const { tree } = await render(payloadFor(kind, lang), kind, lang);
    expect(texts(tree)).toEqual(expect.arrayContaining([L.word.word, L.word.translation]));
    await act(async () => tree.unmount());
  }
  const { tree } = await render(payloadFor('scene', lang), 'scene', lang);
  const shown = L.scene.slice(0, 6);
  expect(texts(tree)).toEqual(expect.arrayContaining(shown.flat()));
  await act(async () => tree.unmount());
});

test('the object sticker exports 900×1116: the root is at least 372 pt tall', async () => {
  const { tree, root } = await render(payloadFor('object', 'uk'), 'object');
  expect(flat(root.props.style).minHeight).toBe(STICKER_MIN_H.object);
  expect(flat(root.props.style).padding).toBe(STICKER_PAD);
  await act(async () => tree.unmount());
});

test('the word-only sticker shows the transcription; the object one keeps the plate short', async () => {
  const { tree } = await render(payloadFor('word', 'uk'), 'word');
  expect(texts(tree)).toContain('/mʌɡ/');
  await act(async () => tree.unmount());
  const obj = await render(payloadFor('object', 'uk'), 'object');
  expect(texts(obj.tree)).not.toContain('/mʌɡ/');
  await act(async () => obj.tree.unmount());
});

test('a word without a photo never gets an empty object sticker', async () => {
  const { tree, root } = await render({ kind: 'word', word: { word: 'serendipity', translation: 'щаслива випадковість', lang: 'en' } }, 'object');
  expect(root.props.testID).toBe('sticker-word');
  await act(async () => tree.unmount());
});

describe('long words and translations', () => {
  const long = { word: 'die Geschirrspülmaschine', translation: 'посудомийна машина, що миє тарілки й склянки', ipa: 'ɡəˈʃɪʁʃpyːlmaˌʃiːnə', lang: 'de', photo: PHOTO, shape: SHAPE };

  test.each([
    ['object', 30, 13, 236 - 40],
    ['word', 40, 14, 260 - 52],
  ])('%s: the word shrinks within the plate’s bounds', async (kind, max, min, width) => {
    const { tree } = await render({ kind: 'word', word: long }, kind);
    const word = tree.root.findAll((n) => n.type === Text && textOf(n) === long.word)[0];
    const size = flat(word.props.style).fontSize;
    expect(size).toBe(fontSizeForWord(long.word, { max, min, width }));
    expect(size).toBeLessThan(max);
    expect(size).toBeGreaterThanOrEqual(min);
    await act(async () => tree.unmount());
  });

  test('a long translation is cut to two lines', async () => {
    const { tree } = await render({ kind: 'word', word: long }, 'word');
    const tr = tree.root.findAll((n) => n.type === Text && textOf(n) === long.translation)[0];
    expect(tr.props.numberOfLines).toBe(2);
    await act(async () => tree.unmount());
  });

  test('the scene set shows six chips and «+N» for the rest', async () => {
    const t = makeT('uk');
    const objects = Array.from({ length: 9 }, (_, i) => ({ key: 'k' + i, word: 'word' + i, translation: 'слово' + i }));
    const { tree, root } = await render({ kind: 'scene', scene: { lang: 'en', objects } }, 'scene');
    expect(texts(tree)).toContain(t('sceneCardMore', { n: 3 }));
    expect(texts(tree)).not.toContain('word6');
    expect(flat(root.props.style).minHeight).toBe(sceneSetLayout(objects).height);
    await act(async () => tree.unmount());
  });
});

test('the medal says whether it is new and names the achievement', async () => {
  const t = makeT('uk');
  const fresh = await render(payloadFor('badge', 'uk'), 'badge');
  expect(texts(fresh.tree)).toEqual(expect.arrayContaining([t('shareUnlocked'), t('ach_streak_7')]));
  await act(async () => fresh.tree.unmount());
  const old = await render({ kind: 'achievement', achievement: { id: 'words_10', tier: 1 }, stats: {} }, 'badge');
  expect(texts(old.tree)).toEqual(expect.arrayContaining([t('shareMyAch'), t('ach_words_10')]));
  await act(async () => old.tree.unmount());
});

test('stickers ignore Dynamic Type: they are pictures, not interface', async () => {
  for (const kind of KINDS) {
    const { tree } = await render(payloadFor(kind, 'uk'), kind);
    for (const n of tree.root.findAllByType(Text)) expect(n.props.allowFontScaling).toBe(false);
    await act(async () => tree.unmount());
  }
});

test('VoiceOver label says what is on the sticker', () => {
  const t = makeT('uk');
  expect(stickerLabel(payloadFor('object', 'uk'), t)).toBe('mug, кружка');
  expect(stickerLabel(payloadFor('scene', 'uk'), t)).toBe(t('sceneCardWords', { n: 8 }));
  expect(stickerLabel(payloadFor('badge', 'uk'), t)).toBe(t('ach_streak_7'));
  expect(t('shareStickerLabel', { w: 'mug, кружка' })).toBe('Наліпка без тла: mug, кружка');
});

// Ярлик на «Предмет і слово» стоїть біля правого верхнього краю самого
// предмета, а не в порожньому куті квадрата наліпки.
test('the LinguaLens tag hugs the object, not the empty corner', () => {
  const mug = [[0.27, 0.23], [0.4, 0.21], [0.55, 0.21], [0.68, 0.23], [0.7, 0.35], [0.78, 0.36], [0.86, 0.45], [0.86, 0.58], [0.78, 0.66], [0.7, 0.66], [0.69, 0.79], [0.6, 0.82], [0.4, 0.82], [0.29, 0.79], [0.26, 0.6], [0.26, 0.4]];
  const narrow = mug.map(([x, y]) => [0.4 + (x - 0.26) * 0.3, y]);
  const near = brandSpot({ shape: mug });
  const far = brandSpot({ shape: narrow });
  expect(near.top).toBeGreaterThan(30);
  // вужчий предмет — ярлик далі від правого краю квадрата
  expect(far.right).toBeGreaterThan(near.right);
  // без силуету (круглий кроп) — у куті
  expect(brandSpot({})).toEqual({ top: 14, right: 0 });
  // предмет на весь квадрат: ярлик не виходить за межі кореня
  const full = brandSpot({ shape: [[0, 0], [0.5, 0], [1, 0], [1, 0.5], [1, 1], [0.5, 1], [0, 1], [0, 0.5]] });
  expect(full.top).toBeGreaterThanOrEqual(0);
  expect(full.right).toBeGreaterThanOrEqual(-6);
});
