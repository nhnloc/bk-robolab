// Soft-PLC S7-1200 ảo: biên dịch project, vòng quét, bus I/O với máy mô phỏng, force/watch.
import { Context, PlcError, localTypesOf, makeFrame, makeFbInstance } from './context.js';
import { compileNetwork } from './lad.js';
import { compileScl } from './scl.js';
import { parseAddress, coerce } from './values.js';

export const CPUS = {
  '1214C': { di: 14, dq: 10, ai: 2, label: 'CPU 1214C DC/DC/DC' },
  '1215C': { di: 14, dq: 10, ai: 2, label: 'CPU 1215C DC/DC/DC' },
  '1217C': { di: 14, dq: 10, ai: 2, label: 'CPU 1217C DC/DC/DC' },
};

export class PlcRuntime {
  constructor(project, opts = {}) {
    this.opts = { cycleMs: 10, physicsStepMs: 1, speed: 1, ...opts };
    this.cpu = opts.cpu || (project && project.cpu) || '1214C';
    this.state = 'STOP';
    this.cycle = 0;
    this.scanTimeMs = 0;
    this.simTime = 0;
    this.machine = null;
    this.forces = new Map();      // op text → { acc, value }
    this.listeners = {};
    this._timer = null;
    this._accum = 0;
    this._flows = {};
    this._programOk = false;
    if (project) this.load(project);
  }

  /* ---------- sự kiện ---------- */
  on(ev, cb) { (this.listeners[ev] ||= new Set()).add(cb); return () => this.listeners[ev].delete(cb); }
  off(ev, cb) { this.listeners[ev]?.delete(cb); }
  emit(ev, data) { for (const cb of this.listeners[ev] || []) { try { cb(data); } catch (e) { console.error(e); } } }

  /* ---------- biên dịch ---------- */
  compile(project) {
    const res = this._build(project);
    return { ok: res.errors.length === 0, errors: res.errors };
  }

  load(project) {
    if (this.state === 'RUN') this.stop();
    const res = this._build(project);
    if (res.errors.length === 0) {
      this.project = project;
      this.ctx = res.ctx; this.exec = res.exec;
      this._programOk = true; this._firstScan = true; this.cycle = 0; this._flows = {};
      this._ob30Due = {};
      // giữ force cũ nếu toán hạng còn hợp lệ
      for (const [k, f] of [...this.forces]) { try { f.acc = this.ctx.operand(k); } catch { this.forces.delete(k); } }
    }
    this.emit('load', { ok: res.errors.length === 0, errors: res.errors });
    return { ok: res.errors.length === 0, errors: res.errors };
  }

  _build(project) {
    const errors = [];
    const ctx = new Context(project);
    ctx.ext = this.ext || null;   // lệnh mở rộng (MP3300)
    try { ctx.initData(); } catch (e) { errors.push({ block: '(DB)', message: e.message }); return { errors, ctx }; }
    const compiled = new Map();
    const compiling = new Set();
    const self = this;

    // Kiểm tra tag
    const seen = new Map();
    for (const t of project.tags || []) {
      if (!t.name) { errors.push({ block: 'PLC tags', message: 'Có tag chưa đặt tên' }); continue; }
      if (seen.has(t.name)) errors.push({ block: 'PLC tags', message: `Tag trùng tên: "${t.name}"` });
      seen.set(t.name, t);
      if (!parseAddress(t.address)) errors.push({ block: 'PLC tags', message: `Tag "${t.name}": địa chỉ không hợp lệ ${t.address}` });
    }

    const getCompiled = (blk) => {
      if (compiled.has(blk.name)) return compiled.get(blk.name);
      if (compiling.has(blk.name)) throw new PlcError(`Gọi đệ quy khối "${blk.name}" không được phép`);
      compiling.add(blk.name);
      const c = compileBlock(blk);
      compiling.delete(blk.name);
      compiled.set(blk.name, c);
      return c;
    };

    /** Tạo hàm gọi FB/FC với gán tham số. params: LAD → chuỗi toán hạng; SCL → {e: AST} | {out: AST} */
    const callBlock = (blk, instAcc, params, at, cexpr, refAcc) => {
      const body = getCompiled(blk);
      const itf = blk.interface || {};
      const bindIn = [], bindOut = [], bindInOut = [];
      const callerTypes = currentLocalTypes;
      const opOf = (pv, wantWrite) => {
        if (typeof pv === 'string') return ctx.operand(pv, callerTypes);
        if (pv.out) return refAcc(pv.out);
        if (wantWrite) { if (pv.e && pv.e.k === 'ref') return refAcc(pv.e); throw at('Tham số đầu ra phải là biến'); }
        const f = cexpr(pv.e); return { get: f };
      };
      const find = (name) => { const k = Object.keys(params || {}).find((x) => x.toLowerCase() === name.toLowerCase()); return k ? params[k] : undefined; };
      for (const v of itf.Input || []) { const pv = find(v.name); if (pv !== undefined && pv !== '') bindIn.push([v.name, v.type, opOf(pv, false)]); else if (blk.type === 'FC' && v.init === undefined) throw at(`Gọi "${blk.name}": thiếu tham số ${v.name}`); }
      for (const v of itf.Output || []) { const pv = find(v.name); if (pv !== undefined && pv !== '') bindOut.push([v.name, opOf(pv, true)]); }
      for (const v of itf.InOut || []) { const pv = find(v.name); if (pv === undefined || pv === '') throw at(`Gọi "${blk.name}": thiếu tham số InOut ${v.name}`); bindInOut.push([v.name, v.type, opOf(pv, true)]); }
      const known = new Set([...(itf.Input || []), ...(itf.Output || []), ...(itf.InOut || [])].map((v) => v.name.toLowerCase()));
      for (const k of Object.keys(params || {})) if (!['en', 'eno'].includes(k.toLowerCase()) && !known.has(k.toLowerCase())) throw at(`"${blk.name}" không có tham số ${k}`);
      const isFb = blk.type === 'FB';
      return () => {
        let inst = null;
        if (isFb) {
          inst = instAcc.get();
          if (!inst || typeof inst !== 'object') throw new PlcError(`Instance của "${blk.name}" không hợp lệ`);
        }
        const frame = makeFrame(blk, inst, ctx.fbLookup);
        for (const [n, t, a] of bindIn) frame.vars[n] = coerce(t, a.get());
        for (const [n, t, a] of bindInOut) frame.vars[n] = typeof a.get() === 'object' ? a.get() : coerce(t, a.get());
        const prev = ctx.frame; ctx.frame = frame;
        try { body.run(); } finally { ctx.frame = prev; }
        for (const [n, a] of bindOut) a.set(frame.vars[n]);
        for (const [n, , a] of bindInOut) if (typeof frame.vars[n] !== 'object') a.set(frame.vars[n]);
        if (blk.type === 'FC') return frame.vars[blk.name];
      };
    };

    let currentLocalTypes = null;
    const withObFrame = (blk, fn) => { const prev = ctx.frame; ctx.frame = makeFrame(blk, null, ctx.fbLookup); try { fn(); } finally { ctx.frame = prev; } };
    function compileBlock(blk) {
      const lt = localTypesOf(blk);
      const prevLt = currentLocalTypes; currentLocalTypes = lt;
      try {
        if (blk.lang === 'SCL') {
          let run;
          try { run = compileScl(blk.source || '', ctx, { localTypes: lt, callBlock }); }
          catch (e) { errors.push({ block: blk.name, line: e.line, message: e.message }); run = () => {}; }
          return blk.type === 'OB' ? { run: () => withObFrame(blk, run) } : { run: () => run() };
        }
        // LAD / FBD (FBD dùng cùng cây)
        const nets = (blk.networks || []).map((net, i) => {
          try { return compileNetwork(net, ctx, { localTypes: lt, block: blk, callBlock: (b, inst, params, at) => callBlock(b, inst, params, at) }); }
          catch (e) { errors.push({ block: blk.name, network: i, path: e.path, message: e.message }); return () => {}; }
        });
        const runNets = () => {
            const store = (self._flows[blk.name] ||= []);
            for (let i = 0; i < nets.length; i++) { const f = {}; try { nets[i](f); } catch (e) { if (e instanceof PlcError) { e.block ??= blk.name; e.network ??= i; } throw e; } store[i] = f; }
        };
        return blk.type === 'OB' ? { run: () => withObFrame(blk, runNets) } : { run: runNets };
      } finally { currentLocalTypes = prevLt; }
    }

    const blocks = project.blocks || [];
    const obs = blocks.filter((b) => b.type === 'OB');
    if (!obs.some((b) => (b.number ?? 1) === 1)) errors.push({ block: 'Program blocks', message: 'Thiếu khối Main [OB1]' });
    const exec = { ob1: [], ob100: [], ob30: [] };
    for (const b of blocks) {
      if (b.type === 'DB') continue;
      if (b.type !== 'OB' && b.type !== 'FB' && b.type !== 'FC') { errors.push({ block: b.name, message: 'Loại khối không hỗ trợ: ' + b.type }); continue; }
      try {
        const c = getCompiled(b);
        if (b.type === 'OB') {
          const n = b.number ?? 1;
          if (n === 1 || (n >= 123 && n < 30000 && b.event !== 'startup' && b.event !== 'cyclic')) exec.ob1.push(c);
          else if (n === 100 || b.event === 'startup') exec.ob100.push(c);
          else if ((n >= 30 && n <= 38) || b.event === 'cyclic') exec.ob30.push({ c, period: b.cycleMs || 100, name: b.name });
        }
      } catch (e) { errors.push({ block: b.name, message: e.message }); }
    }
    return { errors, ctx, exec };
  }

  /* ---------- I/O ---------- */
  attach(machine) {
    this.machine = machine;
    machine.plc = this;
    this.emit('attach', machine);
    this._startClock();
  }

  _readInputs() {
    const m = this.machine, ctx = this.ctx;
    if (m) {
      for (const io of m.def.ioMap.inputs) {
        const a = parseAddress(io.addr); if (!a) continue;
        const v = m.inputs[io.tag];
        if (a.type === 'Bool') ctx.I.setBit(a.byte, a.bit, !!v);
        else ctx.I.set(io.type || 'Int', a.byte, v ?? 0);
      }
    }
    for (const [, f] of this.forces) if (f.acc.addr && f.acc.addr.area === 'I') f.acc.set(f.value);
  }

  _writeOutputs() {
    const m = this.machine, ctx = this.ctx;
    for (const [, f] of this.forces) if (f.acc.addr && f.acc.addr.area === 'Q') f.acc.set(f.value);
    if (!m) return;
    for (const io of m.def.ioMap.outputs) {
      const a = parseAddress(io.addr); if (!a) continue;
      m.outputs[io.tag] = this.state === 'RUN'
        ? (a.type === 'Bool' ? ctx.Q.getBit(a.byte, a.bit) : ctx.Q.get(io.type || 'Int', a.byte))
        : (a.type === 'Bool' ? false : 0);
    }
  }

  /* ---------- chạy ---------- */
  start() {
    if (!this._programOk) { this.emit('error', { message: 'Chưa nạp chương trình hợp lệ' }); return false; }
    if (this.state === 'RUN') return true;
    this.state = 'RUN';
    this._firstScan = true;
    this._lastScan = undefined;
    this.ctx.Q.clear();
    this.emit('state', this.state);
    this._startClock();
    return true;
  }

  /** Đồng hồ thời gian thực (trình duyệt): máy mô phỏng chạy liên tục kể cả khi PLC STOP. */
  _startClock() {
    if (this._timer || typeof window === 'undefined' || this.opts.manualClock) return;
    let last = performance.now();
    this._timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(200, now - last) * this.opts.speed; last = now;
      this.tick(dt);
    }, 16);
  }
  dispose() { if (this._timer) { clearInterval(this._timer); this._timer = null; } this.listeners = {}; }

  stop(reason) {
    const was = this.state;
    this.state = 'STOP';
    if (this.ctx) { this.ctx.Q.clear(); this._writeOutputs(); }
    if (was !== 'STOP') this.emit('state', this.state, reason);
  }

  /** Mô phỏng vật lý chạy cả khi PLC STOP (máy vẫn có trọng lực, nút nhấn…) — dùng runMachine() khi STOP. */
  tick(dtMs) {
    const step = this.opts.physicsStepMs;
    this._accum += dtMs;
    while (this._accum >= step) {
      this._accum -= step;
      this.simTime += step;
      if (this.machine) this.machine.step(step, this.simTime);
      if (this.state === 'RUN' && this.simTime - (this._lastScan ?? -1e9) >= this.opts.cycleMs) {
        this._lastScan = this.simTime;
        this.scan();
        if (this.state !== 'RUN') break;
      }
    }
  }

  scan() {
    const ctx = this.ctx;
    ctx.now = this.simTime;
    const t0 = (typeof performance !== 'undefined' ? performance : Date).now();
    try {
      this._readInputs();
      if (this._firstScan) { for (const c of this.exec.ob100) c.run(); this._firstScan = false; }
      for (const c of this.exec.ob1) c.run();
      for (const o of this.exec.ob30) {
        const due = this._ob30Due[o.name] ?? 0;
        if (this.simTime >= due) { this._ob30Due[o.name] = this.simTime + o.period; o.c.run(); }
      }
      this._writeOutputs();
    } catch (e) {
      const info = { block: e.block, network: e.network, line: e.line, path: e.path, message: e.message || String(e) };
      this.stop('error');
      this.emit('error', info);
      return;
    }
    const t1 = (typeof performance !== 'undefined' ? performance : Date).now();
    this.cycle++;
    // thời gian quét "ảo": 0,2 ms nền + thời gian JS thực, làm mượt
    const st = 0.2 + (t1 - t0);
    this.scanTimeMs = this.scanTimeMs ? this.scanTimeMs * 0.9 + st * 0.1 : st;
    this.emit('scan', { scanTimeMs: this.scanTimeMs, cycle: this.cycle });
  }

  /** Chạy không giao diện (chấm bài, kiểm thử). */
  runFor(ms) { this.tick(ms); }

  /* ---------- giám sát ---------- */
  read(op) {
    if (!this.ctx) return undefined;
    try { return this.ctx.operand(op).get(); } catch { return undefined; }
  }
  typeOf(op) { try { return this.ctx.operand(op).type; } catch { return undefined; } }
  write(op, value) {
    const a = this.ctx.operand(op);
    a.set(value);
    if (a.addr && a.addr.area === 'Q') this._writeOutputs();
  }
  force(op, value) {
    const acc = this.ctx.operand(op);
    if (!acc.addr || (acc.addr.area !== 'I' && acc.addr.area !== 'Q')) throw new PlcError('Chỉ force được ngõ vào/ra %I, %Q');
    this.forces.set(op, { acc, value });
    this.emit('force', [...this.forces.keys()]);
  }
  unforce(op) { if (op === undefined) this.forces.clear(); else this.forces.delete(op); this.emit('force', [...this.forces.keys()]); }
  getPowerFlow(blockName, networkIndex) { return (this._flows[blockName] || [])[networkIndex] || {}; }
}

export { PlcError, makeFbInstance };
