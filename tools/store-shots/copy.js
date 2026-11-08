// Підписи кадрів App Store, v3: чотири локалі × вісім кадрів (BRIEF §5).
// Звичайний ESM-модуль без залежностей: його читають і рендер
// (tools/store-shots/render.mjs), і jest (__tests__/storeShotsCopy.test.js).
//
// Розмітка:
//   [слова]  — ключові слова (напрям B фарбує їх акцентом, A — ні);
//   \n       — примусовий перенос рядка заголовка там, де «text-wrap:
//              balance» розбив би фразу невдало;
//   {LANGS}  — справжня кількість мов (LANGS у src/speech.js),
//   {ACH}    — справжня кількість досягнень (src/achievements.js); обидва
//              числа рендер бере з тієї ж версії, що й екрани.
//   pro      — плашка PRO біля заголовка (правило 2.3.2: функція Pro).
//
// Правила тексту (їх стереже тест):
//   • заголовок ≤ 28 символів, підрядок ≤ ~45;
//   • ЖОДНОГО тире (правило власника): ні «—», ні « – » чи « - » як тире,
//     ні навіть короткого в діапазоні: «від A1 до C2», «A1 to C2», «de A1
//     a C2» словами;
//   • без цін, «free», «безкоштовно», «gratis», «№1» і чужих брендів;
//   • заголовок кадру 1 називає мову, якої вчать (пошук бачить лише перші
//     три кадри): uk «англійськ…», en-US «Spanish», en-GB «English»,
//     es-MX «inglés»;
//   • типографіка: uk «» і ʼ, en ’ (en-US з оксфордською комою, en-GB без
//     неї), es «».

export const COPY = {
  uk: [
    { slug: 'scan', head: 'Фотографуй\nі [вчи англійську]', sub: 'Річ стає наліпкою з вимовою й прикладом' },
    { slug: 'dictionary', head: 'Твій\n[фотословник]', sub: 'Слова з твого життя, {LANGS} мов на вибір' },
    { slug: 'flashcards', head: 'Картки, що\n[не дають забути]', sub: 'Повторення повертає слово саме вчасно' },
    { slug: 'scene', head: 'Ціла кімната\n[за один кадр]', sub: 'Кожен предмет отримає англійську назву', pro: true },
    { slug: 'level', head: 'Англійська\n[під твій рівень]', sub: 'Від A1 до C2, без базових слів для B2+' },
    { slug: 'widget', head: 'Віджет [«Слово дня»]', sub: 'На Початковому й Замкненому екрані' },
    { slug: 'streak', head: 'Не переривай [серію]', sub: 'Рівні та {ACH} досягнень за твої успіхи' },
    { slug: 'share', head: 'Поділись [знахідками]', sub: 'Наліпки й картки для Stories і чатів' },
  ],
  'en-US': [
    { slug: 'scan', head: 'Snap it, [learn it\nin Spanish]', sub: 'With pronunciation and an example sentence' },
    { slug: 'dictionary', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in Spanish', pro: true },
    { slug: 'level', head: 'Spanish words for [your level]', sub: 'A1 to C2, no basics once you’re advanced' },
    { slug: 'widget', head: '[Word of the Day]\nwidget', sub: 'On your Home Screen and Lock Screen' },
    { slug: 'streak', head: 'Build a daily [word habit]', sub: 'Streaks, levels, and {ACH} achievements' },
    { slug: 'share', head: 'Share your [best finds]', sub: 'Stickers and cards for Stories and chats' },
  ],
  'en-GB': [
    { slug: 'scan', head: 'Snap it, [learn it\nin English]', sub: 'With pronunciation and an example sentence' },
    { slug: 'dictionary', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in English', pro: true },
    { slug: 'level', head: 'English words for [your level]', sub: 'A1 to C2, no basics once you’re advanced' },
    { slug: 'widget', head: '[Word of the Day]\nwidget', sub: 'On your Home Screen and Lock Screen' },
    { slug: 'streak', head: 'Build a daily [word habit]', sub: 'Streaks, levels and {ACH} achievements' },
    { slug: 'share', head: 'Share your [best finds]', sub: 'Stickers and cards for Stories and chats' },
  ],
  'es-MX': [
    { slug: 'scan', head: 'Tómale foto y [aprende inglés]', sub: 'Con pronunciación y un ejemplo de uso' },
    { slug: 'dictionary', head: 'Tu [diccionario de fotos]', sub: 'Palabras de tu vida, en {LANGS} idiomas' },
    { slug: 'flashcards', head: 'Tarjetas [para no olvidar]', sub: 'Repasa cada palabra justo antes de olvidarla' },
    { slug: 'scene', head: 'Etiqueta todo\n[con una foto]', sub: 'Cada objeto, con su nombre en inglés', pro: true },
    { slug: 'level', head: 'Inglés para\n[tu nivel]', sub: 'De A1 a C2, sin lo básico si ya avanzaste' },
    { slug: 'widget', head: 'Widget de la\n[palabra del día]', sub: 'En la pantalla de inicio y en la bloqueada' },
    { slug: 'streak', head: 'No rompas [tu racha]', sub: 'Niveles y {ACH} logros por tu constancia' },
    { slug: 'share', head: 'Comparte lo que\n[descubres]', sub: 'Stickers y tarjetas para Stories y chats' },
  ],
};

export const LOCALES = Object.keys(COPY);

// Заголовок без розмітки, як його бачить людина (перенос — пробіл).
export const plainHead = (cp) => cp.head.replace(/[[\]]/g, '').replace(/\n/g, ' ');

// Підстановка справжніх чисел. Українські «{ACH} досягнень» і «{LANGS} мов»
// узгоджуються лише з числами в родовому відмінку множини (…0, …5–…9,
// 11–14): інакше вийшло б «31 досягнень». ukGenitivePlural каже, чи число
// підходить (рендер і тест перевіряють справжні числа).
export const ukGenitivePlural = (n) => n % 10 === 0 || n % 10 >= 5 || (n % 100 >= 11 && n % 100 <= 14);
export function fill(text, { langs, ach }) {
  return text.replace(/\{LANGS\}/g, String(langs)).replace(/\{ACH\}/g, String(ach));
}

// Числа для {LANGS} і {ACH} — з тексту модулів тієї версії, яку знімаємо
// (рендер не може імпортувати src/speech.js: той тягне expo-speech).
// Тест звіряє їх із LANGS.length і ACHIEVEMENTS.length.
function countIn(src, table, item) {
  const start = src.indexOf(`export const ${table}`);
  if (start < 0) return 0;
  return (src.slice(start, src.indexOf('];', start)).match(item) || []).length;
}
export const countLangs = (speechSrc) => countIn(speechSrc, 'LANGS', /\{ code: '/g);
export const countAchievements = (achSrc) => countIn(achSrc, 'ACHIEVEMENTS', /\{ id: '/g);

// ─── Стиль «plain» (Guideline 2.3.3) ───────────────────────────────────────
// Кожен кадр показує ОДИН цілий справжній екран застосунку, нічого поверх
// нього. Тому заголовок має описувати саме той екран, що під ним (shot: ім'я
// знімка з capture.mjs). Ті самі правила тексту: без тире, заголовок ≤ 28
// символів, підрядок ≤ 46, PRO лише там, де екран належить Pro (сцена).
export const PLAIN = {
  uk: [
    { slug: 'scan', shot: 'camera', head: 'Фотографуй\nі [вчи англійську]', sub: 'Наведи камеру на предмет і натисни кнопку' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Твій\n[фотословник]', sub: 'Слова з твого життя, {LANGS} мов на вибір' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Картки, що\n[не дають забути]', sub: 'Повторення повертає слово саме вчасно' },
    { slug: 'scene', shot: 'scene', head: 'Ціла кімната\n[за один кадр]', sub: 'Кожен предмет отримає англійську назву', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'Нове слово\n[щодня]', sub: 'Слово дня з вимовою й прикладом' },
    { slug: 'quiz', shot: 'quiz', head: 'Перевір себе\nу [квізі]', sub: 'Десять питань за твоїми словами' },
    { slug: 'streak', shot: 'profile-dark', head: 'Не переривай\n[серію]', sub: 'Серія днів і твої слова в профілі' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Збирай\n[досягнення]', sub: 'Відкривай {ACH} досягнень, поки вчишся' },
  ],
  'en-US': [
    { slug: 'scan', shot: 'camera', head: 'Snap it, [learn it\nin Spanish]', sub: 'Point the camera at any object' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', shot: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in Spanish', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'A new word [every day]', sub: 'Word of the Day with pronunciation' },
    { slug: 'quiz', shot: 'quiz', head: 'Test yourself with a [quiz]', sub: 'Ten questions from your own words' },
    { slug: 'streak', shot: 'profile-dark', head: 'Keep your [streak] going', sub: 'Your daily streak and words in your profile' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Earn [achievements]', sub: 'Unlock {ACH} achievements as you learn' },
  ],
  'en-GB': [
    { slug: 'scan', shot: 'camera', head: 'Snap it, [learn it\nin English]', sub: 'Point the camera at any object' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', shot: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in English', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'A new word [every day]', sub: 'Word of the Day with pronunciation' },
    { slug: 'quiz', shot: 'quiz', head: 'Test yourself with a [quiz]', sub: 'Ten questions from your own words' },
    { slug: 'streak', shot: 'profile-dark', head: 'Keep your [streak] going', sub: 'Your daily streak and words in your profile' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Earn [achievements]', sub: 'Unlock {ACH} achievements as you learn' },
  ],
  'es-MX': [
    { slug: 'scan', shot: 'camera', head: 'Tómale foto y [aprende inglés]', sub: 'Apunta la cámara a cualquier objeto' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Tu [diccionario de fotos]', sub: 'Palabras de tu vida, en {LANGS} idiomas' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Tarjetas [para no olvidar]', sub: 'Repasa cada palabra justo antes de olvidarla' },
    { slug: 'scene', shot: 'scene', head: 'Etiqueta todo\n[con una foto]', sub: 'Cada objeto, con su nombre en inglés', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'Una palabra\n[nueva al día]', sub: 'Palabra del día con pronunciación' },
    { slug: 'quiz', shot: 'quiz', head: 'Ponte a prueba\ncon un [quiz]', sub: 'Diez preguntas con tus propias palabras' },
    { slug: 'streak', shot: 'profile-dark', head: 'No rompas [tu racha]', sub: 'Tu racha diaria y tus palabras en el perfil' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Gana [logros]', sub: 'Desbloquea {ACH} logros mientras aprendes' },
  ],
};

// ─── Стиль «showcase» (Guideline 2.3.3, але привабливіше) ──────────────────
// Телефон у корпусі на панорамному тлі, над ним лише заголовок: без
// підрядків, одне виділене слово в [дужках], не більше двох рядків (\n).
// Кадр 1 показує РЕЗУЛЬТАТ скану (знімок scan-result), решта як у PLAIN.
// Без тире й дефісів; PRO лише на кадрі сцени, і лише в шапці.
export const SHOWCASE = {
  uk: [
    { slug: 'scan', shot: 'scan-result', head: 'Фото й [слово]\nанглійською' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Твій\n[фотословник]' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Картки, що\nне дають [забути]' },
    { slug: 'scene', shot: 'scene', head: 'Ціла кімната\nза [один] кадр', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'Нове слово\n[щодня]' },
    { slug: 'quiz', shot: 'quiz', head: 'Перевір себе\nу [квізі]' },
    { slug: 'streak', shot: 'profile-dark', head: 'Не переривай\n[серію]' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Збирай\n[досягнення]' },
  ],
  'en-US': [
    { slug: 'scan', shot: 'scan-result', head: 'Snap it, learn\nit in [Spanish]' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Your picture\n[dictionary]' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Flashcards\nthat [stick]' },
    { slug: 'scene', shot: 'scene', head: 'Label your\n[whole] room', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'A new word\n[every] day' },
    { slug: 'quiz', shot: 'quiz', head: 'Test yourself\nwith a [quiz]' },
    { slug: 'streak', shot: 'profile-dark', head: 'Keep your\n[streak] going' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Earn\n[achievements]' },
  ],
  'en-GB': [
    { slug: 'scan', shot: 'scan-result', head: 'Snap it, learn\nit in [English]' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Your picture\n[dictionary]' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Flashcards\nthat [stick]' },
    { slug: 'scene', shot: 'scene', head: 'Label your\n[whole] room', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'A new word\n[every] day' },
    { slug: 'quiz', shot: 'quiz', head: 'Test yourself\nwith a [quiz]' },
    { slug: 'streak', shot: 'profile-dark', head: 'Keep your\n[streak] going' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Earn\n[achievements]' },
  ],
  'es-MX': [
    { slug: 'scan', shot: 'scan-result', head: 'Tómale foto y\n[aprende] inglés' },
    { slug: 'dictionary', shot: 'dict-grid', head: 'Tu diccionario\nde [fotos]' },
    { slug: 'flashcards', shot: 'cards-front', head: 'Tarjetas para\nno [olvidar]' },
    { slug: 'scene', shot: 'scene', head: 'Etiqueta todo\ncon una [foto]', pro: true },
    { slug: 'wod', shot: 'learn-wod', head: 'Una palabra\n[nueva] al día' },
    { slug: 'quiz', shot: 'quiz', head: 'Ponte a prueba\ncon un [quiz]' },
    { slug: 'streak', shot: 'profile-dark', head: 'No rompas\ntu [racha]' },
    { slug: 'achievements', shot: 'profile-ach', head: 'Gana\n[logros]' },
  ],
};
