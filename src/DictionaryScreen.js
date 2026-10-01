// Словник: два погляди на ті самі слова.
//   • Список — щоб шукати й повторювати: компактні рядки, розгортання на місці.
//   • Колекція — альбом наліпок. Це «трофейна стіна», яку людина показує
//     друзям, тож сітка має виглядати як альбом, а не як таблиця: наліпки
//     трохи похилені, як їх наклеїла рука, підпис — тихий.
// Пошук і фільтр мови спільні для обох поглядів.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Pressable, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { flagFor, speak } from './speech';
import { IcSearch, IcShare, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { Sticker } from './Sticker';
import WordSheet, { confirmDelete, LetterTile, splitArticle } from './WordSheet';
import { photoUri } from './photos';
import { FadeIn, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext, SPRING, useReducedMotion } from './motion';
import { F, R, type, useTheme } from './theme';

// ─── Чисті помічники (покриті тестами) ─────────────────────────────────────

// Фільтр мови + пошук по слову й перекладу, найновіші — першими.
export function filterWords(words, query, lang) {
  const q = String(query || '').trim().toLowerCase();
  return words
    .filter((w) => !lang || (w.lang || 'en') === lang)
    .filter(
      (w) =>
        !q ||
        String(w.word || '').toLowerCase().includes(q) ||
        String(w.translation || '').toLowerCase().includes(q)
    )
    .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
}

export function langsOf(words) {
  return [...new Set(words.map((w) => w.lang || 'en'))];
}

// Нахил наліпки в альбомі: −3…+3°. Залежить лише від id, тож та сама наліпка
// завжди похилена однаково — інакше при кожному пошуку сітка «тремтіла» б.
export function tiltFor(id) {
  const str = String(id ?? '');
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return ((Math.abs(h) % 61) - 30) / 10;
}

// Геометрія сітки: три колонки на ширину екрана мінус поля екрана.
// Висота рядка стала (наліпка + підпис + проміжок) — завдяки цьому
// FlatList не міряє кожен рядок (getItemLayout).
export const GRID = { cols: 3, gap: 10, pad: 20, label: 21, rowGap: 14, top: 4 };
export function gridMetrics(width) {
  const tile = Math.floor((width - GRID.pad * 2 - GRID.gap * (GRID.cols - 1)) / GRID.cols);
  return { tile, row: tile + GRID.label + GRID.rowGap };
}

// Обраний погляд переживає перемикання вкладок (екран перемонтовується
// щоразу), але не перезапуск застосунку.
let lastView = 'list';

export default function DictionaryScreen({ words, onDelete, onScan, onShare, t }) {
  const { C, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C, SHADOW_SM), [C, SHADOW_SM]);
  const { width } = useWindowDimensions();

  const [view, setView] = useState(lastView);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [langFilter, setLangFilter] = useState(null);
  const [sheetWord, setSheetWord] = useState(null);

  const langsPresent = useMemo(() => langsOf(words), [words]);
  // Якщо видалили останнє слово обраної мови, фільтр зникає з екрана —
  // тож і діяти перестає, інакше людина застрягла б перед порожнім списком.
  const lang = langFilter && langsPresent.includes(langFilter) ? langFilter : null;
  const shown = useMemo(() => filterWords(words, query, lang), [words, query, lang]);
  const { tile, row } = useMemo(() => gridMetrics(width), [width]);

  // Колбеки рядків мають бути стабільними, інакше memo-рядки
  // перемальовуються на кожен рендер App. Свіжі пропси беремо з ref.
  const latest = useRef({ onDelete, onShare });
  latest.current = { onDelete, onShare };
  const canShare = !!onShare;

  const removeWord = useCallback((id) => {
    layoutNext(); // рядок/наліпка зникає, сусіди плавно з'їжджаються
    latest.current.onDelete(id);
  }, []);
  const askDelete = useCallback((item) => confirmDelete(t, item.word, () => removeWord(item.id)), [t, removeWord]);
  const shareWord = useCallback((item) => {
    Haptics.selectionAsync();
    latest.current.onShare?.({ kind: 'word', word: item });
  }, []);
  const toggle = useCallback((id) => {
    layoutNext();
    setOpenId((cur) => (cur === id ? null : id));
  }, []);
  const openSheet = useCallback((item) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSheetWord(item);
  }, []);
  const closeSheet = useCallback(() => setSheetWord(null), []);

  function switchView(next) {
    if (next === view) return;
    Haptics.selectionAsync();
    lastView = next;
    setView(next);
  }

  function pickLang(next) {
    Haptics.selectionAsync();
    setLangFilter(next);
  }

  const renderRow = useCallback(
    ({ item }) => (
      <ListRow
        item={item}
        open={openId === item.id}
        onToggle={toggle}
        onAskDelete={askDelete}
        onShare={canShare ? shareWord : null}
        s={s}
        C={C}
        t={t}
      />
    ),
    [openId, toggle, askDelete, canShare, shareWord, s, C, t]
  );

  const renderTile = useCallback(
    ({ item }) => <GridTile item={item} tile={tile} row={row} onOpen={openSheet} s={s} />,
    [tile, row, openSheet, s]
  );

  const gridLayout = useCallback(
    // У FlatList із колонками index тут — номер РЯДКА, а не елемента
    (_, index) => ({ length: row, offset: GRID.top + row * index, index }),
    [row]
  );

  if (!words.length) {
    return (
      <View style={s.empty}>
        <FadeIn style={{ alignItems: 'center', alignSelf: 'stretch' }}>
          <MascotBob pose="think" size={190} />
          <Text style={s.emptyTitle}>{t('dictEmptyTitle')}</Text>
          <Text style={s.emptyText}>{t('dictEmptyText')}</Text>
          {/* Порожній стан без виходу — глухий кут. Даємо дію просто тут. */}
          {onScan ? (
            <GradBtn
              title={t('scanFirstWord')}
              onPress={onScan}
              style={{ alignSelf: 'stretch', marginTop: 22 }}
            />
          ) : null}
        </FadeIn>
      </View>
    );
  }

  const noMatch = (
    <View style={s.noMatch}>
      <Text style={s.noMatchTitle}>{t('dictNoMatch')}</Text>
      <Text style={s.noMatchText}>{t('dictNoMatchHint')}</Text>
    </View>
  );

  return (
    <View style={s.root}>
      <Text style={s.title}>{t('dictTitle')}</Text>
      {/* «Збережено: 24», а не «24 слів»: так число узгоджується з будь-якою
          мовою без правил множини. */}
      <Text style={s.subtitle}>{t('dictCount', { n: words.length })}</Text>

      <Segment
        value={view}
        onChange={switchView}
        options={[
          { k: 'list', label: t('viewList') },
          { k: 'grid', label: t('viewCollection') },
        ]}
        s={s}
      />

      <View style={s.searchWrap}>
        <IcSearch size={19} color={C.faint} />
        <TextInput
          style={s.search}
          placeholder={t('search')}
          placeholderTextColor={C.faint}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {langsPresent.length > 1 ? (
        <View style={s.filterRow}>
          <Pressable
            style={[s.filterChip, !lang && s.filterChipActive]}
            onPress={() => pickLang(null)}
            accessibilityState={{ selected: !lang }}
          >
            <Text style={[s.filterText, !lang && { color: C.text }]}>{t('all')}</Text>
          </Pressable>
          {langsPresent.map((l) => (
            <Pressable
              key={l}
              style={[s.filterChip, lang === l && s.filterChipActive]}
              onPress={() => pickLang(lang === l ? null : l)}
              accessibilityState={{ selected: lang === l }}
            >
              <Text style={s.filterText}>{flagFor(l)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {/* key={view}: при перемиканні новий погляд проявляється, а не
          підміняється миттєво. Різні FlatList ще й тому, що numColumns
          не можна міняти на льоту. */}
      <FadeIn key={view} style={{ flex: 1 }} dy={8}>
        {view === 'grid' ? (
          <FlatList
            data={shown}
            keyExtractor={keyOf}
            renderItem={renderTile}
            numColumns={GRID.cols}
            getItemLayout={gridLayout}
            columnWrapperStyle={s.gridRow}
            contentContainerStyle={s.gridContent}
            ListEmptyComponent={noMatch}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            // Наліпки — SVG із розмитою тінню: малюємо порціями по 4 рядки.
            initialNumToRender={GRID.cols * 4}
            maxToRenderPerBatch={GRID.cols * 3}
            windowSize={7}
          />
        ) : (
          <FlatList
            data={shown}
            keyExtractor={keyOf}
            renderItem={renderRow}
            contentContainerStyle={{ paddingBottom: UNDER_TAB + 8 }}
            ListEmptyComponent={noMatch}
            keyboardDismissMode="on-drag"
            keyboardShouldPersistTaps="handled"
          />
        )}
      </FadeIn>

      <WordSheet
        item={sheetWord}
        onClose={closeSheet}
        onDelete={removeWord}
        onShare={onShare}
        t={t}
      />
    </View>
  );
}

const keyOf = (item) => item.id;

// ─── Перемикач Список / Колекція ───────────────────────────────────────────
// Стиль той самий, що в Профілі, але біла «пігулка» не стрибає, а
// переїжджає під обраний пункт: так видно, ЩО саме змінилося.
function Segment({ value, options, onChange, s }) {
  const reduced = useReducedMotion();
  const [w, setW] = useState(0);
  const idx = Math.max(0, options.findIndex((o) => o.k === value));
  const a = useRef(new Animated.Value(idx)).current;

  useEffect(() => {
    if (reduced) a.setValue(idx);
    else Animated.spring(a, { toValue: idx, ...SPRING.snappy }).start();
  }, [idx, reduced]);

  const thumb = w ? (w - 6) / options.length : 0;
  return (
    <View style={s.segment} onLayout={(e) => setW(e.nativeEvent.layout.width)} accessibilityRole="tablist">
      {thumb ? (
        <Animated.View
          style={[s.segmentThumb, { width: thumb, transform: [{ translateX: Animated.multiply(a, thumb) }] }]}
        />
      ) : null}
      {options.map((o) => {
        const active = o.k === value;
        return (
          <Pressable
            key={o.k}
            style={s.segmentBtn}
            onPress={() => onChange(o.k)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.segmentText, active && s.segmentTextActive]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Наліпка в альбомі ─────────────────────────────────────────────────────
const GridTile = memo(function GridTile({ item, tile, row, onOpen, s }) {
  const uri = photoUri(item.photo);
  const lang = item.lang || 'en';
  const { article, rest } = splitArticle(item.word, lang);
  return (
    <Press style={[s.tile, { width: tile, height: row }]} onPress={() => onOpen(item)} scaleTo={0.94}>
      <View style={{ transform: [{ rotate: `${tiltFor(item.id)}deg` }] }}>
        {uri ? (
          <Sticker uri={uri} shape={item.shape} outline={item.outline} box={item.box} size={tile} />
        ) : (
          <LetterTile word={item.word} lang={lang} size={tile} />
        )}
      </View>
      {/* Артикль приглушений: в альбомі око ковзає по самих предметах.
          Повне слово з артиклем — в аркуші. */}
      <Text style={s.tileWord} numberOfLines={1} maxFontSizeMultiplier={1.2}>
        {article ? <Text style={s.tileArticle}>{article}</Text> : null}
        {rest}
      </Text>
    </Press>
  );
});

// ─── Рядок списку ──────────────────────────────────────────────────────────
const ListRow = memo(function ListRow({ item, open, onToggle, onAskDelete, onShare, s, C, t }) {
  const uri = photoUri(item.photo);
  const lang = item.lang || 'en';
  return (
    // Уся картка — ціль для пальця, але не для VoiceOver: доступний Pressable
    // злив би вкладені «Слухати», «Поділитись» і «Видалити» в один елемент,
    // і до них було б не дістатись. Розгортає рядок блок зі словом.
    <Pressable style={s.card} onPress={() => onToggle(item.id)} accessible={false}>
      <View style={s.rowTop}>
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {uri ? (
            <Sticker uri={uri} shape={item.shape} outline={item.outline} box={item.box} size={48} />
          ) : (
            <LetterTile word={item.word} lang={lang} size={48} />
          )}
        </View>
        <View
          style={{ flex: 1 }}
          accessible
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          accessibilityActions={[{ name: 'activate' }]}
          onAccessibilityAction={() => onToggle(item.id)}
        >
          <Text style={s.word}>
            {item.word} <Text style={s.flag}>{flagFor(lang)}</Text>
          </Text>
          {item.translation ? <Text style={s.translation}>{item.translation}</Text> : null}
        </View>
        <Press style={s.speakBtn} onPress={() => speak(item.word, lang)} accessibilityLabel={t('listen')}>
          <IcSpeaker size={18} color={C.accent} />
        </Press>
      </View>
      {open ? (
        <View style={s.details}>
          {item.ipa ? <Text style={s.ipa}>{item.ipa}</Text> : null}
          {item.example ? (
            <Pressable onPress={() => speak(item.example, lang)} style={{ paddingRight: 24 }}>
              <View style={s.exampleSpeaker}>
                <IcSpeaker size={14} color={C.dim} />
              </View>
              <Text style={s.example}>“{item.example}”</Text>
              {item.exampleTranslation ? <Text style={s.exampleTr}>{item.exampleTranslation}</Text> : null}
            </Pressable>
          ) : null}
          <View style={s.actions}>
            {onShare ? (
              <Pressable style={s.action} onPress={() => onShare(item)} hitSlop={8} accessibilityRole="button">
                <IcShare size={16} color={C.accent} />
                <Text style={s.shareText}>{t('share')}</Text>
              </Pressable>
            ) : null}
            <Pressable style={s.action} onPress={() => onAskDelete(item)} hitSlop={8} accessibilityRole="button">
              <Text style={s.deleteText}>{t('delete')}</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </Pressable>
  );
});

const makeStyles = (C, SHADOW_SM) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg, padding: 20, paddingBottom: 0 },
    title: { color: C.text, ...type(34, F.bold) },
    subtitle: { color: C.dim, ...type(13, F.reg), marginTop: 2, marginBottom: 14 },

    segment: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: R.md, padding: 3, marginBottom: 12 },
    segmentThumb: {
      position: 'absolute',
      top: 3,
      bottom: 3,
      left: 3,
      borderRadius: R.md - 3,
      backgroundColor: C.card,
      ...SHADOW_SM,
    },
    segmentBtn: { flex: 1, paddingVertical: 9, alignItems: 'center' },
    segmentText: { color: C.dim, ...type(14, F.semi, { noLead: true }) },
    segmentTextActive: { color: C.text, fontFamily: F.extra },

    // Поле пошуку: заглиблена поверхня замість рамки — рамка на крейді
    // додає лінію, якої там не треба.
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      backgroundColor: C.input,
      borderRadius: R.md,
      paddingHorizontal: 15,
      marginBottom: 12,
    },
    search: {
      flex: 1,
      paddingVertical: 13,
      color: C.text,
      ...type(16, F.reg, { noLead: true }),
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: R.pill,
      backgroundColor: C.card,
    },
    filterChipActive: { backgroundColor: C.accentSoft },
    filterText: { color: C.dim, ...type(13, F.semi, { noLead: true }) },

    // Альбом: проміжки між наліпками — повітря, а не лінії сітки.
    gridContent: { paddingTop: GRID.top, paddingBottom: UNDER_TAB + 8 },
    gridRow: { gap: GRID.gap },
    tile: { alignItems: 'center' },
    // Наліпка має прозорий запас під облямівку й тінь, тож підпис
    // підтягуємо ближче — інакше він «відпадає» від своєї наліпки.
    tileWord: {
      color: C.text,
      ...type(13, F.semi),
      textAlign: 'center',
      marginTop: 2,
      alignSelf: 'stretch',
    },
    tileArticle: { color: C.faint },

    noMatch: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
    noMatchTitle: { color: C.text, ...type(17, F.bold) },
    noMatchText: { color: C.dim, ...type(14, F.reg), textAlign: 'center', marginTop: 4 },

    // Рядок словника — плаваюча картка, а не рядок із розділювачем:
    // на крейдяному тлі лінія-роздільник додає бруду, тінь — ні.
    card: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
      marginBottom: 9,
      ...SHADOW_SM,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    word: { color: C.text, ...type(17, F.semi) },
    flag: { fontSize: 13 },
    translation: { color: C.dim, ...type(14, F.reg), marginTop: 1 },
    speakBtn: {
      backgroundColor: C.card2,
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
    },
    details: {
      marginTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.sep,
      paddingTop: 12,
      gap: 8,
    },
    ipa: { color: C.dim, ...type(15, F.reg) },
    example: { color: C.text, ...type(14, F.reg) },
    exampleTr: { color: C.dim, ...type(13, F.reg), marginTop: 4 },
    exampleSpeaker: { position: 'absolute', top: 2, right: 0 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: 22, marginTop: 4 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
    shareText: { color: C.accent, ...type(14, F.semi, { noLead: true }) },
    deleteText: { color: C.red, ...type(14, F.semi, { noLead: true }) },
    empty: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 34 },
    emptyTitle: { color: C.text, ...type(20, F.bold), marginTop: 12 },
    emptyText: { color: C.dim, ...type(14, F.reg), textAlign: 'center', marginTop: 8 },
  });
