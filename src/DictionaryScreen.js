// Словник: два погляди на ті самі слова.
//   • Список — щоб шукати й повторювати: компактні рядки, розгортання на місці.
//   • Колекція — альбом наліпок. Це «трофейна стіна», яку людина показує
//     друзям, тож сітка має виглядати як альбом, а не як таблиця: наліпки
//     трохи похилені, як їх наклеїла рука, підпис — тихий.
// Пошук і фільтр мови спільні для обох поглядів.
// Над ними — стрічка сцен: фото кімнат, з яких ці слова прийшли.
// Заголовок, лічильник і стрічка сцен їдуть разом зі списком, а перемикач
// і пошук липнуть угорі: на SE нерухома шапка забирала ~70 % екрана.
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { flagFor, speak } from './speech';
import { IcClose, IcCloud, IcSearch, IcShare, IcSpeaker } from './icons';
import { MascotBob } from './Mascot';
import { Sticker } from './Sticker';
import WordSheet, { confirmDelete, LetterTile, splitArticle } from './WordSheet';
import { photoUri } from './photos';
import SceneView from './scene/SceneView';
import { sceneImageUri } from './scene/scenes';
import { dateLabel, safeLocale } from './share/layout';
import { FadeIn, GradBtn, Press } from './ui';
import { UNDER_TAB } from './Chrome';
import { layoutNext, SPRING, useReducedMotion } from './motion';
import { CAPS, F, R, type, useTheme } from './theme';

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
// Висота рядка стала (наліпка + підпис + проміжок) — сітка не стрибає,
// коли наліпки догружаються.
export const GRID = { cols: 3, gap: 10, pad: 20, label: 21, rowGap: 14 };
export function gridMetrics(width) {
  const tile = Math.floor((width - GRID.pad * 2 - GRID.gap * (GRID.cols - 1)) / GRID.cols);
  return { tile, row: tile + GRID.label + GRID.rowGap };
}

// Наліпки рядками по три: обидва погляди — один FlatList з тією самою
// шапкою й липкою панеллю пошуку.
export function rowsOf(list, cols = GRID.cols) {
  const rows = [];
  for (let i = 0; i < list.length; i += cols) rows.push(list.slice(i, i + cols));
  return rows;
}

// Перший елемент списку — липка панель (перемикач, пошук, фільтр мови)
const BAR = { id: '__bar' };

// Обраний погляд переживає перемикання вкладок (екран перемонтовується
// щоразу), але не перезапуск застосунку.
let lastView = 'list';

// nudge — показати картку «увійди через Apple, щоб не загубити слова»
// (умови вирішує App); onNudge відкриває Параметри, onDismissNudge ховає її
// назавжди.
export default function DictionaryScreen({
  words,
  onDelete,
  onScan,
  onShare,
  nudge,
  onNudge,
  onDismissNudge,
  scenes = [],
  onSaveWords,
  onUpdateScene,
  onDeleteScene,
  onSceneVisible,
  // Відкрити аркуш слова за id (App.openWord: наліпка останнього слова в
  // сканері, віджети). Один раз на кожен новий id; onOpenWordDone каже App,
  // що запит виконано, — тоді той самий id можна попросити знову.
  // Видаленого слова немає — лишається просто вкладка.
  openWordId = null,
  onOpenWordDone,
  t,
}) {
  const { C, T, SHADOW_SM } = useTheme();
  const s = useMemo(() => makeStyles(C, SHADOW_SM), [C, SHADOW_SM]);
  const { width } = useWindowDimensions();

  const [view, setView] = useState(lastView);
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [langFilter, setLangFilter] = useState(null);
  const [sheetWord, setSheetWord] = useState(null);
  // Відкрита сцена з історії — за id: так вона бачить свіжий запис (сховані
  // підписи), а видалена зникає сама.
  const [sceneId, setSceneId] = useState(null);
  const openScene = sceneId ? scenes.find((sc) => sc.id === sceneId) || null : null;

  // Сцена — нативний Modal: тост досягнення App має почекати під ним.
  const sceneOpen = !!openScene;
  useEffect(() => {
    if (!sceneOpen || !onSceneVisible) return;
    onSceneVisible(true);
    return () => onSceneVisible(false);
  }, [sceneOpen]);

  const langsPresent = useMemo(() => langsOf(words), [words]);
  // Якщо видалили останнє слово обраної мови, фільтр зникає з екрана —
  // тож і діяти перестає, інакше людина застрягла б перед порожнім списком.
  const lang = langFilter && langsPresent.includes(langFilter) ? langFilter : null;
  // Прапорець біля слова потрібен, лише коли мов у словнику кілька
  const multiLang = langsPresent.length > 1;
  const shown = useMemo(() => filterWords(words, query, lang), [words, query, lang]);
  const { tile, row } = useMemo(() => gridMetrics(width), [width]);
  const data = useMemo(() => [BAR, ...(view === 'grid' ? rowsOf(shown) : shown)], [view, shown]);

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

  useEffect(() => {
    if (!openWordId) return;
    const item = words.find((w) => w.id === openWordId);
    if (item) {
      setSceneId(null);
      setSheetWord(item);
    }
    onOpenWordDone?.();
  }, [openWordId]);

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

  function openSceneView(sc) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSceneId(sc.id);
  }

  // Видалити сцену — лише фото з підписами; збережені з неї слова лишаються.
  function askDeleteScene(sc) {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    Alert.alert(t('sceneDelTitle'), t('sceneDelMsg'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('delete'),
        style: 'destructive',
        onPress: () => {
          layoutNext();
          onDeleteScene?.(sc.id);
        },
      },
    ]);
  }

  const sceneStrip = scenes.length ? (
    <SceneStrip scenes={scenes} onOpen={openSceneView} onLongPress={askDeleteScene} s={s} t={t} />
  ) : null;
  // key: сцена стоїть у кінці обох гілок рендеру (порожній словник і
  // звичайний), але на різних позиціях. Без ключа перше збережене зі сцени
  // слово перемикає гілку — і React перемонтовує SceneView разом із Modal:
  // картка слова закривається, сцена вдруге програє вступ, а на iOS нова
  // модалка ще й не показується, поки стара не доїхала зі своєю анімацією.
  const sceneView = (
    <SceneView
      key="sceneView"
      scene={openScene}
      savedWords={words}
      onSaveWords={onSaveWords}
      onUpdateScene={onUpdateScene}
      onClose={() => setSceneId(null)}
      t={t}
    />
  );

  const renderRow = useCallback(
    (item) => (
      <ListRow
        item={item}
        open={openId === item.id}
        flag={multiLang}
        onToggle={toggle}
        onAskDelete={askDelete}
        onShare={canShare ? shareWord : null}
        s={s}
        C={C}
        t={t}
      />
    ),
    [openId, multiLang, toggle, askDelete, canShare, shareWord, s, C, t]
  );

  if (!words.length) {
    const empty = (
      <FadeIn style={{ alignItems: 'center', alignSelf: 'stretch' }}>
        <MascotBob pose="think" size={scenes.length ? 130 : 190} />
        <Text style={s.emptyTitle}>{t(scenes.length ? 'sceneDictEmptyTitle' : 'dictEmptyTitle')}</Text>
        <Text style={s.emptyText}>{t(scenes.length ? 'sceneDictEmptyText' : 'dictEmptyText')}</Text>
        {/* Порожній стан без виходу — глухий кут. Даємо дію просто тут. */}
        {onScan && !scenes.length ? (
          <GradBtn
            title={t('scanFirstWord')}
            onPress={onScan}
            style={{ alignSelf: 'stretch', marginTop: 22 }}
          />
        ) : null}
      </FadeIn>
    );
    // Слів ще немає, а сцени вже є (кімнату відскановано, слів не збережено):
    // стрічка лишається, бо саме з неї ці слова й зберігають.
    if (!scenes.length) return <View style={s.empty}>{empty}</View>;
    return (
      <View style={[s.root, s.rootPadded]}>
        <Text style={T.largeTitle} accessibilityRole="header">{t('dictTitle')}</Text>
        <Text style={s.subtitle}>{t('dictCount', { n: 0 })}</Text>
        {sceneStrip}
        <View style={[s.empty, { paddingHorizontal: 14 }]}>{empty}</View>
        {sceneView}
      </View>
    );
  }

  const noMatch = (
    <View style={s.noMatch}>
      <Text style={s.noMatchTitle}>{t('dictNoMatch')}</Text>
      <Text style={s.noMatchText}>{t('dictNoMatchHint')}</Text>
    </View>
  );

  // Шапка їде разом зі списком
  const header = (
    <View style={s.head}>
      <Text style={T.largeTitle} accessibilityRole="header">{t('dictTitle')}</Text>
      {/* «Збережено: 24», а не «24 слів»: так число узгоджується з будь-якою
          мовою без правил множини. */}
      <Text style={s.subtitle}>{t('dictCount', { n: words.length })}</Text>

      {nudge ? <SyncNudge n={words.length} onOpen={onNudge} onHide={onDismissNudge} s={s} C={C} t={t} /> : null}
      {sceneStrip}
    </View>
  );

  // Липка панель: перемикач погляду, пошук і фільтр мови завжди під рукою
  const bar = (
    <View style={s.bar}>
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
          placeholderTextColor={C.dim}
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>
      {multiLang ? (
        <View style={s.filterRow}>
          {/* ~31 pt на вигляд, 44 pt для пальця */}
          <Pressable
            style={[s.filterChip, !lang && s.filterChipActive]}
            onPress={() => pickLang(null)}
            hitSlop={{ top: 7, bottom: 7 }}
            accessibilityState={{ selected: !lang }}
          >
            <Text style={[s.filterText, !lang && { color: C.text }]}>{t('all')}</Text>
          </Pressable>
          {langsPresent.map((l) => (
            <Pressable
              key={l}
              style={[s.filterChip, lang === l && s.filterChipActive]}
              onPress={() => pickLang(lang === l ? null : l)}
              hitSlop={{ top: 7, bottom: 7 }}
              accessibilityState={{ selected: lang === l }}
            >
              <Text style={s.filterText}>{flagFor(l)}</Text>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  function renderItem({ item }) {
    if (item === BAR) return bar;
    if (Array.isArray(item)) return <GridRow items={item} tile={tile} row={row} onOpen={openSheet} s={s} />;
    return renderRow(item);
  }

  return (
    <View style={s.root}>
      {/* Один FlatList на обидва погляди: шапка — ListHeaderComponent,
          панель пошуку — перший елемент даних і липне (у stickyHeaderIndices
          шапка — це 0, тож панель — 1). */}
      <FlatList
        data={data}
        keyExtractor={keyOfItem}
        renderItem={renderItem}
        ListHeaderComponent={header}
        stickyHeaderIndices={[1]}
        ListFooterComponent={shown.length ? null : noMatch}
        contentContainerStyle={s.listContent}
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        // Наліпки — SVG із розмитою тінню: малюємо порціями
        initialNumToRender={view === 'grid' ? 5 : 10}
        maxToRenderPerBatch={view === 'grid' ? 3 : 10}
        windowSize={7}
      />

      <WordSheet
        item={sheetWord}
        onClose={closeSheet}
        onDelete={removeWord}
        onShare={onShare}
        t={t}
      />
      {sceneView}
    </View>
  );
}

const keyOfItem = (item) => (Array.isArray(item) ? 'row-' + item[0].id : item.id);

// ─── Підказка про резервну копію ───────────────────────────────────────────
// Тиха картка, а не діалог: вхід необов'язковий, і людина, яка не хоче
// акаунта, має прибрати підказку одним дотиком і більше її не бачити.
function SyncNudge({ n, onOpen, onHide, s, C, t }) {
  const text = t('syncNudge', { n });
  function hide() {
    Haptics.selectionAsync();
    layoutNext(); // список під карткою плавно під'їжджає (без руху при reduced motion)
    onHide?.();
  }
  return (
    <FadeIn dy={6} style={s.nudge}>
      <Press style={s.nudgeMain} onPress={onOpen} accessibilityLabel={text} scaleTo={0.98}>
        <View style={s.nudgeIcon}>
          <IcCloud size={20} color={C.accent} />
        </View>
        <Text style={s.nudgeText}>{text}</Text>
      </Press>
      <Pressable
        style={s.nudgeClose}
        onPress={hide}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={t('syncNudgeHide')}
      >
        <IcClose size={16} color={C.faint} />
      </Pressable>
    </FadeIn>
  );
}

// ─── Стрічка сцен ──────────────────────────────────────────────────────────
// Компактно, як «актуальне» в профілі Instagram: мініатюри 9:16 і число слів
// на кожній. Повний перегляд — тапом, видалення — довгим натиском (або
// дією VoiceOver).
const SCENE_THUMB = { w: 60, h: 106 };

function SceneStrip({ scenes, onOpen, onLongPress, s, t }) {
  const locale = safeLocale(t('shareLocale'));
  return (
    <View style={s.scenes}>
      <Text style={s.scenesLabel}>{t('scenesTitle')}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.scenesRow}>
        {scenes.map((sc) => {
          const n = sc.objects.length - (sc.hidden?.length || 0);
          const count = t('sceneThumbWords', { n });
          return (
            <Press
              key={sc.id}
              onPress={() => onOpen(sc)}
              onLongPress={() => onLongPress(sc)}
              scaleTo={0.95}
              accessibilityLabel={`${t('sceneThumb')}, ${count}, ${dateLabel(sc.createdAt, locale)}`}
              accessibilityActions={[{ name: 'delete', label: t('delete') }]}
              onAccessibilityAction={(e) => e.nativeEvent.actionName === 'delete' && onLongPress(sc)}
              style={s.sceneThumb}
            >
              <Image source={{ uri: sceneImageUri(sc) }} style={StyleSheet.absoluteFill} resizeMode="cover" />
              <View style={s.sceneThumbShade} />
              <Text style={s.sceneThumbText} numberOfLines={1} maxFontSizeMultiplier={1.1}>
                {count}
              </Text>
            </Press>
          );
        })}
      </ScrollView>
    </View>
  );
}

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

// ─── Рядок альбому: до трьох наліпок ───────────────────────────────────────
const GridRow = memo(function GridRow({ items, tile, row, onOpen, s }) {
  return (
    <View style={s.gridRow}>
      {items.map((item) => (
        <GridTile key={item.id} item={item} tile={tile} row={row} onOpen={onOpen} s={s} />
      ))}
    </View>
  );
});

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
const ListRow = memo(function ListRow({ item, open, flag, onToggle, onAskDelete, onShare, s, C, t }) {
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
            {item.word}
            {flag ? <Text style={s.flag}> {flagFor(lang)}</Text> : null}
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
    root: { flex: 1, backgroundColor: C.bg },
    // слів ще немає, а сцени є — без списку, відступи як у шапки
    rootPadded: { padding: 20, paddingBottom: 0 },
    listContent: { paddingBottom: UNDER_TAB + 8 },
    head: { paddingHorizontal: 20, paddingTop: 20 },
    subtitle: { color: C.dim, ...type(13, F.reg), marginTop: 2, marginBottom: 14 },
    // Липка панель на тлі екрана: рядки проїжджають під нею
    bar: { backgroundColor: C.bg, paddingHorizontal: 20, paddingTop: 6, paddingBottom: 4 },

    // Підказка про вхід: м'який акцентний фон, як у картки Pro в Параметрах,
    // — помітна, але не кричить червоним чи градієнтом.
    nudge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: C.accentSoft,
      borderRadius: R.lg,
      marginBottom: 12,
    },
    nudgeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 12, paddingLeft: 12 },
    nudgeIcon: {
      width: 34,
      height: 34,
      borderRadius: 11,
      backgroundColor: C.card,
      alignItems: 'center',
      justifyContent: 'center',
    },
    nudgeText: { flex: 1, color: C.text, ...type(14, F.semi) },
    nudgeClose: { width: 44, minHeight: 44, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
    // Стрічка сцен виходить за поля екрана: мініатюри доїжджають до краю,
    // як будь-яка горизонтальна стрічка в iOS.
    scenes: { marginHorizontal: -20, marginBottom: 14 },
    scenesLabel: { ...CAPS, color: C.dim, marginHorizontal: 20, marginBottom: 8 },
    scenesRow: { paddingHorizontal: 20, gap: 8 },
    sceneThumb: {
      width: SCENE_THUMB.w,
      height: SCENE_THUMB.h,
      borderRadius: R.sm,
      overflow: 'hidden',
      backgroundColor: C.card2,
      justifyContent: 'flex-end',
    },
    // Низ мініатюри темніший, щоб число читалось на будь-якому фото
    sceneThumbShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 36, backgroundColor: 'rgba(0,0,0,0.38)' },
    sceneThumbText: { color: '#FFFFFF', ...type(11, F.extra, { noLead: true }), textAlign: 'center', paddingHorizontal: 4, paddingBottom: 7 },

    segment: { flexDirection: 'row', backgroundColor: C.card2, borderRadius: R.md, padding: 3, marginBottom: 10 },
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
      marginBottom: 8,
    },
    search: {
      flex: 1,
      paddingVertical: 13,
      color: C.text,
      ...type(16, F.reg, { noLead: true }),
    },
    filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
    filterChip: {
      paddingHorizontal: 13,
      paddingVertical: 7,
      borderRadius: R.pill,
      backgroundColor: C.card,
    },
    filterChipActive: { backgroundColor: C.accentSoft },
    filterText: { color: C.dim, ...type(13, F.semi, { noLead: true }) },

    // Альбом: проміжки між наліпками — повітря, а не лінії сітки.
    gridRow: { flexDirection: 'row', gap: GRID.gap, paddingHorizontal: GRID.pad },
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
    tileArticle: { color: C.dim },

    noMatch: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24 },
    noMatchTitle: { color: C.text, ...type(17, F.bold) },
    noMatchText: { color: C.dim, ...type(14, F.reg), textAlign: 'center', marginTop: 4 },

    // Рядок словника — плаваюча картка, а не рядок із розділювачем:
    // на крейдяному тлі лінія-роздільник додає бруду, тінь — ні.
    card: {
      backgroundColor: C.card,
      borderRadius: R.lg,
      padding: 14,
      marginHorizontal: 20,
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
