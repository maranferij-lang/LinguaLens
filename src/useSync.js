// Синхронізація словника для App: коли запускати, що показати в Параметрах,
// як застосувати відповідь сервера, не загубивши правок, зроблених поки
// летів запит. Сам алгоритм — у sync.js.
//
// Коли синхронізуємось:
//   • на старті, щойно є сесія, і одразу після входу (зміна акаунта);
//   • коли застосунок повертається на екран;
//   • через ~5 с після останньої місцевої зміни (кілька правок — один запит);
//   • кнопкою «Синхронізувати зараз».
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { apiSync, deviceForgotten } from './api';
import { deletePhoto } from './photos';
import { persistActivity, persistSeenAchievements, persistStats, persistWords } from './storage';
import {
  addTombstones,
  clearSyncData,
  countsAhead,
  isDirty,
  loadSyncState,
  loadTombstones,
  mergeCounts,
  mergeSeen,
  runSync,
  seenAhead,
  tombstoneFor,
} from './sync';

const DEBOUNCE_MS = 5000;
// Повернення в застосунок частіше за це не варте окремого запиту.
const FOREGROUND_GAP_MS = 15000;

// Слова з синхронним «джерелом правди» в ref. Відповідь сервера зливається
// з тим, що є саме зараз (а не з копією з останнього рендера), і кожна
// зміна бачить попередню — навіть кілька поспіль до перемальовки екрана.
// setWords(next | prev => next, { persist }) повертає новий список одразу.
export function useWordStore() {
  const ref = useRef([]);
  const [words, setState] = useState([]);
  const setWords = useCallback((next, { persist = true } = {}) => {
    const value = typeof next === 'function' ? next(ref.current) : next;
    if (value === ref.current) return value;
    ref.current = value;
    setState(value);
    if (persist) persistWords(value);
    return value;
  }, []);
  return [words, setWords, ref];
}

// enabled — вхід виконано й дані прочитано. Пари [значення, setter] — стан
// App; setter-и тут викликаються з функцією-оновленням, як і в самому App.
// onSignedOut — сервер каже, що акаунт більше не прив'язаний до Apple;
// onForgotten — сервер не знає цього токена (акаунт стерли з іншого iPhone).
export function useSync({
  userId,
  enabled,
  words: [words, setWords, wordsRef],
  activity: [activity, setActivity],
  stats: [stats, setStats],
  seen: [seen, setSeen],
  onSignedOut,
  onForgotten,
}) {
  const [state, setState] = useState({ status: 'idle', at: 0, error: null });
  const latest = useRef(null);
  latest.current = { userId, enabled, activity, stats, seen, onSignedOut, onForgotten };
  // epoch росте при кожному скасуванні: відповідь запиту, що встиг вилетіти
  // до виходу з акаунта, не має дописати слова в уже очищений телефон.
  // error — код, яким закінчилась остання спроба (для діалогу виходу).
  const run = useRef({ epoch: 0, busy: null, again: false, timer: null, attempt: 0, server: null, tombs: false, error: null });

  // Застосувати відповідь: слова, лічильники й показані досягнення — разом,
  // в одному оновленні екрана. Інакше підтягнуті слова на мить опинились би
  // без «уже показаних» досягнень, і посипались би вітання за чужі успіхи.
  // Лічильники зливаються функцією-оновленням (щоб не загубити дію, ще не
  // намальовану на екрані), а вона спрацьовує вже під час рендера. Якщо
  // людина встигла вийти з акаунта до нього, зберігати злите не можна —
  // інакше старі лічильники лягли б у вже очищене сховище.
  function apply(res) {
    const epoch = run.current.epoch;
    const keep = (persist) => (prev, next) => {
      if (next !== prev && run.current.epoch === epoch) persist(next);
      return next;
    };
    setWords(res.words);
    setActivity((prev) => keep(persistActivity)(prev, mergeCounts(prev, res.activity)));
    setStats((prev) => keep(persistStats)(prev, mergeCounts(prev, res.stats)));
    setSeen((prev) => keep(persistSeenAchievements)(prev, mergeSeen(prev, res.seen)));
    run.current.server = { activity: res.activity || {}, stats: res.stats || {}, seen: res.seen || [] };
  }

  const syncNow = useCallback(() => {
    const r = run.current;
    const { enabled: on, userId: id } = latest.current;
    if (!on || !id) return Promise.resolve(false);
    if (r.busy) {
      r.again = true;
      return r.busy;
    }
    clearTimeout(r.timer);
    const epoch = r.epoch;
    const alive = () => run.current.epoch === epoch && latest.current.userId === id && latest.current.enabled;
    r.attempt = Date.now();
    setState((s) => ({ ...s, status: 'syncing', error: null }));
    const job = (async () => {
      try {
        const out = await runSync({
          userId: id,
          request: apiSync,
          getWords: () => wordsRef.current,
          counts: () => {
            const c = latest.current;
            return { activity: c.activity, stats: c.stats, seen: c.seen };
          },
          apply,
          removePhoto: deletePhoto,
          alive,
        });
        if (!out) return false;
        r.tombs = out.tombstones > 0;
        // DICT_FULL: решта синхронізована (час оновлюємо), але нові слова
        // лишились тут — кажемо про це тим самим рядком, що й про помилку.
        r.error = out.error || null;
        setState({ status: out.error ? 'error' : 'idle', at: out.at, error: r.error });
        return !out.error;
      } catch (e) {
        if (!alive()) return false;
        if (e?.code === 'SIGN_IN_REQUIRED') {
          // Прив'язку до Apple зняли на сервері — далі ми просто гість.
          await clearSyncData();
          setState({ status: 'idle', at: 0, error: null });
          latest.current.onSignedOut?.();
          return false;
        }
        if (deviceForgotten(e)) {
          await clearSyncData();
          setState({ status: 'idle', at: 0, error: null });
          latest.current.onForgotten?.();
          return false;
        }
        r.error = e?.code || 'FAILED';
        setState((s) => ({ ...s, status: 'error', error: r.error }));
        return false;
      } finally {
        if (run.current.epoch === epoch) {
          r.busy = null;
          if (r.again) {
            r.again = false;
            syncNow();
          }
        }
      }
    })();
    r.busy = job;
    return job;
  }, []);

  // Чи є місцеве, чого сервер ще не бачив.
  const pending = useCallback(() => {
    const r = run.current;
    return wordsRef.current.some(isDirty) || r.tombs;
  }, []);

  // Чим закінчилась остання спроба: стан у рендері для виходу з акаунта
  // застарий, а він має назвати справжню причину (DICT_FULL ≠ немає мережі).
  const lastError = useCallback(() => run.current.error, []);

  function hasLocalChanges() {
    const r = run.current;
    const srv = r.server;
    if (pending()) return true;
    if (!srv) return false;
    return countsAhead(activity, srv.activity) || countsAhead(stats, srv.stats) || seenAhead(seen, srv.seen);
  }

  // Видалені слова — надгробки. Лише в акаунті: гостю нема з чим
  // синхронізувати, а надгробки просто накопичувались би.
  const noteDeleted = useCallback((list) => {
    if (!latest.current.enabled || !list.length) return;
    run.current.tombs = true;
    // Вихід з акаунта, що стане в черзі раніше, ці надгробки не пропустить.
    const epoch = run.current.epoch;
    addTombstones(
      list.map((w) => tombstoneFor(w)),
      () => run.current.epoch === epoch
    );
  }, []);

  // Скасувати все: таймер і запит у польоті (його відповідь проігнорується).
  function cancel() {
    const r = run.current;
    r.epoch++;
    r.busy = null;
    r.again = false;
    r.server = null;
    clearTimeout(r.timer);
  }

  // Вихід з акаунта чи стирання: стан синхронізації більше нічого не означає.
  const stop = useCallback(() => {
    cancel();
    run.current.tombs = false;
    run.current.error = null;
    setState({ status: 'idle', at: 0, error: null });
  }, []);

  // Місцеві зміни — через паузу, щоб серія відповідей у картках дала один
  // запит. Без cleanup: зміна, яку принесла сама синхронізація, не має
  // скасовувати вже запланований запит. Стоїть перед стартовим ефектом:
  // той одразу синхронізує й прибирає цей таймер як зайвий.
  useEffect(() => {
    if (!enabled || !hasLocalChanges()) return;
    const r = run.current;
    clearTimeout(r.timer);
    r.timer = setTimeout(syncNow, DEBOUNCE_MS);
  }, [enabled, words, activity, stats, seen]);

  // Старт, вхід, зміна акаунта. Зміна акаунта скасовує запит старого.
  useEffect(() => {
    if (!enabled || !userId) return;
    let live = true;
    loadSyncState(userId).then((st) => {
      if (live && st.at) setState((s) => (s.at ? s : { ...s, at: st.at }));
    });
    // Надгробки, що чекають ще з минулого запуску (стирали без мережі, потім
    // iOS закрила застосунок), — теж несинхронізоване. Без цього вихід з
    // акаунта без мережі не перепитав би й стер би їх разом зі сховищем, а
    // стерті слова повернулися б з інших iPhone. Успішна синхронізація далі
    // сама скаже, скільки їх лишилось.
    const epoch = run.current.epoch;
    loadTombstones().then((list) => {
      if (live && run.current.epoch === epoch && list.length) run.current.tombs = true;
    });
    syncNow();
    return () => {
      live = false;
      cancel();
    };
  }, [enabled, userId]);

  useEffect(() => () => clearTimeout(run.current.timer), []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active' && Date.now() - run.current.attempt > FOREGROUND_GAP_MS) syncNow();
    });
    return () => sub.remove();
  }, []);

  return { ...state, syncNow, noteDeleted, pending, lastError, stop };
}
