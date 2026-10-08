// Підвантажується в окремий процес сервера (node -r): Gemini відповідає не
// відразу, а через SLOW_AI_MS. Так тест на SIGTERM має скан, що виконується.
const realFetch = global.fetch;
const ms = Number(process.env.SLOW_AI_MS || 1500);

global.fetch = async (url, opts) => {
  if (!/generativelanguage\.googleapis\.com/.test(String(url))) return realFetch(url, opts);
  await new Promise((r) => setTimeout(r, ms));
  const answer = {
    word: 'mug',
    ipa: '/mʌɡ/',
    translation: 'кружка',
    example: 'I drink tea.',
    example_translation: 'Я п’ю чай.',
    box: [290, 350, 710, 740],
  };
  return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }] }), { status: 200 });
};
