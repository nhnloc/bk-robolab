// Kiểm thử BK-RoboLab: động học, INFORM, motion, lời giải mẫu đạt 100, project khởi đầu không đạt.
//   node tests/robolab.test.mjs
import assert from 'node:assert/strict';
import * as K from '../src/robot/kinematics.js';
import { parseLine, compileJob } from '../src/robot/inform.js';
import { compileMotion } from '../src/mc/motion.js';
import { buildRequest, parseRequest, CMD } from '../src/robot/hse.js';
import { LABS, starterProject, loadSolutions, solutionProject } from '../src/labs/index.js';
import { gradeLab } from '../src/labs/grader.js';
import { createCell } from '../src/sim/cell.js';

let n = 0; const ok = (name) => { n++; console.log('✓', name); };

// Động học: FK → IK → FK khớp nhau
for (const q of [[10, 20, -10, 5, 70, 30], [-40, 35, 15, 0, 60, -20], [60, 10, 30, -20, 40, 90]]) {
  const T = K.fk(q, { z: 50 });
  const r = K.ik(T, [0, 30, 0, 0, 60, 0], { z: 50 });
  assert.ok(r.ok, 'IK hội tụ');
  const p = K.pos(K.fk(r.q, { z: 50 })), p0 = K.pos(T);
  assert.ok(Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) < 0.05);
}
assert.deepEqual(K.fkPose([0, 0, 0, 0, 0, 0], { z: 50 }).map((v) => Math.round(v)), [275, 0, 334, 180, -90, 0]);
ok('FK/IK MotoMINI');

// Jog Descartes ở mọi tốc độ (LOW = 0,01 mm mỗi bước 1 ms — trước đây bị IK nuốt mất) + trợ giúp nam châm
{
  const c = createCell('motomini'); const R = c.robot;
  R.setMode('TEACH'); R.servoOnReady(); R.enable(true); R.setCoord('BASE');
  R.q = K.ik(K.poseToT([170, 110, 60, 180, 0, 0]), [33, 30, 0, 0, 60, 0], R.tool).q;
  for (const [sp, mm] of [['LOW', 10], ['MED', 50]]) {
    const z0 = R.pose()[2]; R.setSpeed(sp); R.jog(2, 1, true); for (let i = 0; i < 1000; i++) c.step(1); R.jog(2, 1, false);
    assert.ok(Math.abs(R.pose()[2] - z0 - mm) < 0.5, `jog Z+ ${sp}: ${R.pose()[2] - z0}`);
  }
  R.q = K.ik(K.poseToT([170, 110, 33, 180, 0, 0]), R.q, R.tool).q; c.step(1);
  assert.ok(c.gripHint().ready, 'nam châm sẵn sàng hút ở 3 mm trên vật A1');
  // va chạm khi đang giữ vật → RESET → nhấc lên được (không báo va chạm lại)
  R.OT[1] = true; c.step(5); assert.ok(c.held, 'đã hút vật');
  R.setSpeed('MED'); R.jog(2, -1, true); for (let i = 0; i < 1500 && !R.alarms.length; i++) c.step(1); R.jog(2, -1, false);
  assert.equal(R.alarms[0]?.code, 4100, 'va chạm khi hạ vật xuống pallet');
  R.resetAlarm(); R.servoOnReady(); R.enable(true); R.jog(2, 1, true); for (let i = 0; i < 1000; i++) c.step(1); R.jog(2, 1, false);
  assert.ok(!R.alarms.length && R.pose()[2] > 70, 'nhấc lên sau RESET');
}
ok('Jog Descartes + trợ giúp nam châm');

assert.equal(parseLine('MOVJ P001 VJ=10.00').tags.VJ, 10);
assert.throws(() => parseLine('MOVJ P001 V=10'));
assert.throws(() => parseLine('MOVC P001 V=10'));
assert.equal(parseLine('WAIT IN#(2)=ON T=1.5').timeout, 1.5);
const cj = compileJob({ name: 'X', lines: ['NOP', 'IF (B001=1 AND IN#(5)=ON) THEN', 'SET B002 1', 'ELSE', 'SET B002 2', 'ENDIF', 'JUMP *NOPE', 'END'] });
assert.equal(cj.errors.length, 1);
ok('INFORM');

assert.equal(compileMotion('ABS;\nMOV [A1]900;\nEND;', { axes: ['A1'] }).errors.length, 0);
assert.equal(compileMotion('MOV [X1]900;\nEND;', { axes: ['A1'] }).errors.length, 1);
assert.equal(compileMotion('WHILE SB1 == 1;\nTIM T10;\nEND;', { axes: [] }).errors.length > 0, true);
ok('Motion');

const fr = buildRequest({ cmd: CMD.HOLD_SERVO, instance: 2, attribute: 1, service: 0x10, data: [1, 0, 0, 0] });
const pr = parseRequest(fr);
assert.ok(!pr.error && pr.cmd === 0x83 && fr.length === 36);
ok('Khung High-Speed Ethernet');

await loadSolutions();
for (const lab of LABS) {
  if (lab.grading?.live) continue;
  const s = await gradeLab(lab, starterProject(lab));
  assert.ok(s.score < 50, `${lab.id}: project khởi đầu không được đạt (${s.score})`);
  const sol = solutionProject(lab);
  if (!sol) { console.log('  (bỏ qua lời giải', lab.id, '— thiếu private/solutions.js)'); continue; }
  const r = await gradeLab(lab, sol);
  assert.equal(r.score, 100, `${lab.id}: lời giải mẫu ${r.score}/100 — ${r.checks.filter((c) => !c.pass).map((c) => c.id + ': ' + c.detail).join(' | ')}`);
  ok(`${lab.id}: khởi đầu ${s.score}, lời giải 100`);
}
console.log(`\n${n} nhóm kiểm thử đạt.`);
