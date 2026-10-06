// Знімає СПРАВЖНІ екрани застосунку з веб-збірки (react-native-web) у
// логічному розмірі iPhone 17 Pro Max 440×956 @3x = 1320×2868, із засіяними
// демо-даними й підробленим API. Нічого на цих PNG не перемальовано: це сам
// застосунок.
//   ui/<locale>/<shot>.png         цілі екрани (+ <shot>.json: прямокутники
//                                  елементів, за якими кадр обрізає UI)
//   ui/<locale>/card-<kind>.png    картки 9:16, як їх зберігає «Зберегти»
//   ui/<locale>/sticker-<kind>.png наліпки без тла (прозорі PNG)
//   ui/<locale>/widget*.png        живий перегляд віджетів (WidgetPreview)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { LOCALES, STORE_LOCALES, WIDGET_WOD, WOD, olderWords, vocab } from './data.mjs';
import { COLLECTION } from './art/objects.mjs';
import { ART, LIB, UI, WEB, WORK, fileUrl, isMain, launch } from './paths.mjs';

const VP = { width: 440, height: 956 };
const DAY = 86400000;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.json': 'application/json', '.ico': 'image/x-icon' };
// Статичний сервер веб-збірки й арту. Порт — перший вільний з PORTS
// (типово 9100–9119; PORT=… задає свій).
const PORTS = process.env.PORT ? [Number(process.env.PORT)] : Array.from({ length: 20 }, (_, i) => 9100 + i);
async function serve() {
  const handler = (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    let f;
    if (p.startsWith('/art/')) f = path.join(ART, p.slice(5));
    else {
      if (p === '/' || !path.extname(p)) p = '/index.html';
      f = path.join(WEB, p);
    }
    if (!f.startsWith(ART) && !f.startsWith(WEB)) { res.writeHead(403); return res.end(); }
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'access-control-allow-origin': '*' });
    fs.createReadStream(f).pipe(res);
  };
  for (const port of PORTS) {
    const server = http.createServer(handler);
    const ok = await new Promise((resolve) => {
      server.once('error', () => resolve(false));
      server.listen(port, '127.0.0.1', () => resolve(true));
    });
    if (ok) return { port, server };
  }
  throw new Error('немає вільного порту серед ' + PORTS.join(', '));
}

const localKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');

// ─── засіяний стан ─────────────────────────────────────────────────────────
// Фіксовані uk-підписи («слів усього», «повторень») узгоджуються лише з
// числами в родовому множини: …0, …5–…9, 11–14.
const genPl = (n) => n % 10 === 0 || n % 10 >= 5 || (n % 100 >= 11 && n % 100 <= 14);
const ACH_IDS = () => {
  const f = path.join(LIB, 'achievements.mjs');
  return fs.existsSync(f) ? [...fs.readFileSync(f, 'utf8').matchAll(/\{ id: '([a-z_0-9]+)'/g)].map((m) => m[1]) : [];
};

// first   — це слово відкриває колоду карток (колода тримає порядок
//           сховища, коли Math.random пришпилено, див. session())
// exclude — слова, яких немає (знімок сцени: усі її предмети нові, тож
//           кнопка «Зберегти всі (9)» каже те саме, що «9 слів у кадрі»)
// older   — ще 14 старіших слів без фото: разом 30 слів, і саме 30 кажуть
//           і словник («Збережено: 30»), і профіль («30 слів усього»).
//           Старіші — найдавніші, тож у колекції вони нижче за край кадру.
export function seedFor(loc, { theme = 'light', withScene = false, words: wordKeys = COLLECTION, origin, shapes, mugSaved = true, first = null, exclude = [], older = true, avatar = 'wave' }) {
  const L = LOCALES[loc];
  const now = Date.now();
  let keys = wordKeys.filter((k) => (mugSaved || k !== 'mug') && !exclude.includes(k));
  if (first && keys.includes(first)) keys = [first, ...keys.filter((k) => k !== first)];
  const words = keys
    .map((k, i) => {
      const v = vocab(loc, k);
      // стан інтервального повторення: нові, ті, що вчаться, і вивчені
      const box = [1, 2, 0, 3, 1, 4, 2, 1, 3, 5, 2, 4, 1, 3, 2, 5][i % 16];
      return {
        id: 'w-' + k,
        ...v,
        lang: L.learn,
        nativeLang: L.native,
        photo: `${origin}/art/obj-${k}.jpg`,
        shape: shapes.objects[k].shape,
        addedAt: now - (i * 0.62 + 0.15) * DAY,
        srs: { box, due: now - 3600000 * (k === first ? 90 : 1 + i), reps: box * 2 + 1, correct: box * 2 },
      };
    });
  if (older) {
    olderWords(loc).forEach((v, i) => {
      words.push({
        id: 'w-old-' + i,
        word: v.word,
        translation: v.translation,
        lang: L.learn,
        nativeLang: L.native,
        addedAt: now - (14 + i * 1.3) * DAY,
        srs: { box: 3 + (i % 3), due: now + (2 + i) * DAY, reps: 6 + (i % 4), correct: 5 + (i % 4) },
      });
    });
  }
  // the profile's «N повторень» must agree with the fixed uk label
  let reps = words.reduce((a, w) => a + w.srs.reps, 0);
  while (!genPl(reps) && words.length) { words[0].srs.reps++; reps++; }
  const activity = {};
  for (let i = 0; i < 12; i++) activity[localKey(new Date(now - i * DAY))] = [6, 4, 9, 3, 7, 5, 8, 4, 6, 3, 5, 4][i];
  const wodDays = Array.from({ length: 14 }, (_, i) => ({ date: localKey(new Date(now + (i - 1) * DAY)), ...WOD[loc] }));
  const settings = {
    targetLang: L.learn,
    nativeLang: L.native,
    theme,
    wodEnabled: true,
    wodHour: 10,
    aiConsent: true,
    scanMode: 'object',
    profileName: L.name,
    avatar,
    widgetTipShown: true,
    profileTipOff: true,
    analytics: false,
    profile: { goals: ['work'], field: 'it', level: 8, since: localKey(new Date(now - 20 * DAY)) },
  };
  const seed = {
    ll_onboarded_v1: '1',
    ll_settings_v1: JSON.stringify(settings),
    ll_words_v1: JSON.stringify(words),
    ll_activity_v1: JSON.stringify(activity),
    ll_stats_v1: JSON.stringify({ quizzes: 14, perfectQuiz: 3, wordOfDaySeen: 9, scenes: 2, morningScan: 1 }),
    // усі досягнення «вже показані», тож тост «Відкрито!» не закриє екран
    ll_seen_ach_v1: JSON.stringify(ACH_IDS()),
    ll_wod_v1: JSON.stringify({ lang: L.learn, native: L.native, sig: null, words: wodDays, fetchedAt: now }),
    ll_sync_nudge_v1: '1',
    ll_review_asked_v1: String(now),
    ll_usage_v1: JSON.stringify({ scans: 18, limit: null, scenes: 2, sceneLimit: null }),
  };
  if (withScene) {
    const k = shapes.kitchen;
    const keys = Object.keys(k.objects);
    seed.ll_scenes_v1 = JSON.stringify([
      {
        id: 'kitchen',
        image: `${origin}/art/kitchen.jpg`,
        width: k.width,
        height: k.height,
        lang: L.learn,
        nativeLang: L.native,
        createdAt: now - 2 * 3600000,
        objects: keys.map((key) => {
          const v = vocab(loc, key);
          return { key, word: v.word, translation: v.translation, ipa: v.ipa, box: k.objects[key].box, outline: k.objects[key].outline };
        }),
        hidden: [],
      },
    ]);
  }
  return seed;
}

// ─── одна сесія браузера ───────────────────────────────────────────────────
async function session(browser, { loc, theme = 'light', seed, port, outDir, steps, camera = null }) {
  const L = LOCALES[loc];
  const origin = `http://127.0.0.1:${port}`;
  const ctx = await browser.newContext({
    viewport: VP,
    deviceScaleFactor: 3,
    colorScheme: theme === 'dark' ? 'dark' : 'light',
    locale: L.browser,
    permissions: ['camera'],
    reducedMotion: 'reduce',
  });
  await ctx.addInitScript(() => {
    const r = Math.random;
    Math.random = () => (window.__fixRand ? 0.99999 : r());
  });
  await ctx.addInitScript((s) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.clear();
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
      sessionStorage.setItem('seeded', '1');
    }
  }, seed);
  if (camera) {
    // Веб-камера отримує потік canvas із «фото» замість тестової картинки
    // Chromium: справжній код сканера бачить саме його.
    await ctx.addInitScript((src) => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (c) => {
        if (!c || !c.video) return real(c);
        const img = new Image();
        img.src = src;
        await img.decode();
        const cv = document.createElement('canvas');
        cv.width = img.naturalWidth;
        cv.height = img.naturalHeight;
        const g = cv.getContext('2d');
        const draw = () => { g.drawImage(img, 0, 0); requestAnimationFrame(draw); };
        draw();
        const stream = cv.captureStream(30);
        // expo-camera віддзеркалює доріжку без facingMode (типово 'user'),
        // а задня камера iPhone не дзеркальна — оголошуємо 'environment'.
        const tr = stream.getVideoTracks()[0];
        const gs = tr.getSettings.bind(tr);
        tr.getSettings = () => ({ ...gs(), facingMode: 'environment' });
        return stream;
      };
    }, `${origin}/art/${camera.image}`);
  }
  const wodWords = JSON.parse(seed.ll_wod_v1).words;
  await ctx.route(/\/(health|scan|scene|me|me\/profile|word-of-day|auth\/[^?]*|sync|events?|track)(\?.*)?$/, async (route) => {
    const u = route.request().url();
    if (u.includes('/health')) return route.fulfill({ json: { ok: true, provider: 'gemini' } });
    if (u.includes('/word-of-day')) return route.fulfill({ json: { words: wodWords } });
    if (u.includes('/auth/')) return route.fulfill({ json: { token: 't', user: { id: 'u1', seed: 's' } } });
    if (u.includes('/me/profile')) return route.fulfill({ json: { ok: true } });
    if (u.includes('/me')) return route.fulfill({ json: { user: { id: 'u1' }, pro: false, usage: { scans: 18, limit: null, scenes: 2, sceneLimit: null } } });
    if (u.includes('/sync')) return route.abort('internetdisconnected');
    if (/\/(events?|track)/.test(u)) return route.fulfill({ json: { ok: true } });
    return route.fulfill({ status: 500, json: { error: 'unmocked' } });
  });
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error') logs.push('console: ' + m.text().slice(0, 240)); });
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 240)));
  await page.goto(`${origin}/?ins=max`);
  await page.waitForTimeout(2600);

  const api = {
    page,
    async click(labels, { exact = true, last = true } = {}) {
      for (const label of [].concat(labels)) {
        const loc2 = page.getByText(label, { exact });
        if (await loc2.count()) { await (last ? loc2.last() : loc2.first()).click({ force: true }); return true; }
      }
      logs.push('no text: ' + [].concat(labels).join(' | '));
      return false;
    },
    async tap(testID) {
      const l = page.getByTestId(testID);
      if (await l.count()) { await l.first().click({ force: true }); return true; }
      logs.push('no testID: ' + testID);
      return false;
    },
    wait: (ms) => page.waitForTimeout(ms),
    async shot(name, settle = 350) {
      await page.waitForTimeout(settle);
      const f = path.join(outDir, name + '.png');
      await page.screenshot({ path: f });
      return f;
    },
    text: () => page.evaluate(() => document.body.innerText),
    // Прямокутники елементів (CSS px екрана 440×956) лягають у <знімок>.json
    // поруч із PNG, тож кадр обрізає UI за самим UI, а не за магічними числами.
    // measureStickers — наліпки (їхній <svg>) з фото obj-<key>.jpg і колір
    // тла під ними (щоб намалювати порожнє місце, яке лишає наліпка);
    // measure — елементи за текстом: mode 'text' — сам текст, mode 'card' —
    // найближчий заокруглений залитий предок (картка, кнопка).
    async measureStickers(name, keys) {
      const rects = await page.evaluate((keys) => {
        const out = {};
        const imgs = [...document.querySelectorAll('image')];
        for (const k of keys) {
          const im = imgs.find((el) => (el.getAttribute('href') || el.getAttribute('xlink:href') || '').includes('obj-' + k + '.'));
          const svg = im && im.closest('svg');
          if (!svg) { out['sticker_' + k] = null; continue; }
          const r = svg.getBoundingClientRect();
          let p = svg.parentElement, bg = null;
          while (p && !bg) { const c = getComputedStyle(p).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') bg = c; p = p.parentElement; }
          out['sticker_' + k] = { x: r.x, y: r.y, w: r.width, h: r.height, bg: bg || 'rgb(250, 248, 244)' };
        }
        return out;
      }, keys);
      return this.save(name, rects);
    },
    async measureTestId(name, spec) {
      const rects = await page.evaluate((spec) => {
        const out = {};
        for (const [k, id] of Object.entries(spec)) {
          const el = document.querySelector('[data-testid="' + id + '"]');
          if (!el) { out[k] = null; continue; }
          const r = el.getBoundingClientRect();
          out[k] = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        return out;
      }, spec);
      return this.save(name, rects);
    },
    async measureVideo(name) {
      const v = await page.evaluate(() => {
        const el = document.querySelector('video');
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return { x: r.x, y: r.y, w: r.width, h: r.height, vw: el.videoWidth, vh: el.videoHeight, fit: cs.objectFit, transform: cs.transform };
      });
      return this.save(name, { video: v });
    },
    async measureTabBar(name, label) {
      const r = await page.evaluate((label) => {
        // найнижчий листок із цим текстом — підпис вкладки (заголовок екрана
        // може мати те саме слово)
        const hits = [...document.querySelectorAll('div,span')].filter((e) => e.innerText && e.innerText.trim() === label && !e.querySelector('div,span'));
        const el = hits.sort((a, b) => b.getBoundingClientRect().y - a.getBoundingClientRect().y)[0];
        if (!el) return null;
        // кнопка вкладки (іконка й підпис); сама панель трохи вище
        const p = el.closest('[role="button"],[role="tab"],[role="link"],a') || el;
        const r = p.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, label);
      return this.save(name, { tabbar: r });
    },
    save(name, rects) {
      const f = path.join(outDir, name + '.json');
      const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
      fs.writeFileSync(f, JSON.stringify({ ...prev, ...rects }, null, 1));
      for (const [k, v] of Object.entries(rects)) if (!v) logs.push(`measure ${name}.${k}: not found`);
      return rects;
    },
    async measure(name, spec) {
      const rects = await page.evaluate((spec) => {
        const out = {};
        const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight; };
        for (const [key, { text, mode = 'text', nth = -1 }] of Object.entries(spec)) {
          const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim();
          const all = [...document.querySelectorAll('div,span,h1,h2,h3,h4,h5,h6,p')];
          let hits = all.filter((el) => el.innerText && norm(el.innerText) === norm(text) && visible(el));
          // лише найглибші збіги (без нащадка з тим самим текстом)
          hits = hits.filter((el) => !hits.some((o) => o !== el && el.contains(o)));
          const el = hits.length ? hits[nth < 0 ? hits.length + nth : nth] : null;
          if (!el) { out[key] = null; continue; }
          let target = el;
          if (mode === 'card') {
            let p = el.parentElement;
            while (p && p !== document.body) {
              const cs = getComputedStyle(p);
              const bg = cs.backgroundColor;
              const filled = bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
              if (filled && parseFloat(cs.borderTopLeftRadius) >= 12 && p.getBoundingClientRect().width < innerWidth) { target = p; break; }
              p = p.parentElement;
            }
          }
          const r = target.getBoundingClientRect();
          out[key] = { x: r.x, y: r.y, w: r.width, h: r.height };
        }
        return out;
      }, spec);
      const f = path.join(outDir, name + '.json');
      const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
      fs.writeFileSync(f, JSON.stringify({ ...prev, ...rects }, null, 1));
      for (const [k, v] of Object.entries(rects)) if (!v) logs.push(`measure ${name}.${k}: not found`);
      return rects;
    },
  };
  try {
    await steps(api);
  } catch (e) {
    logs.push('steps failed: ' + e.message.slice(0, 300));
  }
  await ctx.close();
  return logs;
}

// Один елемент застосунку (shot-gallery.js) при @3x: картка 9:16, як її
// зберігає «Зберегти зображення», наліпка без тла (прозорий PNG — так її
// і віддає застосунок) чи живий перегляд віджетів. reveal — testID кнопок
// «Показати переклад», які треба натиснути перед знімком; parts — testID
// елементів, які знімаємо ще й окремо (<out>-<testID>.png).
async function elementShot(browser, { port, shot, out, transparent = false, reveal = [], parts = [] }) {
  const ctx = await browser.newContext({ viewport: { width: 460, height: 760 }, deviceScaleFactor: 3, reducedMotion: 'reduce' });
  await ctx.addInitScript((s) => { window.__SHOT__ = s; }, shot);
  const page = await ctx.newPage();
  const logs = [];
  page.on('pageerror', (e) => logs.push('pageerror: ' + e.message.slice(0, 240)));
  await page.goto(`http://127.0.0.1:${port}/?shot=1`);
  await page.waitForTimeout(2200);
  for (const id of reveal) {
    const l = page.getByTestId(id);
    if (await l.count()) await l.first().click({ force: true });
    else logs.push('no testID: ' + id);
  }
  if (reveal.length) await page.waitForTimeout(700);
  const card = page.locator('#card');
  if (!(await card.count())) logs.push('nothing rendered: ' + out);
  else await card.screenshot({ path: out, omitBackground: transparent });
  for (const id of parts) {
    const l = page.getByTestId(id);
    if (await l.count()) await l.first().screenshot({ path: out.replace(/\.png$/, `-${id}.png`) });
    else logs.push('no testID: ' + id);
  }
  await ctx.close();
  return logs;
}

export async function captureAll({ locales = STORE_LOCALES, only = null } = {}) {
  const shapes = JSON.parse(fs.readFileSync(path.join(ART, 'shapes.json'), 'utf8'));
  const { port, server } = await serve();
  const origin = `http://127.0.0.1:${port}`;
  const browser = await launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const report = {};
  const want = (n) => !only || only.some((o) => n.startsWith(o));
  for (const loc of locales) {
    const L = LOCALES[loc];
    const outDir = path.join(UI, loc);
    fs.mkdirSync(outDir, { recursive: true });
    const logs = (report[loc] = []);
    const run = async (name, opts, steps) => {
      if (!want(name)) return;
      const seed = seedFor(loc, { origin, shapes, theme: opts.theme || 'light', ...opts.seed });
      const l = await session(browser, { loc, port, outDir, seed, steps, theme: opts.theme, camera: opts.camera });
      logs.push(...l.map((x) => name + ': ' + x));
      console.log(`  ${loc} ${name}${l.length ? ' (' + l.length + ' log lines)' : ''}`);
    };
    const t = (await import(fileUrl(path.join(LIB, 'i18n.mjs')))).makeT(L.ui);
    const langName = { en: 'English', es: 'Español' }[L.learn];

    // 1 — сканер: справжня камера з намальованим «фото» чашки (кадр 1 обрізає
    // його від рамки прицілу до перемикача «Предмет / Сцена»)
    await run('camera', { seed: { mugSaved: false }, camera: { image: 'hero.jpg' } }, async (a) => {
      await a.click(t('tabScan'));
      await a.wait(1800);
      await a.shot('camera');
      await a.measureVideo('camera');
      await a.measure('camera', { hint: { text: t('hint') }, mode: { text: t('modeObject'), mode: 'card' } });
      await a.measureTestId('camera', { shutter: 'shutter', corners: 'viewfinder-corners' });
    });

    // 2 — словник, колекція наліпок
    await run('dict', {}, async (a) => {
      await a.click(t('tabDict'));
      await a.wait(900);
      await a.click(t('viewCollection'));
      await a.wait(1600);
      await a.shot('dict-grid');
      await a.measure('dict-grid', Object.fromEntries(COLLECTION.slice(0, 12).map((k) => [k, { text: vocab(loc, k).word }])));
      await a.measureStickers('dict-grid', COLLECTION.slice(0, 12));
      await a.measureTabBar('dict-grid', t('tabProfile'));
    });

    // 3 і 5 — «Навчання»: відкрита картка слова дня (кадр 5) і картки (кадр 3:
    // колоду відкриває рослина — другий відтінок поруч із червоною чашкою
    // кадру 1)
    const CARD = 'plant';
    const cv = vocab(loc, CARD);
    await run('learn', { seed: { first: CARD } }, async (a) => {
      await a.click(t('tabLearn'));
      await a.wait(1400);
      await a.click(WOD[loc].word);
      await a.wait(900);
      await a.shot('learn-wod');
      await a.measure('learn-wod', { wod: { text: WOD[loc].word, mode: 'card' } });
      await a.click(WOD[loc].word);
      await a.wait(700);
      await a.page.evaluate(() => { window.__fixRand = true; });
      await a.click(t('flashcards'));
      await a.wait(1200);
      await a.page.evaluate(() => { window.__fixRand = false; });
      await a.shot('cards-front');
      await a.measure('cards-front', { card: { text: t('tapFlip'), mode: 'card' }, word: { text: cv.word }, ipa: { text: cv.ipa } });
      await a.click(t('showAnswer'));
      await a.wait(1200);
      await a.shot('cards-back');
      await a.measure('cards-back', { translation: { text: cv.translation }, card: { text: cv.translation, mode: 'card' }, know: { text: t('know'), mode: 'card' }, still: { text: t('stillLearning'), mode: 'card' } });
      await a.measureStickers('cards-back', [CARD]);
    });

    // 4 — сцена кухні з історії (усі її предмети нові: «Зберегти всі (9)»)
    await run('scene', { seed: { withScene: true, exclude: Object.keys(shapes.kitchen.objects) } }, async (a) => {
      await a.click(t('tabDict'));
      await a.wait(1000);
      await a.page.locator('[aria-label^="' + t('sceneThumb') + '"]').first().click({ force: true }).catch(() => {});
      await a.wait(2400);
      await a.shot('scene');
    });

    // 5 — рівень у редакторі профілю: той самий крок, що в онбордингу 4.0
    // (повзунок, CEFR і назва рівня, наприклад «Впевнений», під ним)
    await run('level', {}, async (a) => {
      await a.click(t('tabSettings'));
      await a.wait(1000);
      await a.click(t('pfRowTitle'));
      await a.wait(900);
      await a.click(t('obNext'));
      await a.wait(900);
      await a.click(t('obNext'));
      await a.wait(1100);
      await a.shot('pf-level');
      await a.measure('pf-level', {
        title: { text: t('pfLevelTitle') },
        chip: { text: langName },
        value: { text: '8' },
        a1: { text: 'A1' },
        c2: { text: 'C2' },
      });
      await a.measureTestId('pf-level', { name: 'level-name' });
    });

    // 7 — профіль у темній темі: аватар — Лінго, що святкує; 30 слів, як і
    // в словнику кадру 2
    await run('profile-dark', { theme: 'dark', seed: { avatar: 'celebrate' } }, async (a) => {
      await a.click(t('tabProfile'));
      await a.wait(1400);
      await a.shot('profile-dark');
      await a.measure('profile-dark', {
        streak: { text: t('streakN', { n: 12 }), mode: 'card' },
        name: { text: L.name },
        share: { text: t('shareWeek'), mode: 'card' },
        stats: { text: t('wordsTotal'), mode: 'card' },
      });
      await a.measureTabBar('profile-dark', t('tabProfile'));
    });

    // 6 і 8 — елементи застосунку поодинці (shot-gallery.js)
    if (want('parts')) {
      const now = Date.now();
      const base = seedFor(loc, { origin, shapes, withScene: true });
      const words = JSON.parse(base.ll_words_v1);
      const act = JSON.parse(base.ll_activity_v1);
      const days = [];
      for (let i = 6; i >= 0; i--) { const d = new Date(now - i * DAY); days.push({ key: localKey(d), dow: d.getDay(), value: act[localKey(d)] || 0 }); }
      const recent = words.filter((w) => w.addedAt >= now - 7 * DAY);
      const week = { words: words.length, weekWords: recent.length, streak: 12, reviews: 38, days, stickers: recent.filter((w) => w.photo).slice(-6).reverse(), langs: [L.learn] };
      const scene = JSON.parse(base.ll_scenes_v1)[0];
      const mugWord = words.find((w) => w.id === 'w-mug');
      const shots = [
        // картки 9:16 («Зберегти зображення»)
        ['card-scene', { what: 'card', template: 'sceneStickers', pal: 'violet', payload: { kind: 'scene', scene } }],
        ['card-week-graphite', { what: 'card', template: 'week', pal: 'graphite', payload: { kind: 'week', stats: week } }],
        // наліпки без тла (головне, чим ділиться v1.3)
        ['sticker-object', { what: 'sticker', kind: 'object', payload: { kind: 'word', word: mugWord } }, { transparent: true }],
        ['sticker-scene', { what: 'sticker', kind: 'scene', payload: { kind: 'scene', scene } }, { transparent: true }],
        // живий перегляд віджетів з перекладом, відкритим кнопкою «Показати переклад»
        [
          'widget',
          { what: 'widget', width: 404, wod: { ...WIDGET_WOD[loc] }, sample: vocab(loc, 'apple'), streakN: 12, targetLang: L.learn },
          { reveal: ['preview-reveal', 'preview-reveal-words'], parts: ['preview-wod', 'preview-streak', 'preview-words'] },
        ],
      ];
      for (const [name, shot, opts = {}] of shots) {
        const l = await elementShot(browser, { port, shot: { lang: L.ui, ...shot }, out: path.join(outDir, name + '.png'), ...opts });
        logs.push(...l.map((x) => name + ': ' + x));
      }
      console.log(`  ${loc} parts`);
    }
  }
  await browser.close();
  server.close();
  fs.writeFileSync(path.join(WORK, 'capture-log.json'), JSON.stringify(report, null, 2));
  return report;
}

if (isMain(import.meta.url)) {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const r = await captureAll({ only: only.length ? only : null });
  for (const [loc, l] of Object.entries(r)) if (l.length) console.log(loc, l.slice(0, 30).join('\n'));
}
