// Синхронізація словника між iPhone однієї людини (після входу через Apple).
//
// Модель — «пізніша зміна перемагає» для кожного слова окремо, як на сервері:
//   • кожна локальна зміна слова ставить updatedAt (touch);
//   • видалення лишає надгробок { id, deleted, updatedAt } — без нього слово,
//     стерте тут, повернулося б з іншого телефона. Після успішного надсилання
//     надгробок забуваємо: далі його 60 днів тримає сервер;
//   • syncedAt — локальна позначка «саме цю версію сервер уже має».
//     Слово брудне, коли updatedAt ≠ syncedAt. Позначка, а не «час останнього
//     надсилання», бо годинники телефонів розходяться: слово з iPhone, чий
//     годинник поспішає, здавалося б «новим» і ганялося б туди-сюди, а
//     місцеві зміни на годиннику, що відстає, — «старими» й не надсилались би.
//
// Фото, контур, рамка й сцена — лише на цьому телефоні: на сервер не йдуть
// і при злитті лишаються на місці.
//
// Тут чисті функції й runSync, якому все зовнішнє передають параметром:
// тести ганяють його проти несправжнього сервера з двома «телефонами».
import AsyncStorage from '@react-native-async-storage/async-storage';

// Сервер приймає не більше 500 слів за запит (контракт /sync).
export const CHUNK = 500;

// Поля, які знає сервер (білий список контракту), крім id та updatedAt.
const WIRE = ['word', 'ipa', 'translation', 'example', 'exampleTranslation', 'lang', 'nativeLang', 'addedAt', 'srs'];
// Те, що описує саму наліпку на цьому телефоні. Переїжджає разом із фото.
const STICKER = ['photo', 'shape', 'outline', 'box', 'sceneId'];

const SYNC_KEY = 'll_sync_v1';
const TOMBS_KEY = 'll_tombstones_v1';

// ─── Позначки часу ─────────────────────────────────────────────────────────

// Слова зі старих версій не мають updatedAt — їхня остання зміна — додавання.
export function stampOf(w) {
  return (w && (w.updatedAt || w.addedAt)) || 0;
}

// Нова версія слова завжди новіша за ту, з якої її зроблено, навіть якщо
// годинник цього телефона відстає від того, що писав попередню: інакше
// сервер відкинув би правку як «старішу».
export function touch(w, now = Date.now()) {
  return { ...w, updatedAt: Math.max(now, stampOf(w) + 1) };
}

export function isDirty(w) {
  return w.syncedAt !== stampOf(w);
}

export function tombstoneFor(w, now = Date.now()) {
  return { id: w.id, deleted: true, updatedAt: Math.max(now, stampOf(w) + 1) };
}

// ─── Слово ⇄ запис для сервера ─────────────────────────────────────────────

export function toWire(w) {
  const out = { id: w.id, updatedAt: stampOf(w) };
  for (const k of WIRE) if (w[k] !== undefined && w[k] !== null) out[k] = w[k];
  return out;
}

function pickWire(e) {
  const out = {};
  for (const k of WIRE) if (e[k] !== undefined) out[k] = e[k];
  return out;
}

function fromWire(e) {
  return { id: e.id, ...pickWire(e), updatedAt: e.updatedAt, syncedAt: e.updatedAt };
}

// Серверна версія поверх місцевої: тексти й повторення — з сервера,
// наліпка (і все, чого сервер не знає) — своя.
function adopt(local, e) {
  return { ...local, ...pickWire(e), updatedAt: e.updatedAt, syncedAt: e.updatedAt };
}

// Що надіслати: брудні слова (або всі — перша синхронізація з акаунтом
// чи сервер втратив дані) і надгробки.
export function outgoing(words, tombstones = [], { all = false } = {}) {
  const live = all ? words : words.filter(isDirty);
  return [...live.map(toWire), ...tombstones];
}

// Завжди хоча б одна пачка: запит без слів теж забирає зміни з сервера.
export function chunks(list, size = CHUNK) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out.length ? out : [[]];
}

// ─── Злиття ────────────────────────────────────────────────────────────────

// Однакове слово з двох телефонів (той самий предмет відсканували до входу
// на обох) після злиття — два записи з різними id. Лишаємо один, і кожен
// телефон мусить обрати той самий, ні про що не домовляючись: переможець —
// найраніше додане (addedAt не змінюється ніколи), за рівності — менший id.
export function dupKey(w) {
  const word = String(w.word || '').trim().toLowerCase();
  return word ? (w.lang || 'en') + '\u0000' + word : null;
}

function withSticker(word, from) {
  const out = { ...word };
  for (const f of STICKER) if (from[f] !== undefined) out[f] = from[f];
  return out;
}

// Слово стерли на іншому телефоні — найчастіше тому, що той уже звів
// дублікати і переможцем обрав двійника. Наліпка цього телефона тоді
// переходить до двійника без наліпки, а не в смітник; немає двійника —
// файл прибираємо.
function rehome(words, orphans, removedPhotos) {
  let out = words;
  for (const o of orphans) {
    const k = dupKey(o);
    const i = k ? out.findIndex((x) => !x.photo && dupKey(x) === k) : -1;
    if (i === -1) {
      removedPhotos.push(o.photo);
      continue;
    }
    if (out === words) out = words.slice();
    out[i] = withSticker(out[i], o);
  }
  return out;
}

function earlier(a, b) {
  const x = a.addedAt || 0;
  const y = b.addedAt || 0;
  return x !== y ? x < y : String(a.id) < String(b.id);
}

// → { words, tombstones, removedPhotos }. Надгробок переможеного має час
// його версії + 1: однаковий на всіх телефонах і все одно новіший за неї,
// тож сервер прийме його один раз, а повтор з іншого телефона — проігнорує.
// Наліпка переможеного переходить до переможця, якщо в того своєї немає.
export function dedupe(words) {
  const best = new Map();
  for (const w of words) {
    const k = dupKey(w);
    if (!k) continue;
    const cur = best.get(k);
    if (!cur || earlier(w, cur)) best.set(k, w);
  }
  const tombstones = [];
  const removedPhotos = [];
  const merged = new Map();
  for (const w of words) {
    const k = dupKey(w);
    const win = k && best.get(k);
    if (!win || win === w) continue;
    tombstones.push({ id: w.id, deleted: true, updatedAt: stampOf(w) + 1 });
    let into = merged.get(win.id) || win;
    if (w.photo) {
      if (into.photo) removedPhotos.push(w.photo);
      else into = withSticker(into, w);
    }
    merged.set(win.id, into);
  }
  if (!tombstones.length) return { words, tombstones, removedPhotos };
  const losers = new Set(tombstones.map((x) => x.id));
  return {
    words: words.filter((w) => !losers.has(w.id)).map((w) => merged.get(w.id) || w),
    tombstones,
    removedPhotos,
  };
}

// Зміни з сервера поверх ПОТОЧНОГО списку (з усім, що людина встигла
// змінити, поки летів запит).
//   sent       — Map id → updatedAt того, що надіслав цей самий запит;
//   tombstones — місцеві надгробки, ще не надіслані.
// → { words, tombstones (нові, з дедуплікації), removedPhotos, changed }.
//
// Правила:
//   • наша надіслана версія, якої відтоді ніхто не чіпав, приймає серверну
//     беззастережно: сервер міг урізати час із майбутнього до свого «зараз»
//     або відхилити нашу правку на користь новішої;
//   • інакше перемагає новіша; за рівності — серверна, як і на сервері
//     (він приймає лише строго новіше), тож усі телефони сходяться;
//   • слово, стерте тут пізніше за серверну версію, не воскресає;
//   • надіслане, якого сервер не повернув, у нього вже є (рівний час або
//     він його відкинув як некоректне) — позначаємо, щоб не слати вічно.
export function applyRemote(words, remote, { sent = new Map(), tombstones = [] } = {}) {
  const index = new Map(words.map((w, i) => [w.id, i]));
  const deletedAt = new Map(tombstones.map((x) => [x.id, x.updatedAt]));
  const next = words.slice();
  const gone = new Set();
  const added = new Map();
  const echoed = new Set();
  const orphans = [];
  let changed = false;

  for (const e of Array.isArray(remote) ? remote : []) {
    if (!e || typeof e.id !== 'string' || !Number.isFinite(e.updatedAt)) continue;
    echoed.add(e.id);
    const i = index.get(e.id);
    if (i === undefined) {
      const del = deletedAt.get(e.id);
      if (e.deleted || (del !== undefined && del > e.updatedAt)) {
        added.delete(e.id);
        continue;
      }
      const prev = added.get(e.id);
      if (!prev || e.updatedAt >= prev.updatedAt) added.set(e.id, fromWire(e));
      changed = true;
      continue;
    }
    if (gone.has(i)) continue;
    const local = next[i];
    const untouched = sent.get(e.id) === stampOf(local);
    if (!untouched && e.updatedAt < stampOf(local)) continue;
    if (e.deleted) {
      gone.add(i);
      if (local.photo) orphans.push(local);
    } else {
      next[i] = adopt(local, e);
    }
    changed = true;
  }

  for (const [id, at] of sent) {
    if (echoed.has(id)) continue;
    const i = index.get(id);
    if (i === undefined || gone.has(i)) continue;
    const w = next[i];
    if (stampOf(w) === at && w.syncedAt !== at) {
      next[i] = { ...w, syncedAt: at };
      changed = true;
    }
  }

  if (!changed) {
    const d = dedupe(words);
    return { ...d, changed: d.tombstones.length > 0 };
  }
  const merged = next.filter((_, i) => !gone.has(i)).concat([...added.values()]);
  const d = dedupe(merged);
  const removedPhotos = d.removedPhotos.slice();
  return { words: rehome(d.words, orphans, removedPhotos), tombstones: d.tombstones, removedPhotos, changed: true };
}

// Лічильники між телефонами — максимум (повтор того самого запиту нічого
// не подвоює); показані досягнення — об'єднання. Без змін повертаємо той
// самий об'єкт, щоб React не перемальовував екран даремно.
export function mergeCounts(local, remote) {
  if (!remote || typeof remote !== 'object' || Array.isArray(remote)) return local;
  let next = local;
  for (const [k, v] of Object.entries(remote)) {
    if (!Number.isFinite(v) || v <= (local[k] || 0)) continue;
    if (next === local) next = { ...local };
    next[k] = v;
  }
  return next;
}

export function mergeSeen(local, remote) {
  if (!Array.isArray(remote)) return local;
  const have = new Set(local);
  const extra = remote.filter((id) => typeof id === 'string' && !have.has(id));
  return extra.length ? [...local, ...new Set(extra)] : local;
}

// Чи є тут щось, чого сервер ще не бачив (порівняно з його останньою відповіддю).
export function countsAhead(local, server) {
  return Object.entries(local || {}).some(([k, v]) => v > ((server && server[k]) || 0));
}
export function seenAhead(local, server) {
  const have = new Set(server || []);
  return (local || []).some((id) => !have.has(id));
}

// ─── Збережений стан ───────────────────────────────────────────────────────
// since — останній бачений rev сервера. Прив'язаний до id акаунта: інший
// акаунт — і синхронізація починається з нуля (усе туди, усе звідти).
export async function loadSyncState(userId) {
  try {
    const st = JSON.parse((await AsyncStorage.getItem(SYNC_KEY)) || 'null');
    if (st && st.id === userId) return { since: Number(st.since) || 0, at: Number(st.at) || 0 };
  } catch (_) {}
  return { since: 0, at: 0 };
}

async function saveSyncState(userId, since, at) {
  try {
    await AsyncStorage.setItem(SYNC_KEY, JSON.stringify({ id: userId, since, at }));
  } catch (_) {}
}

// Надгробки читають і пишуть і синхронізація, і видалення слів, що можуть
// статися посеред неї. Усе через одну чергу — інакше «прочитав → дописав»
// двох викликів загубив би один із надгробків.
let tombQueue = Promise.resolve();
function serial(fn) {
  const run = tombQueue.then(fn, fn);
  tombQueue = run.catch(() => {});
  return run;
}

async function readTombs() {
  try {
    const list = JSON.parse((await AsyncStorage.getItem(TOMBS_KEY)) || '[]');
    return Array.isArray(list) ? list : [];
  } catch (_) {
    return [];
  }
}

async function writeTombs(list) {
  try {
    if (list.length) await AsyncStorage.setItem(TOMBS_KEY, JSON.stringify(list));
    else await AsyncStorage.removeItem(TOMBS_KEY);
  } catch (_) {}
}

export function loadTombstones() {
  return serial(readTombs);
}

// Той самий id — лишається пізніший надгробок.
export function addTombstones(list) {
  return serial(async () => {
    const byId = new Map((await readTombs()).map((x) => [x.id, x]));
    for (const x of list) {
      const cur = byId.get(x.id);
      if (!cur || x.updatedAt > cur.updatedAt) byId.set(x.id, x);
    }
    const out = [...byId.values()];
    await writeTombs(out);
    return out;
  });
}

// Забуваємо лише те, що сервер прийняв: надгробок, переписаний пізнішим
// видаленням, поки летів запит, лишається до наступного разу.
function dropTombstones(sent) {
  if (!sent.length) return Promise.resolve();
  const at = new Map(sent.map((x) => [x.id, x.updatedAt]));
  return serial(async () => {
    const list = await readTombs();
    const keep = list.filter((x) => !(at.has(x.id) && x.updatedAt <= at.get(x.id)));
    if (keep.length !== list.length) await writeTombs(keep);
  });
}

export function clearSyncData() {
  return serial(async () => {
    try {
      await AsyncStorage.multiRemove([SYNC_KEY, TOMBS_KEY]);
    } catch (_) {}
  });
}

// ─── Запуск ────────────────────────────────────────────────────────────────
// io — усе, що синхронізація бере ззовні:
//   userId               — акаунт (ключ для since);
//   request(body)        — POST /sync, кидає помилку з кодом;
//   getWords()           — поточний список слів;
//   counts()             — { activity, stats, seen } для надсилання;
//   apply({ words, activity, stats, seen }) — words: fn(prev) → next, яку
//                          треба викликати синхронно; решта — відповідь
//                          сервера для злиття. Усе одним махом, щоб екран
//                          (і досягнення) побачили зміни разом;
//   removePhoto(photo)   — прибрати файл наліпки;
//   alive()              — false: синхронізацію скасовано (вихід з акаунта,
//                          інший акаунт), відповідь застосовувати не можна.
// → { at, since, tombstones } або null, якщо скасовано. tombstones — скільки
// надгробків чекає наступного разу (слова стирали, поки йшли запити).
export async function runSync(io, now = () => Date.now()) {
  let { since } = await loadSyncState(io.userId);
  let all = since === 0;
  let restarted = false;
  // Не більше трьох проходів: основний, після втрати даних на сервері й
  // після дедуплікації (її надгробки варто віддати одразу).
  for (let pass = 0; pass < 3; pass++) {
    const list = outgoing(io.getWords(), await loadTombstones(), { all });
    let lost = false;
    let deduped = false;
    for (const [n, part] of chunks(list).entries()) {
      const body = { since, words: part, ...(n === 0 ? io.counts() : null) };
      const res = await io.request(body);
      if (!io.alive()) return null;
      // since > 0, а сервер каже «ось усе з нуля» — він втратив дані.
      // Ця відповідь неповна для нас: надсилаємо весь словник наново.
      if (res?.reset && since > 0) {
        lost = true;
        break;
      }
      const sent = new Map(part.filter((e) => !e.deleted).map((e) => [e.id, e.updatedAt]));
      const tombs = await loadTombstones();
      if (!io.alive()) return null;
      let out = null;
      io.apply({
        words: (prev) => {
          out = applyRemote(prev, res?.words, { sent, tombstones: tombs });
          return out.words;
        },
        activity: res?.activity,
        stats: res?.stats,
        seen: res?.seen,
      });
      if (out) {
        out.removedPhotos.forEach((p) => io.removePhoto(p));
        if (out.tombstones.length) {
          await addTombstones(out.tombstones);
          deduped = true;
        }
      }
      await dropTombstones(part.filter((e) => e.deleted));
      since = Number.isFinite(res?.rev) ? res.rev : since;
      await saveSyncState(io.userId, since, now());
    }
    if (lost && !restarted) {
      restarted = true;
      all = true;
      since = 0;
      continue;
    }
    if (!deduped) break;
    all = false;
  }
  const at = now();
  await saveSyncState(io.userId, since, at);
  return { at, since, tombstones: (await loadTombstones()).length };
}
