// Bộ điều khiển robot ảo kiểu YRC1000micro: chế độ TEACH/PLAY/REMOTE, nguồn servo, điều khiển bằng tay (jog)
// trong các hệ tọa độ JOINT/BASE/TOOL/USER, chạy job INFORM, biến B/I/D/R/P, I/O IN#/OT#, báo động.
import * as K from './kinematics.js';
import { compileJob, pName, cName } from './inform.js';

const SPEEDS = ['INCH', 'LOW', 'MED', 'HIGH'];
const COORDS = ['JOINT', 'BASE', 'TOOL', 'USER'];
// Tốc độ jog: khớp = phần trăm tốc độ tối đa; Descartes = mm/s và độ/s; INCH = bước mỗi lần nhấn.
const JOG = {
  LOW: { j: 0.02, v: 10, r: 5 }, MED: { j: 0.08, v: 50, r: 15 }, HIGH: { j: 0.25, v: 150, r: 45 },
  INCH: { j: 0.1, v: 0.5, r: 0.2 },   // INCH: độ / mm / độ mỗi lần nhấn
};
const TEST_LIMIT_MMS = 250;   // giới hạn an toàn khi chạy thử (TEACH)
const MANUAL_VJ = { INCH: 2, LOW: 2, MED: 8, HIGH: 25 };   // FWD/BWD dùng tốc độ tay
const MANUAL_V = { INCH: 10, LOW: 10, MED: 50, HIGH: 150 };
const VR_MAX = 90;   // độ/s cho MOVL

export const ALARMS = {
  4107: 'OUT OF RANGE — điểm đích ngoài vùng làm việc',
  4414: 'PULSE LIMIT — vượt giới hạn khớp',
  4415: 'MOVL không thực hiện được (điểm kỳ dị / ngoài tầm với)',
  4100: 'COLLISION DETECT — phát hiện va chạm',
  4500: 'POSITION DATA NOT TAUGHT — điểm chưa được dạy',
  4501: 'JOB NOT FOUND — không có job',
  4502: 'SYNTAX ERROR — lỗi cú pháp job',
  4503: 'LABEL NOT FOUND — không có nhãn',
  4504: 'CALL STACK OVERFLOW — gọi job lồng nhau quá sâu',
  4505: 'INSTRUCTION LOOP — vòng lặp không có lệnh chờ',
};

export class RobotController {
  constructor({ tool = { z: 50 }, ip = '192.168.1.11', name = 'YRC1000micro' } = {}) {
    this.name = name; this.ip = ip;
    this.tool = tool;
    this.userFrame = null;          // {org, xx, xy} (UF#1)
    this.q = [0, 0, 0, 0, 0, 0];
    this.IN = new Array(25).fill(false);
    this.OT = new Array(25).fill(false);
    this.listeners = {};
    this.program = { jobs: [], pvars: {}, master: null };
    this.resetState();
  }

  resetState() {
    this.mode = 'TEACH';
    this.servo = false; this.servoReady = false; this.enableHeld = false;
    this.estopped = false; this.holding = false;
    this.coord = 'JOINT'; this.speed = 'MED'; this.highSpeed = false;
    this.cycle = 'CYCLE';            // STEP | CYCLE | AUTO
    this.jogKeys = new Map();       // "axis:dir" → true
    this.alarms = [];
    this.vars = { B: new Array(100).fill(0), I: new Array(100).fill(0), D: new Array(100).fill(0), R: new Array(100).fill(0) };
    this.exec = null;               // chương trình đang chạy
    this.motion = null;
    this.pulses = [];
    this.shift = null;
    this.cursor = { job: null, line: 0 };
    this.messages = [];
    this.OT.fill(false);
    this.stats = { moves: 0, jogTime: 0, coordsUsed: new Set(), servoOnCount: 0, maxSpeedMms: 0 };
    this._compiled = new Map();
    this.time = 0;
  }

  on(ev, cb) { (this.listeners[ev] ||= new Set()).add(cb); return () => this.listeners[ev]?.delete(cb); }
  emit(ev, d) { for (const cb of this.listeners[ev] || []) { try { cb(d); } catch (e) { console.error(e); } } }
  msg(text, level = 'info') { this.messages.push({ t: this.time, text, level }); if (this.messages.length > 60) this.messages.shift(); this.emit('message', { text, level }); }

  /* ================================================================ chương trình */
  /** project.robot = { jobs:[{name, lines, pos?}], pvars:{P000:{type:'PULSE'|'BASE', q|p}}, master, tool, userFrame } */
  loadProgram(robot) {
    this.program = robot || { jobs: [], pvars: {}, master: null };
    this.program.jobs ||= []; this.program.pvars ||= {};
    if (robot?.tool) this.tool = robot.tool;
    if (robot?.userFrame) this.userFrame = robot.userFrame;
    this._compiled.clear();
    if (!this.cursor.job || !this.findJob(this.cursor.job)) this.cursor = { job: this.program.master || this.program.jobs[0]?.name || null, line: 0 };
  }
  findJob(name) { return this.program.jobs.find((j) => j.name.toUpperCase() === String(name).toUpperCase()) || null; }
  compiled(name) {
    const j = this.findJob(name);
    if (!j) return null;
    const key = j.lines.join('\n');
    const c = this._compiled.get(j.name);
    if (c && c.key === key) return c;
    const r = { key, job: j, ...compileJob(j) };
    this._compiled.set(j.name, r);
    return r;
  }
  getP(n) { return this.program.pvars[pName(n)] || null; }
  setP(n, v) { this.program.pvars[pName(n)] = v; this.emit('program'); }

  /** Dạy điểm: lưu vị trí hiện tại vào Pxxx (kiểu ROBOT/PULSE). */
  teachP(n) {
    if (n < 0 || n > 127) return false;
    this.setP(n, { type: 'PULSE', q: this.q.map((v) => +v.toFixed(4)) });
    this.msg(`Đã lưu vị trí vào ${pName(n)}`);
    return true;
  }
  clearP(n) { delete this.program.pvars[pName(n)]; this.emit('program'); }

  /** Đích của một biến vị trí → góc khớp (đã áp SFTON). null + báo động nếu lỗi. */
  resolveTarget(L, jobName) {
    let pv;
    if (L.target.t === 'P') pv = this.getP(L.target.n);
    else pv = (this.findJob(jobName)?.pos || {})[cName(L.target.n)];
    if (!pv) { this.alarm(4500, `${L.target.t === 'P' ? pName(L.target.n) : cName(L.target.n)}`); return null; }
    let q = pv.type === 'PULSE' ? pv.q.slice() : null;
    let T = pv.type === 'BASE' ? K.poseToT(pv.p) : null;
    if (this.shift) {
      if (!T) T = K.fk(q, this.tool);
      T = T.slice(); T[3] += this.shift[0]; T[7] += this.shift[1]; T[11] += this.shift[2];
      q = null;
    }
    if (!q) {
      const r = K.ik(T, this.q, this.tool);
      if (!r.ok) { this.alarm(4107, `${L.raw.trim()}`); return null; }
      q = r.q;
    }
    const bad = K.limitViolation(q);
    if (bad >= 0) { this.alarm(4414, `${K.AXES[bad]} = ${q[bad].toFixed(1)}°`); return null; }
    return q;
  }

  /* ================================================================ vận hành */
  get busy() { return !!(this.exec && this.exec.running); }
  get hasAlarm() { return this.alarms.length > 0; }

  setMode(m) {
    if (!['TEACH', 'PLAY', 'REMOTE'].includes(m) || m === this.mode) return;
    this.stopProgram('Đổi chế độ');
    this.mode = m;
    this.servoOff();
    this.servoReady = false;
    this.jogKeys.clear();
    this.emit('state');
  }
  /** Nút SERVO ON READY. */
  servoOnReady() {
    if (this.estopped) { this.msg('Đang dừng khẩn — xoay nút E-STOP để nhả trước', 'warn'); return; }
    if (this.hasAlarm) { this.msg('Đang có báo động — RESET trước', 'warn'); return; }
    if (this.mode === 'TEACH') { this.servoReady = true; if (this.enableHeld) this.servoOn(); }
    else this.servoOn();
    this.emit('state');
  }
  /** Công tắc Enable 3 vị trí: down = giữ nhẹ (giữa). */
  enable(down) {
    this.enableHeld = !!down;
    if (this.mode !== 'TEACH') return;
    if (down && this.servoReady && !this.estopped && !this.hasAlarm) this.servoOn();
    else if (!down) { this.servoOff(); this.jogKeys.clear(); if (this.exec?.test) this.stopProgram(); }
    this.emit('state');
  }
  servoOn() { if (!this.servo) { this.servo = true; this.stats.servoOnCount++; this.msg('SERVO ON'); } }
  servoOff() { if (this.servo) { this.servo = false; this.motion = null; this.msg('SERVO OFF'); } if (this.exec) this.exec.running = false; }
  estop(on) {
    this.estopped = !!on;
    if (on) { this.servoOff(); this.servoReady = false; this.stopProgram('Dừng khẩn'); this.msg('DỪNG KHẨN CẤP', 'err'); }
    this.emit('state');
  }
  hold(down) {
    this.holding = !!down;
    if (down && this.exec?.running) { this.exec.running = false; this.exec.held = true; this.msg('HOLD — tạm dừng'); }
    this.emit('state');
  }
  alarm(code, detail = '') {
    if (this.alarms.some((a) => a.code === code && a.detail === detail)) return;
    this.alarms.push({ code, text: ALARMS[code] || 'ALARM', detail, t: this.time });
    this.servoOff(); this.servoReady = false;
    this.stopProgram();
    this.msg(`ALARM ${code}: ${ALARMS[code] || ''} ${detail}`, 'err');
    this.emit('alarm', this.alarms[this.alarms.length - 1]);
    this.emit('state');
  }
  resetAlarm() { if (!this.alarms.length) return; this.alarms = []; this.msg('Đã reset báo động'); this.emit('state'); }

  setCoord(c) { if (COORDS.includes(c)) { this.coord = c; this.emit('state'); } }
  nextCoord() { this.setCoord(COORDS[(COORDS.indexOf(this.coord) + 1) % COORDS.length]); }
  setSpeed(s) { if (SPEEDS.includes(s)) { this.speed = s; this.emit('state'); } }
  faster() { this.setSpeed(SPEEDS[Math.min(3, SPEEDS.indexOf(this.speed) + 1)]); }
  slower() { this.setSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(this.speed) - 1)]); }

  /** Nút trục: axis 0..5, dir ±1. */
  jog(axis, dir, down) {
    const k = `${axis}:${dir}`;
    if (!down) { this.jogKeys.delete(k); if (!this.jogKeys.size) this.jogT = null; return; }
    if (this.mode !== 'TEACH') { this.msg('Chỉ điều khiển bằng tay ở chế độ TEACH', 'warn'); return; }
    if (!this.servo) { this.msg('Servo chưa bật: nhấn SERVO ON READY rồi giữ Enable', 'warn'); return; }
    if (this.exec?.running) return;
    this.stats.coordsUsed.add(this.coord);
    if (this.speed === 'INCH') { this.inchStep(axis, dir); return; }
    this.jogKeys.set(k, true);
  }
  inchStep(axis, dir) {
    const s = JOG.INCH;
    if (this.coord === 'JOINT') this.tryJoint(this.q.map((v, i) => (i === axis ? v + dir * s.j : v)));
    else this.cartStep(axis < 3 ? axis : -1, axis >= 3 ? axis - 3 : -1, dir * (axis < 3 ? s.v : s.r));
  }
  tryJoint(q) {
    const bad = K.limitViolation(q);
    if (bad >= 0) { this.msg(`Khớp ${K.AXES[bad]} chạm giới hạn mềm`, 'warn'); this.jogKeys.clear(); return false; }
    this.q = q; return true;
  }
  /** Bước jog Descartes: lin (0..2, mm) hoặc rot (0..2, độ) trong hệ tọa độ hiện tại. */
  cartStep(lin, rot, amount) {
    // Đích Descartes được cộng dồn qua các bước 1 ms (bước LOW chỉ 0,01 mm — nhỏ hơn sai số dừng của IK,
    // nếu tính lại từ FK mỗi bước thì robot sẽ không nhúc nhích).
    const T = this.jogT && this.jogT.coord === this.coord ? this.jogT.T : K.fk(this.q, this.tool);
    let F;   // ma trận quay của khung tham chiếu (cột = trục)
    if (this.coord === 'TOOL') F = T;
    else if (this.coord === 'USER') F = K.userFrameT(this.userFrame);
    else F = K.ident();
    const axisOf = (c) => K.col(F, c);
    const Td = T.slice();
    if (lin >= 0) { const a = axisOf(lin); Td[3] += a[0] * amount; Td[7] += a[1] * amount; Td[11] += a[2] * amount; }
    else {
      // quay quanh trục của khung tham chiếu, giữ nguyên vị trí TCP
      const a = axisOf(rot); const th = amount * K.DEG;
      const c = Math.cos(th), s = Math.sin(th), v = 1 - c, [x, y, z] = a;
      const Rr = [[c + x * x * v, x * y * v - z * s, x * z * v + y * s], [y * x * v + z * s, c + y * y * v, y * z * v - x * s], [z * x * v - y * s, z * y * v + x * s, c + z * z * v]];
      for (let cc = 0; cc < 3; cc++) {
        const r = [T[cc], T[4 + cc], T[8 + cc]];
        const n = [0, 1, 2].map((i) => Rr[i][0] * r[0] + Rr[i][1] * r[1] + Rr[i][2] * r[2]);
        Td[cc] = n[0]; Td[4 + cc] = n[1]; Td[8 + cc] = n[2];
      }
    }
    const r = K.ik(Td, this.q, this.tool, { iters: 30 });
    if (!r.ok || r.err[0] > 0.5) { this.msg('Không di chuyển tiếp được: ngoài tầm với / gần điểm kỳ dị / chạm giới hạn khớp', 'warn'); this.jogKeys.clear(); this.jogT = null; return false; }
    // không cho nhảy khớp lớn (đổi cấu hình)
    if (r.q.some((v, i) => Math.abs(v - this.q[i]) > 10)) { this.msg('Gần điểm kỳ dị — chuyển sang hệ JOINT', 'warn'); this.jogKeys.clear(); this.jogT = null; return false; }
    const ok = this.tryJoint(r.q);
    this.jogT = ok && this.jogKeys.size ? { T: Td, coord: this.coord } : null;
    return ok;
  }

  /* ---------------- chạy chương trình ---------------- */
  selectJob(name) {
    const j = this.findJob(name);
    if (!j) return false;
    if (this.busy) return false;
    this.program.master = j.name;
    this.cursor = { job: j.name, line: 0 };
    this.exec = null;
    this.emit('state');
    return true;
  }
  setCursor(job, line) { if (!this.busy) { this.cursor = { job, line }; if (this.exec && !this.exec.running) this.exec = null; this.emit('state'); } }

  /** Nút START (PLAY) hoặc lệnh START từ xa (REMOTE). */
  start(fromRemote = false) {
    if (this.mode === 'TEACH') { this.msg('Chuyển sang PLAY để chạy tự động', 'warn'); return false; }
    if (this.mode === 'REMOTE' && !fromRemote) { this.msg('Chế độ REMOTE: chạy bằng lệnh từ thiết bị ngoài', 'warn'); return false; }
    if (this.mode === 'PLAY' && fromRemote) return false;
    if (!this.servo) { this.msg('Servo chưa bật', 'warn'); return false; }
    if (this.hasAlarm || this.estopped) return false;
    if (this.holding) return false;
    const job = this.cursor.job || this.program.master;
    if (!job) { this.alarm(4501, ''); return false; }
    return this.run(job, { line: this.cursor.job === job ? this.cursor.line : 0 });
  }
  /** INTERLOCK + TEST START: chạy thử khi giữ (TEACH). */
  testStart(down) {
    if (!down) { if (this.exec?.test) { this.exec.running = false; this.motion = null; this.emit('state'); } return; }
    if (this.mode !== 'TEACH' || !this.servo) { this.msg('Chạy thử cần TEACH + servo ON (giữ Enable)', 'warn'); return; }
    const job = this.cursor.job || this.program.master;
    if (!job) return;
    if (this.exec?.test && !this.exec.running && this.exec.stack.length) { this.exec.running = true; return; }
    this.run(job, { line: this.cursor.line, test: true });
  }
  /** FWD / BWD: tới điểm của dòng MOV tại con trỏ (TEACH, tốc độ tay). */
  fwd(down, back = false) {
    if (!down) { if (this.motion?.manual) this.motion = null; this.fwdDir = 0; return; }
    if (this.mode !== 'TEACH' || !this.servo) { this.msg('FWD cần TEACH + servo ON', 'warn'); return; }
    this.fwdDir = back ? -1 : 1;
    this.startFwd();
  }
  startFwd() {
    const c = this.compiled(this.cursor.job);
    if (!c) return;
    let i = this.cursor.line;
    const isMov = (L) => L && (L.op === 'MOVJ' || L.op === 'MOVL');
    if (!isMov(c.lines[i])) {
      const step = this.fwdDir || 1;
      while (i >= 0 && i < c.lines.length && !isMov(c.lines[i])) i += step;
      if (i < 0 || i >= c.lines.length) { this.fwdDir = 0; return; }
      this.cursor.line = i;
    }
    const L = c.lines[i];
    const q = this.resolveTarget(L, this.cursor.job);
    if (!q) return;
    const tags = L.op === 'MOVJ' ? { VJ: Math.min(L.tags.VJ ?? 100, MANUAL_VJ[this.speed]) } : { V: Math.min(L.tags.V ?? 1500, MANUAL_V[this.speed]) };
    this.beginMotion(L.op, q, tags, null, { manual: true, done: () => {
      this.fwdDir = 0;
      const cc = this.compiled(this.cursor.job);
      const nx = cc.lines.findIndex((x, k) => k > this.cursor.line && isMov(x));
      this.msg(`Đã tới điểm dòng ${String(i).padStart(4, '0')}`);
      if (nx >= 0 && !back) this.cursor.line = nx;
    } });
  }

  /** Giữ FWD để tới tư thế khớp q (Work Home Pos, điểm P trên màn hình VARIABLE). Thả nút = dừng. */
  moveToJoint(q, down) {
    if (!down) { if (this.motion?.manual) this.motion = null; return; }
    if (this.mode !== 'TEACH' || !this.servo) { this.msg('Cần TEACH + servo ON (giữ Enable)', 'warn'); return; }
    if (this.busy) return;
    const bad = K.limitViolation(q);
    if (bad >= 0) { this.msg(`Điểm vượt giới hạn khớp ${K.AXES[bad]}`, 'warn'); return; }
    this.beginMotion('MOVJ', q.slice(), { VJ: MANUAL_VJ[this.speed] }, null, { manual: true, done: () => this.msg('Đã tới điểm') });
  }
  /** Bật/tắt ngõ ra bằng tay (INTERLOCK + SELECT trên màn hình IN/OUT, chỉ ở TEACH). */
  toggleOut(n) { if (this.mode !== 'TEACH') { this.msg('Chỉ bật/tắt ngõ ra bằng tay ở TEACH', 'warn'); return; } this.OT[n] = !this.OT[n]; this.emit('state'); }

  run(jobName, { line = 0, test = false } = {}) {
    const c = this.compiled(jobName);
    if (!c) { this.alarm(4501, jobName); return false; }
    // kiểm tra cú pháp mọi job liên quan
    for (const j of this.program.jobs) { const cj = this.compiled(j.name); if (cj.errors.length) { this.alarm(4502, `${j.name} dòng ${String(cj.errors[0].line).padStart(4, '0')}: ${cj.errors[0].message}`); return false; } }
    if (this.exec && this.exec.held && this.exec.stack.length && this.exec.stack[0].job === jobName && !test) {
      this.exec.held = false; this.exec.running = true; this.msg('Chạy tiếp'); this.emit('state'); return true;
    }
    this.exec = { running: true, test, held: false, stack: [{ job: c.job.name, pc: line }], wait: null, speedDefault: { VJ: 25, V: 100 } };
    this.shift = null;
    this.motion = null;
    this.program.master ||= c.job.name;
    this.msg(test ? `Chạy thử ${c.job.name}` : `START ${c.job.name}`);
    this.emit('state');
    return true;
  }
  stopProgram(reason) {
    if (this.exec) { this.exec.running = false; this.exec.held = true; }
    this.motion = null;
    if (reason) this.emit('state');
  }

  beginMotion(op, q1, tags, until, extra = {}) {
    const q0 = this.q.slice();
    let dur;
    if (op === 'MOVJ') {
      const vj = (tags.VJ ?? this.exec?.speedDefault.VJ ?? 25) / 100;
      dur = Math.max(...q1.map((v, i) => Math.abs(v - q0[i]) / (K.JOINTS[i].vmax * vj))) * 1000;
      this.motion = { op, q0, q1, dur, t: 0, until, ...extra };
    } else {
      const T0 = K.fk(q0, this.tool), T1 = K.fk(q1, this.tool);
      const p0 = K.pos(T0), p1 = K.pos(T1);
      const dist = K.norm(K.sub(p1, p0));
      const Rrel = relRot(T0, T1);
      let v = tags.V ?? this.exec?.speedDefault.V ?? 100;
      if (this.exec?.test) v = Math.min(v, TEST_LIMIT_MMS);
      dur = Math.max(dist / v, Rrel.angle / K.DEG / VR_MAX) * 1000;
      this.motion = { op, q0, q1, T0, p0, p1, R: Rrel, dur, t: 0, until, qPrev: q0, ...extra };
      this.stats.maxSpeedMms = Math.max(this.stats.maxSpeedMms, v);
    }
    // thời gian tăng/giảm tốc
    this.motion.acc = Math.min(200, this.motion.dur / 2);
    this.motion.dur += this.motion.acc;
    this.stats.moves++;
  }

  /** Một bước chuyển động. Trả true khi xong. */
  stepMotion(dt) {
    const M = this.motion;
    M.t = Math.min(M.dur, M.t + dt);
    const s = profile(M.t, M.dur, M.acc);
    if (M.op === 'MOVJ') this.q = M.q0.map((v, i) => v + (M.q1[i] - v) * s);
    else {
      const p = M.p0.map((v, i) => v + (M.p1[i] - v) * s);
      const R = rotLerp(M.T0, M.R, s);
      const Td = [R[0], R[1], R[2], p[0], R[3], R[4], R[5], p[1], R[6], R[7], R[8], p[2], 0, 0, 0, 1];
      if (M.t >= M.dur) this.q = M.q1.slice();
      else {
        const r = K.ik(Td, M.qPrev, this.tool, { iters: 30 });
        if (!r.ok || r.q.some((v, i) => Math.abs(v - M.qPrev[i]) > 15)) { this.alarm(4415, ''); return true; }
        this.q = r.q; M.qPrev = r.q;
      }
    }
    return M.t >= M.dur;
  }

  /* ================================================================ vòng thời gian */
  /** dt: ms. env: { check(q) → thông điệp va chạm | null } */
  step(dt, env) {
    this.time += dt;
    for (const p of this.pulses) if (this.time >= p.until) { this.OT[p.n] = false; p.done = true; }
    this.pulses = this.pulses.filter((p) => !p.done);
    if (!this.jogKeys.size) this.jogT = null;
    if (!this.servo) { this.motion = null; return; }
    // jog
    if (this.jogKeys.size && this.mode === 'TEACH' && this.enableHeld) {
      const sp = JOG[this.speed] || JOG.MED;
      const boost = this.highSpeed ? 2 : 1;
      this.stats.jogTime += dt;
      for (const k of this.jogKeys.keys()) {
        const [a, d] = k.split(':').map(Number);
        if (this.coord === 'JOINT') this.tryJoint(this.q.map((v, i) => (i === a ? v + d * K.JOINTS[i].vmax * sp.j * boost * dt / 1000 : v)));
        else this.cartStep(a < 3 ? a : -1, a >= 3 ? a - 3 : -1, d * (a < 3 ? sp.v : sp.r) * boost * dt / 1000);
      }
      this.checkEnv(env);
      return;
    }
    if (this.motion && this.motion.manual) {
      if (this.stepMotion(dt)) { const cb = this.motion?.done; this.motion = null; cb?.(); }
      this.checkEnv(env);
      return;
    }
    if (this.exec?.running) this.runProgram(dt, env);
  }
  checkEnv(env) {
    const hit = env?.check?.(this.q);
    if (hit) { this.jogKeys.clear(); this.alarm(4100, hit); }
  }

  evalVal(v) {
    if (v.k === 'const') return v.v;
    if (v.k === 'var') return this.vars[v.t][v.n];
    if (v.k === 'io') return v.kind === 'IN' ? (this.IN[v.n] ? 1 : 0) : (this.OT[v.n] ? 1 : 0);
    return 0;
  }
  evalCond(c) {
    if (!c) return true;
    if (c.k === 'and') return c.items.every((x) => this.evalCond(x));
    if (c.k === 'or') return c.items.some((x) => this.evalCond(x));
    const a = this.evalVal(c.a), b = this.evalVal(c.b);
    switch (c.op) { case '=': return a === b; case '<>': return a !== b; case '>': return a > b; case '<': return a < b; case '>=': return a >= b; case '<=': return a <= b; }
    return false;
  }
  setVar(dst, v) {
    const lim = { B: [0, 255], I: [-32768, 32767], D: [-2147483648, 2147483647] }[dst.t];
    if (lim) { v = Math.trunc(v); if (dst.t === 'B') v = ((v % 256) + 256) % 256; else v = Math.max(lim[0], Math.min(lim[1], v)); }
    this.vars[dst.t][dst.n] = v;
  }

  runProgram(dt, env) {
    const X = this.exec;
    if (this.holding) return;
    let budget = 400;   // số lệnh không chờ tối đa mỗi ms
    let remaining = dt;
    while (X.running && budget-- > 0) {
      const fr = X.stack[X.stack.length - 1];
      if (!fr) { this.finishProgram(); return; }
      this.cursor = { job: fr.job, line: fr.pc };
      // lệnh đang chờ
      if (this.motion) {
        if (this.motion.until && this.evalCond(this.motion.until)) { this.motion = null; fr.pc++; continue; }
        const done = this.stepMotion(remaining);
        this.checkEnv(env);
        if (!this.exec?.running) return;
        if (done) { this.motion = null; fr.pc++; if (this.cycle === 'STEP') { X.running = false; return; } continue; }
        return;
      }
      if (X.wait) {
        const w = X.wait;
        w.t += remaining; remaining = 0;
        if (w.kind === 'timer') { if (w.t >= w.dur) { X.wait = null; fr.pc++; continue; } return; }
        if (w.kind === 'wait') { if (this.evalCond(w.cond) || (w.timeout && w.t >= w.timeout * 1000)) { X.wait = null; fr.pc++; continue; } return; }
      }
      const c = this.compiled(fr.job);
      if (!c) { this.alarm(4501, fr.job); return; }
      const L = c.lines[fr.pc];
      if (!L) { // hết dòng = END
        this.retFrom(); continue;
      }
      if (!this.execLine(L, fr, c)) return;
    }
    if (budget <= 0 && X.running) this.alarm(4505, `${this.cursor.job} dòng ${String(this.cursor.line).padStart(4, '0')}`);
  }
  retFrom() {
    const X = this.exec;
    X.stack.pop();
    if (!X.stack.length) { this.finishProgram(); return; }
    X.stack[X.stack.length - 1].pc++;
  }
  finishProgram() {
    const X = this.exec;
    const master = this.program.master;
    if (X && !X.test && this.cycle === 'AUTO' && master) { X.stack = [{ job: master, pc: 0 }]; return; }
    if (X) { X.running = false; X.stack = []; X.held = false; }
    this.cursor = { job: master || this.cursor.job, line: 0 };
    this.msg('Kết thúc chương trình');
    this.emit('state');
  }

  /** Thực hiện 1 dòng. Trả false nếu phải dừng vòng (lệnh chờ đã bắt đầu / dừng). */
  execLine(L, fr, c) {
    const X = this.exec;
    const next = () => { fr.pc++; return true; };
    switch (L.op) {
      case 'NOP': case 'COMMENT': case 'LABEL': case 'ENDIF': return next();
      case 'ELSE': case 'ELSEIF': fr.pc = L.endif + 1; return true;   // hết nhánh đã chọn → sau ENDIF
      case 'END': this.retFrom(); return true;
      case 'MOVJ': case 'MOVL': {
        const q = this.resolveTarget(L, fr.job);
        if (!q) return false;
        if (L.until && this.evalCond(L.until)) return next();
        this.beginMotion(L.op, q, L.tags, L.until);
        if (X.test && L.op === 'MOVJ') { this.motion.dur = Math.max(this.motion.dur, 0); }
        return true;
      }
      case 'SPEED': Object.assign(X.speedDefault, L.tags); return next();
      case 'DOUT': if (this.evalCond(L.cond)) this.OT[L.io.n] = !!this.evalVal(L.value); return next();
      case 'PULSE': this.OT[L.io.n] = true; this.pulses = this.pulses.filter((p) => p.n !== L.io.n); this.pulses.push({ n: L.io.n, until: this.time + L.t * 1000 }); return next();
      case 'DIN': this.setVar(L.dst, this.evalVal(L.io)); return next();
      case 'WAIT': X.wait = { kind: 'wait', cond: L.cond, timeout: L.timeout, t: 0 }; if (this.evalCond(L.cond)) { X.wait = null; return next(); } return false;
      case 'TIMER': X.wait = { kind: 'timer', dur: L.t * 1000, t: 0 }; return false;
      case 'JUMP': {
        if (!this.evalCond(L.cond)) return next();
        if (L.label) { fr.pc = c.labels[L.label]; return true; }
        if (!this.findJob(L.job)) { this.alarm(4501, L.job); return false; }
        fr.job = this.findJob(L.job).name; fr.pc = 0; return true;
      }
      case 'CALL': {
        if (!this.evalCond(L.cond)) return next();
        const j = this.findJob(L.job);
        if (!j) { this.alarm(4501, L.job); return false; }
        if (X.stack.length >= 16) { this.alarm(4504, L.job); return false; }
        X.stack.push({ job: j.name, pc: 0 }); return true;
      }
      case 'RET': if (!this.evalCond(L.cond)) return next(); this.retFrom(); return true;
      case 'PAUSE': if (!this.evalCond(L.cond)) return next(); fr.pc++; X.running = false; X.held = true; this.msg('PAUSE — nhấn START để chạy tiếp'); this.emit('state'); return false;
      case 'IF': {
        if (this.evalCond(L.cond)) return next();
        let k = L.next;   // xét lần lượt ELSEIF / ELSE / ENDIF
        for (;;) {
          const N = c.lines[k];
          if (N.op === 'ELSEIF') { if (this.evalCond(N.cond)) { fr.pc = k + 1; return true; } k = N.next; continue; }
          fr.pc = k + 1; return true;   // ELSE: vào thân; ENDIF: ra ngoài
        }
      }
      case 'SET': case 'ADD': case 'SUB': case 'MUL': case 'DIV': case 'AND': case 'OR': case 'XOR': {
        if (L.posOp) {
          const b = this.getP(L.src.n);
          if (!b) { this.alarm(4500, pName(L.src.n)); return false; }
          if (L.op === 'SET') { this.setP(L.dst.n, JSON.parse(JSON.stringify(b))); return next(); }
          const a = this.getP(L.dst.n);
          if (!a) { this.alarm(4500, pName(L.dst.n)); return false; }
          const va = a.type === 'BASE' ? a.p : a.q, vb = b.type === 'BASE' ? b.p : b.q;
          const sg = L.op === 'ADD' ? 1 : -1;
          const out = va.map((v, i) => v + sg * vb[i]);
          this.setP(L.dst.n, a.type === 'BASE' ? { type: 'BASE', p: out } : { type: 'PULSE', q: out });
          return next();
        }
        const a = this.vars[L.dst.t][L.dst.n], b = this.evalVal(L.src);
        const r = { SET: b, ADD: a + b, SUB: a - b, MUL: a * b, DIV: b === 0 ? a : (L.dst.t === 'R' ? a / b : Math.trunc(a / b)), AND: a & b, OR: a | b, XOR: a ^ b }[L.op];
        this.setVar(L.dst, r); return next();
      }
      case 'INC': this.setVar(L.dst, this.vars[L.dst.t][L.dst.n] + 1); return next();
      case 'DEC': this.setVar(L.dst, this.vars[L.dst.t][L.dst.n] - 1); return next();
      case 'NOT': this.setVar(L.dst, ~this.vars[L.dst.t][L.dst.n] & 255); return next();
      case 'SFTON': {
        const p = this.getP(L.src.n);
        if (!p) { this.alarm(4500, pName(L.src.n)); return false; }
        if (p.type !== 'BASE') { this.alarm(4500, `${pName(L.src.n)} phải là kiểu BASE (offset XYZ)`); return false; }
        this.shift = p.p.slice(0, 3); return next();
      }
      case 'SFTOF': this.shift = null; return next();
      default: return next();
    }
  }

  /* ================================================================ trạng thái cho UI */
  pose() { return K.fkPose(this.q, this.tool); }
  userPose() { const T = K.mul(K.inv(K.userFrameT(this.userFrame)), K.fk(this.q, this.tool)); return K.tToPose(T); }
  pulses6() { return K.degToPulse(this.q); }
  status() {
    return {
      mode: this.mode, servo: this.servo, servoReady: this.servoReady, estop: this.estopped, hold: this.holding,
      running: this.busy, alarm: this.hasAlarm, coord: this.coord, speed: this.speed, cycle: this.cycle,
      job: this.cursor.job, line: this.cursor.line,
    };
  }
  snapshot() { return { q: this.q.slice(), OT: this.OT.slice(), vars: JSON.parse(JSON.stringify(this.vars)) }; }
}

/* ------------------------------------------------------------ hỗ trợ nội suy */
function profile(t, dur, acc) {
  // vận tốc hình thang chuẩn hóa: s(0)=0, s(dur)=1
  if (dur <= 0) return 1;
  const a = Math.min(acc, dur / 2), vmax = 1 / (dur - a);
  if (t < a) return 0.5 * vmax * t * t / a;
  if (t > dur - a) { const r = dur - t; return 1 - 0.5 * vmax * r * r / a; }
  return vmax * (t - a / 2);
}
function relRot(T0, T1) {
  // R = R0ᵀ R1 → trục-góc
  const R0 = [[T0[0], T0[1], T0[2]], [T0[4], T0[5], T0[6]], [T0[8], T0[9], T0[10]]];
  const R1 = [[T1[0], T1[1], T1[2]], [T1[4], T1[5], T1[6]], [T1[8], T1[9], T1[10]]];
  const R = [0, 1, 2].map((i) => [0, 1, 2].map((j) => R0[0][i] * R1[0][j] + R0[1][i] * R1[1][j] + R0[2][i] * R1[2][j]));
  const c = Math.max(-1, Math.min(1, (R[0][0] + R[1][1] + R[2][2] - 1) / 2));
  const angle = Math.acos(c);
  let axis = [R[2][1] - R[1][2], R[0][2] - R[2][0], R[1][0] - R[0][1]];
  const n = Math.hypot(...axis);
  if (n < 1e-9) {
    if (angle < 1e-6) axis = [0, 0, 1];
    else { // 180°
      const d = [R[0][0], R[1][1], R[2][2]]; const k = d.indexOf(Math.max(...d));
      const v = [0, 1, 2].map((i) => (i === k ? Math.sqrt(Math.max(0, (R[k][k] + 1) / 2)) : R[i][k] / (2 * Math.sqrt(Math.max(1e-12, (R[k][k] + 1) / 2)))));
      axis = v;
    }
  } else axis = axis.map((v) => v / n);
  return { axis, angle };
}
function rotLerp(T0, Rrel, s) {
  const th = Rrel.angle * s; const [x, y, z] = Rrel.axis;
  const c = Math.cos(th), sn = Math.sin(th), v = 1 - c;
  const Rr = [[c + x * x * v, x * y * v - z * sn, x * z * v + y * sn], [y * x * v + z * sn, c + y * y * v, y * z * v - x * sn], [z * x * v - y * sn, z * y * v + x * sn, c + z * z * v]];
  const R0 = [[T0[0], T0[1], T0[2]], [T0[4], T0[5], T0[6]], [T0[8], T0[9], T0[10]]];
  const out = [];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) out.push(R0[i][0] * Rr[0][j] + R0[i][1] * Rr[1][j] + R0[i][2] * Rr[2][j]);
  return out;
}
