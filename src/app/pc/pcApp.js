// "PC App": trình soạn JavaScript của sinh viên + giao diện máy tính (kiểu ứng dụng Qt trong tài liệu gốc)
// gọi các hàm sinh viên viết: servo, đọc vị trí, động học thuận, jog; (R11) camera, nhận dạng, chu trình gắp.
import { h } from '../dom.js';
import { toast } from '../components/ui.js';
import * as K from '../../robot/kinematics.js';
import { compileUserCode, callSafe, FUNCS, PC_IP } from '../../pc/runner.js';

const f2 = (v) => (Number.isFinite(+v) ? (+v).toFixed(2) : '—');

export function createPcApp({ project, sess, labId, onChange = () => {}, readOnly = false }) {
  const cell = sess.cell, robot = sess.robot;
  const names = FUNCS[labId] || FUNCS.R10;
  const pc = (project.pc ||= { code: '' });
  let api = {}, compiled = false;

  /* ---------------- trình soạn ---------------- */
  const gutter = h('pre.mpe-gutter');
  const ta = h('textarea.mpe-code', { spellcheck: false, value: pc.code, disabled: readOnly,
    oninput: () => { pc.code = ta.value; lines(); onChange(); dirty(true); },
    onscroll: () => { gutter.scrollTop = ta.scrollTop; },
    onkeydown: (e) => {
      if (e.key === 'Tab') { e.preventDefault(); ta.setRangeText('  ', ta.selectionStart, ta.selectionEnd, 'end'); pc.code = ta.value; onChange(); }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); load(); }
    } });
  function lines() { const n = ta.value.split('\n').length; gutter.textContent = Array.from({ length: n }, (_, i) => i + 1).join('\n'); }
  const status = h('span.small');
  const dirty = (d) => { status.textContent = d ? '● Mã đã sửa — nhấn "Nạp mã"' : compiled ? '✓ Mã đã nạp' : ''; status.className = 'small ' + (d ? 'warn-text' : 'ok-text'); };
  const consoleEl = h('div.pc-console');
  function out(text, cls = '') { consoleEl.append(h('div', { class: cls }, `${new Date().toLocaleTimeString()}  ${text}`)); while (consoleEl.childNodes.length > 200) consoleEl.firstChild.remove(); consoleEl.scrollTop = consoleEl.scrollHeight; }
  const env = { cell, sleep: (ms) => new Promise((r) => setTimeout(r, ms)), log: (...a) => out(a.map((x) => (typeof x === 'object' ? JSON.stringify(x) : String(x))).join(' '), 'log') };
  function load() {
    const r = compileUserCode(ta.value, names, env);
    if (r.error) { compiled = false; api = {}; out(r.error, 'err'); toast(r.error, 'err', 4000); dirty(true); return false; }
    api = r.api; compiled = true; dirty(false);
    const missing = names.filter((n) => !api[n]);
    out(`Đã nạp mã. ${missing.length ? 'Chưa có hàm: ' + missing.join(', ') : 'Đủ các hàm.'}`, missing.length ? 'warn' : 'ok');
    return true;
  }
  async function call(name, args = [], quiet = false) {
    if (!compiled && !load()) return undefined;
    const lastFrame = cell.netLog[cell.netLog.length - 1];
    const r = await callSafe(api[name], args, { name });
    if (!r.ok) { out(r.error, 'err'); return undefined; }
    if (!quiet) out(`${name}(${args.map((a) => JSON.stringify(a)).join(', ')}) → ${r.value === undefined ? 'undefined' : JSON.stringify(r.value)}`);
    if (!quiet && r.value === undefined && cell.netLog[cell.netLog.length - 1] === lastFrame && cell.netLog !== undefined)
      out(`  (${name} không trả gì và chưa gửi khung UDP nào — hàm còn để TODO, hoặc quên await request(...)?)`, 'warn');
    return r.value;
  }

  /* ---------------- khung truyền ---------------- */
  let lastNet = cell.netLog.length;
  const netEl = h('div.pc-net');
  function pollNet() {
    const L = cell.netLog;
    if (L.length < lastNet) lastNet = 0;
    for (; lastNet < L.length; lastNet++) {
      const e = L[lastNet]; if (e.from !== PC_IP) continue;
      netEl.append(h('div', h('span.mono.tx', '→ ' + e.req), e.res ? h('span.mono.rx', '← ' + e.res) : null, h('span.small', { class: e.ok === false ? 'err-text' : 'muted' }, e.info || '')));
      while (netEl.childNodes.length > 60) netEl.firstChild.remove();
      netEl.scrollTop = netEl.scrollHeight;
    }
  }

  /* ---------------- giao diện máy tính (R10) ---------------- */
  const posTbl = h('table.cfg.grid.pc-pos');
  async function readAll() {
    const cart = await call('readCartesian', [], true);
    const pul = await call('readPulse', [], true);
    const deg = Array.isArray(pul) ? await call('pulseToDeg', [pul], true) : undefined;
    const fk = Array.isArray(deg) ? await call('forwardKinematics', [deg], true) : undefined;
    const err = Array.isArray(cart) && Array.isArray(fk) ? Math.hypot(cart[0] - fk[0], cart[1] - fk[1], cart[2] - fk[2]) : NaN;
    const row = (label, vals) => h('tr', h('th', label), ...Array.from({ length: 6 }, (_, i) => h('td.mono', vals ? f2(vals[i]) : '—')));
    posTbl.replaceChildren(
      h('thead', h('tr', h('th', ''), ...['1', '2', '3', '4', '5', '6'].map((x) => h('th', x)))),
      h('tbody', row('Descartes X Y Z Rx Ry Rz', cart), row('Xung S L U R B T', pul), row('Góc khớp (°)', deg), row('FK: X Y Z', fk),
        h('tr', h('th', 'Sai lệch FK'), h('td', { colspan: 6, class: err < 0.5 ? 'ok-text' : 'err-text' }, Number.isFinite(err) ? `${err.toFixed(3)} mm` : '—'))));
  }
  let auto = null;
  const step = h('input.input.xs', { type: 'number', value: 10, min: 0.1, step: 1, title: 'Bước (mm)' });
  const speed = h('input.input.xs', { type: 'number', value: 20, min: 1, step: 1, title: 'Tốc độ (mm/s)' });
  const jog = (ax, s) => h('button.btn.sm', { type: 'button', onclick: () => { const d = [0, 0, 0]; d[ax] = s * +step.value; call('moveIncrement', [...d, +speed.value]); } }, `${'XYZ'[ax]}${s > 0 ? '+' : '−'}`);
  const r10 = h('div.pc-gui',
    h('div.pc-row', h('b', 'Robot 192.168.1.11:10040'), h('span.spacer'),
      h('button.btn.sm.primary', { type: 'button', onclick: () => call('setServo', [true]) }, 'ON Servo'),
      h('button.btn.sm', { type: 'button', onclick: () => call('setServo', [false]) }, 'OFF Servo')),
    h('div.pc-row', h('button.btn.sm', { type: 'button', onclick: readAll }, 'Đọc vị trí'),
      h('label.small', h('input', { type: 'checkbox', onchange: (e) => { clearInterval(auto); auto = e.target.checked ? setInterval(readAll, 600) : null; } }), ' tự cập nhật')),
    posTbl,
    h('div.pc-row', h('b.small', 'Jog tương đối (BASE)'), jog(0, -1), jog(0, 1), jog(1, -1), jog(1, 1), jog(2, -1), jog(2, 1),
      h('label.small', 'bước ', step, ' mm'), h('label.small', 'v ', speed, ' mm/s')),
    h('p.small.muted', 'Robot phải ở chế độ REMOTE (pendant) thì mới nhận lệnh servo / di chuyển.'));

  /* ---------------- camera (R11) ---------------- */
  const canvas = h('canvas.pc-cam', { width: 320, height: 240 });
  const camInfo = h('div.small.mono');
  async function shoot() {
    const img = cell.capture?.(); if (!img) return;
    const g = canvas.getContext('2d'); const id = g.createImageData(img.width, img.height);
    for (let i = 0; i < img.data.length; i++) { id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = img.data[i]; id.data[i * 4 + 3] = 255; }
    g.putImageData(id, 0, 0);
    const d = await call('detect', [img], true);
    if (d && Number.isFinite(+d.u)) {
      const a = ((+d.angle || 0) * Math.PI) / 180;
      g.strokeStyle = '#ff3b30'; g.lineWidth = 2; g.beginPath(); g.moveTo(d.u - 30 * Math.cos(a), d.v - 30 * Math.sin(a)); g.lineTo(d.u + 30 * Math.cos(a), d.v + 30 * Math.sin(a)); g.stroke();
      g.beginPath(); g.arc(d.u, d.v, 4, 0, 7); g.stroke();
      const xy = await call('pixelToRobot', [d.u, d.v], true);
      const rz = await call('imageAngleToRobot', [d.angle], true);
      camInfo.textContent = `u ${f2(d.u)}  v ${f2(d.v)}  góc ${f2(d.angle)}°  →  x ${f2(xy?.[0])}  y ${f2(xy?.[1])} mm  Rz ${f2(rz)}°`;
    } else camInfo.textContent = 'detect() chưa trả { u, v, angle }';
  }
  const r11 = h('div.pc-gui',
    h('div.pc-row', h('b', 'Camera 320 × 240'), h('span.spacer'),
      h('button.btn.sm', { type: 'button', onclick: () => { cell.action('newPart'); setTimeout(shoot, 50); } }, 'Đặt vật ngẫu nhiên'),
      h('button.btn.sm', { type: 'button', onclick: shoot }, 'Chụp + nhận dạng'),
      h('button.btn.sm.primary', { type: 'button', onclick: async () => { out('cycle() …'); const r = await call('cycle', [], true); out(`cycle() xong → ${JSON.stringify(r)}${cell.inFixture?.() ? ' · vật nằm đúng đồ gá ✓' : ''}`, cell.inFixture?.() ? 'ok' : 'warn'); } }, 'Chạy 1 chu trình')),
    canvas, camInfo,
    h('p.small.muted', 'Robot chạy job VISION ở chế độ PLAY (START trên pendant). Lệnh ghi biến P / B được nhận ở mọi chế độ.'));

  /* ---------------- bố cục ---------------- */
  const tabs = [['gui', 'Giao diện PC'], ['net', 'Khung UDP'], ['log', 'Console']];
  const panes = { gui: h('div.pc-pane', labId === 'R11' ? [r11, r10] : r10), net: h('div.pc-pane', netEl), log: h('div.pc-pane', consoleEl) };
  const tabBar = h('div.mpe-tabs', ...tabs.map(([id, l]) => h('button.mpe-tab', { type: 'button', dataset: { id }, onclick: () => show(id) }, l)));
  function show(id) { tabBar.querySelectorAll('.mpe-tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.id === id))); for (const [k, p] of Object.entries(panes)) p.hidden = k !== id; }
  const el = h('div.pc-app',
    h('div.pc-editor',
      h('div.mpe-ehead', h('b', 'Chương trình máy tính (JavaScript)'), status, h('span.spacer'),
        h('button.btn.sm.primary', { type: 'button', disabled: readOnly, title: 'Ctrl+Enter', onclick: load }, 'Nạp mã')),
      h('div.mpe-code-wrap', gutter, ta)),
    h('div.pc-side', tabBar, ...Object.values(panes)));
  lines(); show('gui'); load();
  const timer = setInterval(pollNet, 200);
  return { el, flush() {}, dispose() { clearInterval(timer); clearInterval(auto); } };
}
