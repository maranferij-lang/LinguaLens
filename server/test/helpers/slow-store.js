// Firestore відповідає за мілісекунди, а не миттєво, як файл: між записом і
// відповіддю інші запити встигають прочитати документ. Затримки 0–5 мс до і
// після кожної операції — псевдовипадкові, але відтворювані (seed), щоб
// кожен раунд переплітав запити по-своєму.
const store = require('../../store');

async function withSlowStore(seed, fn) {
  const real = { get: store.get, update: store.update };
  let x = seed;
  const pause = () => {
    x = (x * 1103515245 + 12345) % 2147483648;
    return new Promise((r) => setTimeout(r, x % 6));
  };
  store.get = async (...a) => {
    await pause();
    return real.get(...a);
  };
  store.update = async (...a) => {
    await pause();
    const r = await real.update(...a);
    await pause();
    return r;
  };
  try {
    return await fn();
  } finally {
    Object.assign(store, real);
  }
}

module.exports = { withSlowStore };
