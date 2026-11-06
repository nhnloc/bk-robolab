// Bảng nút vận hành 2D: Start/Stop/Reset, nấm dừng khẩn (giữ trạng thái), công tắc Auto/Man, đèn Run/Fault,
// cộng các nút riêng của máy (S1/S2/S3, SW1, công tắc "đưa vật vào"…), bảng LED 7 đoạn (displays).
// Gọi m.press(id, down).
import { h } from '../dom.js';
import { t } from '../i18n.js';
import { trMachine, trText } from '../loc.js';
import { createDisplayRow } from './readouts.js';

const DEFAULT_BUTTONS = () => [
  { id: 'Start', label: 'Start', kind: 'momentary', color: 'green' },
  { id: 'Stop', label: 'Stop', kind: 'momentary', color: 'red' },
  { id: 'Reset', label: 'Reset', kind: 'momentary', color: 'blue' },
  { id: 'EStop', label: t('op.estop'), kind: 'latching', color: 'estop' },
  { id: 'AutoMan', label: 'Auto / Man', kind: 'selector', color: 'black' },
];
const MAIN_IDS = ['Start', 'Stop', 'Reset', 'EStop', 'AutoMan'];

export function createOperatorPanel({ m, getVisual, readOnly = false }) {
  const def = trMachine(m.def); // nhãn nút theo ngôn ngữ hiện tại (id giữ nguyên)
  const buttons = (def?.buttons?.length ? def.buttons : DEFAULT_BUTTONS());
  const panel = () => m.panel || {};
  const els = [];
  const lampRun = h('span.lamp.green', { role: 'img', 'aria-label': 'H_Run' });
  const lampFault = h('span.lamp.red', { role: 'img', 'aria-label': 'H_Fault' });

  const press = (id, down) => { try { m.press(id, down); } catch (e) { console.warn(e); } };
  const isNc = (b) => !!b.nc && b.id !== 'Stop' && b.id !== 'EStop';
  const label = (b) => {
    const l = b.label || b.id;
    return h('span.pb-l', { title: l }, l, isNc(b) && !/\bNC\b/.test(l) ? h('span.nc-tag', 'NC') : null);
  };

  function momentary(b) {
    const el = h('button.pb', { type: 'button', class: 'c-' + (b.color || 'grey'), title: (b.label || b.id) + (b.nc ? ' (NC)' : ''), disabled: readOnly, 'aria-label': b.label || b.id });
    const down = (e) => { e.preventDefault(); el.classList.add('down'); press(b.id, true); el.setPointerCapture?.(e.pointerId); };
    const up = () => { if (!el.classList.contains('down')) return; el.classList.remove('down'); press(b.id, false); };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
    el.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) { e.preventDefault(); el.classList.add('down'); press(b.id, true); } });
    el.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') up(); });
    // nút có thể bị nhấn từ mô hình 3D → phản ánh trạng thái
    els.push(() => { if (!el.classList.contains('down')) el.classList.toggle('ext', !!panel()[b.id]); });
    return h('div.pb-wrap', el, label(b));
  }
  function estop(b) {
    const el = h('button.estop', { type: 'button', 'aria-pressed': 'false', disabled: readOnly, title: t('op.estopTip'), 'aria-label': b.label || 'E-Stop',
      onclick: () => { press(b.id, true); press(b.id, false); refresh(); } }, h('span.estop-cap'));
    els.push(() => { const on = !!panel()[b.id]; el.setAttribute('aria-pressed', String(on)); el.classList.toggle('latched', on); });
    return h('div.pb-wrap', h('div.estop-ring', el), h('span.pb-l', b.label || 'E-Stop'));
  }
  /** Công tắc giữ trạng thái (vd. "Đưa kim loại vào cảm biến"): nút bật/tắt có đèn báo. */
  function toggle(b) {
    const el = h('button.tgl', { type: 'button', 'aria-pressed': 'false', disabled: readOnly, title: (b.label || b.id) + ' — ' + t('op.toggleTip'), 'aria-label': b.label || b.id,
      onclick: () => { press(b.id, true); press(b.id, false); refresh(); } }, h('span.tgl-led'), h('span.tgl-state'));
    const st = el.querySelector('.tgl-state');
    els.push(() => { const on = !!panel()[b.id]; el.setAttribute('aria-pressed', String(on)); el.classList.toggle('on', on); st.textContent = on ? 'ON' : 'OFF'; });
    return h('div.pb-wrap.wide', el, label(b));
  }
  function selector(b) {
    const auto = b.id === 'AutoMan';
    const pos = b.positions || (auto ? ['MAN', 'AUTO'] : ['0', '1']);
    const el = h('button.selsw', { type: 'button', disabled: readOnly, title: auto ? t('op.selTip') : (b.label || b.id) + ' — ' + t('op.toggleTip'), 'aria-label': b.label || b.id,
      onclick: () => { press(b.id, true); press(b.id, false); refresh(); } }, h('span.selsw-knob'));
    const lbl = h('span.sel-pos');
    els.push(() => { const on = !!panel()[b.id]; el.classList.toggle('auto', on); lbl.textContent = auto ? pos[on ? 1 : 0] : `${b.label || b.id}: ${pos[on ? 1 : 0]}`; el.setAttribute('aria-pressed', String(on)); });
    return h('div.pb-wrap', h('div.sel-scale', h('span', pos[0]), h('span', pos[1])), el, h('span.pb-l', lbl));
  }

  const main = buttons.filter((b) => MAIN_IDS.includes(b.id));
  const extra = buttons.filter((b) => !main.includes(b));
  const build = (b) => { const w = b.kind === 'latching' ? (b.color === 'estop' || b.id === 'EStop' ? estop(b) : toggle(b)) : b.kind === 'selector' ? selector(b) : momentary(b); w.dataset.btn = b.id; return w; };

  const displays = createDisplayRow();
  const crash = h('div.crash-msg', { role: 'alert', hidden: true });
  const el = h('section.op-panel', { 'aria-label': t('op.title') },
    h('div.op-title', t('op.title')),
    displays.el,
    h('div.op-row', h('div.lamp-wrap', { dataset: { btn: 'H_Run' } }, lampRun, h('span.pb-l', 'Run')), h('div.lamp-wrap', { dataset: { btn: 'H_Fault' } }, lampFault, h('span.pb-l', 'Fault')), ...main.map(build)),
    extra.length ? h('div.op-row.extra', ...extra.map(build)) : null,
    crash);

  function refresh() {
    els.forEach((f) => f());
    const v = getVisual?.();
    const run = v?.lamps ? v.lamps.run : !!(m.outputs?.H_Run ?? m.outputs?.['%Q0.0']);
    const fault = v?.lamps ? v.lamps.fault : !!(m.outputs?.H_Fault ?? m.outputs?.['%Q0.1']);
    lampRun.classList.toggle('on', !!run); lampFault.classList.toggle('on', !!fault);
    displays.update(v?.displays);
    const c = v?.crashed || m.crashed;
    crash.hidden = !c; if (c) crash.textContent = t('op.crashed') + ' ' + (trText(c.message) || '');
  }
  refresh();
  /** Khoanh nút/đèn trên bảng điều khiển (id nút hoặc H_Run/H_Fault); null = bỏ. Trả về true nếu có. */
  function highlight(id) { let hit = false; el.querySelectorAll('[data-btn]').forEach((w) => { const on = !!id && w.dataset.btn === id; w.classList.toggle('hl', on); hit ||= on; }); return hit; }
  return { el, refresh, highlight };
}
