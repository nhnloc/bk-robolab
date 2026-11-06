// Mô phỏng trạm thí nghiệm robot: robot MotoMINI + bộ điều khiển YRC1000micro, vật thao tác (trụ thép),
// nam châm, và (trạm Mechatro) machine controller MP3300 + băng tải + mâm xoay + thanh trượt B/C.
import * as K from '../robot/kinematics.js';
import { RobotController } from '../robot/controller.js';
import { handleRequest, HSE_PORT, hexDump } from '../robot/hse.js';
import { MachineController } from '../mc/mp3300.js';
import { TABLE_Z, PUCK, TOOL, PALETTE, CONVEYOR, ROTARY, GANTRY, BIN, slotXY } from './layout.js';

let uid = 1;
const newId = () => 'p' + uid++;
const STEEL = '#8d99a6';

/* ======================================================================= lớp cơ sở */
export class Cell {
  constructor(def) {
    this.def = def;
    this.robot = new RobotController({ tool: { ...TOOL }, ip: '192.168.1.11' });
    this.mc = null;
    this.items = [];
    this.events = [];
    this.panel = {};
    for (const b of def.buttons || []) this.panel[b.id] = !!b.initial;
    this.stats = { placed: 0, delivered: 0, drops: 0, crashes: 0, cycleTimeMs: 0, pulses: {} };
    this.time = 0;
    this.netLog = [];
    this.network = { send: (conn, bytes, from) => this.udpSend(conn, bytes, from) };
    this.faults = {}; for (const f of def.faults || []) this.faults[f.id] = false;
  }
  log(message, level = 'warn') { this.events.push({ t: this.time, message, level }); if (this.events.length > 200) this.events.shift(); }
  press(id, down) {
    const b = this.def.buttons.find((x) => x.id === id);
    if (!b) return;
    if (b.kind === 'latching' || b.kind === 'selector') { if (down) this.panel[id] = !this.panel[id]; }
    else this.panel[id] = !!down;
    if (down && b.action) this.action(b.action);
  }
  action() {}
  setFault(id, on) { if (id in this.faults) { this.faults[id] = !!on; this.log(`${on ? 'Bật' : 'Tắt'} lỗi: ${id}`, 'info'); } }

  reset() {
    this.items = []; this.events = []; this.netLog = [];
    this.stats = { placed: 0, delivered: 0, drops: 0, crashes: 0, cycleTimeMs: 0, pulses: {} };
    const prog = this.robot.program;
    this.robot.resetState(); this.robot.loadProgram(prog);
    this.robot.q = this.homeQ ? this.homeQ.slice() : [0, 0, 0, 0, 0, 0];
    for (const b of this.def.buttons || []) this.panel[b.id] = !!b.initial;
    this.init();
  }
  init() {}

  /* ---------------- mạng Ethernet (UDP) ---------------- */
  udpSend(conn, bytes, from) {
    const entry = { t: this.time, from, to: `${conn.remoteIp}:${conn.remotePort}`, req: hexDump(bytes) };
    let r = { delivered: false };
    if (conn.remoteIp !== this.robot.ip) entry.info = `Không có thiết bị nào ở ${conn.remoteIp}`;
    else if (+conn.remotePort !== HSE_PORT) entry.info = `Robot không nghe ở cổng ${conn.remotePort} (High-Speed Ethernet Server dùng ${HSE_PORT})`;
    else if (conn.type && conn.type !== 'UDP') entry.info = 'Robot chỉ nhận UDP';
    else if (conn.code && conn.code !== 'BIN') entry.info = 'Khung gửi dạng ASCII — robot cần mã BIN';
    else {
      const h = handleRequest(this.robot, bytes);
      entry.res = hexDump(h.response); entry.info = h.info; entry.ok = h.ok;
      r = { delivered: true, ok: h.ok, info: h.info, response: h.response };
    }
    this.netLog.push(entry); if (this.netLog.length > 60) this.netLog.shift();
    return r;
  }

  /* ---------------- vật thao tác ---------------- */
  puck(x, y, z, extra = {}) { const p = { id: newId(), kind: 'puck', x, y, z, size: [PUCK.d, PUCK.d, PUCK.h], color: STEEL, on: 'table', ...extra }; this.items.push(p); return p; }
  /** Bề mặt đỡ tại (x,y): { z, on } — không tính vật trong danh sách bỏ qua. */
  surfaceAt(x, y) { return { z: 0, on: 'table' }; }
  supportAt(x, y, skip) {
    let best = this.surfaceAt(x, y);
    for (const p of this.items) {
      if (p === skip || p.held || p.lost) continue;
      if (Math.hypot(p.x - x, p.y - y) < PUCK.d * 0.9) { const top = p.z + PUCK.h; if (top > best.z) best = { z: top, on: 'stack', under: p }; }
    }
    return best;
  }
  /** TCP và hướng trục dụng cụ. */
  tcp(q = this.robot.q) { const T = K.fk(q, this.robot.tool); return { p: K.pos(T), z: K.col(T, 2), T }; }

  /** Kiểm tra va chạm của robot ở tư thế q (gọi mỗi bước chuyển động). */
  checkRobot(q) {
    const { p } = this.tcp(q);
    const held = this.held;
    const tipZ = p[2] - (held ? PUCK.h : 0);
    const sup = this.supportAt(p[0], p[1], held);
    if (tipZ < sup.z - 1.5) {
      this.stats.crashes++;
      const what = sup.on === 'stack' ? 'vật thao tác' : sup.on === 'conveyor' ? 'băng tải' : sup.on === 'rotary' ? 'mâm xoay' : sup.on === 'palette' ? 'pallet' : 'mặt bàn';
      this.log(`VA CHẠM: dụng cụ ${held ? '(đang giữ vật) ' : ''}đâm vào ${what} tại X=${p[0].toFixed(0)} Y=${p[1].toFixed(0)} Z=${p[2].toFixed(0)}`, 'error');
      this.crashAt = { t: this.time, p };
      return `dụng cụ chạm ${what}`;
    }
    // cổ tay (trục B) không được xuống dưới mặt bàn
    const fr = []; K.fk(q, null, fr);
    const wb = K.pos(fr[4]);
    const wz = wb[2] + 0;  // tâm trục B (vị trí tuyệt đối)
    const bq = K.JOINTS[4].q; const B = [fr[4][0] * bq[0] + fr[4][1] * bq[1] + fr[4][2] * bq[2] + fr[4][3], fr[4][4] * bq[0] + fr[4][5] * bq[1] + fr[4][6] * bq[2] + fr[4][7], fr[4][8] * bq[0] + fr[4][9] * bq[1] + fr[4][10] * bq[2] + fr[4][11]];
    if (B[2] < 20 + this.surfaceAt(B[0], B[1]).z) { this.stats.crashes++; this.log('VA CHẠM: cổ tay robot chạm mặt bàn', 'error'); return 'cổ tay chạm bàn'; }
    void wz;
    return null;
  }

  /** Nam châm robot (OT#1). */
  magnetRobot(on) {
    const { p, z } = this.tcp();
    if (on && !this.held) {
      if (z[2] > -0.9) return;   // dụng cụ phải hướng xuống
      const c = this.items.find((it) => !it.held && !it.lost && Math.hypot(it.x - p[0], it.y - p[1]) < 8 && (p[2] - (it.z + PUCK.h)) > -2 && (p[2] - (it.z + PUCK.h)) < 6 && !this.items.some((o) => o !== it && !o.held && Math.hypot(o.x - it.x, o.y - it.y) < PUCK.d * 0.9 && o.z > it.z));
      if (c) { this.held = c; c.held = 'robot'; c.on = 'robot'; this.detach(c); }
    } else if (!on && this.held) {
      const c = this.held; this.held = null; c.held = false;
      this.drop(c, 'robot');
    }
    if (this.held) { this.held.x = p[0]; this.held.y = p[1]; this.held.z = p[2] - PUCK.h; }
  }
  detach() {}
  /** Thả vật: rơi xuống bề mặt đỡ bên dưới. */
  drop(c, by) {
    const sup = this.supportAt(c.x, c.y, c);
    const fall = c.z - sup.z;
    if (fall > 15 && sup.on !== 'bin' && sup.under?.on !== 'bin') { this.stats.drops++; this.log(`Thả rơi vật từ độ cao ${fall.toFixed(0)} mm`, 'warn'); }
    c.z = sup.z; c.on = sup.on; c.under = sup.under || null;
    if (sup.on === 'floor') { c.lost = true; this.log('Vật rơi khỏi bàn', 'warn'); }
    this.onDropped(c, sup, by);
  }
  onDropped() {}

  /* ---------------- vòng thời gian ---------------- */
  step(dt) {
    this.time += dt;
    this.stepIo(dt);
    this.robot.step(dt, { check: (q) => this.checkRobot(q) });
    this.magnetRobot(!!this.robot.OT[1]);
    this.physics(dt);
    // đếm xung trên ngõ ra robot (cho chấm bài)
    for (let n = 1; n <= 16; n++) { const v = !!this.robot.OT[n]; if (v && !this._ot?.[n]) (this.stats.pulses[n] ||= []).push(this.time); (this._ot ||= [])[n] = v; }
  }
  stepIo() {}
  physics() {}

  /* ---------------- hình ảnh 3D ---------------- */
  getVisual() {
    const parts = {};
    const nodes = ['link_S', 'link_L', 'link_U', 'link_R', 'link_B', 'link_T'];
    this.robot.q.forEach((v, i) => { parts[nodes[i]] = v; });
    return {
      parts,
      items: this.items.filter((it) => !it.lost).map((it) => ({ ...it, z: it.z + TABLE_Z, under: undefined })),
      leds: this.leds ? this.leds() : {},
      outs: this.outs ? this.outs() : {},
      belts: {}, effects: [],
      crashed: this.robot.alarms.find((a) => a.code === 4100) ? { message: this.robot.alarms.find((a) => a.code === 4100).detail } : null,
    };
  }
}

/* ======================================================================= Trạm MotoMINI (Bài 1) */
const SW = (i, desc) => ({ id: 'SW' + i, label: 'I' + i, kind: 'latching', color: 'black', desc });

export class MotoMiniCell extends Cell {
  constructor() {
    super({
      id: 'motomini',
      title: 'Trạm robot MotoMINI + pallet',
      summary: 'Robot MotoMINI 6 bậc tự do với bộ điều khiển YRC1000micro, dụng cụ nam châm (OT#1) và pallet có các ô A1, A2, A3, B, C. Control Panel: công tắc I4–I7 nối IN#5–IN#8, đèn Q4–Q7 nối OT#5–OT#8.',
      robotIo: {
        inputs: [5, 6, 7, 8].map((n) => ({ n, tag: `IN#${n}`, desc: `Công tắc I${n - 1} trên Control Panel` })),
        outputs: [{ n: 1, tag: 'OT#1', desc: 'Nam châm trên dụng cụ' }, ...[5, 6, 7, 8].map((n) => ({ n, tag: `OT#${n}`, desc: `Đèn Q${n - 1} trên Control Panel` }))],
      },
      buttons: [SW(4, 'IN#5'), SW(5, 'IN#6'), SW(6, 'IN#7'), SW(7, 'IN#8')],
      faults: [],
    });
    this.homeQ = [0, 0, 0, 0, 0, 0];
    this.init();
  }
  init() {
    this.held = null;
    this.setup('A12');
  }
  /** Đặt vật lên pallet theo kịch bản: 'A12' (A1, A2), 'A123' (A1, A2, A3), 'none'. */
  setup(kind) {
    this.items = []; this.held = null;
    const cells = kind === 'A123' ? ['A1', 'A2', 'A3'] : kind === 'A12' ? ['A1', 'A2'] : [];
    cells.forEach((c, i) => { const [x, y] = PALETTE.cells[c]; this.puck(x, y, PALETTE.top, { label: String(i + 1), home: c }); });
    this.scene = kind;
  }
  surfaceAt(x, y) {
    const [cx, cy] = PALETTE.center, [sx, sy] = PALETTE.size;
    if (Math.abs(x - cx) <= sx / 2 && Math.abs(y - cy) <= sy / 2) return { z: PALETTE.top, on: 'palette' };
    if (Math.abs(x) < 600 && Math.abs(y) < 450) return { z: 0, on: 'table' };
    return { z: -TABLE_Z, on: 'floor' };
  }
  /** Ô pallet gần nhất (≤ 8 mm) của vật, hoặc null. */
  cellOf(it) {
    for (const [k, [x, y]] of Object.entries(PALETTE.cells)) if (Math.hypot(it.x - x, it.y - y) <= 8) return k;
    return null;
  }
  stepIo() {
    for (let i = 4; i <= 7; i++) this.robot.IN[i + 1] = !!this.panel['SW' + i];
  }
  onDropped(c) { const cell = this.cellOf(c); if (cell) this.stats.placed++; }
  outs() { const o = {}; for (let i = 4; i <= 7; i++) o['Q' + i] = !!this.robot.OT[i + 1]; o.MAG = !!this.robot.OT[1]; return o; }
  leds() { const l = {}; for (let i = 4; i <= 7; i++) l['I' + i] = !!this.panel['SW' + i]; return l; }
  getVisual() {
    const v = super.getVisual();
    for (let i = 4; i <= 7; i++) v.parts['btn_SW' + i] = this.panel['SW' + i] ? 1 : 0;
    return v;
  }
}

/* ======================================================================= Trạm Mechatro (Bài 2–3) */
const DI = (n, tag, desc) => ({ addr: `%I${n >> 3}.${n & 7}`, tag: `DI_${String(n).padStart(2, '0')}`, desc: tag ? `${tag} — ${desc}` : desc, mp: 'IB' + (n).toString(16).toUpperCase().padStart(5, '0') });
const DO = (n, tag, desc) => ({ addr: `%Q${n >> 3}.${n & 7}`, tag: `DO_${String(n).padStart(2, '0')}`, desc: tag ? `${tag} — ${desc}` : desc, mp: 'OB' + (n).toString(16).toUpperCase().padStart(5, '0') });

export const MECHATRO_IO = {
  inputs: [
    DI(0, 'START', 'Nút START (Control Panel)'), DI(1, 'STOP', 'Nút STOP (Control Panel)'),
    DI(2, 'SERVO_ON', 'Nút Servo ON'), DI(3, 'ROBOT_ON', 'Nút Robot ON'),
    DI(4, 'POT_B', 'Cảm biến hành trình dương trục B'), DI(5, 'NOT_B', 'Cảm biến hành trình âm trục B'), DI(6, 'HOME_B', 'Cảm biến gốc trục B'),
    DI(7, 'POT_C', 'Cảm biến hành trình dương trục C'), DI(8, 'NOT_C', 'Cảm biến hành trình âm trục C'), DI(9, 'HOME_C', 'Cảm biến gốc trục C'),
    DI(10, 'HOME_A', 'Cảm biến gốc (tiệm cận) mâm xoay'), DI(11, 'SEN_CV', 'Cảm biến có vật cuối băng tải'),
    DI(12, 'OT#3', 'Robot báo đã thả vật lên mâm xoay'),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => DI(16 + i, '', `Công tắc I${i} — Control Panel`)),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => DI(24 + i, '', `Công tắc I${i} — I/O Box`)),
  ],
  outputs: [
    DO(0, 'S1', 'Biến tần J1000: chạy băng tải'),
    DO(1, 'IN#1', 'Báo robot: có vật ở vị trí gắp trên băng tải'),
    DO(2, 'IN#2', 'Báo robot: có vật ở vị trí thả trên mâm xoay'),
    DO(3, 'IN#3', 'Tín hiệu tới robot IN#3'), DO(4, 'IN#4', 'Tín hiệu tới robot IN#4'),
    DO(5, 'MAG2', 'Nam châm trên trục C'),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => DO(16 + i, '', `Đèn Q${i} — Control Panel`)),
    ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => DO(24 + i, '', `Đèn Q${i} — I/O Box`)),
  ],
};

export class MechatroCell extends Cell {
  constructor(opts = {}) {
    super({
      id: 'mechatro',
      title: 'Hệ luân chuyển vật Mechatro: robot + MP3300 + servo',
      summary: 'Băng tải (biến tần J1000) đưa vật tới vị trí gắp; robot MotoMINI gắp đặt lên mâm xoay (servo trục A); hệ thanh trượt ngang B + dọc C (servo, vít me) có nam châm MAG2 lấy vật từ mâm xoay bỏ vào thùng. Machine controller MP3300 điều khiển băng tải, servo và trao đổi tín hiệu với robot qua I/O và Ethernet.',
      ioMap: MECHATRO_IO,
      robotIo: {
        inputs: [1, 2, 3, 4].map((n) => ({ n, tag: `IN#${n}`, desc: `Từ MC DO_0${n}` })),
        outputs: [{ n: 1, tag: 'OT#1', desc: 'Nam châm robot' }, { n: 3, tag: 'OT#3', desc: 'Tới MC DI_12' }],
      },
      buttons: [
        { id: 'START', label: 'START', kind: 'momentary', color: 'green' },
        { id: 'STOP', label: 'STOP', kind: 'momentary', color: 'red' },
        { id: 'SERVO_ON', label: 'Servo ON', kind: 'momentary', color: 'blue' },
        { id: 'ROBOT_ON', label: 'Robot ON', kind: 'momentary', color: 'blue' },
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: 'P' + i, label: 'I' + i, kind: 'latching', color: 'black', group: 'panel', desc: `DI_${16 + i}` })),
        ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ id: 'X' + i, label: 'I' + i, kind: 'latching', color: 'black', group: 'iobox', desc: `DI_${24 + i}` })),
        { id: 'Feed', label: 'Cấp vật lên băng tải', kind: 'latching', color: 'grey', initial: true, group: 'sim' },
        { id: 'TakeOut', label: 'Lấy vật khỏi mâm xoay', kind: 'momentary', color: 'grey', group: 'sim', action: 'takeOut' },
      ],
      faults: [{ id: 'sensorCv', label: 'Cảm biến băng tải hỏng (luôn 0)' }, { id: 'homeA', label: 'Cảm biến HOME_A hỏng' }],
    });
    // Robot tư thế nghỉ: tay gập, dụng cụ hướng xuống phía trên vùng làm việc
    this.homeQ = [0, 0, 0, 0, 0, 0];
    this.mc = new MachineController({
      io: MECHATRO_IO,
      network: this.network,
      axesHw: {
        A1: { unit: 'deg', rotary: true, physMin: -1e9, physMax: 1e9, maxSpeed: 360, physStart: 0, prm: { creep: 50, zrnSpeed: 50, speedRef: 90, zrnSignal: 'DI_10', zrnTravel: 0 } },
        B1: { unit: 'mm', rotary: false, physMin: GANTRY.bPhys[0], physMax: GANTRY.bPhys[1], maxSpeed: 200, physStart: -120, potAt: GANTRY.bPot, notAt: GANTRY.bNot, prm: { creep: 20, zrnSpeed: 20, speedRef: 50, zrnSignal: 'DI_06', zrnTravel: 0 } },
        C1: { unit: 'mm', rotary: false, physMin: GANTRY.cPhys[0], physMax: GANTRY.cPhys[1], maxSpeed: 150, physStart: -30, potAt: GANTRY.cPot, notAt: GANTRY.cNot, prm: { creep: 20, zrnSpeed: 20, speedRef: 50, zrnSignal: 'DI_09', zrnTravel: 0 } },
      },
    });
    this.opts = opts;
    this.init();
  }
  init() {
    this.held = null; this.gHeld = null;
    this.belt = { v: 0, offset: 0 };
    this.spawnT = 500; this.spawned = 0;
    const rnd = this.opts.seed !== undefined ? mulberry(this.opts.seed) : Math.random;
    // vị trí vật lý ngẫu nhiên lúc bật nguồn (encoder tương đối)
    const ax = this.mc.axes;
    ax.A1.phys = this.opts.aStart ?? Math.round(20 + rnd() * 300); ax.B1.phys = this.opts.bStart ?? Math.round(-60 - rnd() * 180); ax.C1.phys = this.opts.cStart ?? Math.round(-10 - rnd() * 30);
    for (const a of Object.values(ax)) a.reset(true);
    this.mcIn = {};
  }
  reset() {
    this.mc.stop();
    super.reset();
    this.mc.tasks.clear(); this.mc.regs.clear(); this.mc.netLog = [];
  }
  action(a) {
    if (a === 'takeOut') {
      const k = this.robotSlot();
      const [x, y] = slotXY(k, this.mc.axes.A1.phys);
      const p = this.items.filter((it) => it.on === 'rotary' && it.slot === k || (it.on === 'stack' && Math.hypot(it.x - x, it.y - y) < 10)).filter((it) => !it.held);
      if (p.length) { for (const it of p) it.lost = true, it.taken = true; this.items = this.items.filter((it) => !it.taken); this.log('Người vận hành lấy vật khỏi mâm xoay', 'info'); this.stats.takenOut = (this.stats.takenOut || 0) + 1; }
    }
  }
  /** Khe đang ở vị trí robot thả (góc 135°). */
  robotSlot() { return slotNear(this.mc.axes.A1.phys, 135); }
  gantrySlot() { return slotNear(this.mc.axes.A1.phys, 225); }

  surfaceAt(x, y) {
    if (y > CONVEYOR.y - CONVEYOR.width / 2 && y < CONVEYOR.y + CONVEYOR.width / 2 && x > CONVEYOR.x0 && x < CONVEYOR.x1 + 25) return { z: x > CONVEYOR.x1 ? CONVEYOR.top + 40 : CONVEYOR.top, on: x > CONVEYOR.x1 ? 'stopper' : 'conveyor' };
    const [rx, ry] = ROTARY.center;
    if (Math.hypot(x - rx, y - ry) <= ROTARY.radius) {
      const a = this.mc.axes.A1.phys;
      for (let k = 0; k < 4; k++) { const [sx, sy] = slotXY(k, a); if (Math.hypot(x - sx, y - sy) <= ROTARY.slotR) return { z: ROTARY.top, on: 'rotary', slot: k }; }
      return { z: ROTARY.top, on: 'rotary', slot: -1 };
    }
    const [bx, by] = BIN.center;
    if (Math.abs(x - bx) <= BIN.size[0] / 2 && Math.abs(y - by) <= BIN.size[1] / 2) {
      const inner = Math.abs(x - bx) <= BIN.size[0] / 2 - 4 && Math.abs(y - by) <= BIN.size[1] / 2 - 4;
      return inner ? { z: BIN.floor, on: 'bin' } : { z: BIN.wall, on: 'binwall' };
    }
    if (x > -500 && x < 600 && y > -480 && y < 380) return { z: 0, on: 'table' };
    return { z: -TABLE_Z, on: 'floor' };
  }
  supportAt(x, y, skip) {
    const s = super.supportAt(x, y, skip);
    if (s.on === 'rotary') { const su = this.surfaceAt(x, y); s.slot = su.slot; }
    return s;
  }
  onDropped(c, sup, by) {
    if (sup.on === 'rotary') { c.slot = sup.slot; c.on = 'rotary'; if (by === 'robot') { this.stats.placed++; if (sup.slot < 0) { this.log('Vật đặt lệch khe trên mâm xoay', 'warn'); this.stats.misplaced = (this.stats.misplaced || 0) + 1; } } }
    if (sup.on === 'stack' && sup.under?.on === 'rotary') { c.slot = sup.under.slot; c.on = 'rotary'; this.log('Đặt chồng lên vật đang có trên mâm xoay', 'warn'); this.stats.stacked = (this.stats.stacked || 0) + 1; }
    if (sup.on === 'bin' || sup.under?.on === 'bin') {
      c.on = 'bin'; c.binned = this.time; this.stats.delivered++; if (this._lastDel !== undefined) this.stats.cycleTimeMs = Math.round(this.time - this._lastDel); this._lastDel = this.time; }
    if (sup.on === 'conveyor') c.on = 'conveyor';
  }

  /** Ánh xạ I/O giữa thiết bị và MC / robot. */
  readMcInput(tag) { return !!this.mc.io.inputs[tag]; }
  stepIo(dt) {
    const I = this.mc.io.inputs, Q = this.mc.io.outputs, P = this.panel;
    const ax = this.mc.axes;
    I.DI_00 = !!P.START; I.DI_01 = !!P.STOP; I.DI_02 = !!P.SERVO_ON; I.DI_03 = !!P.ROBOT_ON;
    I.DI_04 = ax.B1.phys >= GANTRY.bPot; I.DI_05 = ax.B1.phys <= GANTRY.bNot; I.DI_06 = Math.abs(ax.B1.phys) <= GANTRY.home;
    I.DI_07 = ax.C1.phys >= GANTRY.cPot; I.DI_08 = ax.C1.phys <= GANTRY.cNot; I.DI_09 = Math.abs(ax.C1.phys) <= GANTRY.home;
    const am = ((ax.A1.phys % 360) + 360) % 360;
    I.DI_10 = !this.faults.homeA && (am <= 1.5 || am >= 358.5);
    I.DI_11 = !this.faults.sensorCv && this.items.some((it) => it.on === 'conveyor' && !it.held && Math.abs(it.x - CONVEYOR.sensorX) <= 2);
    I.DI_12 = !!this.robot.OT[3];
    for (let i = 0; i < 8; i++) { I['DI_' + (16 + i)] = !!P['P' + i]; I['DI_' + (24 + i)] = !!P['X' + i]; }
    this.mc.step(dt, (tag) => !!I[tag]);
    for (let n = 1; n <= 4; n++) this.robot.IN[n] = !!Q['DO_0' + n];
    void Q;
  }

  physics(dt) {
    const Q = this.mc.io.outputs, ax = this.mc.axes;
    // băng tải (J1000: ramp 0.3 s, 60 mm/s)
    const target = Q.DO_00 ? 60 : 0;
    const dv = (60 / 300) * dt;
    this.belt.v = this.belt.v < target ? Math.min(target, this.belt.v + dv) : Math.max(target, this.belt.v - dv);
    const dx = this.belt.v * dt / 1000;
    this.belt.offset += dx;
    const onBelt = this.items.filter((it) => it.on === 'conveyor' && !it.held).sort((a, b) => b.x - a.x);
    let limit = CONVEYOR.stopX - PUCK.d / 2;
    for (const it of onBelt) { it.x = Math.min(it.x + dx, limit); limit = it.x - PUCK.d - 0.5; it.z = CONVEYOR.top; }
    // cấp vật
    this.spawnT -= dt;
    if (this.panel.Feed && this.spawnT <= 0) {
      const clear = !this.items.some((it) => it.on === 'conveyor' && it.x < CONVEYOR.x0 + 60);
      const maxN = this.opts.maxParts ?? 99;
      if (clear && this.spawned < maxN) { this.puck(CONVEYOR.x0 + 25, CONVEYOR.y, CONVEYOR.top, { on: 'conveyor', label: String(++this.spawned) }); }
      this.spawnT = this.opts.feedMs ?? 7000;
    }
    // mâm xoay: vật trên khe quay theo trục A
    const a = ax.A1.phys;
    if (this._lastA !== undefined && Math.abs(a - this._lastA) > 1e-6) {
      // robot đang cắm dụng cụ vào mâm khi quay → va chạm
      const t = this.tcp();
      if (Math.hypot(t.p[0] - ROTARY.center[0], t.p[1] - ROTARY.center[1]) < ROTARY.radius + 10 && t.p[2] < ROTARY.top + PUCK.h + 25) {
        if (!this._rotHit) { this.log('VA CHẠM: mâm xoay quay khi dụng cụ robot còn ở trên mâm', 'error'); this.stats.crashes++; this.robot.alarm(4100, 'mâm xoay va vào dụng cụ'); ax.A1.stop(); }
        this._rotHit = true;
      } else this._rotHit = false;
    }
    this._lastA = a;
    for (const it of this.items) {
      if (it.held || it.lost) continue;
      if (it.on === 'rotary' && it.slot >= 0) { const [x, y] = slotXY(it.slot, a); it.x = x; it.y = y; }
      else if (it.on === 'stack' || (it.on === 'rotary' && it.under)) { /* vật chồng: theo vật dưới */ }
    }
    for (const it of this.items) if (it.under && !it.held && !it.lost) { it.x = it.under.x; it.y = it.under.y; it.z = it.under.z + PUCK.h; if (it.under.on === 'rotary') it.on = 'rotary', it.slot = it.under.slot; }
    // vật trong thùng ra: biến mất sau 1 s (đã được đếm)
    if (this.items.some((it) => it.binned && this.time - it.binned > 1000)) this.items = this.items.filter((it) => !(it.binned && this.time - it.binned > 1000));
    // thanh trượt B/C + nam châm MAG2
    const gx = GANTRY.x0 + ax.B1.phys, gy = GANTRY.y, gz = GANTRY.cTop + ax.C1.phys;
    const tip = gz - (this.gHeld ? PUCK.h : 0);
    const sup = this.supportAt(gx, gy, this.gHeld);
    if (tip < sup.z - 1.5 && !this._gHit) {
      this._gHit = true; this.stats.crashes++;
      this.log(`VA CHẠM: nam châm trục C đâm vào ${sup.on === 'stack' ? 'vật' : sup.on === 'rotary' ? 'mâm xoay' : sup.on === 'binwall' ? 'thành thùng' : 'bề mặt'} (C = ${ax.C1.pos.toFixed(1)} mm)`, 'error');
      ax.C1.alarm = 0x07; ax.C1.stop(); ax.B1.stop();
    } else if (tip >= sup.z - 1.5) this._gHit = false;
    const mag = !!Q.DO_05;
    if (mag && !this.gHeld) {
      const c = this.items.find((it) => !it.held && !it.lost && Math.hypot(it.x - gx, it.y - gy) < 10 && Math.abs(it.z + PUCK.h - gz) < 4);
      if (c) { this.gHeld = c; c.held = 'gantry'; c.on = 'gantry'; c.slot = undefined; c.under = null; for (const o of this.items) if (o.under === c) o.under = null; }
    } else if (!mag && this.gHeld) { const c = this.gHeld; this.gHeld = null; c.held = false; this.drop(c, 'gantry'); }
    if (this.gHeld) { this.gHeld.x = gx; this.gHeld.y = gy; this.gHeld.z = gz - PUCK.h; }
  }
  detach(c) { c.slot = undefined; for (const o of this.items) if (o.under === c) o.under = null; c.under = null; }

  outs() {
    const Q = this.mc.io.outputs, o = {};
    for (let i = 0; i < 8; i++) { o['PQ' + i] = !!Q['DO_' + (16 + i)]; o['XQ' + i] = !!Q['DO_' + (24 + i)]; }
    o.MAG2 = !!Q.DO_05; o.S1 = !!Q.DO_00;
    return o;
  }
  leds() {
    const I = this.mc.io.inputs, l = {};
    for (const [k, v] of Object.entries(I)) l[k] = !!v;
    return l;
  }
  getVisual() {
    const v = super.getVisual();
    const ax = this.mc.axes;
    v.parts.table_A = ax.A1.phys;
    v.parts.slide_B = ax.B1.phys;
    v.parts.slide_C = ax.C1.phys;
    for (const b of this.def.buttons) if (b.kind === 'latching' && b.group !== 'sim') v.parts['btn_' + b.id] = this.panel[b.id] ? 1 : 0;
    v.belts = { belt_cv: this.belt.offset / 1000 };
    return v;
  }
}

function slotNear(a, ang) {
  let best = 0, bd = 1e9;
  for (let k = 0; k < 4; k++) { const d = Math.abs((((135 + k * 90 + a - ang) % 360) + 540) % 360 - 180); if (d < bd) { bd = d; best = k; } }
  return best;
}
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/* ======================================================================= danh mục */
const CELLS = { motomini: MotoMiniCell, mechatro: MechatroCell };
export function createCell(id, opts) { const C = CELLS[id]; if (!C) throw new Error('Không có trạm: ' + id); return new C(opts); }
export const CELL_IDS = Object.keys(CELLS);
