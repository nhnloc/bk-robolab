// Chấm bài tự động: dựng trạm mới (không giao diện), nạp chương trình robot + MC của sinh viên, chạy kịch bản cố định.
import { createCell } from '../sim/cell.js';
import { CellRuntime } from '../sim/runtime.js';
import { checkProgram } from '../robot/inform.js';
import { PALETTE } from '../sim/layout.js';

/** @returns {Promise<{score, max, checks:[{id,label,points,max,pass,detail}], log, stats}>} */
export async function gradeLab(lab, project, { onProgress, live, hooks } = {}) {
  const checks = [];
  const add = (id, label, max, pass, detail = '') => { const ck = { id, label, max, points: pass ? max : 0, pass: !!pass, detail: detail || '' }; checks.push(ck); hooks?.onAdd?.(ck); };
  const g = lab.grading || {};
  const finish = (cell) => {
    let score = checks.reduce((a, c) => a + c.points, 0);
    let max = checks.reduce((a, c) => a + c.max, 0) || 100;
    if (max !== 100) { score = Math.round((score / max) * 100); max = 100; }
    return { score, max, checks, stats: cell ? { ...cell.stats, pulses: undefined } : null, log: cell ? cell.events.slice(-30) : [] };
  };

  if (g.live) return finish(gradeManual(lab, project, add, live));

  // 1) Biên dịch
  const robotErr = checkProgram(project.robot?.jobs || [], project.robot?.pvars || {});
  const hard = robotErr.filter((e) => !e.warn);
  const usesRobot = lab.tools.includes('pendant');
  if (usesRobot) add('robot', 'Job robot không lỗi cú pháp', 5, hard.length === 0, hard.slice(0, 3).map((e) => `${e.job} ${String(e.line).padStart(4, '0')}: ${e.message}`).join('\n'));
  const cell = createCell(lab.cellId, { seed: 7, ...(lab.cellOpts || {}) });
  hooks?.onCell?.(cell);
  const rt = new CellRuntime(cell, { manualClock: true });
  cell.robot.loadProgram(JSON.parse(JSON.stringify(project.robot || { jobs: [], pvars: {} })));
  let mcOk = true;
  if (cell.mc && project.mc) {
    const res = cell.mc.load(project.mc);
    mcOk = res.ok;
    add('mc', 'Chương trình MP3300 (ladder + motion) biên dịch không lỗi', 5, res.ok, res.ok ? '' : res.errors.slice(0, 3).map((e) => `${e.block}${e.network !== undefined ? ' NW' + (e.network + 1) : ''}${e.line ? ' dòng ' + e.line : ''}: ${e.message}`).join('\n'));
    if (res.ok) cell.mc.start();
  }
  if (!mcOk || (usesRobot && hard.length && !cell.mc)) return finish(cell);

  // 2) Kịch bản
  const timers = [];
  let elapsed = 0;
  const total = g.estMs || 120000;
  const run = async (ms) => {
    const step = 50;
    for (let t = 0; t < ms; t += step) {
      const d = Math.min(step, ms - t);
      rt.runFor(d); elapsed += d;
      hooks?.onTick?.(cell, elapsed);
      for (const tm of timers) { tm.acc += d; while (tm.acc >= tm.every) { tm.acc -= tm.every; tm.fn(); } }
      if (elapsed % 2000 < step) { onProgress?.(Math.min(0.98, elapsed / total)); if (typeof window !== 'undefined') await new Promise((r) => setTimeout(r, 0)); }
    }
  };
  const c = {
    lab, project, cell, rt, add, run,
    robot: cell.robot, mc: cell.mc,
    every: (ms, fn) => timers.push({ every: ms, acc: 0, fn }),
    press: async (id, ms = 200) => { cell.press(id, true); await run(ms); cell.press(id, false); },
    hasJob: (n) => !!cell.robot.findJob(n),
    ran: () => true,
    scene(kind) {
      cell.robot.stopProgram(); cell.robot.exec = null;
      cell.robot.q = [0, 0, 0, 0, 0, 0]; cell.robot.OT.fill(false); cell.robot.alarms = []; cell.robot.shift = null;
      for (const b of cell.def.buttons) if (b.kind === 'latching') cell.panel[b.id] = !!b.initial;
      cell.setup?.(kind);
    },
    stop() { cell.robot.stopProgram(); cell.robot.exec = null; cell.robot.OT.fill(false); cell.held = null; for (const it of cell.items) it.held = false; },
    async startJob(job) {
      const r = cell.robot;
      r.setMode('PLAY'); r.servoOnReady();
      if (!r.selectJob(job)) return false;
      return r.start();
    },
    /** Chạy 1 job tới khi kết thúc (hoặc hết giờ). */
    async runJob(job, maxMs) {
      const ok = await c.startJob(job);
      if (!ok) return { ended: false, note: cell.robot.alarms[0] ? `ALARM ${cell.robot.alarms[0].code} ${cell.robot.alarms[0].detail}` : `Không chạy được job ${job}` };
      let t = 0;
      while (t < maxMs && cell.robot.busy) { await run(500); t += 500; }
      const al = cell.robot.alarms[0];
      if (al) return { ended: false, note: `ALARM ${al.code}: ${al.text} ${al.detail}` };
      if (cell.robot.busy) return { ended: false, note: `Job ${job} chưa kết thúc sau ${maxMs / 1000} s` };
      return { ended: true, note: '' };
    },
    /** Lấy vật ở vị trí gắp cuối băng tải (giả làm robot). */
    takePick() { const it = cell.items.filter((x) => x.on === 'conveyor').sort((a, b) => b.x - a.x)[0]; if (it) cell.items = cell.items.filter((x) => x !== it); },
    describe() {
      const pos = cell.items.filter((it) => !it.lost).map((it) => `vật ${it.label}: ${cellName(it) || `(${it.x.toFixed(0)}, ${it.y.toFixed(0)})`}${it.z > PALETTE.top + 1 ? ` tầng ${Math.round((it.z - PALETTE.top) / 20) + 1}` : ''}`);
      const al = cell.robot.alarms[0];
      return [pos.join(' · '), al ? `ALARM ${al.code} ${al.detail}` : ''].filter(Boolean).join('\n');
    },
  };
  const cellName = (it) => cell.cellOf?.(it);
  try { await g.scenario(c); }
  catch (e) { console.error(e); add('err', 'Kịch bản chấm chạy hết', 0, false, String(e.message || e)); }
  onProgress?.(1);
  return finish(cell);
}

/** Lab vận hành bằng tay: chấm theo "bằng chứng" ghi lại trong phiên làm việc (project.evidence). */
function gradeManual(lab, project, add, live) {
  const ev = { ...(project.evidence || {}) };
  if (live) Object.assign(ev, live);
  const coords = new Set(ev.coords || []);
  add('servo', 'Bật servo bằng SERVO ON READY + Enable', 10, !!ev.servo);
  add('joint', 'Điều khiển bằng tay trong hệ JOINT', 10, coords.has('JOINT'));
  add('base', 'Điều khiển bằng tay trong hệ CARTESIAN (BASE)', 10, coords.has('BASE'));
  add('tool', 'Điều khiển bằng tay trong hệ TOOL', 10, coords.has('TOOL'));
  add('home', 'Đưa robot về vị trí Home (mọi khớp = 0)', 10, !!ev.home);
  add('a12', 'Gắp A1 → B và A2 → C bằng tay', 25, !!ev.a12);
  add('a123', 'Xếp chồng A1, A2, A3 ở B bằng tay', 25, !!ev.a123);
  return null;
}
