// Bộ lập trình cầm tay (Teach Pendant) ảo cho YRC1000micro.
// Bên trái: menu chính; giữa: màn hình (thanh trạng thái, nội dung, dòng thông báo); phải: bàn phím (servo, enable,
// hệ tọa độ, tốc độ, 12 phím trục, FWD/BWD, INTERLOCK + TEST START). Phía trên: chìa khóa chế độ, START, HOLD, E-STOP.
import { h } from '../dom.js';
import { toast, confirmBox } from '../components/ui.js';
import * as K from '../../robot/kinematics.js';
import { INFORM_LIST, compileJob, pName } from '../../robot/inform.js';

const AXIS_LABELS = {
  JOINT: ['S', 'L', 'U', 'R', 'B', 'T'],
  BASE: ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'],
  TOOL: ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'],
  USER: ['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'],
};
const COORD_NAME = { JOINT: 'JOINT', BASE: 'CARTESIAN', TOOL: 'TOOL', USER: 'USER' };
const KEYMAP = { q: [0, 1], a: [0, -1], w: [1, 1], s: [1, -1], e: [2, 1], d: [2, -1], r: [3, 1], f: [3, -1], t: [4, 1], g: [4, -1], y: [5, 1], h: [5, -1] };
const f1 = (v) => (Math.abs(v) < 0.005 ? 0 : v).toFixed(2);

/**
 * robot: RobotController; cell: trạm; def: định nghĩa trạm (robotIo);
 * onChange(): gọi khi chương trình robot (job, biến P) thay đổi → lưu.
 */
export function createPendant({ robot, cell, def, onChange = () => {}, readOnly = false }) {
  const prog = () => robot.program;
  let menu = 'job';
  let varTab = 'P';
  let selP = 0;
  let buffer = '';
  let textMode = false;
  let interlock = false;
  const changed = () => { robot._compiled.clear(); onChange(); };
  const offProg = robot.on('program', () => onChange());

  /* ---------------- phần tử điều khiển giữ (hold) ---------------- */
  function holdBtn(label, cls, onDown, onUp, title) {
    const b = h('button.pk', { type: 'button', class: cls, title: title || label, disabled: readOnly }, label);
    let held = false;
    const down = (e) => { e.preventDefault(); held = true; b.classList.add('down'); try { b.setPointerCapture?.(e.pointerId); } catch { /* bỏ qua */ } onDown(); };
    const up = () => { if (!held) return; held = false; b.classList.remove('down'); onUp(); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
    return b;
  }
  const key = (label, cls, fn, title) => h('button.pk', { type: 'button', class: cls, title: title || label, disabled: readOnly, onclick: fn }, label);

  /* ---------------- hàng trên: chế độ, START, HOLD, E-STOP ---------------- */
  const modeSel = h('div.pd-mode', { role: 'radiogroup', 'aria-label': 'Mode Switch' },
    ...['PLAY', 'REMOTE', 'TEACH'].map((m) => h('button.pd-mode-b', { type: 'button', dataset: { m }, disabled: readOnly, onclick: () => { robot.setMode(m); refresh(); } }, m)));
  const btnStart = key('START', 'start', () => { robot.start(); refresh(); }, 'Chạy chương trình (PLAY)');
  const btnHold = holdBtn('HOLD', 'hold', () => robot.hold(true), () => robot.hold(false), 'Tạm dừng (giữ)');
  const btnEstop = h('button.pd-estop', { type: 'button', title: 'EMERGENCY STOP — nhấn để dừng khẩn, nhấn lại để nhả', disabled: readOnly, onclick: () => { robot.estop(!robot.estopped); refresh(); } }, h('span', 'E-STOP'));
  const top = h('div.pd-top', modeSel, h('span.spacer'), btnStart, btnHold, btnEstop);

  /* ---------------- menu chính ---------------- */
  const MENUS = [['job', 'JOB'], ['var', 'VARIABLE'], ['io', 'IN/OUT'], ['robot', 'ROBOT'], ['alarm', 'ALARM']];
  const menuEl = h('nav.pd-menu', ...MENUS.map(([id, l]) => h('button.pd-mi', { type: 'button', dataset: { id }, onclick: () => { menu = id; render(); } }, l)));

  /* ---------------- màn hình ---------------- */
  const status = h('div.pd-status');
  const content = h('div.pd-content');
  const msgLine = h('div.pd-msg', { role: 'status' });
  const screen = h('div.pd-screen', status, content, msgLine);

  /* ---------------- bàn phím ---------------- */
  const axisBtns = [];
  const axisGrid = h('div.pd-axes');
  for (let i = 0; i < 6; i++) {
    const mk = (dir) => {
      const b = holdBtn('', 'axis', () => { robot.jog(i, dir, true); }, () => robot.jog(i, dir, false));
      axisBtns.push({ b, i, dir });
      return b;
    };
    axisGrid.append(mk(-1), mk(1));
  }
  const enableBtn = holdBtn('ENABLE', 'enable', () => { robot.enable(true); refresh(); }, () => { robot.enable(false); refresh(); }, 'Công tắc Enable 3 vị trí — giữ để bật servo (phím Space)');
  const ilBtn = holdBtn('INTER\nLOCK', 'il', () => { interlock = true; }, () => { interlock = false; }, 'INTERLOCK');
  const testBtn = holdBtn('TEST\nSTART', 'test', () => { if (!interlock) { robot.msg('Giữ INTERLOCK cùng lúc với TEST START', 'warn'); return; } robot.testStart(true); }, () => robot.testStart(false), 'INTERLOCK + TEST START: chạy thử khi giữ');
  const fwdBtn = holdBtn('FWD', 'fwd', () => fwd(true), () => fwd(false), 'Tới điểm tiếp theo của job / điểm đang chọn (giữ)');
  const bwdBtn = holdBtn('BWD', 'fwd', () => robot.fwd(true, true), () => robot.fwd(false), 'Lùi về điểm trước (giữ)');
  const speedLbl = h('div.pd-speed-l');
  const keypad = h('div.pd-keys',
    h('div.pk-row', key('SERVO ON\nREADY', 'servo', () => { robot.servoOnReady(); refresh(); }, 'SERVO ON READY'), enableBtn),
    h('div.pk-row', key('COORD', '', () => { robot.nextCoord(); refresh(); }, 'Đổi hệ tọa độ JOINT → CARTESIAN → TOOL → USER'),
      holdBtn('HIGH\nSPEED', '', () => { robot.highSpeed = true; }, () => { robot.highSpeed = false; })),
    h('div.pk-row', key('SLOW', '', () => { robot.slower(); refresh(); }), speedLbl, key('FAST', '', () => { robot.faster(); refresh(); })),
    axisGrid,
    h('div.pk-row', bwdBtn, fwdBtn),
    h('div.pk-row', ilBtn, testBtn),
    h('div.pk-row', key('MAGNET\nOT#1', 'mag', () => { interlock = true; robot.toggleOut(1); interlock = false; refresh(); }, 'INTERLOCK + SELECT trên OT#1 (nam châm)')),
  );

  function fwd(down) {
    if (menu === 'var' && varTab === 'P') {
      const p = robot.getP(selP);
      if (!p) { if (down) robot.msg(`${pName(selP)} chưa có dữ liệu`, 'warn'); return; }
      const q = p.type === 'PULSE' ? p.q : K.ik(K.poseToT(p.p), robot.q, robot.tool).q;
      robot.moveToJoint(q, down);
    } else if (menu === 'robot') robot.moveToJoint([0, 0, 0, 0, 0, 0], down);
    else robot.fwd(down);
  }

  const el = h('div.pendant', { tabindex: 0, 'aria-label': 'Teach pendant' }, top, h('div.pd-body', menuEl, screen, keypad));

  /* ---------------- bàn phím máy tính ---------------- */
  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
  const keysDown = new Set();
  const onKeyDown = (e) => {
    if (readOnly || typing(e) || !el.contains(document.activeElement) && !el.matches(':hover')) return;
    const k = e.key.toLowerCase();
    if (e.code === 'Space') { e.preventDefault(); if (!keysDown.has('space')) { keysDown.add('space'); robot.enable(true); refresh(); } return; }
    if (KEYMAP[k] && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); if (!keysDown.has(k)) { keysDown.add(k); robot.jog(KEYMAP[k][0], KEYMAP[k][1], true); } }
  };
  const onKeyUp = (e) => {
    const k = e.key.toLowerCase();
    if (e.code === 'Space' && keysDown.has('space')) { keysDown.delete('space'); robot.enable(false); refresh(); }
    if (KEYMAP[k] && keysDown.has(k)) { keysDown.delete(k); robot.jog(KEYMAP[k][0], KEYMAP[k][1], false); }
  };
  const onBlur = () => { if (keysDown.has('space')) robot.enable(false); for (const k of keysDown) if (KEYMAP[k]) robot.jog(KEYMAP[k][0], KEYMAP[k][1], false); keysDown.clear(); };
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur);

  /* ================================================================ màn hình con */
  function jobScreen() {
    const jobs = prog().jobs;
    const cur = robot.cursor.job && robot.findJob(robot.cursor.job) ? robot.findJob(robot.cursor.job) : jobs[0];
    if (cur && robot.cursor.job !== cur.name) robot.cursor = { job: cur.name, line: 0 };
    const sel = h('select.input.sm', { 'aria-label': 'Job', onchange: (e) => { robot.setCursor(e.target.value, 0); render(); } },
      jobs.map((j) => h('option', { value: j.name, selected: j.name === cur?.name }, j.name + (j.name === prog().master ? ' ★' : ''))));
    const head = h('div.pd-row',
      h('b', 'JOB'), sel,
      key('Tạo job', 'sm', () => newJob()), cur ? key('Đổi tên', 'sm', () => renameJob(cur)) : null, cur ? key('Xóa', 'sm', () => delJob(cur)) : null,
      cur ? key('★ Job chính', 'sm', () => { robot.selectJob(cur.name); changed(); render(); }, 'Chọn làm job chạy khi nhấn START (master job)') : null,
      h('span.spacer'),
      key(textMode ? 'Dạng dòng' : 'Soạn văn bản', 'sm', () => { textMode = !textMode; render(); }));
    if (!cur) return [head, h('p.muted.pad', 'Chưa có job. Nhấn "Tạo job".')];
    const comp = compileJob(cur);
    const errs = new Map(comp.errors.map((e) => [e.line, e.message]));
    if (textMode) {
      const ta = h('textarea.pd-text', { spellcheck: false, value: cur.lines.join('\n'), disabled: readOnly });
      return [head, ta, h('div.pd-row', key('Áp dụng', 'primary', () => { cur.lines = ta.value.split(/\r?\n/).map((l) => l.replace(/\s+$/, '')); changed(); textMode = false; render(); }), h('span.muted.small', 'Mỗi dòng một lệnh, không ghi số địa chỉ.'))];
    }
    const running = robot.busy && robot.cursor.job === cur.name;
    const list = h('ol.pd-lines', { start: 0 }, cur.lines.map((ln, i) => {
      const L = comp.lines[i];
      return h('li', {
        class: [i === robot.cursor.line ? 'cur' : '', running && i === robot.cursor.line ? 'run' : '', errs.has(i) ? 'err' : ''].join(' '),
        title: errs.get(i) || '', onclick: () => { robot.setCursor(cur.name, i); buffer = ln.trim(); render(); },
        ondblclick: () => { if (L?.target?.t === 'P') { selP = L.target.n; varTab = 'P'; menu = 'var'; render(); } },
      }, h('span.addr', String(i).padStart(4, '0')), h('span.code', ln || ' '), errs.has(i) ? h('span.errm', errs.get(i)) : null);
    }));
    const buf = h('input.input.pd-buf', { value: buffer, placeholder: 'Dòng đệm (buffer): gõ lệnh hoặc chọn INFORM LIST', spellcheck: false, list: 'pd-inform', disabled: readOnly,
      oninput: (e) => { buffer = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); edit('insert'); } } });
    const informMenu = h('details.pd-inform', h('summary.pk.sm', 'INFORM LIST'),
      h('div.pd-inform-list', INFORM_LIST.map((g) => h('div', h('b.small', g.group), h('div.pd-inform-items', g.items.map(([op, tpl, d]) => h('button.btn.xs', { type: 'button', title: d, onclick: (e) => { buffer = tpl; e.target.closest('details').open = false; render(); setTimeout(() => content.querySelector('.pd-buf')?.focus(), 0); } }, op)))))));
    const data = h('datalist#pd-inform', INFORM_LIST.flatMap((g) => g.items.map(([, tpl]) => h('option', { value: tpl }))));
    function edit(kind) {
      if (readOnly) return;
      const i = robot.cursor.line;
      if (kind === 'delete') { if (cur.lines.length <= 1) return; cur.lines.splice(i, 1); robot.cursor.line = Math.min(i, cur.lines.length - 1); }
      else {
        const txt = buffer.trim(); if (!txt) return;
        if (kind === 'insert') { cur.lines.splice(i + 1, 0, txt); robot.cursor.line = i + 1; }
        else cur.lines[i] = txt;
      }
      changed(); render();
      requestAnimationFrame(() => content.querySelector('.pd-lines li.cur')?.scrollIntoView({ block: 'nearest' }));
    }
    return [head, list, h('div.pd-row.pd-bufrow', informMenu, buf, data),
      h('div.pd-row', key('INSERT', '', () => edit('insert'), 'Chèn dòng đệm vào sau con trỏ (Enter)'), key('MODIFY', '', () => edit('modify'), 'Thay dòng tại con trỏ bằng dòng đệm'), key('DELETE', '', () => edit('delete'), 'Xóa dòng tại con trỏ'),
        h('span.spacer'), comp.errors.length ? h('span.err-text.small', `${comp.errors.length} lỗi cú pháp`) : h('span.ok-text.small', 'Cú pháp OK'))];
  }
  async function newJob() {
    const name = prompt('Tên job mới (chữ IN HOA, số, - _):', 'JOB' + (prog().jobs.length + 1));
    if (!name) return;
    const n = name.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(n)) { toast('Tên job không hợp lệ', 'err'); return; }
    if (robot.findJob(n)) { toast('Job đã tồn tại', 'err'); return; }
    prog().jobs.push({ name: n, lines: ['NOP', 'END'] });
    if (!prog().master) prog().master = n;
    robot.setCursor(n, 0); changed(); render();
  }
  function renameJob(j) {
    const name = prompt('Tên mới:', j.name); if (!name) return;
    const n = name.trim().toUpperCase();
    if (!/^[A-Z0-9_-]{1,32}$/.test(n) || (robot.findJob(n) && n !== j.name)) { toast('Tên không hợp lệ / đã có', 'err'); return; }
    if (prog().master === j.name) prog().master = n;
    j.name = n; robot.setCursor(n, 0); changed(); render();
  }
  async function delJob(j) {
    if (!(await confirmBox('Xóa job', `Xóa job ${j.name}?`, 'Xóa'))) return;
    prog().jobs = prog().jobs.filter((x) => x !== j);
    if (prog().master === j.name) prog().master = prog().jobs[0]?.name || null;
    robot.setCursor(prog().jobs[0]?.name || null, 0); changed(); render();
  }

  function varScreen() {
    const tabs = h('div.pd-row', ...['P', 'B', 'I', 'D', 'R'].map((tb) => h('button.pk.sm', { type: 'button', class: varTab === tb ? 'on' : '', onclick: () => { varTab = tb; render(); } }, tb === 'P' ? 'Position (P)' : tb)));
    if (varTab !== 'P') {
      const arr = robot.vars[varTab];
      return [tabs, h('div.pd-vars', arr.map((v, i) => h('label.pd-var', h('span.mono', varTab + String(i).padStart(3, '0')),
        h('input.input.xs', { type: 'number', value: v, step: varTab === 'R' ? 'any' : 1, disabled: readOnly, onchange: (e) => { robot.setVar({ t: varTab, n: i }, +e.target.value); render(); } }))))];
    }
    const rows = [];
    for (let i = 0; i < 128; i++) {
      const p = robot.getP(i);
      const q = p ? (p.type === 'PULSE' ? p.q : null) : null;
      const xyz = p ? (p.type === 'BASE' ? p.p : K.fkPose(q, robot.tool)) : null;
      rows.push(h('tr', { class: i === selP ? 'cur' : p ? '' : 'empty', onclick: () => { selP = i; render(); } },
        h('td.mono', pName(i)), h('td.small', p ? (p.type === 'PULSE' ? 'ROBOT' : 'BASE') : '—'),
        h('td.mono.small', q ? q.map(f1).join('  ') : ''), h('td.mono.small', xyz ? xyz.slice(0, 3).map(f1).join('  ') : '')));
    }
    const p = robot.getP(selP);
    return [tabs,
      h('div.pd-row', h('b.mono', pName(selP)), h('span.muted.small', p ? 'đã dạy' : 'chưa có dữ liệu'), h('span.spacer'),
        key('MODIFY + ENTER', 'primary', () => { if (readOnly) return; robot.teachP(selP); changed(); render(); }, 'Lưu vị trí hiện tại của robot vào biến này'),
        p ? key('Xóa dữ liệu', 'sm', () => { robot.clearP(selP); changed(); render(); }) : null,
        h('span.muted.small', 'Giữ FWD để đưa robot tới điểm')),
      h('div.pd-tablewrap', h('table.pd-ptable', h('thead', h('tr', h('th', 'Biến'), h('th', 'Kiểu'), h('th', 'S L U R B T (°)'), h('th', 'X Y Z (mm)'))), h('tbody', rows)))];
  }

  function ioScreen() {
    const names = (list) => Object.fromEntries((list || []).map((x) => [x.n, x.desc]));
    const ins = names(def.robotIo?.inputs), outs = names(def.robotIo?.outputs);
    const row = (kind, n, on, desc) => h('tr', { class: on ? 'on' : '' }, h('td', h('span.led', { class: on ? 'on' : '' })), h('td.mono', `${kind}#${n}`), h('td.small', desc || ''),
      kind === 'OT' ? h('td', h('button.btn.xs', { type: 'button', disabled: readOnly, title: 'INTERLOCK + SELECT', onclick: () => { robot.toggleOut(n); render(); } }, on ? 'OFF' : 'ON')) : h('td'));
    const tb = (kind, arr, desc) => h('table.pd-io', h('tbody', Array.from({ length: 16 }, (_, i) => row(kind, i + 1, !!arr[i + 1], desc[i + 1]))));
    return [h('div.pd-iocols', h('div', h('b', 'General Purpose Input'), tb('IN', robot.IN, ins)), h('div', h('b', 'General Purpose Output'), tb('OT', robot.OT, outs)))];
  }

  function robotScreen() {
    const q = robot.q, pl = robot.pulses6(), ps = robot.pose();
    const tbl = (head, vals, unit) => h('table.pd-pos', h('thead', h('tr', ...head.map((x) => h('th', x)))), h('tbody', h('tr', ...vals.map((v) => h('td.mono', v)))), unit ? h('caption.small.muted', unit) : null);
    return [
      h('b', 'Vị trí hiện tại (Current position)'),
      tbl(['S', 'L', 'U', 'R', 'B', 'T'], q.map(f1), 'Góc khớp (độ)'),
      tbl(['S', 'L', 'U', 'R', 'B', 'T'], pl.map(String), 'Xung encoder (PULSE)'),
      tbl(['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'], ps.map(f1), 'Hệ BASE (mm, độ) — TCP dụng cụ 0'),
      h('p.small.muted', `Dụng cụ 0 (nam châm): Z = ${robot.tool.z} mm từ mặt bích.`),
      h('div.pd-row', h('b', 'Work Home Pos'), h('span.muted.small', 'Giữ FWD để đưa mọi khớp về 0')),
    ];
  }
  function alarmScreen() {
    return [
      h('div.pd-row', h('b', 'ALARM'), h('span.spacer'), key('RESET', 'primary', () => { robot.resetAlarm(); refresh(); })),
      robot.alarms.length ? h('ul.pd-alarms', robot.alarms.map((a) => h('li', h('b.mono', String(a.code)), ' ', a.text, a.detail ? h('div.small.muted', a.detail) : null))) : h('p.muted', 'Không có báo động.'),
      h('b.small', 'Nhật ký'),
      h('ul.pd-log', robot.messages.slice(-20).reverse().map((m) => h('li', { class: m.level }, m.text))),
    ];
  }

  /* ================================================================ vẽ */
  let lastKey = '';
  function render() {
    menuEl.querySelectorAll('.pd-mi').forEach((b) => b.classList.toggle('on', b.dataset.id === menu));
    const fn = { job: jobScreen, var: varScreen, io: ioScreen, robot: robotScreen, alarm: alarmScreen }[menu];
    const keep = content.querySelector('.pd-lines, .pd-tablewrap')?.scrollTop;
    content.replaceChildren(...fn().filter(Boolean));
    if (keep !== undefined) { const sc = content.querySelector('.pd-lines, .pd-tablewrap'); if (sc) sc.scrollTop = keep; }
    refresh(true);
  }
  function refresh(force) {
    const st = robot.status();
    modeSel.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === st.mode));
    const lbl = AXIS_LABELS[st.coord];
    for (const { b, i, dir } of axisBtns) b.textContent = `${lbl[i]}${dir > 0 ? '+' : '−'}`;
    speedLbl.textContent = st.speed;
    btnStart.classList.toggle('lit', st.running);
    btnHold.classList.toggle('lit', st.hold || !!(robot.exec?.held && !st.running && robot.exec.stack?.length));
    btnEstop.classList.toggle('pressed', st.estop);
    const servoTxt = st.servo ? 'SERVO ON' : st.servoReady ? 'SERVO READY' : 'SERVO OFF';
    status.replaceChildren(...[
      h('span.st', { class: 'mode' }, st.mode),
      h('span.st', COORD_NAME[st.coord]),
      h('span.st', st.speed),
      h('span.st', { class: st.servo ? 'on' : st.servoReady ? 'blink' : '' }, servoTxt),
      h('span.st', { class: st.running ? 'on' : '' }, st.running ? '▶ RUN' : robot.exec?.held && robot.exec.stack?.length ? '❚❚ HOLD' : '■ STOP'),
      st.alarm ? h('span.st.alarm', '⚠ ALARM') : null,
      st.estop ? h('span.st.alarm', 'E-STOP') : null,
      h('span.spacer'),
      h('select.input.xs', { title: 'Chu kỳ chạy', disabled: readOnly, onchange: (e) => { robot.cycle = e.target.value; } }, ['STEP', 'CYCLE', 'AUTO'].map((c) => h('option', { value: c, selected: robot.cycle === c }, c))),
      h('span.mono.small', st.job ? `${st.job}:${String(st.line).padStart(4, '0')}` : '')].filter(Boolean));
    const last = robot.messages[robot.messages.length - 1];
    msgLine.textContent = last ? last.text : 'Sẵn sàng.';
    msgLine.className = 'pd-msg ' + (last?.level || '');
    // màn hình cần cập nhật liên tục
    const k = `${menu}|${st.job}|${st.line}|${st.running}|${robot.alarms.length}|${robot.OT.join()}|${robot.IN.join()}`;
    const editing = content.contains(document.activeElement) && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (!force && !editing && (menu === 'robot' || (k !== lastKey && menu !== 'var'))) { lastKey = k; render(); return; }
    lastKey = k;
  }
  render();
  const timer = setInterval(() => refresh(false), 150);

  return {
    el, refresh: () => refresh(true), render,
    dispose() { clearInterval(timer); offProg(); onBlur(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur); },
  };
}
