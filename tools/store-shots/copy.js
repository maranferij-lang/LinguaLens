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
//   • ЖОДНИХ довгих тире (правило власника): ні «—», ні « – » чи « - » як
//     тире. Короткий тире без пробілів у діапазоні «A1–C2» можна;
//   • без цін, «free», «безкоштовно», «gratis», «№1» і чужих брендів;
//   • заголовок кадру 1 називає мову, якої вчать (пошук бачить лише перші
//     три кадри): uk «англійськ…», en-US «Spanish», en-GB «English»,
//     es-MX «inglés»;
//   • типографіка: uk «» і ʼ, en ’ (en-US з оксфордською комою, en-GB без
//     неї), es «».

export const COPY = {
  uk: [
    { slug: 'scan', head: 'Фотографуй\nі [вчи англійську]', sub: 'Річ стає наліпкою з вимовою й прикладом' },
    { slug: 'dictionary', head: 'Твій [фотословник]', sub: 'Слова з твого життя й {LANGS} мов на вибір' },
    { slug: 'flashcards', head: 'Картки, що\n[не дають забути]', sub: 'Повторення повертає слово саме вчасно' },
    { slug: 'scene', head: 'Ціла кімната\n[за один кадр]', sub: 'Кожен предмет отримає англійську назву', pro: true },
    { slug: 'level', head: 'Слова [твого рівня], A1–C2', sub: 'Жодних базових слів, якщо ти вже B2+' },
    { slug: 'widget', head: 'Віджет [«Слово дня»]', sub: 'На головному екрані й екрані блокування' },
    { slug: 'streak', head: 'Не переривай [серію]', sub: 'Рівні й {ACH} досягнень за кожен крок' },
    { slug: 'share', head: 'Поділись [знахідками]', sub: 'Наліпки й картки для Stories і чатів' },
  ],
  'en-US': [
    { slug: 'scan', head: 'Snap it, [learn it in Spanish]', sub: 'With pronunciation and an example sentence' },
    { slug: 'dictionary', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in Spanish', pro: true },
    { slug: 'level', head: 'Words for [your level], A1–C2', sub: 'No beginner words once you’re advanced' },
    { slug: 'widget', head: '[Word of the day] widget', sub: 'On your Home Screen and Lock Screen' },
    { slug: 'streak', head: 'Build a daily [word habit]', sub: 'Streaks, levels, and {ACH} achievements' },
    { slug: 'share', head: 'Share your [best finds]', sub: 'Stickers and cards for Stories and chats' },
  ],
  'en-GB': [
    { slug: 'scan', head: 'Snap it, [learn it in English]', sub: 'With pronunciation and an example sentence' },
    { slug: 'dictionary', head: 'Your [picture dictionary]', sub: 'Words from your own life, in {LANGS} languages' },
    { slug: 'flashcards', head: 'Flashcards [that stick]', sub: 'Spaced repetition brings words back on time' },
    { slug: 'scene', head: 'Label your [whole room]', sub: 'One shot, every object named in English', pro: true },
    { slug: 'level', head: 'Vocabulary for [your level]', sub: 'A1 to C2, no basics once you’re advanced' },
    { slug: 'widget', head: '[Word of the day] widget', sub: 'On your Home Screen and Lock Screen' },
    { slug: 'streak', head: 'Build a daily [word habit]', sub: 'Streaks, levels and {ACH} achievements' },
    { slug: 'share', head: 'Share your [best finds]', sub: 'Stickers and cards for Stories and chats' },
  ],
  'es-MX': [
    { slug: 'scan', head: 'Apunta y [aprende inglés]', sub: 'Con pronunciación y un ejemplo de uso' },
    { slug: 'dictionary', head: 'Tu [diccionario de fotos]', sub: 'Palabras de tu vida, en {LANGS} idiomas' },
    { slug: 'flashcards', head: 'Tarjetas [para no olvidar]', sub: 'El repaso te trae cada palabra a tiempo' },
    { slug: 'scene', head: 'Tu cuarto entero\n[en una foto]', sub: 'Cada objeto, con su nombre en inglés', pro: true },
    { slug: 'level', head: 'Palabras de [tu nivel], A1–C2', sub: 'Nada de palabras básicas si ya eres avanzado' },
    { slug: 'widget', head: 'Widget de la\n[palabra del día]', sub: 'En tu pantalla de inicio y de bloqueo' },
    { slug: 'streak', head: 'No rompas [tu racha]', sub: 'Rachas, niveles y {ACH} logros' },
    { slug: 'share', head: 'Comparte tus [hallazgos]', sub: 'Stickers y tarjetas para Stories y chats' },
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
