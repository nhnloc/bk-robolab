// Machine controller ảo kiểu MP3300 (CPU301 + LIO-04 + SVC + 218IFD):
// - chương trình Ladder (dùng lại soft-PLC LAD/SCL), quét 10 ms
// - chương trình Motion (MPM###) gọi bằng lệnh MSEE trong ladder
// - biến trục A1/B1/C1… (DB hệ thống), lệnh MSG-SNDE gửi khung UDP qua module 218IFD
import { PlcRuntime } from '../plc/runtime.js';
import { compileMotion, MotionTask } from './motion.js';
import { ServoAxis } from './axis.js';

/** Trường của DB trục (Axis variable) — ladder đọc/ghi bằng "A1".ServoOn … */
export const AXIS_FIELDS = [
  { name: 'ServoOn', type: 'Bool', ctrl: true, desc: 'Lệnh bật servo (1 = ON)' },
  { name: 'AlarmClear', type: 'Bool', ctrl: true, desc: 'Xóa lỗi trục (sườn lên)' },
  { name: 'Running', type: 'Bool', desc: 'Servo đang bật' },
  { name: 'ZeroDone', type: 'Bool', desc: 'Đã về gốc' },
  { name: 'Busy', type: 'Bool', desc: 'Đang chuyển động' },
  { name: 'Alarm', type: 'Int', desc: 'Mã lỗi trục (0 = không lỗi)' },
  { name: 'Warning', type: 'Int', desc: 'Mã cảnh báo (giới hạn mềm)' },
  { name: 'Pos', type: 'Real', desc: 'Vị trí hiện tại (mm / độ)' },
];
/** Trường của struct điều khiển chương trình motion (tham số DATA của MSEE). */
export const MSEE_FIELDS = [
  { name: 'Run', type: 'Bool', ctrl: true, desc: 'Control.Run — sườn lên: chạy từ đầu' },
  { name: 'Pause', type: 'Bool', ctrl: true, desc: 'Control.Pause — 1: tạm dừng, 0: chạy tiếp' },
  { name: 'Stop', type: 'Bool', ctrl: true, desc: 'Control.Stop — sườn lên: dừng hẳn' },
  { name: 'AlarmReset', type: 'Bool', ctrl: true, desc: 'Control.AlarmReset — sườn lên: xóa lỗi chương trình' },
  { name: 'Running', type: 'Bool', desc: 'Status.Run — đang chạy' },
  { name: 'Paused', type: 'Bool', desc: 'Status.Pause — đang tạm dừng' },
  { name: 'Alarm', type: 'Bool', desc: 'Status.Alarm — chương trình lỗi' },
  { name: 'Done', type: 'Bool', desc: 'Status.Done — đã chạy tới END' },
  { name: 'SystemPause', type: 'Bool', desc: 'Status.SystemPause — bị buộc dừng bởi Stop' },
];
export const CPU_FIELDS = [
  { name: 'Alarm', type: 'Bool', desc: 'CPU.Status.Alarm (SB402)' },
  { name: 'Error', type: 'Bool', desc: 'CPU.Status.Error (SB403)' },
  { name: 'AlwaysOn', type: 'Bool', desc: 'SB1 — luôn bằng 1' },
];
/** Struct header khung High-Speed Ethernet (file HighSpeedEthernetFunctionHeader.csv). */
export const HSE_STRUCT = [
  { name: 'Identifier', type: 'DInt', desc: 'L — định danh "YERC"' },
  { name: 'HeaderSize', type: 'Word', desc: 'W — kích thước header' },
  { name: 'DataSize', type: 'Word', desc: 'W — kích thước phần dữ liệu' },
  { name: 'Reserve1_Div', type: 'Word', desc: 'W — Reserve 1 (byte thấp) + Processing division (byte cao)' },
  { name: 'Ack_ReqID', type: 'Word', desc: 'W — ACK (byte thấp, 0 = yêu cầu) + Request ID (byte cao)' },
  { name: 'BlockNo', type: 'DInt', desc: 'L — Block No' },
  { name: 'Reserve2_L', type: 'DInt', desc: 'Q (4 byte thấp) — Reserve 2' },
  { name: 'Reserve2_H', type: 'DInt', desc: 'Q (4 byte cao) — Reserve 2' },
  { name: 'CommandNo', type: 'Word', desc: 'W — Command No' },
  { name: 'Instance', type: 'Word', desc: 'W — Instance' },
  { name: 'Attr_Service', type: 'Word', desc: 'W — Attribute (byte thấp) + Service (byte cao)' },
  { name: 'Padding', type: 'Word', desc: 'W — Padding' },
  { name: 'Data', type: 'DInt', desc: 'L — phần dữ liệu (data division)' },
];
const TSIZE = { Bool: 1, Byte: 1, Char: 1, Int: 2, Word: 2, UInt: 2, DInt: 4, DWord: 4, UDInt: 4, Real: 4, Time: 4 };

export const MC_IP = '192.168.1.1';
export const DEFAULT_ETH = { ip: MC_IP, mask: '255.255.255.0', conns: [] };

export class MachineController {
  /** axesHw: { A1: hw, B1: hw, … } ; io: { inputs:[{addr,tag,desc}], outputs:[…] } ; network: { send(conn, bytes) } */
  constructor({ axesHw = {}, io, network }) {
    this.io = { def: { ioMap: io }, inputs: {}, outputs: {} };
    for (const x of io.inputs) this.io.inputs[x.tag] = false;
    for (const x of io.outputs) this.io.outputs[x.tag] = false;
    this.axes = {};
    for (const [n, hw] of Object.entries(axesHw)) this.axes[n] = new ServoAxis(n, hw, hw.prm);
    this.network = network;
    this.plc = new PlcRuntime(null, { manualClock: true });
    this.plc.ext = this.makeExt();
    this.plc.attach(this.io);
    const rd = this.plc._readInputs.bind(this.plc), wr = this.plc._writeOutputs.bind(this.plc);
    this.plc._readInputs = () => { rd(); this.syncIn(); };
    this.plc._writeOutputs = () => { this.syncOut(); wr(); };
    this.tasks = new Map();          // tên chương trình motion → MotionTask
    this.regs = new Map();           // thanh ghi M/G (motion)
    this.netLog = [];
    this.project = null;
    this.time = 0; this._scanAcc = 0;
    this.scanMs = 10;
    this.eth = { ...DEFAULT_ETH };
  }

  get state() { return this.plc.state; }
  on(ev, cb) { return this.plc.on(ev, cb); }

  /* ---------------- nạp project ---------------- */
  /** mc = project.mc = { tags, blocks, motion:[{name, source}], axes:{A1:{prm}}, eth } */
  prepare(mc) {
    const blocks = (mc.blocks || []).filter((b) => !b.system);
    const sys = [];
    for (const n of Object.keys(this.axes)) sys.push({ name: n, type: 'DB', number: 900 + sys.length, system: true, fields: AXIS_FIELDS.map((f) => ({ name: f.name, type: f.type })) });
    sys.push({ name: 'CPU', type: 'DB', number: 990, system: true, fields: CPU_FIELDS.map((f) => ({ name: f.name, type: f.type })) });
    const names = new Set(blocks.map((b) => b.name));
    return { schema: 'bk-autolab/project@1', name: 'MC', cpu: 'MP3300', tags: mc.tags || [], blocks: [...blocks, ...sys.filter((b) => !names.has(b.name))], watch: [] };
  }
  compile(mc) {
    const res = this.plc.compile(this.prepare(mc));
    const errors = [...res.errors];
    for (const m of mc.motion || []) {
      const c = compileMotion(m.source, { axes: Object.keys(this.axes) });
      for (const e of c.errors) errors.push({ block: m.name, line: e.line, message: e.message });
    }
    return { ok: errors.length === 0, errors };
  }
  load(mc) {
    if (this.plc.state === 'RUN') this.stop();
    const c = this.compile(mc);
    if (!c.ok) return c;
    this.project = mc;
    const res = this.plc.load(this.prepare(mc));
    for (const [n, prm] of Object.entries(mc.axes || {})) this.axes[n]?.setParams(prm);
    this.eth = { ...DEFAULT_ETH, ...(mc.eth || {}) };
    this.tasks.clear();
    return res;
  }
  start() { const ok = this.plc.start(); return ok; }
  stop() {
    this.plc.stop();
    for (const t of this.tasks.values()) t.stop();
    for (const a of Object.values(this.axes)) { a.stop(); a.servo(false); }
  }

  /* ---------------- đồng bộ biến trục ---------------- */
  acc(op) { try { return this.plc.ctx.operand(op); } catch { return null; } }
  syncIn() {
    if (!this.plc.ctx) return;
    for (const [n, a] of Object.entries(this.axes)) {
      const set = (f, v) => { const x = this.acc(`"${n}".${f}`); if (x) x.set(v); };
      set('Running', a.running); set('ZeroDone', a.zeroDone); set('Busy', a.busy);
      set('Alarm', a.alarm); set('Warning', a.warning); set('Pos', a.pos);
    }
    const c = (f, v) => { const x = this.acc(`"CPU".${f}`); if (x) x.set(v); };
    c('AlwaysOn', true); c('Alarm', false); c('Error', false);
  }
  syncOut() {
    if (!this.plc.ctx || this.plc.state !== 'RUN') return;
    for (const [n, a] of Object.entries(this.axes)) {
      const on = this.acc(`"${n}".ServoOn`)?.get();
      a.servo(!!on);
      const clr = !!this.acc(`"${n}".AlarmClear`)?.get();
      if (clr && !a._clr) a.clearAlarm();
      a._clr = clr;
    }
  }

  /* ---------------- lệnh mở rộng trong ladder ---------------- */
  makeExt() {
    const mc = this;
    return {
      /** MSEE: gọi chương trình motion. PROG = tên (MPM001), DATA = DB điều khiển. */
      MSEE({ params, path, at, op }) {
        const prog = String(params.PROG || params.Program || '').replace(/"/g, '').trim().toUpperCase();
        if (!prog) throw at('MSEE: thiếu tham số PROG (vd. MPM001)');
        const src = (mc.project?.motion || mc._pendingMotion || []).find((m) => m.name.toUpperCase() === prog);
        if (!src && mc.project) throw at(`MSEE: không có chương trình motion ${prog}`);
        const data = String(params.DATA || params.Data || '').trim();
        if (!data) throw at('MSEE: thiếu tham số DATA (DB điều khiển, vd. "CallM1")');
        const f = {};
        for (const fd of MSEE_FIELDS) f[fd.name] = op(`${data.startsWith('"') ? data : `"${data}"`}.${fd.name}`);
        const edge = { run: false, stop: false, rst: false };
        return (p, flows) => {
          if (p) mc.runMsee(prog, f, edge);
          flows[path] = p; return p;
        };
      },
      /** MSG-SNDE: gửi khung dữ liệu qua 218IFD. Execute = dòng công suất vào. */
      MSG_SNDE({ params, path, at, op }) {
        const data = String(params.DATA || '').trim();
        if (!data) throw at('MSG_SNDE: thiếu DATA (DB chứa khung gửi)');
        const dbName = data.replace(/"/g, '');
        const size = params.SIZE ? op(params.SIZE) : null;
        const ch = params.CH ? op(params.CH) : { get: () => 1 };
        const dev = params.DEV ? op(params.DEV) : { get: () => 16 };
        const pro = params.PRO ? op(params.PRO) : { get: () => 2 };
        const abort = params.Abort ? op(params.Abort) : null;
        const outs = ['Complete', 'Busy', 'Error'].map((k) => [k, params[k] ? op(params[k]) : null]);
        const st = { prev: false, busy: 0, complete: false, error: false };
        return (p, flows) => {
          st.complete = false; st.error = false;
          if (abort?.get()) st.busy = 0;
          if (p && !st.prev && !st.busy) st.busy = 2;   // trễ 2 chu kỳ quét
          else if (st.busy > 0) {
            st.busy--;
            if (st.busy === 0) {
              const r = mc.msgSend({ db: dbName, size: size ? size.get() : 0, ch: ch.get(), dev: dev.get(), pro: pro.get() });
              if (r.ok) st.complete = true; else st.error = true;
            }
          }
          st.prev = p;
          for (const [k, a] of outs) if (a) a.set(k === 'Complete' ? st.complete : k === 'Busy' ? st.busy > 0 : st.error);
          flows[path] = st.busy > 0 || st.complete; return st.complete;
        };
      },
    };
  }

  runMsee(prog, f, edge) {
    let t = this.tasks.get(prog);
    const src = (this.project?.motion || []).find((m) => m.name.toUpperCase() === prog);
    if (!t) {
      const c = compileMotion(src?.source || '', { axes: Object.keys(this.axes) });
      t = new MotionTask(prog, c, this.motionEnv());
      this.tasks.set(prog, t);
    }
    const run = !!f.Run.get(), stop = !!f.Stop.get(), pause = !!f.Pause.get(), rst = !!f.AlarmReset.get();
    if (stop && !edge.stop) { t.stop(); t.sysPause = true; }
    if (rst && !edge.rst) { t.resetAlarm(); t.sysPause = false; }
    if (run && !edge.run && !stop && t.state !== 'ALARM' && !t.running) { t.start(); t.sysPause = false; }
    edge.run = run; edge.stop = stop; edge.rst = rst;
    t.pause(pause);
    t.called = this.plc.cycle;
    t.step(this.scanMs);
    f.Running.set(t.running); f.Paused.set(t.state === 'PAUSE'); f.Alarm.set(t.state === 'ALARM'); f.Done.set(t.state === 'DONE'); f.SystemPause.set(!!t.sysPause);
  }

  motionEnv() {
    return {
      axis: (n) => this.axes[String(n).toUpperCase()],
      read: (n) => {
        const u = String(n).toUpperCase();
        if (u === 'SB1' || u === 'SB000001') return 1;
        if (/^(M|G|D)[BWLFD]\d+$/.test(u)) return this.regs.get(u) ?? 0;
        if (n.includes('.')) { const [a, b] = n.split('.'); const v = this.plc.read(`"${a}".${b}`); return v === undefined ? undefined : +v; }
        const v = this.plc.read(`"${n}"`);
        return v === undefined ? undefined : +v;
      },
      write: (n, v) => {
        const u = String(n).toUpperCase();
        if (/^(M|G|D)[BWLFD]\d+$/.test(u)) { this.regs.set(u, /^.[BWL]/.test(u) ? Math.trunc(v) : v); return true; }
        try {
          const op = n.includes('.') ? `"${n.split('.')[0]}".${n.split('.')[1]}` : `"${n}"`;
          const a = this.plc.ctx.operand(op);
          a.set(a.type === 'Bool' ? !!v : v);
          if (a.addr?.area === 'Q') this.plc._writeOutputs();
          return true;
        } catch { return false; }
      },
    };
  }

  /** Đóng gói DB thành byte (little-endian) và gửi qua kênh ch của 218IFD. */
  msgSend({ db, size, ch, dev, pro }) {
    const log = (o) => { this.netLog.push({ t: this.time, ...o }); if (this.netLog.length > 50) this.netLog.shift(); };
    if (dev !== 16) { log({ dir: 'err', text: `Dev-Type = ${dev}: module 218IFD phải là 16` }); return { ok: false }; }
    if (pro !== 2) { log({ dir: 'err', text: `Pro-Type = ${pro}: giao thức tự do (no-protocol) phải là 2` }); return { ok: false }; }
    const conn = (this.eth.conns || []).find((c) => +c.ch === +ch);
    if (!conn) { log({ dir: 'err', text: `Kênh ${ch} chưa được cấu hình trong 218IFD` }); return { ok: false }; }
    if (conn.protocol !== 'None') { log({ dir: 'err', text: `Kênh ${ch}: Communication protocol phải là None (đang là ${conn.protocol})` }); return { ok: false }; }
    const blk = (this.project.blocks || []).find((b) => b.name === db && b.type === 'DB');
    if (!blk) { log({ dir: 'err', text: `Không có DB "${db}"` }); return { ok: false }; }
    const bytes = [];
    for (const fd of blk.fields || []) {
      const v = this.plc.read(`"${db}".${fd.name}`) ?? 0;
      const n = TSIZE[fd.type] || 0;
      const b = new Uint8Array(4); const dv = new DataView(b.buffer);
      if (fd.type === 'Real') dv.setFloat32(0, v, true); else dv.setUint32(0, (typeof v === 'boolean' ? +v : v) >>> 0, true);
      for (let i = 0; i < n; i++) bytes.push(b[i]);
    }
    let out = Uint8Array.from(bytes);
    const want = Math.max(0, Math.round(size || 0)) * 2;
    if (want && want !== out.length) { const o2 = new Uint8Array(want); o2.set(out.slice(0, want)); out = o2; }
    const r = this.network.send({ ...conn, code: conn.code }, out, MC_IP);
    log({ dir: 'tx', bytes: out, to: `${conn.remoteIp}:${conn.remotePort}`, ...r });
    return { ok: true };   // UDP: gửi xong là Complete (không chờ phản hồi)
  }

  /* ---------------- thời gian ---------------- */
  step(dt, readInput) {
    this.time += dt;
    for (const a of Object.values(this.axes)) a.step(dt, (tag) => readInput(tag));
    if (this.plc.state !== 'RUN') return;
    this._scanAcc += dt;
    while (this._scanAcc >= this.scanMs) {
      this._scanAcc -= this.scanMs;
      this.plc.simTime = this.time;
      this.plc.scan();
      if (this.plc.state !== 'RUN') { for (const t of this.tasks.values()) t.stop(); break; }
    }
    // chương trình motion không được MSEE gọi trong chu kỳ quét → dừng (như MP3300)
    for (const t of this.tasks.values()) if (t.running && t.called !== undefined && this.plc.cycle - t.called > 2) { t.stop(); t.sysPause = true; }
  }

  /* ---------------- Test Run (jog trục, MPE720) ---------------- */
  jog(axis, dir, speed) {
    const a = this.axes[axis]; if (!a) return;
    if (!dir) { a.stop(); return; }
    a.servo(true); a.servoOnState = true;
    a.moveTo(a.pos + dir * 1e5, speed);
  }
}
