// SHIM phát triển: PlcRuntime + máy + LABS giả lập theo đúng API CONTRACT §4.
// Chỉ dùng khi src/plc, src/sim, src/labs chưa nạp được (xem src/app/engine.js).
// PLC giả có trình thông dịch LAD tối giản (tiếp điểm, coil, timer, counter, so sánh, MOVE, toán) để thử UI thật sự.
import { FAKE_DEFS } from './fakeDefs.js';
import { P1_MACHINES, gradeTrainerShim } from './fakeP1.js';

/* =========================== Tiện ích giá trị =========================== */

function parseTime(s) {
  const m = /^T#(.+)$/i.exec(s.trim()); if (!m) return null;
  let ms = 0; const re = /(\d+(?:\.\d+)?)(ms|d|h|m|s)/gi; let x; let any = false;
  while ((x = re.exec(m[1].replace(/_/g, '')))) { any = true; const v = parseFloat(x[1]); ms += v * ({ ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[x[2].toLowerCase()]); }
  return any ? ms : null;
}
function parseConst(s) {
  const t = s.trim();
  if (/^TRUE$/i.test(t)) return true;
  if (/^FALSE$/i.test(t)) return false;
  if (/^T#/i.test(t)) return parseTime(t);
  if (/^16#[0-9a-f_]+$/i.test(t)) return parseInt(t.slice(3).replace(/_/g, ''), 16);
  if (/^2#[01_]+$/i.test(t)) return parseInt(t.slice(2).replace(/_/g, ''), 2);
  if (/^[-+]?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(t)) return Number(t);
  return undefined;
}
export const ADDR_RE = /^%(?:[IQM]\d+\.[0-7]|[IQM][BWD]\d+)$/i;

/* =========================== PLC giả =========================== */

export class PlcRuntime {
  constructor(project, opts = {}) {
    this.project = project; this.opts = opts;
    this.state = 'STOP'; this.scanTimeMs = 0; this.cycle = 0;
    this._l = {}; this.mem = new Map(); this.forces = new Map(); this.inst = new Map(); this.edge = new Map();
    this.flows = {}; this.loaded = null; this.m = null; this._timer = 0; this._last = 0;
    if (!opts.headless) this._timer = setInterval(() => this._loop(), 10);
  }
  on(ev, cb) { (this._l[ev] ||= new Set()).add(cb); return () => this._l[ev].delete(cb); }
  off(ev, cb) { this._l[ev]?.delete(cb); }
  _emit(ev, d) { for (const cb of this._l[ev] || []) { try { cb(d); } catch (e) { console.warn(e); } } }
  attach(m) { this.m = m; }
  dispose() { clearInterval(this._timer); this._timer = 0; this.state = 'STOP'; }

  /* ---------- toán hạng ---------- */
  _tags() { const map = new Map(); for (const t of (this.loaded || this.project)?.tags || []) map.set(t.name, t); return map; }
  _key(op) {
    const s = String(op ?? '').trim();
    if (!s) return { err: 'Thiếu toán hạng' };
    const c = parseConst(s); if (c !== undefined && c !== null) return { c };
    let m = /^"([^"]+)"(?:\.(.+))?$/.exec(s);
    if (m) {
      if (m[2]) return { k: m[1] + '.' + m[2] };
      const tag = this._tags().get(m[1]);
      if (tag) return { k: tag.address.toUpperCase(), type: tag.type };
      return { err: `Tag "${m[1]}" không tồn tại`, k: m[1] };
    }
    if (ADDR_RE.test(s)) return { k: s.toUpperCase(), type: /\.\d$/.test(s) ? 'Bool' : 'Int' };
    m = /^DB(\d+)\.(.+)$/i.exec(s);
    if (m) { const db = ((this.loaded || this.project)?.blocks || []).find((b) => b.type === 'DB' && +b.number === +m[1]); return { k: (db ? db.name : 'DB' + m[1]) + '.' + m[2] }; }
    if (/^#/.test(s)) return { k: s };
    m = /^([A-Za-z_]\w*)\.(.+)$/.exec(s); if (m) return { k: m[1] + '.' + m[2] };
    return { err: 'Toán hạng không hợp lệ: ' + s };
  }
  read(op) {
    const r = this._key(op);
    if ('c' in r) return r.c;
    if (!r.k) return undefined;
    if (this.forces.has(r.k)) return this.forces.get(r.k);
    if (this.mem.has(r.k)) return this.mem.get(r.k);
    const t = r.type || this._dbType(r.k);
    return t === 'Bool' ? false : t ? 0 : /\.\d$/.test(r.k) || /\.(Q|QU|QD|IN)$/i.test(r.k) ? false : 0;
  }
  _dbType(k) {
    const [db, f] = k.split('.');
    const b = ((this.loaded || this.project)?.blocks || []).find((x) => x.type === 'DB' && x.name === db);
    return b?.fields?.find((x) => x.name === f)?.type || null;
  }
  write(op, v) { const r = this._key(op); if (r.k) this.mem.set(r.k, v); }
  force(op, v) { const r = this._key(op); if (r.k) this.forces.set(r.k, v); }
  unforce(op) { const r = this._key(op); if (r.k) this.forces.delete(r.k); }
  _rd(op) { const v = this.read(op); return typeof v === 'boolean' ? v : v; }

  /* ---------- biên dịch (kiểm tra cấu trúc) ---------- */
  compile(project = this.project) {
    const errors = [];
    const save = this.loaded; this.loaded = project;
    const tagNames = new Set();
    for (const t of project.tags || []) {
      if (!t.name) errors.push({ block: 'PLC tags', message: 'Tag thiếu tên' });
      else if (tagNames.has(t.name)) errors.push({ block: 'PLC tags', message: `Tên tag trùng: "${t.name}"` });
      tagNames.add(t.name);
      if (!ADDR_RE.test(String(t.address || ''))) errors.push({ block: 'PLC tags', message: `Địa chỉ không hợp lệ cho "${t.name}": ${t.address}` });
    }
    const known = new Set([...(project.blocks || []).map((b) => b.name)]);
    const checkOp = (op, block, network, what) => {
      if (op === undefined || op === null || String(op).trim() === '') { errors.push({ block, network, message: `${what}: thiếu toán hạng` }); return; }
      const r = this._key(op);
      if (r.err && !(r.k && known.has(r.k))) errors.push({ block, network, message: `${what}: ${r.err}` });
    };
    const walk = (n, block, ni) => {
      if (!n) return;
      if (n.t === 'series') n.items.forEach((x) => walk(x, block, ni));
      else if (n.t === 'parallel') n.branches.forEach((x) => walk(x, block, ni));
      else if (n.t === 'contact') { if (n.kind !== 'NOT') checkOp(n.op, block, ni, 'Tiếp điểm'); }
      else if (n.t === 'coil') checkOp(n.op, block, ni, 'Cuộn dây');
      else if (n.t === 'cmp') { checkOp(n.in1, block, ni, 'So sánh IN1'); checkOp(n.in2, block, ni, 'So sánh IN2'); }
      else if (n.t === 'box') {
        const p = n.params || {};
        if (/^T(ON|OF|P|ONR)$/.test(n.fn) && !p.PT) errors.push({ block, network: ni, message: `${n.fn}: thiếu PT` });
        if (/^CT/.test(n.fn) && !p.PV) errors.push({ block, network: ni, message: `${n.fn}: thiếu PV` });
        if (/^(TON|TOF|TP|TONR|CTU|CTD|CTUD)$/.test(n.fn) && !n.instance) errors.push({ block, network: ni, message: `${n.fn}: cần instance DB` });
        if (n.fn === 'CALL' && !known.has(String(n.block || '').replace(/"/g, ''))) errors.push({ block, network: ni, message: `Không tìm thấy khối "${n.block}"` });
      }
    };
    for (const b of project.blocks || []) {
      if (b.lang === 'LAD') (b.networks || []).forEach((nw, i) => walk(nw.rung, b.name, i));
      if (b.lang === 'SCL') {
        const src = String(b.source || '');
        const cnt = (re) => (src.match(re) || []).length;
        if (cnt(/\bIF\b/gi) !== cnt(/\bEND_IF\b/gi)) errors.push({ block: b.name, line: 1, message: 'IF/END_IF không cân bằng' });
      }
    }
    if (!(project.blocks || []).some((b) => b.type === 'OB')) errors.push({ block: '—', message: 'Thiếu OB1 (Main)' });
    this.loaded = save;
    return { ok: errors.length === 0, errors };
  }
  load(project = this.project) {
    const res = this.compile(project);
    if (res.ok) { this.project = project; this.loaded = JSON.parse(JSON.stringify(project)); this.inst.clear(); this.edge.clear(); }
    else res.errors.forEach((e) => this._emit('error', e));
    return res;
  }
  start() { if (!this.loaded) { const r = this.load(this.project); if (!r.ok) return false; } this.state = 'RUN'; this._last = performance.now(); return true; }
  stop() { this.state = 'STOP'; if (this.m) this.m.outputs = {}; }
  getPowerFlow(block, i) { return this.flows[block]?.[i] || {}; }

  /* ---------- vòng quét ---------- */
  _loop() {
    const now = performance.now(); const dt = Math.min(50, this._last ? now - this._last : 10); this._last = now;
    this._tick(dt);
  }
  _tick(dt) {
    if (this.m) this.m._step?.(dt);
    if (this.state !== 'RUN') return;
    const t0 = performance.now();
    if (this.m) for (const [a, v] of Object.entries(this.m.inputs || {})) this.mem.set(a, v);
    try { this._execAll(dt); } catch (e) { this._emit('error', { block: 'Main', message: String(e.message || e) }); this.stop(); return; }
    if (this.m) {
      const out = {};
      for (const [k, v] of this.mem) if (k.startsWith('%Q')) out[k] = v;
      for (const [k, v] of this.forces) if (k.startsWith('%Q')) out[k] = v;
      this.m.outputs = out;
    }
    this.cycle++;
    this.scanTimeMs = 0.4 + (performance.now() - t0) + Math.random() * 0.15;
    this._emit('scan', { scanTimeMs: this.scanTimeMs, cycle: this.cycle });
  }
  _execAll(dt) {
    const p = this.loaded; if (!p) return;
    for (const b of p.blocks || []) {
      if (b.type !== 'OB' || b.lang !== 'LAD') continue;
      const fl = (this.flows[b.name] = []);
      (b.networks || []).forEach((nw, i) => { const f = {}; if (nw.rung) this._eval(nw.rung, '', true, f, dt, b.name + ':' + i); fl[i] = f; });
    }
  }
  _eval(n, path, pin, f, dt, key) {
    const sub = (i) => (path === '' ? String(i) : path + '.' + i);
    const val = (op) => { const v = this.read(op); return typeof v === 'boolean' ? v : !!v; };
    const num = (op) => { const v = this.read(op); return typeof v === 'number' ? v : v ? 1 : 0; };
    let out = false;
    switch (n.t) {
      case 'series': { let p = pin; n.items.forEach((x, i) => { p = this._eval(x, sub(i), p, f, dt, key); }); out = p; break; }
      case 'parallel': { let o = false; n.branches.forEach((x, i) => { o = this._eval(x, sub(i), pin, f, dt, key) || o; }); out = o; break; }
      case 'contact': {
        if (n.kind === 'NOT') { out = !pin; break; }
        const v = val(n.op);
        if (n.kind === 'NO') out = pin && v;
        else if (n.kind === 'NC') out = pin && !v;
        else { const ek = n.mem || key + path; const prev = this.edge.get(ek) ?? v; this.edge.set(ek, v); out = pin && (n.kind === 'P' ? v && !prev : !v && prev); }
        break;
      }
      case 'coil': {
        if (n.kind === '=') this.write(n.op, pin);
        else if (n.kind === '/') this.write(n.op, !pin);
        else if (n.kind === 'S') { if (pin) this.write(n.op, true); }
        else if (n.kind === 'R') { if (pin) this.write(n.op, false); }
        else { const ek = key + path; const prev = this.edge.get(ek) ?? pin; this.edge.set(ek, pin); this.write(n.op, n.kind === 'P' ? pin && !prev : !pin && prev); }
        out = pin; break;
      }
      case 'cmp': {
        const a = num(n.in1), b = num(n.in2);
        const r = { '==': a === b, '<>': a !== b, '>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b }[n.op];
        out = pin && !!r; break;
      }
      case 'box': out = this._box(n, path, pin, dt, key); break;
      default: out = pin;
    }
    f[path] = out;
    return out;
  }
  _box(n, path, pin, dt, key) {
    const p = n.params || {};
    const ik = n.instance ? String(n.instance).replace(/"/g, '') : key + '/' + path;
    let s = this.inst.get(ik); if (!s) { s = { et: 0, q: false, prevIn: false, cv: 0, prevCd: false }; this.inst.set(ik, s); }
    const num = (op) => { const v = this.read(op); return typeof v === 'number' ? v : v ? 1 : 0; };
    const bool = (op) => !!this.read(op);
    const setOut = (pin2, v) => { if (p[pin2]) this.write(p[pin2], v); this.mem.set(ik + '.' + pin2, v); };
    const fn = n.fn;
    if (fn === 'TON' || fn === 'TOF' || fn === 'TP' || fn === 'TONR') {
      const pt = num(p.PT);
      if (fn === 'TON') { if (pin) s.et = Math.min(pt, s.et + dt); else s.et = 0; s.q = pin && s.et >= pt; }
      if (fn === 'TONR') { if (p.R && bool(p.R)) s.et = 0; else if (pin) s.et = Math.min(pt, s.et + dt); s.q = s.et >= pt; }
      if (fn === 'TOF') { if (pin) { s.q = true; s.et = 0; } else if (s.q) { s.et = Math.min(pt, s.et + dt); if (s.et >= pt) s.q = false; } }
      if (fn === 'TP') { if (pin && !s.prevIn && !s.q) { s.q = true; s.et = 0; } if (s.q) { s.et += dt; if (s.et >= pt) { s.q = false; s.et = pt; } } else if (!pin) s.et = 0; }
      s.prevIn = pin; setOut('Q', s.q); setOut('ET', Math.round(s.et));
      return s.q;
    }
    if (fn === 'CTU' || fn === 'CTD' || fn === 'CTUD') {
      const pv = num(p.PV);
      if (fn === 'CTU') { if (pin && !s.prevIn) s.cv++; if (p.R && bool(p.R)) s.cv = 0; s.q = s.cv >= pv; }
      if (fn === 'CTD') { if (pin && !s.prevIn) s.cv--; if (p.LD && bool(p.LD)) s.cv = pv; s.q = s.cv <= 0; }
      if (fn === 'CTUD') { const cd = p.CD ? bool(p.CD) : false; if (pin && !s.prevIn) s.cv++; if (cd && !s.prevCd) s.cv--; s.prevCd = cd; if (p.R && bool(p.R)) s.cv = 0; if (p.LD && bool(p.LD)) s.cv = pv; setOut('QU', s.cv >= pv); setOut('QD', s.cv <= 0); s.q = s.cv >= pv; }
      s.prevIn = pin; if (fn !== 'CTUD') setOut('Q', s.q); setOut('CV', s.cv);
      return s.q;
    }
    if (fn === 'R_TRIG' || fn === 'F_TRIG') { const q = fn === 'R_TRIG' ? pin && !s.prevIn : !pin && s.prevIn; s.prevIn = pin; setOut('Q', q); return q; }
    if (fn === 'SR' || fn === 'RS') {
      const bit = n.instance || p.OPERAND; let q = bit ? bool(bit) : s.q;
      const other = bool(fn === 'SR' ? p.R1 : p.S1);
      if (fn === 'SR') { if (pin) q = true; if (other) q = false; } else { if (pin) q = false; if (other) q = true; }
      s.q = q; if (bit) this.write(bit, q); if (p.Q) this.write(p.Q, q); return q;
    }
    if (!pin) return false;
    const ops = { ADD: (a, b) => a + b, SUB: (a, b) => a - b, MUL: (a, b) => a * b, DIV: (a, b) => (b ? Math.trunc(a / b) : 0), MOD: (a, b) => (b ? a % b : 0) };
    if (ops[fn]) { if (p.OUT) this.write(p.OUT, ops[fn](num(p.IN1), num(p.IN2))); return true; }
    if (fn === 'MOVE') { const v = this.read(p.IN); for (const k of Object.keys(p)) if (/^OUT\d*$/.test(k) && p[k]) this.write(p[k], v); return true; }
    if (fn === 'SHL' || fn === 'SHR') { if (p.OUT) this.write(p.OUT, fn === 'SHL' ? (num(p.IN) << num(p.N)) & 0xffff : num(p.IN) >>> num(p.N)); return true; }
    if (fn === 'INC' || fn === 'DEC') { if (p.IN_OUT) this.write(p.IN_OUT, num(p.IN_OUT) + (fn === 'INC' ? 1 : -1)); return true; }
    if (fn === 'NORM_X') { const mn = num(p.MIN), mx = num(p.MAX); if (p.OUT) this.write(p.OUT, mx === mn ? 0 : (num(p.VALUE) - mn) / (mx - mn)); return true; }
    if (fn === 'SCALE_X') { const mn = num(p.MIN), mx = num(p.MAX); if (p.OUT) this.write(p.OUT, num(p.VALUE) * (mx - mn) + mn); return true; }
    if (fn === 'LIMIT') { if (p.OUT) this.write(p.OUT, Math.max(num(p.MN), Math.min(num(p.MX), num(p.IN)))); return true; }
    return true;
  }
}

/* =========================== Máy giả =========================== */

class FakeMachine {
  constructor(id) {
    const d = FAKE_DEFS[id] || FAKE_DEFS.feeder;
    this.id = id; this._d = d;
    const cyls = [];
    for (const o of d.outputs) {
      const m = /^(\d)Y1$/.exec(o.tag); if (!m) continue;
      const n = m[1]; const y2 = d.outputs.find((x) => x.tag === n + 'Y2');
      cyls.push({ n, y1: o.addr, y2: y2?.addr, pos: 0, part: d.parts.filter((p) => new RegExp(`_${n}A(_|$)`).test(p)) });
    }
    this._cyl = cyls;
    const faults = [];
    for (const c of cyls) {
      faults.push({ id: `${c.n}A_stuck`, label: `Xi lanh ${c.n}A bị kẹt` });
      if (d.inputs.some((x) => x.tag === c.n + 'B2')) faults.push({ id: `${c.n}B2_lost`, label: `Mất tín hiệu cảm biến ${c.n}B2` });
    }
    faults.push({ id: 'air_low', label: 'Tụt áp khí nén (xi lanh chạy chậm)' });
    for (const s of Object.keys(d.flow?.sensors || {})) faults.push({ id: `${s}_dead`, label: `Cảm biến ${s} hỏng (luôn 0)` });
    this.def = {
      id, title: d.title,
      ioMap: { inputs: d.inputs, outputs: d.outputs },
      parts: Object.fromEntries(d.parts.map((p) => [p, {}])),
      buttons: [
        { id: 'Start', addr: '%I0.0', kind: 'momentary', color: 'green' }, { id: 'Stop', addr: '%I0.1', kind: 'momentary', color: 'red', nc: true },
        { id: 'Reset', addr: '%I0.2', kind: 'momentary', color: 'blue' }, { id: 'EStop', addr: '%I0.3', kind: 'latching', nc: true }, { id: 'AutoMan', addr: '%I0.4', kind: 'selector' },
      ],
      faults,
    };
    this.reset();
  }
  reset() {
    this.inputs = {}; this.outputs = {};
    this._btn = { Start: false, Stop: false, Reset: false, EStop: false, auto: true };
    this._f = new Set(this._f || []);
    for (const c of this._cyl) c.pos = 0;
    this._belt = {}; this._items = []; this._spawnT = 0; this._seq = 0; this._t = 0;
    this._angle = 0; this._lift = 1; this._last = 0;
    this.stats = { produced: 0, rejected: 0, cycleTimeMs: 0, running: false };
    this._computeInputs();
  }
  press(id, down) {
    if (id === 'EStop') { if (down) this._btn.EStop = !this._btn.EStop; }
    else if (id === 'AutoMan') { if (down) this._btn.auto = !this._btn.auto; }
    else this._btn[id] = !!down;
    this._computeInputs();
  }
  get panel() { return { Start: this._btn.Start, Stop: this._btn.Stop, Reset: this._btn.Reset, EStop: this._btn.EStop, AutoMan: this._btn.auto }; }
  get events() { return []; }
  setFault(id, on) { if (on) this._f.add(id); else this._f.delete(id); }
  get activeFaults() { return [...this._f]; }
  _q(addr) { return !!this.outputs[addr]; }
  _qTag(tag) { const o = this._d.outputs.find((x) => x.tag === tag); return o ? this._q(o.addr) : false; }
  _step(dt) {
    const s = dt / 1000; this._t += dt; const d = this._d;
    const speed = this._f.has('air_low') ? 0.35 : 1.4;
    for (const c of this._cyl) {
      if (this._f.has(`${c.n}A_stuck`)) continue;
      let dir = 0;
      if (c.y2) dir = this._q(c.y1) ? 1 : this._q(c.y2) ? -1 : 0; else dir = this._q(c.y1) ? 1 : -1;
      c.pos = Math.max(0, Math.min(1, c.pos + dir * speed * s));
    }
    const motors = d.outputs.filter((o) => /^M\d/.test(o.tag));
    const belts = d.parts.filter((p) => /^belt_|^rollers$/.test(p));
    belts.forEach((b, i) => { const m = motors[Math.min(i, motors.length - 1)]; if (m && this._q(m.addr)) this._belt[b] = (this._belt[b] || 0) + 220 * s; });
    this.stats.running = motors.some((m) => this._q(m.addr));
    if (d.flow) this._flow(s);
    if (d.indexer && this._qTag('M1')) this._angle = (this._angle + 60 * s) % 360;
    if (d.lift) { if (this._qTag('M2_Up')) this._lift = Math.min(1, this._lift + 0.2 * s); if (this._qTag('M2_Down')) this._lift = Math.max(0, this._lift - 0.2 * s); }
    this._computeInputs();
  }
  _flow(s) {
    const f = this._d.flow; const on = this._qTag(f.motor); const L = f.size[0];
    if (on) {
      this._spawnT += s;
      const free = !this._items.some((it) => it.x < f.start + L * 1.6);
      if (this._spawnT > 2.2 && free && this._items.length < 8) {
        this._spawnT = 0; this._seq++;
        this._items.push({ id: 'it' + this._seq, kind: f.kind, x: f.start + L / 2, y: 0, z: 800, rotZ: 0, size: f.size.slice(), color: f.color, code: 1 + (this._seq % 3) });
      }
      const sorted = [...this._items].sort((a, b) => b.x - a.x);
      let ahead = Infinity;
      for (const it of sorted) {
        if (it.lane) { it.y = Math.min(900, it.y + 300 * s); ahead = Infinity; continue; }
        let lim = Math.min(ahead - L - 8, f.stopAt ?? Infinity);
        for (const st of f.stops || []) { const c = this._cyl.find((x) => x.n === String(st.cyl)); if (c && c.pos > 0.5 && it.x < st.x) lim = Math.min(lim, st.x - L / 2); }
        it.x = Math.min(lim, it.x + 200 * s); if (it.x < lim - 1 || true) ahead = it.x;
      }
    }
    // gạt làn (diverter)
    (f.lanes || []).forEach((lx, i) => {
      const c = this._cyl.find((x) => x.n === String(i + 1)); if (!c) return;
      for (const it of this._items) if (!it.lane && Math.abs(it.x - lx) < 160 && c.pos > 0.1) { it.y = Math.max(it.y, c.pos * 420); if (c.pos > 0.95) it.lane = i + 1; }
    });
    const before = this._items.length;
    this._items = this._items.filter((it) => !(it.x >= f.len - L / 2 - 2 && !f.stopAt) && !(it.lane && it.y >= 900));
    const done = before - this._items.length;
    if (done) { this.stats.cycleTimeMs = Math.round(this._t - (this._lastDone || 0)); this._lastDone = this._t; this.stats.produced += done; }
    // feeder/pickplace: phôi ở cuối được "lấy đi" khi xi lanh 1A ra hết
    if (f.stopAt && this._items.length > 3) { this._items.shift(); this.stats.produced++; }
  }
  _computeInputs() {
    const d = this._d; const I = {}; const tagIn = {};
    I['%I0.0'] = this._btn.Start; I['%I0.1'] = !this._btn.Stop; I['%I0.2'] = this._btn.Reset; I['%I0.3'] = !this._btn.EStop; I['%I0.4'] = this._btn.auto;
    for (const c of this._cyl) { tagIn[c.n + 'B1'] = c.pos < 0.03; tagIn[c.n + 'B2'] = c.pos > 0.97 && !this._f.has(`${c.n}B2_lost`); }
    for (const [k, v] of Object.entries(d.statics || {})) tagIn[k] = v;
    if (d.flow) for (const [tag, x] of Object.entries(d.flow.sensors)) tagIn[tag] = !this._f.has(`${tag}_dead`) && this._items.some((it) => !it.lane && Math.abs(it.x - x) < d.flow.size[0] / 2);
    if (d.indexer) { const a = this._angle % 90; tagIn.IdxPos = a < 2 || a > 88; tagIn.P0 = tagIn.P2 = tagIn.P3 = true; }
    if (d.lift) { tagIn.LiftTop = this._lift > 0.99; tagIn.LiftBottom = this._lift < 0.01; tagIn.LayerLvl = this._lift > 0.6; }
    if (this._d.carton === 'erector') tagIn.VacOK = this._qTag('VAC') && (this._cyl[0]?.pos ?? 0) > 0.9;
    if (this.id === 'pickplace') tagIn.VacOK = this._qTag('VAC') && (this._cyl.find((c) => c.n === '2')?.pos ?? 0) > 0.9;
    for (const io of d.inputs) if (io.tag in tagIn) I[io.addr] = !!tagIn[io.tag];
    if (this.id === 'diverter') { const it = this._items.find((x) => Math.abs(x.x - 300) < 150); I['%IW68'] = it ? it.code : 0; }
    this.inputs = I; this._tagIn = tagIn;
  }
  getVisual() {
    const parts = {}; const d = this._d;
    for (const c of this._cyl) for (const p of c.part) parts[p] = c.pos;
    for (const [b, v] of Object.entries(this._belt)) parts[b] = v;
    if (d.indexer) parts.table = this._angle / 360;
    if (d.lift) parts.lift = this._lift;
    if (d.parts.includes('magazine_pusher')) parts.magazine_pusher = 0.3;
    const items = this._items.map((it) => ({ ...it }));
    if (d.carton) {
      const cp = (n) => this._cyl.find((c) => c.n === n)?.pos ?? 0;
      const t = (this._t / 1000) % 12;
      if (d.carton === 'erector') {
        items.push({ id: 'carton', kind: 'carton', x: 900 + cp('5') * 500, y: 0, z: 800, rotZ: 0, size: [400, 300, 300], color: '#c8a273',
          fold: { open: Math.max(cp('2'), 0.5 + 0.5 * Math.sin(t)), minorFront: cp('3'), minorRear: cp('4'), major: cp('5'), topMinor: 0, topMajor: 0, taped: cp('5') > 0.9 } });
      } else {
        items.push({ id: 'carton', kind: 'carton', x: 600, y: 0, z: 800, rotZ: 0, size: [400, 300, 300], color: '#c8a273',
          fold: { open: 1, minorFront: 1, minorRear: 1, major: 1, topMinor: Math.max(cp('2'), cp('3')), topMajor: cp('4'), taped: cp('4') > 0.9 } });
      }
    }
    if (d.indexer) for (let k = 0; k < 4; k++) { const a = (this._angle + k * 90) * Math.PI / 180; items.push({ id: 'pz' + k, kind: 'puck', x: 600 + 300 * Math.cos(a + Math.PI), y: 300 * Math.sin(a + Math.PI), z: 830, size: [60, 60, 30], color: k % 2 ? '#8e9aa6' : '#c8553d' }); }
    const leds = {}; for (const io of d.inputs) leds[io.tag] = !!this._tagIn?.[io.tag];
    return { parts, items, leds };
  }
}

export function createMachine(id) { return P1_MACHINES[id] ? new P1_MACHINES[id]() : new FakeMachine(id); }
export const MACHINES = Object.fromEntries([
  ...Object.entries(FAKE_DEFS).map(([id, d]) => [id, { id, title: d.title }]),
  ...Object.keys(P1_MACHINES).map((id) => [id, new P1_MACHINES[id]().def]),
]);

/* =========================== LABS giả =========================== */

async function genericGrade(project, { PlcRuntime: P = PlcRuntime, createMachine: C = createMachine } = {}, machineId) {
  const crit = [];
  const add = (id, title, ok, max, message = '') => crit.push({ id, title, ok, points: ok ? max : 0, max, message });
  const plc = new P(project, { headless: true });
  const m = C(machineId); plc.attach(m);
  const res = plc.load(project);
  add('compile', 'Biên dịch không lỗi', res.ok, 20, res.ok ? '' : `${res.errors.length} lỗi`);
  if (!res.ok) { plc.dispose?.(); return finish(crit); }
  plc.start();
  const run = (ms) => { for (let t = 0; t < ms; t += 10) plc._tick(10); };
  run(200);
  const outs = () => Object.entries(m.outputs || {}).filter(([a, v]) => v && !/^%Q0\.[01]$/.test(a)).length;
  const before = outs();
  m.press('Start', true); run(100); m.press('Start', false); run(1500);
  const afterStart = outs();
  add('start', 'Nhấn Start làm máy hoạt động (có đầu ra cơ cấu bật)', afterStart > before || afterStart > 0, 30);
  m.press('Stop', true); run(100); m.press('Stop', false); run(500);
  add('stop', 'Nhấn Stop dừng các cơ cấu', outs() === 0, 25);
  m.press('Start', true); run(100); m.press('Start', false); run(500);
  m.press('EStop', true); run(300);
  add('estop', 'E-Stop ngắt toàn bộ đầu ra', outs() === 0, 25, '');
  plc.dispose?.();
  return finish(crit);
}
function finish(crit) {
  const score = crit.reduce((a, c) => a + c.points, 0), max = crit.reduce((a, c) => a + c.max, 0);
  return { score, max, passed: score >= max * 0.5, criteria: crit, at: Date.now() };
}

const mk = (id, machineId, objectives, steps) => ({
  id, machineId, objectives, steps,
  summary: `Lab mẫu (shim) cho máy “${MACHINES[machineId].title}”. Nội dung thật sẽ do src/labs cung cấp.`,
  allowInputOverride: true,
  grade: (project, eng) => genericGrade(project, eng, machineId),
});
export const LABS = [
  { ...mk('L01', 'trainer', ['Làm quen bàn thực hành: nút NO/NC, công tắc xoay, cảm biến tiệm cận và quang', 'Viết mạch tự giữ đầu tiên'], ['S1 bật H1 tự giữ, S3 (NC) tắt.', 'PRX = 1 → H3 sáng; PE = 1 → còi BUZ.']),
    grade: (project, eng) => gradeTrainerShim(project, eng) },
  mk('L02', 'motor', ['Mạch đảo chiều có khóa liên động', 'Công tắc hành trình, cảm biến an toàn'], ['Lên/Xuống tự giữ, dừng ở hành trình.', 'Không bao giờ đóng KM1 và KM2 cùng lúc.']),
  mk('L03', 'stardelta', ['Timer TON cho khởi động sao–tam giác', 'Đọc analog áp suất'], ['KM1+KM2 (sao) 5 s rồi KM1+KM3 (tam giác).', 'Ngắt khi PS = 0.']),
  mk('L04', 'counter', ['Bộ đếm CTU, so sánh, MOVE ra bảng LED'], ['Đếm B1, đủ 6 sản phẩm thì đổi thùng.', 'MOVE số đếm ra %QW80.']),
  mk('L07', 'feeder', ['Hiểu nguyên lý cấp phôi bằng xi lanh đẩy + xi lanh chặn', 'Viết mạch tự giữ Start/Stop, E-Stop', 'Viết trình tự 2A+ 1A+ 1A− 2A− có giám sát timeout'],
    ['Khai báo tag theo bảng I/O (đã tạo sẵn).', 'Network 1: mạch tự giữ "Run" bằng Start/Stop/EStop.', 'Network 2: khi "Run" và B5 = 0, cấp phôi: 2A chặn, 1A đẩy, 1A lùi, 2A nhả.', 'Biên dịch, nạp xuống, RUN và quan sát máy.']),
  mk('L09', 'diverter', ['Điều khiển băng tải và 3 xi lanh gạt', 'Chia thùng luân phiên vào 3 làn', 'Dùng thanh ghi dịch theo dõi vị trí thùng'],
    ['Chạy băng tải khi Run.', 'Khi thùng tới gạt n và làn n chưa đầy → gạt.', 'Bổ sung chế độ theo mã sản phẩm %IW68.']),
  ...['escapement', 'erector', 'sealer', 'pickplace', 'indexer', 'palletizer'].map((mid, i) =>
    mk(['L08', 'L10', 'L11A', 'L11B', 'L06', 'L18P'][i], mid, ['Đọc hiểu bảng I/O và cơ cấu máy', 'Viết chương trình điều khiển an toàn (Start/Stop/E-Stop)'], ['Mở bảng tag và đối chiếu với máy 3D.', 'Viết mạch tự giữ, sau đó viết trình tự cơ cấu.'])),
];
