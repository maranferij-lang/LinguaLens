// Профіль навчання (src/profile.js) — чиста логіка без екранів.
//
// Найважливіше тут — контракт із сервером: ті самі цілі, сфери, «звідки
// дізнались» і теми, ті самі ваги тем і ті самі межі рівнів. Розійдуться —
// і людина побачить одне («пропускаємо базові слова»), а отримає інше.
import fs from 'fs';
import path from 'path';
import {
  DEFAULT_LEVEL,
  FIELDS,
  GOALS,
  HEARD,
  MAX_KNOWN,
  TOPICS,
  addKnown,
  cefrFor,
  cleanProfile,
  levelBand,
  levelResult,
  levelUpOffer,
  needsField,
  primaryTopic,
  profileFromAnswers,
  profileReport,
  profileSummary,
  sameProfile,
  studyOnly,
  topicName,
  topicWeights,
} from '../src/profile';
import { makeT } from '../src/i18n';

const serverProfile = require('../server/profile');
const wordplan = require('../server/wordplan');
const lexicon = require('../server/lexicon');

const en = makeT('en');
const uk = makeT('uk');
const TODAY = '2026-10-04';

describe('the same vocabulary as the server', () => {
  test('goals, fields and “heard from” answers', () => {
    expect(GOALS).toEqual(serverProfile.GOALS);
    expect(FIELDS).toEqual(serverProfile.FIELDS);
    expect(HEARD).toEqual(serverProfile.HEARD_FROM);
  });

  test('every topic list on the server has a name in the app, and nothing more', () => {
    const files = fs
      .readdirSync(path.join(__dirname, '../server/topics'))
      .filter((f) => f.endsWith('.js'))
      .map((f) => f.slice(0, -3));
    expect([...TOPICS].sort()).toEqual([...lexicon.KEYS].sort());
    expect([...TOPICS].sort()).toEqual(files.sort());
  });

  test('topic weights match server/wordplan.js for every goal set and field', () => {
    // усі 31 непорожні набори цілей × 12 сфер і «без сфери»
    const sets = [];
    for (let mask = 1; mask < 1 << GOALS.length; mask++) sets.push(GOALS.filter((_, i) => mask & (1 << i)));
    for (const goals of sets) {
      for (const field of [...FIELDS, null]) {
        const p = cleanProfile({ goals, field, level: 5, since: TODAY }, TODAY);
        const server = Object.fromEntries(wordplan.weightsFor(serverProfile.forSchedule(p, TODAY)));
        expect([goals.join('+'), field, topicWeights(p)]).toEqual([goals.join('+'), field, server]);
      }
    }
    expect(topicWeights(null)).toEqual(Object.fromEntries(wordplan.weightsFor(null)));
  });

  test('the result line under the slider follows the server’s level bands', () => {
    // однаковий рядок ⇔ однаковий набір рівнів слів на сервері
    for (let a = 1; a <= 10; a++) {
      for (let b = 1; b <= 10; b++) {
        const sameLine = levelBand(a) === levelBand(b);
        const sameBands = wordplan.BANDS[a].join() === wordplan.BANDS[b].join();
        expect([a, b, sameLine]).toEqual([a, b, sameBands]);
      }
    }
  });

  test('a cleaned profile is accepted by the server as is', () => {
    const p = cleanProfile({ goals: ['study', 'work'], field: 'finance', level: 8.4, since: '2026-09-30' }, TODAY);
    expect(serverProfile.forSchedule(p, TODAY)).toEqual(p);
  });
});

describe('cleanProfile', () => {
  test('known answers only, goals in canonical order, level 1–10, field only for work or study', () => {
    expect(cleanProfile({ goals: ['self', 'hack', 'work'], field: 'finance', level: 42, since: TODAY }, TODAY)).toEqual({
      goals: ['work', 'self'],
      field: 'finance',
      level: 10,
      since: TODAY,
    });
    expect(cleanProfile({ goals: ['travel'], field: 'finance', level: 0 }, TODAY)).toEqual({
      goals: ['travel'],
      field: null,
      level: 1,
      since: TODAY,
    });
    expect(cleanProfile({ goals: ['work'], field: 'astrology', level: 'x' }, TODAY).field).toBeNull();
    expect(cleanProfile({ goals: ['work'], level: 'x' }, TODAY).level).toBe(DEFAULT_LEVEL);
  });

  test('no goals is no profile', () => {
    for (const p of [null, undefined, 'work', {}, { goals: [] }, { goals: ['nope'] }]) expect(cleanProfile(p, TODAY)).toBeNull();
  });

  test('since: a real past day, otherwise today', () => {
    const since = (s) => cleanProfile({ goals: ['self'], level: 3, since: s }, TODAY).since;
    expect(since('2026-09-01')).toBe('2026-09-01');
    expect(since('2026-10-05')).toBe(TODAY); // майбутнє
    expect(since('yesterday')).toBe(TODAY);
    expect(since(undefined)).toBe(TODAY);
  });

  test('sameProfile ignores since and goal order', () => {
    const a = { goals: ['self', 'work'], field: 'it', level: 6, since: '2026-01-01' };
    const b = { goals: ['work', 'self'], field: 'it', level: 6, since: TODAY };
    expect(sameProfile(a, b)).toBe(true);
    expect(sameProfile(a, { ...b, level: 7 })).toBe(false);
    expect(sameProfile(null, { goals: [] })).toBe(true);
    expect(sameProfile(null, a)).toBe(false);
  });
});

describe('profileFromAnswers', () => {
  test('everything skipped: nothing changes', () => {
    expect(profileFromAnswers({ goals: [], field: null, level: null }, null, TODAY)).toBeNull();
    const prev = { goals: ['travel'], field: null, level: 4, since: '2026-09-01' };
    expect(profileFromAnswers({ goals: [], field: null, level: null }, prev, TODAY)).toBe(prev);
  });

  test('goals skipped but a level chosen: general words of that level', () => {
    expect(profileFromAnswers({ goals: [], field: null, level: 7 }, null, TODAY)).toEqual({
      goals: ['self'],
      field: null,
      level: 7,
      since: TODAY,
    });
  });

  test('level skipped: the previous one, or the middle of the scale', () => {
    expect(profileFromAnswers({ goals: ['work'], field: 'law', level: null }, null, TODAY).level).toBe(DEFAULT_LEVEL);
    const prev = { goals: ['work'], field: 'law', level: 9, since: '2026-09-01' };
    expect(profileFromAnswers({ goals: ['work'], field: 'it', level: null }, prev, TODAY)).toEqual({
      goals: ['work'],
      field: 'it',
      level: 9,
      since: TODAY,
    });
  });

  test('the same answers keep the very same profile, so the topic queue is not reset', () => {
    const prev = { goals: ['work'], field: 'law', level: 9, since: '2026-09-01' };
    expect(profileFromAnswers({ goals: ['work'], field: 'law', level: 9 }, prev, TODAY)).toBe(prev);
  });

  test('a field left over from an un-ticked “work” is dropped', () => {
    expect(profileFromAnswers({ goals: ['travel'], field: 'law', level: 3 }, null, TODAY).field).toBeNull();
  });
});

describe('what the person is told', () => {
  test('field step: only for work or study, “What do you study?” for study alone', () => {
    expect(needsField(['travel', 'self'])).toBe(false);
    expect(needsField(['study'])).toBe(true);
    expect(studyOnly(['study'])).toBe(true);
    expect(studyOnly(['study', 'work'])).toBe(false);
  });

  test('the main topic is where most words come from', () => {
    const p = (goals, field = null) => ({ goals, field, level: 5 });
    expect(primaryTopic(p(['work'], 'finance'))).toBe('finance');
    expect(primaryTopic(p(['work'], 'other'))).toBe('workplace');
    expect(primaryTopic(p(['study'], 'it'))).toBe('academic'); // 3 дні з 5, а не ІТ (1 з 5)
    expect(primaryTopic(p(['travel', 'self']))).toBe('travel');
    expect(primaryTopic(p(['self']))).toBeNull();
    expect(primaryTopic(null)).toBeNull();
  });

  test('Settings row: what the person chose and the CEFR level', () => {
    expect(profileSummary({ goals: ['work'], field: 'finance', level: 8 }, uk)).toBe('Фінанси · B2+');
    expect(profileSummary({ goals: ['study'], field: 'it', level: 5 }, en)).toBe('IT · B1');
    expect(profileSummary({ goals: ['self'], level: 2 }, en)).toBe('Just for me · A1');
    expect(profileSummary(null, uk)).toBe(uk('pfNotSet'));
  });

  test('the line under the slider', () => {
    expect(levelResult(8, uk)).toBe('8/10 · B2+ — пропускаємо базові слова, починаємо зі складніших');
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(cefrFor)).toEqual(['A1', 'A1', 'A2', 'A2+', 'B1', 'B1+', 'B2', 'B2+', 'C1', 'C2']);
  });

  test('topic labels: none for general words or unknown keys', () => {
    expect(topicName(uk, 'finance')).toBe('Фінанси');
    expect(topicName(uk, 'general')).toBe('');
    expect(topicName(uk, 'astrology')).toBe('');
    expect(topicName(uk, undefined)).toBe('');
    expect(topicName(null, 'finance')).toBe('');
  });
});

describe('“I know it”', () => {
  test('newest last, no duplicates whatever the case, at most 500', () => {
    expect(addKnown(['ledger', 'Accrual'], 'accrual')).toEqual(['ledger', 'accrual']);
    expect(addKnown(['ledger', null, 7], '  ')).toEqual(['ledger']);
    const many = Array.from({ length: MAX_KNOWN }, (_, i) => 'w' + i);
    const next = addKnown(many, 'fresh');
    expect(next).toHaveLength(MAX_KNOWN);
    expect(next[0]).toBe('w1');
    expect(next.at(-1)).toBe('fresh');
  });

  test('a higher level is offered after three in a row, never past 10, never without a profile', () => {
    const p = { goals: ['work'], field: 'it', level: 6 };
    expect(levelUpOffer(p, 2)).toBeNull();
    expect(levelUpOffer(p, 3)).toBe(7);
    expect(levelUpOffer({ ...p, level: 10 }, 5)).toBeNull();
    expect(levelUpOffer(null, 5)).toBeNull();
  });
});

describe('POST /me/profile body', () => {
  test('only real answers, the shape the server stores', () => {
    const p = { goals: ['work'], field: null, level: 4, since: TODAY };
    expect(profileReport(p, 'tiktok')).toEqual({ goals: ['work'], field: null, level: 4, heardFrom: 'tiktok' });
    expect(profileReport(null, 'friend')).toEqual({ heardFrom: 'friend' });
    expect(profileReport(p, 'myspace')).toEqual({ goals: ['work'], field: null, level: 4 });
    expect(profileReport(null, null)).toEqual({});
    const stored = serverProfile.forStorage(profileReport(p, 'tiktok'), null);
    expect(stored).toEqual({ goals: ['work'], field: null, level: 4, heardFrom: 'tiktok' });
  });
});
