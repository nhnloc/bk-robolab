// Biểu tượng SVG nội tuyến (vẽ tay, không dùng thư viện ngoài).
import { svg } from '../dom.js';

const P = {
  compile: 'M4 4h10l4 4v12H4z M14 4v4h4 M7 13l2 2 4-4',
  download: 'M12 3v11 M7 10l5 5 5-5 M4 19h16',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  pause: 'M7 5h3v14H7z M14 5h3v14h-3z',
  film: 'M3 5h18v14H3z M7 5v14 M17 5v14 M3 9h4 M3 15h4 M17 9h4 M17 15h4 M10.5 9.5l4 2.5-4 2.5z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  send: 'M3 11l18-8-8 18-2-8z',
  undo: 'M9 14L4 9l5-5 M4 9h10a6 6 0 0 1 0 12h-3',
  redo: 'M15 14l5-5-5-5 M20 9H10a6 6 0 0 0 0 12h3',
  copy: 'M8 8h12v12H8z M4 16V4h12',
  paste: 'M9 4h6v3H9z M7 5H5v15h14V5h-2',
  trash: 'M4 7h16 M9 7V4h6v3 M6 7l1 13h10l1-13',
  plus: 'M12 5v14 M5 12h14',
  up: 'M12 19V5 M6 11l6-6 6 6',
  down: 'M12 5v14 M6 13l6 6 6-6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z M12 2v2 M12 20v2 M2 12h2 M20 12h2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  logout: 'M15 4h4v16h-4 M10 8l-4 4 4 4 M6 12h10',
  folder: 'M3 6h6l2 2h10v11H3z',
  block: 'M4 4h16v16H4z M4 9h16',
  table: 'M3 5h18v14H3z M3 10h18 M3 14h18 M9 5v14',
  watch: 'M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M12 9v3l2 2 M9 2h6 M9 22h6',
  cpu: 'M7 7h10v10H7z M10 2v5 M14 2v5 M10 17v5 M14 17v5 M2 10h5 M2 14h5 M17 10h5 M17 14h5',
  chevronR: 'M9 5l7 7-7 7',
  chevronL: 'M15 5l-7 7 7 7',
  chevronD: 'M5 9l7 7 7-7',
  close: 'M6 6l12 12 M18 6L6 18',
  reset: 'M4 12a8 8 0 1 0 3-6.2 M4 4v5h5',
  book: 'M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4z M20 4h-4a3 3 0 0 0-3 3',
  maximize: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  check: 'M5 12l5 5 9-10',
  lock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 8 0v3',
  unlock: 'M6 11h12v9H6z M8 11V8a4 4 0 0 1 7.5-2',
  warn: 'M12 3l10 18H2z M12 10v5 M12 18v.5',
  info: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M12 11v6 M12 7.5v.5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  csv: 'M4 3h11l5 5v13H4z M8 13h8 M8 17h8 M8 9h4',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 21a8 8 0 0 1 16 0',
  cube: 'M12 2l9 5v10l-9 5-9-5V7z M3 7l9 5 9-5 M12 12v10',
  panel: 'M3 4h18v16H3z M3 9h18',
  split: 'M3 4h18v16H3z M12 4v16',
  branch: 'M6 4v16 M6 8h6v8H6 M12 12h6',
  save: 'M5 4h11l3 3v13H5z M8 4v5h7V4 M8 14h8v6H8z',
  fault: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z M8 8l8 8 M16 8l-8 8',
  search: 'M10 4a6 6 0 1 0 0 12 6 6 0 0 0 0-12z M15 15l5 5',
};

/** icon('play', {size:16}) → <svg> */
export function icon(name, { size = 16, title, cls } = {}) {
  const d = P[name] || P.info;
  const el = svg('svg', { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': title ? null : 'true', class: cls || 'ico' },
    title ? svg('title', null, title) : null,
    svg('path', { d }));
  return el;
}

/** Biểu tượng LAD nhỏ cho palette/toolbar: '-| |-', '-|/|-', '-( )-'... */
export function ladIcon(kind, size = 22) {
  const s = svg('svg', { viewBox: '0 0 32 20', width: size * 1.6, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 1.6, 'aria-hidden': 'true', class: 'lad-ico' });
  const add = (tag, a) => s.appendChild(svg(tag, a));
  const contact = (inner) => {
    add('path', { d: 'M0 10h11 M11 4v12 M21 4v12 M21 10h11' });
    if (inner) add('text', { x: 16, y: 13.5, 'font-size': 9, 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-family': 'monospace', 'font-weight': 700 }).textContent = inner;
  };
  const coil = (inner) => {
    add('path', { d: 'M0 10h10 M13 3q-4 7 0 14 M19 3q4 7 0 14 M22 10h10' });
    if (inner) add('text', { x: 16, y: 13.5, 'font-size': 8, 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-family': 'monospace', 'font-weight': 700 }).textContent = inner;
  };
  const box = (label) => {
    add('rect', { x: 6, y: 2, width: 20, height: 16, rx: 1.5 });
    add('path', { d: 'M0 7h6 M26 7h6' });
    add('text', { x: 16, y: 12.5, 'font-size': label.length > 3 ? 5.5 : 7, 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-family': 'monospace', 'font-weight': 700 }).textContent = label;
  };
  switch (kind) {
    case 'NO': contact(''); break;
    case 'NC': contact('/'); break;
    case 'P': contact('P'); break;
    case 'N': contact('N'); break;
    case 'NOT': add('path', { d: 'M0 10h10 M22 10h10' }); add('rect', { x: 10, y: 5, width: 12, height: 10 }); add('text', { x: 16, y: 12.5, 'font-size': 5.5, 'text-anchor': 'middle', fill: 'currentColor', stroke: 'none', 'font-family': 'monospace' }).textContent = 'NOT'; break;
    case '=': coil(''); break;
    case '/': case 'S': case 'R': coil(kind); break;
    case 'coilP': coil('P'); break;
    case 'coilN': coil('N'); break;
    case 'branch': add('path', { d: 'M2 4h28 M8 4v12h16V4' }); break;
    case 'addbranch': add('path', { d: 'M2 3h28 M8 3v7h16V3 M8 10v7h16v-7' }); break;
    case 'cmp': box('CMP'); break;
    default: box(String(kind).slice(0, 6)); break;
  }
  return s;
}
