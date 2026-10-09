// A shared "preamble" for every use_figma call in the file c5DX8UXHJUdO58fwjIRTFq.
// Context is not kept between calls, so this block goes at the start of every script.
// Paste it in full, then the code of the specific screens.

const page = figma.root.children.find(p => p.name === 'Screens · Light');
await figma.setCurrentPageAsync(page);

const cols = await figma.variables.getLocalVariableCollectionsAsync();
const LC = cols.find(c => c.name === 'Color · Light');   // for dark screens → 'Color · Dark'
const vars = await figma.variables.getLocalVariablesAsync('COLOR');
const V = n => vars.find(v => v.variableCollectionId === LC.id && v.name === n);
const fill = n => [figma.variables.setBoundVariableForPaint(
  { type: 'SOLID', color: { r: 0, g: 0, b: 0 } }, 'color', V(n))];

const ts = await figma.getLocalTextStylesAsync();
const TS = n => ts.find(s => s.name === n);
const fxs = await figma.getLocalEffectStylesAsync();
const FX = n => fxs.find(s => s.name === n);

await Promise.all(['Medium', 'SemiBold', 'Bold', 'ExtraBold']
  .map(s => figma.loadFontAsync({ family: 'Nunito', style: s })));

const M = { wave: '2:68', celebrate: '2:70', think: '2:72', encourage: '2:74' };
const ICON = {
  scan: '6:5', book: '6:10', cards: '6:14', user: '6:18', sliders: '6:22',
  speaker: '6:26', check: '6:29', chevron: '6:32', flame: '6:35',
  search: '6:39', plus: '6:42', close: '6:45',
};

async function lingo(pose, size) {
  const i = (await figma.getNodeByIdAsync(M[pose])).createInstance();
  i.resize(size, size);
  return i;
}

// An icon of the needed color. We recolor the stroke on all vectors inside.
async function icon(name, token, size = 24) {
  const i = (await figma.getNodeByIdAsync(ICON[name])).createInstance();
  if (size !== 24) i.resize(size, size);
  i.findAll(n => 'strokes' in n).forEach(n => { n.strokes = fill(token); });
  return i;
}

// Text. o.w turns on wrapping: without a FIXED width the node collapses into a thread.
async function T(str, style, token, o = {}) {
  const t = figma.createText();
  await t.setTextStyleIdAsync(TS(style).id);
  t.characters = str;
  t.fills = fill(token);
  if (o.align) t.textAlignHorizontal = o.align;
  if (o.w) { t.textAutoResize = 'HEIGHT'; t.resize(o.w, t.height); }
  return t;
}

function C(gap, p = {}) {
  const f = figma.createAutoLayout('VERTICAL', { itemSpacing: gap, ...p });
  f.fills = [];
  return f;
}
function R(gap, p = {}) {
  const f = figma.createAutoLayout('HORIZONTAL', { itemSpacing: gap, counterAxisAlignItems: 'CENTER', ...p });
  f.fills = [];
  return f;
}

// A floating card. A radius of 28 is soft, but not a pill.
async function card(pad = 18, token = 'surface', shadow = 'Shadow/md') {
  const f = C(0, { name: 'Card' });
  f.paddingLeft = f.paddingRight = f.paddingTop = f.paddingBottom = pad;
  f.cornerRadius = 28;
  f.fills = fill(token);
  if (shadow) await f.setEffectStyleIdAsync(FX(shadow).id);
  return f;
}

// Status bar. SF Symbols glyphs do not render in Figma, so we draw with shapes.
async function statusBar(f, token = 'text') {
  const sb = R(0, { name: 'Status bar', primaryAxisAlignItems: 'SPACE_BETWEEN' });
  f.appendChild(sb);
  sb.x = 0; sb.y = 0; sb.resize(402, 54);
  sb.layoutSizingHorizontal = 'FIXED';
  sb.primaryAxisSizingMode = 'FIXED';
  sb.paddingLeft = 32; sb.paddingRight = 28; sb.paddingTop = 17;
  sb.counterAxisAlignItems = 'MIN';
  sb.appendChild(await T('9:41', 'Footnote', token));
  const rt = R(5); sb.appendChild(rt);
  for (const h of [5, 7, 9, 11]) {
    const b = figma.createRectangle();
    b.resize(3, h); b.cornerRadius = 1; b.fills = fill(token);
    rt.appendChild(b);
  }
  const bat = figma.createRectangle();
  bat.resize(24, 11); bat.cornerRadius = 3; bat.fills = fill(token);
  rt.appendChild(bat);
  return sb;
}

async function screen(name, x, bgToken = 'bg', sbToken = 'text') {
  const f = figma.createFrame();
  f.name = name;
  f.resize(402, 874);
  f.x = x; f.y = 0;
  f.fills = fill(bgToken);
  f.clipsContent = true;
  await statusBar(f, sbToken);
  return f;
}

// Bottom bar. The active tab is a soft pill under the icon, not an underline:
// an underline gets lost on a frosted surface.
async function tabBar(f, activeIndex) {
  const bar = R(0, { name: 'Tab bar' });
  f.appendChild(bar);
  bar.x = 0; bar.y = 874 - 84; bar.resize(402, 84);
  bar.layoutSizingHorizontal = 'FIXED';
  bar.primaryAxisSizingMode = 'FIXED';
  bar.paddingTop = 10; bar.paddingBottom = 24;
  bar.counterAxisAlignItems = 'MIN';
  bar.fills = fill('surface');
  await bar.setEffectStyleIdAsync(FX('Shadow/sm').id);

  const items = [['Сканер', 'scan'], ['Словник', 'book'], ['Навчання', 'cards'],
                 ['Профіль', 'user'], ['Ще', 'sliders']];
  for (let i = 0; i < items.length; i++) {
    const [nm, ic] = items[i];
    const on = i === activeIndex;
    const it = C(5, { name: 'Tab · ' + nm });
    it.counterAxisAlignItems = 'CENTER';
    bar.appendChild(it);
    it.layoutSizingHorizontal = 'FILL';

    const slot = figma.createFrame();
    slot.resize(48, 30);
    slot.cornerRadius = 999;
    slot.fills = on ? fill('accent-soft') : [];
    slot.layoutMode = 'HORIZONTAL';
    slot.primaryAxisAlignItems = 'CENTER';
    slot.counterAxisAlignItems = 'CENTER';
    it.appendChild(slot);
    slot.appendChild(await icon(ic, on ? 'accent' : 'text-faint'));

    it.appendChild(await T(nm, 'Caps', on ? 'accent' : 'text-faint'));
  }
  return bar;
}

// ── Notes on pitfalls we already stumbled on ─────────────────────────────────
// • Set layoutSizingHorizontal='FILL' ONLY after appendChild.
// • Ellipse has no cornerRadius: use Rectangle for pills.
// • createPage throws an error: Starter allows only 3 pages.
// • addMode throws an error: Starter allows only 1 mode per collection.
// • An error in a script = the script did not run at all, the file is untouched.
// • FRAME has no padding property, only paddingLeft/Right/Top/Bottom.
// • appendChild() returns nothing: `parent.appendChild(x).rotation` will crash.
// • createNodeFromSvg wraps vectors in a FRAME, which also has strokes.
//   Recolor only what ALREADY has a stroke: x.strokes.length > 0.
// • The icon content must be set to SCALE constraints, otherwise on resize of the
//   instance the vector stays 24px and sticks out of the frame.
// • An auto-layout child with a fixed size: after appendChild set
//   layoutSizingHorizontal='FIXED' AND layoutSizingVertical='FIXED', otherwise
//   the parent will squeeze it into a thread (this is how the badge counter got flattened).
// • Search for nodes by structure carefully: "a FRAME whose first child is TEXT"
//   is both a badge and a text column. Add one more criterion (cornerRadius).
