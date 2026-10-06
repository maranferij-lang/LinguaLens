// М'які об'ємні ілюстрації предметів — ЗАМІННИКИ справжніх сканів власника
// (BRIEF §9, P1/P3; справжні фото — photos.mjs). Кожен предмет живе в
// квадраті 1000×1000, світло зліва згори, і намальований БЕЗ тіні від
// дотику (її додає «фото»), тож альфа самотнього предмета — рівно його
// силует для вирізання наліпки. Кожна функція бере префікс id, щоб кілька
// копій жили в одному документі.

export const lg = (id, x1, y1, x2, y2, stops) =>
  `<linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}">${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</linearGradient>`;
export const rg = (id, cx, cy, r, stops, extra = '') =>
  `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${r}" ${extra}>${stops
    .map(([o, c, a = 1]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${a}"/>`)
    .join('')}</radialGradient>`;
export const blur = (id, s) => `<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${s}"/></filter>`;

export const OBJECTS = {
  // ── червона чашка з кавою ──
  mug: (p) => `
  <defs>
    ${lg(p + 'b', 0, 0, 1, 0, [[0, '#A51E17'], [0.16, '#D93A2E'], [0.3, '#F2675A'], [0.42, '#E2463A'], [0.75, '#C42C22'], [1, '#8E1812']])}
    ${lg(p + 'h', 0, 0, 1, 0, [[0, '#B8261D'], [0.5, '#E2463A'], [1, '#8E1812']])}
    ${rg(p + 'c', 0.42, 0.4, 0.7, [[0, '#9A6440'], [0.55, '#6B3F22'], [1, '#3E2213']])}
    ${lg(p + 'r', 0, 0, 1, 0, [[0, '#E9574A'], [0.35, '#FF8A7C'], [1, '#C93328']])}
    ${blur(p + 'f', 9)}
  </defs>
  <path d="M640 430 C 760 418 805 470 800 545 C 795 625 735 668 640 665" fill="none" stroke="url(#${p}h)" stroke-width="58" stroke-linecap="round"/>
  <path d="M640 452 C 735 446 770 490 766 545 C 762 605 718 640 640 642" fill="none" stroke="#7E140F" stroke-opacity="0.25" stroke-width="8"/>
  <path d="M255 345 L 255 735 C 255 790 320 812 450 812 C 580 812 645 790 645 735 L 645 345 Z" fill="url(#${p}b)"/>
  <rect x="300" y="380" width="34" height="380" rx="17" fill="#fff" opacity="0.32" filter="url(#${p}f)"/>
  <path d="M255 735 C 255 790 320 812 450 812 C 580 812 645 790 645 735" fill="none" stroke="#6E120D" stroke-opacity="0.25" stroke-width="10"/>
  <ellipse cx="450" cy="345" rx="195" ry="52" fill="url(#${p}r)"/>
  <ellipse cx="450" cy="350" rx="170" ry="38" fill="url(#${p}c)"/>
  <ellipse cx="420" cy="342" rx="62" ry="12" fill="#C9966B" opacity="0.55" filter="url(#${p}f)"/>`,

  // ── кімнатна рослина в теракотовому горщику ──
  plant: (p) => {
    const leaf = (x, y, len, w, rot, c1, c2) => `
      <g transform="translate(${x} ${y}) rotate(${rot})">
        <path d="M0 0 C ${w} ${-len * 0.25} ${w * 0.7} ${-len * 0.8} 0 ${-len} C ${-w * 0.7} ${-len * 0.8} ${-w} ${-len * 0.25} 0 0 Z" fill="url(#${p}${c1})"/>
        <path d="M0 0 C ${w * 0.15} ${-len * 0.4} ${w * 0.1} ${-len * 0.7} 0 ${-len * 0.96}" stroke="${c2}" stroke-width="7" fill="none" stroke-linecap="round" opacity="0.7"/>
      </g>`;
    return `
  <defs>
    ${lg(p + 'L1', 0, 0, 1, 1, [[0, '#7DD07C'], [0.55, '#3E9E57'], [1, '#226B3B']])}
    ${lg(p + 'L2', 1, 0, 0, 1, [[0, '#5DBF6C'], [0.6, '#2F8A4B'], [1, '#1B5A31']])}
    ${lg(p + 'p', 0, 0, 1, 0, [[0, '#B85634'], [0.25, '#E2875C'], [0.4, '#D46F45'], [1, '#93401F']])}
    ${lg(p + 'pr', 0, 0, 1, 0, [[0, '#C9633D'], [0.3, '#F09A6E'], [1, '#A34A26']])}
  </defs>
  ${leaf(470, 640, 390, 70, -38, 'L2', '#BFE8B8')}
  ${leaf(530, 640, 400, 70, 36, 'L2', '#BFE8B8')}
  ${leaf(490, 640, 470, 78, -14, 'L1', '#D9F2D3')}
  ${leaf(515, 640, 450, 76, 14, 'L1', '#D9F2D3')}
  ${leaf(500, 640, 330, 64, -58, 'L1', '#D9F2D3')}
  ${leaf(505, 640, 320, 64, 60, 'L1', '#D9F2D3')}
  ${leaf(500, 640, 520, 72, 2, 'L2', '#BFE8B8')}
  <path d="M330 690 L 670 690 L 630 900 C 628 912 618 918 606 918 L 394 918 C 382 918 372 912 370 900 Z" fill="url(#${p}p)"/>
  <rect x="306" y="626" width="388" height="78" rx="18" fill="url(#${p}pr)"/>
  <rect x="306" y="690" width="388" height="14" rx="7" fill="#7A3418" opacity="0.25"/>
  <rect x="352" y="720" width="22" height="170" rx="11" fill="#fff" opacity="0.18"/>`;
  },

  // ── зелено-золоте яблуко ──
  apple: (p) => `
  <defs>
    ${rg(p + 'a', 0.36, 0.34, 0.75, [[0, '#F3F59A'], [0.3, '#C9E05A'], [0.7, '#8CC23B'], [1, '#4E8E24']])}
    ${rg(p + 'blush', 0.75, 0.55, 0.5, [[0, '#F0954A', 0.55], [1, '#F0954A', 0]])}
    ${lg(p + 'l', 0, 0, 1, 1, [[0, '#7ED36F'], [1, '#2E8A3E']])}
    ${blur(p + 'f', 14)}
  </defs>
  <path d="M500 330 C 430 280 280 285 235 420 C 190 555 255 730 360 790 C 420 825 460 805 500 795 C 540 805 580 825 640 790 C 745 730 810 555 765 420 C 720 285 570 280 500 330 Z" fill="url(#${p}a)"/>
  <path d="M500 330 C 430 280 280 285 235 420 C 190 555 255 730 360 790 C 420 825 460 805 500 795 C 540 805 580 825 640 790 C 745 730 810 555 765 420 C 720 285 570 280 500 330 Z" fill="url(#${p}blush)"/>
  <ellipse cx="360" cy="440" rx="55" ry="85" fill="#fff" opacity="0.45" filter="url(#${p}f)" transform="rotate(20 360 440)"/>
  <path d="M500 345 C 495 300 505 255 530 215" stroke="#6B4423" stroke-width="22" stroke-linecap="round" fill="none"/>
  <path d="M535 260 C 580 200 670 195 720 225 C 680 285 590 300 535 260 Z" fill="url(#${p}l)"/>
  <path d="M545 258 C 600 240 660 230 705 228" stroke="#C9F0BE" stroke-width="5" fill="none" opacity="0.7"/>`,

  // ── лимон із листком ──
  lemon: (p) => `
  <defs>
    ${rg(p + 'a', 0.38, 0.35, 0.75, [[0, '#FFF7B0'], [0.35, '#FFE34D'], [0.75, '#F5C21A'], [1, '#C99300']])}
    ${lg(p + 'l', 0, 0, 1, 1, [[0, '#86D777'], [1, '#2F8C42']])}
    ${blur(p + 'f', 12)}
  </defs>
  <g transform="rotate(-24 500 520)">
    <path d="M175 520 C 175 470 205 455 240 440 C 300 330 420 300 500 300 C 580 300 700 330 760 440 C 795 455 825 470 825 520 C 825 570 795 585 760 600 C 700 710 580 740 500 740 C 420 740 300 710 240 600 C 205 585 175 570 175 520 Z" fill="url(#${p}a)"/>
    <ellipse cx="400" cy="420" rx="120" ry="40" fill="#fff" opacity="0.5" filter="url(#${p}f)"/>
  </g>
  <path d="M590 300 C 640 220 740 200 800 230 C 760 300 660 320 590 300 Z" fill="url(#${p}l)"/>
  <path d="M600 298 C 660 265 730 245 790 232" stroke="#D3F5C9" stroke-width="5" fill="none" opacity="0.7"/>`,

  // ── кросівок (збоку) ──
  sneaker: (p) => `
  <defs>
    ${lg(p + 'u', 0, 0, 0, 1, [[0, '#5C7BFF'], [1, '#2E48C9']])}
    ${lg(p + 'w', 0, 0, 0, 1, [[0, '#FFFFFF'], [1, '#E3E1EA']])}
    ${lg(p + 's', 0, 0, 0, 1, [[0, '#FFFFFF'], [0.6, '#F1EFF4'], [1, '#C9C5D2']])}
    ${lg(p + 'o', 0, 0, 1, 0, [[0, '#FF8A4C'], [1, '#FF5A3C']])}
  </defs>
  <path d="M150 640 C 150 560 190 520 250 500 C 330 470 400 420 430 360 C 450 320 500 300 560 310 L 640 330 C 690 340 700 380 700 420 C 760 450 840 480 870 540 C 890 580 885 640 860 660 Z" fill="url(#${p}u)"/>
  <path d="M430 360 C 450 320 500 300 560 310 L 640 330 C 690 340 700 380 700 420 C 640 430 560 420 500 390 C 470 375 445 368 430 360 Z" fill="url(#${p}w)"/>
  <path d="M250 500 C 330 470 400 420 430 360 C 470 400 540 470 560 560 C 470 560 330 560 250 500 Z" fill="#fff" opacity="0.16"/>
  <path d="M300 560 C 420 590 560 560 640 470 C 690 520 740 560 820 580" stroke="url(#${p}o)" stroke-width="26" stroke-linecap="round" fill="none"/>
  ${[0, 1, 2, 3].map((i) => `<path d="M${470 + i * 38} ${370 + i * 22} l 60 -34" stroke="#fff" stroke-width="12" stroke-linecap="round"/>`).join('')}
  <path d="M130 640 L 880 640 C 900 640 905 660 900 680 C 893 705 870 715 840 715 L 175 715 C 140 715 120 700 120 675 C 120 655 125 640 130 640 Z" fill="url(#${p}s)"/>
  <rect x="130" y="690" width="770" height="14" rx="7" fill="#B3AEC0" opacity="0.6"/>
  <path d="M160 600 C 200 590 230 600 250 620" stroke="#fff" stroke-width="10" stroke-linecap="round" fill="none" opacity="0.45"/>`,

  // ── повнорозмірні навушники ──
  headphones: (p) => `
  <defs>
    ${lg(p + 'b', 0, 0, 1, 0, [[0, '#FF8FB8'], [0.5, '#FFB3CE'], [1, '#E35E91']])}
    ${lg(p + 'c', 0, 0, 1, 0, [[0, '#FF9EC3'], [0.35, '#FFC1D8'], [1, '#D9497F']])}
    ${lg(p + 'k', 0, 0, 1, 0, [[0, '#5B5566'], [1, '#2E2A35']])}
  </defs>
  <path d="M250 560 C 230 330 340 200 500 200 C 660 200 770 330 750 560" fill="none" stroke="url(#${p}b)" stroke-width="64" stroke-linecap="round"/>
  <path d="M262 470 C 270 320 370 240 500 240 C 630 240 730 320 738 470" fill="none" stroke="#fff" stroke-opacity="0.35" stroke-width="10" stroke-linecap="round"/>
  <rect x="255" y="500" width="60" height="250" rx="30" fill="url(#${p}k)"/>
  <rect x="685" y="500" width="60" height="250" rx="30" fill="url(#${p}k)"/>
  <rect x="160" y="470" width="135" height="310" rx="66" fill="url(#${p}c)"/>
  <rect x="705" y="470" width="135" height="310" rx="66" fill="url(#${p}c)"/>
  <rect x="185" y="510" width="26" height="220" rx="13" fill="#fff" opacity="0.4"/>
  <rect x="730" y="510" width="26" height="220" rx="13" fill="#fff" opacity="0.35"/>`,

  // ── окуляри в черепаховій оправі (трохи 3/4) ──
  glasses: (p) => `
  <defs>
    ${lg(p + 't', 0, 0, 1, 1, [[0, '#C98A3E'], [0.3, '#7A4320'], [0.55, '#B06A2C'], [0.8, '#5C2F14'], [1, '#9C5A25']])}
    ${lg(p + 'g', 0, 0, 1, 1, [[0, '#E6F4FF', 0.85], [0.5, '#B9DDF7', 0.75], [1, '#8EC4EE', 0.85]])}
  </defs>
  <path d="M150 420 L 110 380" stroke="url(#${p}t)" stroke-width="30" stroke-linecap="round"/>
  <path d="M850 420 L 890 380" stroke="url(#${p}t)" stroke-width="30" stroke-linecap="round"/>
  <rect x="150" y="390" width="300" height="250" rx="96" fill="url(#${p}g)" stroke="url(#${p}t)" stroke-width="40"/>
  <rect x="550" y="390" width="300" height="250" rx="96" fill="url(#${p}g)" stroke="url(#${p}t)" stroke-width="40"/>
  <path d="M450 470 C 470 440 530 440 550 470" stroke="url(#${p}t)" stroke-width="34" fill="none" stroke-linecap="round"/>
  <path d="M205 450 L 300 430 L 230 590 Z" fill="#fff" opacity="0.45"/>
  <path d="M605 450 L 700 430 L 630 590 Z" fill="#fff" opacity="0.45"/>`,

  // ── закрита книжка в твердій обкладинці (3/4) ──
  book: (p) => `
  <defs>
    ${lg(p + 'c', 0, 0, 1, 1, [[0, '#A56BE0'], [0.5, '#7D45C2'], [1, '#5B2B97']])}
    ${lg(p + 's', 0, 0, 1, 0, [[0, '#5A2A94'], [1, '#3F1D6B']])}
    ${lg(p + 'pg', 0, 0, 0, 1, [[0, '#FFFDF6'], [1, '#E7DFCB']])}
  </defs>
  <path d="M190 560 L 560 780 L 820 560 L 820 610 L 560 830 L 190 610 Z" fill="url(#${p}pg)"/>
  ${[0, 1, 2, 3, 4, 5].map((i) => `<path d="M${560} ${790 + i * 7} L 820 ${570 + i * 7}" stroke="#D9CFB6" stroke-width="2.5"/>`).join('')}
  <path d="M190 560 L 190 610 L 560 830 L 560 790 Z" fill="url(#${p}s)"/>
  <path d="M170 545 L 450 300 L 840 535 L 560 775 Z" fill="url(#${p}c)"/>
  <path d="M245 552 L 455 370" stroke="#fff" stroke-opacity="0.25" stroke-width="10" stroke-linecap="round"/>
  <path d="M420 640 L 700 405" stroke="#F6C453" stroke-width="22" stroke-linecap="round"/>
  <path d="M378 615 L 658 380" stroke="#F6C453" stroke-width="8" stroke-linecap="round" opacity="0.8"/>`,

  // ── помаранчевий рюкзак ──
  backpack: (p) => `
  <defs>
    ${lg(p + 'b', 0, 0, 1, 0, [[0, '#E56A1E'], [0.25, '#FF9B4F'], [0.45, '#FF8A3D'], [1, '#C4520F']])}
    ${lg(p + 'k', 0, 0, 1, 0, [[0, '#F07A2C'], [0.3, '#FFAE6B'], [1, '#D35F17']])}
    ${lg(p + 's', 0, 0, 1, 0, [[0, '#3B3550'], [1, '#221F30']])}
  </defs>
  <path d="M420 230 C 420 160 580 160 580 230" fill="none" stroke="url(#${p}s)" stroke-width="34" stroke-linecap="round"/>
  <path d="M290 360 C 290 270 370 220 500 220 C 630 220 710 270 710 360 L 720 790 C 720 835 690 860 645 860 L 355 860 C 310 860 280 835 280 790 Z" fill="url(#${p}b)"/>
  <path d="M300 360 C 320 300 390 262 500 262" stroke="#fff" stroke-opacity="0.35" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M330 600 C 330 565 360 545 400 545 L 600 545 C 640 545 670 565 670 600 L 675 790 C 675 815 660 830 635 830 L 365 830 C 340 830 325 815 325 790 Z" fill="url(#${p}k)"/>
  <path d="M330 600 L 670 600" stroke="#A9450B" stroke-width="10" opacity="0.5"/>
  <rect x="470" y="585" width="60" height="22" rx="11" fill="#2E2940"/>
  <path d="M340 400 C 420 380 580 380 660 400" stroke="#A9450B" stroke-width="9" fill="none" opacity="0.45"/>
  <rect x="610" y="390" width="28" height="56" rx="10" fill="#2E2940"/>`,

  // ── розкрита парасолька ──
  umbrella: (p) => `
  <defs>
    ${lg(p + 'a', 0, 0, 0, 1, [[0, '#7FD0FF'], [1, '#2E9BE6']])}
    ${lg(p + 'w', 0, 0, 0, 1, [[0, '#FFFFFF'], [1, '#DCEAF5']])}
    ${lg(p + 'h', 0, 0, 1, 0, [[0, '#8A5A33'], [1, '#5A3519']])}
  </defs>
  <path d="M500 205 L 500 180" stroke="#3B3550" stroke-width="18" stroke-linecap="round"/>
  <path d="M495 520 L 495 770 C 495 830 560 840 585 800" stroke="url(#${p}h)" stroke-width="30" fill="none" stroke-linecap="round"/>
  <path d="M140 520 C 150 320 310 205 500 205 C 690 205 850 320 860 520 C 820 490 760 490 730 520 C 700 490 640 490 615 520 C 585 490 525 490 500 520 C 475 490 415 490 385 520 C 360 490 300 490 270 520 C 240 490 180 490 140 520 Z" fill="url(#${p}a)"/>
  <path d="M500 205 C 440 260 400 380 385 520 C 415 490 475 490 500 520 C 525 490 585 490 615 520 C 600 380 560 260 500 205 Z" fill="url(#${p}w)"/>
  <path d="M500 205 C 330 240 260 380 270 520 C 240 490 180 490 140 520 C 150 320 310 205 500 205 Z" fill="url(#${p}w)"/>
  <path d="M500 205 C 670 240 740 380 730 520 C 760 490 820 490 860 520 C 850 320 690 205 500 205 Z" fill="url(#${p}w)"/>
  <path d="M210 380 C 260 290 360 240 450 228" stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.55"/>`,

  // ── чайник для плити, бірюзова емаль ──
  kettle: (p) => `
  <defs>
    ${lg(p + 'b', 0, 0, 1, 0, [[0, '#14897A'], [0.2, '#2FC2AE'], [0.33, '#7FE6D6'], [0.45, '#2FB9A5'], [1, '#0D6458']])}
    ${lg(p + 'k', 0, 0, 1, 0, [[0, '#2E2A35'], [1, '#121016']])}
    ${lg(p + 'sp', 0, 0, 1, 0, [[0, '#1EA592'], [1, '#0D6A5E']])}
  </defs>
  <path d="M700 590 C 760 560 790 500 830 430 C 840 410 865 415 860 440 C 840 520 800 610 720 660 Z" fill="url(#${p}sp)"/>
  <path d="M240 800 C 200 700 220 520 330 450 C 380 420 440 410 500 410 C 560 410 620 420 670 450 C 780 520 800 700 760 800 Z" fill="url(#${p}b)"/>
  <rect x="215" y="785" width="570" height="48" rx="24" fill="#0B5B50"/>
  <rect x="235" y="785" width="530" height="16" rx="8" fill="#fff" opacity="0.18"/>
  <ellipse cx="500" cy="418" rx="125" ry="28" fill="#0E7466"/>
  <path d="M440 405 C 440 380 560 380 560 405" fill="#1BA08D"/>
  <circle cx="500" cy="372" r="24" fill="#F5F1EA"/>
  <path d="M330 470 C 330 300 380 250 500 250 C 620 250 670 300 670 470" fill="none" stroke="url(#${p}k)" stroke-width="34" stroke-linecap="round"/>
  <ellipse cx="335" cy="590" rx="30" ry="110" fill="#fff" opacity="0.28" transform="rotate(12 335 590)"/>`,

  // ── ретро-фотоапарат (без бренду) ──
  camera: (p) => `
  <defs>
    ${lg(p + 'top', 0, 0, 0, 1, [[0, '#F4F2F7'], [1, '#C9C5D3']])}
    ${lg(p + 'body', 0, 0, 0, 1, [[0, '#3A3546'], [1, '#1D1A24']])}
    ${rg(p + 'lens', 0.4, 0.38, 0.65, [[0, '#9EC7FF'], [0.25, '#3D5D9E'], [0.6, '#151A2E'], [1, '#05070D']])}
    ${lg(p + 'ring', 0, 0, 1, 1, [[0, '#FFFFFF'], [0.5, '#A9A5B4'], [1, '#6E6A7C']])}
  </defs>
  <rect x="260" y="290" width="120" height="50" rx="14" fill="#2C2836"/>
  <rect x="640" y="275" width="110" height="65" rx="14" fill="url(#${p}top)"/>
  <rect x="170" y="320" width="660" height="430" rx="70" fill="url(#${p}body)"/>
  <path d="M170 450 L 170 390 C 170 350 200 320 240 320 L 760 320 C 800 320 830 350 830 390 L 830 450 Z" fill="url(#${p}top)"/>
  <circle cx="500" cy="550" r="190" fill="url(#${p}ring)"/>
  <circle cx="500" cy="550" r="160" fill="#211E2A"/>
  <circle cx="500" cy="550" r="125" fill="url(#${p}lens)"/>
  <circle cx="455" cy="500" r="34" fill="#fff" opacity="0.65"/>
  <circle cx="540" cy="600" r="12" fill="#fff" opacity="0.35"/>
  <rect x="690" y="360" width="90" height="56" rx="12" fill="#FFF3C7" stroke="#B8B3C4" stroke-width="6"/>
  <circle cx="230" cy="385" r="18" fill="#FF5A4E"/>`,

  // ── будильник із двома дзвониками ──
  clock: (p) => `
  <defs>
    ${lg(p + 'b', 0, 0, 1, 1, [[0, '#7FA6FF'], [0.45, '#4C7BF4'], [1, '#2447B8']])}
    ${lg(p + 'bell', 0, 0, 1, 1, [[0, '#9CBBFF'], [1, '#2F55C9']])}
    ${rg(p + 'f', 0.4, 0.35, 0.8, [[0, '#FFFFFF'], [1, '#E9E6F0']])}
  </defs>
  <path d="M300 760 L 250 850" stroke="#2B3D86" stroke-width="34" stroke-linecap="round"/>
  <path d="M700 760 L 750 850" stroke="#2B3D86" stroke-width="34" stroke-linecap="round"/>
  <path d="M200 330 C 190 240 270 180 350 205 Z" fill="url(#${p}bell)"/>
  <path d="M800 330 C 810 240 730 180 650 205 Z" fill="url(#${p}bell)"/>
  <path d="M215 320 C 205 230 300 175 365 215" stroke="url(#${p}bell)" stroke-width="40" fill="none" stroke-linecap="round"/>
  <path d="M785 320 C 795 230 700 175 635 215" stroke="url(#${p}bell)" stroke-width="40" fill="none" stroke-linecap="round"/>
  <rect x="470" y="190" width="60" height="70" rx="20" fill="#2B3D86"/>
  <circle cx="500" cy="540" r="300" fill="url(#${p}b)"/>
  <circle cx="500" cy="540" r="238" fill="url(#${p}f)"/>
  ${Array.from({ length: 12 }, (_, i) => {
    const a = (i / 12) * Math.PI * 2;
    const r1 = i % 3 === 0 ? 180 : 196;
    return `<line x1="${500 + Math.sin(a) * r1}" y1="${540 - Math.cos(a) * r1}" x2="${500 + Math.sin(a) * 214}" y2="${540 - Math.cos(a) * 214}" stroke="#2B2638" stroke-width="${i % 3 === 0 ? 14 : 8}" stroke-linecap="round"/>`;
  }).join('')}
  <line x1="500" y1="540" x2="500" y2="400" stroke="#2B2638" stroke-width="18" stroke-linecap="round"/>
  <line x1="500" y1="540" x2="600" y2="600" stroke="#2B2638" stroke-width="14" stroke-linecap="round"/>
  <line x1="500" y1="540" x2="400" y2="470" stroke="#FF5A4E" stroke-width="6" stroke-linecap="round"/>
  <circle cx="500" cy="540" r="18" fill="#FF5A4E"/>
  <path d="M290 380 C 330 320 390 285 450 270" stroke="#fff" stroke-width="16" stroke-linecap="round" fill="none" opacity="0.45"/>`,

  // ── банан ──
  banana: (p) => `
  <defs>
    ${lg(p + 'a', 0, 0, 0, 1, [[0, '#FFF08A'], [0.45, '#FFD93B'], [1, '#E0A800']])}
    ${lg(p + 'b', 0, 0, 0, 1, [[0, '#FFE666'], [1, '#D19A00']])}
  </defs>
  <path d="M215 330 C 200 560 380 760 640 760 C 730 760 800 730 830 690 C 835 670 820 660 800 668 C 740 690 690 690 640 685 C 450 670 300 540 270 330 Z" fill="url(#${p}b)"/>
  <path d="M190 300 C 160 560 360 730 610 700 C 700 690 770 650 800 610 C 805 590 790 580 770 590 C 720 615 660 625 610 620 C 430 600 290 470 260 300 Z" fill="url(#${p}a)"/>
  <path d="M215 330 C 230 470 320 590 460 640" stroke="#fff" stroke-width="12" stroke-linecap="round" fill="none" opacity="0.45"/>
  <path d="M190 300 L 205 250 L 262 262 L 260 300 Z" fill="#6B4A1E"/>
  <path d="M800 610 L 840 600 L 842 618 L 806 632 Z" fill="#3E2A10"/>`,

  // ── кактус у горщику ──
  cactus: (p) => `
  <defs>
    ${lg(p + 'g', 0, 0, 1, 0, [[0, '#4FB06A'], [0.3, '#8BDB86'], [0.5, '#4EAE63'], [1, '#246E3A']])}
    ${lg(p + 'p', 0, 0, 1, 0, [[0, '#E9A3B8'], [0.3, '#FFD1DE'], [1, '#C97890']])}
  </defs>
  <path d="M410 640 L 410 330 C 410 260 450 220 500 220 C 550 220 590 260 590 330 L 590 640 Z" fill="url(#${p}g)"/>
  <path d="M410 520 L 330 520 C 290 520 270 495 270 455 L 270 360 C 270 330 290 312 315 312 C 340 312 360 330 360 360 L 360 450 L 410 450 Z" fill="url(#${p}g)"/>
  <path d="M590 470 L 670 470 C 710 470 730 445 730 405 L 730 300 C 730 270 710 252 685 252 C 660 252 640 270 640 300 L 640 400 L 590 400 Z" fill="url(#${p}g)"/>
  ${[440, 500, 560].map((x) => `<path d="M${x} 250 L ${x} 640" stroke="#1F5E33" stroke-width="5" opacity="0.35"/>`).join('')}
  ${[[455, 300], [530, 360], [470, 430], [545, 500], [460, 560], [300, 380], [700, 330]].map(([x, y]) => `<path d="M${x} ${y} l 14 -10 M${x} ${y} l -14 -10" stroke="#F4F8E8" stroke-width="4" stroke-linecap="round"/>`).join('')}
  <circle cx="500" cy="215" r="34" fill="#FF6F91"/>
  <circle cx="500" cy="215" r="14" fill="#FFD166"/>
  <path d="M340 640 L 660 640 L 630 860 C 628 872 618 878 606 878 L 394 878 C 382 878 372 872 370 860 Z" fill="url(#${p}p)"/>
  <rect x="318" y="610" width="364" height="70" rx="16" fill="url(#${p}p)"/>
  <rect x="345" y="622" width="300" height="12" rx="6" fill="#fff" opacity="0.35"/>`,

  // ── ножиці з кораловими ручками ──
  scissors: (p) => `
  <defs>
    ${lg(p + 'm', 0, 0, 1, 1, [[0, '#F7F6FA'], [0.45, '#B9B6C4'], [1, '#7C7889']])}
    ${lg(p + 'h', 0, 0, 1, 1, [[0, '#FF9A7A'], [1, '#E2452C']])}
  </defs>
  <g transform="rotate(-35 500 500)">
    <path d="M500 520 L 860 470 C 885 467 890 490 868 498 L 520 560 Z" fill="url(#${p}m)"/>
    <path d="M500 480 L 860 530 C 885 533 890 510 868 502 L 520 440 Z" fill="url(#${p}m)"/>
    <path d="M520 470 L 860 512" stroke="#fff" stroke-width="5" opacity="0.7"/>
    <circle cx="500" cy="500" r="20" fill="#5E5A6B"/>
    <path d="M470 470 C 420 430 350 380 290 370 C 200 355 150 420 175 480 C 200 535 280 535 330 500 C 380 470 430 470 470 470 Z" fill="url(#${p}h)"/>
    <path d="M470 530 C 420 570 350 620 290 630 C 200 645 150 580 175 520 C 200 465 280 465 330 500 C 380 530 430 530 470 530 Z" fill="url(#${p}h)"/>
    <ellipse cx="262" cy="432" rx="62" ry="38" fill="#FBF8F2"/>
    <ellipse cx="262" cy="568" rx="62" ry="38" fill="#FBF8F2"/>
  </g>`,
};

// Наліпки колекції (порядок = від найновішої у словнику).
export const COLLECTION = ['mug', 'plant', 'apple', 'headphones', 'sneaker', 'lemon', 'camera', 'backpack', 'umbrella', 'clock', 'book', 'cactus', 'glasses', 'kettle', 'banana', 'scissors'];

// Самотній предмет як SVG-документ (прозоре тло).
export function objectSvg(name, size = 1000) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">${OBJECTS[name](name + '_')}</svg>`;
}

// Той самий предмет «на фото»: м'яка стіна, світла дерев'яна стільниця,
// тінь від дотику, трохи світла з вікна. З цього й вирізається наліпка.
export function objectPhotoSvg(name, size = 1000, base = 850) {
  const p = 'ph_';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1000 1000">
  <defs>
    ${lg(p + 'wall', 0, 0, 0, 1, [[0, '#F3EEE6'], [1, '#E6DED2']])}
    ${lg(p + 'wood', 0, 0, 0, 1, [[0, '#E3C9A3'], [1, '#C9A57A']])}
    ${rg(p + 'light', 0.2, 0.15, 0.9, [[0, '#FFFFFF', 0.7], [1, '#FFFFFF', 0]])}
    ${blur(p + 'sh', 22)}
  </defs>
  <rect width="1000" height="1000" fill="url(#${p}wall)"/>
  <rect y="${Math.min(base - 120, 760)}" width="1000" height="1000" fill="url(#${p}wood)"/>
  ${[740, 800, 880, 950].map((y, i) => `<path d="M0 ${y} C 300 ${y - 8 + i * 3} 700 ${y + 10} 1000 ${y - 4}" stroke="#B88F60" stroke-opacity="0.25" stroke-width="3" fill="none"/>`).join('')}
  <rect width="1000" height="1000" fill="url(#${p}light)"/>
  <ellipse cx="500" cy="${base - 6}" rx="300" ry="34" fill="#5C4630" opacity="0.42" filter="url(#${p}sh)"/>
  ${OBJECTS[name](name + '_')}
  </svg>`;
}
