// MPE720 ảo: Ladder (dùng PLC Studio) · Motion (MPM###) · Cấu hình module (SVC trục, 218IFD) · Test Run · Giám sát mạng / thanh ghi.
import { h } from '../dom.js';
import { toast, confirmBox } from '../components/ui.js';
import { createStudio } from '../studio/studio.js';
import { compileMotion } from '../../mc/motion.js';
import { DEFAULT_PRM } from '../../mc/axis.js';
import { MSEE_FIELDS, HSE_STRUCT, MC_IP } from '../../mc/mp3300.js';
import { describeFrame } from '../../robot/hse.js';

const f2 = (v) => (+v).toFixed(2);
const hexToBytes = (s) => Uint8Array.from((s || '').split(' ').filter(Boolean).map((x) => parseInt(x, 16)));

/**
 * project: project đầy đủ (dùng project.mc); sess: phiên (sess.mc, sess.cell); onChange(): lưu.
 * Trả { el, studio, flush(), tick(), dispose() }
 */
export function createMpe({ project, sess, onChange = () => {}, readOnly = false, initialTab = 'ladder' }) {
  const mc = () => project.mc;
  const ctrl = sess.mc;
  const cell = sess.cell;
  let tab = initialTab;

  /* ---------------- Ladder (PLC Studio) ---------------- */
  const view = () => ({ schema: 'bk-autolab/project@1', name: 'MP3300', cpu: 'MP3300', tags: mc().tags, blocks: mc().blocks, watch: mc().watch || [] });
  const studio = createStudio({
    project: view(), readOnly, getPlc: () => ctrl.plc,
    onChange: (p) => { mc().tags = p.tags; mc().blocks = p.blocks; mc().watch = p.watch; onChange(); },
  });

  /* ---------------- khung tab ---------------- */
  const TABS = [['ladder', 'Ladder'], ['motion', 'Motion'], ['config', 'Cấu hình module'], ['test', 'Test Run'], ['net', 'Giám sát']];
  const tabBar = h('div.mpe-tabs', { role: 'tablist' }, ...TABS.map(([id, l]) => h('button.mpe-tab', { type: 'button', role: 'tab', dataset: { id }, onclick: () => show(id) }, l)));
  const panes = {
    ladder: h('div.mpe-pane', studio.el),
    motion: h('div.mpe-pane.pad'),
    config: h('div.mpe-pane.pad.scroll'),
    test: h('div.mpe-pane.pad.scroll'),
    net: h('div.mpe-pane.pad.scroll'),
  };
  const el = h('div.mpe', tabBar, ...Object.values(panes));
  function show(id) {
    tab = id;
    tabBar.querySelectorAll('.mpe-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id)));
    for (const [k, p] of Object.entries(panes)) p.hidden = k !== id;
    if (id === 'motion') renderMotion();
    if (id === 'config') renderConfig();
    if (id === 'test') renderTest();
    if (id === 'net') renderNet();
  }

  /* ---------------- Motion ---------------- */
  let curMotion = mc().motion?.[0]?.name || null;
  let motionErrors = [];
  const motionStatus = h('div.mpe-mstatus');
  function renderMotion() {
    const list = mc().motion || (mc().motion = []);
    if (!list.some((m) => m.name === curMotion)) curMotion = list[0]?.name || null;
    const cur = list.find((m) => m.name === curMotion);
    const nav = h('div.mpe-mlist',
      h('b.small', 'Motion programs'),
      ...list.map((m) => h('button.mpe-mi', { type: 'button', class: m.name === curMotion ? 'on' : '', onclick: () => { curMotion = m.name; renderMotion(); } }, m.name)),
      readOnly ? null : h('button.btn.xs', { type: 'button', onclick: addMotion }, '+ Thêm'),
      cur && !readOnly ? h('button.btn.xs.ghost', { type: 'button', onclick: () => delMotion(cur) }, 'Xóa') : null);
    if (!cur) { panes.motion.replaceChildren(h('div.mpe-motion', nav, h('p.muted', 'Chưa có chương trình motion.'))); return; }
    const gutter = h('pre.mpe-gutter');
    const ta = h('textarea.mpe-code', { spellcheck: false, value: cur.source, disabled: readOnly,
      oninput: (e) => { cur.source = e.target.value; lines(); onChange(); },
      onscroll: () => { gutter.scrollTop = ta.scrollTop; },
      onkeydown: (e) => { if (e.key === 'Tab') { e.preventDefault(); const s = ta.selectionStart; ta.setRangeText('  ', s, ta.selectionEnd, 'end'); cur.source = ta.value; onChange(); } } });
    const errBox = h('div.mpe-errs');
    function lines() {
      const n = cur.source.split('\n').length;
      const errLines = new Set(motionErrors.map((e) => e.line));
      const task = ctrl.tasks.get(cur.name.toUpperCase());
      const runLine = task && task.running ? task.c.stmts[task.pc]?.line : null;
      gutter.replaceChildren(...Array.from({ length: n }, (_, i) => h('span', { class: errLines.has(i + 1) ? 'err' : runLine === i + 1 ? 'run' : '' }, String(i + 1) + '\n')));
    }
    function check() {
      const c = compileMotion(cur.source, { axes: Object.keys(ctrl.axes) });
      motionErrors = c.errors;
      errBox.replaceChildren(...(c.errors.length ? c.errors.map((e) => h('div.err-text.small', `Dòng ${e.line}: ${e.message}`)) : [h('div.ok-text.small', 'Biên dịch OK')]));
      lines();
    }
    const help = h('details.mpe-help', h('summary', 'Tóm tắt lệnh'), h('table.small', h('tbody',
      ...[['ABS; / INC;', 'Chế độ tọa độ tuyệt đối / tương đối'], ['MOV [A1]900 [B1]-100;', 'Định vị (các trục bắt đầu cùng lúc), tốc độ = Speed Reference'], ['MVS [B1]-2000 [C1]-500 F6000;', 'Nội suy thẳng, F = đơn vị tham chiếu/phút'], ['ZRN [C1]0;', 'Về gốc (kiểu 19: tín hiệu zero)'],
        ['TIM T50; / TIM1MS T500;', 'Chờ 50 × 10 ms / 500 ms'], ['IOW DI_12 == 1;', 'Chờ điều kiện'], ['WHILE SB1 == 1; … WEND;', 'Lặp (SB1 luôn = 1)'], ['IF x == 1; … ELSE; … IEND;', 'Rẽ nhánh'],
        ['GL00100 = -1000;', 'Gán thanh ghi; DO_05 = 1; ghi ngõ ra'], ['VAR; GL00100 C_Up; END_VAR;', 'Đặt tên cho thanh ghi'], ['END;', 'Kết thúc']].map(([a, b]) => h('tr', h('td.mono', a), h('td', b))))));
    panes.motion.replaceChildren(h('div.mpe-motion', nav,
      h('div.mpe-editor',
        h('div.mpe-ehead', h('b', cur.name), h('span.muted.small', `gọi bằng MSEE PROG = ${cur.name}`), h('span.spacer'), h('button.btn.sm', { type: 'button', onclick: check }, 'Biên dịch (F4)')),
        h('div.mpe-code-wrap', gutter, ta), errBox, motionStatus, help)));
    ta.addEventListener('keydown', (e) => { if (e.key === 'F4') { e.preventDefault(); check(); } });
    check();
    panes.motion._lines = lines;
  }
  function addMotion() {
    const list = mc().motion;
    let i = 1; while (list.some((m) => m.name === 'MPM' + String(i).padStart(3, '0'))) i++;
    const name = 'MPM' + String(i).padStart(3, '0');
    list.push({ name, source: `// ${name}\nVAR;\nEND_VAR;\n\nEND;\n` });
    curMotion = name; onChange(); renderMotion();
  }
  async function delMotion(m) {
    if (!(await confirmBox('Xóa chương trình', `Xóa ${m.name}?`, 'Xóa'))) return;
    mc().motion = mc().motion.filter((x) => x !== m); onChange(); renderMotion();
  }

  /* ---------------- Cấu hình module ---------------- */
  function renderConfig() {
    const axes = mc().axes || (mc().axes = {});
    const signals = ['', ...ctrl.io.def.ioMap.inputs.map((x) => x.tag)];
    const num = (obj, k, step = 'any', after) => h('input.input.xs', { type: 'number', step, value: obj[k] ?? DEFAULT_PRM[k], disabled: readOnly, onchange: (e) => { obj[k] = +e.target.value; onChange(); after?.(); } });
    const cards = Object.values(ctrl.axes).map((a) => {
      const p = (axes[a.name] ||= {});
      const unit = a.hw.unit === 'deg' ? '°' : 'mm';
      const row = (label, input, hint = '') => h('tr', h('th', label), h('td', input), h('td.small.muted', hint));
      return h('div.cfg-card',
        h('div.cfg-h', h('b', `Axis ${a.name}`), h('span.muted.small', a.name === 'A1' ? 'SGD7S — mâm xoay (trục quay vô hạn)' : a.name === 'B1' ? 'SGD7S — thanh trượt ngang (vít me)' : 'SGD7S — thanh trượt dọc (vít me)')),
        h('table.cfg', h('tbody',
          h('tr.sec', h('td', { colspan: 3 }, 'Fixed Parameter')),
          row('Reference unit', h('span', unit), 'Đơn vị người dùng'),
          row('Digits below decimal point', h('span', '1'), `Đơn vị tham chiếu = 0,1 ${unit}`),
          row('Software limit', h('input', { type: 'checkbox', checked: !!p.softLimitEnable, disabled: readOnly, onchange: (e) => { p.softLimitEnable = e.target.checked; onChange(); } }), 'Bật giới hạn mềm (có hiệu lực sau khi về gốc)'),
          row(`Positive software limit (${unit})`, num(p, 'softPos'), ''),
          row(`Negative software limit (${unit})`, num(p, 'softNeg'), ''),
          h('tr.sec', h('td', { colspan: 3 }, 'Setting Parameter')),
          row(`Speed Reference (${unit}/s)`, num(p, 'speedRef'), 'Tốc độ định vị MOV; cũng là tốc độ sau tín hiệu zero khi về gốc'),
          row('Accel/Decel time (ms)', num(p, 'accTime', 1), ''),
          h('tr.sec', h('td', { colspan: 3 }, 'Zero point return')),
          row('Method', h('span', '19 — chỉ dùng tín hiệu zero (Input Signal)'), ''),
          row('Direction', h('select.input.xs', { disabled: readOnly, onchange: (e) => { p.zrnDir = +e.target.value; onChange(); } }, [[1, '+ (thuận)'], [-1, '− (ngược)']].map(([v, l]) => h('option', { value: v, selected: (p.zrnDir ?? 1) === v }, l))), ''),
          row(`Creep Speed (${unit}/s)`, num(p, 'creep'), 'Tốc độ dò tới khi gặp sườn lên tín hiệu'),
          row(`Speed after signal (${unit}/s)`, num(p, 'zrnSpeed'), ''),
          row(`Travel Distance (${unit})`, num(p, 'zrnTravel'), 'Quãng đi thêm sau sườn lên; điểm dừng = gốc 0'),
          row('Input Signal', h('select.input.xs', { disabled: readOnly, onchange: (e) => { p.zrnSignal = e.target.value; onChange(); } }, signals.map((s) => h('option', { value: s, selected: (p.zrnSignal || '') === s }, s || '— chưa chọn —'))), ''))));
    });
    const eth = mc().eth || (mc().eth = { conns: [] });
    const conns = eth.conns || (eth.conns = []);
    const sel = (c, k, opts) => h('select.input.xs', { disabled: readOnly, onchange: (e) => { c[k] = e.target.value; onChange(); } }, opts.map((o) => h('option', { value: o, selected: c[k] === o }, o)));
    const txt = (c, k, w = 9) => h('input.input.xs', { value: c[k] ?? '', size: w, disabled: readOnly, onchange: (e) => { c[k] = /Port|ch/.test(k) ? +e.target.value : e.target.value.trim(); onChange(); } });
    const ethCard = h('div.cfg-card.wide',
      h('div.cfg-h', h('b', '218IFD — Ethernet'), h('span.muted.small', `IP machine controller: ${MC_IP} / 255.255.255.0`)),
      h('table.cfg.grid', h('thead', h('tr', ...['CNO (kênh)', 'Local Port', 'Node IP Address', 'Node Port', 'Connect Type', 'Code', 'Communication protocol', ''].map((x) => h('th', x)))),
        h('tbody', ...conns.map((c, i) => h('tr', h('td', txt(c, 'ch', 2)), h('td', txt(c, 'localPort', 5)), h('td', txt(c, 'remoteIp', 13)), h('td', txt(c, 'remotePort', 5)),
          h('td', sel(c, 'type', ['UDP', 'TCP'])), h('td', sel(c, 'code', ['BIN', 'ASCII'])), h('td', sel(c, 'protocol', ['None', 'MEMOBUS', 'Extended MEMOBUS'])),
          h('td', readOnly ? null : h('button.btn.xs.ghost', { type: 'button', onclick: () => { conns.splice(i, 1); onChange(); renderConfig(); } }, 'Xóa')))))),
      readOnly ? null : h('button.btn.sm', { type: 'button', onclick: () => { conns.push({ ch: conns.length + 1, localPort: 10001 + conns.length, remoteIp: '192.168.1.1', remotePort: 10040, type: 'TCP', code: 'ASCII', protocol: 'MEMOBUS' }); onChange(); renderConfig(); } }, '+ Thêm kết nối'),
      h('p.small.muted', 'Robot YRC1000micro: 192.168.1.11, High-Speed Ethernet Server cổng 10040 (UDP, dữ liệu nhị phân, giao thức tự do).'));
    const dbHelp = h('div.cfg-card.wide',
      h('div.cfg-h', h('b', 'Struct (DB) dùng sẵn')),
      h('p.small', 'MSEE — tham số DATA: DB có các trường ', h('span.mono', MSEE_FIELDS.map((f) => f.name).join(', ')), '.'),
      h('p.small', 'MSG-SNDE — tham số DATA: DB header High-Speed Ethernet ', h('span.mono', HSE_STRUCT.map((f) => f.name).join(', ')), '.'),
      readOnly ? null : h('div.pd-row', h('button.btn.sm', { type: 'button', onclick: () => addDb('msee') }, '+ DB điều khiển motion (MSEE)'), h('button.btn.sm', { type: 'button', onclick: () => addDb('hse') }, '+ DB khung Ethernet')));
    panes.config.replaceChildren(h('p.small.muted', 'Thay đổi cấu hình có hiệu lực sau khi Nạp (Download) xuống MP3300.'), h('div.cfg-cards', ...cards), ethCard, dbHelp);
  }
  function addDb(kind) {
    const base = kind === 'msee' ? 'CallM' : 'Frame';
    let i = 1; while (mc().blocks.some((b) => b.name === base + i)) i++;
    const fields = (kind === 'msee' ? MSEE_FIELDS : HSE_STRUCT).map((f) => ({ name: f.name, type: f.type, init: f.type === 'Bool' ? false : 0 }));
    const num = Math.max(9, ...mc().blocks.filter((b) => b.type === 'DB').map((b) => b.number || 0)) + 1;
    mc().blocks.push({ name: base + i, type: 'DB', number: num, fields });
    studio.setProject(view()); onChange(); toast(`Đã tạo DB "${base + i}"`, 'ok');
  }

  /* ---------------- Test Run ---------------- */
  const jogSpeed = { A1: 10, B1: 10, C1: 10 };
  function renderTest() {
    const stopped = ctrl.state !== 'RUN';
    const cards = Object.values(ctrl.axes).map((a) => {
      const unit = a.hw.unit === 'deg' ? '°' : 'mm';
      const pos = h('b.mono.big', '');
      const st = h('span.small', '');
      const jb = (label, dir) => {
        const b = h('button.btn', { type: 'button', disabled: !stopped || readOnly }, label);
        const up = () => { if (b.classList.contains('down')) { b.classList.remove('down'); ctrl.jog(a.name, 0); } };
        b.addEventListener('pointerdown', (e) => { e.preventDefault(); b.classList.add('down'); try { b.setPointerCapture?.(e.pointerId); } catch { /* bỏ qua */ } ctrl.jog(a.name, dir, Math.min(jogSpeed[a.name], a.hw.unit === 'deg' ? 30 : 10)); });
        b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('lostpointercapture', up);
        return b;
      };
      const card = h('div.cfg-card',
        h('div.cfg-h', h('b', a.name), h('span.muted.small', `Jog tối đa ${a.hw.unit === 'deg' ? 30 : 10} ${unit}/s`)),
        h('div.tr-pos', pos, h('span', unit)), st,
        h('div.pd-row', h('label.small', 'Tốc độ ', h('input.input.xs', { type: 'number', value: jogSpeed[a.name], min: 0.1, max: 30, step: 0.5, onchange: (e) => { jogSpeed[a.name] = +e.target.value; } }), ` ${unit}/s`)),
        h('div.pd-row', jb('◀ Backward', -1), jb('Forward ▶', 1),
          h('button.btn.sm', { type: 'button', disabled: !stopped || readOnly, onclick: () => { if (a.servoCmd) { a.servo(false); } else { a.clearAlarm(); a.servo(true); } } }, 'Servo Enable/Disable')));
      card._upd = () => { pos.textContent = f2(a.pos); st.textContent = `${a.running ? 'Servo ON' : 'Servo OFF'} · ${a.zeroDone ? 'đã về gốc' : 'chưa về gốc'}${a.alarm ? ` · LỖI 0x${a.alarm.toString(16)}` : ''}${a.warning ? ' · chạm giới hạn mềm' : ''}`; };
      return card;
    });
    panes.test.replaceChildren(
      stopped ? h('p.small', 'Test Run: MP3300 đang STOP (ladder vô hiệu). Bật servo từng trục rồi giữ nút Forward/Backward. ', h('b', 'Luôn đưa C1 lên cao an toàn trước khi chạy B1.'))
        : h('p.warn-text', 'MP3300 đang RUN — nhấn STOP trên thanh công cụ để dùng Test Run (giống "Disable" chương trình ladder).'),
      h('div.cfg-cards', ...cards));
    panes.test._cards = cards;
  }

  /* ---------------- Giám sát mạng / thanh ghi ---------------- */
  let selFrame = null;
  function renderNet() {
    const tasks = [...ctrl.tasks.values()];
    const regs = [...ctrl.regs.entries()].sort();
    const frames = cell.netLog.slice().reverse();
    const dec = selFrame ? describeFrame(hexToBytes(selFrame.req)) : [];
    panes.net.replaceChildren(
      h('div.cfg-cards',
        h('div.cfg-card', h('div.cfg-h', h('b', 'Chương trình motion')),
          tasks.length ? h('table.cfg.grid', h('thead', h('tr', h('th', 'Tên'), h('th', 'Trạng thái'), h('th', 'Dòng'), h('th', 'Lỗi'))),
            h('tbody', ...tasks.map((t) => h('tr', h('td.mono', t.name), h('td', { class: t.state === 'ALARM' ? 'err-text' : t.running ? 'ok-text' : '' }, t.state), h('td.mono', t.running ? String(t.c.stmts[t.pc]?.line ?? '') : ''), h('td.small', t.alarm ? `dòng ${t.alarm.line}: ${t.alarm.message}` : '')))))
            : h('p.muted.small', 'Chưa có chương trình nào được MSEE gọi.')),
        h('div.cfg-card', h('div.cfg-h', h('b', 'Thanh ghi (M/G)')),
          regs.length ? h('div.reg-grid', ...regs.map(([k, v]) => h('span', h('small.mono', k), h('b.mono', String(v))))) : h('p.muted.small', 'Chưa có thanh ghi nào được ghi.'))),
      h('div.cfg-card.wide', h('div.cfg-h', h('b', 'Khung Ethernet (MC → robot)'), h('span.muted.small', 'Bấm một dòng để giải mã header')),
        frames.length ? h('table.cfg.grid.net', h('thead', h('tr', h('th', 't (s)'), h('th', 'Tới'), h('th', 'Khung gửi (hex)'), h('th', 'Kết quả'))),
          h('tbody', ...frames.map((f) => h('tr', { class: [f === selFrame ? 'sel' : '', f.ok === false ? 'bad' : ''].join(' '), onclick: () => { selFrame = f; renderNet(); } },
            h('td.mono', (f.t / 1000).toFixed(2)), h('td.mono', f.to), h('td.mono.small.hex', f.req), h('td.small', f.info || '')))))
          : h('p.muted.small', 'Chưa có khung nào. Gửi bằng MSG-SNDE trong ladder.'),
        ctrl.netLog.length ? h('div.small', h('b', 'Lỗi MSG-SNDE: '), ...ctrl.netLog.filter((e) => e.dir === 'err').slice(-3).map((e) => h('div.err-text', e.text))) : null,
        dec.length ? h('table.cfg.grid', h('thead', h('tr', h('th', 'Trường'), h('th', 'Byte'), h('th', 'Giá trị'))), h('tbody', ...dec.map(([n, o, l, v]) => h('tr', h('td', n), h('td.mono', `${o}..${o + l - 1}`), h('td.mono', v))))) : null));
  }

  /* ---------------- vòng cập nhật ---------------- */
  let netCount = -1;
  function tick() {
    studio.tick();
    if (tab === 'test') for (const c of panes.test._cards || []) c._upd();
    if (tab === 'motion') {
      panes.motion._lines?.();
      const ts = [...ctrl.tasks.values()].map((t) => `${t.name}: ${t.state}${t.alarm ? ` (dòng ${t.alarm.line}: ${t.alarm.message})` : ''}`);
      motionStatus.textContent = ts.length ? ts.join(' · ') : '';
    }
    if (tab === 'net') { const n = cell.netLog.length + ctrl.tasks.size * 1000 + ctrl.regs.size * 7; if (n !== netCount || ctrl.tasks.size) { netCount = n; renderNet(); } }
  }
  let lastState = ctrl.state;
  const stTimer = setInterval(() => { if (ctrl.state !== lastState) { lastState = ctrl.state; if (tab === 'test') renderTest(); } }, 300);

  show(tab);
  return {
    el, studio,
    get tab() { return tab; },
    flush() { studio.flush(); },
    tick,
    setMonitor(on) { studio.setMonitor(on); },
    showCompile(res) {
      const ladderErr = { ...res, errors: res.errors.filter((e) => !/^MPM/i.test(e.block || '')) };
      studio.showCompile(ladderErr);
      motionErrors = res.errors.filter((e) => /^MPM/i.test(e.block || '') && e.block === curMotion);
      if (res.errors.some((e) => /^MPM/i.test(e.block || '')) && tab !== 'motion') { curMotion = res.errors.find((e) => /^MPM/i.test(e.block || '')).block; show('motion'); }
    },
    diag: (t, k) => studio.diag(t, k),
    dispose() { clearInterval(stTimer); studio.dispose(); },
  };
}
