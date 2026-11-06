// Trục servo ảo (servopack Σ-7 + động cơ, nối MECHATROLINK với MP3300).
// Vị trí logic (đơn vị người dùng: mm hoặc độ) = vị trí vật lý − offset. Encoder tương đối: bật nguồn → vị trí hiện tại = 0.

export const AXIS_ALARMS = {
  0x01: 'Servo chưa bật mà có lệnh chuyển động',
  0x02: 'Vượt giới hạn mềm dương (Positive soft limit)',
  0x03: 'Vượt giới hạn mềm âm (Negative soft limit)',
  0x04: 'Chạm cảm biến hành trình P-OT',
  0x05: 'Chạm cảm biến hành trình N-OT',
  0x06: 'Về gốc thất bại: không gặp tín hiệu zero',
  0x07: 'Quá tải / kẹt cơ khí',
};

/**
 * hw: thông số phần cứng do cell cung cấp
 *   { unit:'mm'|'deg', rotary:bool, physMin, physMax (vật lý, cứng), maxSpeed (đơn vị/s), physStart, homeAt (vị trí vật lý cảm biến zero),
 *     homeWidth, potAt, notAt }
 * prm: thông số người dùng (Fixed / Setting parameter), xem DEFAULT_PRM
 */
export const DEFAULT_PRM = {
  digits: 1,              // số chữ số thập phân: đơn vị tham chiếu = 10^-digits
  softLimitEnable: false,
  softPos: 0, softNeg: 0, // đơn vị người dùng
  speedRef: 20,           // tốc độ định vị MOV (đơn vị/s)
  accTime: 100,           // ms
  zrnMethod: 19,          // 19 = chỉ dùng tín hiệu zero input
  zrnDir: 1,              // hướng dò: +1 / -1
  creep: 10,              // tốc độ dò (đơn vị/s)
  zrnSpeed: 10,           // tốc độ sau khi gặp tín hiệu (Speed Reference)
  zrnTravel: 0,           // quãng đi thêm sau sườn lên (Travel Distance)
  zrnSignal: '',          // tag ngõ vào dùng làm zero input (vd. DI_10)
};

export class ServoAxis {
  constructor(name, hw, prm = {}) {
    this.name = name; this.hw = hw;
    this.prm = { ...DEFAULT_PRM, ...prm };
    this.phys = hw.physStart ?? 0;
    this.reset(true);
  }
  reset(power = false) {
    if (power) { this.offset = this.phys; this.zeroDone = false; }
    this.servoCmd = false; this.servoOnState = false;
    this.vel = 0; this.cmd = null; this.alarm = 0; this.warning = 0;
    this.zrn = null; this._lastSig = false;
  }
  get pos() { return this.phys - this.offset; }
  get busy() { return !!(this.cmd || this.zrn); }
  get running() { return this.servoOnState; }
  setParams(p) { Object.assign(this.prm, p || {}); }
  /** Đơn vị tham chiếu (số nguyên trong chương trình motion) → đơn vị người dùng. */
  fromRef(v) { return v / 10 ** this.prm.digits; }
  toRef(v) { return Math.round(v * 10 ** this.prm.digits); }

  servo(on) {
    if (on && this.alarm) return;
    this.servoCmd = !!on;
  }
  clearAlarm() { this.alarm = 0; this.warning = 0; }
  stop() { this.cmd = null; this.zrn = null; }

  /** Lệnh định vị tới đích (đơn vị người dùng) với tốc độ v (đơn vị/s). Trả mã lỗi hoặc 0. */
  moveTo(target, v) {
    if (!this.servoOnState) { this.alarm = 0x01; return 0x01; }
    if (this.alarm) return this.alarm;
    const p = this.prm;
    if (p.softLimitEnable && this.zeroDone) {
      if (target > p.softPos) { target = p.softPos; this.warning = 0x02; }
      if (target < p.softNeg) { target = p.softNeg; this.warning = 0x03; }
    }
    this.cmd = { target, v: Math.min(Math.abs(v) || p.speedRef, this.hw.maxSpeed) };
    return 0;
  }
  /** Về gốc (ZRN). */
  home() {
    if (!this.servoOnState) { this.alarm = 0x01; return 0x01; }
    if (this.alarm) return this.alarm;
    this.cmd = null;
    this.zrn = { phase: 1, dir: this.prm.zrnDir >= 0 ? 1 : -1, start: this.phys, travelled: 0 };
    this.zeroDone = false;
    return 0;
  }

  /** dt ms; sig(tag) → giá trị ngõ vào (để đọc tín hiệu zero). */
  step(dt, sig) {
    const s = dt / 1000;
    // servo on/off có trễ nhỏ
    if (this.servoCmd && !this.alarm) this.servoOnState = true;
    if (!this.servoCmd || this.alarm & 0x04 || this.alarm & 0x05) { if (this.servoOnState && !this.servoCmd) { this.servoOnState = false; this.cmd = null; this.zrn = null; } }
    if (!this.servoOnState) { this.vel = 0; return; }
    const accel = Math.max(1, this.hw.maxSpeed / (this.prm.accTime / 1000));
    let target = null, vmax = 0;
    if (this.zrn) {
      const z = this.zrn;
      const sigOn = !!sig(this.prm.zrnSignal);
      if (z.phase === 1) {
        if (sigOn && !this._lastSig) { z.phase = 2; z.edgePhys = this.phys; }
        else {
          vmax = this.prm.creep; target = this.phys + z.dir * 1e6;
          z.travelled += Math.abs(this.vel) * s;
          const span = this.hw.rotary ? 720 : (this.hw.physMax - this.hw.physMin) * 1.2;
          if (z.travelled > span) { this.alarm = 0x06; this.zrn = null; }
        }
      }
      if (z.phase === 2) {
        const goal = z.edgePhys + z.dir * this.prm.zrnTravel;
        target = goal; vmax = this.prm.zrnSpeed;
        if (Math.abs(this.phys - goal) < 1e-3 && Math.abs(this.vel) < 1e-3) {
          this.offset = this.phys; this.zeroDone = true; this.zrn = null; this.vel = 0;
        }
      }
      this._lastSig = sigOn;
    } else if (this.cmd) {
      target = this.cmd.target + this.offset; vmax = this.cmd.v;
    }
    if (target === null) { this.vel = 0; return; }
    // hồ sơ vận tốc hình thang theo khoảng cách còn lại
    const dist = target - this.phys;
    const dir = Math.sign(dist);
    const vStop = Math.sqrt(2 * accel * Math.abs(dist));
    let vt = dir * Math.min(vmax, vStop);
    const dv = accel * s;
    this.vel = this.vel < vt ? Math.min(vt, this.vel + dv) : Math.max(vt, this.vel - dv);
    let np = this.phys + this.vel * s;
    if ((dir > 0 && np >= target) || (dir < 0 && np <= target) || dir === 0) { np = target; this.vel = 0; if (this.cmd && !this.zrn) this.cmd = null; }
    // giới hạn cứng + cảm biến OT
    const hw = this.hw;
    if (!hw.rotary) {
      if (hw.potAt !== undefined && np >= hw.potAt && this.vel > 0) { np = Math.min(np, hw.potAt + 1); this.alarm = 0x04; this.cmd = null; this.zrn = null; this.vel = 0; }
      if (hw.notAt !== undefined && np <= hw.notAt && this.vel < 0) { np = Math.max(np, hw.notAt - 1); this.alarm = 0x05; this.cmd = null; this.zrn = null; this.vel = 0; }
      np = Math.min(hw.physMax, Math.max(hw.physMin, np));
    }
    this.phys = np;
  }
}
