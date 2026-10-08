/**
 * @jest-environment ./jest.tzEnvironment.js
 * @jest-environment-options {"timezone": "Europe/Kyiv"}
 */
// Віджет «Мої слова»: пул слів (мова, порядок повторення, нове першим),
// ротація на парних годинах тиждень наперед, бейдж «на повторення», що
// росте з часом, мініатюри в App Group і розмітка.
import { makeT } from '../src/i18n';
import { isLearned } from '../src/srs';
import { buildMyWordsTimeline, MAX_BYTES, wordsPool } from '../src/widgets/wordsTimeline';
import { widgetPalette } from '../src/widgets/palette';
import { FAST_CLOCK } from '../src/widgets/clock';

const { compile, env, nodes, mods, texts } = require('../test-utils/widgetRuntime');

// Файлова система в пам'яті (як у scenes.test.js) і ImageManipulator, що
// «рендерить» у кеш.
jest.mock('expo-file-system', () => {
  const files = new Set();
  const dirs = new Set();
  const uriOf = (parts) =>
    parts
      .map((p) => (typeof p === 'string' ? p : p.uri))
      .join('/')
      // подвійні скісні — лише в шляху, не в «file:///»
      .replace(/^(\w+:\/\/\/?)(.*)$/, (m, scheme, rest) => scheme + rest.replace(/\/{2,}/g, '/'));
  class File {
    constructor(...parts) {
      this.uri = uriOf(parts);
      this.name = this.uri.split('/').pop();
    }
    get exists() {
      return files.has(this.uri);
    }
    copySync(dest) {
      if (!files.has(this.uri)) throw new Error('No such file: ' + this.uri);
      files.add(dest.uri);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  class Directory {
    constructor(...parts) {
      this.uri = uriOf(parts);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    delete() {
      for (const f of [...files]) if (f.startsWith(this.uri + '/')) files.delete(f);
      dirs.delete(this.uri);
    }
    list() {
      return [...files].filter((f) => f.startsWith(this.uri + '/')).map((f) => new File(f));
    }
  }
  return { File, Directory, Paths: { document: new Directory('file:///doc') }, __files: files };
});
// Маніпулятор рахує розміри як iOS: resize з обома сторонами малює рівно в
// них (ImageResizeTransformer.swift), тож інші пропорції — сплющене фото
// (squashed). Фото «tall» — 640×853 (кадр без рамки предмета), «wide» —
// 853×640, решта — квадратні наліпки. Джерело — шлях або ImageRef.
jest.mock('expo-image-manipulator', () => {
  let n = 0;
  const saved = [];
  const sizeOf = (src) => (String(src).includes('tall') ? [640, 853] : String(src).includes('wide') ? [853, 640] : [300, 300]);
  const context = (src) => {
    const ref = src && typeof src === 'object' ? src : null;
    const name = ref ? ref.src : src;
    let [w, h] = ref ? [ref.width, ref.height] : sizeOf(src);
    let squashed = ref ? ref.squashed : false;
    return {
      resize: jest.fn(function ({ width, height }) {
        const tw = width ?? (height * w) / h;
        const th = height ?? (width * h) / w;
        if (Math.abs(tw / th - w / h) > 0.01) squashed = true;
        [w, h] = [tw, th];
        return this;
      }),
      crop: jest.fn(function ({ width, height }) {
        [w, h] = [width, height];
        return this;
      }),
      renderAsync: jest.fn(async () => ({
        width: w,
        height: h,
        squashed,
        src: name,
        saveAsync: jest.fn(async () => {
          if (String(name).includes('broken')) throw new Error('cannot decode');
          const uri = 'file:///cache/render' + ++n + '.jpg';
          require('expo-file-system').__files.add(uri);
          saved.push({ src: name, width: w, height: h, squashed });
          return { uri, width: w, height: h };
        }),
        release: jest.fn(),
      })),
      release: jest.fn(),
    };
  };
  return { ImageManipulator: { manipulate: jest.fn((src) => context(src)) }, SaveFormat: { JPEG: 'jpeg', PNG: 'png' }, __saved: saved };
});

const uk = makeT('uk');
const NOW = new Date(2026, 9, 8, 15, 30);
const HOUR = 3600000;
const word = (i, extra = {}) => ({
  id: 'id' + i,
  word: 'word' + i,
  ipa: 'wɜːd',
  translation: 'слово' + i,
  example: `A word${i} in a sentence.`,
  exampleTranslation: 'Слово в реченні.',
  lang: 'en',
  addedAt: NOW.getTime() - 10 * 86400000,
  srs: { box: 1, due: NOW.getTime() + i * HOUR },
  ...extra,
});
const opts = (extra = {}) => ({ t: uk, targetLang: 'en', now: NOW, ...extra });

describe('the pool', () => {
  test('the language being learned, due words first, a word saved today before all', () => {
    const words = [
      word(1, { srs: { box: 2, due: NOW.getTime() + 5 * HOUR } }),
      word(2, { srs: { box: 0, due: NOW.getTime() - 2 * HOUR } }),
      word(3, { lang: 'de' }),
      word(4, { addedAt: NOW.getTime() - HOUR, srs: { box: 0, due: NOW.getTime() + 9 * HOUR } }),
      word(5, { srs: { box: 3, due: NOW.getTime() - 9 * HOUR } }),
    ];
    expect(wordsPool(words, 'en', NOW.getTime()).map((w) => w.id)).toEqual(['id4', 'id5', 'id2', 'id1']);
    // такої мови в словнику немає — усі слова
    expect(wordsPool(words, 'fr', NOW.getTime())).toHaveLength(5);
    // не більше 24
    expect(wordsPool(Array.from({ length: 40 }, (_, i) => word(i)), 'en', NOW.getTime())).toHaveLength(24);
    // слова без тексту чи id — не в пулі
    expect(wordsPool([word(1, { word: '  ' }), { word: 'x' }, null], 'en')).toEqual([]);
  });

  test('isLearned: box 4 and up — the same definition everywhere', () => {
    expect([0, 1, 2, 3, 4, 5].map((box) => isLearned({ srs: { box } }))).toEqual([false, false, false, false, true, true]);
    expect(isLearned({})).toBe(false);
    expect(isLearned(null)).toBe(false);
  });
});

describe('buildMyWordsTimeline', () => {
  const words = Array.from({ length: 6 }, (_, i) => word(i));

  test('“now”, then every even hour on the hour, a week ahead, no more than 85 entries', () => {
    const entries = buildMyWordsTimeline(words, opts());
    expect(entries[0].date.getTime()).toBe(NOW.getTime());
    expect(entries.length).toBeLessThanOrEqual(85);
    for (const e of entries.slice(1)) expect([e.date.getHours() % 2, e.date.getMinutes(), e.date.getSeconds()]).toEqual([0, 0, 0]);
    expect(entries[1].date).toEqual(new Date(2026, 9, 8, 16));
    expect(entries[2].date).toEqual(new Date(2026, 9, 8, 18));
    expect(entries.at(-1).date - NOW).toBeGreaterThan(6 * 86400000);
    // слова йдуть по колу
    expect(entries.slice(0, 8).map((e) => e.props.id)).toEqual(['id0', 'id1', 'id2', 'id3', 'id4', 'id5', 'id0', 'id1']);
    // key «зараз» — початок інтервалу ротації (14:00), а не 15:30
    expect(entries[0].props.key).toBe(`words|id0|${new Date(2026, 9, 8, 14).getTime()}`);
  });

  test('25 October 2026 in Kyiv: the rotation stays on even hours through the clock change', () => {
    const entries = buildMyWordsTimeline(words, opts({ now: new Date(2026, 9, 24, 21, 10) }));
    const around = entries.filter((e) => e.date.getDate() === 25);
    expect(around.map((e) => e.date.getHours())).toEqual([0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22]);
  });

  test('“to review” grows as the week goes on, without the app', () => {
    const entries = buildMyWordsTimeline(words, opts());
    const due = entries.map((e) => Number(e.props.due || 0));
    expect(due[0]).toBe(1); // id0 — уже зараз
    expect(due.at(-1)).toBe(6);
    for (let i = 1; i < due.length; i++) expect(due[i]).toBeGreaterThanOrEqual(due[i - 1]);
    expect(entries.at(-1).props.dueLabel).toBe('6 на повторення');
  });

  test('“Up next” — the three following words; links to each word; learned of total', () => {
    const learned = [...words.slice(0, 5), word(5, { srs: { box: 4, due: NOW.getTime() + 99 * HOUR } })];
    const [first] = buildMyWordsTimeline(learned, opts());
    expect(first.props).toMatchObject({
      caption: 'Мої слова',
      word: 'word0',
      translation: 'слово0',
      example: '“A **word0** in a sentence.”',
      md: '1',
      exampleTr: 'Слово в реченні.',
      link: 'lingualens://word/id0?from=widget&w=words',
      reviewLink: 'lingualens://learn?from=widget&w=words',
      reviewLabel: 'Повторити',
      nextTitle: 'Далі',
      learnedLabel: 'Вивчено 1 з 6',
      learned: '0.17',
      letter: 'W',
      photo: '',
    });
    expect(first.props.next.map((n) => n.id)).toEqual(['id1', 'id2', 'id3']);
    expect(first.props.next[0]).toEqual({ id: 'id1', w: 'word1', t: 'слово1', photo: '', letter: 'W' });
    // одне слово — «Далі» немає
    expect(buildMyWordsTimeline([word(1)], opts())[0].props).toMatchObject({ next: [], nextTitle: '' });
  });

  test('photos: the folder once, file names per word; no photo — a letter tile', () => {
    const thumbs = { id1: 'file:///group/ExpoWidgets/thumbs/id1.jpg', id3: 'file:///group/ExpoWidgets/thumbs/id3.jpg' };
    const entries = buildMyWordsTimeline(words, opts({ thumbs }));
    expect(entries[0].props).toMatchObject({ dir: 'file:///group/ExpoWidgets/thumbs/', photo: '', letter: 'W' });
    expect(entries[0].props.next.map((n) => n.photo)).toEqual(['id1.jpg', '', 'id3.jpg']);
    expect(entries[1].props.photo).toBe('id1.jpg');
  });

  test('no words yet: one “save today’s word” entry that opens the word of the day', () => {
    const entries = buildMyWordsTimeline([], opts());
    expect(entries).toHaveLength(1);
    expect(entries[0].props).toMatchObject({
      state: 'empty',
      message: 'Тут крутитимуться твої слова',
      hint: 'Збережи слово дня, і почнемо',
      link: 'lingualens://word-of-day?from=widget&w=words',
    });
  });

  test('a deleted word disappears from the next timeline', () => {
    const without = buildMyWordsTimeline(words.filter((w) => w.id !== 'id2'), opts());
    expect(without.some((e) => e.props.id === 'id2' || e.props.next.some((n) => n.id === 'id2'))).toBe(false);
  });

  test('props: strings, flat string objects and pal; one key set for both states', () => {
    const all = [...buildMyWordsTimeline(words, opts({ pal: widgetPalette('dark') })), ...buildMyWordsTimeline([], opts())];
    const keys = Object.keys(all[0].props).sort();
    for (const { props } of all) {
      expect(Object.keys(props).sort()).toEqual(keys);
      for (const [k, v] of Object.entries(props)) {
        if (k === 'pal') expect(Object.keys(v)).toEqual(['l', 'd']);
        else if (Array.isArray(v)) v.forEach((o) => Object.values(o).forEach((x) => expect(typeof x).toBe('string')));
        else expect([k, typeof v]).toEqual([k, 'string']);
      }
    }
  });

  test('a big dictionary with long words still fits: ≤ 120 KB (fewer days rather than a heavier widget)', () => {
    const long = 'x'.repeat(30);
    const big = Array.from({ length: 60 }, (_, i) =>
      word(i, { id: 'k' + i + long, word: 'word' + i + long, translation: 'переклад' + long, example: ('A sentence ' + long).repeat(5) })
    );
    const thumbs = Object.fromEntries(big.map((w) => [w.id, 'file:///private/var/mobile/Containers/Shared/AppGroup/0F1E2D3C-4B5A/ExpoWidgets/thumbs/' + w.id + '.jpg']));
    const entries = buildMyWordsTimeline(big, opts({ thumbs, pal: widgetPalette('ocean-dark') }));
    expect(JSON.stringify(entries).length).toBeLessThanOrEqual(MAX_BYTES);
    expect(MAX_BYTES).toBeLessThanOrEqual(120000);
    // і все одно щонайменше доба ротації
    expect(entries.length).toBeGreaterThanOrEqual(13);
  });

  test('fast clock (development): a new word every two minutes', () => {
    const entries = buildMyWordsTimeline(words, opts({ clock: FAST_CLOCK }));
    expect(entries.slice(0, 4).map((e) => (e.date - NOW) / 60000)).toEqual([0, 2, 4, 6]);
  });
});

describe('thumbnails in the App Group', () => {
  const fs = require('expo-file-system');
  const { Platform } = require('react-native');
  // без isolateModules: інакше заглушка файлової системи була б іншим
  // екземпляром, ніж той, у який дивиться тест
  const load = () => require('../src/widgets/thumbs');
  beforeEach(() => {
    fs.__files.clear();
    Platform.OS = 'ios';
  });

  test('a 200 px JPEG per word with a photo, at most 30; extras and stale ones are removed', async () => {
    const { ensureThumbs, MAX_THUMBS } = load();
    for (let i = 0; i < 40; i++) fs.__files.add('file:///doc/stickers/p' + i + '.jpg');
    fs.__files.add('file:///group/ExpoWidgets/thumbs/old.jpg');
    const list = Array.from({ length: 40 }, (_, i) => word(i, { photo: 'stickers/p' + i + '.jpg' }));
    const out = await ensureThumbs([word(99), ...list]);
    expect(Object.keys(out)).toHaveLength(MAX_THUMBS);
    expect(out.id0).toBe('file:///group/ExpoWidgets/thumbs/id0.jpg');
    const inGroup = [...fs.__files].filter((f) => f.startsWith('file:///group/ExpoWidgets/thumbs/'));
    expect(inGroup).toHaveLength(MAX_THUMBS);
    expect(inGroup).not.toContain('file:///group/ExpoWidgets/thumbs/old.jpg');
    // тимчасові файли рендеру прибрано
    expect([...fs.__files].some((f) => f.startsWith('file:///cache/'))).toBe(false);
    const manip = require('expo-image-manipulator').ImageManipulator.manipulate;
    const calls = manip.mock.calls.length;
    // вдруге — нічого не рендерить: файли вже є
    await ensureThumbs(list.slice(0, 5));
    expect(manip.mock.calls.length).toBe(calls);
  });

  // Слово з кадру без рамки предмета (чи збережене v1.0) — фото 3:4: плитка
  // віджета квадратна, тож спершу квадрат по центру, а тоді 200 px
  test('a photo that is not square is centre-cropped first — never squashed', async () => {
    const { ensureThumbs, thumbCrop, THUMB_PX } = load();
    const saved = require('expo-image-manipulator').__saved;
    saved.length = 0;
    for (const k of ['tall', 'wide', 'square']) fs.__files.add('file:///doc/stickers/' + k + '.jpg');
    const out = await ensureThumbs(['tall', 'wide', 'square'].map((k, i) => word(i, { photo: 'stickers/' + k + '.jpg' })));
    expect(Object.keys(out)).toHaveLength(3);
    expect(saved).toHaveLength(3);
    for (const s of saved) expect(s).toMatchObject({ width: THUMB_PX, height: THUMB_PX, squashed: false });
    expect(thumbCrop(640, 853)).toEqual({ originX: 0, originY: 106, width: 640, height: 640 });
    expect(thumbCrop(853, 640)).toEqual({ originX: 106, originY: 0, width: 640, height: 640 });
    expect(thumbCrop(300, 300)).toBeNull();
    expect(thumbCrop(undefined, 300)).toBeNull();
  });

  test('a photo that cannot be read is skipped quietly', async () => {
    const { ensureThumbs } = load();
    const out = await ensureThumbs([word(1, { photo: 'stickers/broken.jpg' })]);
    expect(out).toEqual({});
  });

  test('nothing on Android or in Expo Go (no App Group there)', async () => {
    Platform.OS = 'android';
    expect(await load().ensureThumbs([word(1, { photo: 'stickers/p1.jpg' })])).toEqual({});
    Platform.OS = 'ios';
    const Constants = require('expo-constants').default;
    const was = Constants.executionEnvironment;
    Constants.executionEnvironment = 'storeClient';
    try {
      expect(load().widgetsDir()).toBeNull();
    } finally {
      Constants.executionEnvironment = was;
    }
    expect(load().widgetsDir()).toBe('file:///group/ExpoWidgets/');
  });

  test('cleanThumbs() without a list removes the whole folder (erase my data)', () => {
    const { cleanThumbs } = load();
    fs.__files.add('file:///group/ExpoWidgets/thumbs/a.jpg');
    new fs.Directory('file:///group/ExpoWidgets/', 'thumbs').create();
    cleanThumbs();
    expect([...fs.__files]).toEqual([]);
  });
});

describe('My Words layout', () => {
  const w = compile('../src/widgets/MyWordsWidget');
  const thumbs = { id1: 'file:///group/ExpoWidgets/thumbs/id1.jpg' };
  const entries = buildMyWordsTimeline(Array.from({ length: 6 }, (_, i) => word(i)), opts({ thumbs }));

  test('small: caption, letter tile (photo on top when there is one), word, IPA, translation', () => {
    const tree = w.render(entries[1].props, env('systemSmall'));
    expect(texts(tree)).toEqual(['Мої слова', 'word1', '/wɜːd/', 'слово1', 'W']);
    const img = nodes(tree).find((n) => n.type === 'ImageView' && n.props.uiImage);
    expect(img.props.uiImage).toBe('file:///group/ExpoWidgets/thumbs/id1.jpg');
    expect(Object.keys(mods(img))).toEqual(expect.arrayContaining(['resizable', 'clipShape', 'widgetAccentedRenderingMode']));
    // без фото — та сама плитка, лише літера: розмітка не зсувається
    const plain = w.render(entries[0].props, env('systemSmall'));
    expect(nodes(plain).some((n) => n.props.uiImage)).toBe(false);
    expect(texts(plain)).toEqual(['Мої слова', 'word0', '/wɜːd/', 'слово0', 'W']);
  });

  test('medium: the tile on the left, the “to review” chip, word and translation with the example', () => {
    const tree = w.render(entries[0].props, env('systemMedium'));
    expect(texts(tree)).toEqual(['W', 'Мої слова', '1', 'word0', '/wɜːd/', 'слово0', '“A **word0** in a sentence.”']);
  });

  test('large: each “up next” row is its own link; “Review” opens the cards; learned progress', () => {
    const tree = w.render(entries[0].props, env('systemLarge'));
    const links = nodes(tree).filter((n) => n.type === 'LinkView').map((n) => n.props.destination);
    expect(links).toEqual([
      'lingualens://word/id1?from=widget&w=words&f=systemLarge',
      'lingualens://word/id2?from=widget&w=words&f=systemLarge',
      'lingualens://word/id3?from=widget&w=words&f=systemLarge',
      'lingualens://learn?from=widget&w=words&f=systemLarge',
    ]);
    expect(texts(tree)).toEqual(expect.arrayContaining(['1 на повторення', 'Далі', 'word1', 'слово1', 'Вивчено 0 з 6', 'Повторити']));
    expect(nodes(tree).find((n) => n.type === 'ProgressView').props.value).toBe(0);
    // поки переклад сховано — і в рядках «Далі» замість перекладу крапки
    const hidden = buildMyWordsTimeline(Array.from({ length: 6 }, (_, i) => word(i)), opts({ hide: true }))[0];
    const t = texts(w.render(hidden.props, env('systemLarge')));
    expect(t).not.toContain('слово1');
    expect(t.filter((x) => x === '•••')).toHaveLength(3);
  });

  test('lock screen: caption, word and translation; inline — one line', () => {
    expect(texts(w.render(entries[0].props, env('accessoryRectangular')))).toEqual(['Мої слова', 'word0', 'слово0']);
    expect(texts(w.render(entries[0].props, env('accessoryInline')))).toEqual(['word0 · слово0']);
  });

  test('empty: the message and the hint', () => {
    const [empty] = buildMyWordsTimeline([], opts());
    expect(texts(w.render(empty.props, env('systemSmall')))).toEqual(['Мої слова', 'Тут крутитимуться твої слова', 'Збережи слово дня, і почнемо']);
  });
});
