// Đồng hồ mô phỏng cho một trạm: bước 1 ms cho robot, servo, vật lý; MC quét ladder 10 ms (bên trong cell.step).
export class CellRuntime {
  constructor(cell, { manualClock = false, speed = 1 } = {}) {
    this.cell = cell; this.speed = speed; this.manualClock = manualClock;
    this.simTime = 0; this._acc = 0; this._timer = null; this.listeners = {};
    if (!manualClock) this.startClock();
  }
  on(ev, cb) { (this.listeners[ev] ||= new Set()).add(cb); return () => this.listeners[ev]?.delete(cb); }
  emit(ev, d) { for (const cb of this.listeners[ev] || []) { try { cb(d); } catch (e) { console.error(e); } } }
  startClock() {
    if (this._timer || typeof window === 'undefined') return;
    let last = performance.now();
    this._timer = setInterval(() => {
      const now = performance.now();
      const dt = Math.min(100, now - last) * this.speed; last = now;
      try { this.tick(dt); } catch (e) { console.error('[sim]', e); }
    }, 16);
  }
  tick(dt) {
    this._acc += dt;
    while (this._acc >= 1) { this._acc -= 1; this.simTime += 1; this.cell.step(1); }
    this.emit('tick', this.simTime);
  }
  /** Chạy không giao diện (chấm bài). */
  runFor(ms) { for (let i = 0; i < ms; i++) { this.simTime++; this.cell.step(1); } }
  dispose() { if (this._timer) clearInterval(this._timer); this._timer = null; this.listeners = {}; }
}
