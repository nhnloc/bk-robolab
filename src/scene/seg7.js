// LED 7 đoạn dùng chung: bảng đoạn, ký tự, định dạng số và vẽ lên canvas (texture bảng LED 3D).
// Toạ độ đoạn trong ô 24×40 (đơn vị tùy ý).
export const SEG = {
  a: [4, 1, 14, 3], b: [18, 4, 3, 14], c: [18, 21.5, 3, 14], d: [4, 36, 14, 3], e: [1, 21.5, 3, 14], f: [1, 4, 3, 14], g: [4, 18.5, 14, 3],
};
export const CHARS = {
  0: 'abcdef', 1: 'bc', 2: 'abdeg', 3: 'abcdg', 4: 'bcfg', 5: 'acdfg', 6: 'acdefg', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg',
  '-': 'g', ' ': '', E: 'adefg', r: 'eg', o: 'cdeg',
};

/** Chuỗi ký tự 7 đoạn (có dấu chấm) căn phải trong n ô. */
export function formatSeg(value, n) {
  let txt;
  if (typeof value === 'number' && Number.isFinite(value)) txt = Number.isInteger(value) ? String(value) : value.toFixed(Math.abs(value) >= 10 ** (n - 1) ? 0 : 1);
  else if (value === null || value === undefined || value === '') txt = '';
  else txt = String(value);
  const cells = [];
  for (const ch of txt) { if (ch === '.' && cells.length) cells[cells.length - 1].dot = true; else cells.push({ ch: ch in CHARS ? ch : ' ', dot: false }); }
  if (cells.length > n) return Array.from({ length: n }, () => ({ ch: '-', dot: false })); // tràn
  while (cells.length < n) cells.unshift({ ch: ' ', dot: false });
  return cells;
}

/** Vẽ n chữ số 7 đoạn đỏ trên nền đen lên context 2D (w×h). Đoạn tắt vẽ mờ như LED thật. */
export function drawSeg(g, w, h, value, n, { on = '#ff3b30', off = '#2c0d0b', bg = '#070707' } = {}) {
  g.fillStyle = bg; g.fillRect(0, 0, w, h);
  const cells = formatSeg(value, n);
  const padX = w * 0.05, padY = h * 0.12;
  const cw = (w - padX * 2) / n;
  const s = Math.min(cw / 26, (h - padY * 2) / 40);
  const ox0 = padX + (cw - 24 * s) / 2, oy = (h - 40 * s) / 2;
  cells.forEach((c, i) => {
    const ox = ox0 + i * cw;
    const lit = CHARS[c.ch] ?? '';
    for (const [k, [x, y, sw, sh]] of Object.entries(SEG)) {
      g.fillStyle = lit.includes(k) ? on : off;
      // nghiêng nhẹ như LED thật
      const skew = (yy) => -(yy - 20) * 0.1 * s;
      g.beginPath();
      const x0 = ox + x * s, y0 = oy + y * s, x1 = x0 + sw * s, y1 = y0 + sh * s;
      g.moveTo(x0 + skew(y), y0); g.lineTo(x1 + skew(y), y0); g.lineTo(x1 + skew(y + sh), y1); g.lineTo(x0 + skew(y + sh), y1); g.closePath(); g.fill();
    }
    g.fillStyle = c.dot ? on : off;
    g.beginPath(); g.arc(ox + 22.5 * s - 1.75 * s, oy + 37.5 * s, 1.7 * s, 0, Math.PI * 2); g.fill();
  });
}
