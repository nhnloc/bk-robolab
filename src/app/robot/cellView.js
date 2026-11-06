// Khu "Trạm": cảnh 3D + Control Panel / I/O Box 2D + trạng thái robot, trục servo, I/O của MC.
import { h } from '../dom.js';
import { split } from '../components/ui.js';
import { MachineViewer } from '../../scene/viewer.js';
import { Robot2D } from '../../scene/robot2d.js';
import { PALETTE, TABLE_Z } from '../../sim/layout.js';

const f1 = (v) => (Math.abs(v) < 0.05 ? 0 : v).toFixed(1);
function hasWebGL() { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; } }

export function createCellView({ cell, readOnly = false, extraActions = [] }) {
  const def = cell.def;
  /* ---------------- 3D ---------------- */
  const host = h('div.viewer-host');
  const crash = h('div.viewer-crash', { role: 'alert', hidden: true });
  const views = h('div.view-btns', ...[['iso', 'Iso'], ['front', 'Trước'], ['side', 'Bên'], ['top', 'Trên']].map(([id, l]) => h('button.btn.sm', { type: 'button', onclick: () => viewer.setView(id) }, l)));
  const stage = h('div.viewer-stage', host, views, crash, h('div.viewer-loading', 'Đang tải mô hình 3D…'));
  let viewer;
  const opts = { machineId: def.model || def.id, inputTags: [] };
  if (hasWebGL()) { try { viewer = new MachineViewer(host, opts); } catch (e) { console.info(e); viewer = null; } }
  if (!viewer) { host.replaceChildren(); viewer = new Robot2D(host, { ...opts, cell }); views.hidden = true; }
  let visual = null;
  viewer.setSource(() => { visual = cell.getVisual(); return visual; });
  viewer.getOutputs = () => (cell.outs ? cell.outs() : {});
  if (!readOnly) viewer.setButtonHandler?.({
    press: (id, down) => cell.press(id, down),
    kindOf: (id) => def.buttons.find((b) => b.id === id)?.kind,
    has: (id) => def.buttons.some((b) => b.id === id),
  });
  viewer.load().then(() => { stage.querySelector('.viewer-loading')?.remove(); addLabels(); }).catch((e) => console.warn(e));
  /** Nhãn ô pallet A1..C (trạm MotoMINI). */
  async function addLabels() {
    if ((def.model || def.id) !== 'motomini' || def.id === 'vision' || !viewer.scene) return;
    const THREE = await import('three');
    for (const [name, [x, y]] of Object.entries(PALETTE.cells)) {
      const c = document.createElement('canvas'); c.width = 96; c.height = 48;
      const g = c.getContext('2d'); g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillRect(0, 0, 96, 48); g.fillStyle = '#0a3d62'; g.font = 'bold 32px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, 48, 26);
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
      sp.scale.set(0.036, 0.018, 1);
      sp.position.set((x + (name.startsWith('A') ? 0 : 0)) / 1000, (TABLE_Z + PALETTE.top + 2) / 1000, -(y + (y > 0 ? 34 : -34)) / 1000);
      sp.renderOrder = 5; viewer.scene.add(sp);
    }
  }

  /* ---------------- bảng điều khiển ---------------- */
  const btnEls = new Map();
  function pb(b) {
    const latch = b.kind === 'latching' || b.kind === 'selector';
    const el = h('button.cp-btn', { type: 'button', class: `c-${b.color || 'grey'} ${latch ? 'sw' : ''}`, title: b.desc ? `${b.label} — ${b.desc}` : b.label, disabled: readOnly });
    el.append(h('span.cp-cap'), h('span.cp-l', b.label));
    if (latch) el.addEventListener('click', () => { cell.press(b.id, true); cell.press(b.id, false); refresh(); });
    else {
      const up = () => { if (!el.classList.contains('down')) return; el.classList.remove('down'); cell.press(b.id, false); };
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('down'); try { el.setPointerCapture?.(e.pointerId); } catch { /* bỏ qua */ } cell.press(b.id, true); });
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    }
    btnEls.set(b.id, el);
    return el;
  }
  const lampEls = new Map();
  const lamp = (tag, label, color = 'amber') => { const el = h('span.cp-lamp', { class: color, title: tag }, h('i'), h('small', label)); lampEls.set(tag, el); return el; };
  const box = (title, ...kids) => h('div.cp-box', h('div.cp-title', title), ...kids);
  const panels = [];
  if (def.id === 'motomini' || def.id === 'vision') {
    panels.push(box('Control Panel',
      h('div.cp-row', ...[4, 5, 6, 7].map((i) => lamp('Q' + i, 'Q' + i, ['red', 'amber', 'green', 'blue'][i - 4]))),
      h('div.cp-row', ...def.buttons.filter((b) => b.group !== 'sim').map(pb)),
      def.buttons.some((b) => b.group === 'sim') ? h('div.cp-row', ...def.buttons.filter((b) => b.group === 'sim').map(pb)) : null,
      h('div.cp-note', 'I4..I7 → IN#5..IN#8 · Q4..Q7 ← OT#5..OT#8')));
  } else {
    const g = (grp) => def.buttons.filter((b) => b.group === grp);
    panels.push(box('Control Panel',
      h('div.cp-row', ...def.buttons.filter((b) => !b.group).map(pb)),
      h('div.cp-row', ...g('panel').map(pb)),
      h('div.cp-row', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => lamp('PQ' + i, 'Q' + i, 'amber'))),
      h('div.cp-note', 'Nút: DI_00..03 · I0..I7: DI_16..23 · Q0..Q7: DO_16..23')));
    panels.push(box('I/O Box',
      h('div.cp-row', ...g('iobox').map(pb)),
      h('div.cp-row', ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => lamp('XQ' + i, 'Q' + i, 'green'))),
      h('div.cp-note', 'I0..I7: DI_24..31 · Q0..Q7: DO_24..31')));
    panels.push(box('Mô phỏng', h('div.cp-row', ...g('sim').map(pb), ...extraActions.map((a) => h('button.btn.sm', { type: 'button', disabled: readOnly, title: a.title || '', onclick: a.run }, a.label)))));
  }

  /* ---------------- trạng thái ---------------- */
  const robotRo = h('div.ro-grid');
  const axesRo = h('div.ro-grid');
  const ioRo = h('div.mc-io');
  const evLog = h('ul.ev-log');
  const statusBox = h('div.cp-status', box('Robot', robotRo), cell.mc ? box('Trục servo', axesRo) : null, cell.mc ? box('I/O machine controller', ioRo) : null, box('Sự kiện', evLog));

  /** Dòng trợ giúp gắp vật bằng nam châm. */
  function gripLine() {
    const g = cell.gripHint?.();
    if (!g) return null;
    let txt, cls = 'muted';
    if (g.held) { txt = 'Nam châm đang giữ vật'; cls = 'ok-text'; }
    else if (g.tilt > 26) txt = `Dụng cụ nghiêng ${g.tilt.toFixed(0)}° so với phương thẳng đứng — cần hướng xuống để hút (Rx ≈ 180, Ry ≈ 0)`;
    else if (g.ready) { txt = `Sẵn sàng hút: cách mặt vật ${Math.max(0, g.gap).toFixed(1)} mm — bật OT#1`; cls = 'ok-text'; }
    else txt = `${g.onItem ? 'Mặt vật' : 'Bề mặt'} bên dưới cách ${g.gap.toFixed(1)} mm${g.onItem ? ' (hút được khi còn 0…5 mm và đúng tâm ±8 mm)' : ''}`;
    return h('span.ro-grip', { class: cls }, txt);
  }
  function refresh() {
    for (const [id, el] of btnEls) el.classList.toggle('on', !!cell.panel[id]);
    const outs = cell.outs ? cell.outs() : {};
    for (const [tag, el] of lampEls) el.classList.toggle('lit', !!outs[tag]);
    const r = cell.robot;
    const ps = r.pose();
    robotRo.replaceChildren(
      ...['S', 'L', 'U', 'R', 'B', 'T'].map((n, i) => h('span', h('small', n), h('b.mono', f1(r.q[i])))),
      ...['X', 'Y', 'Z', 'Rx', 'Ry', 'Rz'].map((n, i) => h('span', h('small', n), h('b.mono', f1(ps[i])))),
      h('span', h('small', 'OT#1'), h('b', { class: r.OT[1] ? 'ok-text' : 'muted' }, r.OT[1] ? 'ON' : 'OFF')),
      h('span', h('small', 'Mode'), h('b', r.mode)), h('span', h('small', 'Servo'), h('b', { class: r.servo ? 'ok-text' : '' }, r.servo ? 'ON' : 'OFF')),
      gripLine());
    if (cell.mc) {
      axesRo.replaceChildren(...Object.values(cell.mc.axes).map((a) => h('div.ax-row', { class: a.alarm ? 'alarm' : '' },
        h('b', a.name), h('span.mono', `${f1(a.pos)} ${a.hw.unit === 'deg' ? '°' : 'mm'}`),
        h('span.tag', { class: a.running ? 'on' : '' }, a.running ? 'SV ON' : 'SV OFF'), h('span.tag', { class: a.zeroDone ? 'on' : '' }, a.zeroDone ? 'ZERO' : '—'),
        a.alarm ? h('span.tag.err', 'ALM ' + a.alarm.toString(16).padStart(2, '0')) : a.warning ? h('span.tag.warn', 'SOFT LIM') : null)));
      const I = cell.mc.io.inputs, Q = cell.mc.io.outputs;
      const led = (tag, on) => h('span.io-led', { class: on ? 'on' : '', title: tag }, tag.replace('_', ''));
      ioRo.replaceChildren(
        h('div', h('small', 'DI'), h('div.io-leds', ...Object.keys(I).map((k) => led(k, I[k])))),
        h('div', h('small', 'DO'), h('div.io-leds', ...Object.keys(Q).map((k) => led(k, Q[k])))));
    }
    const evs = cell.events.slice(-6).reverse();
    evLog.replaceChildren(...evs.map((e) => h('li', { class: e.level }, `${(e.t / 1000).toFixed(1)} s — ${e.message}`)));
    const c = visual?.crashed || (cell.robot.alarms[0] ? { message: `ALARM ${cell.robot.alarms[0].code} ${cell.robot.alarms[0].detail}` } : null);
    crash.hidden = !c; if (c) crash.textContent = '⚠ ' + (c.message || '');
  }
  const bottom = h('div.cell-bottom', h('div.cp-panels', ...panels), statusBox);
  const el = h('div.cell-view', split({ dir: 'v', a: stage, b: bottom, ratio: 0.62, min: 140, key: 'cell-v' }));
  const timer = setInterval(refresh, 120);
  const onTheme = () => viewer.applyTheme?.();
  window.addEventListener('bk-theme', onTheme);
  refresh();
  return { el, refresh, dispose() { clearInterval(timer); window.removeEventListener('bk-theme', onTheme); viewer.dispose(); } };
}
