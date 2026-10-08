// Два намальовані «фото» (ЗАМІННИКИ BRIEF §9 P1 і P4), портрет 1080×1920,
// як кадр сцени 9:16 у застосунку:
//   hero    — червона чашка на дерев'яному столі, світло з вікна зліва (P1).
//             Іде у веб-камеру для справжнього скану, тож чашка стоїть там,
//             де рамка прицілу сканера v1.3 (верхня середина екрана, ~y 780
//             з 1920).
//   kitchen — кухонна стільниця з дев'ятьма предметами, які можна назвати
//             (P4); іде в екран сцени як збережена сцена.
// Кожен підписаний предмет — окрема розмітка, щоб build-art обвів його маску.
import { OBJECTS, blur, lg, rg } from './objects.mjs';

const obj = (name, prefix, x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})">${OBJECTS[name](prefix)}</g>`;

// ─── hero: чашка на столі ──────────────────────────────────────────────────
// Веб-камера показує фото 1080×1920 у режимі cover на 440×922 pt; рамка
// прицілу — ~x 87–353, y 245–507 pt, тобто на фото ~x 260–815, y 510–1055.
// Чашку (малюнок у квадраті 1000: тіло x 255–830, y 293–812) зменшено до
// ~78% ширини рамки й поставлено посередині; край столу — на ~46% висоти
// чашки, як на фото трохи згори.
const MUG = { x: 133, y: 369, s: 0.75 };
const TABLE_DY = -382;
export function heroScene() {
  const defs = `
    ${lg('hw', 0, 0, 0, 1, [[0, '#EFE8DD'], [0.6, '#E8DFD1'], [1, '#DDD2C1']])}
    ${rg('hwin', 0.12, 0.28, 0.75, [[0, '#FFFFFF', 0.95], [0.45, '#FFF8EC', 0.55], [1, '#FFF8EC', 0]])}
    ${lg('ht', 0, 0, 0, 1, [[0, '#D9B98E'], [0.5, '#C99F6E'], [1, '#B4875A']])}
    ${lg('htEdge', 0, 0, 0, 1, [[0, '#E9CFA9'], [1, '#D4B285']])}
    ${rg('hvig', 0.5, 0.5, 0.85, [[0.6, '#000', 0], [1, '#2B1D10', 0.22]])}
    ${lg('hbeam', 0, 0, 1, 1, [[0, '#FFFFFF', 0.55], [1, '#FFFFFF', 0]])}
    ${blur('hb30', 30)} ${blur('hb14', 14)} ${blur('hb50', 50)} ${blur('hb8', 8)}
  `;
  const bg = `
    <rect width="1080" height="1920" fill="url(#hw)"/>
    <rect width="1080" height="1920" fill="url(#hwin)"/>
    <!-- рама вікна ліворуч, не в фокусі -->
    <g filter="url(#hb30)" opacity="0.9">
      <rect x="-60" y="120" width="330" height="920" rx="10" fill="#FFFDF8"/>
      <rect x="110" y="120" width="26" height="920" fill="#E4DACB"/>
      <rect x="-60" y="560" width="330" height="22" fill="#E4DACB"/>
    </g>
    <!-- промені світла на стіні -->
    <path d="M250 300 L 1080 760 L 1080 1040 L 250 620 Z" fill="url(#hbeam)" filter="url(#hb50)" opacity="0.65"/>
    <!-- усе на рівні столу, підняте, щоб чашка заповнила рамку прицілу -->
    <g transform="translate(0 ${TABLE_DY})">
    <!-- розмита рослина позаду праворуч -->
    <g filter="url(#hb30)" opacity="0.85">
      <path d="M860 1190 L 1000 1190 L 985 1060 L 875 1060 Z" fill="#C8916C"/>
      <ellipse cx="930" cy="900" rx="150" ry="190" fill="#7FA97A"/>
      <ellipse cx="1010" cy="820" rx="90" ry="140" fill="#6C9A69"/>
      <ellipse cx="850" cy="960" rx="90" ry="120" fill="#8DB887"/>
    </g>
    <!-- розмиті книжки позаду ліворуч -->
    <g filter="url(#hb14)" opacity="0.9">
      <rect x="40" y="1110" width="250" height="44" rx="6" fill="#E6D5B8"/>
      <rect x="60" y="1068" width="215" height="44" rx="6" fill="#8FA9C9"/>
      <rect x="50" y="1030" width="230" height="40" rx="6" fill="#E8B07A"/>
    </g>
    <!-- стіл -->
    <path d="M0 1150 L 1080 1150 L 1080 2400 L 0 2400 Z" fill="url(#ht)"/>
    <rect y="1150" width="1080" height="16" fill="url(#htEdge)"/>
    ${[1210, 1290, 1390, 1520, 1680, 1860, 2060, 2280].map((y, i) => `<path d="M0 ${y} C 280 ${y - 10 + (i % 2) * 14} 720 ${y + 12} 1080 ${y - 6}" stroke="#9C7148" stroke-opacity="${0.18 + Math.min(i, 5) * 0.02}" stroke-width="${3 + Math.min(i, 5)}" fill="none"/>`).join('')}
    <!-- світло з вікна на столі -->
    <path d="M0 1250 L 700 1250 L 1080 1700 L 0 1700 Z" fill="#FFF6E6" opacity="0.22" filter="url(#hb50)"/>
    <!-- кавові зерна -->
    ${[[250, 1760, 20], [300, 1790, -30], [215, 1820, 60], [760, 1860, 15]].map(([x, y, r]) => `<g transform="translate(${x} ${y}) rotate(${r})"><ellipse rx="22" ry="15" fill="#5A3520"/><path d="M-16 0 C -6 -4 6 4 16 0" stroke="#2E190C" stroke-width="3" fill="none"/></g>`).join('')}
    </g>
    <!-- тінь чашки (світло зліва, тінь праворуч) у координатах самої чашки -->
    <g transform="translate(${MUG.x} ${MUG.y}) scale(${MUG.s}) translate(0 -618)">
      <ellipse cx="610" cy="1428" rx="340" ry="46" fill="#3E2A16" opacity="0.38" filter="url(#hb14)"/>
      <path d="M560 1400 L 1000 1340 L 1040 1420 L 600 1440 Z" fill="#3E2A16" opacity="0.14" filter="url(#hb14)"/>
    </g>
  `;
  const objects = [{ key: 'mug', markup: obj('mug', 'hm_', MUG.x, MUG.y, MUG.s) }];
  const fg = `<rect width="1080" height="1920" fill="url(#hvig)"/>`;
  return { width: 1080, height: 1920, defs, bg, objects, fg };
}

// ─── кухня ─────────────────────────────────────────────────────────────────
export function kitchenScene() {
  const defs = `
    ${lg('kw', 0, 0, 0, 1, [[0, '#F6F2EB'], [1, '#EDE6DB']])}
    ${lg('ksky', 0, 0, 0, 1, [[0, '#BFDDF2'], [1, '#E5F0F4']])}
    ${lg('kframe', 0, 0, 1, 1, [[0, '#FFFFFF'], [1, '#E7E1D7']])}
    ${lg('kwood', 0, 0, 0, 1, [[0, '#DDBD8E'], [1, '#C29A68']])}
    ${lg('kwoodE', 0, 0, 0, 1, [[0, '#C79E6C'], [1, '#A47A4B']])}
    ${lg('kcab', 0, 0, 0, 1, [[0, '#9DB59A'], [1, '#86A083']])}
    ${lg('kcabP', 0, 0, 0, 1, [[0, '#A9C0A6'], [1, '#93AC90']])}
    ${lg('kboard', 0, 0, 1, 0, [[0, '#C98F55'], [0.3, '#E2AE73'], [1, '#B07A43']])}
    ${lg('kpan', 0, 0, 1, 1, [[0, '#4A4652'], [1, '#1E1B24']])}
    ${rg('kpanIn', 0.45, 0.4, 0.7, [[0, '#5B5664'], [1, '#26222D']])}
    ${lg('kbowl', 0, 0, 0, 1, [[0, '#FFFFFF'], [1, '#D9E3EA']])}
    ${lg('kjar', 0, 0, 1, 0, [[0, '#DDEBEE', 0.55], [0.3, '#FFFFFF', 0.85], [1, '#C5D8DD', 0.6]])}
    ${lg('ktowel', 0, 0, 1, 0, [[0, '#F5F1EA'], [1, '#E2DACD']])}
    ${lg('kshelf', 0, 0, 0, 1, [[0, '#D8B888'], [1, '#B48E5E']])}
    ${rg('kvig', 0.5, 0.45, 0.9, [[0.65, '#000', 0], [1, '#20160C', 0.2]])}
    <clipPath id="kpane"><rect x="122" y="262" width="496" height="576"/></clipPath>
    ${blur('kb20', 20)} ${blur('kb10', 10)} ${blur('kb6', 6)} ${blur('kb40', 40)}
  `;
  const tiles = [];
  for (let r = 0; r < 6; r++) {
    for (let c = -1; c < 11; c++) {
      const x = c * 120 + (r % 2 ? 60 : 0);
      tiles.push(`<rect x="${x + 3}" y="${930 + r * 52 + 3}" width="114" height="46" rx="6" fill="#FBFAF7" stroke="#E2DDD3" stroke-width="2"/>`);
    }
  }
  const bg = `
    <rect width="1080" height="1920" fill="url(#kw)"/>
    <!-- світло з вікна -->
    <ellipse cx="380" cy="560" rx="560" ry="520" fill="#FFFFFF" opacity="0.55" filter="url(#kb40)"/>
    <!-- фартух -->
    <rect y="926" width="1080" height="312" fill="#EEEAE2"/>
    ${tiles.join('')}
    <!-- полиця (праворуч) -->
    <rect x="700" y="560" width="340" height="22" rx="4" fill="url(#kshelf)"/>
    <rect x="700" y="580" width="340" height="10" fill="#8C6A42" opacity="0.35"/>
    <path d="M730 590 L 730 640 L 760 590 Z" fill="#B48E5E"/>
    <path d="M1010 590 L 1010 640 L 980 590 Z" fill="#B48E5E"/>
    <ellipse cx="960" cy="545" rx="58" ry="16" fill="#FFFFFF"/>
    <path d="M902 545 C 905 500 1015 500 1018 545 Z" fill="#E9EEF2"/>
    <!-- рейка для сковорідки -->
    <rect x="760" y="700" width="260" height="12" rx="6" fill="#B7B2BE"/>
    <circle cx="768" cy="706" r="10" fill="#9C97A5"/><circle cx="1012" cy="706" r="10" fill="#9C97A5"/>
    <path d="M890 712 L 890 790 M 865 790 L 915 790" stroke="#8B8695" stroke-width="10" stroke-linecap="round"/>
    <!-- стільниця й шафки -->
    <rect y="1238" width="1080" height="70" fill="url(#kwood)"/>
    <rect y="1300" width="1080" height="40" fill="url(#kwoodE)"/>
    <rect y="1340" width="1080" height="580" fill="url(#kcab)"/>
    <rect x="40" y="1380" width="480" height="540" rx="18" fill="url(#kcabP)" stroke="#7E977B" stroke-width="4"/>
    <rect x="560" y="1380" width="480" height="540" rx="18" fill="url(#kcabP)" stroke="#7E977B" stroke-width="4"/>
    <rect x="470" y="1420" width="18" height="140" rx="9" fill="#E4D6BE"/>
    <rect x="592" y="1420" width="18" height="140" rx="9" fill="#E4D6BE"/>
    <rect y="1340" width="1080" height="26" fill="#000" opacity="0.08"/>
    <!-- тіні на стільниці -->
    <ellipse cx="215" cy="1272" rx="170" ry="20" fill="#4B3420" opacity="0.35" filter="url(#kb10)"/>
    <ellipse cx="520" cy="1270" rx="150" ry="16" fill="#4B3420" opacity="0.3" filter="url(#kb10)"/>
    <ellipse cx="760" cy="1272" rx="140" ry="18" fill="#4B3420" opacity="0.35" filter="url(#kb10)"/>
    <ellipse cx="935" cy="1272" rx="85" ry="14" fill="#4B3420" opacity="0.35" filter="url(#kb10)"/>
  `;
  const objects = [
    {
      key: 'window',
      markup: `<g>
        <rect x="90" y="230" width="560" height="640" rx="14" fill="url(#kframe)"/>
        <rect x="122" y="262" width="496" height="576" fill="url(#ksky)"/>
        <g clip-path="url(#kpane)"><g filter="url(#kb20)"><ellipse cx="200" cy="760" rx="170" ry="130" fill="#8DBB7C"/><ellipse cx="480" cy="720" rx="200" ry="150" fill="#9CC78A"/><ellipse cx="360" cy="420" rx="120" ry="34" fill="#FFFFFF" opacity="0.9"/></g></g>
        <rect x="358" y="262" width="24" height="576" fill="url(#kframe)"/>
        <rect x="122" y="538" width="496" height="22" fill="url(#kframe)"/>
        <rect x="70" y="860" width="600" height="34" rx="6" fill="#FFFFFF"/>
        <rect x="70" y="890" width="600" height="10" fill="#D8D0C3"/>
      </g>`,
    },
    { key: 'plant', markup: obj('plant', 'kp_', 340, 470, 0.42) },
    {
      key: 'pan',
      markup: `<g>
        <rect x="874" y="780" width="32" height="140" rx="16" fill="#2E2A35"/>
        <circle cx="890" cy="1010" r="118" fill="url(#kpan)"/>
        <circle cx="890" cy="1010" r="96" fill="url(#kpanIn)"/>
        <path d="M820 950 C 840 925 875 912 910 915" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.25"/>
      </g>`,
    },
    {
      key: 'jar',
      markup: `<g>
        <rect x="752" y="420" width="96" height="26" rx="8" fill="#C98F55"/>
        <path d="M748 446 L 852 446 C 866 446 870 456 870 470 L 870 540 C 870 552 862 560 850 560 L 750 560 C 738 560 730 552 730 540 L 730 470 C 730 456 734 446 748 446 Z" fill="#F3D27A"/>
        ${[462, 482, 502, 522, 542].map((y, i) => `<path d="M738 ${y} L 862 ${y + 10}" stroke="#D9A93E" stroke-width="7" stroke-linecap="round"/>`).join('')}
        <path d="M748 446 L 852 446 C 866 446 870 456 870 470 L 870 540 C 870 552 862 560 850 560 L 750 560 C 738 560 730 552 730 540 L 730 470 C 730 456 734 446 748 446 Z" fill="url(#kjar)"/>
        <rect x="748" y="462" width="12" height="84" rx="6" fill="#fff" opacity="0.6"/>
      </g>`,
    },
    { key: 'board', markup: `<g>
        <path d="M400 960 C 400 930 420 912 452 912 L 470 912 L 470 880 C 470 840 570 840 570 880 L 570 912 L 592 912 C 624 912 640 930 640 960 L 640 1240 C 640 1262 624 1272 604 1272 L 436 1272 C 414 1272 400 1262 400 1240 Z" fill="url(#kboard)"/>
        <ellipse cx="520" cy="884" rx="22" ry="16" fill="#EEEAE2"/>
        <path d="M430 950 L 430 1230" stroke="#fff" stroke-opacity="0.25" stroke-width="10" stroke-linecap="round"/>
        ${[1000, 1080, 1170].map((y) => `<path d="M420 ${y} C 480 ${y - 8} 560 ${y + 8} 620 ${y}" stroke="#A8743E" stroke-opacity="0.35" stroke-width="3" fill="none"/>`).join('')}
      </g>` },
    { key: 'kettle', markup: obj('kettle', 'kk_', -28, 912, 0.44) },
    // (без лимона: на обробній дошці його підпис закривав дошку; дев'ять
    //  предметів лягають чистіше, а бриф просить 8–10 підписів)
    {
      key: 'apple',
      markup: obj('apple', 'ka_', 652, 1004, 0.22),
    },
    { key: 'mug', markup: obj('mug', 'km_', 828, 1060, 0.26) },
    {
      key: 'towel',
      markup: `<g>
        <path d="M420 1418 C 420 1404 440 1396 470 1396 C 500 1396 520 1404 520 1418 L 530 1740 C 530 1752 520 1760 506 1760 L 434 1760 C 420 1760 410 1752 410 1740 Z" fill="url(#ktowel)"/>
        ${[1600, 1630, 1690].map((y) => `<path d="M412 ${y} L 528 ${y}" stroke="#E2665A" stroke-width="${y === 1630 ? 14 : 6}"/>`).join('')}
        <path d="M440 1420 L 440 1740" stroke="#fff" stroke-width="8" opacity="0.5"/>
      </g>`,
    },
  ];
  // миска навколо яблука: малюється після яблука, щоб край миски був спереду
  const fg = `
    <g>
      <path d="M625 1180 C 640 1255 700 1276 760 1276 C 820 1276 880 1255 895 1180 Z" fill="url(#kbowl)"/>
      <ellipse cx="760" cy="1180" rx="135" ry="14" fill="#F4F7F9"/>
      <path d="M640 1196 C 660 1240 700 1256 740 1260" stroke="#fff" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.8"/>
      <path d="M650 1215 C 700 1225 820 1225 870 1215" stroke="#8FB3D9" stroke-width="7" fill="none" opacity="0.6"/>
    </g>
    <rect width="1080" height="1920" fill="url(#kvig)"/>`;
  return { width: 1080, height: 1920, defs, bg, objects, fg };
}

// only — лише цей предмет (його маску обводить build-art); bg: false — сцена
// без тла: предмети й те, що перед ними (миска, віньєтка), для білої
// підкладки наліпок (backing.js).
export function sceneSvg(sc, only = null, { bg = true } = {}) {
  const body = only
    ? sc.objects.filter((o) => o.key === only).map((o) => o.markup).join('')
    : (bg ? sc.bg : '') + sc.objects.map((o) => o.markup).join('') + sc.fg;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${sc.width}" height="${sc.height}" viewBox="0 0 ${sc.width} ${sc.height}"><defs>${sc.defs}</defs>${body}</svg>`;
}
