// SHIM phát triển cho 4 máy Phần 1 (trainer, motor, stardelta, counter) — chỉ để thử giao diện
// (outs, btn_, needle_, displays, trend) khi engine thật chưa có các máy này. Không phải mô phỏng chuẩn.
// Bus I/O theo kiểu shim: inputs/outputs khóa theo địa chỉ (%I0.5, %Q0.2…), giống FakeMachine.

const PANEL_IN = [['%I0.0', 'Start', 'Nút Start (NO)'], ['%I0.1', 'Stop', 'Nút Stop (NC)'], ['%I0.2', 'Reset', 'Nút Reset'], ['%I0.3', 'EStop', 'Dừng khẩn (NC)'], ['%I0.4', 'AutoMan', 'Chọn chế độ (1 = Auto)']];
const PANEL_OUT = [['%Q0.0', 'H_Run', 'Đèn chạy'], ['%Q0.1', 'H_Fault', 'Đèn lỗi']];
const PANEL_BTN = [
  { id: 'Start', label: 'Start', kind: 'momentary', color: 'green' }, { id: 'Stop', label: 'Stop', kind: 'momentary', color: 'red', nc: true },
  { id: 'Reset', label: 'Reset', kind: 'momentary', color: 'blue' }, { id: 'EStop', label: 'Dừng khẩn', kind: 'latching', color: 'estop', nc: true },
  { id: 'AutoMan', label: 'Auto / Man', kind: 'selector', color: 'black' },
];
const io = (rows) => rows.map(([addr, tag, desc, type]) => ({ addr, tag, desc, ...(type ? { type } : {}) }));
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

class P1Base {
  constructor(id, spec) {
    this.id = id; this.spec = spec;
    this.def = {
      id, title: spec.title, summary: spec.summary || '', cpu: '1214C',
      ioMap: { inputs: io([...PANEL_IN, ...spec.inputs]), outputs: io([...PANEL_OUT, ...spec.outputs]) },
      buttons: [...PANEL_BTN, ...spec.buttons],
      faults: spec.faults || [],
    };
    this._addr = {};
    for (const x of [...this.def.ioMap.inputs, ...this.def.ioMap.outputs]) this._addr[x.tag] = x.addr;
    this._faults = new Set();
    this.reset();
  }
  reset() {
    this.panel = { Start: false, Stop: false, Reset: false, EStop: false, AutoMan: true };
    for (const b of this.spec.buttons) this.panel[b.id] = false;
    this.inputs = {}; this.outputs = {}; this.events = []; this.crashed = null; this.t = 0;
    this.stats = { produced: 0 };
    this.init?.();
    this._io();
  }
  press(id, down) {
    const b = this.def.buttons.find((x) => x.id === id); if (!b) return;
    if (b.kind === 'momentary') this.panel[id] = !!down; else if (down) this.panel[id] = !this.panel[id];
    this._io();
  }
  setFault(id, on) { if (on) this._faults.add(id); else this._faults.delete(id); }
  q(tag) { return !!this.outputs[this._addr[tag]]; }
  qw(tag) { return +this.outputs[this._addr[tag]] || 0; }
  log(message, level = 'warn') { this.events.push({ t: this.t, message, level }); if (this.events.length > 100) this.events.shift(); }
  _io() {
    const I = {}; const p = this.panel;
    I['%I0.0'] = p.Start; I['%I0.1'] = !p.Stop; I['%I0.2'] = p.Reset; I['%I0.3'] = !p.EStop; I['%I0.4'] = p.AutoMan;
    const tags = this.sense?.() || {};
    for (const [tag, v] of Object.entries(tags)) if (this._addr[tag]) I[this._addr[tag]] = v;
    this.inputs = I; this._tags = tags;
  }
  _step(dt) { this.t += dt; this.sim?.(dt / 1000); this._io(); }
  base(parts = {}) {
    for (const b of this.spec.buttons) parts['btn_' + b.id] = this.panel[b.id] ? 1 : 0;
    const leds = {}; for (const [k, v] of Object.entries(this._tags || {})) if (typeof v === 'boolean') leds[k] = v;
    const outs = {}; for (const o of this.def.ioMap.outputs) if (!o.type) outs[o.tag] = this.q(o.tag);
    return { parts, items: [], leds, belts: {}, crashed: this.crashed, lamps: { run: this.q('H_Run'), fault: this.q('H_Fault') }, outs };
  }
}

/* ---------------- L01: bàn thực hành ---------------- */
class Trainer extends P1Base {
  constructor() {
    super('trainer', {
      title: 'Bàn thực hành PLC',
      inputs: [['%I0.5', 'S1', 'Nút S1 xanh (NO)'], ['%I0.6', 'S2', 'Nút S2 xanh (NO)'], ['%I0.7', 'S3', 'Nút S3 đỏ (NC — bình thường = 1)'], ['%I1.0', 'SW1', 'Công tắc xoay (1 = phải)'],
        ['%I1.1', 'PRX', 'Cảm biến tiệm cận (1 = có kim loại)'], ['%I1.2', 'PE', 'Cảm biến quang Dark-On (1 = bị chắn)']],
      outputs: [['%Q0.2', 'H1', 'Đèn đỏ'], ['%Q0.3', 'H2', 'Đèn vàng'], ['%Q0.4', 'H3', 'Đèn xanh lá'], ['%Q0.5', 'H4', 'Đèn xanh dương'], ['%Q0.6', 'BUZ', 'Còi']],
      buttons: [
        { id: 'S1', label: 'S1', kind: 'momentary', color: 'green' }, { id: 'S2', label: 'S2', kind: 'momentary', color: 'green' },
        { id: 'S3', label: 'S3', kind: 'momentary', color: 'red', nc: true }, { id: 'SW1', label: 'SW1', kind: 'selector', color: 'black', positions: ['0', '1'] },
        { id: 'Metal', label: 'Kim loại', kind: 'latching', color: 'grey' }, { id: 'Block', label: 'Chắn tia', kind: 'latching', color: 'grey' },
      ],
      faults: [{ id: 'PE_dead', label: 'Cảm biến quang hỏng' }],
    });
  }
  init() { this.metal = 0; this.block = 0; }
  sim(s) {
    this.metal += clamp((this.panel.Metal ? 1 : 0) - this.metal, -2 * s, 2 * s);
    this.block += clamp((this.panel.Block ? 1 : 0) - this.block, -3 * s, 3 * s);
  }
  sense() { const p = this.panel; return { S1: p.S1, S2: p.S2, S3: !p.S3, SW1: p.SW1, PRX: this.metal > 0.8, PE: !this._faults.has('PE_dead') && this.block > 0.8 }; }
  getVisual() { const v = this.base({ target_metal: this.metal, blocker: this.block }); return v; }
}

/* ---------------- L02: cửa cuốn ---------------- */
class Motor extends P1Base {
  constructor() {
    super('motor', {
      title: 'Cửa cuốn — động cơ đảo chiều',
      inputs: [['%I0.5', 'S_Up', 'Nút Lên (NO)'], ['%I0.6', 'S_Down', 'Nút Xuống (NO)'], ['%I0.7', 'F1', 'Rơ-le nhiệt (NC — 1 = bình thường)'], ['%I1.0', 'LS_Up', 'Hành trình trên'],
        ['%I1.1', 'LS_Down', 'Hành trình dưới'], ['%I1.2', 'PE', 'Cảm biến an toàn chân cửa']],
      outputs: [['%Q0.2', 'KM1', 'Contactor Lên'], ['%Q0.3', 'KM2', 'Contactor Xuống'], ['%Q0.4', 'H_Up', 'Đèn đang lên'], ['%Q0.5', 'H_Down', 'Đèn đang xuống']],
      buttons: [{ id: 'Up', label: 'Lên', kind: 'momentary', color: 'green' }, { id: 'Down', label: 'Xuống', kind: 'momentary', color: 'yellow' }, { id: 'Obstacle', label: 'Vật cản', kind: 'latching', color: 'grey' }],
      faults: [{ id: 'overload', label: 'Quá tải động cơ (F1 tác động)' }],
    });
  }
  init() { this.door = 0; this.drum = 0; this.hist = { pos: [], cur: [] }; }
  sim(s) {
    const up = this.q('KM1'), dn = this.q('KM2');
    if (up && dn && !this.crashed) { this.crashed = { message: 'KM1 và KM2 cùng đóng — ngắn mạch pha!' }; this.log('Ngắn mạch: KM1 và KM2 cùng đóng', 'error'); }
    if (this.crashed && this.panel.Reset) this.crashed = null;
    const dir = this.crashed ? 0 : (up ? 1 : 0) - (dn ? 1 : 0);
    const v = 0.12;
    this.door = clamp(this.door + dir * v * s);
    if (this.panel.Obstacle && dir < 0 && this.door < 0.12) { this.door = 0.12; }
    this.drum += dir * s * 0.6;
    this.hist.pos.push(this.door * 100); this.hist.cur.push(dir ? 4.2 + Math.random() * 0.3 : 0);
    for (const k of ['pos', 'cur']) if (this.hist[k].length > 600) this.hist[k].shift();
  }
  sense() { const p = this.panel; return { S_Up: p.Up, S_Down: p.Down, F1: !this._faults.has('overload'), LS_Up: this.door > 0.995, LS_Down: this.door < 0.005, PE: p.Obstacle }; }
  getVisual() {
    const v = this.base({ door: this.door, drum: this.drum, obstacle: this.panel.Obstacle ? 1 : 0 });
    v.trend = { dtMs: 100, series: [{ id: 'pos', label: 'Độ mở cửa', unit: '%', max: 100, color: '#2a86c9', data: this.hist.pos.filter((_, i) => i % 10 === 0) },
      { id: 'cur', label: 'Dòng động cơ', unit: 'A', max: 10, color: '#e0a800', data: this.hist.cur.filter((_, i) => i % 10 === 0) }] };
    return v;
  }
}

/* ---------------- L03: máy nén khí sao–tam giác ---------------- */
class StarDelta extends P1Base {
  constructor() {
    super('stardelta', {
      title: 'Máy nén khí sao–tam giác',
      inputs: [['%I0.5', 'F1', 'Rơ-le nhiệt (NC — 1 = bình thường)'], ['%I0.6', 'PS', 'Công tắc áp suất (1 = áp thấp)'], ['%IW64', 'P_Raw', 'Áp suất 0..27648 = 0..10 bar', 'Int'], ['%IW66', 'I_Raw', 'Dòng điện 0..27648 = 0..200 A', 'Int']],
      outputs: [['%Q0.2', 'KM1', 'Contactor nguồn'], ['%Q0.3', 'KM2', 'Contactor sao'], ['%Q0.4', 'KM3', 'Contactor tam giác']],
      buttons: [],
      faults: [{ id: 'leak', label: 'Rò khí (áp tụt nhanh)' }],
    });
  }
  init() { this.P = 5.5; this.I = 0; this.w = 0; this.rev = 0; this.ps = true; this.hist = { P: [], I: [] }; this.acc = 0; }
  sim(s) {
    const k1 = this.q('KM1'), y = this.q('KM2'), d = this.q('KM3');
    if (y && d && !this.crashed) { this.crashed = { message: 'KM2 (sao) và KM3 (tam giác) cùng đóng — ngắn mạch!' }; this.log('Ngắn mạch sao–tam giác', 'error'); }
    if (this.crashed && this.panel.Reset) this.crashed = null;
    const on = k1 && (y || d) && !this.crashed;
    const target = on ? (d ? 1 : 0.85) : 0;
    this.w += (target - this.w) * Math.min(1, s * (on ? 0.9 : 0.5));
    const slip = Math.max(0, target - this.w);
    this.I = on ? (d ? 38 + 160 * slip : 22 + 60 * slip) + Math.random() * 1.5 : 0;
    this.rev += this.w * s * 4;
    this.P = clamp(this.P + (this.w * 0.12 - (this._faults.has('leak') ? 0.12 : 0.04)) * s, 0, 10);
    if (this.P >= 8) this.ps = false; else if (this.P <= 6) this.ps = true;
    this.acc += s;
    if (this.acc >= 0.1) { this.acc = 0; this.hist.P.push(+this.P.toFixed(2)); this.hist.I.push(+this.I.toFixed(1)); for (const k of ['P', 'I']) if (this.hist[k].length > 600) this.hist[k].shift(); }
  }
  sense() { return { F1: true, PS: this.ps, P_Raw: Math.round((this.P / 10) * 27648), I_Raw: Math.round((this.I / 200) * 27648) }; }
  getVisual() {
    const v = this.base({ pulley: this.rev, needle_P: this.P / 10, needle_A: this.I / 200 });
    v.displays = [{ id: 'P', label: 'Áp suất', value: +this.P.toFixed(1), unit: 'bar', digits: 4 }, { id: 'I', label: 'Dòng điện', value: Math.round(this.I), unit: 'A', digits: 4 }];
    v.trend = { dtMs: 100, series: [{ id: 'P', label: 'Áp suất', unit: 'bar', max: 10, color: '#2a86c9', data: this.hist.P.slice() }, { id: 'I', label: 'Dòng điện', unit: 'A', max: 200, color: '#e53935', data: this.hist.I.slice() }] };
    return v;
  }
}

/* ---------------- L04: băng tải đếm ---------------- */
class Counter extends P1Base {
  constructor() {
    super('counter', {
      title: 'Băng tải đếm sản phẩm',
      inputs: [['%I0.5', 'B1', 'Sản phẩm rơi vào thùng'], ['%I0.6', 'B2', 'Có thùng đúng vị trí'], ['%I0.7', 'B3', 'Sản phẩm vào đầu băng']],
      outputs: [['%Q0.2', 'M1', 'Băng tải sản phẩm'], ['%Q0.3', 'M2', 'Băng tải thùng'], ['%Q0.4', 'H_Full', 'Đèn thùng đầy'], ['%QW80', 'Display', 'Số hiển thị LED (Int)', 'Int']],
      buttons: [],
    });
  }
  init() { this.cans = []; this.box = { y: 0, n: 0 }; this.b1 = 0; this.bOff = [0, 0]; this.seq = 0; this.spawn = 0; }
  sim(s) {
    const m1 = this.q('M1'), m2 = this.q('M2');
    if (m1) { this.bOff[0] += 0.2 * s; this.spawn += s; if (this.spawn > 1.6) { this.spawn = 0; this.cans.push({ id: 'c' + ++this.seq, x: 60 }); } for (const c of this.cans) c.x += 200 * s; }
    if (m2) { this.bOff[1] += 0.2 * s; this.box.y += 200 * s; if (this.box.y > 700) { this.box = { y: -700, n: 0 }; this.stats.produced++; } }
    this.b1 = Math.max(0, this.b1 - s);
    this.cans = this.cans.filter((c) => { if (c.x > 1550) { this.b1 = 0.15; if (Math.abs(this.box.y) < 60) this.box.n++; return false; } return true; });
  }
  sense() { return { B1: this.b1 > 0, B2: Math.abs(this.box.y) < 40, B3: this.cans.some((c) => c.x < 140) }; }
  getVisual() {
    const v = this.base({});
    v.belts = { belt_1: this.bOff[0], belt_2: this.bOff[1] };
    v.items = [...this.cans.map((c) => ({ id: c.id, kind: 'product', x: c.x, y: 0, z: 800, size: [66, 66, 120], color: '#d32f2f' })),
      { id: 'box', kind: 'box', x: 1600, y: this.box.y, z: 450, size: [300, 200, 200], label: String(this.box.n) }];
    v.displays = [{ id: 'Display', label: 'Bộ đếm', value: this.qw('Display'), unit: 'sp', digits: 4 }];
    return v;
  }
}

export const P1_MACHINES = { trainer: Trainer, motor: Motor, stardelta: StarDelta, counter: Counter };

/** L01 shim: kịch bản riêng (không đếm sản phẩm) — để thử bảng kết quả với số tiêu chí tùy ý. */
export async function gradeTrainerShim(project, eng) {
  const plc = new eng.PlcRuntime(project, { headless: true });
  const m = new Trainer(); plc.attach(m);
  const res = plc.load(project);
  const crit = [];
  const add = (id, title, ok, max, message = '') => crit.push({ id, title, ok, points: ok ? max : 0, max, message });
  add('compile', 'Biên dịch không lỗi', res.ok, 10, res.ok ? '' : `${res.errors.length} lỗi`);
  if (res.ok) {
    plc.start();
    const run = (ms) => { for (let t = 0; t < ms; t += 10) plc._tick(10); };
    run(100); m.press('S1', true); run(100);
    add('h1', 'S1 bật đèn H1', m.q('H1'), 20);
    m.press('S1', false); run(100);
    add('h1hold', 'H1 tự giữ sau khi nhả S1', m.q('H1'), 20);
    m.press('S3', true); run(100); m.press('S3', false); run(100);
    add('s3', 'S3 (NC) tắt H1', !m.q('H1'), 20);
    m.press('Metal', true); m.press('Metal', false); run(800);
    add('prx', 'Có kim loại → H3 sáng', m.q('H3'), 15);
    m.press('Block', true); m.press('Block', false); run(500);
    add('pe', 'Tia bị chắn → còi kêu', m.q('BUZ'), 15);
  }
  plc.dispose?.();
  const score = crit.reduce((a, c) => a + c.points, 0), max = crit.reduce((a, c) => a + c.max, 0);
  return { score, max, passed: score >= max * 0.5, criteria: crit, at: Date.now() };
}
