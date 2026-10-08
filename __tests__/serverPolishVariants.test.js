// Таблиця варіантів мов живе у двох місцях: server/ai.js (VARIETIES, текст для
// підказки моделі) і src/langVariants.js (VARIANTS, прапорець, голос, регіони).
// Спільного файлу бути не може: сервер розгортається з однієї теки server/ і
// файлу з src/ на Cloud Run не буде, а самі таблиці різної форми. Тож
// стережемо лише збіг: той самий набір мов, ті самі id варіантів, той самий
// варіант за замовчуванням. Додали варіант з одного боку, не додали з другого
// і сервер мовчки відкине його як невідомий (variantOr) або застосунок покаже
// те, чого сервер не вміє.
import { VARIANTS } from '../src/langVariants';

const ai = require('../server/ai');

describe('language variants: server and app agree', () => {
  test('same languages and same variant ids', () => {
    expect(Object.keys(ai.VARIETIES).sort()).toEqual(Object.keys(VARIANTS).sort());
    for (const lang of Object.keys(VARIANTS)) {
      const app = VARIANTS[lang].map((v) => v.id).sort();
      const server = Object.keys(ai.VARIETIES[lang]).sort();
      expect({ lang, ids: server }).toEqual({ lang, ids: app });
    }
  });

  test('the default variant is the first one in the app and DEFAULT_VARIETY on the server, and it exists on both sides', () => {
    for (const lang of Object.keys(VARIANTS)) {
      const first = VARIANTS[lang][0].id;
      expect({ lang, id: ai.DEFAULT_VARIETY[lang] }).toEqual({ lang, id: first });
      expect(Object.keys(ai.VARIETIES[lang])).toContain(ai.DEFAULT_VARIETY[lang]);
    }
    // і на сервері немає за замовчуванням мови, якої застосунок не знає
    expect(Object.keys(ai.DEFAULT_VARIETY).sort()).toEqual(Object.keys(VARIANTS).sort());
  });

  test('the server describes every variant to the model (name, words, ipa) and accepts exactly the app ids', () => {
    for (const lang of Object.keys(VARIANTS)) {
      for (const { id } of VARIANTS[lang]) {
        const v = ai.VARIETIES[lang][id];
        for (const field of ['name', 'words', 'ipa']) {
          expect({ lang, id, field, ok: typeof v[field] === 'string' && v[field].length > 0 }).toEqual({ lang, id, field, ok: true });
        }
        expect(ai.variantOr(lang, id)).toBe(id);
      }
      expect(ai.variantOr(lang, 'no-such-variant')).toBeNull();
    }
  });
});
