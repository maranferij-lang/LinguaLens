// «Переклад» тапом у віджеті (widgets.md §6): що робити з тим, що віджет
// змінив сам, без застосунку.
//
// Кнопка у віджеті повертає { revealed: '1' }, і expo-widgets зливає це в
// props саме того запису таймлайну. Застосунок переписує таймлайн часто
// (новий кеш, мова, тема), і без перенесення відкритий переклад ховався б
// знову посеред дня. Тож кожен запис має стабільний key, а перед записом
// нового таймлайну переносимо revealed з тих записів, де key той самий.
//
// Для статистики ті самі позначки — єдиний слід того, що віджетом
// користуються: addUserInteractionListener чує лише, поки застосунок живий.
import AsyncStorage from '@react-native-async-storage/async-storage';

// Нові записи з revealed: '1' там, де старий запис із тим самим key вже
// відкрили. Інше слово (інший key) — знову приховане. Повертає новий масив.
export function carryReveals(old, next) {
  const open = new Set();
  for (const e of Array.isArray(old) ? old : []) {
    const p = e && e.props;
    if (p && p.revealed === '1' && p.key) open.add(p.key);
  }
  if (!open.size) return next;
  return next.map((e) => (open.has(e.props.key) ? { ...e, props: { ...e.props, revealed: '1' } } : e));
}

// Прочитати таймлайн, не падаючи: збій нативу — це просто «нічого не відкривали».
export async function readTimeline(widget) {
  try {
    const list = await widget.getTimeline();
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

const SEEN_KEY = 'll_widget_reveals_v1';
// Скільки останніх ключів пам'ятати: тижневий таймлайн «Моїх слів» —
// до 85 записів, «Слова дня» — до 85; 200 вистачає на обидва з запасом.
const SEEN_MAX = 200;

async function loadSeen() {
  try {
    const raw = await AsyncStorage.getItem(SEEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((k) => typeof k === 'string') : [];
  } catch (_) {
    return [];
  }
}

// Скільки нових розкриттів у кожному віджеті з минулого разу:
// timelines — { wod: [...], words: [...] } (записи з getTimeline). Кожен key
// рахується один раз. → { wod: n, words: n }
export async function harvestReveals(timelines) {
  const seen = await loadSeen();
  const known = new Set(seen);
  const counts = {};
  const fresh = [];
  for (const [kind, list] of Object.entries(timelines || {})) {
    counts[kind] = 0;
    for (const e of Array.isArray(list) ? list : []) {
      const key = e?.props?.key;
      if (e?.props?.revealed !== '1' || !key || known.has(key)) continue;
      known.add(key);
      fresh.push(key);
      counts[kind]++;
    }
  }
  if (fresh.length) {
    try {
      await AsyncStorage.setItem(SEEN_KEY, JSON.stringify([...seen, ...fresh].slice(-SEEN_MAX)));
    } catch (_) {}
  }
  return counts;
}

// Стерти разом із даними людини (resetWidgets).
export async function forgetReveals() {
  try {
    await AsyncStorage.removeItem(SEEN_KEY);
  } catch (_) {}
}
