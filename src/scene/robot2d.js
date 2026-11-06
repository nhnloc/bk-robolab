// Sơ đồ 2D dự phòng (máy không có WebGL): nhìn từ trên (XY) và nhìn ngang (XZ) — robot dạng que, vật, pallet,
// băng tải, mâm xoay, thanh trượt. Cùng giao diện tối thiểu với MachineViewer: setSource, load, setView, applyTheme, dispose.
import * as K from '../robot/kinematics.js';
import { PALETTE, PUCK, CONVEYOR, ROTARY, GANTRY, BIN, slotXY } from '../sim/layout.js';

export class Robot2D {
  constructor(container, { machineId, cell }) {
    this.container = container; this.machineId = machineId; this.cell = cell;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'viewer-canvas';
    container.appendChild(this.canvas);
    this.isPlaceholder = false;
    this._loop = this._loop.bind(this); this._raf = requestAnimationFrame(this._loop);
  }
  setSource(fn) { this.source = fn; }
  async load() {}
  setView() {} applyTheme() {} setButtonHandler() {} highlight() { return 0; }
  dispose() { cancelAnimationFrame(this._raf); this.canvas.remove(); }
  _loop() {
    this._raf = requestAnimationFrame(this._loop);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) { this.canvas.width = Math.round(w * dpr); this.canvas.height = Math.round(h * dpr); this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px'; }
    const g = this.canvas.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.source?.();
    this.draw(g, w, h);
  }
  draw(g, w, h) {
    const dark = document.documentElement.dataset.theme === 'dark';
    const C = { bg: dark ? '#1b2229' : '#eef2f5', grid: dark ? '#2a333c' : '#d7dee5', txt: dark ? '#c9d3dc' : '#38434e', arm: '#e9a800', arm2: dark ? '#dde3ea' : '#4a5866', puck: '#8d99a6', obj: dark ? '#46525e' : '#c3ccd5' };
    g.fillStyle = C.bg; g.fillRect(0, 0, w, h);
    const cell = this.cell, r = cell.robot;
    const frames = []; const T = K.fk(r.q, r.tool, frames);
    const jp = (i) => { const F = i === 0 ? K.ident() : frames[i - 1]; const q = K.JOINTS[i].q; return [F[0] * q[0] + F[1] * q[1] + F[2] * q[2] + F[3], F[4] * q[0] + F[5] * q[1] + F[6] * q[2] + F[7], F[8] * q[0] + F[9] * q[1] + F[10] * q[2] + F[11]]; };
    const fl = K.pos(K.fk(r.q, null));
    const pts = [[0, 0, 0], [0, 0, K.GEOM.baseH], jp(1), jp(2), jp(4), fl, K.pos(T)];
    const half = w / 2 - 12;
    const views = [{ x0: 8, title: 'Nhìn từ trên (X→, Y↑)', ax: (p) => [p[0], p[1]], range: [-400, 500, -420, 380] }, { x0: w / 2 + 4, title: 'Nhìn ngang (X→, Z↑)', ax: (p) => [p[0], p[2]], range: [-400, 500, -40, 420] }];
    for (const v of views) {
      const [x0r, x1r, y0r, y1r] = v.range;
      const s = Math.min(half / (x1r - x0r), (h - 30) / (y1r - y0r));
      const ox = v.x0 + (half - (x1r - x0r) * s) / 2, bottom = 20 + (h - 26) / 2 + ((y1r - y0r) * s) / 2;
      const P = (p) => { const [a, b] = v.ax(p); return [ox + (a - x0r) * s, bottom - (b - y0r) * s]; };
      g.strokeStyle = C.grid; g.lineWidth = 1; g.strokeRect(v.x0, 20, half, h - 26);
      g.fillStyle = C.txt; g.font = '12px system-ui'; g.fillText(v.title, v.x0 + 6, 14);
      const rect = (x0, y0, x1, y1, z0, z1, col) => { g.fillStyle = col; const top = v.ax === views[0].ax; const a = P(top ? [x0, y0, 0] : [x0, 0, z0]), b = P(top ? [x1, y1, 0] : [x1, 0, z1]); g.fillRect(Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])); };
      const top = v === views[0];
      // bàn
      rect(-400, -420, 500, 380, -20, 0, C.grid);
      if (this.machineId === 'motomini') {
        const [cx, cy] = PALETTE.center, [sx, sy] = PALETTE.size;
        rect(cx - sx / 2, cy - sy / 2, cx + sx / 2, cy + sy / 2, 0, PALETTE.top, C.obj);
        if (top) for (const [n, [x, y]] of Object.entries(PALETTE.cells)) { const p = P([x, y, 0]); g.strokeStyle = C.txt; g.beginPath(); g.arc(p[0], p[1], 20 * s, 0, 7); g.stroke(); g.fillStyle = C.txt; g.fillText(n, p[0] + 22 * s, p[1] + 4); }
      } else {
        rect(CONVEYOR.x0, CONVEYOR.y - CONVEYOR.width / 2, CONVEYOR.x1, CONVEYOR.y + CONVEYOR.width / 2, 0, CONVEYOR.top, '#2e7d4f');
        rect(BIN.center[0] - 45, BIN.center[1] - 45, BIN.center[0] + 45, BIN.center[1] + 45, 0, BIN.wall, C.obj);
        const a = cell.mc.axes.A1.phys;
        if (top) {
          const c = P([...ROTARY.center, 0]); g.fillStyle = C.obj; g.beginPath(); g.arc(c[0], c[1], ROTARY.radius * s, 0, 7); g.fill();
          for (let k = 0; k < 4; k++) { const sp = P([...slotXY(k, a), 0]); g.strokeStyle = k === 0 ? '#d32f2f' : C.txt; g.beginPath(); g.arc(sp[0], sp[1], 18 * s, 0, 7); g.stroke(); }
        } else rect(ROTARY.center[0] - ROTARY.radius, 0, ROTARY.center[0] + ROTARY.radius, 0, 0, ROTARY.top, C.obj);
        const gx = GANTRY.x0 + cell.mc.axes.B1.phys, gz = GANTRY.cTop + cell.mc.axes.C1.phys;
        g.strokeStyle = '#1f5fbf'; g.lineWidth = 3;
        if (top) { const a1 = P([GANTRY.x0 + GANTRY.bPhys[0], GANTRY.y, 0]), b1 = P([GANTRY.x0 + GANTRY.bPhys[1], GANTRY.y, 0]); g.beginPath(); g.moveTo(...a1); g.lineTo(...b1); g.stroke(); const c = P([gx, GANTRY.y, 0]); g.fillStyle = cell.mc.io.outputs.DO_05 ? '#d32f2f' : '#1f5fbf'; g.fillRect(c[0] - 6, c[1] - 6, 12, 12); }
        else { const a1 = P([gx, 0, gz]), b1 = P([gx, 0, gz + 160]); g.beginPath(); g.moveTo(...a1); g.lineTo(...b1); g.stroke(); }
      }
      // vật
      for (const it of cell.items) {
        if (it.lost) continue;
        g.fillStyle = it.held ? '#e9a800' : C.puck;
        if (top) { const p = P([it.x, it.y, 0]); g.beginPath(); g.arc(p[0], p[1], (PUCK.d / 2) * s, 0, 7); g.fill(); }
        else rect(it.x - PUCK.d / 2, 0, it.x + PUCK.d / 2, 0, it.z, it.z + PUCK.h, g.fillStyle);
      }
      // robot
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.strokeStyle = C.arm2; g.lineWidth = Math.max(3, 34 * s); g.beginPath(); pts.slice(0, 6).forEach((p, i) => { const q = P(p); if (i) g.lineTo(...q); else g.moveTo(...q); }); g.stroke();
      g.strokeStyle = r.OT[1] ? '#d32f2f' : C.arm; g.lineWidth = Math.max(2, 18 * s); g.beginPath(); g.moveTo(...P(pts[5])); g.lineTo(...P(pts[6])); g.stroke();
      for (const p of pts.slice(1, 6)) { const q = P(p); g.fillStyle = C.arm; g.beginPath(); g.arc(q[0], q[1], Math.max(2.5, 9 * s), 0, 7); g.fill(); }
    }
    const tcp = K.pos(T);
    g.fillStyle = C.txt; g.font = '12px ui-monospace, monospace';
    g.fillText(`TCP X ${tcp[0].toFixed(1)}  Y ${tcp[1].toFixed(1)}  Z ${tcp[2].toFixed(1)} mm   (sơ đồ 2D — máy không có WebGL)`, 12, h - 8);
  }
}
