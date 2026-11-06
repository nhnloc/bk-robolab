// Dự phòng khi máy không có WebGL: sơ đồ nhìn từ trên (canvas 2D) — vật liệu, vị trí cơ cấu, LED cảm biến.
import { loadManifest } from './viewer.js';
import { PLACEHOLDER, NODE_DEFS } from './nodes.js';
import { t } from '../app/i18n.js';
import { trText } from '../app/loc.js';
import { nodesForTag } from './ioNodes.js';

export class Fallback2D {
  constructor(container, { machineId } = {}) {
    this.container = container; this.machineId = machineId; this.source = null; this.isPlaceholder = false; this.disposed = false;
    this.canvas = document.createElement('canvas'); this.canvas.className = 'viewer-canvas';
    this.canvas.setAttribute('role', 'img'); this.canvas.setAttribute('aria-label', t('mv.aria2d'));
    container.appendChild(this.canvas);
    this.box = [[-100, -700], [1600, 900]];
    this._loop = this._loop.bind(this); this._raf = requestAnimationFrame(this._loop);
  }
  async load() {
    const mf = await loadManifest();
    const b = mf?.machines?.[this.machineId]?.bboxFC;
    this.nodes = mf?.machines?.[this.machineId]?.nodes || null;
    if (b) this.box = [[b[0][0], b[0][1]], [b[1][0], b[1][1]]];
    else if (PLACEHOLDER[this.machineId]?.length) {
      const bs = PLACEHOLDER[this.machineId].filter((p) => p.b).map((p) => p.b);
      this.box = [[Math.min(...bs.map((q) => Math.min(q[0], q[3]))), Math.min(...bs.map((q) => Math.min(q[1], q[4])))], [Math.max(...bs.map((q) => Math.max(q[0], q[3]))), Math.max(...bs.map((q) => Math.max(q[1], q[4])))]];
    }
  }
  setSource(fn) { this.source = fn; }
  /** Chỉ vị trí tag trên sơ đồ 2D: khoanh LED/đèn/cơ cấu tương ứng. Trả về số mục tìm thấy. */
  highlight(tag, label = '') {
    this.hl = null;
    if (!tag) return 0;
    const v = this.source?.() || {};
    const keys = new Set([...Object.keys(v.parts || {}), ...(PLACEHOLDER[this.machineId] || []).map((p) => p.node).filter(Boolean)]);
    const has = Object.assign((n) => keys.has(n), { names: () => [...keys] });
    const nodes = new Set(nodesForTag(this.machineId, tag, has));
    const n = nodes.size + (tag in (v.leds || {}) ? 1 : 0) + (tag in (v.outs || {}) ? 1 : 0);
    if (n) this.hl = { tag, nodes, label: label || tag };
    return n;
  }
  _ring(g, x, y, r) {
    const a = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    g.save(); g.strokeStyle = `rgba(255,176,32,${a.toFixed(2)})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.stroke(); g.restore();
  }
  _hlRect(g, x, y, w, h) {
    const a = 0.55 + 0.45 * Math.sin(performance.now() / 160);
    g.save(); g.strokeStyle = `rgba(255,176,32,${a.toFixed(2)})`; g.lineWidth = 3; g.strokeRect(x - 3, y - 3, w + 6, h + 6); g.restore();
  }
  setView() {}
  applyTheme() {}
  _loop() {
    if (this.disposed) return;
    this._raf = requestAnimationFrame(this._loop);
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    const c = this.canvas; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    const v = this.source?.() || {};
    const g = c.getContext('2d');
    const dark = document.documentElement.dataset.theme === 'dark';
    g.fillStyle = dark ? '#1b2229' : '#e4e9ee'; g.fillRect(0, 0, w, h);
    // khung nhìn
    let [[x0, y0], [x1, y1]] = this.box;
    for (const it of v.items || []) { x0 = Math.min(x0, it.x - 200); x1 = Math.max(x1, it.x + 200); y0 = Math.min(y0, it.y - 200); y1 = Math.max(y1, it.y + 200); }
    const pad = 30, top = 70;
    const s = Math.min((w - 2 * pad) / (x1 - x0), (h - top - 150) / (y1 - y0));
    const X = (x) => pad + (x - x0) * s, Y = (y) => top + (y1 - y) * s;
    g.strokeStyle = dark ? '#3a4652' : '#c3cbd3'; g.lineWidth = 1;
    for (let gx = Math.ceil(x0 / 500) * 500; gx < x1; gx += 500) { g.beginPath(); g.moveTo(X(gx), Y(y0)); g.lineTo(X(gx), Y(y1)); g.stroke(); }
    g.fillStyle = dark ? '#9aa8b5' : '#5b6876'; g.font = '12px system-ui';
    g.fillText(t('mv.no3d'), 10, 18);
    // khối máy (placeholder, nhìn từ trên; node tịnh tiến theo parts)
    const defs = { ...(NODE_DEFS[this.machineId] || {}), ...(this.nodes || {}) };
    const spec = [...(PLACEHOLDER[this.machineId] || [])].filter((p) => p.b).sort((a, b) => Math.max(a.b[2], a.b[5]) - Math.max(b.b[2], b.b[5]));
    for (const p of spec) {
      let [ax, ay, , bx, by] = p.b;
      const d = p.node && defs[p.node];
      if (p.node && v.parts && (p.node + '_visible') in v.parts && !v.parts[p.node + '_visible']) continue;
      if (d?.type === 'translate' && d.axisFC) { const k = (+v.parts?.[p.node] || 0) * (+d.travel || 0); ax += d.axisFC[0] * k; bx += d.axisFC[0] * k; ay += d.axisFC[1] * k; by += d.axisFC[1] * k; }
      g.globalAlpha = /^glass/.test(p.name || '') ? 0.15 : 0.55; g.fillStyle = p.c || '#9aa3ad';
      g.fillRect(X(Math.min(ax, bx)), Y(Math.max(ay, by)), Math.abs(bx - ax) * s, Math.abs(by - ay) * s);
      g.globalAlpha = 1;
      if (this.hl?.nodes.has(p.node)) this._hlRect(g, X(Math.min(ax, bx)), Y(Math.max(ay, by)), Math.abs(bx - ax) * s, Math.abs(by - ay) * s);
    }
    for (const it of v.items || []) {
      const [l, wd] = it.size || [100, 100];
      g.save(); g.translate(X(it.x), Y(it.y)); g.rotate(-((it.rotZ || 0) * Math.PI) / 180);
      g.fillStyle = it.color || (it.kind === 'carton' ? '#c8a273' : '#b98b55');
      if (it.kind === 'puck' || it.kind === 'part' || it.shape === 'can') { g.beginPath(); g.arc(0, 0, (l / 2) * s, 0, Math.PI * 2); g.fill(); }
      else { g.fillRect((-l / 2) * s, (-wd / 2) * s, l * s, wd * s); g.strokeStyle = '#0006'; g.strokeRect((-l / 2) * s, (-wd / 2) * s, l * s, wd * s); }
      if (it.label) { g.fillStyle = '#fff'; g.fillText(String(it.label), -4, 4); }
      g.restore();
    }
    // cơ cấu + LED
    const parts = Object.entries(v.parts || {}).filter(([k]) => !/^belt|^rollers|^btn_|_visible$/.test(k));
    let px = 10; const py = h - 125;
    g.font = '11px ui-monospace, monospace';
    for (const [k, val] of parts) {
      g.fillStyle = dark ? '#dbe3ea' : '#1c2631'; g.fillText(k, px, py);
      g.fillStyle = dark ? '#33404c' : '#cfd5db'; g.fillRect(px, py + 4, 90, 8);
      g.fillStyle = '#00708c'; g.fillRect(px, py + 4, 90 * Math.max(0, Math.min(1, +val || 0)), 8);
      if (this.hl?.nodes.has(k)) this._hlRect(g, px, py - 10, 90, 22);
      px += 110; if (px > w - 100) break;
    }
    let lx = 10; const ly = h - 75;
    for (const [tag, on] of Object.entries(v.leds || {})) {
      g.beginPath(); g.arc(lx + 6, ly, 6, 0, Math.PI * 2); g.fillStyle = on ? '#2fd15a' : (dark ? '#3a424b' : '#9aa3ad'); g.fill();
      g.fillStyle = dark ? '#dbe3ea' : '#1c2631'; g.fillText(tag, lx + 15, ly + 4);
      if (this.hl?.tag === tag) this._ring(g, lx + 6, ly, 10);
      lx += 24 + g.measureText(tag).width; if (lx > w - 60) break;
    }
    // đèn/thiết bị đầu ra (getVisual().outs)
    let ox = 10; const oy = h - 32;
    const OUTC = { H1: '#ff3b30', H2: '#ffd400', H3: '#2fd15a', H4: '#2a86ff', BUZ: '#ff3b30', H_Run: '#2fd15a', H_Fault: '#ff3b30' };
    for (const [tag, on] of Object.entries(v.outs || {})) {
      const c = OUTC[tag] || '#ff9f1a';
      g.beginPath(); g.arc(ox + 8, oy, 8, 0, Math.PI * 2);
      g.fillStyle = on ? c : (dark ? '#2a3038' : '#8d969f'); g.fill();
      if (on) { g.strokeStyle = c; g.lineWidth = 3; g.globalAlpha = 0.35; g.beginPath(); g.arc(ox + 8, oy, 12, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; g.lineWidth = 1; }
      g.fillStyle = dark ? '#dbe3ea' : '#1c2631'; g.fillText(tag, ox + 20, oy + 4);
      if (this.hl?.tag === tag) this._ring(g, ox + 8, oy, 13);
      ox += 32 + g.measureText(tag).width; if (ox > w - 60) break;
    }
    // bảng LED (displays)
    let dx = w - 10;
    g.textAlign = 'right';
    for (const d of [...(v.displays || [])].reverse()) {
      const txt = `${d.value ?? ''}`;
      g.font = 'bold 20px ui-monospace, monospace'; const tw = Math.max(g.measureText('8'.repeat(d.digits || 4)).width, g.measureText(txt).width) + 16;
      g.fillStyle = '#0b0b0b'; g.fillRect(dx - tw, 28, tw, 32);
      g.fillStyle = '#ff3b30'; g.fillText(txt, dx - 8, 51);
      g.font = '11px system-ui'; g.fillStyle = dark ? '#dbe3ea' : '#1c2631'; g.fillText(`${trText(d.label) || d.id}${d.unit ? ' (' + trText(d.unit) + ')' : ''}`, dx, 72);
      dx -= tw + 14; if (dx < 120) break;
    }
    g.textAlign = 'left';
    this.drawEffects(g, w, h, v.effects);
  }
  /** Sự cố trên sơ đồ 2D: chớp viền đỏ + ⚡ khi ngắn mạch, chấm cam khi có tia lửa/khói. */
  drawEffects(g, w, h, effects = []) {
    let flash = 0, bolt = false, spark = false, heat = 0;
    for (const e of effects) {
      if (e.type === 'impact') flash = Math.max(flash, 1 - e.age);
      if (e.type === 'breaker') { flash = Math.max(flash, (1 - e.age) * 0.8); bolt ||= e.age < 0.6; }
      if ((e.type === 'spark' || e.type === 'smoke' || e.type === 'steam') && e.age < 1) spark = true;
      if (e.type === 'heat') heat = Math.max(heat, e.intensity || 0);
    }
    const t = performance.now() / 1000;
    if (flash > 0) {
      const a = (0.55 + 0.45 * Math.sin(t * 18)) * flash * 0.6;
      const grd = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      grd.addColorStop(0, 'rgba(255,40,20,0)'); grd.addColorStop(1, `rgba(255,40,20,${a.toFixed(3)})`);
      g.fillStyle = grd; g.fillRect(0, 0, w, h);
    }
    if (bolt) { g.font = '36px system-ui'; g.textAlign = 'center'; g.fillText('⚡', w / 2, 44); }
    if (spark) { g.fillStyle = `rgba(255,170,40,${(0.5 + 0.5 * Math.sin(t * 25)).toFixed(2)})`; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(w - 40 + Math.cos(i + t * 9) * 14, 40 + Math.sin(i * 1.7 + t * 11) * 14, 2.5, 0, 7); g.fill(); } }
    if (heat > 0) { g.fillStyle = `rgba(255,60,0,${(0.12 * heat).toFixed(3)})`; g.fillRect(0, 0, w, h); }
  }
  dispose() { this.disposed = true; cancelAnimationFrame(this._raf); this.canvas.remove(); }
}
