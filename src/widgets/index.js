// Віджет «Слово дня»: таймлайн із кешу слова дня + тап по віджету.
//
// Застосунок не тримає віджет «живим»: він один раз віддає WidgetKit
// таймлайн — по запису на кожен закешований день, з локальної півночі, — і
// система сама перемикає слова, навіть коли застосунок не запускали тиждень.
// Після останнього закешованого дня віджет чесно каже «відкрий застосунок»,
// а не показує вчорашнє слово як сьогоднішнє.
//
// Нативна частина є лише в iOS-збірці (не в Expo Go, не на Android, не в
// jest без заглушки), тому все тут тихо нічого не робить, якщо її немає, і
// ніколи не кидає помилок у застосунок.
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';
import { localDayKey } from '../storage';
import { nameFor } from '../speech';
import { topicName } from '../profile';
import { clipLines, dayFromKey, ipaLabel, quote } from '../share/layout';

// Адреса, яку відкриває тап по віджету (див. widgetURL у WordOfDayWidget.js).
const LINK = /^lingualens:\/\/\/?word-of-day(?:[/?#]|$)/i;

// Приклад у середньому віджеті — два рядки по ~290 пт кеглем 13. Ріжемо
// по слову самі: SwiftUI обрізав би посеред слова разом із закривальною лапкою.
const EXAMPLE_LINES = 2;
const EXAMPLE_SIZE = 13;
const EXAMPLE_WIDTH = 290;

// undefined — ще не пробували; null — віджетів тут немає.
let widget;

// Модуль віджета підтягуємо ліниво: на iOS без нативної частини (Expo Go)
// expo-widgets кидає вже під час імпорту. createWidget заодно кладе розмітку
// в App Group — без цього розширення віджета не знає, що малювати.
// Expo Go відсіюємо ДО require: лінивий require поза ініціалізацією модулів
// Metro загортає сам і віддає помилку в reportFatalError (червоний екран),
// а не в наш catch. try лишається для збірок, де модуля немає з інших причин.
function getWidget() {
  if (widget !== undefined) return widget;
  widget = null;
  if (Platform.OS !== 'ios' || Constants.executionEnvironment === 'storeClient') return null;
  try {
    widget = require('./WordOfDayWidget').default || null;
  } catch (_) {}
  return widget;
}

// Справжній день 'YYYY-MM-DD': '2026-02-31' Date тихо переніс би на березень.
function isDayKey(key) {
  const d = dayFromKey(key);
  return !!d && localDayKey(d) === key;
}

function nextDayKey(key) {
  const d = dayFromKey(key);
  return localDayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1));
}

const text = (v) => (typeof v === 'string' ? v.trim() : '');

// Props віджета — лише рядки: WidgetKit зберігає їх у UserDefaults, де
// null чи undefined не мають місця. Набір ключів однаковий для обох станів.
// Тема (topic) — назва, а не ключ: розширення віджета не має перекладів.
// У підписі вона стоїть замість «слово дня» («English · Фінанси»): що це
// слово дня, видно й так, а тема каже, що воно підібране під людину.
function wordProps(w, { t, title, caption, lang, langName }) {
  const word = text(w.word);
  const translation = text(w.translation);
  const example = text(w.example);
  const topic = topicName(t, w.topic);
  return {
    state: 'word',
    title,
    caption: topic ? `${langName} · ${topic}` : caption,
    topic,
    word,
    ipa: ipaLabel(w.ipa),
    translation,
    example: example ? quote(clipLines(example, EXAMPLE_LINES, EXAMPLE_SIZE, EXAMPLE_WIDTH), lang) : '',
    message: '',
    line: translation ? `${word} — ${translation}` : word,
    a11y: [title, topic, word, translation].filter(Boolean).join(', '),
  };
}

function emptyProps(t, title) {
  const message = t('widgetEmpty');
  return {
    state: 'empty',
    title,
    caption: '',
    topic: '',
    word: '',
    ipa: '',
    translation: '',
    example: '',
    message,
    line: t('widgetEmptyShort'),
    a11y: message,
  };
}

// Таймлайн для WidgetKit: [{ date, props }] за зростанням дати.
//   • перший запис — «зараз» (WidgetKit показує його одразу);
//   • далі — по запису на кожен закешований день із його локальної півночі;
//   • після останнього дня (і в кожній дірці між днями) — стан «відкрий
//     застосунок», щоб слово не жило довше за свій день.
// Кеш іншої пари мов не годиться — так само, як для картки в застосунку.
export function buildWordTimeline(cache, { t, targetLang, nativeLang, now = new Date() }) {
  const title = t('widgetTitle');
  const empty = emptyProps(t, title);
  const fits = !!cache && cache.lang === targetLang && cache.native === nativeLang && Array.isArray(cache.words);
  const today = localDayKey(now);
  const seen = new Set();
  const days = (fits ? cache.words : [])
    .filter((w) => w && isDayKey(w.date) && w.date >= today && text(w.word))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .filter((w) => !seen.has(w.date) && seen.add(w.date));

  const langName = nameFor(targetLang);
  const labels = { t, title, caption: t('widgetCaption', { lang: langName }), lang: targetLang, langName };
  const entries = [];
  if (!days.length || days[0].date !== today) entries.push({ date: now, props: empty });
  days.forEach((w, i) => {
    entries.push({ date: w.date === today ? now : dayFromKey(w.date), props: wordProps(w, labels) });
    const next = nextDayKey(w.date);
    if (days[i + 1]?.date !== next) entries.push({ date: dayFromKey(next), props: empty });
  });
  return entries;
}

// Оновлює віджет. true — таймлайн передано WidgetKit. Ніколи не кидає:
// віджет — приємний додаток, і його збій не має зачепити застосунок.
export function updateWordWidget(cache, opts) {
  const w = getWidget();
  if (!w) return false;
  try {
    w.updateTimeline(buildWordTimeline(cache, opts));
    return true;
  } catch (_) {
    return false;
  }
}

// Чи є на цьому телефоні віджет (iOS-збірка з нативною частиною). Лише тоді
// має сенс підказка «додай слово дня на головний екран».
export function widgetsAvailable() {
  return !!getWidget();
}

export function isWidgetLink(url) {
  return typeof url === 'string' && LINK.test(url);
}

// Тап по віджету → колбек. Як і зі сповіщеннями, холодний старт приносить
// адресу через getInitialURL, а запущений застосунок — подією 'url'.
// Обидва шляхи можуть повідомити той самий тап — колбек має бути ідемпотентним.
export function subscribeToWidgetTaps(onTap) {
  let active = true;
  Linking.getInitialURL()
    .then((url) => {
      if (active && isWidgetLink(url)) onTap();
    })
    .catch(() => {});
  const sub = Linking.addEventListener('url', (e) => {
    if (isWidgetLink(e?.url)) onTap();
  });
  return () => {
    active = false;
    sub?.remove?.();
  };
}
